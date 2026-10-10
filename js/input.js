import * as THREE from 'three';

// a controller's buttons, in the browser's standard layout (an Xbox pad's): each one held goes in `down` (and in
// `hits`, the frame it goes down) under a code of its own, just like a key
const PAD = ['PadA', 'PadB', 'PadX', 'PadY', 'PadLB', 'PadRB', 'PadLT', 'PadRT', 'PadView', 'PadMenu', 'PadLS', 'PadRS', 'PadUp', 'PadDown', 'PadLeft', 'PadRight'];
const DEAD = 0.2; // how far a stick has to go before it counts (0-1: they never sit quite dead centre)
const TRIGGER = 0.35; // how far a trigger has to go in to count as pulled (0-1)
const FLICK = 0.6; // a stick pushed this far one way is a press that way, for picking things off the map (0-1)

// what to press for each thing, in words, for the toasts and tips ({pluck} and so on in the text): on the keyboard
// and mouse, and on a controller
const SAY = {
  pluck: ['E', 'A'],
  throw: ['left-click', 'pull RT'],
  whistle: ['right-click', 'LT'],
  mound: ['M', 'Y'],
  use: ['F', 'X'],
  kind: ['Tab', 'left or right on the D-pad'],
  camera: ['Z and C', 'LB and RB'],
};

/** a stick's x and y (y up), with the slop round the middle taken out and the rest stretched to fit */
function stick(out, x, y) {
  const m = Math.hypot(x, y);
  if (m < DEAD) return out.set(0, 0);
  const k = Math.min(1, (m - DEAD) / (1 - DEAD)) / m;
  return out.set(x * k, -y * k);
}
const _s = new THREE.Vector2();

export class Input {
  constructor() {
    this.down = new Set();
    this.hits = new Set();
    this.mouse = new THREE.Vector2(0, -0.3);
    this.lmb = false;
    this.lmbPressed = false;
    this.rmb = false;
    this.mmb = false;
    this.dragX = 0;
    this.dragY = 0;
    this.wheel = 0;
    // a controller: its sticks, and whether it's what you're playing with (the last thing touched)
    this.ls = new THREE.Vector2();
    this.rs = new THREE.Vector2();
    this.pad = false;
    this.flick = '';

    addEventListener('keydown', (e) => {
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.hits.add(e.code);
      this.down.add(e.code);
      this.usePad(false);
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => { this.down.clear(); this.lmb = this.rmb = this.mmb = false; });
    addEventListener('pointermove', (e) => {
      this.mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      if (this.mmb) { this.dragX += e.movementX; this.dragY += e.movementY; }
      if (Math.abs(e.movementX) + Math.abs(e.movementY) > 3) this.usePad(false); // (a proper move: not the mouse getting nudged)
    });
    // mouse (not pointer) events fire for every button, even when several are held
    addEventListener('mousedown', (e) => {
      this.usePad(false);
      if (e.target.closest?.('#dev, #travel, #paused')) return; // clicking the dev menu (or the map, down the tunnels, or the credits) isn't a throw
      if (e.button === 0) { this.lmb = true; this.lmbPressed = true; }
      if (e.button === 1) { this.mmb = true; e.preventDefault(); } // no autoscroll
      if (e.button === 2) this.rmb = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.lmb = false;
      if (e.button === 1) this.mmb = false;
      if (e.button === 2) this.rmb = false;
    });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('wheel', (e) => {
      if (e.target.closest?.('#help, #dev, #travel')) return; // scrolling the help panel, not zooming
      this.wheel += Math.sign(e.deltaY);
    }, { passive: true });
  }

  isDown(...codes) { return codes.some((c) => this.down.has(c)); }
  pressed(...codes) { return codes.some((c) => this.hits.has(c)); }

  /** playing on a controller now (or back on the keys): the words and button pictures on screen go with it */
  usePad(on) {
    if (on === this.pad) return;
    this.pad = on;
    document.body.classList.toggle('pad', on);
  }

  /** `text` with each {thing} in it swapped for what you press for it (see SAY), on whatever you're playing with */
  say(text) { return text.replace(/\{(\w+)\}/g, (m, k) => SAY[k]?.[this.pad ? 1 : 0] ?? m); }

  /**
   * Reads the controllers, once a frame, before anything looks at the input. Any plugged in count (their buttons
   * together, and whichever stick's pushed furthest), so it doesn't matter which one the browser lists first
   */
  poll() {
    const pads = navigator.getGamepads?.() ?? [];
    let any = false;
    this.ls.set(0, 0);
    this.rs.set(0, 0);
    const held = new Set();
    for (const gp of pads) {
      if (!gp?.connected) continue;
      gp.buttons.forEach((b, i) => {
        if (i < PAD.length && (b.pressed || b.value > TRIGGER)) held.add(PAD[i]);
      });
      const [lx = 0, ly = 0, rx = 0, ry = 0] = gp.axes;
      if (stick(_s, lx, ly).lengthSq() > this.ls.lengthSq()) this.ls.copy(_s);
      if (stick(_s, rx, ry).lengthSq() > this.rs.lengthSq()) this.rs.copy(_s);
    }
    for (const c of PAD) {
      if (held.has(c)) {
        if (!this.down.has(c)) { this.hits.add(c); this.down.add(c); }
        any = true;
      } else this.down.delete(c);
    }
    // (the left stick pushed one way, the moment it gets there: a press that way, like the D-pad's)
    const l = this.ls, f = l.length() < FLICK ? '' : Math.abs(l.x) > Math.abs(l.y) ? (l.x > 0 ? 'LsRight' : 'LsLeft') : (l.y > 0 ? 'LsUp' : 'LsDown');
    if (f && f !== this.flick) this.hits.add(f);
    this.flick = f;
    if (any || this.ls.length() > 0.5 || this.rs.length() > 0.5) this.usePad(true);
  }

  /** a shake through the controller (`k`: how hard, 0-1; `ms`: how long), if you're playing on one that can */
  rumble(k, ms = 150) {
    if (!this.pad) return;
    for (const gp of navigator.getGamepads?.() ?? []) {
      gp?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: k, weakMagnitude: Math.min(1, k * 1.5) }).catch(() => {});
    }
  }

  endFrame() {
    this.hits.clear();
    this.lmbPressed = false;
    this.wheel = 0;
    this.dragX = this.dragY = 0;
  }
}
