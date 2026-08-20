/* HALCYON — Hero objects
 *
 * The things the four plates are actually *about*: the circuit-board faces,
 * the sleeping sun, the runic moon-clock, the Earth on its stair, the
 * terminal running Venus, and the three timepieces of the colonnade.
 */
import * as THREE from 'three';
import { M, T } from './Materials.js';
import { shared, lathe, pedestal } from './Arch.js';

const TAU = Math.PI * 2;
const gauss = (t, s) => Math.exp(-(t * t) / (2 * s * s));
const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/* ====================================================== THE FACE MASK */

/**
 * The mask from plate 3. A sphere is re-sculpted by a field of facial
 * features — brow, sockets, nose, cheeks, lips, chin — and the eyes are
 * punched clean through, which is what makes the things read as hollow
 * rather than merely blind.
 */
export function faceMaskGeometry(opt = {}) {
  const {
    segU = 48, segV = 40,
    sx = 0.72, sy = 1.0, sz = 0.80,
    eyeHoles = true, sleeping = false, mouthOpen = 0,
    intensity = 1,
  } = opt;

  const EYE = { x: 0.335, y: 0.155, rx: 0.150, ry: 0.098 };

  const feature = (fx, fy, front) => {
    let d = 0;
    // brow ridge
    d += gauss(fy - 0.305, 0.105) * gauss(fx, 0.44) * 0.078;
    d -= gauss(fy - 0.245, 0.055) * gauss(fx, 0.40) * 0.022;   // brow undercut
    // eye sockets
    for (const s of [-1, 1]) d -= gauss(fx - s * EYE.x, 0.155) * gauss(fy - EYE.y, 0.115) * 0.105;
    if (sleeping) for (const s of [-1, 1]) d += gauss(fx - s * EYE.x, 0.115) * gauss(fy - EYE.y, 0.075) * 0.075;
    // nose: bridge, then a bulb, then nostril grooves
    d += gauss(fx, 0.082) * smoothstep(-0.18, 0.04, fy) * (1 - smoothstep(0.28, 0.44, fy)) * 0.150;
    d += gauss(fx, 0.125) * gauss(fy + 0.055, 0.062) * 0.062;
    for (const s of [-1, 1]) d -= gauss(fx - s * 0.125, 0.048) * gauss(fy + 0.075, 0.040) * 0.052;
    // cheekbones
    for (const s of [-1, 1]) d += gauss(fx - s * 0.455, 0.205) * gauss(fy - 0.005, 0.185) * 0.052;
    // philtrum + lips + mouth line
    d -= gauss(fx, 0.032) * gauss(fy + 0.20, 0.048) * 0.020;
    d += gauss(fy + 0.295, 0.050) * gauss(fx, 0.235) * 0.058;
    d += gauss(fy + 0.415, 0.055) * gauss(fx, 0.215) * 0.050;
    d -= gauss(fy + 0.355, 0.017 + mouthOpen * 0.03) * gauss(fx, 0.255) * (0.048 + mouthOpen * 0.09);
    // chin + jaw shelf
    d += gauss(fy + 0.655, 0.128) * gauss(fx, 0.255) * 0.062;
    d -= gauss(fy + 0.505, 0.055) * gauss(fx, 0.30) * 0.022;
    return d * front * intensity;
  };

  const pos = [], nor = [], uv = [];
  const inEye = [];
  for (let iv = 0; iv <= segV; iv++) {
    const th = (iv / segV) * Math.PI;
    const ny = Math.cos(th), rr = Math.sin(th);
    for (let iu = 0; iu <= segU; iu++) {
      const ph = (iu / segU) * TAU - Math.PI;      // 0 = straight ahead (+Z)
      const nx = rr * Math.sin(ph), nz = rr * Math.cos(ph);
      // jaw taper: the head narrows below the cheeks
      const jaw = 1 - 0.30 * smoothstep(-0.15, -0.95, ny);
      // the cranium is a touch flatter at the back
      const backFlat = 1 - 0.10 * smoothstep(0.0, -1.0, nz);
      const front = smoothstep(0.06, 0.52, nz);
      const d = feature(nx, ny, front);
      const R = 1 + d;
      const x = nx * sx * jaw * R;
      const y = ny * sy * R;
      const z = nz * sz * backFlat * R;
      pos.push(x, y, z);
      nor.push(nx, ny, nz);
      uv.push(iu / segU, 1 - iv / segV);
      const eye = eyeHoles && !sleeping && nz > 0.24 &&
        (Math.pow((Math.abs(nx) - EYE.x) / EYE.rx, 2) + Math.pow((ny - EYE.y) / EYE.ry, 2) < 1);
      inEye.push(eye);
    }
  }

  const idx = [];
  const row = segU + 1;
  for (let iv = 0; iv < segV; iv++) for (let iu = 0; iu < segU; iu++) {
    const a = iv * row + iu, b = a + 1, c = a + row, d2 = c + 1;
    if (inEye[a] || inEye[b] || inEye[c] || inEye[d2]) continue;
    idx.push(a, c, b, b, c, d2);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** A complete floating mask, with the faint inner glow the plates imply. */
export function faceMask(opt = {}) {
  const { size = 1.6, mat = M.pcb, detail = 1, hot = false } = opt;
  const grp = new THREE.Group();
  const g = shared(`mask${detail}${opt.sleeping ? 'S' : ''}`, () => faceMaskGeometry({
    segU: detail > 0.5 ? 52 : 26, segV: detail > 0.5 ? 44 : 22, sleeping: !!opt.sleeping,
  }));
  const m = new THREE.Mesh(g, hot ? M.pcbHot : mat);
  m.castShadow = true; m.receiveShadow = true;
  m.scale.setScalar(size);
  grp.add(m);
  grp.userData.shell = m;

  // eye-socket embers: two small glows that sit just inside the holes
  const eg = shared('eyeglow', () => new THREE.PlaneGeometry(1, 1));
  const eyeMat = new THREE.MeshBasicMaterial({
    map: T.glow, color: hot ? 0xff5a3c : 0x6effc8, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.0,
  });
  const eyes = [];
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(eg, eyeMat);
    e.position.set(s * 0.335 * 0.72 * size, 0.155 * size, 0.72 * size);
    e.scale.setScalar(size * 0.42);
    grp.add(e);
    eyes.push(e);
  }
  grp.userData.eyes = eyes;
  grp.userData.eyeMat = eyeMat;
  grp.userData.radius = size * 0.9;
  return grp;
}

/* ================================================ THE SLEEPING SUN */

/**
 * Plate 2's left-hand column: a bronze sun with a serene, closed-eyed face,
 * inside a corona of alternating straight and flame-shaped rays.
 */
export function sunRelief(opt = {}) {
  const { r = 1.5, rays = 16, detail = 1 } = opt;
  const grp = new THREE.Group();

  const disc = new THREE.Mesh(
    shared('sundisc' + r, () => lathe([
      [0, -0.16], [r * 0.86, -0.16], [r * 0.97, -0.10],
      [r * 1.0, 0.02], [r * 0.94, 0.10], [r * 0.80, 0.12], [0, 0.12],
    ], 40)), M.bronze);
  disc.rotation.x = Math.PI / 2;
  disc.castShadow = true; disc.receiveShadow = true;
  grp.add(disc);

  // the face itself, in shallow relief, lit as in the plate
  const faceG = shared('sunface', () => faceMaskGeometry({
    segU: 40, segV: 34, sleeping: true, eyeHoles: false, intensity: 1.15,
  }));
  const face = new THREE.Mesh(faceG, M.sunFace);
  face.scale.set(r * 0.80, r * 0.80, r * 0.34);
  face.position.z = 0.06;
  face.castShadow = true;
  grp.add(face);

  // corona
  const straight = shared('sunray', () => {
    const g = new THREE.ConeGeometry(0.16, 1, 4, 1);
    g.rotateX(Math.PI / 2);
    g.scale(1, 0.34, 1);
    return g;
  });
  const flame = shared('sunflame', () => {
    const s = new THREE.Shape();
    s.moveTo(-0.15, 0);
    s.quadraticCurveTo(-0.22, 0.42, -0.04, 0.98);
    s.quadraticCurveTo(0.10, 0.55, 0.16, 0.28);
    s.quadraticCurveTo(0.16, 0.08, 0.15, 0);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.10, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1, curveSegments: 5 });
    g.center();
    return g;
  });
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * TAU;
    const long = i % 2 === 0;
    const len = r * (long ? 0.86 : 0.60);
    const m = new THREE.Mesh(long ? straight : flame, M.bronze);
    const rad = r * 0.88 + len * 0.5;
    m.position.set(Math.cos(a) * rad, Math.sin(a) * rad, 0);
    m.rotation.z = a - Math.PI / 2;
    if (long) { m.scale.set(1, 1, len); m.rotation.x = Math.PI / 2; m.rotation.order = 'ZXY'; }
    else m.scale.set(len * 1.1, len * 1.1, 1);
    m.castShadow = true;
    grp.add(m);
  }
  grp.userData.radius = r * 1.85;
  return grp;
}

/* ================================================ THE MOON AND CLOCK */

/**
 * Plate 2's right-hand column: a crescent moon with a runic dial hung in
 * front of it, and four hands instead of two.
 */
export function moonClock(opt = {}) {
  const { r = 1.35, hands = 4 } = opt;
  const grp = new THREE.Group();

  // crescent: an outer disc with a second disc bitten out of it
  const crescent = shared('crescent' + r, () => {
    const R = r * 1.28, off = R * 0.44, R2 = R * 0.94;
    const s = new THREE.Shape();
    s.absarc(0, 0, R, -Math.PI * 0.42, Math.PI * 0.42, false);
    s.absarc(off, 0, R2, Math.PI * 0.40, -Math.PI * 0.40, true);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, {
      depth: 0.22, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05,
      bevelSegments: 2, curveSegments: 32 });
    g.center();
    return g;
  });
  const moon = new THREE.Mesh(crescent, M.moon);
  moon.rotation.z = Math.PI * 0.62;            // horns up-left, as in the plate
  moon.position.set(-r * 0.16, r * 0.60, -0.30);
  moon.castShadow = true;
  grp.add(moon);
  // full lunar disc behind, barely catching the light
  const dark = new THREE.Mesh(
    shared('moondisc' + r, () => new THREE.CylinderGeometry(r * 1.06, r * 1.06, 0.14, 40)),
    new THREE.MeshPhongMaterial({ color: 0x2c2f38, specular: 0x555a68, shininess: 12 }));
  dark.rotation.x = Math.PI / 2;
  dark.position.set(-r * 0.16, r * 0.60, -0.42);
  grp.add(dark);

  // dial
  const dialG = shared('dial' + r, () => new THREE.CylinderGeometry(r, r, 0.13, 48));
  const dial = new THREE.Mesh(dialG, [M.brass, M.runicDial, M.runicDial]);
  // CylinderGeometry uses [side, top, bottom]; map the runic face onto the top
  dial.rotation.x = -Math.PI / 2;
  dial.castShadow = true;
  grp.add(dial);
  const rim = new THREE.Mesh(
    shared('dialrim' + r, () => new THREE.TorusGeometry(r * 1.0, 0.055, 8, 48)), M.gold);
  rim.position.z = 0.02;
  grp.add(rim);

  // hands — four of them, running at four different rates
  const handG = (len, w) => {
    const s = new THREE.Shape();
    s.moveTo(-w, -len * 0.16);
    s.lineTo(-w * 0.45, len);
    s.lineTo(0, len * 1.06);
    s.lineTo(w * 0.45, len);
    s.lineTo(w, -len * 0.16);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.035, bevelEnabled: false });
    return g;
  };
  const handSet = [];
  const lens = [r * 0.86, r * 0.62, r * 0.74, r * 0.44];
  for (let i = 0; i < hands; i++) {
    const h = new THREE.Mesh(handG(lens[i % lens.length], 0.045 - i * 0.006), M.goldDark);
    h.position.z = 0.085 + i * 0.022;
    h.rotation.z = -(i / hands) * TAU;
    grp.add(h);
    handSet.push(h);
  }
  const hub = new THREE.Mesh(shared('hub', () => new THREE.CylinderGeometry(0.10, 0.12, 0.20, 16)), M.gold);
  hub.rotation.x = Math.PI / 2;
  hub.position.z = 0.16;
  grp.add(hub);

  grp.userData.hands = handSet;
  grp.userData.radius = r * 1.6;
  return grp;
}

/** The freestanding clock face used on walls and the Great Clock. */
export function clockFace(opt = {}) {
  const { r = 1.0, dial = M.romanDial, rimMat = M.gold, hands = 2 } = opt;
  const grp = new THREE.Group();
  const body = new THREE.Mesh(
    shared('cf' + r, () => new THREE.CylinderGeometry(r, r, 0.12, 44)), [rimMat, dial, dial]);
  body.rotation.x = -Math.PI / 2;
  grp.add(body);
  const rim = new THREE.Mesh(
    shared('cfr' + r, () => new THREE.TorusGeometry(r, 0.05, 8, 44)), rimMat);
  rim.position.z = 0.02;
  grp.add(rim);
  const hs = [];
  const lens = [r * 0.58, r * 0.84, r * 0.90];
  for (let i = 0; i < hands; i++) {
    const s = new THREE.Shape();
    const len = lens[i], w = 0.05 - i * 0.014;
    s.moveTo(-w, -len * 0.18); s.lineTo(-w * 0.4, len);
    s.lineTo(0, len * 1.05); s.lineTo(w * 0.4, len); s.lineTo(w, -len * 0.18); s.closePath();
    const h = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false }), M.black);
    h.position.z = 0.07 + i * 0.02;
    grp.add(h); hs.push(h);
  }
  const hub = new THREE.Mesh(shared('cfhub', () => new THREE.CylinderGeometry(0.055, 0.06, 0.14, 12)), rimMat);
  hub.rotation.x = Math.PI / 2; hub.position.z = 0.12;
  grp.add(hub);
  grp.userData.hands = hs;
  return grp;
}

/* ============================================================= EARTH */

export function globe(opt = {}) {
  const { r = 1.6, clouds = true, detail = 1 } = opt;
  const grp = new THREE.Group();
  const seg = detail > 0.5 ? 48 : 24;
  const earth = new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg / 2), M.earth);
  earth.castShadow = true; earth.receiveShadow = true;
  grp.add(earth);
  if (clouds) {
    const cl = new THREE.Mesh(new THREE.SphereGeometry(r * 1.012, seg, seg / 2), M.earthClouds);
    grp.add(cl);
    grp.userData.clouds = cl;
  }
  // thin atmospheric rim
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(r * 1.05, seg, seg / 2),
    new THREE.MeshBasicMaterial({
      color: 0x6aa8ff, transparent: true, opacity: 0.10,
      side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  grp.add(atmo);
  grp.userData.earth = earth;
  grp.userData.radius = r;
  return grp;
}

/* ======================================================= THE TERMINAL */

/**
 * The beige box from plate 1: a desktop-form-factor case, a CRT running the
 * Venus, and a keyboard. The screen gets a live render target later so the
 * terminal can actually display text.
 */
export function terminal(opt = {}) {
  const { scale = 1 } = opt;
  const grp = new THREE.Group();

  // --- desktop case ---
  const caseW = 1.05, caseH = 0.28, caseD = 0.78;
  const box = new THREE.Mesh(new THREE.BoxGeometry(caseW, caseH, caseD), M.beige);
  box.position.y = caseH / 2;
  box.castShadow = true; box.receiveShadow = true;
  grp.add(box);
  // front bezel details: floppy slot, drive bay, badge, vents
  const front = new THREE.Group();
  front.position.set(0, caseH / 2, caseD / 2 + 0.002);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.035, 0.01), M.plasticDark);
  slot.position.set(-0.22, 0.03, 0); front.add(slot);
  const bay = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.075, 0.01), M.beigeFlat);
  bay.position.set(0.22, 0.02, 0); front.add(bay);
  const led = new THREE.Mesh(new THREE.CircleGeometry(0.012, 8),
    new THREE.MeshBasicMaterial({ color: 0x5aff8a }));
  led.position.set(0.44, -0.06, 0.004); front.add(led);
  for (let i = 0; i < 7; i++) {
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.008, 0.008), M.plasticDark);
    v.position.set(-0.20, -0.05 - i * 0.014, 0.002);
    front.add(v);
  }
  grp.add(front);
  grp.userData.powerLed = led;

  // --- CRT monitor ---
  const mon = new THREE.Group();
  mon.position.y = caseH + 0.02;
  const mw = 0.80, mh = 0.72, md = 0.70;
  const shellG = new THREE.BoxGeometry(mw, mh, md);
  // taper the back of the shell into the classic CRT wedge
  {
    const p = shellG.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i);
      if (z < 0) { p.setX(i, p.getX(i) * 0.62); p.setY(i, p.getY(i) * 0.66 - mh * 0.05); }
    }
    shellG.computeVertexNormals();
  }
  const shell = new THREE.Mesh(shellG, M.beige);
  shell.position.y = mh / 2;
  shell.castShadow = true; shell.receiveShadow = true;
  mon.add(shell);

  // bezel + glass
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(mw * 0.96, mh * 0.78, 0.03), M.beigeFlat);
  bezel.position.set(0, mh * 0.56, md / 2 + 0.005);
  mon.add(bezel);

  const screenW = mw * 0.74, screenH = mh * 0.56;
  const screenG = new THREE.PlaneGeometry(screenW, screenH, 12, 12);
  {
    // bulge the glass: a 2003 CRT is not flat
    const p = screenG.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) / (screenW / 2), y = p.getY(i) / (screenH / 2);
      p.setZ(i, (1 - x * x * 0.5 - y * y * 0.5) * 0.035);
    }
    screenG.computeVertexNormals();
  }
  const screenMat = new THREE.MeshBasicMaterial({ map: T.venus, toneMapped: false });
  const screen = new THREE.Mesh(screenG, screenMat);
  screen.position.set(0, mh * 0.56, md / 2 + 0.022);
  mon.add(screen);
  grp.userData.screen = screen;
  grp.userData.screenMat = screenMat;

  // phosphor mask laid over the image
  const mask = new THREE.Mesh(screenG.clone(), new THREE.MeshBasicMaterial({
    map: T.phosphor, transparent: true, opacity: 0.30, blending: THREE.MultiplyBlending,
    premultipliedAlpha: true, depthWrite: false }));
  mask.position.set(0, mh * 0.56, md / 2 + 0.024);
  mask.scale.setScalar(1.001);
  mon.add(mask);
  if (T.phosphor) { T.phosphor.wrapS = T.phosphor.wrapT = THREE.RepeatWrapping; T.phosphor.repeat.set(48, 40); }

  // the glow the screen throws into the room
  const bloom = new THREE.Mesh(new THREE.PlaneGeometry(screenW * 2.4, screenH * 2.4),
    new THREE.MeshBasicMaterial({ map: T.glow, color: 0xbfe0ff, transparent: true,
      opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
  bloom.position.set(0, mh * 0.56, md / 2 + 0.10);
  mon.add(bloom);
  grp.userData.screenBloom = bloom;

  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.24, 0.05, 16), M.beige);
  stand.position.y = 0.02;
  mon.add(stand);
  grp.add(mon);
  grp.userData.monitor = mon;

  // --- keyboard ---
  const kb = new THREE.Group();
  kb.position.set(0, 0.02, caseD / 2 + 0.44);
  const kbody = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.045, 0.32), M.beige);
  kbody.rotation.x = -0.06;
  kbody.castShadow = true; kbody.receiveShadow = true;
  kb.add(kbody);
  const keyG = shared('keycap', () => new THREE.BoxGeometry(0.032, 0.014, 0.032));
  for (let r = 0; r < 5; r++) {
    const cols = r === 4 ? 9 : 20;
    for (let c = 0; c < cols; c++) {
      const k = new THREE.Mesh(keyG, M.beigeFlat);
      const w = r === 4 ? 0.055 : 0.040;
      k.position.set(-0.38 + c * w + (r === 4 ? 0.1 : 0), 0.032, -0.11 + r * 0.052);
      if (r === 4 && c === 4) k.scale.x = 5;
      k.rotation.x = -0.06;
      kb.add(k);
    }
  }
  const cable = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.03, -0.16), new THREE.Vector3(0.05, 0.02, -0.28),
      new THREE.Vector3(-0.02, 0.02, -0.40), new THREE.Vector3(0, 0.03, -0.46),
    ]), 20, 0.010, 5, false), M.plasticDark);
  kb.add(cable);
  grp.add(kb);

  grp.scale.setScalar(scale);
  grp.userData.box = { w: caseW * scale, h: (caseH + 0.72) * scale, d: caseD * scale };
  return grp;
}

/* ====================================================== TIMEPIECES */

/** The longcase clock of plate 4: walnut, brass, a swinging pendulum. */
export function grandfatherClock(opt = {}) {
  const { h = 2.55 } = opt;
  const grp = new THREE.Group();
  const w = 0.56, d = 0.34;

  const plinth = new THREE.Mesh(new THREE.BoxGeometry(w * 1.12, h * 0.16, d * 1.16), M.woodDark);
  plinth.position.y = h * 0.08;
  plinth.castShadow = plinth.receiveShadow = true;
  grp.add(plinth);
  const plinthCap = new THREE.Mesh(new THREE.BoxGeometry(w * 1.18, h * 0.02, d * 1.22), M.wood);
  plinthCap.position.y = h * 0.165;
  grp.add(plinthCap);

  // waist, with a glazed door
  const waist = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.50, d), M.wood);
  waist.position.y = h * 0.42;
  waist.castShadow = waist.receiveShadow = true;
  grp.add(waist);
  const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(w * 0.72, h * 0.38, 0.02), M.woodDark);
  doorFrame.position.set(0, h * 0.42, d / 2 + 0.005);
  grp.add(doorFrame);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.60, h * 0.32), M.glass);
  glass.position.set(0, h * 0.42, d / 2 + 0.018);
  grp.add(glass);

  // pendulum, visible through the glass
  const pend = new THREE.Group();
  pend.position.set(0, h * 0.60, d * 0.16);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, h * 0.32, 6), M.brass);
  rod.position.y = -h * 0.16;
  pend.add(rod);
  const bob = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.022, 20), M.gold);
  bob.rotation.x = Math.PI / 2;
  bob.position.y = -h * 0.31;
  pend.add(bob);
  grp.add(pend);
  grp.userData.pendulum = pend;

  // driving weights
  const weights = [];
  for (const s of [-1, 1]) {
    const wt = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.20, 12), M.brass);
    wt.position.set(s * 0.13, h * 0.56, -0.02);
    grp.add(wt);
    weights.push(wt);
  }
  grp.userData.weights = weights;

  // hood
  const hood = new THREE.Mesh(new THREE.BoxGeometry(w * 1.16, h * 0.26, d * 1.10), M.wood);
  hood.position.y = h * 0.80;
  hood.castShadow = hood.receiveShadow = true;
  grp.add(hood);
  for (const s of [-1, 1]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, h * 0.24, 10), M.woodDark);
    col.position.set(s * w * 0.55, h * 0.80, d * 0.52);
    grp.add(col);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.040, 0.030, 0.03, 10), M.gold);
    cap.position.set(s * w * 0.55, h * 0.92, d * 0.52);
    grp.add(cap);
  }

  const face = clockFace({ r: w * 0.40, dial: M.clockDial, rimMat: M.gold, hands: 2 });
  face.position.set(0, h * 0.82, d * 0.56);
  grp.add(face);
  grp.userData.face = face;

  // swan-neck pediment
  const ped = new THREE.Group();
  ped.position.y = h * 0.93;
  for (const s of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(s * w * 0.60, 0, d * 0.5),
      new THREE.Vector3(s * w * 0.46, h * 0.045, d * 0.5),
      new THREE.Vector3(s * w * 0.20, h * 0.075, d * 0.5),
      new THREE.Vector3(s * w * 0.06, h * 0.055, d * 0.5),
    ]);
    const sw = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.028, 6, false), M.woodDark);
    ped.add(sw);
  }
  const finial = new THREE.Mesh(lathe([
    [0.045, 0], [0.05, 0.02], [0.028, 0.05], [0.045, 0.09],
    [0.03, 0.13], [0.012, 0.17], [0.0, 0.19]], 12), M.gold);
  finial.position.y = h * 0.055;
  ped.add(finial);
  grp.add(ped);

  const cornice2 = new THREE.Mesh(new THREE.BoxGeometry(w * 1.24, 0.04, d * 1.18), M.woodDark);
  cornice2.position.y = h * 0.928;
  grp.add(cornice2);

  grp.userData.box = { w: w * 1.2, h, d: d * 1.2 };
  grp.userData.height = h;
  return grp;
}

/** Brass-framed hourglass with a live sand stream. */
export function hourglass(opt = {}) {
  const { h = 1.9, r = 0.42 } = opt;
  const grp = new THREE.Group();
  const plateG = new THREE.CylinderGeometry(r * 1.15, r * 1.15, 0.07, 24);
  const bot = new THREE.Mesh(plateG, M.brass);
  bot.position.y = 0.035; bot.castShadow = true; grp.add(bot);
  const top = new THREE.Mesh(plateG, M.brass);
  top.position.y = h - 0.035; top.castShadow = true; grp.add(top);

  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    const post = new THREE.Mesh(lathe([
      [0.030, 0], [0.042, 0.05], [0.030, 0.12], [0.030, h * 0.42],
      [0.046, h * 0.5], [0.030, h * 0.58], [0.030, h - 0.12],
      [0.042, h - 0.05], [0.030, h],
    ], 10), M.brass);
    post.position.set(Math.cos(a) * r * 0.98, 0, Math.sin(a) * r * 0.98);
    post.castShadow = true;
    grp.add(post);
  }

  // the two glass bulbs, meeting at a waist
  const bulb = (flip) => {
    const prof = [];
    const N = 22;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const y = t * (h / 2 - 0.09);
      // narrow at the neck (t=0), wide at the plate (t=1)
      const rr = r * (0.055 + 0.88 * Math.pow(t, 0.62));
      prof.push([rr, flip ? -y : y]);
    }
    if (flip) prof.reverse();
    return lathe(prof, 28);
  };
  const gTop = new THREE.Mesh(bulb(false), M.glass);
  gTop.position.y = h / 2 + 0.02;
  grp.add(gTop);
  const gBot = new THREE.Mesh(bulb(true), M.glass);
  gBot.position.y = h / 2 - 0.02;
  grp.add(gBot);

  // sand: two cones whose heights we animate
  const sandMat = new THREE.MeshPhongMaterial({ color: 0xd9c07a, specular: 0x8a7a44, shininess: 20 });
  const sandTop = new THREE.Mesh(new THREE.ConeGeometry(r * 0.80, 0.42, 20), sandMat);
  sandTop.position.y = h * 0.72;
  grp.add(sandTop);
  const sandBot = new THREE.Mesh(new THREE.ConeGeometry(r * 0.62, 0.24, 20), sandMat);
  sandBot.position.y = h * 0.15;
  grp.add(sandBot);
  const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, h * 0.44, 6),
    new THREE.MeshBasicMaterial({ color: 0xe8d49a, transparent: true, opacity: 0.7 }));
  stream.position.y = h * 0.34;
  grp.add(stream);

  grp.userData.sandTop = sandTop;
  grp.userData.sandBot = sandBot;
  grp.userData.stream = stream;
  grp.userData.height = h;
  grp.userData.box = { w: r * 2.4, h, d: r * 2.4 };
  return grp;
}

/**
 * The floor sundial of plate 4: a gold ring inlaid flush with the marble,
 * a raised triangular gnomon, and a shadow that actually tracks the hour.
 */
export function sundial(opt = {}) {
  const { r = 3.2 } = opt;
  const grp = new THREE.Group();

  const ringMat = M.gold;
  const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.72, r, 64, 1), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.012;
  grp.add(ring);
  const inner = new THREE.Mesh(new THREE.RingGeometry(r * 0.20, r * 0.24, 48, 1), ringMat);
  inner.rotation.x = -Math.PI / 2;
  inner.position.y = 0.012;
  grp.add(inner);

  // hour marks
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const len = r * 0.16, wdt = i % 3 === 0 ? 0.11 : 0.055;
    const m = new THREE.Mesh(new THREE.BoxGeometry(wdt, 0.016, len), ringMat);
    m.position.set(Math.cos(a) * r * 0.80, 0.014, Math.sin(a) * r * 0.80);
    m.rotation.y = -a;
    grp.add(m);
  }
  // the numeral band, drawn as a texture on a flat annulus
  const band = new THREE.Mesh(new THREE.CircleGeometry(r * 0.70, 64), new THREE.MeshBasicMaterial({
    map: T.romanDial, transparent: true, opacity: 0.55, depthWrite: false, color: 0xd9b45a }));
  band.rotation.x = -Math.PI / 2;
  band.position.y = 0.008;
  grp.add(band);

  // gnomon: a right triangle standing on the noon line
  const gs = new THREE.Shape();
  gs.moveTo(-r * 0.62, 0); gs.lineTo(r * 0.30, 0); gs.lineTo(-r * 0.62, r * 0.66); gs.closePath();
  const gn = new THREE.Mesh(new THREE.ExtrudeGeometry(gs, {
    depth: 0.07, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 1 }), M.goldDark);
  gn.rotation.y = Math.PI / 2;
  gn.position.set(0, 0.01, 0);
  gn.castShadow = true;
  grp.add(gn);
  grp.userData.gnomon = gn;

  // the cast shadow, driven by the Great Clock rather than by any sun
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(r * 0.14, r * 1.6),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.34, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, 0.02, -r * 0.8);
  const shadowPivot = new THREE.Group();
  shadowPivot.add(shadow);
  shadowPivot.position.y = 0.004;
  grp.add(shadowPivot);
  grp.userData.shadow = shadowPivot;
  grp.userData.radius = r;
  return grp;
}

/** The golden key from plate 2. */
export function goldenKey(opt = {}) {
  const { len = 0.62 } = opt;
  const grp = new THREE.Group();
  const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, len, 10), M.gold);
  shank.rotation.z = Math.PI / 2;
  grp.add(shank);
  // bow: an ornate ring with two lobes
  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.026, 8, 22), M.gold);
  bow.position.x = -len / 2 - 0.09;
  bow.rotation.y = Math.PI / 2;
  grp.add(bow);
  for (const s of [-1, 1]) {
    const lobe = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.018, 6, 14), M.gold);
    lobe.position.set(-len / 2 - 0.09, s * 0.13, 0);
    lobe.rotation.y = Math.PI / 2;
    grp.add(lobe);
  }
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.035, 10), M.gold);
  collar.rotation.z = Math.PI / 2;
  collar.position.x = -len / 2 + 0.06;
  grp.add(collar);
  // bit / wards
  const bit = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.14, 0.028), M.gold);
  bit.position.set(len / 2 - 0.06, -0.07, 0);
  grp.add(bit);
  for (let i = 0; i < 3; i++) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.06, 0.03), M.gold);
    w.position.set(len / 2 - 0.10 + i * 0.032, -0.13, 0);
    grp.add(w);
  }
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), M.gold);
  tip.position.x = len / 2 + 0.01;
  grp.add(tip);
  grp.userData.radius = len * 0.6;
  return grp;
}

/** A toppled column stub, as in the lower-right of plate 2. */
export function brokenColumn(opt = {}) {
  const { r = 0.42, h = 0.75, style = 'rose' } = opt;
  const grp = new THREE.Group();
  const g = new THREE.CylinderGeometry(r * 0.94, r, h, 20, 3);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y > h * 0.35) {
      // jag the fracture
      const x = p.getX(i), z = p.getZ(i);
      const a = Math.atan2(z, x);
      const n = Math.sin(a * 5.3) * 0.5 + Math.sin(a * 11.7 + 1.3) * 0.3 + Math.sin(a * 3.1) * 0.2;
      p.setY(i, y + n * h * 0.22 - h * 0.05);
    }
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, style === 'rose' ? M.marbleRose : M.marbleCream);
  m.position.y = h / 2;
  m.castShadow = m.receiveShadow = true;
  grp.add(m);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.3, r * 1.35, 0.12, 20), M.marbleGrey);
  base.position.y = 0.06;
  base.castShadow = base.receiveShadow = true;
  grp.add(base);
  grp.userData.collider = { r: r * 1.35, h: h * 1.05 };
  return grp;
}

/* ============================================================ PLANTS */

/** A white urn — the ones lining the temple plaza. */
export function urn(opt = {}) {
  const { h = 0.62, r = 0.32, mat = M.marbleWhite, style = 'urn' } = opt;
  const prof = style === 'urn' ? [
    [r * 0.60, 0], [r * 0.66, 0.03], [r * 0.52, 0.07],
    [r * 0.72, 0.16], [r * 0.92, 0.34], [r * 1.0, 0.55],
    [r * 0.96, 0.78], [r * 0.88, 0.90], [r * 1.02, 0.96], [r * 1.04, 1.0],
    [r * 0.94, 1.0], [r * 0.86, 0.55], [r * 0.60, 0.10], [0, 0.06],
  ] : [
    [r * 0.62, 0], [r * 0.68, 0.04], [r * 0.66, 0.10],
    [r * 0.88, 0.72], [r * 0.98, 0.94], [r * 1.02, 1.0],
    [r * 0.92, 1.0], [r * 0.80, 0.72], [r * 0.56, 0.08], [0, 0.05],
  ];
  const g = lathe(prof.map(([rr, y]) => [rr, y * h]), 26);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = m.receiveShadow = true;
  const grp = new THREE.Group();
  grp.add(m);
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.86, r * 0.80, 0.05, 18), M.soil);
  soil.position.y = h * 0.94;
  grp.add(soil);
  grp.userData.rimY = h;
  grp.userData.collider = { r: r * 1.05, h };
  return grp;
}

/** Potted palm — trunk plus a crown of drooping pinnate fronds. */
export function palmPlant(opt = {}) {
  const {
    height = 2.4, fronds = 11, kind = 'palm', seed = 1,
    trunkR = 0.075, lean = 0.06,
  } = opt;
  const grp = new THREE.Group();
  let s = seed * 7919 + 13;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };

  if (kind !== 'fern') {
    const pts = [];
    const N = 10;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      pts.push(new THREE.Vector3(
        Math.sin(t * 2.1 + seed) * lean * height * t,
        t * height,
        Math.cos(t * 1.7 + seed) * lean * height * t * 0.6));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const trunk = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 12, trunkR, 8, false), M.bark);
    trunk.castShadow = true;
    grp.add(trunk);
    // ring scars up the trunk
    for (let i = 1; i < 8; i++) {
      const t = i / 8;
      const p = curve.getPointAt(t);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(trunkR * 1.15, trunkR * 0.22, 5, 10), M.bark);
      ring.position.copy(p);
      ring.rotation.x = Math.PI / 2;
      grp.add(ring);
    }
    grp.userData.top = curve.getPointAt(1);
  } else {
    grp.userData.top = new THREE.Vector3(0, 0.05, 0);
  }

  const top = grp.userData.top;
  const frondG = shared('frondquad', () => {
    const g = new THREE.PlaneGeometry(1, 1, 6, 3);
    // droop the far end of the quad so fronds arch instead of standing flat
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + 0.5;
      p.setZ(i, -Math.pow(Math.max(0, x), 2.3) * 0.34);
    }
    g.computeVertexNormals();
    return g;
  });
  const mat = kind === 'fan' ? M.fan : kind === 'fern' ? M.fern : M.palm;
  const scale = kind === 'fern' ? height * 1.7 : height * 1.05;
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * TAU + rnd() * 0.4;
    const droop = kind === 'fern' ? -0.15 : (0.15 + rnd() * 0.75);
    const f = new THREE.Mesh(frondG, mat);
    f.position.copy(top);
    f.scale.set(scale * (0.85 + rnd() * 0.4), scale * (0.80 + rnd() * 0.35), scale * 0.5);
    f.rotation.order = 'YXZ';
    f.rotation.y = a;
    f.rotation.z = -droop;
    f.rotation.x = -Math.PI / 2 + (rnd() - 0.5) * 0.3;
    f.position.y += kind === 'fern' ? 0 : 0.02;
    f.userData.sway = rnd() * TAU;
    f.userData.baseRotZ = f.rotation.z;
    f.castShadow = true;
    grp.add(f);
  }
  grp.userData.height = height;
  grp.userData.collider = { r: 0.18, h: height };
  return grp;
}

/** Palm in an urn — the exact pairing from plate 1. */
export function pottedPalm(opt = {}) {
  const { potH = 0.62, potR = 0.32, kind = 'palm', height = 2.2, seed = 1, potStyle = 'urn' } = opt;
  const grp = new THREE.Group();
  const pot = urn({ h: potH, r: potR, style: potStyle });
  grp.add(pot);
  const plant = palmPlant({ height, kind, seed, fronds: kind === 'fern' ? 16 : 14 });
  plant.position.y = potH * 0.92;
  grp.add(plant);
  grp.userData.collider = { r: potR * 1.1, h: potH };
  grp.userData.plant = plant;
  return grp;
}

/* ======================================================= CHRONOLITHS */

/**
 * The destructible time-crystals: a floating faceted shard inside a slowly
 * counter-rotating brass armature.
 */
export function chronolith(opt = {}) {
  const { r = 0.55, colour = 0x8fe8ff } = opt;
  const grp = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(r, 1),
    new THREE.MeshPhongMaterial({ color: colour, emissive: colour, emissiveIntensity: 0.5,
      specular: 0xffffff, shininess: 200, transparent: true, opacity: 0.82, flatShading: true }));
  grp.add(core);
  grp.userData.core = core;

  const rings = [];
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.5, r * 0.05, 6, 30), M.brass);
    ring.rotation.set(i * 1.1, i * 0.7, i * 0.4);
    grp.add(ring);
    rings.push(ring);
  }
  grp.userData.rings = rings;

  const halo = new THREE.Mesh(new THREE.PlaneGeometry(r * 6, r * 6),
    new THREE.MeshBasicMaterial({ map: T.glow, color: colour, transparent: true,
      opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }));
  grp.add(halo);
  grp.userData.halo = halo;
  grp.userData.radius = r * 1.5;
  return grp;
}

/** A floating rune slab — the level's readable lore/signage. */
export function runeSlab(opt = {}) {
  const { w = 1.4, h = 2.0, mat = M.marbleGrey } = opt;
  const grp = new THREE.Group();
  const slab = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.16), mat);
  slab.castShadow = slab.receiveShadow = true;
  grp.add(slab);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, w * 0.8),
    new THREE.MeshBasicMaterial({ map: T.runicDial, transparent: true, opacity: 0.7, depthWrite: false }));
  face.position.set(0, h * 0.16, 0.085);
  grp.add(face);
  return grp;
}

export { pedestal };
