import * as THREE from 'three';
import { createRig, STAGES, HEN_SCALE } from './turkeyModel.js';
import { rand, clamp, damp, dampAngle, angleDiff, smoothstep, TAU } from './util.js';
import { BEACH } from './world.js';
import { BOOM } from './audio.js';

export const S = {
  SPROUT: 'sprout', POP: 'pop', FOLLOW: 'follow', THROWN: 'thrown', IDLE: 'idle', GOTO: 'goto',
  SEEK: 'seek', RAKE: 'rake', EAT: 'eat', LAUNCHED: 'launched', BURROW: 'burrow',
  ATTACK: 'attack', HAUL: 'haul', DYING: 'dying', HELD: 'held', EATEN: 'eaten', TOY: 'toy', SWING: 'swing', DROWN: 'drown',
  BUILD: 'build', DIGOUT: 'digout', DIVE: 'dive', TUNNEL: 'tunnel',
};
const WALKING = new Set([S.FOLLOW, S.IDLE, S.GOTO, S.SEEK, S.RAKE, S.EAT, S.HAUL, S.ATTACK, S.TOY, S.BUILD, S.DIGOUT, S.DIVE]);
const BUSY = new Set([S.IDLE, S.GOTO, S.SEEK, S.RAKE, S.EAT, S.ATTACK, S.HAUL, S.TOY, S.SWING, S.DROWN, S.BUILD]);
const SOIL_BITS = [0x7a5230, 0x8b6238, 0x5e3e22, 0x9c7a4f], SAND_BITS = [0xecd9a4, 0xe2cc92, 0xd8c286];
const HIDDEN_BODY = new Set([S.SPROUT, S.BURROW]);
const DPS = [1.0, 1.5, 2.2];

const WORK_R = 8;
// a chore (a barricade, a bin, a key to dig up) can wait: anything that fights back and comes this close (metres,
// to its edge) to a turkey that's at one, it turns on first
const FIGHT_R = 4;
// seconds in the ground to grow from a chick into a juvenile, and from a juvenile into an adult
const GROW_TIME = [27, 62];
// raking litter home: how much a turkey can shift in one clump (in leaves' worth), how far round the first
// bit of it it'll reach for the rest (thin litter, like under a tree, is spread about), and how far back
// one good kick flings it
const RAKE_WORTH = [5, 9, 13];
const RAKE_R = [2.4, 3, 3.6];
const KICK_REACH = [3.3, 4.05, 4.8];
// ...and the further the pile has to go, the harder it gets kicked: as usual near the mound, building up
// to twice as far for a pile a long way off (so a bin tipped over at the far end of the yard is worth it)
const KICK_BOOST = { near: 8, far: 30, max: 2 };
const KICK_BREATHER = 0.45; // after the last kick of a bout: a look at where it all landed, then off after it
const RAKE_TRIES = 3; // goes at a pile that get it nowhere before a turkey gives up on it
const SET_TIMEOUT = 6; // seconds trying to get in behind a pile before that counts as a wasted go
const BACK_UP = 5.5; // a pile landed further off than this and it turns and runs after it, rather than backing up
const SNUB_TIME = 45; // seconds everyone leaves a pile alone once it's been given up on
// brush turkeys have minds of their own: one that's got to a pile near a gum with a free spot on its
// branch will, one time in ten, forget all about raking and flap up to roost there instead (there's
// nearly always litter under a gum to be raking, so otherwise they'd hardly ever go up)
const ROOST_WHIM = 0.1, ROOST_NEAR = 7;
// easing into and out of a walk (a raking turkey scurrying after its pile, one settling into its spot)
const EASE_ACCEL = 8, EASE_DECEL = 5;
// turning with a bit of weight to it: it gets going into a turn and eases out of it (rad/s, rad/s²)
const TURN_RATE = 7, TURN_ACCEL = 30, TURN_DECEL = 18;
// the scratching rhythm (raking, digging, building): two big scrapes with one foot, a moment to
// change feet, two with the other, then a breather, like the real thing. Bigger birds work a touch quicker
const SCRAPE = 0.32, SWAP = 0.32, PAUSE = 0.55, CYCLE = SCRAPE * 4 + SWAP + PAUSE;
const SCRAPE_RATE = [0.86, 0.93, 1];
// when in a cycle each scrape lands (halfway through it, as the foot snaps back)
const HITS = [0.5, 1.5, 2.5, 3.5].map((k, i) => k * SCRAPE + (i > 1 ? SWAP : 0));

const SWAPPING = { swap: true };

/**
 * Where a scratching turkey is in its rhythm: { leg, u (0..1 through the scrape), i } mid-scrape,
 * { swap: true } while it changes feet, or null having a breather
 */
function scrapeAt(clock) {
  let c = ((clock % CYCLE) + CYCLE) % CYCLE;
  if (c < SCRAPE * 2) {
    const i = Math.floor(c / SCRAPE);
    return { leg: 'L', u: (c - i * SCRAPE) / SCRAPE, i };
  }
  c -= SCRAPE * 2 + SWAP;
  if (c < 0) return SWAPPING;
  if (c >= SCRAPE * 2) return null;
  const i = Math.floor(c / SCRAPE);
  return { leg: 'R', u: (c - i * SCRAPE) / SCRAPE, i: i + 2 };
}

/** how many scrapes have landed by this point on the scratch clock */
function scrapesBy(clock) {
  const n = Math.floor(clock / CYCLE), c = clock - n * CYCLE;
  let k = 0;
  for (const h of HITS) if (c >= h) k++;
  return n * 4 + k;
}

/** the swing of a kicking leg through one scrape (u 0..1): drawn up under the body, raked back, brought home */
function kickSwing(u) {
  const ease = (k) => k * k * (3 - 2 * k);
  const easer = (k) => k * k * k * (k * (k * 6 - 15) + 10); // (eases right in and right out)
  if (u < 0.3) return -0.4 * ease(u / 0.3);
  if (u < 0.66) return -0.4 + 1.7 * easer((u - 0.3) / 0.36);
  return 1.3 * (1 - ease((u - 0.66) / 0.34));
}
/** how close the point (px, pz) comes to the segment a->b */
function segDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz;
  const t = l2 ? clamp(((px - ax) * vx + (pz - az) * vz) / l2, 0, 1) : 0;
  return Math.hypot(ax + vx * t - px, az + vz * t - pz);
}
const BODY_MID = 0.45; // height of the middle of the body in the rig (what a somersault turns about)
// leaning right into a shove (a barricade, a bin): how far it tips forward, and how far its head goes down (radians)
const PUSH_TIP = 0.42, PUSH_NECK = 0.25;
// (cricket kit, on a turkey hatched on the oval, is a second life: the first time it's hurt, whether pecked,
// swooped on, bitten, raked, stomped on or even swallowed, the kit takes it and comes off, and the turkey
// lives on without it. It's no help to one that's drowning, though)
const DROWN_TIME = 6; // seconds a landlubber lasts in deep water before it's a goner
const RESCUE_TIME = 6; // seconds a whistled turkey gets to paddle back out
// following you into a mound (see Travel): how far out from the edge of it it takes off from, and how long it
// takes getting that close before it has a go from wherever it's got to (if that's not too far off)
const LEAP_FROM = 0.7, LEAP_LATE = 3.5, LEAP_MAX = 8;
// following you, with a mound in the way: metres it keeps off the mound going round it, how far ahead it aims along
// the way round, how much shorter (radians round the mound) the other way round to you has to be before it turns back,
// and how many seconds ahead of you it looks for where you're off to
const ROUND_PAD = 0.25, ROUND_AHEAD = 2, ROUND_GIVE = 0.6, ROUND_LEAD = 1;
// a cock showing off (see showOff): seconds puffing himself up before he booms, holding it once he's done, and going
// back down after; how far his wattle swells (times: side to side, up and down, and out in front), and how much more it
// pumps out with each note of his boom (see BOOM, in audio.js)
const SHOW = { puff: 0.7, hold: 0.3, down: 0.6, size: [1.5, 1.4, 1.65], pump: 0.16 };
const BOOM_END = BOOM.at(-1)[0] + BOOM.at(-1)[1]; // (seconds into his boom that the last note's done)
const _v = new THREE.Vector3(), _r = new THREE.Vector3(), _d = new THREE.Vector3(), _w = new THREE.Vector3();
const _o = new THREE.Vector3(); // (the way round a mound)
const _k = new THREE.Vector3(), _s = new THREE.Vector3(); // (which way a pile's being raked, and where to stand to do it)
const _at = new THREE.Vector3(), _af = new THREE.Vector3(); // (where to stand to go at a foe, and what to face)
const _pile = [];

let nextId = 1;

export class Turkey {
  constructor(game, stage, x, z, state = S.SPROUT, kind = 'normal') {
    this.game = game;
    this.id = nextId++;
    this.stage = stage;
    this.kind = kind; // 'normal' or 'beach' (boardshorts, snorkel, swims)
    this.gear = null; // cricket kit it's wearing, if it hatched on the oval: { helmet, pads }
    this.variant = Math.floor(Math.random() * 6);
    this.hen = Math.random() < 0.5; // (it only shows once it's grown up)
    this.rescued = 0; // seconds a whistled non-swimmer may paddle through deep water
    this.drownT = 0;
    this.deepT = 0; // how long a landlubber has been out of its depth
    this.drownA = 0;
    this.swimming = false;
    this.rippleT = rand(0, 0.5);
    this.playCool = 0; // just got off a ride: don't hop straight back on
    this.pos = new THREE.Vector3(x, game.world.groundHeight(x, z), z);
    this.vel = new THREE.Vector3();
    this.heading = rand(0, TAU);
    this.state = state;
    this.t = 0;
    this.clump = []; // litter it's raking back to a mound
    this.rakeTo = null;
    this.rakeMemo = {};
    this.rakePhase = 'set'; // 'set': getting behind the pile, 'kick': feet planted, flinging it back
    this.kickDir = new THREE.Vector3(); // which way this bout of kicks sends the pile (it faces the other way)
    this.kickPlan = [[], [], [], []]; // what each of the four kicks sends flying: left half, then right half
    this.kickN = 0;
    this.kickRest = 0;
    this.grub = null;
    this.foe = null; // the foe being attacked
    this.watchT = 0; // (at a chore: when it next looks round for anything coming at it)
    this.latched = false;
    this.attachLocal = null;
    this.obj = null; // carcass being hauled
    this.slot = -1;
    this.workCenter = null;
    this.target = new THREE.Vector3();
    this.growT = 0;
    this.flight = null;
    this.flung = false;
    this.stun = 0;
    this.dead = false;
    this.removed = false;
    this.peck = 0;
    this.peckDone = null;
    this.phase = rand(0, TAU);
    this.look = 0; this.lookTarget = 0; this.lookTimer = rand(0.5, 2); this.tilt = 0;
    this.squash = 0;
    this.turnV = 0; this.turnAt = -1; // (how fast it's turning, for turns with some weight to them)
    this.roundSide = 0; // (following you round a mound: which way round it's going, see roundMound)
    // the scratching pose, eased: the stoop, the head, the kicking and bracing legs, the weight going side to side
    this.stoop = 0; this.stoopNeck = 0; this.kickLean = 0; this.legLs = 0; this.legRs = 0; this.scrLean = 0;
    this.wasScratching = false;
    this.sunT = 0; this.sunIn = 0; this.sunSide = 1; // sunbaking: time left, time in, which way it's leaning
    // showing off (a cock): time into it, whether he's boomed yet and how fast (and high) he goes, how puffed up he is
    this.showT = 0; this.boomed = false; this.boomRate = 1; this.puff = 0;
    this.scanT = rand(0, 0.5);
    this.buildRig();
  }

  get def() { return STAGES[this.stage]; }
  /** how big it's drawn (grown-up hens a touch smaller: same bird otherwise) */
  get scale() { return this.def.scale * (this.hen && this.stage === 2 ? HEN_SCALE : 1); }
  get radius() { return this.def.radius; }
  get grounded() { return WALKING.has(this.state) && !this.latched && !this.dead; }
  get busy() { return BUSY.has(this.state) && !this.dead; }
  /** a cock stood still on dry land, with nothing on (with you, or where you left him): he could show off */
  get canShow() {
    return !!this.rig.wattle && !this.showT && this.sunT <= 0 && !this.peck && !this.swimming && !this.dead
      && (this.state === S.FOLLOW || this.state === S.IDLE) && this.vel.lengthSq() < 0.05;
  }
  /** bouncing on a trampoline (or a beach umbrella, or Big Kev's belly), or on its way up onto one */
  get bouncing() {
    if (this.state !== S.THROWN || this.dead) return false;
    return this.bounces > 0 || (!!this.flight && !this.flight.seat && !!this.game.toys.bouncerAt(this.flight.to));
  }
  get canSwim() { return this.kind === 'beach'; }
  /** how far out in front of its feet its beak gets, leaning right into a shove (so it knows how far back to stand) */
  get pushReach() {
    const n = this.rig.neckPos, b = this.rig.beak.position;
    // (the beak, dipped with the neck; then that, from the base of the neck, all tipped forward with the body)
    const y = n.y + b.y * Math.cos(PUSH_NECK) - b.z * Math.sin(PUSH_NECK);
    const z = n.z + b.y * Math.sin(PUSH_NECK) + b.z * Math.cos(PUSH_NECK);
    return (y * Math.sin(PUSH_TIP) + z * Math.cos(PUSH_TIP)) * this.scale;
  }

  buildRig() {
    if (this.rig) this.game.scene.remove(this.rig.root);
    this.rig = createRig(this.stage, this.kind, this.variant, this.hen, this.gear);
    this.game.scene.add(this.rig.root);
    this.applyVisibility();
    this.pose(0);
  }

  applyVisibility() {
    const hidden = HIDDEN_BODY.has(this.state);
    const r = this.rig;
    r.body.visible = r.legL.visible = r.legR.visible = r.wingL.visible = r.wingR.visible = !hidden;
    r.dirt.visible = hidden;
    r.root.visible = this.state !== S.EATEN;
  }

  setState(s) {
    this.state = s;
    this.t = 0;
    this.sunT = 0; // (up it gets, whatever it's off to do)
    this.showT = 0; // (and that's the end of any showing off)
    this.roundSide = 0;
    this.applyVisibility();
  }

  setStage(s) {
    this.stage = clamp(s, 0, 2);
    this.buildRig();
    const p = this.pos.clone(); p.y += 0.5;
    this.game.fx.sparkle(p, 18);
    this.game.fx.ring(this.pos, 0xffe066, 1.2, 0.5);
    this.game.audio.grow();
  }

  /* ------------------------------------------------------------------ commands */
  pluck() {
    this.setState(S.POP);
    this.game.fx.dirt(this.pos, 10);
    this.game.audio.pluck();
  }

  joinSquad() {
    if (this.bouncing) {
      // one last boing (at the next landing), then off it hops back to you (it only needs telling once)
      if (this.bounceRejoin && this.bounces === 1) return false;
      this.bounces = 1;
      this.bounceRejoin = true;
      return true;
    }
    if (!this.busy) return false;
    const drowning = this.state === S.DROWN, seat = this.state === S.SWING ? this.seat : null;
    this.dropEverything();
    this.workCenter = null;
    if (drowning) {
      this.rescued = RESCUE_TIME;
      this.deepT = 0;
      this.setState(S.FOLLOW);
      this.game.audio.peep(this.stage);
      return true;
    }
    const up = this.pos.y - this.game.world.groundHeight(this.pos.x, this.pos.z);
    if (this.game.world.waterDepth(this.pos.x, this.pos.z) === 0 && up > 0.05) {
      // up on something (clinging to an ibis, roosting in a tree, sitting in the stands): hop down first
      const down = seat?.set.hopDown?.(seat.i); // (out of the stands: down in front, not in amongst the seats)
      if (down) this.hopTo(down.x, down.z, down.T, down.h);
      else this.hopTo(this.pos.x + rand(-0.8, 0.8), this.pos.z + rand(-0.8, 0.8), 0.35 + up * 0.08);
      this.joinAfterHop = true;
      return true;
    }
    this.setState(S.FOLLOW);
    this.squash = 1;
    this.game.audio.peep(this.stage);
    return true;
  }

  /**
   * Done bouncing on something at (x, z): off it hops, `d` away towards `a` (sin, cos) in a hop taking T and
   * h high, or back towards you if it's rejoining the squad (whistled, or it only bounced on the way past,
   * following you)
   */
  hopOff(x, z, a, d, T = 1.1, h = 3.4) {
    const p = this.game.player.pos, back = this.bounceRejoin;
    if (back) {
      a = Math.atan2(p.x - x, p.z - z) + rand(-0.35, 0.35);
      d = clamp(Math.hypot(p.x - x, p.z - z) - 1.2, 2.4, d);
    }
    this.hopTo(x + Math.sin(a) * d, z + Math.cos(a) * d, back ? Math.min(T, 0.85) : T, back ? Math.min(h, 2.6) : h);
    this.flight.spin = Math.random() < 0.5 ? -1 : 1;
    this.bounces = 0;
    if (back) this.joinAfterHop = true;
    this.bounceRejoin = false;
    this.playCool = rand(4, 8); // (had its go: not straight back on)
  }

  dismissTo(x, z) {
    this.target.set(x, 0, z);
    this.setState(S.GOTO);
  }

  throwTo(from, to) {
    this.dropEverything();
    this.workCenter = null;
    this.rescued = 0;
    const d = Math.hypot(to.x - from.x, to.z - from.z);
    this.flight = { from: from.clone(), to: this.landingSpot(to.clone()), T: 0.45 + d * 0.035, h: 1.6 + d * 0.16, spin: 0 };
    this.heading = Math.atan2(to.x - from.x, to.z - from.z);
    this.pos.copy(from);
    this.flung = false;
    this.setState(S.THROWN);
  }

  /** hop to (x, z); y lets it land on something raised, like a trampoline mat */
  hopTo(x, z, T = 0.5, h = 0.8, y = null) {
    const to = new THREE.Vector3(x, 0, z);
    this.game.world.resolve(to, this.radius, this.game.mounds.colliders);
    to.y = y ?? this.game.world.groundHeight(to.x, to.z);
    this.flight = { from: this.pos.clone(), to: y === null ? this.landingSpot(to) : to, T, h, spin: 0 };
    this.setState(S.THROWN);
  }

  /**
   * Where a flight aimed at `to` really comes down: on top of a beach umbrella (which boings it off), on
   * a trampoline's mat (or Big Kev's belly), on the surface of deep water (not the bottom), or on the ground.
   */
  landingSpot(to) {
    const g = this.game, u = g.toys.canopyOver(to.x, to.z);
    if (u) {
      to.y = u.canopyY(Math.hypot(to.x - u.x, to.z - u.z));
      return to;
    }
    const tr = g.toys.trampolineAt(to);
    if (tr) {
      to.y = tr.matY;
      return to;
    }
    const water = g.world.waterAt(to.x, to.z);
    if (water.depth === 2) to.y = Math.max(to.y, g.world.surfaceY(water, to.x, to.z) - 0.2 * this.scale);
    return to;
  }

  /** knocked flying by a big attack (a rake spin, a snake's whirl): lands dazed but alive */
  blastAway(from, dist, h = 2.5) {
    // (leg guards on, it stands its ground: knocked back a step or two, no more)
    if (this.gear?.pads) {
      dist = Math.min(dist, Math.hypot(this.pos.x - from.x, this.pos.z - from.z) + 1.2);
      h *= 0.45;
    }
    this.dropEverything();
    this.workCenter = null;
    const a = Math.atan2(this.pos.x - from.x, this.pos.z - from.z) + rand(-0.35, 0.35);
    const to = this.thisSide(from.x + Math.sin(a) * dist, from.z + Math.cos(a) * dist, _w);
    this.hopTo(to.x, to.z, 0.7 + dist * 0.04, h);
    this.flight.spin = 2;
    this.flung = true;
  }

  /** (x, z), pulled back if need be so that getting there doesn't take it over a fence, a barricade or the scrub */
  thisSide(x, z, out) {
    const k = this.game.world.throwClear(this.pos.x, this.pos.z, x, z);
    if (k >= 1) return out.set(x, 0, z);
    const t = Math.max(0, k - 0.5 / (Math.hypot(x - this.pos.x, z - this.pos.z) || 1));
    return out.set(this.pos.x + (x - this.pos.x) * t, 0, this.pos.z + (z - this.pos.z) * t);
  }

  /* ---------------------------------------------------------------- rides: swings, the Hills Hoist, beach chairs */
  /** hop aboard: the hop tracks the seat, which may be swinging, spinning or being carried */
  mount(seat) {
    this.dropEverything();
    this.workCenter = null;
    this.seat = seat;
    seat.set.seats[seat.i].rider = this;
    const to = seat.set.seatPos(seat.i, new THREE.Vector3(), this);
    const up = Math.max(0, to.y - this.pos.y), hop = seat.set.hop?.(seat.i); // (up into the stands: a big flap up over the rows in front)
    this.flight = { from: this.pos.clone(), to, T: hop?.T ?? 0.32 + up * 0.1, h: hop?.h ?? 0.45, spin: 0, seat };
    this.flung = false;
    this.setState(S.THROWN);
  }

  /** landed in the seat */
  sitOn(seat) {
    this.seat = seat;
    seat.set.seats[seat.i].rider = this;
    this.swingT = seat.set.rideTime();
    this.setState(S.SWING);
    seat.set.onMount?.(this, seat.i);
    this.game.audio.peep(this.stage);
  }

  /** wander over to a ride, then hop on */
  goPlay(seat) {
    this.dropEverything();
    this.seat = seat;
    seat.set.seats[seat.i].rider = this;
    this.setState(S.TOY);
  }

  leaveSeat() {
    if (!this.seat) return;
    const s = this.seat.set.seats[this.seat.i];
    if (s.rider === this) s.rider = null;
    this.seat = null;
    this.playCool = rand(4, 8);
  }

  /** keep scratching in rhythm; returns how many scrapes landed this frame (each one kicks stuff backwards) */
  scratchTick(dt) {
    const before = this.scrapeClock ?? 0;
    this.scrapeClock = before + dt * SCRAPE_RATE[this.stage];
    return scrapesBy(this.scrapeClock) - scrapesBy(before);
  }

  /**
   * A puff of dirt (or sand) kicked out behind a scrape, flying off along `dir` (it's facing the other way).
   * `side` shifts it out under one foot (+ its left), and a big kick throws up more of it
   */
  scrapeDust(dir, colors, side = 0, big = false) {
    const lx = -dir.z, lz = dir.x;
    _w.set(this.pos.x + dir.x * 0.25 + lx * side, this.pos.y + 0.05, this.pos.z + dir.z * 0.25 + lz * side);
    this.game.fx.burst(_w, big
      ? { n: 4, dir, colors, speed: [1.6, 3.4], up: [1.3, 2.8], size: [0.03, 0.07], life: [0.4, 0.7] }
      : { n: 2, dir, colors, speed: [1, 2.3], up: [1, 2.2], size: [0.03, 0.06], life: [0.35, 0.6] });
  }

  /* ---------------------------------------------------------------- mound building */
  /** join the crew scratching a new mound into existence; false if the ring's full */
  joinBuild(m) {
    this.dropEverything();
    const slot = m.joinCrew(this);
    if (slot < 0) return false;
    this.workCenter = null;
    this.site = m;
    this.siteSlot = slot;
    this.setState(S.BUILD);
    return true;
  }

  buildDone() {
    this.site = null;
    this.scratching = false;
    this.setState(S.IDLE);
    this.scanT = rand(0.3, 1.2);
  }

  updateBuild(dt, sp) {
    const m = this.site;
    if (!m || !m.building) { this.site = null; this.scratching = false; this.setState(S.IDLE); return; }
    m.crewPos(this.siteSlot, _v);
    // facing away from the mound, raking the dirt back onto it with its feet (exactly how brush turkeys do it)
    const away = Math.atan2(this.pos.x - m.pos.x, this.pos.z - m.pos.z);
    // off to its spot on the ring (swinging round to face out as it gets there), then feet planted
    // (it wanders back if it gets shoved off)
    const d = Math.hypot(_v.x - this.pos.x, _v.z - this.pos.z);
    if (this.scratching ? d > 0.45 : d > 0.12 || this.vel.lengthSq() > 0.09 || Math.abs(angleDiff(this.heading, away)) > 0.3) {
      this.scratching = false;
      this.steer(_v.x, _v.z, sp, dt, 0.04, true);
      if (d < 1) this.turnTo(away, dt);
      else if (this.vel.lengthSq() > 0.04) this.turnTo(Math.atan2(this.vel.x, this.vel.z), dt, 9);
      return;
    }
    this.scratching = true;
    this.brake(dt, 25);
    this.turnTo(away, dt);
    if (this.scratchTick(dt)) this.scrapeDust(_r.set(m.pos.x - this.pos.x, 0, m.pos.z - this.pos.z).normalize(), m.beach ? SAND_BITS : SOIL_BITS);
  }

  /* ---------------------------------------------------------------- digging you out */
  /**
   * You went down, and you're buried in mound m: this one's in the crew digging you out. It's put straight in
   * its spot round the mound, at (x, z) (the screen's gone black: nobody sees it get there), facing in, and at it
   */
  digOut(m, x, z) {
    this.dropEverything();
    this.flight = null;
    this.bounces = 0;
    this.bounceRejoin = false;
    this.holder = null;
    this.workCenter = null;
    this.rescued = 0;
    this.digSite = m;
    this.digSpot = new THREE.Vector3(x, 0, z);
    this.pos.set(x, this.game.world.groundHeight(x, z), z);
    this.vel.set(0, 0, 0);
    this.heading = Math.atan2(m.pos.x - x, m.pos.z - z);
    this.scrapeClock = rand(0, CYCLE); // (they don't all scratch in step)
    this.setState(S.DIGOUT);
  }

  /** you're out: it's with you now, and pleased about it */
  digDone() {
    this.digSite = null;
    this.scratching = false;
    this.setState(S.FOLLOW);
    this.squash = 1;
    this.game.audio.peep(this.stage);
  }

  /** at its spot, facing into the mound, scratching the dirt out behind it (it wanders back if it gets shoved off) */
  updateDigOut(dt, sp) {
    const m = this.digSite, s = this.digSpot;
    if (!m) { this.setState(S.IDLE); return; }
    const d = Math.hypot(s.x - this.pos.x, s.z - this.pos.z), face = Math.atan2(m.pos.x - this.pos.x, m.pos.z - this.pos.z);
    if (this.scratching ? d > 0.45 : d > 0.12 || this.vel.lengthSq() > 0.09) {
      this.scratching = false;
      this.steer(s.x, s.z, sp, dt, 0.04, true);
      if (d < 1) this.turnTo(face, dt);
      else if (this.vel.lengthSq() > 0.04) this.turnTo(Math.atan2(this.vel.x, this.vel.z), dt, 9);
      return;
    }
    this.scratching = true;
    this.brake(dt, 25);
    this.turnTo(face, dt);
    if (this.scratchTick(dt)) this.scrapeDust(_r.set(this.pos.x - m.pos.x, 0, this.pos.z - m.pos.z).normalize(), m.beach ? SAND_BITS : SOIL_BITS);
  }

  /* ---------------------------------------------------------------- off to another mound, with you */
  /**
   * You've dived into mound m, to go somewhere else (see Travel): it's straight after you, and in it goes too,
   * beak first. `wait`: seconds before it's off (they don't all go at once)
   */
  diveAfter(m, wait) {
    this.dropEverything();
    this.workCenter = null;
    this.rescued = 0;
    this.hole = m;
    this.holeWait = wait;
    this.setState(S.DIVE);
  }

  /** over to the mound at a run, and up and in once it's close enough (or it's been a while, and it's near enough) */
  updateDive(dt, sp) {
    const m = this.hole;
    if (!m) { this.setState(S.IDLE); return; }
    if ((this.holeWait -= dt) > 0) { this.brake(dt); return; }
    const d = Math.hypot(m.pos.x - this.pos.x, m.pos.z - this.pos.z) - m.r;
    if (d < LEAP_FROM + this.radius || (this.t > LEAP_LATE && d < LEAP_MAX)) { this.leapIn(); return; }
    m.edgePoint(this.pos, _v, 0.1);
    this.steer(_v.x, _v.z, sp * 1.45, dt, 0.05);
  }

  /** a leap up onto the top of the heap, and into it, beak first */
  leapIn() {
    const m = this.hole, to = new THREE.Vector3(m.pos.x + rand(-0.3, 0.3), m.pos.y + m.h - 0.3, m.pos.z + rand(-0.3, 0.3));
    const d = Math.hypot(to.x - this.pos.x, to.z - this.pos.z);
    this.flight = { from: this.pos.clone(), to, T: 0.3 + d * 0.05, h: 0.7 + d * 0.1 + m.h * 0.4, spin: 0 };
    this.heading = Math.atan2(to.x - this.pos.x, to.z - this.pos.z);
    this.vel.set(0, 0, 0);
    this.tunnel = 'in';
    this.setState(S.TUNNEL);
    this.game.audio.peep(this.stage);
  }

  /** gone in: down the tunnels, out of sight, till it pops out of the top of another mound (see popOutOf) */
  goUnder() {
    if (this.state !== S.TUNNEL) this.setState(S.TUNNEL);
    this.flight = null;
    this.tunnel = 'under';
    this.pos.copy(this.hole.pos);
    this.vel.set(0, 0, 0);
    this.rig.root.visible = false;
  }

  /**
   * Out of the top of mound m, where you've come out of the tunnels: a backflip down to (x, z) beside it, landing
   * facing in, and straight into digging you out
   */
  popOutOf(m, x, z) {
    const top = new THREE.Vector3(m.pos.x, m.pos.y + m.h, m.pos.z);
    this.hole = m;
    this.pos.copy(top);
    this.heading = Math.atan2(m.pos.x - x, m.pos.z - z);
    this.flight = { from: top, to: new THREE.Vector3(x, this.game.world.groundHeight(x, z), z), T: rand(0.6, 0.75), h: rand(1.6, 2.6), spin: -1 };
    this.tunnel = 'out';
    this.t = 0;
    this.rig.root.visible = true;
    m.splash(5, 0.8);
    this.game.audio.fwoop();
  }

  /** leaping into a mound, down the tunnels (out of sight), or popping out of the top of another */
  updateTunnel() {
    const f = this.flight, m = this.hole;
    if (this.tunnel === 'under') return;
    if (!f || !m) { this.setState(S.IDLE); return; }
    const k = Math.min(1, this.t / f.T);
    this.pos.lerpVectors(f.from, f.to, k);
    this.pos.y += f.h * 4 * k * (1 - k);
    if (k < 1) return;
    if (this.tunnel === 'in') {
      m.splash(6, 0.8);
      this.game.audio.gloop();
      this.goUnder();
      return;
    }
    // (down beside it, and at it)
    this.game.fx.dust(f.to, 3);
    this.game.audio.land();
    this.digOut(m, f.to.x, f.to.z);
    this.squash = 1;
  }

  /** gone without a trace: dived into a beach mound, which spits it back out in boardshorts */
  vanish() {
    this.dropEverything();
    this.flight = null;
    this.dead = true;
    this.removed = true;
    this.game.scene.remove(this.rig.root);
  }

  /** shaken off an ibis: tumble through the air away from it */
  flingFrom(enemy) {
    this.latched = false;
    this.foe = null;
    const a = Math.atan2(this.pos.x - enemy.pos.x, this.pos.z - enemy.pos.z) + rand(-0.6, 0.6);
    const d = enemy.def.radius + rand(1.5, 3.5);
    const to = this.thisSide(enemy.pos.x + Math.sin(a) * d, enemy.pos.z + Math.cos(a) * d, _w);
    this.hopTo(to.x, to.z, rand(0.6, 0.8), 1.2 + enemy.s * 0.4);
    this.flight.spin = 2;
    this.flung = true;
  }

  /** the ibis we were clinging to died */
  dropOff() {
    this.latched = false;
    this.foe = null;
    this.hopTo(this.pos.x + rand(-0.6, 0.6), this.pos.z + rand(-0.6, 0.6), 0.4, 0.4);
  }

  launchFrom(from, to) {
    this.flight = { from: from.clone(), to: to.clone(), T: 1.1 + rand(0, 0.3), h: rand(4.5, 6.5), spin: rand(1.5, 2.5) };
    this.pos.copy(from);
    this.setState(S.LAUNCHED);
  }

  /** snatched up in the King Ibis' beak */
  grabbedBy(foe, idx) {
    this.dropEverything();
    this.workCenter = null;
    this.holder = foe;
    this.heldIdx = idx;
    this.setState(S.HELD);
    this.game.audio.peep(this.stage);
  }

  releaseFromBeak() {
    this.holder = null;
    this.hopTo(this.pos.x + rand(-1.4, 1.4), this.pos.z + rand(-1.4, 1.4), 0.6, 0.6);
    this.flight.spin = 1;
    this.flung = true;
  }

  swallowed() {
    this.holder = null;
    this.die('eaten');
  }

  /** gulped down whole by a snake */
  eatenBy(snake) {
    this.dropEverything();
    this.workCenter = null;
    this.holder = snake;
    this.setState(S.EATEN);
  }

  releaseFromBelly(p) {
    this.holder = null;
    this.pos.copy(p);
    this.hopTo(p.x + rand(-1, 1), p.z + rand(-1, 1), 0.5, 0.9);
    this.flung = true;
    this.game.fx.sparkle(p, 10);
    this.game.audio.pluck();
  }

  digested(p) {
    this.holder = null;
    this.pos.copy(p);
    this.die('eaten');
  }

  carryDone() {
    this.obj = null;
    this.slot = -1;
    this.setState(S.IDLE);
    this.scanT = rand(0.3, 0.8);
  }

  /** a non-swimmer ended up in deep water */
  startDrowning() {
    this.dropEverything();
    this.workCenter = null;
    this.drownT = 0;
    this.deepT = 0;
    this.rescued = 0;
    this.drownA = this.heading;
    this.vel.set(0, 0, 0);
    this.setState(S.DROWN);
    this.game.audio.splash();
    this.game.audio.peep(this.stage);
    this.game.hud.toastOnce('drown', "A turkey's drowning! Whistle it out of the water!");
  }

  die(cause = 'peck') {
    if (this.dead) return;
    if (cause !== 'drown' && (this.gear?.helmet || this.gear?.pads)) { this.loseGear(); return; }
    if (this.game.dev?.invincible) {
      // dev mode: nobody dies, they just get bounced clear
      this.dropEverything();
      this.holder = null;
      this.hopTo(this.pos.x + rand(-2.5, 2.5), this.pos.z + rand(-2.5, 2.5), 0.6, 1.4);
      this.flight.spin = 1;
      this.flung = true;
      return;
    }
    const g = this.game;
    this.dropEverything();
    this.dead = true;
    this.deathCause = cause;
    this.setState(S.DYING);
    g.ghosts.spawn(this);
    g.fx.feathers(this.pos.clone().setY(this.pos.y + 0.3), this.stage === 2 ? [0x1d1b1a, 0xffd21f, 0xe3282b] : [0x8a6a45, 0x5e422a, 0xb89770], 6);
    if (cause === 'squash') g.fx.dust(this.pos, 4);
    g.audio.die(this.stage);
    g.stats.lost++;
  }

  /** its cricket kit took a blow that would have done for it: off it all flies, and the turkey lives on without it */
  loseGear() {
    const g = this.game, r = this.rig;
    this.gear = null;
    for (const m of [r.helmet, ...(r.pads ?? [])]) {
      if (!m) continue;
      const a = rand(0, TAU);
      g.fx.fling(m, _w.set(Math.cos(a) * rand(0.8, 1.8), rand(3, 4.5), Math.sin(a) * rand(0.8, 1.8)), _s.set(rand(-9, 9), rand(-9, 9), rand(-9, 9)));
    }
    r.helmet = r.pads = null;
    g.audio.clonk();
    g.fx.sparkle(_v.set(this.pos.x, this.pos.y + 0.6 * this.scale, this.pos.z), 8, [0xffffff, 0xc9ced4, 0xffe066]);
    g.stats.saved++;
    // (knocked back a step, and a bit dazed)
    this.dropEverything();
    this.workCenter = null;
    this.holder = null;
    const a = rand(0, TAU);
    this.hopTo(this.pos.x + Math.sin(a) * 0.9, this.pos.z + Math.cos(a) * 0.9, 0.4, 0.5);
    this.flight.spin = 1;
    this.flung = true;
  }

  dropEverything() {
    const g = this.game;
    for (const l of this.clump) if (l.owner === this) g.leaves.release(l);
    this.clump.length = 0;
    this.rakeTo = null;
    if (this.grub) { g.grubs.release(this.grub); this.grub = null; }
    if (this.foe && this.latched && this.foe.unlatch) this.foe.unlatch(this);
    this.foe = null;
    this.latched = false;
    if (this.obj) { this.obj.leaveCarry(this); this.obj = null; this.slot = -1; }
    if (this.site) { this.site.leaveCrew(this); this.site = null; }
    this.digSite = null;
    this.hole = null;
    if (this.tunnel) { this.tunnel = null; this.rig.root.visible = true; } // (out of the tunnels, whatever else happens)
    this.scratching = false;
    this.leaveSeat();
    this.peck = 0;
    this.peckDone = null;
    this.joinAfterHop = false;
  }

  /* ------------------------------------------------------------------ choosing what to do */
  attack(foe) {
    this.foe = foe;
    this.latched = false;
    this.setState(S.ATTACK);
  }

  haul(obj) {
    const slot = obj.joinCarry(this);
    if (slot < 0) return false;
    this.obj = obj;
    this.slot = slot;
    this.setState(S.HAUL);
    return true;
  }

  /** can it get to p? (not out in the deep for a landlubber, and not behind a barricade that's still up) */
  canReach(p) {
    const w = this.game.world;
    return (this.canSwim || w.waterDepth(p.x, p.z) < 2) && !!w.route(this.pos.x, this.pos.z, p.x, p.z, _d);
  }

  /**
   * Something within `near` to go at, in its own area and that it can get to: anything that fights back (in
   * plain sight, not round the other side of a fence) comes first, and only if there's nothing like that
   * about, a chore (a barricade, a bin, a key to dig up). `chores` false: fights only
   */
  findFoe(near, chores = true) {
    const g = this.game, zone = g.world.zoneOf(this.pos.x, this.pos.z);
    for (const chore of chores ? [false, true] : [false]) {
      const foe = g.enemies.nearestAlive(this.pos, near, chore);
      if (!foe || foe.zone !== zone) continue;
      if (!chore && !g.world.canSee(this.pos.x, this.pos.z, foe.pos.x, foe.pos.z)) continue;
      // (something wide, like a barricade, is got at from whichever side of it this is on)
      const at = foe.attackSpot ? (foe.attackSpot(this, _at, _af), _at) : foe.pos;
      if (this.canReach(at)) return foe;
    }
    return null;
  }

  /** look around for a job; `near` is how far to look for fights & hauling */
  findWork(near = 3.5) {
    const g = this.game;
    const zone = g.world.zoneOf(this.pos.x, this.pos.z);
    const foe = this.findFoe(near);
    if (foe) { this.attack(foe); return true; }
    // beach turkeys out in the water go looking much further afield
    const swimming = this.canSwim && g.world.waterDepth(this.pos.x, this.pos.z) === 2;
    const carcass = g.enemies.nearestCarcass(this.pos, swimming ? 9 : near + 1);
    if (carcass && this.canReach(carcass.pos) && this.haul(carcass)) return true;
    // a new mound being scratched up nearby? lend a foot
    const site = g.mounds.siteNear(this.pos, near + 2);
    if (site && g.world.zoneOf(site.pos.x, site.pos.z) === zone && this.joinBuild(site)) return true;
    const grub = g.grubs.nearestFree(this.pos, 3);
    if (grub && this.stage < 2 && this.canReach(grub.pos)) {
      this.grub = grub;
      g.grubs.claim(grub, this);
      this.setState(S.EAT);
      return true;
    }
    // leaf litter (and bits spilled from bins): rake a clump of it back to a mound. A turkey keeps working
    // the patch it was thrown at until it's clear, however far away the mound is
    const leaf = this.workCenter
      ? g.leaves.nearestFree(this.pos, 200, this.workCenter, WORK_R)
      : g.leaves.nearestFree(this.pos, 3.5);
    if (leaf && g.world.zoneOf(leaf.pos.x, leaf.pos.z) === zone) {
      if (!this.canReach(leaf.pos)) leaf.snubT = g.time + SNUB_TIME; // (no way to it for now: leave it be)
      else if (this.startRake(leaf)) {
        this.workCenter ??= leaf.pos.clone();
        return true;
      }
    }
    // nothing to do? go and play (a swing, the Hills Hoist, a roost up a gum), or lie down for a sunbake
    if (this.state !== S.IDLE || this.sunT > 0) return false;
    if (this.playCool <= 0 && Math.random() < 0.14) {
      const seat = g.toys.freeSeatNear(this.pos, 7);
      if (seat) { this.goPlay(seat); return true; }
      const tr = g.toys.trampolineNear(this.pos, 6);
      if (tr) { this.hopTo(tr.x + rand(-0.6, 0.6), tr.z + rand(-0.6, 0.6), 0.6, 1.6, tr.matY); return true; }
    }
    // (on the sand at the beach, or the steps down to Benny, they can't get enough of it)
    const sand = g.world.sunTrap(this.pos.x, this.pos.z);
    if (Math.random() < (sand ? 0.3 : 0.05) && !g.world.waterDepth(this.pos.x, this.pos.z)) this.sunbake(sand ? rand(12, 25) : rand(6, 12));
    return false;
  }

  /**
   * A cock showing off, like the real ones do: he puffs his wattle right up, the air sac in his neck with it, and
   * booms, pumping his whole body with each note (see SHOW, and pose). He stops the moment he's wanted
   */
  showOff() {
    this.showT = 1e-4;
    this.boomed = false;
    this.boomRate = rand(0.95, 1.04); // (a touch higher or lower each time)
  }

  /** puffed up, he booms, then holds it a moment and goes back down (side on to you, and the camera behind you, so you get the full effect) */
  updateShow(dt) {
    this.showT += dt;
    const side = this.game.cam.yaw + Math.PI / 2;
    this.heading = dampAngle(this.heading, Math.abs(angleDiff(this.heading, side)) < Math.PI / 2 ? side : side + Math.PI, 5, dt);
    if (!this.boomed && this.showT >= SHOW.puff) {
      this.boomed = true;
      const p = this.game.player.pos, d = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
      this.game.audio.boom(clamp(1.3 - d / 14, 0.35, 1), this.boomRate); // (quieter a way off)
    }
    if (this.showT >= SHOW.puff + BOOM_END / this.boomRate + SHOW.hold + SHOW.down) {
      this.showT = 0;
      // (and now and then another grown-up about the place has a honk back at him)
      const near = (t) => t !== this && t.stage === 2 && t.grounded && Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z) < 6;
      if (Math.random() < 0.5 && this.game.turkeys.list.some(near)) this.game.audio.peep(2);
    }
  }

  /** down it flops for a sunbake, for `secs` (or till it's wanted) */
  sunbake(secs) {
    this.sunT = secs;
    this.sunIn = 0;
    this.sunSide = Math.random() < 0.5 ? 1 : -1;
  }

  onLand() {
    const g = this.game;
    const bouncy = g.toys.bouncerAt(this.pos); // a trampoline, or a beach umbrella's canopy
    if (bouncy) { bouncy.bounce(this); return; }
    const water = g.world.waterAt(this.pos.x, this.pos.z);
    if (water.depth) {
      const y = g.world.surfaceY(water, this.pos.x, this.pos.z);
      g.fx.splash(this.pos.x, y, this.pos.z, water.depth === 2 ? 0.6 + this.stage * 0.15 : 0.4);
      if (water.depth === 2) {
        g.audio.splash();
        if (!this.canSwim) {
          // a landlubber in the deep end: flail! (unless it was already on its way back to you)
          if (!this.joinAfterHop) { this.pos.y = y - 0.2 * this.scale; this.startDrowning(); return; }
          this.rescued = RESCUE_TIME;
        }
      }
    }
    this.squash = 1;
    if (!water.depth) g.fx.dust(this.pos, 5);
    g.audio.land();
    this.workCenter = null;
    if (this.joinAfterHop) {
      this.joinAfterHop = false;
      this.setState(S.FOLLOW);
      return;
    }
    if (this.flung) {
      this.flung = false;
      this.setState(S.IDLE);
      this.scanT = 1.3; // dazed for a moment
      return;
    }
    const seat = this.playCool <= 0 && g.toys.freeSeatNear(this.pos, 1.8, true);
    if (seat) { this.mount(seat); return; }
    if (this.findWork(2.2)) return;
    const leaf = g.leaves.nearestFree(this.pos, 3.2);
    if (leaf && this.startRake(leaf)) { this.workCenter = this.pos.clone(); return; }
    this.setState(S.IDLE);
  }

  startPeck(done) {
    this.peck = 0.0001;
    this.peckDone = done;
  }

  /*
   * steer towards a point, routing through open gates; returns remaining straight-line distance.
   * `ease` gets going gently and slows down smoothly to stop right on the spot; `round` goes round any mound
   * in the way (see roundMound)
   */
  steer(tx, tz, speed, dt, stopDist = 0.05, ease = false, round = false) {
    let wp = this.game.world.route(this.pos.x, this.pos.z, tx, tz, _r) ?? _r.set(tx, 0, tz);
    if (round && this.roundMound(wp.x, wp.z, _o)) wp = _o;
    const direct = wp.x === tx && wp.z === tz;
    const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    const stop = direct ? stopDist : 0.05;
    let vx = 0, vz = 0;
    if (d > stop) {
      let sp = speed;
      if (direct) sp = ease ? Math.min(speed, Math.sqrt(2 * EASE_DECEL * (d - stop))) : speed * clamp((d - stop) / 0.5, 0.25, 1);
      vx = (dx / d) * sp; vz = (dz / d) * sp;
      // turkeys following you go wherever you lead them (even into the sea); busy ones walk around deep water
      if (this.state !== S.FOLLOW && this.dodgeWater(vx, vz)) { vx = _d.x; vz = _d.z; }
    }
    if (ease) {
      // (no lurching: it only changes speed or direction so fast)
      const ax = vx - this.vel.x, az = vz - this.vel.z, a = Math.hypot(ax, az), max = EASE_ACCEL * dt;
      if (a > max) { this.vel.x += (ax / a) * max; this.vel.z += (az / a) * max; }
      else { this.vel.x = vx; this.vel.z = vz; }
    } else {
      this.vel.x = damp(this.vel.x, vx, 10, dt);
      this.vel.z = damp(this.vel.z, vz, 10, dt);
    }
    return direct ? d : Math.hypot(tx - this.pos.x, tz - this.pos.z);
  }

  /**
   * Following you, with a mound between it and (wx, wz): round it, the shorter way round to where you are (and
   * sticking to that way till it's past), rather than walking into it and sliding off round whichever side it
   * happens to. Where to head for along the way round goes in `out`; false if there's no mound in the way
   */
  roundMound(wx, wz, out) {
    const pl = this.game.player, x = this.pos.x, z = this.pos.z;
    const vx = wx - x, vz = wz - z, l2 = vx * vx + vz * vz;
    let m = null, first = Infinity;
    for (const c of this.game.mounds.colliders) {
      const R = c.r + this.radius + ROUND_PAD;
      // (only one it'd walk into on the way: not one that's behind it, or past where it's going, or where it's going)
      if (!l2 || Math.hypot(wx - c.x, wz - c.z) < R) continue;
      const t = ((c.x - x) * vx + (c.z - z) * vz) / l2;
      if (t <= 0 || t >= 1 || t >= first || Math.hypot(x + vx * t - c.x, z + vz * t - c.z) >= R) continue;
      first = t;
      m = c;
    }
    if (!m) { this.roundSide = 0; return false; }
    const R = m.r + this.radius + ROUND_PAD, dx = m.x - x, dz = m.z - z, d = Math.hypot(dx, dz);
    // which way round (+1: the way its bearing from the middle of the mound goes up): the shorter way round to you
    // (or to where you're off to, if you're on the move: round the way you went)
    const px = pl.pos.x + pl.vel.x * ROUND_LEAD, pz = pl.pos.z + pl.vel.z * ROUND_LEAD;
    const arc = angleDiff(Math.atan2(-dx, -dz), Math.atan2(px - m.x, pz - m.z));
    if (!this.roundSide || (Math.sign(arc) !== this.roundSide && Math.abs(arc) < Math.PI - ROUND_GIVE / 2)) this.roundSide = Math.sign(arc) || 1;
    // (along the line that just grazes it that side, or right round it if it's up against it already)
    const a = Math.atan2(dx, dz) - this.roundSide * (d > R ? Math.asin(R / d) : Math.PI / 2 + 0.2);
    const ahead = Math.min(ROUND_AHEAD, Math.sqrt(l2));
    out.set(x + Math.sin(a) * ahead, 0, z + Math.cos(a) * ahead);
    return true;
  }

  /**
   * A landlubber heading into deep water turns aside to skirt round it (or stops at the edge).
   * Returns true if it changed course; the new velocity is left in _d.
   */
  dodgeWater(vx, vz) {
    if (this.canSwim || this.rescued > 0 || this.game.world.zoneOf(this.pos.x, this.pos.z) !== BEACH) return false; // (no water but the beach's)
    const w = this.game.world, sp = Math.hypot(vx, vz);
    const ux = vx / sp, uz = vz / sp, L = 0.3 + this.radius + sp * 0.1;
    if (w.waterDepth(this.pos.x + ux * L, this.pos.z + uz * L) < 2) return false;
    const side = this.detour ?? 1;
    for (const a of [0.45, 0.9, 1.35, 1.8, 2.3]) {
      for (const s of [side, -side]) {
        const c = Math.cos(a * s), sn = Math.sin(a * s);
        const rx = ux * c - uz * sn, rz = ux * sn + uz * c;
        if (w.waterDepth(this.pos.x + rx * L, this.pos.z + rz * L) < 2) {
          this.detour = s;
          _d.set(rx * sp, 0, rz * sp);
          return true;
        }
      }
    }
    _d.set(0, 0, 0);
    return true;
  }

  brake(dt, rate = 10) {
    this.vel.x = damp(this.vel.x, 0, rate, dt);
    this.vel.z = damp(this.vel.z, 0, rate, dt);
  }

  faceToward(x, z, dt, rate = 8) {
    this.heading = dampAngle(this.heading, Math.atan2(x - this.pos.x, z - this.pos.z), rate, dt);
  }

  /** turn to face `target` (radians), getting going into the turn and easing out of it */
  turnTo(target, dt, rate = TURN_RATE) {
    const now = this.game.time;
    if (now - this.turnAt > 0.1) this.turnV = 0; // (a fresh turn starts from still)
    this.turnAt = now;
    const diff = angleDiff(this.heading, target);
    const want = Math.sign(diff) * Math.min(rate, Math.sqrt(2 * TURN_DECEL * Math.abs(diff)));
    this.turnV += clamp(want - this.turnV, -TURN_ACCEL * dt, TURN_ACCEL * dt);
    const step = this.turnV * dt;
    if (step * diff >= 0 && Math.abs(step) >= Math.abs(diff)) { this.heading += diff; this.turnV = 0; } // (there)
    else this.heading += step;
  }

  /* ------------------------------------------------------------------ update */
  update(dt) {
    if (this.removed) return; // (gone: it's just waiting to be tidied out of the list)
    this.t += dt;
    const g = this.game;
    const water = g.world.waterAt(this.pos.x, this.pos.z);
    let sp = this.def.speed * (this.grounded ? g.enemies.slowAt(this.pos) : 1);
    if (water.depth === 1) sp *= this.canSwim ? 1.0 : 0.65; // wading
    else if (water.depth === 2) sp *= this.canSwim ? 1.3 : 0.45; // swimming (or a rescued turkey paddling)

    if (this.state === S.DYING) { this.updateDying(dt); return; }

    if (this.peck > 0) {
      this.brake(dt);
      const before = this.peck;
      this.peck += dt / 0.28;
      if (before < 0.5 && this.peck >= 0.5 && this.peckDone) { const f = this.peckDone; this.peckDone = null; f(); }
      if (this.peck >= 1) this.peck = 0;
    } else {
      switch (this.state) {
        case S.SPROUT: this.updateSprout(dt); break;
        case S.POP: this.updatePop(dt); break;
        case S.BURROW: this.updateBurrow(dt); break;
        case S.THROWN:
        case S.LAUNCHED: this.updateFlight(dt); break;
        case S.FOLLOW: this.updateFollow(dt, sp); break;
        case S.GOTO:
          if (this.steer(this.target.x, this.target.z, sp, dt, 0.3) < 0.35 || this.t > 8) this.setState(S.IDLE);
          break;
        case S.IDLE:
          this.brake(dt);
          if (this.sunT > 0) { this.sunT -= dt; this.sunIn += dt; }
          this.scanT -= dt;
          if (this.scanT <= 0) { this.scanT = rand(0.4, 0.7); this.findWork(); }
          if (this.sunT <= 0 && !this.showT && Math.random() < dt * 0.25) this.startPeck(null);
          break;
        case S.SEEK: this.updateSeek(dt, sp); break;
        case S.RAKE: this.updateRake(dt, sp); break;
        case S.EAT: this.updateEat(dt, sp); break;
        case S.ATTACK: this.updateAttack(dt, sp); break;
        case S.HAUL: this.updateHaul(dt, sp); break;
        case S.HELD:
          if (!this.holder || !this.holder.alive) { this.releaseFromBeak(); break; }
          this.holder.heldPos(this.heldIdx, this.pos);
          this.heading += dt * 4;
          break;
        case S.TOY: {
          const st = this.seat;
          if (!st) { this.setState(S.IDLE); break; }
          st.set.approach(st.i, this.pos, _v);
          if (this.steer(_v.x, _v.z, sp, dt, 0.2) < 0.5 || this.t > 8) this.mount(st);
          break;
        }
        case S.SWING: {
          const st = this.seat;
          if (!st) { this.setState(S.IDLE); break; }
          st.set.seatPos(st.i, this.pos, this);
          this.heading = st.set.seatHeading(st.i);
          this.vel.set(0, 0, 0);
          this.swingT -= dt;
          if (this.swingT <= 0 && st.set.canLeave(st.i)) st.set.dismount(this, st.i);
          break;
        }
        case S.EATEN:
          if (this.holder) this.holder.bellyPos(this.pos);
          break;
        case S.DROWN: this.updateDrown(dt, water); break;
        case S.BUILD: this.updateBuild(dt, sp); break;
        case S.DIGOUT: this.updateDigOut(dt, sp); break;
        case S.DIVE: this.updateDive(dt, sp); break;
        case S.TUNNEL: this.updateTunnel(); break;
      }
    }

    this.playCool -= dt;
    if (this.showT > 0) this.updateShow(dt);
    if (this.grounded) {
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      g.world.resolve(this.pos, this.radius, g.mounds.colliders);
      const v2 = this.vel.x * this.vel.x + this.vel.z * this.vel.z;
      // (fighting, raking, building and digging turkeys see to which way they face themselves)
      if (v2 > 0.04 && this.state !== S.ATTACK && this.state !== S.RAKE && this.state !== S.BUILD && this.state !== S.DIGOUT) this.turnTo(Math.atan2(this.vel.x, this.vel.z), dt, 9);
      const w2 = g.world.waterAt(this.pos.x, this.pos.z);
      if (!this.canSwim) {
        // a landlubber that wanders out of its depth starts to drown (a whistled one gets a few seconds' grace)
        if (this.rescued > 0) this.rescued -= dt;
        if (w2.depth === 2 && this.rescued <= 0) {
          this.deepT += dt;
          if (this.deepT > 0.25) { this.settle(w2); this.startDrowning(); this.pose(dt); return; }
        } else this.deepT = 0;
      }
      this.settle(w2);
      this.waterFx(dt, w2);
    } else this.swimming = false;
    this.pose(dt);
  }

  /** stand on the ground, or bob about on the surface out in deep water; `w` is waterAt(pos) */
  settle(w = this.game.world.waterAt(this.pos.x, this.pos.z)) {
    const world = this.game.world;
    let y = world.groundHeight(this.pos.x, this.pos.z);
    this.swimming = w.depth === 2;
    if (this.swimming) {
      const bob = Math.sin(this.game.time * 3.1 + this.id) * 0.022;
      y = Math.max(y, world.surfaceY(w, this.pos.x, this.pos.z) - 0.28 * this.scale + bob);
    }
    this.pos.y = y;
  }

  /** ripples: a wake behind swimmers, lazy rings around floaters, splashy ones round wading legs */
  waterFx(dt, w) {
    if (!w.depth) return;
    this.rippleT -= dt;
    if (this.rippleT > 0) return;
    const g = this.game, s = this.scale;
    const y = g.world.surfaceY(w, this.pos.x, this.pos.z);
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (this.swimming && sp > 0.6) {
      this.rippleT = 0.15;
      g.fx.ripple(this.pos.x - this.vel.x * 0.06, y, this.pos.z - this.vel.z * 0.06, 0.95 * s, 1.0, 0.32, 0.3 * s);
    } else if (this.swimming) {
      this.rippleT = rand(0.7, 1.1);
      g.fx.ripple(this.pos.x, y, this.pos.z, 0.85 * s, 1.7, 0.26, 0.32 * s);
    } else if (sp > 0.6) {
      this.rippleT = 0.26;
      g.fx.ripple(this.pos.x, y, this.pos.z, 0.6 * s, 0.75, 0.3, 0.15 * s);
    } else this.rippleT = 0.3;
  }

  /** out of its depth: thrashing about, drifting every which way, slowly going under */
  updateDrown(dt, water) {
    const g = this.game;
    this.drownT += dt;
    if (water.depth < 2) { this.setState(S.IDLE); this.scanT = 1; this.settle(water); return; } // washed into the shallows
    this.drownA += rand(-1, 1) * dt * 9;
    g.world.shoreDir(this.pos.x, this.pos.z, _v); // the surf nudges it (very slowly) back towards the shore
    this.pos.x += (Math.sin(this.drownA) * 0.6 + _v.x * 0.18) * dt;
    this.pos.z += (Math.cos(this.drownA) * 0.6 + _v.z * 0.18) * dt;
    g.world.resolve(this.pos, this.radius);
    this.heading = dampAngle(this.heading, this.drownA, 4, dt);
    const k = this.drownT / DROWN_TIME, s = this.scale;
    const y = g.world.surfaceY(water, this.pos.x, this.pos.z);
    // bobs up gasping, dips under, lower and lower as it tires
    const dip = Math.max(0, Math.sin(g.time * 4.3 + this.id)) * (0.08 + k * 0.22);
    this.pos.y = y - (0.2 + k * 0.2 + dip) * s;
    this.rippleT -= dt;
    if (this.rippleT <= 0) {
      this.rippleT = 0.14;
      g.fx.ripple(this.pos.x, y, this.pos.z, rand(0.9, 1.3) * s, 0.7, 0.42, 0.35 * s);
      g.fx.burst(_v.set(this.pos.x, y + 0.05, this.pos.z), { glow: true, n: 2, colors: [0xffffff, 0xdff6ff], speed: [0.4, 1.4], up: [1.2, 2.6], grav: 9, size: [0.035, 0.06], life: [0.3, 0.6] });
    }
    if (Math.random() < dt * 1.2) g.audio.peep(this.stage);
    if (this.drownT > DROWN_TIME) this.die('drown');
  }

  updateSprout(dt) {
    this.growT += dt;
    if (this.stage < 2 && this.growT > GROW_TIME[this.stage]) this.setStage(this.stage + 1);
    this.pos.y = this.game.world.groundHeight(this.pos.x, this.pos.z) - this.rig.neckPos.y * this.scale + 0.02;
  }

  updatePop(dt) {
    const k = Math.min(1, this.t / 0.5);
    const gy = this.game.world.groundHeight(this.pos.x, this.pos.z);
    const sunk = gy - this.rig.neckPos.y * this.scale;
    this.pos.y = THREE.MathUtils.lerp(sunk, gy, Math.min(1, k * 2.2)) + Math.sin(k * Math.PI) * 0.9;
    this.heading += dt * 12;
    if (k >= 1) {
      this.pos.y = gy;
      this.squash = 1;
      this.setState(S.FOLLOW);
      this.game.audio.peep(this.stage);
    }
  }

  updateBurrow(dt) {
    const k = Math.min(1, this.t / 0.35);
    const gy = this.game.world.groundHeight(this.pos.x, this.pos.z);
    this.pos.y = gy - this.rig.neckPos.y * this.scale * k;
    if (Math.random() < dt * 30) this.game.fx.dirt(this.pos, 1, 0.4);
    if (k >= 1) { this.growT = 0; this.setState(S.SPROUT); }
  }

  updateFlight(dt) {
    const f = this.flight;
    const k = Math.min(1, this.t / f.T);
    if (f.seat) f.seat.set.seatPos(f.seat.i, f.to, this); // hopping onto something that moves
    this.pos.lerpVectors(f.from, f.to, k);
    this.pos.y += f.h * 4 * k * (1 - k);
    if (this.state === S.THROWN && !this.flung && !this.joinAfterHop && !f.seat) {
      // thrown turkeys grab hold of any foe they hit
      if (k > 0.2) {
        const e = this.game.enemies.hitTest(this.pos);
        if (e) {
          this.flight = null;
          this.foe = e;
          this.latched = true;
          this.setState(S.ATTACK);
          e.latch(this);
          this.game.audio.peep(this.stage);
          return;
        }
      }
      // ...and one that plops into a mound gets planted again, coming back up as the mound's kind
      // (so it can grow some more; normal into a beach mound makes a beach turkey, and vice versa)
      if (k > 0.3) {
        const m = this.game.mounds.diveInto(this.pos);
        if (m) { m.convert(this); return; }
      }
    }
    // coming down through a beach umbrella? boing! (flights aimed at the canopy itself land there as usual)
    if (this.state === S.THROWN && !f.seat && k > 0.5) {
      const u = this.game.toys.umbrellaAt(this.pos);
      if (u && f.to.y < u.canopyY(Math.hypot(f.to.x - u.x, f.to.z - u.z)) - 0.3) {
        this.flight = null;
        this.pos.y = u.canopyY(Math.hypot(this.pos.x - u.x, this.pos.z - u.z));
        this.flung = false;
        u.bounce(this);
        return;
      }
    }
    if (k >= 1) {
      this.pos.y = f.to.y;
      this.flight = null;
      if (f.seat) { this.sitOn(f.seat); return; }
      if (this.state === S.LAUNCHED) {
        this.game.fx.dirt(this.pos, 8);
        this.game.audio.land();
        this.setState(S.BURROW);
      } else {
        this.onLand();
      }
    }
  }

  updateFollow(dt, sp) {
    const g = this.game, tk = g.turkeys, p = g.player;
    const d = Math.hypot(tk.rally.x - this.pos.x, tk.rally.z - this.pos.z);
    // (having a sunbake while you stand about on the sand: the moment you're off, up it gets and after you)
    if (this.sunT > 0) {
      this.brake(dt);
      this.sunIn += dt;
      this.sunT = (d > tk.blobR ? Math.min(this.sunT, 0.5) : this.sunT) - dt;
      return;
    }
    if (d > tk.blobR) {
      this.showT = 0; // (no time for showing off: you're off)
      const boost = d > 5 ? 1.45 : 1.1;
      this.steer(tk.rally.x, tk.rally.z, sp * boost, dt, tk.blobR * 0.7, false, true);
    } else {
      this.brake(dt);
      if (this.vel.lengthSq() < 0.05) {
        if (!this.showT) this.faceToward(p.pos.x, p.pos.z, dt, 3); // (bar one that's showing off: see updateShow)
        // (you've stopped on the sand at the beach, or on Benny's steps: one by one, they flop down for a sunbake)
        if (p.speed < 0.3 && Math.random() < dt * 0.1 && g.world.sunTrap(this.pos.x, this.pos.z)) this.sunbake(rand(10, 25));
      }
    }
  }

  /* ---------------------------------------------------------------- raking litter home */
  /*
   * Like real brush turkeys, they don't carry leaves: they rake them. The turkey plants its feet just
   * past a clump of litter, facing away from the mound, and kicks it backwards: two big scrapes with the
   * left foot send the left half of the pile flying, two with the right send the rest after it. Then a
   * look at where it all landed, a scurry back to get behind it again, and another go, until the last
   * kicks fling it up onto the heap.
   */

  /**
   * Off to rake a clump of litter home, starting at `first`; false if there's no mound to take it to. (It
   * only lays claim to the rest of the clump once it's got there, so while it's on its way, nobody else
   * nearer is kept off the litter, and if it can't get there after all, it's only the one bit given up on)
   */
  startRake(first) {
    const g = this.game;
    const m = g.mounds.nearestReachable(first.pos);
    if (!m) return false;
    this.clump.length = 0;
    this.clump.push(first);
    first.owner = this;
    this.rakeTo = m;
    this.rakeTries = 0;
    this.rakeStall = 0;
    this.seekBest = Infinity;
    this.rakePhase = 'set';
    this.setT = 0;
    this.scratching = false;
    this.setState(S.SEEK);
    return true;
  }

  /** the middle of its clump (pieces mid-hop count from where they'll land); returns how many are left */
  clumpCentre(out) {
    let n = 0;
    out.set(0, 0, 0);
    for (const l of this.clump) {
      if (l.owner !== this) continue;
      const p = l.state === 'kicked' ? l.to : l.pos;
      out.x += p.x;
      out.z += p.z;
      n++;
    }
    if (n) { out.x /= n; out.z /= n; }
    return n;
  }

  /** which way to rake from c: towards the mound (through the gates), swinging round rocks and trees */
  rakeDir(c, out) {
    const g = this.game, m = this.rakeTo;
    const wp = g.world.route(c.x, c.z, m.pos.x, m.pos.z, _r);
    if (!wp) return null;
    const dx = wp.x - c.x, dz = wp.z - c.z, d = Math.hypot(dx, dz) || 1;
    return g.world.clearHeading(c.x, c.z, dx / d, dz / d, 0.35, 1.3, this.rakeMemo, out) ?? out.set(dx / d, 0, dz / d);
  }

  /** out of litter (it's all on the mound): back to the patch for more */
  rakeDone() {
    this.clump.length = 0;
    this.rakeTo = null;
    this.scratching = false;
    if (!this.workCenter || !this.findWork()) {
      this.workCenter = null;
      this.setState(S.IDLE);
    }
  }

  /**
   * Couldn't get it there: leave it for someone else. If the pile itself is the trouble (jammed in
   * somewhere it can't be kicked out of), everyone leaves it be for a good while
   */
  giveUpRake(stuck = false) {
    if (stuck) {
      const until = this.game.time + SNUB_TIME;
      for (const l of this.clump) if (l.owner === this) l.snubT = until;
    }
    this.dropEverything();
    this.setState(S.IDLE);
    this.scanT = rand(0.8, 1.5);
  }

  /** got to its pile, but fancies a roost up the gum instead? (whatever it was thrown there to do) True if it's off */
  roostWhim() {
    if (this.playCool > 0 || Math.random() >= ROOST_WHIM) return false;
    const seat = this.game.toys.freeRoostNear(this.pos, ROOST_NEAR);
    if (!seat) return false;
    this.goPlay(seat);
    return true;
  }

  /** a go that got nowhere; a few of those and it gives up on this pile. True if it's given up */
  failedTry() {
    if (++this.rakeTries < RAKE_TRIES) return false;
    this.giveUpRake(true);
    return true;
  }

  /**
   * Where to stand to kick the pile at c along dir: just past it, somewhere it can actually get to. (Some
   * turkeys stand a touch to the left of their pile, some to the right, so two raking the same way end up
   * side by side rather than elbowing each other for the same spot)
   */
  standSpot(c, dir, out) {
    const w = this.game.world, back = 0.3 + this.radius, side = this.id % 2 ? 0.35 : -0.35;
    out.set(c.x - dir.x * back - dir.z * side, 0, c.z - dir.z * back + dir.x * side);
    for (let i = 0; i < 4 && !this.canSwim && w.waterDepth(out.x, out.z) === 2; i++) out.set((out.x + c.x) / 2, 0, (out.z + c.z) / 2);
    w.resolve(out, this.radius + 0.03, this.game.mounds.colliders); // (out of the rocks, trees and fences)
    w.resolve(out, this.radius + 0.03, this.game.enemies.colliders); // (and whatever's lying about, like a tipped-over bin)
    return out;
  }

  /** heading over to stand just past the clump, on the far side from the mound */
  updateSeek(dt, sp) {
    if (!this.game.mounds.list.includes(this.rakeTo)) { this.giveUpRake(); return; }
    const n = this.clumpCentre(_v);
    if (!n) { this.giveUpRake(); return; }
    const dir = this.rakeDir(_v, _k);
    if (!dir) { this.giveUpRake(true); return; }
    const st = this.standSpot(_v, dir, _s);
    const d = this.steer(st.x, st.z, sp, dt, 0.04, true);
    if (d < 0.5) {
      if (this.roostWhim()) return;
      // there: it rakes in the rest of what's lying about, as much as it can shift
      this.game.leaves.gather(this.clump, _v.x, _v.z, RAKE_R[this.stage], RAKE_WORTH[this.stage], this);
      this.setState(S.RAKE);
      this.rakePhase = 'set'; // (it settles in, turns its back on the mound, then kicks)
      this.setT = 0;
      return;
    }
    // (can't get round to it?)
    if (d < this.seekBest - 0.3) { this.seekBest = d; this.t = 0; }
    else if (this.t > 3) this.giveUpRake(true);
  }

  updateRake(dt, sp) {
    const g = this.game, m = this.rakeTo;
    if (!g.mounds.list.includes(m)) { this.giveUpRake(); return; }
    if ((this.rakeStall += dt) > 20) { this.giveUpRake(true); return; } // (backstop: nothing's come of it for ages)
    if (this.rakePhase === 'kick') { this.updateKicks(dt); return; } // (it finishes a bout, even the last one)
    const n = this.clumpCentre(_v);
    if (!n) { this.rakeDone(); return; }

    // between bouts: get round behind the pile again (mostly just a scurry backwards after it)
    const dir = this.rakeDir(_v, _k);
    if (!dir) { this.giveUpRake(true); return; }
    const st = this.standSpot(_v, dir, _s);
    const mx = st.x - this.pos.x, mz = st.z - this.pos.z, md = Math.hypot(mx, mz);
    const away = Math.atan2(-dir.x, -dir.z);
    // the spot's just behind it: back up, still facing away (a long way back, it turns and runs; either
    // way it swings round to face away as it gets there)
    const backing = md < 0.8 || (md < BACK_UP && mx * dir.x + mz * dir.z > md * 0.6);
    this.scratching = false;
    this.steer(st.x, st.z, backing ? sp * 0.7 : sp, dt, 0.04, true);
    if (backing) this.turnTo(away, dt);
    else if (this.vel.lengthSq() > 0.04) this.turnTo(Math.atan2(this.vel.x, this.vel.z), dt, 9);
    // there (and settled), with its back to the mound: feet planted, and kick. (Near enough will do if
    // another turkey keeps bumping it off the spot: they're often raking the same patch)
    this.setT += dt;
    const facing = Math.abs(angleDiff(this.heading, away)) < 0.15;
    if (facing && ((md < 0.12 && this.vel.lengthSq() < 0.06) || (md < 0.45 && this.setT > 1.2))) { this.startKicks(dir); return; }
    // can't get into place at all (hemmed in)? that's a wasted go; have a kick from here
    if (this.setT > SET_TIMEOUT) {
      this.setT = 0;
      if (!this.failedTry()) this.startKicks(dir);
    }
  }

  /** feet planted: share the pile out between the kicks (left-hand half to the left foot, nearer bits first) */
  startKicks(dir) {
    const g = this.game, m = this.rakeTo;
    const lx = -dir.z, lz = dir.x; // its left, facing away from the mound
    _pile.length = 0;
    let cx = 0, cz = 0;
    for (const l of this.clump) {
      if (l.owner !== this || l.state !== 'ground') continue; // (anything still in the air: wait for it)
      if (Math.hypot(l.pos.x - this.pos.x, l.pos.z - this.pos.z) > RAKE_R[this.stage] + 1.5) { g.leaves.release(l); continue; } // left behind
      _pile.push(l);
      cx += l.pos.x; cz += l.pos.z;
    }
    if (!_pile.length) return;
    cx /= _pile.length; cz /= _pile.length;
    // how far the pile has to go (to see if this bout gets it anywhere), and so how hard to kick it
    this.boutFrom = Math.hypot(cx - m.pos.x, cz - m.pos.z);
    this.boutGot = 0;
    const B = KICK_BOOST;
    this.kickFar = KICK_REACH[this.stage] * (1 + (B.max - 1) * clamp((this.boutFrom - B.near) / (B.far - B.near), 0, 1));
    // (on its way through a gate: not so hard it sails past the gap into the fence)
    const wp = g.world.route(cx, cz, m.pos.x, m.pos.z, _r);
    if (wp && (wp.x !== m.pos.x || wp.z !== m.pos.z)) this.kickFar = Math.min(this.kickFar, Math.hypot(wp.x - cx, wp.z - cz) + 1.5);
    const side = (l) => (l.pos.x - this.pos.x) * lx + (l.pos.z - this.pos.z) * lz;
    const along = (l) => (l.pos.x - this.pos.x) * dir.x + (l.pos.z - this.pos.z) * dir.z;
    _pile.sort((a, b) => side(b) - side(a));
    const half = Math.ceil(_pile.length / 2);
    for (let f = 0; f < 2; f++) {
      const bits = _pile.slice(f ? half : 0, f ? _pile.length : half).sort((a, b) => along(a) - along(b));
      const first = Math.ceil(bits.length / 2);
      const k1 = this.kickPlan[f * 2], k2 = this.kickPlan[f * 2 + 1];
      k1.length = k2.length = 0;
      bits.forEach((l, i) => (i < first ? k1 : k2).push(l));
    }
    this.kickDir.copy(dir);
    this.kickN = 0;
    this.kickRest = 0;
    this.rakePhase = 'kick';
    this.scratching = true;
    this.scrapeClock = CYCLE - 0.02; // straight into a fresh pair of scrapes
  }

  /** a bout: left, left, change feet, right, right (each kick sends its share of the pile flying), then a breather */
  updateKicks(dt) {
    const dir = this.kickDir, m = this.rakeTo;
    this.brake(dt, 25); // (standing its ground)
    this.turnTo(Math.atan2(-dir.x, -dir.z), dt);
    const landed = this.scratchTick(dt);
    for (let k = 0; k < landed && this.kickN < 4; k++, this.kickN++) this.kickBits(this.kickPlan[this.kickN], this.kickN < 2 ? 1 : -1);
    if (this.kickN < 4 || (this.kickRest += dt) < KICK_BREATHER) return;
    this.rakePhase = 'set';
    this.setT = 0;
    this.scratching = false;
    // did that get it anywhere? (a few goes that don't, and it gives up on this pile)
    const n = this.clumpCentre(_v);
    if (!n || this.boutGot > 0 || Math.hypot(_v.x - m.pos.x, _v.z - m.pos.z) < this.boutFrom - 0.3) {
      this.rakeTries = 0;
      this.rakeStall = 0;
    } else this.failedTry();
  }

  /** one kick: these bits fly a good way back towards the mound (to its left or right, by `foot`), onto it if they get that far */
  kickBits(bits, foot) {
    const g = this.game, m = this.rakeTo, dir = this.kickDir;
    const lx = -dir.z, lz = dir.x;
    const reach = 0.3 + this.radius, far = this.kickFar;
    for (const l of bits) {
      if (l.owner !== this || l.state !== 'ground') continue;
      const rx = l.pos.x - this.pos.x, rz = l.pos.z - this.pos.z;
      const a = rx * dir.x + rz * dir.z, s = rx * lx + rz * lz;
      // it lands pulled in towards a tidy pile, the left foot's lot on the left and the right's on the right
      const a2 = far + (a + reach) / 2 + rand(-0.25, 0.25);
      const s2 = (s + foot * 0.3) / 2 + rand(-0.14, 0.14);
      _w.set(this.pos.x + dir.x * a2 + lx * s2, 0, this.pos.z + dir.z * a2 + lz * s2);
      // over the mound on the way? then that's where it ends up
      if (segDist(m.pos.x, m.pos.z, l.pos.x, l.pos.z, _w.x, _w.z) < m.r + 0.3) { g.leaves.deliver(l, m); this.boutGot++; continue; }
      // (never over a fence, nor out into the deep)
      const len = Math.hypot(_w.x - l.pos.x, _w.z - l.pos.z) || 1;
      const clear = g.world.throwClear(l.pos.x, l.pos.z, _w.x, _w.z);
      if (clear < 1) {
        const t = Math.max(0, clear - 0.3 / len);
        _w.set(l.pos.x + (_w.x - l.pos.x) * t, 0, l.pos.z + (_w.z - l.pos.z) * t);
      }
      for (let i = 0; i < 3 && g.world.waterDepth(_w.x, _w.z) === 2; i++) _w.set((_w.x + l.pos.x) / 2, 0, (_w.z + l.pos.z) / 2);
      g.world.resolve(_w, 0.12);
      g.leaves.kick(l, _w.x, _w.z);
    }
    this.scrapeDust(dir, g.world.isSand(this.pos.x, this.pos.z) ? SAND_BITS : SOIL_BITS, foot * 0.1, true);
    g.audio.leaf();
  }

  updateEat(dt, sp) {
    const g = this.game, gr = this.grub;
    if (!gr || !gr.alive || gr.owner !== this || this.t > 9) {
      if (gr && gr.owner === this) g.grubs.release(gr);
      this.grub = null;
      this.setState(S.IDLE);
      return;
    }
    const d = this.steer(gr.pos.x, gr.pos.z, sp, dt, 0.15 + this.radius * 0.5);
    if (d < 0.2 + this.radius * 0.6) {
      this.faceToward(gr.pos.x, gr.pos.z, dt, 20);
      this.startPeck(() => {
        if (!gr.alive) return;
        g.grubs.eat(gr);
        this.grub = null;
        g.audio.gulp();
        if (this.stage < 2) this.setStage(this.stage + 1);
        if (!this.workCenter || !this.findWork()) this.setState(S.IDLE);
      });
    }
  }

  updateAttack(dt, sp) {
    const foe = this.foe;
    if (!foe || !foe.alive || !foe.targetable) {
      this.foe = null;
      this.latched = false;
      this.setState(S.IDLE);
      this.scanT = 0;
      if (foe && foe.state === 'carcass') this.haul(foe);
      return;
    }
    this.hitting = false;
    if (this.latched) {
      // clinging on: ride along and peck
      this.pos.copy(this.attachObj.localToWorld(_v.copy(this.attachLocal)));
      foe.bodyCenter(_r);
      this.heading = Math.atan2(_r.x - this.pos.x, _r.z - this.pos.z);
      this.vel.set(0, 0, 0);
      foe.damage(DPS[this.stage] * 1.5 * dt, this);
      this.hitting = true;
      return;
    }
    // on foot, pecking at its legs (landlubbers won't follow it into deep water)
    if (!this.canSwim && this.game.world.waterDepth(foe.pos.x, foe.pos.z) === 2) { this.foe = null; this.setState(S.IDLE); return; }
    if (Math.hypot(foe.pos.x - this.pos.x, foe.pos.z - this.pos.z) > 9) { this.foe = null; this.setState(S.IDLE); return; }
    // (at a chore, it keeps an eye out: a guard coming at it, say, it drops everything and has a go at that first)
    if (foe.chore && (this.watchT -= dt) <= 0) {
      this.watchT = rand(0.3, 0.5);
      const e = this.findFoe(FIGHT_R, false);
      if (e) { this.attack(e); return; }
    }
    if (foe.attackSpot) foe.attackSpot(this, _at, _af); // (something wide, like a barricade: a spot along its face)
    else {
      const dx = this.pos.x - foe.pos.x, dz = this.pos.z - foe.pos.z, dist = Math.hypot(dx, dz) || 1;
      const ring = foe.def.radius + this.radius + 0.05;
      _at.set(foe.pos.x + (dx / dist) * ring, 0, foe.pos.z + (dz / dist) * ring);
      _af.copy(foe.pos);
    }
    const d = this.steer(_at.x, _at.z, sp, dt, 0.05);
    this.faceToward(_af.x, _af.z, dt, 12);
    if (d < 0.3) {
      foe.damage(DPS[this.stage] * dt, this);
      this.hitting = true;
      // sand flies out behind a turkey digging something out
      if (foe.def.task === 'dig' && this.scratchTick(dt)) this.scrapeDust(_v.set(-Math.sin(this.heading), 0, -Math.cos(this.heading)), foe.def.bits === 'soil' ? SOIL_BITS : SAND_BITS);
    }
  }

  updateHaul(dt, sp) {
    const o = this.obj;
    if (!o || o.state !== 'carcass') { this.obj = null; this.setState(S.IDLE); return; }
    o.slotPos(this.slot, _v);
    if (!this.canSwim && this.game.world.waterDepth(_v.x, _v.z) === 2) {
      // swimmers are taking it out into the deep: let go at the water's edge
      o.leaveCarry(this);
      this.obj = null;
      this.slot = -1;
      this.setState(S.IDLE);
      this.scanT = 1.5;
      return;
    }
    const d = this.steer(_v.x, _v.z, sp * 1.2, dt, 0.05);
    if (d < 0.3) this.faceToward(o.pos.x, o.pos.z, dt, 8);
  }

  updateDying(dt) {
    const r = this.rig, s = this.scale;
    let done = this.t > 0.45;
    if (this.deathCause === 'squash') {
      // flat as a pancake for ten seconds, then it sinks away
      const k = Math.min(1, this.t / 0.12);
      const sink = Math.max(0, this.t - 10) / 0.6;
      r.root.scale.set(s * (1 + k * 0.7), s * Math.max(0.07, 1 - k), s * (1 + k * 0.7));
      r.root.position.y = this.pos.y + 0.01 - sink * 0.12;
      done = sink >= 1;
    } else if (this.deathCause === 'eaten') {
      r.root.visible = false;
      done = true;
    } else if (this.deathCause === 'drown') {
      // one last flap, then it slips under with a trail of bubbles
      const k = Math.min(1, this.t / 0.9);
      r.root.position.y = this.pos.y - k * k * 0.9 * s;
      r.root.rotation.x = -k * 0.8;
      r.wingL.rotation.z = (1 - k) * 1.2;
      r.wingR.rotation.z = -(1 - k) * 1.2;
      if (Math.random() < 0.5) this.game.fx.burst(_v.set(this.pos.x, this.pos.y + 0.2 * s, this.pos.z), { glow: true, n: 1, colors: [0xdff6ff, 0xffffff], speed: [0, 0.3], up: [0.6, 1.2], grav: -1, size: [0.03, 0.06], life: [0.4, 0.8] });
      done = k >= 1;
    } else {
      const k = Math.min(1, this.t / 0.4);
      r.root.position.y = this.pos.y + Math.sin(k * Math.PI) * (this.deathCause === 'swept' ? 1.2 : 0.4);
      r.root.rotation.z = k * (this.deathCause === 'swept' ? 6 : 2.5);
      r.root.scale.setScalar(s * (1 - k * 0.7));
    }
    if (done) {
      this.removed = true;
      this.game.scene.remove(r.root);
    }
  }

  /* ------------------------------------------------------------------ animation */
  pose(dt) {
    const r = this.rig;
    const speed = Math.hypot(this.vel.x, this.vel.z);
    const walking = this.grounded;
    const k = walking ? clamp(speed / 1.2, 0, 1) : 0;
    this.phase += dt * (4 + speed * 4.5) * (walking ? 1 : 0);
    this.squash = Math.max(0, this.squash - dt * 4);
    const time = this.game.time;

    this.lookTimer -= dt;
    if (this.lookTimer <= 0) {
      this.lookTimer = this.state === S.SPROUT ? rand(0.4, 1.4) : rand(0.8, 2.5);
      this.lookTarget = rand(-1, 1) * (this.state === S.SPROUT ? 1.3 : 0.8);
      this.tiltTarget = Math.random() < 0.3 ? rand(-0.35, 0.35) : 0;
    }
    const lookAmt = (1 - k) * (this.state === S.ATTACK ? 0 : 1);
    this.look = damp(this.look, this.lookTarget * lookAmt, 9, dt);
    this.tilt = damp(this.tilt, (this.tiltTarget ?? 0) * lookAmt, 6, dt);

    r.root.position.copy(this.pos);
    r.root.rotation.set(0, this.heading, 0);
    const sq = Math.sin(this.squash * Math.PI) * 0.25;
    const s = this.scale;
    r.root.scale.set(s * (1 + sq * 0.5), s * (1 - sq), s * (1 + sq * 0.5));

    const swing = Math.sin(this.phase) * 0.75 * k;
    r.legL.rotation.x = swing;
    r.legR.rotation.x = -swing;
    r.legL.scale.y = r.legR.scale.y = 1; // (folded up small when it's sitting down: roosting, sunbaking)
    r.bodyPivot.position.y = Math.abs(Math.cos(this.phase)) * 0.03 * k;
    r.bodyPivot.rotation.z = Math.sin(this.phase) * 0.06 * k;

    // chores: scratching (digging out a flag, raking litter home, scratching up a new mound, digging you out) and
    // shoving (tipping over a bin)
    const task = this.state === S.ATTACK && this.hitting && !this.latched ? this.foe?.def.task : null;
    const scratching = task === 'dig' || ((this.state === S.BUILD || this.state === S.RAKE || this.state === S.DIGOUT) && this.scratching);
    const pushing = task === 'push';
    const scr = scratching ? scrapeAt(this.scrapeClock ?? 0) : null; // mid-scrape, changing feet, or having a breather
    const kicking = !!scr?.leg;
    const kickA = kicking ? kickSwing(scr.u) : 0; // (from drawn up under it to raked right back)
    // the body follows the kicking leg round a touch behind, so the whole bird flows into each kick (and
    // eases down into a scratching stoop and back up out of it) rather than snapping between poses
    this.kickLean = damp(this.kickLean, kickA, 12, dt);
    this.stoop = damp(this.stoop, scratching ? (kicking ? 0.28 + this.kickLean * 0.1 : scr ? 0.24 : 0.14) : 0, 9, dt);
    this.stoopNeck = damp(this.stoopNeck, scratching ? (kicking ? 0.5 + this.kickLean * 0.08 : scr ? 0.35 : 0.1) : 0, 9, dt);
    let peckA = this.peck > 0 ? Math.sin(Math.min(1, this.peck) * Math.PI) * 1.25 : 0;
    if (this.state === S.ATTACK && this.hitting) peckA = Math.max(0, Math.sin(time * 14 + this.id)) * 1.1;
    if (scratching) peckA = this.stoopNeck;
    else if (pushing) peckA = PUSH_NECK;
    else peckA += this.stoopNeck; // (still coming up from a scratch)
    r.neck.position.z = r.neckPos.z + Math.sin(this.phase * 2) * 0.03 * k;
    r.neck.position.y = r.neckPos.y;
    r.neck.rotation.set(peckA + Math.sin(time * 1.3 + this.id) * 0.03, this.look, this.tilt);

    let flap = 0.05;
    const ride = this.state === S.SWING ? this.seat?.set : null;
    const seatPose = ride ? ride.poseOf?.(this.seat.i) ?? ride.seatPose : null;
    if (this.state === S.THROWN || this.state === S.LAUNCHED || this.state === S.POP || this.state === S.TUNNEL) flap = 0.5 + Math.sin(time * 38 + this.id) * 0.8;
    else if (this.latched) flap = 0.35 + Math.sin(time * 20 + this.id) * 0.3;
    else if (seatPose === 'perch') {
      // roosting on the Hills Hoist: wings out for balance, more and more as it whirls round
      const w = Math.min(1, ride.w / 3);
      flap = 0.12 + w * 0.55 + Math.max(0, Math.sin(time * 16 + this.id)) * (0.12 + w * 0.3);
      r.legL.rotation.x = r.legR.rotation.x = 0.12;
      r.bodyPivot.rotation.z = -w * 0.3; // leaning in towards the pole
    } else if (seatPose === 'roost') {
      // roosting up a gum (or sitting in the stands, or on the mower): hunkered down on the branch with its
      // feet tucked up under it. The odd big stretch of the wings, and every so often a little doze
      r.legL.rotation.x = r.legR.rotation.x = 0;
      r.legL.scale.y = r.legR.scale.y = 0.35;
      r.bodyPivot.position.y = -0.2;
      r.bodyPivot.rotation.z = 0;
      flap = 0.03 + Math.pow(Math.max(0, Math.sin(time * 0.7 + this.id * 1.7)), 24) * 1.1;
      r.neck.rotation.x += clamp((Math.sin(time * 0.23 + this.id * 2.1) - 0.75) * 4, 0, 1) * 0.6;
    } else if (this.sunT > 0 || seatPose === 'sunbake') {
      // sunbaking, like brush turkeys do: flat on the ground, wings spread wide and feathers to the sun,
      // leaning over to one side with its head cocked up (or lying about on the steps with Benny, for as long as it's there)
      const seated = seatPose === 'sunbake';
      const k2 = clamp((seated ? Math.min(this.t, this.swingT) : Math.min(this.sunIn, this.sunT)) / 0.6, 0, 1); // (easing down into it and back up out of it)
      const side = seated ? (this.id % 2 ? 1 : -1) : this.sunSide;
      r.legL.rotation.x = r.legR.rotation.x = 0;
      r.legL.scale.y = r.legR.scale.y = 1 - 0.7 * k2;
      r.bodyPivot.position.y = -0.22 * k2;
      r.bodyPivot.rotation.z = 0.22 * side * k2;
      flap = 0.05 + 1.05 * k2 + Math.sin(time * 0.9 + this.id) * 0.04 * k2;
      r.neck.rotation.x -= 0.35 * k2;
      r.neck.rotation.z = this.tilt + 0.45 * side * k2;
    } else if (seatPose === 'lounge') {
      // feet up in a beach chair (or at the wheel of the mower: the legs lean back with the body); a royal wave for
      // the peasants doing the carrying
      r.legL.rotation.x = r.legR.rotation.x = -1.0;
      flap = 0.04;
      r.wingR.rotation.z = ride.carrying ? -(1.1 + Math.sin(time * 7 + this.id) * 0.45) : -0.04;
    } else if (this.state === S.SWING) {
      flap = 0.2 + Math.max(0, Math.sin(time * 5 + this.id)) * 0.6;
      r.legL.rotation.x = r.legR.rotation.x = -1.1;
    } else if (this.state === S.HELD) {
      flap = 0.6 + Math.sin(time * 32 + this.id) * 0.9;
      r.legL.rotation.x = Math.sin(time * 25 + this.id) * 0.9;
      r.legR.rotation.x = -Math.sin(time * 25 + this.id) * 0.9;
    } else if (scratching) {
      // scratching like a proper brush turkey: two hard kicks back with one foot (its weight over the
      // other), a moment to change feet, two with the other, then a breather with both feet down.
      // (the legs glide between all that: picking up from wherever they were when it started)
      if (!this.wasScratching) { this.legLs = r.legL.rotation.x; this.legRs = r.legR.rotation.x; }
      const brace = -0.08 - this.kickLean * 0.1; // (the standing leg braces as it throws its weight into the kick)
      this.legLs = damp(this.legLs, kicking ? (scr.leg === 'L' ? kickA : brace) : 0, 22, dt);
      this.legRs = damp(this.legRs, kicking ? (scr.leg === 'R' ? kickA : brace) : 0, 22, dt);
      r.legL.rotation.x = this.legLs;
      r.legR.rotation.x = this.legRs;
      this.scrLean = damp(this.scrLean, kicking ? (scr.leg === 'L' ? 0.08 : -0.08) : 0, 6, dt);
      r.bodyPivot.rotation.z = this.scrLean;
      flap = 0.07 + Math.max(0, this.kickLean) * 0.16;
    } else if (pushing) {
      // shoulder to the bin, legs going like the clappers, wings flapping for extra oomph
      r.legL.rotation.x = Math.sin(time * 13 + this.id) * 0.7 + 0.25;
      r.legR.rotation.x = -Math.sin(time * 13 + this.id) * 0.7 + 0.25;
      flap = 0.45 + Math.sin(time * 24 + this.id) * 0.45;
    }
    else if (this.state === S.HAUL && this.obj && this.obj.carrying) flap = 0.25 + Math.sin(time * 16 + this.id) * 0.2;
    r.wingL.rotation.z = flap;
    if (seatPose !== 'lounge') r.wingR.rotation.z = -flap;

    // (otherwise: head down and tail up while it scratches, rocking back to draw a foot up and leaning into
    // the kick; half up changing feet; up for a look round after, and easing back up when it's done)
    let tip = this.stoop, flip = false;
    if (this.state === S.LAUNCHED && this.flight) {
      tip = (this.t / this.flight.T) * TAU * this.flight.spin;
      flip = true;
    } else if (this.state === S.THROWN && this.flight) {
      const kk = this.t / this.flight.T;
      flip = !!this.flight.spin;
      tip = flip ? kk * TAU * this.flight.spin : (kk - 0.5) * 0.9;
    } else if (this.state === S.TUNNEL && this.flight) {
      // (into a mound beak first; out of one in a backflip)
      const kk = this.t / this.flight.T;
      flip = !!this.flight.spin;
      tip = flip ? kk * TAU * this.flight.spin : kk * 1.4;
    } else if (this.latched) {
      tip = 0.6;
    } else if (pushing) {
      tip = PUSH_TIP; // leaning right into it
    } else if (seatPose === 'lounge') {
      tip = -0.5; // leaning back, soaking up the sun
      r.neck.rotation.x += 0.35;
    }
    r.bodyPivot.rotation.x = tip;
    if (flip) {
      // somersault about the middle of the body (not the feet), legs and all
      r.bodyPivot.position.y = BODY_MID * (1 - Math.cos(tip));
      r.bodyPivot.position.z = -BODY_MID * Math.sin(tip);
    } else r.bodyPivot.position.z = 0;

    if (this.state === S.SPROUT) r.bodyPivot.position.y = Math.max(0, Math.sin(time * 1.7 + this.id * 1.3)) * 0.05;

    if (this.state === S.DROWN) {
      // flailing! wings thrashing, rocking side to side, beak up gasping for air
      const f = 0.9 + Math.sin(time * 30 + this.id) * 0.9;
      r.wingL.rotation.z = f;
      r.wingR.rotation.z = -(0.9 + Math.sin(time * 27 + this.id + 1) * 0.9);
      r.bodyPivot.rotation.z = Math.sin(time * 9 + this.id) * 0.35;
      r.bodyPivot.rotation.x = -0.35 + Math.sin(time * 6.5 + this.id) * 0.15;
      r.neck.rotation.x = -0.7 + Math.sin(time * 12) * 0.25;
      r.legL.rotation.x = Math.sin(time * 22 + this.id) * 1.1;
      r.legR.rotation.x = -Math.sin(time * 22 + this.id) * 1.1;
    } else if (this.swimming) {
      // paddling: legs kick under the water, head up, a gentle breaststroke when on the move
      const sw = clamp(speed / 2, 0, 1);
      r.legL.rotation.x = Math.sin(time * (6 + sw * 8) + this.id) * (0.5 + sw * 0.4);
      r.legR.rotation.x = -Math.sin(time * (6 + sw * 8) + this.id) * (0.5 + sw * 0.4);
      r.bodyPivot.rotation.x = -0.12 - sw * 0.1;
      r.bodyPivot.rotation.z = Math.sin(time * 2.1 + this.id) * 0.05;
      const stroke = (0.1 + Math.max(0, Math.sin(time * 7 + this.id)) * 0.5) * sw;
      r.wingL.rotation.z = Math.max(r.wingL.rotation.z, stroke);
      r.wingR.rotation.z = Math.min(r.wingR.rotation.z, -stroke);
      if (this.rescued > 0) r.neck.rotation.x = -0.4; // a whistled landlubber, paddling for dear life
    }

    // a cock showing off (see showOff): chest out and head up, wings let down a touch, and his wattle puffed right out,
    // then with each note of his boom a pump of the whole bird, head going forward and the wattle swelling out that bit
    // more, for as long as the note goes (and harder for the louder ones)
    if (r.wattle) {
      let puff = 0, pump = 0;
      if (this.showT > 0) {
        const t = this.showT, done = SHOW.puff + BOOM_END / this.boomRate + SHOW.hold;
        puff = t < done ? smoothstep(0, SHOW.puff, t) : 1 - smoothstep(done, done + SHOW.down, t);
        if (this.boomed) {
          for (const [at, len, loud] of BOOM) {
            const u = (t - SHOW.puff) * this.boomRate - at; // (since that note started, as the recording goes)
            if (u >= 0 && u < len + 0.5) pump = Math.max(pump, loud * Math.min(1, u / 0.04) * Math.exp(-Math.max(0, u - len) / 0.1));
          }
        }
      }
      this.puff = damp(this.puff, puff, 14, dt); // (going down in a hurry if he's cut short)
      const f = this.puff, sz = SHOW.size, p = pump * SHOW.pump;
      r.wattle.scale.set(1 + (sz[0] - 1) * f + p, 1 + (sz[1] - 1) * f + p, 1 + (sz[2] - 1) * f + p * 1.5);
      if (f > 0.001) {
        r.neck.rotation.x += -0.32 * f + 0.4 * pump;
        r.neck.rotation.y *= 1 - f; // (looking straight ahead, full of himself)
        r.bodyPivot.rotation.x += -0.1 * f + 0.12 * pump;
        r.bodyPivot.position.y += 0.02 * f - 0.035 * pump;
        r.wingL.rotation.z = Math.max(r.wingL.rotation.z, 0.22 * f);
        r.wingR.rotation.z = Math.min(r.wingR.rotation.z, -0.22 * f);
      }
    }
    this.wasScratching = scratching;
  }

  dispose() {
    this.dropEverything();
    this.game.scene.remove(this.rig.root);
  }
}
