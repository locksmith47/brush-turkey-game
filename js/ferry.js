import * as THREE from 'three';
import { vcMesh, rand, clamp, damp, TAU, canvasTexture, toonMat } from './util.js';
import { ferryParts, CABIN_X, CABIN_R, LANE } from './props/harbour.js';
import { SEA } from './props/beach.js';
import { DECK } from './props/wharf.js';
import { makeBird } from './flyover.js';
import { ZONES, WHARF, FERRY, CITY } from './world.js';
import { S } from './turkey.js';

/*
 * The Manly ferry. She's tied up at the wharf to begin with, and going nowhere till the keys are got back off
 * Captain Gull. After that, she takes you over to Circular Quay (or back) whenever you come aboard, giving
 * your flock a moment to follow you on; everything on her deck goes with her. Gulls keep up with her either
 * side, all the way across. And if you're over the other side from her, she comes across to fetch you.
 */
const DOCK = { wharf: 158.5, quay: 337.5 }; // x: where she ties up at either end (her gangway at the gate)
const HALF = 18, BEAM = 6; // m: her deck, either way from the middle of her
const TOP = 7.5; // m/s, flat out
const ACCEL = 1.1; // m/s²: getting up to speed, and slowing to come in
const BOARD_T = 2.5; // s from you coming aboard to her casting off...
const WAIT_MAX = 8; // s: ...and at most this long, waiting on the stragglers in your flock
const FETCH_T = 4; // s you're over the other side of the harbour before she comes to get you
const CAST_T = 1.5; // s from the horn to moving off
const SMOKE = { n: 1, colors: [0xdedede, 0xcfcfcf, 0xbdbdbd], speed: [0.05, 0.3], up: [1.2, 2], grav: -0.3, drag: 0.5, size: [0.16, 0.26], grow: 2.2, life: [1.4, 2.2], jitter: 0.3 }; // (a puff from her funnel)
const _v = new THREE.Vector3();

export class Ferry {
  constructor(game) {
    this.game = game;
    const w = game.world;
    this.x = DOCK.wharf;
    this.v = 0;
    this.dir = 1; // (which way she's going, or last went: +1 over to the Quay)
    this.state = 'docked'; // 'docked' | 'casting' (off) | 'sailing'
    this.docked = 'wharf'; // (where she's tied up, if she is)
    this.to = null;
    this.landed = false; // (just in, with you still aboard: you get off before she goes anywhere again)
    this.t = this.boardT = this.fetchT = this.puffT = this.wakeT = 0;
    this.bounds = [0, LANE - BEAM, 0, LANE + BEAM];
    this.heave = this.roll = this.pitch = 0;

    this.group = new THREE.Group();
    const { hull, rails, cabins } = ferryParts();
    this.rails = vcMesh(rails, { cast: true, receive: true });
    this.cabins = vcMesh(cabins, { cast: true, receive: true });
    this.group.add(vcMesh(hull, { cast: false, receive: true }), this.rails, this.cabins, ...this.nameBoards());
    this.group.position.set(this.x, DECK, LANE);
    this.group.traverse((o) => { o.userData.moves = true; }); // (nothing for the birds going over to fly into: see Flyovers)
    game.scene.add(this.group);
    this.group.updateMatrixWorld(true);
    // (the cabins go see-through when they're in the way of the camera, and you walk round them)
    w.addOccluder(this.cabins);
    this.occluder = w.occluders[w.occluders.length - 1];
    this.cabin = w.addSegment(this.x - CABIN_X, LANE, this.x + CABIN_X, LANE, CABIN_R, true);
    // turkeys sit up along her rails, taking in the view (see Perches)
    const seats = [];
    for (const s of [-1, 1]) for (let x = -15.6; x < 16; x += 2.4) seats.push({ at: [x, 1.12, s * 6.35], face: s > 0 ? 0 : Math.PI, ground: [x, s * 5.1], hop: [0.4, 0.9] });
    this.perches = game.toys.addPerches(this.rails, seats, { spread: 2, time: [12, 30] });
    this.place(this.x);

    // and the gulls that come along for the ride: [which side, how far ahead of her middle, how far out]
    this.gulls = [[-1, 4, 9], [-1, -8, 11.5], [1, -3, 10], [1, 9, 12.5]].map(([side, ox, oz]) => {
      const rig = makeBird('gull');
      rig.root.scale.setScalar(2.4); // (bigger than life, so you can see them from up here)
      rig.root.visible = false;
      rig.root.traverse((o) => { o.userData.moves = true; });
      game.scene.add(rig.root);
      return { rig, side, ox, oz, ph: rand(0, TAU), flap: rand(0, TAU), amp: 0, glideT: rand(0.5, 2), flapT: 0 };
    });
    this.escort = 0; // (0..1: how far they've caught up with her)
    this.callT = rand(3, 6);
  }

  /** her name, along either side */
  nameBoards() {
    const tex = canvasTexture(512, 128, (c, w, h) => {
      c.fillStyle = '#f1e3b5'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = `bold ${Math.round(h * 0.72)}px serif`; c.fillText('MANLY', w / 2, h / 2 + 4);
    });
    return [-1, 1].map((s) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.85), toonMat({ map: tex, transparent: true }));
      m.position.set(0, 0.5, s * 6.45);
      m.rotation.y = s > 0 ? 0 : Math.PI;
      return m;
    });
  }

  /** the ground at (x, z) on her deck (it rocks a little, under way) */
  groundAt(x, z) { return DECK + this.heave - (z - LANE) * this.roll + (x - this.x) * this.pitch; }

  /** the top of her funnel */
  funnel(out) { return out.set(this.x, DECK + 7.1, LANE); }

  /** every frame, early (before anybody aboard moves: she carries them first) */
  update(dt) {
    const g = this.game, w = g.world, p = g.player.pos, aboard = w.zoneOf(p.x, p.z) === FERRY;
    if (this.state === 'docked') { if (w.gates[WHARF].unlocked) this.waitAt(dt, aboard); }
    else if (this.state === 'casting') { if ((this.t += dt) >= CAST_T) this.state = 'sailing'; }
    else this.sail(dt);
    this.rock();
    this.fly(dt, aboard);
  }

  /** tied up: off she goes once you've come aboard (and your flock after you), or over to the other side to fetch you */
  waitAt(dt, aboard) {
    const g = this.game, w = g.world, p = g.player.pos;
    if (!aboard) this.landed = false;
    if (aboard && !this.landed) {
      this.fetchT = 0;
      this.boardT += dt;
      const stragglers = g.turkeys.list.some((t) => t.state === S.FOLLOW && w.zoneOf(t.pos.x, t.pos.z) !== FERRY && Math.hypot(t.pos.x - p.x, t.pos.z - p.z) < 40);
      if (this.boardT > BOARD_T && (!stragglers || this.boardT > WAIT_MAX)) this.castOff(this.docked === 'wharf' ? 'quay' : 'wharf');
      return;
    }
    this.boardT = 0;
    const zone = w.zoneOf(p.x, p.z), side = zone < FERRY ? 'wharf' : zone === CITY ? 'quay' : null;
    if (side && side !== this.docked) { if ((this.fetchT += dt) > FETCH_T) this.castOff(side); }
    else this.fetchT = 0;
  }

  /** gangways up, a blast on the horn, and she's off (to 'quay' or 'wharf') */
  castOff(to) {
    const g = this.game;
    this.state = 'casting';
    this.to = to;
    this.dir = to === 'quay' ? 1 : -1;
    this.docked = null;
    this.t = 0;
    for (const i of [WHARF, FERRY]) g.barriers.gates[i].setOpen(false);
    g.audio.horn();
    g.fx.burst(this.funnel(_v), { ...SMOKE, n: 8, speed: [0.2, 0.8] });
    if (g.world.zoneOf(g.player.pos.x, g.player.pos.z) === FERRY) g.hud.toast(to === 'quay' ? 'All aboard! Next stop, Circular Quay' : 'All aboard! Back across to Manly', 3);
  }

  sail(dt) {
    const g = this.game, left = Math.abs(DOCK[this.to] - this.x);
    // (up to speed, then easing off to come in, stopping dead at the gangway)
    this.v = Math.min(this.v + ACCEL * dt, TOP, Math.sqrt(2 * ACCEL * left) + 0.2);
    const step = Math.min(left, this.v * dt);
    this.shift(this.dir * step);
    // (smoke from the funnel, and her wake spreading out behind her)
    if ((this.puffT -= dt) <= 0) {
      this.puffT = 0.25;
      g.fx.burst(this.funnel(_v), SMOKE);
    }
    if ((this.wakeT -= dt) <= 0) {
      this.wakeT = 0.45;
      const k = this.v / TOP;
      for (const s of [-1, 1]) g.fx.ripple(this.x - this.dir * (HALF + 0.5), SEA + 0.13, LANE + s * 4.5, 3.2, 2.6, 0.13 * k, 1.4);
      g.fx.ripple(this.x + this.dir * (HALF + 0.8), SEA + 0.13, LANE, 2.2, 1.2, 0.1 * k, 1); // (and a bow wave)
    }
    if (step >= left) this.arrive();
  }

  /** in at the other end: down goes the gangway */
  arrive() {
    const g = this.game;
    this.state = 'docked';
    this.docked = this.to;
    this.to = null;
    this.v = 0;
    this.boardT = this.fetchT = 0;
    this.landed = true;
    this.openUp();
    g.audio.horn();
  }

  /** the gangway at whichever end she's in (the wharf's, only once it's been unlocked) */
  openUp() {
    const g = this.game;
    if (this.docked === 'quay') g.barriers.gates[FERRY].setOpen(true);
    else if (this.docked === 'wharf' && g.world.gates[WHARF].unlocked) g.barriers.gates[WHARF].setOpen(true);
  }

  /** she moves dx along, and everything aboard goes with her: you, your flock, whatever's lying on the deck */
  shift(dx) {
    const g = this.game, [x0, z0, x1, z1] = ZONES[FERRY].rect;
    const on = (v) => v && v.x >= x0 && v.x < x1 && v.z >= z0 && v.z <= z1;
    const move = (v) => { if (on(v)) v.x += dx; };
    const p = g.player;
    if (on(p.pos)) {
      p.pos.x += dx;
      g.cam.target.x += dx;
      g.turkeys.rally.x += dx;
    }
    for (const t of g.turkeys.list) for (const v of [t.pos, t.target, t.workCenter, t.digSpot, t.flight?.from, t.flight?.to]) move(v);
    for (const e of g.enemies.list) {
      if (!on(e.pos)) continue;
      e.pos.x += dx;
      move(e.home);
      move(e.wanderTo);
    }
    for (const l of g.leaves.list) {
      if (l.state === 'off' || !on(l.pos)) continue;
      l.pos.x += dx;
      move(l.from);
      move(l.to);
      l.dirty = true;
    }
    for (const gr of g.grubs.list) move(gr.pos);
    this.place(this.x + dx);
  }

  /** put her at x (and her cabins, the seats along her rails, and where you can walk on her with her) */
  place(x) {
    const dx = x - this.x;
    this.x = x;
    this.group.position.x = x;
    this.group.updateMatrixWorld(true);
    this.occluder.box.translate(_v.set(dx, 0, 0));
    this.cabin.ax += dx;
    this.cabin.bx += dx;
    for (const c of this.perches.perches) c.spot.x += dx;
    this.bounds[0] = x - HALF;
    this.bounds[2] = x + HALF;
  }

  /** a gentle roll and pitch, under way (none at all tied up: the gangway has to line up) */
  rock() {
    const t = this.game.time, k = this.state === 'sailing' ? this.v / TOP : 0;
    this.heave = Math.sin(t * 0.9) * 0.04 * k;
    this.roll = Math.sin(t * 0.7) * 0.008 * k;
    this.pitch = Math.sin(t * 0.5 + 1) * 0.004 * k;
    this.group.position.y = DECK + this.heave;
    this.group.rotation.x = this.roll;
    this.group.rotation.z = this.pitch;
  }

  /** the gulls: catching up with her as she gets going, gliding along either side, and dropping back as she comes in */
  fly(dt, aboard) {
    const g = this.game, t = g.time, sailing = this.state === 'sailing';
    this.escort = damp(this.escort, sailing ? 1 : 0, sailing ? 0.8 : 1.2, dt);
    const k = this.escort, show = k > 0.02;
    for (const b of this.gulls) {
      const r = b.rig.root;
      r.visible = show;
      if (!show) continue;
      // (a few wingbeats, then a long glide)
      if (b.glideT > 0) { if ((b.glideT -= dt) <= 0) b.flapT = rand(0.6, 1.6); }
      else if ((b.flapT -= dt) <= 0) b.glideT = rand(1.5, 4);
      b.amp = clamp(b.amp + (b.glideT > 0 ? -dt : dt) * 4, 0, 1);
      b.flap += dt * 2.8 * TAU * (0.4 + b.amp * 0.6);
      const w = t * 0.27 + b.ph * 2, ahead = b.ox + Math.sin(t * 0.31 + b.ph) * 2.5 - (1 - k) * 45;
      r.position.set(this.x + this.dir * ahead, DECK + 5 + Math.sin(t * 0.83 + b.ph) * 0.8 + (1 - k) * 10, LANE + b.side * (b.oz + Math.sin(w) * 1.5));
      r.rotation.set(-0.05, this.dir * Math.PI / 2 - Math.cos(w) * 0.1 * b.side * this.dir, Math.cos(w) * 0.15 * b.side);
      const flap = 0.12 + 0.55 * b.amp * Math.sin(b.flap);
      b.rig.wingL.rotation.z = flap;
      b.rig.wingR.rotation.z = -flap;
    }
    if (aboard && k > 0.5 && (this.callT -= dt) <= 0) {
      this.callT = rand(5, 11);
      g.audio.gull(0.7);
    }
  }

  /** for the save: where she is, and where she's tied up (or headed) */
  save() { return [Math.round(this.x * 100) / 100, this.docked ?? this.to]; }

  /** back where she was (before anyone's put back aboard her) */
  load([x, where]) {
    const at = DOCK[where], g = this.game;
    if (at === undefined) return;
    this.place(x);
    for (const i of [WHARF, FERRY]) g.barriers.gates[i].setOpen(false);
    if (Math.abs(x - at) < 0.01) {
      this.state = 'docked';
      this.docked = where;
      this.to = null;
      this.landed = true; // (you'd have to get off and on again for her to go anywhere)
      this.openUp();
    } else {
      this.state = 'sailing';
      this.docked = null;
      this.to = where;
      this.dir = Math.sign(at - x);
      this.v = TOP * 0.6;
    }
  }
}
