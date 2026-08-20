/* HALCYON — Config
 * Persistent settings, loaded from localStorage. Deliberately mirrors the
 * cvar-style naming of the era: r_ for render, m_ for mouse, snd_ for audio.
 */

const KEY = 'halcyon.cfg.v1';

export const DEFAULTS = {
  // render
  r_scale: 0.70,          // internal resolution multiplier -> the 2003 softness
  r_bloom: 0.55,
  r_crt: 1.0,             // scanlines + aperture grille
  r_chroma: 1.0,          // chromatic aberration
  r_grain: 1.0,           // film/VHS grain
  r_warp: 1.0,            // barrel distortion
  r_tracking: 1.0,        // VHS tracking wobble
  r_dither: 1.0,          // 16-bit colour quantisation
  r_vignette: 1.0,
  r_shadows: 1,
  r_reflections: 1,
  r_maxfps: 0,
  r_fov: 82,
  r_viewbob: 1.0,

  // mouse
  m_sensitivity: 0.0022,
  m_invert: 0,
  m_rawaccel: 0,

  // audio
  snd_master: 0.8,
  snd_music: 0.55,
  snd_sfx: 0.9,

  // gameplay
  cc_enabled: 1,          // closed captions
  hud_scale: 1.0,
  crosshair: 1,
  difficulty: 1,          // 0 easy 1 normal 2 hard
};

const listeners = new Set();

function load() {
  let stored = {};
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) stored = JSON.parse(raw);
  } catch (e) { /* private mode / corrupt — fall back to defaults */ }
  return Object.assign({}, DEFAULTS, stored);
}

export const cfg = load();

export function setCfg(key, value) {
  if (!(key in DEFAULTS)) return false;
  const prev = cfg[key];
  cfg[key] = value;
  if (prev !== value) for (const fn of listeners) fn(key, value, prev);
  save();
  return true;
}

export function onCfgChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

let saveTimer = 0;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) { /* ignore */ }
  }, 250);
}

export function resetCfg() {
  Object.assign(cfg, DEFAULTS);
  for (const fn of listeners) fn('*', null, null);
  save();
}
