/* SILICONE DREAMS — The Reliquary grammar
 *
 * Plate 2 is not just a place, it is a GRAMMAR. Every object worth having in
 * this game appears the same way:
 *
 *     a black monolith wrapped in green circuit traces and jewelled
 *     components, a dish of standing mercury set into its top face, a column
 *     of vapour rising off the mercury, the object itself turning slowly in
 *     the air above it, and a stream of chrome ones and zeroes climbing out
 *     of the object and dissolving into the sky.
 *
 * Item spawns in the world use it. The vitrines in the hub use it. The altar
 * at the end of the level is the same thing built forty times bigger. Once
 * the player has read it once, they can read it everywhere.
 */
import * as THREE from 'three';
import { M, T } from './Materials.js';
import { lathe, shared } from './Arch.js';
import { rand, clamp, lerp } from '../core/Time.js';

const TAU = Math.PI * 2;
const _v = new THREE.Vector3();

/* ============================================================ MONOLITH */

/**
 * The plinth. A tapered black slab, boarded on all four faces, with a
 * chamfered top and the mercury dish inset into it.
 *
 * @param {object} opt
 * @param {number} opt.w      footprint width
 * @param {number} opt.h      height
 * @param {number} opt.dish   dish radius as a fraction of w
 */
export function monolith(opt = {}) {
  const {
    w = 1.5, h = 1.35, taper = 0.06, dish = 0.62,
    board = M.reliquaryBoard, glow = 0x2fe08a, detail = 1,
  } = opt;
  const grp = new THREE.Group();

  // --- the boarded body. Slight taper so it reads as cut, not extruded.
  const body = new THREE.CylinderGeometry(1, 1, 1, 4, 1);
  const bodyMesh = new THREE.Mesh(body, board);
  bodyMesh.rotation.y = Math.PI / 4;              // square, corners to the axes
  bodyMesh.scale.set(w * 0.7071 * (1 - taper), h, w * 0.7071);
  bodyMesh.position.y = h / 2;
  bodyMesh.castShadow = bodyMesh.receiveShadow = true;
  grp.add(bodyMesh);

  // --- chamfered cap, so the top edge catches a highlight
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(w * 0.7071, w * 0.7071 * 0.985, h * 0.045, 4, 1), board);
  cap.rotation.y = Math.PI / 4;
  cap.position.y = h - h * 0.02;
  cap.castShadow = true;
  grp.add(cap);

  // --- the mercury. A shallow bowl, then the standing surface on top of it.
  const bowlR = w * dish * 0.5;
  const bowl = new THREE.Mesh(
    shared(`relbowl${bowlR.toFixed(2)}`, () => lathe([
      [bowlR * 1.06, 0.045], [bowlR * 1.02, 0.012], [bowlR * 0.92, -0.030],
      [bowlR * 0.55, -0.052], [0, -0.058],
    ], 40)),
    new THREE.MeshPhongMaterial({ color: 0x14161c, specular: 0x9aa4b4, shininess: 120 }));
  bowl.position.y = h + 0.002;
  grp.add(bowl);

  const merc = new THREE.Mesh(
    new THREE.CircleGeometry(bowlR, detail > 0.5 ? 48 : 20), M.mercury.clone());
  merc.rotation.x = -Math.PI / 2;
  merc.position.y = h + 0.020;
  grp.add(merc);
  grp.userData.mercury = merc;

  // a soft pool of light thrown up out of the dish
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(bowlR * 4, bowlR * 4),
    new THREE.MeshBasicMaterial({ map: T.glow, color: glow, transparent: true,
      opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = h + 0.030;
  grp.add(pool);
  grp.userData.pool = pool;

  grp.userData.top = h + 0.02;
  grp.userData.dishRadius = bowlR;
  grp.userData.size = { w, h };
  return grp;
}

/* =========================================================== VAPOUR */

/**
 * The column of steam standing off the mercury. Six nested cones with a
 * scrolling alpha, which is cheap and reads far better than a particle
 * system at this size.
 */
export function vapourColumn(opt = {}) {
  // Opacity is deliberately tiny. Five additive shells stack, so anything
  // above ~0.05 each turns the plume into an opaque lampshade that hides
  // the very object it is supposed to be presenting.
  const { r = 0.34, h = 1.1, shells = 4, colour = 0xdfe8f2, opacity = 0.045 } = opt;
  const grp = new THREE.Group();
  const layers = [];
  for (let i = 0; i < shells; i++) {
    const t = i / shells;
    // narrow at the TOP: the plume thins as it rises off the dish
    const g = new THREE.CylinderGeometry(r * (0.16 + t * 0.34), r * (0.80 + t * 0.30), h * (0.62 + t * 0.34),
      16, 1, true);
    g.translate(0, h * (0.7 + t * 0.5) * 0.5, 0);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      map: T.cloud, color: colour, transparent: true,
      opacity: opacity * (1 - t * 0.55), depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    m.material.map = T.cloud.clone();
    m.material.map.wrapS = m.material.map.wrapT = THREE.RepeatWrapping;
    m.material.map.repeat.set(2, 1);
    m.userData.speed = 0.10 + i * 0.045;
    m.userData.spin = (i % 2 ? 1 : -1) * (0.06 + i * 0.03);
    grp.add(m);
    layers.push(m);
  }
  grp.userData.layers = layers;
  return grp;
}

/* ==================================================== BINARY ASCENT */

/**
 * The stream of ones and zeroes. Chrome numerals climb out of the object,
 * tumbling and fading, and are recycled at the bottom — a fountain, not a
 * particle burst, because in the plate it is clearly continuous.
 */
export class BinaryAscent {
  constructor(parent, opt = {}) {
    const {
      count = 26, radius = 0.5, rise = 3.2, size = 0.20,
      speed = 0.55, spread = 1.9, colour = 0xffffff,
    } = opt;
    this.rise = rise; this.speed = speed; this.radius = radius; this.spread = spread;
    this.group = new THREE.Group();
    parent.add(this.group);

    const geo = new THREE.PlaneGeometry(1, 1);
    const mk = (tex) => new THREE.MeshBasicMaterial({
      map: tex, color: colour, transparent: true, alphaTest: 0.08,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: true,
    });
    this.matOne = mk(T.glyph1);
    this.matZero = mk(T.glyph0);

    this.glyphs = [];
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, i % 2 ? this.matOne : this.matZero);
      const s = size * rand(0.6, 1.45);
      m.scale.setScalar(s);
      m.userData = {
        t: Math.random(),                       // 0 at the dish, 1 at the top
        a: rand(0, TAU),                        // angle around the column
        r: rand(0.15, 1) * radius,
        rate: rand(0.55, 1.5) * speed,
        spinX: rand(-1.6, 1.6), spinY: rand(-2.2, 2.2), spinZ: rand(-1.1, 1.1),
        wob: rand(0, TAU),
        baseScale: s,
      };
      this.group.add(m);
      this.glyphs.push(m);
    }
  }

  update(dt, camera) {
    if (!this.group.visible) return;
    for (const m of this.glyphs) {
      const d = m.userData;
      d.t += d.rate * dt * 0.32;
      if (d.t > 1) {
        d.t -= 1;
        d.a = rand(0, TAU);
        d.r = rand(0.15, 1) * this.radius;
      }
      const t = d.t;
      // the column opens out as it climbs, like the plate's dispersing stream
      const spread = 1 + t * this.spread;
      const a = d.a + t * 1.35;
      m.position.set(
        Math.cos(a) * d.r * spread,
        t * this.rise,
        Math.sin(a) * d.r * spread);
      m.position.x += Math.sin(d.wob + t * 6) * 0.06;
      m.position.z += Math.cos(d.wob + t * 5) * 0.06;
      m.rotation.x += d.spinX * dt;
      m.rotation.y += d.spinY * dt;
      m.rotation.z += d.spinZ * dt;
      // fade in off the dish, fade out into the sky
      const alpha = Math.min(1, t / 0.14) * (1 - Math.pow(clamp(t, 0, 1), 2.2));
      m.scale.setScalar(d.baseScale * (0.55 + t * 0.8));
      m.visible = alpha > 0.02;
      m.material.opacity = alpha;
    }
  }

  setVisible(v) { this.group.visible = v; }

  dispose() {
    this.group.parent?.remove(this.group);
    this.matOne.dispose(); this.matZero.dispose();
  }
}

/* ================================================ THE FULL RELIQUARY */

/**
 * Monolith + vapour + levitating payload + binary ascent, assembled and
 * animated as one unit. `payload` is any Object3D; it is re-parented into
 * the levitation slot and left there.
 */
export class Reliquary {
  constructor(scene, opt = {}) {
    const {
      pos = new THREE.Vector3(), scale = 1, payload = null,
      hover = 1.15, glow = 0x2fe08a, binary = true, vapour = true,
      spin = 0.32, label = '', detail = 1, lights = 'full',
    } = opt;

    this.root = new THREE.Group();
    this.root.position.copy(pos);
    this.root.scale.setScalar(scale);
    scene.add(this.root);

    this.plinth = monolith({ w: opt.w ?? 1.5, h: opt.h ?? 1.35, glow, detail });
    this.root.add(this.plinth);
    const top = this.plinth.userData.top;
    this.topY = top;

    if (vapour) {
      this.vapour = vapourColumn({
        r: this.plinth.userData.dishRadius * 1.05,
        h: hover * 1.25, colour: 0xe4ecf6,
      });
      this.vapour.position.y = top;
      this.root.add(this.vapour);
    }

    // the levitation slot: everything above the dish hangs off this
    this.slot = new THREE.Group();
    this.slot.position.y = top + hover;
    this.root.add(this.slot);

    this.spin = spin;
    this.bob = Math.random() * TAU;
    this.hover = hover;
    this.empty = true;

    if (binary) {
      this.binary = new BinaryAscent(this.slot, {
        count: Math.round(26 * detail), radius: 0.42, rise: 3.4,
        size: 0.19, speed: 0.6,
      });
    }

    // Lighting the payload is the whole job: in the plate the brain is the
    // brightest thing in frame by a wide margin. A warm key from the front
    // and a cool rim from behind is what makes the iridescence sing.
    //
    // But real lights are the single most expensive thing in a Phong scene,
    // and a hall of sixteen of these would add forty-eight of them. So the
    // full rig is for hero placements only; ranked vitrines take 'none' and
    // are lit by the room, with the material's own emissive carrying them.
    this.lightMode = lights;
    if (lights !== 'none') {
      this.light = new THREE.PointLight(glow, 0.55, 6.5, 2);
      this.light.position.y = top + hover * 0.45;
      this.root.add(this.light);
    }
    if (lights === 'full') {
      this.key = new THREE.PointLight(0xffe8d0, 2.6, 9, 2);
      this.key.position.set(0.9, top + hover + 0.85, 1.5);
      this.root.add(this.key);
      this.rim = new THREE.PointLight(0x8fb4ff, 1.9, 8, 2);
      this.rim.position.set(-1.2, top + hover + 0.5, -1.5);
      this.root.add(this.rim);
    }

    if (payload) this.setPayload(payload);
    if (label) this.setLabel(label);
  }

  setPayload(obj) {
    if (this.payload) this.slot.remove(this.payload);
    this.payload = obj;
    this.empty = !obj;
    if (obj) {
      obj.position.set(0, 0, 0);
      this.slot.add(obj);
    }
    if (this.binary) this.binary.setVisible(!!obj);
    if (this.vapour) this.vapour.visible = true;
    if (this.light) this.light.intensity = obj ? 0.55 : 0.18;
  }

  /** An engraved brass tag on the front face of the plinth. */
  setLabel(text) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 96;
    const g = c.getContext('2d');
    g.fillStyle = '#0a0c10'; g.fillRect(0, 0, 512, 96);
    g.strokeStyle = '#c8a24a'; g.lineWidth = 4; g.strokeRect(6, 6, 500, 84);
    g.font = '600 34px Verdana, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#ffd98a';
    g.fillText(text.toUpperCase().slice(0, 26), 256, 50);
    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    const w = this.plinth.userData.size.w;
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.78, w * 0.146),
      new THREE.MeshBasicMaterial({ map: tx, transparent: true }));
    plate.position.set(0, this.plinth.userData.size.h * 0.52, w * 0.505);
    this.root.add(plate);
    this.labelPlate = plate;
    return plate;
  }

  update(dt, camera, realDt = dt) {
    this.bob += realDt;
    if (this.payload) {
      this.payload.rotation.y += this.spin * realDt;
      this.payload.position.y = Math.sin(this.bob * 0.8) * 0.055;
    }
    if (this.binary) this.binary.update(realDt, camera);
    if (this.vapour) {
      for (const l of this.vapour.userData.layers) {
        l.material.map.offset.y -= l.userData.speed * realDt;
        l.rotation.y += l.userData.spin * realDt;
      }
    }
    // the mercury trembles
    const m = this.plinth.userData.mercury;
    if (m) {
      m.position.y = this.plinth.userData.top + Math.sin(this.bob * 1.7) * 0.004;
      m.material.emissive.setScalar(0.05 + Math.sin(this.bob * 2.1) * 0.025);
    }
    const pool = this.plinth.userData.pool;
    if (pool) pool.material.opacity = 0.055 + Math.sin(this.bob * 1.3) * 0.022;
    if (this.light) this.light.intensity = (this.payload ? 0.52 : 0.16) + Math.sin(this.bob * 2.4) * 0.07;
  }

  dispose() {
    this.binary?.dispose();
    this.root.parent?.remove(this.root);
  }
}

/* ===================================================== THE RELIC ITSELF */

/**
 * The oil-slick brain of plate 2, as a holdable object. Built by displacing
 * an icosphere with a gyral field so it folds like the real thing, then
 * splitting it down the midline.
 */
export function relicBrain(opt = {}) {
  const { r = 0.42, detail = 5, mat = M.oilSlick } = opt;
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();

  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    n.copy(v).normalize();
    const { x, y, z } = n;

    // --- silhouette: an ovoid, wider behind than in front, flat underneath
    let sx = 0.74, sy = 0.66, sz = 1.0;
    sz *= 1 + Math.max(0, z) * 0.06 - Math.max(0, -z) * 0.04;   // occiput fuller
    sy *= 1 - Math.max(0, -y) * 0.30;                            // flat base
    // temporal lobes: a bulge low on each side, toward the front
    const temporal = Math.exp(-((y + 0.30) ** 2) / 0.10) * Math.exp(-((z - 0.30) ** 2) / 0.55) * Math.abs(x);
    sx *= 1 + temporal * 0.24;

    // --- gyri. Layered sines at different frequencies and axes give the
    //     characteristic worm-pile without needing real noise.
    const fold =
      Math.sin(x * 9.0 + y * 3.5) * 0.052 +
      Math.sin(y * 11.0 + z * 4.5) * 0.048 +
      Math.sin(z * 8.0 + x * 6.0) * 0.044 +
      Math.sin(x * 16.0 + z * 3.0) * Math.sin(y * 13.0) * 0.028 +
      Math.sin((x + z) * 19.0) * 0.012;

    // --- the longitudinal fissure: a deep, narrow trench along the midline
    const fissure = Math.exp(-(x * x) / 0.0060) * Math.max(0, y + 0.12) * 0.150;
    // --- the lateral (Sylvian) fissure, sweeping back on each flank
    const syl = Math.exp(-((y + 0.16 - Math.max(0, z) * 0.16) ** 2) / 0.006)
              * Math.exp(-((z - 0.14) ** 2) / 0.85) * Math.min(1, Math.abs(x) * 2.2) * 0.080;

    const rr = (1 + fold - fissure - syl) * r;
    p.setXYZ(i, x * sx * rr, y * sy * rr, z * sz * rr);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;

  // cerebellum: a tighter-folded ball tucked under the occiput
  const cbGeo = new THREE.IcosahedronGeometry(r * 0.30, 3);
  {
    const cp = cbGeo.attributes.position;
    for (let i = 0; i < cp.count; i++) {
      v.fromBufferAttribute(cp, i); n.copy(v).normalize();
      // fine horizontal banding is what makes a cerebellum look like one
      const band = Math.sin(n.y * 34.0) * 0.032 + Math.sin(n.y * 17.0 + n.x * 3.0) * 0.020;
      v.setLength(r * 0.30 * (1 + band));
      cp.setXYZ(i, v.x, v.y * 0.72, v.z * 0.94);
    }
    cbGeo.computeVertexNormals();
  }
  const cb = new THREE.Mesh(cbGeo, mat);
  cb.position.set(0, -r * 0.40, -r * 0.66);
  m.add(cb);

  // brain stem
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.115, r * 0.075, r * 0.46, 12), mat);
  stem.position.set(0, -r * 0.60, -r * 0.40);
  stem.rotation.x = -0.36;
  m.add(stem);

  const grp = new THREE.Group();
  grp.add(m);
  grp.userData.shell = m;
  grp.userData.radius = r * 1.2;
  return grp;
}
