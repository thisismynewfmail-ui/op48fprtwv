/* HALCYON — Architecture
 *
 * The classical order, built from scratch: entasis-tapered fluted shafts,
 * two-tier acanthus capitals with corner volutes, semicircular arcades and
 * the checkerboard decks they stand on.
 *
 * Geometry is created once and shared between meshes — the colonnades repeat
 * hundreds of times and the GPU should only ever see one copy of each part.
 */
import * as THREE from 'three';
import { M, T, rep } from './Materials.js';

const TAU = Math.PI * 2;
const cacheG = new Map();
export function shared(key, make) {
  if (!cacheG.has(key)) cacheG.set(key, make());
  return cacheG.get(key);
}

/* ------------------------------------------------------------ SHAFT */

/**
 * A fluted Doric/Corinthian shaft.
 *  - `flutes` semicircular grooves run the full height
 *  - entasis: the shaft swells slightly at ~1/3 height, as the Greeks cut it,
 *    so it doesn't read as concave from below
 */
export function flutedShaftGeometry(opt = {}) {
  const {
    rBottom = 0.42, rTop = 0.35, height = 6, flutes = 24,
    fluteDepth = 0.055, entasis = 0.022, segY = 26, capEnds = true,
    seg = flutes * 8,
  } = opt;

  const pos = [], nor = [], uv = [], idx = [];
  const radiusAt = (t) => {
    const taper = rBottom + (rTop - rBottom) * t;
    return taper + Math.sin(Math.pow(t, 0.85) * Math.PI) * entasis;
  };
  // Per-angle radial offset: one scallop per flute.
  //
  // A truly circular groove has an infinite slope at the arris, which makes
  // the interpolated normals swing wildly and turns the shaft into a wobbling
  // ribbon. A raised-cosine groove looks the same at any sane viewing
  // distance and has zero slope at the arris, so the shading stays calm.
  const fluteAt = (a) => {
    const s = ((a / TAU) * flutes) % 1;         // 0..1 within one flute
    const p = s * 2 - 1;                        // -1..1
    return -fluteDepth * (0.5 + 0.5 * Math.cos(Math.PI * p));
  };
  // d(fluteAt)/da, analytic — exact normals beat finite differences here
  const fluteSlope = (a) => {
    const s = ((a / TAU) * flutes) % 1;
    const p = s * 2 - 1;
    return 0.5 * fluteDepth * flutes * Math.sin(Math.PI * p);
  };

  for (let iy = 0; iy <= segY; iy++) {
    const t = iy / segY;
    const y = t * height;
    const R = radiusAt(t);
    for (let ia = 0; ia <= seg; ia++) {
      const a = (ia / seg) * TAU;
      const scale = rBottom / 0.42;
      const r = R + fluteAt(a) * scale;
      const ca = Math.cos(a), sa = Math.sin(a);
      pos.push(ca * r, y, sa * r);
      // For a polar curve r(a) the outward normal is  r * r̂ - r'(a) * â
      const dr = fluteSlope(a) * scale;
      let nx = r * ca - dr * -sa;
      let nz = r * sa - dr * ca;
      const ny = (rBottom - rTop) * 0.18;         // the taper tips it slightly
      const nl = Math.hypot(nx, ny, nz) || 1;
      nor.push(nx / nl, ny / nl, nz / nl);
      uv.push(ia / seg, t * height * 0.30);
    }
  }
  const row = seg + 1;
  for (let iy = 0; iy < segY; iy++) {
    for (let ia = 0; ia < seg; ia++) {
      const a0 = iy * row + ia, b0 = a0 + 1, a1 = a0 + row, b1 = a1 + 1;
      idx.push(a0, a1, b0, b0, a1, b1);
    }
  }
  if (capEnds) {
    for (const [t, yy, dir] of [[0, 0, -1], [1, height, 1]]) {
      const base = pos.length / 3;
      pos.push(0, yy, 0); nor.push(0, dir, 0); uv.push(0.5, 0.5);
      const R = radiusAt(t);
      for (let ia = 0; ia <= seg; ia++) {
        const a = (ia / seg) * TAU;
        const r = R + fluteAt(a) * (rBottom / 0.42);
        pos.push(Math.cos(a) * r, yy, Math.sin(a) * r);
        nor.push(0, dir, 0);
        uv.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
      }
      for (let ia = 0; ia < seg; ia++) {
        if (dir > 0) idx.push(base, base + 1 + ia, base + 2 + ia);
        else idx.push(base, base + 2 + ia, base + 1 + ia);
      }
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/* ---------------------------------------------------------- MOULDING */

/** Lathe helper: profile given as [[r, y], ...] in local units. */
export function lathe(profile, segs = 32) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y));
  const g = new THREE.LatheGeometry(pts, segs);
  g.computeVertexNormals();
  return g;
}

/** Attic base: plinth, lower torus, scotia, upper torus. */
export function columnBaseGeometry(r = 0.42) {
  const h = r * 1.05;
  return lathe([
    [r * 1.42, 0], [r * 1.42, h * 0.22], [r * 1.36, h * 0.26],
    [r * 1.38, h * 0.30], [r * 1.30, h * 0.44],           // lower torus
    [r * 1.06, h * 0.52], [r * 1.02, h * 0.62],           // scotia
    [r * 1.22, h * 0.72], [r * 1.16, h * 0.86],           // upper torus
    [r * 1.02, h * 0.94], [r * 1.0, h],
  ], 40);
}

/** The bell (kalathos) of a Corinthian capital. */
export function kalathosGeometry(r = 0.35, h = 0.85) {
  return lathe([
    [r * 0.99, 0], [r * 1.02, h * 0.06],
    [r * 1.10, h * 0.28], [r * 1.24, h * 0.55],
    [r * 1.40, h * 0.80], [r * 1.50, h * 0.95], [r * 1.50, h],
  ], 40);
}

/**
 * One acanthus leaf: a curled, lobed blade. Built as a displaced grid so it
 * can hug the bell of the capital.
 */
export function acanthusGeometry(opt = {}) {
  const { w = 0.30, h = 0.60, curl = 0.55, segU = 9, segV = 13, lobes = 3 } = opt;
  const pos = [], nor = [], uv = [], idx = [];
  for (let iv = 0; iv <= segV; iv++) {
    const v = iv / segV;
    // silhouette: wide at the base, pinched between lobes, pointed tip
    const lobe = Math.abs(Math.sin(v * Math.PI * lobes));
    const width = w * (0.30 + 0.70 * Math.sin(Math.pow(v, 0.7) * Math.PI)) * (0.55 + 0.45 * lobe);
    for (let iu = 0; iu <= segU; iu++) {
      const u = iu / segU * 2 - 1;
      const x = u * width;
      const y = v * h;
      // the blade rolls backward at the tip and the edges curl forward
      const z = -Math.pow(v, 2.1) * curl * h + Math.pow(Math.abs(u), 2.2) * width * 0.9
                + Math.sin(v * Math.PI * lobes) * 0.012;
      pos.push(x, y, z);
      nor.push(0, 0, 1);
      uv.push((u + 1) * 0.5, v);
    }
  }
  const row = segU + 1;
  for (let iv = 0; iv < segV; iv++) for (let iu = 0; iu < segU; iu++) {
    const a = iv * row + iu, b = a + 1, c = a + row, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A volute: the spiral scroll at the corner of the capital. */
export function voluteGeometry(opt = {}) {
  const { turns = 2.1, r0 = 0.14, tube = 0.032, segs = 72 } = opt;
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const a = t * TAU * turns;
    const r = r0 * Math.pow(0.55, t * turns);
    pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, t * 0.02));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  return new THREE.TubeGeometry(curve, segs, tube, 7, false);
}

/** Abacus: the square slab on top, with concave (scooped) sides. */
export function abacusGeometry(size = 0.62, h = 0.14, concave = 0.14) {
  const s = new THREE.Shape();
  const half = size;
  const k = half * concave;
  s.moveTo(-half, -half);
  s.quadraticCurveTo(0, -half + k, half, -half);
  s.quadraticCurveTo(half - k, 0, half, half);
  s.quadraticCurveTo(0, half - k, -half, half);
  s.quadraticCurveTo(-half + k, 0, -half, -half);
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelSize: h * 0.16, bevelThickness: h * 0.16, bevelSegments: 2, curveSegments: 8 });
  g.rotateX(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

/* --------------------------------------------------------- COLUMNS */

/**
 * A complete Corinthian column. `style`:
 *   'white' — the temple pavilion (plate 1)
 *   'rose'  — the colonnade of hours (plates 2 & 4)
 */
export function corinthianColumn(opt = {}) {
  const {
    height = 6.4, rBottom = 0.42, rTop = 0.34, style = 'white',
    capital = true, base = true, flutes = 24, detail = 1,
  } = opt;

  // Plain marble on the shaft: the flutes are real geometry, so a texture
  // with flutes baked into it only fights them and produces moire.
  const stoneMat = style === 'rose' ? M.marbleRose : M.marbleCream;
  const shaftMat = stoneMat;
  const key = `${style}|${height}|${rBottom}|${rTop}|${flutes}`;
  const g = new THREE.Group();
  g.name = 'column';

  let y = 0;
  if (base) {
    const bg = shared('cbase' + rBottom, () => columnBaseGeometry(rBottom));
    const m = new THREE.Mesh(bg, stoneMat);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    y += rBottom * 1.05;
  }

  const shaftH = height - y - (capital ? rTop * 2.5 : 0);
  const sg = shared('shaft' + key, () => flutedShaftGeometry({
    rBottom, rTop, height: shaftH, flutes, segY: detail > 0.5 ? 24 : 8,
    seg: Math.max(32, flutes * (detail > 0.5 ? 8 : 4)),
  }));
  const shaft = new THREE.Mesh(sg, shaftMat);
  shaft.position.y = y;
  shaft.castShadow = shaft.receiveShadow = true;
  g.add(shaft);
  y += shaftH;

  // astragal — the little ring where the shaft meets the capital
  const ring = new THREE.Mesh(
    shared('astragal' + rTop, () => lathe([
      [rTop * 1.0, 0], [rTop * 1.10, 0.012], [rTop * 1.12, 0.032],
      [rTop * 1.06, 0.05], [rTop * 1.03, 0.058],
    ], 28)), stoneMat);
  ring.position.y = y - 0.01;
  g.add(ring);

  if (capital) {
    const cap = corinthianCapital({ r: rTop, mat: stoneMat, detail });
    cap.position.y = y + 0.03;
    g.add(cap);
  }
  g.userData.radius = rBottom;
  g.userData.height = height;
  return g;
}

export function corinthianCapital(opt = {}) {
  const { r = 0.34, mat = M.marbleCream, detail = 1 } = opt;
  const grp = new THREE.Group();
  const h = r * 2.45;

  const bell = new THREE.Mesh(shared('kal' + r, () => kalathosGeometry(r, h * 0.82)), mat);
  bell.castShadow = true;
  grp.add(bell);

  const leafG = shared('acanth', () => acanthusGeometry({ w: 0.30, h: 0.60, curl: 0.55 }));
  // lower tier: eight leaves hugging the bell
  const tiers = detail > 0.5 ? [
    { count: 8, y: h * 0.02, s: r * 1.02, tilt: 0.26, out: r * 1.02, rot: 0 },
    { count: 8, y: h * 0.30, s: r * 1.18, tilt: 0.40, out: r * 1.18, rot: Math.PI / 8 },
  ] : [
    { count: 6, y: h * 0.06, s: r * 1.1, tilt: 0.3, out: r * 1.1, rot: 0 },
  ];
  for (const t of tiers) {
    for (let i = 0; i < t.count; i++) {
      const a = (i / t.count) * TAU + t.rot;
      const leaf = new THREE.Mesh(leafG, mat);
      leaf.scale.setScalar(t.s * 1.5);
      leaf.position.set(Math.cos(a) * t.out * 0.62, t.y, Math.sin(a) * t.out * 0.62);
      leaf.rotation.y = -a + Math.PI / 2;
      leaf.rotation.x = -t.tilt;
      grp.add(leaf);
    }
  }

  if (detail > 0.5) {
    // corner volutes + central helices
    const vg = shared('volute', () => voluteGeometry({ r0: r * 0.42, tube: r * 0.085 }));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      for (const s of [-1, 1]) {
        const v = new THREE.Mesh(vg, mat);
        v.position.set(Math.cos(a) * r * 1.36, h * 0.80, Math.sin(a) * r * 1.36);
        v.rotation.y = -a + Math.PI / 2;
        v.rotation.z = s * 0.5;
        v.scale.set(s, 1, 1);
        grp.add(v);
      }
      // fleuron stem rising to the abacus
      const stem = new THREE.Mesh(
        shared('fleuron' + r, () => new THREE.SphereGeometry(r * 0.14, 8, 6)), mat);
      stem.position.set(Math.cos(a + Math.PI / 4) * r * 0.5, h * 0.92, Math.sin(a + Math.PI / 4) * r * 0.5);
      stem.scale.set(1, 0.7, 1);
      grp.add(stem);
    }
  }

  const ab = new THREE.Mesh(shared('abacus' + r, () => abacusGeometry(r * 1.72, r * 0.42, 0.16)), mat);
  ab.position.y = h * 0.86;
  ab.castShadow = true;
  grp.add(ab);
  return grp;
}

/* ----------------------------------------------------------- ARCHES */

/**
 * A semicircular arch on two piers — the module the colonnades in plates 2
 * and 4 repeat into the distance.
 */
export function archGeometry(opt = {}) {
  const {
    span = 3.0,        // clear width between piers
    pierW = 0.42,      // pier thickness (in X)
    legH = 2.6,        // height of the straight legs
    thick = 0.46,      // radial thickness of the arch ring
    depth = 0.5,       // extrusion depth (in Z)
    segments = 22,
  } = opt;
  const half = span / 2;
  const rIn = half, rOut = half + thick;
  const s = new THREE.Shape();
  s.moveTo(-rOut, 0);
  s.lineTo(-rOut, legH);
  // outer semicircle
  for (let i = 0; i <= segments; i++) {
    const a = Math.PI - (i / segments) * Math.PI;
    s.lineTo(Math.cos(a) * rOut, legH + Math.sin(a) * rOut);
  }
  s.lineTo(rOut, 0);
  s.lineTo(rOut - pierW, 0);
  s.lineTo(rOut - pierW, legH);
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI;
    s.lineTo(Math.cos(a) * rIn, legH + Math.sin(a) * rIn);
  }
  s.lineTo(-rOut + pierW, legH);
  s.lineTo(-rOut + pierW, 0);
  s.closePath();

  const g = new THREE.ExtrudeGeometry(s, {
    depth, bevelEnabled: true, bevelSize: 0.018, bevelThickness: 0.018,
    bevelSegments: 1, curveSegments: 6,
  });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return g;
}

/**
 * A run of arches. Plates 2 and 4 both show the same trick: identical arches
 * marching to a vanishing point, each one a little dimmer than the last.
 */
export function arcade(opt = {}) {
  const {
    count = 14, spacing = 3.6, span = 2.6, legH = 2.7, thick = 0.4,
    depth = 0.5, mat = M.rustStone, colMat = M.marbleRose, columns = true,
    shrink = 0, startAt = 0,
  } = opt;
  const grp = new THREE.Group();
  const ag = shared(`arch${span}|${legH}|${thick}|${depth}`, () => archGeometry({ span, legH, thick, depth }));
  const colH = legH;
  const cg = shared(`archcol${colH}`, () => new THREE.CylinderGeometry(0.22, 0.26, colH, 14));
  const capg = shared('archcap', () => new THREE.CylinderGeometry(0.30, 0.24, 0.16, 14));

  for (let i = 0; i < count; i++) {
    const z = startAt + i * spacing;
    const sc = 1 - shrink * (i / Math.max(1, count - 1));
    const a = new THREE.Mesh(ag, mat);
    a.position.set(0, 0, z);
    a.scale.setScalar(sc);
    a.castShadow = true; a.receiveShadow = true;
    grp.add(a);
    if (columns) {
      for (const s of [-1, 1]) {
        const x = s * (span / 2 + thick / 2) * sc;
        const c = new THREE.Mesh(cg, colMat);
        c.position.set(x, colH / 2, z);
        c.scale.setScalar(sc);
        c.castShadow = true;
        grp.add(c);
        const cap = new THREE.Mesh(capg, mat);
        cap.position.set(x, colH + 0.06 * sc, z);
        cap.scale.setScalar(sc);
        grp.add(cap);
      }
    }
  }
  grp.userData.length = count * spacing;
  return grp;
}

/* ----------------------------------------------------------- SLABS */

/** A checkerboard deck. `tile` is world-units per checker square. */
export function deck(w, d, opt = {}) {
  const {
    mat = M.checkerColonnade, tile = 2.0, thickness = 0.45,
    edgeMat = M.marbleGrey, y = 0,
  } = opt;
  const grp = new THREE.Group();
  const topMat = mat.clone();
  topMat.map = rep(mat.map, w / (tile * 2), d / (tile * 2));
  const top = new THREE.Mesh(new THREE.PlaneGeometry(w, d, 1, 1), topMat);
  top.rotation.x = -Math.PI / 2;
  top.position.y = y;
  top.receiveShadow = true;
  grp.add(top);

  if (thickness > 0) {
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, thickness, d), edgeMat);
    body.position.y = y - thickness / 2 - 0.001;
    body.receiveShadow = true; body.castShadow = true;
    grp.add(body);
  }
  grp.userData.size = { w, d, thickness };
  return grp;
}

/** Stepped cornice / entablature band running around a rectangle. */
export function cornice(w, d, opt = {}) {
  const { mat = M.marbleCream, h = 0.34, out = 0.22, steps = 3 } = opt;
  const grp = new THREE.Group();
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    const o = out * (1 - t);
    const sh = h / steps;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w + o * 2, sh, d + o * 2), mat);
    b.position.y = i * sh + sh / 2;
    b.castShadow = true; b.receiveShadow = true;
    grp.add(b);
  }
  return grp;
}

/** Balustrade: rail + turned balusters. */
export function balustrade(len, opt = {}) {
  const { mat = M.marbleCream, h = 0.95, spacing = 0.42, axis = 'x' } = opt;
  const grp = new THREE.Group();
  const bg = shared('baluster', () => lathe([
    [0.09, 0], [0.10, 0.04], [0.07, 0.10], [0.055, 0.24],
    [0.085, 0.36], [0.10, 0.46], [0.085, 0.56], [0.055, 0.64],
    [0.062, 0.70], [0.09, 0.74], [0.09, 0.78],
  ], 12));
  const n = Math.max(2, Math.floor(len / spacing));
  for (let i = 0; i <= n; i++) {
    const t = i / n - 0.5;
    const b = new THREE.Mesh(bg, mat);
    b.scale.set(1, h / 0.78 * 0.8, 1);
    b.position.y = h * 0.10;
    if (axis === 'x') b.position.x = t * len; else b.position.z = t * len;
    grp.add(b);
  }
  const railG = axis === 'x' ? new THREE.BoxGeometry(len, 0.11, 0.26) : new THREE.BoxGeometry(0.26, 0.11, len);
  const rail = new THREE.Mesh(railG, mat);
  rail.position.y = h * 0.88;
  rail.castShadow = true;
  grp.add(rail);
  const base = new THREE.Mesh(
    axis === 'x' ? new THREE.BoxGeometry(len, 0.12, 0.30) : new THREE.BoxGeometry(0.30, 0.12, len), mat);
  base.position.y = 0.06;
  grp.add(base);
  return grp;
}

/** A flight of stairs. Returns a group plus the collider boxes to register. */
export function staircase(opt = {}) {
  const {
    steps = 10, width = 3.0, rise = 0.22, run = 0.42,
    mat = M.marbleWhite, taper = 0,
  } = opt;
  const grp = new THREE.Group();
  const boxes = [];
  for (let i = 0; i < steps; i++) {
    const w = width * (1 - taper * (i / steps));
    // each tread is a slab that extends back under the ones above it
    const depth = run + (steps - i) * 0.0;
    const g = new THREE.BoxGeometry(w, rise, depth);
    const m = new THREE.Mesh(g, mat);
    m.position.set(0, rise * (i + 0.5), -i * run);
    m.castShadow = true; m.receiveShadow = true;
    grp.add(m);
    boxes.push({ w, h: rise, d: depth, x: 0, y: rise * (i + 0.5), z: -i * run });
  }
  grp.userData.boxes = boxes;
  grp.userData.totalRise = steps * rise;
  grp.userData.totalRun = steps * run;
  return grp;
}

/** Pedestal / plinth with mouldings — used under every hero object. */
export function pedestal(opt = {}) {
  const { w = 1.2, h = 1.0, d = 1.2, mat = M.marbleCream } = opt;
  const grp = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, h * 0.80, d * 0.86), mat);
  body.position.y = h * 0.5;
  body.castShadow = body.receiveShadow = true;
  grp.add(body);
  const base = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.12, d), mat);
  base.position.y = h * 0.06;
  base.castShadow = base.receiveShadow = true;
  grp.add(base);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(w * 0.98, h * 0.10, d * 0.98), mat);
  cap.position.y = h * 0.93;
  cap.castShadow = cap.receiveShadow = true;
  grp.add(cap);
  grp.userData.box = { w, h, d };
  return grp;
}

/** The pavilion of plate 1: four columns carrying a coffered flat roof. */
export function pavilion(opt = {}) {
  const {
    w = 7.0, d = 7.0, colH = 6.2, roofH = 0.85, overhang = 1.1,
    mat = M.marbleCream, style = 'white',
  } = opt;
  const grp = new THREE.Group();
  const hx = w / 2, hz = d / 2;
  const cols = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const c = corinthianColumn({ height: colH, style, rBottom: 0.44, rTop: 0.36 });
    c.position.set(sx * hx, 0, sz * hz);
    grp.add(c);
    cols.push({ x: sx * hx, z: sz * hz, r: 0.5 });
  }
  // a fifth column offset behind, as in the plate
  const extra = corinthianColumn({ height: colH, style, rBottom: 0.44, rTop: 0.36 });
  extra.position.set(0, 0, -hz);
  grp.add(extra);
  cols.push({ x: 0, z: -hz, r: 0.5 });

  const roof = new THREE.Group();
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(w + overhang * 2, roofH, d + overhang * 2), mat);
  slab.position.y = colH + roofH / 2;
  slab.castShadow = true; slab.receiveShadow = true;
  roof.add(slab);
  // soffit coffers
  const coffer = new THREE.Mesh(
    new THREE.BoxGeometry((w + overhang * 2) * 0.82, 0.06, (d + overhang * 2) * 0.82), M.marbleWhite);
  coffer.position.y = colH + 0.03;
  roof.add(coffer);
  const cor = cornice(w + overhang * 2, d + overhang * 2, { mat, h: 0.28, out: 0.16, steps: 3 });
  cor.position.y = colH + roofH;
  roof.add(cor);
  grp.add(roof);

  grp.userData.columns = cols;
  grp.userData.roofY = colH;
  grp.userData.roofBox = { w: w + overhang * 2, h: roofH + 0.28, d: d + overhang * 2, y: colH + roofH * 0.5 };
  return grp;
}

/** Ivy climbing a column: a helix of leaf clusters plus a woody stem. */
export function ivyVine(opt = {}) {
  const {
    height = 5.5, radius = 0.40, turns = 3.2, leaves = 46,
    leafSize = 0.30, seed = 1,
  } = opt;
  const grp = new THREE.Group();
  let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };

  const pts = [];
  const N = 60;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const a = t * TAU * turns;
    const r = radius * (1 + Math.sin(t * 7) * 0.06);
    pts.push(new THREE.Vector3(Math.cos(a) * r, t * height, Math.sin(a) * r));
  }
  const stem = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.022, 5, false), M.bark);
  grp.add(stem);

  const lg = shared('ivyquad', () => new THREE.PlaneGeometry(1, 1));
  for (let i = 0; i < leaves; i++) {
    const t = rnd() * 0.98 + 0.01;
    const a = t * TAU * turns + (rnd() - 0.5) * 0.8;
    const r = radius * (1 + rnd() * 0.22);
    const m = new THREE.Mesh(lg, M.ivy);
    m.position.set(Math.cos(a) * r, t * height + (rnd() - 0.5) * 0.15, Math.sin(a) * r);
    m.scale.setScalar(leafSize * (0.6 + rnd() * 0.8));
    m.rotation.y = -a + Math.PI / 2 + (rnd() - 0.5) * 1.2;
    m.rotation.z = (rnd() - 0.5) * 1.4;
    m.rotation.x = (rnd() - 0.5) * 0.6;
    m.userData.sway = rnd() * TAU;
    grp.add(m);
  }
  grp.userData.leafStart = 1;
  return grp;
}
