import * as THREE from 'three';
import { part, merge, vcMesh, G, limb, rand, randInt, pick, damp, clamp, TAU } from './util.js';
import { S } from './turkey.js';

/*
 * Backyard toys: a trampoline turkeys bounce on, and "rides" they can sit on: a swing set,
 * the Hills Hoist (roost on it and it spins), the low branches of the gums out in the bush and,
 * at Bondi, the beach chairs.
 *
 * A ride has seats [{ rider }] and:
 *   seatPose               'swing' | 'perch' | 'roost' | 'lounge' (how the rider sits)
 *   nearestSeat(p)         { i, d } for the best free seat, or null
 *   approach(i, from, out) where to walk to before hopping on
 *   seatPos(i, out, t)     where rider t sits (world)      seatHeading(i)  which way it faces
 *   rideTime()             how long a turkey stays on      canLeave(i)     may it get off now?
 *   dismount(t, i)         get off (usually with a hop)    onMount(t, i)   optional
 */
const _v = new THREE.Vector3();

class Trampoline {
  constructor(game, x, z) {
    this.game = game;
    this.x = x;
    this.z = z;
    this.matR = 1.65;
    this.matY = game.world.groundHeight(x, z) + 0.88;
    this.dip = 0;
    this.dipV = 0;
    const frame = [part(G.torus(1.8, 0.1, 6, 28), 0x2a8a3a, [0, 0.9, 0], [Math.PI / 2, 0, 0])];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      frame.push(part(G.cyl(0.04, 0.04, 0.9, 6), 0x8f969c, [Math.cos(a) * 1.75, 0.45, Math.sin(a) * 1.75]));
    }
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      frame.push(part(G.cyl(0.012, 0.012, 0.2, 4), 0xb0b6bb, [Math.cos(a) * 1.72, 0.89, Math.sin(a) * 1.72], [0, -a, Math.PI / 2]));
    }
    this.group = new THREE.Group();
    this.group.position.set(x, this.matY - 0.88, z);
    this.group.add(vcMesh(merge(frame), { cast: true, receive: true }));
    this.mat = vcMesh(merge([
      part(G.cyl(1.62, 1.62, 0.03, 32), 0x1c1c1c, [0, 0, 0]),
      part(G.torus(1.1, 0.025, 4, 32), 0xffd21f, [0, 0.02, 0], [Math.PI / 2, 0, 0]),
    ]), { cast: false, receive: true });
    this.mat.position.y = 0.88;
    this.group.add(this.mat);
    game.scene.add(this.group);
  }

  kick(power = 1) { this.dipV -= 2.2 * power; }

  /** a turkey landed on the mat: bounce it a few times, then fling it off */
  bounce(t) {
    const g = this.game;
    if (!t.bounces) t.bounces = randInt(3, 5);
    t.bounces--;
    this.kick(0.6 + t.stage * 0.2);
    g.audio.boing(t.stage);
    t.squash = 1;
    if (Math.random() < 0.4) g.fx.sparkle(t.pos, 3, [0xffe066, 0xffffff]);
    if (t.bounces > 0) {
      const a = rand(0, TAU), r = rand(0, 0.9);
      t.hopTo(this.x + Math.cos(a) * r, this.z + Math.sin(a) * r, rand(0.85, 1.1), rand(2.8, 4.3), this.matY);
      t.flight.spin = Math.random() < 0.45 ? pick([-1, 1]) : 0; // the odd flip
    } else {
      const a = rand(0, TAU), d = rand(3.2, 5);
      t.hopTo(this.x + Math.cos(a) * d, this.z + Math.sin(a) * d, 1.1, 3.4);
      t.flight.spin = pick([-1, 1]);
      if (t.bounceRejoin) t.joinAfterHop = true;
      t.bounceRejoin = false;
    }
  }

  update(dt) {
    // springy mat: dips when something lands and wobbles back
    this.dipV += (-this.dip * 90 - this.dipV * 7) * dt;
    this.dip += this.dipV * dt;
    this.mat.position.y = 0.88 + this.dip * 0.12;
  }
}

/* A beach umbrella: land on the canopy and it boings you off, a bit like the trampoline. */
const CANOPY_R = 1.4, CANOPY_Y = 2.4, CANOPY_H = 0.6;

class Umbrella {
  constructor(game, x, z, colA, colB) {
    this.game = game;
    this.x = x;
    this.z = z;
    this.r = CANOPY_R;
    this.base = game.world.groundHeight(x, z);
    this.dip = 0; this.dipV = 0;
    this.tx = 0; this.txV = 0; this.tz = 0; this.tzV = 0;
    this.group = new THREE.Group();
    this.group.position.set(x, this.base, z);
    this.group.add(vcMesh(merge([
      part(G.cyl(0.035, 0.035, CANOPY_Y, 6), 0xdddddd, [0, CANOPY_Y / 2, 0]),
      part(G.cyl(0.07, 0.07, 0.12, 6), 0xbbbbbb, [0, 0.9, 0]),
    ]), { cast: true, receive: true }));
    const p = [part(G.sphere(0.07, 8, 6), 0xffffff, [0, CANOPY_H / 2 + 0.02, 0])];
    for (let i = 0; i < 8; i++) {
      p.push(part(new THREE.ConeGeometry(CANOPY_R, CANOPY_H, 3, 1, true, (i / 8) * TAU, TAU / 8), i % 2 ? colA : colB, [0, 0, 0]));
    }
    this.canopy = vcMesh(merge(p), { cast: true });
    this.canopy.position.y = CANOPY_Y;
    this.group.add(this.canopy);
    game.scene.add(this.group);
    game.world.colliders.push({ x, z, r: 0.25 });
  }

  /** height of the canopy's surface d from the middle */
  canopyY(d) { return this.base + CANOPY_Y + CANOPY_H / 2 - (Math.min(d, CANOPY_R) / CANOPY_R) * CANOPY_H + this.dip * 0.12; }

  /** is something at p sitting on (or falling through) the canopy? */
  onTop(p) {
    const d = Math.hypot(p.x - this.x, p.z - this.z);
    if (d > this.r) return false;
    const y = this.canopyY(d);
    return p.y > y - 0.45 && p.y < y + 0.15;
  }

  /** knock the canopy: it dips and tips towards where the turkey landed */
  kick(t) {
    this.dipV -= 1.8 + t.stage * 0.5;
    this.txV += (t.pos.z - this.z) * 2.2;
    this.tzV -= (t.pos.x - this.x) * 2.2;
  }

  bounce(t) {
    const g = this.game;
    if (!t.bounces) t.bounces = randInt(1, 3);
    t.bounces--;
    this.kick(t);
    g.audio.boing(t.stage);
    t.squash = 1;
    if (Math.random() < 0.5) g.fx.sparkle(t.pos, 3, [0xffe066, 0xffffff]);
    if (t.bounces > 0) {
      // another boing on top
      const a = rand(0, TAU), r = rand(0.35, 0.9);
      const x = this.x + Math.cos(a) * r, z = this.z + Math.sin(a) * r;
      t.hopTo(x, z, rand(0.7, 0.9), rand(1.8, 2.8), this.canopyY(r));
      t.flight.spin = Math.random() < 0.4 ? pick([-1, 1]) : 0;
    } else {
      // ...and off the edge it goes
      const a = Math.atan2(t.pos.z - this.z, t.pos.x - this.x) + rand(-0.6, 0.6), d = rand(2.6, 4);
      t.hopTo(this.x + Math.cos(a) * d, this.z + Math.sin(a) * d, 0.9, 1.6);
      t.flight.spin = pick([-1, 1]);
      if (t.bounceRejoin) t.joinAfterHop = true;
      t.bounceRejoin = false;
    }
  }

  update(dt) {
    // springy canopy: dips, wobbles and settles
    this.dipV += (-this.dip * 70 - this.dipV * 6) * dt;
    this.dip += this.dipV * dt;
    this.txV += (-this.tx * 60 - this.txV * 5) * dt;
    this.tx += this.txV * dt;
    this.tzV += (-this.tz * 60 - this.tzV * 5) * dt;
    this.tz += this.tzV * dt;
    this.canopy.position.y = CANOPY_Y + this.dip * 0.12;
    this.canopy.rotation.x = clamp(this.tx * 0.1, -0.4, 0.4);
    this.canopy.rotation.z = clamp(this.tz * 0.1, -0.4, 0.4);
  }
}

class SwingSet {
  constructor(game, x, z, rotY = 0) {
    this.game = game;
    this.rotY = rotY;
    this.seatPose = 'swing';
    this.group = new THREE.Group();
    this.group.position.set(x, game.world.groundHeight(x, z), z);
    this.group.rotation.y = rotY;
    const frame = [part(G.cyl(0.07, 0.07, 5, 10), 0xd9453b, [0, 2.5, 0], [0, 0, Math.PI / 2])];
    for (const sx of [-2.3, 2.3]) {
      for (const sz of [-0.9, 0.9]) frame.push(part(G.cyl(0.06, 0.06, 2.65, 8), 0x2f6fb0, [sx, 1.25, sz * 0.5], [sz > 0 ? -0.36 : 0.36, 0, 0]));
      frame.push(part(G.cyl(0.045, 0.045, 1.2, 6), 0x2f6fb0, [sx, 0.9, 0], [Math.PI / 2, 0, 0]));
    }
    this.group.add(vcMesh(merge(frame), { cast: true, receive: true }));
    const seatGeo = merge([
      part(G.cyl(0.012, 0.012, 1.8, 4), 0x9a9a9a, [-0.24, -0.9, 0]),
      part(G.cyl(0.012, 0.012, 1.8, 4), 0x9a9a9a, [0.24, -0.9, 0]),
      part(G.box(0.62, 0.06, 0.3), 0xffd21f, [0, -1.82, 0]),
    ]);
    this.seats = [-1.45, 0, 1.45].map((sx, i) => {
      const pivot = new THREE.Group();
      pivot.position.set(sx, 2.45, 0);
      const m = vcMesh(seatGeo);
      pivot.add(m);
      this.group.add(pivot);
      return { pivot, rider: null, amp: 0.05, phase: rand(0, TAU), i };
    });
    game.scene.add(this.group);
    const c = Math.cos(rotY), s = Math.sin(rotY);
    for (const sx of [-2.3, 2.3]) game.world.colliders.push({ x: x + sx * c, z: z - sx * s, r: 0.55 });
  }

  seatPos(i, out) { return this.seats[i].pivot.localToWorld(out.set(0, -1.78, 0)); }
  seatHeading() { return this.rotY; }

  seatGround(i, out) {
    this.seats[i].pivot.localToWorld(out.set(0, 0, 0));
    out.y = 0;
    return out;
  }

  nearestSeat(p) {
    let best = null;
    this.seats.forEach((s, i) => {
      if (s.rider) return;
      this.seatGround(i, _v);
      const d = Math.hypot(_v.x - p.x, _v.z - p.z);
      if (!best || d < best.d) best = { i, d };
    });
    return best;
  }

  approach(i, from, out) { return this.seatGround(i, out); }
  rideTime() { return rand(6, 11); }
  // let go at the top of a forward swing...
  canLeave(i) { return Math.sin(this.seats[i].phase) > 0.97; }

  /** ...and sail off */
  dismount(t, i) {
    const from = this.seatPos(i, new THREE.Vector3());
    t.leaveSeat();
    t.pos.copy(from);
    t.hopTo(from.x + Math.sin(this.rotY) * 3.5, from.z + Math.cos(this.rotY) * 3.5, 0.9, 1.8);
    t.flight.spin = 1;
    this.game.audio.peep(t.stage);
  }

  update(dt) {
    for (const s of this.seats) {
      s.amp = damp(s.amp, s.rider?.state === S.SWING ? 0.85 : 0.04, s.rider ? 0.5 : 0.8, dt); // riders pump higher and higher
      s.phase += dt * 2.3;
      s.pivot.rotation.x = -s.amp * Math.sin(s.phase);
    }
    this.group.updateMatrixWorld(true);
  }
}

/* The Hills Hoist: turkeys roost on its arms, and all that flapping sets it whirling round. */
const ARM = 1.9;
const armY = (r) => 2.15 - (r / ARM) * 0.3;

class HillsHoist {
  constructor(game, x, z) {
    this.game = game;
    this.x = x;
    this.z = z;
    this.seatPose = 'perch';
    const gy = game.world.groundHeight(x, z);
    const pole = vcMesh(merge([
      part(G.cyl(0.05, 0.06, 2.2, 8), 0x9aa0a6, [0, 1.1, 0]),
      part(G.cyl(0.1, 0.12, 0.1, 8), 0x7d8388, [0, 0.05, 0]),
    ]), { cast: true, receive: true });
    pole.position.set(x, gy, z);
    game.scene.add(pole);

    // everything above the pole spins
    this.head = new THREE.Group();
    this.head.position.set(x, gy, z);
    const p = [part(G.cyl(0.08, 0.08, 0.14, 8), 0x8a9096, [0, 2.17, 0])];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU;
      p.push(limb([0, 2.15, 0], [Math.cos(a) * ARM, armY(ARM), Math.sin(a) * ARM], 0.028, 0.022, 0x9aa0a6, 5));
      p.push(part(G.sphere(0.035, 6, 5), 0x6d7378, [Math.cos(a) * ARM, armY(ARM), Math.sin(a) * ARM]));
    }
    for (const r of [0.8, 1.3, 1.8]) {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU, b = ((i + 1) / 4) * TAU, y = armY(r) - 0.01;
        p.push(limb([Math.cos(a) * r, y, Math.sin(a) * r], [Math.cos(b) * r, y, Math.sin(b) * r], 0.008, 0.008, 0xdddddd, 3));
      }
    }
    this.head.add(vcMesh(merge(p), { cast: true }));

    // washing on the outer line: towels on pivots so they can swing out as it spins
    this.towels = [0xe85d75, 0x4fb3d9, 0xf2c14e, 0x7ac74f].map((c, i) => {
      const a = (i / 4) * TAU + TAU / 8, r = 1.8 * Math.SQRT1_2; // halfway between two arms
      const outer = new THREE.Group();
      outer.position.set(Math.cos(a) * r, armY(1.8) - 0.01, Math.sin(a) * r);
      outer.rotation.y = -a + Math.PI / 2;
      const inner = new THREE.Group();
      inner.add(vcMesh(merge([
        part(G.box(0.7, 0.9, 0.02), c, [0, -0.45, 0]),
        part(G.box(0.7, 0.08, 0.025), 0xffffff, [0, -0.78, 0]),
      ]), { cast: true }));
      outer.add(inner);
      this.head.add(outer);
      return { inner, ph: rand(0, TAU) };
    });
    game.scene.add(this.head);
    game.world.colliders.push({ x, z, r: 0.25 });

    // perches: two along each arm
    this.seats = [];
    for (let i = 0; i < 4; i++) for (const r of [1.05, 1.7]) this.seats.push({ rider: null, a: (i / 4) * TAU, r });
    this.spin = 0;
    this.w = 0; // how fast it's going round (rad/s)
    this.creak = 0;
  }

  seatPos(i, out) {
    const s = this.seats[i];
    return this.head.localToWorld(out.set(Math.cos(s.a) * s.r, armY(s.r) + 0.02, Math.sin(s.a) * s.r));
  }

  /** riders face the way they're travelling */
  seatHeading(i) {
    this.seatPos(i, _v);
    return Math.atan2(_v.z - this.z, -(_v.x - this.x));
  }

  nearestSeat(p) {
    let best = null;
    this.seats.forEach((s, i) => {
      if (s.rider) return;
      this.seatPos(i, _v);
      const d = Math.hypot(_v.x - p.x, _v.z - p.z);
      if (!best || d < best.dd) best = { i, dd: d };
    });
    if (best) best.d = Math.max(0, Math.hypot(p.x - this.x, p.z - this.z) - 2.1);
    return best;
  }

  /** walk up under the line on your side, then hop up */
  approach(i, from, out) {
    const dx = from.x - this.x, dz = from.z - this.z, d = Math.hypot(dx, dz) || 1;
    return out.set(this.x + (dx / d) * 1.35, 0, this.z + (dz / d) * 1.35);
  }

  rideTime() { return rand(7, 13); }
  canLeave() { return true; }
  onMount() { this.w += 0.3; }

  /** hop off (or get flung off!) along the way it's spinning */
  dismount(t, i) {
    const p = this.seatPos(i, new THREE.Vector3());
    const ox = p.x - this.x, oz = p.z - this.z, r = Math.hypot(ox, oz) || 1;
    const ux = ox / r, uz = oz / r, w = this.w;
    const out = 1.3 + w * 0.6, along = w * 0.9;
    t.leaveSeat();
    t.pos.copy(p);
    t.hopTo(p.x + ux * out + uz * along, p.z + uz * out - ux * along, 0.7 + w * 0.06, 0.9 + w * 0.3);
    if (w > 2.2) { t.flight.spin = 1; t.flung = true; }
    this.game.audio.peep(t.stage);
  }

  update(dt) {
    const g = this.game;
    // every roosting turkey flaps to keep its balance, which pushes the hoist round:
    // a couple of chicks turn it lazily, a full load of adults sends it whirling
    let push = 0;
    for (const s of this.seats) if (s.rider?.state === S.SWING) push += 0.2 + s.rider.stage * 0.08;
    this.w = clamp(this.w + (push - this.w * 0.45) * dt, 0, 5.5);
    this.spin += this.w * dt;
    this.head.rotation.y = this.spin;
    // the washing swings out as it speeds up
    const tilt = Math.atan((this.w * this.w * 1.3) / 9.8);
    for (const tw of this.towels) {
      tw.inner.rotation.x = damp(tw.inner.rotation.x, -tilt - Math.sin(g.time * 7 + tw.ph) * 0.06 * Math.min(1, this.w), 6, dt);
    }
    // squeaks once a turn
    this.creak += this.w * dt;
    if (this.creak > Math.PI) {
      this.creak -= Math.PI;
      if (this.w > 0.8 && Math.hypot(g.player.pos.x - this.x, g.player.pos.z - this.z) < 26) g.audio.creak(this.w);
    }
    // flat out? riders start flying off
    if (this.w > 4.5) {
      for (const s of this.seats) {
        if (s.rider?.state === S.SWING && Math.random() < dt * (this.w - 4.5) * 0.35) s.rider.swingT = 0;
      }
    }
    this.head.updateMatrixWorld(true);
  }
}

/*
 * A low branch on one of the gums. Brush turkeys roost up in the trees, so ours flap up and sit along it
 * for a while (a look round, a stretch, a little doze), then flutter back down.
 */
class TreeRoost {
  constructor(game, { tree, x, z, perches }) {
    this.game = game;
    this.tree = tree;
    this.x = x;
    this.z = z;
    this.perches = perches; // (in the tree's own space, so they sway with it)
    this.seatPose = 'roost';
    this.seats = perches.map(() => ({ rider: null, face: 1 }));
    tree.updateMatrixWorld(); // (good to go before the first frame's drawn)
  }

  seatPos(i, out) { return this.tree.localToWorld(out.copy(this.perches[i])); }

  /** out along the branch from the trunk (a unit vector, flat) */
  outward(i, out) {
    this.seatPos(i, out);
    const dx = out.x - this.x, dz = out.z - this.z, d = Math.hypot(dx, dz) || 1;
    return out.set(dx / d, 0, dz / d);
  }

  /** it sits crossways on the branch (facing one way or the other) */
  seatHeading(i) {
    this.outward(i, _v);
    return Math.atan2(_v.x, _v.z) + (Math.PI / 2) * this.seats[i].face;
  }

  nearestSeat(p) {
    let best = null;
    this.seats.forEach((s, i) => {
      if (s.rider) return;
      this.seatPos(i, _v);
      const d = Math.hypot(_v.x - p.x, _v.z - p.z);
      if (!best || d < best.d) best = { i, d };
    });
    return best;
  }

  /** a little way out past its spot on the branch: it flaps up and in from there */
  approach(i, from, out) {
    const o = this.outward(i, new THREE.Vector3());
    this.seatPos(i, out);
    return out.set(out.x + o.x * 1.6, 0, out.z + o.z * 1.6);
  }

  rideTime() { return rand(12, 28); }
  canLeave() { return true; }

  /** landing on the branch shakes a leaf or two loose */
  onMount(t, i) {
    this.seats[i].face = Math.random() < 0.5 ? 1 : -1;
    const g = this.game;
    this.seatPos(i, _v);
    for (let k = 0; k < 2; k++) g.leaves.dropFromTree(this.x, this.z, _v.y - this.tree.position.y + 1.5, 'gum');
    g.audio.leaf();
  }

  /** a flutter back down to the ground */
  dismount(t, i) {
    const p = this.seatPos(i, new THREE.Vector3()), o = this.outward(i, new THREE.Vector3());
    const out = rand(1.3, 2.4), side = rand(-1.2, 1.2);
    t.leaveSeat();
    t.pos.copy(p);
    t.hopTo(p.x + o.x * out - o.z * side, p.z + o.z * out + o.x * side, 0.7 + p.y * 0.04, 0.5);
    this.game.audio.peep(t.stage);
  }
}

export class Toys {
  constructor(game) {
    this.game = game;
    this.trampolines = [];
    this.umbrellas = [];
    this.rides = []; // swing sets, hoists, beach chairs
  }

  addTrampoline(x, z) {
    const t = new Trampoline(this.game, x, z);
    this.trampolines.push(t);
    return t;
  }

  addUmbrella(x, z, colA, colB) {
    const u = new Umbrella(this.game, x, z, colA, colB);
    this.umbrellas.push(u);
    return u;
  }

  /** whatever bouncy thing something landing at p has landed on: a trampoline mat or an umbrella canopy */
  bouncerAt(p) {
    return this.trampolineAt(p) ?? this.umbrellas.find((u) => u.onTop(p)) ?? null;
  }

  /** an umbrella canopy that something flying through p has just hit */
  umbrellaAt(p) { return this.umbrellas.find((u) => u.onTop(p)) ?? null; }

  /** the umbrella whose canopy is over the spot (x, z), if any */
  canopyOver(x, z) { return this.umbrellas.find((u) => Math.hypot(x - u.x, z - u.z) < u.r) ?? null; }

  addSwingSet(x, z, rotY = 0) { return this.addRide(new SwingSet(this.game, x, z, rotY)); }
  addHoist(x, z) { return this.addRide(new HillsHoist(this.game, x, z)); }
  addRoost(spec) { return this.addRide(new TreeRoost(this.game, spec)); }
  addRide(r) { this.rides.push(r); return r; }
  removeRide(r) { this.rides = this.rides.filter((x) => x !== r); }

  trampolineAt(p) {
    for (const t of this.trampolines) if (Math.hypot(p.x - t.x, p.z - t.z) < t.matR) return t;
    return null;
  }

  trampolineNear(p, r) {
    for (const t of this.trampolines) if (Math.hypot(p.x - t.x, p.z - t.z) < r) return t;
    return null;
  }

  /**
   * The nearest free seat on any ride within r, as { set, i }. `toysOnly` (for a turkey that's just landed
   * next to one) skips beach chairs, which are loot, and the roosts up the gums, which are for idling in:
   * a turkey thrown at the leaves under a tree is there to rake them
   */
  freeSeatNear(p, r, toysOnly = false) {
    let best = null, bd = r;
    for (const ride of this.rides) {
      if (toysOnly && (ride.haulable || ride.seatPose === 'roost')) continue;
      const s = ride.nearestSeat(p);
      if (s && s.d < bd) { bd = s.d; best = { set: ride, i: s.i }; }
    }
    return best;
  }

  update(dt) {
    for (const t of this.trampolines) {
      t.update(dt);
      // anyone wandering onto the mat gets bounced
      for (const tk of this.game.turkeys.list) {
        if (tk.dead || (tk.state !== S.FOLLOW && tk.state !== S.IDLE && tk.state !== S.GOTO)) continue;
        if (Math.hypot(tk.pos.x - t.x, tk.pos.z - t.z) < t.matR + 0.1) {
          tk.bounceRejoin = tk.state === S.FOLLOW;
          tk.hopTo(tk.pos.x, tk.pos.z, 0.35, 0.7, t.matY);
        }
      }
    }
    for (const u of this.umbrellas) u.update(dt);
    for (const r of this.rides) r.update?.(dt);
  }
}
