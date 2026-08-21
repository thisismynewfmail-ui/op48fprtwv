/* SILICONE DREAMS — Physics
 *
 * A small, deterministic collision world. No third-party solver: the level is
 * made of boxes, cylinders and spheres, the player is a capsule, and props are
 * rigid bodies with a single contact resolution pass. That is all Half-Life 2
 * needed in 2003 for everything except the barrels.
 */
import * as THREE from 'three';
import { clamp } from '../core/Time.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export const LAYER = {
  WORLD: 1,      // static geometry
  PROP: 2,       // pushable / grabbable
  TRIGGER: 4,    // no collision, fires callbacks
  CLIP: 8,       // invisible player clip
};

/* ------------------------------------------------------------ SHAPES */

export class Collider {
  constructor(type, data) {
    this.type = type;               // 'box' | 'cyl' | 'sphere'
    Object.assign(this, data);
    this.layer = data.layer ?? LAYER.WORLD;
    this.surface = data.surface || 'marble';
    this.enabled = data.enabled !== false;
    this.id = Collider._id++;
    this.computeAABB();
  }
  computeAABB() {
    if (this.type === 'box') {
      // rotation is around Y only — enough for everything in this level
      const c = Math.abs(Math.cos(this.ry || 0)), s = Math.abs(Math.sin(this.ry || 0));
      const ex = this.hw * c + this.hd * s;
      const ez = this.hw * s + this.hd * c;
      this.min = [this.x - ex, this.y - this.hh, this.z - ez];
      this.max = [this.x + ex, this.y + this.hh, this.z + ez];
    } else if (this.type === 'cyl') {
      this.min = [this.x - this.r, this.y, this.z - this.r];
      this.max = [this.x + this.r, this.y + this.h, this.z + this.r];
    } else {
      this.min = [this.x - this.r, this.y - this.r, this.z - this.r];
      this.max = [this.x + this.r, this.y + this.r, this.z + this.r];
    }
  }
}
Collider._id = 1;

export const box = (x, y, z, hw, hh, hd, o = {}) => new Collider('box', Object.assign({ x, y, z, hw, hh, hd }, o));
/** axis-aligned box from world-space min/max */
export const boxMinMax = (minx, miny, minz, maxx, maxy, maxz, o = {}) =>
  box((minx + maxx) / 2, (miny + maxy) / 2, (minz + maxz) / 2,
      (maxx - minx) / 2, (maxy - miny) / 2, (maxz - minz) / 2, o);
/** upright cylinder; y is the BASE, h the height */
export const cyl = (x, y, z, r, h, o = {}) => new Collider('cyl', Object.assign({ x, y, z, r, h }, o));
export const sphere = (x, y, z, r, o = {}) => new Collider('sphere', Object.assign({ x, y, z, r }, o));

/* ------------------------------------------------------- BROADPHASE */

/** Uniform spatial hash over the XZ plane. The level is wide and thin. */
export class World {
  constructor(cell = 6) {
    this.cell = cell;
    this.grid = new Map();
    this.all = [];
    this.triggers = [];
    this.props = [];
    this.gravity = -22.5;
  }
  _key(cx, cz) { return cx * 73856093 ^ cz * 19349663; }
  _cells(c, fn) {
    const s = this.cell;
    const x0 = Math.floor(c.min[0] / s), x1 = Math.floor(c.max[0] / s);
    const z0 = Math.floor(c.min[2] / s), z1 = Math.floor(c.max[2] / s);
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) fn(this._key(cx, cz));
  }
  add(c) {
    this.all.push(c);
    if (c.layer & LAYER.TRIGGER) { this.triggers.push(c); return c; }
    this._cells(c, (k) => {
      let a = this.grid.get(k);
      if (!a) this.grid.set(k, a = []);
      a.push(c);
    });
    return c;
  }
  addMany(list) { for (const c of list) this.add(c); return list; }
  remove(c) {
    const i = this.all.indexOf(c); if (i >= 0) this.all.splice(i, 1);
    const j = this.triggers.indexOf(c); if (j >= 0) this.triggers.splice(j, 1);
    this._cells(c, (k) => {
      const a = this.grid.get(k); if (!a) return;
      const n = a.indexOf(c); if (n >= 0) a.splice(n, 1);
    });
  }
  clear() { this.grid.clear(); this.all.length = 0; this.triggers.length = 0; this.props.length = 0; }

  /** collect colliders whose AABB overlaps the query box */
  query(minx, miny, minz, maxx, maxy, maxz, out = []) {
    out.length = 0;
    const s = this.cell;
    const x0 = Math.floor(minx / s), x1 = Math.floor(maxx / s);
    const z0 = Math.floor(minz / s), z1 = Math.floor(maxz / s);
    const seen = World._seen;
    seen.clear();
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      const a = this.grid.get(this._key(cx, cz));
      if (!a) continue;
      for (const c of a) {
        if (!c.enabled || seen.has(c.id)) continue;
        seen.add(c.id);
        if (c.max[0] < minx || c.min[0] > maxx) continue;
        if (c.max[1] < miny || c.min[1] > maxy) continue;
        if (c.max[2] < minz || c.min[2] > maxz) continue;
        out.push(c);
      }
    }
    return out;
  }
}
World._seen = new Set();

/* --------------------------------------------------- CLOSEST POINT */

/** Closest point on a collider to p, written into out. */
export function closestPoint(c, px, py, pz, out) {
  if (c.type === 'box') {
    const ry = c.ry || 0;
    let dx = px - c.x, dz = pz - c.z;
    if (ry) {
      const ca = Math.cos(-ry), sa = Math.sin(-ry);
      const nx = dx * ca - dz * sa, nz = dx * sa + dz * ca;
      dx = nx; dz = nz;
    }
    const lx = clamp(dx, -c.hw, c.hw);
    const ly = clamp(py - c.y, -c.hh, c.hh);
    const lz = clamp(dz, -c.hd, c.hd);
    let wx = lx, wz = lz;
    if (ry) {
      const ca = Math.cos(ry), sa = Math.sin(ry);
      wx = lx * ca - lz * sa; wz = lx * sa + lz * ca;
    }
    out.set(c.x + wx, c.y + ly, c.z + wz);
    return out;
  }
  if (c.type === 'cyl') {
    const dx = px - c.x, dz = pz - c.z;
    const d = Math.hypot(dx, dz);
    const k = d > c.r ? c.r / (d || 1) : 1;
    out.set(c.x + dx * k, clamp(py, c.y, c.y + c.h), c.z + dz * k);
    return out;
  }
  // sphere
  const dx = px - c.x, dy = py - c.y, dz = pz - c.z;
  const d = Math.hypot(dx, dy, dz) || 1;
  const k = Math.min(1, c.r / d);
  out.set(c.x + dx * k, c.y + dy * k, c.z + dz * k);
  return out;
}

/** Signed penetration of a sphere (px,py,pz,r) into c. >0 means overlapping. */
export function spherePenetration(c, px, py, pz, r, normalOut) {
  const cp = _v;
  closestPoint(c, px, py, pz, cp);
  let nx = px - cp.x, ny = py - cp.y, nz = pz - cp.z;
  let d = Math.hypot(nx, ny, nz);
  if (d < 1e-6) {
    // centre is inside: push out along the shallowest box axis
    if (c.type === 'box') {
      const dxp = c.hw - Math.abs(px - c.x), dyp = c.hh - Math.abs(py - c.y), dzp = c.hd - Math.abs(pz - c.z);
      if (dyp <= dxp && dyp <= dzp) { nx = 0; ny = Math.sign(py - c.y) || 1; nz = 0; d = 1; return { depth: dyp + r, nx, ny, nz }; }
      if (dxp <= dzp) { nx = Math.sign(px - c.x) || 1; ny = 0; nz = 0; return { depth: dxp + r, nx, ny, nz }; }
      nx = 0; ny = 0; nz = Math.sign(pz - c.z) || 1; return { depth: dzp + r, nx, ny, nz };
    }
    return { depth: r, nx: 0, ny: 1, nz: 0 };
  }
  const inv = 1 / d;
  nx *= inv; ny *= inv; nz *= inv;
  return { depth: r - d, nx, ny, nz };
}

/* ----------------------------------------------------- CAPSULE MOVE */

const _hits = [];

/**
 * Move a vertical capsule through the world and resolve contacts.
 *
 * The capsule is defined by its foot position, radius and height. Motion is
 * split into substeps no longer than r/2 so nothing tunnels, then each
 * substep is resolved by projecting out of every overlapping collider,
 * cheapest-first. Returns the contact summary the player controller needs.
 */
export function moveCapsule(world, pos, vel, r, height, dt, opt = {}) {
  const { stepHeight = 0.55, maxSlope = 0.72, pushProps = true, mass = 80 } = opt;
  const res = { grounded: false, groundNormal: new THREE.Vector3(0, 1, 0), hitWall: false,
                ceiling: false, groundSurface: 'marble', groundCollider: null, stepped: 0 };

  const speed = vel.length();
  const steps = Math.max(1, Math.ceil((speed * dt) / (r * 0.5)));
  const sdt = dt / steps;

  // the capsule's two sphere centres, relative to the foot
  const loY = r, hiY = height - r;

  for (let s = 0; s < steps; s++) {
    pos.x += vel.x * sdt; pos.y += vel.y * sdt; pos.z += vel.z * sdt;

    for (let iter = 0; iter < 4; iter++) {
      const pad = r + 0.05;
      world.query(pos.x - pad, pos.y - 0.1, pos.z - pad,
                  pos.x + pad, pos.y + height + 0.1, pos.z + pad, _hits);
      if (!_hits.length) break;
      let moved = false;

      for (const c of _hits) {
        if (c.layer & LAYER.TRIGGER) continue;
        // test both spheres, take the deeper contact
        let best = null;
        for (const oy of [loY, hiY]) {
          const p = spherePenetration(c, pos.x, pos.y + oy, pos.z, r);
          if (p.depth > 0.0001 && (!best || p.depth > best.depth)) { best = p; best.oy = oy; }
        }
        if (!best) continue;

        // --- step-up: a low obstacle in front should be climbed, not blocked
        if (best.ny < 0.5 && best.oy === loY) {
          const topY = c.type === 'box' ? c.y + c.hh : c.type === 'cyl' ? c.y + c.h : c.y + c.r;
          const rise = topY - pos.y;
          if (rise > 0.02 && rise <= stepHeight) {
            // is there headroom above the step?
            const probe = spherePenetration(c, pos.x, topY + r + 0.02, pos.z, r);
            if (probe.depth <= 0.001) {
              pos.y = topY + 0.005;
              res.stepped = Math.max(res.stepped, rise);
              if (vel.y < 0) vel.y = 0;
              moved = true;
              continue;
            }
          }
        }

        pos.x += best.nx * best.depth;
        pos.y += best.ny * best.depth;
        pos.z += best.nz * best.depth;
        moved = true;

        // kill the velocity component going into the surface
        const vn = vel.x * best.nx + vel.y * best.ny + vel.z * best.nz;
        if (vn < 0) {
          vel.x -= best.nx * vn; vel.y -= best.ny * vn; vel.z -= best.nz * vn;
        }

        if (best.ny > maxSlope) {
          res.grounded = true;
          res.groundNormal.set(best.nx, best.ny, best.nz);
          res.groundSurface = c.surface;
          res.groundCollider = c;
        } else if (best.ny < -0.5) {
          res.ceiling = true;
        } else {
          res.hitWall = true;
        }

        if (pushProps && c.body && !c.body.frozen && !c.body.held) {
          c.body.applyImpulse(-best.nx * mass * 0.12, 0, -best.nz * mass * 0.12);
        }
      }
      if (!moved) break;
    }
  }

  // a short downward probe keeps `grounded` stable when walking off a lip
  if (!res.grounded && vel.y <= 0.05) {
    const probe = 0.16;
    const pad = r + 0.05;
    world.query(pos.x - pad, pos.y - probe - 0.1, pos.z - pad, pos.x + pad, pos.y + r, pos.z + pad, _hits);
    for (const c of _hits) {
      if (c.layer & LAYER.TRIGGER) continue;
      const p = spherePenetration(c, pos.x, pos.y + r - probe, pos.z, r);
      // report only — the probe must not teleport the capsule downward
      if (p.depth > 0 && p.ny > maxSlope) {
        res.grounded = true;
        res.groundNormal.set(p.nx, p.ny, p.nz);
        res.groundSurface = c.surface;
        res.groundCollider = c;
        break;
      }
    }
  }
  return res;
}

/* ------------------------------------------------------------- RAYS */

const _rayHits = [];

/** Ray vs collider. Returns t along the ray, or -1. */
export function rayCollider(c, ox, oy, oz, dx, dy, dz, maxT) {
  if (c.type === 'box') {
    let px = ox - c.x, py = oy - c.y, pz = oz - c.z;
    let vx = dx, vy = dy, vz = dz;
    const ry = c.ry || 0;
    if (ry) {
      const ca = Math.cos(-ry), sa = Math.sin(-ry);
      let t = px * ca - pz * sa; pz = px * sa + pz * ca; px = t;
      t = vx * ca - vz * sa; vz = vx * sa + vz * ca; vx = t;
    }
    let tmin = 0, tmax = maxT;
    const slab = (p, v, h) => {
      if (Math.abs(v) < 1e-8) return p >= -h && p <= h;
      const t1 = (-h - p) / v, t2 = (h - p) / v;
      const lo = Math.min(t1, t2), hi = Math.max(t1, t2);
      if (lo > tmin) tmin = lo;
      if (hi < tmax) tmax = hi;
      return tmin <= tmax;
    };
    if (!slab(px, vx, c.hw)) return -1;
    if (!slab(py, vy, c.hh)) return -1;
    if (!slab(pz, vz, c.hd)) return -1;
    return tmin >= 0 ? tmin : (tmax >= 0 ? 0 : -1);
  }
  if (c.type === 'cyl') {
    const px = ox - c.x, pz = oz - c.z;
    const a = dx * dx + dz * dz;
    const b = 2 * (px * dx + pz * dz);
    const cc = px * px + pz * pz - c.r * c.r;
    let best = -1;
    if (a > 1e-9) {
      const disc = b * b - 4 * a * cc;
      if (disc >= 0) {
        const sq = Math.sqrt(disc);
        for (const t of [(-b - sq) / (2 * a), (-b + sq) / (2 * a)]) {
          if (t < 0 || t > maxT) continue;
          const y = oy + dy * t;
          if (y >= c.y && y <= c.y + c.h) { best = t; break; }
        }
      }
    }
    // caps
    if (Math.abs(dy) > 1e-8) {
      for (const capY of [c.y, c.y + c.h]) {
        const t = (capY - oy) / dy;
        if (t < 0 || t > maxT || (best >= 0 && t > best)) continue;
        const hx = ox + dx * t - c.x, hz = oz + dz * t - c.z;
        if (hx * hx + hz * hz <= c.r * c.r) best = t;
      }
    }
    return best;
  }
  // sphere
  const px = ox - c.x, py = oy - c.y, pz = oz - c.z;
  const b = 2 * (px * dx + py * dy + pz * dz);
  const cc = px * px + py * py + pz * pz - c.r * c.r;
  const disc = b * b - 4 * cc;
  if (disc < 0) return -1;
  const sq = Math.sqrt(disc);
  const t1 = (-b - sq) / 2, t2 = (-b + sq) / 2;
  if (t1 >= 0 && t1 <= maxT) return t1;
  if (t2 >= 0 && t2 <= maxT) return t2;
  return -1;
}

/** World raycast. Returns {t, point, normal, collider} or null. */
export function raycast(world, origin, dir, maxT = 200, filter = null) {
  const ox = origin.x, oy = origin.y, oz = origin.z;
  const dx = dir.x, dy = dir.y, dz = dir.z;
  // walk the ray's AABB in one query — the levels are small enough that this
  // beats a proper DDA and is far less code to get wrong
  const ex = ox + dx * maxT, ey = oy + dy * maxT, ez = oz + dz * maxT;
  world.query(Math.min(ox, ex) - 0.5, Math.min(oy, ey) - 0.5, Math.min(oz, ez) - 0.5,
              Math.max(ox, ex) + 0.5, Math.max(oy, ey) + 0.5, Math.max(oz, ez) + 0.5, _rayHits);
  let bestT = maxT, best = null;
  for (const c of _rayHits) {
    if (c.layer & LAYER.TRIGGER) continue;
    if (filter && !filter(c)) continue;
    const t = rayCollider(c, ox, oy, oz, dx, dy, dz, bestT);
    if (t >= 0 && t < bestT) { bestT = t; best = c; }
  }
  if (!best) return null;
  const point = new THREE.Vector3(ox + dx * bestT, oy + dy * bestT, oz + dz * bestT);
  // normal from the closest-point gradient, nudged off the surface
  const cp = closestPoint(best, point.x + dx * -0.001, point.y + dy * -0.001, point.z + dz * -0.001, _v2);
  let n = new THREE.Vector3(point.x - cp.x, point.y - cp.y, point.z - cp.z);
  if (n.lengthSq() < 1e-8) {
    n.set(-dx, -dy, -dz);
  }
  n.normalize();
  if (n.dot(dir) > 0) n.negate();
  return { t: bestT, point, normal: n, collider: best, surface: best.surface };
}

/* --------------------------------------------------------- RIGID BODY */

/**
 * A prop: urns, terminals, chunks of column. Enough of a rigid body to be
 * thrown by the Chronal Manipulator and to land convincingly.
 */
export class Body {
  constructor(opt = {}) {
    this.pos = new THREE.Vector3().copy(opt.pos || new THREE.Vector3());
    this.vel = new THREE.Vector3();
    this.spin = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.r = opt.r || 0.3;
    this.h = opt.h || 0.6;
    this.mass = opt.mass || 20;
    this.restitution = opt.restitution ?? 0.22;
    this.friction = opt.friction ?? 0.72;
    this.object = opt.object || null;
    this.frozen = false;           // held in stasis by the Chronometer
    this.held = false;             // in the manipulator's grip
    this.asleep = false;
    this.sleepTimer = 0;
    this.grounded = false;
    this.surface = opt.surface || 'marble';
    this.onImpact = opt.onImpact || null;
    this.health = opt.health ?? -1;
    this.breakable = !!opt.breakable;
    this.collider = null;
    this.userData = opt.userData || {};
  }
  applyImpulse(x, y, z) {
    if (this.frozen) return;
    this.vel.x += x / this.mass; this.vel.y += y / this.mass; this.vel.z += z / this.mass;
    this.asleep = false; this.sleepTimer = 0;
  }
  wake() { this.asleep = false; this.sleepTimer = 0; }

  step(world, dt) {
    if (this.frozen || this.held || this.asleep || dt <= 0) return;
    this.vel.y += world.gravity * dt;

    const before = this.vel.length();
    const r = this.r;
    const steps = Math.max(1, Math.ceil((before * dt) / (r * 0.6)));
    const sdt = dt / steps;
    let landedHard = 0;

    for (let s = 0; s < steps; s++) {
      this.pos.addScaledVector(this.vel, sdt);
      this.grounded = false;
      const pad = r + 0.05;
      world.query(this.pos.x - pad, this.pos.y - pad, this.pos.z - pad,
                  this.pos.x + pad, this.pos.y + pad, this.pos.z + pad, _hits);
      for (const c of _hits) {
        if (c.layer & LAYER.TRIGGER) continue;
        if (c.body === this) continue;
        const p = spherePenetration(c, this.pos.x, this.pos.y, this.pos.z, r);
        if (p.depth <= 0) continue;
        this.pos.x += p.nx * p.depth; this.pos.y += p.ny * p.depth; this.pos.z += p.nz * p.depth;
        const vn = this.vel.x * p.nx + this.vel.y * p.ny + this.vel.z * p.nz;
        if (vn < 0) {
          const impact = -vn;
          if (impact > 2.2) landedHard = Math.max(landedHard, impact);
          // reflect, then bleed tangential speed to friction
          this.vel.x -= (1 + this.restitution) * vn * p.nx;
          this.vel.y -= (1 + this.restitution) * vn * p.ny;
          this.vel.z -= (1 + this.restitution) * vn * p.nz;
          // bleed tangential speed to friction
          const f = Math.pow(this.friction, sdt * 60);
          this.vel.x *= f; this.vel.z *= f;
          this.spin.multiplyScalar(0.92);
        }
        if (p.ny > 0.6) { this.grounded = true; this.surface = c.surface; }
      }
    }

    if (landedHard > 0 && this.onImpact) this.onImpact(landedHard, this.pos, this.surface);

    // angular motion, damped
    if (this.spin.lengthSq() > 1e-6) {
      const q = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(this.spin.x * dt, this.spin.y * dt, this.spin.z * dt));
      this.quat.premultiply(q);
      this.spin.multiplyScalar(Math.pow(0.72, dt));
    }

    // sleep so a plaza of urns costs nothing
    if (this.grounded && this.vel.lengthSq() < 0.05 && this.spin.lengthSq() < 0.02) {
      this.sleepTimer += dt;
      if (this.sleepTimer > 0.6) { this.asleep = true; this.vel.set(0, 0, 0); this.spin.set(0, 0, 0); }
    } else this.sleepTimer = 0;

    this.sync();
  }

  sync() {
    if (!this.object) return;
    this.object.position.copy(this.pos);
    this.object.quaternion.copy(this.quat);
    if (this.collider) {
      this.collider.x = this.pos.x; this.collider.y = this.pos.y; this.collider.z = this.pos.z;
      this.collider.computeAABB();
    }
  }
}

/* ---------------------------------------------------------- TRIGGERS */

export class Trigger {
  constructor(opt) {
    this.min = new THREE.Vector3(opt.x - opt.hw, opt.y - opt.hh, opt.z - opt.hd);
    this.max = new THREE.Vector3(opt.x + opt.hw, opt.y + opt.hh, opt.z + opt.hd);
    this.onEnter = opt.onEnter || null;
    this.onExit = opt.onExit || null;
    this.onStay = opt.onStay || null;
    this.once = opt.once !== false;
    this.fired = false;
    this.inside = false;
    this.name = opt.name || '';
    this.enabled = opt.enabled !== false;
  }
  test(p, dt) {
    if (!this.enabled) return;
    const hit = p.x >= this.min.x && p.x <= this.max.x &&
                p.y >= this.min.y && p.y <= this.max.y &&
                p.z >= this.min.z && p.z <= this.max.z;
    if (hit && !this.inside) {
      this.inside = true;
      if (!(this.once && this.fired)) { this.fired = true; this.onEnter?.(); }
    } else if (!hit && this.inside) {
      this.inside = false;
      this.onExit?.();
    } else if (hit) this.onStay?.(dt);
  }
}
