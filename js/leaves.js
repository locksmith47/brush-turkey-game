import * as THREE from 'three';
import { toonMat, rand, pick, TAU } from './util.js';

export const PALETTES = {
  gum: [0x9b6b3a, 0xb8834a, 0x7a5230, 0xc49a5a, 0x8e8a4b, 0xa0522d, 0xd2a15e, 0x9aa05a, 0xc26a35],
  jacaranda: [0x9b7fd4, 0x8a6cc8, 0xb39ae0, 0x7d62b8, 0xa58bdb],
  fig: [0x8fae4a, 0xc2c25a, 0x6f8f3a, 0xd4b24a, 0xa3a04a],
  autumn: [0xd9602b, 0xe8a33d, 0xc0392b, 0xf2c14e, 0xd2691e],
  pine: [0x8a6a40, 0x9a7a4a, 0x6f5a3a, 0xa08850],
  garden: [0x6f9a3a, 0x86b04a, 0x5a7f2e, 0x9a7a4a, 0xa6b85a, 0x7d8f3a], // green bins: prunings and grass clippings
  rubbish: [0xe84a3a, 0xffd21f, 0x3a6ff0, 0xf2f2f2, 0xff8c1a, 0x7bd34f, 0xa0522d], // red bins: chip packets, pizza boxes, cans
  recycling: [0xc9ced3, 0x2f8f4a, 0x8a5a2a, 0xf2f2f2, 0xd9453b, 0x3a6ff0, 0xb5a27a], // yellow bins: cans, bottles, papers, cardboard
};
/** palettes that are junk rather than leaves (drawn as boxes and cans, in the litter and in the mound) */
export const JUNK = new Set(['rubbish', 'recycling']);

/**
 * Leaf litter is laid on thick: every "leaf" of mound-filling worth is really LEAF_SPLIT leaves on the
 * ground, each worth a fraction, so a pile being raked along looks like a pile. (Junk counts whole.)
 */
export const LEAF_SPLIT = 3;
const MAX = { leaf: 3600, box: 160, can: 160 };
const TREE_DROP_CAP = 3000; // trees stop shedding while there's this much litter about
// each tree drops a leaf every so often onto the ground under it, until there's this many lying there: so
// a patch the turkeys have raked bare takes a good few minutes to fill back in
const TREE_LITTER = 30, SHED_EVERY = [9, 15];
const LIFT = { leaf: [0.02, 0.06], box: [0.035, 0.04], can: [0.07, 0.075] }; // how high it lies off the ground
const GEOS = {};

export function litterGeo(shape) {
  if (GEOS[shape]) return GEOS[shape];
  if (shape === 'box') GEOS.box = new THREE.BoxGeometry(0.3, 0.07, 0.22); // a packet, carton or folded paper
  else if (shape === 'can') GEOS.can = new THREE.CylinderGeometry(0.075, 0.075, 0.26, 10).rotateZ(Math.PI / 2); // lying on its side
  else {
    const s = new THREE.Shape();
    s.moveTo(0, -0.3);
    s.quadraticCurveTo(0.2, -0.1, 0.04, 0.32);
    s.quadraticCurveTo(-0.14, 0.04, 0, -0.3);
    GEOS.leaf = new THREE.ShapeGeometry(s, 6).rotateX(-Math.PI / 2);
  }
  return GEOS[shape];
}

const _c = new THREE.Color(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

/*
 * Everything turkeys rake back to their mounds: leaf litter mostly, plus whatever spills out of a
 * knocked-over wheelie bin. Pieces all behave the same; only their looks (and worth) differ.
 * Pieces lying still aren't touched from frame to frame: only ones on the move get redrawn.
 */
export class Leaves {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.pools = {};
    this.meshes = [];
    for (const shape of Object.keys(MAX)) {
      const mesh = new THREE.InstancedMesh(litterGeo(shape), toonMat({ side: THREE.DoubleSide }), MAX[shape]);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      mesh.userData.dirty = true;
      game.scene.add(mesh);
      this.meshes.push(mesh);
      const pool = [];
      for (let i = 0; i < MAX[shape]; i++) {
        const l = {
          i, shape, mesh, state: 'off', pos: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(),
          rx: 0, ry: 0, rz: 0, scale: shape === 'leaf' ? rand(0.8, 1.2) : rand(0.85, 1.15), owner: null,
          t: 0, dur: 1, hop: 0, mound: null, ph: rand(0, TAU), value: 1, dirty: false,
          snubT: 0, // (given up on as stuck: left alone until then)
        };
        pool.push(l);
        this.list.push(l);
        mesh.setMatrixAt(i, ZERO);
        mesh.setColorAt(i, _c.set(pick(PALETTES.gum)));
      }
      mesh.instanceColor.needsUpdate = true;
      this.pools[shape] = pool;
    }

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler(0, 0, 0, 'YXZ');
    this._s = new THREE.Vector3();
    this._v = new THREE.Vector3();
    this.dropTimer = 0;
    this.active = 0;
  }

  alloc(shape = 'leaf') {
    for (const l of this.pools[shape]) if (l.state === 'off') return l;
    return null;
  }

  paint(l, palette) {
    l.palette = palette;
    l.snubT = 0;
    l.value = l.shape === 'leaf' ? 1 / LEAF_SPLIT : 1;
    l.mesh.setColorAt(l.i, _c.set(pick(PALETTES[palette] ?? PALETTES.gum)));
    l.mesh.instanceColor.needsUpdate = true;
  }

  groundY(l, x, z) { return this.game.world.groundHeight(x, z) + rand(...LIFT[l.shape]); }

  /** lay a piece down at (x, z) */
  place(l, x, z) {
    l.state = 'ground';
    l.pos.set(x, this.groundY(l, x, z), z);
    l.rx = rand(-0.15, 0.15); l.rz = rand(-0.15, 0.15);
    l.dirty = true;
  }

  spawn(x, z, palette = 'gum', shape = 'leaf') {
    const l = this.alloc(shape);
    if (!l) return null;
    this.paint(l, palette);
    l.ry = rand(0, TAU);
    l.owner = null;
    this.place(l, x, z);
    return l;
  }

  /** a patch of leaf litter worth n leaves (so LEAF_SPLIT times that many on the ground) */
  spawnCluster(x, z, n, r, palette = 'gum') {
    const w = this.game.world;
    for (let k = 0; k < n * LEAF_SPLIT; k++) {
      const a = rand(0, TAU), d = Math.sqrt(Math.random()) * r;
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (!w.isFree(px, pz, 0.15)) continue;
      this.spawn(px, pz, palette);
    }
  }

  /** fling a piece out (of a tipped-over bin): it arcs from `from` to (x, z) and lies there for the taking */
  toss(from, x, z, palette, shape = 'leaf') {
    const l = this.alloc(shape);
    if (!l) return null;
    this.paint(l, palette);
    l.state = 'tossed';
    l.owner = null;
    l.from.copy(from);
    l.to.set(x, this.groundY(l, x, z), z);
    l.pos.copy(from);
    l.t = 0;
    l.dur = rand(0.35, 0.75);
    l.hop = 0.9;
    return l;
  }

  /** flung backwards by a turkey's foot: it arcs over to (x, z), higher and longer the further it goes (it stays that turkey's) */
  kick(l, x, z) {
    const d = Math.hypot(x - l.pos.x, z - l.pos.z);
    const d1 = Math.min(d, 5), d2 = Math.max(0, d - 5); // (the really big kicks go further more than higher)
    l.state = 'kicked';
    l.from.copy(l.pos);
    l.to.set(x, this.groundY(l, x, z), z);
    l.t = 0;
    l.dur = (0.2 + d1 * 0.12 + d2 * 0.08) * rand(0.9, 1.15);
    l.hop = (0.15 + d1 * 0.2 + d2 * 0.1) * rand(0.7, 1.2) * (l.shape === 'leaf' ? 1 : 0.7); // (leaves go up and flutter; junk's heavier)
  }

  dropFromTree(x, z, h, palette = 'gum') {
    const l = this.alloc();
    if (!l) return;
    const a = rand(0, TAU), d = rand(0.5, 3.2);
    const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    if (!this.game.world.isFree(px, pz, 0.15)) return;
    this.paint(l, palette);
    l.state = 'falling';
    l.pos.set(px, this.game.world.groundHeight(px, pz) + h * rand(0.6, 0.95), pz);
    l.t = 0;
    l.owner = null;
  }

  /** how many leaves are lying (or on their way down) within r of (x, z) */
  lyingNear(x, z, r) {
    let n = 0;
    for (const l of this.pools.leaf) {
      if ((l.state === 'ground' || l.state === 'falling') && (l.pos.x - x) ** 2 + (l.pos.z - z) ** 2 < r * r) n++;
    }
    return n;
  }

  /** nearest piece on the ground nobody has claimed (or given up on lately) */
  nearestFree(pos, maxDist, center = null, centerR = 0) {
    let best = null, bd = maxDist * maxDist;
    const now = this.game.time;
    for (const l of this.list) {
      if (l.state !== 'ground' || l.owner || l.snubT > now) continue;
      const dx = l.pos.x - pos.x, dz = l.pos.z - pos.z, d2 = dx * dx + dz * dz;
      if (d2 >= bd) continue;
      if (center) {
        const cx = l.pos.x - center.x, cz = l.pos.z - center.z;
        if (cx * cx + cz * cz > centerR * centerR) continue;
      }
      bd = d2; best = l;
    }
    return best;
  }

  /** claim `first` and the unclaimed pieces lying round it, up to `worth` in total: a clump to rake */
  gather(first, r, worth, owner) {
    const out = [first];
    let v = first.value;
    first.owner = owner;
    const now = this.game.time;
    for (const l of this.list) {
      if (v >= worth - 1e-6) break;
      if (l === first || l.state !== 'ground' || l.owner || l.snubT > now || v + l.value > worth + 1e-6) continue;
      if ((l.pos.x - first.pos.x) ** 2 + (l.pos.z - first.pos.z) ** 2 > r * r) continue;
      l.owner = owner;
      out.push(l);
      v += l.value;
    }
    return out;
  }

  release(l) { if (l && (l.state === 'ground' || l.state === 'kicked')) l.owner = null; }

  /** one last kick: the piece arcs up onto the mound, which counts it when it lands */
  deliver(l, mound) {
    l.state = 'flying';
    l.owner = null;
    l.from.copy(l.pos);
    mound.randomSurfacePoint(l.to);
    l.t = 0;
    l.dur = rand(0.35, 0.55);
    l.mound = mound;
  }

  update(dt) {
    const { _m, _q, _e, _s, _v } = this;
    const w = this.game.world;
    let active = 0;

    // trees near the player keep shedding the odd leaf, so the bush never quite runs dry
    this.dropTimer -= dt;
    if (this.dropTimer <= 0) {
      this.dropTimer = 0.5;
      const p = this.game.player.pos, now = this.game.time;
      for (const s of w.treeSpots) {
        if (this.active >= TREE_DROP_CAP) break;
        if (s.shedAt > now || Math.hypot(s.x - p.x, s.z - p.z) > 45) continue;
        s.shedAt = now + rand(...SHED_EVERY);
        if (this.lyingNear(s.x, s.z, 4.5) < TREE_LITTER) this.dropFromTree(s.x, s.z, s.h, s.palette);
      }
    }

    for (const l of this.list) {
      const st = l.state;
      if (st === 'off' || st === 'ground') {
        // lying still: only redrawn when something's changed
        if (st === 'ground') active++;
        if (l.dirty) {
          l.dirty = false;
          if (st === 'off') l.mesh.setMatrixAt(l.i, ZERO);
          else {
            _e.set(l.rx, l.ry, l.rz, 'YXZ');
            l.mesh.setMatrixAt(l.i, _m.compose(l.pos, _q.setFromEuler(_e), _s.setScalar(l.scale)));
          }
          l.mesh.userData.dirty = true;
        }
        continue;
      }
      active++;
      if (st === 'falling') {
        l.t += dt;
        l.pos.y -= dt * 1.1;
        l.pos.x += Math.sin(l.t * 2.6 + l.ph) * dt * 1.2;
        l.pos.z += Math.cos(l.t * 2.1 + l.ph) * dt * 0.8;
        l.rx = Math.sin(l.t * 3 + l.ph) * 0.8;
        l.rz = Math.cos(l.t * 2.6 + l.ph) * 0.8;
        l.ry += dt * 1.5;
        const gy = w.groundHeight(l.pos.x, l.pos.z) + 0.03;
        if (l.pos.y <= gy) {
          if (w.isFree(l.pos.x, l.pos.z, 0.1)) {
            l.pos.y = gy; l.state = 'ground'; l.rx = rand(-0.15, 0.15); l.rz = rand(-0.15, 0.15);
          } else l.state = 'off';
        }
      } else if (st === 'tossed' || st === 'kicked') {
        // tumbling out of a bin, or flung back by a raking turkey: quick off the foot, drifting down at the end
        l.t += dt;
        const k = Math.min(1, l.t / l.dur);
        l.pos.lerpVectors(l.from, l.to, 1 - (1 - k) * (1 - k));
        l.pos.y += Math.sin(k * Math.PI) * l.hop;
        l.rx += dt * 8; l.rz += dt * 6; l.ry += dt * 3;
        if (k >= 1) { l.state = 'ground'; l.rx = rand(-0.15, 0.15); l.rz = rand(-0.15, 0.15); }
      } else if (st === 'flying') {
        l.t += dt;
        const k = Math.min(1, l.t / l.dur);
        _v.lerpVectors(l.from, l.to, k);
        _v.y += Math.sin(k * Math.PI) * 1.1;
        l.pos.copy(_v);
        l.rx += dt * 9; l.ry += dt * 5;
        if (k >= 1) {
          l.state = 'off';
          l.mound.addLeaves(l.value, l.pos, l.palette);
          l.mound = null;
        }
      }
      if (l.state === 'off') l.mesh.setMatrixAt(l.i, ZERO);
      else {
        _e.set(l.rx, l.ry, l.rz, 'YXZ');
        l.mesh.setMatrixAt(l.i, _m.compose(l.pos, _q.setFromEuler(_e), _s.setScalar(l.scale)));
      }
      l.mesh.userData.dirty = true;
    }
    this.active = active;
    for (const m of this.meshes) {
      if (!m.userData.dirty) continue;
      m.userData.dirty = false;
      m.instanceMatrix.needsUpdate = true;
    }
  }
}
