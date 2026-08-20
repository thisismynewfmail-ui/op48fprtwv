/* HALCYON — Particles, decals and debris
 *
 * Pooled everything. Sparks, smoke, glass, sand, chrono motes and bullet
 * decals all come out of fixed-size pools allocated once at load, because a
 * garbage collection pause in the middle of a firefight is a bug.
 */
import * as THREE from 'three';
import { T } from '../world/Materials.js';
import { rand, clamp } from '../core/Time.js';

const _v = new THREE.Vector3();

/* ------------------------------------------------------ SPRITE POOL */

/**
 * One draw call for every soft particle in the game. Positions, sizes,
 * colours and alphas live in buffer attributes updated on the CPU.
 */
export class SpritePool {
  constructor(scene, opt = {}) {
    const { max = 900, map = T.glow, blending = THREE.AdditiveBlending, depthWrite = false } = opt;
    this.max = max;
    this.count = 0;
    this.free = [];
    this.parts = new Array(max);

    const pos = new Float32Array(max * 3);
    const col = new Float32Array(max * 3);
    const siz = new Float32Array(max);
    const alp = new Float32Array(max);
    const rot = new Float32Array(max);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(siz, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alp, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aRot', new THREE.BufferAttribute(rot, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: map }, uScale: { value: 1 } },
      vertexShader: /* glsl */`
        attribute vec3 aColor; attribute float aSize; attribute float aAlpha; attribute float aRot;
        varying vec3 vColor; varying float vAlpha; varying float vRot;
        uniform float uScale;
        void main(){
          vColor = aColor; vAlpha = aAlpha; vRot = aRot;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale * (420.0 / max(0.001, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uMap;
        varying vec3 vColor; varying float vAlpha; varying float vRot;
        void main(){
          vec2 uv = gl_PointCoord - 0.5;
          float c = cos(vRot), s = sin(vRot);
          uv = vec2(uv.x*c - uv.y*s, uv.x*s + uv.y*c) + 0.5;
          vec4 t = texture2D(uMap, uv);
          if (t.a * vAlpha < 0.004) discard;
          gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
        }`,
      transparent: true,
      depthWrite,
      depthTest: true,
      blending,
    });

    this.mesh = new THREE.Points(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
    scene.add(this.mesh);
    this.geo = geo; this.mat = mat;

    for (let i = 0; i < max; i++) {
      this.parts[i] = {
        alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
        life: 0, maxLife: 1, size: 1, size1: 1, r: 1, g: 1, b: 1,
        a0: 1, a1: 0, drag: 0.98, grav: 0, rot: 0, spin: 0, worldTime: true,
      };
      this.free.push(i);
    }
  }

  spawn(o) {
    if (!this.free.length) return null;
    const i = this.free.pop();
    const p = this.parts[i];
    p.alive = true;
    p.x = o.x; p.y = o.y; p.z = o.z;
    p.vx = o.vx || 0; p.vy = o.vy || 0; p.vz = o.vz || 0;
    p.life = 0; p.maxLife = o.life || 0.6;
    p.size = o.size ?? 0.4; p.size1 = o.size1 ?? p.size;
    p.r = o.r ?? 1; p.g = o.g ?? 1; p.b = o.b ?? 1;
    p.a0 = o.a0 ?? 1; p.a1 = o.a1 ?? 0;
    p.drag = o.drag ?? 0.94; p.grav = o.grav ?? 0;
    p.rot = o.rot ?? rand(0, Math.PI * 2); p.spin = o.spin ?? 0;
    p.worldTime = o.worldTime !== false;
    p.index = i;
    return p;
  }

  update(dtWorld, dtReal) {
    const pos = this.geo.attributes.position.array;
    const col = this.geo.attributes.aColor.array;
    const siz = this.geo.attributes.aSize.array;
    const alp = this.geo.attributes.aAlpha.array;
    const rot = this.geo.attributes.aRot.array;
    let n = 0;
    for (let i = 0; i < this.max; i++) {
      const p = this.parts[i];
      if (!p.alive) continue;
      const dt = p.worldTime ? dtWorld : dtReal;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.alive = false;
        this.free.push(i);
        continue;
      }
      p.vy += p.grav * dt;
      const d = Math.pow(p.drag, dt * 60);
      p.vx *= d; p.vy *= d; p.vz *= d;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.rot += p.spin * dt;

      const t = p.life / p.maxLife;
      pos[n * 3] = p.x; pos[n * 3 + 1] = p.y; pos[n * 3 + 2] = p.z;
      col[n * 3] = p.r; col[n * 3 + 1] = p.g; col[n * 3 + 2] = p.b;
      siz[n] = p.size + (p.size1 - p.size) * t;
      alp[n] = p.a0 + (p.a1 - p.a0) * t;
      rot[n] = p.rot;
      n++;
    }
    this.count = n;
    this.geo.setDrawRange(0, n);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.geo.attributes.aRot.needsUpdate = true;
  }

  clear() {
    for (let i = 0; i < this.max; i++) {
      if (this.parts[i].alive) { this.parts[i].alive = false; this.free.push(i); }
    }
    this.geo.setDrawRange(0, 0);
  }
}

/* --------------------------------------------------------- DEBRIS */

/**
 * Solid chunks: shattered mask shards, marble fragments, ejected casings.
 * An InstancedMesh with a small CPU-side rigid step (no collision beyond a
 * ground plane test — they are on screen for two seconds).
 */
export class DebrisPool {
  constructor(scene, opt = {}) {
    const { max = 260, geometry = null, material = null } = opt;
    this.max = max;
    this.geo = geometry || new THREE.TetrahedronGeometry(0.1, 0);
    this.mat = material || new THREE.MeshPhongMaterial({ color: 0x8fd8be, specular: 0xffffff, shininess: 90, flatShading: true });
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    if (this.mesh.instanceColor === null) {
      this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3).fill(1), 3);
      this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }

    this.items = [];
    for (let i = 0; i < max; i++) {
      this.items.push({
        alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(),
        quat: new THREE.Quaternion(), spin: new THREE.Vector3(),
        life: 0, maxLife: 3, scale: 1, floorY: -1e9, r: 1, g: 1, b: 1,
      });
    }
    this._m = new THREE.Matrix4();
    this._s = new THREE.Vector3();
  }

  spawn(o) {
    let it = null;
    for (const c of this.items) if (!c.alive) { it = c; break; }
    if (!it) return null;
    it.alive = true;
    it.pos.set(o.x, o.y, o.z);
    it.vel.set(o.vx || 0, o.vy || 0, o.vz || 0);
    it.spin.set(rand(-14, 14), rand(-14, 14), rand(-14, 14));
    it.quat.setFromEuler(new THREE.Euler(rand(0, 6.28), rand(0, 6.28), rand(0, 6.28)));
    it.life = 0;
    it.maxLife = o.life ?? rand(1.8, 3.4);
    it.scale = o.scale ?? rand(0.6, 1.5);
    it.floorY = o.floorY ?? -1e9;
    it.r = o.r ?? 1; it.g = o.g ?? 1; it.b = o.b ?? 1;
    return it;
  }

  update(dt, gravity = -20) {
    let n = 0;
    for (const it of this.items) {
      if (!it.alive) continue;
      it.life += dt;
      if (it.life >= it.maxLife) { it.alive = false; continue; }
      it.vel.y += gravity * dt;
      it.pos.addScaledVector(it.vel, dt);
      if (it.pos.y < it.floorY) {
        it.pos.y = it.floorY;
        it.vel.y *= -0.32;
        it.vel.x *= 0.68; it.vel.z *= 0.68;
        it.spin.multiplyScalar(0.6);
        if (Math.abs(it.vel.y) < 0.4) it.vel.y = 0;
      }
      const q = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(it.spin.x * dt, it.spin.y * dt, it.spin.z * dt));
      it.quat.premultiply(q);
      const fade = clamp(1 - (it.life / it.maxLife - 0.7) / 0.3, 0, 1);
      const s = it.scale * fade;
      this._m.compose(it.pos, it.quat, this._s.set(s, s, s));
      this.mesh.setMatrixAt(n, this._m);
      this.mesh.instanceColor.array[n * 3] = it.r;
      this.mesh.instanceColor.array[n * 3 + 1] = it.g;
      this.mesh.instanceColor.array[n * 3 + 2] = it.b;
      n++;
    }
    this.mesh.count = n;
    if (n) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor.needsUpdate = true;
    }
  }

  clear() { for (const it of this.items) it.alive = false; this.mesh.count = 0; }
}

/* ---------------------------------------------------------- DECALS */

/** Bullet holes and scorches, oldest recycled once the budget is spent. */
export class DecalPool {
  constructor(scene, opt = {}) {
    const { max = 120, map = T.decal } = opt;
    this.max = max;
    this.index = 0;
    this.items = [];
    const geo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < max; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map, transparent: true, opacity: 0, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
        color: 0x111014,
      });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      m.renderOrder = 5;
      scene.add(m);
      this.items.push({ mesh: m, life: 0, maxLife: 26, alive: false });
    }
  }

  place(point, normal, opt = {}) {
    const it = this.items[this.index];
    this.index = (this.index + 1) % this.max;
    const m = it.mesh;
    m.visible = true;
    m.position.copy(point).addScaledVector(normal, 0.012);
    // face the quad along the surface normal, then spin it randomly so
    // repeated hits on one wall don't stamp an obvious grid
    m.lookAt(_v.copy(point).add(normal));
    m.rotateZ(rand(0, Math.PI * 2));
    const s = opt.size ?? rand(0.16, 0.3);
    m.scale.set(s, s, 1);
    m.material.opacity = opt.opacity ?? 0.85;
    m.material.color.setHex(opt.colour ?? 0x111014);
    it.alive = true;
    it.life = 0;
    it.maxLife = opt.life ?? 26;
    it.baseOpacity = m.material.opacity;
    return it;
  }

  update(dt) {
    for (const it of this.items) {
      if (!it.alive) continue;
      it.life += dt;
      const t = it.life / it.maxLife;
      if (t >= 1) { it.alive = false; it.mesh.visible = false; continue; }
      if (t > 0.75) it.mesh.material.opacity = it.baseOpacity * (1 - (t - 0.75) / 0.25);
    }
  }
  clear() { for (const it of this.items) { it.alive = false; it.mesh.visible = false; } }
}

/* ------------------------------------------------------ FX FACTORY */

/** High-level effect recipes. Everything the game fires goes through here. */
export class FX {
  constructor(scene) {
    this.scene = scene;
    this.add = new SpritePool(scene, { max: 1100, map: T.glow, blending: THREE.AdditiveBlending });
    this.smoke = new SpritePool(scene, { max: 320, map: T.cloud, blending: THREE.NormalBlending });
    this.debris = new DebrisPool(scene, { max: 300 });
    this.decals = new DecalPool(scene, { max: 120 });
    this.shards = new DebrisPool(scene, {
      max: 200,
      geometry: new THREE.TetrahedronGeometry(0.14, 0),
      material: new THREE.MeshPhongMaterial({
        color: 0xffffff, specular: 0xd8fff0, shininess: 120, flatShading: true, vertexColors: false }),
    });
  }

  update(dtWorld, dtReal) {
    this.add.update(dtWorld, dtReal);
    this.smoke.update(dtWorld, dtReal);
    this.debris.update(dtWorld);
    this.shards.update(dtWorld);
    this.decals.update(dtReal);
  }

  clear() {
    this.add.clear(); this.smoke.clear();
    this.debris.clear(); this.shards.clear(); this.decals.clear();
  }

  /* ---- recipes ---- */

  muzzleFlash(pos, dir, opt = {}) {
    const { scale = 1, colour = [1, 0.86, 0.55] } = opt;
    this.add.spawn({
      x: pos.x, y: pos.y, z: pos.z, life: 0.055, size: 0.85 * scale, size1: 0.3 * scale,
      r: colour[0], g: colour[1], b: colour[2], a0: 1, a1: 0, worldTime: false,
    });
    for (let i = 0; i < 5; i++) {
      this.add.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: dir.x * rand(4, 11) + rand(-2.2, 2.2),
        vy: dir.y * rand(4, 11) + rand(-2.2, 2.2),
        vz: dir.z * rand(4, 11) + rand(-2.2, 2.2),
        life: rand(0.08, 0.2), size: 0.10 * scale, size1: 0.02,
        r: 1, g: 0.82, b: 0.45, a0: 1, a1: 0, drag: 0.82,
      });
    }
  }

  impact(point, normal, opt = {}) {
    const { surface = 'marble', colour = null, sparks = 8, size = 1 } = opt;
    const pal = surface === 'metal' ? [1, 0.9, 0.6]
      : surface === 'pcb' ? [0.5, 1, 0.82]
      : surface === 'wood' ? [0.85, 0.6, 0.3]
      : [0.9, 0.88, 0.84];
    const c = colour || pal;
    for (let i = 0; i < sparks; i++) {
      const sx = normal.x + rand(-0.8, 0.8), sy = normal.y + rand(-0.5, 1.1), sz = normal.z + rand(-0.8, 0.8);
      this.add.spawn({
        x: point.x, y: point.y, z: point.z,
        vx: sx * rand(1.5, 6), vy: sy * rand(1.5, 6), vz: sz * rand(1.5, 6),
        life: rand(0.18, 0.5), size: rand(0.04, 0.10) * size, size1: 0.005,
        r: c[0], g: c[1], b: c[2], a0: 1, a1: 0, drag: 0.9, grav: -9,
      });
    }
    // dust puff
    for (let i = 0; i < 3; i++) {
      this.smoke.spawn({
        x: point.x + rand(-0.06, 0.06), y: point.y + rand(-0.06, 0.06), z: point.z + rand(-0.06, 0.06),
        vx: normal.x * rand(0.3, 1.1), vy: normal.y * rand(0.3, 1.1) + 0.3, vz: normal.z * rand(0.3, 1.1),
        life: rand(0.4, 0.9), size: rand(0.12, 0.24) * size, size1: rand(0.5, 0.9) * size,
        r: 0.72, g: 0.70, b: 0.70, a0: 0.42, a1: 0, drag: 0.9,
      });
    }
    if (surface !== 'pcb') {
      this.decals.place(point, normal, { size: rand(0.14, 0.26) * size, opacity: 0.75 });
    }
    for (let i = 0; i < 3; i++) {
      this.debris.spawn({
        x: point.x, y: point.y, z: point.z,
        vx: normal.x * rand(1, 4) + rand(-2, 2),
        vy: normal.y * rand(1, 4) + rand(0, 3),
        vz: normal.z * rand(1, 4) + rand(-2, 2),
        scale: rand(0.25, 0.6), life: rand(1.2, 2.4),
        r: c[0] * 0.7, g: c[1] * 0.7, b: c[2] * 0.7,
        floorY: point.y - 4,
      });
    }
  }

  /** A mask dying: shatters into PCB shards with a burst of green data. */
  shatterMask(pos, opt = {}) {
    const { colour = [0.42, 0.95, 0.76], count = 16, size = 1 } = opt;
    for (let i = 0; i < count; i++) {
      this.shards.spawn({
        x: pos.x + rand(-0.3, 0.3), y: pos.y + rand(-0.5, 0.5), z: pos.z + rand(-0.3, 0.3),
        vx: rand(-6, 6), vy: rand(1, 8), vz: rand(-6, 6),
        scale: rand(0.5, 1.5) * size, life: rand(2.0, 3.6),
        r: colour[0] * rand(0.7, 1.2), g: colour[1] * rand(0.7, 1.1), b: colour[2] * rand(0.7, 1.2),
        floorY: pos.y - 20,
      });
    }
    for (let i = 0; i < 26; i++) {
      this.add.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: rand(-7, 7), vy: rand(-4, 8), vz: rand(-7, 7),
        life: rand(0.3, 0.9), size: rand(0.06, 0.2) * size, size1: 0.01,
        r: colour[0], g: colour[1], b: colour[2], a0: 1, a1: 0, drag: 0.88, grav: -3,
      });
    }
    this.add.spawn({
      x: pos.x, y: pos.y, z: pos.z, life: 0.28,
      size: 1.4 * size, size1: 3.4 * size,
      r: colour[0], g: colour[1], b: colour[2], a0: 0.85, a1: 0,
    });
  }

  /** Chrono energy: slow, weightless motes that drift upward. */
  chronoMotes(pos, opt = {}) {
    const { count = 10, spread = 0.8, colour = [0.55, 0.86, 1.0], rise = 0.7 } = opt;
    for (let i = 0; i < count; i++) {
      this.add.spawn({
        x: pos.x + rand(-spread, spread), y: pos.y + rand(-spread, spread), z: pos.z + rand(-spread, spread),
        vx: rand(-0.3, 0.3), vy: rand(0.1, rise), vz: rand(-0.3, 0.3),
        life: rand(0.9, 2.2), size: rand(0.08, 0.2), size1: 0.01,
        r: colour[0], g: colour[1], b: colour[2], a0: 0.9, a1: 0, drag: 0.99,
        spin: rand(-2, 2),
      });
    }
  }

  /** A ring of light expanding on a plane — stasis, rewind, pickups. */
  shockRing(pos, opt = {}) {
    const { colour = [0.6, 0.85, 1], size = 0.5, size1 = 4, life = 0.5 } = opt;
    this.add.spawn({
      x: pos.x, y: pos.y, z: pos.z, life,
      size, size1, r: colour[0], g: colour[1], b: colour[2], a0: 0.9, a1: 0,
    });
  }

  bloodless(pos, dir, colour) {
    // "hit confirmed" spray — these things bleed light, not fluid
    for (let i = 0; i < 12; i++) {
      this.add.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: dir.x * rand(1, 4) + rand(-2.5, 2.5),
        vy: dir.y * rand(1, 4) + rand(-1, 3),
        vz: dir.z * rand(1, 4) + rand(-2.5, 2.5),
        life: rand(0.2, 0.5), size: rand(0.05, 0.14), size1: 0.01,
        r: colour[0], g: colour[1], b: colour[2], a0: 1, a1: 0, drag: 0.86, grav: -4,
      });
    }
  }

  explosion(pos, opt = {}) {
    const { colour = [1, 0.7, 0.35], scale = 1 } = opt;
    this.add.spawn({
      x: pos.x, y: pos.y, z: pos.z, life: 0.4,
      size: 1.2 * scale, size1: 5 * scale,
      r: colour[0], g: colour[1], b: colour[2], a0: 1, a1: 0,
    });
    for (let i = 0; i < 30; i++) {
      const a = rand(0, Math.PI * 2), e = rand(-0.6, 1.2);
      const sp = rand(3, 14) * scale;
      this.add.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: Math.cos(a) * sp, vy: e * sp * 0.6, vz: Math.sin(a) * sp,
        life: rand(0.3, 0.9), size: rand(0.1, 0.3) * scale, size1: 0.02,
        r: colour[0], g: colour[1] * rand(0.7, 1), b: colour[2] * rand(0.5, 1),
        a0: 1, a1: 0, drag: 0.86, grav: -5,
      });
    }
    for (let i = 0; i < 10; i++) {
      this.smoke.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: rand(-3, 3), vy: rand(0.5, 3), vz: rand(-3, 3),
        life: rand(0.8, 1.8), size: rand(0.4, 0.9) * scale, size1: rand(1.6, 3) * scale,
        r: 0.28, g: 0.26, b: 0.3, a0: 0.55, a1: 0, drag: 0.9,
      });
    }
  }
}
