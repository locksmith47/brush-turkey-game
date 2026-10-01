import * as THREE from 'three';
import { part, merge, vcMesh, tint, G, limb, rand, hash, lerp, smoothstep, clamp, TAU, toonMat, canvasTexture } from '../util.js';
import { chipsGeo } from './wharf.js';
import { makeBird } from '../flyover.js';

/*
 * The Opera House, out on Bennelong Point, round the corner from the Quay. Through the gap in the railing at the
 * end of the Quay, the broadwalk runs along the harbour side of it, under the granite podium and past the bar, and
 * comes out on a terrace at the far end, with steps down off it into the water. That's where Benny lives: a fur
 * seal, as friendly as they come, lying about on the bottom step in the sun (see Seal).
 *
 * Up on the podium, the sails: two rows of shells, the Concert Hall's and the theatre's behind it, nested one
 * inside the next, each a pair of curved halves meeting along a ridge, tiled white, with glass hung under their open
 * ends; and the restaurant's two little ones, by the Monumental Steps, which come down off the end of it towards
 * the Quay. Gulls hang about the broadwalk after the chips, and wheel about overhead.
 */
export const PODIUM = { x0: 322, x1: 350, z0: -280, z1: -254, top: 3 };
const STAIRS = { n: 12, x1: 356 }; // the Monumental Steps: down off the end of the podium, all the way across it, to the Quay
/** the broadwalk, along the harbour side of the podium (rising from the Quay's level to the terrace's: see walkY) */
export const WALK = { x0: 314.5, x1: 356, z0: -254, z1: -245 };
const LOW = 0.35, HIGH = 1; // m: the broadwalk's level at the Quay end, and at the far end (and the terrace's)
/** the terrace, off the end of the podium */
export const TERRACE = { x0: 314.5, x1: 322, z0: -268, z1: -245 };
/**
 * Benny's steps, down off the end of the terrace into the water, from `top`: `n` drops of `rise` m, each tread
 * `tread` m deep, the last onto the bottom step (from `low` out to its edge at `bottom`, just clear of the water)
 */
export const STEPS = { top: 314.5, n: 5, rise: 0.22, tread: 0.7, low: 311.7, bottom: 309.3, z0: -266, z1: -247 };
const BOTTOM_Y = HIGH - STEPS.n * STEPS.rise;
// gulls on the broadwalk, after the chips (at the bar, and on round towards the steps): [x, z, how many]
export const OPERA_GULLS = [[346, -248.4, 2], [331, -249.4, 2]];
// the bar's tables, out on the broadwalk under their umbrellas (see main.js): [x, z]
export const OPERA_BAR = [[341.5, -252.3], [346, -252.3], [350.5, -252.3]];
// and Benny, on the bottom step: [x, z, which way he's facing] (up the steps, and half round to see who's coming)
export const BENNY = [310.3, -256.6, 1.12];
// spots on the steps to lie about in the sun with him: on the bottom step either side of him, and up the steps behind
const SUNNY = [
  [310.6, -253.4], [310.2, -260.1], [310.9, -251.4], [309.9, -262.3],
  [312.05, -254.9], [312.05, -258.6], [312.05, -252.5], [312.75, -256.4], [312.75, -260.3],
  [313.45, -254.2], [313.45, -258.1], [314.15, -256.2],
];
// gulls wheeling about overhead, round and round: [x, z] round which, how far out, how high, and which way round
const WHEELING = [[321, -252, 8, 7.5, 1], [337, -249, 10, 9, -1], [312, -257, 6, 6.5, 1], [348, -250, 7, 10, -1]];

/** the broadwalk's level at x: the Quay's at the near end, up a gentle slope to the terrace's */
const walkY = (x) => lerp(LOW, HIGH, smoothstep(350, 330, x));

/** the ground round the Opera House: the broadwalk and the terrace, and down Benny's steps (past them, the harbour) */
export function operaGround(x) {
  if (x >= STEPS.top) return walkY(x);
  if (x < STEPS.bottom) return -1.2;
  const d = (STEPS.top - x) / STEPS.tread, i = Math.min(Math.floor(d), STEPS.n - 1);
  return HIGH - STEPS.rise * (i + smoothstep(0, 0.12, d - i));
}

/** is (x, z) on Benny's steps? (a suntrap: see World.sunTrap) */
export const onSteps = (x, z) => x > STEPS.bottom && x < STEPS.top && z > STEPS.z0 && z < STEPS.z1;

// the lie of the land (see Track): along the broadwalk, round the corner onto the terrace, and down the steps
export const OPERA_TRACK = {
  nodes: { walk: [340, -249.5], corner: [318, -249.5], terrace: [318, -260], steps: [314.8, -256.5] },
  rooms: [
    { rect: [WALK.x0, WALK.z0, WALK.x1, WALK.z1], nodes: ['walk', 'corner'] },
    { rect: [TERRACE.x0, TERRACE.z0, TERRACE.x1, TERRACE.z1], nodes: ['corner', 'terrace', 'steps'] },
    { rect: [STEPS.bottom, STEPS.z0, STEPS.top + 1.5, STEPS.z1], nodes: ['steps'] }, // (well up onto the terrace: room to get from one to the other)
  ],
};

/* ------------------------------------------------------------------ building bits */
/** a box from x0 to x1 and z0 to z1, its top following top(x), down to `bottom` (a number, or another of the same) */
function ramp(x0, x1, z0, z1, top, bottom, color) {
  const n = Math.max(1, Math.ceil((x1 - x0) / 0.5)), lo = typeof bottom === 'number' ? () => bottom : bottom;
  const g = new THREE.BoxGeometry(x1 - x0, 1, z1 - z0, n, 1, 1).translate((x0 + x1) / 2, 0.5, (z0 + z1) / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) > 0.5 ? top(p.getX(i)) : lo(p.getX(i)));
  return part(g, color);
}

/**
 * Paving over [x0, z0, x1, z1], just proud of the ground at y(x): slabs two `cell`s long, every other row along by
 * one, each its own shade of `tones`
 */
function paving([x0, z0, x1, z1], y, cell, tones) {
  const nx = Math.round((x1 - x0) / cell), nz = Math.round((z1 - z0) / cell), cw = (x1 - x0) / nx, cd = (z1 - z0) / nz; // (each square, as it comes out)
  const g = part(new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, 0, (z0 + z1) / 2), tones[0]);
  const p = g.attributes.position, c = g.attributes.color, col = new THREE.Color();
  for (let i = 0; i < p.count; i++) p.setY(i, y(p.getX(i)) + 0.03);
  for (let i = 0; i < p.count; i += 3) {
    const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    const row = Math.floor((cz - z0) / cd), slab = Math.floor((Math.floor((cx - x0) / cw) + (row % 2)) / 2);
    col.set(tones[Math.floor(hash(slab, row, 3) * tones.length)]);
    for (let k = 0; k < 3; k++) c.setXYZ(i + k, col.r, col.g, col.b);
  }
  return g;
}

const BLUE = 0x2f6fb0;
/** the blue iron railing (like the Quay's) from (ax, az) to (bx, bz), standing on the ground as it goes (y(x): its height) */
function railing(p, ax, az, bx, bz, y) {
  const len = Math.hypot(bx - ax, bz - az), posts = Math.max(2, Math.round(len / 1.6) + 1);
  const at = (k) => [ax + (bx - ax) * k, az + (bz - az) * k];
  let last = null;
  for (let i = 0; i < posts; i++) {
    const [x, z] = at(i / (posts - 1)), g = y(x);
    p.push(part(G.box(0.09, 1.2, 0.09), BLUE, [x, g + 0.6, z]), part(G.sphere(0.07, 8, 6), BLUE, [x, g + 1.25, z]));
    if (last) for (const h of [0.3, 0.72, 1.15]) p.push(limb([last[0], last[2] + h, last[1]], [x, g + h, z], 0.03, 0.03, BLUE, 6));
    last = [x, z, g];
  }
  for (let d = 0.2; d < len - 0.1; d += 0.2) {
    const [x, z] = at(d / len);
    p.push(part(G.cyl(0.012, 0.012, 0.42, 4), BLUE, [x, y(x) + 0.51, z]));
  }
}

/** a lamp along the broadwalk: a tall bronze post, and a lantern hung off the top of it (over the walk: +x) */
function lampGeo() {
  const BRONZE = 0x4a4036;
  return merge([
    part(G.cyl(0.13, 0.16, 0.3, 8), BRONZE, [0, 0.15, 0]),
    part(G.cyl(0.05, 0.07, 3.7, 8), BRONZE, [0, 2.0, 0]),
    limb([0, 3.75, 0], [0.45, 3.95, 0], 0.035, 0.03, BRONZE, 6),
    part(G.cyl(0.2, 0.2, 0.06, 10), BRONZE, [0.5, 3.92, 0]),
    part(G.cyl(0.15, 0.1, 0.32, 10), 0xfff3c4, [0.5, 3.73, 0]),
  ]);
}

/** a table outside the bar, and a couple of chairs pulled up to it (the umbrella goes up through the middle) */
function tableGeo() {
  const IRON = 0x3a3a38, SEAT = 0x9a7b55, p = [
    part(G.cyl(0.5, 0.5, 0.05, 16), 0xece7dc, [0, 0.74, 0]),
    part(G.cyl(0.04, 0.05, 0.72, 6), IRON, [0, 0.37, 0]),
    part(G.cyl(0.26, 0.3, 0.04, 10), IRON, [0, 0.02, 0]),
  ];
  for (const a of [0.9, 0.9 + Math.PI]) {
    const sx = Math.sin(a), sz = Math.cos(a), cx = sx * 0.78, cz = sz * 0.78;
    p.push(part(G.box(0.44, 0.05, 0.42), SEAT, [cx, 0.45, cz], [0, a, 0]));
    p.push(part(G.box(0.44, 0.42, 0.05), SEAT, [cx + sx * 0.2, 0.7, cz + sz * 0.2], [-0.12, a, 0]));
    for (const [lx, lz] of [[-0.18, -0.17], [0.18, -0.17], [-0.18, 0.17], [0.18, 0.17]]) {
      p.push(part(G.box(0.03, 0.45, 0.03), IRON, [cx + lx * Math.cos(a) + lz * sx, 0.22, cz - lx * Math.sin(a) + lz * sz]));
    }
  }
  return merge(p);
}

/** a painted sign's face (a plane `w` by `h`, its canvas drawn by `draw`), facing +z */
function signFace(w, h, draw, px = 512) {
  const tex = canvasTexture(px, Math.round((px * h) / w), draw);
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), toonMat({ map: tex }));
}

/* ------------------------------------------------------------------ the sails */
// the shells, each standing on its two feet `w` either side of z at x, facing `dir` (-1: out over the harbour, +1:
// back towards the Quay), its tip `h` up and leaning `lean` out past its feet, and its ridge running back `back`
// past them, down to `tail` up at the back: the Concert Hall's, the theatre's behind it (a bit smaller) and the
// restaurant's. Each one's back is tucked in under the next one along, the next one up
const shells = (z, k, list) => list.map(([x, h, w, lean, back, tail, dir = -1]) => ({ x, z, h: h * k, w: w * k, lean: lean * k, back: back * k, tail: tail * k, dir }));
const SAILS = [
  ...shells(-261.5, 1, [[327, 6.2, 4.2, 2.6, 4.6, 2.2], [331.2, 8.2, 4.6, 3.2, 5, 2.8], [335.6, 10.2, 5, 3.8, 5.4, 3.4], [340, 11.6, 5, 4.2, 4.4, 4], [344.4, 8, 4.6, 2.2, 3.4, 3.6, 1]]),
  ...shells(-273.5, 0.86, [[328.4, 6.2, 4.2, 2.6, 4.6, 2.2], [332.1, 8.2, 4.6, 3.2, 5, 2.8], [335.9, 10.2, 5, 3.8, 5.4, 3.4], [339.7, 11.6, 5, 4.2, 4.4, 4], [343.5, 8, 4.6, 2.2, 3.4, 3.6, 1]]),
  ...shells(-257.2, 1, [[347.3, 3.4, 1.5, 0.9, 1.4, 1.4], [348.6, 2.8, 1.4, 0.8, 1.3, 1.3, 1]]),
];
const NU = 22, NV = 10; // (how finely a shell's worked out: along its ridge, and down each side)
const TILE = [0xf8f7f2, 0xefebe1].map((c) => new THREE.Color(c)), RIB = new THREE.Color(0xe3ddcc), EDGE = new THREE.Color(0xe9e3d3);
const DUSK = new THREE.Color(0xd6cfbe), GLASS = [0x5b4735, 0x6b5541].map((c) => new THREE.Color(c));

/**
 * A point on a shell's side `s` (±1), u along the ridge from the tip (0) to the back (1), v down from the ridge (0)
 * to its foot on the podium (1): out to the side and down, bulging out, and (at the front) sweeping up and out to
 * the tip
 */
function shellAt(sh, s, u, v, o) {
  const { x, z, w, h, lean, back, tail, dir } = sh, top = PODIUM.top;
  const rx = x + dir * (lean - (lean + back) * u), ry = top + h - (h - tail) * (0.35 * u + 0.65 * u * u);
  const hx = x - dir * back * u, hw = w * (1 - 0.18 * u);
  return o.set(hx + (rx - hx) * (1 - v) ** 2, ry + (top - ry) * v, z + s * hw * (1 - (1 - v) ** 2));
}

/** the sails, as one geometry (merged like any other, bar that it's built up a triangle at a time) */
function sailsGeo() {
  const pos = [], nor = [], col = [], _a = new THREE.Vector3(), _b = new THREE.Vector3(), c = new THREE.Color();
  const tri = (pts, ns, color) => pts.forEach((p, i) => { pos.push(p.x, p.y, p.z); nor.push(ns[i].x, ns[i].y, ns[i].z); col.push(color.r, color.g, color.b); });
  for (const sh of SAILS) {
    for (const s of [-1, 1]) {
      // the points, and which way the shell faces at each (outwards, away from under it)
      const pts = [], ns = [];
      for (let i = 0; i <= NU; i++) {
        for (let j = 0; j <= NV; j++) {
          const u = i / NU, v = j / NV, p = shellAt(sh, s, u, v, new THREE.Vector3());
          shellAt(sh, s, Math.min(1, u + 0.01), v, _a).sub(shellAt(sh, s, Math.max(0, u - 0.01), v, _b));
          const n = shellAt(sh, s, u, Math.min(1, v + 0.01), new THREE.Vector3()).sub(shellAt(sh, s, u, Math.max(0, v - 0.01), _b)).cross(_a).normalize();
          if (n.y * (p.y - PODIUM.top) + n.z * (p.z - sh.z) < 0) n.negate();
          pts.push(p);
          ns.push(n);
        }
      }
      // tiled: white and cream in bands down the sides, a rib every so often, the edge round the front, and a
      // little greyer down towards the feet
      for (let i = 0; i < NU; i++) {
        for (let j = 0; j < NV; j++) {
          c.copy(i === 0 ? EDGE : i % 4 === 0 || j === 0 ? RIB : TILE[j % 2]).lerp(DUSK, ((j + 0.5) / NV) ** 3 * 0.5);
          const a = i * (NV + 1) + j, b = a + NV + 1;
          tri([pts[a], pts[b], pts[b + 1]], [ns[a], ns[b], ns[b + 1]], c);
          tri([pts[a], pts[b + 1], pts[a + 1]], [ns[a], ns[b + 1], ns[a + 1]], c);
        }
      }
      // the glass hung under the front of it, folding out to the tip, in panes
      for (let j = 0; j < NV; j++) {
        const a = pts[j].clone(), b = pts[j + 1].clone();
        for (const q of [a, b]) {
          q.x -= sh.dir * 0.3;
          q.z = sh.z + (q.z - sh.z) * 0.96;
        }
        const a0 = a.clone().setY(PODIUM.top), b0 = b.clone().setY(PODIUM.top);
        const n = _a.subVectors(b, a).cross(_b.set(0, -1, 0)).normalize();
        if (n.x * sh.dir < 0) n.negate();
        tri([a0, b0, b], [n, n, n], GLASS[j % 2]);
        tri([a0, b, a], [n, n, n], GLASS[j % 2]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

/* ------------------------------------------------------------------ build */
export function buildOpera(world) {
  const s = world.scene, { x0, x1, z0, z1, top } = PODIUM, zc = (z0 + z1) / 2;

  // --- the podium: pink granite, in courses, with the doors and the bar's glass along the broadwalk side, and the
  // Monumental Steps down off the end of it
  const pod = [
    part(G.box(x1 - x0, top + 1.2, z1 - z0), 0xc3ab8f, [(x0 + x1) / 2, (top - 1.2) / 2, zc]),
    part(G.box(x1 - x0 + 0.3, 0.2, z1 - z0 + 0.3), 0xd5c7ae, [(x0 + x1) / 2, top - 0.08, zc]), // (the lip round the top)
    part(G.box(x1 - x0 - 0.4, 0.04, z1 - z0 - 0.4), 0xd9cdb6, [(x0 + x1) / 2, top + 0.02, zc]),
  ];
  for (const y of [1.75, 2.45]) pod.push(part(G.box(x1 - x0, 0.06, 0.04), 0xb19980, [(x0 + x1) / 2, y, z1 + 0.01]), part(G.box(0.04, 0.06, z1 - z0), 0xb19980, [x0 - 0.01, y, zc]));
  const doorway = (x, w, h) => {
    const y = walkY(x);
    pod.push(part(G.box(w + 0.24, h + 0.12, 0.05), 0x8a6a3a, [x, y + (h + 0.12) / 2, z1 + 0.03]), part(G.box(w, h, 0.05), 0x2c3a4a, [x, y + h / 2, z1 + 0.05]));
    for (let k = 1; k < Math.round(w / 1.2); k++) pod.push(part(G.box(0.06, h, 0.06), 0x8a6a3a, [x - w / 2 + (k * w) / Math.round(w / 1.2), y + h / 2, z1 + 0.07]));
  };
  for (const x of [325.5, 330.5, 335.5]) doorway(x, 2.2, 2);
  doorway(344.5, 8.4, 1.9); // (the bar)
  pod.push(part(G.box(9.2, 0.12, 1.1), 0x2e3a33, [344.5, walkY(344.5) + 2.15, z1 + 0.5], [0.12, 0, 0])); // (and its awning)
  pod.push(part(G.box(0.05, 1.6, 5), 0x2c3a4a, [x0 - 0.02, HIGH + 0.8, -260]), part(G.box(0.04, 1.72, 5.24), 0x8a6a3a, [x0 - 0.01, HIGH + 0.86, -260]));
  const stair = (STAIRS.x1 - x1) / STAIRS.n;
  for (let i = 0; i < STAIRS.n; i++) {
    const y = top - ((i + 1) * (top - LOW)) / STAIRS.n;
    pod.push(part(G.box(stair, y + 1.2, z1 - z0), i % 2 ? 0xc9bba1 : 0xbfb097, [x1 + (i + 0.5) * stair, (y - 1.2) / 2, zc]));
  }
  s.add(vcMesh(merge(pod), { cast: true, receive: true }));

  // --- the sails
  const sails = new THREE.Mesh(sailsGeo(), toonMat({ vertexColors: true, side: THREE.DoubleSide }));
  sails.castShadow = sails.receiveShadow = true;
  s.add(sails);
  world.addOccluder(sails);

  // --- the broadwalk and the terrace: granite paving, on the sea wall, with the railing along the edge of the water
  const walk = [
    ramp(TERRACE.x1, WALK.x1, WALK.z0, WALK.z1, walkY, -1.6, 0xb9a27a),
    part(G.box(TERRACE.x1 - TERRACE.x0, HIGH + 1.6, TERRACE.z1 - TERRACE.z0), 0xb9a27a, [(TERRACE.x0 + TERRACE.x1) / 2, (HIGH - 1.6) / 2, (TERRACE.z0 + TERRACE.z1) / 2]),
    ramp(TERRACE.x0, WALK.x1, WALK.z1 - 0.15, WALK.z1 + 0.25, (x) => walkY(x) + 0.08, (x) => walkY(x) - 0.12, 0xcdbb95), // (the coping)
    paving([WALK.x0 - 0.1, WALK.z0, WALK.x1, WALK.z1], walkY, 0.75, [0xd3c8b3, 0xcbbfa8, 0xd8cdb9, 0xc6b9a1]),
    paving([TERRACE.x0 - 0.1, TERRACE.z0, TERRACE.x1, WALK.z0], walkY, 0.75, [0xd3c8b3, 0xcbbfa8, 0xd8cdb9, 0xc6b9a1]),
  ];
  const rails = [];
  const ry = (x) => walkY(x) + 0.03;
  railing(rails, WALK.x1, WALK.z1 - 0.1, TERRACE.x0 + 0.1, WALK.z1 - 0.1, ry);
  railing(rails, TERRACE.x0 + 0.1, WALK.z1 - 0.1, TERRACE.x0 + 0.1, STEPS.z1 + 0.4, ry);
  railing(rails, TERRACE.x0 + 0.1, STEPS.z0 - 0.4, TERRACE.x0 + 0.1, TERRACE.z0 + 0.1, ry);
  railing(rails, TERRACE.x0 + 0.1, TERRACE.z0 + 0.1, TERRACE.x1, TERRACE.z0 + 0.1, ry);
  for (const [ax, az, bx, bz] of [
    [WALK.x1, WALK.z1, TERRACE.x0, WALK.z1], [TERRACE.x0, WALK.z1, TERRACE.x0, STEPS.z1 + 0.4],
    [TERRACE.x0, STEPS.z0 - 0.4, TERRACE.x0, TERRACE.z0], [TERRACE.x0, TERRACE.z0, TERRACE.x1, TERRACE.z0],
  ]) world.addSegment(ax, az, bx, bz, 0.25, true);

  // --- Benny's steps, down off the end of the terrace into the water: sandstone, worn smooth along the edges, the
  // bottom one dark where the wash comes up over it and green with weed at the water's edge; a low wall either side
  const st = [], { rise, tread, low, bottom } = STEPS, sz = (STEPS.z0 + STEPS.z1) / 2, sw = STEPS.z1 - STEPS.z0;
  for (let k = 1; k < STEPS.n; k++) {
    const y = HIGH - rise * k, x = STEPS.top - tread * (k - 0.5);
    st.push(part(G.box(tread, y + 1.6, sw), k % 2 ? 0xd2b27c : 0xc9a874, [x, (y - 1.6) / 2, sz]));
    st.push(part(G.box(0.1, 0.02, sw), 0xdec594, [x - tread / 2 + 0.05, y + 0.01, sz]));
  }
  const wet = new THREE.Color(0x9c8460);
  st.push(tint(part(new THREE.BoxGeometry(low - bottom, BOTTOM_Y + 1.6, sw, 6, 1, 1), 0xc9a874, [(low + bottom) / 2, (BOTTOM_Y - 1.6) / 2, sz]), (x, y, z, c) => c.lerp(wet, smoothstep(low - 0.8, bottom + 0.2, x) * 0.8)));
  st.push(part(G.box(0.04, 0.42, sw), 0x5f6e3e, [bottom - 0.02, BOTTOM_Y - 0.22, sz]), part(G.box(0.8, 1.3, sw), 0x7d7350, [bottom - 0.4, -0.36 - 0.65, sz]));
  const cheek = (x) => Math.max(BOTTOM_Y, HIGH - ((STEPS.top - x) * rise) / tread) + 0.5;
  for (const [a, b] of [[STEPS.z0 - 0.4, STEPS.z0], [STEPS.z1, STEPS.z1 + 0.4]]) {
    st.push(ramp(bottom - 0.8, STEPS.top, a, b, cheek, -1.6, 0xbf9d6a), ramp(bottom - 0.85, STEPS.top, a - 0.03, b + 0.03, (x) => cheek(x) + 0.06, cheek, 0xcfb385));
    world.addSegment(bottom - 0.8, (a + b) / 2, STEPS.top, (a + b) / 2, 0.2, false);
  }
  const steps = vcMesh(merge([...walk, ...st]), { cast: true, receive: true });
  s.add(steps, vcMesh(merge(rails), { cast: true, receive: false }));

  // --- along the broadwalk: lamps, the bar's tables (their umbrellas are toys: see main.js), and the chips the
  // gulls are after
  const lamp = lampGeo(), table = tableGeo(), chips = chipsGeo(), bits = [];
  for (const x of [320, 329, 338, 347]) {
    bits.push(lamp.clone().translate(x, walkY(x), WALK.z1 - 0.7));
    world.colliders.push({ x, z: WALK.z1 - 0.7, r: 0.2 });
  }
  for (const [x, z] of OPERA_BAR) {
    bits.push(table.clone().rotateY(rand(-0.4, 0.4)).translate(x, walkY(x), z));
    world.colliders.push({ x, z, r: 0.95 });
  }
  for (const [x, z] of OPERA_GULLS) bits.push(chips.clone().rotateY(rand(0, TAU)).translate(x, walkY(x) + 0.035, z));
  s.add(vcMesh(merge(bits), { cast: true, receive: true }));
  for (const g of [lamp, table, chips]) g.dispose();

  // --- the sign at the top of Benny's steps
  const SX = TERRACE.x0 + 0.9, SZ = WALK.z1 - 0.9;
  const sign = signFace(1.8, 1.1, (c, w, h) => {
    c.fillStyle = '#4b3621'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#efe3c2'; c.lineWidth = 8; c.strokeRect(12, 12, w - 24, h - 24);
    c.fillStyle = '#efe3c2'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `bold ${Math.round(h * 0.2)}px sans-serif`; c.fillText('SEAL RESTING', w / 2, h * 0.32);
    c.font = `${Math.round(h * 0.11)}px sans-serif`;
    c.fillText("Benny's having a lie-down.", w / 2, h * 0.57);
    c.fillText('Please give him some room', w / 2, h * 0.73);
  });
  const post = (k) => part(G.box(0.1, 1.9, 0.1), 0x3a2a1a, [k * 0.8, 0.95, -0.06]);
  const board = new THREE.Group();
  board.add(vcMesh(merge([post(-1), post(1), part(G.box(1.9, 1.2, 0.06), 0x3a2a1a, [0, 1.4, -0.04])]), { cast: true, receive: true }));
  sign.position.set(0, 1.4, 0);
  board.add(sign);
  board.position.set(SX, HIGH, SZ);
  board.rotation.y = Math.PI / 4; // (half round towards the way you come, and half towards the water)
  s.add(board);
  for (const k of [-1, 1]) world.colliders.push({ x: SX + k * 0.8 * Math.cos(Math.PI / 4), z: SZ - k * 0.8 * Math.sin(Math.PI / 4), r: 0.15 });

  // --- gulls, wheeling round and round overhead
  const wheeling = WHEELING.map(([x, z, r, y, way]) => {
    const rig = makeBird('gull');
    rig.root.scale.setScalar(1.7);
    rig.root.traverse((o) => { o.userData.moves = true; }); // (nothing to fly into: see Flyovers)
    s.add(rig.root);
    return { rig, x, z, r, y, w: (way * rand(4.5, 5.5)) / r, a: rand(0, TAU), ph: rand(0, TAU), flap: rand(0, TAU), amp: 0, flapT: rand(0, 3) };
  });

  return {
    seats: [{ obj: steps, perches: SUNNY.map(([x, z], i) => ({ at: [x, operaGround(x), z], face: -Math.PI / 2 + (hash(i, 7) - 0.5) * 1.4, ground: [Math.min(x + 0.7, STEPS.top + 0.4), z], hop: [0.3, 0.3] })) }],
    update(dt, t) {
      for (const b of wheeling) {
        // (round and round, banked over into the turn, mostly gliding, with a few wingbeats now and then)
        b.a += b.w * dt;
        if ((b.flapT -= dt) <= 0) b.flapT = rand(2, 6);
        b.amp = clamp(b.amp + (b.flapT < 0.9 ? dt : -dt) * 3, 0, 1);
        b.flap += dt * TAU * 2.6 * (0.4 + 0.6 * b.amp);
        const r = b.rig.root, way = Math.sign(b.w);
        r.position.set(b.x + Math.cos(b.a) * b.r, b.y + Math.sin(t * 0.3 + b.ph) * 0.6, b.z + Math.sin(b.a) * b.r);
        r.rotation.set(Math.sin(t * 0.5 + b.ph) * 0.06, Math.atan2(-Math.sin(b.a) * way, Math.cos(b.a) * way), way * 0.35);
        const f = 0.15 + 0.55 * b.amp * Math.sin(b.flap);
        b.rig.wingL.rotation.z = f;
        b.rig.wingR.rotation.z = -f;
      }
    },
  };
}
