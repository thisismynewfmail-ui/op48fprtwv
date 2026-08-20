/* HALCYON — Input
 * Pointer-lock mouselook, key bindings with rebinding support, and an
 * accumulated mouse delta that is consumed exactly once per frame.
 */
import { cfg } from './Config.js';

export const BINDS = {
  forward:   ['KeyW', 'ArrowUp'],
  back:      ['KeyS', 'ArrowDown'],
  left:      ['KeyA', 'ArrowLeft'],
  right:     ['KeyD', 'ArrowRight'],
  jump:      ['Space'],
  crouch:    ['ControlLeft', 'KeyC'],
  sprint:    ['ShiftLeft'],
  use:       ['KeyE'],
  reload:    ['KeyR'],
  flash:     ['KeyF'],
  dilate:    ['KeyQ'],
  rewind:    ['KeyT'],
  next:      ['KeyX'],
  slot1:     ['Digit1'],
  slot2:     ['Digit2'],
  slot3:     ['Digit3'],
  slot4:     ['Digit4'],
  console:   ['Backquote'],
  pause:     ['Escape'],
  score:     ['Tab'],
};

class InputSystem {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();     // edge: went down this frame
    this.released = new Set();
    this.mouse = { dx: 0, dy: 0, wheel: 0 };
    this.buttons = new Set();
    this.btnPressed = new Set();
    this.btnReleased = new Set();
    this.locked = false;
    this.enabled = true;
    this._onLockChange = new Set();
    this._textCapture = null;     // when set, keystrokes route to the console
    this.el = null;
  }

  attach(el) {
    this.el = el;
    addEventListener('keydown', this._kd = (e) => {
      if (e.code === 'Tab' || (e.code === 'Space' && this.locked)) e.preventDefault();
      if (this._textCapture) {
        // console owns the keyboard; still let it close itself
        if (this._textCapture(e)) e.preventDefault();
        return;
      }
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
    });
    addEventListener('keyup', this._ku = (e) => {
      this.keys.delete(e.code);
      this.released.add(e.code);
    });
    addEventListener('blur', () => { this.keys.clear(); this.buttons.clear(); });

    el.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      this.buttons.add(e.button); this.btnPressed.add(e.button);
    });
    addEventListener('mouseup', (e) => {
      this.buttons.delete(e.button); this.btnReleased.add(e.button);
    });
    addEventListener('mousemove', (e) => {
      if (!this.locked || !this.enabled) return;
      let mx = e.movementX || 0, my = e.movementY || 0;
      if (cfg.m_rawaccel) {
        const s = Math.min(2.5, 1 + Math.hypot(mx, my) * 0.004);
        mx *= s; my *= s;
      }
      this.mouse.dx += mx;
      this.mouse.dy += my * (cfg.m_invert ? -1 : 1);
    });
    el.addEventListener('wheel', (e) => {
      if (!this.locked) return;
      e.preventDefault();
      this.mouse.wheel += Math.sign(e.deltaY);
    }, { passive: false });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === el;
      if (!this.locked) { this.keys.clear(); this.buttons.clear(); }
      for (const fn of this._onLockChange) fn(this.locked);
    });
    document.addEventListener('pointerlockerror', () => {
      this.locked = false;
      for (const fn of this._onLockChange) fn(false);
    });
    // Chrome throws if requestPointerLock is called too soon after an exit.
    addEventListener('contextmenu', (e) => { if (this.locked) e.preventDefault(); });
  }

  onLockChange(fn) { this._onLockChange.add(fn); return () => this._onLockChange.delete(fn); }

  requestLock() {
    if (!this.el || this.locked) return;
    // Chrome rejects the promise if the call is not inside a user gesture, or
    // if it comes too soon after an exit. Neither is worth an unhandled throw.
    try {
      const p = this.el.requestPointerLock?.({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { this.el.requestPointerLock(); } catch (e) { /* no lock */ } });
    } catch (e) { /* no lock available */ }
  }
  exitLock() { if (this.locked) document.exitPointerLock(); }

  captureText(fn) { this._textCapture = fn; this.keys.clear(); }
  releaseText() { this._textCapture = null; }

  down(action) { const b = BINDS[action]; if (!b) return false; for (const c of b) if (this.keys.has(c)) return true; return false; }
  hit(action)  { const b = BINDS[action]; if (!b) return false; for (const c of b) if (this.pressed.has(c)) return true; return false; }
  up(action)   { const b = BINDS[action]; if (!b) return false; for (const c of b) if (this.released.has(c)) return true; return false; }

  mouseDown(btn) { return this.buttons.has(btn); }
  mouseHit(btn) { return this.btnPressed.has(btn); }
  mouseUp(btn) { return this.btnReleased.has(btn); }

  /** consume per-frame edges + accumulated mouse delta */
  endFrame() {
    this.pressed.clear(); this.released.clear();
    this.btnPressed.clear(); this.btnReleased.clear();
    this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheel = 0;
  }

  moveVector(out) {
    let x = 0, y = 0;
    if (this.down('forward')) y += 1;
    if (this.down('back')) y -= 1;
    if (this.down('right')) x += 1;
    if (this.down('left')) x -= 1;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    out.x = x; out.y = y;
    return out;
  }
}

export const input = new InputSystem();
