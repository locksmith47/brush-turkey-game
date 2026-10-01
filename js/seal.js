import * as THREE from 'three';
import { part, merge, vcMesh, tint, G, limb, rand, randInt, damp, angleDiff, clamp, smoothstep, lerp } from './util.js';
import { Perches } from './toys.js';
import { S } from './turkey.js';
import { SEA, seaWave } from './props/beach.js';

/*
 * Benny, the fur seal who lives on the steps out the back of the Opera House. He's as friendly as they come: he
 * lies about on the bottom step in the sun, keeping half an eye on whoever's about (or having a doze), and he
 * doesn't mind a turkey sitting on his back. Come down the steps and he'll put his head up and bark you a g'day;
 * and every so often he rolls over and gives his belly a good slap with his flippers, for the joy of it.
 */
const SIZE = 1.35; // (a big old bull)
const FUR = 0x5b4a3b, BELLY = 0x9c8466, THROAT = 0xb39c7c, MUZZLE = 0x6b5847, PAD = 0x7d6a58, FLIPPER = 0x2e241d;
const ROLL = -2.55, ROLL_T = 0.9; // radians he rolls over onto his back (belly up, and round to face the camera), and s it takes
const SLAPS = [3, 5], SLAP_T = 0.42; // how many slaps he gives his belly, and s each one takes
const EVERY = [12, 26]; // s between belly slaps (while there's anyone about to see)
const HELLO = 7, BYE = 12; // m: how close you come before he says g'day (and how far off you go before he'll say it again)
const LOOK = 8; // m: how close something has to be for him to keep an eye on it
const AWAKE = 60; // m: past this there's nobody about to see, and he's not worked out at all
// a fore flipper (radians down from straight out to the side): lying on his front, rolled over, wound up for a slap
// and on his belly
const REST = 0.3, OUT = 1.2, UP = 0.75, HIT = 2.25;
const _v = new THREE.Vector3();

/** his parts: the body (it rolls), neck, head, an eye, the jaw, a fore flipper (the right: the left's mirrored) and the hind flippers */
function sealGeo() {
  // (paler underneath, and paler again under his chin)
  const under = (lo, hi, col) => { const c2 = new THREE.Color(col); return (x, y, z, c) => c.lerp(c2, smoothstep(lo, hi, -y)); };
  const body = merge([
    tint(part(G.sphere(1, 18, 12), FUR, [0, 0, 0.02], [0, 0, 0], [0.34, 0.29, 0.62]), under(0.06, 0.26, BELLY)),
    tint(part(G.sphere(1, 16, 10), FUR, [0, 0.02, 0.36], [0, 0, 0], [0.31, 0.29, 0.34]), under(0.06, 0.26, BELLY)),
    tint(part(G.sphere(1, 14, 10), FUR, [0, -0.04, -0.5], [0, 0, 0], [0.25, 0.21, 0.4]), under(0.06, 0.22, BELLY)),
    tint(part(G.sphere(1, 12, 8), FUR, [0, -0.08, -0.86], [0.1, 0, 0], [0.14, 0.1, 0.24]), under(0.1, 0.18, BELLY)),
  ]);
  const neck = merge([
    tint(limb([0, -0.02, -0.1], [0, 0.12, 0.26], 0.25, 0.17, FUR, 12), under(0, 0.16, THROAT)),
    tint(part(G.sphere(1, 12, 8), FUR, [0, 0.04, 0.1], [0, 0, 0], [0.25, 0.24, 0.24]), under(0, 0.16, THROAT)),
  ]);
  const head = [
    tint(part(G.sphere(1, 16, 12), FUR, [0, 0.03, 0.04], [0, 0, 0], [0.17, 0.155, 0.19]), under(0, 0.12, THROAT)),
    part(G.sphere(1, 12, 8), MUZZLE, [0, -0.01, 0.19], [0.15, 0, 0], [0.1, 0.08, 0.12]),
    part(G.sphere(1, 10, 8), 0x1b1512, [0, 0.025, 0.295], [0, 0, 0], [0.045, 0.028, 0.03]), // (his nose)
  ];
  for (const s of [-1, 1]) {
    head.push(part(G.sphere(0.045, 8, 6), PAD, [s * 0.045, -0.025, 0.25])); // (whisker pads)
    head.push(part(G.cone(0.025, 0.07, 6), FUR, [s * 0.12, 0.1, -0.02], [-1.1, 0, s * -0.5])); // (and his little ears)
    for (let k = 0; k < 3; k++) head.push(limb([s * 0.06, -0.025 - k * 0.012, 0.26], [s * 0.21, -0.03 - k * 0.035, 0.22 + k * 0.012], 0.006, 0.003, 0xe8dfcc, 3));
  }
  const eye = merge([
    part(G.sphere(0.052, 10, 8), 0x140f0c, [0, 0, 0], [0, 0, 0], [1, 1, 0.8]),
    part(G.sphere(0.015, 6, 5), 0xffffff, [0.015, 0.02, 0.036]),
  ]);
  const jaw = merge([
    part(G.sphere(1, 10, 8), MUZZLE, [0, -0.015, 0.07], [0, 0, 0], [0.075, 0.035, 0.1]),
    part(G.sphere(1, 10, 6), 0xb5606a, [0, 0.008, 0.07], [0, 0, 0], [0.06, 0.012, 0.085]),
  ]);
  const fore = merge([
    limb([-0.04, 0.02, 0], [0.14, -0.02, 0.02], 0.09, 0.075, FUR, 8),
    part(G.sphere(1, 12, 8), FLIPPER, [0.3, -0.03, -0.02], [0, 0.15, -0.08], [0.2, 0.028, 0.1]),
  ]);
  const hind = merge([-1, 1].map((s) => part(G.sphere(1, 10, 8), FLIPPER, [s * 0.08, 0, -0.17], [0, s * 0.3, 0], [0.085, 0.022, 0.2])));
  return { body, neck, head: merge(head), eye, jaw, fore, hind };
}

let GEO = null;
function sealRig() {
  GEO ??= sealGeo();
  const root = new THREE.Group(), body = new THREE.Group(), neck = new THREE.Group(), head = new THREE.Group(), jaw = new THREE.Group();
  body.position.y = 0.3;
  body.add(vcMesh(GEO.body, { cast: true, receive: true }));
  root.add(body);
  neck.position.set(0, 0.06, 0.5);
  neck.add(vcMesh(GEO.neck));
  body.add(neck);
  head.position.set(0, 0.14, 0.28);
  head.add(vcMesh(GEO.head));
  neck.add(head);
  jaw.position.set(0, -0.06, 0.12);
  jaw.add(vcMesh(GEO.jaw, { cast: false }));
  head.add(jaw);
  const eyes = [-1, 1].map((s) => {
    const e = new THREE.Group();
    e.position.set(s * 0.095, 0.065, 0.135);
    e.add(vcMesh(GEO.eye, { cast: false }));
    head.add(e);
    return e;
  });
  const fore = [1, -1].map((s) => {
    const f = new THREE.Group(), m = vcMesh(GEO.fore);
    f.position.set(s * 0.3, -0.14, 0.34);
    m.scale.x = s;
    f.add(m);
    body.add(f);
    return f;
  });
  const hind = new THREE.Group();
  hind.position.set(0, -0.1, -1.0);
  hind.add(vcMesh(GEO.hind));
  body.add(hind);
  root.scale.setScalar(SIZE);
  return { root, body, neck, head, jaw, eyes, fore, hind };
}

/** his back: somewhere for a turkey to sit for a bit (while he's lying still, that is) */
class Back extends Perches {
  constructor(game, seal) {
    super(game, seal.rig.root, [{ at: [0, 0.57, -0.2], face: 0, ground: [-0.95, 0.25], hop: [0.35, 0.55] }], { time: [10, 22] });
    this.seal = seal;
  }

  nearestSeat(p) { return this.seal.state === 'laze' ? super.nearestSeat(p) : null; }
  /** (he has a look round at who's hopped up) */
  onMount(t) { this.seal.glance = { pos: t.pos, T: 1.8 }; }
}

export class Seal {
  constructor(game, x, z, heading) {
    this.game = game;
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.rig = sealRig();
    const r = this.rig.root;
    r.position.set(x, game.world.groundHeight(x, z), z);
    r.rotation.y = heading;
    game.scene.add(r);
    r.updateMatrixWorld(true);
    // (he's not to be walked through: shoulders, hips and head)
    for (const [lz, cr] of [[0.35, 0.5], [-0.45, 0.42], [0.95, 0.26]]) {
      r.localToWorld(_v.set(0, 0, lz));
      game.world.colliders.push({ x: _v.x, z: _v.z, r: cr * SIZE });
    }
    this.back = game.toys.addRide(new Back(game, this));
    this.state = 'laze';
    this.t = 0;
    this.roll = 0;
    this.slapT = rand(4, 8); // (the first one's not long after you get there)
    this.met = false; // (he's said g'day: see BYE)
    this.n = 0; // slaps to go
    this.side = 0; // the flipper doing the slapping
    this.hit = false;
    this.lift = 0; // how far his head's up (0: resting it on the step, 1: up and looking about)
    this.look = 0;
    this.blinkT = rand(1, 4);
    this.jiggle = 0; // (his belly, still wobbling from the last slap)
    this.glance = null; // { pos, T }: a look round at something
    this.flip = [REST, REST];
    this.rippleT = 1;
  }

  go(state) {
    this.state = state;
    this.t = 0;
    this.hit = false;
  }

  /** whoever's nearest within LOOK (you, or a turkey: not the one on his back), to keep an eye on, or null */
  nearest() {
    const g = this.game, rider = this.back.seats[0].rider;
    let best = null, bd = LOOK;
    const see = (p) => {
      const d = Math.hypot(p.x - this.x, p.z - this.z);
      if (d < bd) { bd = d; best = p; }
    };
    if (!g.player.dead) see(g.player.pos);
    for (const t of g.turkeys.list) if (!t.dead && t !== rider) see(t.pos);
    return best;
  }

  update(dt) {
    const g = this.game, p = g.player.pos, far = Math.hypot(p.x - this.x, p.z - this.z);
    if (far > AWAKE) return;
    this.t += dt;
    if (far > BYE) this.met = false;
    if ((this.rippleT -= dt) <= 0) { this.rippleT = rand(2, 4.5); this.ripple(0.6, 0.22); } // (his hind flippers, trailing in the water)
    switch (this.state) {
      case 'laze':
        // (you've come down to see him: up comes his head, and he says g'day)
        if (far < HELLO && !this.met && !g.player.dead) { this.met = true; this.go('hello'); break; }
        if (far < 30 && (this.slapT -= dt) <= 0) this.go('clear');
        break;
      case 'hello':
        if (this.t > 0.35 && !this.hit) { this.hit = true; g.audio.bark(2, this.loud()); }
        if (this.t > 1.5) this.go('clear'); // (and then he's straight over, to show you his belly slap)
        break;
      case 'clear': {
        // whoever's up on his back hops off before he rolls over (and anyone on their way up thinks better of it)
        const s = this.back.seats[0], t = s.rider;
        if (t?.state === S.SWING) this.back.dismount(t, 0);
        else if (t?.state === S.TOY) { t.leaveSeat(); t.setState(S.IDLE); }
        if (!s.rider && this.t > 0.3) this.go('roll');
        else if (this.t > 3) { this.slapT = rand(4, 8); this.go('laze'); } // (not going anywhere: another time)
        break;
      }
      case 'roll':
        this.roll = ROLL * smoothstep(0, ROLL_T, this.t);
        if (this.t >= ROLL_T) { this.n = randInt(...SLAPS); this.go('slap'); }
        break;
      case 'slap':
        if (!this.hit && this.t >= SLAP_T * 0.55) { this.hit = true; this.smack(); }
        if (this.t >= SLAP_T) {
          this.side ^= 1;
          if (--this.n <= 0) this.go('unroll');
          else { this.t = 0; this.hit = false; }
        }
        break;
      case 'unroll':
        this.roll = ROLL * (1 - smoothstep(0, ROLL_T, this.t));
        if (this.t >= ROLL_T) { this.slapT = rand(...EVERY); this.go('laze'); }
        break;
    }
    this.pose(dt);
  }

  /** how loud he is from where you are (0..1) */
  loud() {
    const p = this.game.player.pos;
    return clamp(1.4 - Math.hypot(p.x - this.x, p.z - this.z) / 20, 0.15, 1);
  }

  /** whack: a flipper on his belly, with a spray of water off it (and a wobble) */
  smack() {
    const g = this.game;
    this.jiggle = 1;
    g.audio.slap(this.loud());
    this.rig.body.updateMatrixWorld(true);
    this.rig.body.localToWorld(_v.set(this.side ? 0.1 : -0.1, -0.3, 0.2));
    g.fx.burst(_v, { n: 7, colors: [0xdff3ff, 0xffffff, 0xb8dcef], speed: [0.6, 1.8], up: [1.5, 3.2], grav: 9, size: [0.04, 0.08], life: [0.4, 0.7] });
    this.ripple(1, 0.35); // (and his hind flippers going in the water)
  }

  /** a ring spreading out across the water from his hind flippers (`r`: how far, `a`: how plain) */
  ripple(r, a) {
    this.rig.hind.updateMatrixWorld(true);
    this.rig.hind.localToWorld(_v.set(0, 0, -0.25));
    this.game.fx.ripple(_v.x, SEA + seaWave(_v.x, _v.z, this.game.time) + 0.02, _v.z, r, 1.1, a);
  }

  pose(dt) {
    const g = this.game, r = this.rig, time = g.time, st = this.state;
    const over = this.roll / ROLL; // (0: on his front, 1: on his back)
    // rolled over (and halfway, on his side, up a touch: he's wider than he is tall)
    r.body.rotation.z = this.roll;
    r.body.position.y = 0.3 + 0.05 * Math.abs(Math.sin(this.roll));
    // breathing, slow and easy (and his belly wobbling after a slap)
    this.jiggle = Math.max(0, this.jiggle - dt * 2.5);
    const br = Math.sin(time * 1.4), jg = Math.sin(time * 38) * this.jiggle * 0.05;
    r.body.scale.set(1 + br * 0.012 + jg, 1 + br * 0.025 - jg, 1);

    // his head: down on the step having a doze with nobody about, up and watching if there is, and up high to bark
    if (this.glance && (this.glance.T -= dt) <= 0) this.glance = null;
    const who = this.glance?.pos ?? this.nearest();
    const lift = st === 'hello' ? 1.2 : over > 0.05 ? 0.6 : who ? 1 : 0;
    this.lift = damp(this.lift, lift, 3, dt);
    let look = Math.sin(time * 0.21) * 0.25;
    if (who && over < 0.05) look = clamp(angleDiff(this.heading, Math.atan2(who.x - this.x, who.z - this.z)), -1.3, 1.3);
    this.look = damp(this.look, look * (1 - over), 4, dt);
    // (barking: his head goes up and back with each one, and his mouth opens)
    const bk = (u) => (u > 0 && u < 0.22 ? Math.sin((u / 0.22) * Math.PI) : 0);
    const bark = st === 'hello' ? bk(this.t - 0.35) + bk(this.t - 0.69) : 0;
    r.neck.rotation.set(lerp(lerp(0.42, -0.3, this.lift), 0.35, over) - bark * 0.25 + Math.sin(time * 1.4) * 0.02, this.look * 0.4, 0);
    r.head.rotation.set(lerp(0.15, -0.05, this.lift) - bark * 0.15, this.look * 0.6, -this.roll * 0.55);
    r.jaw.rotation.x = bark * 0.55;
    // (blinking: and eyes shut, dozing)
    if ((this.blinkT -= dt) <= 0) this.blinkT = rand(2, 5);
    const shut = Math.max(this.blinkT < 0.14 ? 1 : 0, smoothstep(0.45, 0.1, this.lift));
    for (const e of r.eyes) e.scale.y = 1 - 0.88 * shut;

    // his flippers: spread on the step, out to the side rolled over, and taking turns at his belly
    const u = st === 'slap' ? this.t / SLAP_T : 0;
    const swing = u < 0.35 ? lerp(OUT, UP, smoothstep(0, 0.35, u)) : u < 0.55 ? lerp(UP, HIT, (u - 0.35) / 0.2) : lerp(HIT, OUT, smoothstep(0.6, 1, u));
    for (let k = 0; k < 2; k++) {
      const want = st === 'slap' ? (k === this.side ? swing : OUT + this.jiggle * 0.2) : lerp(REST, OUT, over);
      this.flip[k] = st === 'slap' ? want : damp(this.flip[k], want, 10, dt);
      r.fore[k].rotation.set(0, 0, (k ? 1 : -1) * (this.flip[k] + Math.sin(time * 1.4 + k) * 0.03));
    }
    // and the hind ones, trailing in the water (waving about while he's having fun)
    const wave = over > 0.05 ? Math.sin(time * 9) * 0.3 * over : Math.sin(time * 0.8) * 0.06;
    r.hind.rotation.set(lerp(-0.5, -0.15, over) + wave, 0, 0);
  }
}
