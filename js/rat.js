import * as THREE from 'three';
import { Foe } from './foe.js';
import { part, merge, vcMesh, G, limb, rand, damp, TAU } from './util.js';
import { spiralEyes } from './hypno.js';

/*
 * Rats: Hyde Park's after dark lot, out in broad daylight round the bins (and down on the platform at Museum). They
 * hang about in a pack, noses going, and anything that comes near gets a rat darting in at it: it pulls up just
 * short (a little red circle marks where), and bites. A turkey it gets is a goner; you, it nips.
 *
 * But they're small. Throw a turkey on one and it's pinned, squealing and wriggling, going nowhere, till the turkey's
 * done for it (one's plenty). Bitten, they bolt for a bit before they come back for more.
 */
const DEF = {
  name: 'Rat', hp: 10, scale: 1, radius: 0.26, bodyY: 0.16, labelY: 0.55, carcassLabelY: 0.35, dieTime: 0.5,
  aggro: 7, leash: 9, maxLatch: 3, value: 4, weight: 1, carryR: 0.45, slots: 4, palette: 'rubbish',
  speed: 5.2, wander: 1.4, reach: 0.75, wind: 0.42, nip: 7, bolt: [0.8, 1.4], rest: [0.9, 1.6],
};
const FUR = 0x6e655c, FUR2 = 0x857b70, BELLY = 0xa89c8c, PINK = 0xd99a9a;
const _v = new THREE.Vector3();

let GEO = null;
function geos() {
  if (GEO) return GEO;
  const body = [
    part(G.sphere(1, 12, 9), FUR, [0, 0.17, -0.03], [0, 0, 0], [0.13, 0.12, 0.24]),
    part(G.sphere(1, 10, 8), BELLY, [0, 0.13, 0], [0, 0, 0], [0.11, 0.08, 0.2]),
    part(G.sphere(1, 10, 8), FUR2, [0, 0.2, -0.08], [0, 0, 0], [0.1, 0.09, 0.14]), // (its back, humped)
  ];
  const head = [
    part(G.sphere(1, 10, 8), FUR, [0, 0, 0.05], [0, 0, 0], [0.085, 0.08, 0.1]),
    part(G.cone(0.065, 0.16, 8), FUR2, [0, -0.01, 0.17], [Math.PI / 2, 0, 0]),
    part(G.sphere(0.022, 6, 5), PINK, [0, -0.01, 0.25]),
  ];
  for (const s of [-1, 1]) {
    head.push(part(G.sphere(1, 8, 6), PINK, [s * 0.065, 0.075, 0.02], [0, s * 0.4, 0], [0.045, 0.05, 0.015])); // (its ears)
    for (const y of [-0.005, -0.025]) head.push(part(G.box(0.12, 0.003, 0.003), 0xd8d2c8, [s * 0.06, y, 0.21], [0, s * 0.25, 0])); // (whiskers)
  }
  const tail = [];
  for (let i = 0; i < 6; i++) tail.push(limb([0, 0, -i * 0.07], [0, 0, -(i + 1) * 0.07], 0.022 - i * 0.003, 0.019 - i * 0.003, PINK, 5));
  const leg = merge([limb([0, 0, 0], [0, -0.1, 0.02], 0.03, 0.022, FUR, 5), part(G.box(0.04, 0.012, 0.06), PINK, [0, -0.105, 0.035])]);
  GEO = { body: merge(body), head: merge(head), tail: merge(tail), leg };
  return GEO;
}

function ratRig() {
  const g = geos(), root = new THREE.Group(), bodyPivot = new THREE.Group();
  root.add(bodyPivot);
  bodyPivot.add(vcMesh(g.body));
  const head = new THREE.Group();
  head.position.set(0, 0.2, 0.2);
  head.add(vcMesh(g.head));
  spiralEyes(head, [0.052, 0.03, 0.12], [0.75, 0.25, 0.6], 0.024); // (its eyes)
  bodyPivot.add(head);
  const tail = new THREE.Group();
  tail.position.set(0, 0.13, -0.26);
  tail.add(vcMesh(g.tail, { cast: false }));
  bodyPivot.add(tail);
  const legs = [[0.07, 0.1], [-0.07, 0.1], [0.08, -0.12], [-0.08, -0.12]].map(([x, z], i) => {
    const l = new THREE.Group();
    l.position.set(x, 0.1, z);
    l.add(vcMesh(g.leg, { cast: false }));
    l.userData.ph = i === 0 || i === 3 ? 0 : Math.PI;
    bodyPivot.add(l);
    return l;
  });
  return { root, bodyPivot, head, tail, legs };
}

export class Rat extends Foe {
  constructor(game, x, z) {
    super(game, DEF, x, z);
    this.setRig(ratRig());
    this.state = 'sniff';
    this.to = this.home.clone();
    this.wanderT = rand(0, 2);
    this.speedNow = 0;
    this.phase = rand(0, TAU);
    this.cool = rand(0.5, 1.5);
    this.warn = game.fx.warnCircle();
  }

  hits(p) {
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    return dx * dx + dz * dz < 0.5 ** 2 && Math.abs(p.y - this.pos.y - 0.15) < 0.45;
  }

  attachPoint() { return new THREE.Vector3(0, 0.26, -0.02); } // (on its back, pinning it down)

  hitFx(p) { this.game.fx.burst(p, { n: 3, colors: [FUR, FUR2, BELLY], speed: [0.6, 1.4], up: [1, 2], size: [0.03, 0.05], flat: 0.3 }); }

  onLatched() {
    if (this.state === 'pinned') return;
    this.state = 'pinned';
    this.t = 0;
    this.warn.hide();
    this.game.audio.squeak();
  }

  onDeath() {
    this.warn.hide();
    this.game.audio.squeak(true);
  }

  /** scurry towards (x, z), nose first */
  run(x, z, speed, dt) {
    return this.walk(x, z, speed, dt, 0.15, 12);
  }

  think(dt) {
    const g = this.game, d = this.def;
    if (this.latched.length && this.state !== 'pinned') this.onLatched();
    switch (this.state) {
      case 'sniff': {
        // pottering about round home, nose to the ground
        if ((this.wanderT -= dt) <= 0) {
          this.wanderT = rand(1.2, 3);
          this.wanderPoint(0.5, d.wander * 2, this.to);
        }
        this.run(this.to.x, this.to.z, d.speed * 0.25, dt);
        const tg = this.cool <= 0 && this.findTarget();
        if (tg) {
          this.target = tg;
          this.state = 'dart';
          this.t = 0;
          this.engaged = true;
          g.audio.squeak();
        }
        break;
      }
      case 'dart': {
        // straight at it, and pulls up short to bite
        const tg = this.target;
        if (!tg || tg.dead || !tg.grounded || this.t > 4 || Math.hypot(this.home.x - this.pos.x, this.home.z - this.pos.z) > d.leash * 1.6) { this.backOff(); break; }
        const dist = this.run(tg.pos.x, tg.pos.z, d.speed, dt);
        if (dist < d.reach + 0.45) {
          this.state = 'bite';
          this.t = 0;
          this.forward(_v).multiplyScalar(d.reach).add(this.pos);
          this.biteAt = _v.clone();
        }
        break;
      }
      case 'bite': {
        // (up on its back legs as the circle fills, then lunges)
        this.speedNow = damp(this.speedNow, 0, 14, dt);
        this.warn.show(this.biteAt, 0.55, this.t / d.wind, g.time);
        if (this.t >= d.wind) {
          this.warn.hide();
          this.pos.lerp(this.biteAt, 0.5);
          g.audio.snip();
          if (!this.killNear(this.biteAt, 0.55, 1, 'peck')) this.hurtPlayer(this.biteAt, 0.55, d.nip, { knock: 2.5, stun: 0.1 });
          this.state = 'bolt';
          this.t = 0;
          this.boltT = rand(...d.bolt);
          this.forward(_v).multiplyScalar(-4).add(this.pos);
          this.to.set(_v.x + rand(-2, 2), 0, _v.z + rand(-2, 2));
        }
        break;
      }
      case 'bolt':
        // off it goes, before it comes back for another go
        this.run(this.to.x, this.to.z, d.speed * 0.9, dt);
        if (this.t >= this.boltT) this.backOff();
        break;
      case 'pinned':
        // going nowhere, squealing and wriggling under the turkey on it
        this.speedNow = 0;
        this.heading += Math.sin(this.t * 23) * dt * 3;
        if (Math.random() < dt * 2) g.audio.squeak();
        if (!this.latched.length) { this.state = 'bolt'; this.t = 0; this.boltT = 0.6; this.wanderPoint(2, 4, this.to); }
        break;
    }
  }

  /** back home for a breather, then it's sniffing about again */
  backOff() {
    this.warn.hide();
    this.state = 'sniff';
    this.t = 0;
    this.engaged = false;
    this.target = null;
    this.cool = rand(...this.def.rest);
    this.wanderT = 0;
  }

  pose(dt) {
    const r = this.rig, k = Math.min(1, (this.speedNow ?? 0) / 3), time = this.game.time;
    this.phase += dt * (5 + (this.speedNow ?? 0) * 6);
    for (const l of r.legs) l.rotation.x = Math.sin(this.phase + l.userData.ph) * 0.9 * k;
    let rear = 0, sniff = Math.max(0, Math.sin(time * 9 + this.home.x)) * 0.12;
    if (this.state === 'bite') rear = this.t < this.def.wind ? Math.min(1, this.t / 0.2) * 0.45 : -0.2;
    if (this.state === 'pinned') sniff = Math.sin(this.t * 30) * 0.3;
    r.bodyPivot.rotation.set(-rear, 0, this.state === 'pinned' ? Math.sin(this.t * 19) * 0.25 : Math.sin(this.phase) * 0.05 * k);
    r.bodyPivot.position.y = Math.abs(Math.sin(this.phase)) * 0.03 * k;
    r.head.rotation.set(-sniff + rear * 0.5, Math.sin(time * 2.3 + this.home.x) * 0.3 * (1 - k), 0);
    // (the tail: swishing behind it, out straight when it runs)
    r.tail.rotation.set(0.15 - 0.1 * k, Math.sin(time * (3 + 6 * k) + this.home.z) * (0.5 - 0.3 * k), 0);
    if (!this.alive) {
      // (over on its back, feet up)
      const flip = Math.PI * (this.state === 'dying' ? this.roll : 1);
      r.root.rotation.set(0, this.heading, flip);
      r.root.position.set(this.pos.x, this.pos.y + Math.sin(flip / 2) * 0.32, this.pos.z);
      r.tail.rotation.set(-0.4, 0.6, 0);
    } else {
      r.root.position.copy(this.pos);
      r.root.rotation.set(0, this.heading, 0);
    }
  }

  dispose() {
    super.dispose();
    this.warn.dispose();
  }
}
