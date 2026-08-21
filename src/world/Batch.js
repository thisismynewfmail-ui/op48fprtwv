/* SILICONE DREAMS — Static batching
 *
 * The level is thousands of small meshes: fluted shafts, acanthus leaves,
 * balusters, keycaps, ivy. Individually they are cheap; collectively they
 * are three thousand draw calls, which is what a 2003 engine would have
 * choked on too.
 *
 * So: after the level is assembled, walk each zone group, bake every static
 * mesh's world transform into its geometry, and merge by material. One draw
 * call per material per zone, and the geometry is identical on screen.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Mark a subtree so the baker leaves it alone (anything that animates). */
export function keepDynamic(obj) {
  obj.traverse((o) => { o.userData.dynamic = true; });
  return obj;
}

function isBakeable(o) {
  if (!o.isMesh) return false;
  if (o.userData.dynamic) return false;
  if (Array.isArray(o.material)) return false;    // multi-material: leave it
  if (o.isInstancedMesh || o.isSkinnedMesh) return false;
  const g = o.geometry;
  if (!g || !g.attributes.position) return false;
  // every merge candidate must carry the same attribute set
  if (!g.attributes.normal || !g.attributes.uv) return false;
  // check that nothing up the chain is marked dynamic
  for (let p = o.parent; p; p = p.parent) if (p.userData.dynamic) return false;
  return true;
}

/**
 * @param {THREE.Object3D} root  subtree to bake in place
 * @returns {{before:number, after:number}}
 */
export function bakeStatic(root) {
  root.updateMatrixWorld(true);
  // Bake into ROOT-LOCAL space, not world space: the merged mesh becomes a
  // child of root, so root's own transform must not be applied twice.
  const toLocal = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const _m = new THREE.Matrix4();

  const buckets = new Map();      // material -> {geos, castShadow, receiveShadow, meshes}
  const stack = [root];
  let before = 0;

  while (stack.length) {
    const o = stack.pop();
    for (const c of o.children) stack.push(c);
    if (!o.isMesh) continue;
    before++;
    if (!isBakeable(o)) continue;

    let b = buckets.get(o.material);
    if (!b) buckets.set(o.material, b = { geos: [], cast: false, receive: false, meshes: [] });
    b.cast = b.cast || o.castShadow;
    b.receive = b.receive || o.receiveShadow;
    b.meshes.push(o);
  }

  let merged = 0;
  for (const [mat, b] of buckets) {
    if (b.meshes.length < 3) continue;           // not worth a merge
    const geos = [];
    for (const m of b.meshes) {
      const g = m.geometry.clone();
      // strip anything not shared by all candidates so the merge cannot fail
      for (const key of Object.keys(g.attributes)) {
        if (key !== 'position' && key !== 'normal' && key !== 'uv') g.deleteAttribute(key);
      }
      if (!g.index) {
        // mergeGeometries requires a consistent indexed/non-indexed state
        const n = g.attributes.position.count;
        const idx = new (n > 65535 ? Uint32Array : Uint16Array)(n);
        for (let i = 0; i < n; i++) idx[i] = i;
        g.setIndex(new THREE.BufferAttribute(idx, 1));
      }
      g.applyMatrix4(_m.multiplyMatrices(toLocal, m.matrixWorld));
      geos.push(g);
    }
    let out = null;
    try { out = mergeGeometries(geos, false); } catch (e) { out = null; }
    if (!out) { for (const g of geos) g.dispose(); continue; }

    out.computeBoundingSphere();
    out.computeBoundingBox();
    const mesh = new THREE.Mesh(out, mat);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.receive;
    mesh.userData.baked = true;
    mesh.matrixAutoUpdate = false;
    root.add(mesh);
    merged++;

    for (const m of b.meshes) {
      m.parent?.remove(m);
      // the source geometry is shared across many meshes, so it is not ours
      // to dispose here — the level's shared-geometry cache owns it
    }
    for (const g of geos) g.dispose();
  }

  let after = 0;
  root.traverse((o) => { if (o.isMesh) after++; });
  return { before, after, merged };
}

/**
 * Coarse zone culling: the chapter is one long strip, so a group that is
 * more than `range` metres away on Z can simply be switched off.
 */
export class ZoneCuller {
  constructor() { this.zones = []; }
  add(group, z, range = 220) { this.zones.push({ group, z, range }); return group; }
  update(playerZ) {
    for (const z of this.zones) {
      const vis = Math.abs(playerZ - z.z) < z.range;
      if (z.group.visible !== vis) z.group.visible = vis;
    }
  }
}
