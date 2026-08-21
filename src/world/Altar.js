/* SILICONE DREAMS — SECTION F: THE ALTAR OF ASCENDING BINARY
 *
 * Plate 2, at monument scale. A plain of dark volcanic rock under an indigo
 * sky; a black monolith wrapped in circuit traces standing in the middle of
 * it; a dish of mercury on its crown; and above that, turning, the oil-slick
 * brain with a column of chrome ones and zeroes pouring out of it into the
 * air and going out like sparks.
 *
 * It is the end of the level and it is a reliquary the size of a church. The
 * grammar is identical to every pickup the player has seen — that is the
 * point. They have been reading small versions of this sentence all game.
 */
import * as THREE from 'three';
import { M, T, rep } from './Materials.js';
import { Reliquary, relicBrain, monolith, vapourColumn, BinaryAscent } from './Reliquary.js';
import { box, cyl, LAYER } from './Physics.js';
import { rand, clamp, lerp } from '../core/Time.js';
import { bakeStatic, keepDynamic } from './Batch.js';

const TAU = Math.PI * 2;
export const ALTAR = { x: 0, y: 0, z: 1320 };

/** A ridge of volcanic rock: a displaced cone, faceted and dark. */
function rockRidge(opt = {}) {
  const { r = 40, h = 22, seed = 3, seg = 12 } = opt;
  const geo = new THREE.ConeGeometry(r, h, seg, 4);
  const p = geo.attributes.position;
  let s = seed;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const j = rnd() - 0.5;
    p.setXYZ(i, x * (1 + j * 0.34) + j * r * 0.10, y + j * h * 0.22, z * (1 + j * 0.34) + j * r * 0.10);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, M.volcanic);
  m.castShadow = m.receiveShadow = true;
  return m;
}

export function buildAltar(game) {
  const A = ALTAR;
  const root = new THREE.Group();
  root.position.set(A.x, A.y, A.z);
  game.scene.add(root);

  const animated = [];
  const anim = (fn) => animated.push(fn);
  const cBox = (x, y, z, hw, hh, hd, o = {}) =>
    game.world.add(box(A.x + x, A.y + y, A.z + z, hw, hh, hd, o));
  const cCyl = (x, y, z, r, h, o = {}) =>
    game.world.add(cyl(A.x + x, A.y + y, A.z + z, r, h, o));
  const marks = {};

  /* --------------------------------------------------- THE PLAIN --- */

  const GROUND = 220;
  const gm = M.volcanic.clone();
  gm.map = rep(T.volcanic, GROUND / 12, GROUND / 12);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(GROUND, GROUND, 48, 48), gm);
  {
    // gentle undulation, so the plain is not a table
    const p = ground.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      const d = Math.hypot(x, y);
      const swell = Math.sin(x * 0.055) * Math.cos(y * 0.048) * 1.9
                  + Math.sin(x * 0.017 + y * 0.021) * 3.2;
      // flatten a processional apron around the monolith
      p.setZ(i, swell * clamp((d - 26) / 26, 0, 1));
    }
    ground.geometry.computeVertexNormals();
  }
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  root.add(ground);
  cBox(0, -2, 0, GROUND / 2, 2, GROUND / 2, { surface: 'stone' });

  // a horizon of ridges, so the plain has somewhere to end
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU + rand(-0.1, 0.1);
    const d = rand(78, 104);
    const rr = rockRidge({ r: rand(18, 34), h: rand(14, 30), seed: i * 13 + 5 });
    rr.position.set(Math.cos(a) * d, rand(2, 7), Math.sin(a) * d);
    rr.rotation.y = rand(0, TAU);
    root.add(rr);
  }

  /* ------------------------------------------------ THE MONOLITH --- */

  const H = 11, W = 12;
  const mono = monolith({ w: W, h: H, dish: 0.58, glow: 0x8fd8ff, detail: 1 });
  root.add(mono);
  cBox(0, H / 2, 0, W / 2 * 0.72, H / 2, W / 2 * 0.72, { surface: 'metal' });
  marks.monolith = mono;

  // the steps you climb to stand at its foot
  for (let i = 0; i < 5; i++) {
    const r = W * 1.5 - i * 1.1;
    const st = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.4, 0.44, 4), M.volcanic);
    st.rotation.y = Math.PI / 4;
    st.position.y = 0.22 + i * 0.44;
    st.castShadow = st.receiveShadow = true;
    root.add(st);
    cCyl(0, i * 0.44, 0, r, 0.44, { surface: 'stone' });
  }

  // the relic, turning above the dish
  const brain = relicBrain({ r: 2.6, detail: 5 });
  const slot = new THREE.Group();
  slot.position.y = mono.userData.top + 6.2;
  slot.add(brain);
  root.add(slot);
  marks.brain = brain;

  const vap = vapourColumn({ r: mono.userData.dishRadius * 0.9, h: 7.0, shells: 5, opacity: 0.055 });
  vap.position.y = mono.userData.top;
  root.add(vap);

  // the ascent: far bigger than a pickup's, and it does not stop
  const ascent = new BinaryAscent(slot, {
    count: 150, radius: 3.4, rise: 42, size: 1.5, speed: 0.42, spread: 3.2,
  });

  // lighting: a cold key on the relic, a warm bounce off the rock
  const key = new THREE.PointLight(0xdfe8ff, 14, 60, 2);
  key.position.set(6, mono.userData.top + 10, 10);
  root.add(key);
  const under = new THREE.PointLight(0x8fd8ff, 9, 34, 2);
  under.position.set(0, mono.userData.top + 1.5, 0);
  root.add(under);
  const bounce = new THREE.PointLight(0xff9a5a, 5, 70, 2);
  bounce.position.set(-24, 6, -18);
  root.add(bounce);

  /* ---------------------------------------- THE LESSER RELIQUARIES - */

  // an avenue of empty plinths leading in: the ones that came before
  const avenue = [];
  for (let i = 0; i < 10; i++) {
    const row = Math.floor(i / 2), side = i % 2 ? 1 : -1;
    const z = 26 + row * 11;
    const x = side * 9;
    const p = monolith({ w: 2.4, h: 2.2, dish: 0.55, glow: 0x2fe08a, detail: 0.6 });
    p.position.set(x, 0, z);
    p.rotation.y = rand(-0.15, 0.15);
    root.add(p);
    cBox(x, 1.1, z, 1.0, 1.1, 1.0, { surface: 'metal' });
    const v = vapourColumn({ r: 0.5, h: 1.5, shells: 3, opacity: 0.035 });
    v.position.set(x, p.userData.top, z);
    root.add(v);
    avenue.push({ mono: p, vap: v });
  }

  marks.entry = new THREE.Vector3(A.x, A.y + 0.6, A.z + 84);
  marks.foot = new THREE.Vector3(A.x, A.y + 2.4, A.z + 16);

  /* ------------------------------------------------- ANIMATION ----- */

  anim((dt, t, g) => {
    brain.rotation.y += dt * 0.14;
    brain.rotation.z = Math.sin(t * 0.22) * 0.05;
    slot.position.y = mono.userData.top + 6.2 + Math.sin(t * 0.42) * 0.30;
    ascent.update(dt, g.camera);

    for (const l of vap.userData.layers) {
      l.material.map.offset.y -= l.userData.speed * dt * 0.7;
      l.rotation.y += l.userData.spin * dt * 0.5;
    }
    for (const a of avenue) {
      for (const l of a.vap.userData.layers) {
        l.material.map.offset.y -= l.userData.speed * dt * 0.5;
      }
      const merc = a.mono.userData.mercury;
      if (merc) merc.material.emissive.setScalar(0.03 + Math.sin(t * 1.4) * 0.02);
    }
    const merc = mono.userData.mercury;
    if (merc) {
      merc.position.y = mono.userData.top + Math.sin(t * 1.1) * 0.03;
      merc.material.emissive.setScalar(0.08 + Math.sin(t * 1.7) * 0.04);
    }
    under.intensity = 8 + Math.sin(t * 1.3) * 2.0;
    key.intensity = 13 + Math.sin(t * 0.7) * 1.6;
  });

  for (const o of [mono, slot, vap, ...avenue.map((a) => a.mono), ...avenue.map((a) => a.vap)]) keepDynamic(o);
  const stats = bakeStatic(root);

  return {
    root, animated, marks, monolith: mono, brain, stats,
    update(dt, t, g) { for (const fn of animated) fn(dt, t, g); },
  };
}
