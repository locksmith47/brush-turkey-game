import * as THREE from 'three';
import { part, merge, vcMesh, G, limb, rand, pick, hash, noise, smoothstep, clamp, TAU, toonMat, canvasTexture } from '../util.js';
import { building, fig } from './city.js';

/*
 * Hyde Park, through the laneway out of the side of the King's court (the King's key opens the gate across it),
 * over Elizabeth Street and in at the park gates. It's the city's backyard: lawns, Hill's figs everywhere, an
 * avenue of them down the middle, and the ibises and the rats have the run of it. At the top end, the Archibald
 * Fountain: Apollo up in the middle, with the others round him in the water, and jets arching in over the lot
 * (turkeys climb in and have a wash). There are bronze gents on sandstone plinths about the lawns (turkeys sit on
 * their heads, the way birds do), Park Street across the middle, and at the bottom end, the Pool of Reflection
 * and the Anzac Memorial. St Mary's looks on over College Street, along the other side.
 *
 * In the far corner is Museum station: stairs down from the park to the platform, in a cutting with a tunnel at
 * either end, and the train in, with its doors open (see Ride).
 *
 * The park's on the second leg, like the city, so it's laid out in the world as it is: down the park is +x (south,
 * the way on), and across it, from Elizabeth Street over to College Street, is -z.
 */
export const HYDE_RECT = [474, -352, 600, -270];
/** the gate across the laneway out of the King's court, at the far end, where it comes out on Elizabeth Street */
export const HYDE_GATE = { x: 491, z: -270, d: [0, -1], span: [485, 497] };
const LANE = { x0: 485.6, x1: 496.4 }; // (the laneway itself, across)
const PARK = { x0: 477, x1: 597, z0: -349, z1: -277.5 }; // inside the railings
const AXIS = -313; // z: the avenue down the middle, which the fountain sits across, lined up on St Mary's
const FOUNTAIN = { x: 505, z: AXIS, r: 7, water: 0.45 }; // the basin's rim (and the water's level)
const PARK_ST = [538, 546]; // x: Park Street, across the middle
const POOL = { x0: 556, x1: 574, z0: AXIS - 3.5, z1: AXIS + 3.5 }; // the Pool of Reflection
const MEMORIAL = { x: 585, z: AXIS, half: 7.5 }; // the Anzac Memorial (half: half its podium's width)
// the station: the cutting it's in, and the stairs down into it from the park (`n` steps), and the platform
export const CUT = { x0: 552, x1: 598, z0: -286, z1: -274 };
const STAIRS = { x0: 552, x1: 562, z0: -284.4, z1: -279.4, n: 20 };
export const PLATFORM = { x0: 562, x1: 597, z0: -285.2, z1: -278.4, y: -6 };
const RAIL_Y = -7.1; // (the top of the rails, down in the cutting)
const MOUTH_TOP = RAIL_Y + 5.2; // (and the top of the tunnels' mouths, at either end of it)
export const TRACK_Z = -276.6;
/** where the train stops at Museum (the middle of it): its doors open onto the platform, on its -z side */
export const MUSEUM_STOP = { x: 579, z: TRACK_Z, y: PLATFORM.y, side: -1 };
/** the tunnels at either end of the cutting: x where the way in is (the train goes on through the far one, +x) */
const PORTALS = [CUT.x0, CUT.x1];

// what's about in the park: a mound among the figs near the gate, a few bins, ibises, and rats (round the bins, and down
// on the platform)
export const HYDE_MOUND = [487, -300];
export const HYDE_BINS = [['red', 511.5, -296.2, 0], ['green', 536.5, -333.5, Math.PI / 2], ['red', 553.5, -291, Math.PI], ['yellow', 498, -340.5, -Math.PI / 2]];
export const HYDE_IBISES = [['ibis', 496, -323], ['ibis', 527, -297], ['big', 531, -330], ['ibis', 561, -336], ['ibis', 492, -344], ['giant', 576, -296]];
export const HYDE_RATS = [[510, -299], [513, -300.5], [508.5, -301.5], [535, -337], [538, -336], [499.5, -337.5], [574, -282], [583, -283.5], [590, -281.5]];

/* ------------------------------------------------------------------ the lie of the land */
/** the steps down into the station: the ground's height at x, going down them */
const stairY = (x) => PLATFORM.y * clamp((x - STAIRS.x0) / (STAIRS.x1 - STAIRS.x0), 0, 1);

/** the ground in the park: flat, bar down the stairs into the station, and the cutting it's in */
export function hydeGround(x, z) {
  if (x < CUT.x0 || z < CUT.z0 || z > CUT.z1) return 0;
  if (z > PLATFORM.z1) return RAIL_Y; // (the tracks)
  if (x >= PLATFORM.x0) return z >= PLATFORM.z0 ? PLATFORM.y : 0;
  return z >= STAIRS.z0 && z <= STAIRS.z1 ? stairY(x) : 0;
}

// the lie of the land (see Track): in off the street through the laneway, the park (all one big lawn, either side
// of the cutting), and down the stairs onto the platform
export const HYDE_TRACK = {
  nodes: { lane: [491, -278.6], stairs_top: [552.2, -281.9], stairs_foot: [562.3, -281.9], se: [552.6, -320] },
  rooms: [
    { rect: [LANE.x0, -279.4, LANE.x1, -269.5], nodes: ['lane'], ground: 'dirt' },
    { rect: [PARK.x0, PARK.z0, CUT.x0 + 0.8, PARK.z1], nodes: ['lane', 'stairs_top', 'se'] },
    { rect: [CUT.x0, PARK.z0, PARK.x1, CUT.z0 - 0.8], nodes: ['se'] },
    { rect: [CUT.x0 - 0.2, STAIRS.z0 + 0.2, STAIRS.x1 + 0.6, STAIRS.z1 - 0.2], nodes: ['stairs_top', 'stairs_foot'], ground: 'dirt' },
    { rect: [PLATFORM.x0, PLATFORM.z0 + 0.2, PLATFORM.x1 - 0.3, PLATFORM.z1 - 0.4], nodes: ['stairs_foot'], ground: 'dirt' },
  ],
};

/* ------------------------------------------------------------------ building bits */
const SAND = 0xd9bc85, SAND2 = 0xc9a874, BRONZE = 0x5f6c55, BRONZE2 = 0x4b5645, IRON = 0x2b2d2e;
const STONE = new THREE.Color(0xcfc4ad), GRAVEL = new THREE.Color(0xd8c9a2), ROAD = new THREE.Color(0x4a4d52), PATH = new THREE.Color(0xc9c6bd);
const GRASS = [new THREE.Color(0x6fa548), new THREE.Color(0x82b453)], SHADE = new THREE.Color(0x4f7f38);

// the park's paths, as capsules: [ax, az, bx, bz, half their width]
const PATHS = [
  [PARK.x0, AXIS, PARK.x1, AXIS, 4], // (the avenue)
  [491, PARK.z1, 499, -304, 2.2], // (in from the gate to the fountain)
  [FOUNTAIN.x, AXIS, FOUNTAIN.x, PARK.z0, 2.4], // (and on to College Street, and St Mary's)
  [519, -279, 534, -309, 1.6], [522, -347, 534, -317, 1.6],
  [534, -297, CUT.x0 - 1, -282, 1.8], // (to the station)
  [580, -287.5, 580, AXIS, 1.6],
];
/** how far (x, z) is off the paths (negative: on one), counting the paving round the fountain, the pool and the memorial */
function offPath(x, z) {
  let d = Math.hypot(x - FOUNTAIN.x, z - FOUNTAIN.z) - (FOUNTAIN.r + 4);
  d = Math.min(d, Math.max(Math.abs(x - (POOL.x0 + POOL.x1) / 2) - 11, Math.abs(z - AXIS) - 7.5));
  d = Math.min(d, Math.max(Math.abs(x - MEMORIAL.x), Math.abs(z - MEMORIAL.z)) - MEMORIAL.half - 4);
  for (const [ax, az, bx, bz, w] of PATHS) {
    const vx = bx - ax, vz = bz - az, t = clamp(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz), 0, 1);
    d = Math.min(d, Math.hypot(x - ax - vx * t, z - az - vz * t) - w);
  }
  return d;
}

/** the colour of the ground at (x, z): lawn (darker under the figs), the paths, and the streets round the outside */
function groundColour(x, z, trees, c) {
  if (z > PARK.z1 + 0.5) return c.copy(z > -274 ? ROAD : PATH); // (Elizabeth Street, and its footpath on the park's side)
  if (x < PARK.x0 - 0.5 || x > PARK.x1 + 0.5 || z < PARK.z0 - 0.5) return c.copy(x < PARK.x0 - 4 || x > PARK.x1 + 4 || z < PARK.z0 - 4 ? ROAD : PATH);
  if (x > PARK_ST[0] && x < PARK_ST[1]) return c.copy(ROAD);
  const n = 0.5 + 0.5 * noise(x * 0.09, z * 0.09);
  c.copy(GRASS[0]).lerp(GRASS[1], n);
  // (a stripe or two where it's been mown, and shade under the figs)
  c.multiplyScalar(1 + 0.04 * Math.sign(Math.sin((x - PARK.x0) * 0.35)));
  let shade = 0;
  for (const [tx, tz] of trees) shade = Math.max(shade, 1 - smoothstep(2.5, 6.5, Math.hypot(x - tx, z - tz)));
  c.lerp(SHADE, shade * 0.55);
  const p = offPath(x, z);
  if (p < 0.6) c.lerp(Math.abs(z - AXIS) < 4.2 || Math.hypot(x - FOUNTAIN.x, z - FOUNTAIN.z) < FOUNTAIN.r + 4.2 ? STONE : GRAVEL, smoothstep(0.6, -0.4, p));
  return c;
}

/**
 * The ground: one sheet of 2 m squares from the street to the far side of the park, bar the cutting the station's in
 * (`trees`: where the figs are, for the shade under them)
 */
function groundGeo(trees) {
  const X0 = 468, X1 = 640, Z0 = -358, Z1 = -264, S = 2, pos = [], col = [], c = new THREE.Color();
  const corner = (x, z) => { groundColour(x, z, trees, c); pos.push(x, 0, z); col.push(c.r, c.g, c.b); };
  for (let x = X0; x < X1; x += S) {
    for (let z = Z0; z < Z1; z += S) {
      if (x >= CUT.x0 && x < CUT.x1 && z >= CUT.z0 && z < CUT.z1) continue;
      corner(x, z); corner(x, z + S); corner(x + S, z);
      corner(x + S, z); corner(x, z + S); corner(x + S, z + S);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** a flat bit of something on the ground (w along x, d along z) */
const flat = (w, d, color, x, z, y = 0.02) => part(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), color, [x, y, z]);

/** a sign's face (a plane `w` by `h`, its canvas drawn by `draw`), facing +z */
export function signFace(w, h, draw, px = 512) {
  const tex = canvasTexture(px, Math.round((px * h) / w), draw);
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), toonMat({ map: tex }));
}

/** the iron palisade round the park, on its sandstone kerb, from (ax, az) to (bx, bz) */
function palisade(p, ax, az, bx, bz) {
  const len = Math.hypot(bx - ax, bz - az), rot = [0, -Math.atan2(bz - az, bx - ax), 0], mid = [(ax + bx) / 2, 0, (az + bz) / 2];
  p.push(part(G.box(len, 0.45, 0.5), SAND2, [mid[0], 0.22, mid[2]], rot), part(G.box(len, 0.06, 0.56), SAND, [mid[0], 0.47, mid[2]], rot));
  for (const y of [0.62, 1.55]) p.push(part(G.box(len, 0.05, 0.04), IRON, [mid[0], y, mid[2]], rot));
  const n = Math.round(len / 0.32);
  for (let i = 0; i <= n; i++) {
    const x = ax + ((bx - ax) * i) / n, z = az + ((bz - az) * i) / n;
    p.push(part(G.box(0.035, 1.3, 0.035), IRON, [x, 1.13, z]), part(G.cone(0.04, 0.12, 4), IRON, [x, 1.84, z]));
  }
  // (and a stone pier every so often)
  for (let d = 0; d <= len + 0.01; d += Math.max(len / Math.round(len / 18), 1)) {
    const k = len ? d / len : 0;
    p.push(part(G.box(0.7, 2.0, 0.7), SAND, [ax + (bx - ax) * k, 1.0, az + (bz - az) * k]), part(G.box(0.8, 0.16, 0.8), SAND2, [ax + (bx - ax) * k, 2.06, az + (bz - az) * k]));
  }
}

/** a railing along the top of the cutting, from (ax, az) to (bx, bz), at height y */
function rail(p, ax, az, bx, bz, y = 0) {
  const len = Math.hypot(bx - ax, bz - az), rot = [0, -Math.atan2(bz - az, bx - ax), 0], mid = [(ax + bx) / 2, 0, (az + bz) / 2];
  p.push(part(G.box(len, 0.07, 0.07), 0x3a4a3f, [mid[0], y + 1.1, mid[2]], rot), part(G.box(len, 0.04, 0.04), 0x3a4a3f, [mid[0], y + 0.55, mid[2]], rot));
  const n = Math.max(1, Math.round(len / 1.8));
  for (let i = 0; i <= n; i++) p.push(part(G.box(0.07, 1.1, 0.07), 0x3a4a3f, [ax + ((bx - ax) * i) / n, y + 0.55, az + ((bz - az) * i) / n]));
}

/**
 * A bronze figure, standing (built facing +z, its feet at y 0, about `h` tall): in a frock coat or bare, an arm out
 * (`reach`: how far up it's pointing, radians from straight out in front; null for both down by its sides), a hat
 * or not. Returns { parts, head: the top of its head, hand: its outstretched hand }
 */
function figure(h = 2.3, { coat = true, reach = null, hat = false, color = BRONZE } = {}) {
  const k = h / 2.3, dark = color === BRONZE ? BRONZE2 : new THREE.Color(color).multiplyScalar(0.8).getHex(), p = [];
  for (const s of [-1, 1]) {
    p.push(limb([s * 0.13 * k, 0.05, 0], [s * 0.12 * k, 1.08 * k, 0], 0.09 * k, 0.12 * k, dark, 7));
    p.push(part(G.box(0.16 * k, 0.1 * k, 0.32 * k), dark, [s * 0.13 * k, 0.05, 0.06 * k]));
  }
  if (coat) p.push(part(G.cyl(0.27 * k, 0.4 * k, 0.9 * k, 10), color, [0, 1.12 * k, -0.02], [0.05, 0, 0]));
  p.push(part(G.cyl(0.25 * k, 0.21 * k, 0.72 * k, 10), color, [0, 1.62 * k, 0]));
  p.push(part(G.sphere(0.27 * k, 10, 8), color, [0, 1.92 * k, 0], [0, 0, 0], [1, 0.5, 0.8])); // (the shoulders)
  p.push(limb([0, 1.96 * k, 0], [0, 2.06 * k, 0.02], 0.08 * k, 0.07 * k, color, 6));
  p.push(part(G.sphere(0.135 * k, 10, 8), color, [0, 2.17 * k, 0.02], [0, 0, 0], [0.95, 1.1, 1]));
  let top = 2.31 * k;
  if (hat) {
    p.push(part(G.cyl(0.11 * k, 0.12 * k, 0.24 * k, 10), dark, [0, 2.4 * k, 0.01]), part(G.cyl(0.2 * k, 0.2 * k, 0.02 * k, 12), dark, [0, 2.29 * k, 0.01]));
    top = 2.52 * k;
  }
  const sh = [-0.29 * k, 1.9 * k, 0], hand = reach === null ? null : [-0.32 * k, (1.9 + Math.sin(reach) * 0.7) * k, Math.cos(reach) * 0.7 * k];
  // (one arm down by its side, holding a scroll or a hat; the other out, or down too)
  p.push(limb([0.29 * k, 1.9 * k, 0], [0.33 * k, 1.2 * k, 0.08 * k], 0.075 * k, 0.06 * k, color, 6), part(G.cyl(0.05 * k, 0.05 * k, 0.32 * k, 8), dark, [0.34 * k, 1.12 * k, 0.12 * k], [0.3, 0, 0]));
  if (hand) p.push(limb(sh, hand, 0.075 * k, 0.06 * k, color, 6), part(G.sphere(0.07 * k, 8, 6), color, hand));
  else p.push(limb(sh, [-0.33 * k, 1.2 * k, 0.04 * k], 0.075 * k, 0.06 * k, color, 6));
  return { parts: p, head: top, hand };
}

/** a statue on its plinth (built facing +z, the plinth's foot at y 0): returns { geo, head, hand } (heights, and where the hand is) */
function statueGeo(spec) {
  const P = 2.3, f = figure(2.3, spec), p = [
    part(G.box(2.2, 0.35, 2.2), SAND2, [0, 0.17, 0]),
    part(G.box(1.8, P - 0.6, 1.8), SAND, [0, 0.35 + (P - 0.6) / 2, 0]),
    part(G.box(2.0, 0.25, 2.0), SAND2, [0, P - 0.12, 0]),
    part(G.box(1.0, 0.36, 0.04), BRONZE2, [0, 1.15, 0.91]), // (the plaque)
  ];
  for (const g of f.parts) p.push(g.translate(0, P, 0));
  return { geo: merge(p), head: P + f.head, hand: f.hand && [f.hand[0], f.hand[1] + P, f.hand[2]] };
}

/* ------------------------------------------------------------------ the fountain */
/**
 * The Archibald Fountain (in its own frame, the middle of the basin at the origin): the basin, Apollo up in the middle on
 * his pedestal with his arm out, and round him in the water, three groups on their rocks (a bull, a stag and a goat-legged
 * fellow, more or less, at this size); the jets come up out of the rim and arc in over the lot
 */
function fountainGeo() {
  const R = FOUNTAIN.r, p = [
    part(G.cyl(R, R + 0.15, 0.62, 48, true), 0xd8cdb6, [0, 0.31, 0]), // (the basin's wall, round the water: the rim's over the top of it)
    part(G.torus(R - 0.1, 0.22, 8, 64), 0xe2d8c3, [0, 0.64, 0], [Math.PI / 2, 0, 0]),
    part(G.cyl(R - 0.3, R - 0.3, 0.04, 48), 0x5fb5d8, [0, FOUNTAIN.water, 0]),
    part(G.cyl(1.5, 1.9, 1.2, 16), 0xd8cdb6, [0, 0.6, 0]),
    part(G.cyl(0.9, 1.2, 2.4, 12), 0xd2c6ad, [0, 2.4, 0]),
    part(G.cyl(1.25, 1.0, 0.35, 12), 0xd8cdb6, [0, 3.7, 0]),
  ];
  const apollo = figure(2.6, { coat: false, reach: 0.9 });
  for (const g of apollo.parts) p.push(g.translate(0, 3.85, 0));
  // (round him, on their rocks in the water)
  [[0.5, 'bull'], [0.5 + TAU / 3, 'stag'], [0.5 + (2 * TAU) / 3, 'pan']].forEach(([a, kind]) => {
    const x = Math.cos(a) * 4.1, z = Math.sin(a) * 4.1, face = -a + Math.PI / 2, rot = (g) => g.rotateY(face).translate(x, 0, z);
    p.push(rot(part(G.dodec(1.1), 0xb9ad94, [0, 0.35, 0], [0.3, 0.2, 0], [1.2, 0.55, 1])));
    const b = [];
    if (kind === 'bull' || kind === 'stag') {
      b.push(part(G.sphere(1, 12, 8), BRONZE, [0, 1.25, 0], [0, 0, 0], [0.42, 0.42, 0.85]));
      for (const [lx, lz] of [[-0.22, 0.5], [0.22, 0.5], [-0.22, -0.5], [0.22, -0.5]]) b.push(limb([lx, 1.1, lz], [lx, 0.55, lz + 0.05], 0.09, 0.06, BRONZE2, 6));
      b.push(limb([0, 1.4, 0.6], [0, 1.75, 0.95], 0.16, 0.13, BRONZE, 7), part(G.sphere(0.2, 8, 6), BRONZE, [0, 1.82, 1.08], [0, 0, 0], [0.8, 0.8, 1.3]));
      if (kind === 'bull') for (const s of [-1, 1]) b.push(limb([s * 0.12, 1.95, 1.05], [s * 0.38, 2.15, 1.0], 0.04, 0.015, 0xb8a676, 5));
      else for (const s of [-1, 1]) b.push(limb([s * 0.1, 1.98, 1.02], [s * 0.3, 2.55, 0.9], 0.03, 0.015, BRONZE2, 5), limb([s * 0.22, 2.3, 0.95], [s * 0.42, 2.45, 1.1], 0.02, 0.01, BRONZE2, 4));
      // (and a figure wrestling it, or after it)
      const f = figure(2.0, { coat: false, reach: kind === 'bull' ? 0.3 : 1.2 });
      for (const g of f.parts) b.push(g.rotateY(kind === 'bull' ? 0.9 : -0.6).translate(kind === 'bull' ? -0.75 : 0.8, 0.5, -0.2));
    } else {
      const f = figure(2.1, { coat: false, reach: 1.4 });
      for (const g of f.parts) b.push(g.translate(0, 0.6, 0));
      b.push(part(G.sphere(1, 10, 8), BRONZE2, [0, 1.0, 0], [0, 0, 0], [0.32, 0.3, 0.28])); // (the shaggy goat legs, roughly)
    }
    for (const g of b) p.push(rot(g));
  });
  return merge(p);
}

/** the jets, arcing in from the rim over the water (and up from Apollo's feet): pale, see-through water */
function jetsGeo() {
  const R = FOUNTAIN.r, p = [], v = new THREE.Vector3();
  const arc = (ax, az, ay, bx, bz, by, up) => {
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      pts.push(v.set(ax + (bx - ax) * t, ay + (by - ay) * t + up * 4 * t * (1 - t), az + (bz - az) * t).clone());
    }
    p.push(part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 18, 0.045, 5), 0xe6f7ff));
  };
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU, c = Math.cos(a), s = Math.sin(a);
    arc(c * (R - 0.15), s * (R - 0.15), 0.7, c * (R - 3.2), s * (R - 3.2), FOUNTAIN.water, 1.6);
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2, c = Math.cos(a), s = Math.sin(a);
    arc(c * 1.5, s * 1.5, 1.25, c * 3.0, s * 3.0, FOUNTAIN.water, 0.9);
  }
  return merge(p);
}

/* ------------------------------------------------------------------ round the outside */
/** St Mary's, over College Street: a sandstone nave with its buttresses, the tower over the crossing, and two more at the front */
function stMarys(p) {
  const x0 = 486, x1 = 540, z = -372, w = 16, h = 17;
  p.push(part(G.box(x1 - x0, h, w), SAND, [(x0 + x1) / 2, h / 2, z]));
  p.push(part(G.cyl(1, 1, 1, 3), 0x7d6b55, [(x0 + x1) / 2, h + 3.2, z], [0, 0, Math.PI / 2], [6.4, x1 - x0, w * 0.55])); // (the roof)
  for (let x = x0 + 4; x < x1 - 2; x += 6) {
    p.push(part(G.box(1.2, h * 0.8, 1.6), SAND2, [x, h * 0.4, z + w / 2 + 0.8]));
    p.push(part(G.box(1.6, h * 0.55, 0.1), 0x3d3a45, [x + 3, h * 0.55, z + w / 2 + 0.06])); // (the windows: tall and pointed, near enough)
    p.push(part(G.cone(0.8, 1.4, 4), 0x3d3a45, [x + 3, h * 0.83 + 0.6, z + w / 2 + 0.06], [0, Math.PI / 4, 0], [1, 1, 0.08]));
  }
  p.push(part(G.box(10, 34, 10), SAND, [506, 17, z]), part(G.cone(5.6, 6, 4), SAND2, [506, 37, z], [0, Math.PI / 4, 0]));
  for (const s of [-1, 1]) {
    p.push(part(G.box(7, 33, 7), SAND, [x1 + 2.5, 16.5, z + s * 4.5]), part(G.cone(4.2, 7, 4), SAND2, [x1 + 2.5, 36.5, z + s * 4.5], [0, Math.PI / 4, 0]));
    for (let y = 8; y < 30; y += 7) p.push(part(G.box(0.1, 3.2, 1.6), 0x3d3a45, [x1 + 6.06, y, z + s * 4.5]));
  }
  p.push(part(G.box(0.1, 9, 4.5), 0x3d3a45, [x1 + 6.06, 7, z]), part(G.cone(2.4, 3, 4), 0x3d3a45, [x1 + 6.06, 12.4, z], [0, Math.PI / 4, 0], [1, 1, 0.04]));
}

/** the Australian Museum, at the bottom end of College Street: sandstone, with its columns along the front */
function museum(p) {
  const x0 = 566, x1 = 600, z = -367;
  p.push(part(G.box(x1 - x0, 14, 18), SAND, [(x0 + x1) / 2, 7, z]), part(G.box(x1 - x0 + 0.6, 1.2, 18.6), SAND2, [(x0 + x1) / 2, 14.4, z]));
  for (let x = x0 + 3; x < x1 - 1; x += 3.4) p.push(part(G.cyl(0.55, 0.62, 11, 10), 0xe6d2a5, [x, 5.9, z + 9.8]));
  p.push(part(G.box(x1 - x0, 1.4, 1.8), SAND2, [(x0 + x1) / 2, 11.9, z + 9.8]), part(G.box(x1 - x0, 0.8, 2.4), SAND2, [(x0 + x1) / 2, 0.4, z + 10]));
}

/** the Anzac Memorial: a stepped granite podium, and the tower on it, with its buttresses and the figures on them */
function memorial(p) {
  const { x, z, half } = MEMORIAL, GRANITE = 0xa58a74, TOWER = 0xd7b98a;
  p.push(part(G.box(half * 2 + 2, 0.5, half * 2 + 2), GRANITE, [x, 0.25, z]), part(G.box(half * 2, 1.0, half * 2), GRANITE, [x, 0.75, z]));
  p.push(part(G.box(9.4, 11, 9.4), TOWER, [x, 6.7, z]), part(G.box(8, 3, 8), TOWER, [x, 13.5, z]), part(G.box(6.4, 1.6, 6.4), 0xc9a874, [x, 15.8, z]));
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    p.push(part(G.box(1.6, 12.5, 1.6), TOWER, [x + sx * 4.5, 7.4, z + sz * 4.5]));
    const f = figure(1.9, { coat: true, color: 0xcdb487 });
    for (const g of f.parts) p.push(g.rotateY(Math.atan2(sx, sz)).translate(x + sx * 4.9, 13.65, z + sz * 4.9));
  }
  // (the great windows, a tall amber slot up the middle of each side)
  for (const [dx, dz, ry] of [[4.71, 0, Math.PI / 2], [-4.71, 0, Math.PI / 2], [0, 4.71, 0], [0, -4.71, 0]]) p.push(part(G.box(1.8, 6.5, 0.05), 0xc88a3a, [x + dx, 7.5, z + dz], [0, ry, 0]));
}

/** the pool of reflection: still water in a granite kerb, in line with the memorial */
function pool(p) {
  const { x0, x1, z0, z1 } = POOL;
  p.push(part(G.box(x1 - x0 + 1.2, 0.4, z1 - z0 + 1.2), 0xa58a74, [(x0 + x1) / 2, 0.2, (z0 + z1) / 2]));
  p.push(part(G.box(x1 - x0, 0.04, z1 - z0), 0x6aa9c6, [(x0 + x1) / 2, 0.36, (z0 + z1) / 2]));
}

/** a Hyde Park lamp: a fluted iron post and a frosted globe */
export function lampGeo() {
  return merge([
    part(G.cyl(0.18, 0.24, 0.5, 10), IRON, [0, 0.25, 0]),
    part(G.cyl(0.07, 0.1, 3.2, 8), IRON, [0, 2.0, 0]),
    part(G.cyl(0.18, 0.12, 0.18, 10), IRON, [0, 3.65, 0]),
    part(G.sphere(0.3, 12, 9), 0xfdf6dc, [0, 4.0, 0]),
  ]);
}

/** a park bench (front towards +z): slats, cast-iron ends */
export function benchGeo() {
  return merge([
    part(G.box(2, 0.07, 0.5), 0x8a5a3a, [0, 0.47, 0]),
    part(G.box(2, 0.42, 0.06), 0x8a5a3a, [0, 0.8, -0.24], [-0.15, 0, 0]),
    part(G.box(0.08, 0.5, 0.55), IRON, [-0.9, 0.25, 0]),
    part(G.box(0.08, 0.5, 0.55), IRON, [0.9, 0.25, 0]),
  ]);
}

/* ------------------------------------------------------------------ the station */
/** the cutting: its walls (cream tiles inside, with a maroon band), the platform, the tracks, and the stairs down to them */
function station(p) {
  const { x0, x1, z0, z1 } = CUT, Y = PLATFORM.y, TILE = 0xeee6cf, BAND = 0x7a2a2a, BED = -7.3;
  // the walls, down to the track bed: along the back of the platform, along the far side of the tracks, and at the ends
  // (the tunnels' mouths are cut in those: see portal)
  p.push(part(G.box(x1 - x0, -BED, 0.8), TILE, [(x0 + x1) / 2, BED / 2, z0 + 0.4]));
  p.push(part(G.box(x1 - x0, -BED, 0.8), TILE, [(x0 + x1) / 2, BED / 2, z1 - 0.4]));
  for (const z of [z0 + 0.81, z1 - 0.81]) p.push(part(G.box(x1 - x0, 0.3, 0.02), BAND, [(x0 + x1) / 2, Y + 2.6, z]));
  // (the platform, the edge painted yellow; the stairs down onto it, and the walls either side of them)
  p.push(part(G.box(PLATFORM.x1 - PLATFORM.x0, Y - BED, PLATFORM.z1 - PLATFORM.z0), 0xb9b4a6, [(PLATFORM.x0 + PLATFORM.x1) / 2, (Y + BED) / 2, (PLATFORM.z0 + PLATFORM.z1) / 2]));
  p.push(part(G.box(PLATFORM.x1 - PLATFORM.x0, 0.02, 0.35), 0xf2c230, [(PLATFORM.x0 + PLATFORM.x1) / 2, Y + 0.01, PLATFORM.z1 - 0.3]));
  const { n } = STAIRS, tread = (STAIRS.x1 - STAIRS.x0) / n;
  for (let i = 0; i < n; i++) {
    const top = Y * ((i + 0.5) / n);
    p.push(part(G.box(tread, top - BED, STAIRS.z1 - STAIRS.z0), i % 2 ? 0xc8c2b2 : 0xbdb6a5, [STAIRS.x0 + (i + 0.5) * tread, (top + BED) / 2, (STAIRS.z0 + STAIRS.z1) / 2]));
    p.push(part(G.box(0.08, 0.02, STAIRS.z1 - STAIRS.z0), 0xe8d9a8, [STAIRS.x0 + i * tread + 0.04, top + 0.01, (STAIRS.z0 + STAIRS.z1) / 2])); // (the nosings)
  }
  for (const [a, b] of [[z0 + 0.8, STAIRS.z0], [STAIRS.z1, PLATFORM.z1]]) p.push(part(G.box(STAIRS.x1 - STAIRS.x0, -BED, b - a), TILE, [(STAIRS.x0 + STAIRS.x1) / 2, BED / 2, (a + b) / 2]));
  // (the ends: the far one's solid behind the platform; over the tracks, both are only the wall over the tunnel's mouth)
  p.push(part(G.box(0.8, -BED, PLATFORM.z1 - z0), TILE, [x1 - 0.4, BED / 2, (z0 + PLATFORM.z1) / 2]));
  for (const x of [x0 + 0.4, x1 - 0.4]) p.push(part(G.box(0.8, -MOUTH_TOP, z1 - PLATFORM.z1), TILE, [x, MOUTH_TOP / 2, (PLATFORM.z1 + z1) / 2]));
  // the tracks: ballast, sleepers, rails
  p.push(part(G.box(x1 - x0 + 30, 0.3, PLATFORM.z1 - z1 + 0.8), 0x6b6560, [(x0 + x1) / 2, BED + 0.15, (PLATFORM.z1 + z1) / 2]));
  for (let x = x0 - 15; x < x1 + 15; x += 0.7) p.push(part(G.box(0.24, 0.14, 2.5), 0x5a4a3a, [x, BED + 0.36, TRACK_Z]));
  for (const s of [-1, 1]) p.push(part(G.box(x1 - x0 + 30, 0.14, 0.08), 0x9aa0a6, [(x0 + x1) / 2, RAIL_Y - 0.07, TRACK_Z + s * 0.72]));
  // the tunnels, at either end: a dark mouth in the wall (the way the train goes on, and the way it came)
  for (const [x, k] of [[PORTALS[0], -1], [PORTALS[1], 1]]) {
    const xi = x - k * 0.8, zc = (PLATFORM.z1 + z1 - 0.8) / 2; // (the wall's inside face, and the middle of the mouth)
    p.push(part(G.box(0.25, 0.5, z1 - PLATFORM.z1), 0xc4b9a0, [xi - k * 0.12, MOUTH_TOP + 0.25, zc])); // (the lintel over its mouth)
    for (const z of [PLATFORM.z1 - 0.2, z1 - 0.6]) p.push(part(G.box(0.25, MOUTH_TOP - BED, 0.4), 0xc4b9a0, [xi - k * 0.12, (MOUTH_TOP + BED) / 2, z]));
  }
}

/** the station's way in, at the top of the stairs: a sandstone arch over them, with the station's name across it */
function entrance(world, s) {
  const x = STAIRS.x0 + 0.4, zc = (STAIRS.z0 + STAIRS.z1) / 2, w = STAIRS.z1 - STAIRS.z0, p = [];
  for (const k of [-1, 1]) {
    p.push(part(G.box(1.2, 4.2, 1.0), SAND, [x, 2.1, zc + k * (w / 2 + 0.5)]), part(G.box(1.4, 0.3, 1.2), SAND2, [x, 4.35, zc + k * (w / 2 + 0.5)]));
    p.push(part(G.sphere(0.32, 10, 8), 0xfff3c4, [x, 4.85, zc + k * (w / 2 + 0.5)]), part(G.cyl(0.08, 0.12, 0.3, 8), IRON, [x, 4.6, zc + k * (w / 2 + 0.5)]));
  }
  p.push(part(G.box(1.0, 1.0, w + 2.2), SAND, [x, 3.9, zc]));
  const m = vcMesh(merge(p), { cast: true, receive: true });
  s.add(m);
  for (const k of [-1, 1]) world.colliders.push({ x, z: zc + k * (w / 2 + 0.5), r: 0.7 });
  const sign = signFace(w + 1.6, 0.7, (c, cw, ch) => {
    c.fillStyle = '#7a2a2a'; c.fillRect(0, 0, cw, ch);
    c.fillStyle = '#f3e7c4'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `bold ${Math.round(ch * 0.6)}px sans-serif`; c.fillText('MUSEUM STATION', cw / 2, ch / 2 + 2);
  });
  sign.position.set(x - 0.51, 3.9, zc);
  sign.rotation.y = -Math.PI / 2; // (facing back up the park, the way you come at it)
  s.add(sign);
}

/** the station's name, on the wall behind the platform (and a timetable, and a bench to wait on) */
function platformSigns(s) {
  const draw = (c, cw, ch) => {
    c.fillStyle = '#f3e7c4'; c.fillRect(0, 0, cw, ch);
    c.strokeStyle = '#7a2a2a'; c.lineWidth = ch * 0.1; c.strokeRect(ch * 0.08, ch * 0.08, cw - ch * 0.16, ch - ch * 0.16);
    c.fillStyle = '#7a2a2a'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `bold ${Math.round(ch * 0.56)}px sans-serif`; c.fillText('MUSEUM', cw / 2, ch / 2 + 2);
  };
  for (const x of [570, 588]) {
    const m = signFace(3.6, 0.8, draw);
    m.position.set(x, PLATFORM.y + 2.2, CUT.z0 + 0.82);
    s.add(m);
  }
}

/* ------------------------------------------------------------------ */
export function buildHyde(world) {
  const s = new THREE.Group();
  world.scene.add(s);
  const statics = [], round = [];

  // --- the figs: an avenue of them down the middle (either side of the pool, too), and more about the lawns
  const trees = [];
  for (const x of [516, 525, 534]) for (const z of [AXIS + 8.5, AXIS - 8.5]) trees.push([x, z, rand(6.5, 8)]);
  for (const x of [557, 566, 575]) for (const z of [AXIS + 10.5, AXIS - 10.5]) trees.push([x, z, rand(6, 7.5)]);
  for (const [x, z] of [[482, -287], [489, -343], [500, -285], [519, -343], [530, -284], [550, -341], [562, -293], [592, -292], [593, -341], [482, -330], [512, -330]]) trees.push([x, z, rand(6.5, 8.5)]);
  for (const [x, z, h] of trees) {
    const m = vcMesh(fig(h));
    m.position.set(x, 0, z);
    m.rotation.y = rand(0, TAU);
    m.scale.setScalar(rand(1.05, 1.3)); // (these have had the room to spread)
    world.addSway(m);
    world.scene.add(m);
    world.colliders.push({ x, z, r: 0.7 });
    world.treeSpots.push({ x, z, h: h + 2, palette: 'fig', n: 9 });
  }

  // --- the ground, and the zebra crossing over Elizabeth Street from the laneway, and over Park Street
  s.add(vcMesh(groundGeo(trees), { cast: false, receive: true }));
  for (let x = LANE.x0 + 0.5; x < LANE.x1; x += 1.1) statics.push(flat(0.55, 3.6, 0xf2f2f2, x, -272, 0.03));
  for (let z = AXIS - 3.6; z <= AXIS + 3.6; z += 1.1) statics.push(flat(PARK_ST[1] - PARK_ST[0] - 1, 0.55, 0xf2f2f2, (PARK_ST[0] + PARK_ST[1]) / 2, z, 0.03));
  for (const x of PARK_ST) statics.push(part(G.box(0.25, 0.12, PARK.z1 - PARK.z0), 0xbdb8ab, [x, 0.06, (PARK.z0 + PARK.z1) / 2]));
  for (let z = PARK.z0 + 2; z < PARK.z1 - 2; z += 6) if (Math.abs(z - AXIS) > 5) statics.push(flat(0.15, 3, 0xf2f2f2, (PARK_ST[0] + PARK_ST[1]) / 2, z, 0.03));

  // --- the railings round the park (bar the way in from the laneway, and the cutting, which has its own)
  const { x0, x1, z0, z1 } = PARK;
  palisade(statics, x0, z1, LANE.x0, z1);
  palisade(statics, LANE.x1, z1, CUT.x0, z1);
  palisade(statics, x0, z0, x0, z1);
  palisade(statics, x0, z0, x1, z0);
  palisade(statics, x1, z0, x1, CUT.z0);
  for (const k of [-1, 1]) {
    const x = k < 0 ? LANE.x0 - 0.4 : LANE.x1 + 0.4;
    statics.push(part(G.box(0.9, 2.6, 0.9), SAND, [x, 1.3, z1]), part(G.sphere(0.4, 10, 8), SAND2, [x, 2.85, z1]));
  }

  // --- the fountain, and the jets, and the paving round it
  const fountain = new THREE.Group();
  fountain.position.set(FOUNTAIN.x, 0, FOUNTAIN.z);
  fountain.add(vcMesh(fountainGeo(), { cast: true, receive: true }));
  const jets = new THREE.Mesh(jetsGeo(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false }));
  fountain.add(jets);
  s.add(fountain);
  round.push([FOUNTAIN.x, FOUNTAIN.z, FOUNTAIN.r + 0.2]); // (nobody walks in: a turkey after a wash hops in over the rim, see the baths)
  // (each spot in the water to wash in, round inside the rim, and the spot outside it to hop in from)
  const BATH = 10, baths = Array.from({ length: BATH }, (_, i) => {
    const a = (i / BATH) * TAU + 0.15, c = Math.cos(a), sn = Math.sin(a), r = FOUNTAIN.r - 1.3 - (i % 2) * 0.6;
    return { at: [c * r, FOUNTAIN.water - 0.22, sn * r], face: Math.atan2(c, sn) + Math.PI + (hash(i, 3) - 0.5), ground: [c * (FOUNTAIN.r + 1.2), sn * (FOUNTAIN.r + 1.2)], hop: [0.45, 0.8] };
  });

  // --- the statues, on the lawns: [x, z, facing, which]
  const STATUES = [[487, -326, Math.PI / 2, { reach: 0.25, hat: false }], [529, -293, Math.PI, { reach: null, hat: true }], [566, -340, Math.PI / 2, { reach: 0.6, hat: false, coat: true }]];
  const statues = STATUES.map(([x, z, face, spec]) => {
    const st = statueGeo(spec), obj = vcMesh(st.geo, { cast: true, receive: true });
    obj.position.set(x, 0, z);
    obj.rotation.y = face;
    s.add(obj);
    world.colliders.push({ x, z, r: 1.45 });
    statics.push(flat(5, 5, 0xcfc4ad, x, z, 0.025));
    // (up on his head, and one out on his hand, if he's holding it out)
    const perches = [{ at: [0, st.head - 0.04, 0.02], face: 0, ground: [0, 2.6], hop: [0.75, 1.5] }];
    if (st.hand) perches.push({ at: [st.hand[0], st.hand[1] + 0.05, st.hand[2]], face: -Math.PI / 2, ground: [-1.2, 2.4], hop: [0.7, 1.3] });
    return { obj, perches };
  });

  // --- the pool, the memorial, St Mary's and the Museum, and the lamps and benches along the avenue
  pool(statics);
  for (const [ax, az, bx, bz] of [[POOL.x0, POOL.z0, POOL.x1, POOL.z0], [POOL.x1, POOL.z0, POOL.x1, POOL.z1], [POOL.x1, POOL.z1, POOL.x0, POOL.z1], [POOL.x0, POOL.z1, POOL.x0, POOL.z0]]) {
    world.addSegment(ax, az, bx, bz, 0.6, false);
  }
  memorial(statics);
  round.push([MEMORIAL.x, MEMORIAL.z, MEMORIAL.half + 1]);
  const far = [];
  stMarys(far);
  museum(far);
  const lamp = lampGeo();
  for (let x = 484; x < PARK.x1; x += 14) {
    if (Math.abs(x - FOUNTAIN.x) < FOUNTAIN.r + 4 || (x > PARK_ST[0] - 2 && x < PARK_ST[1] + 2) || (x > POOL.x0 - 2 && x < MEMORIAL.x + 10)) continue;
    for (const k of [-1, 1]) {
      statics.push(lamp.clone().translate(x, 0, AXIS + k * 4.6));
      round.push([x, AXIS + k * 4.6, 0.2]);
    }
  }
  lamp.dispose();
  const bench = benchGeo(), backs = [-0.66, 0, 0.66].map((x) => ({ at: [x, 1.03, -0.26], face: 0, ground: [x, 1.1], hop: [0.45, 0.8] })), seats = [];
  for (const [x, z, r] of [[520, AXIS - 5, 0], [520, AXIS + 5, Math.PI], [529, AXIS - 5, 0], [529, AXIS + 5, Math.PI], [560, AXIS - 7.5, 0], [570, AXIS + 7.5, Math.PI], [500, -289, Math.PI / 2], [FOUNTAIN.x + 11.5, AXIS + 4, -Math.PI / 2]]) {
    const b = vcMesh(bench.clone(), { cast: true, receive: true });
    b.position.set(x, 0, z);
    b.rotation.y = r;
    s.add(b);
    for (const k of [-0.6, 0.6]) world.colliders.push({ x: x + k * Math.cos(r), z: z - k * Math.sin(r), r: 0.45 });
    seats.push({ obj: b, perches: backs });
  }
  bench.dispose();

  // --- the station: the cutting, its way in and its signs, and the railings round the top of it
  station(statics);
  const rails = [];
  rail(rails, CUT.x0, CUT.z0, CUT.x1, CUT.z0);
  rail(rails, CUT.x0, CUT.z1, CUT.x1, CUT.z1);
  rail(rails, CUT.x0, CUT.z1, CUT.x0, PLATFORM.z1);
  rail(rails, CUT.x0 + 0.2, STAIRS.z1 + 0.1, STAIRS.x1, STAIRS.z1 + 0.1, 0);
  rail(rails, CUT.x0 + 0.2, STAIRS.z0 - 0.1, STAIRS.x1, STAIRS.z0 - 0.1, 0);
  entrance(world, s);
  platformSigns(s);
  for (const x of [574, 592]) {
    const b = vcMesh(benchGeo(), { cast: true, receive: true });
    b.position.set(x, PLATFORM.y, PLATFORM.z0 + 0.55);
    s.add(b);
  }
  // (the tunnels' mouths: dark all the way in, so the train's gone once it's in one)
  const dark = new THREE.MeshBasicMaterial({ color: 0x0a0a0c });
  for (const [x, k] of [[PORTALS[0], -1], [PORTALS[1], 1]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(80, MOUTH_TOP - RAIL_Y + 0.4, CUT.z1 - 0.8 - PLATFORM.z1), dark);
    m.position.set(x + k * (40 - 0.75), (MOUTH_TOP + RAIL_Y - 0.4) / 2, (PLATFORM.z1 + CUT.z1 - 0.8) / 2);
    s.add(m);
  }

  // --- and all round the outside: Elizabeth Street's buildings, St James's end, College Street (St Mary's, the Museum)
  // and the towers past Liverpool Street, at the bottom end
  const cols = [0x8fa9bf, 0x6f8faf, 0xb9c3cb, 0xd9d4c5, 0x9fb3c2, 0xc9c1b0, 0xa7b4a8, 0xc47c5a, 0xd9c49a];
  const tower = (x, z, w, d, h) => {
    const b = building(w, h, d, pick(cols));
    b.position.set(x, h / 2, z);
    s.add(b);
  };
  for (let x = 526; x < 600; x += 13) tower(x, -258, rand(10, 12.5), 12, rand(18, 40)); // (Elizabeth Street, past the Town Hall)
  for (let z = -282; z > -352; z -= 13) tower(461, z, 13, rand(10, 12.5), rand(20, 42)); // (St James's end)
  for (let z = -266; z > -356; z -= 15) tower(616, z, 14, rand(12, 14), rand(26, 50)); // (past Liverpool Street)
  for (let x = 468; x < 620; x += 16) tower(x, -398, rand(12, 15), 14, rand(30, 60)); // (behind St Mary's, and the Museum)
  for (let x = 640; x < 700; x += 18) for (let z = -260; z > -380; z -= 20) tower(x + rand(-3, 3), z, 14, 14, rand(36, 70));
  s.add(vcMesh(merge(statics), { cast: true, receive: true }));
  s.add(vcMesh(merge(rails), { cast: true, receive: false }));
  s.add(vcMesh(merge(far), { cast: true, receive: true }));
  for (const [x, z, r] of round) world.colliders.push({ x, z, r });

  // the fountain's spray: drifting off the jets, when there's anyone about to see it
  const spray = new THREE.Vector3(), jetsMat = jets.material;
  let sprayT = 0;
  return {
    seats, // (the backs of the benches, for turkeys to perch on: see main.js)
    statues, // (their heads, to sit on)
    bath: { obj: fountain, perches: baths }, // (the fountain, to have a wash in)
    update(dt, t) {
      jetsMat.opacity = 0.5 + Math.sin(t * 7) * 0.04 + Math.sin(t * 13.1) * 0.03;
      const p = world.game.player.pos;
      if (Math.hypot(p.x - FOUNTAIN.x, p.z - FOUNTAIN.z) > 40 || (sprayT -= dt) > 0) return;
      sprayT = 0.12;
      const a = rand(0, TAU), r = rand(FOUNTAIN.r - 3.4, FOUNTAIN.r - 2.6);
      spray.set(FOUNTAIN.x + Math.cos(a) * r, FOUNTAIN.water + 0.1, FOUNTAIN.z + Math.sin(a) * r);
      world.game.fx.burst(spray, { glow: true, n: 2, colors: [0xffffff, 0xdff6ff], speed: [0.2, 0.8], up: [0.8, 1.8], grav: 6, size: [0.03, 0.05], life: [0.3, 0.6] });
    },
  };
}
