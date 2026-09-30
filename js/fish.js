import * as THREE from 'three';
import { Foe } from './foe.js';
import { part, merge, vcMesh, G, tint, rand, smoothstep, TAU } from './util.js';
import { LANE } from './props/harbour.js';

/*
 * Fish, churned up out of the harbour by the giant cuttlefish as it goes back down to the depths (see Cuttle), and
 * flung up onto the ferry's deck: yakkas, bream, flathead, snapper, kingies, and a big blue groper. There they lie,
 * flapping about, and they're loot like any other: over at Circular Quay, turkeys carry them off the ferry to a
 * mound. (One turkey can manage a little one; a kingie or a groper takes a few)
 */
// len: m, nose to tail; deep: how deep it is, for its length; thick: how thick it is, for how deep; flat: it lies on
// its belly (a flathead), not on its side; and its colours: its back, belly, fins and tail (and any stripe, spots,
// mottling or lips)
export const KINDS = {
  yakka: { name: 'Yakka', len: 0.55, deep: 0.26, thick: 0.45, value: 2, weight: 1, slots: 3, back: 0x5c8f8a, belly: 0xe3ecef, fins: 0xffd23f, tail: 0xffd23f },
  bream: { name: 'Bream', len: 0.62, deep: 0.4, thick: 0.4, value: 3, weight: 1, slots: 3, back: 0x7f8c95, belly: 0xf0f3f4, fins: 0xe9c24a, tail: 0x9a9c86 },
  flathead: { name: 'Flathead', len: 0.85, deep: 0.15, thick: 1.5, flat: true, value: 3, weight: 1, slots: 4, back: 0x8a6b45, belly: 0xf2e8d6, fins: 0x6a5238, tail: 0xe0a33a, mottle: 0x4f3d27 },
  snapper: { name: 'Snapper', len: 0.9, deep: 0.42, thick: 0.4, value: 5, weight: 2, slots: 5, back: 0xe2677b, belly: 0xf7cfd4, fins: 0xe88a8f, tail: 0xd2566a, spots: 0x49b3ff },
  kingie: { name: 'Kingfish', len: 1.45, deep: 0.24, thick: 0.5, value: 8, weight: 3, slots: 6, back: 0x3d6b78, belly: 0xe8eef0, fins: 0xffd23f, tail: 0xffd23f, stripe: 0xffd23f },
  groper: { name: 'Blue groper', len: 1.3, deep: 0.36, thick: 0.5, value: 10, weight: 4, slots: 8, back: 0x2455c9, belly: 0x3f78e6, fins: 0x1b3c93, tail: 0x1b3c93, lips: 0x6f9cf5 },
};
/** what the cuttlefish churns up: one of each of these */
export const CATCH = ['yakka', 'yakka', 'yakka', 'yakka', 'bream', 'bream', 'bream', 'flathead', 'flathead', 'snapper', 'snapper', 'kingie', 'kingie', 'groper'];
const FLOP = [2.5, 4]; // s it flaps about for, landed (and every so often after, a little flap)
const _v = new THREE.Vector3(), _b = new THREE.Color();
const GEOS = {};

/** a fish, swimming the right way up, facing +x (its nose), with its back up */
function fishGeo(kind) {
  const k = KINDS[kind], L = k.len, H = L * k.deep, T = H * k.thick;
  const back = new THREE.Color(k.back), belly = new THREE.Color(k.belly);
  const p = [
    tint(part(G.sphere(1, 16, 10), k.back, [0, 0, 0], [0, 0, 0], [L * 0.5, H * 0.5, T * 0.5]), (x, y, z, col) => {
      col.copy(back).lerp(belly, smoothstep(H * 0.12, -H * 0.28, y));
      if (k.stripe && Math.abs(y) < H * 0.07 && x < L * 0.3) col.set(k.stripe); // (a kingie's yellow stripe, nose to tail)
      if (k.spots && y > -H * 0.15 && Math.sin(x * 61) * Math.sin(y * 97 + z * 29) > 0.55) col.set(k.spots); // (a snapper's blue spots)
      if (k.mottle && Math.sin(x * 37 + z * 19) * Math.sin(y * 41 - x * 13) > 0.3) col.lerp(_b.set(k.mottle), 0.75);
    }),
    // its tail (a fan, flat), fin along its back, and one underneath
    part(G.cone(H * 0.55, L * 0.34, 4), k.tail, [-L * 0.6, 0, 0], [0, 0, -Math.PI / 2], [1, 1, 0.16]),
    part(G.cone(1, 1, 4), k.fins, [L * 0.02, H * 0.5, 0], [0, 0, 0], [L * 0.24, H * 0.34, Math.max(T * 0.12, 0.012)]),
    part(G.cone(1, 1, 4), k.fins, [-L * 0.14, -H * 0.46, 0], [Math.PI, 0, 0], [L * 0.1, H * 0.2, Math.max(T * 0.1, 0.01)]),
  ];
  for (const s of [-1, 1]) {
    p.push(part(G.sphere(1, 8, 6), 0xf6f2e6, [L * 0.33, H * 0.1, s * T * 0.36], [0, 0, 0], [H * 0.1, H * 0.1, Math.max(T * 0.1, 0.02)]));
    p.push(part(G.sphere(1, 8, 6), 0x111111, [L * 0.335, H * 0.1, s * T * 0.42], [0, 0, 0], [H * 0.06, H * 0.06, Math.max(T * 0.07, 0.015)]));
  }
  if (k.lips) p.push(part(G.sphere(1, 8, 6), k.lips, [L * 0.48, -H * 0.08, 0], [0, 0, 0], [H * 0.14, H * 0.12, T * 0.3])); // (a groper's big blubbery lips)
  return merge(p);
}

export class Fish extends Foe {
  /**
   * A `kind` of fish (see KINDS), lying on the deck at (x, z); or, with `fling` ({ from, dx, dz, wait }), leaping up
   * out of the water at `from` `wait` seconds from now, to land on the ferry's deck (dx, dz) from her middle
   */
  constructor(game, kind, x, z, fling = null) {
    const k = KINDS[kind];
    super(game, {
      name: k.name, hp: 1, scale: 1, radius: k.len * 0.3, value: k.value, weight: k.weight, slots: k.slots, carryR: k.len * 0.5 + 0.15,
      carcassLabelY: 0.6, palette: 'fish', icon: '🐟', noLabel: k.weight <= 1, quiet: k.value <= 3, loot: true,
    }, x, z);
    this.kind = kind;
    GEOS[kind] ??= fishGeo(kind);
    const root = new THREE.Group();
    this.lie = new THREE.Group(); // (on its side, or flat on its belly)
    this.body = vcMesh(GEOS[kind]);
    this.lie.add(this.body);
    root.add(this.lie);
    this.setRig({ root });
    this.side = k.flat ? 0 : (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
    this.rest = k.flat ? k.len * k.deep * 0.5 : k.len * k.deep * k.thick * 0.5; // (m its middle's up off the deck, lying there)
    this.heading = rand(0, TAU);
    this.ph = rand(0, TAU);
    this.flop = 0;
    this.flapT = rand(3, 8);
    this.spin = 0;
    this.alive = false;
    if (!fling) { this.becomeCarcass(); return; }
    this.state = 'flying';
    this.airborne = true;
    this.from = fling.from.clone();
    this.dx = fling.dx;
    this.dz = fling.dz;
    this.wait = fling.wait;
    this.T = rand(0.95, 1.3);
    this.h = rand(4.5, 7.5);
    this.spinV = rand(7, 11) * (Math.random() < 0.5 ? 1 : -1);
    this.pos.copy(this.from);
    root.visible = false;
  }

  get targetable() { return false; }
  colliderR() { return 0; } // (nobody's held up by a fish)

  /** where it's lying (or where it's going to: flung up out of the water, and still on its way), into out */
  restAt(out) {
    if (this.state !== 'flying') return out.copy(this.pos);
    const f = this.game.ferry;
    return out.set(f.x + this.dx, 0, LANE + this.dz);
  }

  update(dt) {
    if (this.state === 'flying') this.fly(dt);
    else super.update(dt);
  }

  /** up out of the water, tumbling end over end, and down on her deck (wherever she's got to by then) */
  fly(dt) {
    const g = this.game, f = g.ferry;
    if (this.wait > 0) { this.wait -= dt; return; }
    if (!this.rig.root.visible) {
      this.rig.root.visible = true;
      g.fx.splash(this.from.x, this.from.y, this.from.z, 0.9);
      g.audio.splash();
    }
    this.t += dt;
    const k = Math.min(1, this.t / this.T);
    _v.set(f.x + this.dx, 0, LANE + this.dz);
    _v.y = f.groundAt(_v.x, _v.z);
    this.pos.lerpVectors(this.from, _v, k);
    this.pos.y += this.h * 4 * k * (1 - k);
    this.spin += dt * this.spinV;
    this.pose(dt);
    this.rig.root.updateMatrixWorld(true);
    if (k < 1) return;
    // (splat)
    this.airborne = false;
    this.spin = 0;
    this.becomeCarcass();
    this.flop = rand(...FLOP);
    g.fx.burst(_v.copy(this.pos).setY(this.pos.y + 0.1), { glow: true, n: 5, colors: [0xffffff, 0xcfe3ee], speed: [0.6, 1.6], up: [1, 2.2], grav: 9, size: [0.03, 0.06], life: [0.3, 0.6] });
    g.audio.flop();
  }

  pose(dt) {
    const r = this.rig.root, t = this.game.time;
    let y = this.pos.y, wig = 0;
    if (this.state !== 'flying') {
      y += this.rest;
      if (this.state === 'carcass' && !this.carrying) {
        // (flapping about on the deck, less and less; and every so often after, another flap)
        if (this.flop > 0) {
          this.flop = Math.max(0, this.flop - dt);
          const k = Math.min(1, this.flop / 1.2);
          wig = Math.sin(t * 23 + this.ph) * 0.5 * k;
          y += Math.abs(Math.sin(t * 11.5 + this.ph)) * 0.16 * k;
        } else if ((this.flapT -= dt) <= 0) {
          this.flapT = rand(4, 10);
          this.flop = rand(0.4, 0.9);
        }
      }
      if (this.carrying) y += 0.3 + Math.sin(t * 9 + this.ph) * 0.03;
    }
    r.position.set(this.pos.x, y, this.pos.z);
    r.rotation.set(0, this.heading, 0);
    this.lie.rotation.set(this.side, 0, 0);
    this.body.rotation.set(0, wig, this.spin); // (arching its back, nose and tail slapping the deck; or end over end, in the air)
  }
}
