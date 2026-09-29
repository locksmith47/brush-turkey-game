import * as THREE from 'three';
import { vcMat, vcMesh, toonMat, part, merge, G, rand, pick, TAU, clamp, labelFade, Dial } from './util.js';
import { PALETTES, JUNK, LEAF_SPLIT, litterGeo } from './leaves.js';
import { flagMesh } from './items.js';
import { stumpsMesh, kitTrophy } from './cricket.js';
import { OVAL, FERRY } from './world.js';

const SOIL = [0x5b3b22, 0x6e4a2b, 0x8a6238, 0xa8683a, 0xb08a55, 0x7a7040, 0x654326];
const LEAF_COLS = [0x9b6b3a, 0xb8834a, 0xc49a5a, 0x8e8a4b, 0xa0522d, 0xd2a15e];
const DECALS = 90;
export const BUILD_CREW = 10; // turkeys it takes to scratch a new mound into existence
const CREW_SLOTS = 16; // spots round a mound being built (extra helpers make it go faster)
const BUILD_WORK = 60; // turkey-seconds of scratching it takes (ten turkeys: six seconds)
// leaves' worth it takes to fill a mound and hatch a batch of chicks: more for the big home mound, and
// a bit more again after every hatching (up to a point)
const HATCH_AT = { home: 12, other: 9, more: 3, max: 24 };
const PADDED = 0.5; // chance a chick hatched on the oval comes out padded up for cricket (helmet and leg guards)
const _c = new THREE.Color(), _v = new THREE.Vector3(), _p = new THREE.Vector3(), _wp = new THREE.Vector3();

/* One kind of thing stuck in a mound's surface (leaves, beach loot, rubbish): an InstancedMesh spread over the dome. */
class DecalSet {
  constructor(scene, geo, max, lift = 0) {
    this.mesh = new THREE.InstancedMesh(geo, toonMat({ side: THREE.DoubleSide }), max);
    this.mesh.count = 0;
    this.mesh.setColorAt(0, _c.set(0xffffff));
    this.max = max;
    this.lift = lift; // chunky things sit proud of the surface
    this.dirs = [];
    this.cursor = 0;
    scene.add(this.mesh);
  }

  add(color) {
    const i = this.cursor % this.max;
    this.mesh.setColorAt(i, _c.set(color));
    this.mesh.instanceColor.needsUpdate = true;
    const a = rand(0, TAU), el = Math.acos(rand(0.05, 1)); // bias towards the top
    this.dirs[i] = { x: Math.sin(el) * Math.cos(a), y: Math.cos(el), z: Math.sin(el) * Math.sin(a), ry: rand(0, TAU), s: rand(0.9, 1.4) };
    this.cursor++;
    this.mesh.count = Math.min(this.max, this.cursor);
  }

  layout(pos, r, h) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const n = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), q2 = new THREE.Quaternion();
    for (let i = 0; i < this.mesh.count; i++) {
      const d = this.dirs[i];
      n.set(d.x / r, d.y / h, d.z / r).normalize();
      p.set(pos.x + d.x * r * 1.01, pos.y + d.y * h * 1.02, pos.z + d.z * r * 1.01).addScaledVector(n, this.lift);
      q.setFromUnitVectors(up, n);
      q2.setFromEuler(e.set(0, d.ry, 0));
      q.multiply(q2);
      s.setScalar(d.s);
      this.mesh.setMatrixAt(i, m.compose(p, q, s));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

function domeGeometry() {
  const g = new THREE.SphereGeometry(1, 30, 12, 0, TAU, 0, Math.PI / 2).toNonIndexed();
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3), c = new THREE.Color();
  for (let i = 0; i < n; i += 3) {
    c.set(pick(SOIL));
    for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  return g;
}

let DOME = null, SKIRT = null, LEAF = null, BIT = null, BROLLY = null;
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
    this.h = this.r * 0.55;
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

    DOME ??= domeGeometry();
    if (!SKIRT) {
      SKIRT = new THREE.CircleGeometry(1.3, 24);
      SKIRT.rotateX(-Math.PI / 2);
    }
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
    // each mound gets its own copy of the dome so it can slowly change colour
    this.domeGeo = DOME.clone();
    if (this.beach) {
      // a mound of sand instead of leaf litter
      const a = this.domeGeo.attributes.color.array, sc = new THREE.Color();
      for (let i = 0; i < a.length; i += 9) {
        sc.set(pick(SAND));
        for (let k = 0; k < 3; k++) a.set([sc.r, sc.g, sc.b], i + k * 3);
      }
    }
    this.baseCols = this.domeGeo.attributes.color.array.slice();
    // muted lilac for patches of fallen jacaranda flowers; each facet has its own threshold
    // so the purple creeps in as scattered patches rather than one flat colour
    this.purpleCols = new Float32Array(this.baseCols.length);
    this.faceTh = new Float32Array(this.baseCols.length / 9);
    const pc = new THREE.Color(), soil = new THREE.Color();
    for (let i = 0, f = 0; i < this.purpleCols.length; i += 9, f++) {
      soil.setRGB(this.baseCols[i], this.baseCols[i + 1], this.baseCols[i + 2]);
      pc.set(pick([0x9a88b8, 0x8c7aa9, 0xa898c4, 0x85749c])).lerp(soil, 0.3);
      for (let k = 0; k < 3; k++) this.purpleCols.set([pc.r, pc.g, pc.b], i + k * 3);
      this.faceTh[f] = Math.random();
    }
    this.dome = new THREE.Mesh(this.domeGeo, vcMat());
    this.dome.castShadow = true;
    this.dome.receiveShadow = true;
    this.skirt = new THREE.Mesh(SKIRT, toonMat({ color: this.beach ? 0xd8c286 : 0x6a4a2c }));
    this.skirtBase = new THREE.Color(this.beach ? 0xd8c286 : 0x6a4a2c);
    this.skirtPurple = new THREE.Color(0x6e5a78);
    this.skirt.position.y = 0.03;
    this.skirt.receiveShadow = true;
    this.group.add(this.dome, this.skirt);
    game.scene.add(this.group);

    BIT ??= new THREE.BoxGeometry(0.3, 0.12, 0.22);
    this.decals = new DecalSet(game.scene, this.beach ? BIT : LEAF, DECALS);
    this.junk = null; // boxes and cans poking out, once rubbish or recycling has been delivered
    if (this.beach) {
      // a little beach umbrella planted on top
      BROLLY ??= merge([
        part(G.cyl(0.03, 0.03, 1.3, 6), 0xdddddd, [0, 0.65, 0]),
        ...Array.from({ length: 8 }, (_, i) => part(new THREE.ConeGeometry(0.8, 0.35, 3, 1, true, (i / 8) * TAU, TAU / 8), i % 2 ? 0xe84a8a : 0xffffff, [0, 1.35, 0])),
      ]);
      this.brolly = vcMesh(BROLLY);
      this.brolly.rotation.z = 0.15;
      this.group.add(this.brolly);
    }
    for (let i = 0; i < (home ? 30 : 8); i++) this.decals.add(pick(this.beach ? LOOT : LEAF_COLS));

    this.dial = new Dial('', 'big');
    this.resize();
    this.applyBuild();
    this.refreshLabel();
  }

  resize() {
    this.r = clamp(this.baseR + Math.sqrt(this.total) * 0.13, this.baseR, 3.6);
    this.h = this.r * 0.58;
    this.dome.scale.set(this.r, this.h, this.r);
    this.skirt.scale.setScalar(this.r);
    if (this.brolly) this.brolly.position.set(this.r * 0.15, this.h * 0.9, 0);
    this.placeTrophies();
    this.layoutDecals();
  }

  /* ---------------------------------------------------------------- scratching a new mound into existence */
  /** how big it looks while it's being built: a scrape in the ground growing into a heap */
  applyBuild() {
    const k = this.building ? 0.1 + 0.9 * Math.sqrt(this.buildK) : 1;
    this.group.scale.set(k, k * k, k);
    const done = !this.building;
    this.decals.mesh.visible = done;
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
    g.hud.toast(this.beach ? 'Beach mound built! Bring it beach gear.' : 'Mound built! Bring it leaves.', 2.5);
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
    this.group.add(f.group);
    // spread them round the mound, leaning outwards
    const a = this.trophies.length * 2.4 + rand(-0.3, 0.3);
    this.trophies.push({ ...f, kind, a, k: rand(0.3, 0.5), lean: rand(0.18, 0.3), spin: f.spin ?? rand(0, TAU), ph: rand(0, TAU) });
    this.placeTrophies();
  }

  placeTrophies() {
    const q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), axis = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const t of this.trophies) {
      const dx = Math.cos(t.a), dz = Math.sin(t.a);
      t.group.position.set(dx * this.r * t.k, this.h * Math.sqrt(1 - t.k * t.k) - 0.3, dz * this.r * t.k);
      q.setFromAxisAngle(axis.set(dz, 0, -dx), t.lean); // tip the pole outwards
      t.group.quaternion.copy(q.multiply(q2.setFromAxisAngle(up, t.spin)));
    }
  }

  /** show what was delivered stuck in the mound: leaves (or loot), or a box or can of rubbish */
  addDecal(palette) {
    if (JUNK.has(palette)) {
      this.junk ??= { box: new DecalSet(this.game.scene, litterGeo('box'), 40, 0.02), can: new DecalSet(this.game.scene, litterGeo('can'), 40, 0.05) };
      this.junk[Math.random() < 0.5 ? 'box' : 'can'].add(pick(PALETTES[palette]));
      this.junkN++;
    } else this.decals.add(pick(this.beach ? LOOT : PALETTES[palette] ?? LEAF_COLS));
  }

  layoutDecals() {
    this.decals.layout(this.pos, this.r, this.h);
    if (this.junk) { this.junk.box.layout(this.pos, this.r, this.h); this.junk.can.layout(this.pos, this.r, this.h); }
  }

  /** where carried leaves are aimed */
  randomSurfacePoint(out) {
    const a = rand(0, TAU), k = rand(0, 0.55);
    return out.set(this.pos.x + Math.cos(a) * this.r * k, this.pos.y + this.h * Math.sqrt(1 - k * k), this.pos.z + Math.sin(a) * this.r * k);
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
   * and grows some more while it's in the ground (normal into a beach mound: beach turkey, and back).
   */
  convert(t) {
    const g = this.game, same = (t.kind === 'beach') === this.beach;
    t.vanish();
    this.converts.push({ stage: t.stage, hen: t.hen, gear: t.gear });
    if (this.converts.length === 1) this.convertT = 0.8;
    this.bump = 1;
    const top = this.pos.clone();
    top.y += this.h;
    if (this.beach) g.fx.burst(top, { n: 14, colors: SAND, speed: [1, 3], up: [2, 4.5], size: [0.05, 0.1], life: [0.5, 0.9] });
    else { g.fx.dirt(top, 14); g.fx.leafBits(top, 8); }
    g.fx.ring(this.pos, this.beach ? 0x7fd6ff : 0xffd21f, this.r * 1.8, 0.5);
    g.audio.gloop();
    g.stats.converted++;
    if (same) g.hud.toastOnce('replant', "Back into the ground: it'll grow while it's planted", 2.5, 40);
    else if (this.beach) g.hud.toastOnce('convert', 'Into the beach mound... out comes a beach turkey!', 2.5, 40);
    else g.hud.toastOnce('unconvert', 'Into the mound... out comes a normal turkey again!', 2.5, 40);
  }

  recolor() {
    const k = this.purpleK, col = this.domeGeo.attributes.color, a = col.array, b = this.baseCols, p = this.purpleCols;
    for (let i = 0, f = 0; i < a.length; i += 9, f++) {
      const th = this.faceTh[f];
      const w = clamp((k - th + 0.08) / 0.16, 0, 1); // this facet's patch fades in once k passes its threshold
      for (let j = i; j < i + 9; j++) a[j] = b[j] + (p[j] - b[j]) * w;
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
    d.icon(this.beach ? '🏖️' : '🍂');
    d.note('');
    d.set(hatching ? 1 : this.fill / this.threshold, 0, hatching ? 'hot' : '');
  }

  /* ---------------------------------------------------------------- saving */
  /** what a save needs to put it back (see Saves) */
  saveState() {
    const r = (v) => Math.round(v * 1000) / 1000;
    return {
      x: r(this.pos.x), z: r(this.pos.z), home: this.home, kind: this.kind, build: r(this.buildK),
      total: r(this.total), fill: r(this.fill), threshold: this.threshold, hatches: this.hatches, purple: r(this.purple), junk: this.junkN,
      trophies: this.trophies.map((t) => t.kind), state: this.state, toLaunch: this.toLaunch,
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
  }

  dispose() {
    const s = this.game.scene;
    s.remove(this.group, this.decals.mesh);
    if (this.junk) s.remove(this.junk.box.mesh, this.junk.can.mesh);
    this.dial.remove();
  }

  update(dt) {
    const fx = this.game.fx;
    this.stateT += dt;
    this.bump = Math.max(0, this.bump - dt * 4);
    let sy = 1 + Math.sin(this.bump * Math.PI) * 0.08, sx = 1 - Math.sin(this.bump * Math.PI) * 0.03;
    this.dome.position.set(0, 0, 0);
    if (this.building) {
      this.updateBuild(dt);
      this.dome.scale.set(this.r * sx, this.h * sy, this.r * sx);
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
      this.dome.position.set(rand(-1, 1) * 0.06 * k, 0, rand(-1, 1) * 0.06 * k);
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
    this.dome.scale.set(this.r * sx, this.h * sy, this.r * sx);
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
    // on the oval, some come out padded up for a game of cricket (a turkey coming back out keeps its kit,
    // bar out of a beach mound: boardshorts and a snorkel don't go with a helmet)
    let gear = back?.gear && (back.gear.helmet || back.gear.pads) ? back.gear : null;
    if (!gear && w.zoneOf(this.pos.x, this.pos.z) === OVAL && Math.random() < PADDED) gear = { helmet: true, pads: true };
    if (this.beach) gear = null;
    this.game.turkeys.launchChick(top, tx, tz, this.beach ? 'beach' : 'normal', back?.stage ?? 0, back?.hen, gear);
    if (gear && !back) g.hud.toastOnce('padded', 'Padded up! Turkeys hatched on the oval come out in helmets and leg guards: the first time one gets hurt, its kit takes the hit instead', 6, 600);
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
    for (const m of this.list) m.dispose();
    this.list.length = 0;
    for (const d of list) this.add(d.x, d.z, d.home, d.kind, d.build < 1).loadState(d);
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

  /** nearest mound you can walk to from pos (through open gates), or null */
  nearestReachable(pos, kind = 'leaf') {
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
      const d = Math.hypot(p.x - m.pos.x, p.z - m.pos.z);
      if (d > m.r * 0.95) continue;
      const top = m.pos.y + m.h * Math.sqrt(Math.max(0, 1 - (d / m.r) ** 2));
      if (p.y < top + 0.2) return m;
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
    for (const c of this.game.enemies.colliders) if (Math.hypot(c.x - x, c.z - z) < c.r + 2.6) return 'Something is in the way';
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
