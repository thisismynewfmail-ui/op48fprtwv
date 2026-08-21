/* SILICONE DREAMS — Config
 * Persistent settings, loaded from localStorage. Deliberately mirrors the
 * cvar-style naming of the era: r_ for render, m_ for mouse, snd_ for audio.
 */

const KEY = 'silicone.cfg.v1';

export const DEFAULTS = {
  // ---- render -------------------------------------------------------
  // The CRT layer is seasoning, not the meal. Everything here sits low on
  // purpose: the image should look like a well-lit 2003 render that happens
  // to be on a CRT, not like a VHS tape of one. Budget goes into geometry,
  // lights and shadows instead.
  r_scale: 1.0,           // render at native res; softness is no longer the effect
  r_bloom: 0.42,
  r_crt: 0.15,            // scanlines + aperture grille
  r_chroma: 0.15,         // chromatic aberration
  r_grain: 0.15,          // film grain
  r_warp: 0.15,           // screen curvature
  r_tracking: 0.10,       // VHS tracking wobble
  r_dither: 0.20,         // colour quantisation
  r_vignette: 0.35,
  r_shadows: 1,
  r_shadowRes: 2,         // 0 low, 1 med, 2 high, 3 ultra
  r_reflections: 1,
  r_lightShafts: 1,
  r_detail: 1,            // world geometry density
  r_maxfps: 0,
  r_fov: 84,
  r_viewbob: 0.7,

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
