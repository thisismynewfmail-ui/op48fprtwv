/* HALCYON — Audio
 *
 * Everything here is synthesised at runtime: no sample files ship with the
 * game. The soundtrack is a slow, detuned mall-muzak generator (Rhodes-ish
 * FM keys, sub bass, tape wobble, long plate reverb) that pitches down with
 * the Chronometer, and the SFX are classic subtractive one-shots.
 */
import { cfg, onCfgChange } from './Config.js';
import { clamp, lerp } from './Time.js';

const A4 = 440;
const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
export function ntof(name) {
  const m = /^([A-G]#?)(-?\d)$/.exec(name);
  if (!m) return 440;
  return A4 * Math.pow(2, (NOTE[m[1]] + (parseInt(m[2], 10) + 1) * 12 - 69) / 12);
}

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.buffers = {};
    this.listener = { pos: { x: 0, y: 0, z: 0 }, fwd: { x: 0, y: 0, z: -1 }, right: { x: 1, y: 0, z: 0 } };
    this.dilation = 0;
    this._musicTimer = null;
    this._bar = 0;
    this._tickAcc = 0;
    this._voices = 0;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC({ latencyHint: 'interactive' });

    // ---- master chain -------------------------------------------------
    this.master = ctx.createGain();
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.knee.value = 22;
    this.comp.ratio.value = 6; this.comp.attack.value = 0.004; this.comp.release.value = 0.22;
    this.master.connect(this.comp).connect(ctx.destination);

    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();

    // A gentle low-pass on everything that closes as time dilates: the
    // world going quiet and underwater is half of the slow-motion effect.
    this.worldLP = ctx.createBiquadFilter();
    this.worldLP.type = 'lowpass'; this.worldLP.frequency.value = 20000; this.worldLP.Q.value = 0.6;

    // ---- plate reverb (procedural impulse) -----------------------------
    this.verb = ctx.createConvolver();
    this.verb.buffer = this._impulse(3.4, 2.6, 0.75);
    this.verbGain = ctx.createGain(); this.verbGain.gain.value = 0.34;
    this.verb.connect(this.verbGain).connect(this.master);

    this.sfxBus.connect(this.worldLP).connect(this.master);
    this.sfxSend = ctx.createGain(); this.sfxSend.gain.value = 0.22;
    this.sfxBus.connect(this.sfxSend).connect(this.verb);

    this.musicBus.connect(this.master);
    this.musicSend = ctx.createGain(); this.musicSend.gain.value = 0.5;
    this.musicBus.connect(this.musicSend).connect(this.verb);

    this.noiseBuf = this._noise(2.0);
    this._applyVolumes();
    onCfgChange(() => this._applyVolumes());
    this.ready = true;
  }

  _applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = cfg.snd_master;
    this.sfxBus.gain.value = cfg.snd_sfx;
    this.musicBus.gain.value = cfg.snd_music * 0.5;
  }

  resume() { this.init(); if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }

  _noise(sec) {
    const ctx = this.ctx, n = (ctx.sampleRate * sec) | 0;
    const b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  _impulse(sec, decay, diffusion) {
    const ctx = this.ctx, n = (ctx.sampleRate * sec) | 0;
    const b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / n;
        // early reflection cluster, then smooth exponential tail
        const early = i < ctx.sampleRate * 0.09 ? (Math.random() < diffusion * 0.02 ? 1 : 0) : 1;
        const s = (Math.random() * 2 - 1) * early * Math.pow(1 - t, decay);
        lp += (s - lp) * 0.42;                    // darken the tail
        d[i] = lp * (1 - t * 0.2);
      }
    }
    return b;
  }

  now() { return this.ctx ? this.ctx.currentTime : 0; }

  /** Distance + stereo pan for a world-space emitter. Returns null if inaudible. */
  spatial(pos, refDist = 8, maxDist = 90) {
    if (!pos) return { gain: 1, pan: 0, delay: 0 };
    const L = this.listener;
    const dx = pos.x - L.pos.x, dy = pos.y - L.pos.y, dz = pos.z - L.pos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist > maxDist) return null;
    const gain = clamp(refDist / (refDist + Math.max(0, dist - refDist) * 1.35), 0, 1) *
                 (1 - clamp((dist / maxDist) ** 2, 0, 1));
    const inv = dist > 0.001 ? 1 / dist : 0;
    const pan = clamp((dx * L.right.x + dy * L.right.y + dz * L.right.z) * inv, -1, 1) * 0.85;
    return { gain, pan, delay: dist / 340 };
  }

  _out(pan) {
    const ctx = this.ctx;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) { p.pan.value = pan || 0; p.connect(this.sfxBus); return p; }
    const g = ctx.createGain(); g.connect(this.sfxBus); return g;
  }

  /** Core one-shot voice: an oscillator or noise source with an AD envelope. */
  voice(opt) {
    if (!this.ready || this._voices > 48) return null;
    const ctx = this.ctx, t0 = ctx.currentTime + (opt.delay || 0);
    const {
      type = 'sine', freq = 440, freq2 = null, sweep = 0.05,
      dur = 0.2, attack = 0.003, gain = 0.4, pan = 0,
      filter = null, fq = 1200, fq2 = null, q = 1, curve = 2,
      noise = false, detune = 0, dest = null, playbackRate = 1,
    } = opt;

    let src;
    if (noise) {
      src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      src.playbackRate.value = playbackRate;
    } else {
      src = ctx.createOscillator(); src.type = type;
      src.frequency.setValueAtTime(freq, t0);
      if (freq2 !== null) src.frequency.exponentialRampToValueAtTime(Math.max(1, freq2), t0 + Math.max(0.001, sweep));
      if (detune) src.detune.value = detune;
    }

    let node = src;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = filter; f.Q.value = q;
      f.frequency.setValueAtTime(fq, t0);
      if (fq2 !== null) f.frequency.exponentialRampToValueAtTime(Math.max(20, fq2), t0 + dur);
      node.connect(f); node = f;
    }

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    if (curve === 1) g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    else g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    node.connect(g);
    g.connect(dest || this._out(pan));

    src.start(t0); src.stop(t0 + dur + 0.05);
    this._voices++;
    src.onended = () => { this._voices--; try { g.disconnect(); } catch (e) {} };
    return { src, gain: g, t0 };
  }

  /* ================= SFX library ================= */

  play(name, pos, opts = {}) {
    if (!this.ready) return;
    const sp = this.spatial(pos, opts.ref || 8, opts.max || 90);
    if (!sp) return;
    const v = (opts.vol ?? 1) * sp.gain, p = sp.pan, d = sp.delay;
    if (v < 0.004) return;
    const fn = this['sfx_' + name];
    if (fn) fn.call(this, v, p, d, opts);
  }

  sfx_pistol(v, p, d) {
    this.voice({ noise: true, filter: 'bandpass', fq: 2400, fq2: 380, q: 1.1, dur: 0.19, gain: 0.55 * v, pan: p, delay: d });
    this.voice({ type: 'square', freq: 320, freq2: 55, sweep: 0.05, dur: 0.13, gain: 0.30 * v, pan: p, delay: d });
    this.voice({ noise: true, filter: 'highpass', fq: 5200, dur: 0.05, gain: 0.34 * v, pan: p, delay: d });
    // crystalline tail — the Quartz Pistol rings
    this.voice({ type: 'sine', freq: 2340, dur: 0.5, gain: 0.09 * v, pan: p, delay: d + 0.01 });
  }
  sfx_smg(v, p, d) {
    this.voice({ noise: true, filter: 'bandpass', fq: 1750, fq2: 260, q: 0.9, dur: 0.115, gain: 0.44 * v, pan: p, delay: d });
    this.voice({ type: 'sawtooth', freq: 210, freq2: 42, sweep: 0.04, dur: 0.09, gain: 0.24 * v, pan: p, delay: d });
    this.voice({ noise: true, filter: 'highpass', fq: 6400, dur: 0.03, gain: 0.22 * v, pan: p, delay: d });
  }
  sfx_melee_swing(v, p, d) {
    this.voice({ noise: true, filter: 'bandpass', fq: 700, fq2: 2600, q: 2.4, dur: 0.26, gain: 0.30 * v, attack: 0.06, pan: p, delay: d });
  }
  sfx_melee_hit(v, p, d) {
    this.voice({ type: 'triangle', freq: 180, freq2: 60, sweep: 0.06, dur: 0.18, gain: 0.5 * v, pan: p, delay: d });
    this.voice({ noise: true, filter: 'lowpass', fq: 900, dur: 0.12, gain: 0.4 * v, pan: p, delay: d });
  }
  sfx_melee_metal(v, p, d) {
    this.voice({ type: 'square', freq: 1650, dur: 0.3, gain: 0.2 * v, pan: p, delay: d, filter: 'bandpass', fq: 2600, q: 8 });
    this.voice({ noise: true, filter: 'highpass', fq: 3600, dur: 0.09, gain: 0.3 * v, pan: p, delay: d });
  }
  sfx_impact(v, p, d) {
    this.voice({ noise: true, filter: 'lowpass', fq: 2600, fq2: 300, dur: 0.14, gain: 0.34 * v, pan: p, delay: d });
  }
  sfx_impact_marble(v, p, d) {
    this.voice({ noise: true, filter: 'bandpass', fq: 3400, fq2: 900, q: 1.6, dur: 0.11, gain: 0.36 * v, pan: p, delay: d });
    this.voice({ type: 'triangle', freq: 900, freq2: 400, sweep: 0.04, dur: 0.09, gain: 0.13 * v, pan: p, delay: d });
  }
  sfx_ricochet(v, p, d) {
    this.voice({ type: 'sine', freq: 3200, freq2: 700, sweep: 0.22, dur: 0.26, gain: 0.16 * v, pan: p, delay: d });
  }
  sfx_shatter(v, p, d) {
    for (let i = 0; i < 5; i++) {
      this.voice({ type: 'triangle', freq: 1200 + Math.random() * 2600, dur: 0.22 + Math.random() * 0.3,
        gain: 0.11 * v, pan: clamp(p + (Math.random() - 0.5) * 0.5, -1, 1), delay: d + Math.random() * 0.06 });
    }
    this.voice({ noise: true, filter: 'highpass', fq: 2400, dur: 0.35, gain: 0.24 * v, pan: p, delay: d });
  }
  sfx_wraith_call(v, p, d) {
    const f = 260 + Math.random() * 140;
    this.voice({ type: 'sawtooth', freq: f, freq2: f * 0.42, sweep: 0.7, dur: 0.85, gain: 0.16 * v, attack: 0.14,
      pan: p, delay: d, filter: 'bandpass', fq: 900, fq2: 320, q: 4 });
    this.voice({ type: 'sine', freq: f * 2.02, freq2: f * 0.9, sweep: 0.7, dur: 0.8, gain: 0.07 * v, attack: 0.2, pan: p, delay: d });
  }
  sfx_wraith_lunge(v, p, d) {
    this.voice({ type: 'sawtooth', freq: 140, freq2: 620, sweep: 0.24, dur: 0.3, gain: 0.2 * v, pan: p, delay: d, filter: 'lowpass', fq: 2400 });
  }
  sfx_wraith_die(v, p, d) {
    this.voice({ type: 'square', freq: 420, freq2: 24, sweep: 0.45, dur: 0.6, gain: 0.22 * v, pan: p, delay: d, filter: 'lowpass', fq: 3000, fq2: 200 });
    this.voice({ noise: true, filter: 'bandpass', fq: 1800, fq2: 200, q: 0.7, dur: 0.5, gain: 0.26 * v, pan: p, delay: d });
    this.sfx_glitch(v * 0.6, p, d + 0.02);
  }
  sfx_glitch(v, p, d) {
    for (let i = 0; i < 4; i++) {
      this.voice({ noise: true, playbackRate: 0.2 + Math.random() * 3, filter: 'bandpass',
        fq: 400 + Math.random() * 5000, q: 6, dur: 0.03 + Math.random() * 0.05,
        gain: 0.2 * v, curve: 1, pan: clamp(p + (Math.random() - 0.5) * 0.7, -1, 1), delay: d + i * 0.035 });
    }
  }
  sfx_orb_fire(v, p, d) {
    this.voice({ type: 'sine', freq: 180, freq2: 900, sweep: 0.18, dur: 0.3, gain: 0.2 * v, pan: p, delay: d });
    this.voice({ type: 'sawtooth', freq: 90, freq2: 440, sweep: 0.18, dur: 0.26, gain: 0.1 * v, pan: p, delay: d, filter: 'lowpass', fq: 1400 });
  }
  sfx_orb_hit(v, p, d) {
    this.voice({ type: 'sine', freq: 620, freq2: 90, sweep: 0.2, dur: 0.34, gain: 0.3 * v, pan: p, delay: d });
    this.voice({ noise: true, filter: 'lowpass', fq: 1400, fq2: 200, dur: 0.3, gain: 0.24 * v, pan: p, delay: d });
  }
  sfx_hurt(v, p, d) {
    this.voice({ type: 'sawtooth', freq: 170, freq2: 70, sweep: 0.14, dur: 0.24, gain: 0.34 * v, filter: 'lowpass', fq: 1100, pan: p, delay: d });
  }
  sfx_footstep(v, p, d, o = {}) {
    const hard = o.surface === 'marble';
    this.voice({ noise: true, filter: hard ? 'bandpass' : 'lowpass', fq: hard ? 1900 : 700, fq2: hard ? 500 : 180,
      q: hard ? 1.4 : 1, dur: hard ? 0.085 : 0.13, gain: (hard ? 0.16 : 0.13) * v, pan: p, delay: d });
    if (hard) this.voice({ type: 'triangle', freq: 340 + Math.random() * 90, dur: 0.09, gain: 0.05 * v, pan: p, delay: d });
  }
  sfx_land(v, p, d) {
    this.voice({ noise: true, filter: 'lowpass', fq: 1200, fq2: 140, dur: 0.2, gain: 0.3 * v, pan: p, delay: d });
    this.voice({ type: 'sine', freq: 120, freq2: 50, sweep: 0.09, dur: 0.16, gain: 0.24 * v, pan: p, delay: d });
  }
  sfx_jump(v, p, d) {
    this.voice({ noise: true, filter: 'lowpass', fq: 900, dur: 0.07, gain: 0.11 * v, pan: p, delay: d });
  }
  sfx_pickup(v, p, d) {
    [0, 4, 7, 12].forEach((s, i) => this.voice({
      type: 'triangle', freq: ntof('C5') * Math.pow(2, s / 12), dur: 0.32, gain: 0.16 * v,
      pan: p, delay: d + i * 0.045, attack: 0.005 }));
  }
  sfx_pickup_ammo(v, p, d) {
    this.voice({ noise: true, filter: 'bandpass', fq: 3200, q: 3, dur: 0.09, gain: 0.2 * v, pan: p, delay: d });
    this.voice({ type: 'square', freq: 1400, freq2: 2100, sweep: 0.05, dur: 0.07, gain: 0.1 * v, pan: p, delay: d });
  }
  sfx_health(v, p, d) {
    [0, 7, 12, 16].forEach((s, i) => this.voice({
      type: 'sine', freq: ntof('G4') * Math.pow(2, s / 12), dur: 0.45, gain: 0.14 * v, pan: p, delay: d + i * 0.06 }));
  }
  sfx_reload_out(v, p, d) {
    this.voice({ noise: true, filter: 'bandpass', fq: 1500, q: 2.5, dur: 0.07, gain: 0.22 * v, pan: p, delay: d });
    this.voice({ type: 'square', freq: 240, freq2: 150, sweep: 0.05, dur: 0.07, gain: 0.1 * v, pan: p, delay: d });
  }
  sfx_reload_in(v, p, d) {
    this.voice({ noise: true, filter: 'bandpass', fq: 900, q: 2, dur: 0.09, gain: 0.24 * v, pan: p, delay: d });
    this.voice({ type: 'triangle', freq: 500, freq2: 900, sweep: 0.05, dur: 0.09, gain: 0.12 * v, pan: p, delay: d });
  }
  sfx_dryfire(v, p, d) {
    this.voice({ noise: true, filter: 'highpass', fq: 3000, dur: 0.035, gain: 0.2 * v, pan: p, delay: d, curve: 1 });
  }
  sfx_swap(v, p, d) {
    this.voice({ noise: true, filter: 'bandpass', fq: 2200, q: 3, dur: 0.06, gain: 0.16 * v, pan: p, delay: d });
  }
  sfx_grab(v, p, d) {
    this.voice({ type: 'sine', freq: 900, freq2: 240, sweep: 0.16, dur: 0.26, gain: 0.2 * v, pan: p, delay: d });
    this.voice({ type: 'sawtooth', freq: 60, freq2: 180, sweep: 0.2, dur: 0.24, gain: 0.09 * v, filter: 'lowpass', fq: 700, pan: p, delay: d });
  }
  sfx_punt(v, p, d) {
    this.voice({ type: 'sine', freq: 90, freq2: 420, sweep: 0.09, dur: 0.28, gain: 0.34 * v, pan: p, delay: d });
    this.voice({ noise: true, filter: 'lowpass', fq: 2200, fq2: 300, dur: 0.24, gain: 0.24 * v, pan: p, delay: d });
  }
  sfx_freeze(v, p, d) {
    this.voice({ type: 'sine', freq: 1800, freq2: 240, sweep: 0.4, dur: 0.6, gain: 0.18 * v, pan: p, delay: d });
    [0, 5, 9].forEach((s, i) => this.voice({ type: 'triangle', freq: ntof('C6') * Math.pow(2, s / 12),
      dur: 0.7, gain: 0.07 * v, pan: p, delay: d + i * 0.02 }));
  }
  sfx_terminal(v, p, d) {
    for (let i = 0; i < 3; i++)
      this.voice({ type: 'square', freq: 620 + i * 220, dur: 0.06, gain: 0.1 * v, pan: p, delay: d + i * 0.075, curve: 1 });
  }
  sfx_keytap(v, p, d) {
    this.voice({ noise: true, filter: 'bandpass', fq: 2600 + Math.random() * 900, q: 5, dur: 0.02, gain: 0.14 * v, pan: p, delay: d, curve: 1 });
  }
  sfx_door(v, p, d) {
    this.voice({ noise: true, filter: 'lowpass', fq: 400, fq2: 120, dur: 1.6, gain: 0.3 * v, attack: 0.4, pan: p, delay: d });
    this.voice({ type: 'sawtooth', freq: 44, freq2: 33, sweep: 1.4, dur: 1.6, gain: 0.16 * v, filter: 'lowpass', fq: 300, pan: p, delay: d });
  }
  sfx_chime(v, p, d, o = {}) {
    const base = o.freq || ntof('A4');
    [1, 2.01, 3.02, 4.16].forEach((m, i) => this.voice({
      type: 'sine', freq: base * m, dur: 2.6 / (i + 1), gain: (0.2 / (i + 1)) * v, pan: p, delay: d, attack: 0.004 }));
  }
  sfx_bell(v, p, d, o = {}) {
    const base = o.freq || 220;
    [1, 2.0, 2.76, 5.4, 8.9].forEach((m, i) => this.voice({
      type: 'sine', freq: base * m, dur: 4.2 / (1 + i * 0.7), gain: (0.24 / (1 + i * 1.1)) * v, pan: p, delay: d, attack: 0.002 }));
    this.voice({ type: 'triangle', freq: base * 0.5, dur: 4.6, gain: 0.1 * v, pan: p, delay: d });
  }
  sfx_tick(v, p, d) {
    this.voice({ noise: true, filter: 'bandpass', fq: 2800, q: 9, dur: 0.028, gain: 0.24 * v, pan: p, delay: d, curve: 1 });
    this.voice({ type: 'triangle', freq: 1400, dur: 0.02, gain: 0.09 * v, pan: p, delay: d, curve: 1 });
  }
  sfx_gear(v, p, d) {
    this.voice({ noise: true, filter: 'bandpass', fq: 620, q: 4, dur: 0.5, gain: 0.14 * v, attack: 0.05, pan: p, delay: d });
  }
  sfx_ui(v = 1, p = 0, d = 0) {
    this.voice({ type: 'square', freq: 880, dur: 0.045, gain: 0.09 * v, pan: p, delay: d, curve: 1 });
  }
  sfx_ui_confirm(v = 1) {
    this.voice({ type: 'square', freq: 660, dur: 0.05, gain: 0.09 * v, curve: 1 });
    this.voice({ type: 'square', freq: 990, dur: 0.08, gain: 0.09 * v, delay: 0.055, curve: 1 });
  }
  sfx_boot(v = 1) {
    this.voice({ type: 'square', freq: 1046, dur: 0.13, gain: 0.1 * v, curve: 1 });
    this.voice({ type: 'square', freq: 1568, dur: 0.22, gain: 0.1 * v, delay: 0.14, curve: 1 });
  }
  sfx_alarm(v, p, d) {
    for (let i = 0; i < 3; i++) {
      this.voice({ type: 'sawtooth', freq: 440, freq2: 660, sweep: 0.18, dur: 0.2, gain: 0.16 * v,
        pan: p, delay: d + i * 0.26, filter: 'bandpass', fq: 1400, q: 2 });
    }
  }
  sfx_herald_roar(v, p, d) {
    this.voice({ type: 'sawtooth', freq: 74, freq2: 40, sweep: 1.5, dur: 2.0, gain: 0.4 * v, attack: 0.3,
      pan: p, delay: d, filter: 'lowpass', fq: 900, fq2: 180 });
    this.voice({ type: 'square', freq: 111, freq2: 58, sweep: 1.6, dur: 1.9, gain: 0.16 * v, attack: 0.4,
      pan: p, delay: d, filter: 'bandpass', fq: 500, q: 3 });
    this.sfx_glitch(v, p, d + 0.4);
  }
  sfx_dilate_in(v = 1) {
    this.voice({ type: 'sine', freq: 900, freq2: 120, sweep: 0.6, dur: 0.9, gain: 0.2 * v, dest: this.musicBus });
    this.voice({ noise: true, filter: 'bandpass', fq: 3000, fq2: 250, q: 1.4, dur: 0.8, gain: 0.2 * v });
  }
  sfx_dilate_out(v = 1) {
    this.voice({ type: 'sine', freq: 140, freq2: 1100, sweep: 0.4, dur: 0.55, gain: 0.16 * v, dest: this.musicBus });
    this.voice({ noise: true, filter: 'bandpass', fq: 300, fq2: 4200, q: 1.2, dur: 0.5, gain: 0.16 * v });
  }
  sfx_rewind(v = 1) {
    this.voice({ noise: true, playbackRate: 0.35, filter: 'bandpass', fq: 400, fq2: 3600, q: 1.1, dur: 1.0, gain: 0.28 * v, attack: 0.15 });
    [0, 3, 7, 10, 12].reverse().forEach((s, i) => this.voice({
      type: 'triangle', freq: ntof('C4') * Math.pow(2, s / 12), dur: 0.5, gain: 0.1 * v, delay: i * 0.06 }));
  }
  sfx_objective(v = 1) {
    [0, 7, 12].forEach((s, i) => this.voice({
      type: 'triangle', freq: ntof('D4') * Math.pow(2, s / 12), dur: 1.1, gain: 0.12 * v, delay: i * 0.1, attack: 0.01 }));
  }
  sfx_death(v = 1) {
    this.voice({ type: 'sawtooth', freq: 220, freq2: 28, sweep: 2.2, dur: 2.6, gain: 0.3 * v, filter: 'lowpass', fq: 1800, fq2: 90 });
  }

  /* ================= music ================= */

  startMusic(mood = 'temple') {
    this.init();
    if (!this.ready) return;
    this.mood = mood;
    if (this._musicTimer) return;
    this._nextBarAt = this.ctx.currentTime + 0.25;
    this._bar = 0;
    this._musicTimer = setInterval(() => this._schedule(), 120);
  }
  stopMusic() { clearInterval(this._musicTimer); this._musicTimer = null; }
  setMood(m) { this.mood = m; }

  // Slow, wide, unbothered — the tempo of an empty shopping mall at 3am.
  static PROGRESSIONS = {
    temple:  [['F2', ['F3', 'A3', 'C4', 'E4']], ['E2', ['E3', 'G3', 'B3', 'D4']],
              ['A2', ['A3', 'C4', 'E4', 'G4']], ['D2', ['D3', 'F3', 'A3', 'C4']]],
    mirror:  [['C2', ['C3', 'E3', 'G3', 'B3']], ['A2', ['A3', 'C4', 'E4', 'G4']],
              ['F2', ['F3', 'A3', 'C4', 'E4']], ['G2', ['G3', 'B3', 'D4', 'F4']]],
    colonnade:[['D2', ['D3', 'F3', 'A3', 'C4']], ['A#1', ['A#2', 'D3', 'F3', 'A3']],
              ['G2', ['G3', 'A#3', 'D4', 'F4']], ['A2', ['A3', 'C4', 'E4', 'G4']]],
    nexus:   [['E2', ['E3', 'G3', 'B3', 'D4']], ['C2', ['C3', 'E3', 'G3', 'B3']],
              ['G2', ['G3', 'B3', 'D4', 'F4']], ['B1', ['B2', 'D3', 'F#3', 'A3']]],
    combat:  [['D2', ['D3', 'F3', 'A3']], ['D2', ['D3', 'F3', 'A#3']],
              ['C2', ['C3', 'D#3', 'G3']], ['A#1', ['A#2', 'D3', 'F3']]],
  };

  _schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const barLen = (this.mood === 'combat' ? 3.2 : 4.6) * (1 + this.dilation * 1.1);
    while (this._nextBarAt < ctx.currentTime + 1.2) {
      this._playBar(this._nextBarAt, barLen);
      this._nextBarAt += barLen;
      this._bar++;
    }
  }

  _playBar(t, len) {
    const prog = AudioEngine.PROGRESSIONS[this.mood] || AudioEngine.PROGRESSIONS.temple;
    const [bassName, chord] = prog[this._bar % prog.length];
    const detune = -this.dilation * 380;     // the tape slows down
    const bus = this.musicBus;

    // --- sub bass ---
    this._key(ntof(bassName) * 0.5, t, len * 0.92, 0.20, detune, bus, 'sine', 340);
    this._key(ntof(bassName), t, len * 0.7, 0.09, detune, bus, 'triangle', 700);

    // --- Rhodes-ish chord, arpeggiated with a lazy human-ish spread ---
    chord.forEach((n, i) => {
      const f = ntof(n);
      const off = i * (0.10 + Math.random() * 0.05);
      this._key(f, t + off, len * (0.85 - i * 0.05), 0.10, detune, bus, 'sine', 2600, true);
      this._key(f * 2.005, t + off, len * 0.35, 0.028, detune, bus, 'sine', 5200);
    });

    // --- pad wash ---
    if (this._bar % 2 === 0) {
      const f = ntof(chord[0]) * 0.5;
      this._pad(f, t, len * 2.1, 0.05, detune, bus);
      this._pad(f * 1.5, t + 0.2, len * 1.9, 0.03, detune, bus);
    }

    // --- a single melancholy lead note every four bars ---
    if (this._bar % 4 === 2) {
      const f = ntof(chord[3] || chord[2]) * 2;
      this._key(f, t + len * 0.45, len * 0.7, 0.055, detune, bus, 'triangle', 3200, true);
    }

    // --- combat drive ---
    if (this.mood === 'combat') {
      const step = len / 8;
      for (let i = 0; i < 8; i++) {
        if (i % 2 === 0) this.voice({ noise: true, filter: 'lowpass', fq: 180, fq2: 60, dur: 0.16,
          gain: 0.22, dest: bus, delay: t - this.ctx.currentTime + i * step });
        if (i % 4 === 2) this.voice({ noise: true, filter: 'highpass', fq: 5200, dur: 0.05,
          gain: 0.06, dest: bus, delay: t - this.ctx.currentTime + i * step, curve: 1 });
      }
    }
  }

  _key(freq, t, dur, gain, detune, dest, type = 'sine', lp = 2600, chorus = false) {
    const ctx = this.ctx;
    const make = (dt2) => {
      const o = ctx.createOscillator(); o.type = type;
      o.frequency.value = freq; o.detune.value = detune + dt2;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass';
      f.frequency.setValueAtTime(lp, t); f.frequency.exponentialRampToValueAtTime(Math.max(180, lp * 0.25), t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(gain, t + 0.012);
      g.gain.exponentialRampToValueAtTime(gain * 0.35, t + dur * 0.35);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      // tape wobble
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 0.7 + Math.random() * 0.9; lg.gain.value = 5 + this.dilation * 14;
      lfo.connect(lg).connect(o.detune);
      lfo.start(t); lfo.stop(t + dur + 0.1);
      o.connect(f).connect(g).connect(dest);
      o.start(t); o.stop(t + dur + 0.1);
    };
    make(0);
    if (chorus) { make(-7); make(8); }
  }

  _pad(freq, t, dur, gain, detune, dest) {
    const ctx = this.ctx;
    for (const dt2 of [-11, 0, 12]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.value = freq; o.detune.value = detune + dt2;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 2;
      f.frequency.setValueAtTime(300, t);
      f.frequency.linearRampToValueAtTime(1100, t + dur * 0.45);
      f.frequency.linearRampToValueAtTime(260, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(gain, t + dur * 0.3);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(f).connect(g).connect(dest);
      o.start(t); o.stop(t + dur + 0.1);
    }
  }

  /** called every frame from the engine */
  update(dilationAmount, dt) {
    this.dilation = dilationAmount;
    if (!this.ready) return;
    const target = lerp(20000, 620, dilationAmount);
    this.worldLP.frequency.value = lerp(this.worldLP.frequency.value, target, Math.min(1, dt * 6));
    this.verbGain.gain.value = lerp(0.34, 0.62, dilationAmount);
  }
}

export const audio = new AudioEngine();
