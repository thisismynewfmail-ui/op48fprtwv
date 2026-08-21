/* SILICONE DREAMS — Noise
 * Small, seeded, *tileable* value/gradient noise. Every texture in the game
 * is painted from these, so they must wrap perfectly or the marble seams show.
 */

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;

/** Tileable value noise on a `period` x `period` lattice. */
export class ValueNoise {
  constructor(seed = 1, period = 64) {
    this.p = period;
    const rnd = mulberry32(seed);
    this.g = new Float32Array(period * period);
    for (let i = 0; i < this.g.length; i++) this.g[i] = rnd();
  }
  at(ix, iy) {
    const p = this.p;
    return this.g[((iy % p) + p) % p * p + (((ix % p) + p) % p)];
  }
  sample(x, y) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = fade(x - x0), fy = fade(y - y0);
    const a = this.at(x0, y0), b = this.at(x0 + 1, y0);
    const c = this.at(x0, y0 + 1), d = this.at(x0 + 1, y0 + 1);
    return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
  }
  /** fBm. `freq` defaults to the lattice period, which is what makes it tile. */
  fbm(x, y, octaves = 5, freq = this.p, gain = 0.5, lac = 2) {
    let sum = 0, amp = 1, norm = 0, f = freq;
    for (let i = 0; i < octaves; i++) {
      sum += this.sample(x * f, y * f) * amp;
      norm += amp; amp *= gain; f *= lac;
    }
    return sum / norm;
  }
  /** ridged / turbulent variant — the basis of marble veining */
  turb(x, y, octaves = 5, freq = this.p, gain = 0.5, lac = 2) {
    let sum = 0, amp = 1, norm = 0, f = freq;
    for (let i = 0; i < octaves; i++) {
      sum += Math.abs(this.sample(x * f, y * f) * 2 - 1) * amp;
      norm += amp; amp *= gain; f *= lac;
    }
    return sum / norm;
  }
}

/** Tileable Worley/cellular noise — used for cracked marble and PCB pads. */
export class Worley {
  constructor(seed = 1, cells = 8) {
    this.n = cells;
    const rnd = mulberry32(seed);
    this.pts = new Float32Array(cells * cells * 2);
    for (let i = 0; i < cells * cells; i++) {
      this.pts[i * 2] = rnd(); this.pts[i * 2 + 1] = rnd();
    }
  }
  /** returns {f1, f2} distances in cell units, x/y in 0..1 */
  sample(x, y) {
    const n = this.n;
    const cx = Math.floor(x * n), cy = Math.floor(y * n);
    let f1 = 9e9, f2 = 9e9;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const gx = cx + ox, gy = cy + oy;
      const wx = ((gx % n) + n) % n, wy = ((gy % n) + n) % n;
      const i = (wy * n + wx) * 2;
      const px = (gx + this.pts[i]) / n, py = (gy + this.pts[i + 1]) / n;
      const dx = x - px, dy = y - py;
      const d = dx * dx + dy * dy;
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
    }
    return { f1: Math.sqrt(f1), f2: Math.sqrt(f2) };
  }
}

export const smooth = (e0, e1, x) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const mix = lerp;

/** hsl -> rgb, 0..1 in, 0..255 out */
export function hsl(h, s, l) {
  h = ((h % 1) + 1) % 1;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h * 12) % 12;
    return l - a * Math.max(-1, Math.min(Math.min(k - 3, 9 - k), 1));
  };
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}
