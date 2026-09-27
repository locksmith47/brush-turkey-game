import * as THREE from 'three';
import { Foe } from './foe.js';
import { part, merge, vcMesh, G, limb, rand, pick, TAU } from './util.js';

/*
 * The oval's cricket gear: the stumps at either end of the pitch, which turkeys can dig up (and carry off to
 * a mound, where they get planted on top), and the kit left lying about the ground (bats, balls, pads,
 * helmets, the lot), for hauling to a mound like anything else.
 */
const WOOD = 0xefe3c4, SOIL = [0x5e3e22, 0x7a5230, 0x8b6238];
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

/* ------------------------------------------------------------------ stumps */
let STUMPS = null;
function stumpsGeos() {
  if (STUMPS) return STUMPS;
  const set = [];
  for (const x of [-0.1, 0, 0.1]) {
    set.push(part(G.cyl(0.028, 0.026, 0.86, 8), WOOD, [x, 0.29, 0])); // (the bottom 0.14 of it is in the ground)
    set.push(part(G.cyl(0.0285, 0.0285, 0.09, 8), 0xc0392b, [x, 0.56, 0])); // sponsor's band
    set.push(part(G.cone(0.028, 0.06, 8), WOOD, [x, -0.17, 0], [Math.PI, 0, 0]));
  }
  const bails = [];
  for (const x of [-0.05, 0.05]) {
    bails.push(limb([x - 0.052, 0.735, 0], [x + 0.052, 0.735, 0], 0.011, 0.011, WOOD, 6));
    bails.push(part(G.sphere(0.014, 6, 5), WOOD, [x, 0.742, 0]));
  }
  const heap = [part(G.cyl(0.26, 0.3, 0.05, 12), SOIL[0], [0, 0.02, 0])];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU;
    heap.push(part(G.dodec(0.06 + (i % 3) * 0.015), pick(SOIL), [Math.cos(a) * 0.24, 0.04, Math.sin(a) * 0.24], [i, i * 2, 0]));
  }
  STUMPS = { set: merge(set), bails: merge(bails), heap: merge(heap) };
  return STUMPS;
}

/** a set of stumps, bails on (base at the origin), e.g. for planting on top of a mound */
export function stumpsMesh() {
  const g = stumpsGeos(), group = new THREE.Group(), bails = vcMesh(g.bails);
  group.add(vcMesh(g.set), bails);
  return { group, bails, panel: null };
}

/*
 * Knocked into the pitch, so turkeys have to scratch them loose first (the dig bar fills up as they do).
 * Out they come (the bails go flying: howzat!), and off they go to a mound on the turkeys' shoulders.
 */
export class Stumps extends Foe {
  constructor(game, x, z) {
    super(game, {
      name: 'Stumps', hp: 12, scale: 1, radius: 0.2, labelY: 1.05, carcassLabelY: 0.6, dieTime: 0.7,
      value: 6, weight: 2, slots: 6, carryR: 0.5, task: 'dig', bits: 'soil', icon: '🏏', loot: true, palette: 'cricket',
    }, x, z);
    const root = new THREE.Group(), s = stumpsMesh();
    this.set = s.group;
    this.bails = s.bails;
    this.heap = vcMesh(stumpsGeos().heap);
    this.heap.scale.setScalar(0.2);
    root.add(this.set, this.heap);
    this.setRig({ root });
    this.heading = rand(0, TAU); // which way they'll topple
    this.base = this.pos.clone();
    this.wob = 0;
  }

  // thrown turkeys land at their foot and dig, rather than clinging on
  hits() { return false; }
  colliderR() { return this.alive ? 0.2 : 0; }
  bodyCenter(out) { return out.set(this.base.x, this.base.y + 0.1, this.base.z); }
  hitFx(p) { this.game.fx.burst(p, { n: 4, colors: SOIL, speed: [0.8, 2], up: [1.5, 3], size: [0.04, 0.07], life: [0.4, 0.7] }); }
  onDamage() { this.wob = 1; }

  onDeath() {
    const g = this.game;
    g.audio.thunk();
    g.audio.clang();
    // the bails go flying
    const a = this.heading + Math.PI;
    g.fx.fling(this.bails, _v.set(Math.sin(a) * 1.5, 3.2, Math.cos(a) * 1.5), _w.set(rand(-12, 12), rand(-12, 12), rand(-12, 12)), 1.4);
    g.hud.toastOnce('stumps', 'Howzat! The stumps are out: carry them off to a mound', 3, 60);
  }

  finishAbsorb() {
    const m = this.mound;
    super.finishAbsorb();
    m.addTrophy('stumps'); // planted on top of the mound, for all to see
  }

  pose(dt) {
    const r = this.rig.root, t = this.game.time;
    this.wob = Math.max(0, this.wob - dt * 3);
    const loose = 1 - Math.max(0, this.hp) / this.def.hp;
    this.heap.scale.set(0.2 + loose * 0.9, 0.2 + loose * 0.9, 0.2 + loose * 0.9);
    if (this.alive || this.state === 'dying') {
      // standing in the pitch, working looser (and more of the ground dug up round them) as they're dug; then over they go
      const lean = loose * 0.18 + Math.sin(t * 34) * 0.05 * this.wob;
      const fall = this.state === 'dying' ? this.roll * this.roll : 0;
      r.position.copy(this.base);
      r.position.y = this.pos.y;
      r.rotation.set(0, this.heading, 0);
      this.set.position.set(0, fall * 0.12, 0);
      this.set.rotation.set(lean + (Math.PI / 2 - lean) * fall, 0, 0);
    } else {
      // lying flat, carried at hip height (the hole they came out of stays put)
      const bob = this.carrying ? 0.32 + Math.sin(t * 9 + this.base.x) * 0.03 : 0.04;
      r.position.set(this.pos.x, this.pos.y + bob, this.pos.z);
      r.rotation.set(0, this.heading, this.carrying ? Math.sin(t * 7) * 0.04 : 0);
      this.set.position.set(0, 0, -0.3);
      this.set.rotation.set(Math.PI / 2, 0, 0);
      this.heap.visible = false;
    }
  }
}

/* ------------------------------------------------------------------ the kit lying about */
const KIT = {
  bat: { name: 'Cricket bat', value: 3, weight: 2, slots: 6, carryR: 0.6 },
  ball: { name: 'Cricket ball', value: 1, weight: 1, slots: 3, carryR: 0.3 },
  pads: { name: 'Leg guards', value: 2, weight: 1, slots: 4, carryR: 0.45 },
  helmet: { name: 'Helmet', value: 2, weight: 1, slots: 4, carryR: 0.38 },
  gloves: { name: 'Batting gloves', value: 1, weight: 1, slots: 3, carryR: 0.35 },
  cap: { name: 'Baggy green', value: 2, weight: 1, slots: 3, carryR: 0.35 },
  cooler: { name: 'Drinks cooler', value: 4, weight: 3, slots: 8, carryR: 0.6 },
  kitbag: { name: 'Kit bag', value: 6, weight: 5, slots: 10, carryR: 1.0 },
};
const NAVY = 0x1d2b5e, STEEL = 0xc9ced4, WHITE = 0xf5f5f0, RIDGE = 0xe2e2da, WILLOW = 0xe3c58a, LEATHER = 0xa8231c, GREEN = 0x1f5d2a, GOLD = 0xd4a017;

function onePad(x) {
  const p = [part(G.box(0.17, 0.035, 0.52), WHITE, [x, 0.03, 0])];
  for (const dx of [-0.055, 0, 0.055]) p.push(part(G.box(0.035, 0.03, 0.48), RIDGE, [x + dx, 0.06, -0.01]));
  p.push(part(G.cyl(0.035, 0.035, 0.17, 10), WHITE, [x, 0.04, 0.25], [0, 0, Math.PI / 2]));
  for (const z of [-0.12, 0.12]) p.push(part(G.box(0.2, 0.012, 0.05), NAVY, [x, 0.052, z]));
  return p;
}

function kitGeo(type) {
  switch (type) {
    case 'bat': return merge([
      part(G.box(0.11, 0.045, 0.56), WILLOW, [0, 0.03, -0.12]),
      part(G.box(0.07, 0.03, 0.14), WILLOW, [0, 0.055, -0.12]), // (the spine down the back)
      part(G.box(0.1, 0.047, 0.07), 0xc0392b, [0, 0.03, 0.08]), // sticker
      part(G.cyl(0.022, 0.022, 0.3, 8), 0x2b2b2b, [0, 0.03, 0.3], [Math.PI / 2, 0, 0]), // rubber grip
      part(G.sphere(0.026, 8, 6), 0x2b2b2b, [0, 0.03, 0.45]),
    ]);
    case 'ball': return merge([
      part(G.sphere(0.1, 14, 10), LEATHER, [0, 0.1, 0]),
      part(G.torus(0.1, 0.008, 4, 20), WHITE, [0, 0.1, 0], [0, 0.4, Math.PI / 2]),
    ]);
    case 'pads': return merge([...onePad(-0.1), ...onePad(0.1)]);
    case 'helmet': {
      const p = [
        part(new THREE.SphereGeometry(0.17, 16, 8, 0, TAU, 0, Math.PI / 2), NAVY, [0, 0.12, 0]),
        part(G.torus(0.17, 0.012, 4, 20), NAVY, [0, 0.12, 0], [Math.PI / 2, 0, 0]),
        part(G.box(0.26, 0.018, 0.12), NAVY, [0, 0.115, 0.2], [0.2, 0, 0]),
        part(G.box(0.05, 0.05, 0.015), GOLD, [0, 0.215, 0.14], [-0.6, 0, 0]),
      ];
      for (const y of [0.09, 0.05, 0.01]) p.push(limb([-0.13, y + 0.02, 0.21], [0.13, y + 0.02, 0.21], 0.008, 0.008, STEEL, 5));
      for (const x of [-0.05, 0.05]) p.push(limb([x, 0.12, 0.22], [x, 0.02, 0.22], 0.008, 0.008, STEEL, 5));
      return merge(p);
    }
    case 'gloves': {
      const p = [];
      for (const s of [-1, 1]) {
        p.push(part(G.box(0.12, 0.05, 0.13), WHITE, [s * 0.1, 0.03, 0], [0, s * 0.3, 0]));
        for (let i = 0; i < 4; i++) p.push(part(G.cyl(0.018, 0.018, 0.1, 8), i % 2 ? 0x2f6fb0 : WHITE, [s * 0.1 + (i - 1.5) * 0.028, 0.035, 0.1], [Math.PI / 2, s * 0.3, 0]));
      }
      return merge(p);
    }
    case 'cap': return merge([
      part(new THREE.SphereGeometry(0.12, 14, 8, 0, TAU, 0, Math.PI / 2), GREEN, [0, 0.01, 0]),
      part(G.box(0.18, 0.012, 0.13), GREEN, [0, 0.012, 0.15], [0.05, 0, 0]),
      part(G.box(0.04, 0.04, 0.012), GOLD, [0, 0.09, 0.09], [-0.7, 0, 0]),
    ]);
    case 'cooler': return merge([
      part(G.cyl(0.22, 0.22, 0.44, 16), 0xff7f11, [0, 0.22, 0]),
      part(G.cyl(0.23, 0.23, 0.07, 16), WHITE, [0, 0.47, 0]),
      part(G.box(0.05, 0.07, 0.07), WHITE, [0, 0.1, 0.24]),
      part(G.torus(0.14, 0.015, 4, 14, Math.PI), 0x2b2b2b, [0, 0.5, 0]),
    ]);
    case 'kitbag': return merge([
      part(G.box(1.05, 0.34, 0.42), NAVY, [0, 0.18, 0]),
      part(G.box(1.07, 0.03, 0.05), 0xb8b8b8, [0, 0.35, 0]), // (the zip)
      part(G.box(0.4, 0.2, 0.02), GREEN, [0.2, 0.19, 0.215]),
      part(G.cyl(0.07, 0.07, 0.06, 10), 0x2b2b2b, [-0.47, 0.07, 0.17], [Math.PI / 2, 0, 0]),
      part(G.cyl(0.07, 0.07, 0.06, 10), 0x2b2b2b, [-0.47, 0.07, -0.17], [Math.PI / 2, 0, 0]),
      limb([0.35, 0.36, -0.08], [0.55, 0.36, 0.0], 0.02, 0.02, 0x2b2b2b, 5),
    ]);
  }
  return part(G.box(0.3, 0.3, 0.3), WHITE);
}

const cache = {};
export class CricketGear extends Foe {
  constructor(game, type, x, z) {
    const T = KIT[type];
    super(game, {
      name: T.name, hp: 1, scale: 1, radius: T.carryR * 0.8, value: T.value, weight: T.weight, slots: T.slots,
      carryR: T.carryR, carcassLabelY: 0.7, noLabel: T.weight <= 1, quiet: T.value <= 2, loot: true, palette: 'cricket',
    }, x, z);
    this.type = type;
    const root = new THREE.Group();
    cache[type] ??= kitGeo(type);
    root.add(vcMesh(cache[type]));
    this.setRig({ root });
    this.heading = rand(0, TAU);
    this.ph = rand(0, TAU);
    this.alive = false;
    this.becomeCarcass();
  }

  get targetable() { return false; }

  // only the big things get in the way
  colliderR() { return this.def.weight >= 3 && this.state === 'carcass' ? this.def.carryR * 0.6 : 0; }

  pose() {
    const r = this.rig.root, t = this.game.time;
    r.position.set(this.pos.x, this.pos.y + (this.carrying ? 0.3 + Math.sin(t * 9 + this.ph) * 0.03 : 0), this.pos.z);
    r.rotation.set(0, this.heading, 0);
  }
}
