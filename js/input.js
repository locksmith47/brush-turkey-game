import * as THREE from 'three';

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

    addEventListener('keydown', (e) => {
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.hits.add(e.code);
      this.down.add(e.code);
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => { this.down.clear(); this.lmb = this.rmb = this.mmb = false; });
    addEventListener('pointermove', (e) => {
      this.mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      if (this.mmb) { this.dragX += e.movementX; this.dragY += e.movementY; }
    });
    // mouse (not pointer) events fire for every button, even when several are held
    addEventListener('mousedown', (e) => {
      if (e.target.closest?.('#dev')) return; // clicking the dev menu isn't a throw
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
      if (e.target.closest?.('#help, #dev')) return; // scrolling the help panel, not zooming
      this.wheel += Math.sign(e.deltaY);
    }, { passive: true });
  }

  isDown(...codes) { return codes.some((c) => this.down.has(c)); }
  pressed(...codes) { return codes.some((c) => this.hits.has(c)); }

  endFrame() {
    this.hits.clear();
    this.lmbPressed = false;
    this.wheel = 0;
    this.dragX = this.dragY = 0;
  }
}
