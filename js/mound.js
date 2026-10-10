import * as THREE from 'three';
import { vcMat, vcMesh, toonMat, part, merge, G, rand, pick, TAU, clamp, smoothstep, hash, noise, labelFade, Dial } from './util.js';
import { PALETTES, JUNK, LEAF_SPLIT, litterGeo } from './leaves.js';
import { flagMesh } from './items.js';
import { stumpsMesh, kitTrophy } from './cricket.js';
import { FERRY } from './world.js';
import { cap } from './padmap.js';

// the heap: how finely it's made (round it, and out from the middle to its foot), how tall it stands (of its
// radius), how far out the rim of the caldera on top is (of the way to its foot) and how deep that is (of its
// height), how lumpy it is (of its height), and how far its foot wanders in and out (of its radius)
const SEGS = 40, RINGS = 16;
const TALL = 0.5, RIM = 0.4, DIP = 0.2, LUMPS = 0.1, WOBBLE = 0.14;
// the patch of bare ground round it (they rake it clean): rings of it from under its foot out to where it's
// faded into the grass (how far out each is, of its radius, and how much of it shows)
const SKIRT_KS = [0.85, 1.08, 1.2, 1.32], SKIRT_A = [1, 0.95, 0.45, 0];
// what it's made of: leaf litter, with paler, redder and olive patches of leaves; darker round its foot and
// darkest down in the caldera, where it's been dug over (it's damp down there, and steaming)
const LITTER = { base: 0x8a6238, pale: 0xb08a55, red: 0xa8683a, olive: 0x7a7040, foot: 0x6e4a2b, pit: 0x4e3220 };
const SANDY = { base: 0xdcc38a, pale: 0xe8d4a0, red: 0xd9b97c, olive: 0xcdb47a, foot: 0xd2b87e, pit: 0xb39c6a }; // (a beach mound: damp sand, damper in the pit)
const LILAC = [0x9a88b8, 0x85749c]; // fallen jacaranda flowers, in patches
// ...and all over it, and spilling off it round its foot, a litter of old leaves gone dull: this many to a square
// metre of it (up to so many), in these colours
const DUFF = { n: 22, max: 600, cols: [0x7a5230, 0x8e6a3e, 0x9b7446, 0x6f5a36, 0xa0703f, 0x857a4a, 0x5f4428] };
const TWIGS = { n: 1.2, max: 40, cols: [0x6b5a48, 0x7d6a55, 0x5a4a3a, 0x8a7a66] }; // (and a few sticks)
const LEAF_COLS = [0x9b6b3a, 0xb8834a, 0xc49a5a, 0x8e8a4b, 0xa0522d, 0xd2a15e];
const DECALS = 90;
export const BUILD_CREW = 10; // turkeys it takes to scratch a new mound into existence
const CREW_SLOTS = 16; // spots round a mound being built (extra helpers make it go faster)
const BUILD_WORK = 60; // turkey-seconds of scratching it takes (ten turkeys: six seconds)
// leaves' worth it takes to fill a mound and hatch a batch of chicks: more for the big home mound, and
// a bit more again after every hatching (up to a point)
const HATCH_AT = { home: 12, other: 9, more: 3, max: 24 };
// the padded mound's kit (see padUp), in sets of it (a set pads up one turkey: helmet and leg guards): how many it'll
// hold, how many it starts with (a quarter full), and how much cricket gear brought in makes a set (see cricket.js)
const GEAR = { max: 12, start: 3, set: 3 };
const KIT_SHOWN = 8; // (pieces of it stuck in the top when it's full: fewer as it runs low, and none when it's out)
const KIT_LOOK = ['helmet', 'pads', 'bat', 'gloves', 'cap', 'stumps']; // (what's stuck in it: what was brought in, or else these in turn)
const _c = new THREE.Color(), _v = new THREE.Vector3(), _p = new THREE.Vector3(), _wp = new THREE.Vector3(), _n = new THREE.Vector3();

/*
 * One kind of thing stuck in a mound's surface (leaves, beach loot, rubbish): an InstancedMesh spread over the heap,
 * from down in the caldera out to `reach` of the way down its sides (past 1: out onto the ground round it)
 */
class DecalSet {
  constructor(m, geo, max, lift = 0, reach = 0.9, size = [0.9, 1.4], from = 0) {
    this.m = m;
    this.mesh = new THREE.InstancedMesh(geo, toonMat({ side: THREE.DoubleSide }), max);
    this.mesh.count = 0;
    this.mesh.setColorAt(0, _c.set(0xffffff));
    this.max = max;
    this.lift = lift; // chunky things sit proud of the surface
    this.reach = reach;
    this.from = from; // (and none in closer than this)
    this.size = size;
    this.spots = [];
    this.cursor = 0;
    m.game.scene.add(this.mesh);
  }

  add(color) {
    const i = this.cursor % this.max;
    this.mesh.setColorAt(i, _c.set(color));
    this.mesh.instanceColor.needsUpdate = true;
    const a = rand(0, TAU), d = Math.sqrt(rand(this.from ** 2, this.reach ** 2)) * this.m.outline(a);
    // (each a hair off the others, so where they overlap one's always on top)
    this.spots[i] = { ...this.m.spot(Math.cos(a) * d, Math.sin(a) * d), lift: this.lift + rand(0.02, 0.045), ry: rand(0, TAU), s: rand(...this.size) };
    this.cursor++;
    this.mesh.count = Math.min(this.max, this.cursor);
  }

  /** stick them all to the mound's surface as it stands, lying flat on it */
  layout() {
    const mat = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const n = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), q2 = new THREE.Quaternion();
    for (let i = 0; i < this.mesh.count; i++) {
      const d = this.spots[i];
      this.m.lie(d, p, n);
      p.addScaledVector(n, d.lift);
      q.setFromUnitVectors(up, n);
      q2.setFromEuler(e.set(0, d.ry, 0));
      q.multiply(q2);
      s.setScalar(d.s);
      this.mesh.setMatrixAt(i, mat.compose(p, q, s));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** how high the heap stands k of the way out from its middle to its foot (0..1 of its height): down in the caldera, up over the rim, and down its sides, flaring out onto the ground */
function profile(k) {
  if (k < RIM) return 1 - DIP * (1 - smoothstep(0, RIM, k));
  return 1 - smoothstep(RIM, 1, k);
}

/** the triangles of a grid of rings round a middle vertex (vertex 0), `segs` to a ring, facing up */
function ringIndex(rings, segs, middle = true) {
  const idx = [], v = (j, i) => (middle ? 1 : 0) + j * segs + (i % segs);
  for (let i = 0; i < segs; i++) {
    if (middle) idx.push(0, v(0, i + 1), v(0, i));
    for (let j = 0; j < rings - 1; j++) idx.push(v(j, i), v(j, i + 1), v(j + 1, i), v(j, i + 1), v(j + 1, i + 1), v(j + 1, i));
  }
  return idx;
}

let LEAF = null, TWIG = null, BIT = null, BROLLY = null;
const SAND = [0xecd9a4, 0xe2cc92, 0xf0dca8, 0xd8c286, 0xe6d09a];
const LOOT = [0xe84a8a, 0x1fb5c9, 0xffd21f, 0xff6b35, 0x7bd34f, 0xffffff, 0x3a6ff0];

export class Mound {
  constructor(game, x, z, home = false, kind = 'leaf', building = false) {
    this.game = game;
    this.home = home;
    this.kind = kind; // 'leaf' mounds hatch bush turkeys; 'beach' mounds (built from stolen beach gear) hatch beach turkeys
    this.beach = kind === 'beach';
    // a new mound starts as a patch of ground that a crew of turkeys has to scratch up into a heap
    this.building = building;
    this.buildK = building ? 0 : 1;
    this.crew = new Array(CREW_SLOTS).fill(null);
    this.scratchers = 0;
    this.pos = new THREE.Vector3(x, game.world.groundHeight(x, z), z);
    this.total = 0;
    this.fill = 0;
    this.threshold = home ? HATCH_AT.home : HATCH_AT.other;
    this.hatches = 0;
    this.baseR = home ? 1.7 : 1.1;
    this.r = this.baseR;
    this.h = this.r * TALL;
    this.state = 'idle';
    this.stateT = 0;
    this.bump = 0;
    this.toLaunch = 0;
    this.launchT = 0;
    this.steamT = 0;
    this.purple = 0; // jacaranda flowers delivered
    this.purpleK = 0; // how purple the mound currently looks (creeps towards the target)
    this.shownK = 0;
    this.converts = []; // turkeys that dived in ({ stage, hen, gear }), waiting to pop back out
    this.convertT = 0;
    this.trophies = []; // lifesaving flags (and stumps, and bits of cricket kit) planted in it
    this.junkN = 0; // (how much rubbish is sticking out of it)
    this.padded = false; // the padded mound: out of it they come in cricket kit, while it's got any (see padUp)
    this.gear = 0; // (sets of it)

    if (!LEAF) {
      const s = new THREE.Shape();
      s.moveTo(0, -0.26);
      s.quadraticCurveTo(0.1, -0.06, 0.02, 0.28);
      s.quadraticCurveTo(-0.07, 0.02, 0, -0.26);
      LEAF = new THREE.ShapeGeometry(s, 4);
      LEAF.rotateX(-Math.PI / 2);
    }

    this.group = new THREE.Group();
    this.group.position.copy(this.pos);
    // every mound's heap is a shape of its own, a bit lumpier here and further out there (the same every time for
    // the same spot), and each gets its own copy so it can slowly change colour
    this.seed = hash(Math.round(x * 8), Math.round(z * 8)) * 97;
    this.domeGeo = this.heapGeometry();
    this.dome = new THREE.Mesh(this.domeGeo, vcMat());
    this.dome.castShadow = true;
    this.dome.receiveShadow = true;
    this.skirtBase = new THREE.Color(this.beach ? 0xd8c286 : 0x9a7a50);
    this.skirtPurple = new THREE.Color(0x6e5a78);
    this.skirt = this.skirtMesh();
    this.laidK = 0;
    this.kit = new THREE.Group(); // (what's planted in it: it heaves and shakes along with the heap)
    this.group.add(this.dome, this.kit);
    game.scene.add(this.group, this.skirt);

    BIT ??= new THREE.BoxGeometry(0.3, 0.12, 0.22);
    this.decals = new DecalSet(this, this.beach ? BIT : LEAF, DECALS, 0.012);
    this.duff = this.beach ? null : new DecalSet(this, LEAF, DUFF.max, 0, 1.2, [0.6, 1.05], RIM * 0.6); // (the pit's been dug over)
    TWIG ??= new THREE.CylinderGeometry(0.018, 0.026, 0.8, 5).rotateZ(Math.PI / 2);
    this.twigs = this.beach ? null : new DecalSet(this, TWIG, TWIGS.max, 0.01, 1.05, [0.7, 1.3], RIM * 0.8);
    this.junk = null; // boxes and cans poking out, once rubbish or recycling has been delivered
    if (this.beach) {
      // a little beach umbrella planted on top
      BROLLY ??= merge([
        part(G.cyl(0.03, 0.03, 1.3, 6), 0xdddddd, [0, 0.65, 0]),
        ...Array.from({ length: 8 }, (_, i) => part(new THREE.ConeGeometry(0.8, 0.35, 3, 1, true, (i / 8) * TAU, TAU / 8), i % 2 ? 0xe84a8a : 0xffffff, [0, 1.35, 0])),
      ]);
      this.brolly = vcMesh(BROLLY);
      this.brolly.rotation.z = 0.15;
      this.kit.add(this.brolly);
    }
    for (let i = 0; i < (home ? 30 : 8); i++) this.decals.add(pick(this.beach ? LOOT : LEAF_COLS));

    this.dial = new Dial('', 'big');
    this.resize();
    this.applyBuild();
    this.refreshLabel();
  }

  resize() {
    this.r = clamp(this.baseR + Math.sqrt(this.total) * 0.13, this.baseR, 3.6);
    this.h = this.r * TALL;
    this.dome.scale.set(this.r, this.h, this.r);
    this.lay();
    if (this.brolly) this.brolly.position.set(this.r * 0.15, this.surfaceY(this.r * 0.15, 0) - this.pos.y - 0.1, 0);
    this.placeTrophies();
    this.layoutDecals();
  }

  /* ---------------------------------------------------------------- the heap */
  /** how far out its foot is at angle a round it (of its radius: it's not quite round) */
  outline(a) { return 1 + WOBBLE * noise(Math.cos(a) * 1.2 + this.seed, Math.sin(a) * 1.2 - this.seed); }

  /** how high it stands (0..1 of its height) at (x, z) from its middle, in radiuses, as if it were on flat ground */
  shapeAt(x, z) {
    const k = Math.hypot(x, z) / this.outline(Math.atan2(z, x));
    if (k >= 1) return 0;
    return Math.max(0, profile(k) + LUMPS * noise(x * 2.4 - this.seed, z * 2.4 + this.seed) * (1 - smoothstep(0.5, 1, k)));
  }

  /** how high its surface is (world y) at (dx, dz) metres from its middle (just the ground, past its foot) */
  surfaceY(dx, dz) {
    const y = this.shapeAt(dx / this.r, dz / this.r), g = this.game.world.groundHeight(this.pos.x + dx, this.pos.z + dz);
    return g + y * (this.pos.y + this.h - g); // (its foot on the ground as it lies, its top where it stands: see lay)
  }

  /** a spot on it, (x, z) from its middle in radiuses: how high it stands there, and how steeply (as if on flat ground) */
  spot(x, z) {
    const e = 0.02, y = (dx, dz) => this.shapeAt(x + dx, z + dz);
    return { x, z, y: y(0, 0), gx: (y(e, 0) - y(-e, 0)) / (2 * e), gz: (y(0, e) - y(0, -e)) / (2 * e) };
  }

  /** where spot s (see spot) is on its surface as it stands now, into out, and which way's up there, into n */
  lie(s, out, n) {
    const w = this.game.world, x = this.pos.x + s.x * this.r, z = this.pos.z + s.z * this.r, e = 0.2;
    const g = w.groundHeight(x, z), up = this.pos.y + this.h - g; // (see surfaceY)
    const gx = (w.groundHeight(x + e, z) - w.groundHeight(x - e, z)) / (2 * e), gz = (w.groundHeight(x, z + e) - w.groundHeight(x, z - e)) / (2 * e);
    out.set(x, g + s.y * up, z);
    n.set(-(gx * (1 - s.y) + (up * s.gx) / this.r), 1, -(gz * (1 - s.y) + (up * s.gz) / this.r)).normalize();
    return out;
  }

  /** the point on its surface at angle a round it, k of the way out to its foot (and which way's up there, into n) */
  surface(a, k, out, n = _n) {
    const d = k * this.outline(a);
    return this.lie(this.spot(Math.cos(a) * d, Math.sin(a) * d), out, n);
  }

  /**
   * The heap: rings round its middle out to its foot, a unit high and a unit out (scaled up to size), made of
   * leaf litter (or sand) in patches, darker round its foot and down in the caldera
   */
  heapGeometry() {
    const n = 1 + RINGS * SEGS, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), s = this.seed;
    const P = this.beach ? SANDY : LITTER, c = new THREE.Color(), t = new THREE.Color();
    this.y0 = new Float32Array(n); // (how high each bit of it stands, on flat ground)
    this.purpleCols = new Float32Array(n * 3);
    this.th = new Float32Array(n); // (how purple it has to be going for each bit of it to turn: see recolor)
    const spread = new Float32Array(n);
    for (let v = 0; v < n; v++) {
      const j = v ? Math.floor((v - 1) / SEGS) + 1 : 0, a = (((v - 1) % SEGS) / SEGS) * TAU, k = j / RINGS;
      const w = this.outline(a), x = Math.cos(a) * k * w, z = Math.sin(a) * k * w;
      this.y0[v] = this.shapeAt(x, z);
      pos.set([x, this.y0[v], z], v * 3);
      c.set(P.base)
        .lerp(t.set(P.pale), smoothstep(-0.1, 0.5, noise(x * 3 + s, z * 3)) * 0.7)
        .lerp(t.set(P.red), smoothstep(0, 0.6, noise(x * 2.5, z * 2.5 - s)) * 0.7)
        .lerp(t.set(P.olive), smoothstep(0.1, 0.7, noise(x * 3.5 - s, z * 3.5 + s)) * 0.6)
        .lerp(t.set(P.foot), smoothstep(0.55, 1, k) * 0.7)
        .lerp(t.set(P.pit), (1 - smoothstep(RIM * 0.4, RIM * 0.95, k)) * 0.85)
        .multiplyScalar(rand(0.95, 1.04)); // (every bit of it a little different)
      col.set([c.r, c.g, c.b], v * 3);
      // (fallen jacaranda flowers creep across it in patches)
      t.set(LILAC[0]).lerp(_c.set(LILAC[1]), noise(x * 4 - s, z * 4) * 0.5 + 0.5).lerp(c, 0.3);
      this.purpleCols.set([t.r, t.g, t.b], v * 3);
      spread[v] = noise(x * 2 + s, z * 2 - s);
    }
    [...spread.keys()].sort((p, q) => spread[p] - spread[q]).forEach((v, i) => { this.th[v] = i / n; });
    this.baseCols = col.slice();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(ringIndex(RINGS, SEGS));
    return g;
  }

  /** the scratched-over ground round its foot, from under it out to where it fades into the grass (or sand): see lay */
  skirtMesh() {
    const n = SKIRT_KS.length * SEGS, col = new Float32Array(n * 4).fill(1);
    for (let v = 0; v < n; v++) col[v * 4 + 3] = SKIRT_A[Math.floor(v / SEGS)];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 4));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setIndex(ringIndex(SKIRT_KS.length, SEGS, false));
    const m = new THREE.Mesh(g, toonMat({
      color: this.skirtBase, vertexColors: true, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
    }));
    m.position.copy(this.pos);
    m.receiveShadow = true;
    m.renderOrder = -1; // (under anything else see-through lying on the ground: warning circles, say)
    return m;
  }

  /**
   * Sit it on the ground as the ground lies (the bush is bumpy): its foot and the skirt round it follow the ground
   * and its top stays where it is. (While it's being built it's smaller, and flatter: see applyBuild)
   */
  lay() {
    const w = this.game.world, s = this.group.scale.x, r = this.r * s, h = this.h * s * s, px = this.pos.x, pz = this.pos.z;
    const P = this.domeGeo.attributes.position;
    for (let v = 0; v < P.count; v++) {
      const y = this.y0[v], g = w.groundHeight(px + P.getX(v) * r, pz + P.getZ(v) * r) - this.pos.y;
      P.setY(v, y + (g / h) * (1 - y));
    }
    P.needsUpdate = true;
    this.domeGeo.computeVertexNormals();
    // (and the skirt, a little way off the ground)
    const S = this.skirt.geometry.attributes.position, N = this.skirt.geometry.attributes.normal, e = 0.3;
    for (let v = 0; v < S.count; v++) {
      const k = SKIRT_KS[Math.floor(v / SEGS)], a = ((v % SEGS) / SEGS) * TAU;
      const d = k * this.outline(a) * (1 + 0.12 * (k - 1) * noise(Math.cos(a) * 2 + this.seed, Math.sin(a) * 2)) * r;
      const x = Math.cos(a) * d, z = Math.sin(a) * d, gx = px + x, gz = pz + z;
      S.setXYZ(v, x, w.groundHeight(gx, gz) - this.pos.y + 0.01, z);
      _v.set(w.groundHeight(gx - e, gz) - w.groundHeight(gx + e, gz), 2 * e, w.groundHeight(gx, gz - e) - w.groundHeight(gx, gz + e)).normalize();
      N.setXYZ(v, _v.x, _v.y, _v.z);
    }
    S.needsUpdate = N.needsUpdate = true;
    this.skirt.geometry.computeBoundingSphere();
    this.domeGeo.computeBoundingSphere();
    this.laidK = s;
  }

  /* ---------------------------------------------------------------- scratching a new mound into existence */
  /** how big it looks while it's being built: a scrape in the ground growing into a heap */
  applyBuild() {
    const k = this.building ? 0.1 + 0.9 * Math.sqrt(this.buildK) : 1;
    this.group.scale.set(k, k * k, k);
    if (k !== this.laidK && (k === 1 || Math.abs(k - this.laidK) > 0.02)) this.lay(); // (every so often, as it grows)
    const done = !this.building;
    this.decals.mesh.visible = done;
    if (this.duff) this.duff.mesh.visible = this.twigs.mesh.visible = done;
    if (this.junk) this.junk.box.mesh.visible = this.junk.can.mesh.visible = done;
  }

  /** where builder i stands: in a ring round the site, facing out (they rake the dirt backwards onto it) */
  crewPos(i, out) {
    const a = (i / CREW_SLOTS) * TAU, r = this.baseR + 0.9;
    return out.set(this.pos.x + Math.cos(a) * r, 0, this.pos.z + Math.sin(a) * r);
  }

  /** a turkey signs up to help build; returns its spot in the ring, or -1 if there's no room */
  joinCrew(t) {
    if (!this.building) return -1;
    let best = -1, bd = Infinity;
    for (let i = 0; i < CREW_SLOTS; i++) {
      const c = this.crew[i];
      if (c && c !== t && c.site === this) continue;
      this.crewPos(i, _v);
      const d = Math.hypot(_v.x - t.pos.x, _v.z - t.pos.z);
      if (d < bd) { bd = d; best = i; }
    }
    if (best >= 0) this.crew[best] = t;
    return best;
  }

  leaveCrew(t) {
    const i = this.crew.indexOf(t);
    if (i >= 0) this.crew[i] = null;
  }

  hasCrewRoom() { return this.building && this.crew.some((c) => !c || c.site !== this); }

  updateBuild(dt) {
    // it only grows while at least a full crew is actually at it, scratching
    let n = 0;
    for (const t of this.crew) if (t && t.site === this && t.scratching) n++;
    if (n !== this.scratchers) { this.scratchers = n; this.refreshLabel(); }
    if (n >= BUILD_CREW) {
      const before = this.buildK;
      this.buildK = Math.min(1, this.buildK + (dt * n) / BUILD_WORK);
      if (Math.floor(before * 20) !== Math.floor(this.buildK * 20)) { this.refreshLabel(); this.game.audio.mound(); }
    }
    this.applyBuild();
    if (this.buildK >= 1) this.finishBuild();
  }

  finishBuild() {
    const g = this.game;
    this.building = false;
    this.buildK = 1;
    this.applyBuild();
    for (const t of this.crew) if (t && t.site === this) t.buildDone();
    this.crew.fill(null);
    this.bump = 1;
    const top = this.pos.clone();
    top.y += this.h;
    g.fx.dirt(top, 26, 1.2);
    g.fx.ring(this.pos, 0xffd21f, this.r * 2.4, 0.6);
    g.audio.build();
    this.refreshLabel();
  }

  /**
   * A mound that's got a bit in it already when the game starts: `n` worth of leaves (or whatever) from
   * `palette`, and `gear` (see addTrophy) stuck in the top
   */
  startWith(n, palette, gear = []) {
    this.total = this.fill = n;
    for (let i = 0; i < n; i++) this.addDecal(palette);
    for (const k of gear) this.addTrophy(k);
    this.resize();
    this.refreshLabel();
    return this;
  }

  /** something planted in the mound at a jaunty angle, for all to see: a stolen lifesaving flag, a set of stumps, a cricket bat... */
  addTrophy(kind = 'flag') {
    const f = kind === 'stumps' ? stumpsMesh() : kind === 'flag' ? flagMesh() : kitTrophy(kind);
    f.group.scale.setScalar(0.8);
    this.kit.add(f.group);
    // spread them round the rim of the caldera, leaning outwards
    const a = this.trophies.length * 2.4 + rand(-0.3, 0.3);
    this.trophies.push({ ...f, kind, a, k: rand(0.3, 0.5), lean: rand(0.18, 0.3), spin: f.spin ?? rand(0, TAU), ph: rand(0, TAU) });
    this.placeTrophies();
  }

  /** pull out the last thing planted in it (into thin air, with a puff of dirt) */
  dropTrophy() {
    const t = this.trophies.pop();
    if (!t) return;
    this.kit.remove(t.group);
    t.group.getWorldPosition(_p);
    this.game.fx.dirt(_p, 6, 0.6);
  }

  /* ---------------------------------------------------------------- the padded mound */
  /**
   * Make it the padded mound, with `gear` sets of cricket kit in it (see GEAR): while it's got any, everything that
   * comes out of it, hatched or thrown in, comes out padded up, a set to each, and the kit stuck in its top goes as it does
   */
  padUp(gear = GEAR.start) {
    this.padded = true;
    this.gear = gear;
    this.dial.also('kit');
    this.showKit();
    this.refreshLabel();
    return this;
  }

  /** a bit of cricket kit's been brought in (`kind`, worth `value`): that's more to pad them up with (any other mound just plants the stumps in its top) */
  kitIn(kind, value) {
    if (!this.padded) { if (kind === 'stumps') this.addTrophy('stumps'); return; }
    this.gear = Math.min(GEAR.max, this.gear + value / GEAR.set);
    this.showKit(kind);
    this.refreshLabel();
  }

  /** a set of kit for one coming out, if there's any left (there's only so much to go round) */
  takeKit() {
    if (!this.padded || this.gear <= 0.01) return null;
    this.gear = Math.max(0, this.gear - 1);
    this.showKit();
    this.refreshLabel();
    return { helmet: true, pads: true };
  }

  /** as much kit stuck in its top as it's got in it: the piece just brought in (`kind`), and more of the usual, or fewer */
  showKit(kind) {
    const n = Math.ceil((this.gear / GEAR.max) * KIT_SHOWN - 1e-6);
    while (this.trophies.length > n) this.dropTrophy();
    for (let i = 0; this.trophies.length < n; i++) {
      this.addTrophy(i === 0 && KIT_LOOK.includes(kind) ? kind : KIT_LOOK[this.trophies.length % KIT_LOOK.length]);
    }
  }

  placeTrophies() {
    const q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), axis = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const t of this.trophies) {
      const dx = Math.cos(t.a) * this.r * t.k, dz = Math.sin(t.a) * this.r * t.k;
      t.group.position.set(dx, this.surfaceY(dx, dz) - this.pos.y - 0.3, dz);
      q.setFromAxisAngle(axis.set(dz, 0, -dx).normalize(), t.lean); // tip the pole outwards
      t.group.quaternion.copy(q.multiply(q2.setFromAxisAngle(up, t.spin)));
    }
  }

  /** show what was delivered stuck in the mound: leaves (or loot), or a box or can of rubbish */
  addDecal(palette) {
    if (JUNK.has(palette)) {
      this.junk ??= { box: new DecalSet(this, litterGeo('box'), 40, 0.02), can: new DecalSet(this, litterGeo('can'), 40, 0.05) };
      this.junk[Math.random() < 0.5 ? 'box' : 'can'].add(pick(PALETTES[palette]));
      this.junkN++;
    } else this.decals.add(pick(this.beach ? LOOT : PALETTES[palette] ?? LEAF_COLS));
  }

  layoutDecals() {
    // (the bigger it is, the more old leaves it takes to cover it)
    const area = Math.PI * this.r * this.r;
    if (this.duff) while (this.duff.cursor < Math.min(DUFF.max, DUFF.n * area)) this.duff.add(pick(DUFF.cols));
    if (this.twigs) while (this.twigs.cursor < Math.min(TWIGS.max, TWIGS.n * area)) this.twigs.add(pick(TWIGS.cols));
    for (const d of [this.decals, this.duff, this.twigs, this.junk?.box, this.junk?.can]) d?.layout();
  }

  /** where carried leaves are aimed (and where it steams from): somewhere down in the caldera on top */
  randomSurfacePoint(out) {
    return this.surface(rand(0, TAU), rand(0, RIM), out);
  }

  /** point just outside the mound, on the side facing `from` */
  edgePoint(from, out, pad = 0.5) {
    let dx = from.x - this.pos.x, dz = from.z - this.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d; dz /= d;
    return out.set(this.pos.x + dx * (this.r + pad), 0, this.pos.z + dz * (this.r + pad));
  }

  addLeaves(n, at, palette) {
    // (a raked-in leaf is worth a fraction: keep the sums exact so full really is full)
    const snap = (x) => Math.round(x * 1000 * LEAF_SPLIT) / (1000 * LEAF_SPLIT);
    this.fill = snap(this.fill + n);
    this.total = snap(this.total + n);
    if (palette === 'jacaranda') this.purple += n;
    this.game.stats.leaves = snap(this.game.stats.leaves + n);
    this.bump = 1;
    this.game.audio.mound();
    if (at) this.game.fx.leafBits(at, 3);
    for (let i = 0; i < n; i++) this.addDecal(palette ?? 'gum');
    this.resize();
    if (this.fill >= this.threshold && this.state === 'idle') {
      this.state = 'rumble';
      this.stateT = 0;
      this.game.audio.rumble(1.3);
    }
    this.refreshLabel();
  }

  /**
   * A turkey dived in: it pops back out a moment later as a sprout of this mound's kind, the same size,
   * and grows some more while it's in the ground (normal into a beach mound: beach turkey, and back; and out
   * of the padded mound, padded up, while it's got the kit).
   */
  convert(t) {
    const g = this.game, same = (t.kind === 'beach') === this.beach;
    t.vanish();
    this.converts.push({ stage: t.stage, hen: t.hen, gear: t.gear });
    if (this.converts.length === 1) this.convertT = 0.8;
    this.splash();
    g.fx.ring(this.pos, this.beach ? 0x7fd6ff : 0xffd21f, this.r * 1.8, 0.5);
    g.audio.gloop();
    g.stats.converted++;
    if (same) g.hud.toastOnce('replant', 'Back in the ground it goes, to grow some more', 2.5);
    else if (this.beach) g.hud.toastOnce('convert', 'In it goes, and out comes a beach turkey', 2.5);
    else g.hud.toastOnce('unconvert', 'In it goes, and out comes a normal turkey again', 2.5);
  }

  /** something's plopped into the top of it (or out of it): dirt (or sand) and bits of leaf flying, `power` as high */
  splash(n = 14, power = 1) {
    const g = this.game, top = _p.set(this.pos.x, this.pos.y + this.h, this.pos.z);
    this.bump = 1;
    if (this.beach) g.fx.burst(top, { n, colors: SAND, speed: [power, 3 * power], up: [2 * power, 4.5 * power], size: [0.05, 0.1], life: [0.5, 0.9] });
    else { g.fx.dirt(top, n, power); g.fx.leafBits(top, Math.round(n * 0.6)); }
  }

  recolor() {
    const k = this.purpleK, col = this.domeGeo.attributes.color, a = col.array, b = this.baseCols, p = this.purpleCols;
    for (let v = 0; v < this.th.length; v++) {
      const w = clamp((k - this.th[v] + 0.08) / 0.16, 0, 1); // (each bit of it turns once k passes its threshold)
      for (let j = v * 3; j < v * 3 + 3; j++) a[j] = b[j] + (p[j] - b[j]) * w;
    }
    col.needsUpdate = true;
    this.skirt.material.color.copy(this.skirtBase).lerp(this.skirtPurple, k * 0.7);
    this.shownK = k;
  }

  /** the dial over the mound: how close it is to hatching (or, while it's being built, to being finished) */
  refreshLabel() {
    const d = this.dial;
    if (this.building) {
      const n = this.scratchers, ok = n >= BUILD_CREW;
      d.icon('🐓');
      d.set(this.buildK, 0, ok ? '' : 'wait');
      d.note(ok ? '' : `${n}/${BUILD_CREW}`); // not enough of them at it yet
      return;
    }
    const hatching = this.state !== 'idle';
    d.icon(this.beach ? '🏖️' : this.padded ? '🏏' : '🍂');
    d.note('');
    // (and round the outside of the padded mound's, how much kit it's got left)
    d.set(hatching ? 1 : this.fill / this.threshold, this.padded ? this.gear / GEAR.max : 0, hatching ? 'hot' : '');
  }

  /* ---------------------------------------------------------------- saving */
  /** what a save needs to put it back (see Saves) */
  saveState() {
    const r = (v) => Math.round(v * 1000) / 1000;
    return {
      x: r(this.pos.x), z: r(this.pos.z), home: this.home, kind: this.kind, build: r(this.buildK),
      total: r(this.total), fill: r(this.fill), threshold: this.threshold, hatches: this.hatches, purple: r(this.purple), junk: this.junkN,
      trophies: this.trophies.map((t) => t.kind), state: this.state, toLaunch: this.toLaunch, gear: this.padded ? r(this.gear) : undefined,
      converts: this.converts.map((c) => [c.stage, c.hen ? 1 : 0, (c.gear?.helmet ? 1 : 0) + (c.gear?.pads ? 2 : 0)]),
    };
  }

  /** ...and put it back: as full as it was, as big, with what went into it stuck all over it */
  loadState(d) {
    if (this.building) { this.buildK = d.build; this.applyBuild(); }
    Object.assign(this, { total: d.total, fill: d.fill, threshold: d.threshold, hatches: d.hatches, purple: d.purple });
    for (let i = 0; i < Math.min(DECALS, Math.round(d.total)); i++) this.decals.add(pick(this.beach ? LOOT : LEAF_COLS));
    for (let i = 0; i < d.junk; i++) this.addDecal('rubbish');
    for (const k of d.trophies) this.addTrophy(k);
    // (in the middle of hatching: it carries on)
    if (d.state !== 'idle') { this.state = d.state; this.stateT = 0; this.toLaunch = d.toLaunch; this.launchT = 0; }
    this.converts = d.converts.map(([stage, hen, gear]) => ({ stage, hen: !!hen, gear: gear ? { helmet: !!(gear & 1), pads: !!(gear & 2) } : null }));
    this.convertT = 0.8;
    this.purpleK = this.total ? clamp((this.purple / Math.max(8, this.total)) * 1.15, 0, 1) * 0.6 : 0;
    this.recolor();
    this.resize();
    this.refreshLabel();
    return this;
  }

  dispose() {
    const s = this.game.scene;
    s.remove(this.group, this.skirt, this.decals.mesh);
    if (this.duff) s.remove(this.duff.mesh, this.twigs.mesh);
    this.domeGeo.dispose();
    this.skirt.geometry.dispose();
    if (this.junk) s.remove(this.junk.box.mesh, this.junk.can.mesh);
    this.dial.remove();
  }

  update(dt) {
    const fx = this.game.fx;
    this.stateT += dt;
    this.bump = Math.max(0, this.bump - dt * 4);
    let sy = 1 + Math.sin(this.bump * Math.PI) * 0.08, sx = 1 - Math.sin(this.bump * Math.PI) * 0.03, ox = 0, oz = 0;
    if (this.building) {
      this.updateBuild(dt);
      this.heave(sx, sy, ox, oz);
      return;
    }

    // jacaranda flowers slowly stain the mound purple
    const target = this.total ? clamp((this.purple / Math.max(8, this.total)) * 1.15, 0, 1) * 0.6 : 0;
    this.purpleK += clamp(target - this.purpleK, -dt * 0.06, dt * 0.06);
    if (Math.abs(this.purpleK - this.shownK) > 0.01) this.recolor();

    for (const t of this.trophies) if (t.panel) t.panel.rotation.y = Math.sin(this.game.time * 3 + t.ph) * 0.3; // flags flutter

    // turkeys that dived in come back out in boardshorts
    if (this.converts.length) {
      this.convertT -= dt;
      if (this.convertT <= 0) {
        this.convertT = 0.35;
        this.bump = 1;
        this.launchChick(this.converts.shift());
      }
    }

    // big deliveries (like an ibis) can fill it several times over
    if (this.state === 'idle' && this.fill >= this.threshold) {
      this.state = 'rumble';
      this.stateT = 0;
      this.game.audio.rumble(1.3);
      this.refreshLabel();
    }

    this.steamT -= dt;
    if (this.steamT <= 0) {
      this.steamT = this.state === 'idle' ? rand(0.5, 1.0) : 0.1;
      const top = new THREE.Vector3();
      this.randomSurfacePoint(top);
      if (this.beach) fx.sparkle(top, 1, [0xffffff, 0xbfefff]);
      else fx.steam(top);
    }

    if (this.state === 'rumble') {
      const k = this.stateT / 1.3;
      ox = rand(-1, 1) * 0.06 * k;
      oz = rand(-1, 1) * 0.06 * k;
      sy *= 1 + k * 0.25;
      sx *= 1 - k * 0.05;
      if (Math.random() < dt * 20) fx.dirt(this.randomSurfacePoint(new THREE.Vector3()), 2, 0.5);
      if (this.stateT >= 1.3) {
        this.state = 'erupt';
        this.stateT = 0;
        this.toLaunch = 3 + Math.min(3, this.hatches);
        this.launchT = 0;
        this.game.audio.erupt();
        const top = this.pos.clone(); top.y += this.h;
        fx.dirt(top, 30, 1.6);
        fx.leafBits(top, 16);
        fx.ring(this.pos, 0xffd21f, this.r * 2.2, 0.6);
        this.refreshLabel();
      }
    } else if (this.state === 'erupt') {
      sy *= 1 - Math.max(0, 0.25 - this.stateT) * 1.2;
      this.launchT -= dt;
      if (this.toLaunch > 0 && this.launchT <= 0) {
        this.launchT = 0.14;
        this.toLaunch--;
        this.launchChick();
      }
      if (this.toLaunch <= 0 && this.stateT > 0.8) {
        this.state = 'idle';
        this.fill = Math.max(0, this.fill - this.threshold);
        this.hatches++;
        this.threshold = Math.min(HATCH_AT.max, this.threshold + HATCH_AT.more);
        this.refreshLabel();
      }
    }
    this.heave(sx, sy, ox, oz);
  }

  /**
   * swell the heap up (or squash it down) and shake it about its middle on the ground, and everything on it with it:
   * the leaves and sticks and rubbish lying on it (laid out as it stands still, see layoutDecals), and what's planted in it
   */
  heave(sx, sy, ox, oz) {
    this.dome.position.set(ox, 0, oz);
    this.dome.scale.set(this.r * sx, this.h * sy, this.r * sx);
    this.kit.position.set(ox, 0, oz);
    this.kit.scale.set(sx, sy, sx);
    const p = this.pos; // (they lie out in the world, not in the group, so they're swelled about its middle by hand)
    for (const d of [this.decals, this.duff, this.twigs, this.junk?.box, this.junk?.can]) {
      if (!d) continue;
      d.mesh.scale.set(sx, sy, sx);
      d.mesh.position.set(p.x * (1 - sx) + ox, p.y * (1 - sy), p.z * (1 - sx) + oz);
    }
  }

  /** out pops a chick (or a turkey that dived in, coming back out: `back` is { stage, hen, gear }) */
  launchChick(back = null) {
    const g = this.game, w = g.world;
    const top = this.pos.clone(); top.y += this.h + 0.1;
    let tx = 0, tz = 0;
    for (let k = 0; k < 12; k++) {
      const a = rand(0, TAU), d = this.r + rand(2, 6.5);
      tx = this.pos.x + Math.cos(a) * d; tz = this.pos.z + Math.sin(a) * d;
      if (w.isFree(tx, tz, 0.6) && !this.game.mounds.blocked(tx, tz, 0.6) && !w.waterDepth(tx, tz)) break;
    }
    // (never into the scrub, where you couldn't get to it)
    if (!w.isFree(tx, tz, 0.6)) { w.resolve(_v.set(tx, 0, tz), 0.6, this.game.mounds.colliders); tx = _v.x; tz = _v.z; }
    // out of the padded mound, they come out padded up, while there's kit to go round (a turkey coming back out
    // keeps its kit, bar out of a beach mound: boardshorts and a snorkel don't go with a helmet)
    let gear = back?.gear && (back.gear.helmet || back.gear.pads) ? back.gear : null;
    gear ??= this.takeKit();
    if (this.beach) gear = null;
    this.game.turkeys.launchChick(top, tx, tz, this.beach ? 'beach' : 'normal', back?.stage ?? 0, back?.hen, gear);
    if (gear && this.padded) g.hud.toastOnce('padded', 'Padded up! The kit takes the first hit for them', 4);
    const converted = !!back;
    if (!converted) this.game.stats.hatched++;
    this.game.audio.fwoop();
    this.game.fx.dirt(top, 8, 1.2);
  }

  updateLabel(camera, v) {
    const g = this.game, p = g.player.pos;
    // (nothing about beach turkeys shows until the beach is open, and nothing far away shows at all; nor while
    // you're buried in it, being dug out)
    if ((this.beach && !g.beachOpen()) || (g.player.digSite === this && g.player.life !== 'ok')) { this.dial.hide(); return; }
    v.copy(this.pos);
    v.y += this.h * this.group.scale.y + 0.8;
    // (only shows when you're nearby: it fades out quickly as you walk off)
    this.dial.pin(v, camera, labelFade(Math.hypot(p.x - this.pos.x, p.z - this.pos.z), 16, 4));
    // (and right by it, with another mound to go to: how to dive in and get there)
    if (this.building) return;
    if (g.travel.canDiveAt(this)) this.dial.note('Travel', 'F', cap('x'));
    else this.dial.note('');
  }
}

export class Mounds {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.colliders = [];
    this._v = new THREE.Vector3();
  }

  add(x, z, home = false, kind = 'leaf', building = false) {
    const m = new Mound(this.game, x, z, home, kind, building);
    this.list.push(m);
    return m;
  }

  /** the mounds a save had, in place of the ones a new game starts with */
  restore(list) {
    const pad = this.list.find((m) => m.padded); // (the padded mound's still the padded mound: a save from before it was, too)
    for (const m of this.list) m.dispose();
    this.list.length = 0;
    for (const d of list) {
      const m = this.add(d.x, d.z, d.home, d.kind, d.build < 1).loadState(d);
      if (pad && d.x === pad.pos.x && d.z === pad.pos.z) m.padUp(d.gear ?? pad.gear);
    }
  }

  /** a mound being built nearby that could use another pair of feet */
  siteNear(p, r) {
    let best = null, bd = r;
    for (const m of this.list) {
      if (!m.hasCrewRoom()) continue;
      const d = Math.hypot(m.pos.x - p.x, m.pos.z - p.z);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  nearest(pos) {
    let best = null, bd = Infinity;
    for (const m of this.list) {
      const d = Math.hypot(m.pos.x - pos.x, m.pos.z - pos.z);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  /**
   * How far it is to walk from pos to mound m (through open gates, round the bush's track), or Infinity if there's
   * no way there yet. `ferry`: counting on the ferry to take you over the harbour, once it's running (see World.route)
   */
  walk(pos, m, ferry = false) {
    const w = this.game.world, p = _p.set(pos.x, 0, pos.z);
    let len = 0;
    for (let i = 0; i < 24; i++) { // (the way round the bush's track takes a fair few turns)
      if (!w.route(p.x, p.z, m.pos.x, m.pos.z, _wp, ferry)) return Infinity;
      len += Math.hypot(_wp.x - p.x, _wp.z - p.z);
      if (_wp.x === m.pos.x && _wp.z === m.pos.z) return len;
      p.copy(_wp);
    }
    return Infinity;
  }

  /** nearest mound you can walk to from pos (through open gates), or null ('padded': the padded mound, if there's a way there, or else the nearest leaf mound) */
  nearestReachable(pos, kind = 'leaf') {
    if (kind === 'padded') {
      const pad = this.list.find((m) => m.padded);
      if (pad && this.walk(pos, pad) < Infinity) return pad;
      kind = 'leaf';
    }
    let best = null, bd = Infinity;
    for (const m of this.list) {
      if (m.kind !== kind || m.building) continue;
      const len = this.walk(pos, m);
      if (len < bd) { bd = len; best = m; }
    }
    return best;
  }

  /**
   * Where you come back to when you go down at pos: the nearest finished mound (of either kind), as the crow
   * flies, of the ones you could walk to from there (never one past a gate you've not got through yet; the ferry
   * counts, though, even halfway across the harbour, with its gangways shut)
   */
  refuge(pos) {
    let best = null, bd = Infinity;
    for (const m of this.list) {
      if (m.building) continue;
      const d = Math.hypot(m.pos.x - pos.x, m.pos.z - pos.z);
      if (d < bd && this.walk(pos, m, true) < Infinity) { bd = d; best = m; }
    }
    return best ?? this.list.find((m) => m.home) ?? this.nearest(pos);
  }

  /** the mound a flying turkey at p has just plopped into, if any */
  diveInto(p) {
    for (const m of this.list) {
      if (m.building) continue;
      if (Math.hypot(p.x - m.pos.x, p.z - m.pos.z) > m.r * 0.95) continue;
      if (p.y < m.surfaceY(p.x - m.pos.x, p.z - m.pos.z) + 0.2) return m;
    }
    return null;
  }

  blocked(x, z, r) {
    return this.list.some((m) => Math.hypot(m.pos.x - x, m.pos.z - z) < m.r + r);
  }

  /** returns an error string, or null if a mound can be started here */
  whyNot(x, z) {
    for (const m of this.list) if (Math.hypot(m.pos.x - x, m.pos.z - z) < 12) return 'Too close to another mound';
    const w = this.game.world;
    if (w.zoneOf(x, z) === FERRY) return "Not on the ferry! It'd be left behind";
    if (!w.isFree(x, z, 2.2)) return 'Not enough room here';
    // (only out in the open: a mound grows, and one on a path, by a gateway or up against a fence would end up in the way)
    const tr = w.trackAt(x, z);
    if (tr && (!tr.inside(x, z, 4.2) || tr.keepClear(x, z, 8) || tr.nearWall(x, z, 4.2))) return 'Not enough room here: find somewhere more open';
    // (and never right up against a gate, where the key has to be carried)
    for (const g of w.gates) if (Math.hypot(g.x - x, g.z - z) < 9) return 'Too close to the gate';
    // (the builders need room to stand round it, so nothing big can be in the way: keys, bins, carcasses...)
    for (const c of this.game.enemies.colliders) if (Math.hypot(c.x - x, c.z - z) < c.r + 2.6) return "Something's in the way";
    return null;
  }

  update(dt, camera) {
    this.colliders.length = 0;
    for (const m of this.list) {
      m.update(dt);
      m.updateLabel(camera, this._v);
      this.colliders.push({ x: m.pos.x, z: m.pos.z, r: m.r * 0.9 * (m.building ? m.buildK : 1) });
    }
  }
}
