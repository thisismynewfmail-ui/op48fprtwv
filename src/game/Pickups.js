/* HALCYON — Pickups and interactables
 *
 * Everything the player can walk into or press USE on: ammo, health,
 * weapons on plinths, chronal batteries, and the switches and terminals the
 * level's objectives hang off.
 */
import * as THREE from 'three';
import { M, T } from '../world/Materials.js';
import { lathe } from '../world/Arch.js';
import { audio } from '../core/Audio.js';
import { time, rand, clamp, lerp } from '../core/Time.js';

const _v = new THREE.Vector3();

export class Pickup {
  constructor(game, opt = {}) {
    this.game = game;
    this.kind = opt.kind || 'ammo';
    this.amount = opt.amount || 1;
    this.ammoType = opt.ammoType || 'quartz';
    this.weapon = opt.weapon || null;
    this.power = opt.power || null;
    this.pos = new THREE.Vector3().copy(opt.pos);
    this.radius = opt.radius || 1.15;
    this.taken = false;
    this.bob = rand(0, 7);
    this.respawn = opt.respawn || 0;
    this.respawnT = 0;
    this.label = opt.label || '';
    this.onTake = opt.onTake || null;
    this.requiresUse = !!opt.requiresUse;

    this.group = new THREE.Group();
    this.group.position.copy(this.pos);
    this.build();
    game.scene.add(this.group);

    this.halo = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshBasicMaterial({
      map: T.glow, color: this.haloColour(), transparent: true, opacity: 0.28,
      blending: THREE.AdditiveBlending, depthWrite: false }));
    this.group.add(this.halo);
  }

  haloColour() {
    switch (this.kind) {
      case 'health': return 0x6fe8a8;
      case 'chrono': return 0x8fd8ff;
      case 'weapon': return 0xffd28a;
      case 'power': return 0xd88fff;
      default: return 0xffc06a;
    }
  }

  build() {
    const k = this.kind;
    if (k === 'ammo') {
      // a small brass caddy of quartz slivers / static cells
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.24), M.brass);
      this.group.add(box);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.03, 0.26), M.goldDark);
      lid.position.y = 0.09;
      this.group.add(lid);
      const cellColour = this.ammoType === 'quartz' ? 0x9fd8ff : 0xffc46a;
      for (let i = 0; i < 4; i++) {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.16, 6),
          new THREE.MeshPhongMaterial({ color: cellColour, emissive: cellColour, emissiveIntensity: 0.4,
            specular: 0xffffff, shininess: 200 }));
        c.position.set(-0.11 + i * 0.073, 0.13, 0);
        this.group.add(c);
      }
      this.spin = 1.1;
    } else if (k === 'health') {
      // a phial of arrested time
      const phial = new THREE.Mesh(lathe([
        [0.0, 0], [0.09, 0.02], [0.11, 0.12], [0.10, 0.26],
        [0.05, 0.32], [0.045, 0.40], [0.06, 0.43], [0.0, 0.44],
      ], 16), new THREE.MeshPhongMaterial({
        color: 0x9fe8c0, emissive: 0x1a5a3a, specular: 0xffffff, shininess: 240,
        transparent: true, opacity: 0.82 }));
      this.group.add(phial);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.05, 10), M.gold);
      cap.position.y = 0.44;
      this.group.add(cap);
      this.spin = 1.4;
    } else if (k === 'chrono') {
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0),
        new THREE.MeshPhongMaterial({ color: 0x8fd8ff, emissive: 0x2a7098, specular: 0xffffff,
          shininess: 240, flatShading: true, transparent: true, opacity: 0.9 }));
      this.group.add(core);
      for (let i = 0; i < 2; i++) {
        const r = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.02, 5, 20), M.brass);
        r.rotation.set(i * 1.2, i * 0.7, 0);
        this.group.add(r);
      }
      this.spin = 2.0;
    } else if (k === 'weapon') {
      const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.9, 12), M.marbleCream);
      plinth.position.y = -0.65;
      plinth.castShadow = plinth.receiveShadow = true;
      this.group.add(plinth);
      this.game.addCollider('cyl', { x: this.pos.x, y: this.pos.y - 1.1, z: this.pos.z, r: 0.56, h: 0.9 });
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.4, 12, 1, true),
        new THREE.MeshBasicMaterial({ map: T.glow, color: 0xffd28a, transparent: true,
          opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.y = 0.9;
      this.group.add(beam);
      this.beam = beam;
      this.spin = 0.8;
    } else if (k === 'power') {
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1),
        new THREE.MeshPhongMaterial({ color: 0xd8a8ff, emissive: 0x5a2a80, specular: 0xffffff,
          shininess: 240, flatShading: true }));
      this.group.add(core);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.035, 6, 26), M.gold);
      ring.rotation.x = Math.PI / 2;
      this.group.add(ring);
      this.ring = ring;
      this.spin = 1.6;
    }
  }

  /** Attach an already-built model (a weapon prop, a key) to the pickup. */
  attach(obj, y = 0.2) {
    obj.position.y += y;
    this.group.add(obj);
    this.model = obj;
    return obj;
  }

  canTake() {
    const g = this.game;
    if (this.kind === 'health') return g.player.health < g.player.maxHealth;
    if (this.kind === 'ammo') {
      const cap = this.ammoType === 'quartz' ? 108 : 270;
      return g.weapons.ammo[this.ammoType] < cap;
    }
    if (this.kind === 'chrono') return g.chrono.energy < g.chrono.max - 1;
    return true;
  }

  take() {
    const g = this.game;
    if (this.taken || !this.canTake()) return false;
    switch (this.kind) {
      case 'ammo':
        g.weapons.giveAmmo(this.ammoType, this.amount);
        audio.sfx_pickup_ammo(0.9, 0, 0);
        g.hud?.pickup(`${this.ammoType === 'quartz' ? 'QUARTZ SLIVERS' : 'STATIC CELLS'} +${this.amount}`);
        break;
      case 'health':
        g.player.heal(this.amount);
        audio.sfx_health(0.9, 0, 0);
        g.hud?.pickup(`ARRESTED TIME +${this.amount}`);
        break;
      case 'chrono':
        g.chrono.refill(this.amount);
        g.player.giveArmour(this.amount * 0.5);
        audio.sfx_pickup(0.9, 0, 0);
        g.hud?.pickup(`CHRONAL CHARGE +${this.amount}`);
        break;
      case 'weapon':
        g.weapons.give(this.weapon, { ammo: this.amount });
        audio.sfx_pickup(1, 0, 0);
        g.hud?.pickup(`ACQUIRED: ${this.label || this.weapon.toUpperCase()}`);
        g.postfx?.kick(0.2, 6);
        break;
      case 'power':
        g.chrono.unlock(this.power);
        audio.sfx_pickup(1, 0, 0);
        g.postfx?.kick(0.35, 4);
        g.hud?.pickup(`CHRONOMETER: ${this.label || this.power.toUpperCase()} ONLINE`);
        break;
    }
    this.taken = true;
    this.respawnT = this.respawn;
    this.group.visible = false;
    g.fx.shockRing(this.pos, { colour: [0.7, 0.95, 1], size: 0.4, size1: 3, life: 0.5 });
    g.fx.chronoMotes(this.pos, { count: 10 });
    this.onTake?.(this);
    return true;
  }

  update(dt, player) {
    if (this.taken) {
      if (this.respawn > 0) {
        this.respawnT -= dt;
        if (this.respawnT <= 0) { this.taken = false; this.group.visible = true; }
      }
      return;
    }
    this.bob += dt;
    const y = this.pos.y + Math.sin(this.bob * 1.6) * 0.10;
    this.group.position.y = y;
    this.group.rotation.y += dt * (this.spin || 1);
    if (this.ring) this.ring.rotation.z += dt * 1.4;
    if (this.beam) this.beam.material.opacity = 0.12 + Math.sin(this.bob * 3) * 0.05;
    this.halo.quaternion.copy(this.game.camera.quaternion);
    this.halo.material.opacity = 0.22 + Math.sin(this.bob * 2.4) * 0.08;

    _v.copy(player.pos); _v.y += 0.9;
    if (_v.distanceTo(this.group.position) < this.radius) {
      if (this.requiresUse) this.game.setUsePrompt(this.label || 'PICK UP', this);
      else this.take();
    }
  }

  destroy() {
    this.game.scene.remove(this.group);
  }
}

/* ======================================================= INTERACTABLE */

/** A thing you press USE on: terminals, levers, the clock's winding key. */
export class Interactable {
  constructor(game, opt = {}) {
    this.game = game;
    this.pos = new THREE.Vector3().copy(opt.pos);
    this.radius = opt.radius || 2.6;
    this.label = opt.label || 'USE';
    this.onUse = opt.onUse || null;
    this.enabled = opt.enabled !== false;
    this.once = opt.once !== false;
    this.used = false;
    this.lookAt = opt.lookAt !== false;
  }

  update(dt, player) {
    if (!this.enabled || (this.once && this.used)) return;
    _v.copy(player.pos); _v.y += 1.2;
    const d = _v.distanceTo(this.pos);
    if (d > this.radius) return;
    if (this.lookAt) {
      // require the player to actually be facing it
      const to = _v.copy(this.pos).sub(player.eyePosition).normalize();
      if (to.dot(player.forward) < 0.55) return;
    }
    this.game.setUsePrompt(this.label, this);
  }

  trigger() {
    if (!this.enabled || (this.once && this.used)) return;
    this.used = true;
    this.onUse?.(this);
  }
}

/* ====================================================== ENERGY DOOR */

/**
 * The barriers that gate each objective. They are not doors so much as
 * held moments — a plane of stopped time you cannot walk through.
 */
export class ChronoBarrier {
  constructor(game, opt = {}) {
    this.game = game;
    const { x, y, z, w = 8, h = 6, ry = 0, colour = 0x8fd8ff } = opt;
    this.open = false;
    this.group = new THREE.Group();
    this.group.position.set(x, y, z);
    this.group.rotation.y = ry;

    const geo = new THREE.PlaneGeometry(w, h, 8, 8);
    this.mat = new THREE.MeshBasicMaterial({
      color: colour, transparent: true, opacity: 0.30, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false, map: T.noise,
    });
    this.plane = new THREE.Mesh(geo, this.mat);
    this.plane.position.y = h / 2;
    this.group.add(this.plane);

    // a frame of brass hour-marks so it reads as built, not as a force field
    const frameMat = M.brass;
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, h, 0.22), frameMat);
      post.position.set(s * w / 2, h / 2, 0);
      this.group.add(post);
      for (let i = 1; i < 6; i++) {
        const t = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.10), frameMat);
        t.position.set(s * w / 2, (i / 6) * h, 0.14);
        this.group.add(t);
      }
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.3, 0.3), frameMat);
    lintel.position.y = h;
    this.group.add(lintel);

    game.scene.add(this.group);
    this.collider = game.addCollider('box', {
      x, y: y + h / 2, z, hw: (Math.abs(Math.cos(ry)) * w + Math.abs(Math.sin(ry)) * 0.3) / 2,
      hh: h / 2, hd: (Math.abs(Math.sin(ry)) * w + Math.abs(Math.cos(ry)) * 0.3) / 2,
      surface: 'energy',
    });
    this.t = rand(0, 10);
  }

  setOpen(v) {
    if (this.open === v) return;
    this.open = v;
    this.collider.enabled = !v;
    if (v) {
      audio.play('door', this.group.position, { vol: 1, ref: 14 });
      this.game.fx.shockRing(this.group.position, { colour: [0.6, 0.9, 1], size: 1, size1: 10, life: 0.8 });
    }
  }

  update(dt) {
    this.t += dt;
    if (this.open) {
      this.mat.opacity = Math.max(0, this.mat.opacity - dt * 0.9);
      if (this.mat.opacity <= 0.001) this.plane.visible = false;
      return;
    }
    this.plane.visible = true;
    this.mat.opacity = 0.22 + Math.sin(this.t * 1.6) * 0.07;
    this.mat.map.offset.y = (this.t * 0.12) % 1;
    this.mat.map.offset.x = Math.sin(this.t * 0.3) * 0.1;
  }
}
