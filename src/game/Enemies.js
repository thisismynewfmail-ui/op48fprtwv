/* HALCYON — Enemies
 *
 * Three kinds of mask, all descended from the ranks of faces on plate 3.
 *
 *   Wraith   — small, fast, closes and lunges
 *   Sentinel — large, hangs back, lobs slow chronal orbs
 *   Herald   — the thing at the Nexus that has been keeping the hour
 *
 * They all obey world time, which means the Chronometer works on them and
 * not on you. That asymmetry is the entire combat design.
 */
import * as THREE from 'three';
import { M, T } from '../world/Materials.js';
import { faceMask } from '../world/Objects.js';
import { raycast } from '../world/Physics.js';
import { clamp, lerp, damp, rand, randInt, pick } from '../core/Time.js';
import { audio } from '../core/Audio.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();

export const STATE = {
  DORMANT: 'dormant', IDLE: 'idle', ALERT: 'alert', CHASE: 'chase',
  ATTACK: 'attack', RECOVER: 'recover', STAGGER: 'stagger', DEAD: 'dead',
};

/* ============================================================== BASE */

export class Enemy {
  constructor(game, opt = {}) {
    this.game = game;
    this.position = new THREE.Vector3().copy(opt.pos || new THREE.Vector3());
    this.home = this.position.clone();
    this.velocity = new THREE.Vector3();
    this.desired = new THREE.Vector3();
    this.facing = new THREE.Quaternion();
    this.radius = opt.radius || 0.8;
    this.health = opt.health || 50;
    this.maxHealth = this.health;
    this.state = opt.dormant ? STATE.DORMANT : STATE.IDLE;
    this.stateT = 0;
    this.alive = true;
    this.target = null;
    this.attackCd = rand(0, 1);
    this.hitFlash = 0;
    this.staggerT = 0;
    this.bobPhase = rand(0, 7);
    this.group = new THREE.Group();
    this.group.position.copy(this.position);
    this.dead = false;
    this.removeMe = false;
    this.frozen = 0;                    // seconds of stasis remaining
    this.awareness = 0;                 // 0..1, ramps when the player is visible
    this.lastSeen = null;
    this.tier = opt.tier || 'wraith';
    this.dropChance = opt.dropChance ?? 0.28;
    this.scoreValue = opt.score ?? 10;
    this.onDeath = opt.onDeath || null;
    game.scene.add(this.group);
  }

  get isThreat() { return this.alive && this.state !== STATE.DORMANT; }

  wake() {
    if (this.state !== STATE.DORMANT) return;
    this.state = STATE.ALERT;
    this.stateT = 0;
  }

  /** Line of sight to the player's eye, blocked by world geometry only. */
  canSee(p) {
    const from = this.position;
    const to = p.eyePosition;
    _v.copy(to).sub(from);
    const dist = _v.length();
    if (dist > 120) return false;
    _v.divideScalar(dist);
    const hit = raycast(this.game.world, from, _v, dist - 0.4);
    return !hit;
  }

  /** Steering: seek the goal, avoid walls, keep out of other enemies. */
  steer(goal, speed, dt, opt = {}) {
    const { avoid = true, separate = true, damping = 3.4 } = opt;
    this.desired.copy(goal).sub(this.position);
    const d = this.desired.length();
    if (d > 0.001) this.desired.divideScalar(d).multiplyScalar(speed);

    if (avoid) {
      // probe ahead; if something is close, slide along it
      _v.copy(this.velocity);
      const sp = _v.length();
      if (sp > 0.2) {
        _v.divideScalar(sp);
        const probe = clamp(sp * 0.55, 1.4, 6);
        const hit = raycast(this.game.world, this.position, _v, probe + this.radius);
        if (hit) {
          const push = (1 - hit.t / (probe + this.radius)) * speed * 2.0;
          this.desired.addScaledVector(hit.normal, push);
        }
      }
    }

    if (separate) {
      for (const o of this.game.enemies) {
        if (o === this || !o.alive) continue;
        _v2.copy(this.position).sub(o.position);
        const dd = _v2.lengthSq();
        const min = (this.radius + o.radius) * 1.5;
        if (dd < min * min && dd > 1e-4) {
          const dist = Math.sqrt(dd);
          this.desired.addScaledVector(_v2.divideScalar(dist), (1 - dist / min) * speed * 1.5);
        }
      }
    }

    this.velocity.lerp(this.desired, 1 - Math.exp(-damping * dt));
  }

  integrate(dt) {
    this.position.addScaledVector(this.velocity, dt);
    this.group.position.copy(this.position);
  }

  /** Point the mask at something, with a little lazy roll. */
  faceTowards(pt, dt, rate = 6) {
    _v.copy(pt).sub(this.position);
    if (_v.lengthSq() < 1e-5) return;
    const yaw = Math.atan2(_v.x, _v.z);
    const pitch = -Math.atan2(_v.y, Math.hypot(_v.x, _v.z));
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch * 0.55, yaw, 0, 'YXZ'));
    this.group.quaternion.slerp(q, 1 - Math.exp(-rate * dt));
  }

  damage(amount, point, dir, weapon, crit) {
    if (!this.alive) return;
    if (crit) amount *= 2.1;
    this.health -= amount;
    this.hitFlash = 1;
    this.wake();
    if (this.state === STATE.DORMANT || this.state === STATE.IDLE) {
      this.state = STATE.ALERT; this.stateT = 0;
    }
    // knockback, scaled down for the heavies
    if (dir) {
      const k = 90 / (this.maxHealth * 0.6 + 40);
      this.velocity.addScaledVector(dir, amount * k);
    }
    if (amount > this.maxHealth * 0.25 && this.tier !== 'herald') {
      this.state = STATE.STAGGER;
      this.staggerT = 0.35;
    }
    this.game.hitMarker(crit);
    if (this.health <= 0) this.die(dir);
  }

  die(dir) {
    if (!this.alive) return;
    this.alive = false;
    this.dead = true;
    this.state = STATE.DEAD;
    this.game.onEnemyKilled(this);
    this.onDeath?.(this);
  }

  destroy() {
    this.group.traverse((o) => {
      if (o.geometry && o.userData.ownGeo) o.geometry.dispose();
    });
    this.game.scene.remove(this.group);
    this.removeMe = true;
  }

  applyHitFlash(dt) {
    if (this.hitFlash > 0) {
      this.hitFlash = Math.max(0, this.hitFlash - dt * 5.5);
      const m = this.mesh?.material;
      if (m && m.emissive) m.emissive.setRGB(this.hitFlash * 0.8, this.hitFlash * 0.9, this.hitFlash * 0.85);
    }
  }
}

/* ============================================================ WRAITH */

/** The rank-and-file face. Drifts, notices you, then commits to a lunge. */
export class Wraith extends Enemy {
  constructor(game, opt = {}) {
    super(game, Object.assign({ radius: 0.62, health: 46, tier: 'wraith', score: 10 }, opt));
    this.size = opt.size || 0.72;
    this.model = faceMask({ size: this.size, detail: 1 });
    this.group.add(this.model);
    this.mesh = this.model.userData.shell;
    this.eyeMat = this.model.userData.eyeMat;
    this.speed = opt.speed || 6.4;
    this.lungeSpeed = 17;
    this.damageAmount = 12;
    this.attackRange = 2.2;
    this.wanderAngle = rand(0, 7);
    this.callCd = rand(2, 8);
    this.hoverY = opt.hoverY ?? this.position.y;
  }

  update(dt, player) {
    if (!this.alive) { this.updateDeath(dt); return; }
    this.stateT += dt;
    this.applyHitFlash(dt);
    this.bobPhase += dt * 1.6;

    if (this.frozen > 0) {
      this.frozen -= dt;
      this.eyeMat.opacity = 0.15;
      this.model.rotation.z = Math.sin(this.bobPhase * 20) * 0.02;
      return;
    }

    const toPlayer = _v3.copy(player.pos).sub(this.position);
    const dist = toPlayer.length();

    switch (this.state) {
      case STATE.DORMANT: {
        // hangs in the ranks, perfectly still, eyes dark
        this.eyeMat.opacity = 0;
        this.position.y = this.home.y + Math.sin(this.bobPhase * 0.4) * 0.04;
        this.group.position.copy(this.position);
        if (dist < 16 && this.canSee(player)) {
          this.awareness += dt * 0.9;
          if (this.awareness > 1) { this.wake(); audio.play('wraith_call', this.position, { vol: 0.9, ref: 12 }); }
        }
        break;
      }
      case STATE.IDLE: {
        this.eyeMat.opacity = 0.28 + Math.sin(this.bobPhase * 2) * 0.08;
        this.wanderAngle += rand(-1, 1) * dt * 2;
        _v.set(
          this.home.x + Math.cos(this.wanderAngle) * 3.2,
          this.home.y + Math.sin(this.bobPhase * 0.7) * 0.7,
          this.home.z + Math.sin(this.wanderAngle) * 3.2);
        this.steer(_v, this.speed * 0.28, dt, { damping: 1.6 });
        this.faceTowards(_v, dt, 2.0);
        if (dist < 26 && this.canSee(player)) {
          this.awareness += dt * 1.5;
          if (this.awareness >= 1) {
            this.state = STATE.ALERT; this.stateT = 0;
            audio.play('wraith_call', this.position, { vol: 1, ref: 12 });
            this.game.alertNearby(this.position, 22);
          }
        } else this.awareness = Math.max(0, this.awareness - dt * 0.4);
        break;
      }
      case STATE.ALERT: {
        // a beat of recognition — the eyes light and the mask turns
        this.eyeMat.opacity = lerp(0.3, 1, clamp(this.stateT / 0.55, 0, 1));
        this.faceTowards(player.eyePosition, dt, 9);
        this.velocity.multiplyScalar(Math.pow(0.2, dt));
        if (this.stateT > 0.55) { this.state = STATE.CHASE; this.stateT = 0; }
        break;
      }
      case STATE.CHASE: {
        this.eyeMat.opacity = 0.85 + Math.sin(this.bobPhase * 8) * 0.15;
        // approach on a slight orbit so a pack doesn't stack into a line
        const side = _v.set(-toPlayer.z, 0, toPlayer.x).normalize().multiplyScalar(Math.sin(this.wanderAngle) * 3.4);
        _v2.copy(player.eyePosition).add(side);
        _v2.y = player.pos.y + 1.1 + Math.sin(this.bobPhase) * 0.4;
        this.steer(_v2, this.speed, dt);
        this.faceTowards(player.eyePosition, dt, 7);
        this.attackCd -= dt;
        this.callCd -= dt;
        if (this.callCd < 0) { this.callCd = rand(4, 11); audio.play('wraith_call', this.position, { vol: 0.55, ref: 14 }); }
        if (dist < 6.5 && this.attackCd <= 0 && this.canSee(player)) {
          this.state = STATE.ATTACK; this.stateT = 0;
          this.lungeDir = toPlayer.clone().normalize();
          audio.play('wraith_lunge', this.position, { vol: 1, ref: 10 });
        }
        if (dist > 48) { this.awareness = 0; this.state = STATE.IDLE; this.stateT = 0; }
        break;
      }
      case STATE.ATTACK: {
        this.eyeMat.opacity = 1;
        // 0.18s of wind-up, then commit along the stored direction
        if (this.stateT < 0.18) {
          this.velocity.multiplyScalar(Math.pow(0.02, dt));
          this.model.scale.setScalar(1 - this.stateT * 0.5);
        } else {
          this.model.scale.setScalar(1.08);
          this.velocity.lerp(_v.copy(this.lungeDir).multiplyScalar(this.lungeSpeed), 1 - Math.exp(-14 * dt));
          if (dist < this.attackRange && this.stateT < 0.62) {
            player.damage(this.damageAmount, this.position, 'wraith');
            this.state = STATE.RECOVER; this.stateT = 0;
            this.velocity.copy(this.lungeDir).multiplyScalar(-7);
            this.game.fx.chronoMotes(this.position, { count: 6, colour: [0.4, 1, 0.75] });
          }
        }
        if (this.stateT > 0.72) { this.state = STATE.RECOVER; this.stateT = 0; }
        break;
      }
      case STATE.RECOVER: {
        this.model.scale.setScalar(damp(this.model.scale.x, 1, 8, dt));
        this.velocity.multiplyScalar(Math.pow(0.1, dt));
        this.faceTowards(player.eyePosition, dt, 4);
        if (this.stateT > 0.55) {
          this.state = STATE.CHASE; this.stateT = 0;
          this.attackCd = rand(0.7, 1.9);
        }
        break;
      }
      case STATE.STAGGER: {
        this.staggerT -= dt;
        this.model.rotation.z = Math.sin(this.stateT * 40) * 0.16;
        this.velocity.multiplyScalar(Math.pow(0.4, dt));
        if (this.staggerT <= 0) {
          this.model.rotation.z = 0;
          this.state = STATE.CHASE; this.stateT = 0;
        }
        break;
      }
    }

    if (this.state !== STATE.DORMANT) this.integrate(dt);
    // gentle float so nothing ever sits perfectly still
    this.group.position.y += Math.sin(this.bobPhase * 1.3) * 0.03;
  }

  updateDeath(dt) {
    this.deathT = (this.deathT || 0) + dt;
    if (this.deathT > 0.02 && !this._shattered) {
      this._shattered = true;
      this.game.fx.shatterMask(this.position, { size: this.size * 1.2, count: 18 });
      audio.play('wraith_die', this.position, { vol: 1, ref: 12 });
      this.game.postfx?.kick(0.16, 6);
      this.model.visible = false;
    }
    if (this.deathT > 0.4) this.destroy();
  }
}

/* ========================================================== SENTINEL */

/** Bigger, slower, and it shoots. The reason you learn to dilate time. */
export class Sentinel extends Enemy {
  constructor(game, opt = {}) {
    super(game, Object.assign({ radius: 1.15, health: 145, tier: 'sentinel', score: 30, dropChance: 0.55 }, opt));
    this.size = opt.size || 1.35;
    this.model = faceMask({ size: this.size, detail: 1, mat: M.pcbDark });
    this.group.add(this.model);
    this.mesh = this.model.userData.shell;
    this.eyeMat = this.model.userData.eyeMat;
    this.eyeMat.color.setHex(0xffb45a);
    this.speed = 3.4;
    this.preferred = opt.preferred ?? 15;
    this.fireCd = rand(1.5, 3.5);
    this.burst = 0;
    this.orbDamage = 17;

    // an orbiting brass armature, because these things are older than the wraiths
    this.rings = [];
    for (let i = 0; i < 2; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(this.size * 1.55, 0.05, 6, 26), M.brass);
      r.rotation.set(i * 1.2, i * 0.8, 0.4);
      this.group.add(r);
      this.rings.push(r);
    }
  }

  update(dt, player) {
    if (!this.alive) { this.updateDeath(dt); return; }
    this.stateT += dt;
    this.applyHitFlash(dt);
    this.bobPhase += dt * 1.1;
    for (let i = 0; i < this.rings.length; i++) {
      this.rings[i].rotation.z += dt * (0.5 + i * 0.4) * (this.state === STATE.ATTACK ? 4 : 1);
    }

    if (this.frozen > 0) { this.frozen -= dt; this.eyeMat.opacity = 0.15; return; }

    const toPlayer = _v3.copy(player.pos).sub(this.position);
    const dist = toPlayer.length();
    const sees = this.canSee(player);

    switch (this.state) {
      case STATE.DORMANT:
        this.eyeMat.opacity = 0;
        if (dist < 22 && sees) { this.awareness += dt; if (this.awareness > 1) this.wake(); }
        break;
      case STATE.IDLE:
        this.eyeMat.opacity = 0.2;
        _v.copy(this.home); _v.y += Math.sin(this.bobPhase * 0.6) * 0.5;
        this.steer(_v, this.speed * 0.4, dt, { damping: 1.4 });
        this.faceTowards(player.pos, dt, 1.4);
        if (dist < 36 && sees) {
          this.awareness += dt * 1.2;
          if (this.awareness >= 1) { this.state = STATE.ALERT; this.stateT = 0; this.game.alertNearby(this.position, 26); }
        }
        break;
      case STATE.ALERT:
        this.eyeMat.opacity = lerp(0.2, 1, clamp(this.stateT / 0.8, 0, 1));
        this.faceTowards(player.eyePosition, dt, 5);
        audio.play('alarm', this.position, { vol: this.stateT < 0.05 ? 0.9 : 0, ref: 16 });
        if (this.stateT > 0.8) { this.state = STATE.CHASE; this.stateT = 0; }
        break;
      case STATE.CHASE: {
        this.eyeMat.opacity = 0.9;
        // hold station at `preferred` range, strafing slowly
        const ang = this.stateT * 0.5 + this.bobPhase * 0.2;
        _v.copy(toPlayer).normalize().multiplyScalar(-this.preferred);
        _v2.set(-_v.z, 0, _v.x).normalize().multiplyScalar(Math.sin(ang) * 5);
        _v.add(_v2).add(player.pos);
        _v.y = player.pos.y + 3.4 + Math.sin(this.bobPhase) * 0.8;
        this.steer(_v, this.speed, dt, { damping: 2.2 });
        this.faceTowards(player.eyePosition, dt, 4.5);
        this.fireCd -= dt;
        if (this.fireCd <= 0 && sees && dist < 44) {
          this.state = STATE.ATTACK; this.stateT = 0; this.burst = 3;
        }
        break;
      }
      case STATE.ATTACK: {
        this.eyeMat.opacity = 1;
        this.velocity.multiplyScalar(Math.pow(0.25, dt));
        this.faceTowards(player.eyePosition, dt, 8);
        const shotAt = 0.35;
        const per = 0.42;
        const shots = Math.floor((this.stateT - shotAt) / per) + 1;
        if (this.stateT >= shotAt && shots > (3 - this.burst) && this.burst > 0) {
          this.burst--;
          this.fireOrb(player);
        }
        if (this.burst <= 0 && this.stateT > shotAt + per * 3) {
          this.state = STATE.CHASE; this.stateT = 0;
          this.fireCd = rand(2.2, 4.0) * (this.game.difficulty === 2 ? 0.7 : 1);
        }
        break;
      }
      case STATE.STAGGER:
        this.staggerT -= dt;
        this.velocity.multiplyScalar(Math.pow(0.5, dt));
        if (this.staggerT <= 0) { this.state = STATE.CHASE; this.stateT = 0; }
        break;
    }
    this.integrate(dt);
  }

  fireOrb(player) {
    const from = this.position.clone();
    from.y -= this.size * 0.1;
    // lead the player a little, but not enough to be unfair
    const lead = _v.copy(player.vel).multiplyScalar(0.28);
    const to = _v2.copy(player.eyePosition).add(lead);
    const dir = to.sub(from).normalize();
    this.game.spawnOrb(from, dir, {
      speed: 15, damage: this.orbDamage, owner: this, colour: 0xffa860,
    });
    audio.play('orb_fire', this.position, { vol: 1, ref: 14 });
    this.game.fx.chronoMotes(from, { count: 5, colour: [1, 0.7, 0.35], spread: 0.5 });
  }

  updateDeath(dt) {
    this.deathT = (this.deathT || 0) + dt;
    if (!this._shattered) {
      this._shattered = true;
      this.game.fx.shatterMask(this.position, { size: this.size * 1.4, count: 26, colour: [0.9, 0.7, 0.35] });
      this.game.fx.explosion(this.position, { colour: [1, 0.7, 0.4], scale: 0.7 });
      audio.play('wraith_die', this.position, { vol: 1, ref: 16 });
      this.game.postfx?.kick(0.32, 5);
      this.model.visible = false;
      for (const r of this.rings) r.visible = false;
    }
    if (this.deathT > 0.5) this.destroy();
  }
}

/* ============================================================ HERALD */

/**
 * The boss of the Nexus. Three phases keyed to its health: it summons, it
 * barrages, and when it is nearly finished it drags the great clock hand
 * around the platform and tries to sweep you off the edge.
 */
export class Herald extends Enemy {
  constructor(game, opt = {}) {
    super(game, Object.assign({ radius: 3.0, health: 1400, tier: 'herald', score: 500, dropChance: 0 }, opt));
    this.size = 3.2;
    this.model = faceMask({ size: this.size, detail: 1, hot: true });
    this.group.add(this.model);
    this.mesh = this.model.userData.shell;
    this.eyeMat = this.model.userData.eyeMat;
    this.eyeMat.color.setHex(0xff4a2a);
    this.speed = 3.0;
    this.phase = 1;
    this.phaseT = 0;
    this.actionCd = 3.0;
    this.action = null;
    this.summoned = 0;
    this.invuln = 0;
    this.state = STATE.DORMANT;

    // the clock hand it wears like a halo
    this.hand = new THREE.Group();
    const shape = new THREE.Shape();
    shape.moveTo(-0.22, -1.2); shape.lineTo(-0.10, 12); shape.lineTo(0, 13.2);
    shape.lineTo(0.10, 12); shape.lineTo(0.22, -1.2); shape.closePath();
    const hg = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.18, bevelEnabled: false }), M.gold);
    hg.position.z = -0.09;
    this.hand.add(hg);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 0.4, 20), M.goldDark);
    hub.rotation.x = Math.PI / 2;
    this.hand.add(hub);
    this.hand.visible = false;
    this.hand.position.copy(this.position);
    game.scene.add(this.hand);

    // an aura ring that tightens as it loses health
    this.aura = new THREE.Mesh(new THREE.TorusGeometry(this.size * 2.0, 0.09, 8, 48), M.brass);
    this.aura.rotation.x = Math.PI / 2;
    this.group.add(this.aura);

    this.halo = new THREE.Mesh(new THREE.PlaneGeometry(this.size * 8, this.size * 8),
      new THREE.MeshBasicMaterial({ map: T.glow, color: 0xff5a2a, transparent: true,
        opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.group.add(this.halo);
  }

  wake() {
    if (this.state !== STATE.DORMANT) return;
    this.state = STATE.ALERT;
    this.stateT = 0;
    audio.sfx_herald_roar(1, 0, 0);
    this.game.postfx?.kick(0.9, 1.4);
  }

  damage(amount, point, dir, weapon, crit) {
    if (this.invuln > 0) { this.game.hitMarker(false); return; }
    super.damage(amount, point, dir, weapon, crit);
    const frac = this.health / this.maxHealth;
    const want = frac > 0.66 ? 1 : frac > 0.33 ? 2 : 3;
    if (want !== this.phase && this.alive) {
      this.phase = want;
      this.phaseT = 0;
      this.invuln = 1.6;
      this.action = 'phase';
      this.stateT = 0;
      audio.sfx_herald_roar(1, 0, 0);
      this.game.postfx?.kick(0.8, 1.6);
      this.game.onHeraldPhase?.(this.phase);
    }
  }

  update(dt, player) {
    if (!this.alive) { this.updateDeath(dt); return; }
    this.stateT += dt;
    this.phaseT += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.applyHitFlash(dt);
    this.bobPhase += dt;
    this.halo.quaternion.copy(this.game.camera.quaternion);
    this.aura.rotation.z += dt * 0.6;
    this.aura.scale.setScalar(lerp(0.7, 1.15, this.health / this.maxHealth));

    if (this.state === STATE.DORMANT) {
      this.eyeMat.opacity = 0;
      this.position.y = this.home.y + Math.sin(this.bobPhase * 0.3) * 0.15;
      this.group.position.copy(this.position);
      return;
    }
    if (this.frozen > 0) { this.frozen -= dt; return; }

    this.eyeMat.opacity = 0.7 + Math.sin(this.bobPhase * 5) * 0.3;
    const toPlayer = _v3.copy(player.pos).sub(this.position);
    const dist = toPlayer.length();
    this.faceTowards(player.eyePosition, dt, 2.4);

    if (this.state === STATE.ALERT) {
      if (this.stateT > 2.2) { this.state = STATE.CHASE; this.stateT = 0; }
      this.position.y = damp(this.position.y, this.home.y + 3, 1.2, dt);
      this.group.position.copy(this.position);
      return;
    }

    if (this.action === 'phase') {
      // rears back, wreathed in motes, untouchable for a moment
      this.game.fx.chronoMotes(this.position, { count: 6, spread: 4, colour: [1, 0.4, 0.2], rise: 3 });
      this.velocity.multiplyScalar(Math.pow(0.1, dt));
      if (this.stateT > 1.6) { this.action = null; this.stateT = 0; this.actionCd = 0.6; }
      this.integrate(dt);
      return;
    }

    this.actionCd -= dt;
    if (!this.action && this.actionCd <= 0) this.pickAction(dist);

    switch (this.action) {
      case 'summon': this.doSummon(dt, player); break;
      case 'barrage': this.doBarrage(dt, player); break;
      case 'sweep': this.doSweep(dt, player); break;
      default: {
        // reposition: hold a wide orbit
        const ang = this.bobPhase * 0.35;
        _v.set(Math.cos(ang) * 16, 0, Math.sin(ang) * 16).add(this.home);
        _v.y = this.home.y + 3.5 + Math.sin(this.bobPhase * 0.7) * 1.2;
        this.steer(_v, this.speed, dt, { separate: false, damping: 1.4 });
        break;
      }
    }
    this.integrate(dt);
    this.hand.position.copy(this.position);
  }

  pickAction(dist) {
    const opts = this.phase === 1 ? ['summon', 'barrage']
      : this.phase === 2 ? ['barrage', 'summon', 'barrage']
      : ['sweep', 'barrage', 'sweep', 'summon'];
    this.action = pick(opts);
    this.stateT = 0;
    this._did = 0;
    if (this.action === 'sweep') {
      this.hand.visible = true;
      this.handAngle = rand(0, Math.PI * 2);
      audio.sfx_gear(1, 0, 0);
    }
  }

  doSummon(dt, player) {
    this.velocity.multiplyScalar(Math.pow(0.2, dt));
    if (this.stateT > 0.8 && this._did < (this.phase >= 2 ? 4 : 2)) {
      const n = this._did++;
      const a = rand(0, Math.PI * 2);
      const p = this.position.clone().add(new THREE.Vector3(Math.cos(a) * 5, -1 + n * 0.6, Math.sin(a) * 5));
      this.game.spawnWraith(p, { alerted: true, speed: 7.2 });
      this.game.fx.shockRing(p, { colour: [1, 0.5, 0.2], size: 0.6, size1: 3.5 });
      audio.play('glitch', p, { vol: 0.9, ref: 14 });
      this.stateT = 0.3;
    }
    if (this._did >= (this.phase >= 2 ? 4 : 2) && this.stateT > 0.6) {
      this.action = null;
      this.actionCd = rand(3.5, 5.5) - this.phase * 0.6;
    }
  }

  doBarrage(dt, player) {
    this.velocity.multiplyScalar(Math.pow(0.35, dt));
    const total = 4 + this.phase * 3;
    const per = 0.16;
    if (this.stateT > 0.5) {
      const want = Math.floor((this.stateT - 0.5) / per);
      while (this._did < want && this._did < total) {
        this._did++;
        const spread = this.phase >= 3 ? 0.16 : 0.09;
        const from = this.position.clone();
        const dir = _v.copy(player.eyePosition).sub(from).normalize();
        dir.x += rand(-spread, spread); dir.y += rand(-spread * 0.5, spread * 0.5); dir.z += rand(-spread, spread);
        dir.normalize();
        this.game.spawnOrb(from, dir, { speed: 17 + this.phase, damage: 15, owner: this, colour: 0xff5a2a, size: 0.45 });
        audio.play('orb_fire', this.position, { vol: 0.8, ref: 18 });
      }
    }
    if (this._did >= total && this.stateT > 0.5 + per * total + 0.5) {
      this.action = null;
      this.actionCd = rand(2.4, 4.2) - this.phase * 0.5;
    }
  }

  /** Drags the great clock hand around the arena at ankle height. */
  doSweep(dt, player) {
    this.velocity.multiplyScalar(Math.pow(0.4, dt));
    this.position.y = damp(this.position.y, this.home.y + 5.5, 3, dt);
    const windup = 1.1;
    if (this.stateT < windup) {
      this.hand.rotation.y = this.handAngle;
      this.hand.rotation.z = lerp(0.3, 0, this.stateT / windup);
      this.hand.scale.setScalar(lerp(0.2, 1, clamp(this.stateT / windup, 0, 1)));
      return;
    }
    const t = this.stateT - windup;
    const sweepSpeed = 2.6 + this.phase * 0.4;
    this.hand.rotation.y = this.handAngle + t * sweepSpeed;
    this.hand.position.y = this.home.y + 0.7;

    // the hand's leading edge is the hitbox
    const ang = this.hand.rotation.y;
    const toP = _v.copy(player.pos).sub(this.hand.position);
    toP.y = 0;
    const pd = toP.length();
    if (pd < 13 && pd > 1.5 && player.pos.y < this.home.y + 2.6) {
      const pa = Math.atan2(toP.x, toP.z);
      let diff = ((pa - ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      if (Math.abs(diff) < 0.14 && !this._sweepHit) {
        this._sweepHit = true;
        player.damage(22, this.hand.position, 'sweep');
        player.vel.addScaledVector(_v.set(Math.sin(ang + Math.PI / 2), 0, Math.cos(ang + Math.PI / 2)), 16);
        player.vel.y += 5;
        this.game.postfx?.kick(0.5, 4);
      }
      if (Math.abs(diff) > 0.6) this._sweepHit = false;
    }
    if (t > Math.PI * 2 / sweepSpeed * 1.05) {
      this.hand.visible = false;
      this._sweepHit = false;
      this.action = null;
      this.actionCd = rand(3.0, 4.5);
    }
  }

  updateDeath(dt) {
    this.deathT = (this.deathT || 0) + dt;
    this.hand.visible = false;
    if (this.deathT < 3.2) {
      // it comes apart slowly, and the clock finally stops
      if (Math.random() < dt * 14) {
        const p = this.position.clone().add(new THREE.Vector3(rand(-3, 3), rand(-3, 3), rand(-3, 3)));
        this.game.fx.explosion(p, { colour: [1, 0.5, 0.25], scale: 0.5 });
        audio.play('glitch', p, { vol: 0.7, ref: 20 });
      }
      this.group.rotation.z += dt * 0.7;
      this.group.position.y -= dt * 0.5;
      this.model.scale.setScalar(damp(this.model.scale.x, 0.75, 0.6, dt));
      return;
    }
    if (!this._final) {
      this._final = true;
      this.game.fx.shatterMask(this.position, { size: this.size * 2.4, count: 60, colour: [1, 0.6, 0.3] });
      this.game.fx.explosion(this.position, { colour: [1, 0.8, 0.5], scale: 3 });
      this.game.postfx?.kick(1.0, 1.0);
      audio.sfx_herald_roar(1, 0, 0);
      this.game.scene.remove(this.hand);
    }
    if (this.deathT > 4.4) this.destroy();
  }
}

/* ====================================================== ORB PROJECTILE */

/** The slow chronal orb. Slow enough to dodge, and it obeys world time. */
export class Orb {
  constructor(game, from, dir, opt = {}) {
    this.game = game;
    this.pos = from.clone();
    this.dir = dir.clone().normalize();
    this.speed = opt.speed || 15;
    this.damage = opt.damage || 16;
    this.owner = opt.owner || null;
    this.life = 0;
    this.maxLife = opt.life || 7;
    this.radius = opt.size || 0.34;
    this.alive = true;
    this.colour = opt.colour ?? 0xffa860;
    this.frozen = false;

    const c = new THREE.Color(this.colour);
    this.mesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(this.radius, 1),
      new THREE.MeshBasicMaterial({ color: c }));
    this.mesh.position.copy(this.pos);
    game.scene.add(this.mesh);
    this.halo = new THREE.Mesh(new THREE.PlaneGeometry(this.radius * 8, this.radius * 8),
      new THREE.MeshBasicMaterial({ map: T.glow, color: c, transparent: true,
        opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.mesh.add(this.halo);
    this.c = [c.r, c.g, c.b];
  }

  update(dt, player) {
    if (!this.alive) return;
    if (this.frozen) { this.halo.quaternion.copy(this.game.camera.quaternion); return; }
    this.life += dt;
    if (this.life > this.maxLife) { this.destroy(); return; }

    const step = this.speed * dt;
    const hit = raycast(this.game.world, this.pos, this.dir, step + this.radius);
    // player hit test: sphere vs capsule, done as a distance to the eye line
    const pp = _v.set(player.pos.x, clamp(this.pos.y, player.pos.y + 0.3, player.pos.y + player.height - 0.3), player.pos.z);
    const toPlayer = _v2.copy(pp).sub(this.pos);
    if (toPlayer.length() < this.radius + player.radius + step) {
      player.damage(this.damage, this.pos, 'orb');
      this.burst();
      return;
    }
    if (hit) {
      this.pos.copy(hit.point);
      this.burst(hit.normal);
      return;
    }
    this.pos.addScaledVector(this.dir, step);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.x += dt * 4;
    this.mesh.rotation.y += dt * 3;
    this.halo.quaternion.copy(this.game.camera.quaternion);
    if (Math.random() < dt * 30) {
      this.game.fx.add.spawn({
        x: this.pos.x, y: this.pos.y, z: this.pos.z,
        vx: rand(-0.5, 0.5), vy: rand(-0.5, 0.5), vz: rand(-0.5, 0.5),
        life: rand(0.2, 0.5), size: this.radius * 1.2, size1: 0.02,
        r: this.c[0], g: this.c[1], b: this.c[2], a0: 0.6, a1: 0,
      });
    }
  }

  burst(normal) {
    this.game.fx.explosion(this.pos, { colour: this.c, scale: 0.42 });
    audio.play('orb_hit', this.pos, { vol: 0.9, ref: 12 });
    if (normal) this.game.fx.decals.place(this.pos, normal, { size: 0.5, opacity: 0.6, colour: 0x2a1408 });
    this.destroy();
  }

  destroy() {
    this.alive = false;
    this.game.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
