import * as THREE from 'three';
import { Foe } from './foe.js';
import { part, merge, vcMesh, G, rand, pick, TAU } from './util.js';

/*
 * Bin bags, dumped out the back of the shops. The ibises have torn most of them open already, and picked
 * them over (those are just scenery: see tornBagGeo); the rest, turkeys can peck open, and carry off the
 * rubbish that spills out to a mound, the same as a bin's.
 */
const PLASTIC = [0x1f2326, 0x272c31, 0x2e343a];
const SPILL = 6;
let GEO = null;

/** a full bag: a lumpy black sack, knotted at the top */
export function bagGeo() {
  const p = [part(G.ico(0.34, 1), pick(PLASTIC), [0, 0.3, 0], [rand(0, 1), rand(0, 3), 0], [1, 0.9, 0.85])];
  for (let i = 0; i < 4; i++) {
    const a = rand(0, TAU);
    p.push(part(G.ico(0.17, 1), pick(PLASTIC), [Math.cos(a) * 0.22, rand(0.18, 0.42), Math.sin(a) * 0.18], [rand(0, 3), rand(0, 3), 0]));
  }
  p.push(part(G.cone(0.1, 0.2, 7), 0x23282c, [0, 0.64, 0], [Math.PI, 0, 0])); // the neck, gathered up
  for (const s of [-1, 1]) p.push(part(G.cone(0.05, 0.16, 5), 0x23282c, [s * 0.07, 0.74, 0], [0, 0, -s * 1.1])); // the knot's ears
  return merge(p);
}

/** a bag that's been torn open: slumped flat, split down one side */
export function tornBagGeo() {
  const p = [
    part(G.ico(0.4, 1), PLASTIC[0], [0, 0.08, 0], [0, 0, 0], [1.05, 0.22, 0.85]),
    part(G.ico(0.2, 1), PLASTIC[1], [-0.18, 0.13, -0.1], [0, 0, 0], [1, 0.6, 1]),
    part(G.cone(0.09, 0.18, 6), 0x23282c, [-0.34, 0.1, -0.18], [0, 0, 1.3]),
    part(new THREE.CircleGeometry(0.2, 10).rotateX(-Math.PI / 2), 0x0d0f10, [0.16, 0.165, 0.1], [0, 0, 0], [1.3, 1, 0.7]), // the split
  ];
  // (tatters of plastic round it)
  for (let i = 0; i < 4; i++) {
    const a = rand(0, TAU), d = rand(0.35, 0.6);
    p.push(part(G.box(rand(0.14, 0.26), 0.01, rand(0.08, 0.16)), pick(PLASTIC), [Math.cos(a) * d, 0.02, Math.sin(a) * d], [0, rand(0, TAU), 0]));
  }
  return merge(p);
}

export class BinBag extends Foe {
  constructor(game, x, z) {
    super(game, { name: 'Bin bag', hp: 5, scale: 1, radius: 0.34, labelY: 0.95, bodyY: 0.3, maxLatch: 3, dieTime: 0.35 }, x, z);
    GEO ??= { full: bagGeo(), torn: tornBagGeo() };
    const root = new THREE.Group();
    this.body = new THREE.Group();
    this.full = vcMesh(GEO.full);
    this.torn = vcMesh(GEO.torn, { cast: false, receive: true });
    this.torn.visible = false;
    this.body.add(this.full, this.torn);
    root.add(this.body);
    this.setRig({ root, bodyPivot: this.body });
    this.heading = rand(0, TAU);
  }

  // thrown turkeys land on it and cling on, pecking
  hits(p) {
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    return this.alive && dx * dx + dz * dz < 0.2 && p.y < this.pos.y + 0.9;
  }

  attachPoint(t, frame) {
    const l = frame.worldToLocal(t.pos.clone());
    return new THREE.Vector3(Math.max(-0.12, Math.min(0.12, l.x)), 0.62, Math.max(-0.12, Math.min(0.12, l.z)));
  }

  colliderR() { return this.alive ? this.def.radius : 0; }
  get chore() { return true; } // (only pecked open, not shoved or dug: but it's no more of a fight than a bin)
  hitFx(p) { this.game.fx.burst(p, { n: 3, colors: PLASTIC, speed: [0.6, 1.6], up: [1, 2.2], size: [0.03, 0.06], life: [0.3, 0.6] }); }

  onDeath() {
    this.game.audio.rip();
    this.game.hud.toastOnce('bag', 'Torn open! Carry the rubbish back to a mound', 2.5, 60);
  }

  /** split open: out spills the rubbish, and it's left lying flat (not in anyone's way now) */
  becomeCarcass() {
    const g = this.game, from = this.pos.clone().setY(this.pos.y + 0.35), p = new THREE.Vector3();
    this.state = 'torn';
    this.t = 0;
    this.full.visible = false;
    this.torn.visible = true;
    for (let i = 0; i < (g.loading ? 0 : SPILL); i++) { // (a save has what spilled out with its litter)
      const a = rand(0, TAU), d = rand(0.4, 1.6);
      p.set(this.pos.x + Math.cos(a) * d, 0, this.pos.z + Math.sin(a) * d);
      g.world.resolve(p, 0.15, g.mounds.colliders);
      g.leaves.toss(from, p.x, p.z, 'rubbish', pick(['box', 'can']));
    }
    g.fx.burst(from, { n: 10, colors: PLASTIC, speed: [1, 2.5], up: [1, 2.5], size: [0.03, 0.08], life: [0.4, 0.8] });
    g.audio.land();
  }

  pose() {
    const r = this.rig.root, b = this.body;
    r.position.copy(this.pos);
    r.rotation.set(0, this.heading, 0);
    if (this.alive) {
      // (it wobbles as it's pecked at, and slumps as it gets torn)
      const k = 1 - Math.max(0, this.hp) / this.def.hp;
      b.rotation.z = Math.sin(this.t * 30) * 0.12 * this.flinch;
      b.scale.set(1 + k * 0.1, 1 - k * 0.15, 1 + k * 0.1);
    } else if (this.state === 'dying') {
      b.rotation.z = Math.sin(this.t * 40) * 0.15;
      b.scale.set(1 + this.roll * 0.2, 1 - this.roll * 0.5, 1 + this.roll * 0.2);
    } else {
      b.rotation.z = 0;
      b.scale.setScalar(1);
    }
  }
}
