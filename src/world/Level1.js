/* SILICONE DREAMS — Chapter One: THE TERMINAL HOUR
 *
 * Four rooms, one for each plate.
 *
 *   A  THE TERMINAL TEMPLE     violet dusk, checkered carpet, a beige box
 *                              running a Botticelli
 *   B  THE MIRROR OF FACES     noon blue, a perfect reflecting plane, ranks
 *                              of circuit-board masks
 *   C  THE COLONNADE OF HOURS  starfield, marble arcade, longcase clock,
 *                              hourglass, a sundial the size of a room
 *   D  THE NEXUS OF SUN & MOON the star platform, the sleeping sun, the
 *                              runic moon, the Earth on its stair
 *
 * Laid out along -Z so the player walks one continuous line from the temple
 * to the nexus, crossing a colonnade bridge between each.
 */
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { M, T, rep } from './Materials.js';
import * as Arch from './Arch.js';
import * as Obj from './Objects.js';
import { box, boxMinMax, cyl, sphere, LAYER, Body, Trigger } from './Physics.js';
import { CloudField, Sea, pinkIsland, starField } from '../render/Sky.js';
import { rand, randInt, clamp, lerp, pick } from '../core/Time.js';
import { cfg } from '../core/Config.js';
import { bakeStatic, keepDynamic, ZoneCuller } from './Batch.js';

const TAU = Math.PI * 2;

/* ============================================================ ANCHORS */

export const ZONE = {
  A: { name: 'temple',    x: 0, z: 0,    env: 'temple' },
  B: { name: 'mirror',    x: 0, z: -168, env: 'mirror' },
  C: { name: 'colonnade', x: 0, z: -352, env: 'colonnade' },
  D: { name: 'nexus',     x: 0, z: -520, env: 'nexus' },
};

/* =========================================================== BUILDER */

class Builder {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.world = game.world;
    this.animated = [];
    this.props = [];
    // one shared mark table: B.mark() and game.marks.x are the same object,
    // so it does not matter which one a builder reaches for
    game.marks = game.marks || {};
    this.marks = game.marks;
  }
  add(obj) { this.scene.add(obj); return obj; }
  at(obj, x, y, z, ry = 0) { obj.position.set(x, y, z); obj.rotation.y = ry; return this.add(obj); }
  box(...a) { return this.world.add(box(...a)); }
  boxMM(...a) { return this.world.add(boxMinMax(...a)); }
  cyl(...a) { return this.world.add(cyl(...a)); }
  sphere(...a) { return this.world.add(sphere(...a)); }
  anim(fn) { this.animated.push(fn); return fn; }
  mark(name, x, y, z) { this.marks[name] = new THREE.Vector3(x, y, z); return this.marks[name]; }

  /** A dynamic prop: mesh + rigid body + collider, grabbable by the manipulator. */
  prop(obj, opt = {}) {
    const g = this.game;
    const b = new Body({
      pos: obj.position.clone(),
      r: opt.r || 0.4, mass: opt.mass || 22,
      restitution: opt.restitution ?? 0.24,
      friction: opt.friction ?? 0.7,
      object: obj, surface: opt.surface || 'marble',
    });
    const c = sphere(b.pos.x, b.pos.y, b.pos.z, b.r, { layer: LAYER.PROP, surface: b.surface });
    c.body = b;
    b.collider = c;
    this.world.add(c);
    this.world.props.push(b);
    b.onImpact = (v, p, s) => {
      if (v > 3.5) {
        g.fx.impact(p, new THREE.Vector3(0, 1, 0), { surface: s, sparks: Math.min(10, v | 0) });
        g.audio?.play?.('impact_marble', p, { vol: clamp(v / 14, 0.2, 1) });
      }
      // a thrown prop is a weapon
      if (b.thrownBy === 'player' && v > 6) {
        for (const e of g.enemies) {
          if (!e.alive) continue;
          if (e.position.distanceTo(p) < e.radius + b.r + 0.7) {
            e.damage(clamp(v * 4, 15, 90), p, b.vel.clone().normalize(), 'prop');
            b.thrownBy = null;
            break;
          }
        }
      }
    };
    this.props.push(b);
    return b;
  }
}

/* ================================================== SHARED FURNITURE */

/** A run of the colonnade bridge that connects the zones. */
function bridge(B, opt) {
  const {
    x = 0, z0 = 0, z1 = -40, width = 9, y = 0, arches = true,
    mat = M.checkerColonnade, tile = 2.2, archMat = M.rustStone,
    colMat = M.marbleRose, rail = true, spacing = 6.0,
    collide = true,
  } = opt;
  const len = Math.abs(z1 - z0);
  const cz = (z0 + z1) / 2;
  const g = new THREE.Group();

  const deck = Arch.deck(width, len, { mat, tile, thickness: 0.6, edgeMat: M.marbleGrey });
  g.add(deck);
  B.at(g, x, y, cz);
  if (collide) {
    B.box(x, y - 0.3, cz, width / 2, 0.3, len / 2, { surface: 'marble' });
    // invisible clip walls so nothing walks off the edge into the void
    for (const s of [-1, 1]) {
      B.box(x + s * (width / 2 + 0.4), y + 1.6, cz, 0.4, 2.0, len / 2, { layer: LAYER.CLIP, surface: 'marble' });
    }
  }

  if (arches) {
    const n = Math.max(2, Math.round(len / spacing));
    const ag = Arch.arcade({
      count: n, spacing: len / n, span: width - 2.4, legH: 3.2, thick: 0.42,
      depth: 0.55, mat: archMat, colMat, columns: true,
      startAt: -len / 2 + spacing * 0.5,
    });
    ag.position.set(0, 0, 0);
    g.add(ag);
    if (collide) {
      for (let i = 0; i < n; i++) {
        const az = -len / 2 + spacing * 0.5 + i * (len / n);
        for (const s of [-1, 1]) {
          B.cyl(x + s * (width / 2 - 1.0), y, cz + az, 0.30, 3.4, { surface: 'marble' });
        }
      }
    }
  }
  if (rail) {
    for (const s of [-1, 1]) {
      const bal = Arch.balustrade(len, { axis: 'z', h: 0.85, mat: M.marbleGrey, spacing: 0.55 });
      bal.position.set(s * (width / 2 - 0.18), 0, 0);
      g.add(bal);
    }
  }
  return g;
}

/** Sconce: a brass bowl of caught light. Cheap, and it sells the scale. */
function sconce(B, x, y, z, colour = 0xffd9a0, intensity = 1.4, dist = 14) {
  const grp = new THREE.Group();
  const bowl = new THREE.Mesh(Arch.lathe([
    [0.02, 0], [0.10, 0.03], [0.16, 0.11], [0.20, 0.20], [0.20, 0.24], [0.16, 0.24],
  ], 14), M.brass);
  grp.add(bowl);
  const flame = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({
    map: T.glow, color: colour, transparent: true, opacity: 0.75,
    blending: THREE.AdditiveBlending, depthWrite: false }));
  flame.position.y = 0.22;
  grp.add(flame);
  const light = new THREE.PointLight(colour, intensity, dist, 2);
  light.position.y = 0.42;
  grp.add(light);
  flame.scale.setScalar(0.55);
  B.at(grp, x, y, z);
  B.game.registerCullable(grp, x, z, 110);
  const phase = rand(0, 7);
  B.anim((dt, t, game) => {
    const f = 0.82 + Math.sin(t * 7 + phase) * 0.10 + Math.sin(t * 17.3 + phase) * 0.06;
    light.intensity = intensity * f;
    flame.material.opacity = 0.34 * f;
    flame.scale.setScalar(0.55 * (0.9 + f * 0.2));
    flame.quaternion.copy(game.camera.quaternion);
  });
  return grp;
}

/* ======================================================== ZONE A */

/**
 * THE TERMINAL TEMPLE. Plate 1, as exactly as geometry allows: a white
 * marble plaza on a violet sea, a five-column pavilion, pink-and-black
 * checkered runners, potted palms, and the beige box running the Venus.
 */
function buildTemple(B, game) {
  const A = ZONE.A;
  const g = new THREE.Group();
  B.at(g, A.x, 0, A.z);

  // --- the plaza ------------------------------------------------------
  const PW = 52, PD = 54;
  const plaza = Arch.deck(PW, PD, { mat: M.checkerPlaza, tile: 3.2, thickness: 1.4, edgeMat: M.marbleGrey });
  g.add(plaza);
  B.box(A.x, -0.7, A.z, PW / 2, 0.7, PD / 2, { surface: 'marble' });

  // a raised dais under the pavilion, as in the plate
  const dais = Arch.deck(18, 18, { mat: M.checkerPlaza, tile: 2.4, thickness: 0.45, edgeMat: M.marbleCream, y: 0.45 });
  dais.position.set(0, 0, -5);
  g.add(dais);
  B.box(A.x, 0.22, A.z - 5, 9, 0.23, 9, { surface: 'marble' });
  // two shallow steps up to it
  for (let i = 0; i < 2; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(18 + i * 1.2, 0.22, 18 + i * 1.2), M.marbleCream);
    s.position.set(0, 0.11 + (1 - i) * 0.22, -5);
    s.receiveShadow = true;
    g.add(s);
    B.box(A.x, 0.11 + (1 - i) * 0.22, A.z - 5, (18 + i * 1.2) / 2, 0.11, (18 + i * 1.2) / 2, { surface: 'marble' });
  }

  // --- pink-and-black runners ----------------------------------------
  const runner = (w, d, x, z, ry) => {
    const mat = M.carpet.clone();
    mat.map = rep(T.carpet, w / 3, d / 3);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = ry;
    m.position.set(x, 0.472, z);
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  // the long runner sweeping in from the plaza's southwest corner
  const r1 = runner(6.4, 34, -9, 14, 0);
  r1.position.y = 0.012;
  r1.rotation.z = -0.20;
  const r2 = runner(6.0, 26, 9.5, 6, 0);
  r2.position.y = 0.012;
  r2.rotation.z = 0.28;
  runner(15, 15, 0, -5, 0);

  // --- the pavilion ---------------------------------------------------
  const pav = Arch.pavilion({ w: 7.4, d: 7.0, colH: 6.6, roofH: 0.95, overhang: 1.4, style: 'white' });
  pav.position.set(0, 0.47, -5);
  g.add(pav);
  for (const c of pav.userData.columns) {
    B.cyl(A.x + c.x, 0.45, A.z - 5 + c.z, 0.52, 6.6, { surface: 'marble' });
  }
  const rb = pav.userData.roofBox;
  B.box(A.x, 0.47 + rb.y, A.z - 5, rb.w / 2, rb.h / 2, rb.d / 2, { surface: 'marble' });

  // ivy climbing three of the five columns, as in the plate
  for (const [cx, cz, seed] of [[-3.7, -3.5, 1], [3.7, -1.5, 5], [0, -8.5, 9]]) {
    const ivy = Arch.ivyVine({ height: 6.2, radius: 0.46, turns: 3.4, leaves: 54, seed });
    ivy.position.set(cx, 0.47, cz);
    // 54 leaf quads become one mesh; the whole vine then breathes as a unit
    bakeStatic(ivy);
    keepDynamic(ivy);
    g.add(ivy);
    const ivyPhase = seed * 1.7;
    B.anim((dt, t) => {
      ivy.rotation.z = Math.sin(t * 0.7 + ivyPhase) * 0.012;
      ivy.rotation.x = Math.cos(t * 0.53 + ivyPhase) * 0.010;
    });
  }

  // --- the terminal ---------------------------------------------------
  const desk = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.76, 1.05), M.marbleCream);
  desk.position.set(0, 0.47 + 0.38, -6.2);
  desk.castShadow = desk.receiveShadow = true;
  g.add(desk);
  B.box(A.x, 0.85, A.z - 6.2, 1.0, 0.38, 0.53, { surface: 'marble' });

  const term = Obj.terminal({ scale: 1.0 });
  term.position.set(0, 0.47 + 0.76, -6.35);
  term.rotation.y = Math.PI;                 // facing the player's approach
  bakeStatic(term);              // ~100 keycaps and vents collapse to a handful
  keepDynamic(term);
  g.add(term);
  B.mark('terminal', A.x, 0.47 + 0.76, A.z - 6.35);
  game.terminal = term;

  // the screen becomes a live canvas the Director can write to
  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = 512; screenCanvas.height = 512;
  const screenTex = new THREE.CanvasTexture(screenCanvas);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  game.screen = { canvas: screenCanvas, ctx: screenCanvas.getContext('2d'), tex: screenTex, mode: 'venus' };
  term.userData.screenMat.map = screenTex;

  B.anim((dt, t, gm) => {
    term.userData.powerLed.material.color.setHSL(0.33, 1, 0.4 + Math.sin(t * 3) * 0.2);
    term.userData.screenBloom.quaternion.copy(gm.camera.quaternion);
    term.userData.screenBloom.material.opacity = 0.18 + Math.sin(t * 9) * 0.03;
  });

  // --- planting -------------------------------------------------------
  const plantSpots = [
    [-6.4, -9.6, 'palm', 2.6, 0.66], [6.6, -9.2, 'palm', 2.3, 0.62],
    [-5.4, -1.2, 'fern', 1.0, 0.50], [5.2, -2.0, 'fern', 1.1, 0.52],
    [-2.6, -9.9, 'fan', 1.5, 0.55], [2.9, -10.1, 'fan', 1.4, 0.55],
    [-11.5, 2.5, 'palm', 3.1, 0.74], [11.8, 1.0, 'palm', 2.9, 0.72],
    [-13.5, -12.0, 'palm', 3.4, 0.78], [13.2, -13.5, 'palm', 3.2, 0.76],
    [-1.9, 3.4, 'fan', 1.3, 0.52], [2.4, 4.2, 'fern', 1.0, 0.5],
    [-17.0, 8.0, 'palm', 3.6, 0.8], [16.5, 9.5, 'palm', 3.3, 0.78],
    [-8.0, 14.0, 'fan', 1.6, 0.58], [8.6, 15.2, 'fan', 1.5, 0.56],
  ];
  plantSpots.forEach(([x, z, kind, h, potH], i) => {
    const p = Obj.pottedPalm({
      kind, height: h, potH, potR: potH * 0.52, seed: i * 7 + 3,
      potStyle: i % 3 === 0 ? 'vase' : 'urn',
    });
    const onDais = Math.abs(x) < 9 && Math.abs(z + 5) < 9;
    p.position.set(x, onDais ? 0.47 : 0, z);
    const plant = p.userData.plant;
    bakeStatic(plant);
    keepDynamic(plant);
    g.add(p);
    B.cyl(A.x + x, p.position.y, A.z + z, potH * 0.58, potH, { surface: 'marble' });
    const ph = i * 1.31;
    B.anim((dt, t) => {
      // wind: the crown leans and twists, the pot does not
      plant.rotation.z = Math.sin(t * 0.9 + ph) * 0.030 + Math.sin(t * 2.3 + ph) * 0.008;
      plant.rotation.x = Math.cos(t * 0.75 + ph) * 0.024;
      plant.rotation.y = Math.sin(t * 0.4 + ph) * 0.05;
    });
  });

  // --- loose urns the manipulator can throw ---------------------------
  for (const [x, z] of [[-4.2, 2.6], [4.6, 3.4], [-9.0, -5.0], [9.4, -4.2], [0.6, 8.8], [-14, 4]]) {
    const u = Obj.urn({ h: 0.7, r: 0.34, style: 'vase' });
    u.position.set(A.x + x, 0.36, A.z + z);
    B.add(u);
    B.prop(u, { r: 0.42, mass: 26, surface: 'marble' });
  }

  // --- the sea, the sky, the island ------------------------------------
  game.sea = new Sea(game.scene, {
    size: 3000, segs: 110, y: -7.0,
    shallow: 0x6f78bc, deep: 0x2d3068, sky: 0x9084c4, sun: 0xffe8c0,
    sunDir: new THREE.Vector3(0.42, 0.62, -0.66).normalize(),
  });
  const island = pinkIsland({ r: 150, h: 58, seed: 11 });
  island.position.set(A.x - 430, -7, A.z - 320);
  keepDynamic(island);
  g.add(island);                       // in the zone group, so it culls with it
  const island2 = pinkIsland({ r: 96, h: 34, seed: 27, colour: 0xc79ac0 });
  island2.position.set(A.x + 520, -7, A.z - 280);
  island2.scale.setScalar(0.9);
  keepDynamic(island2);
  g.add(island2);

  game.clouds = new CloudField(game.scene, {
    count: 30, radius: 700, yMin: 70, yMax: 260, scale: 110,
    tex: T.cloud, colour: 0xf2ecff, opacity: 0.85, drift: 1.4,
  });

  // --- lighting furniture ---------------------------------------------
  sconce(B, A.x - 7.6, 1.4, A.z - 9.4, 0xffd0a0, 1.1, 13);
  sconce(B, A.x + 7.6, 1.4, A.z - 9.4, 0xffd0a0, 1.1, 13);
  sconce(B, A.x, 1.9, A.z - 6.2, 0xbfe0ff, 0.7, 8);

  // --- the north gate -------------------------------------------------
  const gateZ = A.z - PD / 2 + 1.5;
  const barrier = game.addBarrier({ x: A.x, y: 0, z: gateZ, w: 9.4, h: 7, colour: 0x8fd8ff });
  game.marks.templeGate = barrier;
  for (const s of [-1, 1]) {
    const c = Arch.corinthianColumn({ height: 7.4, style: 'white', rBottom: 0.5, rTop: 0.4 });
    c.position.set(A.x + s * 5.6, 0, gateZ);
    B.add(c);
    B.cyl(A.x + s * 5.6, 0, gateZ, 0.56, 7.4, { surface: 'marble' });
  }

  // --- the gnomon, waiting in its plinth --------------------------------
  B.mark('gnomonPlinth', A.x + 4.0, 1.05, A.z + 6.0);
  B.mark('spawn', A.x + 1.5, 0.1, A.z + 20);
  B.mark('templeCentre', A.x, 0.5, A.z - 5);
  return g;
}

/* ======================================================== ZONE B */

/**
 * THE MIRROR OF FACES. Plate 3: a photographic blue sky over a perfect
 * reflecting plane, and rank on rank of circuit-board masks receding to a
 * vanishing point. Most of them are asleep. Most.
 */
function buildMirror(B, game) {
  const Z = ZONE.B;
  const g = new THREE.Group();
  B.at(g, Z.x, 0, Z.z);

  const SIZE = 150;

  // --- the mirror -----------------------------------------------------
  if (cfg.r_reflections) {
    const refl = new Reflector(new THREE.PlaneGeometry(SIZE, SIZE), {
      textureWidth: 512, textureHeight: 512,
      color: 0xc8d8e8, clipBias: 0.006,
    });
    refl.rotation.x = -Math.PI / 2;
    refl.position.y = 0.001;
    keepDynamic(refl);
    g.add(refl);
    game.reflector = refl;
  }
  // a faint glaze over the mirror so it is a surface, not a hole
  const glaze = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), new THREE.MeshPhongMaterial({
    color: 0xdfeaf6, specular: 0xffffff, shininess: 260,
    transparent: true, opacity: cfg.r_reflections ? 0.10 : 0.96, depthWrite: !cfg.r_reflections,
  }));
  glaze.rotation.x = -Math.PI / 2;
  glaze.position.y = 0.004;
  glaze.receiveShadow = !cfg.r_reflections;
  keepDynamic(glaze);
  g.add(glaze);
  B.box(Z.x, -1.0, Z.z, SIZE / 2, 1.0, SIZE / 2, { surface: 'marble' });

  // --- the ranks of faces ----------------------------------------------
  // Plate 3's composition: one line marching to the horizon on the left,
  // a scatter of larger ones nearer the eye, all reflected below.
  const dormant = [];
  const line = (x0, z0, dx, dz, n, size0, shrink, y0) => {
    for (let i = 0; i < n; i++) {
      const s = size0 * Math.pow(shrink, i);
      const p = new THREE.Vector3(Z.x + x0 + dx * i, y0 + s * 1.1 + Math.sin(i * 1.7) * 0.6, Z.z + z0 + dz * i);
      dormant.push({ pos: p, size: s });
    }
  };
  line(-30, 42, -1.9, -5.2, 12, 2.0, 0.90, 4.5);
  line(-4, 30, 2.4, -6.0, 10, 2.3, 0.90, 5.2);
  line(28, 34, 3.0, -5.4, 8, 2.1, 0.90, 4.8);
  line(10, -6, -3.6, -6.4, 7, 2.6, 0.92, 6.0);
  line(-40, -20, 3.2, -6.6, 6, 2.4, 0.92, 5.4);
  for (let i = 0; i < 10; i++) {
    dormant.push({
      pos: new THREE.Vector3(Z.x + rand(-58, 58), rand(3.5, 13), Z.z + rand(-62, 30)),
      size: rand(1.4, 3.0),
    });
  }
  game.marks.mirrorChoir = dormant;

  // The Choir itself. Plate 3 is nothing but these: rank on rank of hollow
  // circuit-board faces hanging over their own reflections. They are built
  // as one merged mesh — they do not move until the moment they all do.
  const choir = new THREE.Group();
  const maskGeo = Obj.faceMaskGeometry({ segU: 64, segV: 52 });
  for (const c of dormant) {
    const m = new THREE.Mesh(maskGeo, M.pcb);
    m.position.copy(c.pos).sub(new THREE.Vector3(Z.x, 0, Z.z));  // group-local
    m.scale.setScalar(c.size);
    // Plate 3 has them all looking the same way, down the line. The player
    // arrives from +Z, and the mask's face is its +Z, so: roughly zero.
    m.rotation.y = rand(-0.34, 0.34);
    m.rotation.z = rand(-0.09, 0.09);
    m.rotation.x = rand(-0.06, 0.06);
    m.castShadow = true;
    choir.add(m);
    c.rotY = m.rotation.y;
  }
  bakeStatic(choir);
  keepDynamic(choir);
  g.add(choir);
  game.marks.choirMesh = choir;
  B.anim((dt, t) => {
    if (!choir.visible) return;
    // the whole plane of them breathes together, very slightly
    choir.position.y = Math.sin(t * 0.32) * 0.16;
    choir.rotation.y = Math.sin(t * 0.11) * 0.006;
  });

  // --- the chronoliths that keep the choir asleep ------------------------
  const lithSpots = [[-34, 6, -26], [33, 6.5, -20], [0, 7.5, -52]];
  game.marks.chronoliths = [];
  lithSpots.forEach(([x, y, z], i) => {
    const c = Obj.chronolith({ r: 0.8, colour: 0x8fe8ff });
    c.position.set(Z.x + x, y, Z.z + z);
    B.add(c);
    // a slender pylon holding it up out of the mirror
    const py = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.42, y, 12), M.marbleGrey);
    py.position.set(Z.x + x, y / 2, Z.z + z);
    py.castShadow = py.receiveShadow = true;
    B.add(py);
    B.cyl(Z.x + x, 0, Z.z + z, 0.44, y - 1.2, { surface: 'marble' });
    const lith = {
      obj: c, health: 160, alive: true, index: i,
      pos: c.position.clone(), radius: 1.3,
    };
    game.marks.chronoliths.push(lith);
    B.anim((dt, t) => {
      if (!lith.alive) return;
      c.rotation.y += dt * 0.5;
      c.userData.core.rotation.x += dt * 0.9;
      c.userData.core.rotation.z += dt * 0.6;
      c.userData.rings[0].rotation.x += dt * 0.7;
      c.userData.rings[1].rotation.y += dt * 0.9;
      c.userData.rings[2].rotation.z += dt * 0.5;
      c.userData.halo.quaternion.copy(game.camera.quaternion);
      c.userData.halo.material.opacity = 0.22 + Math.sin(t * 2.4 + i) * 0.08;
      c.position.y = y + Math.sin(t * 0.9 + i * 2) * 0.22;
    });
  });

  // --- islands of marble to fight on ------------------------------------
  const pads = [
    [0, 0, 0, 22, 0.6], [-30, 0, -24, 12, 0.9], [30, 0, -18, 12, 0.9],
    [0, 0, -50, 15, 1.4], [-18, 0, 24, 9, 0.5], [20, 0, 26, 9, 0.5],
  ];
  for (const [x, y, z, r, h] of pads) {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.94, h, 28), M.marbleWhite);
    pad.position.set(Z.x + x, y + h / 2, Z.z + z);
    pad.receiveShadow = true; pad.castShadow = true;
    B.add(pad);
    B.cyl(Z.x + x, y, Z.z + z, r, h, { surface: 'marble' });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.10, 6, 40), M.gold);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(Z.x + x, y + h + 0.02, Z.z + z);
    B.add(ring);
  }

  // a few columns standing in the water, catching the sun
  for (const [x, z, h] of [[-44, 8, 8.5], [44, -2, 7.5], [-14, -68, 9.5], [16, -70, 8.8], [-52, -40, 7]]) {
    const c = Arch.corinthianColumn({ height: h, style: 'white', rBottom: 0.46, rTop: 0.37 });
    c.position.set(Z.x + x, 0, Z.z + z);
    B.add(c);
    B.cyl(Z.x + x, 0, Z.z + z, 0.52, h, { surface: 'marble' });
  }

  game.marks.mirrorCentre = new THREE.Vector3(Z.x, 1, Z.z);
  game.marks.pistolPlinth = new THREE.Vector3(Z.x - 6, 1.3, Z.z + 8);

  // --- the east gate to the colonnade -----------------------------------
  const gateZ = Z.z - 62;
  const bar = game.addBarrier({ x: Z.x, y: 1.4, z: gateZ, w: 10, h: 7, colour: 0x8fd8ff });
  game.marks.mirrorGate = bar;
  for (const s of [-1, 1]) {
    const c = Arch.corinthianColumn({ height: 8, style: 'white', rBottom: 0.5, rTop: 0.4 });
    c.position.set(Z.x + s * 6, 1.4, gateZ);
    B.add(c);
    B.cyl(Z.x + s * 6, 1.4, gateZ, 0.56, 8, { surface: 'marble' });
  }
  return g;
}

/* ======================================================== ZONE C */

/**
 * THE COLONNADE OF HOURS. Plate 4: a marble checkerboard causeway under
 * rose-stone arches, hung in a starfield, with the three timepieces —
 * the longcase clock, the hourglass, and the great floor sundial.
 */
function buildColonnade(B, game) {
  const Z = ZONE.C;
  const g = new THREE.Group();
  B.at(g, Z.x, 0, Z.z);

  // --- the causeway ----------------------------------------------------
  const W = 16, L = 130;
  const deck = Arch.deck(W, L, { mat: M.checkerColonnade, tile: 2.2, thickness: 1.1, edgeMat: M.marbleGrey });
  g.add(deck);
  B.box(Z.x, -0.55, Z.z, W / 2, 0.55, L / 2, { surface: 'marble' });
  for (const s of [-1, 1]) B.box(Z.x + s * (W / 2 + 0.5), 2.0, Z.z, 0.5, 2.4, L / 2, { layer: LAYER.CLIP });

  // the arcade: identical arches marching to a vanishing point
  const N = 22, SP = L / N;
  const arc = Arch.arcade({
    count: N, spacing: SP, span: W - 4.6, legH: 4.2, thick: 0.62, depth: 0.8,
    mat: M.rustStone, colMat: M.marbleRose, columns: true, startAt: -L / 2 + SP * 0.5,
  });
  g.add(arc);
  for (let i = 0; i < N; i++) {
    const az = -L / 2 + SP * 0.5 + i * SP;
    for (const s of [-1, 1]) B.cyl(Z.x + s * (W / 2 - 1.7), 0, Z.z + az, 0.34, 4.4, { surface: 'marble' });
  }

  // a second, narrower arcade branching east — plate 2's other arm
  const sideL = 56;
  const side = new THREE.Group();
  const sideDeck = Arch.deck(10, sideL, { mat: M.checkerColonnade, tile: 2.2, thickness: 0.9, edgeMat: M.marbleGrey });
  side.add(sideDeck);
  side.rotation.y = Math.PI / 2;
  side.position.set(W / 2 + sideL / 2 - 2, 0, -18);
  g.add(side);
  B.box(Z.x + W / 2 + sideL / 2 - 2, -0.45, Z.z - 18, sideL / 2, 0.45, 5, { surface: 'marble' });
  const sideArc = Arch.arcade({
    count: 10, spacing: sideL / 10, span: 6.2, legH: 3.6, thick: 0.5, depth: 0.6,
    mat: M.rustStone, colMat: M.marbleRose, startAt: -sideL / 2 + 2.8,
  });
  sideArc.rotation.y = Math.PI / 2;
  sideArc.position.set(W / 2 + sideL / 2 - 2, 0, -18);
  g.add(sideArc);

  // --- the sundial plaza -----------------------------------------------
  const plazaZ = -6;
  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(15, 14.5, 1.1, 44), M.marbleGrey);
  plaza.position.set(0, -0.05, plazaZ);
  plaza.receiveShadow = true;
  g.add(plaza);
  const plazaTop = new THREE.Mesh(new THREE.CircleGeometry(15, 44), (() => {
    const m = M.checkerNexus.clone();
    m.map = rep(T.checkerNexus, 5, 5);
    return m;
  })());
  plazaTop.rotation.x = -Math.PI / 2;
  plazaTop.position.set(0, 0.51, plazaZ);
  plazaTop.receiveShadow = true;
  g.add(plazaTop);
  B.cyl(Z.x, -0.6, Z.z + plazaZ, 15, 1.11, { surface: 'marble' });

  const dial = Obj.sundial({ r: 6.6 });
  dial.position.set(0, 0.52, plazaZ);
  keepDynamic(dial);
  g.add(dial);
  game.marks.sundial = dial;
  B.box(Z.x, 0.52 + 1.2, Z.z + plazaZ, 0.2, 1.2, 2.6, { surface: 'metal' });
  B.anim((dt, t, gm) => {
    // the shadow tracks the Great Clock, not any sun
    const hour = gm.time.hour + gm.time.minute / 60;
    dial.userData.shadow.rotation.y = (hour / 12) * TAU + Math.PI;
    dial.userData.gnomon.rotation.z = Math.sin(t * 0.4) * 0.01;
  });

  // --- the longcase clock ----------------------------------------------
  const clock = Obj.grandfatherClock({ h: 3.4 });
  clock.position.set(-W / 2 + 2.2, 0.02, -34);
  clock.rotation.y = Math.PI / 2 + 0.12;
  keepDynamic(clock);
  g.add(clock);
  game.marks.greatClock = clock;
  B.box(Z.x - W / 2 + 2.2, 1.7, Z.z - 34, 0.5, 1.7, 0.85, { surface: 'wood' });
  const clockPed = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.3, 1.4), M.marbleCream);
  clockPed.position.set(-W / 2 + 2.2, 0.15, -34);
  g.add(clockPed);
  B.anim((dt, t, gm) => {
    const running = gm.marks.clockRunning ? 1 : 0;
    const swing = running ? Math.sin(t * 2.2) * 0.34 : Math.sin(t * 0.4) * 0.012;
    clock.userData.pendulum.rotation.z = swing;
    const hands = clock.userData.face.userData.hands;
    const hour = gm.time.hour + gm.time.minute / 60;
    if (hands[0]) hands[0].rotation.z = -(hour / 12) * TAU;
    if (hands[1]) hands[1].rotation.z = -(gm.time.minute / 60) * TAU;
    for (let i = 0; i < clock.userData.weights.length; i++) {
      clock.userData.weights[i].position.y = 3.4 * 0.56 - (running ? (t * 0.004) % 0.4 : 0);
    }
  });

  // --- the hourglass ---------------------------------------------------
  const hg = Obj.hourglass({ h: 2.4, r: 0.55 });
  hg.position.set(W / 2 - 2.6, 0.5, -26);
  keepDynamic(hg);
  g.add(hg);
  game.marks.hourglass = hg;
  const hgPed = Arch.pedestal({ w: 1.6, h: 0.5, d: 1.6, mat: M.marbleCream });
  hgPed.position.set(W / 2 - 2.6, 0, -26);
  g.add(hgPed);
  B.cyl(Z.x + W / 2 - 2.6, 0, Z.z - 26, 0.85, 2.9, { surface: 'metal' });
  B.anim((dt, t, gm) => {
    const running = gm.marks.clockRunning ? 1 : 0;
    const cycle = (t * 0.06) % 1;
    const k = running ? cycle : 0.5;
    hg.userData.sandTop.scale.setScalar(clamp(1 - k, 0.05, 1));
    hg.userData.sandTop.position.y = 2.4 * 0.72 - (1 - clamp(1 - k, 0.05, 1)) * 0.2;
    hg.userData.sandBot.scale.set(1, clamp(0.2 + k, 0.2, 1.6), 1);
    hg.userData.stream.visible = !!running;
    hg.userData.stream.material.opacity = 0.6 + Math.sin(t * 12) * 0.15;
  });

  // --- more clocks, because this is what the place is ---------------------
  for (const [x, z, r, ry] of [[-W / 2 + 0.8, -60, 1.5, Math.PI / 2], [W / 2 - 0.8, -74, 1.3, -Math.PI / 2],
                               [-W / 2 + 0.8, 34, 1.4, Math.PI / 2], [W / 2 - 0.8, 48, 1.2, -Math.PI / 2]]) {
    const f = Obj.clockFace({ r, dial: M.romanDial, rimMat: M.gold, hands: 2 });
    f.position.set(x, 4.6, z);
    f.rotation.y = ry;
    keepDynamic(f);
    g.add(f);
    const speed = rand(0.4, 2.6) * (Math.random() < 0.4 ? -1 : 1);
    B.anim((dt, t, gm) => {
      const hands = f.userData.hands;
      // none of them agree
      hands[0].rotation.z = -t * 0.07 * speed;
      hands[1].rotation.z = -t * 0.85 * speed;
    });
  }

  // --- floating debris in the void below --------------------------------
  for (let i = 0; i < 26; i++) {
    const kind = Math.random();
    let o;
    if (kind < 0.4) o = Obj.brokenColumn({ r: rand(0.3, 0.6), h: rand(0.6, 1.6), style: 'rose' });
    else if (kind < 0.7) o = new THREE.Mesh(new THREE.BoxGeometry(rand(1, 3), rand(0.3, 0.8), rand(1, 3)), M.marbleRose);
    else o = Obj.clockFace({ r: rand(0.5, 1.4), dial: M.romanDial, rimMat: M.goldDark, hands: 1 });
    o.position.set(Z.x + rand(-70, 70), rand(-40, -8), Z.z + rand(-80, 80));
    o.rotation.set(rand(0, 7), rand(0, 7), rand(0, 7));
    B.add(o);
    const sp = new THREE.Vector3(rand(-0.1, 0.1), rand(-0.1, 0.1), rand(-0.1, 0.1));
    B.anim((dt) => { o.rotation.x += sp.x * dt; o.rotation.y += sp.y * dt; o.rotation.z += sp.z * dt; });
  }

  // --- the Earth, far off the west side of the causeway (plate 4) --------
  const farEarth = Obj.globe({ r: 26, clouds: true, detail: 1 });
  farEarth.position.set(-150, 46, -70);
  keepDynamic(farEarth);
  g.add(farEarth);
  B.anim((dt) => {
    farEarth.userData.earth.rotation.y += dt * 0.008;
    if (farEarth.userData.clouds) farEarth.userData.clouds.rotation.y += dt * 0.011;
  });

  // --- lighting ---------------------------------------------------------
  for (let i = 0; i < 7; i++) {
    const z = -L / 2 + 10 + i * (L - 20) / 6;
    sconce(B, Z.x - W / 2 + 1.4, 3.2, Z.z + z, 0xffc487, 1.5, 20);
    sconce(B, Z.x + W / 2 - 1.4, 3.2, Z.z + z, 0xffc487, 1.5, 20);
  }

  // --- props to throw ----------------------------------------------------
  for (let i = 0; i < 8; i++) {
    const u = Obj.urn({ h: 0.8, r: 0.38, mat: M.marbleRose, style: 'vase' });
    u.position.set(Z.x + rand(-W / 2 + 2, W / 2 - 2), 0.42, Z.z + rand(-L / 2 + 8, L / 2 - 8));
    B.add(u);
    B.prop(u, { r: 0.46, mass: 30, surface: 'marble' });
  }

  game.marks.colonnadeEntry = new THREE.Vector3(Z.x, 0.2, Z.z + L / 2 - 6);
  game.marks.manipulatorPlinth = new THREE.Vector3(Z.x + 4.5, 1.3, Z.z + plazaZ + 9);
  game.marks.repeaterPlinth = new THREE.Vector3(Z.x - 4.5, 1.3, Z.z - 48);

  // --- the gate to the nexus ---------------------------------------------
  const gateZ = -L / 2 + 3;
  const bar = game.addBarrier({ x: Z.x, y: 0, z: Z.z + gateZ, w: 11, h: 8, colour: 0xffb45a });
  game.marks.colonnadeGate = bar;
  return g;
}

/* ======================================================== ZONE D */

/**
 * THE NEXUS OF SUN AND MOON. Plate 2: a star-shaped checkerboard platform
 * in the void, the sleeping bronze sun on one column, the runic moon-clock
 * on the other, the Earth on a marble stair between them, a golden key
 * lying where someone dropped it, and one broken column.
 */
function buildNexus(B, game) {
  const Z = ZONE.D;
  const g = new THREE.Group();
  B.at(g, Z.x, 0, Z.z);

  // --- the star platform -------------------------------------------------
  // a square core with four arms, exactly the silhouette of the plate
  const CORE = 30, ARM_W = 15, ARM_L = 17, THICK = 1.6;
  const mkSlab = (w, d, x, z) => {
    const top = new THREE.Mesh(new THREE.PlaneGeometry(w, d), (() => {
      const m = M.checkerNexus.clone();
      m.map = rep(T.checkerNexus, w / 4.4, d / 4.4);
      return m;
    })());
    top.rotation.x = -Math.PI / 2;
    top.position.set(x, 0, z);
    top.receiveShadow = true;
    g.add(top);
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, THICK, d), M.marbleRose);
    body.position.set(x, -THICK / 2 - 0.01, z);
    body.castShadow = body.receiveShadow = true;
    g.add(body);
    B.box(Z.x + x, -THICK / 2, Z.z + z, w / 2, THICK / 2, d / 2, { surface: 'marble' });
  };
  mkSlab(CORE, CORE, 0, 0);
  mkSlab(ARM_W, ARM_L, 0, -(CORE / 2 + ARM_L / 2));
  mkSlab(ARM_W, ARM_L, 0, (CORE / 2 + ARM_L / 2));
  mkSlab(ARM_L, ARM_W, -(CORE / 2 + ARM_L / 2), 0);
  mkSlab(ARM_L, ARM_W, (CORE / 2 + ARM_L / 2), 0);

  // low kerb around the rim so the boss's sweep is survivable
  const kerb = (w, d, x, z) => {
    const k = new THREE.Mesh(new THREE.BoxGeometry(w, 0.34, d), M.marbleCream);
    k.position.set(x, 0.17, z);
    k.receiveShadow = true;
    g.add(k);
    B.box(Z.x + x, 0.17, Z.z + z, w / 2, 0.17, d / 2, { surface: 'marble' });
  };
  for (const s of [-1, 1]) {
    kerb(CORE, 0.4, 0, s * CORE / 2);
    kerb(0.4, CORE, s * CORE / 2, 0);
  }

  // --- the two colonnaded arms of plate 2 ---------------------------------
  // The two colonnaded arms of plate 2. They start at the tip of the platform
  // arm and run outward — they must not march back across the centre, where
  // the sun, the moon and the Earth are.
  const ARM_START = CORE / 2 + ARM_L;      // 32: the outer edge of the X arms
  const ARM_RUN = 62;
  for (const dir of [-1, 1]) {
    const centreX = Z.x + dir * (ARM_START + ARM_RUN / 2);
    const b = bridge(B, {
      x: 0, z0: 0, z1: -ARM_RUN, width: 10, y: 0, spacing: 5.4,
      mat: M.checkerNexus, archMat: M.rustStone, colMat: M.marbleRose, rail: false,
      collide: false,      // rotated below; we register the real boxes ourselves
    });
    b.rotation.y = Math.PI / 2;
    b.position.set(centreX, 0, Z.z);
    B.box(centreX, -0.3, Z.z, ARM_RUN / 2, 0.3, 5, { surface: 'marble' });
    for (const s of [-1, 1]) {
      B.box(centreX, 1.6, Z.z + s * 5.4, ARM_RUN / 2, 2.0, 0.4, { layer: LAYER.CLIP });
    }
  }

  // --- the sun column ------------------------------------------------------
  const sunX = -12.5;
  const sunCol = Arch.corinthianColumn({ height: 7.6, style: 'rose', rBottom: 0.86, rTop: 0.74, capital: false, flutes: 20 });
  sunCol.position.set(sunX, 0, -2);
  g.add(sunCol);
  B.cyl(Z.x + sunX, 0, Z.z - 2, 0.95, 7.6, { surface: 'marble' });
  const sunCap = new THREE.Mesh(new THREE.CylinderGeometry(1.10, 0.92, 0.55, 20), M.marbleCream);
  sunCap.position.set(sunX, 7.75, -2);
  g.add(sunCap);
  const sun = Obj.sunRelief({ r: 3.1, rays: 16 });
  sun.position.set(sunX, 11.2, -2);
  sun.rotation.y = 0.42;
  keepDynamic(sun);
  g.add(sun);
  game.marks.sunRelief = sun;
  B.anim((dt, t, gm) => {
    // it breathes, very slowly, and it is definitely asleep
    sun.rotation.y = 0.42 + Math.sin(t * 0.11) * 0.06;
    sun.position.y = 11.2 + Math.sin(t * 0.23) * 0.08;
    sun.scale.setScalar(1 + Math.sin(t * 0.31) * 0.006);
  });
  const sunLight = new THREE.PointLight(0xffd9a0, 2.2, 40, 2);
  sunLight.position.set(Z.x + sunX + 2, 10.6, Z.z - 2 + 2);
  B.add(sunLight);
  B.game.registerCullable(sunLight, Z.x + sunX + 2, Z.z - 2 + 2, 120);

  // --- the moon column -----------------------------------------------------
  const moonX = 12.5;
  const moonCol = Arch.corinthianColumn({ height: 7.2, style: 'rose', rBottom: 0.86, rTop: 0.74, capital: false, flutes: 20 });
  moonCol.position.set(moonX, 0, -2);
  moonCol.rotation.z = -0.055;                 // leaning, as in the plate
  g.add(moonCol);
  B.cyl(Z.x + moonX, 0, Z.z - 2, 0.95, 7.2, { surface: 'marble' });
  const moonCap = new THREE.Mesh(new THREE.CylinderGeometry(1.10, 0.92, 0.55, 20), M.marbleCream);
  moonCap.position.set(moonX - 0.4, 7.4, -2);
  g.add(moonCap);
  const moon = Obj.moonClock({ r: 2.7, hands: 4 });
  moon.position.set(moonX - 0.5, 10.8, -2);
  moon.rotation.y = -0.38;
  keepDynamic(moon);
  g.add(moon);
  game.marks.moonClock = moon;
  B.anim((dt, t, gm) => {
    const hands = moon.userData.hands;
    const hour = gm.time.hour + gm.time.minute / 60;
    // four hands: hour, minute, and two that measure something else
    hands[0].rotation.z = -(hour / 12) * TAU;
    hands[1].rotation.z = -(gm.time.minute / 60) * TAU;
    hands[2].rotation.z = t * 0.13;
    hands[3].rotation.z = -t * 0.047 + 1.2;
    moon.position.y = 10.8 + Math.sin(t * 0.19 + 2) * 0.07;
  });
  const moonLight = new THREE.PointLight(0xa8c0ff, 1.6, 36, 2);
  moonLight.position.set(Z.x + moonX - 2, 10.2, Z.z - 2 + 2);
  B.add(moonLight);
  B.game.registerCullable(moonLight, Z.x + moonX - 2, Z.z - 2 + 2, 120);

  // --- the Earth on its stair -----------------------------------------------
  const stair = Arch.staircase({ steps: 9, width: 5.0, rise: 0.30, run: 0.55, mat: M.marbleWhite, taper: 0.25 });
  stair.position.set(0, 0, -6.5);
  g.add(stair);
  for (const b of stair.userData.boxes) {
    B.box(Z.x + b.x, b.y, Z.z - 6.5 + b.z, b.w / 2, b.h / 2, b.d / 2, { surface: 'marble' });
  }
  const landing = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.32, 2.6), M.marbleWhite);
  landing.position.set(0, 2.86, -11.6);
  landing.castShadow = landing.receiveShadow = true;
  g.add(landing);
  B.box(Z.x, 2.86, Z.z - 11.6, 2.2, 0.16, 1.3, { surface: 'marble' });

  const earth = Obj.globe({ r: 3.6, clouds: true });
  earth.position.set(0, 7.4, -13.5);
  keepDynamic(earth);
  g.add(earth);
  game.marks.earth = earth;
  B.sphere(Z.x, 7.4, Z.z - 13.5, 3.6, { surface: 'marble' });
  B.anim((dt, t) => {
    earth.userData.earth.rotation.y += dt * 0.035;
    if (earth.userData.clouds) earth.userData.clouds.rotation.y += dt * 0.048;
    earth.position.y = 7.4 + Math.sin(t * 0.25) * 0.10;
  });
  const earthLight = new THREE.PointLight(0x9fc4ff, 1.1, 28, 2);
  earthLight.position.set(Z.x, 7.4, Z.z - 10.5);
  B.add(earthLight);
  B.game.registerCullable(earthLight, Z.x, Z.z - 10.5, 120);

  // --- the golden key, lying where it was dropped ----------------------------
  game.marks.keyPos = new THREE.Vector3(Z.x - 9.5, 0.20, Z.z + 8.5);

  // --- the broken column -----------------------------------------------------
  const broke = Obj.brokenColumn({ r: 0.55, h: 1.15, style: 'rose' });
  broke.position.set(9.0, 0, 9.5);
  broke.rotation.y = 0.7;
  g.add(broke);
  B.cyl(Z.x + 9.0, 0, Z.z + 9.5, 0.78, 1.2, { surface: 'marble' });
  // and its fallen drum, half off the edge
  // physics props live in world space, parented to the scene, because the
  // rigid body writes world coordinates straight into object.position
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.55, 1.5, 18), M.marbleRose);
  drum.position.set(Z.x + 11.6, 0.55, Z.z + 11.8);
  drum.rotation.set(Math.PI / 2, 0.4, 0.2);
  drum.castShadow = drum.receiveShadow = true;
  B.add(drum);
  B.prop(drum, { r: 0.8, mass: 120, surface: 'marble' });

  // --- runic slabs carrying the level's lore ----------------------------------
  for (const [x, z, ry] of [[-CORE / 2 + 2, 12, 0.4], [CORE / 2 - 2, -12, -2.6]]) {
    const s = Obj.runeSlab({ w: 1.6, h: 2.4, mat: M.marbleGrey });
    s.position.set(x, 1.2, z);
    s.rotation.y = ry;
    g.add(s);
    B.box(Z.x + x, 1.2, Z.z + z, 0.85, 1.2, 0.3, { surface: 'marble' });
  }

  // --- the void furniture: stars and drifting masonry --------------------------
  game.stars = starField({ count: 2600, radius: 1150, size: 2.8 });
  B.add(game.stars);

  for (let i = 0; i < 20; i++) {
    const o = Obj.brokenColumn({ r: rand(0.3, 0.7), h: rand(0.8, 2.2), style: 'rose' });
    o.position.set(Z.x + rand(-110, 110), rand(-50, 40), Z.z + rand(-110, 110));
    o.rotation.set(rand(0, 7), rand(0, 7), rand(0, 7));
    B.add(o);
    const sp = new THREE.Vector3(rand(-0.08, 0.08), rand(-0.08, 0.08), rand(-0.08, 0.08));
    B.anim((dt) => { o.rotation.x += sp.x * dt; o.rotation.y += sp.y * dt; o.rotation.z += sp.z * dt; });
  }

  // sconces around the core, defining the arena edge
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + Math.PI / 8;
    sconce(B, Z.x + Math.cos(a) * (CORE / 2 - 1.6), 0.4, Z.z + Math.sin(a) * (CORE / 2 - 1.6), 0xffb87a, 1.4, 20);
  }

  game.marks.nexusCentre = new THREE.Vector3(Z.x, 0.2, Z.z + 4);
  game.marks.heraldSpawn = new THREE.Vector3(Z.x, 9, Z.z - 4);
  game.marks.nexusEntry = new THREE.Vector3(Z.x, 0.2, Z.z + CORE / 2 + ARM_L - 3);
  return g;
}

/* ====================================================== THE BRIDGES */

function buildBridges(B, game) {
  const g = new THREE.Group();
  B.add(g);

  // A -> B : out of the temple, over the sea, into the noon
  g.add(bridge(B, {
    x: 0, z0: ZONE.A.z - 26, z1: ZONE.B.z + 76, width: 9.5, spacing: 6.2,
    mat: M.checkerPlaza, archMat: M.marbleCream, colMat: M.marbleWhite,
  }));
  // B -> C : the mirror ends and the causeway begins
  g.add(bridge(B, {
    x: 0, z0: ZONE.B.z - 62, z1: ZONE.C.z + 66, width: 11, spacing: 6.0,
    mat: M.checkerColonnade, archMat: M.rustStone, colMat: M.marbleRose,
  }));
  // C -> D : down the last arm into the nexus
  g.add(bridge(B, {
    x: 0, z0: ZONE.C.z - 66, z1: ZONE.D.z + 24, width: 11, spacing: 5.6,
    mat: M.checkerNexus, archMat: M.rustStone, colMat: M.marbleRose, rail: false,
  }));
  return g;
}

/* ======================================================== ASSEMBLY */

export function buildLevel1(game) {
  const B = new Builder(game);

  const root = new THREE.Group();
  game.scene.add(root);

  const gTemple = buildTemple(B, game);
  const gMirror = buildMirror(B, game);
  const gColonnade = buildColonnade(B, game);
  const gNexus = buildNexus(B, game);
  const gBridges = buildBridges(B, game);

  /* ---- static batching: merge by material inside each zone ---------- */
  const stats = { before: 0, after: 0, merged: 0 };
  for (const grp of [gTemple, gMirror, gColonnade, gNexus, gBridges]) {
    if (!grp) continue;
    const r = bakeStatic(grp);
    stats.before += r.before; stats.after += r.after; stats.merged += r.merged;
  }

  /* ---- coarse per-zone visibility ----------------------------------- */
  const culler = new ZoneCuller();
  culler.add(gTemple, ZONE.A.z, 190);
  culler.add(gMirror, ZONE.B.z, 240);
  culler.add(gColonnade, ZONE.C.z, 250);
  culler.add(gNexus, ZONE.D.z, 260);

  /* ---- zone detection: which environment preset should be running ---- */
  const zoneBounds = [
    { name: 'temple',    z0: ZONE.A.z + 60, z1: ZONE.A.z - 60 },
    { name: 'mirror',    z0: ZONE.B.z + 60, z1: ZONE.B.z - 68 },
    { name: 'colonnade', z0: ZONE.C.z + 72, z1: ZONE.C.z - 70 },
    { name: 'nexus',     z0: ZONE.D.z + 70, z1: ZONE.D.z - 70 },
    { name: 'atrium',    z0: 760,           z1: 480 },
    { name: 'cortex',    z0: 1120,          z1: 860 },
    { name: 'altar',     z0: 1460,          z1: 1180 },
  ];

  const level = {
    root,
    animated: B.animated,
    props: B.props,
    marks: game.marks,
    zoneBounds,

    zoneAt(pos) {
      for (const z of zoneBounds) if (pos.z <= z.z0 && pos.z >= z.z1) return z.name;
      // between zones: pick whichever anchor is nearer
      let best = 'temple', bd = Infinity;
      for (const k of Object.keys(ZONE)) {
        const d = Math.abs(pos.z - ZONE[k].z);
        if (d < bd) { bd = d; best = ZONE[k].env; }
      }
      return best;
    },

    batchStats: stats,
    culler,

    update(dt, t, gm) {
      culler.update(gm.player.pos.z);
      for (const fn of B.animated) fn(dt, t, gm);
    },
  };

  game.spawnPoint = B.marks.spawn.clone();
  return level;
}

export { bridge, sconce };
