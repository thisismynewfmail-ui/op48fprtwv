/* HALCYON — Sky, sea and the horizon
 *
 * Four skies, one per plate: the violet dusk over the temple, the
 * photographic blue above the mirror, the nebula of the nexus, and the plain
 * starfield of the colonnade. Each is a dome plus a layer of billboarded
 * cumulus that drifts, because a painted sky alone never reads as deep.
 */
import * as THREE from 'three';
import { SKY_VERT, SKY_FRAG, SEA_VERT, SEA_FRAG } from './Shaders.js';
import { T } from '../world/Materials.js';
import { rand, lerp, damp } from '../core/Time.js';

export class SkyDome {
  constructor(scene, opt = {}) {
    this.scene = scene;
    const geo = new THREE.SphereGeometry(1400, 40, 24);
    geo.scale(-1, 1, 1);                       // inside-out
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: T.skyViolet },
        uTime: { value: 0 },
        uDrift: { value: 0.0035 },
        uTint: { value: new THREE.Color(1, 1, 1) },
        uExposure: { value: 1 },
        uDilate: { value: 0 },
      },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      depthWrite: false,
      side: THREE.FrontSide,
      fog: false,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.renderOrder = -1000;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    this.target = { map: T.skyViolet, tint: new THREE.Color(1, 1, 1), exposure: 1, drift: 0.0035 };
    this._blend = 1;
  }

  /** Swap sky over `fade` seconds by crossfading exposure through black. */
  set(map, opt = {}) {
    this.target.map = map;
    if (opt.tint) this.target.tint.set(opt.tint);
    this.target.exposure = opt.exposure ?? 1;
    this.target.drift = opt.drift ?? 0.0035;
    this.mat.uniforms.uMap.value = map;
    this.mat.uniforms.uTint.value.copy(this.target.tint);
    this.mat.uniforms.uExposure.value = this.target.exposure;
    this.mat.uniforms.uDrift.value = this.target.drift;
  }

  update(dt, dilation) {
    this.mat.uniforms.uTime.value += dt;
    this.mat.uniforms.uDilate.value = damp(this.mat.uniforms.uDilate.value, dilation, 6, dt);
  }

  followCamera(cam) {
    this.mesh.position.copy(cam.position);
  }
}

/* ------------------------------------------------------------ CLOUDS */

/**
 * A field of billboarded cumulus. Each cloud is a cluster of soft puffs, so
 * the silhouette breaks up the way a real cumulus does instead of reading as
 * one sprite.
 */
export class CloudField {
  constructor(scene, opt = {}) {
    const {
      count = 26, radius = 620, yMin = 90, yMax = 240,
      puffsPerCloud = 7, scale = 90, tex = T.cloud,
      colour = 0xffffff, opacity = 0.9, drift = 1.6,
    } = opt;
    this.group = new THREE.Group();
    this.group.renderOrder = -900;
    scene.add(this.group);
    this.drift = drift;
    this.clouds = [];

    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false, opacity,
      color: colour, fog: false, side: THREE.DoubleSide,
    });
    this.mat = mat;
    const geo = new THREE.PlaneGeometry(1, 1);

    for (let i = 0; i < count; i++) {
      const cloud = new THREE.Group();
      const a = rand(0, Math.PI * 2);
      const r = radius * (0.45 + Math.random() * 0.85);
      cloud.position.set(Math.cos(a) * r, rand(yMin, yMax), Math.sin(a) * r);
      const s = scale * (0.55 + Math.random() * 0.9);
      for (let p = 0; p < puffsPerCloud; p++) {
        const q = new THREE.Mesh(geo, mat);
        q.position.set(rand(-s * 0.9, s * 0.9), rand(-s * 0.16, s * 0.22), rand(-s * 0.5, s * 0.5));
        const ps = s * (0.5 + Math.random() * 0.75);
        q.scale.set(ps, ps * rand(0.55, 0.8), 1);
        cloud.add(q);
      }
      cloud.userData.speed = rand(0.5, 1.5);
      this.group.add(cloud);
      this.clouds.push(cloud);
    }
  }

  update(dt, cam) {
    const q = cam.quaternion;
    for (const c of this.clouds) {
      c.position.x += this.drift * c.userData.speed * dt;
      if (c.position.x > 900) c.position.x = -900;
      for (const p of c.children) p.quaternion.copy(q);
    }
  }

  setVisible(v) { this.group.visible = v; }
  dispose() { this.group.parent?.remove(this.group); this.mat.dispose(); }
}

/* --------------------------------------------------------------- SEA */

/** The violet ocean under the temple plaza. */
export class Sea {
  constructor(scene, opt = {}) {
    const {
      size = 2400, segs = 96, y = -6.5,
      shallow = 0x6a72b4, deep = 0x2e3268, sky = 0x8f83bc,
      sun = 0xfff0d0, sunDir = new THREE.Vector3(0.4, 0.5, -0.75).normalize(),
      waveScale = 1, opacity = 1,
    } = opt;
    const geo = new THREE.PlaneGeometry(size, size, segs, segs);
    geo.rotateX(-Math.PI / 2);
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uWaveScale: { value: waveScale },
        uShallow: { value: new THREE.Color(shallow) },
        uDeep: { value: new THREE.Color(deep) },
        uSky: { value: new THREE.Color(sky) },
        uSun: { value: new THREE.Color(sun) },
        uSunDir: { value: sunDir },
        uOpacity: { value: opacity },
      },
      vertexShader: SEA_VERT,
      fragmentShader: SEA_FRAG,
      transparent: opacity < 1,
      fog: false,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.position.y = y;
    this.mesh.renderOrder = -800;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  update(dt, cam) {
    this.mat.uniforms.uTime.value += dt;
    // keep the sheet centred under the camera so it never runs out
    this.mesh.position.x = Math.round(cam.position.x / 40) * 40;
    this.mesh.position.z = Math.round(cam.position.z / 40) * 40;
  }
  setVisible(v) { this.mesh.visible = v; }
}

/* ------------------------------------------------------------ ISLAND */

/**
 * The low-poly pink mountain on plate 1's horizon. Built as a displaced
 * cone so it keeps the faceted, untextured look of the original render.
 */
export function pinkIsland(opt = {}) {
  const { r = 120, h = 46, seed = 5, colour = 0xd9a8c8 } = opt;
  const geo = new THREE.ConeGeometry(r, h, 14, 5);
  const p = geo.attributes.position;
  let s = seed;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = (y + h / 2) / h;
    const jitter = (rnd() - 0.5);
    p.setX(i, x * (1 + jitter * 0.22) + jitter * r * 0.06);
    p.setZ(i, z * (1 + jitter * 0.22) + jitter * r * 0.06);
    p.setY(i, y + jitter * h * 0.12 * (1 - t));
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshPhongMaterial({
    color: colour, specular: 0x3a2838, shininess: 12, flatShading: true, fog: true,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.y = h / 2;
  // a paler ridge behind, to build depth
  const grp = new THREE.Group();
  grp.add(m);
  const back = m.clone();
  back.material = mat.clone();
  back.material.color.setHex(0xc9a0c4);
  back.material.opacity = 0.8;
  back.scale.set(0.72, 0.62, 0.72);
  back.position.set(r * 1.1, h * 0.31, -r * 0.5);
  grp.add(back);
  return grp;
}

/* ------------------------------------------------------- STAR FIELD */

/** Point-sprite stars for the void zones. */
export function starField(opt = {}) {
  const { count = 2200, radius = 1100, size = 2.6 } = opt;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const sz = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    // uniform on the sphere
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    const R = radius * (0.85 + Math.random() * 0.3);
    pos[i * 3] = Math.cos(th) * r * R;
    pos[i * 3 + 1] = u * R;
    pos[i * 3 + 2] = Math.sin(th) * r * R;
    const m = Math.pow(Math.random(), 3);
    const tint = Math.random();
    const c = tint < 0.7 ? [1, 1, 1] : tint < 0.86 ? [0.78, 0.86, 1] : [1, 0.88, 0.74];
    const b = 0.35 + m * 0.65;
    col[i * 3] = c[0] * b; col[i * 3 + 1] = c[1] * b; col[i * 3 + 2] = c[2] * b;
    sz[i] = size * (0.4 + m * 1.8);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uScale: { value: 1 } },
    vertexShader: /* glsl */`
      attribute float aSize;
      varying vec3 vColor;
      varying float vTwinkle;
      uniform float uTime;
      uniform float uScale;
      void main(){
        vColor = color;
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        float ph = position.x*0.01 + position.y*0.017 + position.z*0.013;
        vTwinkle = 0.75 + 0.25*sin(uTime*1.7 + ph*40.0);
        gl_PointSize = aSize * uScale * vTwinkle * (300.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vColor;
      varying float vTwinkle;
      void main(){
        vec2 d = gl_PointCoord - 0.5;
        float r = length(d)*2.0;
        float a = pow(max(0.0, 1.0 - r), 2.2);
        // faint cross flare
        a += max(0.0, 1.0 - abs(d.x)*22.0) * max(0.0, 1.0-r) * 0.30;
        a += max(0.0, 1.0 - abs(d.y)*22.0) * max(0.0, 1.0-r) * 0.30;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vColor*vTwinkle, a);
      }`,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = -950;
  pts.userData.mat = mat;
  return pts;
}

/* ------------------------------------------------------ ENVIRONMENT */

/**
 * Per-zone environment presets. Switching zones lerps fog and light so the
 * transition across a bridge reads as a change of world, not a cut.
 */
export const ZONES = {
  temple: {
    sky: () => T.skyViolet,
    tint: 0xffffff, exposure: 0.92, drift: 0.0032,
    fog: 0xb2a4d8, fogDensity: 0.0030,
    ambient: 0x8b83b8, ground: 0x7a6e96, ambientI: 1.25,
    sun: 0xfff2de, sunI: 1.50, sunDir: [0.42, 0.62, -0.66],
    fill: 0x9c8fd8, fillI: 0.60,
    music: 'temple',
  },
  mirror: {
    sky: () => T.skyBlue,
    tint: 0xffffff, exposure: 0.94, drift: 0.0026,
    fog: 0xbcd6ec, fogDensity: 0.0013,
    ambient: 0x9cbcda, ground: 0x8ea6bc, ambientI: 1.45,
    // The Choir all face +Z, toward the way in. Light them from +Z too, or
    // the player walks into a plane of silhouettes.
    sun: 0xfff8e0, sunI: 1.75, sunDir: [-0.34, 0.60, 0.72],
    fill: 0x9ccbf0, fillI: 0.68,
    music: 'mirror',
  },
  colonnade: {
    sky: () => T.nebula,
    tint: 0xffffff, exposure: 0.95, drift: 0.0009,
    fog: 0x0b0a18, fogDensity: 0.0062,
    ambient: 0x5a5478, ground: 0x3e3a54, ambientI: 1.30,
    sun: 0xe8eeff, sunI: 1.55, sunDir: [0.3, 0.55, 0.78],
    fill: 0x8a76a8, fillI: 0.65,
    music: 'colonnade',
  },
  nexus: {
    sky: () => T.nebula,
    tint: 0xffffff, exposure: 1.0, drift: 0.0012,
    fog: 0x0a0814, fogDensity: 0.0042,
    ambient: 0x6a5f8c, ground: 0x4a4266, ambientI: 1.40,
    sun: 0xfff0d0, sunI: 1.70, sunDir: [-0.55, 0.5, 0.67],
    fill: 0xb46ab8, fillI: 0.70,
    music: 'nexus',
  },
};

export class Environment {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;

    this.fog = new THREE.FogExp2(0xb5a8dd, 0.0034);
    scene.fog = this.fog;

    // the ground half matters: every one of these rooms is a white marble
    // floor under a roof, and the bounce is most of what lights the soffits
    this.ambient = new THREE.HemisphereLight(0x8b83b8, 0x7a6e96, 1.25);
    scene.add(this.ambient);

    this.sun = new THREE.DirectionalLight(0xfff0d8, 1.35);
    this.sun.position.set(60, 90, -95);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const d = 44;
    this.sun.shadow.camera.left = -d; this.sun.shadow.camera.right = d;
    this.sun.shadow.camera.top = d; this.sun.shadow.camera.bottom = -d;
    this.sun.shadow.camera.near = 1; this.sun.shadow.camera.far = 320;
    this.sun.shadow.bias = -0.0007;
    this.sun.shadow.normalBias = 0.026;
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.fill = new THREE.DirectionalLight(0x8e7fd0, 0.55);
    this.fill.position.set(-70, 40, 80);
    scene.add(this.fill);

    this.dome = new SkyDome(scene);
    this.current = null;
    this.blend = { fog: new THREE.Color(), amb: new THREE.Color(), sun: new THREE.Color(), fill: new THREE.Color() };
    this.targets = null;
    this.transition = 1;
  }

  apply(name, instant = false) {
    const z = ZONES[name];
    if (!z || this.current === name) return;
    this.current = name;
    this.targets = z;
    this.dome.set(z.sky(), { tint: z.tint, exposure: z.exposure, drift: z.drift });
    if (instant) {
      this.fog.color.setHex(z.fog);
      this.fog.density = z.fogDensity;
      this.ambient.color.setHex(z.ambient);
      this.ambient.groundColor.setHex(z.ground ?? z.ambient);
      this.ambient.intensity = z.ambientI;
      this.sun.color.setHex(z.sun); this.sun.intensity = z.sunI;
      this.fill.color.setHex(z.fill); this.fill.intensity = z.fillI;
      this.setSunDir(z.sunDir);
      this.transition = 1;
    } else {
      this.transition = 0;
    }
  }

  setSunDir(d) {
    this.sun.position.set(d[0] * 110, d[1] * 110, d[2] * 110);
  }

  update(dt, cam, dilation) {
    const z = this.targets;
    if (z) {
      const k = this.transition < 1 ? Math.min(1, dt * 2.2) : 0;
      if (k > 0) {
        this.transition = Math.min(1, this.transition + dt * 0.55);
        this.fog.color.lerp(this.blend.fog.setHex(z.fog), k);
        this.fog.density = lerp(this.fog.density, z.fogDensity, k);
        this.ambient.color.lerp(this.blend.amb.setHex(z.ambient), k);
        this.ambient.groundColor.lerp(this.blend.amb.setHex(z.ground ?? z.ambient), k);
        this.ambient.intensity = lerp(this.ambient.intensity, z.ambientI, k);
        this.sun.color.lerp(this.blend.sun.setHex(z.sun), k);
        this.sun.intensity = lerp(this.sun.intensity, z.sunI, k);
        this.fill.color.lerp(this.blend.fill.setHex(z.fill), k);
        this.fill.intensity = lerp(this.fill.intensity, z.fillI, k);
        const cur = new THREE.Vector3().copy(this.sun.position).normalize();
        cur.lerp(new THREE.Vector3(...z.sunDir).normalize(), k).normalize();
        this.sun.position.copy(cur).multiplyScalar(110);
      }
    }
    // keep the shadow frustum travelling with the player
    this.sun.target.position.set(cam.position.x, 0, cam.position.z);
    const d = this.targets ? this.targets.sunDir : [0.4, 0.6, -0.7];
    this.sun.position.set(cam.position.x + d[0] * 110, d[1] * 110, cam.position.z + d[2] * 110);
    this.sun.target.updateMatrixWorld();

    this.dome.update(dt, dilation);
    this.dome.followCamera(cam);
  }
}
