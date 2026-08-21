/* SILICONE DREAMS — Inventory, examination and the journal
 *
 * Three things an immersive sim needs that a shooter does not:
 *
 *   1. objects you carry that are not weapons,
 *   2. the ability to hold one up and turn it over, and
 *   3. somewhere the game writes down what you have learned.
 *
 * Examination reuses the viewmodel scene, which already renders with a
 * cleared depth buffer, so a held object floats in front of the world
 * without ever intersecting it.
 */
import * as THREE from 'three';
import { input } from '../core/Input.js';
import { audio } from '../core/Audio.js';
import { time, clamp, damp, lerp } from '../core/Time.js';
import { RELICS, RELIC_BY_ID, RELIC_COUNT, relicModel } from './Relics.js';

const TAU = Math.PI * 2;

/* --------------------------------------------------------- CATALOGUE */

/** Carryables that are not relics: keys, tools, spendables. */
export const ITEMS = {
  sigil_temple:    { name: 'Temple Sigil',     kind: 'key',  colour: 0xffd28a, desc: 'Opens the violet gate.' },
  sigil_mirror:    { name: 'Mirror Sigil',     kind: 'key',  colour: 0x9fd8ff, desc: 'Opens the noon gate.' },
  sigil_colonnade: { name: 'Colonnade Sigil',  kind: 'key',  colour: 0xffb45a, desc: 'Opens the starlit gate.' },
  sigil_nexus:     { name: 'Nexus Sigil',      kind: 'key',  colour: 0xc89fff, desc: 'Opens the gate of sun and moon.' },
  sigil_cortex:    { name: 'Cortex Sigil',     kind: 'key',  colour: 0xff6a5a, desc: 'Opens the wet gate.' },
  sigil_altar:     { name: 'Altar Sigil',      kind: 'key',  colour: 0x6fe8a8, desc: 'Opens the last gate.' },
  multitool:       { name: 'Field Multitool',  kind: 'tool', colour: 0xb8bec6, desc: 'Bypasses a maintenance panel. Consumed on use.' },
  splice:          { name: 'Trace Splice',     kind: 'tool', colour: 0x5ff09a, desc: 'Rejoins a cut circuit trace.' },
};

/* ========================================================== INVENTORY */

export class Inventory {
  constructor(game) {
    this.game = game;
    this.items = new Map();        // id -> count
    this.relics = new Set();       // relic ids collected
    this.silicone = 0;             // spendable component currency
    this.onChange = null;
  }

  /* ---- carryables ---- */
  add(id, n = 1) {
    if (!ITEMS[id]) return false;
    this.items.set(id, (this.items.get(id) || 0) + n);
    this.game.hud?.pickup(`${ITEMS[id].name.toUpperCase()}${n > 1 ? ` x${n}` : ''}`);
    audio.sfx_pickup(0.9, 0, 0);
    this.onChange?.();
    return true;
  }
  has(id, n = 1) { return (this.items.get(id) || 0) >= n; }
  consume(id, n = 1) {
    if (!this.has(id, n)) return false;
    const left = this.items.get(id) - n;
    if (left <= 0) this.items.delete(id); else this.items.set(id, left);
    this.onChange?.();
    return true;
  }
  count(id) { return this.items.get(id) || 0; }

  /* ---- currency ---- */
  addSilicone(n) {
    this.silicone += n;
    this.game.hud?.pickup(`SILICONE +${n}`);
    audio.sfx_pickup_ammo(0.8, 0, 0);
    this.onChange?.();
  }
  spend(n) {
    if (this.silicone < n) return false;
    this.silicone -= n;
    this.onChange?.();
    return true;
  }

  /* ---- relics ---- */
  collectRelic(id) {
    if (this.relics.has(id)) return false;
    const def = RELIC_BY_ID[id];
    if (!def) return false;
    this.relics.add(id);
    audio.sfx_chime(1, 0, 0, { freq: 660 });
    this.game.hud?.relicBanner(def.name, this.relics.size, RELIC_COUNT);
    this.game.journal?.addLore(def.name, def.lore);
    this.game.hub?.fillVitrine(id);
    this.onChange?.();
    return true;
  }
  hasRelic(id) { return this.relics.has(id); }
  get relicCount() { return this.relics.size; }

  serialize() {
    return {
      items: [...this.items.entries()],
      relics: [...this.relics],
      silicone: this.silicone,
    };
  }
  deserialize(d) {
    if (!d) return;
    this.items = new Map(d.items || []);
    this.relics = new Set(d.relics || []);
    this.silicone = d.silicone || 0;
    this.onChange?.();
  }
}

/* ============================================================ EXAMINE */

/**
 * Hold an object up and turn it over. While examining, the world keeps
 * running but the player cannot move or shoot — the classic Thief/System
 * Shock beat where the game gets quiet and asks you to look at something.
 */
export class Examiner {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.obj = null;
    this.def = null;
    this.yaw = 0;
    this.pitch = 0;
    this.dist = 0.62;
    this.t = 0;

    // its own corner of the viewmodel scene, in front of the weapon
    this.root = new THREE.Group();
    this.root.position.set(0, -0.02, -this.dist);
    this.root.visible = false;
    game.weapons.scene.add(this.root);

    // a dedicated three-point rig so relics read the same wherever you are
    this.key = new THREE.PointLight(0xfff0dc, 6.5, 4, 2);
    this.key.position.set(0.55, 0.55, 0.85);
    this.root.add(this.key);
    this.fill = new THREE.PointLight(0x9fc0ff, 3.0, 4, 2);
    this.fill.position.set(-0.7, -0.1, 0.55);
    this.root.add(this.fill);
    this.rim = new THREE.PointLight(0xffffff, 3.4, 4, 2);
    this.rim.position.set(0, 0.35, -0.9);
    this.root.add(this.rim);

    this.pivot = new THREE.Group();
    this.root.add(this.pivot);
  }

  open(idOrObj, def = null) {
    if (this.active) return false;
    let obj = idOrObj;
    if (typeof idOrObj === 'string') {
      obj = relicModel(idOrObj);
      def = def || RELIC_BY_ID[idOrObj];
    }
    if (!obj) return false;

    this.clear();
    // scale the object so its longest axis fills a consistent frame
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const longest = Math.max(size.x, size.y, size.z) || 1;
    const s = 0.34 / longest;
    obj.scale.multiplyScalar(s);
    const c = box.getCenter(new THREE.Vector3()).multiplyScalar(s);
    obj.position.sub(c);

    this.obj = obj;
    this.def = def;
    this.pivot.add(obj);
    this.pivot.rotation.set(0, 0, 0);
    this.yaw = 0.5; this.pitch = -0.18;
    this.t = 0;
    this.active = true;
    this.root.visible = true;
    this.game.weapons.setModelVisible(false);
    this.game.player.frozen = true;
    this.game.hud?.showExamine(def?.name || '', def?.lore || '');
    audio.sfx_ui_confirm(0.8);
    return true;
  }

  close() {
    if (!this.active) return;
    this.active = false;
    this.root.visible = false;
    this.game.weapons.setModelVisible(true);
    this.game.player.frozen = false;
    this.game.hud?.hideExamine();
    audio.sfx_ui(0.7);
    this.clear();
  }

  clear() {
    if (this.obj) {
      this.pivot.remove(this.obj);
      this.obj.traverse((o) => { if (o.geometry && o.userData.own) o.geometry.dispose(); });
      this.obj = null;
    }
  }

  update(realDt) {
    if (!this.active) return;
    this.t += realDt;
    // mouse turns the object; there is no aiming here
    this.yaw -= input.mouse.dx * 0.006;
    this.pitch = clamp(this.pitch - input.mouse.dy * 0.006, -1.3, 1.3);
    // a slow idle drift so it never looks frozen
    this.pivot.rotation.y = this.yaw + Math.sin(this.t * 0.4) * 0.05;
    this.pivot.rotation.x = this.pitch;
    this.root.position.z = damp(this.root.position.z, -this.dist, 12, realDt);
    this.root.position.y = -0.02 + Math.sin(this.t * 0.9) * 0.006;

    if (input.hit('use') || input.hit('pause') || input.mouseHit(1)) this.close();
  }
}

/* ============================================================ JOURNAL */

/** Objectives and the lore you have picked up, in one book. */
export class Journal {
  constructor(game) {
    this.game = game;
    this.lore = [];
    this.objectives = [];
    this.unread = 0;
    this.open = false;
  }

  addLore(title, body) {
    if (this.lore.some((e) => e.title === title)) return;
    this.lore.unshift({ title, body, t: time.realNow });
    this.unread++;
    this.game.hud?.setJournalBadge(this.unread);
  }

  addObjective(id, text, sub = '') {
    const found = this.objectives.find((o) => o.id === id);
    if (found) { found.text = text; found.sub = sub; return found; }
    const o = { id, text, sub, done: false };
    this.objectives.push(o);
    return o;
  }

  completeObjective(id) {
    const o = this.objectives.find((x) => x.id === id);
    if (o) o.done = true;
  }

  toggle() {
    this.open = !this.open;
    if (this.open) { this.unread = 0; this.game.hud?.setJournalBadge(0); }
    this.game.hud?.showJournal(this.open, this);
    audio.sfx_ui(0.8);
  }

  serialize() { return { lore: this.lore, objectives: this.objectives }; }
  deserialize(d) {
    if (!d) return;
    this.lore = d.lore || [];
    this.objectives = d.objectives || [];
  }
}

export { RELICS, RELIC_COUNT, RELIC_BY_ID, relicModel };
