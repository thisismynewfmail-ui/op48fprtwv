/* HALCYON — Assets
 *
 * Every surface in the game is painted here, at load time, into 2D canvases.
 * Nothing is downloaded. The palettes are lifted directly from the four
 * reference plates: the purple temple, the mirror of faces, the colonnade
 * of hours and the nexus of sun and moon.
 */
import { ValueNoise, Worley, smooth, clamp01, mix, mulberry32 } from './Noise.js';

const TAU = Math.PI * 2;

export function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/** Per-pixel painter. fn(u, v, x, y) -> [r,g,b,(a)] in 0..255 */
export function paint(size, fn, h = size) {
  const c = makeCanvas(size, h), g = c.getContext('2d');
  const img = g.createImageData(size, h), d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const o = fn(x / size, y / h, x, y);
      d[i] = o[0]; d[i + 1] = o[1]; d[i + 2] = o[2]; d[i + 3] = o.length > 3 ? o[3] : 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

const rgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const mixc = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const scale = (c, s) => [c[0] * s, c[1] * s, c[2] * s];

/* ============================================================ MARBLE */

/**
 * Veined marble. The classic `sin(x + turbulence)` formulation, with a
 * domain warp so the veins meander instead of marching in stripes.
 */
export function marble(size, opt = {}) {
  const {
    base = 0xd8d5cf, vein = 0x8a8781, vein2 = 0xf4f2ee,
    seed = 7, veinFreq = 3, turbAmp = 1.6, sharp = 0.42,
    speckle = 0.035, warp = 0.25, oct = 6,
  } = opt;
  const P = 16;
  const n = new ValueNoise(seed, P);
  const n2 = new ValueNoise(seed + 91, P);
  const n3 = new ValueNoise(seed + 313, 64);
  const cB = rgb(base), cV = rgb(vein), cV2 = rgb(vein2);
  return paint(size, (u, v) => {
    // domain warp keeps the vein network organic
    const wx = u + warp * (n2.fbm(u, v, 3) - 0.5);
    const wy = v + warp * (n2.fbm(u + 3, v + 5, 3) - 0.5);
    const t = n.turb(wx, wy, oct, P, 0.55);
    const m = Math.sin((wx * veinFreq + wy * veinFreq * 0.6 + t * turbAmp) * TAU);
    const vf = smooth(sharp, sharp + 0.55, Math.abs(m));
    let c = mixc(cV, cB, vf);
    // secondary bright calcite streaks
    const m2 = Math.sin((wy * (veinFreq + 2) - wx * 1.5 + t * turbAmp * 1.4) * TAU);
    c = mixc(c, cV2, smooth(0.86, 1.0, Math.abs(m2)) * 0.55);
    // fine grain
    const sp = (n3.sample(u * 64, v * 64) - 0.5) * speckle * 255;
    return [c[0] + sp, c[1] + sp, c[2] + sp];
  });
}

/** Draws a 2x2 checker of two marble canvases, with grout and edge bevel. */
export function checkerOf(a, b, size, opt = {}) {
  const { grout = 'rgba(0,0,0,0.30)', groutW = 0.008, bevel = 0.16, cells = 2 } = opt;
  const c = makeCanvas(size), g = c.getContext('2d');
  const cs = size / cells;
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      const src = (x + y) % 2 === 0 ? a : b;
      g.save();
      g.translate(x * cs + cs / 2, y * cs + cs / 2);
      // rotate each tile so the veining never repeats visibly
      g.rotate(((x * 3 + y * 7) % 4) * Math.PI / 2);
      g.drawImage(src, -cs / 2, -cs / 2, cs, cs);
      g.restore();
    }
  }
  // bevel: light on top-left of each tile, shadow bottom-right
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      const px = x * cs, py = y * cs, w = size * bevel * 0.09;
      let lg = g.createLinearGradient(px, py, px + w * 3, py + w * 3);
      lg.addColorStop(0, 'rgba(255,255,255,0.30)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = lg; g.fillRect(px, py, cs, cs);
      lg = g.createLinearGradient(px + cs, py + cs, px + cs - w * 3, py + cs - w * 3);
      lg.addColorStop(0, 'rgba(0,0,0,0.26)'); lg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = lg; g.fillRect(px, py, cs, cs);
    }
  }
  g.strokeStyle = grout; g.lineWidth = Math.max(1, size * groutW);
  for (let i = 0; i <= cells; i++) {
    g.beginPath(); g.moveTo(i * cs, 0); g.lineTo(i * cs, size); g.stroke();
    g.beginPath(); g.moveTo(0, i * cs); g.lineTo(size, i * cs); g.stroke();
  }
  return c;
}

/* ================================================ CHECKERED CARPET */

/** The pink-and-black runner from the temple plate. Woven, slightly worn. */
export function carpetChecker(size = 512, opt = {}) {
  const { a = 0xd94fa8, b = 0x17121c, cells = 2, wear = 0.22 } = opt;
  const n = new ValueNoise(31, 32);
  const weave = new ValueNoise(88, 128);
  const cA = rgb(a), cB = rgb(b);
  return paint(size, (u, v) => {
    const cx = Math.floor(u * cells), cy = Math.floor(v * cells);
    const dark = (cx + cy) % 2 === 1;
    let c = dark ? cB.slice() : cA.slice();
    // woven thread pattern: alternating warp/weft highlights
    const th = 96;
    const wv = (Math.sin(u * th * TAU) * 0.5 + 0.5) * (Math.sin(v * th * TAU) > 0 ? 1 : 0)
             + (Math.sin(v * th * TAU) * 0.5 + 0.5) * (Math.sin(u * th * TAU) > 0 ? 1 : 0);
    const wf = 1 + (wv - 0.5) * 0.16 + (weave.sample(u * 128, v * 128) - 0.5) * 0.13;
    c = scale(c, wf);
    // sun-bleaching and grime
    const w = n.fbm(u, v, 4);
    c = mixc(c, dark ? [46, 40, 52] : [232, 168, 208], smooth(0.55, 1, w) * wear);
    // seam shadow at cell edges
    const eu = Math.min(u * cells % 1, 1 - (u * cells % 1));
    const ev = Math.min(v * cells % 1, 1 - (v * cells % 1));
    const edge = 1 - smooth(0, 0.02, Math.min(eu, ev)) * 0.35;
    return scale(c, edge);
  });
}

/* ================================================ FLUTED SHAFT MAP */

/** Baked ambient shading for a fluted column, mapped u = around the shaft. */
export function flutedMarble(size = 512, flutes = 24, opt = {}) {
  const m = marble(size, Object.assign({ base: 0xefeae2, vein: 0xb9b3a8, vein2: 0xfffdf8, veinFreq: 2, seed: 12 }, opt));
  const g = m.getContext('2d');
  const img = g.getImageData(0, 0, size, size), d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const s = (u * flutes) % 1;           // 0..1 across one flute
      const p = s * 2 - 1;                  // -1..1
      const depth = Math.sqrt(Math.max(0, 1 - p * p));
      // groove is lit from one side: bright arris, dark hollow
      const shade = 0.62 + 0.38 * depth - 0.30 * clamp01(-p) * depth + 0.22 * clamp01(p) * (1 - depth);
      const arris = 1 - smooth(0.0, 0.06, Math.min(s, 1 - s)) * 0.0;
      const i = (y * size + x) * 4;
      const k = shade * arris;
      d[i] *= k; d[i + 1] *= k; d[i + 2] *= k;
    }
  }
  g.putImageData(img, 0, 0);
  return m;
}

/* ============================================================ METAL */

export function goldTex(size = 256, opt = {}) {
  const { base = 0xd9a93a, hi = 0xffe9a8, lo = 0x7a5312, scratches = 220, seed = 5 } = opt;
  const n = new ValueNoise(seed, 32);
  const cB = rgb(base), cH = rgb(hi), cL = rgb(lo);
  const c = paint(size, (u, v) => {
    const f = n.fbm(u, v, 5);
    let col = mixc(cL, cH, smooth(0.25, 0.8, f));
    col = mixc(col, cB, 0.45);
    return col;
  });
  const g = c.getContext('2d');
  const rnd = mulberry32(seed * 17);
  g.globalAlpha = 0.10;
  for (let i = 0; i < scratches; i++) {
    g.strokeStyle = rnd() > 0.5 ? '#fff3cf' : '#5a3c0c';
    g.lineWidth = rnd() * 1.6 + 0.2;
    const y = rnd() * size, len = rnd() * size * 0.6 + 10, x = rnd() * size;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y + (rnd() - 0.5) * 5); g.stroke();
  }
  g.globalAlpha = 1;
  return c;
}

export function bronzeVerdigris(size = 512, opt = {}) {
  const { metal = 0x8a7c4a, patina = 0x6f9b74, patina2 = 0x3f6b58, dark = 0x3a3320, seed = 21 } = opt;
  const n = new ValueNoise(seed, 16);
  const n2 = new ValueNoise(seed + 44, 32);
  const w = new Worley(seed + 7, 6);
  const cM = rgb(metal), cP = rgb(patina), cP2 = rgb(patina2), cD = rgb(dark);
  return paint(size, (u, v) => {
    const f = n.fbm(u, v, 5);
    const f2 = n2.fbm(u, v, 4);
    const { f1 } = w.sample(u, v);
    let c = mixc(cD, cM, smooth(0.3, 0.72, f));
    // patina creeps in blotches, heavier in the crevices
    const pt = smooth(0.42, 0.78, f2 * 0.7 + (1 - f1 * 3) * 0.3);
    c = mixc(c, cP, pt * 0.85);
    c = mixc(c, cP2, smooth(0.6, 0.95, f2) * 0.6);
    const grain = (n2.sample(u * 64, v * 64) - 0.5) * 14;
    return [c[0] + grain, c[1] + grain, c[2] + grain];
  });
}

export function rustedStone(size = 512, opt = {}) {
  return marble(size, Object.assign({
    base: 0x9d7566, vein: 0x5d382c, vein2: 0xd9bfae,
    seed: 44, veinFreq: 4, turbAmp: 2.0, sharp: 0.34, warp: 0.3,
  }, opt));
}

/* ====================================================== CIRCUIT BOARD */

/**
 * The face-mask surface: solder-mask green with Manhattan-routed copper,
 * vias, gold pads and silkscreen. Drawn with the 2D API because real
 * traces need real strokes.
 */
export function circuitBoard(size = 512, opt = {}) {
  const {
    mask = '#2c7a63', maskDark = '#1d5647', trace = '#4fb694',
    traceHi = '#7fe0bd', pad = '#c8a94e', silk = '#dff3ea', seed = 3,
    density = 1.0,
  } = opt;
  const c = makeCanvas(size), g = c.getContext('2d');
  const rnd = mulberry32(seed);

  // base solder mask with mottling, mixed from the caller's own two greens
  const n = new ValueNoise(seed + 5, 16);
  const hi = rgb(parseInt(mask.slice(1), 16));
  const lo = rgb(parseInt(maskDark.slice(1), 16));
  const base = paint(size, (u, v) => mixc(lo, hi, smooth(0.3, 0.75, n.fbm(u, v, 5))));
  g.drawImage(base, 0, 0);

  const S = size / 32;                       // routing grid
  const line = (col, w, alpha) => { g.strokeStyle = col; g.lineWidth = w; g.globalAlpha = alpha; };

  // ground pours
  g.globalAlpha = 0.16; g.fillStyle = trace;
  for (let i = 0; i < 10 * density; i++) {
    const x = Math.floor(rnd() * 30) * S, y = Math.floor(rnd() * 30) * S;
    g.fillRect(x, y, S * (2 + rnd() * 7), S * (2 + rnd() * 7));
  }
  g.globalAlpha = 1;

  // traces: right-angle routes with 45-degree chamfers
  const nTraces = Math.floor(150 * density);
  for (let i = 0; i < nTraces; i++) {
    const thin = rnd() > 0.4;
    line(rnd() > 0.75 ? traceHi : trace, thin ? S * 0.13 : S * 0.28, 0.85);
    g.lineCap = 'round'; g.lineJoin = 'round';
    let x = Math.floor(rnd() * 32) * S, y = Math.floor(rnd() * 32) * S;
    g.beginPath(); g.moveTo(x, y);
    const segs = 2 + Math.floor(rnd() * 4);
    let horiz = rnd() > 0.5;
    for (let s = 0; s < segs; s++) {
      const len = (1 + Math.floor(rnd() * 7)) * S * (rnd() > 0.5 ? 1 : -1);
      if (horiz) { x += len; } else { y += len; }
      g.lineTo(x, y);
      horiz = !horiz;
    }
    g.stroke();
    // via at each end
    g.globalAlpha = 1; g.fillStyle = pad;
    g.beginPath(); g.arc(x, y, S * 0.3, 0, TAU); g.fill();
    g.fillStyle = '#12332c';
    g.beginPath(); g.arc(x, y, S * 0.13, 0, TAU); g.fill();
  }

  // component pads / IC footprints
  g.globalAlpha = 1;
  for (let i = 0; i < 22 * density; i++) {
    const x = Math.floor(rnd() * 28) * S, y = Math.floor(rnd() * 28) * S;
    const w = (2 + Math.floor(rnd() * 4)), h = (2 + Math.floor(rnd() * 3));
    g.strokeStyle = silk; g.globalAlpha = 0.45; g.lineWidth = S * 0.09;
    g.strokeRect(x, y, w * S, h * S);
    g.globalAlpha = 1; g.fillStyle = pad;
    for (let p = 0; p < w; p++) {
      g.fillRect(x + p * S + S * 0.25, y - S * 0.28, S * 0.5, S * 0.4);
      g.fillRect(x + p * S + S * 0.25, y + h * S - S * 0.12, S * 0.5, S * 0.4);
    }
  }

  // silkscreen reference designators
  g.fillStyle = silk; g.globalAlpha = 0.5;
  g.font = `${Math.max(6, S * 0.55)}px monospace`;
  for (let i = 0; i < 30 * density; i++) {
    const t = ['R' + (1 + Math.floor(rnd() * 99)), 'C' + (1 + Math.floor(rnd() * 99)),
               'U' + (1 + Math.floor(rnd() * 20)), 'JP' + (1 + Math.floor(rnd() * 9)),
               'TP', 'GND', 'VCC'][Math.floor(rnd() * 7)];
    g.fillText(t, rnd() * size, rnd() * size);
  }
  g.globalAlpha = 1;
  return c;
}

/* =========================================================== ORGANIC */

export function woodTex(size = 512, opt = {}) {
  const { light = 0xa9743c, dark = 0x4a2a12, deep = 0x2a1608, seed = 17, rings = 9 } = opt;
  const n = new ValueNoise(seed, 16);
  const g2 = new ValueNoise(seed + 5, 64);
  const cL = rgb(light), cD = rgb(dark), cX = rgb(deep);
  return paint(size, (u, v) => {
    const t = n.turb(u, v, 5, 16, 0.5);
    // rings run along v; the grain is stretched hard in one axis
    const r = Math.sin((v * rings + t * 1.5 + u * 0.4) * TAU);
    let c = mixc(cD, cL, smooth(-0.2, 0.9, r));
    c = mixc(c, cX, smooth(0.8, 1.0, Math.abs(r)) * 0.6);
    const fibre = (g2.sample(u * 8, v * 256) - 0.5) * 24;
    return [c[0] + fibre, c[1] + fibre, c[2] + fibre];
  });
}

/** Leaf/frond alpha sheet. `kind` selects palm, fan, fern or ivy. */
export function foliageSheet(size = 256, kind = 'palm', opt = {}) {
  const c = makeCanvas(size), g = c.getContext('2d');
  g.clearRect(0, 0, size, size);
  const dark = opt.dark || '#14401b';
  const mid = opt.mid || '#2b7a2e';
  const light = opt.light || '#5fb04a';
  const S = size;

  if (kind === 'palm') {
    // A pinnate frond drawn as FILLED tapered leaflets. Strokes alone left
    // too much of the quad transparent and the palms read as bare sticks.
    const grad = g.createLinearGradient(0, S, S, 0);
    grad.addColorStop(0, dark); grad.addColorStop(0.55, mid); grad.addColorStop(1, light);
    const rachis = (t) => ({
      x: S * (0.02 + 0.96 * t),
      y: S * (0.50 - 0.13 * Math.sin(Math.PI * t) + 0.10 * t * t),
    });
    const N = 34;
    for (let i = 1; i < N; i++) {
      const t = i / N;
      const a = rachis(t), b = rachis(Math.min(1, t + 1 / N));
      const len = S * 0.34 * Math.sin(Math.PI * Math.pow(t, 0.62)) * (0.80 + 0.20 * Math.sin(i * 1.7));
      const tone = i % 3 === 0 ? light : (i % 3 === 1 ? mid : dark);
      for (const dir of [-1, 1]) {
        // each leaflet: a filled sliver sweeping out and down from the rachis
        const tipX = a.x + len * 0.62 * (1 - t * 0.25);
        const tipY = a.y + dir * len;
        g.fillStyle = tone;
        g.beginPath();
        g.moveTo(a.x, a.y);
        g.quadraticCurveTo(a.x + len * 0.34, a.y + dir * len * 0.42, tipX, tipY);
        g.quadraticCurveTo(a.x + len * 0.20, a.y + dir * len * 0.52, b.x, b.y);
        g.closePath();
        g.fill();
      }
    }
    // the rachis itself, over the top
    g.strokeStyle = grad; g.lineWidth = S * 0.026; g.lineCap = 'round';
    g.beginPath();
    g.moveTo(rachis(0).x, rachis(0).y);
    for (let i = 1; i <= 24; i++) { const q = rachis(i / 24); g.lineTo(q.x, q.y); }
    g.stroke();
  } else if (kind === 'fan') {
    // fan palm: wedge-shaped segments radiating from one point, filled so the
    // silhouette reads as a fan and not as a handful of wires
    const N = 22;
    const cx = S * 0.5, cy = S * 0.98;
    for (let i = 0; i < N; i++) {
      const a0 = (-Math.PI * 0.92) + (i / N) * Math.PI * 0.84;
      const a1 = (-Math.PI * 0.92) + ((i + 0.86) / N) * Math.PI * 0.84;
      const len = S * 0.50 * (0.70 + 0.30 * Math.sin((i / N) * Math.PI));
      g.fillStyle = i % 3 === 0 ? light : (i % 3 === 1 ? mid : dark);
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(a0 + Math.PI / 2) * len, cy + Math.sin(a0 + Math.PI / 2) * len);
      g.lineTo(cx + Math.cos((a0 + a1) / 2 + Math.PI / 2) * len * 1.06,
               cy + Math.sin((a0 + a1) / 2 + Math.PI / 2) * len * 1.06);
      g.lineTo(cx + Math.cos(a1 + Math.PI / 2) * len, cy + Math.sin(a1 + Math.PI / 2) * len);
      g.closePath();
      g.fill();
    }
  } else if (kind === 'fern') {
    // bipinnate fern frond
    g.strokeStyle = mid; g.lineWidth = S * 0.02; g.lineCap = 'round';
    g.beginPath(); g.moveTo(S * 0.5, S * 0.98); g.lineTo(S * 0.5, S * 0.04); g.stroke();
    const N = 26;
    for (let i = 1; i < N; i++) {
      const t = i / N;
      const y = S * (0.98 - 0.94 * t);
      const len = S * 0.34 * Math.sin(Math.PI * Math.pow(t, 0.6));
      for (const dir of [-1, 1]) {
        g.fillStyle = i % 2 ? mid : light;
        g.beginPath();
        g.moveTo(S * 0.5, y + S * 0.012);
        g.quadraticCurveTo(S * 0.5 + dir * len * 0.6, y - len * 0.06, S * 0.5 + dir * len, y - len * 0.35);
        g.quadraticCurveTo(S * 0.5 + dir * len * 0.5, y + len * 0.10, S * 0.5, y - S * 0.012);
        g.closePath(); g.fill();
      }
    }
  } else { // ivy — a cluster of 5 heart-shaped lobed leaves
    const leaf = (cx, cy, r, rot, col) => {
      g.save(); g.translate(cx, cy); g.rotate(rot); g.fillStyle = col;
      g.beginPath();
      for (let i = 0; i <= 64; i++) {
        const a = (i / 64) * TAU;
        // 5-lobed ivy silhouette
        const rr = r * (0.62 + 0.38 * Math.abs(Math.cos(a * 2.5))) * (1 - 0.28 * Math.pow(Math.max(0, Math.cos(a + Math.PI / 2)), 3));
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.28)'; g.lineWidth = r * 0.05;
      for (let k = -2; k <= 2; k++) {
        g.beginPath(); g.moveTo(0, 0);
        g.lineTo(Math.cos(-Math.PI / 2 + k * 0.5) * r * 0.75, Math.sin(-Math.PI / 2 + k * 0.5) * r * 0.75);
        g.stroke();
      }
      g.restore();
    };
    leaf(S * 0.30, S * 0.30, S * 0.24, 0.3, dark);
    leaf(S * 0.72, S * 0.28, S * 0.21, -0.5, mid);
    leaf(S * 0.28, S * 0.72, S * 0.22, 2.4, mid);
    leaf(S * 0.70, S * 0.70, S * 0.25, 3.4, light);
    leaf(S * 0.50, S * 0.50, S * 0.19, 1.2, light);
  }
  return c;
}

/* ====================================================== THE DIAL FACES */

const RUNES = ['ᚠ', 'ᚢ', 'ᚦ', 'ᚨ', 'ᚱ', 'ᚲ', 'ᚷ', 'ᚹ', 'ᚺ', 'ᚾ', 'ᛁ', 'ᛃ'];
const ROMAN = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];

/**
 * The clock dial carried by the moon column. Elder Futhark in place of
 * numerals, four hands instead of two — this clock is not measuring hours
 * we would recognise.
 */
export function runicDial(size = 512, opt = {}) {
  const {
    face = '#efe7d2', rim = '#c9a24a', ink = '#241d16',
    glyphs = RUNES, ring = true, ticks = true, aged = 0.5,
  } = opt;
  const c = makeCanvas(size), g = c.getContext('2d');
  const R = size / 2;
  g.clearRect(0, 0, size, size);

  // aged ivory face with a subtle radial stain
  const rg = g.createRadialGradient(R, R * 0.85, R * 0.05, R, R, R);
  rg.addColorStop(0, '#fffaf0'); rg.addColorStop(0.65, face); rg.addColorStop(1, '#cdc0a4');
  g.fillStyle = rg;
  g.beginPath(); g.arc(R, R, R * 0.985, 0, TAU); g.fill();

  // foxing / age spots
  const n = new ValueNoise(29, 32);
  const spots = g.getImageData(0, 0, size, size), d = spots.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    if (d[i + 3] < 8) continue;
    const f = n.fbm(x / size, y / size, 4);
    const k = 1 - smooth(0.55, 0.95, f) * 0.22 * aged;
    d[i] *= k; d[i + 1] *= k * 0.99; d[i + 2] *= k * 0.94;
  }
  g.putImageData(spots, 0, 0);

  if (ring) {
    g.strokeStyle = rim; g.lineWidth = size * 0.045;
    g.beginPath(); g.arc(R, R, R * 0.955, 0, TAU); g.stroke();
    g.strokeStyle = 'rgba(255,240,190,0.55)'; g.lineWidth = size * 0.012;
    g.beginPath(); g.arc(R, R, R * 0.935, 0, TAU); g.stroke();
    g.strokeStyle = ink; g.lineWidth = size * 0.008; g.globalAlpha = 0.6;
    g.beginPath(); g.arc(R, R, R * 0.80, 0, TAU); g.stroke();
    g.globalAlpha = 1;
  }

  if (ticks) {
    g.strokeStyle = ink;
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * TAU - Math.PI / 2;
      const major = i % 5 === 0;
      g.lineWidth = size * (major ? 0.012 : 0.005);
      g.globalAlpha = major ? 0.9 : 0.5;
      const r0 = R * (major ? 0.74 : 0.77), r1 = R * 0.815;
      g.beginPath();
      g.moveTo(R + Math.cos(a) * r0, R + Math.sin(a) * r0);
      g.lineTo(R + Math.cos(a) * r1, R + Math.sin(a) * r1);
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  // glyphs
  g.fillStyle = ink;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `${size * 0.12}px "Segoe UI Symbol", "Noto Sans Runic", serif`;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU - Math.PI / 2;
    const x = R + Math.cos(a) * R * 0.64, y = R + Math.sin(a) * R * 0.64;
    g.save(); g.translate(x, y);
    if (opt.radial !== false) g.rotate(a + Math.PI / 2);
    g.fillText(glyphs[i % glyphs.length], 0, 0);
    g.restore();
  }
  return c;
}

export function romanDial(size = 512, opt = {}) {
  return runicDial(size, Object.assign({
    glyphs: ROMAN, face: '#f2ead4', rim: '#b08a34', radial: true,
  }, opt));
}

/**
 * The sun relief: a sleeping face inside a corona of triangular rays,
 * cast in patinated bronze. Drawn as a height/albedo pair.
 */
export function sunFaceRelief(size = 512) {
  const c = bronzeVerdigris(size, { seed: 61 });
  const g = c.getContext('2d');
  const R = size / 2;

  const shade = (x, y, r, a, col) => {
    const rg = g.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.05, x, y, r);
    rg.addColorStop(0, col[0]); rg.addColorStop(1, col[1]);
    g.globalAlpha = a; g.fillStyle = rg;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.globalAlpha = 1;
  };

  // cheeks / brow, lit from upper-left as in the plate
  shade(R, R, R * 0.46, 0.55, ['rgba(214,214,168,0.95)', 'rgba(70,74,44,0.9)']);
  shade(R * 0.78, R * 1.06, R * 0.16, 0.35, ['rgba(226,226,180,0.8)', 'rgba(120,124,80,0)']);
  shade(R * 1.22, R * 1.06, R * 0.16, 0.35, ['rgba(226,226,180,0.8)', 'rgba(120,124,80,0)']);

  g.lineCap = 'round'; g.lineJoin = 'round';

  // closed eyes: a lidded arc with lashes
  for (const s of [-1, 1]) {
    const ex = R + s * R * 0.19, ey = R * 0.90;
    g.strokeStyle = 'rgba(40,44,26,0.85)'; g.lineWidth = size * 0.014;
    g.beginPath(); g.arc(ex, ey, R * 0.115, 0.12 * Math.PI, 0.88 * Math.PI); g.stroke();
    g.strokeStyle = 'rgba(232,232,190,0.5)'; g.lineWidth = size * 0.008;
    g.beginPath(); g.arc(ex, ey - size * 0.006, R * 0.115, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
    // brow
    g.strokeStyle = 'rgba(46,50,28,0.7)'; g.lineWidth = size * 0.017;
    g.beginPath(); g.arc(ex, ey + R * 0.02, R * 0.19, 1.12 * Math.PI, 1.88 * Math.PI); g.stroke();
  }

  // nose
  g.strokeStyle = 'rgba(48,52,30,0.6)'; g.lineWidth = size * 0.013;
  g.beginPath(); g.moveTo(R - size * 0.008, R * 0.94);
  g.quadraticCurveTo(R - size * 0.026, R * 1.10, R, R * 1.13); g.stroke();
  g.strokeStyle = 'rgba(226,226,184,0.45)'; g.lineWidth = size * 0.01;
  g.beginPath(); g.moveTo(R + size * 0.012, R * 0.94); g.lineTo(R + size * 0.008, R * 1.11); g.stroke();

  // mouth — closed, serene
  g.strokeStyle = 'rgba(44,48,26,0.75)'; g.lineWidth = size * 0.015;
  g.beginPath(); g.moveTo(R - R * 0.14, R * 1.24);
  g.quadraticCurveTo(R, R * 1.30, R + R * 0.14, R * 1.24); g.stroke();
  g.strokeStyle = 'rgba(224,224,180,0.4)'; g.lineWidth = size * 0.009;
  g.beginPath(); g.moveTo(R - R * 0.12, R * 1.27);
  g.quadraticCurveTo(R, R * 1.325, R + R * 0.12, R * 1.27); g.stroke();

  return c;
}

/* ============================================================== VENUS */

/**
 * The head of Botticelli's Venus, as it appears on the terminal's CRT.
 * Painted impressionistically — at 320x240 through a phosphor mask and a
 * chromatic-aberration pass, brushwork is all that survives anyway.
 */
export function venusHead(w = 512, h = 512) {
  const c = makeCanvas(w, h), g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#6f7a5c'); bg.addColorStop(0.5, '#8e9a72'); bg.addColorStop(1, '#4e5a44');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);

  const cx = w * 0.5, cy = h * 0.52, fw = w * 0.19, fh = h * 0.27;

  // --- hair mass behind the head: long, wind-blown golden ropes ---
  const hair = (x0, y0, x1, y1, x2, y2, wd, col, a = 1) => {
    g.strokeStyle = col; g.lineWidth = wd; g.globalAlpha = a;
    g.lineCap = 'round';
    g.beginPath(); g.moveTo(x0, y0); g.bezierCurveTo(x1, y1, x2, y2, x2 + (x2 - x1) * 0.4, y2 + (y2 - y1) * 0.5);
    g.stroke(); g.globalAlpha = 1;
  };
  const golds = ['#c99b46', '#e0bb66', '#a87c31', '#f0d894', '#8d6524'];
  for (let i = 0; i < 90; i++) {
    const t = i / 90;
    const side = i % 2 ? 1 : -1;
    const sx = cx + side * fw * (0.55 + Math.random() * 0.7);
    const sy = cy - fh * (0.75 - Math.random() * 0.5);
    hair(sx, sy,
      cx + side * fw * (1.6 + Math.random() * 1.9), cy + fh * (0.2 + Math.random() * 0.9),
      cx + side * fw * (1.1 + Math.random() * 2.6), cy + fh * (1.6 + Math.random() * 1.8),
      w * (0.006 + Math.random() * 0.016), golds[i % golds.length], 0.55 + Math.random() * 0.45);
    hair(sx, sy,
      cx + side * fw * (0.3 + Math.random() * 0.6), cy - fh * (1.0 + Math.random() * 0.5),
      cx + side * fw * (1.2 + Math.random() * 1.4), cy - fh * (0.9 + Math.random() * 0.9),
      w * (0.005 + Math.random() * 0.012), golds[(i + 2) % golds.length], 0.4 + Math.random() * 0.4);
  }

  // --- neck ---
  g.fillStyle = '#d9b596';
  g.beginPath();
  g.moveTo(cx - fw * 0.42, cy + fh * 0.72);
  g.lineTo(cx + fw * 0.42, cy + fh * 0.72);
  g.lineTo(cx + fw * 0.60, cy + fh * 2.0);
  g.lineTo(cx - fw * 0.60, cy + fh * 2.0);
  g.closePath(); g.fill();
  g.fillStyle = 'rgba(150,105,80,0.35)';
  g.beginPath(); g.ellipse(cx, cy + fh * 0.86, fw * 0.5, fh * 0.22, 0, 0, TAU); g.fill();

  // --- face oval, Botticelli's characteristic long jaw ---
  const fg = g.createLinearGradient(cx - fw, cy - fh, cx + fw, cy + fh);
  fg.addColorStop(0, '#f6ded0'); fg.addColorStop(0.45, '#eecdb4'); fg.addColorStop(1, '#c99b7e');
  g.fillStyle = fg;
  g.beginPath();
  g.moveTo(cx, cy - fh);
  g.bezierCurveTo(cx + fw * 1.02, cy - fh * 0.86, cx + fw * 1.04, cy + fh * 0.30, cx, cy + fh);
  g.bezierCurveTo(cx - fw * 1.04, cy + fh * 0.30, cx - fw * 1.02, cy - fh * 0.86, cx, cy - fh);
  g.fill();

  // soft shading on the right of the face
  const sg = g.createLinearGradient(cx + fw * 0.1, cy, cx + fw, cy);
  sg.addColorStop(0, 'rgba(180,130,100,0)'); sg.addColorStop(1, 'rgba(150,100,74,0.42)');
  g.fillStyle = sg;
  g.beginPath();
  g.moveTo(cx, cy - fh);
  g.bezierCurveTo(cx + fw * 1.02, cy - fh * 0.86, cx + fw * 1.04, cy + fh * 0.30, cx, cy + fh);
  g.lineTo(cx, cy - fh); g.fill();

  // --- eyes: heavy-lidded, downcast, faintly melancholy ---
  for (const s of [-1, 1]) {
    const ex = cx + s * fw * 0.40, ey = cy - fh * 0.12;
    const ew = fw * 0.30, eh = fh * 0.115;
    g.fillStyle = '#f7ece2';
    g.beginPath(); g.ellipse(ex, ey, ew, eh, s * 0.05, 0, TAU); g.fill();
    g.fillStyle = '#6d7f6a';                                     // grey-green iris
    g.beginPath(); g.arc(ex + s * ew * 0.06, ey + eh * 0.14, eh * 0.86, 0, TAU); g.fill();
    g.fillStyle = '#241a14';
    g.beginPath(); g.arc(ex + s * ew * 0.06, ey + eh * 0.14, eh * 0.40, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.beginPath(); g.arc(ex + s * ew * 0.06 - eh * 0.24, ey - eh * 0.12, eh * 0.16, 0, TAU); g.fill();
    // upper lid
    g.strokeStyle = 'rgba(96,60,44,0.9)'; g.lineWidth = w * 0.006;
    g.beginPath(); g.ellipse(ex, ey, ew, eh, s * 0.05, Math.PI * 1.02, Math.PI * 1.98); g.stroke();
    g.strokeStyle = 'rgba(140,96,70,0.5)'; g.lineWidth = w * 0.004;
    g.beginPath(); g.ellipse(ex, ey + eh * 0.15, ew * 0.94, eh, s * 0.05, Math.PI * 0.06, Math.PI * 0.94); g.stroke();
    // brow
    g.strokeStyle = 'rgba(150,112,64,0.55)'; g.lineWidth = w * 0.0075;
    g.beginPath();
    g.moveTo(ex - s * ew * 1.05, ey - eh * 2.0);
    g.quadraticCurveTo(ex, ey - eh * 3.0, ex + s * ew * 1.15, ey - eh * 1.7);
    g.stroke();
  }

  // --- nose ---
  g.strokeStyle = 'rgba(168,116,88,0.55)'; g.lineWidth = w * 0.0065;
  g.beginPath();
  g.moveTo(cx + fw * 0.04, cy - fh * 0.10);
  g.quadraticCurveTo(cx + fw * 0.16, cy + fh * 0.22, cx + fw * 0.02, cy + fh * 0.30);
  g.stroke();
  g.fillStyle = 'rgba(190,138,110,0.4)';
  g.beginPath(); g.ellipse(cx - fw * 0.10, cy + fh * 0.31, fw * 0.06, fh * 0.03, 0, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(cx + fw * 0.13, cy + fh * 0.31, fw * 0.06, fh * 0.03, 0, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255,244,232,0.5)';
  g.beginPath(); g.ellipse(cx - fw * 0.02, cy + fh * 0.14, fw * 0.05, fh * 0.14, 0, 0, TAU); g.fill();

  // --- mouth: small, full, slightly parted ---
  const my = cy + fh * 0.54;
  g.fillStyle = '#b8676a';
  g.beginPath();
  g.moveTo(cx - fw * 0.20, my);
  g.quadraticCurveTo(cx - fw * 0.09, my - fh * 0.075, cx, my - fh * 0.03);
  g.quadraticCurveTo(cx + fw * 0.09, my - fh * 0.075, cx + fw * 0.20, my);
  g.quadraticCurveTo(cx, my + fh * 0.13, cx - fw * 0.20, my);
  g.fill();
  g.strokeStyle = 'rgba(120,56,58,0.7)'; g.lineWidth = w * 0.0045;
  g.beginPath(); g.moveTo(cx - fw * 0.19, my);
  g.quadraticCurveTo(cx, my + fh * 0.028, cx + fw * 0.19, my); g.stroke();
  g.fillStyle = 'rgba(255,214,206,0.35)';
  g.beginPath(); g.ellipse(cx - fw * 0.04, my + fh * 0.055, fw * 0.07, fh * 0.022, 0, 0, TAU); g.fill();

  // blush
  for (const s of [-1, 1]) {
    const bg2 = g.createRadialGradient(cx + s * fw * 0.55, cy + fh * 0.30, 1, cx + s * fw * 0.55, cy + fh * 0.30, fw * 0.45);
    bg2.addColorStop(0, 'rgba(214,132,120,0.30)'); bg2.addColorStop(1, 'rgba(214,132,120,0)');
    g.fillStyle = bg2; g.fillRect(cx + s * fw - fw, cy - fh * 0.2, fw * 2, fh * 1.2);
  }

  // --- front hair: the centre part and the strands crossing the brow ---
  g.save();
  g.beginPath();
  g.moveTo(cx, cy - fh * 1.02);
  g.bezierCurveTo(cx + fw * 1.06, cy - fh * 0.88, cx + fw * 1.06, cy - fh * 0.2, cx + fw * 0.92, cy - fh * 0.05);
  g.lineTo(cx + fw * 1.3, cy - fh * 1.3); g.lineTo(cx - fw * 1.3, cy - fh * 1.3);
  g.lineTo(cx - fw * 0.92, cy - fh * 0.05);
  g.bezierCurveTo(cx - fw * 1.06, cy - fh * 0.2, cx - fw * 1.06, cy - fh * 0.88, cx, cy - fh * 1.02);
  g.clip();
  for (let i = 0; i < 60; i++) {
    const s = i % 2 ? 1 : -1;
    g.strokeStyle = golds[i % golds.length]; g.globalAlpha = 0.75;
    g.lineWidth = w * (0.004 + Math.random() * 0.008);
    g.beginPath();
    g.moveTo(cx + (Math.random() - 0.5) * fw * 0.12, cy - fh * (1.02 + Math.random() * 0.1));
    g.quadraticCurveTo(cx + s * fw * (0.4 + Math.random() * 0.5), cy - fh * (0.95 - Math.random() * 0.3),
      cx + s * fw * (0.9 + Math.random() * 0.4), cy - fh * (0.1 + Math.random() * 0.55));
    g.stroke();
  }
  g.restore(); g.globalAlpha = 1;

  // painterly craquelure + tempera grain
  const n = new ValueNoise(77, 64);
  const im = g.getImageData(0, 0, w, h), d = im.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const f = n.fbm(x / w, y / h, 4, 64) - 0.5;
    const k = 1 + f * 0.11;
    d[i] *= k; d[i + 1] *= k; d[i + 2] *= k;
  }
  g.putImageData(im, 0, 0);
  return c;
}

/* ================================================== SCREENS & PLASTIC */

/** Beige-box plastic: injection-moulded, UV-yellowed, faint pebble texture. */
export function beigePlastic(size = 256, tint = 0xd6c9ab) {
  const n = new ValueNoise(91, 64);
  const w = new Worley(13, 40);
  const c0 = rgb(tint);
  return paint(size, (u, v) => {
    const { f1 } = w.sample(u, v);
    const peb = smooth(0.0, 0.055, f1) * 0.10;
    const g2 = (n.sample(u * 64, v * 64) - 0.5) * 8;
    // uneven yellowing, worst near the top where the sun hits
    const yellow = smooth(0.2, 1, n.fbm(u, v, 3, 64)) * 0.1;
    let c = scale(c0, 1 - peb * 0.5);
    c = mixc(c, [206, 182, 122], yellow);
    return [c[0] + g2, c[1] + g2, c[2] + g2 * 0.7];
  });
}

/** Aperture-grille phosphor mask overlaid on CRT content. */
export function phosphorMask(size = 256) {
  return paint(size, (u, v, x, y) => {
    const p = x % 3;
    const scan = 0.72 + 0.28 * Math.pow(Math.abs(Math.cos(y * Math.PI * 0.5)), 0.6);
    return [p === 0 ? 255 : 40, p === 1 ? 255 : 40, p === 2 ? 255 : 40, 255 * (1 - scan) * 0.9 + 40];
  });
}

/* ================================================================ SKY */

/**
 * Cumulus-clouded sky, painted into an equirect strip. `mood` picks between
 * the temple's violet dusk and the mirror-plane's photographic blue noon.
 */
export function skyPanorama(w = 2048, h = 1024, mood = 'violet') {
  const c = makeCanvas(w, h), g = c.getContext('2d');
  const P = {
    violet: { top: '#38287a', mid: '#6a5cae', horizon: '#a08fd0', low: '#8574b6',
              cloudHi: '#e4dbf6', cloudLo: '#514198', sun: '#ffe0b0', puff: 1.0 },
    blue:   { top: '#0f47a0', mid: '#3278c4', horizon: '#8fb8dc', low: '#a0c4e0',
              cloudHi: '#f2f7ff', cloudLo: '#61809e', sun: '#fff4d8', puff: 1.25 },
    dusk:   { top: '#2b2350', mid: '#7a4f8f', horizon: '#e6a07e', low: '#c07a86',
              cloudHi: '#ffdcc4', cloudLo: '#5b3f6b', sun: '#ffd0a0', puff: 0.9 },
  }[mood] || {};

  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, P.top); grad.addColorStop(0.34, P.mid);
  grad.addColorStop(0.52, P.horizon); grad.addColorStop(0.62, P.low);
  grad.addColorStop(1, P.low);
  g.fillStyle = grad; g.fillRect(0, 0, w, h);

  // sun glow
  const sx = w * 0.72, sy = h * 0.30;
  const sg = g.createRadialGradient(sx, sy, 1, sx, sy, h * 0.55);
  sg.addColorStop(0, P.sun); sg.addColorStop(0.06, 'rgba(255,240,215,0.55)');
  sg.addColorStop(0.4, 'rgba(255,240,215,0.12)'); sg.addColorStop(1, 'rgba(255,240,215,0)');
  g.fillStyle = sg; g.fillRect(0, 0, w, h);

  // cumulus: stacks of soft radial puffs, denser toward the horizon
  const rnd = mulberry32(mood === 'blue' ? 4 : 9);
  const puff = (x, y, r, a, hi, lo) => {
    const rg = g.createRadialGradient(x - r * 0.25, y - r * 0.35, r * 0.05, x, y, r);
    rg.addColorStop(0, hi); rg.addColorStop(0.45, hi);
    rg.addColorStop(0.72, lo); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = a; g.fillStyle = rg;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  };
  const toRGBA = (hex, a) => {
    const [r2, g2, b2] = rgb(parseInt(hex.slice(1), 16));
    return `rgba(${r2 | 0},${g2 | 0},${b2 | 0},${a})`;
  };

  const clusters = 90;
  for (let i = 0; i < clusters; i++) {
    const t = rnd();
    // bias clouds into the upper half but let a band pile up at the horizon
    const cy = h * (0.06 + Math.pow(t, 1.5) * 0.46);
    const cx = rnd() * w;
    const scaleR = (0.030 + rnd() * 0.075) * h * P.puff * (1 - (cy / h) * 0.45);
    const n = 8 + (rnd() * 14) | 0;
    // shadowed underside first
    for (let k = 0; k < n; k++) {
      const ax = cx + (rnd() - 0.5) * scaleR * 4.2;
      const ay = cy + (rnd() - 0.2) * scaleR * 1.0;
      puff(ax, ay + scaleR * 0.35, scaleR * (0.6 + rnd() * 0.8), 0.45,
        toRGBA(P.cloudLo, 0.85), toRGBA(P.cloudLo, 0));
    }
    for (let k = 0; k < n; k++) {
      const ax = cx + (rnd() - 0.5) * scaleR * 4.0;
      const ay = cy + (rnd() - 0.6) * scaleR * 1.1;
      puff(ax, ay, scaleR * (0.55 + rnd() * 0.85), 0.55 + rnd() * 0.35,
        toRGBA(P.cloudHi, 0.95), toRGBA(P.cloudHi, 0));
    }
  }
  g.globalAlpha = 1;

  // horizon haze
  const hz = g.createLinearGradient(0, h * 0.42, 0, h * 0.62);
  hz.addColorStop(0, 'rgba(255,255,255,0)');
  hz.addColorStop(0.6, toRGBA(P.horizon, 0.55));
  hz.addColorStop(1, toRGBA(P.horizon, 0.0));
  g.fillStyle = hz; g.fillRect(0, h * 0.40, w, h * 0.25);
  return c;
}

/** Deep-space backdrop: stars, dust lanes and the magenta/green nebula. */
export function nebulaPanorama(w = 2048, h = 1024, opt = {}) {
  const { magenta = '#b02aa8', green = '#1f9f6a', blue = '#2a3fa0', density = 1 } = opt;
  const c = makeCanvas(w, h), g = c.getContext('2d');
  g.fillStyle = '#03030a'; g.fillRect(0, 0, w, h);

  const rnd = mulberry32(1234);
  // nebula: overlapping soft blobs in additive-ish mode
  g.globalCompositeOperation = 'lighter';
  const blob = (x, y, r, col, a) => {
    const rg = g.createRadialGradient(x, y, 1, x, y, r);
    rg.addColorStop(0, col.replace(')', `,${a})`).replace('rgb', 'rgba'));
    rg.addColorStop(1, col.replace(')', ',0)').replace('rgb', 'rgba'));
    g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  };
  const hexToRGBstr = (hex) => { const [r2, g2, b2] = rgb(parseInt(hex.slice(1), 16)); return `rgb(${r2 | 0},${g2 | 0},${b2 | 0})`; };
  const M = hexToRGBstr(magenta), G = hexToRGBstr(green), B = hexToRGBstr(blue);
  // the plate has one dominant cloud in the upper-left quadrant
  const cxs = [w * 0.18, w * 0.26, w * 0.10, w * 0.62, w * 0.86];
  const cys = [h * 0.26, h * 0.34, h * 0.20, h * 0.18, h * 0.30];
  for (let i = 0; i < 5; i++) {
    const strength = i < 3 ? 1 : 0.45;
    for (let k = 0; k < 40 * density; k++) {
      const a = rnd() * TAU, rr = Math.pow(rnd(), 0.6) * h * 0.22;
      const x = cxs[i] + Math.cos(a) * rr * 1.9, y = cys[i] + Math.sin(a) * rr;
      const pick = rnd();
      blob(x, y, h * (0.03 + rnd() * 0.10),
        pick < 0.5 ? M : pick < 0.85 ? G : B, (0.035 + rnd() * 0.05) * strength);
    }
  }
  g.globalCompositeOperation = 'source-over';

  // dust: subtract dark filaments
  const n = new ValueNoise(400, 32);
  const im = g.getImageData(0, 0, w, h), d = im.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const f = n.turb(x / w, y / h, 5, 32, 0.55);
    const k = 1 - smooth(0.35, 0.75, f) * 0.55;
    d[i] *= k; d[i + 1] *= k; d[i + 2] *= k;
  }
  g.putImageData(im, 0, 0);

  // stars
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * w, y = rnd() * h;
    const m = Math.pow(rnd(), 5);
    const r = 0.4 + m * 2.4;
    const a = 0.25 + m * 0.75;
    const tint = rnd();
    g.fillStyle = tint < 0.7 ? `rgba(255,255,255,${a})`
      : tint < 0.85 ? `rgba(200,220,255,${a})` : `rgba(255,226,190,${a})`;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    if (m > 0.55) {                                   // diffraction spikes on the brightest
      g.globalAlpha = a * 0.4; g.strokeStyle = g.fillStyle; g.lineWidth = 0.7;
      g.beginPath(); g.moveTo(x - r * 4, y); g.lineTo(x + r * 4, y);
      g.moveTo(x, y - r * 4); g.lineTo(x, y + r * 4); g.stroke();
      g.globalAlpha = 1;
    }
  }
  return c;
}

/** Earth: procedural continents, ice caps and a separate cloud layer. */
export function earthMap(w = 1024, h = 512) {
  const land = new ValueNoise(2024, 8);
  const detail = new ValueNoise(99, 32);
  const c = paint(w, (u, v) => {
    const lat = (v - 0.5) * Math.PI;
    // squash noise toward the poles so continents don't smear
    const e = land.fbm(u, v, 6, 8, 0.52) * 0.75 + detail.fbm(u, v, 5, 32, 0.5) * 0.25;
    const shelf = e - 0.44;
    if (shelf < 0) {
      const deep = clamp01(-shelf * 5);
      return mixc(rgb(0x2f74b8), rgb(0x0a1f4a), deep);
    }
    const alt = clamp01(shelf * 3.4);
    const cold = clamp01((Math.abs(lat) - 0.95) * 3.2);
    const arid = detail.fbm(u + 3, v + 7, 4, 32);
    let col = mixc(rgb(0x3f7a34), rgb(0x8f7a3a), smooth(0.42, 0.72, arid));
    col = mixc(col, rgb(0x6f5a34), smooth(0.35, 0.9, alt) * 0.6);
    col = mixc(col, rgb(0xf2f6ff), Math.max(cold, smooth(0.75, 1.0, alt) * 0.7));
    return col;
  }, h);
  // polar caps
  const g = c.getContext('2d');
  for (const [y0, y1, a] of [[0, h * 0.09, 1], [h * 0.93, h, 1]]) {
    const gr = g.createLinearGradient(0, y0, 0, y1);
    const dir = y0 === 0;
    gr.addColorStop(dir ? 0 : 1, `rgba(248,252,255,${a})`);
    gr.addColorStop(dir ? 1 : 0, 'rgba(248,252,255,0)');
    g.fillStyle = gr; g.fillRect(0, y0, w, y1 - y0);
  }
  return c;
}

export function earthClouds(w = 1024, h = 512) {
  const n = new ValueNoise(555, 16);
  const n2 = new ValueNoise(556, 64);
  return paint(w, (u, v) => {
    const band = 0.55 + 0.45 * Math.cos((v - 0.5) * Math.PI * 6);   // trade-wind banding
    const f = n.fbm(u, v, 6, 16, 0.55) * 0.7 + n2.fbm(u, v, 4, 64) * 0.3;
    const a = clamp01((f * band - 0.36) * 3.2);
    return [255, 255, 255, a * 235];
  }, h);
}

/** Simple radial alpha puff for billboarded volumetric clouds. */
export function cloudPuff(size = 256, opt = {}) {
  const { soft = 0.55, tint = [255, 255, 255] } = opt;
  const n = new ValueNoise(opt.seed || 12, 16);
  return paint(size, (u, v) => {
    const dx = u - 0.5, dy = v - 0.5;
    const d = Math.sqrt(dx * dx + dy * dy) * 2;
    const f = n.fbm(u, v, 5, 16, 0.55);
    const edge = 1 - smooth(soft * (0.5 + f * 0.9), 1.0, d);
    const a = clamp01(edge * (0.55 + f * 0.75));
    // shade the underside
    const shade = 0.72 + 0.28 * clamp01(1 - (v + 0.12) * 1.2);
    return [tint[0] * shade, tint[1] * shade, tint[2] * shade, a * 255];
  });
}

/** Generic RGBA noise for shader dithering / grain. */
export function noiseRGBA(size = 128, seed = 1) {
  const rnd = mulberry32(seed);
  return paint(size, () => [rnd() * 255, rnd() * 255, rnd() * 255, rnd() * 255]);
}

/** Soft radial sprite used for muzzle flashes, sparks, glows. */
export function glowSprite(size = 128, opt = {}) {
  const { power = 2.2, core = 0.12, tint = [255, 255, 255] } = opt;
  return paint(size, (u, v) => {
    const dx = u - 0.5, dy = v - 0.5;
    const d = Math.min(1, Math.sqrt(dx * dx + dy * dy) * 2);
    const a = Math.pow(1 - d, power) + (d < core ? (1 - d / core) * 0.9 : 0);
    return [tint[0], tint[1], tint[2], clamp01(a) * 255];
  });
}

/** Six-pointed star flare for the chrono energy motes. */
export function starSprite(size = 128, points = 4) {
  return paint(size, (u, v) => {
    const dx = (u - 0.5) * 2, dy = (v - 0.5) * 2;
    const d = Math.sqrt(dx * dx + dy * dy);
    const a0 = Math.atan2(dy, dx);
    const spike = Math.pow(Math.abs(Math.cos(a0 * points / 2)), 22);
    const core = Math.pow(Math.max(0, 1 - d), 5);
    const arms = Math.pow(Math.max(0, 1 - d), 1.5) * spike;
    return [255, 255, 255, clamp01(core + arms) * 255];
  });
}

/** Scorch / impact decal. */
export function decalSprite(size = 128, opt = {}) {
  const { seed = 3, colour = [18, 14, 16] } = opt;
  const n = new ValueNoise(seed, 16);
  return paint(size, (u, v) => {
    const dx = u - 0.5, dy = v - 0.5;
    const d = Math.sqrt(dx * dx + dy * dy) * 2;
    const f = n.fbm(u, v, 5, 16, 0.6);
    const a = clamp01((1 - smooth(0.35 + f * 0.45, 1.0, d)) * (0.5 + f));
    const hole = d < 0.18 ? 1 : 0;
    return [colour[0], colour[1], colour[2], clamp01(a + hole * 0.7) * 255];
  });
}

/** Hairline crack overlay for the shattered-glass / broken-clock look. */
export function crackSprite(size = 256, seed = 6) {
  const c = makeCanvas(size), g = c.getContext('2d');
  g.clearRect(0, 0, size, size);
  const rnd = mulberry32(seed);
  const R = size / 2;
  g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineCap = 'round';
  const branch = (x, y, a, len, w, depth) => {
    if (depth > 4 || len < 3) return;
    const nx = x + Math.cos(a) * len, ny = y + Math.sin(a) * len;
    g.lineWidth = w; g.globalAlpha = 0.25 + 0.6 * (1 - depth / 5);
    g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
    branch(nx, ny, a + (rnd() - 0.5) * 0.7, len * 0.75, w * 0.7, depth + 1);
    if (rnd() > 0.45) branch(nx, ny, a + (rnd() - 0.5) * 1.6, len * 0.55, w * 0.6, depth + 1);
  };
  for (let i = 0; i < 9; i++) branch(R, R, (i / 9) * TAU + rnd() * 0.4, R * 0.3, 2.4, 0);
  g.globalAlpha = 1;
  return c;
}
