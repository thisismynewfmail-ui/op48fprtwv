/* SILICONE DREAMS — The Chronometer
 *
 * Three powers, one shared pool:
 *
 *   DILATE  (hold Q)  — the world drops to ~12% speed; you do not.
 *   REWIND  (tap  T)  — your last four seconds are played back and you are
 *                       returned to where you were, with the health you had.
 *   STASIS  (tap  F)  — freezes one object, or one enemy, out of time.
 *
 * Plus the Chronal Manipulator's grab/punt, which spends from the same pool.
 * Energy regenerates, slowly, and faster when you are standing still — the
 * suit is charging off your own stillness, which is the joke.
 */
import * as THREE from 'three';
import { M, T } from '../world/Materials.js';
import { STASIS_FRAG, ENERGY_VERT } from '../render/Shaders.js';
import { time, clamp, lerp, damp, rand } from '../core/Time.js';
import { audio } from '../core/Audio.js';
import { input } from '../core/Input.js';
import { raycast, LAYER } from '../world/Physics.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

/* ============================================================= CHRONO */

export class Chrono {
  constructor(game) {
    this.game = game;
    this.max = 100;
    this.energy = 100;
    this.regen = 9.5;               // per second when idle
    this.dilating = false;
    this.dilateCost = 26;           // per second held
    this.rewindCost = 40;
    this.stasisCost = 30;
    this.unlocked = { dilate: false, rewind: false, stasis: false };

    this.dilateScale = 0.12;
    this.minToStart = 12;

    // --- rewind ring buffer ---
    this.history = [];
    this.historyHz = 30;
    this.historyLen = 4.0;          // seconds
    this.sampleAcc = 0;
    this.rewinding = false;
    this.rewindT = 0;
    this.rewindDur = 0.62;
    this.rewindFrom = null;
    this.rewindPath = null;

    this.lockout = 0;               // brief cooldown after a rewind
    this.stasisFields = [];
  }

  unlock(what) {
    this.unlocked[what] = true;
  }

  spend(n) {
    this.energy = Math.max(0, this.energy - n);
    return this.energy;
  }
  has(n) { return this.energy >= n; }

  refill(n) { this.energy = Math.min(this.max, this.energy + n); }

  /* ------------------------------------------------------- history */

  sample(dt) {
    const p = this.game.player;
    this.sampleAcc += dt;
    const step = 1 / this.historyHz;
    while (this.sampleAcc >= step) {
      this.sampleAcc -= step;
      this.history.push({
        x: p.pos.x, y: p.pos.y, z: p.pos.z,
        vx: p.vel.x, vy: p.vel.y, vz: p.vel.z,
        yaw: p.yaw, pitch: p.pitch,
        health: p.health, armour: p.armour, t: time.realNow,
      });
      const maxN = Math.ceil(this.historyLen * this.historyHz);
      while (this.history.length > maxN) this.history.shift();
    }
  }

  /* -------------------------------------------------------- powers */

  startDilate() {
    if (this.dilating || this.energy < this.minToStart || this.lockout > 0) return false;
    this.dilating = true;
    time.dilate(this.dilateScale, 11);
    audio.sfx_dilate_in(1);
    this.game.postfx?.kick(0.22, 5);
    this.game.hud?.flashPower('DILATE');
    return true;
  }

  stopDilate() {
    if (!this.dilating) return;
    this.dilating = false;
    time.restore(6);
    audio.sfx_dilate_out(1);
  }

  /** Replays the stored path backwards, then puts the player back in it. */
  startRewind() {
    if (this.rewinding || this.lockout > 0) return false;
    if (this.energy < this.rewindCost) { this.game.hud?.warn('INSUFFICIENT CHRONAL CHARGE'); return false; }
    if (this.history.length < 6) return false;
    const p = this.game.player;
    this.spend(this.rewindCost);
    this.rewinding = true;
    this.rewindT = 0;
    this.rewindPath = this.history.slice();
    this.rewindFrom = {
      x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, pitch: p.pitch,
    };
    p.frozen = true;
    p.vel.set(0, 0, 0);
    audio.sfx_rewind(1);
    this.game.postfx?.pulseRipple();
    this.game.postfx?.kick(0.35, 3);
    this.game.hud?.flashPower('REWIND');
    // the world keeps running while you unwind — that is the cost
    time.dilate(0.35, 14);
    return true;
  }

  updateRewind(realDt) {
    const p = this.game.player;
    this.rewindT += realDt;
    const t = clamp(this.rewindT / this.rewindDur, 0, 1);
    // ease from "now" back through the recorded path to its oldest sample
    const path = this.rewindPath;
    const idx = clamp((1 - t) * (path.length - 1), 0, path.length - 1);
    const i0 = Math.floor(idx), i1 = Math.min(path.length - 1, i0 + 1);
    const f = idx - i0;
    const a = path[i0], b = path[i1];
    p.pos.set(lerp(a.x, b.x, f), lerp(a.y, b.y, f), lerp(a.z, b.z, f));
    p.yaw = lerpAngle(a.yaw, b.yaw, f);
    p.pitch = lerp(a.pitch, b.pitch, f);
    p.applyCamera();

    // trail of after-images
    if (Math.random() < realDt * 40) {
      this.game.fx.add.spawn({
        x: p.pos.x + rand(-0.3, 0.3), y: p.pos.y + rand(0.2, 1.6), z: p.pos.z + rand(-0.3, 0.3),
        life: rand(0.3, 0.7), size: rand(0.15, 0.4), size1: 0.02,
        r: 0.55, g: 0.8, b: 1.0, a0: 0.7, a1: 0, worldTime: false,
      });
    }

    if (t >= 1) {
      const s = path[0];
      p.pos.set(s.x, s.y, s.z);
      p.vel.set(s.vx * 0.4, 0, s.vz * 0.4);
      p.yaw = s.yaw; p.pitch = s.pitch;
      // you get the health back too — this is a real escape, not a repositioning
      p.health = Math.max(p.health, Math.min(p.maxHealth, s.health));
      p.armour = Math.max(p.armour, s.armour);
      p.frozen = false;
      p.alive = p.health > 0;
      this.rewinding = false;
      this.history.length = 0;
      this.lockout = 1.1;
      time.restore(8);
      this.game.fx.shockRing(p.pos, { colour: [0.55, 0.85, 1], size: 0.5, size1: 6, life: 0.6 });
      this.game.postfx?.kick(0.2, 6);
    }
  }

  /* -------------------------------------------------------- stasis */

  /** Freeze whatever is under the crosshair, out of time, for a while. */
  castStasis() {
    if (!this.unlocked.stasis) return false;
    if (this.energy < this.stasisCost) { this.game.hud?.warn('INSUFFICIENT CHRONAL CHARGE'); return false; }
    const g = this.game, p = g.player;
    const origin = p.eyePosition.clone();
    const dir = p.forward.clone();

    const eHit = g.traceEnemies(origin, dir, 40);
    const wHit = raycast(g.world, origin, dir, 40);
    const eT = eHit ? eHit.t : Infinity;
    const wT = wHit ? wHit.t : Infinity;

    if (eT < wT && eHit) {
      this.spend(this.stasisCost);
      eHit.enemy.frozen = 6.5;
      this.addField(eHit.enemy.position, eHit.enemy.radius * 2.2, 6.5, eHit.enemy);
      audio.play('freeze', eHit.point, { vol: 1, ref: 12 });
      g.hud?.flashPower('STASIS');
      return true;
    }
    if (wHit && wHit.collider.body) {
      this.spend(this.stasisCost);
      const b = wHit.collider.body;
      b.frozen = true;
      b.vel.set(0, 0, 0);
      b.spin.set(0, 0, 0);
      this.addField(b.pos, b.r * 2.6, 14, null, b);
      audio.play('freeze', wHit.point, { vol: 1, ref: 12 });
      g.hud?.flashPower('STASIS');
      return true;
    }
    g.hud?.warn('NO VALID TARGET');
    return false;
  }

  addField(pos, radius, life, enemy = null, body = null) {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0.55 },
        uColor: { value: new THREE.Color(0x9fdcff) },
      },
      vertexShader: ENERGY_VERT,
      fragmentShader: STASIS_FRAG,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 2), mat);
    mesh.position.copy(pos);
    this.game.scene.add(mesh);
    this.stasisFields.push({ mesh, mat, life, maxLife: life, enemy, body, radius });
    this.game.fx.shockRing(pos, { colour: [0.6, 0.9, 1], size: radius * 0.4, size1: radius * 3, life: 0.5 });
    this.game.fx.chronoMotes(pos, { count: 14, spread: radius, colour: [0.6, 0.9, 1] });
  }

  updateFields(realDt) {
    for (let i = this.stasisFields.length - 1; i >= 0; i--) {
      const f = this.stasisFields[i];
      f.life -= realDt;
      f.mat.uniforms.uTime.value += realDt;
      const t = f.life / f.maxLife;
      f.mat.uniforms.uOpacity.value = 0.55 * clamp(t * 3, 0, 1) * (0.75 + Math.sin(time.realNow * 3) * 0.25);
      if (f.enemy) f.mesh.position.copy(f.enemy.position);
      if (f.body) f.mesh.position.copy(f.body.pos);
      if (f.life <= 0 || (f.enemy && !f.enemy.alive)) {
        if (f.body) { f.body.frozen = false; f.body.wake(); }
        if (f.enemy) f.enemy.frozen = 0;
        this.game.scene.remove(f.mesh);
        f.mesh.geometry.dispose();
        f.mat.dispose();
        this.stasisFields.splice(i, 1);
      }
    }
  }

  /* -------------------------------------------------------- update */

  update(realDt) {
    const p = this.game.player;
    this.lockout = Math.max(0, this.lockout - realDt);

    if (this.rewinding) { this.updateRewind(realDt); this.updateFields(realDt); return; }

    if (p.alive && !p.frozen && input.locked) {
      if (this.unlocked.dilate) {
        if (input.down('dilate')) this.startDilate();
        else this.stopDilate();
      }
      if (this.unlocked.rewind && input.hit('rewind')) this.startRewind();
      if (this.unlocked.stasis && input.hit('flash')) this.castStasis();
    } else this.stopDilate();

    if (this.dilating) {
      this.spend(this.dilateCost * realDt);
      if (this.energy <= 0.5) this.stopDilate();
      // motes streaming past the player, reading as time itself
      if (Math.random() < realDt * 26) {
        const a = rand(0, Math.PI * 2), r = rand(2, 9);
        this.game.fx.add.spawn({
          x: p.pos.x + Math.cos(a) * r, y: p.pos.y + rand(-1, 4), z: p.pos.z + Math.sin(a) * r,
          vx: rand(-0.4, 0.4), vy: rand(0.2, 1.2), vz: rand(-0.4, 0.4),
          life: rand(0.6, 1.6), size: rand(0.05, 0.16), size1: 0.01,
          r: 1.0, g: 0.82, b: 0.42, a0: 0.7, a1: 0, worldTime: false,
        });
      }
    } else {
      // regen: faster when you stand still, slower in combat
      const still = Math.hypot(p.vel.x, p.vel.z) < 0.6 ? 1.7 : 1.0;
      const threat = this.game.threatLevel > 0 ? 0.72 : 1.25;
      this.refill(this.regen * still * threat * realDt);
    }

    this.sample(realDt);
    this.updateFields(realDt);
  }

  serialize() { return { energy: this.energy, unlocked: { ...this.unlocked } }; }
  deserialize(d) {
    if (!d) return;
    this.energy = d.energy ?? this.max;
    Object.assign(this.unlocked, d.unlocked || {});
  }
}

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/* ====================================================== MANIPULATOR */

/**
 * The Chronal Manipulator's grab beam. Objects held by it hang in a pocket
 * of arrested time a few metres in front of the player, rotating gently,
 * until they are launched or dropped.
 */
export class Manipulator {
  constructor(game) {
    this.game = game;
    this.held = null;
    this.holdDist = 3.0;
    this.range = 14;
    this.puntForce = 2100;
    this.glow = null;
    this.beam = null;
    this.buildVisuals();
    this.chargeT = 0;
  }

  buildVisuals() {
    const g = this.game;
    // the tether: a stretched, additive tube from the muzzle to the object
    const geo = new THREE.CylinderGeometry(0.035, 0.10, 1, 8, 1, true);
    geo.translate(0, 0.5, 0);
    geo.rotateX(Math.PI / 2);
    this.beam = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      map: T.glow, color: 0x8fd8ff, transparent: true, opacity: 0.45,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.beam.visible = false;
    this.beam.frustumCulled = false;
    g.scene.add(this.beam);

    this.halo = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({
      map: T.glow, color: 0x8fd8ff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.halo.visible = false;
    g.scene.add(this.halo);
  }

  /** Look for a grabbable body under the crosshair. */
  findTarget() {
    const g = this.game, p = g.player;
    const origin = p.eyePosition.clone();
    const dir = p.forward.clone();
    const hit = raycast(g.world, origin, dir, this.range, (c) => !!c.body);
    if (hit && hit.collider.body && !hit.collider.body.frozen) return hit.collider.body;
    // a generous cone fallback, so grabbing feels forgiving
    let best = null, bestDot = 0.982;
    for (const b of g.world.props) {
      if (b.frozen) continue;
      _v.copy(b.pos).sub(origin);
      const d = _v.length();
      if (d > this.range || d < 0.4) continue;
      const dot = _v.divideScalar(d).dot(dir);
      if (dot > bestDot) { bestDot = dot; best = b; }
    }
    return best;
  }

  grab() {
    if (this.held) return;
    const b = this.findTarget();
    if (!b) return;
    if (b.mass > 260) { this.game.hud?.warn('MASS EXCEEDS FIELD CAPACITY'); return; }
    this.held = b;
    b.held = true;
    b.asleep = false;
    b.vel.set(0, 0, 0);
    audio.play('grab', b.pos, { vol: 0.9, ref: 8 });
    this.beam.visible = true;
    this.halo.visible = true;
    this.game.fx.shockRing(b.pos, { colour: [0.55, 0.85, 1], size: 0.3, size1: 1.8, life: 0.35 });
  }

  drop() {
    if (!this.held) return;
    this.held.held = false;
    this.held.wake();
    this.held = null;
    this.beam.visible = false;
    this.halo.visible = false;
  }

  launch() {
    if (!this.held) return;
    const p = this.game.player;
    const b = this.held;
    const dir = p.forward.clone();
    this.drop();
    b.applyImpulse(dir.x * this.puntForce, dir.y * this.puntForce + 120, dir.z * this.puntForce);
    b.spin.set(rand(-10, 10), rand(-10, 10), rand(-10, 10));
    b.thrownAt = time.realNow;
    b.thrownBy = 'player';
    this.game.fx.shockRing(b.pos, { colour: [0.6, 0.9, 1], size: 0.4, size1: 3, life: 0.35 });
    this.game.fx.chronoMotes(b.pos, { count: 10 });
  }

  /** No object held: fire a short-range concussive blast instead. */
  punt() {
    const g = this.game, p = g.player;
    const origin = p.eyePosition.clone();
    const dir = p.forward.clone();
    const reach = 9;

    // shove any loose body in a cone
    for (const b of g.world.props) {
      if (b.frozen) continue;
      _v.copy(b.pos).sub(origin);
      const d = _v.length();
      if (d > reach) continue;
      const dot = _v.clone().divideScalar(d).dot(dir);
      if (dot < 0.72) continue;
      const falloff = 1 - d / reach;
      b.applyImpulse(dir.x * this.puntForce * falloff, dir.y * this.puntForce * falloff + 200 * falloff,
                     dir.z * this.puntForce * falloff);
      b.spin.set(rand(-8, 8), rand(-8, 8), rand(-8, 8));
    }
    // and shove the enemies
    for (const e of g.enemies) {
      if (!e.alive || e.tier === 'herald') continue;
      _v.copy(e.position).sub(origin);
      const d = _v.length();
      if (d > reach) continue;
      const dot = _v.clone().divideScalar(d).dot(dir);
      if (dot < 0.68) continue;
      const falloff = 1 - d / reach;
      e.velocity.addScaledVector(dir, 22 * falloff);
      e.damage(14 * falloff, e.position.clone(), dir, 'manipulator');
      e.state = 'stagger'; e.staggerT = 0.4;
    }

    const at = origin.clone().addScaledVector(dir, 2.2);
    g.fx.shockRing(at, { colour: [0.6, 0.9, 1], size: 0.5, size1: 5, life: 0.35 });
    for (let i = 0; i < 18; i++) {
      const a = rand(0, Math.PI * 2);
      const perp = _v2.set(-dir.z, 0, dir.x).normalize().multiplyScalar(Math.cos(a) * 3);
      g.fx.add.spawn({
        x: at.x, y: at.y, z: at.z,
        vx: dir.x * rand(6, 16) + perp.x, vy: dir.y * rand(6, 16) + rand(-2, 2), vz: dir.z * rand(6, 16) + perp.z,
        life: rand(0.15, 0.4), size: rand(0.08, 0.2), size1: 0.01,
        r: 0.6, g: 0.9, b: 1, a0: 0.9, a1: 0, drag: 0.8,
      });
    }
  }

  update(realDt) {
    const g = this.game, p = g.player;
    const isCurrent = g.weapons.current === 'manipulator';

    if (!isCurrent || !p.alive) { if (this.held) this.drop(); this.beam.visible = false; this.halo.visible = false; return; }

    if (input.locked && !p.frozen) {
      if (input.mouseHit(2)) { if (this.held) this.drop(); else this.grab(); }
      if (input.hit('use') && this.held) this.drop();
    }

    if (this.held) {
      const b = this.held;
      // spring the object toward the hold point
      const goal = _v.copy(p.eyePosition).addScaledVector(p.forward, this.holdDist);
      const delta = _v2.copy(goal).sub(b.pos);
      const dist = delta.length();
      if (dist > 9) { this.drop(); return; }
      b.vel.copy(delta).multiplyScalar(clamp(14 - b.mass * 0.02, 5, 16));
      b.pos.addScaledVector(b.vel, realDt);
      b.spin.multiplyScalar(Math.pow(0.4, realDt));
      b.quat.multiply(new THREE.Quaternion().setFromEuler(
        new THREE.Euler(realDt * 0.4, realDt * 0.7, realDt * 0.2)));
      b.sync();

      // beam from the muzzle to the object
      const muzzle = g.weapons.muzzleWorld();
      this.beam.position.copy(muzzle);
      this.beam.lookAt(b.pos);
      this.beam.scale.set(1, 1, muzzle.distanceTo(b.pos));
      this.beam.material.opacity = 0.35 + Math.sin(time.realNow * 12) * 0.1;
      this.halo.position.copy(b.pos);
      this.halo.quaternion.copy(g.camera.quaternion);
      this.halo.scale.setScalar(b.r * 5);
      this.halo.material.opacity = 0.28 + Math.sin(time.realNow * 8) * 0.08;

      if (Math.random() < realDt * 22) {
        g.fx.add.spawn({
          x: b.pos.x + rand(-b.r, b.r), y: b.pos.y + rand(-b.r, b.r), z: b.pos.z + rand(-b.r, b.r),
          vx: rand(-0.4, 0.4), vy: rand(0, 0.8), vz: rand(-0.4, 0.4),
          life: rand(0.3, 0.8), size: 0.09, size1: 0.01,
          r: 0.55, g: 0.85, b: 1, a0: 0.8, a1: 0,
        });
      }
    } else {
      this.beam.visible = false;
      this.halo.visible = false;
    }
  }

  /** For the HUD: is something grabbable under the crosshair right now? */
  get hasTarget() {
    if (this.game.weapons.current !== 'manipulator') return false;
    return this.held ? true : !!this.findTarget();
  }
}
