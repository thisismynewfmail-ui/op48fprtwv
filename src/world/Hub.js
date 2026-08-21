/* SILICONE DREAMS — THE ATRIUM OF SLEEPING MACHINES
 *
 * The hub. Built from nothing: none of the reference plates are of this
 * place, because this place is where you keep the things you take from them.
 *
 * An octagonal marble atrium whose grout is a live circuit. Eight bays:
 * six are gates out to the level's sections, one opens into the Vitrine
 * Hall where recovered relics are displayed, one holds the workshop and the
 * long desk of terminals. In the middle, sunk into the floor, a great brass
 * orrery turns and does not keep the right time.
 *
 * Everything here is diegetic: the save point is a chronometer you wind, the
 * upgrade screen is a bench you stand at, the collection screen is a room
 * you walk down.
 */
import * as THREE from 'three';
import { M, T, rep } from './Materials.js';
import * as Arch from './Arch.js';
import * as Obj from './Objects.js';
import { Reliquary, relicBrain, monolith } from './Reliquary.js';
import { box, cyl, sphere, LAYER, Body } from './Physics.js';
import { RELICS, RELIC_COUNT, relicModel } from '../game/Relics.js';
import { rand, clamp, lerp } from '../core/Time.js';
import { cfg } from '../core/Config.js';
import { bakeStatic, keepDynamic } from './Batch.js';

const TAU = Math.PI * 2;

/** The atrium lives far from the level proper, on its own island of space. */
export const HUB = { x: 0, y: 0, z: 620 };

const R_OUT = 44;                       // octagon vertex radius
const R_SIDE = R_OUT * Math.cos(Math.PI / 8);   // side-midpoint radius
const WELL_R = 13;                      // the orrery well
const WELL_D = 4.2;
const WALL_H = 19;                      // tall enough for a second tier
const BALCONY_Y = 9.6;                  // the future-expansion gallery
const BALCONY_W = 4.6;

/**
 * FUTURE EXPANSION.
 *
 * The atrium is built as a two-tier hub so later levels do not need it torn
 * up. The ground tier is Level One: six gates plus the Vitrine Hall and the
 * workshop. The balcony above carries eight more portals, one per future
 * chapter, sealed and legible until someone builds behind them.
 *
 * To ship a new level: add its sections to `CHAPTERS`, point the portal at a
 * destination in `Game.DEST`, and set `built: true`. Nothing else here
 * changes — the geometry, the labels and the locks all read from this list.
 */
export const CHAPTERS = [
  { id: 1, name: 'THE TERMINAL HOUR',        built: true,
    sections: ['temple', 'mirror', 'colonnade', 'nexus', 'cortex', 'altar'] },
  { id: 2, name: 'THE GARDEN OF FORKING CLOCKS', built: false, sections: [] },
  { id: 3, name: 'THE LONG SUNDAY',          built: false, sections: [] },
  { id: 4, name: 'MOTHERBOARD OF THE DROWNED', built: false, sections: [] },
  { id: 5, name: 'A ROOM WITH NO INSTANT',    built: false, sections: [] },
  { id: 6, name: 'THE SLEEP OF REASON',       built: false, sections: [] },
  { id: 7, name: 'CARRIER LOST',              built: false, sections: [] },
  { id: 8, name: 'THE LAST COMPILE',          built: false, sections: [] },
];

/** The eight bays, in order, starting due north (-Z) and going clockwise. */
export const BAYS = [
  { key: 'temple',    kind: 'gate', name: 'THE VIOLET GATE',      colour: 0xc9a6ff, sigil: null },
  { key: 'mirror',    kind: 'gate', name: 'THE NOON GATE',        colour: 0x9fd8ff, sigil: 'sigil_mirror' },
  { key: 'colonnade', kind: 'gate', name: 'THE STARLIT GATE',     colour: 0xffc487, sigil: 'sigil_colonnade' },
  { key: 'nexus',     kind: 'gate', name: 'THE GATE OF SUN AND MOON', colour: 0xff9ad8, sigil: 'sigil_nexus' },
  { key: 'vitrine',   kind: 'hall', name: 'THE VITRINE HALL',     colour: 0x6fe8a8, sigil: null },
  { key: 'cortex',    kind: 'gate', name: 'THE WET GATE',         colour: 0xff6a5a, sigil: 'sigil_cortex' },
  { key: 'altar',     kind: 'gate', name: 'THE LAST GATE',        colour: 0x6fe8a8, sigil: 'sigil_altar' },
  { key: 'workshop',  kind: 'shop', name: 'THE LONG DESK',        colour: 0xffd28a, sigil: null },
];

const bayAngle = (i) => (i / 8) * TAU - Math.PI / 2;   // 0 => -Z

/**
 * Open-ended cylinders in three.js wind their faces outward. Anything the
 * player stands *inside* -- the barrel vault, the well shaft, the cornice
 * ring -- therefore renders as nothing at all unless its material draws back
 * faces. This caches an inside-out variant of a material so we do not clone
 * one per mesh.
 */
const _innerCache = new Map();
function inside(mat) {
  if (!_innerCache.has(mat)) {
    const m = mat.clone();
    m.side = THREE.BackSide;
    _innerCache.set(mat, m);
  }
  return _innerCache.get(mat);
}
function bothSides(mat) {
  const key = 'both:' + mat.uuid;
  if (!_innerCache.has(key)) {
    const m = mat.clone();
    m.side = THREE.DoubleSide;
    _innerCache.set(key, m);
  }
  return _innerCache.get(key);
}

/* ==================================================================== */

export class Hub {
  constructor(game) {
    this.game = game;
    this.root = new THREE.Group();
    this.root.position.set(HUB.x, HUB.y, HUB.z);
    game.scene.add(this.root);

    this.animated = [];
    this.vitrines = new Map();       // relic id -> Reliquary
    this.gates = new Map();          // bay key -> gate record
    this.terminals = [];
    this.detail = clamp(cfg.r_detail ?? 1, 0.5, 1.5);

    this.build();
  }

  anim(fn) { this.animated.push(fn); }

  /** collider helpers, in hub-local coordinates */
  cBox(x, y, z, hw, hh, hd, o = {}) {
    return this.game.world.add(box(HUB.x + x, HUB.y + y, HUB.z + z, hw, hh, hd, o));
  }
  cCyl(x, y, z, r, h, o = {}) {
    return this.game.world.add(cyl(HUB.x + x, HUB.y + y, HUB.z + z, r, h, o));
  }

  build() {
    this.buildFloor();
    this.buildWell();
    this.buildPerimeter();
    this.buildBalcony();
    this.buildBays();
    this.buildVitrineHall();
    this.buildWorkshop();
    this.buildGardens();
    this.buildSky();
    this.bake();
  }

  /**
   * Collapse the atrium's static marble into one mesh per material. The
   * orrery, the gate veils, the terminals, the clock and the drifting binary
   * all animate, so they are exempted first.
   */
  bake() {
    if (this.orrery) keepDynamic(this.orrery);
    for (const rec of this.gates.values()) keepDynamic(rec.grp);
    if (this.workshop) keepDynamic(this.workshop);
    if (this.saveClock) keepDynamic(this.saveClock);
    for (const o of this.root.children) {
      // the drifting-binary layer and anything with a live material
      if (o.isGroup && o.children.some((c) => c.material && c.material.map === T.glyph1)) keepDynamic(o);
    }
    this.batchStats = bakeStatic(this.root);
  }

  /* ------------------------------------------------------------ FLOOR */

  buildFloor() {
    const g = this.root;

    // the octagon deck. One big circle geometry with 8 segments is exactly
    // an octagon, and it keeps the whole floor to a single draw call.
    const floorMat = M.atriumFloor.clone();
    floorMat.map = rep(T.atriumFloor, R_OUT / 5.5, R_OUT / 5.5);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(R_OUT, 8), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.rotation.z = Math.PI / 8;
    floor.receiveShadow = true;
    g.add(floor);

    const slab = new THREE.Mesh(new THREE.CylinderGeometry(R_OUT, R_OUT * 0.96, 2.4, 8), M.marbleGrey);
    slab.rotation.y = Math.PI / 8;
    slab.position.y = -1.2;
    slab.receiveShadow = true;
    g.add(slab);
    // floor collision as one disc; the well is carved by its own walls
    this.cCyl(0, -2.4, 0, R_OUT, 2.4, { surface: 'marble' });

    // the underside: three stepped octagonal courses tapering into the dark,
    // so from outside the atrium reads as a built thing on a foundation
    for (let i = 0; i < 4; i++) {
      const r = R_OUT * (0.97 - i * 0.13);
      const step = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.90, 3.0, 8), M.marbleGrey);
      step.rotation.y = Math.PI / 8;
      step.position.y = -2.4 - 1.5 - i * 2.8;
      step.castShadow = step.receiveShadow = true;
      g.add(step);
    }
    const keel = new THREE.Mesh(new THREE.ConeGeometry(R_OUT * 0.45, 22, 8), M.marbleGrey);
    keel.rotation.y = Math.PI / 8;
    keel.position.y = -2.4 - 12 - 11;
    g.add(keel);

    // a brass compass rose inlaid around the well
    for (let i = 0; i < 8; i++) {
      const a = bayAngle(i);
      const ray = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.02, R_OUT - WELL_R - 3), M.brassBrushed);
      ray.position.set(Math.cos(a) * (WELL_R + (R_OUT - WELL_R) / 2), 0.012, Math.sin(a) * (WELL_R + (R_OUT - WELL_R) / 2));
      ray.rotation.y = -a;
      g.add(ray);
    }
    for (const rr of [WELL_R + 1.4, R_OUT - 5.5]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.07, 6, 96), M.brassBrushed);
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.014;
      g.add(ring);
    }
  }

  /* ------------------------------------------------- THE ORRERY WELL */

  buildWell() {
    const g = this.root;

    // the pit: an inner wall ring and a sunken floor
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(WELL_R, WELL_R, WELL_D, 48, 1, true), inside(M.marbleCream));
    wall.position.y = -WELL_D / 2;
    wall.receiveShadow = true;
    g.add(wall);
    const pitFloor = new THREE.Mesh(new THREE.CircleGeometry(WELL_R, 48), M.marbleBlack);
    pitFloor.rotation.x = -Math.PI / 2;
    pitFloor.position.y = -WELL_D;
    pitFloor.receiveShadow = true;
    g.add(pitFloor);
    this.cCyl(0, -WELL_D - 2, 0, WELL_R, 2, { surface: 'marble' });

    // ring the pit with collision so you cannot walk off it, except at the
    // stair; the stair gap is left open on the south-west side
    const SEG = 40;
    for (let i = 0; i < SEG; i++) {
      const a = (i / SEG) * TAU;
      if (a > Math.PI * 0.86 && a < Math.PI * 1.16) continue;      // stair gap
      const x = Math.cos(a) * (WELL_R + 0.35), z = Math.sin(a) * (WELL_R + 0.35);
      this.cBox(x, 0.5, z, 1.3, 0.5, 1.3, { layer: LAYER.CLIP });
    }
    // a low kerb you can see, all the way round
    const kerb = new THREE.Mesh(new THREE.TorusGeometry(WELL_R + 0.2, 0.22, 8, 72), M.marbleCream);
    kerb.rotation.x = Math.PI / 2; kerb.position.y = 0.15;
    kerb.castShadow = kerb.receiveShadow = true;
    g.add(kerb);

    // --- the stair down, on the south-west arc
    const sa = Math.PI * 1.0;
    const steps = 8, rise = WELL_D / steps, run = 0.72;
    for (let i = 0; i < steps; i++) {
      const r = WELL_R + 0.4 - i * run;
      const st = new THREE.Mesh(new THREE.BoxGeometry(5.2, rise, run + 0.5), M.marbleCream);
      st.position.set(Math.cos(sa) * (r - run / 2), -rise * (i + 0.5), Math.sin(sa) * (r - run / 2));
      st.rotation.y = -sa;
      st.castShadow = st.receiveShadow = true;
      g.add(st);
      this.cBox(Math.cos(sa) * (r - run / 2), -rise * (i + 0.5), Math.sin(sa) * (r - run / 2),
        2.6, rise / 2, (run + 0.5) / 2, { surface: 'marble' });
    }

    // --- THE ORRERY. Nested brass rings, a sun lamp, planets on arms, and a
    //     clock escapement that ticks over the top of it all.
    const orr = new THREE.Group();
    orr.position.y = -WELL_D + 0.2;
    g.add(orr);
    this.orrery = orr;

    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.6, 1.1, 24), M.marbleBlack);
    plinth.position.y = 0.55; plinth.castShadow = plinth.receiveShadow = true;
    orr.add(plinth);
    this.cCyl(0, -WELL_D + 0.2, 0, 2.6, 1.2, { surface: 'marble' });

    const sun = new THREE.Mesh(new THREE.SphereGeometry(0.85, 26, 18),
      new THREE.MeshBasicMaterial({ color: 0xffd27a, toneMapped: false }));
    sun.position.y = 4.2; orr.add(sun);
    const sunGlow = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({
      map: T.glow, color: 0xffc46a, transparent: true, opacity: 0.42,
      blending: THREE.AdditiveBlending, depthWrite: false }));
    sunGlow.position.y = 4.2; orr.add(sunGlow);
    this.orrerySunGlow = sunGlow;
    const sunLight = new THREE.PointLight(0xffcf8a, 9, 34, 2);
    sunLight.position.y = 4.2;
    orr.add(sunLight);
    this.orreryLight = sunLight;

    // the armature: three gimbal rings at different inclinations
    this.orreryRings = [];
    for (let i = 0; i < 3; i++) {
      const r = 3.0 + i * 1.5;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.075 + i * 0.012, 8, 90), M.brassBrushed);
      ring.position.y = 4.2;
      ring.rotation.set(1.0 + i * 0.32, i * 0.7, i * 0.25);
      ring.castShadow = true;
      orr.add(ring);
      this.orreryRings.push({ mesh: ring, rate: (i % 2 ? -1 : 1) * (0.10 + i * 0.055) });
    }

    // planets on arms
    this.orreryArms = [];
    const PLANETS = [
      { r: 3.0, s: 0.24, c: 0xb8a894, rate: 0.62 },
      { r: 4.5, s: 0.34, c: 0x9fc4ff, rate: 0.38 },
      { r: 6.0, s: 0.30, c: 0xd88a5a, rate: 0.24 },
    ];
    for (const p of PLANETS) {
      const arm = new THREE.Group();
      arm.position.y = 4.2;
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, p.r, 8), M.brassBrushed);
      rod.rotation.z = Math.PI / 2;
      rod.position.x = p.r / 2;
      arm.add(rod);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(p.s, 20, 14),
        new THREE.MeshPhongMaterial({ color: p.c, specular: 0xffffff, shininess: 60 }));
      ball.position.x = p.r;
      ball.castShadow = true;
      arm.add(ball);
      arm.rotation.y = rand(0, TAU);
      orr.add(arm);
      this.orreryArms.push({ arm, ball, rate: p.rate });
    }

    // the escapement: a great toothed wheel and a swinging anchor
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.12, 44), M.brassBrushed);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(0, 9.4, -2.6);
    orr.add(wheel);
    for (let i = 0; i < 44; i++) {
      const a = (i / 44) * TAU;
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.26, 0.11), M.brassBrushed);
      tooth.position.set(Math.cos(a) * 1.82, Math.sin(a) * 1.82, 0);
      tooth.rotation.z = a;
      wheel.add(tooth);
    }
    this.escapement = wheel;
    const anchor = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.16, 0.16), M.brassBrushed);
    anchor.position.set(0, 11.5, -2.6);
    orr.add(anchor);
    this.anchor = anchor;

    this.anim((dt, t) => {
      for (const r of this.orreryRings) r.mesh.rotation.z += r.rate * dt;
      for (const a of this.orreryArms) {
        a.arm.rotation.y += a.rate * dt * 0.35;
        a.ball.rotation.y += dt * 0.8;
      }
      this.escapement.rotation.z -= dt * 0.22;
      this.anchor.rotation.z = Math.sin(t * 1.6) * 0.16;
      sunGlow.quaternion.copy(this.game.camera.quaternion);
      sunGlow.material.opacity = 0.38 + Math.sin(t * 1.1) * 0.06;
      sunLight.intensity = 8.4 + Math.sin(t * 1.1) * 0.9;
    });
  }

  /* ------------------------------------------------------- PERIMETER */

  buildPerimeter() {
    const g = this.root;
    const detail = this.detail;

    // a Corinthian column at each octagon vertex, carrying an entablature
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU - Math.PI / 2 + TAU / 16;
      const x = Math.cos(a) * R_OUT, z = Math.sin(a) * R_OUT;
      const col = Arch.corinthianColumn({
        height: WALL_H, style: 'white', rBottom: 0.86, rTop: 0.70,
        flutes: 24, detail,
      });
      col.position.set(x, 0, z);
      g.add(col);
      this.cCyl(x, 0, z, 1.0, WALL_H, { surface: 'marble' });
    }

    // wall panels between the vertices, each pierced by its bay arch
    for (let i = 0; i < 8; i++) {
      const a = bayAngle(i);
      const mx = Math.cos(a) * R_SIDE, mz = Math.sin(a) * R_SIDE;
      const sideLen = 2 * R_OUT * Math.sin(Math.PI / 8);

      const panel = new THREE.Group();
      panel.position.set(mx, 0, mz);
      panel.rotation.y = -a + Math.PI / 2;
      g.add(panel);

      const openW = 7.0, openH = 8.0;
      const t = 1.0;
      // left and right piers
      for (const s of [-1, 1]) {
        const w = (sideLen - openW) / 2;
        const pw = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_H, t), M.marbleCream);
        pw.position.set(s * (openW / 2 + w / 2), WALL_H / 2, 0);
        pw.castShadow = pw.receiveShadow = true;
        panel.add(pw);
        const cx = mx + Math.cos(-a + Math.PI / 2) * 0, cz = mz;
        this.cBox(
          mx + Math.cos(a + Math.PI / 2) * (s * (openW / 2 + w / 2)),
          WALL_H / 2,
          mz + Math.sin(a + Math.PI / 2) * (s * (openW / 2 + w / 2)),
          Math.max(0.6, Math.abs(Math.cos(a)) * w / 2 + Math.abs(Math.sin(a)) * t / 2),
          WALL_H / 2,
          Math.max(0.6, Math.abs(Math.sin(a)) * w / 2 + Math.abs(Math.cos(a)) * t / 2),
          { surface: 'marble' });
      }
      // lintel above the opening
      const lint = new THREE.Mesh(new THREE.BoxGeometry(openW + 1.6, WALL_H - openH, t), M.marbleCream);
      lint.position.set(0, openH + (WALL_H - openH) / 2, 0);
      lint.castShadow = lint.receiveShadow = true;
      panel.add(lint);
      // the arch head, so the opening reads as classical rather than cut
      const archG = Arch.archGeometry({ span: openW, pierW: 0.9, legH: openH - openW / 2, thick: 0.85, depth: t * 1.3 });
      const arch = new THREE.Mesh(archG, M.marbleWhite);
      arch.castShadow = true;
      panel.add(arch);

      this.bayTransform = this.bayTransform || [];
      this.bayTransform[i] = { a, mx, mz, panel, openW, openH };
    }

    // entablature + cornice ring
    const ent = new THREE.Mesh(new THREE.CylinderGeometry(R_OUT + 1.4, R_OUT + 1.4, 1.5, 8, 1, true), bothSides(M.marbleCream));
    ent.rotation.y = Math.PI / 8;
    ent.position.y = WALL_H + 0.75;
    ent.castShadow = ent.receiveShadow = true;
    this.root.add(ent);
    // A solid cylinder here has END CAPS, which roofed the whole atrium over
    // with a marble lid. The cornice must be a ring: open-ended, with an
    // inner face, so the oculus stays open to the sky.
    const cornOuter = new THREE.Mesh(
      new THREE.CylinderGeometry(R_OUT + 2.2, R_OUT + 1.4, 0.9, 8, 1, true), M.marbleWhite);
    cornOuter.rotation.y = Math.PI / 8;
    cornOuter.position.y = WALL_H + 1.9;
    cornOuter.castShadow = true;
    this.root.add(cornOuter);
    const cornInner = new THREE.Mesh(
      new THREE.CylinderGeometry(R_OUT - 0.2, R_OUT - 0.2, 0.9, 8, 1, true), inside(M.marbleWhite));
    cornInner.rotation.y = Math.PI / 8;
    cornInner.position.y = WALL_H + 1.9;
    this.root.add(cornInner);
    // the soffit joining them, drawn as a flat ring
    const soffit = new THREE.Mesh(new THREE.RingGeometry(R_OUT - 0.2, R_OUT + 2.2, 8, 1), bothSides(M.marbleCream));
    soffit.rotation.x = Math.PI / 2;
    soffit.rotation.z = Math.PI / 8;
    soffit.position.y = WALL_H + 1.45;
    this.root.add(soffit);

    // an open oculus ring above, so the atrium is lit from the sky
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + TAU / 16;
      const x = Math.cos(a) * (R_OUT - 6), z = Math.sin(a) * (R_OUT - 6);
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 12), M.marbleWhite);
      rib.position.set(x, WALL_H + 2.6, z);
      rib.rotation.y = -a;
      rib.castShadow = true;
      this.root.add(rib);
    }
  }

  /* ------------------------------------------------------------ BAYS */

  /* ---------------------------------------------- EXPANSION TIER --- */

  /**
   * The upper gallery. A ring balcony reached by two stairs, carrying one
   * portal per future chapter. Unbuilt chapters stand dark behind a plate
   * that says so; the moment a chapter is marked built its portal lights and
   * behaves exactly like a ground-tier gate.
   */
  buildBalcony() {
    const g = this.root;
    const rIn = R_OUT - BALCONY_W;

    // the deck: an octagonal ring cantilevered off the wall
    const deck = new THREE.Mesh(new THREE.RingGeometry(rIn, R_OUT, 8, 1), M.marbleCream);
    deck.rotation.x = -Math.PI / 2;
    deck.rotation.z = Math.PI / 8;
    deck.position.y = BALCONY_Y;
    deck.receiveShadow = true;
    g.add(deck);
    const under = new THREE.Mesh(
      new THREE.CylinderGeometry(R_OUT, rIn, 0.8, 8, 1, true), bothSides(M.marbleGrey));
    under.rotation.y = Math.PI / 8;
    under.position.y = BALCONY_Y - 0.4;
    g.add(under);

    // walkable collision, as eight straight runs rather than a ring
    for (let i = 0; i < 8; i++) {
      const a = bayAngle(i);
      const mid = (rIn + R_OUT) / 2;
      const len = 2 * mid * Math.tan(Math.PI / 8);
      this.cBox(Math.cos(a) * mid, BALCONY_Y - 0.25, Math.sin(a) * mid,
        Math.abs(Math.sin(a)) * len / 2 + Math.abs(Math.cos(a)) * BALCONY_W / 2, 0.25,
        Math.abs(Math.cos(a)) * len / 2 + Math.abs(Math.sin(a)) * BALCONY_W / 2,
        { surface: 'marble' });
    }

    // a balustrade along the inner edge
    for (let i = 0; i < 8; i++) {
      const a = bayAngle(i);
      const len = 2 * rIn * Math.tan(Math.PI / 8);
      const bal = Arch.balustrade(len, { axis: 'x', h: 1.05, mat: M.marbleCream, spacing: 0.6 });
      bal.position.set(Math.cos(a) * rIn, BALCONY_Y, Math.sin(a) * rIn);
      bal.rotation.y = -a + Math.PI / 2;
      g.add(bal);
      this.cBox(Math.cos(a) * (rIn - 0.2), BALCONY_Y + 0.6, Math.sin(a) * (rIn - 0.2),
        Math.abs(Math.sin(a)) * len / 2 + 0.3, 0.6,
        Math.abs(Math.cos(a)) * len / 2 + 0.3, { layer: LAYER.CLIP });
    }

    // two stairs up, on opposite flanks, so the tier is reachable from either side
    for (const dir of [1, -1]) {
      const a = bayAngle(dir > 0 ? 2 : 6);
      const steps = 16, rise = BALCONY_Y / steps, run = 0.62;
      for (let i = 0; i < steps; i++) {
        const r = R_OUT - BALCONY_W - 1.2 - i * run;
        const st = new THREE.Mesh(new THREE.BoxGeometry(3.4, rise, run + 0.4), M.marbleCream);
        const off = 3.2 * dir;
        const px = Math.cos(a) * r - Math.sin(a) * off;
        const pz = Math.sin(a) * r + Math.cos(a) * off;
        st.position.set(px, BALCONY_Y - rise * (i + 0.5), pz);
        st.rotation.y = -a;
        st.castShadow = st.receiveShadow = true;
        g.add(st);
        this.cBox(px, BALCONY_Y - rise * (i + 0.5), pz, 1.7, rise / 2, (run + 0.4) / 2, { surface: 'marble' });
      }
    }

    // one portal per future chapter, in the wall above each bay
    const future = CHAPTERS.filter((c) => c.id !== 1);
    for (let i = 0; i < 8; i++) {
      const ch = future[i % future.length];
      const a = bayAngle(i);
      const grp = new THREE.Group();
      grp.position.set(Math.cos(a) * (R_OUT - 0.4), BALCONY_Y, Math.sin(a) * (R_OUT - 0.4));
      grp.rotation.y = -a + Math.PI / 2;
      g.add(grp);

      const W = 4.6, H = 5.6;
      const recess = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.5),
        ch.built ? M.marbleWhite : M.marbleBlack);
      recess.position.set(0, H / 2, -0.4);
      grp.add(recess);
      for (const sx of [-1, 1]) {
        const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.34, H, 0.5), M.brassBrushed);
        jamb.position.set(sx * W / 2, H / 2, -0.1);
        grp.add(jamb);
      }
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(W + 0.9, 0.4, 0.6), M.brassBrushed);
      lintel.position.set(0, H, -0.1);
      grp.add(lintel);

      const plate = this.makePlate(
        ch.built ? ch.name : `LEVEL ${ch.id}`,
        3.6, 0.62,
        ch.built ? 0xffd98a : 0x6a6478,
        ch.built ? '' : 'not yet compiled');
      plate.position.set(0, H + 0.72, 0.05);
      grp.add(plate);

      if (ch.built) {
        const veil = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.4, H - 0.3),
          new THREE.MeshBasicMaterial({ map: T.noise, color: 0xc9a6ff, transparent: true,
            opacity: 0.24, blending: THREE.AdditiveBlending, depthWrite: false }));
        veil.position.set(0, H / 2, -0.1);
        grp.add(veil);
        const l = new THREE.PointLight(0xc9a6ff, 2.4, 14, 2);
        l.position.set(0, H * 0.6, 1.4);
        grp.add(l);
      } else {
        // sealed: a dead lamp and a shuttered face, so the room reads as
        // finished rather than unfinished
        const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.16, 12),
          new THREE.MeshBasicMaterial({ color: 0x281c14, toneMapped: false }));
        lamp.position.set(W / 2 - 0.55, 0.75, 0.02);
        grp.add(lamp);
        for (let k = 0; k < 5; k++) {
          const slat = new THREE.Mesh(new THREE.BoxGeometry(W - 0.5, 0.7, 0.16), M.marbleGrey);
          slat.position.set(0, 0.6 + k * 1.0, 0.06);
          grp.add(slat);
        }
      }
      // the wall behind is solid whether or not the chapter exists
      this.cBox(Math.cos(a) * (R_OUT - 0.2), BALCONY_Y + H / 2, Math.sin(a) * (R_OUT - 0.2),
        Math.abs(Math.sin(a)) * W / 2 + 0.4, H / 2,
        Math.abs(Math.cos(a)) * W / 2 + 0.4, { surface: 'marble' });
    }
  }

  buildBays() {
    for (let i = 0; i < 8; i++) {
      const bay = BAYS[i];
      const tr = this.bayTransform[i];
      if (bay.kind === 'gate') this.buildGate(i, bay, tr);
    }
  }

  /**
   * A gate. A brass frame set in the bay arch, filled with a standing plane
   * of held time; locked until its sigil is carried, and lit in the colour
   * of the place it leads to.
   */
  buildGate(i, bay, tr) {
    const { a, mx, mz } = tr;
    const grp = new THREE.Group();
    grp.position.set(mx, 0, mz);
    grp.rotation.y = -a + Math.PI / 2;
    this.root.add(grp);

    const W = 6.2, H = 7.6;
    // frame
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, H, 0.6), M.brassBrushed);
      post.position.set(s * W / 2, H / 2, 0);
      post.castShadow = true;
      grp.add(post);
      for (let k = 1; k < 7; k++) {
        const notch = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.10, 0.16), M.gold);
        notch.position.set(s * W / 2, (k / 7) * H, 0.30);
        grp.add(notch);
      }
    }
    const head = new THREE.Mesh(new THREE.BoxGeometry(W + 1.0, 0.55, 0.7), M.brassBrushed);
    head.position.y = H; head.castShadow = true;
    grp.add(head);

    // the surface: a shimmering plane, colour-coded to its destination
    const veil = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.3, H - 0.4, 10, 10),
      new THREE.MeshBasicMaterial({
        map: T.noise, color: bay.colour, transparent: true, opacity: 0.26,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    veil.position.set(0, H / 2 - 0.1, 0);
    veil.material.map = T.noise.clone();
    veil.material.map.wrapS = veil.material.map.wrapT = THREE.RepeatWrapping;
    grp.add(veil);

    // a sigil lock plate on the right-hand pier
    const lock = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.18, 8), M.brassBrushed);
    lock.rotation.x = Math.PI / 2;
    lock.position.set(W / 2 + 1.1, 1.5, 0.35);
    grp.add(lock);
    const lockLamp = new THREE.Mesh(new THREE.CircleGeometry(0.22, 16),
      new THREE.MeshBasicMaterial({ color: 0xff3a2a, toneMapped: false }));
    lockLamp.position.set(W / 2 + 1.1, 1.5, 0.46);
    grp.add(lockLamp);

    // the destination's name, engraved
    const label = this.makePlate(bay.name, 3.4, 0.52, bay.colour);
    label.position.set(0, H + 0.85, 0.4);
    grp.add(label);

    const light = new THREE.PointLight(bay.colour, 3.2, 20, 2);
    light.position.set(0, H * 0.55, 1.6);
    grp.add(light);

    // walking into an unlocked gate travels; the collider blocks a locked one
    const blocker = this.cBox(
      mx + Math.cos(a) * 0.2, H / 2, mz + Math.sin(a) * 0.2,
      Math.abs(Math.sin(a)) * W / 2 + 0.6, H / 2, Math.abs(Math.cos(a)) * W / 2 + 0.6,
      { surface: 'energy' });

    const rec = { bay, grp, veil, light, lockLamp, blocker, open: false, i };
    this.gates.set(bay.key, rec);

    this.anim((dt, t) => {
      veil.material.map.offset.y -= dt * (rec.open ? 0.55 : 0.10);
      veil.material.map.offset.x = Math.sin(t * 0.3 + i) * 0.08;
      veil.material.opacity = rec.open
        ? 0.30 + Math.sin(t * 2.2 + i) * 0.08
        : 0.13 + Math.sin(t * 0.9 + i) * 0.04;
      light.intensity = (rec.open ? 3.6 : 1.1) + Math.sin(t * 1.7 + i) * 0.35;
      lockLamp.material.color.setHex(rec.open ? 0x3aff7a : 0xff3a2a);
    });
  }

  /* --------------------------------------------------- VITRINE HALL */

  /**
   * The trophy room, and the reason the hub exists. A long barrel-vaulted
   * hall running out of the south bay, with sixteen reliquary plinths in two
   * facing rows. Empty plinths stand dark with their vapour guttering; a
   * recovered relic turns above its own dish under its own light.
   */
  buildVitrineHall() {
    const idx = BAYS.findIndex((b) => b.key === 'vitrine');
    const a = bayAngle(idx);
    const hall = new THREE.Group();
    hall.position.set(Math.cos(a) * R_SIDE, 0, Math.sin(a) * R_SIDE);
    hall.rotation.y = -a + Math.PI / 2;
    this.root.add(hall);
    this.vitrineHall = hall;

    // The hall SIZES ITSELF from the relic registry, so a future chapter that
    // adds ten more relics gets ten more plinths and a longer nave without
    // anyone editing this number.
    const PITCH = 6.2;                                    // metres per facing pair
    const rows = Math.max(8, Math.ceil(RELICS.length / 2));
    const L = Math.max(52, rows * PITCH + 14);
    const W = 13, H = 6.4;
    const fwd = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));   // outward
    const rgt = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));

    // floor
    const fm = M.checkerVoid.clone();
    fm.map = rep(T.checkerVoid, W / 4, L / 4);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, L), fm);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.01, L / 2);
    floor.receiveShadow = true;
    hall.add(floor);
    const cx = Math.cos(a) * (R_SIDE + L / 2), cz = Math.sin(a) * (R_SIDE + L / 2);
    this.cBox(cx, -1.2, cz,
      Math.abs(Math.sin(a)) * W / 2 + Math.abs(Math.cos(a)) * L / 2, 1.2,
      Math.abs(Math.cos(a)) * W / 2 + Math.abs(Math.sin(a)) * L / 2, { surface: 'marble' });

    // side walls + a barrel vault
    for (const s of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.9, H, L), M.marbleGrey);
      wall.position.set(s * W / 2, H / 2, L / 2);
      wall.castShadow = wall.receiveShadow = true;
      hall.add(wall);
      this.cBox(cx + rgt.x * s * W / 2, H / 2, cz + rgt.z * s * W / 2,
        Math.abs(Math.sin(a)) * 0.45 + Math.abs(Math.cos(a)) * L / 2, H / 2,
        Math.abs(Math.cos(a)) * 0.45 + Math.abs(Math.sin(a)) * L / 2, { surface: 'marble' });
    }
    // The barrel vault. Object-level Euler rotation made the orientation
    // ambiguous, so bake it into the geometry instead, where the operations
    // apply in a defined order:
    //   CylinderGeometry(theta 0..PI) is a half-shell in the +X half, axis +Y.
    //   rotateZ(+90) sends +X to +Y  -> shell is now the upper half, axis -X.
    //   rotateY(+90) sends -X to +Z  -> axis now runs along the hall.
    const vg = new THREE.CylinderGeometry(W / 2, W / 2, L, 28, 1, true, 0, Math.PI);
    vg.rotateZ(Math.PI / 2);
    vg.rotateY(Math.PI / 2);
    const vault = new THREE.Mesh(vg, inside(M.marbleCream));
    vault.position.set(0, H, L / 2);
    vault.receiveShadow = true;
    hall.add(vault);
    // coffer ribs across the vault, so it is not a bare tube
    const ribs = Math.max(6, Math.round(L / 6));
    for (let i = 1; i < ribs; i++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(W / 2 + 0.06, 0.16, 6, 22, Math.PI), M.marbleWhite);
      rib.rotation.y = Math.PI / 2;
      rib.position.set(0, H, (i / ribs) * L);
      hall.add(rib);
    }
    // end wall
    const endW = new THREE.Mesh(new THREE.BoxGeometry(W, H + W / 2, 0.9), M.marbleGrey);
    endW.position.set(0, (H + W / 2) / 2, L);
    endW.castShadow = endW.receiveShadow = true;
    hall.add(endW);
    this.cBox(Math.cos(a) * (R_SIDE + L), (H + W / 2) / 2, Math.sin(a) * (R_SIDE + L),
      Math.abs(Math.sin(a)) * W / 2 + 0.5, (H + W / 2) / 2,
      Math.abs(Math.cos(a)) * W / 2 + 0.5, { surface: 'marble' });

    // plinths, half a side, facing inward across the nave
    RELICS.forEach((def, k) => {
      const side = k % 2 ? 1 : -1;
      const row = Math.floor(k / 2);
      const along = 7 + row * ((L - 14) / Math.max(1, rows - 1));
      const px = side * (W / 2 - 3.1);
      const wx = cx + fwd.x * (along - L / 2) + rgt.x * px;
      const wz = cz + fwd.z * (along - L / 2) + rgt.z * px;

      const rel = new Reliquary(this.game.scene, {
        pos: new THREE.Vector3(HUB.x + wx, HUB.y, HUB.z + wz),
        w: 1.25, h: 1.15, hover: 0.95, glow: 0x3fe89a,
        binary: true, vapour: true, detail: this.detail * 0.45,
        lights: 'none',        // the hall lights these; see Reliquary

      });
      rel.root.rotation.y = -a + Math.PI / 2 + (side < 0 ? Math.PI : 0);
      rel.setPayload(null);
      rel.setLabel(def.name);
      rel.userDataId = def.id;
      this.vitrines.set(def.id, rel);
      this.cCyl(wx, 0, wz, 0.95, 1.2, { surface: 'marble' });
    });

    // clerestory lamps down the vault
    const lamps = Math.max(3, Math.round(L / 18));
    for (let i = 0; i < lamps; i++) {
      const along = 9 + i * ((L - 18) / Math.max(1, lamps - 1));
      const wx = cx + fwd.x * (along - L / 2), wz = cz + fwd.z * (along - L / 2);
      const lamp = new THREE.PointLight(0xcfe8dc, 5.5, 40, 2);
      lamp.position.set(wx, H + 3.4, wz);
      this.root.add(lamp);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8),
        new THREE.MeshBasicMaterial({ color: 0xdff4ea, toneMapped: false }));
      bulb.position.copy(lamp.position);
      this.root.add(bulb);
    }

    // the hall's dedication, over the door
    const ded = this.makePlate('THE VITRINE HALL', 6.0, 0.9, 0x6fe8a8, 'what you carried back');
    ded.position.set(0, 7.6, 0.7);
    hall.add(ded);
    this.marks = this.marks || {};
    this.marks.vitrineEnd = new THREE.Vector3(HUB.x + cx + fwd.x * (L / 2 - 4), HUB.y + 0.2, HUB.z + cz + fwd.z * (L / 2 - 4));
  }

  /** Drop a relic into its vitrine. Called when one is collected. */
  fillVitrine(id) {
    const rel = this.vitrines.get(id);
    if (!rel || rel.payload) return false;
    const model = relicModel(id);
    if (!model) return false;
    // normalise the model so every relic reads at the same size on its plinth
    const bb = new THREE.Box3().setFromObject(model);
    const size = bb.getSize(new THREE.Vector3());
    const longest = Math.max(size.x, size.y, size.z) || 1;
    model.scale.multiplyScalar(0.62 / longest);
    rel.setPayload(model);
    return true;
  }

  /** Rebuild every vitrine from an inventory (used on load). */
  syncVitrines(inv) {
    for (const [id, rel] of this.vitrines) {
      if (inv.hasRelic(id)) { if (!rel.payload) this.fillVitrine(id); }
      else rel.setPayload(null);
    }
  }

  /* ------------------------------------------------------- WORKSHOP */

  /**
   * The Long Desk. Five period machines along a bench, a workshop rig for
   * spending silicone, and a chronometer pillar that is the save point.
   */
  buildWorkshop() {
    const idx = BAYS.findIndex((b) => b.key === 'workshop');
    const a = bayAngle(idx);
    const grp = new THREE.Group();
    grp.position.set(Math.cos(a) * (R_SIDE - 7), 0, Math.sin(a) * (R_SIDE - 7));
    grp.rotation.y = -a + Math.PI / 2;
    this.root.add(grp);
    this.workshop = grp;

    // the bench
    const bench = new THREE.Mesh(new THREE.BoxGeometry(16, 0.9, 1.5), M.marbleCream);
    bench.position.set(0, 0.45, -1.2);
    bench.castShadow = bench.receiveShadow = true;
    grp.add(bench);
    const bx = Math.cos(a) * (R_SIDE - 7) + Math.cos(a) * 1.2;
    const bz = Math.sin(a) * (R_SIDE - 7) + Math.sin(a) * 1.2;
    this.cBox(bx, 0.45, bz,
      Math.abs(Math.sin(a)) * 8 + Math.abs(Math.cos(a)) * 0.75, 0.45,
      Math.abs(Math.cos(a)) * 8 + Math.abs(Math.sin(a)) * 0.75, { surface: 'marble' });

    // five terminals, each with a live screen
    const fwd = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const rgt = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
    for (let i = 0; i < 5; i++) {
      const t = Obj.terminal({ scale: 0.82 });
      t.position.set(-6.4 + i * 3.2, 0.9, -1.2);
      t.rotation.y = Math.PI;
      grp.add(t);
      const wx = Math.cos(a) * (R_SIDE - 7) + rgt.x * (-6.4 + i * 3.2) + fwd.x * 1.2;
      const wz = Math.sin(a) * (R_SIDE - 7) + rgt.z * (-6.4 + i * 3.2) + fwd.z * 1.2;
      this.terminals.push({
        obj: t, index: i,
        pos: new THREE.Vector3(HUB.x + wx, HUB.y + 1.6, HUB.z + wz),
      });
      const led = t.userData.powerLed;
      const phase = i * 1.4;
      this.anim((dt, tt) => {
        led.material.color.setHSL(0.33, 1, 0.35 + Math.sin(tt * 2 + phase) * 0.2);
        t.userData.screenBloom.quaternion.copy(this.game.camera.quaternion);
      });
    }

    // the upgrade rig: a brass armature over a lit slab
    const rig = new THREE.Group();
    rig.position.set(6.4, 0, 3.2);
    grp.add(rig);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.0, 2.0), M.marbleBlack);
    slab.position.y = 0.5; slab.castShadow = slab.receiveShadow = true;
    rig.add(slab);
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.5),
      new THREE.MeshBasicMaterial({ map: T.reliquaryBoard, toneMapped: false }));
    pad.rotation.x = -Math.PI / 2; pad.position.y = 1.01;
    rig.add(pad);
    for (const s of [-1, 1]) {
      const armGeo = new THREE.TorusGeometry(1.3, 0.06, 6, 24, Math.PI);
      const arm = new THREE.Mesh(armGeo, M.brassBrushed);
      arm.position.set(s * 0.9, 1.0, 0);
      arm.rotation.y = Math.PI / 2;
      rig.add(arm);
    }
    const rigLight = new THREE.PointLight(0x6fe8a8, 2.6, 9, 2);
    rigLight.position.set(0, 2.2, 0);
    rig.add(rigLight);
    const wrx = Math.cos(a) * (R_SIDE - 7) + rgt.x * 6.4 + fwd.x * -3.2;
    const wrz = Math.sin(a) * (R_SIDE - 7) + rgt.z * 6.4 + fwd.z * -3.2;
    this.cBox(wrx, 0.5, wrz, 1.4, 0.5, 1.2, { surface: 'marble' });
    this.marks = this.marks || {};
    this.marks.workbench = new THREE.Vector3(HUB.x + wrx, HUB.y + 1.2, HUB.z + wrz);
    this.anim((dt, t) => { rigLight.intensity = 2.4 + Math.sin(t * 2.4) * 0.5; });

    // --- the chronometer pillar: the save point
    const save = new THREE.Group();
    save.position.set(-6.6, 0, 3.4);
    grp.add(save);
    const col = Arch.corinthianColumn({ height: 2.6, style: 'white', rBottom: 0.42, rTop: 0.36, capital: false });
    save.add(col);
    const face = Obj.clockFace({ r: 0.75, dial: M.romanDial, rimMat: M.gold, hands: 2 });
    face.position.set(0, 3.3, 0.1);
    save.add(face);
    this.saveClock = face;
    const sLight = new THREE.PointLight(0xffd28a, 2.2, 9, 2);
    sLight.position.set(0, 3.3, 1.1);
    save.add(sLight);
    const wsx = Math.cos(a) * (R_SIDE - 7) + rgt.x * -6.6 + fwd.x * -3.4;
    const wsz = Math.sin(a) * (R_SIDE - 7) + rgt.z * -6.6 + fwd.z * -3.4;
    this.cCyl(wsx, 0, wsz, 0.5, 2.6, { surface: 'marble' });
    this.marks.saveShrine = new THREE.Vector3(HUB.x + wsx, HUB.y + 1.2, HUB.z + wsz);
    this.anim((dt, t, gm) => {
      const hands = face.userData.hands;
      const hour = gm.time.hour + gm.time.minute / 60;
      if (hands[0]) hands[0].rotation.z = -(hour / 12) * TAU;
      if (hands[1]) hands[1].rotation.z = -(gm.time.minute / 60) * TAU;
      sLight.intensity = 2.0 + Math.sin(t * 1.5) * 0.4;
    });

    // crates to stack: the alternate route up to the clerestory ledge
    for (let i = 0; i < 5; i++) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), M.woodDark);
      const wx = Math.cos(a) * (R_SIDE - 12) + rgt.x * (-2 + i * 1.15) + fwd.x * (-2 - (i % 2));
      const wz = Math.sin(a) * (R_SIDE - 12) + rgt.z * (-2 + i * 1.15) + fwd.z * (-2 - (i % 2));
      crate.position.set(HUB.x + wx, 0.46, HUB.z + wz);
      crate.castShadow = crate.receiveShadow = true;
      this.game.scene.add(crate);
      const b = new Body({ pos: crate.position.clone(), r: 0.62, mass: 34, object: crate, surface: 'wood' });
      const c = sphere(b.pos.x, b.pos.y, b.pos.z, b.r, { layer: LAYER.PROP, surface: 'wood' });
      c.body = b; b.collider = c;
      this.game.world.add(c);
      this.game.world.props.push(b);
    }
  }

  /* -------------------------------------------------------- GARDENS */

  buildGardens() {
    // reflecting channels and planting between the bays, so the atrium reads
    // as somewhere maintained rather than as an arena
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU - Math.PI / 2 + TAU / 16;
      const r = R_OUT - 8;
      const lit = i % 2 === 0;          // only every other bay carries a sconce
      const x = Math.cos(a) * r, z = Math.sin(a) * r;

      const pool = new THREE.Mesh(new THREE.CircleGeometry(2.6, 24),
        new THREE.MeshPhongMaterial({ color: 0x2a3a52, specular: 0xffffff, shininess: 260,
          transparent: true, opacity: 0.9 }));
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(x, 0.03, z);
      this.root.add(pool);
      const kerb = new THREE.Mesh(new THREE.TorusGeometry(2.7, 0.18, 8, 30), M.marbleCream);
      kerb.rotation.x = Math.PI / 2; kerb.position.set(x, 0.14, z);
      this.root.add(kerb);
      this.cCyl(x, 0, z, 2.9, 0.3, { surface: 'marble' });

      // a palm at each pool, and an urn
      const palm = Obj.pottedPalm({ kind: i % 2 ? 'palm' : 'fan', height: i % 2 ? 3.4 : 1.8,
        potH: 0.8, potR: 0.44, seed: i * 5 + 2 });
      const px = Math.cos(a + 0.30) * (r + 2.6), pz = Math.sin(a + 0.30) * (r + 2.6);
      palm.position.set(px, 0, pz);
      const plant = palm.userData.plant;
      this.root.add(palm);
      this.cCyl(px, 0, pz, 0.5, 0.8, { surface: 'marble' });
      const ph = i * 1.1;
      this.anim((dt, t) => {
        plant.rotation.z = Math.sin(t * 0.9 + ph) * 0.028;
        plant.rotation.x = Math.cos(t * 0.7 + ph) * 0.022;
      });

      // a sconce on the pier
      if (!lit) continue;
      const sc = new THREE.PointLight(0xffd0a0, 2.4, 22, 2);
      sc.position.set(Math.cos(a) * (R_OUT - 2.4), 4.5, Math.sin(a) * (R_OUT - 2.4));
      this.root.add(sc);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xffe0bc, toneMapped: false }));
      bulb.position.copy(sc.position);
      this.root.add(bulb);
      this.anim((dt, t) => { sc.intensity = 1.4 + Math.sin(t * 6 + i) * 0.12; });
    }
  }

  /* ------------------------------------------------------------ SKY */

  buildSky() {
    // the atrium sits under its own weather: a dark violet dusk with the
    // level's binary drifting through it, far overhead
    const drift = new THREE.Group();
    drift.position.y = 30;
    this.root.add(drift);
    const geo = new THREE.PlaneGeometry(1, 1);
    const mats = [
      new THREE.MeshBasicMaterial({ map: T.glyph1, transparent: true, alphaTest: 0.08,
        depthWrite: false, side: THREE.DoubleSide, opacity: 0.30 }),
      new THREE.MeshBasicMaterial({ map: T.glyph0, transparent: true, alphaTest: 0.08,
        depthWrite: false, side: THREE.DoubleSide, opacity: 0.30 }),
    ];
    const motes = [];
    const n = Math.round(70 * this.detail);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, mats[i % 2]);
      m.position.set(rand(-R_OUT, R_OUT), rand(-6, 26), rand(-R_OUT, R_OUT));
      m.scale.setScalar(rand(0.7, 2.4));
      m.rotation.set(rand(0, TAU), rand(0, TAU), rand(0, TAU));
      drift.add(m);
      motes.push({ m, rate: rand(0.3, 1.1), sx: rand(-0.4, 0.4), sy: rand(-0.5, 0.5) });
    }
    this.anim((dt) => {
      for (const o of motes) {
        o.m.position.y += o.rate * dt;
        if (o.m.position.y > 28) o.m.position.y = -8;
        o.m.rotation.x += o.sx * dt;
        o.m.rotation.y += o.sy * dt;
      }
    });
  }

  /* ----------------------------------------------------------- STATE */

  setGateOpen(key, open) {
    const rec = this.gates.get(key);
    if (!rec || rec.open === open) return;
    rec.open = open;
    rec.blocker.enabled = !open;
  }

  /** Sync every gate against what the player is carrying. */
  refreshGates(inventory) {
    for (const [key, rec] of this.gates) {
      const sig = rec.bay.sigil;
      this.setGateOpen(key, !sig || inventory.has(sig));
    }
  }

  /** Which gate is the player standing in, if any? */
  gateAt(pos) {
    for (const [key, rec] of this.gates) {
      if (!rec.open) continue;
      const p = rec.grp.getWorldPosition(new THREE.Vector3());
      if (p.distanceTo(pos) < 3.4) return key;
    }
    return null;
  }

  update(realDt, game) {
    const t = game.time.realNow;
    for (const fn of this.animated) fn(realDt, t, game);
    for (const rel of this.vitrines.values()) rel.update(realDt, game.camera, realDt);
  }

    /** Small engraved brass plate, used for gate names and vitrine labels. */
  makePlate(text, w = 3.0, h = 0.46, colour = 0xffd98a, sub = '') {
    const c = document.createElement('canvas');
    c.width = 768; c.height = 112;
    const g = c.getContext('2d');
    g.fillStyle = '#0b0d11'; g.fillRect(0, 0, 768, 112);
    g.strokeStyle = '#c8a24a'; g.lineWidth = 5; g.strokeRect(7, 7, 754, 98);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#' + colour.toString(16).padStart(6, '0');
    g.font = `600 ${sub ? 38 : 46}px Verdana, sans-serif`;
    g.fillText(text.toUpperCase().slice(0, 30), 384, sub ? 44 : 56);
    if (sub) {
      g.font = '400 24px Verdana, sans-serif';
      g.fillStyle = '#8a8272';
      g.fillText(sub.toUpperCase().slice(0, 44), 384, 82);
    }
    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: tx, transparent: true }));
  }
}
