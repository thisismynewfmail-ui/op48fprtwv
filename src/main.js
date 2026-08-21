/* SILICONE DREAMS — entry point */
import { Game } from './Game.js';
import { audio } from './core/Audio.js';
import { input } from './core/Input.js';
import { cfg } from './core/Config.js';

const canvas = document.getElementById('view');
const loadBar = document.querySelector('#load-bar > i');
const loadStatus = document.getElementById('load-status');

const STEPS = 14;
let step = 0;

function progress(label) {
  step++;
  loadBar.style.width = `${Math.min(100, (step / STEPS) * 100)}%`;
  loadStatus.textContent = label;
}

function fatal(err) {
  console.error(err);
  loadStatus.innerHTML = `<span style="color:#ff5a4a">${String(err && err.message || err)}</span>`;
  loadBar.style.background = '#ff5a4a';
}

(async () => {
  try {
    // WebGL availability check before we spend a second painting textures
    const test = document.createElement('canvas');
    if (!(test.getContext('webgl2') || test.getContext('webgl'))) {
      throw new Error('WebGL is not available in this browser.');
    }

    const game = new Game(canvas);
    window.GAME = game;                 // the console needs a handle

    await game.boot(progress);

    loadBar.style.width = '100%';
    loadStatus.textContent = 'ready';
    await new Promise((r) => setTimeout(r, 260));

    game.menu.show('title');
    game.hud.show(false);
    document.getElementById('loading').classList.remove('on');

    // the audio context can only start from a gesture
    const kick = () => { audio.init(); audio.resume(); audio.startMusic('temple'); };
    addEventListener('pointerdown', kick, { once: true });
    addEventListener('keydown', kick, { once: true });

    let raf = 0;
    const loop = (t) => { raf = requestAnimationFrame(loop); game.frame(t); };
    raf = requestAnimationFrame(loop);

    addEventListener('visibilitychange', () => {
      if (document.hidden && game.started && !game.paused) game.setPaused(true);
    });
  } catch (e) {
    fatal(e);
  }
})();
