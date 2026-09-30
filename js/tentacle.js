import * as THREE from 'three';
import { Foe } from './foe.js';
import { vcMat, toonMat, clamp, lerp, rand, smoothstep, TAU } from './util.js';
import { SEA } from './props/beach.js';
import { LANE } from './props/harbour.js';

/*
 * The giant cuttlefish's tentacles (see Cuttle). Each one comes up out of the harbour alongside the ferry and
 * towers over her deck, a red lane marking where it'll come down (get out of the way), then slams down across it.
 * There it lies, writhing, and it's a foe like any other: throw turkeys on it and they cling on and peck, and any
 * on foot have a go at it too. Each fends for itself: it thrashes off the ones clinging to it, curls its tip round
 * any turkeys near the end of it and hauls them over the side (break its grip before they go under), and rears up
 * and slams down again on anyone in its way. Left alone a while, it goes back under and comes up somewhere else.
 * Knock the fight out of it and it slithers back over the side, for good.
 */
export const ARM_HP = 110; // (each of them: see Cuttle.bar)
const DEF = { name: 'Tentacle', hp: ARM_HP, radius: 2.4, bodyY: 0.3, labelY: 1.1, maxLatch: 10, shakeAt: 7, shakeEvery: 5.5, gripHP: 18 };
const N = 30, SIDES = 10; // rings along it, and sides round it
const THICK = [0.62, 0.07], CLUB = 0.13; // m: how thick it is at the root and at the tip, and the club it has near the end of it
const TIME = { emerge: 0.55, rise: 1.9, slam: 0.2, curl: 0.6, drag: 3.8, shake: 0.8, lift: 0.45, poise: 1.15, dive: 0.95, sink: 1.1 }; // s
const HOLD = 0.7; // (how far into hauling them off it still has hold of them where you can get at it: after that, it's too late)
const PILE_ON = 0.75; // s it gives turkeys to pile on before it's thrashing off a little crew (see wantsShake)
const GRAB = { r: 1.9, max: 3, first: [2.5, 4], every: [4.5, 8] }; // m round its tip it grabs, the most turkeys at once, and s before it does (the first time, and after)
const SLAM = { w: 1.15, hurt: 22, again: [6, 10] }; // m either side of it the slam gets, your health it takes, and s between slams on the deck
const LONELY = 7; // s with nobody near it before it goes looking somewhere else
const SUCKERS = 15; // (pairs of them, along the underside of it from over the rail to its tip)
const RED = { color: 0xff3b2f, transparent: true, depthWrite: false, side: THREE.DoubleSide };
// its colours (vivid, like the rest of it: see Cuttle): purples with bands of sea-green shimmering down it, white
// spots, and a pale pink underside
const C = {
  top: new THREE.Color(0x9a2f9c), top2: new THREE.Color(0x5a2aa6), band: new THREE.Color(0x22d6c4), spot: new THREE.Color(0xfbf2ff),
  belly: new THREE.Color(0xf6c8d2), rage: new THREE.Color(0xa3122f), pale: new THREE.Color(0xf7eef3),
};
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

/* ------------------------------------------------------------------ the berths */
/**
 * Where a tentacle can come aboard, in the ferry's own frame (x along her from her middle, z out to either side of
 * her middle line): where it comes up out of the water, where it comes over her side (and how high it is there),
 * and the way it lies along her deck, out to its tip. Along either side deck, and over either end of her, either
 * side of the gangway and round the end of her cabins
 */
export const BERTHS = [];
for (const s of [-1, 1]) {
  for (const [x, q] of [[-10, -1], [2, -1], [9, 1]]) {
    BERTHS.push({ root: [x - q * 1.4, s * 8.8], over: [x, s * 6.35, 1.55], lie: [[x + q * 0.7, s * 5.2], [x + q * 2.5, s * 4.3], [x + q * 4.7, s * 4.0], [x + q * 6.9, s * 4.3]] });
  }
  for (const e of [-1, 1]) {
    BERTHS.push({ root: [e * 21.6, s * 3.4], over: [e * 18.5, s * 1.4, 0.75], lie: [[e * 17.2, s * 1.2], [e * 15.2, s * 1.6], [e * 13.4, s * 2.8], [e * 12.2, s * 4.4]] });
  }
}
// (two can't lie on the same bit of deck: which get in each other's way)
for (const a of BERTHS) a.clash = BERTHS.filter((b) => b !== a && a.lie.some(([ax, az]) => b.lie.some(([bx, bz]) => Math.hypot(ax - bx, az - bz) < 3)));

/* ------------------------------------------------------------------ bending a tube along a curve */
const DENSE = 8, _dense = [], _len = [];
for (let i = 0; i < 16 * DENSE + 1; i++) _dense.push(new THREE.Vector3());
const _e0 = new THREE.Vector3(), _e1 = new THREE.Vector3();

/** the point t (0..1) of the way from p1 to p2 along a Catmull-Rom curve (p0 and p3 either side), into out */
function catmull(p0, p1, p2, p3, t, out) {
  const t2 = t * t, t3 = t2 * t;
  const f = (a, b, c, d) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
  return out.set(f(p0.x, p1.x, p2.x, p3.x), f(p0.y, p1.y, p2.y, p3.y), f(p0.z, p1.z, p2.z, p3.z));
}

/** a smooth curve through the control points `ctrl`, evened out along its length into out (n + 1 points) */
export function curveThrough(ctrl, out, n = out.length - 1) {
  const K = ctrl.length;
  _e0.copy(ctrl[0]).multiplyScalar(2).sub(ctrl[1]);
  _e1.copy(ctrl[K - 1]).multiplyScalar(2).sub(ctrl[K - 2]);
  let m = 0;
  _len[0] = 0;
  for (let k = 0; k < K - 1; k++) {
    const p0 = k ? ctrl[k - 1] : _e0, p3 = k + 2 < K ? ctrl[k + 2] : _e1;
    for (let j = k ? 1 : 0; j <= DENSE; j++, m++) {
      catmull(p0, ctrl[k], ctrl[k + 1], p3, j / DENSE, _dense[m]);
      if (m) _len[m] = _len[m - 1] + _dense[m].distanceTo(_dense[m - 1]);
    }
  }
  const L = _len[m - 1];
  for (let i = 0, s = 0; i <= n; i++) {
    const want = (L * i) / n;
    while (s < m - 2 && _len[s + 1] < want) s++;
    const span = _len[s + 1] - _len[s];
    out[i].lerpVectors(_dense[s], _dense[s + 1], span > 1e-6 ? clamp((want - _len[s]) / span, 0, 1) : 0);
  }
  return L;
}

/**
 * A fleshy tube along a spine of points (a tentacle, an arm), bent into shape afresh every frame: `n` rings of
 * `sides` sides, as thick as rad(u) is (u 0..1, root to tip), and coloured by paint(u, up, i, j, out) (`up`: 1 on
 * its back, -1 on its underside, where the suckers are). Its back's the way `back` points at the root, and stays
 * on the same side of it all the way along
 */
export class Tube {
  constructor(n, sides, rad, paint) {
    this.n = n;
    this.sides = sides;
    this.paint = paint;
    this.spine = Array.from({ length: n + 1 }, () => new THREE.Vector3());
    this.T = Array.from({ length: n + 1 }, () => new THREE.Vector3());
    this.N = Array.from({ length: n + 1 }, () => new THREE.Vector3());
    this.B = Array.from({ length: n + 1 }, () => new THREE.Vector3());
    this.r = Array.from({ length: n + 1 }, (_, i) => rad(i / n));
    this.cos = Array.from({ length: sides }, (_, j) => Math.cos((j / sides) * TAU));
    this.sin = Array.from({ length: sides }, (_, j) => Math.sin((j / sides) * TAU));
    const count = (n + 1) * sides + 1, geo = new THREE.BufferGeometry(), index = [];
    for (const k of ['position', 'normal', 'color']) geo.setAttribute(k, new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < sides; j++) {
        const a = i * sides + j, b = a + sides, c = (i + 1) * sides + ((j + 1) % sides), d = i * sides + ((j + 1) % sides);
        index.push(a, d, b, d, c, b);
      }
    }
    const last = n * sides, tip = (n + 1) * sides; // (and a point on the end of it)
    for (let j = 0; j < sides; j++) index.push(last + j, last + ((j + 1) % sides), tip);
    geo.setIndex(index);
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, vcMat());
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false; // (it's never in the same place two frames running)
    this.mesh.userData.moves = true; // (nothing for the birds going over to fly into: see Flyovers)
  }

  /** bend it along a curve through `ctrl` (root first), its back facing `back` at the root; `t` for the colours */
  shape(ctrl, back, t) {
    const { n, sides, spine, T, N, B, r } = this;
    curveThrough(ctrl, spine, n);
    for (let i = 0; i <= n; i++) T[i].subVectors(spine[Math.min(n, i + 1)], spine[Math.max(0, i - 1)]).normalize();
    // (its back carried along from one ring to the next, twisting no more than it has to)
    N[0].copy(back).addScaledVector(T[0], -back.dot(T[0]));
    if (N[0].lengthSq() < 1e-6) N[0].set(T[0].y, -T[0].x, 0);
    N[0].normalize();
    for (let i = 1; i <= n; i++) {
      N[i].copy(N[i - 1]).addScaledVector(T[i], -N[i - 1].dot(T[i]));
      if (N[i].lengthSq() < 1e-8) N[i].copy(N[i - 1]);
      N[i].normalize();
    }
    for (let i = 0; i <= n; i++) B[i].crossVectors(T[i], N[i]);
    const P = this.geo.attributes.position.array, Nm = this.geo.attributes.normal.array, Cl = this.geo.attributes.color.array;
    for (let i = 0; i <= n; i++) {
      const u = i / n, s = spine[i], ni = N[i], bi = B[i], ri = r[i];
      for (let j = 0; j < sides; j++) {
        const c = this.cos[j], sn = this.sin[j], k = (i * sides + j) * 3;
        const dx = ni.x * c + bi.x * sn, dy = ni.y * c + bi.y * sn, dz = ni.z * c + bi.z * sn;
        P[k] = s.x + dx * ri; P[k + 1] = s.y + dy * ri; P[k + 2] = s.z + dz * ri;
        Nm[k] = dx; Nm[k + 1] = dy; Nm[k + 2] = dz;
        this.paint(u, c, i, j, t, _c);
        Cl[k] = _c.r; Cl[k + 1] = _c.g; Cl[k + 2] = _c.b;
      }
    }
    const k = (n + 1) * sides * 3, e = spine[n], te = T[n];
    P[k] = e.x + te.x * r[n]; P[k + 1] = e.y + te.y * r[n]; P[k + 2] = e.z + te.z * r[n];
    Nm[k] = te.x; Nm[k + 1] = te.y; Nm[k + 2] = te.z;
    this.paint(1, 1, n, 0, t, _c);
    Cl[k] = _c.r; Cl[k + 1] = _c.g; Cl[k + 2] = _c.b;
    for (const a of ['position', 'normal', 'color']) this.geo.attributes[a].needsUpdate = true;
  }

  /** the point on its skin at ring i, `a` round from its back (radians), `out` further out than that, into o */
  surface(i, a, out, o) {
    const c = Math.cos(a), s = Math.sin(a), ni = this.N[i], bi = this.B[i], d = this.r[i] + out;
    return o.copy(this.spine[i]).addScaledVector(ni, c * d).addScaledVector(bi, s * d);
  }
}

/* ------------------------------------------------------------------ the red lane where it'll come down */
/** a red lane marked out on the deck, along where a tentacle's about to come down, filling in from over the side */
class Lane {
  constructor(scene) {
    this.pts = Array.from({ length: 21 }, () => new THREE.Vector3());
    const make = (op) => {
      const geo = new THREE.BufferGeometry(), idx = [];
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(21 * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
      for (let i = 0; i < 20; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
      geo.setIndex(idx);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ ...RED, opacity: op }));
      m.frustumCulled = false;
      m.visible = false;
      scene.add(m);
      return m;
    };
    this.edge = make(0.22);
    this.fill = make(0.38);
    this.fill.renderOrder = 1;
  }

  /** along the curve through ctrl (on the deck: y's worked out here), `w` either side, filled in `k` (0..1) of the way */
  show(ferry, ctrl, w, k, time) {
    curveThrough(ctrl, this.pts, 20);
    const put = (mesh, upto) => {
      const P = mesh.geometry.attributes.position.array;
      for (let i = 0; i <= 20; i++) {
        const f = (i / 20) * upto * 20, a = Math.min(19, Math.floor(f)), p = _v.lerpVectors(this.pts[a], this.pts[a + 1], f - a);
        const d = _w.subVectors(this.pts[a + 1], this.pts[a]).setY(0).normalize();
        for (const [s, o] of [[-1, 0], [1, 3]]) {
          const x = p.x - d.z * w * s, z = p.z + d.x * w * s;
          P[i * 6 + o] = x; P[i * 6 + o + 1] = ferry.groundAt(x, z) + 0.07; P[i * 6 + o + 2] = z;
        }
      }
      mesh.geometry.attributes.position.needsUpdate = true;
      mesh.visible = true;
    };
    put(this.edge, 1);
    put(this.fill, Math.max(0.02, k));
    this.edge.material.opacity = 0.2 + Math.sin(time * 18) * 0.08;
  }

  hide() { this.edge.visible = this.fill.visible = false; }
  dispose(scene) { scene.remove(this.edge, this.fill); }
}

/* ------------------------------------------------------------------ the tentacle */
let SUCKER = null;

export class Tentacle extends Foe {
  /** `cuttle`: the cuttlefish it belongs to (see Cuttle); it waits under the water `wait` seconds before it comes up */
  constructor(game, cuttle, wait) {
    const f = game.ferry;
    super(game, DEF, f.x, LANE);
    this.cuttle = cuttle;
    this.state = 'under';
    this.wait = wait;
    this.berth = null;
    this.ph = rand(0, TAU);
    this.held = [];
    this.gripDmg = 0;
    this.grabT = this.slamT = this.lonely = 0;
    this.rage = this.pale = 0; // (0..1: how red it's gone, winding up to something, and how white, just hurt)
    this.ctrl = Array.from({ length: 8 }, () => new THREE.Vector3());
    this.from = Array.from({ length: 8 }, () => new THREE.Vector3());
    this.want = Array.from({ length: 8 }, () => new THREE.Vector3());
    this.toPose = 'under';
    this.gT = this.gDur = 1;
    this.back = new THREE.Vector3();
    this.onDeck = N; // (the first ring of it that's over her deck)

    const paint = (u, up, i, j, t, out) => {
      const band = smoothstep(0.4, 0.9, Math.sin(u * 32 - t * 4.5 + this.ph));
      out.copy(C.top).lerp(C.top2, 0.5 + 0.5 * Math.sin(u * 7 + t * 0.9 + this.ph)).lerp(C.band, band * 0.75);
      if ((i * 7 + j * 3) % 11 === 0 && i % 2 === 0) out.lerp(C.spot, 0.85);
      out.lerp(C.belly, smoothstep(0.15, -0.5, up));
      if (this.rage) out.lerp(C.rage, this.rage * (0.55 + 0.35 * Math.sin(u * 20 - t * 14)));
      if (this.pale) out.lerp(C.pale, this.pale);
    };
    this.tube = new Tube(N, SIDES, (u) => lerp(THICK[0], THICK[1], u ** 0.85) + CLUB * Math.exp(-(((u - 0.86) / 0.06) ** 2)), paint);
    SUCKER ??= new THREE.SphereGeometry(1, 10, 5);
    this.suckers = new THREE.InstancedMesh(SUCKER, toonMat({ color: 0xf9dbe2 }), SUCKERS * 2);
    this.suckers.frustumCulled = false;
    this.suckers.userData.moves = true;
    const root = new THREE.Group();
    root.add(this.tube.mesh, this.suckers);
    this.setRig({ root });
    root.visible = false; // (till it's up out of the water)
    this.lane = new Lane(game.scene);
    this.warn = game.fx.warnCircle();
    this.snap('under');
  }

  get targetable() { return this.alive && (this.state === 'lie' || this.state === 'curl' || this.state === 'shake' || this.state === 'recoil' || (this.state === 'drag' && this.t < TIME.drag * HOLD)); }
  /** out of the water (it's got a bit of deck it's lying on, or about to come down on) */
  get out() { return this.berth !== null && this.state !== 'under'; }
  colliderR() { return 0; } // (it's not in anyone's way: they clamber over it)

  /**
   * Time to thrash off whoever's clinging to it: a crowd of shakeAt straight away, and anything less a bit after
   * they've latched on (a crowd takes some shifting, but two or three are off it in no time: pile them on)
   */
  wantsShake() {
    const n = this.latched.length;
    return n > 0 && (n >= DEF.shakeAt || this.sinceShake > Math.max(PILE_ON, DEF.shakeEvery * (n / DEF.shakeAt) ** 2));
  }

  /* ---------------------------------------------------------------- poses */
  /** the ferry's frame to the world: (x along her, z across her) at height y, into out */
  at(x, z, y, out) { return out.set(this.game.ferry.x + x, y, LANE + z); }

  /** the deck at (x, z) in the ferry's frame */
  deck(x, z) { const f = this.game.ferry; return f.groundAt(f.x + x, LANE + z); }

  /**
   * Its 8 control points (root first) for a pose, into out: 'under' (coiled under the water by where it comes up),
   * 'raised' (towering over the deck), 'lie' (lying along it, writhing), 'thrash', 'curl' (its tip curled up, to
   * grab), and 'haul' (its tip hooked back over the side, with whatever it's got)
   */
  pose(name, out) {
    const b = this.berth, t = this.game.time + this.ph, [rx, rz] = b.root, [ox, oz, oy] = b.over;
    const L = b.lie, sway = Math.sin(t * 1.3) * 0.5, sway2 = Math.cos(t * 1.1) * 0.4;
    // (which way's out over the side, from where it comes aboard)
    const dx = rx - ox, dz = rz - oz, dl = Math.hypot(dx, dz), qx = dx / dl, qz = dz / dl;
    if (name === 'under') {
      for (let k = 0; k < 8; k++) this.at(rx + qx * k * 0.3, rz + qz * k * 0.3, SEA - 9 + k * 1.05, out[k]);
      return out;
    }
    this.at(rx + qx * 0.8, rz + qz * 0.8, SEA - 6, out[0]);
    this.at(rx, rz, SEA - 0.8, out[1]);
    if (name === 'raised') {
      this.at(lerp(rx, ox, 0.2) + sway2 * 0.3, lerp(rz, oz, 0.2), 2.4, out[2]);
      this.at(ox + qx * 0.6 + sway * 0.4, oz + qz * 0.6, 6, out[3]);
      this.at(L[0][0] + sway, L[0][1], 8.2 + sway2, out[4]);
      this.at(L[1][0] + sway, L[1][1] + sway2 * 0.5, 8.8, out[5]);
      this.at(L[2][0] + sway * 0.6, L[2][1], 7.4 + sway * 0.5, out[6]);
      this.at(L[3][0], L[3][1], 5.4 + sway2 * 0.6, out[7]);
      return out;
    }
    // (on the deck: hugging her side as it comes up out of the water, over the rail, and down along the deck)
    this.at(lerp(ox, rx, 0.3), lerp(oz, rz, 0.3), SEA + 0.9, out[2]);
    this.at(ox, oz, this.deck(ox, oz) + oy, out[3]);
    if (name === 'haul') {
      const d = this.deck(ox, oz);
      this.at(ox + qx * 0.2, oz + qz * 0.2, d + oy + 1.3, out[3]);
      this.at(lerp(ox, L[0][0], 0.6), lerp(oz, L[0][1], 0.6), d + 2.7, out[4]);
      this.at(L[0][0], L[0][1], d + 2.4, out[5]);
      this.at(lerp(ox, L[0][0], 0.5), lerp(oz, L[0][1], 0.5), d + 1.5, out[6]);
      this.at(ox + qx * 0.4, oz + qz * 0.4, d + 1.9, out[7]);
      return out;
    }
    const thrash = name === 'thrash', amp = thrash ? 0.6 : 0.17, w = thrash ? 17 : 2.2;
    for (let k = 0; k < 4; k++) {
      const [x, z] = L[k], [px, pz] = L[Math.max(0, k - 1)], [nx, nz] = L[Math.min(3, k + 1)];
      const ax = nx - px, az = nz - pz, al = Math.hypot(ax, az) || 1, wig = Math.sin(t * w - k * 0.9) * amp * (0.4 + k * 0.25);
      const lift = thrash ? Math.abs(Math.sin(t * w * 0.5 + k)) * 0.7 * (k / 3) : 0;
      this.at(x - (az / al) * wig, z + (ax / al) * wig, this.deck(x, z) + [0.34, 0.28, 0.22, 0.16][k] + lift, out[4 + k]);
    }
    // (the tip never lies flat: it curls up off the deck, feeling about)
    out[7].y += 0.25 + Math.sin(t * 2.7) * 0.18;
    if (name === 'curl') {
      out[6].y += 0.8;
      out[7].lerp(out[5], 0.3).y += 1.5;
    }
    return out;
  }

  /** straight into a pose, all at once */
  snap(name) {
    this.toPose = name;
    this.gT = this.gDur = 1;
    if (this.berth) this.pose(name, this.ctrl);
  }

  /** over into a pose, taking `dur` seconds (`ease`: 'in', speeding up into it, or smooth by default) */
  go(name, dur, ease = null) {
    for (let k = 0; k < 8; k++) this.from[k].copy(this.ctrl[k]);
    this.toPose = name;
    this.gT = 0;
    this.gDur = dur;
    this.ease = ease;
  }

  /* ---------------------------------------------------------------- update */
  update(dt) {
    this.t += dt;
    this.sinceShake += dt;
    this.flinch = Math.max(0, this.flinch - dt * 3);
    this.grabT -= dt;
    this.slamT -= dt;
    this.pale = Math.max(0, this.pale - dt * 2.5);
    this.rage = Math.max(0, this.rage - dt * 1.5);
    // (a turkey that's let go of it, one way or another, isn't hanging on to it any more)
    if (this.latched.length) this.latched = this.latched.filter((t) => t.foe === this && t.latched && !t.dead);
    if (this.alive) this.think(dt);
    else this.away(dt);
    if (this.gone || !this.berth) return;
    // (from where it was to where it's going, or just where it is)
    this.gT += dt;
    this.pose(this.toPose, this.want);
    const k = clamp(this.gT / this.gDur, 0, 1), e = this.ease === 'in' ? k * k : smoothstep(0, 1, k);
    for (let i = 0; i < 8; i++) this.ctrl[i].lerpVectors(this.from[i], this.want[i], e);
    if (this.flinch) for (let i = 3; i < 8; i++) this.ctrl[i].y += Math.sin(this.t * 50 + i) * 0.1 * this.flinch;
    this.shapeUp();
  }

  /** bend the tube to the control points (and put the suckers, the turkeys clinging on, and where it is, to match) */
  shapeUp() {
    const g = this.game, f = g.ferry, tube = this.tube, [rx, rz] = this.berth.root, [ox, oz] = this.berth.over;
    tube.shape(this.ctrl, this.back.set(rx - ox, 0, rz - oz).normalize(), g.time);
    this.rig.root.visible = this.state !== 'under';
    this.onDeck = N;
    for (let i = 0; i <= N; i++) {
      const s = tube.spine[i];
      if (f.onDeck(s.x, s.z) && s.y > f.groundAt(s.x, s.z) - 0.3) { this.onDeck = i; break; }
    }
    // where it is: the middle of the bit of it on the deck (or where that'll be)
    const mid = tube.spine[Math.min(N, (this.onDeck + N) >> 1)];
    this.pos.set(mid.x, g.world.groundHeight(mid.x, mid.z), mid.z);
    // the suckers, in two rows down its underside
    for (let k = 0; k < SUCKERS; k++) {
      const i = Math.round(lerp(N * 0.45, N - 1, k / (SUCKERS - 1)));
      for (const s of [0, 1]) {
        const a = Math.PI + (s ? 0.5 : -0.5) + (k % 2) * 0.12;
        tube.surface(i, a, -tube.r[i] * 0.1, _v);
        _u.copy(tube.N[i]).multiplyScalar(Math.cos(a)).addScaledVector(tube.B[i], Math.sin(a));
        _q.setFromUnitVectors(UP, _u);
        const r = tube.r[i] * 0.3;
        this.suckers.setMatrixAt(k * 2 + s, _m.compose(_v, _q, _s.set(r, r * 0.35, r)));
      }
    }
    this.suckers.instanceMatrix.needsUpdate = true;
    for (const t of this.latched) this.place(t.attachObj);
  }

  /* ---------------------------------------------------------------- being clung to, and hit */
  hits(p) {
    const s = this.tube.spine, r = this.tube.r;
    for (let i = this.onDeck; i < N; i++) {
      const a = s[i], b = s[i + 1], ex = b.x - a.x, ez = b.z - a.z, l2 = ex * ex + ez * ez || 1e-6;
      const k = clamp(((p.x - a.x) * ex + (p.z - a.z) * ez) / l2, 0, 1), cx = a.x + ex * k, cz = a.z + ez * k, cy = a.y + (b.y - a.y) * k;
      if (Math.hypot(p.x - cx, p.z - cz) < r[i] + 0.55 && p.y < cy + 1.8 && p.y > cy - r[i] - 0.5) return true;
    }
    return false;
  }

  /** the ring of it nearest p (of the bit of it on the deck), and how far it is to it (across the deck) */
  nearest(p) {
    const s = this.tube.spine;
    let best = this.onDeck, bd = Infinity;
    for (let i = this.onDeck; i <= N; i++) {
      const d = Math.hypot(s[i].x - p.x, s[i].z - p.z);
      if (d < bd) { bd = d; best = i; }
    }
    return [Math.min(best, N - 1), bd];
  }

  /** turkeys on foot come at it from their side of it, at the nearest bit of it */
  attackSpot(t, at, face) {
    const [i] = this.nearest(t.pos), s = this.tube.spine[i];
    let dx = t.pos.x - s.x, dz = t.pos.z - s.z, d = Math.hypot(dx, dz);
    if (d < 1e-3) { dx = -this.tube.T[i].z; dz = this.tube.T[i].x; d = 1; }
    const ring = this.tube.r[i] + t.radius + 0.05;
    at.set(s.x + (dx / d) * ring, 0, s.z + (dz / d) * ring);
    face.copy(s);
  }

  bodyCenter(out) { return out.copy(this.pos).setY(this.pos.y + 0.3); }

  /** a turkey clinging on rides along on a spot on its back, near where it hit it (see place) */
  latchFrame(p) {
    const [i] = this.nearest(p), tube = this.tube;
    // (round from its back towards the side it came from, but never under it)
    _v.subVectors(p, tube.spine[i]);
    const a = clamp(Math.atan2(_v.dot(tube.B[i]), _v.dot(tube.N[i])), -1.1, 1.1);
    const o = new THREE.Object3D();
    o.userData.cling = { i, a };
    this.place(o);
    return o;
  }

  attachPoint() { return new THREE.Vector3(); }

  /** where a clinging turkey's spot on it has got to */
  place(o) {
    const { i, a } = o.userData.cling;
    this.tube.surface(i, a, 0.02, o.position);
    o.updateMatrixWorld();
  }

  hitFx(p) { this.game.fx.burst(p, { n: 4, colors: [0x9a2f9c, 0x22d6c4, 0xf6c8d2, 0x2a1030], speed: [1, 2.4], up: [1.5, 3], size: [0.04, 0.08], life: [0.4, 0.7] }); }

  /** its grip on whatever it's hauling over the side (see HUD.boss) */
  get grip() {
    if (this.state !== 'drag' || !this.held.length || this.t >= TIME.drag * HOLD) return null;
    return { fill: Math.min(1, this.gripDmg / DEF.gripHP), time: 1 - this.t / (TIME.drag * HOLD) };
  }

  onDamage(amount) {
    if (this.state !== 'drag') return;
    this.gripDmg += amount;
    if (this.gripDmg >= DEF.gripHP) {
      this.letGo();
      this.state = 'recoil';
      this.t = 0;
      this.flinch = 1;
      this.pale = 1;
      this.go('lie', 0.5);
      this.game.audio.squelch();
    }
  }

  /** whatever it's got in its tip, let go of (they tumble back onto the deck) */
  letGo() {
    for (const t of this.held) if (t.holder === this && !t.dead) t.releaseFromBeak();
    this.held.length = 0;
  }

  /** where turkey i it's got hold of is: wrapped in its curled tip */
  heldPos(i, out) {
    const k = N - 1 - i * 2, tube = this.tube;
    tube.surface(k, 0, 0.05, out);
    out.y -= 0.2;
    return out;
  }

  onDeath() {
    const g = this.game;
    this.letGo();
    this.lane.hide();
    this.warn.hide();
    this.state = 'sink';
    this.t = 0;
    this.pale = 1;
    this.go('raised', 0.35);
    g.audio.squelch();
    g.fx.ring(this.pos, 0xfff3c4, 3.2, 0.5);
    this.cuttle.lost(this);
  }

  /* ---------------------------------------------------------------- AI */
  think(dt) {
    const g = this.game;
    switch (this.state) {
      case 'under': {
        // biding its time under the water, then up it comes, wherever there's room for it (near the action)
        if ((this.wait -= dt) > 0) break;
        const b = this.cuttle.berthFor(this);
        if (!b) { this.wait = 0.5; break; }
        this.berth = b;
        this.snap('under');
        this.go('raised', TIME.emerge);
        this.state = 'rise';
        this.t = 0;
        this.at(b.root[0], b.root[1], SEA, _v);
        g.fx.splash(_v.x, SEA, _v.z, 2.2);
        g.fx.burst(_v.setY(SEA + 0.3), { glow: true, n: 14, colors: [0xffffff, 0xcfe3ee, 0x9fc4d6], speed: [1, 3], up: [4, 7], grav: 9, size: [0.06, 0.12], life: [0.6, 1.1] });
        g.audio.sploosh();
        break;
      }
      case 'rise':
      case 'poise': {
        // towering over the deck, swaying, while the lane where it'll come down fills in red
        const start = this.state === 'rise' ? 0.3 : 0, end = this.state === 'rise' ? TIME.rise : TIME.lift + TIME.poise;
        this.rage = Math.max(this.rage, smoothstep(start, end, this.t) * 0.8);
        if (this.t > start) this.showLane(smoothstep(start, end, this.t));
        if (this.t >= end) {
          this.state = 'slam';
          this.t = 0;
          this.go('lie', TIME.slam, 'in');
          g.audio.whoosh();
        }
        break;
      }
      case 'slam':
        if (this.t >= TIME.slam) this.land();
        break;
      case 'lie': {
        // on the deck: what's it going to do next?
        const busy = this.latched.length > 0 || this.nearby(5);
        this.lonely = busy ? 0 : this.lonely + dt;
        if (this.wantsShake()) {
          this.state = 'shake';
          this.t = 0;
          this.snap('lie');
          this.go('thrash', 0.12);
          g.audio.squelch();
        } else if (this.grabT <= 0 && this.tipTurkeys().length) {
          this.state = 'curl';
          this.t = 0;
          this.go('curl', TIME.curl * 0.8);
        } else if (this.slamT <= 0 && this.inLaneCount() >= 2) this.rear();
        else if (this.lonely > LONELY) {
          // (nothing doing here: it goes looking for somewhere better)
          this.state = 'dive';
          this.t = 0;
          if (this.latched.length) this.shakeOff();
          this.go('raised', 0.4);
        }
        break;
      }
      case 'shake':
        // thrashing about to throw off the turkeys clinging to it (and you, if you're too close)
        if (this.t >= 0.35 && this.latched.length) {
          this.shakeOff();
          g.audio.squelch();
          this.hurtAlong(1.4, 8, 5);
        }
        if (this.t >= TIME.shake) { this.state = 'lie'; this.t = 0; this.go('lie', 0.3); }
        break;
      case 'curl': {
        // its tip curls up off the deck... and snatches up whatever's near it
        this.tipSpot(_w);
        this.warn.show(_w, GRAB.r, this.t / TIME.curl, g.time);
        if (this.t < TIME.curl) break;
        this.warn.hide();
        this.grabT = rand(...GRAB.every);
        const got = this.tipTurkeys().slice(0, GRAB.max);
        got.forEach((t, i) => { t.grabbedBy(this, i); this.held.push(t); });
        if (this.hurtPlayerNear(_w, GRAB.r, 10, 5)) g.audio.squelch();
        if (this.held.length) {
          this.state = 'drag';
          this.t = 0;
          this.gripDmg = 0;
          this.go('haul', TIME.drag * 0.72);
          g.audio.squelch();
        } else {
          this.state = 'lie';
          this.t = 0;
          this.go('lie', 0.4);
        }
        break;
      }
      case 'drag': {
        // hauling them back over the side: break its grip before it gets them under
        if (this.t >= TIME.drag * HOLD && this.latched.length) this.shakeOff();
        if (this.toPose === 'haul' && this.t >= TIME.drag * 0.72) this.go('under', TIME.drag * 0.28, 'in');
        if (this.t < TIME.drag) break;
        const [rx, rz] = this.berth.root;
        this.at(rx, rz, SEA, _v);
        for (const t of this.held) {
          if (t.dead || t.holder !== this) continue;
          t.holder = null;
          t.pos.set(_v.x + rand(-0.6, 0.6), SEA, _v.z + rand(-0.6, 0.6));
          t.die('drown');
        }
        this.held.length = 0;
        g.fx.splash(_v.x, SEA, _v.z, 2.4);
        g.audio.sploosh();
        this.goUnder(rand(1, 1.8));
        break;
      }
      case 'recoil':
        if (this.t >= 0.6) { this.state = 'lie'; this.t = 0; this.grabT = rand(...GRAB.every); }
        break;
      case 'lift':
        // up off the deck again, to come down on whoever's in the way of it
        if (this.t >= TIME.lift) { this.state = 'poise'; this.t = TIME.lift; }
        break;
      case 'dive':
        // back over the side, and under, to come up somewhere else
        if (this.toPose === 'raised' && this.t >= 0.4) this.go('under', TIME.dive - 0.4);
        if (this.t >= TIME.dive) this.goUnder(rand(0.8, 1.6));
        break;
    }
  }

  /** beaten (sinking back into the harbour for good), or called off (see Cuttle.callOff): over the side it goes */
  away() {
    const g = this.game;
    if (this.state === 'sink' || this.state === 'leave') {
      if (this.toPose === 'raised' && this.t >= 0.35) this.go('under', TIME.sink - 0.35, 'in');
      if (this.t >= TIME.sink * 0.7 && !this.splashed) {
        this.splashed = true;
        const [rx, rz] = this.berth?.root ?? [0, 8];
        this.at(rx, rz, SEA, _v);
        g.fx.splash(_v.x, SEA, _v.z, 2.4);
        g.audio.sploosh();
      }
      if (this.t >= TIME.sink) this.dispose();
    }
  }

  /** up off the deck, to slam down again where it is (with the lane marked out first) */
  rear() {
    this.state = 'lift';
    this.t = 0;
    if (this.latched.length) this.shakeOff();
    this.go('raised', TIME.lift);
  }

  /** it's come down on the deck: anything in the way of it gets flattened, or sent flying */
  land() {
    const g = this.game, f = g.ferry;
    this.state = 'lie';
    this.t = 0;
    this.lane.hide();
    this.grabT = rand(...GRAB.first);
    this.slamT = rand(...SLAM.again);
    this.lonely = 0;
    let squash = Math.random() < 0.5;
    for (const t of this.inLane()) {
      if (squash) t.die('squash');
      else t.blastAway(this.nearPoint(t.pos, _v), rand(3, 4.5), 2.2);
      squash = !squash;
    }
    this.hurtAlong(SLAM.w, SLAM.hurt, 7, 0.45);
    // (wet and heavy: a slap you feel through the whole boat)
    this.pose('lie', this.want);
    const mid = this.want[5];
    f.jolt(mid.x, mid.z, 0.28);
    for (let k = 3; k < 8; k++) {
      const p = this.want[k];
      g.fx.burst(p, { glow: true, n: 5, colors: [0xffffff, 0xcfe3ee, 0xa9d4e6], speed: [1.5, 3.5], up: [2, 4], grav: 10, size: [0.05, 0.1], life: [0.4, 0.8] });
      g.fx.dust(p, 2);
    }
    g.fx.ring(mid, 0xfff3c4, 3.4, 0.45);
    g.audio.splat();
    g.shake(0.45);
  }

  /** back under the water, to come up again after `wait` seconds (somewhere else, if it likes) */
  goUnder(wait) {
    this.state = 'under';
    this.t = 0;
    this.wait = wait;
    this.last = this.berth; // (it'd rather come up somewhere else: see Cuttle.berthFor)
    this.berth = null;
    this.rig.root.visible = false;
    this.lane.hide();
    this.warn.hide();
  }

  /** called off (see Cuttle.callOff): lets go of everything and slides back into the water */
  leave() {
    if (!this.alive) return;
    this.letGo();
    this.shakeOff();
    this.alive = false;
    this.lane.hide();
    this.warn.hide();
    this.hideLabels();
    if (!this.berth) { this.dispose(); return; }
    this.state = 'leave';
    this.t = 0;
    this.go('raised', 0.35);
  }

  /* ---------------------------------------------------------------- who's where */
  /** the lane it'll come down along, marked out red (k: how far it's filled in) */
  showLane(k) {
    this.pose('lie', this.want);
    this.lane.show(this.game.ferry, this.want.slice(3), SLAM.w, k, this.game.time);
  }

  /** the nearest point on the deck to p along where it lies (or will), into out */
  nearPoint(p, out) {
    const L = this.berth.lie;
    let bd = Infinity;
    for (let k = 0; k < 4; k++) {
      this.at(L[k][0], L[k][1], 0, _u);
      const d = Math.hypot(_u.x - p.x, _u.z - p.z);
      if (d < bd) { bd = d; out.copy(_u); }
    }
    this.at(this.berth.over[0], this.berth.over[1], 0, _u);
    if (Math.hypot(_u.x - p.x, _u.z - p.z) < bd) out.copy(_u);
    return out;
  }

  /** how far p is from where it lies (or will), across the deck: from over the side out to its tip */
  laneDist(p) {
    const b = this.berth, pts = [b.over, ...b.lie];
    let bd = Infinity;
    for (let k = 1; k < pts.length; k++) {
      const [ax, az] = pts[k - 1], [bx, bz] = pts[k], fx = this.game.ferry.x;
      const x0 = fx + ax, z0 = LANE + az, ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez;
      const s = clamp(((p.x - x0) * ex + (p.z - z0) * ez) / l2, 0, 1);
      bd = Math.min(bd, Math.hypot(p.x - x0 - ex * s, p.z - z0 - ez * s));
    }
    return bd;
  }

  /** turkeys on the ground in the lane it's coming down along */
  inLane() { return this.game.turkeys.list.filter((t) => t.grounded && !t.dead && this.laneDist(t.pos) < SLAM.w + t.radius); }

  /** how many are in the way of it slamming down again (you count double) */
  inLaneCount() {
    const p = this.game.player;
    return this.inLane().length + (p.grounded && this.laneDist(p.pos) < SLAM.w + p.radius ? 2 : 0);
  }

  /** anybody within r of it (turkeys on the ground, or you)? */
  nearby(r) {
    const p = this.game.player;
    if (p.grounded && this.laneDist(p.pos) < r + 3) return true;
    return this.game.turkeys.list.some((t) => t.grounded && !t.dead && this.laneDist(t.pos) < r);
  }

  /** where its tip rests on the deck, into out */
  tipSpot(out) {
    const [x, z] = this.berth.lie[3];
    return this.at(x, z, this.deck(x, z), out);
  }

  /** turkeys on the ground near its tip, nearest first */
  tipTurkeys() {
    this.tipSpot(_w);
    return this.turkeysNear(_w, GRAB.r);
  }

  /** you, if you're within r of where it lies: `amount` off your health, and knocked back */
  hurtAlong(r, amount, knock, stun = 0.25) {
    const p = this.game.player;
    if (!p.grounded || this.laneDist(p.pos) >= r + p.radius) return false;
    return p.hurt(amount, this.nearPoint(p.pos, _u), { knock, stun });
  }

  /** you, if you're within r of p */
  hurtPlayerNear(p, r, amount, knock) { return this.hurtPlayer(p, r, amount, { knock, stun: 0.25 }, p); }

  dispose() {
    this.letGo();
    super.dispose();
    this.lane.dispose(this.game.scene);
    this.warn.dispose();
    this.tube.geo.dispose();
    this.suckers.dispose();
  }
}
