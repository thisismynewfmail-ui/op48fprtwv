/* SILICONE DREAMS — SECTION E: THE CORTEX ENGINE
 *
 * Plate 1, at the scale of a cathedral. A brain the size of a hill, hanging
 * in a black void inside its own red corona, with retro electronics grafted
 * straight into the meat: ribbed insulator stacks throwing arcs, twin
 * vacuum tubes burning orange, a hazard-striped ACCESS panel, banks of red
 * resistors, a row of coloured lamps, a rainbow ribbon, coiled cords, a
 * speaker cone, a copper porthole — and a red LED timer that reads 0123 and
 * says REC ON, which is the only clock in the level that is telling the
 * truth.
 *
 * The brain itself is sculpture. You cross it on what has been bolted to it:
 * membrane catwalks along the gyri, surgical staples bridging the sulci, and
 * the hardware's own casings. That keeps collision to honest boxes and makes
 * the route legible, which open terrain never is.
 */
import * as THREE from 'three';
import { M, T } from './Materials.js';
import { lathe, shared } from './Arch.js';
import { box, cyl, sphere, LAYER } from './Physics.js';
import { rand, clamp, lerp } from '../core/Time.js';
import { bakeStatic, keepDynamic } from './Batch.js';

const TAU = Math.PI * 2;

export const CORTEX = { x: 0, y: 0, z: 980 };

const metal = (c, spec = 0xffffff, sh = 160) =>
  new THREE.MeshPhongMaterial({ color: c, specular: spec, shininess: sh });

/* ====================================================== THE BRAIN MASS */

/**
 * The hemisphere. A displaced dome: broad gyral folds, a hard longitudinal
 * fissure down the midline, and a flat underside where it has been sat down
 * on nothing at all.
 */
function hemisphere(opt = {}) {
  const { R = 46, side = 1, detail = 72, chill = false } = opt;
  const geo = new THREE.SphereGeometry(1, detail, Math.round(detail * 0.55), 0, TAU, 0, Math.PI * 0.62);
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = v.clone().normalize();
    const { x, y, z } = n;
    const fold =
      Math.sin(x * 6.0 + z * 2.5) * 0.085 +
      Math.sin(z * 7.0 + y * 3.0) * 0.078 +
      Math.sin(x * 4.0 + z * 5.5) * 0.070 +
      Math.sin(x * 11.0) * Math.sin(z * 9.0) * 0.048 +
      Math.sin(x * 17.0 + z * 13.0) * 0.022;
    // the medial wall: the hemisphere is cut flat where it meets its twin
    const medial = Math.exp(-Math.pow(Math.max(0, side * -x) * 4.0, 2)) * 0.0;
    const r = 1 + fold - medial;
    v.set(n.x * r * 0.92, n.y * r, n.z * r * 1.06).multiplyScalar(R);
    // flatten the base
    if (v.y < 0) v.y *= 0.25;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, chill ? M.cortexChill : M.cortexFlesh);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/* ======================================================== THE HARDWARE */

/** Ribbed ceramic insulator stack. Arcs on a cycle; the arc is a hazard. */
export function teslaPylon(opt = {}) {
  const { h = 9, r = 1.5 } = opt;
  const g = new THREE.Group();
  const prof = [];
  const ribs = 7;
  for (let i = 0; i <= ribs; i++) {
    const t = i / ribs;
    prof.push([r * 0.62, t * h * 0.94]);
    prof.push([r * (i === ribs ? 0.7 : 1.0), t * h * 0.94 + h * 0.045]);
  }
  prof.push([r * 0.30, h * 0.99]);
  prof.push([0, h]);
  const stack = new THREE.Mesh(lathe(prof, 28), M.insulator);
  stack.castShadow = true;
  g.add(stack);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.25, r * 1.45, h * 0.09, 20), metal(0x2a2c34, 0x8892a0, 70));
  base.position.y = h * 0.045;
  g.add(base);
  const term = new THREE.Mesh(new THREE.SphereGeometry(r * 0.42, 18, 12), metal(0xe0dcec, 0xffffff, 250));
  term.position.y = h + r * 0.2;
  g.add(term);
  const light = new THREE.PointLight(0x9fd8ff, 0, 26, 2);
  light.position.y = h + r * 0.4;
  g.add(light);

  // the arc: a jagged strip that is rebuilt each discharge
  const arcGeo = new THREE.BufferGeometry();
  const SEGS = 14;
  arcGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SEGS + 1) * 3), 3));
  const arc = new THREE.Line(arcGeo, new THREE.LineBasicMaterial({
    color: 0xcfe8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  arc.frustumCulled = false;
  g.add(arc);

  g.userData = { light, arc, term, h, r, SEGS, timer: rand(0, 3), firing: 0 };
  return g;
}

/** Twin triodes, glass and orange filament, as on the plate's right side. */
export function tubeTower(opt = {}) {
  const { h = 7, r = 1.15, count = 2 } = opt;
  const g = new THREE.Group();
  const glows = [];
  for (let i = 0; i < count; i++) {
    const t = new THREE.Group();
    t.position.set((i - (count - 1) / 2) * r * 2.5, 0, 0);
    t.rotation.z = (i - (count - 1) / 2) * 0.10;
    const glass = new THREE.Mesh(lathe([
      [0, 0], [r * 0.86, h * 0.02], [r, h * 0.10], [r, h * 0.74],
      [r * 0.88, h * 0.86], [r * 0.5, h * 0.94], [r * 0.24, h * 0.99], [0, h],
    ], 24), M.tubeGlass);
    t.add(glass);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r * 0.92, h * 0.12, 20),
      metal(0x24262c, 0x8892a0, 60));
    base.position.y = h * 0.06;
    t.add(base);
    // internal plate structure, so the glass has something to contain
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.48, r * 0.48, h * 0.46, 14, 1, true),
      metal(0x191b1f, 0x6a7280, 40));
    plate.position.y = h * 0.46;
    t.add(plate);
    const fil = new THREE.Mesh(new THREE.TorusGeometry(r * 0.26, r * 0.035, 6, 20, Math.PI * 1.7), M.tubeFilament);
    fil.position.y = h * 0.46;
    fil.rotation.x = Math.PI / 2;
    t.add(fil);
    const l = new THREE.PointLight(0xff8c22, 5.5, 34, 2);
    l.position.y = h * 0.46;
    t.add(l);
    glows.push({ light: l, fil, phase: i * 1.7 });
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.07, r * 0.05, h * 0.14, 6), metal(0xc8b070));
      pin.position.set(Math.cos(a) * r * 0.6, -h * 0.06, Math.sin(a) * r * 0.6);
      t.add(pin);
    }
    g.add(t);
  }
  g.userData.glows = glows;
  return g;
}

/** The ACCESS panel — the section's exit, and its most literal instruction. */
export function accessGate(opt = {}) {
  const { w = 8, h = 8 } = opt;
  const g = new THREE.Group();
  const face = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.6), M.accessPanel);
  face.position.y = h / 2;
  face.castShadow = true;
  g.add(face);
  // the chrome housing it is bolted into
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w * 1.16, h * 1.16, 0.9), metal(0xb8bec6, 0xffffff, 210));
  frame.position.set(0, h / 2, -0.25);
  frame.castShadow = true;
  g.add(frame);
  for (let i = 0; i < 6; i++) {
    const vent = new THREE.Mesh(new THREE.BoxGeometry(w * 0.09, h * 0.05, 0.2), metal(0x2a2e34, 0x707a88, 50));
    vent.position.set(-w * 0.30 + i * w * 0.12, h * 0.93, 0.34);
    g.add(vent);
  }
  const lamp = new THREE.PointLight(0xffa030, 4.5, 22, 2);
  lamp.position.set(0, h * 0.55, 2.2);
  g.add(lamp);
  g.userData.lamp = lamp;
  return g;
}

/** A bank of three red axial components, as grafted in twice on the plate. */
export function resistorBank(opt = {}) {
  const { n = 3, r = 0.55, len = 3.2, gap = 1.5 } = opt;
  const g = new THREE.Group();
  const body = metal(0xc0202a, 0xff8a80, 90);
  const lead = metal(0xc8c8cc, 0xffffff, 220);
  for (let i = 0; i < n; i++) {
    const y = i * gap;
    const b = new THREE.Mesh(lathe([
      [0, 0], [r * 0.55, 0.06], [r, 0.28], [r, len - 0.28], [r * 0.55, len - 0.06], [0, len],
    ], 20), body);
    b.rotation.z = Math.PI / 2;
    b.position.set(-len / 2, y, 0);
    b.castShadow = true;
    g.add(b);
    // colour bands
    for (let k = 0; k < 3; k++) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.03, r * 1.03, 0.16, 18),
        metal([0x201810, 0xd8c020, 0x1a1a1a][k], 0xffffff, 60));
      band.rotation.z = Math.PI / 2;
      band.position.set(-len * 0.22 + k * len * 0.20, y, 0);
      g.add(band);
    }
    for (const s of [-1, 1]) {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.7, 8), lead);
      l.rotation.z = Math.PI / 2;
      l.position.set(s * (len / 2 + 0.85), y, 0);
      g.add(l);
    }
  }
  return g;
}

/** The row of coloured lamps. Also the section's sequence puzzle. */
export function lampRow(opt = {}) {
  const { colours = [0x2a7aff, 0x2aff6a, 0xffe01a, 0xff8a1a, 0xff2a2a], r = 0.72, gap = 2.0 } = opt;
  const g = new THREE.Group();
  const lamps = [];
  colours.forEach((c, i) => {
    const holder = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r * 0.95, 0.7, 16), metal(0x2c2e36, 0x8892a0, 60));
    holder.position.set(i * gap, 0.35, 0);
    g.add(holder);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14, 0, TAU, 0, Math.PI * 0.55),
      new THREE.MeshPhongMaterial({ color: c, emissive: c, emissiveIntensity: 0.25,
        specular: 0xffffff, shininess: 220, transparent: true, opacity: 0.9 }));
    dome.position.set(i * gap, 0.7, 0);
    g.add(dome);
    const light = new THREE.PointLight(c, 0.4, 12, 2);
    light.position.set(i * gap, 1.2, 0);
    g.add(light);
    lamps.push({ dome, light, colour: c, on: false });
  });
  g.userData.lamps = lamps;
  return g;
}

/** The 0123 / REC ON board. Its digits are live. */
export function timerBoard(opt = {}) {
  const { w = 5.6, h = 3.0 } = opt;
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.9), metal(0x1a1c22, 0x707a88, 60));
  g.add(body);
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(w * 1.06, h * 1.08, 0.5), metal(0x44484f, 0x9aa4b0, 100));
  bezel.position.z = -0.22;
  g.add(bezel);

  // a live canvas so the digits can actually count
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.9, h * 0.82),
    new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  face.position.z = 0.46;
  g.add(face);
  const lamp = new THREE.PointLight(0xff2a18, 2.6, 16, 2);
  lamp.position.z = 2;
  g.add(lamp);

  g.userData = { canvas: c, ctx: c.getContext('2d'), tex, lamp, value: 123 };
  return g;
}

/** Coiled handset cord — a helical ramp you can actually walk up. */
export function coilRamp(opt = {}) {
  const { turns = 2.4, radius = 4.2, rise = 7, tube = 0.55, colour = 0x8a4aff } = opt;
  const g = new THREE.Group();
  const pts = [];
  const N = 120;
  for (let i = 0; i <= N; i++) {
    const t = i / N, a = t * TAU * turns;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, t * rise, Math.sin(a) * radius));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const cord = new THREE.Mesh(new THREE.TubeGeometry(curve, N, tube, 12, false),
    metal(colour, 0xffffff, 140));
  cord.castShadow = true;
  g.add(cord);
  g.userData.curve = curve;
  g.userData.turns = turns; g.userData.radius = radius; g.userData.rise = rise; g.userData.tube = tube;
  return g;
}

/** The subwoofer sunk into the temporal lobe. Pulses, and pushes. */
export function speakerDrum(opt = {}) {
  const { r = 5.5 } = opt;
  const g = new THREE.Group();
  const basket = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.06, r * 0.62, 1.6, 32, 1, true),
    metal(0x1a1c20, 0x6a7280, 50));
  basket.rotation.x = Math.PI / 2;
  g.add(basket);
  const cone = new THREE.Mesh(new THREE.CircleGeometry(r, 40), M.speakerCone);
  cone.position.z = 0.5;
  g.add(cone);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(r * 0.30, 20, 12, 0, TAU, 0, Math.PI * 0.5),
    metal(0x2a2c32, 0x9aa4b0, 90));
  cap.rotation.x = -Math.PI / 2;
  cap.position.z = 0.62;
  g.add(cap);
  const surround = new THREE.Mesh(new THREE.TorusGeometry(r * 0.98, r * 0.07, 10, 40), metal(0x141518, 0x505862, 30));
  surround.position.z = 0.5;
  g.add(surround);
  g.userData = { cone, cap, phase: 0 };
  return g;
}

/** The copper porthole, lower centre of the plate. An iris that opens. */
export function copperIris(opt = {}) {
  const { r = 3.6, blades = 8 } = opt;
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.14, 14, 40), M.copperPort);
  g.add(ring);
  const back = new THREE.Mesh(new THREE.CircleGeometry(r * 0.94, 36), metal(0x120e0c, 0x4a3a30, 20));
  back.position.z = -0.3;
  g.add(back);
  const bladeMeshes = [];
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * TAU;
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(r * 1.02, -r * 0.24);
    shape.lineTo(r * 1.02, r * 0.42); shape.lineTo(0, r * 0.30); shape.closePath();
    const b = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.10, bevelEnabled: false }), M.copperPort);
    b.rotation.z = a;
    g.add(b);
    bladeMeshes.push({ mesh: b, base: a });
  }
  g.userData = { blades: bladeMeshes, open: 0, r };
  return g;
}

/** A knurled chrome control knob, big enough to be a landmark. */
export function bigKnob(opt = {}) {
  const { r = 1.1, h = 1.6 } = opt;
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.94, h, 40), M.knurl);
  body.castShadow = true;
  g.add(body);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.98, r * 0.98, 0.10, 40), metal(0xe8ecf0, 0xffffff, 250));
  top.position.y = h / 2 + 0.05;
  g.add(top);
  const mark = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.06, r * 0.9), metal(0x1a1c20, 0x707a88, 60));
  mark.position.set(0, h / 2 + 0.10, r * 0.45);
  g.add(mark);
  g.userData.dial = g;
  return g;
}

/** Surgical staple, at bridge scale: the way across a sulcus. */
export function stapleBridge(opt = {}) {
  const { span = 22, w = 4.2, drop = 5, bar = 0.9 } = opt;
  const g = new THREE.Group();
  const mat = metal(0xd4dae2, 0xffffff, 240);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(span, bar, w), mat);
  deck.position.y = 0;
  deck.castShadow = deck.receiveShadow = true;
  g.add(deck);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(bar, drop, w), mat);
    leg.position.set(s * (span / 2 - bar / 2), -drop / 2 - bar / 2, 0);
    leg.castShadow = true;
    g.add(leg);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(w * 0.32, bar * 1.6, 4), mat);
    tip.rotation.x = Math.PI / 2;
    tip.rotation.z = Math.PI / 4;
    tip.position.set(s * (span / 2 - bar / 2), -drop - bar, 0);
    g.add(tip);
  }
  // a suture line of small staples marching away down the seam
  g.userData.span = span; g.userData.w = w; g.userData.bar = bar;
  return g;
}

/** Membrane catwalk: the pale walkway laid along a gyrus. */
export function catwalk(len, w = 3.6) {
  const g = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(w, 0.4, len),
    new THREE.MeshPhongMaterial({ color: 0xe4dcd0, specular: 0xfff0e0, shininess: 40 }));
  deck.receiveShadow = true; deck.castShadow = true;
  g.add(deck);
  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, len, 8), metal(0xb8bec6));
    rail.rotation.x = Math.PI / 2;
    rail.position.set(s * (w / 2 - 0.15), 0.9, 0);
    g.add(rail);
    const n = Math.max(2, Math.round(len / 3));
    for (let i = 0; i <= n; i++) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), metal(0xb8bec6));
      post.position.set(s * (w / 2 - 0.15), 0.45, -len / 2 + (i / n) * len);
      g.add(post);
    }
  }
  return g;
}

/* ==================================================================== */
/*  ASSEMBLY                                                            */
/* ==================================================================== */

/**
 * The section, laid out as a route rather than as terrain.
 *
 *   arrival deck  ->  left hemisphere catwalks  ->  staple bridge over the
 *   longitudinal fissure  ->  right hemisphere  ->  coil ramp up to the
 *   hardware shelf  ->  lamp-row puzzle  ->  ACCESS gate home.
 *
 * Everything else — the tubes, the pylons, the speaker, the iris, the
 * resistors, the timer — is landmark, hazard or reward hanging off that
 * spine.
 */
export function buildCortex(game) {
  const C = CORTEX;
  const root = new THREE.Group();
  root.position.set(C.x, C.y, C.z);
  game.scene.add(root);

  const animated = [];
  const anim = (fn) => animated.push(fn);
  const cBox = (x, y, z, hw, hh, hd, o = {}) =>
    game.world.add(box(C.x + x, C.y + y, C.z + z, hw, hh, hd, o));
  const cCyl = (x, y, z, r, h, o = {}) =>
    game.world.add(cyl(C.x + x, C.y + y, C.z + z, r, h, o));

  const marks = {};

  /* ---------------------------------------------------- THE MASS ---- */

  // two hemispheres, one warm and one gone cold, split by the fissure
  const left = hemisphere({ R: 46, side: -1, chill: false });
  left.position.set(-24, -6, 0);
  root.add(left);
  const right = hemisphere({ R: 44, side: 1, chill: true });
  right.position.set(24, -6, 6);
  root.add(right);

  // the corona: the red rim-glow the plate sits inside
  // The plate's red is a RIM around a black field, not a wash over it. An
  // opaque shell turned the whole section monochrome; additive at low
  // opacity puts the glow back without eating the tissue's own colour.
  // A flat shell -- even additive at low opacity -- fills the frame with one
  // maroon. The plate is a BLACK field with a red halo hugging the silhouette,
  // so the shell needs a fresnel: transparent where we look straight through
  // it, bright where we graze it.
  const coronaMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0xff2a18) }, uPower: { value: 3.4 }, uGain: { value: 1.15 } },
    vertexShader: `
      varying vec3 vN; varying vec3 vW;
      void main(){
        vN = normalize(mat3(modelMatrix) * normal);
        vW = (modelMatrix * vec4(position,1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uPower; uniform float uGain;
      varying vec3 vN; varying vec3 vW;
      void main(){
        vec3 V = normalize(cameraPosition - vW);
        float f = pow(1.0 - abs(dot(normalize(vN), V)), uPower);
        gl_FragColor = vec4(uColor * f * uGain, f);
      }`,
    side: THREE.BackSide, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false,
  });
  const corona = new THREE.Mesh(new THREE.SphereGeometry(104, 40, 26), coronaMat);
  corona.position.y = 6;
  root.add(corona);
  const rimLight = new THREE.PointLight(0xff3a24, 30, 190, 2);
  rimLight.position.set(-40, 26, -70);
  root.add(rimLight);
  // a cool key from above so the stapled hemisphere reads blue-grey against it
  const key = new THREE.DirectionalLight(0xcfe0ff, 1.5);
  key.position.set(40, 90, 60);
  root.add(key);
  const warm = new THREE.PointLight(0xffb090, 14, 120, 2);
  warm.position.set(-30, 40, 40);
  root.add(warm);

  // suture seams running along the fissure, as on the plate's blue half
  const sutureMat = M.suture.clone();
  sutureMat.map = T.suture.clone();
  sutureMat.map.wrapS = THREE.RepeatWrapping;
  sutureMat.map.repeat.set(12, 1);
  for (let i = 0; i < 5; i++) {
    const seam = new THREE.Mesh(new THREE.PlaneGeometry(30, 2.4), sutureMat);
    seam.rotation.x = -Math.PI / 2;
    seam.position.set(8 + i * 1.5, 22 - i * 3.2, -30 + i * 16);
    seam.rotation.z = 0.2 - i * 0.1;
    root.add(seam);
  }

  /* ------------------------------------------------ THE ROUTE ------- */

  const DECK_Y = 20;                              // the walking plane
  marks.entry = new THREE.Vector3(C.x, C.y + DECK_Y + 1, C.z + 52);

  // arrival deck, at the occipital end
  const arrival = catwalk(20, 8);
  arrival.position.set(0, DECK_Y, 46);
  root.add(arrival);
  cBox(0, DECK_Y - 0.2, 46, 4, 0.4, 10, { surface: 'metal' });

  // a run forward along the left gyrus
  const runA = catwalk(34, 4.6);
  runA.position.set(-9, DECK_Y, 22);
  runA.rotation.y = 0.22;
  root.add(runA);
  cBox(-9, DECK_Y - 0.2, 22, 4.0, 0.4, 17, { surface: 'metal' });

  // the fissure crossing
  const bridge = stapleBridge({ span: 30, w: 5.0, drop: 7 });
  bridge.position.set(2, DECK_Y + 0.4, 2);
  bridge.rotation.y = 0.42;
  root.add(bridge);
  cBox(2, DECK_Y, 2, 15, 0.5, 3.0, { surface: 'metal', ry: 0.42 });

  // right-hemisphere run
  const runB = catwalk(30, 4.6);
  runB.position.set(16, DECK_Y, -14);
  runB.rotation.y = -0.30;
  root.add(runB);
  cBox(16, DECK_Y - 0.2, -14, 4.4, 0.4, 15, { surface: 'metal', ry: -0.30 });

  // the coil: a helical cord you climb to the hardware shelf
  const coil = coilRamp({ turns: 2.2, radius: 6.5, rise: 12, tube: 0.7, colour: 0x8a4aff });
  coil.position.set(26, DECK_Y, -30);
  root.add(coil);
  // step colliders following the helix, so it is genuinely walkable
  {
    const STEPS = 34;
    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS, a = t * TAU * 2.2;
      cBox(26 + Math.cos(a) * 6.5, DECK_Y + t * 12, -30 + Math.sin(a) * 6.5,
        1.5, 0.35, 1.5, { surface: 'metal' });
    }
  }

  // the hardware shelf
  const SHELF_Y = DECK_Y + 12;
  const shelf = catwalk(26, 10);
  shelf.position.set(26, SHELF_Y, -46);
  root.add(shelf);
  cBox(26, SHELF_Y - 0.2, -46, 5, 0.4, 13, { surface: 'metal' });
  marks.shelf = new THREE.Vector3(C.x + 26, C.y + SHELF_Y + 1, C.z - 46);

  /* ---------------------------------------------- THE LANDMARKS ----- */

  // twin vacuum tubes, burning over the right hemisphere
  const tubes = tubeTower({ h: 14, r: 2.3, count: 2 });
  tubes.position.set(33, 8.5, -4);
  tubes.rotation.y = -0.3;
  root.add(tubes);
  cCyl(30, 8.5, -4, 2.6, 14, { surface: 'metal' });
  cCyl(36, 8.5, -4, 2.6, 14, { surface: 'metal' });

  // three discharge stacks along the ridge, arcing across the route
  const pylons = [];
  for (const [px, pz, ph] of [[-30, 10, 11], [-6, -22, 9], [12, 30, 10]]) {
    const p = teslaPylon({ h: ph, r: 1.7 });
    p.position.set(px, DECK_Y - 2, pz);
    root.add(p);
    cCyl(px, DECK_Y - 2, pz, 1.9, ph, { surface: 'metal' });
    pylons.push(p);
  }

  // resistor banks bolted to the left hemisphere
  for (const [rx, ry2, rz, rot] of [[-30, 21, -4, 0.3], [-18, 23, -26, -0.5]]) {
    const rb = resistorBank({ n: 3, r: 0.62, len: 4.0, gap: 1.7 });
    rb.position.set(rx, ry2, rz);
    rb.rotation.y = rot;
    root.add(rb);
  }

  // the speaker, sunk into the left temporal lobe
  const spk = speakerDrum({ r: 6.5 });
  spk.position.set(-44, 9, 21);
  spk.rotation.y = 0.9;
  spk.rotation.x = -0.25;
  root.add(spk);

  // the copper porthole in the underside of the fissure
  const iris = copperIris({ r: 4.4 });
  iris.position.set(3, 12, 33);
  iris.rotation.x = -0.35;
  root.add(iris);

  // knurled knobs at the base of the fissure, two of them, as on the plate
  for (const kx of [-4, -1.2]) {
    const k = bigKnob({ r: 1.3, h: 1.9 });
    k.position.set(kx, 15.5, 38);
    root.add(k);
  }

  // the rainbow ribbon, arcing off the shelf and away into the dark
  {
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      pts.push(new THREE.Vector3(
        26 + t * 34,
        SHELF_Y - Math.sin(t * Math.PI) * 6 - t * 10,
        -46 + t * 22 + Math.sin(t * 4) * 3));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, 60, 1.5, 4, false);
    const ribbon = new THREE.Mesh(geo, M.ribbon);
    root.add(ribbon);
  }

  /* ---------------------------------------------- THE INSTRUMENTS --- */

  // the lamp row, the section's lock
  const lamps = lampRow({ r: 0.9, gap: 2.6 });
  lamps.position.set(20, SHELF_Y + 0.4, -52);
  root.add(lamps);
  marks.lamps = lamps;

  // the timer, mounted above the lamps
  const timer = timerBoard({ w: 6.4, h: 3.4 });
  timer.position.set(26, SHELF_Y + 6.5, -55);
  root.add(timer);
  marks.timer = timer;

  // the ACCESS gate, the way home
  const gate = accessGate({ w: 9, h: 9 });
  gate.position.set(34, SHELF_Y, -56);
  gate.rotation.y = -0.5;
  root.add(gate);
  marks.gate = gate;
  marks.gatePos = new THREE.Vector3(C.x + 34, C.y + SHELF_Y + 2, C.z - 56);

  /* ------------------------------------------------- ANIMATION ------ */

  const _v = new THREE.Vector3();

  anim((dt, t, gm) => {
    // --- discharge stacks: charge, strike, decay
    for (const p of pylons) {
      const u = p.userData;
      u.timer -= dt;
      if (u.timer <= 0) { u.timer = rand(2.6, 5.5); u.firing = 0.34; }
      if (u.firing > 0) {
        u.firing -= dt;
        const pos = u.arc.geometry.attributes.position;
        // rebuild the bolt each frame it is alive
        const tip = u.h + u.r * 0.2;
        for (let i = 0; i <= u.SEGS; i++) {
          const f = i / u.SEGS;
          pos.setXYZ(i,
            (Math.random() - 0.5) * f * 7,
            tip + f * 9,
            (Math.random() - 0.5) * f * 7);
        }
        pos.needsUpdate = true;
        u.arc.material.opacity = clamp(u.firing / 0.34, 0, 1) * 0.95;
        u.light.intensity = clamp(u.firing / 0.34, 0, 1) * 16;
        // it is a hazard: standing under a striking pylon hurts
        const wp = p.getWorldPosition(_v);
        if (u.firing > 0.28 && gm.player.pos.distanceTo(wp) < 9) {
          gm.player.damage(14, wp, 'arc');
          gm.postfx?.kick(0.3, 6);
        }
      } else {
        u.arc.material.opacity = 0;
        u.light.intensity = lerp(u.light.intensity, 0, Math.min(1, dt * 6));
      }
    }

    // --- the tubes breathe
    for (const g2 of tubes.userData.glows) {
      const k = 0.82 + Math.sin(t * 1.6 + g2.phase) * 0.16 + Math.sin(t * 9 + g2.phase) * 0.03;
      g2.light.intensity = 5.2 * k;
      g2.fil.material.color.setRGB(1, 0.52 * k, 0.10 * k);
    }

    // --- the speaker pushes air
    const s = spk.userData;
    s.phase += dt;
    const pulse = Math.sin(s.phase * 2.2) * Math.max(0, Math.sin(s.phase * 0.5));
    s.cone.position.z = 0.5 + pulse * 0.55;
    s.cap.position.z = 0.62 + pulse * 0.6;

    // --- the iris breathes open and shut
    const ir = iris.userData;
    ir.open = 0.5 + Math.sin(t * 0.35) * 0.5;
    for (const b of ir.blades) b.mesh.rotation.z = b.base + ir.open * 0.72;

    // --- the timer counts, and it is the only honest clock here
    const tu = timer.userData;
    tu.value = 123 + Math.floor(t * 1.0);
    const ctx = tu.ctx;
    const digits = String(tu.value % 10000).padStart(4, '0');
    drawReadout(ctx, digits, (t % 1) < 0.5);
    tu.tex.needsUpdate = true;
    tu.lamp.intensity = 2.2 + Math.sin(t * 6) * 0.4;

    // --- the corona pulses like something with a heartbeat
    rimLight.intensity = 26 + Math.sin(t * 0.9) * 6;
    coronaMat.uniforms.uGain.value = 1.05 + Math.sin(t * 0.9) * 0.22;

    // --- the ACCESS lamp
    gate.userData.lamp.intensity = 4.0 + Math.sin(t * 2.4) * 0.9;
  });

  // Anything that moves, glows or is re-driven per frame must survive the
  // merge; everything else collapses into one mesh per material.
  for (const o of [corona, tubes, ...pylons, spk, iris, timer, gate, lamps, coil]) keepDynamic(o);
  const stats = bakeStatic(root);

  return {
    root, animated, marks, stats,
    update(dt, t, gm) { for (const fn of animated) fn(dt, t, gm); },
  };
}

/** Redraw the seven-segment face of the timer board. */
function drawReadout(g, digits, recOn) {
  const W = 512, H = 256;
  g.fillStyle = '#0a0508'; g.fillRect(0, 0, W, H);
  const SEG = {
    '0': [1, 1, 1, 1, 1, 1, 0], '1': [0, 1, 1, 0, 0, 0, 0], '2': [1, 1, 0, 1, 1, 0, 1],
    '3': [1, 1, 1, 1, 0, 0, 1], '4': [0, 1, 1, 0, 0, 1, 1], '5': [1, 0, 1, 1, 0, 1, 1],
    '6': [1, 0, 1, 1, 1, 1, 1], '7': [1, 1, 1, 0, 0, 0, 0], '8': [1, 1, 1, 1, 1, 1, 1],
    '9': [1, 1, 1, 1, 0, 1, 1],
  };
  const dw = 88, dh = 132, th = 15, x0 = 26, y0 = 34;
  const seg = (x, y, w, h, lit) => {
    g.fillStyle = lit ? '#ff2a18' : '#3a0806';
    if (lit) { g.shadowColor = '#ff2a18'; g.shadowBlur = 14; } else g.shadowBlur = 0;
    g.fillRect(x, y, w, h);
    g.shadowBlur = 0;
  };
  for (let i = 0; i < 4; i++) {
    const s = SEG[digits[i]] || SEG['0'];
    const x = x0 + i * (dw + 14), y = y0;
    seg(x + th, y, dw - th * 2, th, s[0]);
    seg(x + dw - th, y + th, th, dh / 2 - th, s[1]);
    seg(x + dw - th, y + dh / 2, th, dh / 2 - th, s[2]);
    seg(x + th, y + dh - th, dw - th * 2, th, s[3]);
    seg(x, y + dh / 2, th, dh / 2 - th, s[4]);
    seg(x, y + th, th, dh / 2 - th, s[5]);
    seg(x + th, y + dh / 2 - th / 2, dw - th * 2, th, s[6]);
  }
  g.font = '700 26px Verdana, sans-serif';
  g.fillStyle = '#ff2a18'; g.shadowColor = '#ff2a18'; g.shadowBlur = 10;
  g.fillText('SET', 26, 228);
  if (recOn) g.fillText('REC ON', 330, 228);
  g.shadowBlur = 0;
}
