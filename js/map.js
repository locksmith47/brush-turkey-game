import * as THREE from 'three';
import { ZONES, FERRY, MILSONS, LUNA } from './world.js';
import { OX } from './props/milsons.js';
import { lerp, smoothstep, hash, noise } from './util.js';

/*
 * The map you get down in the tunnels (see Travel): a bird's-eye view, straight down on the world, with the way
 * on up the screen (the way you face down the first leg) and round the corner to the right. It's the world
 * itself, taken from high overhead the moment the map comes up (with no haze, no sky and no shadows: a map's
 * worth of it), so it's all just as you left it. Only the places you've been are there to see: everywhere else
 * is under cloud. Each place has its name on it, and each of your mounds a pin in it: pick one (click it, or the
 * arrow keys and Enter) to come out of it.
 *
 * Milsons Point and Luna Park are off on their own, a long way off in the world (see buildMilsons): on the map they
 * go over the water from the city, where they'd be, taken from overhead on their own and set in there.
 */
const PAD = 14; // metres round the places you've been, to the edges of the map (cloud, mostly)
const EDGE = { top: 104, right: 36, bottom: 72, left: 36 }; // px round the map kept clear of them, for the heading and the hint
// the cloud (all in px, so it looks the same however far out the map is): where it starts, out from the edge of a
// place you've been, how much further out it's thick, and how far in and out its edge wanders
const CLEAR = 2, FEATHER = 16, WOBBLE = 14;
const CELL = 4; // px: how fine the cloud's edge is worked out (then smoothed out, drawn up to size)
const HAZE = '#c3d1dc'; // (the cloud, deep down in between the puffs)
// the puffs of it, biggest first: px apart, how big (px: the radius of one, from, to), how much they show, and
// whether they throw a shadow (the smallest are only the odd wisp, lit up)
const PUFFS = [{ gap: 90, r: [60, 100], a: 1, shade: true }, { gap: 44, r: [26, 42], a: 0.85, shade: true }, { gap: 20, r: [10, 16], a: 0.35 }];
const NAMES = { [FERRY]: 'Sydney Harbour' }; // (what a place is called on the map, where it's not its own name)
const ISLE = [MILSONS, LUNA], SHIFT = { x: 310 - OX, z: -100 }; // (over the Bridge: and how far it moves, from the world onto the map)
/** where on the map the world's (x, z) is, into out */
const toMap = (x, z, out = { x: 0, z: 0 }) => {
  const isle = x < OX / 2;
  out.x = isle ? x + SHIFT.x : x;
  out.z = isle ? z + SHIFT.z : z;
  return out;
};
/** place i's rect, on the map */
const mapRect = (i) => {
  const [x0, z0, x1, z1] = ZONES[i].rect;
  return ISLE.includes(i) ? [x0 + SHIFT.x, z0 + SHIFT.z, x1 + SHIFT.x, z1 + SHIFT.z] : [x0, z0, x1, z1];
};
const _m = { x: 0, z: 0 };
const _s = { x: 0, y: 0 };

export class TravelMap {
  /** `onPick(m)`: mound m's been picked, to come out of */
  constructor(game, onPick) {
    this.game = game;
    this.onPick = onPick;
    this.el = document.getElementById('travel-map');
    this.canvas = this.el.querySelector('canvas');
    this.namesEl = this.el.querySelector('.names');
    this.pinsEl = this.el.querySelector('.pins');
    this.tunnel = this.el.querySelector('.tunnel path');
    this.crewEl = document.getElementById('travel-crew');
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 900);
    this.cam.up.set(0, 0, -1); // (the way on, down the first leg, up the screen)
    this.clouds = document.createElement('canvas'); // (the cloud, before it goes on the map)
    this.mask = document.createElement('canvas'); // (and where it's cleared off the places you've been)
    this.puff = puff('250, 252, 253');
    this.shade = puff('139, 158, 180');
    this.up = false;
    this.pins = [];
    this.sel = null;
    this.back = null; // (the mound you went in by last trip: the way back's picked out to start with)
  }

  /** up it comes: `mounds` (yours, in places you've been) pinned on it, `from` the one you went in by, `n` turkeys down here with you */
  open(from, mounds, n) {
    this.from = from;
    this.mounds = mounds;
    this.up = true;
    this.picked = null;
    this.crewEl.textContent = n ? `${n === 1 ? 'One turkey' : `${n} turkeys`} down here with you` : "It's just you down here";
    this.draw();
    // (picked out to start with: the way back, if you've just come from somewhere, or else the nearest)
    const d = (m) => Math.hypot(m.pos.x - from.pos.x, m.pos.z - from.pos.z);
    const others = mounds.filter((m) => m !== from).sort((a, b) => d(a) - d(b));
    this.select(others.includes(this.back) ? this.back : others[0] ?? from, true);
  }

  /** gone: all black again, down in the tunnels */
  close() {
    this.up = false;
    this.pins = [];
    this.sel = null;
    this.pinsEl.replaceChildren();
    this.namesEl.replaceChildren();
    this.tunnel.setAttribute('d', '');
  }

  /** the lot, drawn to fit the window: the world from overhead, the cloud, the names and the pins */
  draw() {
    this.fit(innerWidth || 1280, innerHeight || 720);
    this.shoot();
    this.cloud();
    this.pin();
    this.name();
  }

  /** where everything goes: the places you've been, fitted into the window (clear of the heading and the hint) */
  fit(W, H) {
    this.rects = [...this.game.visited].map(mapRect);
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [a, b, c, d] of this.rects) {
      x0 = Math.min(x0, a); z0 = Math.min(z0, b);
      x1 = Math.max(x1, c); z1 = Math.max(z1, d);
    }
    const k = Math.max((x1 - x0 + PAD * 2) / Math.max(1, W - EDGE.left - EDGE.right), (z1 - z0 + PAD * 2) / Math.max(1, H - EDGE.top - EDGE.bottom));
    this.W = W;
    this.H = H;
    this.k = k; // (metres to a pixel)
    this.cx = (x0 + x1) / 2 + ((EDGE.right - EDGE.left) / 2) * k; // (what's in the middle of the window)
    this.cz = (z0 + z1) / 2 + ((EDGE.bottom - EDGE.top) / 2) * k;
  }

  /** where on the screen (px) the map's (x, z) is (see toMap) */
  toScreen(x, z, out = _s) {
    out.x = this.W / 2 + (x - this.cx) / this.k;
    out.y = this.H / 2 + (z - this.cz) / this.k;
    return out;
  }

  /** how far (x, z) is from the nearest place you've been (0 in one) */
  outside(x, z) {
    let d = Infinity;
    for (const [x0, z0, x1, z1] of this.rects) d = Math.min(d, Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1)));
    return d;
  }

  /** the picture: the world from high overhead, straight down, copied onto the map */
  shoot() {
    const g = this.game, r = g.renderer, s = g.scene, w = g.world, cam = this.cam, W = this.W, H = this.H, k = this.k;
    cam.left = (-W / 2) * k;
    cam.right = (W / 2) * k;
    cam.top = (H / 2) * k;
    cam.bottom = (-H / 2) * k;
    cam.updateProjectionMatrix();
    cam.position.set(this.cx, 400, this.cz);
    cam.lookAt(this.cx, 0, this.cz);
    cam.updateMatrixWorld();
    // (no haze, no sky and no shadows: the haze pushed right out, and the shadows turned right down, rather than
    // either switched off, which would have every material in the world built over again, and again after. Nor
    // any trees or buildings gone see-through, from where the camera was)
    const fog = [s.fog.near, s.fog.far], dark = w.sun.shadow.intensity;
    s.fog.near = 1e5;
    s.fog.far = 2e5;
    w.sky.visible = false;
    w.sun.shadow.intensity = 0;
    r.shadowMap.autoUpdate = false;
    w.unfade();
    r.render(s, cam);
    // (and over the Bridge, if you've been: taken on its own, from over there, into its own bit of the picture)
    const isle = ISLE.filter((i) => this.game.visited.has(i)).map(mapRect);
    if (isle.length) {
      const m = (CLEAR + FEATHER + WOBBLE) * k + PAD, a = this.toScreen(Math.min(...isle.map((q) => q[0])) - m, Math.min(...isle.map((q) => q[1])) - m, { x: 0, y: 0 });
      const b = this.toScreen(Math.max(...isle.map((q) => q[2])) + m, Math.max(...isle.map((q) => q[3])) + m, { x: 0, y: 0 });
      cam.position.set(this.cx - SHIFT.x, 400, this.cz - SHIFT.z);
      cam.lookAt(this.cx - SHIFT.x, 0, this.cz - SHIFT.z);
      cam.updateMatrixWorld();
      r.setScissorTest(true);
      r.setScissor(a.x, H - b.y, b.x - a.x, b.y - a.y);
      r.render(s, cam);
      r.setScissorTest(false);
    }
    const c = this.canvas;
    c.width = r.domElement.width;
    c.height = r.domElement.height;
    c.getContext('2d').drawImage(r.domElement, 0, 0); // (straight away, before the page gets its hands on it)
    [s.fog.near, s.fog.far] = fog;
    w.sky.visible = true;
    w.sun.shadow.intensity = dark;
    r.shadowMap.autoUpdate = true;
  }

  /** the cloud over everywhere you've not been: billowing, soft-edged, and throwing its shadow over where you have */
  cloud() {
    const W = this.W, H = this.H, k = this.k, c = this.clouds, ctx = c.getContext('2d');
    c.width = W;
    c.height = H;
    ctx.fillStyle = HAZE;
    ctx.fillRect(0, 0, W, H);
    // puffs on puffs, each lot smaller than the last, on a grid, each nudged about a bit and bigger or smaller with
    // how thick the cloud is there; each lot's shadows first, low down and to the right of them, then their tops
    PUFFS.forEach(({ gap, r: [r0, r1], a, shade }, n) => {
      const list = [];
      for (let i = -2; i <= W / gap + 2; i++) {
        for (let j = -2; j <= H / gap + 2; j++) {
          const x = (i + hash(i, j, n * 3)) * gap, y = (j + hash(i, j, n * 3 + 1)) * gap;
          const r = lerp(r0, r1, hash(i, j, n * 3 + 2)) * (n ? 0.9 + 0.2 * noise(x / 160, y / 160) : 0.82 + 0.34 * noise(x / 320, y / 320));
          if (r > 2) list.push(x, y, r);
        }
      }
      ctx.globalAlpha = a;
      for (const [sprite, off] of shade ? [[this.shade, 0.2], [this.puff, -0.06]] : [[this.puff, -0.06]]) {
        for (let m = 0; m < list.length; m += 3) {
          const r = list[m + 2];
          ctx.drawImage(sprite, list[m] + r * (off - 1), list[m + 1] + r * (off - 1), r * 2, r * 2);
        }
      }
    });
    ctx.globalAlpha = 1;
    // ...then cleared off the places you've been: none of it on them, and its edge wandering in and out off them
    const m = this.mask, mw = (m.width = Math.ceil(W / CELL)), mh = (m.height = Math.ceil(H / CELL));
    const mc = m.getContext('2d'), img = mc.createImageData(mw, mh), a = img.data;
    for (let y = 0; y < mh; y++) {
      const sy = (y + 0.5) * CELL, z = this.cz + (sy - H / 2) * k;
      for (let x = 0; x < mw; x++) {
        const sx = (x + 0.5) * CELL, d = this.outside(this.cx + (sx - W / 2) * k, z) / k;
        a[(y * mw + x) * 4 + 3] = 255 * smoothstep(CLEAR, CLEAR + FEATHER, d + wobble(sx, sy) * WOBBLE * Math.min(1, d / WOBBLE));
      }
    }
    mc.putImageData(img, 0, 0);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(m, 0, 0, mw * CELL, mh * CELL);
    ctx.globalCompositeOperation = 'source-over';
    // and onto the map
    const out = this.canvas.getContext('2d'), dpr = this.canvas.width / W;
    out.save();
    out.shadowColor = 'rgba(20, 34, 48, .5)';
    out.shadowBlur = 14 * dpr;
    out.shadowOffsetY = 8 * dpr;
    out.drawImage(c, 0, 0, this.canvas.width, this.canvas.height);
    out.restore();
  }

  /** a pin in each of your mounds (the one you went in by marked as where you are) */
  pin() {
    this.pins = this.mounds.map((m) => {
      const at = toMap(m.pos.x, m.pos.z, _m), s = this.toScreen(at.x, at.z), el = document.createElement('div');
      el.className = `pin${m.beach ? ' beach' : m.padded ? ' padded' : ''}${m === this.from ? ' here' : ''}`;
      el.style.left = `${s.x}px`;
      el.style.top = `${s.y}px`;
      el.innerHTML = `<i>${m.beach ? '🏖️' : m.padded ? '🏏' : '🍂'}</i>${m === this.from ? '<span class="cap">You\'re here</span>' : ''}`;
      // (picked out as the mouse moves over it: not just for turning up under it, where it was as the map came up)
      el.addEventListener('pointermove', () => { if (this.up && !this.picked) this.select(m); });
      el.addEventListener('click', () => this.go(m));
      return { m, el, x: s.x, y: s.y };
    });
    this.pinsEl.replaceChildren(...this.pins.map((p) => p.el));
    if (this.sel) this.select(this.sel, true);
  }

  /** the name of each place you've been, over the middle of it (or up or down a bit, clear of the pins and each other) */
  name() {
    const taken = this.pins.map((p) => ({ x0: p.x - 24, x1: p.x + 24, y0: p.y - (p.m === this.from ? 84 : 56), y1: p.y + 2 }));
    const names = [...this.game.visited].sort((a, b) => a - b).map((i) => {
      const el = document.createElement('div');
      el.className = 'place';
      el.textContent = NAMES[i] ?? ZONES[i].name;
      return { i, el };
    });
    this.namesEl.replaceChildren(...names.map((n) => n.el));
    for (const { i, el } of names) {
      const [x0, z0, x1, z1] = mapRect(i), s = this.toScreen((x0 + x1) / 2, (z0 + z1) / 2);
      const w = el.offsetWidth / 2 + 4, h = el.offsetHeight / 2;
      // (the nearest it can be to where it goes, up or down, without covering anything; or, if there's nowhere, where
      // it covers the least)
      let box = null, least = Infinity;
      for (let n = 0; n < 40; n++) {
        const y = s.y + (n % 2 ? 1 : -1) * Math.ceil(n / 2) * 6, b = { x0: s.x - w, x1: s.x + w, y0: y - h, y1: y + h };
        let over = 0;
        for (const t of taken) over += Math.max(0, Math.min(t.x1, b.x1) - Math.max(t.x0, b.x0)) * Math.max(0, Math.min(t.y1, b.y1) - Math.max(t.y0, b.y0));
        if (over < least) { least = over; box = b; }
        if (!over) break;
      }
      taken.push(box);
      el.style.left = `${s.x}px`;
      el.style.top = `${(box.y0 + box.y1) / 2}px`;
    }
  }

  /** mound m's picked out (by the mouse, or the keys): the way there down the tunnels shows */
  select(m, quiet = false) {
    if (m === this.sel && !quiet) return;
    this.sel = m;
    for (const p of this.pins) p.el.classList.toggle('sel', p.m === m);
    const a = this.pins.find((p) => p.m === this.from), b = this.pins.find((p) => p.m === m);
    if (!a || !b || a === b) this.tunnel.setAttribute('d', '');
    else {
      // (bowed a little, like a tunnel dug the long way round)
      const dx = b.x - a.x, dy = b.y - a.y, bow = 0.16;
      this.tunnel.setAttribute('d', `M${a.x},${a.y} Q${(a.x + b.x) / 2 - dy * bow},${(a.y + b.y) / 2 + dx * bow} ${b.x},${b.y}`);
    }
    if (!quiet) this.game.audio.tick();
  }

  /** picked: that's the one you're coming out of */
  go(m) {
    if (!this.up || this.picked) return;
    this.select(m);
    this.picked = m;
    if (m !== this.from) this.back = this.from;
    this.pins.find((p) => p.m === m)?.el.classList.add('go');
    this.onPick(m);
  }

  /** the keys, while it's up: the arrows (or WASD) pick out the next mound over that way, Tab the next of them, and Enter (or Space, or F) goes */
  keys(input) {
    if (!this.up || this.picked) return;
    if (input.pressed('Enter', 'NumpadEnter', 'Space', 'KeyF')) { this.go(this.sel ?? this.from); return; }
    if (input.pressed('Tab')) {
      const i = this.mounds.indexOf(this.sel);
      this.select(this.mounds[(i + 1) % this.mounds.length]);
      return;
    }
    const dx = (input.pressed('ArrowRight', 'KeyD') ? 1 : 0) - (input.pressed('ArrowLeft', 'KeyA') ? 1 : 0);
    const dy = (input.pressed('ArrowDown', 'KeyS') ? 1 : 0) - (input.pressed('ArrowUp', 'KeyW') ? 1 : 0);
    if (dx || dy) this.toward(dx, dy);
  }

  /** the nearest pin that way (dx, dy: on the screen) from the one picked out, favouring ones straight that way */
  toward(dx, dy) {
    const a = this.pins.find((p) => p.m === this.sel), l = Math.hypot(dx, dy);
    if (!a) return;
    let best = null, bs = Infinity;
    for (const p of this.pins) {
      const ox = p.x - a.x, oy = p.y - a.y, along = (ox * dx + oy * dy) / l, across = Math.abs(ox * dy - oy * dx) / l;
      if (along <= 1) continue;
      const score = along + across * 2;
      if (score < bs) { bs = score; best = p; }
    }
    if (best) this.select(best.m);
  }
}

/* ---------------------------------------------------------------- cloud */
/** a soft round puff of colour `rgb`, fading out to its edge (drawn the once, then about the place at any size) */
function puff(rgb) {
  const c = document.createElement('canvas'), n = 64, ctx = c.getContext('2d');
  c.width = c.height = n;
  const gr = ctx.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  gr.addColorStop(0, `rgba(${rgb}, 1)`);
  gr.addColorStop(0.35, `rgba(${rgb}, .9)`);
  gr.addColorStop(0.7, `rgba(${rgb}, .45)`);
  gr.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, n, n);
  return c;
}

/** how far the cloud's edge has wandered at (x, y) on the screen: -1..1, big slow swings with smaller ones on top */
const wobble = (x, y) => noise(x / 70, y / 70) * 0.7 + noise(x / 24 + 31, y / 24 - 17) * 0.3;
