import * as THREE from 'three';
import { Foe } from './foe.js';
import { part, merge, vcMesh, G, limb, rand, damp, dampAngle, TAU } from './util.js';

/*
 * Masked lapwings: plovers, to any Aussie. They've thrown in with the ibis: some of the ibises have one riding
 * about on their backs, keeping a lookout, and it swoops anything that comes near: it spots a turkey, sounds
 * off (kek-kek-kek!), takes off, gets up high and comes screaming down at it, yellow spurs out. A red circle
 * marks where it'll come through: clear out of it, or lose a turkey (a helmet saves one). Then it climbs away
 * and comes down by its ibis for a breather (and once the coast's clear, it hops back up on). Up in the air
 * there's no touching it, but land a turkey on it on the ground and it's pinned: it can't take off with one
 * hanging off, and down it goes, seeing stars. (The gulls at the wharf go about it the same way: see Gull.)
 */
// (what it's told when one gets away, and when one's dragged down: the same trick works on the gulls, so they share it)
export const PINNED = {
  away: ['gull-away', "It got away! Get a turkey on it before it's up"],
  down: ['gull-down', "Dragged down! It's seeing stars: mob it"],
};
const DEF = {
  name: 'Plover', hp: 16, scale: 1.15, radius: 0.26, bodyY: 0.42, labelY: 0.8, carcassLabelY: 0.45, dieTime: 0.6,
  alarmR: 9.5, maxLatch: 5, shakeAt: 3, shakeEvery: 3, value: 8, weight: 2, carryR: 0.55, slots: 6,
  swoopR: 0.8, speed: 3.4, hurt: 10,
  drag: 1, stun: 3.5, // (how many turkeys hanging off it drag it down as it takes off, and how long it's out for, in seconds)
  // (how many turkeys a swoop can take out, its cry, what flies off it when it's hit, and a word about it the
  // first time it goes up, the first time it gets you, gets away, and gets dragged down)
  kills: 1, cry: 'kek', squawk: 0.5,
  feathers: [0xf6f4ec, 0x9c8b63, 0x1a1a1a], dead: [0xf6f4ec, 0x9c8b63, 0x1a1a1a, 0xf7d417],
  tips: {
    up: ['plover-pin', 'Plovers! Dodge the red circle, and when one lands, throw a turkey on it to pin it down'],
    you: ['plover-you', 'Swooped! Plovers go for your head too'],
    ...PINNED,
  },
};
const ALT = 3.2; // how high it gets before a dive (metres: unless its def says otherwise)
// a swoop: sounding off, taking off, lining up (the spot's marked from here on), the dive, climbing away, landing
const ALARM_T = 0.55, RISE_T = 0.6, AIM_T = 0.8, DIVE_T = 0.42, CLIMB_T = 0.55, LAND_T = 0.35;
const FLYING = new Set(['rise', 'aim', 'dive', 'climb', 'return', 'land', 'board']);
// (riding an ibis) where it sits on the ibis's back (in its body's space, so at the ibis's 1x), how far its belly's
// up off its feet sat down (at the plover's 1x), how much of its legs is left sticking out sat down (folded right up
// under it), and hopping back on: how long it waits for the coast to be clear (seconds, with its ibis back to
// pottering about), how long the hop takes, and how high it goes (metres)
const BACK = new THREE.Vector3(0, 0.97, -0.1), SIT = 0.1, TUCKED = 0.1, CALM_T = 3, BOARD_T = 0.8, BOARD_HOP = 0.6;
// grabbed hold of, it tries to get up and away, turkeys and all: straining up off the ground for LIFT_T
// seconds, as high as LIFT_ALT (at 1x: less, the more of them there are hanging off it). Enough of them (its def's
// drag) and they drag it back down (that takes DROP_T), and it's out for a while (its def's stun), seeing stars,
// slumped down on its belly (SLUMP lower, at 1x)
const LIFT_T = 0.7, LIFT_ALT = 0.5, DROP_T = 0.3, SLUMP = 0.2;
const HAULED = new Set(['lift', 'drop']); // (up off the ground, but still fair game: there's turkeys hanging off it)
const BROWN = 0x9c8b63, BROWN2 = 0x857552, WHITE = 0xf6f4ec, CREAM = 0xe9e5d8, BLACK = 0x1a1a1a;
const YELLOW = 0xf7d417, YELLOW2 = 0xe8bf12, LEG = 0xc76b72, RED = 0xc42b2b;
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

let geos = null;
function build() {
  const body = [
    // white underneath, brown on top
    part(G.sphere(1, 14, 10), WHITE, [0, 0.4, 0], [-0.12, 0, 0], [0.115, 0.1, 0.19]),
    part(G.sphere(1, 14, 10), BROWN, [0, 0.435, -0.01], [-0.12, 0, 0], [0.118, 0.075, 0.2]),
    // white rump, and the tail: white with a broad black band near the tip
    part(G.box(0.11, 0.022, 0.1), WHITE, [0, 0.43, -0.22], [0.2, 0, 0]),
    part(G.box(0.112, 0.024, 0.045), BLACK, [0, 0.418, -0.28], [0.2, 0, 0]),
    part(G.box(0.1, 0.02, 0.02), WHITE, [0, 0.41, -0.31], [0.2, 0, 0]),
    // the black of the crown carries on down the neck onto the shoulders
    part(G.sphere(1, 8, 6), BLACK, [0.07, 0.47, 0.13], [0, 0, 0.4], [0.035, 0.05, 0.05]),
    part(G.sphere(1, 8, 6), BLACK, [-0.07, 0.47, 0.13], [0, 0, -0.4], [0.035, 0.05, 0.05]),
    part(G.sphere(0.035, 8, 6), CREAM, [0.045, 0.33, 0.01]),
    part(G.sphere(0.035, 8, 6), CREAM, [-0.045, 0.33, 0.01]),
  ];
  const neck = [
    limb([0, -0.03, -0.01], [0, 0.09, 0.03], 0.048, 0.042, WHITE, 8),
    limb([0, 0, -0.035], [0, 0.1, -0.005], 0.022, 0.02, BLACK, 6),
  ];
  const head = [
    part(G.sphere(0.058, 12, 10), WHITE, [0, 0, 0], [0, 0, 0], [0.9, 1, 1.1]),
    part(new THREE.SphereGeometry(0.061, 12, 6, 0, TAU, 0, Math.PI * 0.4), BLACK, [0, 0.004, -0.004]),
    // bill: yellow, dark at the tip
    part(G.cone(0.014, 0.055, 6), YELLOW, [0, -0.012, 0.092], [Math.PI / 2, 0, 0]),
    part(G.cone(0.007, 0.018, 6), 0x4a4632, [0, -0.012, 0.125], [Math.PI / 2, 0, 0]),
  ];
  // the famous yellow mask: wattles round each eye and down past the bill, with lobes hanging below
  for (const s of [-1, 1]) {
    head.push(part(G.sphere(1, 10, 8), YELLOW, [s * 0.034, -0.004, 0.042], [0, s * 0.3, 0], [0.024, 0.045, 0.042]));
    head.push(part(G.sphere(1, 8, 6), YELLOW2, [s * 0.02, -0.05, 0.062], [0.4, 0, s * 0.2], [0.016, 0.032, 0.02]));
  }
  const eyes = [], dead = [];
  for (const s of [-1, 1]) {
    eyes.push(part(G.sphere(0.013, 8, 6), RED, [s * 0.05, 0.012, 0.036]));
    eyes.push(part(G.sphere(0.006, 6, 4), BLACK, [s * 0.058, 0.013, 0.04]));
    dead.push(part(G.box(0.005, 0.03, 0.008), BLACK, [s * 0.055, 0.012, 0.038], [0, s * 0.3, 0.8]));
    dead.push(part(G.box(0.005, 0.03, 0.008), BLACK, [s * 0.055, 0.012, 0.038], [0, s * 0.3, -0.8]));
  }
  const leg = [
    limb([0, 0, 0], [0, -0.17, 0.01], 0.014, 0.012, LEG, 6),
    part(G.sphere(0.014, 6, 5), LEG, [0, -0.17, 0.01]),
    limb([0, -0.17, 0.01], [0, -0.325, -0.01], 0.011, 0.01, LEG, 6),
    limb([0, -0.325, 0], [0.04, -0.33, 0.07], 0.007, 0.005, LEG, 4),
    limb([0, -0.325, 0], [0, -0.33, 0.085], 0.007, 0.005, LEG, 4),
    limb([0, -0.325, 0], [-0.04, -0.33, 0.07], 0.007, 0.005, LEG, 4),
  ];
  // a wing, reaching out along +x from the shoulder: brown on top, white underneath, black flight feathers,
  // and the yellow spur at its bend
  const wing = [
    part(G.sphere(1, 12, 8), BROWN2, [0.17, 0.004, -0.02], [0, 0, 0], [0.17, 0.016, 0.08]),
    part(G.sphere(1, 12, 8), WHITE, [0.17, -0.008, -0.02], [0, 0, 0], [0.165, 0.012, 0.078]),
    part(G.sphere(1, 10, 8), BLACK, [0.36, 0, -0.045], [0, 0.35, 0], [0.11, 0.013, 0.06]),
    part(G.box(0.26, 0.012, 0.04), BLACK, [0.16, -0.002, -0.09]),
    part(G.cone(0.013, 0.06, 6), YELLOW, [0.12, 0.004, 0.075], [Math.PI / 2, 0, 0]),
  ];
  geos = {
    body: merge(body), neck: merge(neck), head: merge(head), eyes: merge(eyes), dead: merge(dead), leg: merge(leg), wing: merge(wing),
  };
}

function createPloverRig(scale) {
  if (!geos) build();
  const root = new THREE.Group();
  root.rotation.order = 'YXZ'; // (turn, then pitch nose-down into a dive, then bank)
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);
  bodyPivot.add(vcMesh(geos.body));
  const neck = new THREE.Group();
  neck.position.set(0, 0.48, 0.15);
  neck.add(vcMesh(geos.neck));
  bodyPivot.add(neck);
  const head = new THREE.Group();
  head.position.set(0, 0.12, 0.035);
  head.add(vcMesh(geos.head));
  const eyes = vcMesh(geos.eyes, { cast: false }), deadEyes = vcMesh(geos.dead, { cast: false });
  deadEyes.visible = false;
  head.add(eyes, deadEyes);
  neck.add(head);
  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.position.set(0.045, 0.34, 0);
  legR.position.set(-0.045, 0.34, 0);
  legL.add(vcMesh(geos.leg));
  legR.add(vcMesh(geos.leg));
  bodyPivot.add(legL, legR);
  const wingL = new THREE.Group(), wingR = new THREE.Group();
  wingL.position.set(0.1, 0.46, 0.1);
  wingR.position.set(-0.1, 0.46, 0.1);
  wingL.add(vcMesh(geos.wing));
  const wr = vcMesh(geos.wing);
  wr.scale.x = -1;
  wingR.add(wr);
  bodyPivot.add(wingL, wingR);
  root.scale.setScalar(scale);
  return { root, bodyPivot, neck, head, eyes, deadEyes, legL, legR, wingL, wingR };
}

let starGeo = null, starMat = null;
/** a ring of little stars (it's been knocked silly), to go round over its head: on `root`, where its head is when it's slumped */
function starRing(root) {
  starGeo ??= new THREE.OctahedronGeometry(0.035, 0);
  starMat ??= new THREE.MeshBasicMaterial({ color: 0xffe066 });
  const ring = new THREE.Group();
  for (let i = 0; i < 5; i++) ring.add(new THREE.Mesh(starGeo, starMat));
  ring.position.set(0, 0.67, 0.23);
  root.add(ring);
  return ring;
}

const ease = (k) => k * k * (3 - 2 * k);

export class Plover extends Foe {
  /**
   * `nest`: [x, z] of what it's guarding (for a plover, where it keeps watch till it's given an ibis to ride: see
   * ride). `def` and `rig`: for its cousins that swoop the same way, like the gulls
   */
  constructor(game, x, z, nest, def = DEF, rig = createPloverRig) {
    super(game, def, x, z);
    this.nest = new THREE.Vector3(nest[0], 0, nest[1]);
    this.setRig(rig(this.s));
    this.state = 'guard';
    this.airborne = false;
    this.alt = 0; // how high it's flying
    this.wanderTo = this.home.clone();
    this.wanderT = rand(0.5, 2);
    this.cool = rand(0.5, 2.5);
    this.speedNow = 0;
    this.phase = rand(0, TAU);
    this.bob = rand(0, TAU);
    this.flap = 0;
    this.spread = 0; // wings: 0 folded, 1 out
    this.pitch = 0;
    this.target = null;
    this.strike = new THREE.Vector3(); // where the swoop comes through
    this.dir = new THREE.Vector3(); // which way it's coming at it
    this.leg = { from: new THREE.Vector3(), to: new THREE.Vector3(), T: 1, a0: 0, a1: 0, k: (x) => x };
    this.crew = null; // (the rest of its lot, taking it in turns, a few at a time: see crewBusy)
    this.slump = 0; // (how far it's slumped down, stunned)
    this.tuck = 0; // (how far its legs are folded up under it, sat on an ibis)
    this.carrier = null; // (the ibis it rides about on, if it's got one: see ride)
    this.aboard = false; // (up on its back right now)
    this.calm = 0; // (how long the coast's been clear, down off its ibis)
  }

  /** up on `ibis`'s back, riding about with it, keeping a lookout: anyone who comes near, and it's off after them */
  ride(ibis) {
    this.carrier = ibis;
    this.perch();
    this.slump = this.tuck = 1;
    this.cool = rand(0.5, 1.5);
    return this;
  }

  get targetable() { return this.alive && (!this.airborne || HAULED.has(this.state)); }

  /* ---------------------------------------------------------------- body */
  bodyCenter(out) { return out.set(this.pos.x, this.pos.y + (this.def.bodyY - SLUMP * this.slump) * this.s, this.pos.z); }

  hits(p) {
    if (!this.targetable) return false;
    this.bodyCenter(_v);
    const s = this.s, dx = p.x - _v.x, dz = p.z - _v.z, dy = p.y - _v.y;
    return dx * dx + dz * dz < (0.2 * s + 0.15) ** 2 && Math.abs(dy) < 0.2 * s + 0.15;
  }

  attachPoint(t, frame) {
    const c = _w.set(0, 0.42, 0);
    const dir = frame.worldToLocal(t.pos.clone()).sub(c);
    if (dir.lengthSq() < 1e-4) dir.set(0, 1, 0);
    dir.normalize();
    return new THREE.Vector3(dir.x * 0.12, dir.y * 0.1, dir.z * 0.19).add(c);
  }

  hitFx(p) { this.game.fx.feathers(p, this.def.feathers, 2); }

  onDamage() {
    // mobbed on the ground: up it goes (unless something's hanging off it)
    if (this.state === 'guard') this.sound(this.intruder());
  }

  onDeath() {
    const g = this.game;
    this.airborne = this.aboard = false;
    this.alt = 0;
    this.warn?.hide();
    if (this.stars) this.stars.visible = false;
    this.rig.eyes.visible = false;
    this.rig.deadEyes.visible = true;
    g.audio.squawk(this.def.squawk, true);
    g.fx.feathers(this.bodyCenter(_v).clone(), this.def.dead, 8);
  }

  dispose() {
    super.dispose();
    this.warn?.dispose();
  }

  /* ---------------------------------------------------------------- AI */
  /**
   * The nearest turkey on the ground near the nest (or near its ibis), or the player, come too close: in plain
   * sight (and this side of the fence)
   */
  intruder() {
    const g = this.game, n = this.nest, w = g.world, here = (v) => w.zoneOf(v.x, v.z) === this.zone;
    let best = null, bd = this.def.alarmR;
    for (const t of g.turkeys.list) {
      if (!t.grounded) continue;
      const d = Math.hypot(t.pos.x - n.x, t.pos.z - n.z);
      if (d < bd && here(t.pos) && w.canSee(this.pos.x, this.pos.z, t.pos.x, t.pos.z)) { bd = d; best = t; }
    }
    if (best) return best;
    const p = g.player;
    return Math.hypot(p.pos.x - n.x, p.pos.z - n.z) < this.def.alarmR * 0.7 && here(p.pos) && w.canSee(this.pos.x, this.pos.z, p.pos.x, p.pos.z) ? p : null;
  }

  /** enough of the rest of its lot are having a go already (they take it in turns) */
  crewBusy() {
    const busy = (m) => m !== this && m.alive && (m.state === 'alarm' || FLYING.has(m.state));
    return !!this.crew && this.crew.filter(busy).length >= (this.def.together ?? 1);
  }

  /** kek-kek-kek! wings up, spurs out: about to go for `tg` (or, `grabbed` hold of, just to get away: see lift) */
  sound(tg, grabbed = false) {
    if (!tg && !grabbed) return;
    this.target = tg;
    this.state = 'alarm';
    this.t = 0;
    this.engaged = true;
    this.game.audio[this.def.cry](this.s);
    this.game.hud.toastOnce(...this.def.tips.up, 5, 120);
  }

  /** the next stretch of a flight: from where it is to (x, z) at height a1, over T seconds, eased by k */
  fly(state, x, z, a1, T, k = ease) {
    const l = this.leg;
    l.from.set(this.pos.x, 0, this.pos.z);
    l.to.set(x, 0, z);
    l.a0 = this.alt;
    l.a1 = a1;
    l.T = T;
    l.k = k;
    this.state = state;
    this.t = 0;
  }

  think(dt) {
    const g = this.game, d = this.def, l = this.leg, c = this.carrier;
    // (riding an ibis: it goes where the ibis goes, and if the ibis is beaten, off it hops. Down off it, it keeps by it)
    if (this.aboard) {
      if (c.alive) this.sitOn();
      else this.hopOff();
    } else if (c?.alive) this.nest.set(c.pos.x, 0, c.pos.z);
    switch (this.state) {
      case 'ride':
        // up on its ibis's back, having a look about: anyone coming near (or having a go at the ibis), and it's up
        this.speedNow = 0;
        this.heading = dampAngle(this.heading, c.heading, 6, dt);
        if (this.cool <= 0 && !this.crewBusy()) this.sound(this.intruder() ?? (c.engaged && c.target?.grounded ? c.target : null));
        break;
      case 'guard': {
        // about by the nest (or its ibis): a quick run now and then, then stock still (the way they do)
        this.wanderT -= dt;
        if (this.wanderT <= 0) {
          this.wanderT = rand(1.5, 4);
          const r = c ? c.def.radius : 0; // (not under its ibis's feet)
          this.wanderPoint(0.6 + r, 2.6 + r, this.wanderTo, c ? this.nest : this.home);
        }
        this.walk(this.wanderTo.x, this.wanderTo.z, d.speed, dt, 0.3, 9);
        // (grabbed hold of, it tries to get away with them: see lift)
        if (this.latched.length) { this.sound(this.intruder(), true); break; }
        // (the coast clear for a bit, and its ibis back to pottering about? back up on its back)
        if (c?.alive) {
          this.calm = this.intruder() || c.state !== 'wander' ? 0 : this.calm + dt;
          if (this.calm >= CALM_T) { this.hopOn(); break; }
        }
        if (this.cool <= 0 && !this.crewBusy()) this.sound(this.intruder());
        break;
      }
      case 'alarm':
        this.speedNow = damp(this.speedNow, 0, 10, dt);
        if (this.target) this.heading = dampAngle(this.heading, Math.atan2(this.target.pos.x - this.pos.x, this.target.pos.z - this.pos.z), 8, dt);
        if (this.t >= ALARM_T) {
          if (this.latched.length) { this.lift(); break; } // (turkeys hanging off it or not, up it goes)
          const tg = this.target && !this.target.dead ? this.target : this.intruder();
          if (!tg) { this.state = this.aboard ? 'ride' : 'guard'; this.cool = 1; break; }
          this.takeOff(tg);
        }
        break;
      case 'board':
        if (!c.alive) { this.fly('return', ...this.landingSpot(), 0, 0.6, (k) => k); break; }
        if (this.t >= BOARD_T) this.perch();
        break;
      case 'lift': {
        // straining to get up with them hanging off it (the more of them there are, the less far it gets)
        const n = this.latched.length;
        this.speedNow = damp(this.speedNow, 0, 10, dt);
        this.alt = damp(this.alt, (LIFT_ALT * this.s) / (1 + 0.4 * Math.max(0, n - 1)), 3.5, dt);
        if (this.t >= LIFT_T) {
          if (n >= d.drag) this.dragDown();
          else this.breakFree();
        }
        break;
      }
      case 'drop': {
        // down it comes, flapping for all it's worth
        const k = Math.min(1, this.t / DROP_T);
        this.alt = this.dropFrom * (1 - k * k);
        if (k >= 1) this.crashLand();
        break;
      }
      case 'stunned':
        this.speedNow = damp(this.speedNow, 0, 10, dt);
        if (this.t >= d.stun) this.comeTo();
        break;
      case 'rise':
        if (this.t >= RISE_T) {
          // lining up on the spot: where the target is right now (marked in red from here on)
          const tg = this.target;
          if (!tg || (tg.dead ?? false)) { this.fly('return', ...this.landingSpot(), 0, 1.2, (k) => k); break; }
          this.strike.set(tg.pos.x, g.world.groundHeight(tg.pos.x, tg.pos.z), tg.pos.z);
          this.dir.set(this.strike.x - this.pos.x, 0, this.strike.z - this.pos.z);
          const dl = this.dir.length() || 1;
          this.dir.multiplyScalar(1 / dl);
          this.fly('aim', this.strike.x - this.dir.x * 4.5, this.strike.z - this.dir.z * 4.5, d.alt ?? ALT, AIM_T);
        }
        break;
      case 'aim':
        if (this.t >= AIM_T) this.fly('dive', this.strike.x, this.strike.z, 0.4, DIVE_T, (k) => k * k);
        break;
      case 'dive':
        if (this.t >= DIVE_T) this.swoop();
        break;
      case 'climb':
        if (this.t >= CLIMB_T) {
          const [x, z] = this.landingSpot();
          this.fly('return', x, z, 0, Math.max(0.9, Math.hypot(x - this.pos.x, z - this.pos.z) / 6.5), (k) => k);
        }
        break;
      case 'return':
        if (this.t >= l.T) { this.state = 'land'; this.t = 0; }
        break;
      case 'land':
        if (this.t >= LAND_T) {
          this.airborne = false;
          this.alt = 0;
          this.state = 'guard';
          this.cool = rand(...(d.rest ?? [2.2, 3.6])); // (a breather on the ground: the time to pile on)
          this.wanderT = rand(1, 2.5);
          this.wanderTo.copy(this.pos);
        }
        break;
    }
    // (a stretch of flight: along the ground track, rising or dropping to its height at the end)
    if (FLYING.has(this.state) && this.state !== 'land') {
      // (hopping back onto its ibis: a moving target)
      if (this.state === 'board' && c.alive) l.a1 = this.backOf(l.to) - g.world.groundHeight(l.to.x, l.to.z);
      const k = Math.min(1, this.t / l.T), e = l.k(k);
      const px = this.pos.x, pz = this.pos.z;
      this.pos.x = l.from.x + (l.to.x - l.from.x) * e;
      this.pos.z = l.from.z + (l.to.z - l.from.z) * e;
      this.alt = l.a0 + (l.a1 - l.a0) * (this.state === 'return' ? 1 - (1 - k) ** 2 : e);
      if (this.state === 'board') this.alt += Math.sin(k * Math.PI) * BOARD_HOP;
      const mx = this.pos.x - px, mz = this.pos.z - pz;
      if (mx * mx + mz * mz > 1e-6) this.heading = dampAngle(this.heading, Math.atan2(mx, mz), 10, dt);
      this.pitch = damp(this.pitch, this.state === 'dive' ? 0.7 : this.state === 'climb' || this.state === 'rise' ? -0.45 : 0, 8, dt);
    } else this.pitch = damp(this.pitch, this.state === 'lift' ? -0.3 : this.state === 'drop' ? 0.25 : 0, 8, dt);
    if (this.airborne) this.pos.y = g.world.groundHeight(this.pos.x, this.pos.z) + this.alt;
  }

  /** up and away from `tg` first, to get a run at it */
  takeOff(tg) {
    const d = this.def, ax = this.pos.x - tg.pos.x, az = this.pos.z - tg.pos.z, ad = Math.hypot(ax, az) || 1;
    this.airborne = true;
    this.aboard = false;
    this.fly('rise', this.pos.x + (ax / ad) * 2.2, this.pos.z + (az / ad) * 2.2, d.alt ?? ALT, RISE_T, (k) => 1 - (1 - k) * (1 - k));
    this.game.audio.whoosh();
  }

  /* ---------------------------------------------------------------- riding an ibis */
  /** where it sits on its ibis's back (its feet, that is, sat down), into out: and how high that is */
  backOf(out) {
    this.carrier.rig.bodyPivot.localToWorld(out.copy(BACK));
    out.y -= SIT * this.s;
    return out.y;
  }

  /** (aboard) sat on its ibis's back, as it walks, bobs and turns */
  sitOn() {
    this.backOf(this.pos);
    this.alt = this.pos.y - this.game.world.groundHeight(this.pos.x, this.pos.z);
    this.nest.set(this.carrier.pos.x, 0, this.carrier.pos.z);
  }

  /** settled on its ibis's back (wings folded, legs tucked under) */
  perch() {
    this.aboard = true;
    this.airborne = true; // (up off the ground, out of reach)
    this.state = 'ride';
    this.t = 0;
    this.calm = 0;
    this.sitOn();
  }

  /** a hop and a flap, back up onto its ibis */
  hopOn() {
    this.airborne = true;
    this.calm = 0;
    this.fly('board', this.pos.x, this.pos.z, this.alt, BOARD_T, (k) => 1 - (1 - k) * (1 - k));
  }

  /** its ibis is beaten: down it hops, and it keeps watch over it from the ground */
  hopOff() {
    this.aboard = false;
    this.fly('return', ...this.landingSpot(), 0, 0.6, (k) => k);
  }

  /* ---------------------------------------------------------------- held down */
  /** grabbed hold of, it tries to get up and away anyway, with whoever's hanging off it along for the ride */
  lift() {
    this.state = 'lift';
    this.t = 0;
    this.airborne = true; // (though with turkeys hanging off it, it's still fair game: more can grab on)
    this.game.audio.whoosh();
  }

  /** not enough of them to hold it down: it shakes them off, and it's away */
  breakFree() {
    const g = this.game, d = this.def;
    if (this.latched.length) {
      this.shakeOff();
      g.audio.squawk(d.squawk);
      g.hud.toastOnce(...d.tips.away, 3.5, 60);
    }
    // (back to whoever it was after, or, with nobody about, off to land somewhere quieter)
    const tg = this.target && !this.target.dead ? this.target : this.intruder();
    if (tg) this.takeOff(tg);
    else this.fly('climb', this.pos.x + rand(-2, 2), this.pos.z + rand(-2, 2), 2.4, CLIMB_T, (k) => 1 - (1 - k) * (1 - k));
  }

  /** too many of them hanging off it to get away: they drag it back down */
  dragDown() {
    this.state = 'drop';
    this.t = 0;
    this.dropFrom = this.alt;
    this.game.audio.squawk(this.def.squawk);
  }

  /** down it comes with a thump, and there it sits, seeing stars: pile on! */
  crashLand() {
    const g = this.game, d = this.def;
    this.airborne = false;
    this.alt = 0;
    this.state = 'stunned';
    this.t = 0;
    g.fx.dust(this.pos, 4 + Math.round(this.s * 2));
    g.fx.feathers(this.bodyCenter(_v).clone(), d.feathers, 2 + Math.round(this.s));
    g.audio.land();
    g.audio.dazed();
    if (d.boss) { g.audio.stomp(this.s * 0.5); g.shake(0.25); }
    g.hud.toastOnce(...d.tips.down, 3, d.boss ? 20 : 60);
  }

  /** it comes to: shakes the lot of them off and gets out of there, straight up */
  comeTo() {
    const g = this.game, a = rand(0, TAU);
    this.shakeOff();
    g.audio[this.def.cry](this.s);
    this.airborne = true;
    this.fly('climb', this.pos.x + Math.cos(a) * 3, this.pos.z + Math.sin(a) * 3, 2.4, CLIMB_T, (k) => 1 - (1 - k) * (1 - k));
    g.audio.whoosh();
  }

  /** at the bottom of the dive: spurs out, through whoever's still standing there */
  swoop() {
    const g = this.game, d = this.def, s = this.strike;
    const hits = this.turkeysNear(s, d.swoopR).slice(0, d.kills);
    for (const t of hits) t.die('swoop');
    if (hits.length) g.audio.squawk(d.squawk);
    if (this.hurtPlayer(s, d.swoopR + 0.2, d.hurt, { knock: 6, stun: 0.5 }, _v.set(s.x - this.dir.x, 0, s.z - this.dir.z))) {
      g.hud.toastOnce(...d.tips.you, 2.5, 60);
    }
    g.fx.dust(s, 5);
    g.fx.feathers(_v.set(s.x, s.y + 0.4, s.z), d.feathers, 2);
    this.fly('climb', s.x + this.dir.x * 4, s.z + this.dir.z * 4, 2.4, CLIMB_T, (k) => 1 - (1 - k) * (1 - k));
  }

  /** somewhere to come down, close by the nest (or its ibis, though not under its feet) */
  landingSpot() {
    const a = rand(0, TAU), r = rand(0.9, 2.2) + (this.carrier ? this.carrier.def.radius : 0);
    return [this.nest.x + Math.cos(a) * r, this.nest.z + Math.sin(a) * r];
  }

  /* ---------------------------------------------------------------- animation */
  pose(dt) {
    const r = this.rig, t = this.t, st = this.state, time = this.game.time;
    const moving = Math.min(1, this.speedNow / 2);
    this.phase += dt * (3 + this.speedNow * 5);
    let spread = 0, flapA = 0, raise = 0, sweep = 0, legX = Math.sin(this.phase) * 0.7 * moving, neckX = 0, neckZ = 0, roll = 0;
    if (st === 'guard') neckX = moving > 0.1 ? Math.sin(this.phase * 2) * 0.1 : Math.max(0, Math.sin(time * 1.7 + this.bob)) * 0.35;
    else if (st === 'ride') {
      // sat down on its ibis, legs folded up under it (see tuck), head up and turning, keeping a lookout
      legX = 0; neckX = -0.15 + Math.max(0, Math.sin(time * 1.3 + this.bob)) * 0.2; neckZ = Math.sin(time * 0.7 + this.bob) * 0.3;
    } else if (st === 'alarm') {
      // wings up and half open, showing off the spurs (flapping like mad, with something hanging off it)
      spread = 0.55; raise = 0.8 + Math.sin(time * 30) * (this.latched.length ? 0.5 : 0.08); neckX = -0.25;
    } else if (HAULED.has(st)) {
      // beating its wings for all it's worth, legs kicking (and going down in a flurry)
      spread = 1; flapA = 1; raise = st === 'drop' ? 0.4 : 0.1; legX = Math.sin(time * 14) * 0.45; neckX = st === 'drop' ? 0.3 : -0.35;
    } else if (st === 'stunned') {
      // slumped on its belly, wings drooping out either side, its head lolling about
      spread = 0.75; raise = -0.4; legX = 1.3;
      neckX = 0.45 + Math.sin(time * 2.6) * 0.15; neckZ = Math.sin(time * 1.9) * 0.35; roll = Math.sin(time * 1.9 + 0.8) * 0.07;
    } else if (FLYING.has(st)) {
      legX = 1.3; // (tucked back)
      if (st === 'dive') { spread = 0.55; sweep = 0.6; raise = 0.25; } // swept back, arrowing in
      else if (st === 'land') { spread = 1 - Math.min(1, t / LAND_T); raise = 0.9 * spread; legX = 1.3 * spread; }
      else { spread = 1; flapA = st === 'aim' ? 0.35 : 0.85; }
    }
    this.spread = damp(this.spread, spread, 12, dt);
    this.flap += dt * (HAULED.has(st) ? 24 : st === 'aim' ? 9 : 16);
    const wz = raise + Math.sin(this.flap) * flapA, wy = 1.45 * (1 - this.spread) + sweep;
    r.wingL.rotation.set(0, wy, wz * this.spread + (1 - this.spread) * -0.12);
    r.wingR.rotation.set(0, -wy, -(wz * this.spread + (1 - this.spread) * -0.12));
    r.legL.rotation.x = legX;
    r.legR.rotation.x = FLYING.has(st) || st === 'stunned' ? legX : -legX;
    // (sat on its ibis, or settling onto it, its legs fold right up under it, out of sight; they come back down as it
    // stands up to go)
    this.tuck = damp(this.tuck, this.alive && (st === 'ride' || st === 'board') ? 1 : 0, 8, dt);
    const legs = 1 - (1 - TUCKED) * this.tuck;
    r.legL.scale.setScalar(legs);
    r.legR.scale.setScalar(legs);
    r.neck.rotation.set(neckX, 0, neckZ);
    r.bodyPivot.rotation.z = roll + (this.flinch > 0 ? Math.sin(time * 50) * 0.08 * this.flinch : 0);
    this.slump = damp(this.slump, this.alive && (st === 'stunned' || st === 'ride') ? 1 : 0, 8, dt);

    if (!this.alive) {
      // keeled over on its side, feet in the air
      const phi = (Math.PI / 2 - 0.15) * (st === 'dying' ? this.roll * this.roll : 1);
      r.root.position.set(this.pos.x, this.pos.y + 0.12 * this.s * Math.sin(phi), this.pos.z);
      r.root.rotation.set(0, this.heading, phi);
      r.legL.rotation.x = -0.3; r.legR.rotation.x = 0.4;
      r.wingL.rotation.set(0, 1.3, -0.1); r.wingR.rotation.set(0, -1.3, 0.1);
    } else {
      r.root.position.copy(this.pos);
      r.root.position.y -= SLUMP * this.s * this.slump;
      r.root.rotation.set(this.pitch, this.heading, 0);
    }

    // (stunned) stars going round and round over its head
    const dazed = this.alive && st === 'stunned';
    if (dazed) this.stars ??= starRing(r.root);
    if (this.stars) {
      this.stars.visible = dazed;
      if (dazed) {
        this.stars.children.forEach((m, i) => {
          const a = (i / 5) * TAU + time * 4;
          m.position.set(Math.cos(a) * 0.13, Math.sin(a * 2 + i) * 0.015, Math.sin(a) * 0.13);
          m.rotation.y = time * 3;
        });
      }
    }

    // the red circle where it'll come through, filling in as it lines up and dives
    if (this.alive && (st === 'aim' || st === 'dive')) {
      this.warn ??= this.game.fx.warnCircle();
      this.warn.show(this.strike, this.def.swoopR, (st === 'aim' ? t : AIM_T + t) / (AIM_T + DIVE_T), time);
    } else this.warn?.hide();
  }
}
