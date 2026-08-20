/* HALCYON — Player
 *
 * Source-style movement: explicit ground acceleration with a friction pass,
 * air-strafe control, crouch that shrinks the capsule from the top, and a
 * view that bobs, rolls into strafes and lags a frame behind the aim.
 */
import * as THREE from 'three';
import { input } from '../core/Input.js';
import { cfg } from '../core/Config.js';
import { time, clamp, damp, lerp, rand } from '../core/Time.js';
import { audio } from '../core/Audio.js';
import { moveCapsule, raycast, LAYER } from '../world/Physics.js';

const HULL = {
  radius: 0.34,
  standHeight: 1.82,
  crouchHeight: 1.05,
  eyeStand: 1.66,
  eyeCrouch: 0.92,
};

const SPEED = {
  walk: 4.9,
  sprint: 7.4,
  crouch: 2.3,
  air: 1.4,
  accel: 12.5,
  airAccel: 22.0,
  friction: 6.2,
  stopSpeed: 1.4,
  jump: 6.35,
};

export class Player {
  constructor(world, camera) {
    this.world = world;
    this.camera = camera;

    this.pos = new THREE.Vector3(0, 2, 0);      // foot position
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.height = HULL.standHeight;
    this.eye = HULL.eyeStand;
    this.radius = HULL.radius;

    this.grounded = false;
    this.wasGrounded = false;
    this.crouching = false;
    this.sprinting = false;
    this.surface = 'marble';

    this.health = 100;
    this.maxHealth = 100;
    this.armour = 0;                            // "chronal shielding"
    this.alive = true;
    this.deathTimer = 0;

    // --- view feel ---
    this.bobPhase = 0;
    this.bobAmount = 0;
    this.viewRoll = 0;
    this.viewPunch = new THREE.Vector2();
    this.viewPunchVel = new THREE.Vector2();
    this.landDip = 0;
    this.landDipVel = 0;
    this.stepDist = 0;
    this.lastFootstep = 0;
    this.fovOffset = 0;
    this.damageDirs = [];

    this.noclip = false;
    this.godmode = false;
    this.frozen = false;                        // cutscene lock

    this._tmp = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._move = { x: 0, y: 0 };
    this.onDeath = null;
    this.onDamage = null;
    this.onLand = null;
  }

  teleport(x, y, z, yaw = this.yaw) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.grounded = false;
  }

  get eyePosition() {
    return this._tmp.set(this.pos.x, this.pos.y + this.eye + this.landDip, this.pos.z);
  }

  get forward() {
    return this._fwd.set(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)).normalize();
  }

  get flatForward() {
    return this._fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  get right() {
    return this._right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  /* ------------------------------------------------------------ look */

  look(dt) {
    if (this.frozen || !this.alive) return;
    const s = cfg.m_sensitivity;
    this.yaw -= input.mouse.dx * s;
    this.pitch -= input.mouse.dy * s;
    const lim = Math.PI / 2 - 0.015;
    this.pitch = clamp(this.pitch, -lim, lim);
    this.yaw = ((this.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

    // view punch: a damped spring the weapons kick
    const k = 46, d = 11;
    this.viewPunchVel.x += (-this.viewPunch.x * k - this.viewPunchVel.x * d) * dt;
    this.viewPunchVel.y += (-this.viewPunch.y * k - this.viewPunchVel.y * d) * dt;
    this.viewPunch.x += this.viewPunchVel.x * dt;
    this.viewPunch.y += this.viewPunchVel.y * dt;
  }

  punch(pitchAmt, yawAmt) {
    this.viewPunchVel.x += pitchAmt;
    this.viewPunchVel.y += yawAmt;
  }

  /* -------------------------------------------------------- movement */

  /**
   * Quake/Source acceleration: project current velocity onto the wish
   * direction, and only add the shortfall. This is what makes air-strafing
   * and bunny-hopping feel the way they do, and it is worth preserving.
   */
  accelerate(wishDir, wishSpeed, accel, dt) {
    const current = this.vel.x * wishDir.x + this.vel.z * wishDir.z;
    const add = wishSpeed - current;
    if (add <= 0) return;
    let a = accel * wishSpeed * dt;
    if (a > add) a = add;
    this.vel.x += wishDir.x * a;
    this.vel.z += wishDir.z * a;
  }

  applyFriction(dt) {
    const speed = Math.hypot(this.vel.x, this.vel.z);
    if (speed < 0.001) { this.vel.x = 0; this.vel.z = 0; return; }
    const control = Math.max(speed, SPEED.stopSpeed);
    let drop = control * SPEED.friction * dt;
    const newSpeed = Math.max(0, speed - drop) / speed;
    this.vel.x *= newSpeed;
    this.vel.z *= newSpeed;
  }

  update(dt) {
    if (!this.alive) { this.updateDead(dt); return; }
    this.look(dt);

    const wantCrouch = input.down('crouch') && !this.frozen;
    this.setCrouch(wantCrouch);

    if (this.noclip) { this.updateNoclip(dt); return; }

    const mv = this.frozen ? { x: 0, y: 0 } : input.moveVector(this._move);
    const f = this.flatForward.clone();
    const r = this.right;
    const wish = this._tmp.set(f.x * mv.y + r.x * mv.x, 0, f.z * mv.y + r.z * mv.x);
    const wishLen = Math.hypot(wish.x, wish.z);
    if (wishLen > 0.001) { wish.x /= wishLen; wish.z /= wishLen; }

    this.sprinting = !this.crouching && input.down('sprint') && mv.y > 0.1 && this.grounded;
    let maxSpeed = this.crouching ? SPEED.crouch : this.sprinting ? SPEED.sprint : SPEED.walk;
    maxSpeed *= wishLen;

    if (this.grounded) {
      this.applyFriction(dt);
      this.accelerate(wish, maxSpeed, SPEED.accel, dt);
      if (input.down('jump') && !this.frozen) {
        this.vel.y = SPEED.jump;
        this.grounded = false;
        audio.play('jump', this.pos, { vol: 0.5 });
      }
    } else {
      // air control: capped wish speed, high acceleration
      this.accelerate(wish, Math.min(maxSpeed, SPEED.air), SPEED.airAccel, dt);
      this.vel.y += this.world.gravity * dt;
    }

    const before = this.vel.y;
    const res = moveCapsule(this.world, this.pos, this.vel, this.radius, this.height, dt, {
      stepHeight: this.crouching ? 0.35 : 0.55,
      mass: 82,
    });

    this.wasGrounded = this.grounded;
    this.grounded = res.grounded;
    this.surface = res.groundSurface || 'marble';
    if (res.ceiling && this.vel.y > 0) this.vel.y = 0;
    if (this.grounded && this.vel.y < 0) this.vel.y = 0;

    // landing
    if (this.grounded && !this.wasGrounded) {
      const impact = -before;
      if (impact > 3) {
        this.landDipVel -= Math.min(0.22, impact * 0.016);
        audio.play('land', this.pos, { vol: clamp(impact / 12, 0.2, 1), surface: this.surface });
        if (impact > 12 && !this.godmode) {
          this.damage(Math.floor((impact - 12) * 4.5), null, 'fall');
        }
        this.onLand?.(impact);
      }
    }

    this.updateView(dt, Math.hypot(this.vel.x, this.vel.z));
    this.checkVoid();
  }

  updateNoclip(dt) {
    const mv = input.moveVector(this._move);
    const f = this.forward.clone(), r = this.right;
    const sp = input.down('sprint') ? 34 : 13;
    this.vel.set(0, 0, 0);
    this.pos.addScaledVector(f, mv.y * sp * dt);
    this.pos.addScaledVector(r, mv.x * sp * dt);
    if (input.down('jump')) this.pos.y += sp * dt;
    if (input.down('crouch')) this.pos.y -= sp * dt;
    this.updateView(dt, 0);
  }

  updateDead(dt) {
    this.deathTimer += dt;
    // the camera slumps to the floor and rolls
    this.eye = damp(this.eye, 0.34, 3.2, dt);
    this.viewRoll = damp(this.viewRoll, 0.55, 2.0, dt);
    this.pitch = damp(this.pitch, -0.28, 1.6, dt);
    this.vel.y += this.world.gravity * dt;
    moveCapsule(this.world, this.pos, this.vel, this.radius, 0.5, dt, {});
    this.applyCamera();
  }

  setCrouch(want) {
    if (want === this.crouching) return;
    if (!want) {
      // only stand up if there is room
      const need = HULL.standHeight;
      const hit = raycast(this.world, { x: this.pos.x, y: this.pos.y + this.height - 0.05, z: this.pos.z },
        { x: 0, y: 1, z: 0 }, need - this.height + this.radius);
      if (hit) return;
    }
    this.crouching = want;
  }

  updateView(dt, speed) {
    // capsule + eye heights ease toward the crouch state
    const targetH = this.crouching ? HULL.crouchHeight : HULL.standHeight;
    const targetEye = this.crouching ? HULL.eyeCrouch : HULL.eyeStand;
    this.height = damp(this.height, targetH, 14, dt);
    this.eye = damp(this.eye, targetEye, 12, dt);

    // head bob, scaled by speed and disabled in the air
    const moving = this.grounded && speed > 0.6;
    this.bobAmount = damp(this.bobAmount, moving ? clamp(speed / SPEED.walk, 0, 1.4) : 0, 8, dt);
    if (moving) this.bobPhase += dt * speed * 1.55;

    // strafe roll — subtle, the way Source did it
    const lateral = this.vel.x * this.right.x + this.vel.z * this.right.z;
    this.viewRoll = damp(this.viewRoll, clamp(-lateral / SPEED.walk, -1, 1) * 0.026, 9, dt);

    // landing dip spring
    this.landDipVel += (-this.landDip * 90 - this.landDipVel * 13) * dt;
    this.landDip += this.landDipVel * dt;
    this.landDip = clamp(this.landDip, -0.35, 0.1);

    // fov swells slightly when sprinting
    this.fovOffset = damp(this.fovOffset, this.sprinting ? 7 : 0, 6, dt);

    // footsteps keyed to distance travelled, not to a timer
    if (moving) {
      this.stepDist += speed * dt;
      const stride = this.crouching ? 1.4 : this.sprinting ? 1.65 : 1.32;
      if (this.stepDist > stride) {
        this.stepDist = 0;
        audio.play('footstep', this.pos, {
          vol: this.crouching ? 0.35 : this.sprinting ? 0.9 : 0.62,
          surface: this.surface, ref: 4,
        });
      }
    } else this.stepDist = Math.min(this.stepDist, 0.9);

    this.applyCamera();
  }

  applyCamera() {
    const cam = this.camera;
    const bobY = Math.sin(this.bobPhase * 2) * 0.038 * this.bobAmount * cfg.r_viewbob;
    const bobX = Math.cos(this.bobPhase) * 0.045 * this.bobAmount * cfg.r_viewbob;
    const rollBob = Math.cos(this.bobPhase) * 0.008 * this.bobAmount * cfg.r_viewbob;

    const r = this.right;
    cam.position.set(
      this.pos.x + r.x * bobX,
      this.pos.y + this.eye + this.landDip + bobY,
      this.pos.z + r.z * bobX);
    cam.rotation.order = 'YXZ';
    cam.rotation.y = this.yaw + this.viewPunch.y;
    cam.rotation.x = this.pitch + this.viewPunch.x;
    cam.rotation.z = this.viewRoll + rollBob;

    const targetFov = cfg.r_fov + this.fovOffset;
    if (Math.abs(cam.fov - targetFov) > 0.01) {
      cam.fov = damp(cam.fov, targetFov, 10, Math.min(0.05, time.realDt));
      cam.updateProjectionMatrix();
    }
  }

  /* ------------------------------------------------------------ life */

  damage(amount, fromPos, kind = 'generic') {
    if (!this.alive || this.godmode) return;
    // chronal shielding soaks two thirds, HL2's suit-power arithmetic
    if (this.armour > 0) {
      const soak = Math.min(this.armour, amount * 0.66);
      this.armour -= soak;
      amount -= soak;
    }
    this.health -= amount;
    if (fromPos) {
      const dx = fromPos.x - this.pos.x, dz = fromPos.z - this.pos.z;
      const a = Math.atan2(dx, dz) + this.yaw;
      this.damageDirs.push({ angle: a, t: 1.0 });
      // flinch
      this.punch((Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2);
    } else {
      this.punch(-0.9, (Math.random() - 0.5) * 0.6);
    }
    audio.play('hurt', this.pos, { vol: 0.7 });
    this.onDamage?.(amount, kind);
    if (this.health <= 0) this.die();
  }

  heal(n) {
    this.health = Math.min(this.maxHealth, this.health + n);
  }
  giveArmour(n) {
    this.armour = Math.min(100, this.armour + n);
  }

  die() {
    if (!this.alive) return;
    this.alive = false;
    this.health = 0;
    this.deathTimer = 0;
    audio.sfx_death(1);
    this.onDeath?.();
  }

  respawn(x, y, z, yaw) {
    this.alive = true;
    this.health = this.maxHealth;
    this.deathTimer = 0;
    this.viewRoll = 0;
    this.eye = HULL.eyeStand;
    this.height = HULL.standHeight;
    this.pitch = 0;
    this.teleport(x, y, z, yaw);
  }

  /** The level floats in a void; falling off it is fatal, but gently so. */
  checkVoid() {
    if (this.pos.y < -60 && this.alive) {
      this.damage(1000, null, 'void');
    }
  }

  updateDamageIndicators(dt) {
    for (let i = this.damageDirs.length - 1; i >= 0; i--) {
      this.damageDirs[i].t -= dt * 0.9;
      if (this.damageDirs[i].t <= 0) this.damageDirs.splice(i, 1);
    }
  }

  serialize() {
    return {
      pos: this.pos.toArray(), yaw: this.yaw, pitch: this.pitch,
      health: this.health, armour: this.armour,
    };
  }
  deserialize(d) {
    if (!d) return;
    this.pos.fromArray(d.pos);
    this.yaw = d.yaw; this.pitch = d.pitch;
    this.health = d.health; this.armour = d.armour;
    this.alive = this.health > 0;
    this.vel.set(0, 0, 0);
  }
}

export { HULL, SPEED };
