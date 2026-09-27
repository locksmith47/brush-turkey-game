import * as THREE from 'three';
import { Foe, STRENGTH } from './foe.js';
import { S } from './turkey.js';
import { part, merge, vcMesh, G, limb, tint, rand, pick, TAU } from './util.js';

/*
 * Stuff left lying around Bondi. Turkeys nick it and haul it to a beach mound,
 * which hatches beach turkeys. Light things need one turkey; eskies and surfboards need a team.
 * Beach chairs are also rides: a turkey will happily lounge in one, and if there's a spare
 * pair of legs when a chair is being carried, one of the carriers hops in for the trip.
 */
const BRIGHT = [0xe84a8a, 0x1fb5c9, 0xffd21f, 0xff6b35, 0x7bd34f, 0x3a6ff0, 0xa05cff];

const TYPES = {
  towel: { name: 'Beach towel', value: 2, weight: 2, slots: 6, carryR: 0.8 },
  ball: { name: 'Beach ball', value: 2, weight: 1, slots: 4, carryR: 0.45 },
  spade: { name: 'Spade', value: 1, weight: 1, slots: 3, carryR: 0.4 },
  bucket: { name: 'Bucket', value: 1, weight: 1, slots: 3, carryR: 0.4 },
  thong: { name: 'Thong', value: 1, weight: 1, slots: 3, carryR: 0.35 },
  sunscreen: { name: 'Sunscreen', value: 1, weight: 1, slots: 3, carryR: 0.35 },
  sunnies: { name: 'Sunnies', value: 1, weight: 1, slots: 3, carryR: 0.35 },
  hat: { name: 'Bucket hat', value: 1, weight: 1, slots: 3, carryR: 0.4 },
  noodle: { name: 'Pool noodle', value: 2, weight: 1, slots: 4, carryR: 0.7 },
  boogie: { name: 'Boogie board', value: 3, weight: 2, slots: 6, carryR: 0.7 },
  umbrella: { name: 'Beach umbrella', value: 4, weight: 3, slots: 8, carryR: 1.1 },
  esky: { name: 'Esky', value: 5, weight: 4, slots: 8, carryR: 0.75 },
  surfboard: { name: 'Surfboard', value: 6, weight: 5, slots: 10, carryR: 1.3 },
  chair: { name: 'Beach chair', value: 3, weight: 2, slots: 6, carryR: 0.55, seat: true },
};
const _v = new THREE.Vector3();

function build(type, c) {
  const c2 = pick(BRIGHT.filter((x) => x !== c));
  switch (type) {
    case 'towel': return merge([
      part(G.box(1.4, 0.03, 0.8), c, [0, 0.02, 0]),
      part(G.box(1.4, 0.032, 0.16), 0xffffff, [0, 0.02, -0.2]),
      part(G.box(1.4, 0.032, 0.16), c2, [0, 0.02, 0.2]),
    ]);
    case 'ball': return tint(part(G.sphere(0.32, 16, 12), 0xffffff, [0, 0.32, 0]), (x, y, z, col) => {
      const seg = Math.floor(((Math.atan2(z, x) + Math.PI) / TAU) * 6);
      col.set([0xe84a3a, 0xffffff, 0x3a6ff0, 0xffffff, 0xffd21f, 0xffffff][seg % 6]);
    });
    case 'spade': return merge([
      part(G.cyl(0.03, 0.03, 0.55, 6), c, [0, 0.04, 0], [0, 0, Math.PI / 2]),
      part(G.box(0.22, 0.03, 0.2), c, [0.36, 0.03, 0]),
      part(G.box(0.05, 0.05, 0.14), c, [-0.28, 0.04, 0]),
    ]);
    case 'bucket': return merge([
      part(G.cyl(0.2, 0.15, 0.3, 12, true), c, [0, 0.15, 0]),
      part(G.cyl(0.15, 0.15, 0.02, 12), c, [0, 0.01, 0]),
      part(G.torus(0.19, 0.012, 4, 12, Math.PI), 0xdddddd, [0, 0.3, 0]),
    ]);
    case 'thong': return merge([
      part(G.cyl(1, 1, 0.04, 14), c, [0, 0.02, 0], [0, 0, 0], [0.13, 1, 0.3]),
      limb([0, 0.05, 0.16], [0.1, 0.07, -0.05], 0.015, 0.015, c2, 4),
      limb([0, 0.05, 0.16], [-0.1, 0.07, -0.05], 0.015, 0.015, c2, 4),
    ]);
    case 'sunscreen': return merge([
      part(G.cyl(0.08, 0.08, 0.3, 10), 0xff8c1a, [0, 0.08, 0], [0, 0, Math.PI / 2]),
      part(G.cyl(0.05, 0.05, 0.08, 8), 0xffffff, [0.19, 0.08, 0], [0, 0, Math.PI / 2]),
      part(G.box(0.12, 0.02, 0.1), 0xffd21f, [0, 0.16, 0]),
    ]);
    case 'sunnies': return merge([
      part(G.cyl(0.08, 0.08, 0.02, 12), 0x151515, [0.09, 0.02, 0]),
      part(G.cyl(0.08, 0.08, 0.02, 12), 0x151515, [-0.09, 0.02, 0]),
      part(G.box(0.36, 0.025, 0.03), c, [0, 0.03, -0.07]),
    ]);
    case 'hat': return merge([
      part(G.cyl(0.15, 0.17, 0.16, 12), c, [0, 0.1, 0]),
      part(G.cyl(0.28, 0.28, 0.02, 14), c, [0, 0.02, 0]),
      part(G.cyl(0.171, 0.171, 0.03, 12, true), c2, [0, 0.06, 0]),
    ]);
    case 'noodle': return part(G.cyl(0.07, 0.07, 1.3, 10), c, [0, 0.07, 0], [0, 0, Math.PI / 2]);
    case 'boogie': return merge([
      part(G.box(1.0, 0.06, 0.52), c, [0, 0.04, 0]),
      part(G.box(1.0, 0.065, 0.1), 0xffffff, [0, 0.04, 0]),
      part(G.cyl(0.26, 0.26, 0.06, 12, false), c, [0.5, 0.04, 0], [0, 0, 0], [0.4, 1, 1]),
    ]);
    case 'umbrella': {
      const p = [part(G.cyl(0.03, 0.03, 2.1, 6), 0xdddddd, [0, 0.12, 0], [0, 0, Math.PI / 2])];
      for (let i = 0; i < 6; i++) p.push(part(new THREE.ConeGeometry(0.22, 1.3, 3, 1, true, (i / 6) * TAU, TAU / 6), i % 2 ? c : 0xffffff, [0.35, 0.18, 0], [0, 0, -Math.PI / 2]));
      return merge(p);
    }
    case 'esky': return merge([
      part(G.box(0.62, 0.38, 0.42), 0x2f6fb0, [0, 0.19, 0]),
      part(G.box(0.66, 0.08, 0.46), 0xffffff, [0, 0.42, 0]),
      part(G.box(0.3, 0.05, 0.05), 0xffffff, [0, 0.48, 0]),
    ]);
    case 'surfboard': return merge([
      part(G.sphere(1, 18, 8), 0xf7f3e8, [0, 0.06, 0], [0, 0, 0], [1.15, 0.06, 0.3]),
      part(G.box(2.1, 0.125, 0.06), c, [0, 0.06, 0]),
      part(G.box(0.18, 0.2, 0.02), c2, [-0.95, -0.02, 0], [0, 0, 0.3]),
    ]);
    case 'chair': {
      // a folding beach chair: striped canvas, aluminium frame, wooden arms; faces +z
      const W = 0.64, n = 5, sw = W / n, frame = 0xc9ced3, wood = 0xb07a45;
      const p = [];
      for (let i = 0; i < n; i++) {
        const x = -W / 2 + sw * (i + 0.5), col = i % 2 ? 0xffffff : c;
        p.push(part(G.box(sw, 0.022, 0.46), col, [x, 0.2, 0.03], [-0.14, 0, 0])); // the seat sags back
        p.push(part(G.box(sw, 0.62, 0.022), col, [x, 0.46, -0.35], [-0.5, 0, 0])); // reclined back
      }
      for (const s of [-1, 1]) {
        const x = s * (W / 2 + 0.02);
        p.push(limb([x, 0.23, 0.27], [x, 0.17, -0.2], 0.016, 0.016, frame, 4));
        p.push(limb([x, 0.17, -0.2], [x, 0.75, -0.5], 0.016, 0.016, frame, 4));
        p.push(limb([x, 0.0, 0.32], [x, 0.23, 0.27], 0.016, 0.016, frame, 4));
        p.push(limb([x, 0.0, -0.36], [x, 0.37, 0.18], 0.016, 0.016, frame, 4));
        p.push(part(G.box(0.06, 0.028, 0.5), wood, [x, 0.38, -0.04]));
      }
      p.push(limb([-W / 2, 0.02, 0.32], [W / 2, 0.02, 0.32], 0.014, 0.014, frame, 4));
      p.push(limb([-W / 2, 0.02, -0.36], [W / 2, 0.02, -0.36], 0.014, 0.014, frame, 4));
      return merge(p);
    }
  }
  return part(G.box(0.3, 0.3, 0.3), c);
}

/* ------------------------------------------------------------------ the red-and-yellow lifesaving flags */
const FLAG_H = 2.6, FLAG_SUNK = 0.4, FLAG_MID = (FLAG_H - FLAG_SUNK) / 2; // pole top, buried length, middle
const SAND = [0xecd9a4, 0xe2cc92, 0xd8c286];
let FLAG_GEO = null;

function flagGeo() {
  FLAG_GEO ??= {
    pole: merge([
      part(G.cyl(0.04, 0.045, FLAG_H + FLAG_SUNK, 8), 0xd8d8d8, [0, (FLAG_H - FLAG_SUNK) / 2, 0]),
      part(G.sphere(0.065, 8, 6), 0xbfbfbf, [0, FLAG_H + 0.02, 0]),
    ]),
    // red over yellow, hung from the pole (the panel pivots on the pole so it can flutter)
    panel: merge([
      part(G.box(0.02, 0.28, 0.85), 0xd9312b, [0, 0.14, 0.44]),
      part(G.box(0.021, 0.28, 0.85), 0xffd21f, [0, -0.14, 0.44]),
    ]),
    heap: part(G.cone(0.42, 0.2, 10), SAND[2], [0, 0.07, 0]),
  };
  return FLAG_GEO;
}

/** a standalone flag (pole + fluttering panel) for planting in a mound */
export function flagMesh() {
  const g = flagGeo(), group = new THREE.Group(), panel = new THREE.Group();
  group.add(vcMesh(g.pole));
  panel.position.y = FLAG_H - 0.33;
  panel.add(vcMesh(g.panel));
  group.add(panel);
  return { group, panel };
}

/*
 * Planted in the sand, so turkeys first have to scratch it loose (the dig bar fills up as they do).
 * Then it topples over and they carry it on its side, lined up along the pole, to a beach mound,
 * where it gets planted on top for all to see.
 */
export class BeachFlag extends Foe {
  constructor(game, x, z) {
    super(game, {
      name: 'Lifesaving flag', hp: 14, scale: 1, radius: 0.15, labelY: 1.1, carcassLabelY: 0.7, dieTime: 0.8,
      value: 5, weight: 2, slots: 8, carryR: FLAG_MID, mound: 'beach', faceMove: true, task: 'dig', icon: '🚩', loot: true,
    }, x, z);
    const root = new THREE.Group();
    const f = flagMesh();
    this.pole = f.group;
    this.panel = f.panel;
    root.add(this.pole);
    this.heap = vcMesh(flagGeo().heap);
    root.add(this.heap);
    this.setRig({ root });
    this.heading = rand(0, TAU); // which way it'll fall
    this.base = this.pos.clone();
    this.ph = rand(0, TAU);
    this.wob = 0;
  }

  // thrown turkeys land at its foot and dig, rather than clinging to the pole
  hits() { return false; }
  colliderR() { return this.alive ? 0.18 : 0; }
  bodyCenter(out) { return out.set(this.base.x, this.base.y + 0.1, this.base.z); }
  hitFx(p) { this.game.fx.burst(p, { n: 4, colors: SAND, speed: [0.8, 2], up: [1.5, 3], size: [0.04, 0.07], life: [0.4, 0.7] }); }
  onDamage() { this.wob = 1; }

  onDeath() {
    this.game.audio.thunk();
    this.game.hud.toastOnce('flag', 'Dug it out! Now carry the flag to the beach mound', 2.5, 60);
  }

  /** it's down: from now on it's handled from the middle of the pole, lying along its heading */
  becomeCarcass() {
    this.pos.set(this.base.x + Math.sin(this.heading) * FLAG_MID, this.pos.y, this.base.z + Math.cos(this.heading) * FLAG_MID);
    this.heap.visible = false;
    super.becomeCarcass();
  }

  /** carried like a log: a row of turkeys down each side of the pole */
  slotPos(i, out) {
    const n = this.slots.length, rows = n / 2, side = i % 2 ? 1 : -1, k = Math.floor(i / 2);
    const along = (k / (rows - 1) - 0.5) * FLAG_MID * 1.6;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    return out.set(this.pos.x + fx * along + fz * side * 0.42, 0, this.pos.z + fz * along - fx * side * 0.42);
  }

  finishAbsorb() {
    const m = this.mound;
    super.finishAbsorb();
    m.addTrophy(); // planted on top of the mound, for everyone to see
  }

  pose(dt) {
    const r = this.rig.root, t = this.game.time;
    this.wob = Math.max(0, this.wob - dt * 3);
    const loose = 1 - Math.max(0, this.hp) / this.def.hp;
    if (this.alive || this.state === 'dying') {
      // standing in its heap of sand, leaning further the more it's dug out; then over it goes
      const lean = loose * 0.22 + Math.sin(t * 34) * 0.05 * this.wob;
      const fall = this.state === 'dying' ? this.roll * this.roll : 0;
      r.position.copy(this.base);
      r.position.y = this.pos.y;
      r.rotation.set(0, this.heading, 0);
      this.pole.position.set(0, 0, 0);
      this.pole.rotation.set(lean + (Math.PI / 2 - lean) * fall, 0, 0);
      this.panel.rotation.y = Math.sin(t * 3.1 + this.ph) * 0.3 * (1 - fall) + (Math.PI / 2) * fall;
      this.heap.scale.set(1 - loose * 0.5, Math.max(0.15, 1 - loose * 0.85), 1 - loose * 0.5);
    } else {
      // lying on its side, carried at hip height
      const bob = this.carrying ? 0.32 + Math.sin(t * 9 + this.ph) * 0.03 : 0.045;
      r.position.set(this.pos.x, this.pos.y + bob, this.pos.z);
      r.rotation.set(0, this.heading, this.carrying ? Math.sin(t * 7) * 0.04 : 0);
      this.pole.position.set(0, 0, -FLAG_MID);
      this.pole.rotation.set(Math.PI / 2, 0, 0);
      this.panel.rotation.y = Math.PI / 2 + (this.carrying ? Math.sin(t * 8 + this.ph) * 0.15 : 0);
    }
  }
}

const cache = {};
function itemGeo(type, variant) {
  const key = `${type}:${variant}`;
  cache[key] ??= build(type, BRIGHT[variant % BRIGHT.length]);
  return cache[key];
}

export class BeachItem extends Foe {
  constructor(game, type, x, z) {
    const T = TYPES[type];
    super(game, {
      name: T.name, hp: 1, scale: 1, radius: T.carryR * 0.8, value: T.value, weight: T.weight, slots: T.slots,
      carryR: T.carryR, carcassLabelY: 0.9, mound: 'beach', noLabel: T.weight <= 1, quiet: T.value <= 2, faceMove: !!T.seat, loot: true,
    }, x, z);
    this.type = type;
    const root = new THREE.Group();
    root.add(vcMesh(itemGeo(type, Math.floor(rand(0, BRIGHT.length)))));
    this.setRig({ root });
    this.heading = T.seat ? Math.PI / 2 + rand(-0.5, 0.5) : rand(0, TAU); // chairs face the surf
    this.ph = rand(0, TAU);
    this.rippleT = rand(0, 2);
    this.alive = false;
    this.becomeCarcass();
    if (T.seat) {
      this.seats = [{ rider: null }];
      this.seatPose = 'lounge';
      this.haulable = true; // thrown turkeys get to work carrying it rather than sitting straight down
      game.toys.addRide(this);
    }
  }

  get targetable() { return false; }

  // only the big things get in the way
  colliderR() { return this.def.weight >= 3 && this.state === 'carcass' ? this.def.carryR * 0.6 : 0; }

  /* ---------------------------------------------------------------- a chair is a ride too */
  nearestSeat(p) {
    if (this.state !== 'carcass' || this.seats[0].rider) return null;
    this.seatPos(0, _v);
    return { i: 0, d: Math.hypot(_v.x - p.x, _v.z - p.z) };
  }

  approach(i, from, out) {
    return out.set(this.pos.x + Math.sin(this.heading) * 0.75, 0, this.pos.z + Math.cos(this.heading) * 0.75);
  }

  /** bigger turkeys sit a little lower and further forward, so they fill the chair */
  seatPos(i, out, t) {
    const s = t ? t.scale : 1;
    return this.rig.root.localToWorld(out.set(0, 0.25 - 0.2 * s, 0.1 + 0.06 * s));
  }

  seatHeading() { return this.heading; }
  rideTime() { return rand(10, 18); }
  canLeave() { return !this.carrying; } // nobody gets off while they're being carried

  dismount(t) {
    if (t.state === S.TOY) { t.leaveSeat(); t.setState(S.IDLE); return; } // was only on its way over
    const p = this.seatPos(0, new THREE.Vector3(), t);
    t.leaveSeat();
    t.pos.copy(p);
    t.hopTo(p.x + Math.sin(this.heading) * 1.1, p.z + Math.cos(this.heading) * 1.1, 0.45, 0.6);
  }

  ejectRider() {
    const r = this.seats?.[0].rider;
    if (r && r.seat?.set === this) this.dismount(r);
  }

  /** a spare carrier (the others can manage without it) climbs in for the ride */
  takePassenger() {
    const st = this.strength();
    let spare = null;
    for (const t of this.slots) {
      if (!t || t.state !== S.HAUL || st - STRENGTH[t.stage] < this.def.weight) continue;
      if (!spare || t.stage < spare.stage) spare = t;
    }
    if (spare) spare.mount({ set: this, i: 0 });
  }

  update(dt) {
    super.update(dt);
    if (this.seats && this.state === 'carcass' && this.carrying && !this.seats[0].rider) this.takePassenger();
  }

  startAbsorb(m) {
    this.ejectRider();
    super.startAbsorb(m);
  }

  dispose() {
    this.ejectRider();
    if (this.seats) this.game.toys.removeRide(this);
    super.dispose();
  }

  pose(dt) {
    const g = this.game, r = this.rig.root, t = g.time;
    const w = g.world.waterAt(this.pos.x, this.pos.z);
    let y = this.pos.y + (this.carrying ? 0.3 + Math.sin(t * 9 + this.ph) * 0.03 : 0);
    if (w.depth) {
      const s = g.world.surfaceY(w, this.pos.x, this.pos.z);
      y = Math.max(y, s - 0.02 + Math.sin(t * 2 + this.ph) * 0.03); // it floats
      this.rippleT -= dt;
      if (this.rippleT <= 0) {
        this.rippleT = this.carrying ? 0.3 : rand(1.2, 2);
        g.fx.ripple(this.pos.x, s, this.pos.z, this.def.carryR * 1.6, 1.6, 0.22, this.def.carryR * 0.6);
      }
    }
    r.position.set(this.pos.x, y, this.pos.z);
    r.rotation.set(0, this.heading, 0);
  }
}
