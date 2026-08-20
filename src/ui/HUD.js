/* HALCYON — HUD
 * Amber numerals in the bottom corners, closed captions, an objective rail,
 * and a clock that is always visible because the clock is the subject.
 */
import { cfg } from '../core/Config.js';
import { clamp } from '../core/Time.js';
import { WEAPONS } from '../game/Weapons.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(game) {
    this.game = game;
    this.el = $('hud');
    this.health = $('health-v');
    this.healthBar = $('health-bar').firstElementChild;
    this.chrono = $('chrono-v');
    this.chronoBar = $('chrono-bar');
    this.chronoFill = this.chronoBar.firstElementChild;
    this.ammoMag = $('ammo-mag');
    this.ammoRes = $('ammo-res');
    this.wpnName = $('wpn-name');
    this.cross = $('cross');
    this.hitmark = $('hitmark');
    this.objective = $('objective');
    this.objText = $('obj-text');
    this.objSub = $('obj-sub');
    this.captions = $('captions');
    this.notices = $('notices');
    this.usePrompt = $('use-prompt');
    this.useText = $('use-text');
    this.clockTime = $('clock-time');
    this.clockEl = $('clock');
    this.powerFlash = $('power-flash');
    this.boss = $('boss');
    this.bossBar = $('boss-bar').firstElementChild;
    this.bossName = $('boss-name');
    this.chapter = $('chapter');
    this.ch1 = $('ch-1');
    this.ch2 = $('ch-2');
    this.dmgLayer = $('dmg');
    this.dmgVig = $('vignette-dmg');
    this.fps = $('fps');
    this.slots = {};

    this.capList = [];
    this.noticeList = [];
    this._lastHealth = 100;
    this._crossSpread = 0;
    this.buildSlots();
  }

  buildSlots() {
    const wrap = $('slots');
    wrap.innerHTML = '';
    for (const id of Object.keys(WEAPONS)) {
      const w = WEAPONS[id];
      const el = document.createElement('div');
      el.className = 'slot';
      el.innerHTML = `<span class="k">${w.slot}</span>${w.name}`;
      wrap.appendChild(el);
      this.slots[id] = el;
    }
  }

  show(v) { this.el.classList.toggle('on', v); }

  /* ------------------------------------------------------- messages */

  caption(text, dur = 4.5, speaker = '') {
    if (!cfg.cc_enabled) return;
    const el = document.createElement('div');
    el.className = 'caption';
    el.innerHTML = (speaker ? `<b>${speaker}</b>` : '') + text;
    this.captions.appendChild(el);
    this.capList.push({ el, t: dur });
    while (this.capList.length > 3) {
      const old = this.capList.shift();
      old.el.remove();
    }
  }

  notify(text, cls = 'dim') {
    const el = document.createElement('div');
    el.className = 'notice ' + cls;
    el.textContent = text;
    this.notices.appendChild(el);
    this.noticeList.push({ el, t: 2.6 });
    while (this.noticeList.length > 6) this.noticeList.shift().el.remove();
  }
  pickup(text) { this.notify(text, ''); }
  warn(text) { this.notify(text, 'warn'); }

  setObjective(text, sub = '') {
    this.objText.textContent = text;
    this.objSub.textContent = sub;
    this.objective.classList.toggle('on', !!text);
  }

  flashPower(name) {
    this.powerFlash.textContent = name;
    this.powerFlash.classList.remove('on');
    void this.powerFlash.offsetWidth;      // restart the animation
    this.powerFlash.classList.add('on');
  }

  chapterCard(a, b) {
    this.ch1.textContent = a;
    this.ch2.textContent = b;
    this.chapter.classList.remove('on');
    void this.chapter.offsetWidth;
    this.chapter.classList.add('on');
  }

  setBoss(name, frac = 1) {
    if (!name) { this.boss.classList.remove('on'); return; }
    this.boss.classList.add('on');
    this.bossName.textContent = name;
    this.bossBar.style.width = `${clamp(frac, 0, 1) * 100}%`;
  }

  hitMarker(crit) {
    this.hitmark.classList.toggle('crit', !!crit);
    this.hitmark.classList.remove('on');
    void this.hitmark.offsetWidth;
    this.hitmark.classList.add('on');
  }

  setUsePrompt(text, key = 'E') {
    if (!text) { this.usePrompt.classList.remove('on'); return; }
    this.useText.textContent = text;
    this.usePrompt.querySelector('em').textContent = key;
    this.usePrompt.classList.add('on');
  }

  /* --------------------------------------------------------- update */

  update(dt) {
    const g = this.game, p = g.player, w = g.weapons;

    // --- health / chrono
    const hp = Math.max(0, Math.ceil(p.health));
    this.health.textContent = hp;
    this.health.classList.toggle('low', hp <= 25);
    this.healthBar.style.width = `${clamp(p.health / p.maxHealth, 0, 1) * 100}%`;

    const ce = Math.max(0, Math.ceil(g.chrono.energy));
    this.chrono.textContent = ce;
    this.chrono.classList.toggle('low', ce < 25);
    this.chronoFill.style.width = `${clamp(g.chrono.energy / g.chrono.max, 0, 1) * 100}%`;
    this.chronoBar.classList.toggle('dilating', g.chrono.dilating);

    // --- ammo
    const d = w.def;
    if (d.magSize) {
      this.ammoMag.textContent = w.mags[w.current];
      this.ammoRes.textContent = w.ammo[d.ammoType];
      this.ammoRes.style.display = '';
    } else {
      this.ammoMag.textContent = d.kind === 'physics' ? '∞' : '—';
      this.ammoRes.style.display = 'none';
    }
    this.wpnName.textContent = d.name;

    for (const id of Object.keys(this.slots)) {
      const el = this.slots[id];
      el.classList.toggle('owned', !!w.owned[id]);
      el.classList.toggle('active', w.current === id);
    }

    // --- crosshair: spread follows the weapon, colour follows context
    const spread = 5 + (w.spread + (d.spread || 0)) * 950 +
      clamp(Math.hypot(p.vel.x, p.vel.z) * 0.5, 0, 6);
    this._crossSpread += (spread - this._crossSpread) * Math.min(1, dt * 14);
    const s = this._crossSpread;
    const c = this.cross;
    c.style.display = cfg.crosshair ? '' : 'none';
    // children are: left arm, right arm, top arm, bottom arm, centre dot
    c.children[0].style.left = `${-s - 9}px`; c.children[0].style.top = '0px';
    c.children[1].style.left = `${s}px`; c.children[1].style.top = '0px';
    c.children[2].style.top = `${-s - 9}px`; c.children[2].style.left = '0px';
    c.children[3].style.top = `${s}px`; c.children[3].style.left = '0px';
    c.classList.toggle('grab', g.manipulator.hasTarget);
    c.classList.toggle('use', !!g.usePromptActive);

    // --- clock
    this.clockTime.textContent = g.time.clockString();
    this.clockEl.classList.toggle('moving', g.time.hourRate > 0);

    // --- damage direction indicators
    p.updateDamageIndicators(dt);
    if (p.damageDirs.length !== this._dmgCount) {
      this._dmgCount = p.damageDirs.length;
      this.dmgLayer.innerHTML = '';
      for (const dd of p.damageDirs) {
        const el = document.createElement('div');
        el.className = 'dmg-arc';
        el.style.transform = `rotate(${dd.angle}rad)`;
        el.style.opacity = dd.t;
        this.dmgLayer.appendChild(el);
        dd.el = el;
      }
    } else {
      for (const dd of p.damageDirs) if (dd.el) dd.el.style.opacity = dd.t * 0.8;
    }
    this.dmgVig.style.opacity = clamp(1 - p.health / 45, 0, 1) * 0.85;

    // --- caption + notice lifetimes (real time, so they survive dilation)
    for (let i = this.capList.length - 1; i >= 0; i--) {
      const c2 = this.capList[i];
      c2.t -= dt;
      if (c2.t <= 0) { c2.el.remove(); this.capList.splice(i, 1); }
      else if (c2.t < 0.4) c2.el.style.opacity = c2.t / 0.4;
    }
    for (let i = this.noticeList.length - 1; i >= 0; i--) {
      const n = this.noticeList[i];
      n.t -= dt;
      if (n.t <= 0) { n.el.remove(); this.noticeList.splice(i, 1); }
      else if (n.t < 0.5) n.el.style.opacity = n.t / 0.5;
    }

    if (this.fps.classList.contains('on')) {
      this.fps.textContent = `${g.time.fps.toFixed(0)} FPS  ·  ${g.renderer.info.render.calls} draws  ·  ${g.enemies.length} ai`;
    }
  }
}
