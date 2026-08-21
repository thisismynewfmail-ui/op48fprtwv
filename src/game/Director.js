/* SILICONE DREAMS — Director
 *
 * The level's script. Objectives, gates, encounter waves, checkpoints and
 * the small scripted beats that make a corridor feel authored: the terminal
 * booting, the choir waking, the clock starting, the Herald arriving.
 *
 * Written as a list of stages with enter/update/exit hooks, because a
 * chapter is a state machine and pretending otherwise never ends well.
 */
import * as THREE from 'three';
import { audio } from '../core/Audio.js';
import { time, clamp, rand, lerp } from '../core/Time.js';
import { Pickup, Interactable } from './Pickups.js';
import { Wraith, Sentinel, Herald } from './Enemies.js';
import { ZONE } from '../world/Level1.js';
import * as Obj from '../world/Objects.js';
import { M } from '../world/Materials.js';

/* --------------------------------------------------- terminal screens */

const BOOT_LINES = [
  'SILICONE DREAMS BIOS v2.03',
  'Copyright (C) 1997-2003',
  '',
  'Memory Test : 65536K OK',
  'Detecting Primary Master  ... CHRONOMETER',
  'Detecting Primary Slave   ... none',
  'Detecting Secondary Master... VENUS.IMG',
  '',
  'Booting from LOOP 0 ...',
];

const BRIEF_LINES = [
  '> WAKE',
  '',
  'You have been here 4,096 times.',
  'The hour is 11:47. It has been 11:47',
  'for a very long time.',
  '',
  '> OBJECTIVE',
  'Reach the Nexus. Wind the hour on.',
  '',
  '> WARNING',
  'The Choir is awake in the mirror.',
  'They remember you.',
  '',
  '_',
];

/* ============================================================ DIRECTOR */

export class Director {
  constructor(game) {
    this.game = game;
    this.stage = -1;
    this.stageT = 0;
    this.objective = '';
    this.objectiveSub = '';
    this.flags = {};
    this.counters = {};
    this.pickups = [];
    this.interactables = [];
    this.checkpoint = null;
    this.stages = this.buildStages();
    this.pendingWaves = [];
    this.screenScroll = 0;
    this.screenLines = [];
    this.screenMode = 'venus';
    this.screenT = 0;
  }

  /* ------------------------------------------------------ utilities */

  setObjective(text, sub = '') {
    this.objective = text;
    this.objectiveSub = sub;
    this.game.hud?.setObjective(text, sub);
    audio.sfx_objective(1);
  }

  say(text, dur = 4.5, speaker = '') {
    this.game.hud?.caption(text, dur, speaker);
  }

  addPickup(opt) {
    const p = new Pickup(this.game, opt);
    this.pickups.push(p);
    return p;
  }

  addUse(opt) {
    const i = new Interactable(this.game, opt);
    this.interactables.push(i);
    return i;
  }

  saveCheckpoint(name) {
    const g = this.game;
    this.checkpoint = {
      name, stage: this.stage,
      player: g.player.serialize(),
      weapons: g.weapons.serialize(),
      chrono: g.chrono.serialize(),
      inventory: g.inventory.serialize(),
      journal: g.journal.serialize(),
      flags: { ...this.flags },
      counters: { ...this.counters },
      hour: g.time.hour, minute: g.time.minute,
    };
    try { localStorage.setItem('silicone.save.v1', JSON.stringify(this.checkpoint)); } catch (e) { /* ignore */ }
    g.hud?.notify('AUTOSAVE');
  }

  loadCheckpoint(data) {
    const g = this.game;
    const c = data || this.checkpoint;
    if (!c) return false;
    g.clearCombat();
    g.player.deserialize(c.player);
    g.player.alive = true;
    g.player.health = Math.max(35, c.player.health);
    g.weapons.deserialize(c.weapons);
    g.chrono.deserialize(c.chrono);
    g.inventory.deserialize(c.inventory);
    g.journal.deserialize(c.journal);
    g.hub?.syncVitrines(g.inventory);
    this.flags = { ...c.flags };
    this.counters = { ...c.counters };
    g.time.hour = c.hour; g.time.minute = c.minute;
    this.stage = c.stage - 1;
    this.advance();
    return true;
  }

  static hasSave() {
    try { return !!localStorage.getItem('silicone.save.v1'); } catch (e) { return false; }
  }
  static readSave() {
    try { return JSON.parse(localStorage.getItem('silicone.save.v1')); } catch (e) { return null; }
  }

  advance(to) {
    const g = this.game;
    if (this.stage >= 0 && this.stages[this.stage]?.exit) this.stages[this.stage].exit(g, this);
    this.stage = to !== undefined ? to : this.stage + 1;
    this.stageT = 0;
    const s = this.stages[this.stage];
    if (s) {
      s.enter?.(g, this);
      if (s.checkpoint) this.saveCheckpoint(s.name || String(this.stage));
    }
  }

  /* --------------------------------------------------- spawn helpers */

  /** Queue a wave so enemies trickle in rather than popping in a block. */
  wave(list) {
    for (const e of list) this.pendingWaves.push(e);
  }

  spawnFromQueue(dt) {
    for (let i = this.pendingWaves.length - 1; i >= 0; i--) {
      const w = this.pendingWaves[i];
      w.delay -= dt;
      if (w.delay > 0) continue;
      this.pendingWaves.splice(i, 1);
      const g = this.game;
      const p = w.pos.clone();
      if (w.kind === 'sentinel') g.spawnSentinel(p, w.opt || {});
      else g.spawnWraith(p, w.opt || {});
      g.fx.shockRing(p, { colour: [0.4, 1, 0.8], size: 0.4, size1: 3.2, life: 0.45 });
      g.fx.chronoMotes(p, { count: 8, colour: [0.4, 1, 0.8] });
      audio.play('glitch', p, { vol: 0.7, ref: 16 });
    }
  }

  ringSpawn(centre, radius, n, kind = 'wraith', opt = {}, stagger = 0.35) {
    const list = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand(-0.3, 0.3);
      list.push({
        kind,
        pos: new THREE.Vector3(
          centre.x + Math.cos(a) * radius * rand(0.7, 1.2),
          centre.y + rand(2.5, 7),
          centre.z + Math.sin(a) * radius * rand(0.7, 1.2)),
        delay: i * stagger + rand(0, 0.2),
        opt,
      });
    }
    this.wave(list);
  }

  get aliveEnemies() { return this.game.enemies.filter((e) => e.alive && e.isThreat).length; }

  /* ------------------------------------------------------ the script */

  buildStages() {
    return [
      /* ---------------------------------------------------- 0 : WAKE */
      {
        name: 'wake',
        enter: (g, d) => {
          // You wake in the hub. Everything else in the level is somewhere
          // you choose to go from here.
          const h = g.hubSpawn || g.spawnPoint;
          g.env.apply('atrium', true);
          g.player.teleport(h.x, h.y, h.z, g.hubSpawnYaw ?? Math.PI);
          g.player.frozen = true;
          g.postfx.fadeTo(1, 4, 0x000000);
          g.time.hour = 11; g.time.minute = 47;
          d.screenMode = 'boot';
          d.screenLines = [];
          d.screenScroll = 0;
          audio.startMusic('temple');
          g.hud?.chapterCard('LEVEL ONE', 'THE ATRIUM OF SLEEPING MACHINES');
        },
        update: (g, d, dt) => {
          if (d.stageT > 1.2) g.postfx.fadeTo(0, 0.5);
          if (d.stageT > 2.6 && !d.flags.woke) {
            d.flags.woke = true;
            g.player.frozen = false;
            d.say('You are in the atrium again. The orrery is still turning. It is still 11:47.', 6);
          }
          if (d.stageT > 4.0) d.advance();
        },
      },

      /* ------------------------------------------------ 0b : THE ATRIUM */
      {
        name: 'atrium', checkpoint: true,
        enter: (g, d) => {
          d.setObjective('LEARN THE ATRIUM', 'Six gates. One of them is unlocked.');
          d.say('Eight bays. Six gates out, a hall for what you bring back, and a bench to work at.', 7);
          g.journal.addObjective('atrium', 'Find your way out of the atrium', 'The violet gate is open.');
          g.journal.addLore('The Atrium',
            'You did not build this room and you do not remember arriving in it. The vitrines in the south hall are labelled in your handwriting, and all of them are empty.');

          // the Gnomon waits on the workbench
          const wb = g.hub?.marks?.workbench;
          if (wb) {
            const pk = d.addPickup({
              kind: 'weapon', weapon: 'gnomon', label: 'THE GNOMON',
              pos: new THREE.Vector3(wb.x, wb.y + 0.9, wb.z), radius: 2.2,
              onTake: () => d.say('The gnomon. Brass, and sharper than it needs to be.', 5),
            });
            const blade = new THREE.Group();
            const shape = new THREE.Shape();
            shape.moveTo(0, 0); shape.lineTo(0.7, 0); shape.lineTo(0, 0.48); shape.closePath();
            const m = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, {
              depth: 0.04, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 1 }), M.gold);
            m.position.set(-0.24, -0.16, 0);
            blade.add(m);
            blade.rotation.z = 0.3;
            pk.attach(blade, 0.35);
          }
          // the save shrine
          const ss = g.hub?.marks?.saveShrine;
          if (ss) {
            d.addUse({
              pos: ss.clone(), radius: 3.0, label: 'WIND THE CHRONOMETER', once: false,
              onUse: () => { d.saveCheckpoint('atrium'); audio.sfx_chime(1, 0, 0, { freq: 880 }); },
            });
          }
        },
        update: (g, d, dt) => {
          // leaving through any gate begins the level proper
          if (g.lastGate) { g.journal.completeObjective('atrium'); d.advance(); }
        },
      },

      /* --------------------------------------------- 1 : FIND TERMINAL */
      {
        name: 'terminal', checkpoint: true,
        enter: (g, d) => {
          d.setObjective('REACH THE TERMINAL', 'It is the only thing here that still runs.');
          d.say('WASD to move. Mouse to look. SHIFT to run.', 5, 'SUIT');
          const t = g.marks.terminal;
          d.addUse({
            pos: new THREE.Vector3(t.x, t.y + 0.9, t.z + 0.5),
            radius: 3.0, label: 'READ TERMINAL',
            onUse: () => {
              d.screenMode = 'brief';
              d.screenLines = [];
              d.screenScroll = 0;
              audio.sfx_terminal(1, 0, 0);
              g.postfx.kick(0.3, 5);
              d.advance();
            },
          });
        },
      },

      /* ---------------------------------------------- 2 : TAKE THE GNOMON */
      {
        name: 'gnomon',
        enter: (g, d) => {
          d.setObjective('ARM YOURSELF', 'Something in the plaza is still sharp.');
          d.say('Four thousand and ninety-six. And every time, you reach for the same thing first.', 6);
          const p = g.marks.gnomonPlinth;
          const pk = d.addPickup({
            kind: 'weapon', weapon: 'gnomon', label: 'THE GNOMON',
            pos: p.clone(), radius: 1.6, requiresUse: true,
            onTake: () => {
              d.say('The gnomon. It has told the hour for longer than the temple has stood.', 5);
              d.advance();
            },
          });
          // stand it in the plinth at an angle, blade up
          const blade = new THREE.Group();
          const shape = new THREE.Shape();
          shape.moveTo(0, 0); shape.lineTo(0.9, 0); shape.lineTo(0, 0.62); shape.closePath();
          const m = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, {
            depth: 0.05, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 1 }), M.gold);
          m.position.set(-0.3, -0.2, 0);
          blade.add(m);
          blade.rotation.z = 0.35;
          pk.attach(blade, 0.5);
        },
      },

      /* ------------------------------------------- 3 : FIRST ENCOUNTER */
      {
        name: 'first-blood', checkpoint: true,
        enter: (g, d) => {
          d.setObjective('SURVIVE', 'The Choir has noticed.');
          d.say('They are coming out of the mirror. They always come out of the mirror.', 5);
          const c = g.marks.templeCentre;
          d.ringSpawn(new THREE.Vector3(c.x, 3, c.z + 10), 16, 3, 'wraith', { alerted: true }, 0.9);
          d.counters.firstKills = 0;
          audio.setMood('combat');
          g.postfx.kick(0.5, 3);
        },
        update: (g, d, dt) => {
          if (d.stageT > 2 && d.aliveEnemies === 0 && d.pendingWaves.length === 0) {
            if (!d.flags.wave2) {
              d.flags.wave2 = true;
              const c = g.marks.templeCentre;
              d.ringSpawn(new THREE.Vector3(c.x, 4, c.z - 4), 20, 4, 'wraith', { alerted: true }, 0.6);
              d.say('More of them. Left-click swings. They break easily.', 4, 'SUIT');
            } else if (d.stageT > 6) {
              d.advance();
            }
          }
        },
        exit: (g, d) => { audio.setMood('temple'); },
      },

      /* ---------------------------------------------- 4 : OPEN THE GATE */
      {
        name: 'open-north',
        enter: (g, d) => {
          d.setObjective('CROSS TO THE MIRROR', 'North, past the gate.');
          g.marks.templeGate?.setOpen(true);
          d.say('The gate is open. It was never locked; it was only waiting.', 5);
          g.addTrigger({
            x: ZONE.A.x, y: 4, z: ZONE.A.z - 40, hw: 12, hh: 8, hd: 10,
            onEnter: () => d.advance(),
          });
          d.addPickup({ kind: 'health', amount: 30, pos: new THREE.Vector3(ZONE.A.x - 3, 1.0, ZONE.A.z - 22) });
        },
      },

      /* ---------------------------------------------- 5 : THE MIRROR */
      {
        name: 'mirror-arrive', checkpoint: true,
        enter: (g, d) => {
          d.setObjective('ENTER THE MIRROR OF FACES', '');
          d.say('The sky changed. It does that here — the weather is a different century on each slab.', 6);
          g.addTrigger({
            x: ZONE.B.x, y: 6, z: ZONE.B.z + 30, hw: 30, hh: 12, hd: 16,
            onEnter: () => d.advance(),
          });
        },
      },

      /* ------------------------------------------- 6 : THE PISTOL */
      {
        name: 'pistol',
        enter: (g, d) => {
          d.setObjective('RECOVER THE QUARTZ PISTOL', 'On the plinth ahead.');
          d.say('Rank on rank of them, asleep above their own reflections. Do not wake them yet.', 6);
          const p = g.marks.pistolPlinth;
          const pk = d.addPickup({
            kind: 'weapon', weapon: 'pistol', amount: 54, label: 'QUARTZ PISTOL',
            pos: p.clone(), radius: 1.8,
            onTake: () => {
              d.say('Quartz pistol. Semi-automatic. R to reload, and reload often.', 5, 'SUIT');
              d.advance();
            },
          });
          const gun = new THREE.Group();
          const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.5), M.steel);
          gun.add(barrel);
          const grip = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.28, 0.13), M.gunmetal);
          grip.position.set(0, -0.18, 0.11); grip.rotation.x = -0.3;
          gun.add(grip);
          const crys = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 6),
            new THREE.MeshPhongMaterial({ color: 0x9fd8ff, emissive: 0x2a6a98, shininess: 240 }));
          crys.rotation.x = Math.PI / 2; crys.position.set(0, 0.08, -0.05);
          gun.add(crys);
          gun.rotation.set(0, 0.6, 0.2);
          pk.attach(gun, 0.55);
        },
      },

      /* --------------------------------------- 7 : BREAK THE CHRONOLITHS */
      {
        name: 'chronoliths', checkpoint: true,
        enter: (g, d) => {
          d.setObjective('DESTROY THE THREE CHRONOLITHS', 'They are what holds the hour still.');
          d.say('Three anchors. Break them and the mirror stops keeping the Choir asleep.', 6);
          for (const l of g.marks.chronoliths) l.active = true;
          d.counters.liths = 0;
          // a light garrison while you work
          d.ringSpawn(g.marks.mirrorCentre, 26, 3, 'wraith', { alerted: true }, 1.6);
          audio.setMood('combat');
          d.addPickup({ kind: 'ammo', ammoType: 'quartz', amount: 36,
            pos: new THREE.Vector3(ZONE.B.x + 10, 1.4, ZONE.B.z + 4), respawn: 45 });
        },
        update: (g, d, dt) => {
          const left = g.marks.chronoliths.filter((l) => l.alive).length;
          d.objectiveSub = `${3 - left} / 3 destroyed`;
          g.hud?.setObjective(d.objective, d.objectiveSub);
          if (left === 0) d.advance();
          // pressure: a wraith every so often
          if (d.stageT > 8 && d.aliveEnemies < 4 && Math.random() < dt * 0.25) {
            d.ringSpawn(g.player.pos, 34, 1, 'wraith', { alerted: true }, 0);
          }
        },
      },

      /* --------------------------------------------- 8 : THE CHOIR WAKES */
      {
        name: 'choir', checkpoint: true,
        enter: (g, d) => {
          d.setObjective('THE CHOIR IS AWAKE', 'Clear the mirror.');
          d.say('Every face on the plane just opened its eyes at once.', 5);
          g.postfx.kick(0.9, 1.6);
          audio.sfx_glitch(1, 0, 0);
          audio.setMood('combat');
          // the whole static Choir goes at once, and comes back as enemies
          if (g.marks.choirMesh) {
            g.marks.choirMesh.visible = false;
            for (const c of g.marks.mirrorChoir || []) {
              g.fx.shatterMask(c.pos, { size: c.size * 0.5, count: 6 });
            }
          }
          // wake the dormant ranks nearest the player, in three swells
          const choir = g.marks.mirrorChoir || [];
          const sorted = choir.slice().sort((a, b) =>
            a.pos.distanceToSquared(g.player.pos) - b.pos.distanceToSquared(g.player.pos));
          const take = sorted.slice(0, 14);
          take.forEach((c, i) => {
            d.wave([{
              kind: i % 5 === 4 ? 'sentinel' : 'wraith',
              pos: c.pos.clone(),
              delay: i * 0.5,
              opt: { alerted: true, size: clamp(c.size * 0.5, 0.6, 1.4) },
            }]);
          });
          d.counters.choirKilled = 0;
          d.counters.choirTarget = take.length;
        },
        update: (g, d, dt) => {
          d.objectiveSub = `${d.counters.choirKilled} / ${d.counters.choirTarget} silenced`;
          g.hud?.setObjective(d.objective, d.objectiveSub);
          if (d.pendingWaves.length === 0 && d.aliveEnemies === 0 && d.stageT > 4) d.advance();
        },
        exit: (g, d) => { audio.setMood('mirror'); },
      },

      /* ------------------------------------------ 9 : UNLOCK DILATION */
      {
        name: 'dilate',
        enter: (g, d) => {
          d.setObjective('TAKE THE CHRONOMETER SHARD', '');
          const p = new THREE.Vector3(ZONE.B.x, 2.6, ZONE.B.z - 50);
          d.addPickup({
            kind: 'power', power: 'dilate', label: 'DILATION', pos: p, radius: 2.0,
            onTake: () => {
              d.say('Hold Q. The world slows. You do not. That is the whole trick.', 6, 'CHRONOMETER');
              g.marks.mirrorGate?.setOpen(true);
              d.advance();
            },
          });
          d.say('Something is left on the far pad. It is warm.', 4);
        },
      },

      /* --------------------------------------- 10 : CROSS TO COLONNADE */
      {
        name: 'to-colonnade', checkpoint: true,
        enter: (g, d) => {
          d.setObjective('DESCEND TO THE COLONNADE OF HOURS', '');
          g.addTrigger({
            x: ZONE.C.x, y: 6, z: ZONE.C.z + 58, hw: 14, hh: 12, hd: 12,
            onEnter: () => d.advance(),
          });
          d.addPickup({ kind: 'health', amount: 40, pos: new THREE.Vector3(ZONE.B.x + 4, 2.2, ZONE.B.z - 58) });
          d.addPickup({ kind: 'chrono', amount: 50, pos: new THREE.Vector3(ZONE.B.x - 4, 2.2, ZONE.B.z - 58) });
        },
      },

      /* --------------------------------------------- 11 : THE REPEATER */
      {
        name: 'repeater', checkpoint: true,
        enter: (g, d) => {
          d.setObjective('ADVANCE ALONG THE CAUSEWAY', 'Sentinels ahead.');
          d.say('The stars are wrong here. The arches are the same arches, though. They always are.', 6);
          audio.setMood('combat');
          const c = ZONE.C;
          d.wave([
            { kind: 'sentinel', pos: new THREE.Vector3(c.x - 4, 6, c.z - 20), delay: 1.2, opt: { alerted: true } },
            { kind: 'wraith', pos: new THREE.Vector3(c.x + 5, 4, c.z - 26), delay: 2.0, opt: { alerted: true } },
            { kind: 'wraith', pos: new THREE.Vector3(c.x - 5, 4, c.z - 30), delay: 2.6, opt: { alerted: true } },
          ]);
          const p = g.marks.repeaterPlinth;
          d.addPickup({
            kind: 'weapon', weapon: 'repeater', amount: 180, label: 'STATIC REPEATER',
            pos: p.clone(), radius: 1.8,
            onTake: () => { d.flags.hasRepeater = true; d.say('Static repeater. Hold to fire. It will not stay accurate.', 5, 'SUIT'); },
          });
          const gun = new THREE.Group();
          const rec = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.6), M.gunmetal);
          gun.add(rec);
          const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 8), M.darkMetal);
          bar.rotation.x = Math.PI / 2; bar.position.z = -0.5;
          gun.add(bar);
          gun.rotation.set(0, 0.4, 0.15);
          const pk = d.pickups[d.pickups.length - 1];
          pk.attach(gun, 0.5);
        },
        update: (g, d, dt) => {
          if (d.flags.hasRepeater && d.aliveEnemies === 0 && d.pendingWaves.length === 0 && d.stageT > 5) d.advance();
        },
        exit: (g, d) => { audio.setMood('colonnade'); },
      },

      /* ------------------------------------------ 12 : THE MANIPULATOR */
      {
        name: 'manipulator', checkpoint: true,
        enter: (g, d) => {
          d.setObjective('RECOVER THE CHRONAL MANIPULATOR', 'At the sundial.');
          const p = g.marks.manipulatorPlinth;
          d.addPickup({
            kind: 'weapon', weapon: 'manipulator', label: 'CHRONAL MANIPULATOR',
            pos: p.clone(), radius: 1.9,
            onTake: () => {
              g.chrono.unlock('stasis');
              d.say('Right-click to take hold of a thing. Left-click to let go of it, violently. F freezes it out of time.', 8, 'CHRONOMETER');
              d.advance();
            },
          });
          const gun = new THREE.Group();
          const core = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.5, 12), M.beige);
          core.rotation.x = Math.PI / 2;
          gun.add(core);
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.025, 6, 20), M.brass);
          ring.position.z = -0.22;
          gun.add(ring);
          const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.10, 1),
            new THREE.MeshPhongMaterial({ color: 0x9fe4ff, emissive: 0x2a7aa8, shininess: 240, flatShading: true }));
          orb.position.z = -0.24;
          gun.add(orb);
          gun.rotation.set(0.2, 0.5, 0);
          d.pickups[d.pickups.length - 1].attach(gun, 0.55);
        },
      },

      /* ------------------------------------------- 13 : WIND THE CLOCK */
      {
        name: 'wind-clock', checkpoint: true,
        enter: (g, d) => {
          d.setObjective('START THE GREAT CLOCK', 'The longcase, west side of the causeway.');
          d.say('The pendulum is dead. Nothing here moves on from 11:47 until it swings.', 6);
          const c = g.marks.greatClock.position;
          d.addUse({
            pos: new THREE.Vector3(c.x + ZONE.C.x, c.y + 1.4, c.z + ZONE.C.z),
            radius: 3.2, label: 'WIND THE CLOCK',
            onUse: () => {
              g.marks.clockRunning = true;
              g.time.hourRate = 2.4;
              audio.sfx_bell(1, 0, 0, { freq: 150 });
              audio.sfx_gear(1, 0, 0);
              g.postfx.kick(0.55, 3);
              g.fx.shockRing(new THREE.Vector3(c.x + ZONE.C.x, c.y + 1.5, c.z + ZONE.C.z),
                { colour: [1, 0.85, 0.5], size: 1, size1: 14, life: 1.0 });
              d.say('It is 11:48. For the first time in four thousand iterations, it is 11:48.', 6);
              d.advance();
            },
          });
        },
      },

      /* ------------------------------------------ 14 : THE HOUR TURNS */
      {
        name: 'hour-turns',
        enter: (g, d) => {
          d.setObjective('HOLD THE CAUSEWAY', 'The hour is moving. So are they.');
          audio.setMood('combat');
          const c = ZONE.C;
          d.ringSpawn(new THREE.Vector3(c.x, 4, c.z - 6), 18, 4, 'wraith', { alerted: true }, 0.5);
          d.wave([
            { kind: 'sentinel', pos: new THREE.Vector3(c.x - 6, 7, c.z - 18), delay: 3.0, opt: { alerted: true } },
            { kind: 'sentinel', pos: new THREE.Vector3(c.x + 6, 7, c.z + 12), delay: 5.0, opt: { alerted: true } },
          ]);
          d.addPickup({ kind: 'ammo', ammoType: 'static', amount: 90,
            pos: new THREE.Vector3(c.x + 5, 1.4, c.z - 4), respawn: 40 });
          d.addPickup({ kind: 'ammo', ammoType: 'quartz', amount: 36,
            pos: new THREE.Vector3(c.x - 5, 1.4, c.z - 4), respawn: 40 });
        },
        update: (g, d, dt) => {
          if (d.aliveEnemies === 0 && d.pendingWaves.length === 0 && d.stageT > 8) d.advance();
        },
        exit: (g, d) => { audio.setMood('colonnade'); },
      },

      /* --------------------------------------------- 15 : UNLOCK REWIND */
      {
        name: 'rewind',
        enter: (g, d) => {
          d.setObjective('TAKE THE SECOND SHARD', '');
          const c = ZONE.C;
          d.addPickup({
            kind: 'power', power: 'rewind', label: 'RECURSION',
            pos: new THREE.Vector3(c.x, 1.8, c.z - 6), radius: 2.0,
            onTake: () => {
              d.say('T. Four seconds of your own past, returned to you. Use it before you need it.', 7, 'CHRONOMETER');
              g.marks.colonnadeGate?.setOpen(true);
              d.advance();
            },
          });
        },
      },

      /* ------------------------------------------- 16 : TO THE NEXUS */
      {
        name: 'to-nexus', checkpoint: true,
        enter: (g, d) => {
          d.setObjective('REACH THE NEXUS OF SUN AND MOON', '');
          d.addPickup({ kind: 'health', amount: 50, pos: new THREE.Vector3(ZONE.C.x - 3, 1.2, ZONE.C.z - 60) });
          d.addPickup({ kind: 'chrono', amount: 60, pos: new THREE.Vector3(ZONE.C.x + 3, 1.2, ZONE.C.z - 60) });
          g.addTrigger({
            x: ZONE.D.x, y: 6, z: ZONE.D.z + 34, hw: 12, hh: 14, hd: 12,
            onEnter: () => d.advance(),
          });
        },
      },

      /* ---------------------------------------------- 17 : THE HERALD */
      {
        name: 'herald', checkpoint: true,
        enter: (g, d) => {
          d.setObjective('THE HERALD OF THE ELEVENTH HOUR', 'End it.');
          d.say('It has been keeping the hour. It has been keeping you.', 6);
          const s = g.marks.heraldSpawn;
          const h = g.spawnHerald(s.clone());
          d.flags.heraldId = h;
          audio.setMood('combat');
          g.postfx.fadeTo(0.35, 2, 0x180404);
          setTimeout(() => g.postfx.fadeTo(0, 1), 900);
          g.marks.bossActive = true;
        },
        update: (g, d, dt) => {
          const h = g.enemies.find((e) => e.tier === 'herald');
          if (h) {
            g.hud?.setBoss('THE HERALD', h.health / h.maxHealth);
            if (!h.alive && h.deathT > 3.4) { d.advance(); }
          } else if (d.stageT > 5) d.advance();
        },
        exit: (g, d) => {
          g.hud?.setBoss(null);
          g.marks.bossActive = false;
          audio.setMood('nexus');
        },
      },

      /* ------------------------------------------------ 18 : THE KEY */
      {
        name: 'key', checkpoint: true,
        enter: (g, d) => {
          d.setObjective('TAKE THE KEY', 'It has been lying there the whole time.');
          d.say('The sun has not woken. It never does. But the key is still where it fell.', 6);
          const kp = g.marks.keyPos;
          const pk = d.addPickup({
            kind: 'weapon', weapon: null, label: 'THE GOLDEN KEY',
            pos: kp.clone(), radius: 1.8,
            onTake: () => { d.flags.hasKey = true; d.advance(); },
          });
          // override: the key is not a weapon, it is a plot item
          pk.take = function () {
            if (this.taken) return false;
            this.taken = true;
            this.group.visible = false;
            audio.sfx_pickup(1, 0, 0);
            g.hud?.pickup('THE GOLDEN KEY');
            g.fx.shockRing(this.pos, { colour: [1, 0.85, 0.4], size: 0.4, size1: 4, life: 0.6 });
            this.onTake?.(this);
            return true;
          };
          const key = Obj.goldenKey({ len: 0.9 });
          key.rotation.set(0, 0.6, 0.1);
          pk.attach(key, 0.25);
          audio.setMood('nexus');
        },
      },

      /* ------------------------------------------- 19 : SET THE HOUR */
      {
        name: 'set-hour',
        enter: (g, d) => {
          d.setObjective('WIND THE MOON-CLOCK', 'Set the hour on. Twelve, this time.');
          const mc = g.marks.moonClock;
          const wp = new THREE.Vector3(ZONE.D.x + 12.0, 2.0, ZONE.D.z - 2);
          d.addUse({
            pos: wp, radius: 4.5, label: 'SET THE HOUR', lookAt: false,
            onUse: () => {
              d.flags.hourSet = true;
              g.time.hourRate = 90;
              audio.sfx_bell(1, 0, 0, { freq: 110 });
              g.postfx.kick(0.7, 2);
              d.say('Twelve.', 3);
              d.advance();
            },
          });
        },
      },

      /* ---------------------------------------------------- 20 : END */
      {
        name: 'end',
        enter: (g, d) => {
          d.setObjective('', '');
          g.player.frozen = true;
          audio.stopMusic();
        },
        update: (g, d, dt) => {
          // the clock races to twelve, twelve bells ring, and the chapter ends
          if (d.stageT < 5.5) {
            g.time.hourRate = 260;
            if (!d.counters.bell) d.counters.bell = 0;
            if (d.stageT > 1.0 + d.counters.bell * 0.42 && d.counters.bell < 12) {
              d.counters.bell++;
              audio.sfx_bell(0.9, 0, 0, { freq: 96 });
              g.postfx.kick(0.18, 6);
            }
          }
          if (d.stageT > 3.0) {
            g.time.hourRate = 0;
            g.time.hour = 12 % 12; g.time.minute = 0;
          }
          if (d.stageT > 4.2 && !d.flags.faded) {
            d.flags.faded = true;
            g.postfx.fadeTo(1, 0.35, 0xffffff);
            d.say('It is twelve. Somewhere the sun opens one eye.', 6);
          }
          if (d.stageT > 7.5 && !d.flags.ended) {
            d.flags.ended = true;
            g.onChapterComplete?.();
          }
        },
      },
    ];
  }

  /* ------------------------------------------------------- terminal */

  drawScreen(dt) {
    const g = this.game;
    if (!g.screen) return;
    const { ctx, canvas, tex } = g.screen;
    this.screenT += dt;

    if (this.screenMode === 'venus') return;   // static Venus, painted once

    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = '#0a1408';
    ctx.fillRect(0, 0, W, H);

    const lines = this.screenMode === 'boot' ? BOOT_LINES : BRIEF_LINES;
    const perLine = this.screenMode === 'boot' ? 0.22 : 0.34;
    const shown = Math.min(lines.length, Math.floor(this.screenT / perLine));

    ctx.font = '22px "Lucida Console", "Courier New", monospace';
    ctx.textBaseline = 'top';
    for (let i = 0; i < shown; i++) {
      const y = 22 + i * 27;
      ctx.fillStyle = i === 0 ? '#c8ffb0' : '#7fe86a';
      ctx.fillText(lines[i], 22, y);
    }
    // cursor
    if (shown < lines.length || Math.sin(this.screenT * 6) > 0) {
      ctx.fillStyle = '#a8ff88';
      const cy = 22 + Math.min(shown, lines.length - 1) * 27;
      const cw = ctx.measureText(lines[Math.min(shown, lines.length - 1)] || '').width;
      ctx.fillRect(22 + (shown < lines.length ? cw : 0), cy + 3, 12, 20);
    }
    // scanlines burnt into the source, before the phosphor mask
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
    tex.needsUpdate = true;

    if (this.screenMode === 'boot' && this.screenT > perLine * lines.length + 1.6) {
      this.screenMode = 'brief';
      this.screenT = 0;
    }
  }

  /* --------------------------------------------------------- update */

  update(dt, realDt) {
    const g = this.game;
    if (this.stage < 0) { this.advance(0); return; }
    this.stageT += realDt;
    this.spawnFromQueue(realDt);

    const s = this.stages[this.stage];
    s?.update?.(g, this, realDt);

    for (const p of this.pickups) p.update(realDt, g.player);
    for (const i of this.interactables) i.update(realDt, g.player);

    this.drawScreen(realDt);
  }

  onEnemyKilled(e) {
    if (this.stages[this.stage]?.name === 'choir') this.counters.choirKilled++;
    // drops
    const g = this.game;
    if (Math.random() < e.dropChance) {
      const roll = Math.random();
      const pos = e.position.clone();
      pos.y = Math.max(0.8, g.player.pos.y + 0.8);
      if (roll < 0.42) this.addPickup({ kind: 'health', amount: 15, pos });
      else if (roll < 0.78) this.addPickup({
        kind: 'ammo', amount: e.tier === 'sentinel' ? 45 : 18,
        ammoType: g.weapons.owned.repeater && Math.random() < 0.5 ? 'static' : 'quartz', pos });
      else this.addPickup({ kind: 'chrono', amount: 30, pos });
    }
  }

  onChronolithDestroyed() {
    this.counters.liths = (this.counters.liths || 0) + 1;
  }
}
