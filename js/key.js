import * as THREE from 'three';
import { Foe } from './foe.js';
import { part, merge, vcMesh, G, clamp, damp, dampAngle, TAU } from './util.js';

/*
 * A giant golden key. Turkeys haul it (like a carcass) but its destination is the
 * padlocked gate out of its area. Each area's key is bigger than the last.
 */
const GOLD = 0xf2c230, DARK = 0xc8961e;
let GEO = null;
const _t = new THREE.Vector3(), _w = new THREE.Vector3();

function keyGeo() {
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

export class Key extends Foe {
  constructor(game, spec, gate, index) {
    const s = spec.size;
    super(game, {
      name: 'Key', hp: 1, scale: s, radius: 0.8 * s, value: 0, weight: spec.weight, slots: spec.slots,
      carryR: 1.05 * s + 0.2, carcassLabelY: 0.9, icon: '🔑', maxExtra: 14, loot: true,
    }, spec.x, spec.z);
    this.gate = gate;
    this.index = index;
    const root = new THREE.Group();
    const mesh = vcMesh(keyGeo());
    mesh.position.x = -0.25; // centre the key's weight
    root.add(mesh);
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
    this.alive = false;
    this.becomeCarcass();
  }

  get targetable() { return false; }

  /** where the key has to be carried: right up to the padlock, on this side of the gate */
  lockPoint(out) {
    return out.set(this.gate.x, 0, this.gate.z + this.def.carryR * 0.7 + 0.5);
  }

  updateCarcass(dt) {
    const st = this.strength(), d = this.def;
    this.carrying = st >= d.weight;
    if (!this.carrying) return;
    const tp = this.lockPoint(_t);
    const dist = Math.hypot(tp.x - this.pos.x, tp.z - this.pos.z);
    const speed = clamp(1.0 + 0.1 * (st - d.weight), 1.0, 2.4);
    const wp = this.game.world.route(this.pos.x, this.pos.z, tp.x, tp.z, _w) ?? tp; // (in the bush, along the track)
    const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z, step = Math.hypot(dx, dz);
    if (step > 0.01) {
      let ux = dx / step, uz = dz / step;
      const clear = this.clearWay(ux, uz); // round rocks and trees rather than getting stuck on them
      if (clear) { ux = clear.x; uz = clear.z; }
      if (this.pos.z < -249) { // the King Crab's key: don't drag landlubbers through the rock pool
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
    if (this.state !== 'unlock') { super.update(dt); return; }
    // float up to the padlock, slot in, turn... click
    this.t += dt;
    const k = Math.min(1, this.t / 0.9);
    const e = k * k * (3 - 2 * k);
    const lock = this.game.barriers.gates[this.index].lockWorld(new THREE.Vector3());
    const r = this.rig.root;
    r.position.lerpVectors(this.from, lock, e);
    r.position.y += Math.sin(e * Math.PI) * 1.5;
    this.heading = this.fromHeading + (Math.PI / 2 - this.fromHeading) * e; // shaft points into the lock (-z)
    const turn = Math.max(0, Math.min(1, (this.t - 1.0) / 0.3));
    r.rotation.set(turn * Math.PI / 2, this.heading, 0);
    r.scale.setScalar(this.def.scale * (1 - 0.55 * e));
    if (this.t >= 1.35) {
      this.game.barriers.gates[this.index].unlock();
      this.dispose();
    }
    r.updateMatrixWorld(true);
  }

  pose(dt) {
    const r = this.rig.root;
    const bob = this.carrying ? Math.sin(this.game.time * 9) * 0.04 : 0;
    r.position.set(this.pos.x, this.pos.y + 0.12 * this.s + (this.carrying ? 0.25 : 0) + bob, this.pos.z);
    r.rotation.set(0, this.heading, this.carrying ? Math.sin(this.game.time * 6) * 0.03 : 0);
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
