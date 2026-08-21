/* SILICONE DREAMS — Relics
 *
 * Fourteen objects scattered across level one. Each one is a small built
 * model, a line of lore, and a slot in the Vitrine Hall back at the hub.
 *
 * The loop is the oldest one in the immersive sim playbook: you find a
 * strange object in a dangerous place, you carry it home, and the room where
 * you keep your things becomes a record of where you have been. Nothing in
 * here is a stat pickup. They are all just evidence.
 */
import * as THREE from 'three';
import { M, T } from '../world/Materials.js';
import { lathe } from '../world/Arch.js';
import { relicBrain } from '../world/Reliquary.js';

const TAU = Math.PI * 2;

const metal = (c, spec = 0xffffff, sh = 180) =>
  new THREE.MeshPhongMaterial({ color: c, specular: spec, shininess: sh });

/* ------------------------------------------------------- the models */

function mVacuumTube() {
  const g = new THREE.Group();
  const glass = new THREE.Mesh(lathe([
    [0.00, 0], [0.13, 0.01], [0.15, 0.06], [0.155, 0.40],
    [0.14, 0.50], [0.09, 0.55], [0.045, 0.58], [0.03, 0.62], [0, 0.63],
  ], 24), M.tubeGlass);
  g.add(glass);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.09, 20), metal(0x2a2c32, 0x8892a0, 60));
  base.position.y = 0.045; g.add(base);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.008, 0.11, 6), metal(0xc8b070));
    pin.position.set(Math.cos(a) * 0.085, -0.05, Math.sin(a) * 0.085);
    g.add(pin);
  }
  // the filament: the thing that actually glows
  const fil = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.006, 5, 18, Math.PI * 1.6), M.tubeFilament);
  fil.position.y = 0.26; fil.rotation.x = Math.PI / 2;
  g.add(fil);
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.24, 14, 1, true),
    metal(0x1a1c20, 0x6a7280, 40));
  plate.position.y = 0.26; g.add(plate);
  const glow = new THREE.PointLight(0xff8c22, 1.4, 2.2, 2);
  glow.position.y = 0.26; g.add(glow);
  g.userData.glow = glow;
  return g;
}

function mTimer() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.34, 0.20), metal(0x1c1e24, 0x707a88, 60));
  g.add(body);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.26), M.ledReadout);
  face.position.z = 0.101;
  g.add(face);
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.60, 0.32, 0.02), metal(0x40444c, 0x9aa4b0, 90));
  bezel.position.z = 0.095; g.add(bezel);
  const glow = new THREE.PointLight(0xff3018, 0.7, 1.6, 2);
  glow.position.z = 0.3; g.add(glow);
  // little grille of buttons down the side, as on the reference
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.03), metal(0x8a9098));
    b.position.set(0.36, 0.09 - i * 0.09, 0.10);
    g.add(b);
  }
  return g;
}

function mAccessPlate() {
  const g = new THREE.Group();
  const p = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.56, 0.06), M.accessPanel);
  g.add(p);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.50, 0.05), metal(0x3a3e46, 0x8a94a4, 70));
  back.position.z = -0.05; g.add(back);
  return g;
}

function mRibbonCoil() {
  const g = new THREE.Group();
  const pts = [];
  for (let i = 0; i <= 90; i++) {
    const t = i / 90, a = t * TAU * 2.1;
    pts.push(new THREE.Vector3(Math.cos(a) * 0.26, (t - 0.5) * 0.30, Math.sin(a) * 0.26));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  // a ribbon, so: a flat extrusion, not a tube
  const geo = new THREE.TubeGeometry(curve, 90, 0.05, 3, false);
  const m = new THREE.Mesh(geo, M.ribbon);
  m.scale.set(1, 1, 1);
  g.add(m);
  const conn = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.07, 0.10), metal(0x22242a, 0x7a8290, 60));
  conn.position.set(0.26, -0.17, 0);
  g.add(conn);
  return g;
}

function mStaple() {
  const g = new THREE.Group();
  const mat = metal(0xd4dae2, 0xffffff, 240);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.07, 0.09), mat);
  g.add(bar);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.24, 0.09), mat);
    leg.position.set(s * 0.225, -0.15, 0);
    g.add(leg);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.10, 6), mat);
    tip.position.set(s * 0.225, -0.31, 0);
    tip.rotation.x = Math.PI;
    g.add(tip);
  }
  return g;
}

function mFloppy() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.47, 0.035), metal(0x2a2e36, 0x6a7280, 40));
  g.add(body);
  const shutter = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.11, 0.045), metal(0xb8bec6, 0xffffff, 200));
  shutter.position.set(0.02, 0.17, 0.006); g.add(shutter);
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.24),
    new THREE.MeshBasicMaterial({ map: T.venus }));
  label.position.set(0, -0.07, 0.019); g.add(label);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.01, 12), metal(0x8a9098));
  hub.rotation.x = Math.PI / 2; hub.position.z = -0.02; g.add(hub);
  return g;
}

function mGnomonTip() {
  const g = new THREE.Group();
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(0.42, 0); s.lineTo(0, 0.30); s.closePath();
  const m = new THREE.Mesh(new THREE.ExtrudeGeometry(s, {
    depth: 0.03, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 1 }), M.gold);
  m.position.set(-0.18, -0.13, 0);
  g.add(m);
  return g;
}

function mMaskShard() {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.30); shape.lineTo(0.20, 0.10); shape.lineTo(0.14, -0.18);
  shape.lineTo(-0.08, -0.26); shape.lineTo(-0.21, 0.02); shape.closePath();
  const m = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, {
    depth: 0.05, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 1 }), M.pcb);
  g.add(m);
  return g;
}

function mAmpoule() {
  const g = new THREE.Group();
  const glass = new THREE.Mesh(lathe([
    [0, 0], [0.055, 0.02], [0.075, 0.10], [0.075, 0.30],
    [0.035, 0.36], [0.030, 0.44], [0.045, 0.47], [0, 0.48],
  ], 20), M.tubeGlass);
  g.add(glass);
  const merc = new THREE.Mesh(lathe([
    [0, 0.02], [0.062, 0.04], [0.062, 0.22], [0, 0.24],
  ], 18), metal(0xd8dce4, 0xffffff, 300));
  g.add(merc);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.042, 0.05, 12), M.gold);
  cap.position.y = 0.47; g.add(cap);
  return g;
}

function mPendulumBob() {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.035, 28), M.gold);
  disc.rotation.x = Math.PI / 2; g.add(disc);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.016, 8, 30), M.goldDark);
  g.add(ring);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.34, 8), M.brass);
  rod.position.y = 0.30; g.add(rod);
  return g;
}

function mSandPhial() {
  const g = new THREE.Group();
  const glass = new THREE.Mesh(lathe([
    [0, 0], [0.10, 0.015], [0.115, 0.09], [0.06, 0.24],
    [0.115, 0.39], [0.10, 0.465], [0, 0.48],
  ], 22), M.tubeGlass);
  g.add(glass);
  const sand = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.16, 16),
    new THREE.MeshPhongMaterial({ color: 0xd9c07a, specular: 0x8a7a44, shininess: 20 }));
  sand.position.y = 0.10; sand.rotation.x = Math.PI; g.add(sand);
  for (const y of [0.0, 0.48]) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.03, 16), M.brass);
    cap.position.y = y; g.add(cap);
  }
  return g;
}

function mRunicHand() {
  const g = new THREE.Group();
  const s = new THREE.Shape();
  s.moveTo(-0.035, -0.08); s.lineTo(-0.018, 0.42); s.lineTo(0, 0.50);
  s.lineTo(0.018, 0.42); s.lineTo(0.035, -0.08); s.closePath();
  const m = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false }), M.goldDark);
  m.position.y = -0.2;
  g.add(m);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.05, 14), M.gold);
  hub.rotation.x = Math.PI / 2; hub.position.y = -0.2; g.add(hub);
  return g;
}

function mGoldenKey() {
  const g = new THREE.Group();
  const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.020, 0.46, 10), M.gold);
  shank.rotation.z = Math.PI / 2; g.add(shank);
  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.020, 8, 20), M.gold);
  bow.position.x = -0.30; bow.rotation.y = Math.PI / 2; g.add(bow);
  const bit = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.10, 0.022), M.gold);
  bit.position.set(0.20, -0.05, 0); g.add(bit);
  for (let i = 0; i < 3; i++) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.045, 0.024), M.gold);
    w.position.set(0.16 + i * 0.024, -0.10, 0); g.add(w);
  }
  return g;
}

function mCoil() {
  const g = new THREE.Group();
  const stack = new THREE.Mesh(lathe([
    [0.05, 0], [0.14, 0.02], [0.10, 0.06], [0.15, 0.10], [0.10, 0.14],
    [0.16, 0.18], [0.10, 0.22], [0.15, 0.26], [0.09, 0.30], [0.05, 0.33], [0, 0.34],
  ], 24), M.insulator);
  g.add(stack);
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 10), metal(0xd8d4e4, 0xffffff, 240));
  top.position.y = 0.37; g.add(top);
  const l = new THREE.PointLight(0x9fd8ff, 1.1, 2.0, 2);
  l.position.y = 0.42; g.add(l);
  g.userData.glow = l;
  return g;
}

function mSpeaker() {
  const g = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.CircleGeometry(0.30, 32), M.speakerCone);
  cone.position.z = 0.02; g.add(cone);
  const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.20, 0.16, 24, 1, true),
    metal(0x1a1c20, 0x6a7280, 50));
  basket.rotation.x = Math.PI / 2; basket.position.z = -0.06; g.add(basket);
  const magnet = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.10, 20), metal(0x101216, 0x505862, 30));
  magnet.rotation.x = Math.PI / 2; magnet.position.z = -0.18; g.add(magnet);
  return g;
}

/* --------------------------------------------------- the catalogue */

export const RELICS = [
  { id: 'dreamer', name: 'The First Dreamer', zone: 'altar', make: () => relicBrain({ r: 0.34 }),
    lore: 'Cortical tissue, iridised. It is still warm, and it is still dreaming, and it has not been attached to anything for a very long time.' },
  { id: 'triode', name: 'Vacuum Triode', zone: 'cortex', make: mVacuumTube,
    lore: 'Pulled from the left temporal graft. The filament will not go out. Nothing is supplying it.' },
  { id: 'timer', name: 'The 0123 Timer', zone: 'cortex', make: mTimer,
    lore: 'REC ON. It has been recording for one hundred and twenty-three of something. The unit is not given.' },
  { id: 'access', name: 'ACCESS Plate', zone: 'cortex', make: mAccessPlate,
    lore: 'The lettering reads correctly only from inside the skull.' },
  { id: 'ribbon', name: 'Spectrum Ribbon', zone: 'cortex', make: mRibbonCoil,
    lore: 'Forty conductors, each a different colour, each carrying the same signal.' },
  { id: 'staple', name: 'Cortical Staple', zone: 'cortex', make: mStaple,
    lore: 'Surgical steel. Whoever closed this seam meant it to be reopened.' },
  { id: 'coil', name: 'Discharge Stack', zone: 'cortex', make: mCoil,
    lore: 'A ceramic insulator column. It arcs to nothing at regular intervals, like a held breath.' },
  { id: 'speaker', name: 'The Listening Cone', zone: 'cortex', make: mSpeaker,
    lore: 'Wired backwards. It does not reproduce sound; it collects it.' },
  { id: 'venus', name: 'Botticelli Cartridge', zone: 'temple', make: mFloppy,
    lore: 'A 1.44MB diskette. One image file, 640x480, and it has been opened four thousand and ninety-six times.' },
  { id: 'gnomon', name: 'Gnomon Tip', zone: 'temple', make: mGnomonTip,
    lore: 'Brass, and sharper than it needs to be. It has told the hour for longer than the temple has stood.' },
  { id: 'shard', name: 'Choir Fragment', zone: 'mirror', make: mMaskShard,
    lore: 'A piece of a face. The traces on the back are still routed, still terminating somewhere.' },
  { id: 'ampoule', name: 'Mercury Ampoule', zone: 'mirror', make: mAmpoule,
    lore: 'Sealed standing metal. Tip it and the meniscus takes four seconds too long to settle.' },
  { id: 'bob', name: 'Pendulum Bob', zone: 'colonnade', make: mPendulumBob,
    lore: 'Removed from the great clock. This is why the hour would not move.' },
  { id: 'sand', name: 'Phial of Spent Hours', zone: 'colonnade', make: mSandPhial,
    lore: 'The sand in the lower bulb is finer than the sand in the upper. It has been through.' },
  { id: 'hand', name: 'The Fourth Hand', zone: 'nexus', make: mRunicHand,
    lore: 'The moon-clock carries four. Two measure time. This one measured something else.' },
  { id: 'key', name: 'The Golden Key', zone: 'nexus', make: mGoldenKey,
    lore: 'It fits the moon-clock. It has always fitted the moon-clock.' },
];

export const RELIC_BY_ID = Object.fromEntries(RELICS.map((r) => [r.id, r]));
export const RELIC_COUNT = RELICS.length;

/** Build a relic's model. Cached per id, cloned per use. */
const cache = new Map();
export function relicModel(id) {
  const def = RELIC_BY_ID[id];
  if (!def) return null;
  if (!cache.has(id)) cache.set(id, def.make());
  return cache.get(id).clone(true);
}
