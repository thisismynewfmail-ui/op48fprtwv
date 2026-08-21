/* SILICONE DREAMS — Weapons
 *
 * Four of them, in the 2003 arrangement: a melee tool you never run out of,
 * an accurate sidearm, a bullet-hose, and the physics gun that is really the
 * point of the whole game.
 *
 * Viewmodels are built from primitives and live in their own scene, rendered
 * with a cleared depth buffer so they never clip into the world.
 */
import * as THREE from 'three';
import { T } from '../world/Materials.js';
import { lathe } from '../world/Arch.js';
import { input } from '../core/Input.js';
import { audio } from '../core/Audio.js';
import { time, clamp, lerp, damp, rand } from '../core/Time.js';
import { raycast } from '../world/Physics.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

/* ======================================================= DEFINITIONS */

export const WEAPONS = {
  gnomon: {
    name: 'GNOMON', slot: 1, kind: 'melee',
    damage: 55, range: 2.35, arc: 0.62, rate: 0.62,
    ammoType: null, punch: [-1.6, 0.7],
    hudGlyph: 'I',
    desc: 'A brass sundial pointer. Still sharp. Still telling the time.',
  },
  pistol: {
    name: 'QUARTZ PISTOL', slot: 2, kind: 'hitscan',
    damage: 19, rate: 0.19, spread: 0.0032, spreadMove: 0.010,
    magSize: 18, reserve: 108, reloadTime: 1.45, tracer: 0x9fd8ff,
    ammoType: 'quartz', punch: [-1.5, 0.55], recoil: 0.9,
    hudGlyph: 'II',
    desc: 'Fires a sliver of oscillating quartz. Semi-automatic.',
  },
  repeater: {
    name: 'STATIC REPEATER', slot: 3, kind: 'hitscan',
    damage: 12, rate: 0.082, spread: 0.010, spreadMove: 0.020, spreadGrow: 0.0055,
    spreadMax: 0.052, magSize: 45, reserve: 270, reloadTime: 2.05, tracer: 0xffd28a,
    ammoType: 'static', auto: true, punch: [-0.8, 0.4], recoil: 0.55,
    hudGlyph: 'III',
    desc: 'Salvaged. Loud. Empties a magazine in four seconds.',
  },
  manipulator: {
    name: 'CHRONAL MANIPULATOR', slot: 4, kind: 'physics',
    damage: 0, rate: 0.55, ammoType: null,
    puntForce: 2100, grabRange: 14, holdDist: 3.0,
    puntCost: 8, freezeCost: 22,
    punch: [-2.2, 0], hudGlyph: 'IV',
    desc: 'Grips an object by its future and refuses to let go.',
  },
};

/* ======================================================== VIEWMODELS */

function metal(color, spec = 0xffffff, shin = 140) {
  return new THREE.MeshPhongMaterial({ color, specular: spec, shininess: shin });
}

function buildGnomon() {
  const g = new THREE.Group();
  const brass = metal(0xc8a24a, 0xfff0bc, 170);
  const dark = metal(0x4a3a1c, 0x9a8a55, 60);

  // the blade: a right-triangle plate, the gnomon lifted off a sundial
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(0.46, 0); s.lineTo(0, 0.30); s.closePath();
  const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(s, {
    depth: 0.022, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 1 }), brass);
  blade.position.set(0.02, 0.02, -0.011);
  g.add(blade);
  // engraved hour marks along the hypotenuse
  for (let i = 1; i < 6; i++) {
    const t = i / 6;
    const mk = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.03, 0.026), dark);
    mk.position.set(0.02 + 0.46 * (1 - t), 0.02 + 0.30 * t * 0.55, 0);
    mk.rotation.z = -0.58;
    g.add(mk);
  }
  // grip
  const grip = new THREE.Mesh(lathe([
    [0.020, 0], [0.030, 0.02], [0.026, 0.06], [0.030, 0.13],
    [0.024, 0.18], [0.032, 0.20], [0.030, 0.22],
  ], 12), dark);
  grip.rotation.z = Math.PI / 2;
  grip.position.set(-0.20, 0.015, 0);
  g.add(grip);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.025, 12), brass);
  collar.rotation.z = Math.PI / 2;
  collar.position.set(0.005, 0.02, 0);
  g.add(collar);
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.034, 12, 8), brass);
  pommel.position.set(-0.215, 0.015, 0);
  g.add(pommel);

  g.userData.rest = { pos: [0.24, -0.20, -0.34], rot: [0.15, -0.45, 0.35] };
  return g;
}

function buildPistol() {
  const g = new THREE.Group();
  const body = metal(0xb9bec6, 0xffffff, 190);
  const dark = metal(0x2c3038, 0x9aa4b4, 110);
  const crystal = new THREE.MeshPhongMaterial({
    color: 0x8fd0ff, emissive: 0x1a4a70, specular: 0xffffff, shininess: 240,
    transparent: true, opacity: 0.85 });

  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 0.32), body);
  slide.position.set(0, 0.045, -0.06);
  g.add(slide);
  // slide serrations
  for (let i = 0; i < 6; i++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.05, 0.006), dark);
    c.position.set(0, 0.05, 0.03 + i * 0.014);
    g.add(c);
  }
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.05, 0.26), dark);
  frame.position.set(0, -0.005, -0.05);
  g.add(frame);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.19, 0.085), dark);
  grip.position.set(0, -0.10, 0.055);
  grip.rotation.x = -0.28;
  g.add(grip);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.10, 0.062), metal(0x6a7080, 0xd0d8e4, 90));
  mag.position.set(0, -0.17, 0.075);
  mag.rotation.x = -0.28;
  g.add(mag);
  g.userData.mag = mag;

  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.010, 6, 14, Math.PI), dark);
  guard.rotation.set(0, Math.PI / 2, Math.PI);
  guard.position.set(0, -0.045, -0.01);
  g.add(guard);
  const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.042, 0.012), metal(0x8a9098));
  trigger.position.set(0, -0.036, 0.0);
  g.add(trigger);
  g.userData.trigger = trigger;

  // the quartz resonator running down the top rib
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.24, 6), crystal);
  rod.rotation.x = Math.PI / 2;
  rod.position.set(0, 0.09, -0.08);
  g.add(rod);
  g.userData.rod = rod;
  const emitter = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.06, 8), crystal);
  emitter.rotation.x = -Math.PI / 2;
  emitter.position.set(0, 0.045, -0.235);
  g.add(emitter);
  g.userData.muzzle = new THREE.Object3D();
  g.userData.muzzle.position.set(0, 0.048, -0.26);
  g.add(g.userData.muzzle);

  // sights
  const front = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.018, 0.010), dark);
  front.position.set(0, 0.092, -0.20); g.add(front);
  const rear = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.016, 0.012), dark);
  rear.position.set(0, 0.090, 0.06); g.add(rear);

  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), new THREE.MeshBasicMaterial({
    map: T.star, color: 0xbfe8ff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false }));
  flash.position.copy(g.userData.muzzle.position);
  g.add(flash);
  g.userData.flash = flash;

  g.userData.rest = { pos: [0.20, -0.19, -0.30], rot: [0.03, 0.06, 0] };
  return g;
}

function buildRepeater() {
  const g = new THREE.Group();
  const body = metal(0x3a3e46, 0xa8b2c0, 100);
  const dark = metal(0x1e2026, 0x707888, 70);
  const brass = metal(0xa8863a, 0xffe8b0, 150);

  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.095, 0.36), body);
  receiver.position.set(0, 0.02, -0.02);
  g.add(receiver);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.019, 0.26, 10), dark);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.035, -0.30);
  g.add(barrel);
  // heat shroud
  const shroud = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.030, 0.17, 12, 1, true), body);
  shroud.rotation.x = Math.PI / 2;
  shroud.position.set(0, 0.035, -0.26);
  g.add(shroud);
  for (let i = 0; i < 5; i++) {
    const hole = new THREE.Mesh(new THREE.TorusGeometry(0.030, 0.004, 4, 12), dark);
    hole.rotation.y = Math.PI / 2;
    hole.position.set(0, 0.035, -0.20 - i * 0.028);
    g.add(hole);
  }
  const brake = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.024, 0.05, 8), dark);
  brake.rotation.x = Math.PI / 2;
  brake.position.set(0, 0.035, -0.425);
  g.add(brake);

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.17, 0.075), dark);
  grip.position.set(0, -0.10, 0.06);
  grip.rotation.x = -0.30;
  g.add(grip);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.20, 0.055), body);
  mag.position.set(0, -0.13, -0.05);
  mag.rotation.x = 0.10;
  g.add(mag);
  g.userData.mag = mag;
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.075, 0.20), dark);
  stock.position.set(0, -0.005, 0.24);
  g.add(stock);

  // charging handle + ejection port
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.014, 0.05), brass);
  handle.position.set(0.05, 0.055, 0.04);
  g.add(handle);
  g.userData.bolt = handle;
  const port = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.032, 0.07), dark);
  port.position.set(0.044, 0.035, 0.02);
  g.add(port);
  g.userData.ejectPort = port;

  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.012, 0.26), dark);
  rail.position.set(0, 0.075, -0.03);
  g.add(rail);
  const sight = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.005, 5, 12), dark);
  sight.rotation.y = Math.PI / 2;
  sight.position.set(0, 0.095, -0.12);
  g.add(sight);

  g.userData.muzzle = new THREE.Object3D();
  g.userData.muzzle.position.set(0, 0.035, -0.46);
  g.add(g.userData.muzzle);
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), new THREE.MeshBasicMaterial({
    map: T.star, color: 0xffd28a, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false }));
  flash.position.copy(g.userData.muzzle.position);
  g.add(flash);
  g.userData.flash = flash;

  g.userData.rest = { pos: [0.19, -0.20, -0.26], rot: [0.02, 0.04, 0] };
  return g;
}

function buildManipulator() {
  const g = new THREE.Group();
  const body = metal(0xb0a99a, 0xfff4dc, 90);
  const brass = metal(0xc8a24a, 0xfff0bc, 180);
  const dark = metal(0x30343c, 0x8892a4, 90);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.9 });

  // a brass orrery bolted to a scavenged handle
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.070, 0.24, 12), body);
  core.rotation.x = Math.PI / 2;
  core.position.set(0, 0.02, -0.10);
  g.add(core);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.082, 0.045, 16), brass);
  collar.rotation.x = Math.PI / 2;
  collar.position.set(0, 0.02, -0.20);
  g.add(collar);

  // three claws that open when the gun is charged
  const claws = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const claw = new THREE.Group();
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 0.17), brass);
    arm.position.set(0, 0, -0.085);
    claw.add(arm);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.020, 0.07, 6), brass);
    tip.rotation.x = -Math.PI / 2;
    tip.position.set(0, 0, -0.20);
    claw.add(tip);
    claw.position.set(Math.cos(a) * 0.062, 0.02 + Math.sin(a) * 0.062, -0.22);
    claw.rotation.z = a;
    claw.userData.baseAngle = a;
    g.add(claw);
    claws.push(claw);
  }
  g.userData.claws = claws;

  // the caged chronal core
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.052, 1), new THREE.MeshPhongMaterial({
    color: 0x9fe4ff, emissive: 0x2a7aa8, specular: 0xffffff, shininess: 240,
    transparent: true, opacity: 0.9, flatShading: true }));
  orb.position.set(0, 0.02, -0.235);
  g.add(orb);
  g.userData.orb = orb;
  for (let i = 0; i < 2; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.007, 5, 22), brass);
    ring.position.set(0, 0.02, -0.235);
    ring.rotation.set(i * 1.2, i * 0.9, 0);
    g.add(ring);
    if (!g.userData.rings) g.userData.rings = [];
    g.userData.rings.push(ring);
  }

  // dial set into the side of the body, because of course there is one
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.012, 16), brass);
  dial.rotation.z = Math.PI / 2;
  dial.position.set(0.062, 0.03, -0.06);
  g.add(dial);
  const needle = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.030, 0.004), dark);
  needle.position.set(0.070, 0.042, -0.06);
  g.add(needle);
  g.userData.needle = needle;

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.175, 0.08), dark);
  grip.position.set(0, -0.10, 0.02);
  grip.rotation.x = -0.24;
  g.add(grip);
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.008, 5, 14), metal(0x5a4a30, 0x8a7a55, 30));
  strap.rotation.y = Math.PI / 2;
  strap.position.set(0, -0.13, 0.04);
  g.add(strap);

  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.05, 1, 8, 1, true), glowMat);
  beam.rotation.x = -Math.PI / 2;
  beam.position.set(0, 0.02, -0.6);
  beam.visible = false;
  g.add(beam);
  g.userData.beam = beam;

  g.userData.muzzle = new THREE.Object3D();
  g.userData.muzzle.position.set(0, 0.02, -0.30);
  g.add(g.userData.muzzle);

  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), new THREE.MeshBasicMaterial({
    map: T.glow, color: 0x8fd8ff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false }));
  flash.position.set(0, 0.02, -0.30);
  g.add(flash);
  g.userData.flash = flash;

  g.userData.rest = { pos: [0.18, -0.19, -0.28], rot: [0.02, 0.02, 0] };
  return g;
}

const BUILDERS = { gnomon: buildGnomon, pistol: buildPistol, repeater: buildRepeater, manipulator: buildManipulator };

/* ==================================================== WEAPON SYSTEM */

export class WeaponSystem {
  constructor(game) {
    this.game = game;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.01, 12);
    this.root = new THREE.Group();
    this.scene.add(this.root);

    // dedicated viewmodel lighting: a hot key from the upper left and a
    // cool rim, so the weapon reads against every one of the four skies
    const key = new THREE.DirectionalLight(0xfff2dd, 2.0);
    key.position.set(-0.6, 1.0, 0.8);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fb8ff, 0.9);
    rim.position.set(0.9, 0.2, -0.7);
    this.scene.add(rim);
    this.scene.add(new THREE.AmbientLight(0x5a5a72, 1.1));
    this.keyLight = key;

    this.models = {};
    this.owned = { gnomon: true, pistol: false, repeater: false, manipulator: false };
    this.ammo = { quartz: 0, static: 0 };
    this.mags = { pistol: 0, repeater: 0 };

    for (const id of Object.keys(WEAPONS)) {
      const m = BUILDERS[id]();
      m.visible = false;
      this.root.add(m);
      this.models[id] = m;
    }

    this.current = 'gnomon';
    this.pending = null;
    this.state = 'idle';       // idle | fire | reload | draw | holster | melee
    this.stateT = 0;
    this.nextFire = 0;
    this.spread = 0;
    this.bobPhase = 0;
    this.sway = new THREE.Vector2();
    this.swayTarget = new THREE.Vector2();
    this.kick = 0;
    this.kickVel = 0;
    this.offset = new THREE.Vector3();
    this.rotOffset = new THREE.Vector3();
    this.lastShot = -99;
    this.meleeHitDone = false;
    this.onFire = null;
    this.models[this.current].visible = true;
  }

  get def() { return WEAPONS[this.current]; }
  get model() { return this.models[this.current]; }
  get magAmmo() { return this.def.magSize ? this.mags[this.current] : Infinity; }
  get reserveAmmo() { return this.def.ammoType ? this.ammo[this.def.ammoType] : Infinity; }

  give(id, opt = {}) {
    if (!WEAPONS[id]) return false;
    const fresh = !this.owned[id];
    this.owned[id] = true;
    const d = WEAPONS[id];
    if (d.magSize && fresh) this.mags[id] = d.magSize;
    if (d.ammoType && opt.ammo) this.giveAmmo(d.ammoType, opt.ammo);
    if (fresh && opt.select !== false) this.select(id);
    return fresh;
  }

  giveAmmo(type, n) {
    if (!(type in this.ammo)) return false;
    const cap = type === 'quartz' ? WEAPONS.pistol.reserve : WEAPONS.repeater.reserve;
    const before = this.ammo[type];
    this.ammo[type] = Math.min(cap, before + n);
    return this.ammo[type] > before;
  }

  select(id) {
    if (!this.owned[id] || id === this.current || this.state === 'holster') return false;
    this.pending = id;
    this.state = 'holster';
    this.stateT = 0;
    audio.sfx_swap(0.7);
    return true;
  }

  cycle(dir = 1) {
    const list = Object.keys(WEAPONS).filter((k) => this.owned[k]);
    const i = list.indexOf(this.current);
    this.select(list[(i + dir + list.length) % list.length]);
  }

  reload() {
    const d = this.def;
    if (!d.magSize || this.state === 'reload') return false;
    if (this.mags[this.current] >= d.magSize) return false;
    if (this.ammo[d.ammoType] <= 0) return false;
    this.state = 'reload';
    this.stateT = 0;
    this._magOut = false;
    this._magIn = false;
    return true;
  }

  /* ------------------------------------------------------- firing */

  tryFire(dt) {
    const g = this.game;
    const d = this.def;
    if (this.state === 'reload' || this.state === 'draw' || this.state === 'holster') return;
    if (time.realNow < this.nextFire) return;

    if (d.kind === 'melee') { this.fireMelee(); return; }
    if (d.kind === 'physics') { this.firePunt(); return; }

    if (this.mags[this.current] <= 0) {
      audio.play('dryfire', null, { vol: 0.6 });
      this.nextFire = time.realNow + 0.28;
      if (this.ammo[d.ammoType] > 0) this.reload();
      return;
    }

    this.mags[this.current]--;
    this.nextFire = time.realNow + d.rate;
    this.lastShot = time.realNow;
    this.state = 'fire';
    this.stateT = 0;

    // accumulated spread: standing still and tapping is rewarded
    const p = g.player;
    const moving = Math.hypot(p.vel.x, p.vel.z) / 5;
    const base = d.spread + moving * d.spreadMove + (p.grounded ? 0 : 0.02);
    const total = base + this.spread;
    this.spread = Math.min(d.spreadMax ?? 0.05, this.spread + (d.spreadGrow || 0.004));

    const origin = p.eyePosition.clone();
    const dir = p.forward.clone();
    const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * total;
    const right = p.right, up = _v.crossVectors(right, dir).normalize();
    dir.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();

    this.trace(origin, dir, d);

    audio.play(this.current === 'pistol' ? 'pistol' : 'smg', p.pos, { vol: 1, ref: 14, max: 160 });
    p.punch(d.punch[0] * 0.012 * (0.7 + Math.random() * 0.6), d.punch[1] * 0.012 * (Math.random() - 0.5) * 2);
    this.kickVel -= d.recoil * 7;
    g.fx.muzzleFlash(this.muzzleWorld(), dir, { scale: this.current === 'repeater' ? 1.2 : 1 });
    g.postfx?.kick(0.05, 12);
    this.model.userData.flash.material.opacity = 1;
    this.model.userData.flash.rotation.z = rand(0, Math.PI * 2);
    if (this.current === 'repeater') this.ejectCasing();
    this.onFire?.(this.current);
  }

  /** Hitscan with a short penetration budget for the pistol's quartz slivers. */
  trace(origin, dir, d) {
    const g = this.game;
    const maxDist = 220;
    const eHit = g.traceEnemies(origin, dir, maxDist);
    const wHit = raycast(g.world, origin, dir, maxDist);

    const eT = eHit ? eHit.t : Infinity;
    const wT = wHit ? wHit.t : Infinity;

    if (eT < wT) {
      g.damageEnemy(eHit.enemy, d.damage, eHit.point, dir, this.current, eHit.head);
      g.fx.bloodless(eHit.point, _v2.copy(dir).negate(), [0.45, 1, 0.8]);
      this.tracer(origin, eHit.point, d.tracer);
      audio.play('impact', eHit.point, { vol: 0.5 });
    } else if (wHit) {
      g.fx.impact(wHit.point, wHit.normal, { surface: wHit.surface });
      this.tracer(origin, wHit.point, d.tracer);
      audio.play(wHit.surface === 'marble' ? 'impact_marble' : 'impact', wHit.point, { vol: 0.8, ref: 10 });
      if (Math.random() < 0.28) audio.play('ricochet', wHit.point, { vol: 0.4 });
      if (wHit.collider.body) {
        wHit.collider.body.applyImpulse(dir.x * 260, dir.y * 120, dir.z * 260);
      }
      g.notifyNoise(wHit.point, 22);
    } else {
      this.tracer(origin, _v.copy(origin).addScaledVector(dir, maxDist), d.tracer);
    }
    g.notifyNoise(origin, 34);
  }

  tracer(from, to, colour) {
    const g = this.game;
    const dist = from.distanceTo(to);
    const steps = Math.min(14, Math.max(3, Math.floor(dist / 3.5)));
    const c = new THREE.Color(colour);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      g.fx.add.spawn({
        x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t), z: lerp(from.z, to.z, t),
        life: 0.045 + t * 0.03, size: 0.10 * (1 - t * 0.5), size1: 0.01,
        r: c.r, g: c.g, b: c.b, a0: 0.75, a1: 0, worldTime: false,
      });
    }
  }

  fireMelee() {
    const d = this.def;
    this.state = 'melee';
    this.stateT = 0;
    this.nextFire = time.realNow + d.rate;
    this.meleeHitDone = false;
    audio.play('melee_swing', this.game.player.pos, { vol: 0.8, ref: 6 });
  }

  resolveMelee() {
    const g = this.game, d = this.def, p = g.player;
    const origin = p.eyePosition.clone();
    const dir = p.forward.clone();
    let hitSomething = false;

    // a short cone rather than a single ray, so glancing swings connect
    const hits = g.enemiesInCone(origin, dir, d.range, d.arc);
    for (const e of hits) {
      g.damageEnemy(e, d.damage, e.position.clone(), dir, 'gnomon');
      g.fx.bloodless(e.position, _v2.copy(dir).negate(), [0.45, 1, 0.8]);
      hitSomething = true;
    }
    if (hits.length) {
      audio.play('melee_hit', p.pos, { vol: 1, ref: 6 });
      p.punch(-0.5, 0);
    }

    if (!hitSomething) {
      const w = raycast(g.world, origin, dir, d.range);
      if (w) {
        g.fx.impact(w.point, w.normal, { surface: w.surface, sparks: 5 });
        audio.play(w.surface === 'metal' ? 'melee_metal' : 'melee_hit', w.point, { vol: 0.8 });
        p.punch(-0.35, 0);
        if (w.collider.body) {
          w.collider.body.applyImpulse(dir.x * 900, 260, dir.z * 900);
          w.collider.body.spin.set(rand(-6, 6), rand(-6, 6), rand(-6, 6));
        }
        g.notifyNoise(w.point, 12);
      }
    }
    this.meleeHitDone = true;
  }

  firePunt() {
    const g = this.game, d = this.def;
    if (g.chrono.energy < d.puntCost) {
      audio.play('dryfire', null, { vol: 0.5 });
      this.nextFire = time.realNow + 0.4;
      return;
    }
    // if we are holding something, launch it instead
    if (g.manipulator.held) { g.manipulator.launch(); this.nextFire = time.realNow + 0.35; this.punchFx(); return; }

    g.chrono.spend(d.puntCost);
    this.nextFire = time.realNow + d.rate;
    this.state = 'fire';
    this.stateT = 0;
    g.manipulator.punt();
    this.punchFx();
  }

  punchFx() {
    const g = this.game;
    audio.play('punt', g.player.pos, { vol: 1, ref: 12 });
    g.player.punch(-0.026, 0);
    this.kickVel -= 12;
    this.model.userData.flash.material.opacity = 1;
    g.postfx?.kick(0.12, 6);
  }

  ejectCasing() {
    const g = this.game;
    const p = g.player;
    const port = this.model.userData.ejectPort;
    if (!port) return;
    const w = this.viewToWorld(port.position);
    const right = p.right;
    g.fx.debris.spawn({
      x: w.x, y: w.y, z: w.z,
      vx: right.x * rand(2, 4) + rand(-0.5, 0.5) + p.vel.x,
      vy: rand(1.5, 3) + p.vel.y,
      vz: right.z * rand(2, 4) + rand(-0.5, 0.5) + p.vel.z,
      scale: 0.22, life: rand(1.2, 2.0),
      r: 0.85, g: 0.68, b: 0.30, floorY: p.pos.y + 0.02,
    });
  }

  muzzleWorld() {
    const m = this.model.userData.muzzle;
    if (!m) return this.game.player.eyePosition.clone();
    return this.viewToWorld(m.position);
  }

  /** map a viewmodel-space point into the world, for muzzle flashes/casings */
  viewToWorld(local) {
    const p = this.game.player;
    const eye = p.eyePosition;
    const fwd = p.forward, right = p.right;
    const up = _v2.crossVectors(right, fwd).normalize();
    const v = this.model.localToWorld(local.clone());   // still viewmodel space
    return new THREE.Vector3(
      eye.x + right.x * v.x + up.x * v.y - fwd.x * v.z,
      eye.y + right.y * v.x + up.y * v.y - fwd.y * v.z,
      eye.z + right.z * v.x + up.z * v.y - fwd.z * v.z);
  }

  /* ------------------------------------------------------- update */

  update(dt, realDt) {
    const g = this.game;
    const p = g.player;
    const d = this.def;
    this.stateT += realDt;

    // --- input
    if (p.alive && !p.frozen && input.locked) {
      const wantFire = d.auto || d.kind === 'physics' ? input.mouseDown(0) : input.mouseHit(0);
      if (wantFire) this.tryFire(realDt);
      if (input.hit('reload')) this.reload();
      if (input.hit('next')) this.cycle(1);
      if (input.mouse.wheel) this.cycle(input.mouse.wheel > 0 ? 1 : -1);
      for (let i = 1; i <= 4; i++) {
        if (input.hit('slot' + i)) {
          const id = Object.keys(WEAPONS).find((k) => WEAPONS[k].slot === i);
          if (id && this.owned[id]) this.select(id);
        }
      }
    }

    // --- spread recovery
    this.spread = Math.max(0, this.spread - realDt * 0.055);

    // --- state machine
    switch (this.state) {
      case 'fire':
        if (this.stateT > 0.09) this.state = 'idle';
        break;
      case 'melee': {
        const t = this.stateT / d.rate;
        if (t > 0.34 && !this.meleeHitDone) this.resolveMelee();
        if (t >= 1) this.state = 'idle';
        break;
      }
      case 'reload': {
        const t = this.stateT / d.reloadTime;
        if (t > 0.24 && !this._magOut) {
          this._magOut = true;
          audio.play('reload_out', null, { vol: 0.8 });
        }
        if (t > 0.62 && !this._magIn) {
          this._magIn = true;
          audio.play('reload_in', null, { vol: 0.8 });
        }
        if (t >= 1) {
          const need = d.magSize - this.mags[this.current];
          const take = Math.min(need, this.ammo[d.ammoType]);
          this.mags[this.current] += take;
          this.ammo[d.ammoType] -= take;
          this.state = 'idle';
          this.spread = 0;
        }
        break;
      }
      case 'holster':
        if (this.stateT > 0.16) {
          this.model.visible = false;
          this.current = this.pending;
          this.pending = null;
          this.model.visible = true;
          this.state = 'draw';
          this.stateT = 0;
          this.spread = 0;
          g.onWeaponChanged?.(this.current);
        }
        break;
      case 'draw':
        if (this.stateT > 0.3) this.state = 'idle';
        break;
    }

    this.animate(dt, realDt);
  }

  animate(dt, realDt) {
    const g = this.game, p = g.player, d = this.def;
    const model = this.model;
    const rest = model.userData.rest;

    // --- sway: the weapon lags the aim by a frame or two
    this.swayTarget.x = clamp(-input.mouse.dx * 0.0016, -0.09, 0.09);
    this.swayTarget.y = clamp(-input.mouse.dy * 0.0016, -0.09, 0.09);
    this.sway.x = damp(this.sway.x, this.swayTarget.x, 9, realDt);
    this.sway.y = damp(this.sway.y, this.swayTarget.y, 9, realDt);

    // --- bob
    const speed = Math.hypot(p.vel.x, p.vel.z);
    const moving = p.grounded && speed > 0.6;
    if (moving) this.bobPhase += realDt * speed * 1.55;
    const bobAmt = (moving ? clamp(speed / 5, 0, 1.4) : 0) * (p.crouching ? 0.5 : 1);
    const bobX = Math.cos(this.bobPhase) * 0.020 * bobAmt;
    const bobY = Math.sin(this.bobPhase * 2) * 0.014 * bobAmt;
    const bobR = Math.cos(this.bobPhase) * 0.024 * bobAmt;

    // --- recoil spring
    this.kickVel += (-this.kick * 320 - this.kickVel * 22) * realDt;
    this.kick += this.kickVel * realDt;
    this.kick = clamp(this.kick, -0.5, 0.5);

    // --- per-state pose
    let px = rest.pos[0], py = rest.pos[1], pz = rest.pos[2];
    let rx = rest.rot[0], ry = rest.rot[1], rz = rest.rot[2];

    if (this.state === 'draw') {
      const t = clamp(this.stateT / 0.3, 0, 1);
      py -= (1 - t) * 0.36;
      rz += (1 - t) * 0.7;
    } else if (this.state === 'holster') {
      const t = clamp(this.stateT / 0.16, 0, 1);
      py -= t * 0.36;
      rz += t * 0.7;
    } else if (this.state === 'reload') {
      const t = clamp(this.stateT / d.reloadTime, 0, 1);
      // dip, tilt inward, punch a magazine home, come back up
      const dip = Math.sin(clamp(t * 1.15, 0, 1) * Math.PI) ;
      py -= dip * 0.16;
      px -= dip * 0.03;
      rz += dip * 0.55;
      rx += dip * 0.22;
      const mag = model.userData.mag;
      if (mag) {
        if (mag.userData.baseY === undefined) mag.userData.baseY = mag.position.y;
        const out = clamp((t - 0.22) / 0.30, 0, 1);
        const inn = clamp((t - 0.58) / 0.22, 0, 1);
        // drop the magazine out, then slap a fresh one back up
        mag.position.y = mag.userData.baseY - out * 0.22 * (1 - inn);
      }
      if (model.userData.bolt && t > 0.86) {
        const b = clamp((t - 0.86) / 0.14, 0, 1);
        model.userData.bolt.position.z = 0.04 + Math.sin(b * Math.PI) * 0.05;
      }
    } else if (this.state === 'melee') {
      const t = clamp(this.stateT / d.rate, 0, 1);
      // wind up, snap across, recover
      const wind = clamp(t / 0.32, 0, 1);
      const swing = clamp((t - 0.28) / 0.28, 0, 1);
      const back = clamp((t - 0.6) / 0.4, 0, 1);
      const ease = (x) => x * x * (3 - 2 * x);
      px += ease(wind) * 0.16 - ease(swing) * 0.62 + ease(back) * 0.46;
      py += ease(wind) * 0.10 - ease(swing) * 0.18 + ease(back) * 0.08;
      pz += ease(wind) * 0.10 - ease(swing) * 0.06;
      rz += -ease(wind) * 0.5 + ease(swing) * 2.3 - ease(back) * 1.8;
      ry += ease(swing) * 0.9 - ease(back) * 0.9;
      rx += ease(wind) * 0.3 - ease(swing) * 0.5 + ease(back) * 0.2;
    }

    // manipulator idle: claws breathe, orb spins, needle tracks charge
    if (this.current === 'manipulator') {
      const held = g.manipulator.held ? 1 : 0;
      const open = damp(model.userData._open ?? 0, held ? 1 : (g.chrono.energy / g.chrono.max) * 0.35, 8, realDt);
      model.userData._open = open;
      for (const c of model.userData.claws) {
        const a = c.userData.baseAngle;
        c.position.set(Math.cos(a) * (0.062 + open * 0.05), 0.02 + Math.sin(a) * (0.062 + open * 0.05), -0.22);
        c.rotation.z = a;
        c.rotation.x = -open * 0.4;
      }
      model.userData.orb.rotation.y += realDt * (1 + held * 5);
      model.userData.orb.rotation.x += realDt * 0.6;
      model.userData.orb.material.emissive.setHSL(0.55, 0.8, 0.18 + held * 0.3 + Math.sin(time.realNow * 4) * 0.03);
      if (model.userData.rings) {
        model.userData.rings[0].rotation.z += realDt * 1.4;
        model.userData.rings[1].rotation.x += realDt * -1.1;
      }
      model.userData.needle.rotation.x = (g.chrono.energy / g.chrono.max) * 2.4 - 1.2;
      const beam = model.userData.beam;
      beam.visible = !!g.manipulator.held;
    }

    if (this.current === 'pistol' && model.userData.rod) {
      const heat = clamp((time.realNow - this.lastShot) * 3, 0, 1);
      model.userData.rod.material.emissive.setRGB(0.10 + (1 - heat) * 0.5, 0.29 + (1 - heat) * 0.4, 0.44 + (1 - heat) * 0.3);
    }

    // --- compose
    const sprintDip = p.sprinting ? 1 : 0;
    this.offset.set(
      px + bobX + this.sway.x + sprintDip * 0.04,
      py + bobY + this.sway.y - sprintDip * 0.06 + p.landDip * 0.5,
      pz + this.kick * 0.16);
    this.rotOffset.set(
      rx - this.kick * 0.5 - this.sway.y * 1.4 + sprintDip * 0.22,
      ry + this.sway.x * 1.6 + sprintDip * 0.5,
      rz + bobR + this.sway.x * 0.8);

    model.position.lerp(this.offset, 1 - Math.exp(-26 * realDt));
    model.rotation.x = damp(model.rotation.x, this.rotOffset.x, 26, realDt);
    model.rotation.y = damp(model.rotation.y, this.rotOffset.y, 26, realDt);
    model.rotation.z = damp(model.rotation.z, this.rotOffset.z, 26, realDt);

    // muzzle flash decay runs on real time — it should not slow down
    for (const id of Object.keys(this.models)) {
      const f = this.models[id].userData.flash;
      if (f && f.material.opacity > 0) {
        f.material.opacity = Math.max(0, f.material.opacity - realDt * 22);
        f.scale.setScalar(0.8 + Math.random() * 0.5);
      }
    }
  }

  resize(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  setVisible(v) { this.root.visible = v; }
  /** Hide just the gun (examination borrows this scene for the held object). */
  setModelVisible(v) { for (const id of Object.keys(this.models)) this.models[id].visible = v && id === this.current; }

  serialize() {
    return { owned: { ...this.owned }, ammo: { ...this.ammo }, mags: { ...this.mags }, current: this.current };
  }
  deserialize(d) {
    if (!d) return;
    Object.assign(this.owned, d.owned);
    Object.assign(this.ammo, d.ammo);
    Object.assign(this.mags, d.mags);
    this.model.visible = false;
    this.current = d.current || 'gnomon';
    this.model.visible = true;
    this.state = 'draw'; this.stateT = 0;
  }
}
