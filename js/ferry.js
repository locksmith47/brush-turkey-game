import * as THREE from 'three';
import { vcMesh, rand, clamp, damp, lerp, smoothstep, TAU, canvasTexture, toonMat } from './util.js';
import { ferryParts, ferryPatches, swell, CABIN_X, CABIN_R, LANE } from './props/harbour.js';
import { SEA } from './props/beach.js';
import { DECK } from './props/wharf.js';
import { makeBird } from './flyover.js';
import { ZONES, WHARF, FERRY } from './world.js';
import { S } from './turkey.js';
import { Lever } from './lever.js';

/*
 * The Manly ferry. She's tied up at the wharf to begin with, and going nowhere till the keys are got back off
 * Captain Gull. After that, she takes you over to Circular Quay (or back) whenever you pull the lever on her deck
 * (there's one at either end), giving your flock a moment to follow you on; everything on her deck goes with her.
 * Gulls keep up with her either side, all the way across. And if you're over the other side from her, the lever on
 * the wharf calls her over.
 *
 * Halfway over, the first time you're aboard, she's brought up dead in the water by a giant cuttlefish (see
 * Cuttle), and sits there wallowing in the storm it brings up with it till it's seen off. Lose to it, and it drags
 * her under: she's fished out and back at the wharf when you come round, patched up (after a fashion).
 */
const DOCK = { wharf: 158.5, quay: 337.5 }; // x: where she ties up at either end (her gangway at the gate)
const HALF = 18, BEAM = 6; // m: her deck, either way from the middle of her
const TOP = 7.5; // m/s, flat out
const ACCEL = 1.1; // m/s²: getting up to speed, and slowing to come in
const BRAKE = 2.6; // m/s²: pulled up short, with a cuttlefish hanging off her
const JOLT = { k: 55, damp: 3.2 }; // (the rocking a knock sets off: how stiff she is, and how quick it dies away)
const BOARD_T = 1; // s from the lever being pulled to her casting off...
const WAIT_MAX = 6; // s: ...and at most this long, waiting on the stragglers in your flock
const CAST_T = 1.5; // s from the horn to moving off
// the levers: on her deck, one at either end by the cabin door (she's double-ended), in her frame ([x, z], and the
// way it goes over); and one on either wharf by the gangway, out in the world, to call her over
const LEVERS = { deck: [[-10.6, 2.2, Math.PI / 2], [10.6, -2.2, -Math.PI / 2]], wharf: [136.4, -219.8, Math.PI / 2], quay: [359.6, -219.4, -Math.PI / 2] };
// dragged under (see wreck): m down she goes, how far over she rolls (radians) and noses down, and s it takes her
const SINK = { depth: 9, roll: 0.34, pitch: 0.05, time: 3.2 };
const PATCHES = 3; // (the boards nailed over the damage: a lot more each time she's been sunk, up to this many)
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
    this.call = null; // { to, t }: her lever's been pulled, and she's off once your flock's aboard
    this.t = this.puffT = this.wakeT = this.bubbleT = 0;
    this.bounds = [0, LANE - BEAM, 0, LANE + BEAM];
    this.heave = this.roll = this.pitch = 0;
    this.held = false; // (stopped dead halfway over: see hold)
    this.rough = 0; // (0..1: how much she's being thrown about, in a storm)
    this.jolts = { roll: { a: 0, v: 0 }, pitch: { a: 0, v: 0 } }; // (knocks she's still rocking from: see jolt)
    this.wrecked = false; // (being dragged under: see wreck)
    this.sunk = this.wreckT = 0; // (0..1: how far under she's gone)
    this.heel = -1; // (which way she rolls over as she goes: -1, her left side down, headed for the Quay)
    this.patched = 0; // (how many times she's been fished out and patched up)

    this.group = new THREE.Group();
    const { hull, rails, cabins } = ferryParts();
    this.rails = vcMesh(rails, { cast: true, receive: true });
    this.cabins = vcMesh(cabins, { cast: true, receive: true });
    this.patches = [1, 2, 3].map((n) => { const m = vcMesh(ferryPatches(n), { cast: false, receive: true }); m.visible = false; return m; });
    this.group.add(vcMesh(hull, { cast: false, receive: true }), this.rails, this.cabins, ...this.nameBoards(), ...this.patches);
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
    // her levers: one at either end of her deck, to set her off; and one on each wharf, to call her over (with a post
    // each, to walk round)
    const sail = () => (this.state === 'docked' && !this.call && this.running() ? (this.docked === 'wharf' ? 'Set sail for Circular Quay' : 'Set sail for Manly') : null);
    const fetch = (side) => () => (this.state === 'docked' && !this.call && this.docked !== side && this.running() ? 'Call the ferry over' : null);
    this.levers = LEVERS.deck.map(([x, z, face]) => new Lever(game, this.group, [x, 0, z], face, { text: sail, pull: () => this.pulled() }));
    this.posts = LEVERS.deck.map(([x, z]) => ({ x: this.x + x, z: LANE + z, r: 0.3, dx: x }));
    w.colliders.push(...this.posts);
    for (const side of ['wharf', 'quay']) {
      const [x, z, face] = LEVERS[side];
      this.levers.push(new Lever(game, game.scene, [x, DECK, z], face, { text: fetch(side), pull: () => this.castOff(side) }));
      w.colliders.push({ x, z, r: 0.3 });
    }
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

  /**
   * The ground at (x, z) on her deck (it rocks a little, under way); over the side of her, it's the water. Going
   * under, anyone aboard her's left bobbing about on top of it
   */
  groundAt(x, z) {
    if (!this.onDeck(x, z, 0.8)) return swell(x, z, this.game.time, this.game.storm?.k ?? 0);
    const d = this.deckAt(x, z);
    return this.sunk ? Math.max(d, swell(x, z, this.game.time, this.game.storm?.k ?? 0) - 0.3) : d;
  }

  /** her deck at (x, z), wherever it's got to (under the water, even) */
  deckAt(x, z) { return DECK + this.heave - this.sunk * SINK.depth - (z - LANE) * this.roll + (x - this.x) * this.pitch; }

  /** is (x, z) aboard her (anywhere over her deck, give or take `pad` m)? */
  onDeck(x, z, pad = 0) { return Math.abs(z - LANE) < BEAM + 0.45 + pad && Math.abs(x - this.x) < HALF + 0.5 + pad; }

  /** how far over she's got: 0 at the wharf, 1 at the Quay */
  get across() { return (this.x - DOCK.wharf) / (DOCK.quay - DOCK.wharf); }

  /** the top of her funnel */
  funnel(out) { return out.set(this.x, DECK + 7.1, LANE); }

  /** every frame, early (before anybody aboard moves: she carries them first) */
  update(dt) {
    const g = this.game, w = g.world, p = g.player.pos, aboard = w.zoneOf(p.x, p.z) === FERRY;
    if (this.state === 'docked') this.waitAt(dt, aboard);
    else if (this.state === 'casting') { if ((this.t += dt) >= CAST_T) this.state = 'sailing'; }
    else this.sail(dt);
    if (this.wrecked) this.goingUnder(dt);
    this.rock(dt);
    this.fly(dt, aboard);
    // (her levers stay over while she's going anywhere, and they're back up once she's in)
    const going = this.state !== 'docked' || !!this.call;
    for (const l of this.levers) {
      l.on = going;
      l.update(dt, g.camera);
    }
  }

  /** is she running at all? (not till the keys are back in the gangway's padlock) */
  running() { return this.game.world.gates[WHARF].unlocked; }

  /** F: the lever you're by, pulled (true), or there's none you're by (false) */
  tryLever() {
    const p = this.game.player;
    const l = p.life === 'ok' && this.levers.find((o) => o.inReach(p.pos));
    if (!l) return false;
    l.tryPull();
    return true;
  }

  /** her lever's been pulled: she's off for the other side once your flock's followed you aboard */
  pulled() { this.call = { to: this.docked === 'wharf' ? 'quay' : 'wharf', t: 0 }; }

  /** tied up, going nowhere till somebody pulls a lever (and then, off she goes once they're all aboard) */
  waitAt(dt, aboard) {
    const g = this.game, w = g.world, p = g.player.pos, c = this.call;
    if (!c) return;
    // (you've got off again: she'll wait)
    if (!aboard) { this.call = null; return; }
    c.t += dt;
    const stragglers = g.turkeys.list.some((t) => t.state === S.FOLLOW && w.zoneOf(t.pos.x, t.pos.z) !== FERRY && Math.hypot(t.pos.x - p.x, t.pos.z - p.z) < 40);
    if (c.t > BOARD_T && (!stragglers || c.t > WAIT_MAX)) this.castOff(c.to);
  }

  /** gangways up, a blast on the horn, and she's off (to 'quay' or 'wharf') */
  castOff(to) {
    const g = this.game;
    this.state = 'casting';
    this.call = null;
    this.held = false;
    this.to = to;
    this.dir = to === 'quay' ? 1 : -1;
    this.docked = null;
    this.t = 0;
    for (const i of [WHARF, FERRY]) g.barriers.gates[i].setOpen(false);
    g.audio.horn();
    g.fx.burst(this.funnel(_v), { ...SMOKE, n: 8, speed: [0.2, 0.8] });
  }

  sail(dt) {
    const g = this.game, left = Math.abs(DOCK[this.to] - this.x);
    // (up to speed, then easing off to come in, stopping dead at the gangway; or pulled up short, and going nowhere)
    if (this.held) this.v = Math.max(0, this.v - BRAKE * dt);
    else this.v = Math.min(this.v + ACCEL * dt, TOP, Math.sqrt(2 * ACCEL * left) + 0.2);
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

  /** stopped dead in the water, halfway over (something's got hold of her: see Cuttle) */
  hold() { this.held = true; }

  /** and on her way again */
  release() { this.held = false; }

  /** dragged under by the giant cuttlefish, rolling over towards it (on her `side`, ±1 across her: see Cuttle.wreck) */
  wreck(side) {
    const g = this.game;
    this.wrecked = true;
    this.wreckT = 0;
    this.heel = side;
    this.jolt(this.x, LANE + side * BEAM, 0.6);
    g.audio.groan();
  }

  /** going down: over on her side, lower and lower in the water, in a welter of foam, and under */
  goingUnder(dt) {
    const g = this.game, k = (this.wreckT = Math.min(1, this.wreckT + dt / SINK.time));
    this.sunk = smoothstep(0.1, 1, k) ** 1.4;
    if (k < 1 && Math.random() < dt * 14) {
      const x = this.x + rand(-HALF, HALF), z = LANE + (Math.random() < 0.7 ? this.heel : -this.heel) * rand(BEAM - 1, BEAM + 1);
      g.fx.splash(x, swell(x, z, g.time, g.storm?.k ?? 0), z, rand(1, 2.2));
    }
    if ((this.bubbleT -= dt) <= 0 && this.sunk > 0.3) {
      this.bubbleT = 0.3;
      g.fx.ripple(this.x + rand(-HALF, HALF) * 0.7, SEA + 0.12, LANE + rand(-BEAM, BEAM), rand(3, 5), 1.4, 0.3);
    }
  }

  /** fished out, towed back and tied up at the wharf again: patched up after a fashion, and good to go. Nearly */
  refloat() {
    const g = this.game;
    this.wrecked = false;
    this.sunk = this.wreckT = 0;
    this.held = false;
    this.patched = Math.min(PATCHES, this.patched + 1);
    this.showPatches();
    this.shift(DOCK.wharf - this.x); // (with anything that was left aboard her)
    Object.assign(this, { state: 'docked', docked: 'wharf', to: null, call: null, v: 0, dir: 1 });
    for (const j of [this.jolts.roll, this.jolts.pitch]) j.a = j.v = 0;
    for (const i of [WHARF, FERRY]) g.barriers.gates[i].setOpen(false);
    this.openUp();
    this.rock(0);
  }

  /** the boards nailed over the damage, for every time she's been sunk */
  showPatches() { this.patches.forEach((m, i) => { m.visible = i < this.patched; }); }

  /** out in the harbour, turned round for the other side (to fetch you, if you've ended up back over there) */
  headFor(to) {
    if (this.state === 'docked' || this.to === to) return;
    this.to = to;
    this.dir = to === 'quay' ? 1 : -1;
    this.v = 0;
  }

  /** (dev) her, and everyone aboard her, a share `k` of the way over, and on her way to the Quay */
  skipTo(k) {
    if (this.state === 'docked') this.castOff('quay');
    else this.headFor('quay');
    this.shift(lerp(DOCK.wharf, DOCK.quay, k) - this.x);
  }

  /** a knock at (x, z) on her deck (a tentacle slapping down on her, say), `power` hard: it sets her rocking */
  jolt(x, z, power) {
    this.jolts.roll.v += power * clamp((z - LANE) / BEAM, -1, 1);
    this.jolts.pitch.v -= power * 0.35 * clamp((x - this.x) / HALF, -1, 1);
  }

  /** in at the other end: down goes the gangway */
  arrive() {
    const g = this.game;
    this.state = 'docked';
    this.docked = this.to;
    this.to = null;
    this.v = 0;
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
    for (const c of this.posts ?? []) c.x = x + c.dx;
    for (const c of this.perches.perches) c.spot.x += dx;
    this.bounds[0] = x - HALF;
    this.bounds[2] = x + HALF;
  }

  /**
   * A gentle roll and pitch, under way (none at all tied up: the gangway has to line up). In a storm she's thrown
   * about by the swell, and a knock sets her rocking on top of that (see jolt)
   */
  rock(dt) {
    const t = this.game.time, sailing = this.state === 'sailing', k = sailing ? this.v / TOP : 0;
    const s = (this.rough = damp(this.rough, sailing ? this.game.storm?.k ?? 0 : 0, 1.5, dt));
    for (const j of [this.jolts.roll, this.jolts.pitch]) {
      j.v -= (j.a * JOLT.k + j.v * JOLT.damp) * dt;
      j.a += j.v * dt;
    }
    // (and going under, she rolls over towards whatever's got her, and noses down)
    const over = smoothstep(0, 0.45, this.wreckT);
    this.heave = Math.sin(t * 0.9) * 0.04 * k + (0.2 * Math.sin(t * 0.83) + 0.07 * Math.sin(t * 1.9 + 1)) * s;
    this.roll = Math.sin(t * 0.7) * 0.008 * k + (0.032 * Math.sin(t * 0.61 + 0.5) + 0.01 * Math.sin(t * 1.37)) * s + this.jolts.roll.a + this.heel * SINK.roll * over;
    this.pitch = Math.sin(t * 0.5 + 1) * 0.004 * k + 0.01 * Math.sin(t * 0.47 + 2) * s + this.jolts.pitch.a - SINK.pitch * over;
    this.group.position.y = DECK + this.heave - this.sunk * SINK.depth;
    this.group.rotation.x = this.roll;
    this.group.rotation.z = this.pitch;
  }

  /** the gulls: catching up with her as she gets going, gliding along either side, and dropping back as she comes in */
  fly(dt, aboard) {
    const g = this.game, t = g.time, sailing = this.state === 'sailing' && (g.storm?.k ?? 0) < 0.15; // (they're off at the first sign of a storm)
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

  /**
   * For the save: where she is, where she's tied up (or headed), and how many times she's been patched up. (Going
   * under, she's as good as back at the wharf already, with another lot of boards on her)
   */
  save() {
    if (this.wrecked) return [DOCK.wharf, 'wharf', Math.min(PATCHES, this.patched + 1)];
    return [Math.round(this.x * 100) / 100, this.docked ?? this.to, this.patched];
  }

  /** back where she was (before anyone's put back aboard her) */
  load([x, where, patched = 0]) {
    const at = DOCK[where], g = this.game;
    this.patched = patched;
    this.showPatches();
    if (at === undefined) return;
    this.place(x);
    for (const i of [WHARF, FERRY]) g.barriers.gates[i].setOpen(false);
    if (Math.abs(x - at) < 0.01) {
      this.state = 'docked';
      this.docked = where;
      this.to = null;
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
