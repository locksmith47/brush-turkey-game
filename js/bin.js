import * as THREE from 'three';
import { Foe } from './foe.js';
import { LEAF_SPLIT } from './leaves.js';
import { part, merge, vcMesh, G, rand, pick, clamp, dampAngle, TAU } from './util.js';

/*
 * Wheelie bins. Turkeys shove them (or cling on top and rock them) until over they go, lid flapping,
 * spilling the lot: green bins are full of garden clippings, red bins of rubbish, yellow bins of
 * recycling. Turkeys carry all of it off to a mound, where it shows up stuck in the heap.
 */
const LIDS = { green: 0x3f9a45, red: 0xc0392b, yellow: 0xf1c40f };
const CONTENTS = {
  green: { palette: 'garden', shapes: ['leaf'], n: 14 },
  red: { palette: 'rubbish', shapes: ['box', 'can'], n: 10 },
  yellow: { palette: 'recycling', shapes: ['can', 'box'], n: 10 },
};
const W = 0.58, D = 0.7, H = 1.02, EDGE = 0.33; // body size, and how far out the edge it tips over on is
const BODY = 0x2f5a3a, BODY2 = 0x264a30;
const GEO = {};
const _v = new THREE.Vector3();

function binGeo(kind, overflowing) {
  const key = kind + (overflowing ? '+' : '');
  if (GEO[key]) return GEO[key];
  const body = [
    part(G.box(W, H - 0.06, D), BODY, [0, (H - 0.06) / 2 + 0.03, 0]),
    part(G.box(W + 0.04, 0.05, D + 0.04), BODY2, [0, H - 0.05, 0]), // rim
    part(G.cyl(0.03, 0.03, W + 0.1, 8), 0x333333, [0, 0.1, -D / 2 - 0.03], [0, 0, Math.PI / 2]), // axle
    part(G.cyl(0.1, 0.1, 0.06, 12), 0x222222, [W / 2 + 0.03, 0.1, -D / 2 - 0.03], [0, 0, Math.PI / 2]),
    part(G.cyl(0.1, 0.1, 0.06, 12), 0x222222, [-W / 2 - 0.03, 0.1, -D / 2 - 0.03], [0, 0, Math.PI / 2]),
    part(G.cyl(0.025, 0.025, W - 0.1, 6), BODY2, [0, H - 0.1, -D / 2 - 0.07], [0, 0, Math.PI / 2]), // handle
    part(G.box(0.22, 0.13, 0.01), 0xf2f2f2, [0, 0.64, D / 2 + 0.005]), // council sticker
  ];
  if (overflowing) {
    // so full the lid won't shut: an ibis's dream
    for (let i = 0; i < 6; i++) body.push(part(i % 2 ? G.box(0.2, 0.1, 0.16) : G.ico(0.11, 0), pick([0xe8e2d0, 0xd94c3d, 0x4d96ff, 0xffd21f, 0x6b4f3a]), [rand(-0.2, 0.2), H + rand(-0.02, 0.1), rand(-0.22, 0.22)], [rand(0, 3), rand(0, 3), 0]));
  }
  GEO[key] = {
    body: merge(body),
    lid: merge([
      part(G.box(W + 0.06, 0.06, D + 0.07), LIDS[kind], [0, 0.03, (D + 0.07) / 2]), // hinged along its back edge
      part(G.box(0.2, 0.04, 0.06), LIDS[kind], [0, 0.0, D + 0.07]), // grip
    ]),
  };
  return GEO[key];
}

export class Bin extends Foe {
  constructor(game, kind, x, z, facing = rand(0, TAU), overflowing = false) {
    super(game, {
      name: `${kind[0].toUpperCase()}${kind.slice(1)} bin`, hp: 14, scale: 1, radius: 0.42, labelY: 1.35, bodyY: 0.6,
      maxLatch: 4, task: 'push', dieTime: 0.65,
    }, x, z);
    this.kind = kind;
    this.facing = facing;
    this.fall = facing + Math.PI; // which way it'll go over: it gets re-aimed away from whoever's pushing
    this.lidRest = overflowing ? 0.3 : 0;
    this.shoved = 0;
    this.ph = rand(0, TAU);
    const g = binGeo(kind, overflowing);
    const root = new THREE.Group();
    this.tip = new THREE.Group(); // pivots on the bottom edge it's falling over
    this.tip.position.z = EDGE;
    this.body = new THREE.Group();
    this.body.position.z = -EDGE;
    this.body.add(vcMesh(g.body));
    this.lid = new THREE.Group();
    this.lid.position.set(0, H, -D / 2 - 0.035);
    this.lid.add(vcMesh(g.lid));
    this.body.add(this.lid);
    this.tip.add(this.body);
    root.add(this.tip);
    this.setRig({ root, bodyPivot: this.body });
    this.base = this.pos.clone();
  }

  // thrown turkeys land on the lid and cling on, rocking it
  hits(p) {
    const dx = p.x - this.base.x, dz = p.z - this.base.z;
    return this.alive && dx * dx + dz * dz < 0.25 && p.y < this.base.y + H + 0.4 && p.y > this.base.y + 0.25;
  }

  attachPoint(t, frame) {
    const l = frame.worldToLocal(t.pos.clone());
    return new THREE.Vector3(clamp(l.x, -0.16, 0.16), H + 0.06, clamp(l.z, -0.2, 0.2));
  }

  colliderR() { return this.alive || this.state === 'spilt' ? 0.42 : 0; }
  bodyCenter(out) { return out.set(this.base.x, this.base.y + 0.6, this.base.z); }
  hitFx() { this.game.audio.thunk(); }
  onDamage() { this.shoved = 0.3; }

  think(dt) {
    this.shoved = Math.max(0, this.shoved - dt);
    // it'll topple away from everyone leaning on it
    let sx = 0, sz = 0;
    for (const t of this.game.turkeys.list) {
      if (t.foe !== this || t.dead || t.latched) continue;
      sx += this.base.x - t.pos.x;
      sz += this.base.z - t.pos.z;
    }
    if (sx || sz) this.fall = dampAngle(this.fall, Math.atan2(sx, sz), 3, dt);
  }

  onDeath() {
    this.game.audio.clatter();
    this.game.hud.toastOnce('bin', 'Over it goes! Carry whatever spilled out to a mound', 2.5, 60);
  }

  /** hit the ground: out spills the lot, and from now on it's just a bin lying on its side */
  becomeCarcass() {
    const g = this.game, c = CONTENTS[this.kind];
    this.state = 'spilt';
    this.t = 0;
    const fx = Math.sin(this.fall), fz = Math.cos(this.fall);
    this.pos.set(this.base.x + fx * (EDGE + H * 0.45), this.pos.y, this.base.z + fz * (EDGE + H * 0.45));
    const mouth = _v.set(this.base.x + fx * (EDGE + H + 0.1), this.base.y + 0.3, this.base.z + fz * (EDGE + H + 0.1)).clone();
    const p = new THREE.Vector3();
    const n = c.shapes[0] === 'leaf' ? c.n * LEAF_SPLIT : c.n; // (clippings come in handfuls, like leaf litter)
    for (let i = 0; i < n; i++) {
      const a = this.fall + rand(-0.95, 0.95), d = rand(0.2, 2.2);
      p.set(mouth.x + Math.sin(a) * d, 0, mouth.z + Math.cos(a) * d);
      g.world.resolve(p, 0.15, g.mounds.colliders);
      g.leaves.toss(mouth, p.x, p.z, c.palette, pick(c.shapes));
    }
    g.fx.dust(mouth, 10);
    g.fx.burst(mouth, { n: 8, colors: [0x6b4f3a, 0x8a7a5a, 0x5a4a3a], speed: [1, 2.5], up: [1, 2.5], size: [0.03, 0.06], life: [0.4, 0.8] });
    g.audio.land();
  }

  pose() {
    const r = this.rig.root, t = this.game.time;
    r.position.set(this.base.x, this.base.y, this.base.z);
    r.rotation.set(0, this.fall, 0);
    this.body.rotation.y = this.facing - this.fall; // the bin keeps facing the same way whichever way it tips
    let tip = 0, lid = this.lidRest;
    if (this.alive) {
      // rocking on its edge, harder and harder the closer it gets to going over
      const k = 1 - Math.max(0, this.hp) / this.def.hp;
      const shove = Math.max(this.shoved > 0 ? 1 : 0, this.latched.length ? 0.7 : 0);
      tip = Math.abs(Math.sin(t * 10 + this.ph)) * (0.03 + k * 0.22) * shove;
      lid += Math.abs(Math.sin(t * 14 + this.ph)) * 0.2 * shove;
    } else if (this.state === 'dying') {
      tip = (Math.PI / 2) * this.roll * this.roll;
      lid = this.lidRest + 1.7 * this.roll;
    } else {
      // down, with a little bounce as it lands
      tip = Math.PI / 2 - Math.sin(Math.min(1, this.t / 0.3) * Math.PI) * 0.12;
      lid = 1.9;
    }
    this.tip.rotation.x = tip;
    this.lid.rotation.x = -lid;
  }
}
