import * as THREE from 'three';
import { part, merge, tint, vcMesh, G, rand, randInt, pick, clamp, smoothstep, TAU } from './util.js';

/*
 * Birds going over, every so often: a mob of galahs, all pink and grey; a few sulphur-crested cockies,
 * screeching their heads off; or gulls, down by the water. They come across somewhere in front of you, low
 * enough to see (their shadows sweep over the ground under them), calling out as they pass (see Ambience's
 * screech). Anything solid in their way, a building or a grandstand, they go up and over; a gum tree, they fly
 * on through the leaves of.
 */
const EVERY = [35, 75]; // seconds from one lot going over to the next, give or take
const FIRST = [15, 30]; // seconds before the first lot, once you're playing
const HALF = 35; // metres they fly either side of where they cross your view (so they come and go well off it)
const LOW = 3.5; // metres off the ground, at the lowest
const ROOM = 3; // metres they keep off anything, side to side (the flock's spread, and their wings)
const OVER = 1.5; // metres they clear the top of anything solid by
const CLIMB = 0.55; // how steeply they go up and over something (metres up for every metre along)
const TALL = 3; // metres: anything lower than this, they don't give a second thought
const TRUNK = 0.5; // metres, about, from the middle of a tree to the outside of its trunk

// who goes over where (by zone): cockies and galahs, and gulls down by the water (and out on the harbour, the
// gulls keeping up with the ferry: see Ferry)
const WHO = [['cockatoo', 'galah'], ['galah', 'galah', 'cockatoo'], ['galah', 'galah', 'cockatoo'], ['gull'], ['gull'], [], ['gull', 'cockatoo'], ['gull', 'gull', 'cockatoo'], ['galah', 'cockatoo'], ['gull', 'gull', 'cockatoo'], ['gull', 'gull']];
// each kind: how big (times life size, so you can see them), how many, how fast (m/s), how they fly (wingbeats a
// second, how deep, and how much of the time they glide), how they bunch up (metres side to side, and from one to
// the next), and how many calls you hear as they go over
const KINDS = {
  galah: { scale: 1.4, n: [5, 9], speed: [6, 7.5], hz: 5.5, depth: 0.85, glide: 0.1, spread: 1.8, gap: 1.1, calls: [3, 5] },
  cockatoo: { scale: 1.3, n: [3, 5], speed: [5.5, 6.5], hz: 3.8, depth: 0.7, glide: 0.35, spread: 1.5, gap: 1.6, calls: [2, 4] },
  gull: { scale: 1.3, n: [2, 5], speed: [5, 6], hz: 2.8, depth: 0.55, glide: 0.5, spread: 2.2, gap: 1.8, calls: [1, 2] },
};
const _v = new THREE.Vector3(), _o = new THREE.Vector3(), _b = new THREE.Box3();

/* ---------------------------------------------------------------- the birds */
const PINK = 0xe0708c, CROWN = 0xf3c3cf, GREY = 0x9ba2a9, SLATE = 0x767d85, PALE = 0xc6cbd0, HORN = 0xe9e1d2;
const WHITE = 0xf6f6f1, SULPHUR = 0xf3cf3a, LEMON = 0xf2e6a8, BEAK = 0x2c2c2e;
const GULL = 0xbcc4ca, BLACK = 0x1c1c1c, RED = 0xd23a2e;
// (the patches of colour are painted onto one shape, not a second shape laid over it, so there's no flickering
// where the two would meet)
const cGrey = new THREE.Color(GREY), cPale = new THREE.Color(PALE), cCrown = new THREE.Color(CROWN);
const cLemon = new THREE.Color(LEMON), cGull = new THREE.Color(GULL);

// each kind, life size and facing +z: its body (head, tail and all), a wing reaching out along +x from the
// shoulder (the other one's the same, mirrored), and where the shoulders are
const MODELS = {
  galah: () => ({
    body: [
      // rose pink underneath (the face, the neck, the breast), soft grey over the back, and a pale grey rump
      tint(part(G.sphere(1, 14, 10), PINK, [0, 0, 0], [0, 0, 0], [0.063, 0.057, 0.13]), (x, y, z, c) => {
        c.lerp(cGrey, smoothstep(-0.006, 0.014, y)).lerp(cPale, smoothstep(-0.07, -0.1, z) * smoothstep(0.01, 0.03, y));
      }),
      part(G.box(0.06, 0.012, 0.13), SLATE, [0, 0.008, -0.17], [0.08, 0, 0]),
      // the head, with its pale pink cap and a little horn-coloured bill
      tint(part(G.sphere(1, 10, 8), PINK, [0, 0.024, 0.125], [0, 0, 0], [0.042, 0.042, 0.048]), (x, y, z, c) => c.lerp(cCrown, smoothstep(0.045, 0.058, y))),
      part(G.cone(0.015, 0.03, 8), HORN, [0, 0.012, 0.176], [Math.PI / 2 + 0.3, 0, 0]),
    ],
    wing: [
      part(G.sphere(1, 12, 6), GREY, [0.15, 0, -0.01], [0, 0.12, 0], [0.155, 0.012, 0.07]),
      part(G.sphere(1, 10, 6), SLATE, [0.28, -0.002, -0.035], [0, 0.35, 0], [0.09, 0.011, 0.045]), // (darker flight feathers)
    ],
    shoulder: [0.045, 0.025, 0.03],
  }),
  cockatoo: () => ({
    body: [
      part(G.sphere(1, 12, 9), WHITE, [0, 0, 0], [0, 0, 0], [0.075, 0.07, 0.155]),
      part(G.box(0.085, 0.014, 0.14), WHITE, [0, 0, -0.2], [0.06, 0, 0]),
      // the head, with its big dark bill, and the sulphur crest laid flat back while it flies
      part(G.sphere(1, 10, 8), WHITE, [0, 0.025, 0.15], [0, 0, 0], [0.052, 0.052, 0.058]),
      part(G.sphere(1, 8, 6), BEAK, [0, 0.008, 0.205], [0, 0, 0], [0.022, 0.026, 0.022]),
      part(G.cone(0.022, 0.1, 6), SULPHUR, [0, 0.085, 0.125], [-1.25, 0, 0]),
      part(G.cone(0.015, 0.08, 6), SULPHUR, [0.014, 0.08, 0.13], [-1.25, 0, -0.3]),
      part(G.cone(0.015, 0.08, 6), SULPHUR, [-0.014, 0.08, 0.13], [-1.25, 0, 0.3]),
    ],
    wing: [
      // (with a wash of lemon underneath)
      tint(part(G.sphere(1, 12, 6), WHITE, [0.2, 0, -0.01], [0, 0.1, 0], [0.2, 0.014, 0.09]), (x, y, z, c) => c.lerp(cLemon, smoothstep(0.002, -0.008, y))),
    ],
    shoulder: [0.055, 0.03, 0.035],
  }),
  gull: () => ({
    body: [
      // white, with a pale grey back
      tint(part(G.sphere(1, 14, 10), WHITE, [0, 0, 0], [0, 0, 0], [0.055, 0.052, 0.13]), (x, y, z, c) => c.lerp(cGull, smoothstep(0.018, 0.034, y) * smoothstep(0.07, 0.02, z))),
      part(G.box(0.06, 0.01, 0.1), WHITE, [0, 0.004, -0.16], [0.05, 0, 0]),
      // red legs, tucked back under the tail
      part(G.box(0.012, 0.012, 0.05), RED, [0.015, -0.03, -0.12]),
      part(G.box(0.012, 0.012, 0.05), RED, [-0.015, -0.03, -0.12]),
      // the head, and a red bill
      part(G.sphere(1, 10, 8), WHITE, [0, 0.022, 0.125], [0, 0, 0], [0.038, 0.038, 0.045]),
      part(G.cone(0.01, 0.05, 6), RED, [0, 0.016, 0.185], [Math.PI / 2 + 0.1, 0, 0]),
    ],
    wing: [
      part(G.sphere(1, 12, 6), GULL, [0.2, 0, -0.005], [0, 0.18, 0], [0.2, 0.01, 0.055]),
      part(G.sphere(1, 10, 6), BLACK, [0.38, -0.001, -0.04], [0, 0.4, 0], [0.075, 0.011, 0.03]), // black wingtips
      part(G.sphere(0.012, 6, 4), WHITE, [0.4, 0.008, -0.045]), // (with a white spot in them)
    ],
    shoulder: [0.045, 0.02, 0.03],
  }),
};

const geos = {};
function geo(kind) {
  if (geos[kind]) return geos[kind];
  const m = MODELS[kind]();
  return (geos[kind] = { body: merge(m.body), wing: merge(m.wing), shoulder: m.shoulder });
}

/** one bird, ready to fly: its body, and each wing on a pivot at the shoulder (flapping on z) */
export function makeBird(kind) {
  const g = geo(kind), root = new THREE.Group(), wingL = new THREE.Group(), wingR = new THREE.Group();
  root.rotation.order = 'YXZ'; // (which way it's headed, then nose up or down, then banking)
  const [x, y, z] = g.shoulder;
  wingL.position.set(x, y, z);
  wingR.position.set(-x, y, z);
  wingL.add(vcMesh(g.wing));
  const wr = vcMesh(g.wing);
  wr.scale.x = -1;
  wingR.add(wr);
  root.add(vcMesh(g.body), wingL, wingR);
  root.scale.setScalar(KINDS[kind].scale);
  return { kind, root, wingL, wingR };
}

/** the ground under x, z (or the water: nothing's below 0) */
const floor = (world, x, z) => Math.max(world.groundHeight(x, z), 0);

/* ---------------------------------------------------------------- flying over */
export class Flyovers {
  constructor(game) {
    this.game = game;
    this.t = rand(...FIRST); // (till the next lot)
    this.flock = null; // (the lot going over now)
    this.spare = {}; // kind -> birds that have been over, ready to go again
    this.tall = null; // (everything tall enough to fly into: see obstacles)
  }

  /** every frame: the lot going over (if there is one), and when it's time, the next */
  update(dt) {
    const g = this.game;
    if (!g.started) return;
    if (this.flock) { this.fly(dt); return; }
    if ((this.t -= dt) > 0 || g.wasted.active) return;
    this.t = this.send() ? rand(...EVERY) : rand(4, 8); // (no good way over from here: try again in a bit)
  }

  /** a lot of whatever flies round here (or `kind`), over in front of you; false if there's no clear way across */
  send(kind = pick(WHO[this.game.world.zoneOf(this.game.player.pos.x, this.game.player.pos.z)])) {
    if (this.flock || !kind) return false;
    const plan = this.plan();
    if (!plan) return false;
    const def = KINDS[kind], pool = (this.spare[kind] ??= []), n = randInt(...def.n), birds = [];
    for (let i = 0; i < n; i++) {
      const rig = pool.pop() ?? makeBird(kind);
      this.game.scene.add(rig.root);
      birds.push({
        rig,
        back: -i * def.gap * rand(0.6, 1.4), // (how far behind the leader)
        side: rand(-1, 1) * def.spread, up: rand(-0.6, 0.6),
        // (each weaving about a little, and drifting up and down, in its own time)
        wHz: rand(0.18, 0.35) * TAU, wA: rand(0.2, 0.6), wPh: rand(0, TAU),
        bHz: rand(0.3, 0.6) * TAU, bA: rand(0.1, 0.3), bPh: rand(0, TAU),
        flap: rand(0, TAU), hz: def.hz * rand(0.9, 1.1) * TAU, amp: 1, glideT: 0, flapT: rand(0.5, 2.5),
      });
    }
    const speed = rand(...def.speed), mid = birds.reduce((s, b) => s + b.back, 0) / n;
    // (the calls, as the middle of the flock goes across in front of you)
    const over = (HALF - mid) / speed, calls = [];
    for (let i = randInt(...def.calls); i > 0; i--) calls.push(over + rand(-1.6, 1.2));
    this.flock = { kind, def, birds, speed, t: 0, calls: calls.sort((a, b) => a - b), ...plan };
    this.fly(0);
    return true;
  }

  /** the flock, on its way over */
  fly(dt) {
    const f = this.flock, { def, dx, dz } = f;
    f.t += dt;
    let gone = true;
    for (const b of f.birds) {
      const s = f.t * f.speed + b.back;
      if (s < f.len + 2) gone = false;
      // (a few wingbeats, then a glide, now and then: the gulls glide most)
      if (b.glideT > 0) {
        if ((b.glideT -= dt) <= 0) b.flapT = rand(0.8, 2.5);
      } else if ((b.flapT -= dt) <= 0) {
        if (Math.random() < def.glide) b.glideT = rand(0.4, 1.2);
        else b.flapT = rand(0.8, 2.5);
      }
      b.amp = clamp(b.amp + (b.glideT > 0 ? -dt : dt) * 4, 0, 1);
      b.flap += dt * b.hz * (0.4 + b.amp * 0.6);
      // (weaving side to side: it turns into it, and banks)
      const w = f.t * b.wHz + b.wPh, side = b.side + Math.sin(w) * b.wA;
      const drift = Math.cos(w) * b.wA * b.wHz, pull = -Math.sin(w) * b.wA * b.wHz * b.wHz;
      const alt = this.altAt(f, s), climb = this.altAt(f, s + 0.5) - this.altAt(f, s - 0.5);
      const r = b.rig.root;
      r.position.set(
        f.ax + dx * s - dz * side,
        alt + b.up + Math.sin(f.t * b.bHz + b.bPh) * b.bA - Math.sin(b.flap) * b.amp * 0.035 * def.scale,
        f.az + dz * s + dx * side,
      );
      r.rotation.set(-Math.atan(climb) * 0.8, f.heading - Math.atan2(drift, f.speed), Math.atan(pull / 9.8));
      const flap = 0.12 + def.depth * b.amp * Math.sin(b.flap);
      b.rig.wingL.rotation.z = flap;
      b.rig.wingR.rotation.z = -flap;
    }
    while (f.calls.length && f.t >= f.calls[0]) { f.calls.shift(); this.call(); }
    if (gone) this.land();
  }

  /** one of them calls out as they go over (heard off to whichever side of the screen it's on) */
  call() {
    const f = this.flock, b = pick(f.birds);
    _v.copy(b.rig.root.position).project(this.game.camera);
    this.game.ambience.screech(f.kind, clamp(_v.x, -1, 1) * 0.9);
  }

  /** they've gone: put them away till next time */
  land() {
    for (const { rig } of this.flock.birds) {
      this.game.scene.remove(rig.root);
      this.spare[rig.kind].push(rig);
    }
    this.flock = null;
  }

  /** how high they fly, `s` metres along the way */
  altAt(f, s) {
    const k = clamp(s, 0, f.len), i = Math.min(Math.floor(k), f.len - 1), u = k - i;
    return f.alt[i] + (f.alt[i + 1] - f.alt[i]) * u;
  }

  /* ---------------------------------------------------------------- the way over */
  /**
   * Where they'll go: a line across your view, crossing it up in the top half of the screen, and how high
   * they'll be all along it (up and over anything solid in the way). null if, every way it tries, they'd hit a
   * tree trunk or have to go up out of sight to get over something while you can see them (in the city, say,
   * with buildings all round)
   */
  plan() {
    const g = this.game, cam = g.camera, world = g.world, { solid, trees } = this.obstacles(), len = HALF * 2;
    const need = new Float32Array(len + 1);
    cam.updateMatrixWorld();
    for (let tries = 0; tries < 16; tries++) {
      // (a spot up in the top half of the screen, a way out in front of the camera)
      _v.set(rand(-0.3, 0.3), rand(0.25, 0.65), 0.5).unproject(cam).sub(cam.position).normalize();
      const out = Math.max(6, g.cam.dist * rand(0.55, 0.95)), seen = Math.min(25, out * 0.9 + 1);
      _o.copy(cam.position).addScaledVector(_v, out);
      const cruise = Math.max(_o.y, floor(world, _o.x, _o.z) + LOW);
      // (across the screen, give or take, one way or the other; or failing that, any which way)
      const a = tries < 10 ? -g.cam.yaw + rand(-0.45, 0.45) + (Math.random() < 0.5 ? Math.PI : 0) : rand(0, TAU);
      const dx = Math.cos(a), dz = Math.sin(a), ax = _o.x - dx * HALF, az = _o.z - dz * HALF, bx = _o.x + dx * HALF, bz = _o.z + dz * HALF;
      // (they fly on through the leaves of a tree, in one side and out the other, but nowhere near its trunk
      // while you can see them: off out of sight, nobody's to know)
      const trunk = trees.some(([x, z, top]) => {
        if (top < cruise - 1) return false; // (it's under them)
        const u = clamp((x - ax) * dx + (z - az) * dz, HALF - seen, HALF + seen);
        return Math.hypot(ax + dx * u - x, az + dz * u - z) < ROOM + TRUNK;
      });
      if (trunk) continue;
      // how high they need to be all along: off the ground, and over anything solid near the line
      const x0 = Math.min(ax, bx) - ROOM, x1 = Math.max(ax, bx) + ROOM, z0 = Math.min(az, bz) - ROOM, z1 = Math.max(az, bz) + ROOM;
      const near = solid.filter(([minX, maxX, minZ, maxZ]) => maxX > x0 && minX < x1 && maxZ > z0 && minZ < z1);
      for (let k = 0; k <= len; k++) {
        const x = ax + dx * k, z = az + dz * k;
        let h = floor(world, x, z) + LOW;
        for (const [minX, maxX, minZ, maxZ, top] of near) {
          if (x > minX - ROOM && x < maxX + ROOM && z > minZ - ROOM && z < maxZ + ROOM) h = Math.max(h, top + OVER);
        }
        need[k] = h;
      }
      // (going up ahead of anything, and back down after)
      const alt = new Float32Array(len + 1);
      let up = 0;
      for (let k = 0; k <= len; k++) {
        let h = cruise;
        for (let j = 0; j <= len; j++) h = Math.max(h, need[j] - Math.abs(k - j) * CLIMB);
        alt[k] = h;
        if (Math.abs(k - HALF) <= seen) up = Math.max(up, h - cruise);
      }
      // (no good if they'd have to go up out of sight to get over something, while you can see them)
      if (up < 1.5) return { ax, az, dx, dz, len, alt, heading: Math.atan2(dx, dz) };
    }
    return null;
  }

  /**
   * Everything tall enough to fly into, gathered up the first time it's wanted. `solid`: buildings, stands,
   * the pavilion and so on, as boxes [x0, x1, z0, z1, top], that they go up and over. `trees`: [x, z, top],
   * that they fly on through, so long as they keep off the trunk. Not the ground, the sea or the sky: they're
   * big every which way (and the ground's looked after on its own)
   */
  obstacles() {
    if (this.tall) return this.tall;
    const { scene, world } = this.game, isTree = new Set(world.swayers.map((s) => s.m)), solid = [], trees = [];
    scene.updateMatrixWorld();
    scene.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || !o.frustumCulled || o.userData.moves) return; // (nor the ferry, or the boats on the harbour)
      const geo = o.geometry;
      if (!geo.boundingBox) geo.computeBoundingBox();
      _b.copy(geo.boundingBox).applyMatrix4(o.matrixWorld);
      if (_b.max.y < TALL || (_b.max.x - _b.min.x > 30 && _b.max.z - _b.min.z > 30)) return;
      if (!isTree.has(o)) solid.push([_b.min.x, _b.max.x, _b.min.z, _b.max.z, _b.max.y]);
      else {
        o.getWorldPosition(_v);
        trees.push([_v.x, _v.z, _b.max.y]);
      }
    });
    return (this.tall = { solid, trees });
  }
}
