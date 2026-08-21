/* SILICONE DREAMS — Materials
 *
 * Deliberately NOT physically based. The look we are matching is Source circa
 * 2003: MeshPhongMaterial, a hot specular lobe, baked-in ambient, and diffuse
 * textures that are a little too low-res for the polygon count around them.
 */
import * as THREE from 'three';
import * as A from '../core/Assets.js';
import { cfg } from '../core/Config.js';

const cache = new Map();
let maxAniso = 4;

export function setRenderer(renderer) {
  maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
}

function tex(key, make, opt = {}) {
  if (cache.has(key)) return cache.get(key);
  const t = new THREE.CanvasTexture(make());
  t.wrapS = t.wrapT = opt.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.colorSpace = opt.data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = opt.aniso === false ? 1 : maxAniso;
  t.magFilter = opt.nearest ? THREE.NearestFilter : THREE.LinearFilter;
  t.minFilter = opt.nearest ? THREE.NearestMipmapLinearFilter : THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = opt.mips !== false;
  if (opt.repeat) t.repeat.set(opt.repeat[0], opt.repeat[1]);
  t.needsUpdate = true;
  cache.set(key, t);
  return t;
}

export const T = {};   // texture registry
export const M = {};   // material registry

/** Builds every texture and material. Yields between groups so the loading
 *  screen can actually paint. */
export async function buildMaterials(onProgress = () => {}) {
  const step = async (label, fn) => { onProgress(label); await new Promise(r => setTimeout(r, 0)); fn(); };

  await step('quarrying marble', () => {
    T.marbleWhite = tex('marbleWhite', () => A.marble(512, {
      base: 0xe4e0d8, vein: 0x9d9a93, vein2: 0xfffdf7, seed: 3, veinFreq: 2, turbAmp: 1.4 }));
    T.marbleGrey = tex('marbleGrey', () => A.marble(512, {
      base: 0xcfccc5, vein: 0x6e6b66, vein2: 0xf6f4ef, seed: 8, veinFreq: 3, turbAmp: 1.9, sharp: 0.38 }));
    T.marbleRose = tex('marbleRose', () => A.marble(512, {
      base: 0xb08a76, vein: 0x6a3b30, vein2: 0xe6cbb4, seed: 15, veinFreq: 3, turbAmp: 2.1, sharp: 0.36, warp: 0.32 }));
    T.marbleCream = tex('marbleCream', () => A.marble(512, {
      base: 0xefe6d4, vein: 0xbba98a, vein2: 0xfffaf0, seed: 22, veinFreq: 2, turbAmp: 1.2 }));
    T.marbleBlack = tex('marbleBlack', () => A.marble(512, {
      base: 0x23202a, vein: 0x11101a, vein2: 0x6f6a80, seed: 31, veinFreq: 3, turbAmp: 2.4, sharp: 0.5 }));
  });

  await step('laying the checkerboard', () => {
    const rose = A.marble(256, { base: 0xa8806c, vein: 0x60332a, vein2: 0xdcc0a8, seed: 15, veinFreq: 2, turbAmp: 2.0, sharp: 0.36 });
    const grey = A.marble(256, { base: 0xd6d2cb, vein: 0x76736e, vein2: 0xfbf9f5, seed: 8, veinFreq: 2, turbAmp: 1.8, sharp: 0.38 });
    const white = A.marble(256, { base: 0xe8e5de, vein: 0xa9a69f, vein2: 0xfffefa, seed: 3, veinFreq: 1, turbAmp: 1.4 });
    const black = A.marble(256, { base: 0x201d26, vein: 0x0d0c14, vein2: 0x5e5970, seed: 31, veinFreq: 2, turbAmp: 2.2, sharp: 0.48 });
    T.checkerColonnade = tex('checkerColonnade', () => A.checkerOf(grey, rose, 512, { groutW: 0.006 }));
    T.checkerPlaza = tex('checkerPlaza', () => A.checkerOf(white, grey, 512, { groutW: 0.004, grout: 'rgba(0,0,0,0.18)' }));
    T.checkerNexus = tex('checkerNexus', () => A.checkerOf(rose, white, 512, { groutW: 0.006 }));
    T.checkerVoid = tex('checkerVoid', () => A.checkerOf(black, grey, 512, { groutW: 0.006 }));
    T.carpet = tex('carpet', () => A.carpetChecker(512, { a: 0xd44fa4, b: 0x171220 }));
  });

  await step('fluting the columns', () => {
    T.fluted = tex('fluted', () => A.flutedMarble(1024, 24, { base: 0xeee9e0, vein: 0xc0b9ac, veinFreq: 1, seed: 12 }));
    T.flutedRose = tex('flutedRose', () => A.flutedMarble(1024, 20, { base: 0xb2897a, vein: 0x6d3f34, vein2: 0xe0c4ab, veinFreq: 2, seed: 16 }));
    T.stucco = tex('stucco', () => A.marble(512, { base: 0xdcd6c8, vein: 0xb9b2a2, vein2: 0xf2eee4, seed: 41, veinFreq: 6, turbAmp: 3, sharp: 0.2, speckle: 0.09 }));
    T.rustStone = tex('rustStone', () => A.rustedStone(512));
  });

  await step('casting bronze', () => {
    T.gold = tex('gold', () => A.goldTex(256));
    T.goldDark = tex('goldDark', () => A.goldTex(256, { base: 0x9a7524, hi: 0xe0c076, lo: 0x4a3208, seed: 9 }));
    T.bronze = tex('bronze', () => A.bronzeVerdigris(512));
    T.wood = tex('wood', () => A.woodTex(512));
    T.woodDark = tex('woodDark', () => A.woodTex(512, { light: 0x7a4d24, dark: 0x33190a, deep: 0x1b0d04, seed: 23, rings: 12 }));
  });

  await step('etching the faces', () => {
    T.pcb = tex('pcb', () => A.circuitBoard(1024, { density: 1.15, mask: '#4aa88c', maskDark: '#2f7a63', trace: '#7fd8b8', traceHi: '#b8f4dc', silk: '#eafff6' }));
    T.pcbDark = tex('pcbDark', () => A.circuitBoard(512, { mask: '#1c5a4a', maskDark: '#10382e', trace: '#3a8f76', density: 0.8, seed: 12 }));
    T.pcbHot = tex('pcbHot', () => A.circuitBoard(512, { trace: '#8ff0c8', traceHi: '#d8fff0', density: 1.4, seed: 44 }));
  });

  await step('winding the dials', () => {
    T.runicDial = tex('runicDial', () => A.runicDial(1024), { clamp: true });
    T.romanDial = tex('romanDial', () => A.romanDial(1024), { clamp: true });
    T.clockDial = tex('clockDial', () => A.romanDial(512, { rim: '#c9a24a', face: '#f6f0dc' }), { clamp: true });
    T.sunFace = tex('sunFace', () => A.sunFaceRelief(768), { clamp: true });
  });

  await step('painting the Venus', () => {
    T.venus = tex('venus', () => A.venusHead(512, 512), { clamp: true });
    T.beige = tex('beige', () => A.beigePlastic(256));
    T.beigeDark = tex('beigeDark', () => A.beigePlastic(256, 0xb5a888));
  });

  await step('growing the gardens', () => {
    T.palm = tex('palm', () => A.foliageSheet(512, 'palm'), { clamp: true });
    T.fan = tex('fan', () => A.foliageSheet(512, 'fan', { dark: '#1a4a20', mid: '#357f33', light: '#6fc055' }), { clamp: true });
    T.fern = tex('fern', () => A.foliageSheet(512, 'fern', { dark: '#173d19', mid: '#2f7a2c', light: '#63b04a' }), { clamp: true });
    T.ivy = tex('ivy', () => A.foliageSheet(256, 'ivy', { dark: '#0f3a17', mid: '#26662a', light: '#4f9a3c' }), { clamp: true });
  });

  await step('opening the sky', () => {
    T.skyViolet = tex('skyViolet', () => A.skyPanorama(2048, 1024, 'violet'), { clamp: true, aniso: false });
    T.skyBlue = tex('skyBlue', () => A.skyPanorama(2048, 1024, 'blue'), { clamp: true, aniso: false });
    T.skyDusk = tex('skyDusk', () => A.skyPanorama(2048, 1024, 'dusk'), { clamp: true, aniso: false });
    T.skyIndigo = tex('skyIndigo', () => A.skyPanorama(2048, 1024, 'indigo'), { clamp: true, aniso: false });
    T.nebula = tex('nebula', () => A.nebulaPanorama(2048, 1024), { clamp: true, aniso: false });
    T.cloud = tex('cloud', () => A.cloudPuff(256, { soft: 0.42 }), { clamp: true });
    T.cloudDark = tex('cloudDark', () => A.cloudPuff(256, { soft: 0.5, tint: [206, 194, 232], seed: 44 }), { clamp: true });
  });

  await step('hanging the Earth', () => {
    T.earth = tex('earth', () => A.earthMap(1024, 512), { clamp: false });
    T.earthClouds = tex('earthClouds', () => A.earthClouds(1024, 512), { clamp: false });
  });

  await step('sharpening the effects', () => {
    T.glow = tex('glow', () => A.glowSprite(128), { clamp: true });
    T.glowHot = tex('glowHot', () => A.glowSprite(128, { power: 3.4, core: 0.2 }), { clamp: true });
    T.star = tex('star', () => A.starSprite(128, 4), { clamp: true });
    T.star6 = tex('star6', () => A.starSprite(128, 6), { clamp: true });
    T.decal = tex('decal', () => A.decalSprite(128), { clamp: true });
    T.crack = tex('crack', () => A.crackSprite(256), { clamp: true });
    T.noise = tex('noise', () => A.noiseRGBA(128), { data: true, nearest: true, mips: false });
    T.phosphor = tex('phosphor', () => A.phosphorMask(256), { data: true, nearest: true, mips: false });
  });

  await step('growing the cortex', () => {
    T.cortexFlesh = tex('cortexFlesh', () => A.corticalTissue(1024, { seed: 71 }));
    T.cortexChill = tex('cortexChill', () => A.corticalTissue(1024, { seed: 88, chill: 0.85 }));
    T.suture = tex('suture', () => A.sutureStrip(256, 64), { clamp: false });
    T.accessPanel = tex('accessPanel', () => A.accessPanel(512), { clamp: true });
    T.ledReadout = tex('ledReadout', () => A.ledReadout(512, 256), { clamp: true, nearest: true });
    T.insulator = tex('insulator', () => A.insulatorSkin(256));
    T.speakerCone = tex('speakerCone', () => A.speakerCone(512), { clamp: true });
    T.knurl = tex('knurl', () => A.knurledChrome(256));
    T.ribbon = tex('ribbon', () => A.ribbonCable(512, 128));
  });

  await step('paving the atrium', () => {
    T.atriumFloor = tex('atriumFloor', () => A.atriumFloor(1024));
    T.brass = tex('brass', () => A.brushedBrass(256));
  });

  await step('casting the reliquary', () => {
    T.reliquaryBoard = tex('reliquaryBoard', () => A.reliquaryBoard(1024));
    T.mercury = tex('mercury', () => A.mercuryDish(512), { clamp: true });
    T.oilSlick = tex('oilSlick', () => A.oilSlick(512));
    T.volcanic = tex('volcanic', () => A.volcanicGround(1024));
    T.glyph1 = tex('glyph1', () => A.binaryGlyph(128, '1'), { clamp: true });
    T.glyph0 = tex('glyph0', () => A.binaryGlyph(128, '0'), { clamp: true });
  });

  await step('mixing the paints', () => buildMats());
  onProgress('ready');
}

const phong = (o) => new THREE.MeshPhongMaterial(o);

function rep(t, x, y) {
  const c = t.clone();
  c.wrapS = c.wrapT = THREE.RepeatWrapping;
  c.repeat.set(x, y);
  c.needsUpdate = true;
  return c;
}
export { rep };

function buildMats() {
  // ---- stone -------------------------------------------------------
  M.marbleWhite = phong({ map: T.marbleWhite, specular: 0x6f6c66, shininess: 44, color: 0xffffff });
  M.marbleGrey = phong({ map: T.marbleGrey, specular: 0x5f5c58, shininess: 38 });
  M.marbleRose = phong({ map: T.marbleRose, specular: 0x6a4c40, shininess: 34 });
  M.marbleCream = phong({ map: T.marbleCream, specular: 0x7a7060, shininess: 30 });
  M.marbleBlack = phong({ map: T.marbleBlack, specular: 0x8f8ca0, shininess: 82 });
  M.stucco = phong({ map: T.stucco, specular: 0x1a1a18, shininess: 6 });
  M.rustStone = phong({ map: T.rustStone, specular: 0x4a3830, shininess: 18 });

  // Floors are the star of every reference plate: polished, and shiny enough
  // that the specular lobe reads as a wet reflection.
  M.checkerColonnade = phong({ map: rep(T.checkerColonnade, 1, 1), specular: 0xb0aca4, shininess: 120, reflectivity: 0.4 });
  M.checkerPlaza = phong({ map: rep(T.checkerPlaza, 1, 1), specular: 0x9a968e, shininess: 96 });
  M.checkerNexus = phong({ map: rep(T.checkerNexus, 1, 1), specular: 0xc0b8ac, shininess: 130 });
  M.checkerVoid = phong({ map: rep(T.checkerVoid, 1, 1), specular: 0xa8a4b8, shininess: 140 });
  M.carpet = phong({ map: rep(T.carpet, 1, 1), specular: 0x120c14, shininess: 4 });

  // ---- columns -----------------------------------------------------
  M.fluted = phong({ map: T.fluted, specular: 0x8a857c, shininess: 52 });
  M.flutedRose = phong({ map: T.flutedRose, specular: 0x6e5044, shininess: 40 });

  // ---- metal -------------------------------------------------------
  M.gold = phong({ map: T.gold, specular: 0xfff0c0, shininess: 190, color: 0xffffff, emissive: 0x3a2a05 });
  M.goldDark = phong({ map: T.goldDark, specular: 0xe8cc90, shininess: 150 });
  M.bronze = phong({ map: T.bronze, specular: 0x9aa878, shininess: 62 });
  M.brass = phong({ color: 0xc8a24a, specular: 0xfff0bc, shininess: 170 });
  M.steel = phong({ color: 0x9aa0a8, specular: 0xffffff, shininess: 210 });
  M.gunmetal = phong({ color: 0x3c4048, specular: 0xb0bcc8, shininess: 130 });
  M.darkMetal = phong({ color: 0x22242a, specular: 0x8890a0, shininess: 90 });

  // ---- wood / cloth ------------------------------------------------
  M.wood = phong({ map: T.wood, specular: 0x6a5232, shininess: 58 });
  M.woodDark = phong({ map: T.woodDark, specular: 0x5a4020, shininess: 46 });

  // ---- the faces ---------------------------------------------------
  M.pcb = phong({ map: T.pcb, specular: 0xd8fff0, shininess: 110, color: 0xffffff, emissive: 0x1d4a3c });
  M.pcbDark = phong({ map: T.pcbDark, specular: 0x6fd0b0, shininess: 70, emissive: 0x123028 });
  M.pcbHot = phong({ map: T.pcbHot, specular: 0xd8fff0, shininess: 140, emissive: 0x1d5a44 });

  // ---- glass / energy ----------------------------------------------
  M.glass = phong({ color: 0xcfe6f0, specular: 0xffffff, shininess: 240, transparent: true, opacity: 0.24,
    side: THREE.DoubleSide, depthWrite: false });
  M.crystal = phong({ color: 0x9fd8ff, specular: 0xffffff, shininess: 260, transparent: true, opacity: 0.55,
    emissive: 0x0a3348 });

  // ---- vegetation --------------------------------------------------
  const foliage = (map) => new THREE.MeshPhongMaterial({
    map, transparent: true, alphaTest: 0.30, side: THREE.DoubleSide,
    specular: 0x2a3a22, shininess: 22, color: 0xffffff });
  M.palm = foliage(T.palm);
  M.fan = foliage(T.fan);
  M.fern = foliage(T.fern);
  M.ivy = foliage(T.ivy);
  M.bark = phong({ color: 0x6b5a42, specular: 0x2a2318, shininess: 10 });
  M.soil = phong({ color: 0x3a2c20, specular: 0x100c08, shininess: 4 });

  // ---- the terminal ------------------------------------------------
  M.beige = phong({ map: T.beige, specular: 0x4a4438, shininess: 26 });
  M.beigeFlat = phong({ color: 0xcbbf9f, specular: 0x3a3428, shininess: 20 });
  M.plasticDark = phong({ color: 0x2a2824, specular: 0x585044, shininess: 40 });

  // ---- dials -------------------------------------------------------
  M.runicDial = phong({ map: T.runicDial, specular: 0x666056, shininess: 40 });
  M.romanDial = phong({ map: T.romanDial, specular: 0x666056, shininess: 40 });
  M.clockDial = phong({ map: T.clockDial, specular: 0x666056, shininess: 40 });
  M.sunFace = phong({ map: T.sunFace, specular: 0x9aa878, shininess: 58 });
  M.moon = phong({ color: 0x585c68, specular: 0x9098a8, shininess: 18 });

  // ---- earth -------------------------------------------------------
  M.earth = phong({ map: T.earth, specular: 0x2a4a7a, shininess: 26, color: 0xffffff });
  M.earthClouds = phong({ map: T.earthClouds, transparent: true, opacity: 0.85, depthWrite: false,
    specular: 0x333333, shininess: 8 });

  // ---- water -------------------------------------------------------
  M.sea = phong({ color: 0x6472bd, specular: 0xd8e0ff, shininess: 200, transparent: true, opacity: 0.92 });

  /* ---------------- the wired brain ---------------- */
  // Tissue is wet: a broad, bright specular lobe over a soft diffuse is what
  // separates "meat" from "painted rock".
  M.cortexFlesh = phong({ map: T.cortexFlesh, specular: 0xffd8cc, shininess: 26, color: 0xffffff });
  M.cortexChill = phong({ map: T.cortexChill, specular: 0xcfe0ff, shininess: 34, color: 0xffffff });
  M.suture = new THREE.MeshPhongMaterial({
    map: T.suture, specular: 0xffffff, shininess: 190, transparent: true,
    alphaTest: 0.02, side: THREE.DoubleSide });
  M.accessPanel = phong({ map: T.accessPanel, specular: 0xffffff, shininess: 150, emissive: 0x181008 });
  M.ledReadout = new THREE.MeshBasicMaterial({ map: T.ledReadout, toneMapped: false });
  M.insulator = phong({ map: T.insulator, specular: 0xffffff, shininess: 200, color: 0xffffff });
  M.speakerCone = phong({ map: T.speakerCone, specular: 0x40444c, shininess: 14 });
  M.knurl = phong({ map: T.knurl, specular: 0xffffff, shininess: 220, color: 0xdfe4ea });
  M.ribbon = phong({ map: T.ribbon, specular: 0xffffff, shininess: 90, side: THREE.DoubleSide,
    emissive: 0x101014 });
  M.copperPort = phong({ color: 0xc07a44, specular: 0xffe0b0, shininess: 170, emissive: 0x1a0c04 });
  M.tubeGlass = phong({ color: 0xd8e8f0, specular: 0xffffff, shininess: 250,
    transparent: true, opacity: 0.30, side: THREE.DoubleSide, depthWrite: false });
  M.tubeFilament = new THREE.MeshBasicMaterial({ color: 0xff9c2a, toneMapped: false });

  /* ---------------- the atrium ---------------- */
  M.atriumFloor = phong({ map: T.atriumFloor, specular: 0xc8ccc4, shininess: 150,
    color: 0xffffff, emissive: 0x04120c });
  M.brassBrushed = phong({ map: T.brass, specular: 0xfff0bc, shininess: 190, color: 0xffffff });

  /* ---------------- the reliquary ---------------- */
  M.reliquaryBoard = phong({ map: T.reliquaryBoard, specular: 0x2a4a38, shininess: 80,
    color: 0xffffff, emissive: 0x0a1410 });
  M.mercury = phong({ map: T.mercury, specular: 0xffffff, shininess: 300, color: 0xc8ccd4,
    transparent: true, emissive: 0x0a0c10 });
  M.oilSlick = phong({ map: T.oilSlick, specular: 0xffffff, shininess: 260, color: 0xffffff,
    emissive: 0x0c0a14 });
  M.volcanic = phong({ map: T.volcanic, specular: 0x1a1610, shininess: 6 });

  // ---- generic -----------------------------------------------------
  M.white = phong({ color: 0xf2efe8, specular: 0x807a70, shininess: 40 });
  M.black = phong({ color: 0x14121a, specular: 0x585568, shininess: 60 });
}

export function disposeMaterials() {
  for (const t of cache.values()) t.dispose();
  cache.clear();
  for (const k of Object.keys(M)) { M[k]?.dispose?.(); delete M[k]; }
  for (const k of Object.keys(T)) delete T[k];
}
