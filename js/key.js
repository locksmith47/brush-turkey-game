import * as THREE from 'three';
import { Foe } from './foe.js';
import { part, merge, vcMesh, G, limb, clamp, dampAngle, angleDiff, rand, pick, TAU } from './util.js';
import { BEACH } from './world.js';

/*
 * A giant golden key. Turkeys haul it (like a carcass) but its destination is the
 * padlocked gate out of its area. Each area's key is bigger than the last, and each
 * is come by a different way:
 *  - the bush's is buried: turkeys have to dig it up first (the dig bar fills as they do)
 *  - Big Kev's rake IS the oval's key (a key rake), and he drops it when he's beaten
 *  - the King Crab's lies sunk in his rock pool, at the Shelly Beach end of Manly
 *  - the ferry keys (on a cork float, so they'd float if they went overboard): Captain Gull nicked them, and
 *    he's got them in his beak till he's beaten
 *  - the key to the city: the King Ibis wears it on a chain round his neck, and it flies off when he's felled
 */
const GOLD = 0xf2c230, DARK = 0xc8961e, SOIL = [0x5e3e22, 0x7a5230, 0x8b6238];
const FLY_T = 1.15; // seconds a key takes to fly out of its holder's grip and land
let GEO = null, RAKE = null, HEAP = null;
const _t = new THREE.Vector3(), _w = new THREE.Vector3(), _s = new THREE.Vector3();
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _n = new THREE.Matrix4(), UP = new THREE.Vector3(0, 1, 0);

/** the key, lying flat along +x: bow at -x, bit (teeth along +z) at +x */
export function keyGeo() {
  if (GEO) return GEO;
  const p = [
    part(G.torus(0.42, 0.11, 8, 24), GOLD, [-0.78, 0, 0], [Math.PI / 2, 0, 0]),
    part(G.torus(0.2, 0.05, 6, 16), DARK, [-0.78, 0, 0], [Math.PI / 2, 0, 0]),
    part(G.box(0.62, 0.05, 0.07), DARK, [-0.78, 0, 0], [0, Math.PI / 4, 0]),
    part(G.box(0.62, 0.05, 0.07), DARK, [-0.78, 0, 0], [0, -Math.PI / 4, 0]),
    part(G.cyl(0.15, 0.15, 0.14, 12), GOLD, [-0.3, 0, 0], [0, 0, Math.PI / 2]),
    part(G.cyl(0.13, 0.13, 0.08, 12), DARK, [-0.16, 0, 0], [0, 0, Math.PI / 2]),
    part(G.cyl(0.085, 0.085, 1.5, 10), GOLD, [0.5, 0, 0], [0, 0, Math.PI / 2]),
    part(G.box(0.12, 0.1, 0.46), GOLD, [0.86, 0, 0.23]),
    part(G.box(0.12, 0.1, 0.34), GOLD, [1.06, 0, 0.17]),
    part(G.box(0.14, 0.1, 0.5), GOLD, [1.22, 0, 0.25]),
    part(G.sphere(0.1, 8, 6), GOLD, [1.27, 0, 0]),
  ];
  GEO = merge(p);
  return GEO;
}

/**
 * Big Kev's key rake, built the way he holds it: the handle's the key's shaft (running down -y), with the
 * key's bow on top (he holds it by that) and, at the bottom, a fan of tines cut to different lengths, like a
 * key's teeth
 */
export const RAKE_HEAD = -1.46; // (where the tines fan out from, down the handle)
export function keyRakeGeo() {
  if (RAKE) return RAKE;
  const H = RAKE_HEAD;
  const p = [
    part(G.torus(0.17, 0.045, 8, 22), GOLD, [0, 0.52, 0]),
    part(G.torus(0.085, 0.02, 6, 14), DARK, [0, 0.52, 0]),
    part(G.box(0.25, 0.028, 0.03), DARK, [0, 0.52, 0], [0, 0, Math.PI / 4]),
    part(G.box(0.25, 0.028, 0.03), DARK, [0, 0.52, 0], [0, 0, -Math.PI / 4]),
    part(G.cyl(0.07, 0.07, 0.08, 12), GOLD, [0, 0.31, 0]),
    part(G.cyl(0.058, 0.058, 0.05, 12), DARK, [0, 0.24, 0]),
    part(G.cyl(0.04, 0.04, 0.25 - H, 10), GOLD, [0, (0.25 + H) / 2, 0]),
    part(G.cyl(0.05, 0.065, 0.14, 10), DARK, [0, H - 0.02, 0]),
    part(G.torus(0.3, 0.024, 5, 20, 1.3), DARK, [0, H, 0], [0, 0, -Math.PI / 2 - 0.65]),
  ];
  const CUTS = [0.55, 0.46, 0.55, 0.37, 0.5, 0.55, 0.41, 0.55, 0.47, 0.36, 0.55, 0.5, 0.41, 0.55, 0.46];
  CUTS.forEach((l, i) => {
    const a = (i / 14 - 0.5) * 1.3;
    p.push(limb([0, H, 0], [Math.sin(a) * l, H - Math.cos(a) * l, 0], 0.018, 0.012, GOLD, 4));
  });
  RAKE = merge(p);
  return RAKE;
}

/** the dirt dug up round a buried key (and the hole it leaves) */
function heapGeo() {
  if (HEAP) return HEAP;
  const p = [
    part(G.cyl(0.62, 0.78, 0.1, 16), SOIL[1], [0, 0.03, 0]),
    part(G.cyl(0.3, 0.3, 0.02, 14), 0x2b1a0e, [0, 0.085, 0]),
  ];
  for (let i = 0; i < 13; i++) {
    const a = (i / 13) * TAU + rand(-0.15, 0.15), r = rand(0.5, 0.78);
    p.push(part(G.dodec(rand(0.09, 0.17)), pick(SOIL), [Math.cos(a) * r, 0.06, Math.sin(a) * r], [rand(0, 3), rand(0, 3), 0], [1, 0.7, 1]));
  }
  HEAP = merge(p);
  return HEAP;
}

let FLOAT = null;
/**
 * The ferry keys: the key, with a cork float on a ring through its bow (the way a boat's keys are, in case they
 * go overboard), red and white like a lifebuoy
 */
export function ferryKeyGeo() {
  if (FLOAT) return FLOAT;
  const p = [
    keyGeo().clone(),
    part(G.torus(0.16, 0.03, 6, 16), 0xcfd4d8, [-1.24, 0, 0], [Math.PI / 2, 0, 0]),
    part(G.cyl(0.26, 0.26, 0.62, 14), 0xe8e4d8, [-1.72, 0, 0], [0, 0, Math.PI / 2]),
  ];
  for (const x of [-1.9, -1.72, -1.54]) p.push(part(G.cyl(0.265, 0.265, 0.07, 14), 0xd23a2e, [x, 0, 0], [0, 0, Math.PI / 2]));
  for (const x of [-2.05, -1.39]) p.push(part(G.sphere(0.26, 14, 8), 0xe8e4d8, [x, 0, 0], [0, 0, 0], [0.4, 1, 1]));
  FLOAT = merge(p);
  return FLOAT;
}

/** the key's own mesh, laid out flat along +x and centred on the key's weight */
function keyMesh(model) {
  if (model === 'ferry') {
    const m = vcMesh(ferryKeyGeo());
    m.position.x = 0.1; // (the float's the heavy end)
    return m;
  }
  if (model === 'rake') {
    const m = vcMesh(keyRakeGeo());
    m.rotation.set(Math.PI / 2, 0, Math.PI / 2); // (the handle along +x, the head flat on the ground)
    m.position.x = (0.735 + RAKE_HEAD - 0.55) / 2; // (centred: from the top of the bow to the tips of the tines)
    return m;
  }
  const m = vcMesh(keyGeo());
  m.position.x = -0.25;
  return m;
}

export class Key extends Foe {
  /** `spec`: { x, z, size, weight, slots, heading, buried (hp to dig it up), holder ('keeper' | 'captain' | 'king'), model } */
  constructor(game, spec, gate, index) {
    const s = spec.size, holder = spec.holder ? game.enemies[spec.holder] : null;
    super(game, {
      name: 'Key', hp: spec.buried ?? 1, scale: s, radius: 0.8 * s, value: 0, weight: spec.weight, slots: spec.slots,
      carryR: 1.05 * s + 0.2, labelY: 0.8, carcassLabelY: 0.9, icon: '🔑', maxExtra: 14, loot: true,
      ...(spec.buried ? { task: 'dig', bits: 'soil', dieTime: 0.9 } : {}),
    }, holder ? holder.pos.x : spec.x, holder ? holder.pos.z : spec.z);
    this.gate = gate;
    this.index = index;
    const root = new THREE.Group();
    this.mesh = keyMesh(spec.model);
    root.add(this.mesh);
    root.scale.setScalar(s);
    root.rotation.order = 'YXZ'; // so the key can twist about its own shaft in the lock
    this.setRig({ root });
    this.heading = spec.heading ?? 0.6;

    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 18, 12, 1, true).translate(0, 9, 0),
      new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    );
    game.scene.add(this.beam);
    this.sparkleT = 0;
    if (spec.buried) {
      // in the ground, bow up: turkeys dig round it till it comes loose (the dirt they throw up stays)
      this.base = this.pos.clone();
      this.heap = vcMesh(heapGeo(), { cast: false, receive: true });
      this.heap.position.copy(this.base);
      this.heap.rotation.y = rand(0, TAU);
      game.scene.add(this.heap);
      this.wob = 0;
    } else if (holder) {
      // in Big Kev's hands, or Captain Gull's beak: it's theirs till they're beaten
      holder.key = this;
      this.alive = false;
      this.state = 'held';
      root.visible = false;
      this.beam.visible = false;
    } else {
      this.alive = false;
      this.becomeCarcass();
    }
  }

  get targetable() { return this.alive; } // (only while it's buried, to be dug up)

  bodyCenter(out) { return out.set(this.pos.x, this.pos.y + 0.15, this.pos.z); }
  hitFx(p) { this.game.fx.burst(p, { n: 4, colors: SOIL, speed: [0.8, 2], up: [1.5, 3], size: [0.04, 0.08], life: [0.4, 0.7] }); }
  onDamage() { this.wob = 1; }

  onDeath() {
    const g = this.game;
    g.audio.thunk();
    g.audio.clang();
    g.fx.dirt(this.base, 14, 1.2);
  }

  /** where the key has to be carried: right up to the padlock, on this side of the gate */
  lockPoint(out) {
    const [dx, dz] = this.gate.d, back = this.def.carryR * 0.7 + 0.5;
    return out.set(this.gate.x - dx * back, 0, this.gate.z - dz * back);
  }

  /**
   * Its holder's been beaten: off it flies from where he had it (`from`, the world matrix of the key in
   * his hands or round his neck, in its own shape) to land clear of him, about `dist` away towards `dir`,
   * growing back to its proper size on the way
   */
  release(from, dir, dist) {
    if (this.state !== 'held') return;
    const g = this.game, root = this.rig.root;
    this.mesh.updateMatrix();
    _m.copy(from).multiply(_n.copy(this.mesh.matrix).invert());
    this.flyFrom = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1 };
    _m.decompose(this.flyFrom.p, this.flyFrom.q, _s);
    this.flyFrom.s = _s.x;
    const land = this.landingNear(this.pos.copy(this.flyFrom.p), dir, dist);
    this.pos.set(land.x, g.world.groundHeight(land.x, land.z), land.z);
    this.heading = dir + Math.PI / 2 + rand(-0.4, 0.4);
    this.flyTo = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, this.heading, 0, 'YXZ'));
    this.flyH = 2.2 + Math.hypot(this.pos.x - this.flyFrom.p.x, this.pos.z - this.flyFrom.p.z) * 0.25;
    this.state = 'fly';
    this.t = 0;
    root.visible = true;
    g.audio.clang();
    g.fx.sparkle(this.flyFrom.p, 10, [0xffe066, 0xffffff]);
  }

  /**
   * somewhere clear about `dist` from p (towards `dir` if it can be) that the key can be carried away from: with room
   * all round it for its carriers, if there's anywhere like that (not hard up against a throne, say), or if not,
   * wherever it'll fit
   */
  landingNear(p, dir, dist) {
    const g = this.game, w = g.world, lock = this.lockPoint(_w);
    const clear = (x, z, r) => w.isFree(x, z, r) && !w.waterDepth(x, z) && !g.mounds.blocked(x, z, r)
      && !g.enemies.colliders.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + r)
      && !!w.route(x, z, lock.x, lock.z, _t);
    for (const r of [this.def.carryR + 0.6, this.def.carryR * 0.7]) {
      for (const d of [dist, dist * 0.7, dist * 1.35, dist * 0.45]) {
        for (let i = 0; i < 14; i++) {
          const a = dir + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.45;
          const x = p.x + Math.sin(a) * d, z = p.z + Math.cos(a) * d;
          if (clear(x, z, r)) return _t.set(x, 0, z);
        }
      }
    }
    return _t.set(p.x, 0, p.z);
  }

  becomeCarcass() {
    super.becomeCarcass();
    this.beam.visible = true;
  }

  /** (from a save) dug up, or dropped by whoever had it, and lying at (x, z) ready to be carried */
  restoreAt(x, z, heading) {
    this.alive = false;
    this.hp = 0;
    this.flyFrom = null;
    this.popped = true;
    this.pos.set(x, this.game.world.groundHeight(x, z), z);
    this.heading = heading;
    this.rig.root.visible = true;
    this.rig.root.quaternion.identity();
    this.becomeCarcass();
  }

  updateCarcass(dt) {
    const st = this.strength(), d = this.def;
    this.carrying = st >= d.weight;
    if (!this.carrying) return;
    const tp = this.lockPoint(_t);
    const dist = Math.hypot(tp.x - this.pos.x, tp.z - this.pos.z);
    const speed = clamp(1.0 + 0.1 * (st - d.weight), 1.0, 2.4);
    const wp = this.game.world.route(this.pos.x, this.pos.z, tp.x, tp.z, _w) ?? tp; // (round the fences, or along the bush's track)
    const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z, step = Math.hypot(dx, dz);
    if (step > 0.01) {
      let ux = dx / step, uz = dz / step;
      // (round rocks, trees and fences rather than getting stuck on them, bar the fence it's headed for)
      const clear = dist > d.carryR + 2.5 ? this.clearWay(ux, uz) : null;
      if (clear) { ux = clear.x; uz = clear.z; }
      if (this.game.world.zoneOf(this.pos.x, this.pos.z) === BEACH) { // the King Crab's key: don't drag landlubbers through the rock pool
        const dry = this.dryWay(ux, uz);
        if (dry) { ux = dry.x; uz = dry.z; }
        else if (this.strength(true) < d.weight) return;
      }
      this.pos.x += ux * Math.min(step, speed * dt);
      this.pos.z += uz * Math.min(step, speed * dt);
      this.heading = dampAngle(this.heading, Math.atan2(ux, uz) - Math.PI / 2, 1.5, dt);
    }
    if (dist < 0.6) this.startUnlock();
  }

  startUnlock() {
    this.state = 'unlock';
    this.t = 0;
    for (const t of this.slots) if (t) t.carryDone();
    this.slots.fill(null);
    this.hideLabels();
    this.beam.visible = false;
    this.from = this.pos.clone();
    this.fromHeading = this.heading;
    this.game.audio.leaf();
  }

  update(dt) {
    if (this.state === 'held') return; // (nobody can get at it yet)
    if (this.state === 'fly') { this.updateFly(dt); return; }
    if (this.state !== 'unlock') { super.update(dt); return; }
    // float up to the padlock, slot in, turn... click
    this.t += dt;
    const k = Math.min(1, this.t / 0.9);
    const e = k * k * (3 - 2 * k);
    const lock = this.game.barriers.gates[this.index].lockWorld(new THREE.Vector3());
    const r = this.rig.root;
    r.position.lerpVectors(this.from, lock, e);
    r.position.y += Math.sin(e * Math.PI) * 1.5;
    const [dx, dz] = this.gate.d, into = Math.atan2(-dz, dx); // (the shaft pointing into the lock, the way through the gate)
    this.heading = this.fromHeading + angleDiff(this.fromHeading, into) * e;
    const turn = Math.max(0, Math.min(1, (this.t - 1.0) / 0.3));
    r.rotation.set(turn * Math.PI / 2, this.heading, 0);
    r.scale.setScalar(this.def.scale * (1 - 0.55 * e));
    if (this.t >= 1.35) {
      this.game.barriers.gates[this.index].unlock();
      this.dispose();
    }
    r.updateMatrixWorld(true);
  }

  /** flying out of its holder's grip: up, over (turning as it goes, and growing to full size) and down */
  updateFly(dt) {
    const g = this.game, r = this.rig.root, f = this.flyFrom;
    this.t += dt;
    const k = Math.min(1, this.t / FLY_T), e = k * k * (3 - 2 * k);
    r.position.lerpVectors(f.p, _t.set(this.pos.x, this.pos.y + 0.12 * this.s, this.pos.z), k);
    r.position.y += Math.sin(k * Math.PI) * this.flyH;
    r.quaternion.slerpQuaternions(f.q, this.flyTo, e).premultiply(_q.setFromAxisAngle(UP, (1 - e) * TAU));
    r.scale.setScalar(f.s + (this.def.scale - f.s) * Math.min(1, k * 1.6));
    if (Math.random() < dt * 14) g.fx.sparkle(r.position, 1, [0xffe066, 0xffffff]);
    r.updateMatrixWorld(true);
    if (k < 1) return;
    this.flyFrom = null;
    this.becomeCarcass();
    g.fx.sparkle(this.pos, 12, [0xffe066, 0xffffff]);
    g.shake(0.15);
  }

  pose(dt) {
    const r = this.rig.root, s = this.s;
    if (this.base && (this.alive || this.state === 'dying')) {
      // stuck in the ground bit first, working looser (and more of it showing) as it's dug; then out it pops
      // and flops down across its hole
      this.wob = Math.max(0, this.wob - dt * 3);
      const loose = 1 - Math.max(0, this.hp) / this.def.hp, pop = this.state === 'dying' ? this.roll : 0;
      const tilt = (1.3 - loose * 0.35) * (1 - pop) + Math.sin(this.game.time * 34) * 0.06 * this.wob;
      const inGround = (-0.2 + loose * 0.95) * (1 - pop); // (how far along the shaft the ground comes)
      r.rotation.set(0, this.heading + pop * Math.PI * 0.5, -tilt);
      r.position.copy(this.base).sub(_t.set(inGround, 0, 0).applyEuler(r.rotation).multiplyScalar(s));
      r.position.y += Math.sin(pop * Math.PI) * 1.8 * s + pop * 0.12 * s;
      this.heap.scale.setScalar(0.75 + loose * 0.4);
      this.beam.position.copy(this.base);
      this.beam.material.opacity = 0.12 + Math.sin(this.game.time * 2.5) * 0.05;
      return;
    }
    if (this.base && this.state === 'carcass' && !this.popped) {
      this.popped = true;
      this.heading += Math.PI * 0.5; // (as it came down)
    }
    const bob = this.carrying ? Math.sin(this.game.time * 9) * 0.04 : 0;
    r.position.set(this.pos.x, this.pos.y + 0.12 * s + (this.carrying ? 0.25 : 0) + bob, this.pos.z);
    r.rotation.set(0, this.heading, this.carrying ? Math.sin(this.game.time * 6) * 0.03 : 0);
    r.scale.setScalar(s);
    this.beam.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.beam.material.opacity = 0.12 + Math.sin(this.game.time * 2.5) * 0.05;
    this.sparkleT -= dt;
    if (this.sparkleT <= 0) {
      this.sparkleT = 0.5;
      const p = this.pos.clone();
      p.y += 0.3 * this.s;
      this.game.fx.sparkle(p, 3, [0xffe066, 0xffffff]);
    }
  }

  dispose() {
    super.dispose();
    this.game.scene.remove(this.beam);
  }
}
