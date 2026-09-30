import * as THREE from 'three';
import { limb, merge, clamp, damp, lerp, rand, pick, smoothstep, TAU } from './util.js';
import { SEA, seaMat } from './props/beach.js';
import { FERRY } from './world.js';

/*
 * The weather turning, out on the harbour (the giant cuttlefish brings it up with it: see Cuttle). The sky goes
 * dark and the haze closes in, the water turns slate grey and starts to heave, the rain comes down sideways and
 * lightning cracks down into the harbour, with the thunder rolling in after it. Once it's all over it clears as
 * quick as it came, and there's a rainbow over the way you're headed.
 */
const IN_T = 0.45, OUT_T = 0.28; // how quick it closes in and how quick it clears (1/s: see damp)
const SKY = new THREE.Color(0.3, 0.34, 0.41); // the sky, dimmed down to this at the height of it
const FOG = new THREE.Color(0x46505b), FOG_IN = 0.45; // the haze, gone grey, and closed in to this much of the way
const SEA_GREY = new THREE.Color(0x2a4f60); // the water, gone slate grey
const HEMI = 0.75, SUN = 0.3, SUN_GREY = new THREE.Color(0xaebfd6); // the light at the height of it (it's 1.6 and 2.4 on a fine day: see World), and the sun gone cold
const DROPS = 1100, BOX = 64, TOP = 30, FALL = 26, BLOW = [8, 3.5], STREAK = 0.04; // the rain: drops, the box they fall in round you (m across, m up), m/s down, m/s blown along (x, z), s of fall each streak shows
const EVERY = [2.2, 6]; // s between lightning strikes, at the height of it
const BOLT_H = 95, BOLT_T = 0.3; // m the bolts come down from, and s one's there for
const BOW = { dist: 230, r: 95, up: 42, band: 3.2, max: 0.32, in: 4, hold: 16, out: 7 }; // the rainbow after: m away, m across (half), m up at the top of it, m a band, how see-through at most, and s to come, stay and go
const BOW_COLS = [0xff4d4d, 0xff9e3d, 0xffe14f, 0x6fd46f, 0x4fa5ff, 0x5b5ce0, 0x9b5ce0]; // (outside to in)
const BED = [ // the sound of it (see Ambience.bed): rain hissing down, drumming on the deck, the wind howling, and the sea roaring
  { type: 'highpass', f: 2600, vol: 0.05, wobble: [[0.3, 0.13]] },
  { type: 'bandpass', f: 1100, q: 0.45, vol: 0.07, wobble: [[0.25, 0.31]] },
  { type: 'bandpass', f: 380, q: 3.5, vol: 0.06, wobble: [[0.65, 0.09], [0.4, 0.23]] },
  { type: 'lowpass', f: 150, vol: 0.14, wobble: [[0.4, 0.07]] },
];
const _c = new THREE.Color();

/** a jagged bolt of lightning, from the clouds (its top, at y 0) down to the water (y -BOLT_H), with a fork or two off it */
function boltGeo(r) {
  const parts = [], main = [];
  let x = 0, z = 0;
  for (let y = 0; y > -BOLT_H; y -= rand(5, 11)) {
    main.push([x, y, z]);
    x += rand(-4.5, 4.5);
    z += rand(-4.5, 4.5);
  }
  main.push([x, -BOLT_H - 2, z]);
  for (let i = 1; i < main.length; i++) parts.push(limb(main[i - 1], main[i], r, r, 0xffffff, 4));
  for (let f = 0; f < 3; f++) {
    let [fx, fy, fz] = main[1 + Math.floor(rand(0, main.length * 0.6))];
    const dx = rand(-1, 1), dz = rand(-1, 1);
    for (let i = 0, n = Math.floor(rand(2, 5)); i < n; i++) {
      const nx = fx + dx * rand(4, 8) + rand(-2, 2), ny = fy - rand(5, 9), nz = fz + dz * rand(4, 8) + rand(-2, 2);
      parts.push(limb([fx, fy, fz], [nx, ny, nz], r * 0.55, r * 0.4, 0xffffff, 4));
      [fx, fy, fz] = [nx, ny, nz];
    }
  }
  return merge(parts);
}

export class Storm {
  constructor(game) {
    this.game = game;
    const w = game.world, s = game.scene;
    this.k = 0; // how stormy it is (0 fine, 1 at the height of it)
    this.on = false; // (brewing: or clearing, once it's off)
    this.peak = 0; // (the worst it got, this time: a rainbow's only worth it after a proper storm)
    this.strikeT = rand(...EVERY);
    this.flash = 0; // (how bright the last flash still is, 0..1)
    this.pulses = []; // (the flickers still to come in the flash going now: [s from now, how bright])
    this.el = document.getElementById('flash');
    this.shown = -1;
    this.base = {
      sky: w.sky.material.color.clone(), fog: game.scene.fog.color.clone(), sea: seaMat().color.clone(),
      hemi: w.hemi.intensity, sun: w.sun.intensity, sunCol: w.sun.color.clone(),
    };

    // the rain: streaks falling in a box round wherever you are, blown along sideways
    const pos = new Float32Array(DROPS * 6);
    this.drops = Array.from({ length: DROPS }, () => [rand(-BOX / 2, BOX / 2), rand(0, TOP), rand(-BOX / 2, BOX / 2)]);
    this.rainGeo = new THREE.BufferGeometry();
    this.rainGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.rain = new THREE.LineSegments(this.rainGeo, new THREE.LineBasicMaterial({ color: 0xc3d2df, transparent: true, opacity: 0, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    s.add(this.rain);

    // the bolts (a few made up to begin with, one picked for each strike), each a white-hot core in a blue glow
    this.bolts = Array.from({ length: 4 }, () => {
      const geo = boltGeo(0.32), g = new THREE.Group();
      const core = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xf4f8ff, transparent: true, depthWrite: false, fog: false }));
      const glow = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x8fb4ff, transparent: true, opacity: 0.3, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
      glow.scale.set(3.2, 1, 3.2);
      g.add(glow, core);
      g.visible = false;
      g.traverse((o) => { o.userData.moves = true; }); // (nothing for the birds going over to fly into: see Flyovers)
      s.add(g);
      return { g, core, glow, t: 0 };
    });

    // and the rainbow after: an arc of bands, standing up out of the water, far off
    const ring = new THREE.RingGeometry(BOW.r - BOW.band * BOW_COLS.length, BOW.r, 72, BOW_COLS.length, 0, Math.PI);
    const rp = ring.attributes.position, col = new Float32Array(rp.count * 3);
    for (let i = 0; i < rp.count; i++) {
      const r = Math.hypot(rp.getX(i), rp.getY(i)), band = clamp(Math.floor((BOW.r - r) / BOW.band), 0, BOW_COLS.length - 1);
      _c.set(BOW_COLS[band]);
      col.set([_c.r, _c.g, _c.b], i * 3);
    }
    // (cut off where it goes into the water: none of it showing through, under the surface)
    for (let i = 0; i < rp.count; i++) rp.setY(i, Math.max(rp.getY(i), BOW.r - BOW.up));
    ring.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.bow = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false, side: THREE.DoubleSide }));
    this.bow.visible = false;
    this.bow.userData.moves = true;
    s.add(this.bow);
    this.bowT = -1; // (s since it came out, or -1: no rainbow)
  }

  /** here it comes */
  brew() {
    if (!this.on) this.strikeT = rand(1.5, 3);
    this.on = true;
  }

  /** and away it goes again */
  clear() { this.on = false; }

  /**
   * A bolt of lightning down into the harbour at (x, z) (or somewhere off in front of you that you'll see it), the
   * lot lit up in a flash, and the thunder after it: straight away, close by
   */
  strike(x = null, z = null) {
    const g = this.game, cam = g.camera.position;
    if (x === null) {
      // (out in front, off to one side or the other, a fair way off)
      const yaw = g.cam.yaw + rand(-0.55, 0.55), d = rand(70, 170);
      x = cam.x - Math.sin(yaw) * d;
      z = cam.z - Math.cos(yaw) * d;
    }
    const b = pick(this.bolts.filter((o) => !o.g.visible)) ?? this.bolts[0];
    b.g.position.set(x, SEA + BOLT_H, z);
    b.g.rotation.y = rand(0, TAU);
    b.g.scale.x = Math.random() < 0.5 ? -1 : 1;
    b.g.visible = true;
    b.t = 0;
    // (it flickers: a flash, and one or two more on top of it)
    this.pulses.length = 0;
    this.pulses.push([0, 1], [rand(0.07, 0.11), rand(0.45, 0.7)]);
    if (Math.random() < 0.6) this.pulses.push([rand(0.16, 0.24), rand(0.6, 0.9)]);
    const dist = Math.hypot(x - cam.x, z - cam.z);
    g.audio.thunder(clamp(1 - dist / 220, 0, 1), 0.15 + dist / 420);
  }

  /** every frame, after the camera's moved (it closes in the haze the camera's just set) */
  update(dt) {
    const g = this.game, w = g.world, b = this.base;
    this.k = damp(this.k, this.on ? 1 : 0, this.on ? IN_T : OUT_T, dt);
    if (this.k < 1e-3 && !this.on) this.k = 0;
    const k = this.k;
    this.peak = this.on ? Math.max(this.peak, k) : this.peak;

    // lightning, every so often (more often the worse it is)
    if (this.on && k > 0.5 && (this.strikeT -= dt) <= 0) {
      this.strikeT = rand(...EVERY) / k;
      this.strike();
    }
    for (const p of this.pulses) if ((p[0] -= dt) <= 0) this.flash = Math.max(this.flash, p[1]);
    this.pulses = this.pulses.filter((p) => p[0] > 0);
    this.flash *= Math.exp(-dt / 0.09);
    if (this.flash < 0.01) this.flash = 0;
    for (const o of this.bolts) {
      if (!o.g.visible) continue;
      o.t += dt;
      const a = o.t < BOLT_T ? (0.35 + 0.65 * this.flash) * (1 - smoothstep(BOLT_T * 0.6, BOLT_T, o.t)) : 0;
      o.core.material.opacity = a;
      o.glow.material.opacity = a * 0.32;
      if (o.t >= BOLT_T) o.g.visible = false;
    }

    // the sky, the haze and the light, all gone dark (and lit up, for a moment, in a flash)
    const f = this.flash;
    w.sky.material.color.copy(b.sky).lerp(SKY, k).multiplyScalar(1 + f * 1.1);
    g.scene.fog.color.copy(b.fog).lerp(FOG, k).lerp(_c.setRGB(0.8, 0.84, 0.95), f * 0.6);
    g.scene.fog.near *= lerp(1, FOG_IN, k);
    g.scene.fog.far *= lerp(1, FOG_IN, k);
    w.hemi.intensity = lerp(b.hemi, HEMI, k) + f * 3.2;
    w.sun.intensity = lerp(b.sun, SUN, k);
    w.sun.color.copy(b.sunCol).lerp(SUN_GREY, k);
    seaMat().color.copy(b.sea).lerp(SEA_GREY, k).lerp(_c.setRGB(0.55, 0.62, 0.72), f * 0.5);
    const op = Math.round(f * 0.5 * 100) / 100;
    if (op !== this.shown) { this.shown = op; this.el.style.opacity = op; }

    this.updateRain(dt);
    this.updateBow(dt);
    this.updateSound(dt);
  }

  /** the rain coming down (thicker the worse it is), in a box round the camera's target */
  updateRain(dt) {
    const g = this.game, k = this.k, on = k > 0.02;
    this.rain.visible = on;
    if (!on) return;
    const c = g.cam.target, arr = this.rainGeo.attributes.position.array, n = Math.floor(DROPS * Math.min(1, k * 1.25));
    const floor = Math.min(c.y - 4, 0);
    this.rain.material.opacity = 0.55 * k;
    for (let i = 0; i < n; i++) {
      const d = this.drops[i];
      d[0] += BLOW[0] * dt;
      d[1] -= FALL * dt;
      d[2] += BLOW[1] * dt;
      if (d[1] < 0) { d[1] += TOP; d[0] = rand(-BOX / 2, BOX / 2); d[2] = rand(-BOX / 2, BOX / 2); }
      // (wrapped round the box as it moves with you)
      const x = c.x + ((((d[0] - c.x) % BOX) + BOX * 1.5) % BOX) - BOX / 2, z = c.z + ((((d[2] - c.z) % BOX) + BOX * 1.5) % BOX) - BOX / 2, y = floor + d[1];
      const j = i * 6;
      arr[j] = x; arr[j + 1] = y; arr[j + 2] = z;
      arr[j + 3] = x - BLOW[0] * STREAK; arr[j + 4] = y + FALL * STREAK; arr[j + 5] = z - BLOW[1] * STREAK;
    }
    this.rainGeo.setDrawRange(0, n * 2);
    this.rainGeo.attributes.position.needsUpdate = true;
    // (and the drops pocking the water round about: not on the deck, though)
    for (this.pock = (this.pock ?? 0) + dt * 70 * k; this.pock >= 1; this.pock--) {
      const x = c.x + rand(-26, 26), z = c.z + rand(-26, 26);
      if (g.world.zoneOf(x, z) === FERRY && g.ferry.onDeck(x, z)) continue;
      g.fx.ripple(x, SEA + 0.05, z, rand(0.25, 0.5), 0.5, 0.22);
    }
  }

  /** once a proper storm's cleared: a rainbow, off in front of you, for a little while */
  updateBow(dt) {
    const g = this.game;
    if (this.bowT < 0) {
      if (this.on || this.peak < 0.8 || this.k > 0.3) return;
      this.peak = 0;
      this.bowT = 0;
      const c = g.cam.target, yaw = g.cam.yaw;
      this.bow.position.set(c.x - Math.sin(yaw) * BOW.dist, SEA + BOW.up - BOW.r, c.z - Math.cos(yaw) * BOW.dist);
      this.bow.rotation.set(0, yaw, 0);
      this.bow.visible = true;
    }
    const t = (this.bowT += dt);
    this.bow.material.opacity = BOW.max * smoothstep(0, BOW.in, t) * (1 - smoothstep(BOW.in + BOW.hold, BOW.in + BOW.hold + BOW.out, t)) * (1 - this.k);
    if (t > BOW.in + BOW.hold + BOW.out || this.on) { this.bow.visible = false; this.bowT = -1; }
  }

  /** the rain and the wind, under everything else, as loud as it's stormy (see Ambience); put away once it's fine */
  updateSound(dt) {
    const g = this.game, amb = g.ambience;
    if (!this.k && !this.bed) return;
    if (!g.started || !amb.ready()) return;
    this.bed ??= amb.bed(BED);
    this.idle = this.k ? 0 : (this.idle ?? 0) + dt;
    if (this.idle > 6) { this.bed.stop(); this.bed = null; return; }
    if ((this.soundT = (this.soundT ?? 0) - dt) > 0) return;
    this.soundT = 0.25;
    this.bed.out.gain.setTargetAtTime(this.k, g.audio.ctx.currentTime, 0.5);
  }

  /** straight back to fine weather, all at once (a save being put back, with nothing brewing) */
  reset() {
    this.on = false;
    this.k = this.flash = this.peak = 0;
    this.pulses.length = 0;
    this.bowT = -1;
    this.bow.visible = false;
    for (const o of this.bolts) o.g.visible = false;
  }
}
