/* SILICONE DREAMS — Game
 *
 * The spine. Owns the renderer, the world, the player, the director, and the
 * frame loop that decides — every tick — which systems run on wall time and
 * which run on the world's own, dilated clock.
 */
import * as THREE from 'three';
import { cfg, onCfgChange } from './core/Config.js';
import { time, clamp, rand } from './core/Time.js';
import { input } from './core/Input.js';
import { audio } from './core/Audio.js';
import { buildMaterials, setRenderer, M, T } from './world/Materials.js';
import { World, box, cyl, sphere, Trigger, LAYER, raycast } from './world/Physics.js';
import { Environment } from './render/Sky.js';
import { PostFX } from './render/PostFX.js';
import { Player } from './game/Player.js';
import { WeaponSystem } from './game/Weapons.js';
import { Chrono, Manipulator } from './game/Chrono.js';
import { FX } from './game/Particles.js';
import { Wraith, Sentinel, Herald, Orb } from './game/Enemies.js';
import { Director } from './game/Director.js';
import { Inventory, Examiner, Journal } from './game/Inventory.js';
import { RELIC_COUNT, RELIC_BY_ID, relicModel, RELICS } from './game/Relics.js';
import { Reliquary } from './world/Reliquary.js';
import { ChronoBarrier } from './game/Pickups.js';
import { buildLevel1, ZONE } from './world/Level1.js';
import { Hub, HUB, BAYS } from './world/Hub.js';
import { buildCortex, CORTEX } from './world/Cortex.js';
import { buildAltar, ALTAR } from './world/Altar.js';
import { HUD } from './ui/HUD.js';
import { Menu } from './ui/Menu.js';
import { Console } from './ui/Console.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.time = time;
    this.marks = {};
    this.enemies = [];
    this.orbs = [];
    this.triggers = [];
    this.barriers = [];
    this.threatLevel = 0;
    this.worldRelics = [];
    this.cullables = [];
    this.currentZone = 'temple';
    this.paused = false;
    this.started = false;
    this.usePromptActive = null;
    this.difficulty = cfg.difficulty;
    this.audio = audio;

    /* ---- renderer ---- */
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, powerPreference: 'high-performance', stencil: false,
    });
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = !!cfg.r_shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // the composer issues several passes per frame; reset once, ourselves, so
    // the stats read as "this frame" rather than "the last fullscreen quad"
    this.renderer.info.autoReset = false;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(cfg.r_fov, 16 / 9, 0.08, 2600);
    this.scene.add(this.camera);

    this.world = new World(6);
    this.level = null;
  }

  /* ================================================== BOOT SEQUENCE */

  async boot(onProgress) {
    setRenderer(this.renderer);
    await buildMaterials(onProgress);

    onProgress('assembling the temple');
    await frame();

    this.fx = new FX(this.scene);
    this.env = new Environment(this.scene, this.renderer);
    this.postfx = new PostFX(this.renderer, this.scene, this.camera);

    this.player = new Player(this.world, this.camera);
    this.weapons = new WeaponSystem(this);
    this.chrono = new Chrono(this);
    this.manipulator = new Manipulator(this);

    // the viewmodel renders in its own pass with a cleared depth buffer,
    // which is how it stays out of the walls
    this.postfx.addViewPass(this.weapons.scene, this.weapons.camera);

    onProgress('raising the colonnade');
    await frame();
    this.level = buildLevel1(this);

    onProgress('grafting the cortex');
    await frame();
    this.cortex = buildCortex(this);

    onProgress('raising the altar');
    await frame();
    this.altar = buildAltar(this);

    onProgress('opening the atrium');
    await frame();
    this.hub = new Hub(this);
    this.placeRelics();

    // home is the atrium, in front of the violet gate
    const a0 = -Math.PI / 2;
    const r0 = 44 * Math.cos(Math.PI / 8) - 10;
    this.hubSpawn = new THREE.Vector3(HUB.x + Math.cos(a0) * r0, HUB.y + 0.4, HUB.z + Math.sin(a0) * r0);
    this.hubSpawnYaw = Math.PI;

    onProgress('winding the clocks');
    await frame();

    this.hud = new HUD(this);
    this.menu = new Menu(this);
    this.console = new Console(this);
    this.inventory = new Inventory(this);
    this.journal = new Journal(this);
    this.examiner = new Examiner(this);
    this.director = new Director(this);
    this.inventory.onChange = () =>
      this.hud.setCollected(this.inventory.relicCount, RELIC_COUNT, this.inventory.silicone);
    this.inventory.onChange();

    this.player.onDeath = () => this.onPlayerDeath();
    this.player.onDamage = (amt) => {
      this.postfx.flashDamage(clamp(amt / 45, 0.12, 0.8));
      this.hud.hitMarker(false);
    };

    onCfgChange((k) => this.onConfigChanged(k));
    addEventListener('resize', () => this.resize());
    this.resize();

    input.attach(this.canvas);
    // Only pause when lock is genuinely *lost*. A failed request (headless,
    // or a browser that refuses the grant) must not drop us into the menu.
    this._hadLock = false;
    input.onLockChange((locked) => {
      if (locked) { this._hadLock = true; return; }
      const lost = this._hadLock;
      this._hadLock = false;
      if (lost && this.started && !this.menu.isOpen && !this.console.open) this.setPaused(true);
    });
    this.canvas.addEventListener('mousedown', () => {
      if (this.started && !this.menu.isOpen && !this.console.open && !input.locked) {
        audio.resume();
        input.requestLock();
      }
    });

    onProgress('ready');
    return this;
  }

  /* ================================================== LIFE CYCLE */

  /** Entering play is the same three steps however we got here. */
  _enterPlay() {
    audio.resume();
    this.menu.hide();
    this.hud.show(true);
    this.setPaused(false);
    input.requestLock();
  }

  startNewGame() {
    this.reset();
    this.started = true;
    this.director.advance(0);
    this._enterPlay();
  }

  startFromSave(save) {
    this.reset();
    this.started = true;
    if (!this.director.loadCheckpoint(save)) this.director.advance(0);
    this._enterPlay();
  }

  restartChapter() {
    this.reset();
    this.started = true;
    this.director.advance(0);
    this._enterPlay();
  }

  toTitle() {
    this.started = false;
    this.setPaused(true);
    this.menu.refreshContinue();
  }

  reset() {
    this.clearCombat();
    for (const p of this.director?.pickups || []) p.destroy();
    if (this.director) {
      this.director.pickups.length = 0;
      this.director.interactables.length = 0;
      this.director.pendingWaves.length = 0;
      this.director.flags = {};
      this.director.counters = {};
      this.director.stage = -1;
      this.director.screenMode = 'boot';
      this.director.screenT = 0;
    }
    for (const b of this.barriers) b.setOpen(false);
    for (const t of this.triggers) { t.fired = false; t.inside = false; }
    if (this.marks.chronoliths) {
      for (const l of this.marks.chronoliths) {
        l.alive = true;
        l.health = 160;
        l.obj.visible = true;
      }
    }
    this.marks.clockRunning = false;
    this.marks.bossActive = false;
    if (this.marks.choirMesh) this.marks.choirMesh.visible = true;
    time.reset();
    time.hour = 11; time.minute = 47; time.hourRate = 0;
    const home = this.hubSpawn || this.spawnPoint;
    this.player.respawn(home.x, home.y, home.z, this.hubSpawnYaw ?? Math.PI);
    this.player.armour = 0;
    this.travelPending = null;
    this.lastGate = null;
    this.inventory?.deserialize({ items: [], relics: [], silicone: 0 });
    this.journal && (this.journal.lore = [], this.journal.objectives = [], this.journal.unread = 0);
    this.hub?.syncVitrines(this.inventory);
    this.weapons.owned = { gnomon: false, pistol: false, repeater: false, manipulator: false };
    this.weapons.ammo = { quartz: 0, static: 0 };
    this.weapons.mags = { pistol: 0, repeater: 0 };
    this.weapons.model.visible = false;
    this.weapons.current = 'gnomon';
    this.weapons.model.visible = true;
    this.weapons.owned.gnomon = true;
    this.chrono.energy = this.chrono.max;
    this.chrono.unlocked = { dilate: false, rewind: false, stasis: false };
    this.chrono.history.length = 0;
    this.fx.clear();
    this.postfx.fadeTo(0, 3);
    this.hud?.setBoss(null);
  }

  clearCombat() {
    for (const e of this.enemies) e.destroy?.();
    this.enemies.length = 0;
    for (const o of this.orbs) o.destroy();
    this.orbs.length = 0;
    for (const f of this.chrono?.stasisFields || []) {
      this.scene.remove(f.mesh); f.mesh.geometry.dispose(); f.mat.dispose();
    }
    if (this.chrono) this.chrono.stasisFields.length = 0;
    this.manipulator?.drop();
  }

  setPaused(v) {
    this.paused = v;
    time.paused = v;
    if (v) {
      audio.suspend();
      if (this.started && !this.menu.isOpen) this.menu.show('pause');
    } else {
      audio.resume();
      this.menu.hide();
      this.hud.show(true);
    }
  }

  onPlayerDeath() {
    this.chrono.stopDilate();
    setTimeout(() => {
      if (!this.player.alive) {
        this.menu.show('dead');
        this.hud.show(false);
      }
    }, 2200);
  }

  respawnFromCheckpoint() {
    if (!this.director.loadCheckpoint()) this.restartChapter();
    this.setPaused(false);
    input.requestLock();
    this.postfx.fadeTo(0, 2);
  }

  onChapterComplete() {
    this.menu.show('end');
    this.hud.show(false);
    input.exitLock();
  }

  onConfigChanged(key) {
    this.renderer.shadowMap.enabled = !!cfg.r_shadows;
    this.camera.fov = cfg.r_fov;
    this.camera.updateProjectionMatrix();
    document.documentElement.style.setProperty('--hud-scale', cfg.hud_scale);
    if (key === 'r_scale' || key === '*') this.resize();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.postfx.resize(w, h);
    this.weapons.resize(w / h);
  }

  /* ================================================ WORLD HELPERS */

  /* ================================================ TRAVEL */

  /** Where a gate deposits you, and where you come back to. */
  static DEST = {
    temple:    { pos: [1.5, 0.4, 20],      yaw: Math.PI,      env: 'temple' },
    mirror:    { pos: [0, 1.4, -118],      yaw: Math.PI,      env: 'mirror' },
    colonnade: { pos: [0, 0.4, -292],      yaw: Math.PI,      env: 'colonnade' },
    nexus:     { pos: [0, 0.4, -492],      yaw: Math.PI,      env: 'nexus' },
    cortex:    { pos: [0, 21.5, 1032],     yaw: Math.PI,      env: 'cortex' },
    altar:     { pos: [0, 1.0, 1404],      yaw: Math.PI,      env: 'altar' },
  };

  travelTo(key) {
    const d = Game.DEST[key];
    if (!d) return false;
    this.postfx.fadeTo(1, 3, 0x000000);
    this.travelPending = { key, t: 0.42 };
    audio.play('door', this.player.pos, { vol: 1, ref: 14 });
    return true;
  }

  /** Back to the atrium, in front of the gate you came out of. */
  returnToHub(fromKey) {
    this.postfx.fadeTo(1, 3, 0x000000);
    this.travelPending = { key: '__hub', from: fromKey, t: 0.42 };
    return true;
  }

  _completeTravel() {
    const t = this.travelPending;
    this.travelPending = null;
    if (t.key === '__hub') {
      const i = BAYS.findIndex((b) => b.key === t.from);
      const a = (Math.max(0, i) / 8) * Math.PI * 2 - Math.PI / 2;
      const r = 44 * Math.cos(Math.PI / 8) - 7;
      this.player.teleport(HUB.x + Math.cos(a) * r, HUB.y + 0.4, HUB.z + Math.sin(a) * r,
        Math.atan2(-Math.cos(a), -Math.sin(a)) + Math.PI / 2);
      this.lastGate = null;
    } else {
      const d = Game.DEST[t.key];
      this.player.teleport(d.pos[0], d.pos[1], d.pos[2], d.yaw);
      this.lastGate = t.key;
    }
    this.player.vel.set(0, 0, 0);
    this.clearCombat();
    this.postfx.fadeTo(0, 1.6);
  }

  /**
   * Section visibility. The sections sit on their own islands of space
   * hundreds of metres apart, and things like the Cortex's corona shell are
   * big enough to be seen from the next section along. Switch whole roots off
   * by distance — it is both the fix for that and most of the frame budget.
   */
  updateSectionVisibility(pos) {
    const far = 260;
    const set = (root, z) => { if (root) root.visible = Math.abs(pos.z - z) < far; };
    set(this.hub?.root, HUB.z);
    set(this.cortex?.root, CORTEX.z);
    set(this.altar?.root, ALTAR.z);
    // the vitrines live on the scene root, so travel with the hub's flag
    if (this.hub) {
      const on = this.hub.root.visible;
      for (const rel of this.hub.vitrines.values()) rel.root.visible = on;
    }
    // Point lights parented to the scene root are never culled by the zone
    // groups, and three counts every visible light against every Phong
    // fragment. Eighty-five of them across six sections is the single
    // largest cost in the frame, so cull them by distance explicitly.
    for (const c of this.cullables) {
      const vis = Math.abs(pos.z - c.z) < c.range && Math.abs(pos.x - c.x) < c.range;
      if (c.obj.visible !== vis) c.obj.visible = vis;
    }
  }

  /** Register a scene-root object to be switched off when far away. */
  registerCullable(obj, x, z, range = 90) {
    this.cullables.push({ obj, x, z, range });
    return obj;
  }

  addCollider(kind, o) {
    const c = kind === 'box' ? box(o.x, o.y, o.z, o.hw, o.hh, o.hd, o)
      : kind === 'cyl' ? cyl(o.x, o.y, o.z, o.r, o.h, o)
      : sphere(o.x, o.y, o.z, o.r, o);
    return this.world.add(c);
  }

  addTrigger(o) {
    const t = new Trigger(o);
    this.triggers.push(t);
    return t;
  }

  addBarrier(o) {
    const b = new ChronoBarrier(this, o);
    this.barriers.push(b);
    return b;
  }

  setUsePrompt(label, obj) {
    this.usePromptActive = { label, obj };
  }

  notifyNoise(pos, radius) {
    for (const e of this.enemies) {
      if (!e.alive || e.state === 'chase' || e.state === 'attack') continue;
      if (e.position.distanceTo(pos) < radius) e.awareness = Math.min(1, e.awareness + 0.55);
    }
  }

  alertNearby(pos, radius) {
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.position.distanceTo(pos) < radius) { e.wake(); e.awareness = 1; }
    }
  }

  /** Where each relic waits. Roughly one per section, plus rewards. */
  placeRelics() {
    const P = [
      // --- the temple
      ['venus',  2.0, 1.2, -9.0],
      ['gnomon', -12.0, 1.2, 6.0],
      // --- the mirror
      ['shard',   -22, 2.2, -150],
      ['ampoule',  24, 2.2, -186],
      // --- the colonnade
      ['bob',      -5, 1.2, -382],
      ['sand',      5, 1.2, -330],
      // --- the nexus
      ['hand',    -11, 1.0, -512],
      ['key',       9, 1.0, -529],
      // --- the cortex
      ['triode',  CORTEX.x + 2,  CORTEX.y + 21, CORTEX.z + 40],
      ['staple',  CORTEX.x - 12, CORTEX.y + 21, CORTEX.z + 18],
      ['ribbon',  CORTEX.x + 22, CORTEX.y + 33, CORTEX.z - 42],
      ['coil',    CORTEX.x + 30, CORTEX.y + 33, CORTEX.z - 50],
      ['access',  CORTEX.x + 18, CORTEX.y + 33, CORTEX.z - 48],
      ['timer',   CORTEX.x + 14, CORTEX.y + 21, CORTEX.z - 8],
      ['speaker', CORTEX.x - 36, CORTEX.y + 21, CORTEX.z + 26],
      // --- the altar
      ['dreamer', ALTAR.x, ALTAR.y + 2.6, ALTAR.z + 14],
    ];
    for (const [id, x, y, z] of P) this.spawnRelic(id, x, y, z);
  }

  /* ================================================ RELIC PICKUPS */

  /**
   * Place a relic in the world. It appears exactly as it will appear in the
   * Vitrine Hall — same monolith, same mercury, same rising binary — so the
   * player reads "this is a keepable thing" before they are close enough to
   * see what it is.
   */
  spawnRelic(id, x, y, z, opt = {}) {
    const def = RELIC_BY_ID[id];
    if (!def) return null;
    const model = relicModel(id);
    const bb = new THREE.Box3().setFromObject(model);
    const size = bb.getSize(new THREE.Vector3());
    const longest = Math.max(size.x, size.y, size.z) || 1;
    model.scale.multiplyScalar(0.7 / longest);

    const rel = new Reliquary(this.scene, {
      pos: new THREE.Vector3(x, y, z),
      w: opt.w ?? 1.4, h: opt.h ?? 1.25, hover: 1.05,
      glow: opt.glow ?? 0x3fe89a, payload: model, detail: 0.8,
      lights: 'minimal',
    });
    rel.setLabel(def.name);
    const rec = { id, rel, pos: new THREE.Vector3(x, y, z), taken: false, def };
    this.worldRelics.push(rec);
    this.registerCullable(rel.root, x, z, 70);
    this.addCollider('cyl', { x, y, z, r: 0.95, h: opt.h ?? 1.25, surface: 'metal' });
    return rec;
  }

  updateRelicPickups(realDt) {
    const p = this.player;
    for (const r of this.worldRelics) {
      if (r.rel.root.visible) r.rel.update(realDt, this.camera, realDt);
      if (r.taken) continue;
      if (p.pos.distanceTo(r.pos) < 2.6) {
        this.setUsePrompt(`TAKE ${r.def.name.toUpperCase()}`, {
          trigger: () => {
            if (r.taken) return;
            r.taken = true;
            this.inventory.collectRelic(r.id);
            this.fx.shockRing(r.pos, { colour: [0.4, 0.95, 0.7], size: 0.5, size1: 5, life: 0.7 });
            this.fx.chronoMotes(r.pos, { count: 18, colour: [0.4, 0.95, 0.7] });
            r.rel.setPayload(null);
            this.examiner.open(r.id, r.def);
          },
        });
      }
    }
  }

  /* ================================================ SPAWNING */

  spawnWraith(pos, opt = {}) {
    const e = new Wraith(this, Object.assign({ pos }, opt));
    if (opt.alerted) { e.state = 'alert'; e.awareness = 1; }
    if (opt.dormant) e.state = 'dormant';
    this.enemies.push(e);
    return e;
  }
  spawnSentinel(pos, opt = {}) {
    const e = new Sentinel(this, Object.assign({ pos }, opt));
    if (opt.alerted) { e.state = 'alert'; e.awareness = 1; }
    this.enemies.push(e);
    return e;
  }
  spawnHerald(pos, opt = {}) {
    const e = new Herald(this, Object.assign({ pos }, opt));
    e.wake();
    this.enemies.push(e);
    return e;
  }
  spawnOrb(from, dir, opt = {}) {
    const o = new Orb(this, from, dir, opt);
    this.orbs.push(o);
    return o;
  }

  /* ================================================ COMBAT QUERIES */

  /** Ray against every live enemy, returning the nearest. */
  traceEnemies(origin, dir, maxDist) {
    let best = null, bestT = maxDist;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      _v.copy(e.position).sub(origin);
      const proj = _v.dot(dir);
      if (proj < 0 || proj > bestT + e.radius) continue;
      const d2 = _v.lengthSq() - proj * proj;
      const r = e.radius;
      if (d2 > r * r) continue;
      const t = proj - Math.sqrt(Math.max(0, r * r - d2));
      if (t < 0 || t > bestT) continue;
      bestT = t;
      const point = origin.clone().addScaledVector(dir, t);
      // the eye sockets are the weak point on every one of these things
      const local = point.clone().sub(e.position);
      const crit = local.y > r * 0.02 && local.y < r * 0.55 && Math.abs(local.x) > r * 0.12;
      best = { enemy: e, t, point, head: crit };
    }
    // and the chronoliths, which are shootable objectives
    for (const l of this.marks.chronoliths || []) {
      if (!l.alive) continue;
      _v.copy(l.obj.position).sub(origin);
      const proj = _v.dot(dir);
      if (proj < 0 || proj > bestT) continue;
      const d2 = _v.lengthSq() - proj * proj;
      if (d2 > l.radius * l.radius) continue;
      const t = proj - Math.sqrt(Math.max(0, l.radius * l.radius - d2));
      if (t < 0 || t > bestT) continue;
      bestT = t;
      best = { lith: l, t, point: origin.clone().addScaledVector(dir, t), head: false };
    }
    return best;
  }

  enemiesInCone(origin, dir, range, arc) {
    const out = [];
    for (const e of this.enemies) {
      if (!e.alive) continue;
      _v.copy(e.position).sub(origin);
      const d = _v.length();
      if (d > range + e.radius) continue;
      if (d > 0.001 && _v.divideScalar(d).dot(dir) < 1 - arc) continue;
      out.push(e);
    }
    // melee also breaks chronoliths
    for (const l of this.marks.chronoliths || []) {
      if (!l.alive) continue;
      if (l.obj.position.distanceTo(origin) < range + l.radius) out.push(l);
    }
    return out;
  }

  damageEnemy(target, amount, point, dir, weapon, crit) {
    if (!target) return;
    if (target.lith || target.health !== undefined && target.obj) {
      this.damageLith(target.lith || target, amount, point);
      return;
    }
    if (target.damage) target.damage(amount, point, dir, weapon, crit);
  }

  damageLith(l, amount, point) {
    if (!l || !l.alive) return;
    l.health -= amount;
    this.fx.impact(point || l.obj.position, new THREE.Vector3(0, 1, 0), { surface: 'metal', sparks: 8, colour: [0.6, 0.95, 1] });
    this.hitMarker(false);
    l.obj.userData.core.material.emissiveIntensity = 1.2;
    if (l.health <= 0) {
      l.alive = false;
      l.obj.visible = false;
      this.fx.explosion(l.obj.position, { colour: [0.6, 0.95, 1], scale: 1.4 });
      this.fx.shatterMask(l.obj.position, { colour: [0.5, 0.9, 1], count: 22, size: 1.3 });
      this.fx.shockRing(l.obj.position, { colour: [0.6, 0.95, 1], size: 1, size1: 16, life: 0.9 });
      this.postfx.kick(0.6, 2.4);
      audio.play('shatter', l.obj.position, { vol: 1, ref: 20 });
      audio.sfx_bell(0.7, 0, 0, { freq: 300 });
      this.director?.onChronolithDestroyed();
      this.hud?.notify('CHRONOLITH DESTROYED');
    }
  }

  hitMarker(crit) { this.hud?.hitMarker(crit); }

  onEnemyKilled(e) {
    this.director?.onEnemyKilled(e);
  }

  /* ==================================================== THE LOOP */

  frame(tMs) {
    const dtWorld = time.tick(tMs);
    const dtReal = time.realDt;
    this.renderer.info.reset();

    if (this.paused || !this.started) {
      this.renderIdle(dtReal);
      input.endFrame();
      return;
    }

    // --- console / pause keys (real time, always)
    if (input.pressed.has('Backquote')) this.console.toggle();
    if (input.hit('pause')) {
      if (this.console.open) this.console.toggle(false);
      else this.setPaused(true);
    }

    const p = this.player;

    /* ---- journal + examination, before anything reads the mouse -- */
    if (input.hit('journal')) this.journal.toggle();
    if (this.journal.open) {
      // the world keeps running behind the book, but nothing takes input
      this.renderPaused(dtReal);
      input.endFrame();
      return;
    }
    if (this.examiner.active) {
      this.examiner.update(dtReal);
      this.renderPaused(dtReal);
      input.endFrame();
      return;
    }

    /* ---- player + weapons on wall time -------------------------- */
    p.update(dtReal);
    this.chrono.update(dtReal);
    this.weapons.update(dtWorld, dtReal);
    this.manipulator.update(dtReal);

    /* ---- use prompt ---------------------------------------------- */
    this.usePromptActive = null;
    // director's interactables set it during their update
    this.director.update(dtWorld, dtReal);
    this.updateRelicPickups(dtReal);
    if (this.usePromptActive) {
      this.hud.setUsePrompt(this.usePromptActive.label, 'E');
      if (input.hit('use')) {
        const o = this.usePromptActive.obj;
        if (o.trigger) o.trigger();
        else if (o.take) o.take();
        audio.sfx_ui_confirm(1);
      }
    } else this.hud.setUsePrompt(null);

    /* ---- world on dilated time ----------------------------------- */
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.update(dtWorld, p);
      if (e.removeMe) this.enemies.splice(i, 1);
    }
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      o.update(dtWorld, p);
      if (!o.alive) this.orbs.splice(i, 1);
    }
    for (const b of this.world.props) b.step(this.world, dtWorld);
    for (const b of this.barriers) b.update(dtReal);
    for (const t of this.triggers) t.test(p.pos, dtReal);

    this.threatLevel = this.enemies.reduce((n, e) => n + (e.alive && e.isThreat ? 1 : 0), 0);

    /* ---- the atrium's gates ------------------------------------- */
    if (this.travelPending) {
      this.travelPending.t -= dtReal;
      if (this.travelPending.t <= 0) this._completeTravel();
    } else if (this.hub) {
      this.hub.refreshGates(this.inventory);
      const key = this.hub.gateAt(p.pos);
      if (key) this.travelTo(key);
    }

    /* ---- environment --------------------------------------------- */
    const zone = this.level.zoneAt(p.pos);
    if (zone !== this.currentZone) {
      this.currentZone = zone;
      this.env.apply(zone);
      if (!this.marks.bossActive && this.threatLevel === 0) audio.setMood(zone);
      if (this.reflector) this.reflector.visible = zone === 'mirror';
      if (this.sea) this.sea.setVisible(zone === 'temple');
      if (this.clouds) this.clouds.setVisible(zone === 'temple' || zone === 'mirror');
      if (this.stars) this.stars.visible = zone === 'colonnade' || zone === 'nexus';
    }
    this.updateSectionVisibility(p.pos);
    this.env.update(dtReal, this.camera, time.dilationAmount);
    this.sea?.update(dtWorld, this.camera);
    this.clouds?.update(dtWorld, this.camera);
    if (this.stars) this.stars.userData.mat.uniforms.uTime.value += dtReal;
    this.level.update(dtWorld, time.now, this);
    this.hub?.update(dtReal, this);
    this.cortex?.update(dtWorld, time.now, this);
    this.altar?.update(dtWorld, time.now, this);

    /* ---- fx + audio + hud ---------------------------------------- */
    this.fx.update(dtWorld, dtReal);
    this.updateListener();
    audio.update(time.dilationAmount, dtReal);
    this.postfx.update(dtReal, time.dilationAmount);
    this.hud.update(dtReal);

    this.postfx.render();
    input.endFrame();
  }

  /** Journal / examination: the world is shown but nothing is stepped. */
  renderPaused(dtReal) {
    this.renderer.info.reset();
    this.env.update(dtReal, this.camera, time.dilationAmount);
    this.sea?.update(dtReal * 0.15, this.camera);
    this.clouds?.update(dtReal * 0.15, this.camera);
    this.level?.update(dtReal * 0.15, time.now, this);
    this.hub?.update(dtReal, this);
    this.cortex?.update(dtReal * 0.15, time.now, this);
    this.altar?.update(dtReal * 0.15, time.now, this);
    this.fx.update(0, dtReal);
    this.postfx.update(dtReal, time.dilationAmount);
    this.hud.update(dtReal);
    this.postfx.render();
  }

  /** Title screen / paused: keep the world alive but do not simulate it. */
  renderIdle(dtReal) {
    this.renderer.info.reset();
    if (!this.started) {
      // slow orbit above the temple, as a menu backdrop
      this._menuT = (this._menuT || 0) + dtReal * 0.06;
      const r = 34, a = this._menuT;
      this.camera.position.set(Math.cos(a) * r, 13 + Math.sin(a * 0.7) * 3, ZONE.A.z - 5 + Math.sin(a) * r);
      this.camera.lookAt(ZONE.A.x, 5.5, ZONE.A.z - 5);
      this.camera.rotation.z = Math.sin(a * 0.5) * 0.02;
      this.currentZone = 'temple';
      this.env.apply('temple');
      this.weapons.setVisible(false);
    } else {
      this.weapons.setVisible(true);
    }
    this.env.update(dtReal, this.camera, 0);
    this.sea?.update(dtReal, this.camera);
    this.clouds?.update(dtReal, this.camera);
    this.level?.update(dtReal, performance.now() * 0.001, this);
    this.fx.update(0, dtReal);
    this.postfx.update(dtReal, 0);
    this.postfx.render();
  }

  updateListener() {
    const l = audio.listener;
    const p = this.player.eyePosition;
    l.pos.x = p.x; l.pos.y = p.y; l.pos.z = p.z;
    const f = this.player.forward, r = this.player.right;
    l.fwd.x = f.x; l.fwd.y = f.y; l.fwd.z = f.z;
    l.right.x = r.x; l.right.y = r.y; l.right.z = r.z;
  }
}

const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
