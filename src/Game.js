/* HALCYON — Game
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
import { ChronoBarrier } from './game/Pickups.js';
import { buildLevel1, ZONE } from './world/Level1.js';
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
    this.renderer.toneMappingExposure = 0.95;
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

    onProgress('winding the clocks');
    await frame();

    this.hud = new HUD(this);
    this.menu = new Menu(this);
    this.console = new Console(this);
    this.director = new Director(this);

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
    this.player.respawn(this.spawnPoint.x, this.spawnPoint.y, this.spawnPoint.z, Math.PI);
    this.player.armour = 0;
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

    /* ---- player + weapons on wall time -------------------------- */
    p.update(dtReal);
    this.chrono.update(dtReal);
    this.weapons.update(dtWorld, dtReal);
    this.manipulator.update(dtReal);

    /* ---- use prompt ---------------------------------------------- */
    this.usePromptActive = null;
    // director's interactables set it during their update
    this.director.update(dtWorld, dtReal);
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
    this.env.update(dtReal, this.camera, time.dilationAmount);
    this.sea?.update(dtWorld, this.camera);
    this.clouds?.update(dtWorld, this.camera);
    if (this.stars) this.stars.userData.mat.uniforms.uTime.value += dtReal;
    this.level.update(dtWorld, time.now, this);

    /* ---- fx + audio + hud ---------------------------------------- */
    this.fx.update(dtWorld, dtReal);
    this.updateListener();
    audio.update(time.dilationAmount, dtReal);
    this.postfx.update(dtReal, time.dilationAmount);
    this.hud.update(dtReal);

    this.postfx.render();
    input.endFrame();
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
