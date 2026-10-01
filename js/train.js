import * as THREE from 'three';
import { S } from './turkey.js';
import { part, merge, vcMesh, G, rand, clamp, smoothstep } from './util.js';
import { MUSEUM_STOP } from './props/hyde.js';
import { MILSONS_STOP } from './props/milsons.js';

/*
 * The train, from Museum to Milsons Point. She waits at the platform at Museum with her doors open: walk up to them
 * and press F, and you hop on, and your squad piles in after you (through whichever doors are nearest). The doors
 * chime and close, and off she goes into the tunnel, the camera staying put on the platform to watch her go; it all
 * goes dark, and comes back up at Milsons Point, with her in at the platform there, the doors opening and everyone
 * hopping off. Then she's off again, on into the hill towards North Sydney, and gone.
 *
 * Like going down the tunnels (see Travel), it's hands off while it lasts; any of the squad still on their way in
 * when the doors shut are taken along anyway.
 */
const CAR = 20, GAP = 0.3, W = 3.0, FLOOR = 1.1; // m: each carriage's length, the gap between them, how wide, and how high her floor is off the rails
const DOORS = [-1, 1].flatMap((c) => [-4.5, 4.5].map((d) => c * (CAR + GAP) / 2 + d)); // (x along her: the middle of each pair of doors)
const DOOR_W = 1.4, DOOR_H = 2.0; // (how wide a doorway is, and how tall)
const REACH = 2.4; // m from a doorway you can hop on from
const CREW_GAP = [0.15, 0.04, 0.9]; // the squad's off after you this long after you're on (s: the first, each after that, the last)
const JOIN_MAX = 5; // seconds for the squad to get on after you (any still on the way are taken along)
const SHUT_T = 1.6; // the chime, and the doors sliding shut
const PULL = 2.6; // m/s²: how hard she pulls away
const FADE_AT = 3.4, FADE_T = 1.6; // (seconds after she's off that it starts going dark, and how long that takes)
const DARK_T = 0.7; // all black, there and gone
const LIGHT_T = 1.4; // coming back up at Milsons Point
const OPEN_AT = 0.6, OFF_AT = 1.3; // (seconds in, her doors open, and you hop off)
const POP_GAP = [0.25, 0.07, 1.6]; // (and the squad after you: when the first's off, the gap after each, and all off by)
const LEAVE_AT = 2.2; // seconds after the last of you is off that she shuts up and goes
const WATCH = { ahead: 11, across: 0.5 }; // (the camera, watching her off at Museum: m along the track it looks, and radians round from straight down it)
const GONE = 70; // m along before she's out of sight, and back off to Museum to wait for you again
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

/* ------------------------------------------------------------------ her looks */
/** a carriage (lying along x, the rails at y 0): stainless steel, two decks of windows, the doors' frames, the bogies */
function carriageGeo(cabs) {
  const STEEL = 0xc9cdd1, STEEL2 = 0xb3b8bd, DARK = 0x2f3439, YELLOW = 0xf2c230, H = 4.35, L = CAR;
  const p = [
    part(G.box(L, H - 0.95, W), STEEL, [0, 0.95 + (H - 0.95) / 2, 0]),
    part(G.cyl(1, 1, L, 12, false), STEEL2, [0, H - 0.05, 0], [0, 0, Math.PI / 2], [0.32, 1, W / 2 - 0.02]), // (the roof, rounded over)
    part(G.box(L - 0.4, 0.5, W - 0.2), DARK, [0, 0.72, 0]), // (the underframe)
  ];
  for (const s of [-1, 1]) {
    const z = s * (W / 2 + 0.005);
    // (a band of windows along each deck: the lower one down low, the upper one up under the roof)
    for (const [y, h] of [[1.7, 0.75], [3.35, 0.8]]) p.push(part(G.box(L - 1.2, h, 0.02), DARK, [0, y, z]));
    p.push(part(G.box(L - 0.6, 0.12, 0.02), 0x8a9096, [0, 2.55, z]));
    // (the doorways: a yellow frame round each, the doors themselves being their own: see doorLeaf)
    for (const x of [-4.5, 4.5]) {
      p.push(part(G.box(DOOR_W + 0.5, DOOR_H + 0.3, 0.03), YELLOW, [x, FLOOR + DOOR_H / 2 + 0.05, s * (W / 2 + 0.01)]));
      p.push(part(G.box(DOOR_W, DOOR_H, 0.05), 0x15181b, [x, FLOOR + DOOR_H / 2, s * (W / 2 - 0.02)])); // (inside, through an open door)
    }
  }
  // the bogies, two to a carriage, each with its wheels
  for (const x of [-L / 2 + 2.6, L / 2 - 2.6]) {
    p.push(part(G.box(2.6, 0.45, W - 0.5), 0x24272a, [x, 0.45, 0]));
    for (const dx of [-0.9, 0.9]) for (const s of [-1, 1]) p.push(part(G.cyl(0.42, 0.42, 0.12, 14), 0x3a3d40, [x + dx, 0.42, s * 0.72], [Math.PI / 2, 0, 0]));
  }
  // and at either end of her, the driver's cab: a yellow face, its windscreen, and the lamps
  for (const k of cabs) {
    const x = k * (L / 2 + 0.02);
    p.push(part(G.box(0.12, H - 0.9, W - 0.02), YELLOW, [x, 0.9 + (H - 0.9) / 2, 0]));
    p.push(part(G.box(0.05, 0.9, W - 0.5), 0x1a2026, [x + k * 0.07, 3.0, 0]));
    for (const s of [-1, 1]) p.push(part(G.box(0.05, 0.18, 0.4), k > 0 ? 0xfff6d0 : 0xd8322a, [x + k * 0.07, 1.4, s * 1.0]));
    p.push(part(G.box(0.05, 0.3, 1.4), 0x24272a, [x + k * 0.07, 2.2, 0])); // (the destination board)
  }
  return merge(p);
}

/** a door leaf, yellow with a tall window, closed across its doorway (x: 0 at the middle, sliding outwards as it opens) */
function doorLeafGeo() {
  return merge([
    part(G.box(DOOR_W / 2, DOOR_H, 0.05), 0xf2c230, [0, DOOR_H / 2, 0]),
    part(G.box(DOOR_W / 2 - 0.22, DOOR_H * 0.5, 0.06), 0x2a3137, [0, DOOR_H * 0.62, 0]),
  ]);
}

/** a doorway onto the platform, for the squad to pile in through (it does for a mound's top, as far as they're concerned: see Turkey.diveAfter) */
class Doorway {
  constructor(ride, i) {
    this.ride = ride;
    this.i = i;
    this.pos = new THREE.Vector3();
    this.r = 0.8;
    this.h = 1.0;
  }

  /** where it is now, in the world (in from the edge of the platform by `in`) */
  place(stop, train) {
    train.localToWorld(this.pos.set(DOORS[this.i], FLOOR, stop.side * (W / 2 - 0.5)));
  }

  /** the spot on the platform in front of it, for one coming from p (`pad` further out) */
  edgePoint(p, out, pad = 0) {
    const s = this.ride.stop.side;
    return out.set(this.pos.x + clamp(p.x - this.pos.x, -0.45, 0.45), this.pos.y, this.pos.z + s * (0.9 + pad));
  }

  splash() {}

  /** in through it: one more aboard */
  enter() { this.ride.game.audio.peep(1); }
}

export class Ride {
  constructor(game) {
    this.game = game;
    this.train = new THREE.Group();
    const geoA = carriageGeo([-1]), geoB = carriageGeo([1]), leaf = doorLeafGeo();
    for (const [geo, x] of [[geoA, -(CAR + GAP) / 2], [geoB, (CAR + GAP) / 2]]) {
      const m = vcMesh(geo, { cast: true, receive: true });
      m.position.x = x;
      this.train.add(m);
    }
    // (the doors, both sides: two leaves to a doorway, each sliding off its own way)
    this.leaves = [];
    for (const s of [-1, 1]) {
      for (const x of DOORS) {
        for (const k of [-1, 1]) {
          const m = vcMesh(leaf, { cast: false });
          m.position.set(x + (k * DOOR_W) / 4, FLOOR, s * (W / 2 + 0.035));
          this.train.add(m);
          this.leaves.push({ m, x, k, s });
        }
      }
    }
    game.scene.add(this.train);
    this.doors = DOORS.map((_, i) => new Doorway(this, i));
    this.stage = null; // 'board' (hopping on), 'shut', 'leave' (off into the tunnel), 'dark', 'arrive' (in at Milsons Point), 'depart'
    this.t = 0;
    this.open = 1; // (how far open her doors are, 0..1)
    this.wait(MUSEUM_STOP);
    // (watching her go: the camera looks at a spot along the track towards the tunnel, from back along the platform)
    this.watchAt = new THREE.Vector3(MUSEUM_STOP.x + WATCH.ahead, MUSEUM_STOP.y + 1, MUSEUM_STOP.z);
    this.watchYaw = Math.atan2(-Math.cos(WATCH.across), MUSEUM_STOP.side * Math.sin(WATCH.across));
  }

  get active() { return this.stage !== null && this.stage !== 'depart'; }

  /** in at `stop`, at a standstill (her doors open, if it's Museum, where she waits for you) */
  wait(stop) {
    this.stop = stop;
    this.along = 0;
    this.speed = 0;
    this.train.position.set(stop.x, stop.y - FLOOR, stop.z);
    this.train.visible = true;
    this.train.updateMatrixWorld(true);
    for (const d of this.doors) d.place(stop, this.train);
    this.setOpen(stop === MUSEUM_STOP ? 1 : 0);
  }

  setOpen(k) {
    this.open = k;
    for (const l of this.leaves) {
      const out = l.s === this.stop.side ? k : 0;
      l.m.position.x = l.x + l.k * (DOOR_W / 4 + out * (DOOR_W / 2 - 0.04));
    }
  }

  /** the doorway nearest p, and how far it is (to the edge of the platform in front of it) */
  nearestDoor(p) {
    let best = null, bd = Infinity;
    for (const d of this.doors) {
      d.edgePoint(p, _v);
      const dist = Math.hypot(_v.x - p.x, _v.z - p.z);
      if (dist < bd) { bd = dist; best = d; }
    }
    return { door: best, d: bd };
  }

  /** could you hop on now? (she's waiting at Museum, and you're on the platform, by a door) */
  canBoard() {
    const g = this.game, p = g.player;
    if (this.stage || this.stop !== MUSEUM_STOP || p.life !== 'ok' || !g.started) return null;
    if (Math.abs(p.pos.y - this.stop.y) > 0.5) return null;
    const n = this.nearestDoor(p.pos);
    return n.d < REACH ? n.door : null;
  }

  /** F: on you hop, if you're by her doors (true if you did) */
  tryBoard() {
    const door = this.canBoard();
    if (!door) return false;
    this.board(door);
    return true;
  }

  /** on you hop, through `door`, and your squad after you (each through whichever door's nearest) */
  board(door) {
    const g = this.game, [first, each, last] = CREW_GAP, p = g.player;
    this.stage = 'board';
    this.t = 0;
    this.inT = null;
    this.from = door.pos.clone();
    p.board(this.from);
    const near = (t) => Math.hypot(t.pos.x - p.pos.x, t.pos.z - p.pos.z);
    this.crew = g.turkeys.list.filter((t) => t.state === S.FOLLOW).sort((a, b) => near(a) - near(b));
    this.crew.forEach((t, i) => t.diveAfter(this.nearestDoor(t.pos).door, first + Math.min(i * each, last) + rand(0, 0.15)));
    g.hud.clearToast();
    g.hud.told.add('train'); // (you know how it's done, then)
  }

  /** is this one of the squad still on its way on? */
  coming(t) {
    return this.doors.includes(t.hole) && (t.state === S.DIVE || (t.state === S.TUNNEL && t.tunnel === 'in'));
  }

  /** where a save made in the middle of all this should put you: on the platform you're getting on at, or off at */
  comeBack() {
    const s = this.stage === 'arrive' || this.stage === 'depart' || this.arrived ? MILSONS_STOP : MUSEUM_STOP;
    return _w.set(s.x + DOORS[1], s.y, s.z + s.side * (W / 2 + 1.6));
  }

  get zoom() { return this.game.cam.zoom; }

  /** is the camera down on the platform at Museum, watching her go? (and if so, from where: see watchAt) */
  get watching() { return this.stop === MUSEUM_STOP && (this.stage === 'shut' || this.stage === 'leave' || this.stage === 'dark'); }

  update(dt) {
    const g = this.game;
    if (!this.stage) { this.tell(); return; }
    const t = (this.t += dt), p = g.player;
    if (this.stage === 'board') {
      if (p.life !== 'aboard' || p.lifeT < 0.45) return;
      // (you're on: and the squad after you, or they've had long enough, and any still on the way are taken along)
      this.inT ??= t;
      if (this.crew.some((c) => this.coming(c)) && t - this.inT < JOIN_MAX) return;
      for (const c of this.crew) if (this.coming(c)) c.goUnder();
      this.stage = 'shut';
      this.t = 0;
      g.audio.chime();
    } else if (this.stage === 'shut') {
      this.setOpen(1 - smoothstep(0.5, SHUT_T, t));
      if (t >= SHUT_T) { this.stage = 'leave'; this.t = 0; g.audio.trainOff(); }
    } else if (this.stage === 'leave') {
      // off she goes, and into the tunnel; the camera stays where it is, on the platform, to watch her go
      this.go(dt);
      this.look(smoothstep(FADE_AT, FADE_AT + FADE_T, t));
      if (t >= FADE_AT + FADE_T) { this.stage = 'dark'; this.t = 0; }
    } else if (this.stage === 'dark') {
      this.look(1);
      if (t >= DARK_T) this.arrive();
    } else if (this.stage === 'arrive') {
      this.look(1 - smoothstep(0, LIGHT_T, t));
      this.setOpen(smoothstep(OPEN_AT, OPEN_AT + 0.8, t));
      if (t >= OPEN_AT && !this.opened) { this.opened = true; g.audio.chime(true); }
      if (t >= OFF_AT && p.life === 'aboard') p.alight(this.from, this.offSpot(this.nearestDoor(p.pos).door, 0, _v).clone());
      // (and the squad hops off after you, out of whichever doors are nearest them)
      const [first, each, last] = POP_GAP;
      while (this.popped < this.crew.length && t >= OFF_AT + first + Math.min(this.popped * each, last)) this.hopOff(this.crew[this.popped], this.popped++);
      if (this.popped >= this.crew.length && p.life === 'ok' && t >= OFF_AT + 0.6) {
        // you're all off: and after a moment, she's off again
        this.stage = 'depart';
        this.t = 0;
        this.look(0);
      }
    } else if (this.stage === 'depart') {
      if (t >= LEAVE_AT && t - dt < LEAVE_AT) g.audio.chime();
      this.setOpen(1 - smoothstep(LEAVE_AT, LEAVE_AT + 1, t));
      if (t >= LEAVE_AT + 1.2) {
        if (!this.speed) g.audio.trainOff(0.6);
        this.go(dt);
        if (this.along > GONE) { this.stage = null; this.arrived = false; this.wait(MUSEUM_STOP); }
      }
    }
  }

  /** pulling away, faster and faster, along +x (where she's going on to, wherever she is) */
  go(dt) {
    this.speed += PULL * dt;
    this.along += this.speed * dt;
    this.train.position.x = this.stop.x + this.along;
    if (this.along > GONE) this.train.visible = false;
  }

  /** it's all gone black: you're on her at Milsons Point, at the platform there, the squad aboard with you */
  arrive() {
    const g = this.game, p = g.player, cam = g.cam;
    this.stage = 'arrive';
    this.t = 0;
    this.arrived = true;
    this.opened = false;
    this.wait(MILSONS_STOP);
    const door = this.nearestDoor(_v.set(MILSONS_STOP.x, 0, MILSONS_STOP.z)).door;
    this.from = door.pos.clone();
    p.pos.copy(this.from);
    p.hopFrom.copy(this.from);
    p.hopTo.copy(this.from);
    this.crew = this.crew.filter((c) => c.state === S.TUNNEL && c.tunnel === 'under');
    for (const c of this.crew) { c.hole = door; c.pos.copy(door.pos); }
    this.popped = 0;
    // (the camera: straight round to look down the way on from here, and out over the harbour)
    cam.snapTo(this.offSpot(door, 0, _w));
    cam.target.set(this.from.x, this.from.y + 1, this.from.z + MILSONS_STOP.side * 1.5);
    cam.vista = 1;
  }

  /** a spot on the platform out of `door`, for the i-th one off it (spread out along it, and back from the edge) */
  offSpot(door, i, out) {
    const s = this.stop.side, row = Math.floor(i / 4), col = (i % 4) - 1.5;
    return out.set(door.pos.x + col * 0.7 + rand(-0.15, 0.15), this.stop.y, door.pos.z + s * (1.5 + 0.5 + row * 0.7));
  }

  /** one of the squad, off: out of the nearest door, in a hop, onto the platform, and after you again */
  hopOff(t, i) {
    if (t.state !== S.TUNNEL) return;
    const door = this.doors[[1, 2, 0, 3][i % 4]], to = this.offSpot(door, Math.floor(i / 4) * 4 + (i % 4), _v);
    t.dropEverything();
    t.pos.copy(door.pos);
    t.hopTo(to.x, to.z, 0.42, 0.55);
    t.joinAfterHop = true;
    this.game.audio.peep(t.stage);
  }

  /** how dark it's gone (0..1) */
  look(k) {
    const el = (this.el ??= document.getElementById('blackout'));
    const v = Math.round(k * 100) / 100;
    if (v !== this.shown) { this.shown = v; el.style.opacity = v; }
  }

  /** the first time you're on the platform by her open doors: how it's done */
  tell() {
    if (this.game.hud.told.has('train') || !this.canBoard()) return;
    this.game.hud.toastOnce('train', 'Press F to hop on the train, squad and all', 5);
  }
}
