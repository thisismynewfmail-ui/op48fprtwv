/* HALCYON — Menus
 * Title, pause, options, death and end-of-chapter screens.
 */
import { cfg, DEFAULTS, setCfg, resetCfg } from '../core/Config.js';
import { audio } from '../core/Audio.js';
import { input } from '../core/Input.js';
import { Director } from '../game/Director.js';

const $ = (id) => document.getElementById(id);

const SLIDERS = [
  ['RENDER', [
    ['r_scale', 'Resolution scale', 0.25, 1, 0.01, (v) => `${Math.round(v * 100)}%`],
    ['r_fov', 'Field of view', 60, 110, 1, (v) => `${v | 0}°`],
    ['r_bloom', 'Bloom', 0, 2, 0.05],
    ['r_crt', 'Scanlines', 0, 1, 0.05],
    ['r_chroma', 'Chromatic aberration', 0, 2, 0.05],
    ['r_grain', 'Film grain', 0, 2, 0.05],
    ['r_warp', 'Screen curvature', 0, 2, 0.05],
    ['r_tracking', 'VHS tracking', 0, 2, 0.05],
    ['r_dither', 'Colour dither', 0, 1, 0.05],
    ['r_vignette', 'Vignette', 0, 1, 0.05],
    ['r_viewbob', 'View bob', 0, 1.5, 0.05],
  ]],
  ['MOUSE', [
    ['m_sensitivity', 'Sensitivity', 0.0004, 0.008, 0.0001, (v) => (v * 1000).toFixed(1)],
  ]],
  ['AUDIO', [
    ['snd_master', 'Master', 0, 1, 0.02],
    ['snd_music', 'Music', 0, 1, 0.02],
    ['snd_sfx', 'Effects', 0, 1, 0.02],
  ]],
  ['INTERFACE', [
    ['hud_scale', 'HUD scale', 0.7, 1.4, 0.05],
  ]],
];

const TOGGLES = [
  ['m_invert', 'Invert mouse Y'],
  ['m_rawaccel', 'Mouse acceleration'],
  ['cc_enabled', 'Closed captions'],
  ['crosshair', 'Crosshair'],
  ['r_shadows', 'Shadows'],
  ['r_reflections', 'Mirror reflections (restart)'],
];

export class Menu {
  constructor(game) {
    this.game = game;
    this.screens = {
      title: $('title'),
      pause: $('pause'),
      options: $('options'),
      dead: $('dead'),
      end: $('end'),
      loading: $('loading'),
    };
    this.current = null;
    this.optionsFrom = 'title';
    this.buildOptions();
    this.wire();
  }

  show(name) {
    for (const k of Object.keys(this.screens)) this.screens[k]?.classList.toggle('on', k === name);
    this.current = name;
    if (name) input.exitLock();
    this.game.hud?.show(name === null || name === undefined);
  }
  hide() { this.show(null); }
  get isOpen() { return !!this.current; }

  wire() {
    const g = this.game;
    const click = (id, fn) => {
      const el = $(id);
      if (el) el.addEventListener('click', () => { audio.sfx_ui_confirm(1); fn(); });
    };

    click('mi-new', () => { this.hide(); g.startNewGame(); });
    click('mi-continue', () => {
      const save = Director.readSave();
      this.hide();
      g.startFromSave(save);
    });
    click('mi-options', () => { this.optionsFrom = 'title'; this.show('options'); });
    click('mi-controls', () => { this.optionsFrom = 'title'; this.show('options'); $('opt-controls')?.scrollIntoView(); });

    click('mi-resume', () => { this.hide(); g.setPaused(false); });
    click('mi-p-options', () => { this.optionsFrom = 'pause'; this.show('options'); });
    click('mi-p-restart', () => { this.hide(); g.restartChapter(); });
    click('mi-p-title', () => { this.show('title'); g.toTitle(); });

    click('mi-o-back', () => { this.show(this.optionsFrom); });
    click('mi-o-reset', () => { resetCfg(); this.syncOptions(); g.onConfigChanged?.(); });

    click('mi-respawn', () => { this.hide(); g.respawnFromCheckpoint(); });
    click('mi-d-restart', () => { this.hide(); g.restartChapter(); });
    click('mi-d-title', () => { this.show('title'); g.toTitle(); });

    click('mi-e-restart', () => { this.hide(); g.restartChapter(); });
    click('mi-e-title', () => { this.show('title'); g.toTitle(); });

    this.refreshContinue();
  }

  refreshContinue() {
    const btn = $('mi-continue');
    if (btn) btn.disabled = !Director.hasSave();
  }

  buildOptions() {
    const panel = $('options-panel');
    if (!panel) return;
    panel.innerHTML = '';
    for (const [group, rows] of SLIDERS) {
      const g = document.createElement('div');
      g.className = 'opt-group';
      g.innerHTML = `<h3>${group}</h3>`;
      for (const [key, label, min, max, step, fmt] of rows) {
        const row = document.createElement('div');
        row.className = 'opt-row';
        row.innerHTML = `<label>${label}</label>
          <input type="range" min="${min}" max="${max}" step="${step}" value="${cfg[key]}" data-k="${key}">
          <span class="val"></span>`;
        const input2 = row.querySelector('input');
        const val = row.querySelector('.val');
        const render = () => { val.textContent = fmt ? fmt(cfg[key]) : (+cfg[key]).toFixed(2); };
        input2.addEventListener('input', () => {
          setCfg(key, parseFloat(input2.value));
          render();
          this.game.onConfigChanged?.();
        });
        render();
        g.appendChild(row);
      }
      panel.appendChild(g);
    }

    const tg = document.createElement('div');
    tg.className = 'opt-group';
    tg.innerHTML = '<h3>TOGGLES</h3>';
    for (const [key, label] of TOGGLES) {
      const row = document.createElement('div');
      row.className = 'opt-row';
      row.innerHTML = `<label>${label}</label><button class="toggle" data-k="${key}"></button>`;
      const btn = row.querySelector('button');
      const render = () => {
        btn.classList.toggle('on', !!cfg[key]);
        btn.textContent = cfg[key] ? 'ON' : 'OFF';
      };
      btn.addEventListener('click', () => {
        setCfg(key, cfg[key] ? 0 : 1);
        render();
        audio.sfx_ui(1);
        this.game.onConfigChanged?.();
      });
      render();
      tg.appendChild(row);
    }
    panel.appendChild(tg);

    const cg = document.createElement('div');
    cg.className = 'opt-group';
    cg.id = 'opt-controls';
    cg.innerHTML = `<h3>CONTROLS</h3>
      <div class="opt-row"><label>Move</label><span>W A S D</span></div>
      <div class="opt-row"><label>Sprint / Crouch / Jump</label><span>SHIFT · CTRL · SPACE</span></div>
      <div class="opt-row"><label>Fire / Grab</label><span>LMB · RMB</span></div>
      <div class="opt-row"><label>Reload · Use · Next weapon</label><span>R · E · X</span></div>
      <div class="opt-row"><label>Dilate time (hold)</label><span>Q</span></div>
      <div class="opt-row"><label>Rewind four seconds</label><span>T</span></div>
      <div class="opt-row"><label>Stasis field</label><span>F</span></div>
      <div class="opt-row"><label>Weapons</label><span>1 2 3 4 · wheel</span></div>
      <div class="opt-row"><label>Console · Pause</label><span>\` · ESC</span></div>`;
    panel.appendChild(cg);
  }

  syncOptions() {
    const panel = $('options-panel');
    if (!panel) return;
    for (const el of panel.querySelectorAll('input[type=range]')) {
      el.value = cfg[el.dataset.k];
      el.dispatchEvent(new Event('input'));
    }
    for (const el of panel.querySelectorAll('button.toggle')) {
      el.classList.toggle('on', !!cfg[el.dataset.k]);
      el.textContent = cfg[el.dataset.k] ? 'ON' : 'OFF';
    }
  }
}
