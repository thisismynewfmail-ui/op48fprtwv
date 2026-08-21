/* SILICONE DREAMS — Developer console
 * Because a 2003 shooter without a tilde key is not a 2003 shooter.
 */
import { cfg, DEFAULTS, setCfg, resetCfg } from '../core/Config.js';
import { input } from '../core/Input.js';
import { time } from '../core/Time.js';
import { audio } from '../core/Audio.js';
import { WEAPONS } from '../game/Weapons.js';

export class Console {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('console');
    this.out = document.getElementById('con-out');
    this.in = document.getElementById('con-in');
    this.open = false;
    this.history = [];
    this.histIdx = -1;

    this.in.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const v = this.in.value.trim();
        this.in.value = '';
        if (v) { this.history.unshift(v); this.histIdx = -1; this.exec(v); }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (this.histIdx < this.history.length - 1) this.in.value = this.history[++this.histIdx];
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.histIdx = Math.max(-1, this.histIdx - 1);
        this.in.value = this.histIdx >= 0 ? this.history[this.histIdx] : '';
      } else if (e.key === 'Escape' || e.code === 'Backquote') {
        e.preventDefault();
        this.toggle(false);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        this.complete();
      }
    });

    this.print('SILICONE DREAMS console. Type `help`.', 'ok');
  }

  toggle(v) {
    this.open = v === undefined ? !this.open : v;
    this.el.classList.toggle('on', this.open);
    if (this.open) {
      input.exitLock();
      input.captureText(() => false);
      setTimeout(() => this.in.focus(), 0);
    } else {
      input.releaseText();
      this.in.blur();
    }
  }

  print(text, cls = '') {
    const d = document.createElement('div');
    if (cls) d.className = cls;
    d.textContent = text;
    this.out.appendChild(d);
    this.out.scrollTop = this.out.scrollHeight;
    while (this.out.childNodes.length > 300) this.out.removeChild(this.out.firstChild);
  }

  get commands() {
    const g = this.game;
    return {
      help: () => {
        this.print('commands: ' + Object.keys(this.commands).join(' '), 'ok');
        this.print('cvars: ' + Object.keys(DEFAULTS).join(' '));
      },
      clear: () => { this.out.innerHTML = ''; },
      noclip: () => { g.player.noclip = !g.player.noclip; this.print('noclip ' + (g.player.noclip ? 'ON' : 'OFF'), 'ok'); },
      god: () => { g.player.godmode = !g.player.godmode; this.print('god ' + (g.player.godmode ? 'ON' : 'OFF'), 'ok'); },
      give: (what, n) => {
        if (what === 'all') {
          for (const k of Object.keys(WEAPONS)) g.weapons.give(k, { ammo: 999, select: false });
          g.chrono.unlock('dilate'); g.chrono.unlock('rewind'); g.chrono.unlock('stasis');
          this.print('gave everything', 'ok'); return;
        }
        if (WEAPONS[what]) { g.weapons.give(what, { ammo: parseInt(n) || 120 }); this.print('gave ' + what, 'ok'); return; }
        if (what === 'health') { g.player.heal(parseInt(n) || 100); this.print('health', 'ok'); return; }
        if (what === 'ammo') { g.weapons.giveAmmo('quartz', 200); g.weapons.giveAmmo('static', 400); this.print('ammo', 'ok'); return; }
        if (what === 'chrono') { g.chrono.refill(100); this.print('chrono', 'ok'); return; }
        this.print('unknown item: ' + what, 'err');
      },
      stage: (n) => {
        if (n === undefined) { this.print(`stage ${g.director.stage} (${g.director.stages[g.director.stage]?.name})`); return; }
        g.director.advance(parseInt(n));
        this.print('-> stage ' + n, 'ok');
      },
      goto: (zone) => {
        const m = { temple: 'spawn', mirror: 'mirrorCentre', colonnade: 'colonnadeEntry', nexus: 'nexusEntry' };
        const key = m[zone];
        const p = key && (g.marks[key] || g.spawnPoint);
        if (!p) { this.print('zones: temple mirror colonnade nexus', 'err'); return; }
        g.player.teleport(p.x, p.y + 1, p.z);
        this.print('teleported to ' + zone, 'ok');
      },
      spawn: (kind, n) => {
        const count = parseInt(n) || 1;
        const p = g.player.pos.clone().addScaledVector(g.player.flatForward, 9);
        for (let i = 0; i < count; i++) {
          const q = p.clone(); q.x += (Math.random() - 0.5) * 6; q.z += (Math.random() - 0.5) * 6; q.y += 3 + Math.random() * 3;
          if (kind === 'sentinel') g.spawnSentinel(q, { alerted: true });
          else if (kind === 'herald') g.spawnHerald(q);
          else g.spawnWraith(q, { alerted: true });
        }
        this.print(`spawned ${count} ${kind || 'wraith'}`, 'ok');
      },
      kill: () => { for (const e of g.enemies) if (e.alive) e.die(); this.print('cleared', 'ok'); },
      hour: (h, m) => {
        if (h !== undefined) { time.hour = parseInt(h) % 12; time.minute = parseFloat(m) || 0; }
        this.print('hour ' + time.clockString(), 'ok');
      },
      hourrate: (r) => { time.hourRate = parseFloat(r) || 0; this.print('hourRate ' + time.hourRate, 'ok'); },
      timescale: (s) => {
        const v = parseFloat(s);
        if (isNaN(v)) { this.print('scale ' + time.scale.toFixed(3)); return; }
        time.dilate(v, 20); this.print('timescale ' + v, 'ok');
      },
      fps: () => {
        const el = document.getElementById('fps');
        el.classList.toggle('on');
        this.print('fps counter ' + (el.classList.contains('on') ? 'on' : 'off'), 'ok');
      },
      reset: () => { resetCfg(); this.print('config reset', 'ok'); },
      save: () => { g.director.saveCheckpoint('manual'); this.print('saved', 'ok'); },
      load: () => { g.director.loadCheckpoint(); this.print('loaded', 'ok'); },
      restart: () => { g.restartChapter(); this.print('restarting', 'ok'); },
      pos: () => {
        const p = g.player.pos;
        this.print(`${p.x.toFixed(2)} ${p.y.toFixed(2)} ${p.z.toFixed(2)}  yaw ${g.player.yaw.toFixed(2)}  zone ${g.currentZone}`);
      },
      stat: () => {
        const r = g.renderer.info;
        this.print(`draws ${r.render.calls}  tris ${r.render.triangles}  geo ${r.memory.geometries}  tex ${r.memory.textures}`);
        this.print(`enemies ${g.enemies.length}  props ${g.world.props.length}  colliders ${g.world.all.length}`);
      },
      music: (mood) => { if (mood) { audio.setMood(mood); this.print('mood ' + mood, 'ok'); } else audio.stopMusic(); },
    };
  }

  complete() {
    const v = this.in.value.trim();
    if (!v) return;
    const pool = [...Object.keys(this.commands), ...Object.keys(DEFAULTS)];
    const hits = pool.filter((k) => k.startsWith(v));
    if (hits.length === 1) this.in.value = hits[0] + ' ';
    else if (hits.length > 1) this.print(hits.join('  '));
  }

  exec(line) {
    this.print('> ' + line, 'echo');
    const parts = line.split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);

    if (cmd in DEFAULTS) {
      if (!args.length) { this.print(`${cmd} = ${cfg[cmd]}  (default ${DEFAULTS[cmd]})`); return; }
      const v = parseFloat(args[0]);
      if (isNaN(v)) { this.print('numeric value expected', 'err'); return; }
      setCfg(cmd, v);
      this.print(`${cmd} = ${v}`, 'ok');
      this.game.onConfigChanged?.();
      return;
    }
    const fn = this.commands[cmd];
    if (!fn) { this.print(`unknown command: ${cmd}`, 'err'); return; }
    try { fn(...args); } catch (e) { this.print(String(e), 'err'); }
  }
}
