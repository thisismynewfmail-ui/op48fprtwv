/* SILICONE DREAMS — Time
 *
 * The whole game is built around two clocks that disagree.
 *
 *   realDt   — wall time. The player, the HUD, the viewmodel live here.
 *   worldDt  — realDt * scale. Enemies, projectiles, props, the sea, the
 *              clouds and every ticking clock in the level live here.
 *
 * When the Chronometer fires, `scale` collapses toward 0.12 and the world
 * turns to amber syrup while the player keeps moving at full speed. Every
 * system in the codebase must choose, explicitly, which clock it obeys.
 */

export class GameTime {
  constructor() {
    this.now = 0;          // accumulated world time (seconds)
    this.realNow = 0;      // accumulated wall time (seconds)
    this.dt = 0;           // world delta this frame
    this.realDt = 0;       // wall delta this frame
    this.scale = 1;        // current dilation
    this.targetScale = 1;
    this.blend = 8;        // how fast scale chases targetScale
    this.frame = 0;
    this.paused = false;
    this._last = 0;
    this._smoothFps = 60;
    // level-fiction clock: the Great Clock of the Colonnade. 0..12 hours.
    this.hour = 11;        // the level opens at the eleventh hour
    this.minute = 47;
    this.hourRate = 0;     // minutes advanced per world-second when running
  }

  reset() {
    this.now = 0; this.realNow = 0; this.frame = 0;
    this.scale = 1; this.targetScale = 1; this._last = 0;
  }

  /** @param {number} tMs performance.now() timestamp */
  tick(tMs) {
    const t = tMs * 0.001;
    if (this._last === 0) this._last = t;
    let rdt = t - this._last;
    this._last = t;
    // clamp: alt-tab, breakpoints, and the browser's own hiccups must not
    // teleport the player through a wall.
    if (rdt > 0.1) rdt = 0.1;
    if (rdt < 0) rdt = 0;

    this.realDt = rdt;
    this.realNow += rdt;
    this._smoothFps += ((rdt > 0 ? 1 / rdt : 60) - this._smoothFps) * 0.06;

    // ease the dilation so the transition itself is audible/visible
    const k = 1 - Math.exp(-this.blend * rdt);
    this.scale += (this.targetScale - this.scale) * k;
    if (Math.abs(this.scale - this.targetScale) < 0.0015) this.scale = this.targetScale;

    this.dt = this.paused ? 0 : rdt * this.scale;
    this.now += this.dt;
    this.frame++;

    if (this.hourRate > 0 && !this.paused) {
      this.minute += this.hourRate * this.dt;
      while (this.minute >= 60) { this.minute -= 60; this.hour = (this.hour + 1) % 12; }
    }
    return this.dt;
  }

  get fps() { return this._smoothFps; }

  dilate(target, blend = 8) { this.targetScale = target; this.blend = blend; }
  restore(blend = 5) { this.targetScale = 1; this.blend = blend; }
  get dilated() { return this.scale < 0.97; }

  /** 0 at normal speed, 1 at maximum dilation — drives shaders and mixing. */
  get dilationAmount() { return Math.min(1, Math.max(0, (1 - this.scale) / 0.9)); }

  clockString() {
    const h = this.hour === 0 ? 12 : this.hour;
    const m = Math.floor(this.minute);
    return `${h}:${m < 10 ? '0' : ''}${m}`;
  }
}

export const time = new GameTime();

/* --- small easing / math helpers used all over the codebase --- */
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
/** frame-rate independent exponential approach */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
