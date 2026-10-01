import * as THREE from 'three';
import { part, merge, vcMesh, vcMat, G, limb, rand, pick, hash, TAU, toonMat, canvasTexture, smoothstep } from '../util.js';
import { SEA, seaWave, seaMat } from './beach.js';
import { building } from './city.js';
import { BEACH } from '../world.js';

/*
 * Sydney Harbour, from the ferry. Off to your left as you go: North Head's cliffs, the Heads, with the open sea
 * out between them, and South Head, with the lighthouse; then the eastern suburbs all along the south shore,
 * Fort Denison, and at the far end, by the Quay, the Opera House (see buildOpera). On your right, the north
 * shore: the hills behind Manly, the zoo (the giraffes have got the best view in Sydney), Luna Park's big grin
 * and the Harbour Bridge. The yachts are out, and there's the other ferry, going the other way.
 */
const HX0 = 72, HX1 = 392, HZ0 = -500, HZ1 = -120; // the water (on the ocean's 4 m grid, carrying on from its south edge)
export const LANE = -224; // z: the ferry's way across
export const OTHER_LANE = -198; // (and the other ferry's)

/**
 * The harbour's surface at (x, z), t seconds in: riding the same swell as the sea, and with a storm on (`storm`,
 * 0..1: see Storm), great grey rollers heaving through under the lot
 */
export function swell(x, z, t, storm = 0) {
  const y = SEA + seaWave(x, z, t);
  return storm ? y + storm * (0.34 * Math.sin(x * 0.085 + t * 0.95) + 0.22 * Math.sin(z * 0.12 - t * 1.25) + 0.1 * Math.sin((x - z) * 0.27 + t * 2.3)) : y;
}

/* ------------------------------------------------------------------ the lie of the land */
// each headland, point or hill a lump: [x, z, rx, rz, how high, how gently it goes down into the water (0: sheer
// cliffs, 1: hillside all the way)]. The land's as high as the highest lump under it
const LEFT = [
  [106, -304, 32, 36, 17, 0.1], [138, -288, 14, 18, 13, 0.12], // North Head
  [228, -306, 34, 34, 13, 0.12], [198, -284, 11, 14, 9, 0.18], // South Head
  [272, -334, 32, 42, 9, 0.5], [314, -326, 26, 34, 7, 0.55], [352, -330, 24, 40, 9, 0.5], [300, -420, 120, 70, 20, 0.7], // the eastern suburbs
];
const RIGHT = [
  [162, -150, 24, 22, 11, 0.45], [206, -136, 30, 28, 15, 0.55], [258, -142, 30, 25, 14, 0.5], // Manly's hills, Mosman, the zoo
  [306, -134, 28, 28, 9, 0.5], [272, -152, 14, 11, 2.4, 0.02], [372, -150, 14, 20, 3, 0.1], // Milsons Point, Luna Park, Dawes Point
  [250, -80, 140, 48, 22, 0.8],
];
const LIGHTHOUSE = [197, -280], FORT = [282, -258];
const ZOO = [[249, -159.5, 0.3], [255.5, -157, -0.5], [261, -160.5, 2.6]]; // the giraffes: [x, z, which way]
const LUNA = [272, -162.6], WHEEL = [262, -148], BRIDGE = { x0: 296, x1: 368, z: -152, deck: 11 };
// (nobody's building houses on the headlands, the zoo, Luna Park or under the Bridge)
const NO_HOUSES = [[72, -400, 255, -250], [236, -175, 300, -120], [282, -175, 302, -120], [358, -175, 392, -120]];

function lump([cx, cz, rx, rz, h, soft], x, z) {
  const d = Math.hypot((x - cx) / rx, (z - cz) / rz);
  if (d >= 1) return -Infinity;
  // (cliffs go straight up out of the water and round off over the top; hills rise gently all the way)
  return -1 + (h + 1) * smoothstep(1, 0.88 - soft * 0.6, d) * (1 - 0.25 * d * d);
}

function landH(lumps, x, z) {
  let y = -2;
  for (const l of lumps) y = Math.max(y, lump(l, x, z));
  // (a bit rough on top)
  if (y > 0) y += Math.sin(x * 0.21 + z * 0.13) * Math.cos(z * 0.17 - x * 0.07) * Math.min(1.5, y * 0.12);
  return Math.max(y, -2);
}
const slopeAt = (lumps, x, z) => Math.hypot(landH(lumps, x + 1, z) - landH(lumps, x - 1, z), landH(lumps, x, z + 1) - landH(lumps, x, z - 1)) / 2;

const C = {
  sand: new THREE.Color(0xe3cf98), rock: new THREE.Color(0x9c8f78), cliff: new THREE.Color(0xc79a5e), cliff2: new THREE.Color(0xb4864c),
  bush: new THREE.Color(0x4d6c3a), bush2: new THREE.Color(0x607f45), grass: new THREE.Color(0x7aa04c),
  deep: new THREE.Color(0xd9eef7), // (under the water, as pale as the sky showing through it everywhere else)
};

/** a stretch of shore ([x0, z0, x1, z1], in 4 m squares): the land, coloured by how high and steep it is */
function shore(world, [x0, z0, x1, z1], lumps) {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, Math.round((x1 - x0) / 4), Math.round((z1 - z0) / 4));
  g.rotateX(-Math.PI / 2).translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = landH(lumps, x, z), steep = slopeAt(lumps, x, z);
    pos.setY(i, y);
    if (y < SEA) c.copy(C.sand).lerp(C.deep, smoothstep(SEA - 0.1, SEA - 1.3, y));
    else if (steep > 1.1) c.copy(Math.sin(y * 2.6) > 0 ? C.cliff : C.cliff2); // (sandstone, in bands)
    else if (y < 0.7) c.copy(steep > 0.5 ? C.rock : C.sand);
    else c.copy(C.bush).lerp(C.bush2, 0.5 + 0.5 * Math.sin(x * 0.3 + z * 0.23)).lerp(C.grass, smoothstep(0.35, 0, steep) * 0.4);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, vcMat());
  m.receiveShadow = true;
  world.scene.add(m);
}

/** houses and gum trees dotted over the land ([x0, z0, x1, z1]); `face`: which way the houses look (out over the water) */
function suburbs(p, lumps, [x0, z0, x1, z1], houses, trees, face) {
  const built = [];
  for (let i = 0, n = 0; i < houses * 12 && n < houses; i++) {
    const x = rand(x0, x1), z = rand(z0, z1), y = landH(lumps, x, z);
    if (y < 1.2 || y > 16 || slopeAt(lumps, x, z) > 0.75 || NO_HOUSES.some(([a, b, c, d]) => x > a && x < c && z > b && z < d)) continue;
    if (built.some(([bx, bz]) => Math.hypot(bx - x, bz - z) < 7)) continue;
    built.push([x, z]);
    n++;
    const w = rand(4, 7), d = rand(4, 6), h = rand(3, 6), rh = rand(1.4, 2.4), r = face + rand(-0.35, 0.35);
    p.push(part(G.box(w, h, d), pick([0xf2ede0, 0xe8dcc4, 0xf5f0e6, 0xdfe6ea, 0xefd9c4, 0xd9e2cf]), [x, y + h / 2 - 0.6, z], [0, r, 0]));
    p.push(part(G.cone(1, 1, 4).rotateY(Math.PI / 4), pick([0xb5523b, 0xa4462f, 0x6b6e70, 0x8a3b2b]), [x, y + h - 0.6 + rh / 2, z], [0, r, 0], [(w * 1.1) / Math.SQRT2, rh, (d * 1.1) / Math.SQRT2]));
  }
  for (let i = 0, n = 0; i < trees * 8 && n < trees; i++) {
    const x = rand(x0, x1), z = rand(z0, z1), y = landH(lumps, x, z);
    if (y < 0.8 || slopeAt(lumps, x, z) > 1.3 || built.some(([bx, bz]) => Math.hypot(bx - x, bz - z) < 4.5)) continue;
    n++;
    const h = rand(3, 6), s = rand(1.4, 2.4);
    p.push(limb([x, y - 0.3, z], [x, y + h * 0.6, z], 0.22, 0.12, 0xd8d2c4, 5));
    for (let k = 0; k < 2; k++) {
      p.push(part(G.ico(s, 0), pick([0x3f6035, 0x4a6b3a, 0x557545, 0x35512d]), [x + rand(-0.8, 0.8), y + h * 0.7 + k * s * 0.7, z + rand(-0.8, 0.8)], [rand(0, 3), rand(0, 3), 0], [1, 0.75, 1]));
    }
  }
}

/** red and white stripes up a cylinder standing at the origin (a baked part): `n` of them, round the way */
function stripes(g, n, a, b) {
  const p = g.attributes.position, c = g.attributes.color, ca = new THREE.Color(a), cb = new THREE.Color(b);
  for (let i = 0; i < p.count; i += 3) {
    const x = p.getX(i) + p.getX(i + 1) + p.getX(i + 2), z = p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2);
    const k = Math.floor(((Math.atan2(z, x) + Math.PI) / TAU) * n) % 2 ? cb : ca;
    for (let j = 0; j < 3; j++) c.setXYZ(i + j, k.r, k.g, k.b);
  }
  return g;
}

/* ------------------------------------------------------------------ the ferries */
export const GREEN = 0x1d5c3c, CREAM = 0xf1e3b5;
/** the middle of a ferry's cabins, a capsule along her length (x ±CABIN_X, radius CABIN_R), that you walk round */
export const CABIN_X = 9, CABIN_R = 2.3;
/**
 * A Manly ferry, in bits: her hull (and the timber deck, at y 0: 36 m of it by 12, x ±18 by z ±6, to walk about
 * on); the bulwarks round the edge of it, with a gap at either end for the gangway (she's double-ended: she never
 * has to turn round); and the cabins up the middle, the wheelhouses up top at either end, and the funnel
 */
export function ferryParts() {
  const TIMBER = 0xb58f5f, GLASS = 0x2c3e55, WHITE = 0xf4f4ef;
  // (an oblong, its corners rounded off)
  const oblong = (w, d, r, h, color, y) => [
    part(G.box(w, h, d - 2 * r), color, [0, y, 0]),
    part(G.box(w - 2 * r, h, d), color, [0, y, 0]),
    ...[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([sx, sz]) => part(G.cyl(r, r, h, 8), color, [sx * (w / 2 - r), y, sz * (d / 2 - r)])),
  ];
  const hull = merge([...oblong(36.9, 12.9, 0.6, 1.7, GREEN, -1.12), ...oblong(37, 13, 0.6, 0.18, CREAM, -0.2), ...oblong(36.6, 12.6, 0.5, 0.08, TIMBER, -0.04)]);
  const rails = [];
  for (const s of [-1, 1]) {
    rails.push(part(G.box(36.8, 1.0, 0.16), GREEN, [0, 0.5, s * 6.35]), part(G.box(36.9, 0.08, 0.26), WHITE, [0, 1.03, s * 6.35]));
    for (const k of [-1, 1]) {
      // (the ends, either side of the gangway)
      rails.push(part(G.box(0.16, 1.0, 3.7), GREEN, [s * 18.35, 0.5, k * 4.5]), part(G.box(0.26, 0.08, 3.8), WHITE, [s * 18.35, 1.03, k * 4.5]));
    }
  }
  const cabins = [
    part(G.box(18, 2.6, 4.2), CREAM, [0, 1.3, 0]),
    part(G.box(18.1, 0.9, 4.3), GLASS, [0, 1.65, 0]), // (a band of windows all the way round)
    part(G.box(19, 0.14, 4.9), GREEN, [0, 2.67, 0]),
    part(G.box(10.4, 1.7, 3.6), CREAM, [0, 3.59, 0]),
    part(G.box(10.5, 0.7, 3.7), GLASS, [0, 3.8, 0]),
    part(G.box(11, 0.12, 4.2), GREEN, [0, 4.5, 0]),
    part(G.cyl(0.8, 0.85, 2.4, 14), CREAM, [0, 5.76, 0]), // the funnel
    part(G.cyl(0.83, 0.83, 0.5, 14), 0x222222, [0, 6.75, 0]),
  ];
  for (const s of [-1, 1]) {
    cabins.push(
      part(G.box(1.2, 2.0, 0.08), GLASS, [s * 9.02, 1.0, 0]), // (the doors at the ends)
      part(G.box(2.6, 1.4, 3.4), CREAM, [s * 4, 5.26, 0]), // the wheelhouse at this end (she steers from whichever end's the front)
      part(G.box(0.1, 0.6, 3.0), GLASS, [s * 5.3, 5.46, 0]),
      part(G.box(2.9, 0.12, 3.7), GREEN, [s * 4, 6.02, 0]),
      part(G.cyl(0.06, 0.06, 3.6, 5), WHITE, [s * 8.5, 4.5, 0]), // (a mast)
      part(G.sphere(0.14, 6, 5), 0xfff6c8, [s * 8.5, 6.35, 0]),
    );
    for (const k of [-1, 1]) cabins.push(part(G.torus(0.33, 0.07, 5, 12), 0xf26b1d, [s * 5, 1.2, k * 2.14])); // (life rings)
  }
  return { hull, rails: merge(rails), cabins: merge(cabins) };
}

/**
 * What she's been patched up with, the `n`th time she's been sunk and fished out again (1 and up): a bad repair job,
 * odd bits of old timber nailed on at all angles over the holes, and worse each time (a tarp over the wheelhouse,
 * a bucket for bailing). In her frame, like ferryParts; the same boards in the same places every time
 */
export function ferryPatches(n) {
  const WOOD = [0x8a6a48, 0xa3845c, 0x6e5a44, 0x9a9488, 0xb89968, 0x7d6b55], NAIL = 0x33302c, HOLE = 0x1c1511;
  let i = 0;
  const r = (a, b) => a + hash(n, i++, 7) * (b - a);
  const wood = () => WOOD[Math.floor(r(0, WOOD.length))];
  const p = [];
  // boards on the deck, over a hole, round (x, z)
  const deck = (x, z, boards) => {
    p.push(part(G.box(r(1.1, 1.5), 0.012, r(0.8, 1.1)), HOLE, [x, 0.012, z], [0, r(0, TAU), 0]));
    for (let k = 0; k < boards; k++) {
      const a = r(-0.5, 0.5) + (k % 2) * 1.2, len = r(1.3, 1.9), bx = x + r(-0.3, 0.3), bz = z + r(-0.3, 0.3), c = Math.cos(a), s = Math.sin(a);
      p.push(part(G.box(len, 0.05, r(0.2, 0.28)), wood(), [bx, 0.035 + k * 0.012, bz], [0, a, 0]));
      for (const e of [-1, 1]) p.push(part(G.box(0.05, 0.03, 0.05), NAIL, [bx + e * c * (len / 2 - 0.12), 0.07 + k * 0.012, bz - e * s * (len / 2 - 0.12)]));
    }
  };
  // boards nailed up the outside of her, on side s (±1), over a hole round (x, y): her bulwarks, or her hull under them
  const side = (s, x, y, boards) => {
    p.push(part(G.box(r(0.8, 1.2), r(0.4, 0.6), 0.02), HOLE, [x, y, s * 6.47]));
    for (let k = 0; k < boards; k++) {
      const a = r(-0.6, 0.6), len = r(1.1, 1.6), c = Math.cos(a), sn = Math.sin(a), bx = x + r(-0.25, 0.25), by = y + r(-0.12, 0.12);
      p.push(part(G.box(len, r(0.18, 0.24), 0.05), wood(), [bx, by, s * (6.5 + k * 0.012)], [0, 0, a]));
      for (const e of [-1, 1]) p.push(part(G.box(0.05, 0.05, 0.03), NAIL, [bx + e * c * (len / 2 - 0.1), by + e * sn * (len / 2 - 0.1), s * (6.54 + k * 0.012)]));
    }
  };
  if (n === 1) {
    deck(2.6, -4.3, 3);
    deck(-12.5, -3.2, 2);
    side(-1, 3.5, 0.5, 3);
    side(-1, -6, -1, 2);
  } else if (n === 2) {
    deck(-14.5, 1.6, 3);
    deck(6.5, 4.4, 2);
    side(1, 8, 0.45, 2);
    side(1, -2, -1.1, 3);
    // (and a blue tarp tied down over the wheelhouse at the one end)
    p.push(part(G.box(3.3, 0.05, 4), 0x2f6fd0, [-4, 6.12, 0], [0.04, 0.09, -0.03]), part(G.box(3.34, 0.02, 0.5), 0x2458a8, [-4.05, 6.15, 0.6], [0.04, 0.09, -0.03]));
    for (const [x, z] of [[-5.6, -1.9], [-2.4, -2.05], [-5.55, 1.95], [-2.45, 2.1]]) p.push(limb([x, 6.1, z], [x * 1.08 + 0.3, 4.56, z * 1.12], 0.015, 0.015, 0xd9cfa8, 4));
  } else {
    deck(13.5, -1.2, 3);
    deck(-4.5, 4.6, 2);
    side(-1, 12, -0.9, 2);
    // (a board over a cabin window)
    p.push(part(G.box(1.8, 0.24, 0.05), wood(), [-3, 1.65, -2.2], [0, 0, 0.3]));
    // (and a bucket, for bailing)
    p.push(part(G.cyl(0.24, 0.19, 0.36, 12), 0x9aa3a8, [11.2, 0.18, -3.9]), part(G.cyl(0.2, 0.2, 0.02, 12), 0x3d6f8a, [11.2, 0.3, -3.9]), part(G.torus(0.22, 0.012, 4, 12, Math.PI), 0x6e7478, [11.2, 0.36, -3.9]));
  }
  return merge(p);
}

/* ------------------------------------------------------------------ the sights */
/** Hornby Light, on South Head: red and white stripes, and the keepers' cottages */
function lighthouse(p, [x, z]) {
  const y = landH(LEFT, x, z) - 0.3;
  p.push(
    stripes(part(G.cyl(0.95, 1.2, 8, 16), 0xffffff, [0, 4, 0]), 8, 0xd8332a, 0xffffff).translate(x, y, z),
    part(G.cyl(1.45, 1.45, 0.22, 14), 0xffffff, [x, y + 8.1, z]),
    part(G.cyl(0.75, 0.75, 1.2, 10), 0xfff1b0, [x, y + 8.8, z]),
    part(G.cone(0.95, 0.9, 12), 0xd8332a, [x, y + 9.85, z]),
  );
  for (const [dx, dz] of [[7, -4], [4, -9]]) {
    const cy = landH(LEFT, x + dx, z + dz) - 0.3;
    p.push(part(G.box(5, 2.6, 3.4), 0xf4f1e8, [x + dx, cy + 1.3, z + dz]), part(G.cone(1, 1, 4).rotateY(Math.PI / 4), 0xb5523b, [x + dx, cy + 3.2, z + dz], [0, 0, 0], [3.9, 1.4, 2.8]));
  }
}

/** Fort Denison: a round sandstone tower on its rock, out in the middle of the harbour */
function fort(p, [x, z]) {
  const stone = 0xcda56a;
  p.push(
    part(G.dodec(1), 0x8f8574, [x, -0.9, z], [0.2, 0.4, 0], [12, 2.6, 7]),
    part(G.box(15, 2.6, 6.5), stone, [x + 1.5, 1.1, z]),
    part(G.cyl(3.2, 3.5, 6.8, 16), stone, [x - 3, 3.2, z]),
    part(G.cyl(3.45, 3.45, 0.5, 16), 0xb8905a, [x - 3, 6.8, z]),
    part(G.cyl(0.06, 0.06, 4, 5), 0xffffff, [x + 4, 4.3, z]),
    part(G.box(0.02, 0.7, 1.2), 0x1f3a8a, [x + 4, 5.9, z + 0.62]), // (the flag)
  );
}

/** the Harbour Bridge: granite pylons at either end, and the grey steel arch between them, with the deck hung under it */
function bridge(p) {
  const { x0, x1, z, deck } = BRIDGE, mid = (x0 + x1) / 2, half = (x1 - x0) / 2, STEEL = 0x6d777d, GRANITE = 0xc2b59b;
  const low = (x) => { const u = (x - mid) / half; return 1.5 + 23.5 * (1 - u * u); };
  const high = (x) => { const u = (x - mid) / half; return low(x) + 2.8 + 9.5 * u * u; };
  for (const px of [x0 - 4, x1 + 4]) {
    for (const s of [-1, 1]) {
      p.push(part(G.box(7, 25, 5), GRANITE, [px, 11.5, z + s * 8.5]), part(G.box(6, 3, 4), GRANITE, [px, 25.5, z + s * 8.5]), part(G.box(6.4, 0.5, 4.4), 0xa89c84, [px, 24, z + s * 8.5]));
    }
  }
  // the deck, on out over the land at either end on piers
  p.push(part(G.box(x1 - x0 + 56, 1.2, 12), 0x55595c, [mid, deck, z]));
  for (const px of [x0 - 12, x0 - 20, x1 + 12, x1 + 20]) for (const s of [-1, 1]) p.push(part(G.box(2, deck + 2, 2), GRANITE, [px, deck / 2 - 1, z + s * 4.5]));
  // the arch: two ribs, each a top and a bottom chord, braced between; hangers down to the deck, and posts up to it
  const N = 24;
  for (const s of [-1, 1]) {
    const rz = z + s * 5.2;
    for (let i = 0; i < N; i++) {
      const a = x0 + ((x1 - x0) * i) / N, b = x0 + ((x1 - x0) * (i + 1)) / N;
      p.push(limb([a, low(a), rz], [b, low(b), rz], 0.5, 0.5, STEEL, 6), limb([a, high(a), rz], [b, high(b), rz], 0.45, 0.45, STEEL, 6));
      p.push(limb([a, low(a), rz], [b, high(b), rz], 0.16, 0.16, STEEL, 4), limb([b, low(b), rz], [b, high(b), rz], 0.16, 0.16, STEEL, 4));
      if (low(b) > deck + 1) p.push(limb([b, low(b), rz], [b, deck, rz], 0.1, 0.1, STEEL, 4));
      else if (low(b) < deck - 1) p.push(limb([b, low(b), rz], [b, deck, rz], 0.18, 0.18, STEEL, 4));
    }
  }
  for (let i = 1; i < N; i++) {
    const a = x0 + ((x1 - x0) * i) / N;
    p.push(part(G.box(0.3, 0.3, 10.4), STEEL, [a, high(a), z]));
  }
}

/** Luna Park, at Milsons Point: its big grinning face for a gateway, and the towers either side of it */
function lunaPark(world, p, [x, z]) {
  const y = landH(RIGHT, x, z + 3);
  const face = canvasTexture(256, 256, (c, w, h) => {
    c.fillStyle = '#e8403a';
    for (let i = 0; i < 16; i++) { // (the rays of its headdress)
      const a = (i / 16) * TAU;
      c.beginPath(); c.moveTo(w / 2, h / 2); c.arc(w / 2, h / 2, w / 2, a, a + TAU / 32); c.fill();
    }
    c.fillStyle = '#f2b45a'; c.beginPath(); c.arc(w / 2, h / 2 + 10, 96, 0, TAU); c.fill();
    for (const ex of [90, 166]) {
      c.fillStyle = '#fff'; c.beginPath(); c.ellipse(ex, 110, 24, 18, 0, 0, TAU); c.fill();
      c.fillStyle = '#2f6fd0'; c.beginPath(); c.arc(ex, 112, 11, 0, TAU); c.fill();
      c.fillStyle = '#111'; c.beginPath(); c.arc(ex, 112, 5, 0, TAU); c.fill();
      c.strokeStyle = '#6b3a1a'; c.lineWidth = 7; c.beginPath(); c.arc(ex, 104, 30, 1.15 * Math.PI, 1.85 * Math.PI); c.stroke();
    }
    c.fillStyle = '#d0312d'; c.beginPath(); c.ellipse(w / 2, 184, 58, 34, 0, 0, TAU); c.fill();
    c.fillStyle = '#3a1010'; c.beginPath(); c.ellipse(w / 2, 188, 44, 21, 0, 0, TAU); c.fill();
    c.fillStyle = '#fff'; c.fillRect(w / 2 - 36, 168, 72, 9);
  });
  const m = new THREE.Mesh(new THREE.CircleGeometry(4.2, 32), toonMat({ map: face }));
  m.position.set(x, y + 4.6, z - 0.2);
  m.rotation.y = Math.PI;
  world.scene.add(m);
  p.push(part(G.box(8.6, 9, 1), 0xf2e6c8, [x, y + 4.5, z + 0.4]));
  for (const s of [-1, 1]) {
    const tx = x + s * 6.4;
    for (let i = 0; i < 6; i++) p.push(part(G.cyl(1, 1, 1.8, 10), i % 2 ? 0xffffff : pick([0xe8403a, 0x2f6fd0, 0xf2c230]), [tx, y + 0.9 + i * 1.8, z]));
    p.push(part(G.cone(1.3, 3, 10), 0xe8403a, [tx, y + 12.3, z]), part(G.sphere(0.35, 6, 5), 0xf2c230, [tx, y + 14, z]));
  }
}

/** a giraffe (about 5 m to the top of its head), for the zoo */
function giraffe(p, x, z, r) {
  const y = landH(RIGHT, x, z) - 0.1, TAN = 0xdca45a, SPOT = 0x8a5a2a;
  const at = (lx, ly, lz) => [x + Math.cos(r) * lx + Math.sin(r) * lz, y + ly, z - Math.sin(r) * lx + Math.cos(r) * lz];
  p.push(part(G.sphere(1, 10, 8), TAN, at(0, 2.6, 0), [0, r, 0], [0.55, 0.6, 1.1]));
  for (const [lx, lz] of [[-0.3, 0.7], [0.3, 0.7], [-0.3, -0.7], [0.3, -0.7]]) p.push(limb(at(lx, 2.4, lz), at(lx, 0, lz), 0.1, 0.07, TAN, 5));
  p.push(limb(at(0, 2.7, 0.8), at(0, 4.6, 1.5), 0.22, 0.14, TAN, 6), part(G.box(0.26, 0.3, 0.7), TAN, at(0, 4.7, 1.75), [0, r, 0]));
  for (const k of [-1, 1]) p.push(limb(at(k * 0.08, 4.8, 1.55), at(k * 0.1, 5.1, 1.5), 0.03, 0.03, SPOT, 4));
  for (let i = 0; i < 6; i++) p.push(part(G.sphere(0.2, 6, 4), SPOT, at(rand(-0.5, 0.5), rand(2.4, 3), rand(-0.9, 0.9)), [0, 0, 0], [1, 0.6, 1]));
}

/** a yacht, out for a sail (facing +z: bow that way, the sails set to one side) */
function yachtGeo() {
  return merge([
    part(G.box(1.6, 0.7, 5), 0xffffff, [0, 0.1, 0]),
    part(G.box(1.13, 0.7, 1.13), 0xffffff, [0, 0.1, 2.5], [0, Math.PI / 4, 0]),
    part(G.box(1.64, 0.12, 5.1), 0x1f3a8a, [0, -0.2, 0]),
    part(G.box(1, 0.4, 1.6), 0xe8e4d8, [0, 0.6, -0.8]),
    part(G.cyl(0.05, 0.06, 7, 5), 0xdddddd, [0, 3.9, 0.6]),
    part(G.cone(1, 1, 4), 0xffffff, [0.05, 4, -0.5], [0, Math.PI / 4, 0], [0.03, 6.2, 1.5]),
    part(G.cone(1, 1, 4), 0xf5f5f5, [0.05, 3.2, 1.9], [0, Math.PI / 4, 0], [0.03, 4.8, 1.1]),
  ]);
}

/* ------------------------------------------------------------------ build */
export function buildHarbour(world) {
  const s = world.scene;

  // --- the water, riding the same swell as the sea
  const water = new THREE.PlaneGeometry(HX1 - HX0, HZ1 - HZ0, (HX1 - HX0) / 4, (HZ1 - HZ0) / 4).rotateX(-Math.PI / 2).translate((HX0 + HX1) / 2, SEA, (HZ0 + HZ1) / 2);
  const wpos = water.attributes.position;
  s.add(new THREE.Mesh(water, seaMat()));
  let rough = false; // (whether it's catching the light like a rough sea: see update)

  // --- the shores either side, and what's on them
  shore(world, [HX0, -476, HX1, -256], LEFT);
  shore(world, [140, -176, HX1, -36], RIGHT);
  const far = [];
  suburbs(far, LEFT, [250, -400, 372, -290], 44, 70, 0);
  suburbs(far, LEFT, [72, -400, 255, -262], 0, 60, 0); // (the headlands: all bush)
  suburbs(far, RIGHT, [140, -176, 360, -80], 46, 80, Math.PI);
  lighthouse(far, LIGHTHOUSE);
  fort(far, FORT);
  bridge(far);
  lunaPark(world, far, LUNA);
  for (const [x, z, r] of ZOO) giraffe(far, x, z, r);
  // (Manly, round the back of the wharf: a seawall, the pavement on round from the forecourt, and the shops)
  far.push(part(G.box(0.6, 1.4, 58), 0xb9a27a, [140.3, -0.55, -149]), part(G.box(70, 0.5, 6.4), 0xcfcac0, [105, 0.1, -180.8]));
  s.add(vcMesh(merge(far), { cast: false, receive: true }));
  for (let x = 78; x < 132; x += 11.5) {
    const h = rand(6, 11), b = building(10.5, h, 9, pick([0xefe2c4, 0xdce8cf, 0xf1d9c9, 0xcfe0e8]));
    b.position.set(x, h / 2, -168);
    s.add(b);
  }

  // --- Luna Park's wheel, going round
  const wheel = new THREE.Group(), wy = landH(RIGHT, ...WHEEL) + 8.5;
  wheel.add(vcMesh(merge([
    part(G.torus(7, 0.16, 5, 40), 0xf2f2ee),
    ...Array.from({ length: 12 }, (_, i) => limb([0, 0, 0], [Math.cos((i / 12) * TAU) * 7, Math.sin((i / 12) * TAU) * 7, 0], 0.06, 0.06, 0xf2f2ee, 4)),
  ]), { cast: false }));
  const cars = [];
  for (let i = 0; i < 12; i++) {
    const car = vcMesh(merge([part(G.box(0.9, 0.9, 0.9), pick([0xe8403a, 0x2f6fd0, 0xf2c230, 0x3aa35a]), [0, -0.5, 0])]), { cast: false });
    const a = (i / 12) * TAU;
    car.position.set(Math.cos(a) * 7, Math.sin(a) * 7, 0);
    wheel.add(car);
    cars.push(car);
  }
  wheel.position.set(WHEEL[0], wy, WHEEL[1]);
  s.add(wheel, vcMesh(merge([-1, 1].map((k) => limb([WHEEL[0] + k * 3, wy - 9.5, WHEEL[1]], [WHEEL[0], wy, WHEEL[1]], 0.25, 0.2, 0xdddddd, 5))), { cast: false }));

  // --- the other ferry, back and forth along her own way across, and the yachts out on the water
  const other = new THREE.Group(), fp = ferryParts();
  for (const g of [fp.hull, fp.rails, fp.cabins]) other.add(vcMesh(g, { cast: false }));
  s.add(other);
  const yachts = [[186, -258, 11], [238, -252, 9], [298, -243, 4], [226, -182, 6]].map(([x, z, r]) => {
    const m = vcMesh(yachtGeo(), { cast: false });
    m.rotation.order = 'YXZ';
    s.add(m);
    return { m, x, z, r, a: rand(0, TAU), w: rand(0.035, 0.06) * (Math.random() < 0.5 ? -1 : 1) };
  });
  // (none of them are anything to fly into: see Flyovers)
  for (const o of [other, wheel, ...yachts.map((y) => y.m)]) o.traverse((c) => { c.userData.moves = true; });
  /** the other ferry and the yachts, on their way, t seconds in */
  const sail = (dt, t) => {
    // (she slows right down at either end, as if she's pulling in somewhere)
    const u = Math.sin(t * 0.045);
    other.position.set(255 + 80 * u, 0.35 + Math.sin(t * 0.9) * 0.06, OTHER_LANE);
    other.rotation.x = Math.sin(t * 0.7) * 0.012;
    for (const y of yachts) {
      y.a += y.w * dt;
      y.m.position.set(y.x + Math.cos(y.a) * y.r, SEA + 0.2 + seaWave(y.x, y.z, t), y.z + Math.sin(y.a) * y.r);
      // (heading round the circle, heeled over)
      y.m.rotation.set(0, Math.atan2(-Math.sin(y.a) * Math.sign(y.w), Math.cos(y.a) * Math.sign(y.w)), 0.14 * Math.sign(y.w) + Math.sin(t * 0.8 + y.x) * 0.03);
    }
  };
  sail(0, 0); // (out on the water from the off: not left wherever they were made, which is the middle of the bush)

  return {
    update(dt, t) {
      sail(dt, t); // (they keep going with nobody about, too: you can see them from up high, on the map)
      const p = world.game.player.pos;
      if (world.zoneOf(p.x, p.z) < BEACH) return; // (nobody to see the swell, or the wheel going round, from back there)
      const storm = world.game.storm?.k ?? 0;
      for (let i = 0; i < wpos.count; i++) wpos.setY(i, swell(wpos.getX(i), wpos.getZ(i), t, storm));
      wpos.needsUpdate = true;
      // (in a storm the rollers catch the light, so it looks as rough as it is; after, it's flat calm again)
      if (storm > 0.01) { water.computeVertexNormals(); rough = true; }
      else if (rough) {
        rough = false;
        const n = water.attributes.normal;
        for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
        n.needsUpdate = true;
      }
      wheel.rotation.z += dt * 0.12;
      for (const c of cars) c.rotation.z = -wheel.rotation.z;
    },
  };
}

