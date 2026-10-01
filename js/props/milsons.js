import * as THREE from 'three';
import { part, merge, vcMesh, G, limb, rand, pick, noise, smoothstep, clamp, TAU, toonMat, canvasTexture } from '../util.js';
import { fig } from './city.js';
import { SEA, seaMat } from './beach.js';
import { sailsGeo } from './opera.js';
import { ferryParts } from './harbour.js';
import { chipsGeo } from './wharf.js';
import { signFace, benchGeo, lampGeo } from './hyde.js';

/*
 * Milsons Point, over the Bridge, where the train from Museum comes in: the platform up on the viaduct, the stairs
 * down off the end of it to the street, and under the line, Bradfield Park, running down to the water. And the view:
 * the Bridge going over on your left, from the pylons at the bottom of the park, and across the harbour, the Quay,
 * the Opera House and the city (a long way off, and kept simple). Round along the water is Luna Park, its big face
 * grinning at you over the boardwalk: walk in through its mouth, and that's as far as it goes, for now.
 *
 * It's off on its own, well away from everywhere else (the train's the only way here, and the tunnels the only way
 * back): OX along from the rest of the world, and laid out the way the first leg is, looking down it, so south, over
 * the harbour, is -z, and round the corner into Luna Park, west, is +x (the second leg's way on).
 */
export const OX = -1000; // (how far along x from the rest of the world it all is: everything below's from there)
const PLAT = { x0: -22, x1: 22, z0: -2.6, z1: 3.2, y: 6 }; // the platform, up on the viaduct
const TRACK_Z = -4.5, RAIL_Y = PLAT.y - 1.1; // (the line, along the front of it, and the tops of its rails)
/** where the train stops at Milsons Point (the middle of her): her doors open onto the platform, on her +z side */
export const MILSONS_STOP = { x: OX, z: TRACK_Z, y: PLAT.y, side: 1 };
const STAIRS = { x0: -32, x1: -22, z0: -1.6, z1: 2.4, n: 24 }; // down off the east end of the platform, to the street (the foot's at x0)
const FORE = { x0: -45, x1: -31.5, z0: -9, z1: 7 }; // the forecourt at the foot of the stairs, and the way under the line
const DECK = { x0: -54, z0: -6.5, z1: -2.6 }; // the viaduct the line's on (its top at RAIL_Y), from the Bridge's approach to the hill
const HILL = { x: 26, z: -16, y: 10 }; // the hill the line goes on into: its face (x), the wall along the foot of it (z), and how high
const PARK = { x0: -45, x1: 48, z0: -56, z1: -8 }; // Bradfield Park
const SHEET = { x0: -58, x1: 176, z0: -58, z1: 38 }; // the flat, down by the water (the land beyond's all hills, or harbour)
const FACE = { x: 124, z: -34, r: 8.5, y: 8.6 }; // Luna Park's face, looking out at you from the end of the boardwalk
const MOUTH = { hw: 2.4, top: 4.0 }; // (its mouth, the way in: half as wide, and how high the top of it is)
const BR = { x: -64, z0: -64, z1: -264, deck: 20, hw: 11 }; // the Bridge: down the middle, the pylons at either end, and its deck
const OPERA = [-152, -246]; // (the Opera House, on Bennelong Point)

export const MILSONS_RECT = [PARK.x0 + OX, -58, 50 + OX, 8];
export const LUNA_RECT = [50 + OX, -60, 130 + OX, HILL.z];
/** round the corner into Luna Park: no gate at all, just the boardwalk going on along the water */
export const LUNA_GAP = { x: 50 + OX, z: -36, d: [1, 0], hw: 19, span: [-55, -17] };

// what's about: a mound in the park, bins, ibises and rats, and seagulls round the chips on the boardwalk
export const MILSONS_MOUND = [OX - 12, -34];
export const MILSONS_BINS = [['red', OX - 42.5, -11, Math.PI / 2], ['yellow', OX + 8, -49, Math.PI], ['red', OX + 86, -45.5, Math.PI], ['green', OX + 106, -18.5, 0]];
export const MILSONS_IBISES = [['ibis', OX + 6, -24], ['ibis', OX + 30, -46], ['ibis', OX + 74, -26], ['big', OX + 102, -29], ['ibis', OX + 112, -45]];
export const MILSONS_RATS = [[OX - 40.5, -13], [OX - 38.5, -11.5], [OX + 84, -43.5], [OX + 88.5, -42.5], [OX + 104, -21.5]];
export const LUNA_GULLS = [[OX + 64, -52.5, 2], [OX + 96, -53, 3]];

/** is (x, z) in through Luna Park's mouth? (as far as it goes, for now) */
export const inMouth = (x, z) => x - OX > FACE.x - 0.7 && Math.abs(z - FACE.z) < MOUTH.hw;
/** where you're stood after, just out in front of the face */
export const OUTSIDE = [FACE.x - 5 + OX, FACE.z];

/* ------------------------------------------------------------------ the lie of the land */
/** the ground: flat, bar the platform, the stairs down off it, and the line along it */
export function milsonsGround(x, z) {
  x -= OX;
  if (x >= PLAT.x0 && x <= PLAT.x1) {
    if (z >= PLAT.z0 && z <= PLAT.z1) return PLAT.y;
    if (z >= DECK.z0 && z < PLAT.z0) return RAIL_Y;
  }
  if (x >= STAIRS.x0 && x < STAIRS.x1 && z >= STAIRS.z0 - 0.3 && z <= STAIRS.z1 + 0.3) return (PLAT.y * (x - STAIRS.x0)) / (STAIRS.x1 - STAIRS.x0);
  return 0;
}

const at = (x, z) => [x + OX, z];
const box = (x0, z0, x1, z1) => [x0 + OX, z0, x1 + OX, z1];
// the lie of the land (see Track): off the platform, down the stairs, under the line and into the park
export const MILSONS_TRACK = {
  nodes: { plat: at(-21.8, 0.4), foot: at(-31.9, 0.4), under: at(-38.5, -8.5), park: at(10, -24) },
  rooms: [
    { rect: box(PLAT.x0 + 0.2, PLAT.z0 + 0.35, PLAT.x1 - 0.4, PLAT.z1 - 0.4), nodes: ['plat'], ground: 'dirt' },
    { rect: box(STAIRS.x0 - 0.6, STAIRS.z0 + 0.2, STAIRS.x1 + 0.4, STAIRS.z1 - 0.2), nodes: ['plat', 'foot'], ground: 'dirt' },
    { rect: box(FORE.x0 + 0.4, FORE.z0, FORE.x1, FORE.z1 - 0.4), nodes: ['foot', 'under'], ground: 'dirt' },
    { rect: box(PARK.x0 + 0.4, PARK.z0, HILL.x - 0.6, PARK.z1), nodes: ['under', 'park'] },
    { rect: box(PARK.x0 + 0.4, PARK.z0, PARK.x1 + 2.5, HILL.z - 0.6), nodes: ['park'] },
  ],
};
// and Luna Park's: along the boardwalk and over the forecourt to the face, and in through its mouth
export const LUNA_TRACK = {
  nodes: { mouth: at(FACE.x - 1.6, FACE.z) },
  rooms: [
    { rect: box(49.5, -56, FACE.x - 1.2, HILL.z - 0.6), nodes: ['mouth'] },
    { rect: box(FACE.x - 2, FACE.z - MOUTH.hw + 0.25, FACE.x + 3, FACE.z + MOUTH.hw - 0.25), nodes: ['mouth'], ground: 'dirt' },
  ],
};

/* ------------------------------------------------------------------ the harbour, and the land round it */
// each headland, point or hill a lump: [x, z, rx, rz, how high, how gently it goes down into the water (0: sheer
// cliffs, 1: hillside all the way)]. The land's as high as the highest lump under it (see the harbour's)
const LUMPS = [
  [-150, -10, 110, 60, 12, 0.6], [-300, -20, 120, 80, 10, 0.6], [-118, -60, 30, 22, 5, 0.3], // Kirribilli
  [0, 150, 380, 130, 24, 0.85], // North Sydney, up the hill behind
  [240, -10, 60, 80, 14, 0.5], [245, -112, 26, 50, 7, 0.35], // McMahons Point, and Blues Point, out into the harbour
  [0, -420, 460, 165, 16, 0.75], [-60, -262, 36, 16, 6, 0.35], [-152, -250, 18, 26, 3.5, 0.15], [-230, -252, 50, 30, 6, 0.5], // the city side
];

function lump([cx, cz, rx, rz, h, soft], x, z) {
  const d = Math.hypot((x - cx) / rx, (z - cz) / rz);
  if (d >= 1) return -Infinity;
  return -1 + (h + 1) * smoothstep(1, 0.88 - soft * 0.6, d) * (1 - 0.25 * d * d);
}

/** how high the land is at (x, z) (under the water: -2), as far as the hills and points go */
function landH(x, z) {
  let y = -2;
  for (const l of LUMPS) y = Math.max(y, lump(l, x, z));
  if (y > 0) y += Math.sin(x * 0.21 + z * 0.13) * Math.cos(z * 0.17 - x * 0.07) * Math.min(1.5, y * 0.12);
  return Math.max(y, -2);
}

/** the hill behind Luna Park, that the line goes on into: up from the top of its wall, and on up to North Sydney */
const hillH = (x, z) => Math.max(landH(x, z), (HILL.y + 6 * smoothstep(-10, 50, z)) * smoothstep(198, 178, x));

/** the height of the land all round: the flat (just under it: it's got its own ground), the hill, and the rest */
function terrainH(x, z) {
  const out = Math.hypot(Math.max(SHEET.x0 - x, 0, x - SHEET.x1), Math.max(SHEET.z0 - z, 0, z - SHEET.z1));
  if (x >= HILL.x + 6 - 0.1 && z >= HILL.z + 6 - 0.1) return hillH(x, z);
  if (out < 0.1) return -0.05;
  const y = landH(x, z);
  return y > 0 ? y * smoothstep(0, 30, out) : y; // (rising gently away from the flat)
}

const C = {
  sand: new THREE.Color(0xe3cf98), rock: new THREE.Color(0x9c8f78), cliff: new THREE.Color(0xc79a5e), cliff2: new THREE.Color(0xb4864c),
  bush: new THREE.Color(0x4d6c3a), bush2: new THREE.Color(0x607f45), grass: new THREE.Color(0x7aa04c), city: new THREE.Color(0xb3ada3),
  deep: new THREE.Color(0xd9eef7),
};

/** the land and the harbour floor, all round, in 6 m squares (lined up with the hill's wall and its face) */
function terrainGeo() {
  const X0 = -460, X1 = 464, Z0 = -460, Z1 = 302;
  const g = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0, (X1 - X0) / 6, (Z1 - Z0) / 6).rotateX(-Math.PI / 2).translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = terrainH(x, z);
    const steep = Math.hypot(terrainH(x + 1, z) - terrainH(x - 1, z), terrainH(x, z + 1) - terrainH(x, z - 1)) / 2;
    pos.setY(i, y);
    if (y < SEA) c.copy(C.sand).lerp(C.deep, smoothstep(SEA - 0.1, SEA - 1.3, y));
    else if (steep > 1.1) c.copy(Math.sin(y * 2.6) > 0 ? C.cliff : C.cliff2); // (sandstone, in bands)
    else if (y < 0.7) c.copy(steep > 0.5 ? C.rock : C.sand);
    else c.copy(C.bush).lerp(C.bush2, 0.5 + 0.5 * Math.sin(x * 0.3 + z * 0.23)).lerp(C.grass, smoothstep(0.35, 0, steep) * 0.4);
    if (z < -258 && y > 0.7) c.lerp(C.city, 0.7); // (over the water, it's all city)
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/* ------------------------------------------------------------------ the ground, down on the flat */
const LAWN = [new THREE.Color(0x6fa548), new THREE.Color(0x82b453)], SHADE = new THREE.Color(0x4f7f38);
const PAVE = new THREE.Color(0xcfc9bc), PATH = new THREE.Color(0xd8c9a2), ROAD = new THREE.Color(0x4a4d52), TAR = new THREE.Color(0x77736c);
const PLANKS = [new THREE.Color(0x9a7a55), new THREE.Color(0x8f7050)], TILES = [new THREE.Color(0xd84a3a), new THREE.Color(0xf2d27a)];
// the park's paths, as capsules: [ax, az, bx, bz, half their width]
const PATHS = [
  [-38.5, -8, -24, -30, 1.6], [-24, -30, -8, -50, 1.6], [-24, -30, 20, -36, 1.4], [20, -36, 50, -40, 1.8],
  [PARK.x0, -52.5, 50, -52.5, 2.8], // (the promenade, along the water)
];
function offPath(x, z) {
  let d = Infinity;
  for (const [ax, az, bx, bz, w] of PATHS) {
    const vx = bx - ax, vz = bz - az, t = clamp(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz), 0, 1);
    d = Math.min(d, Math.hypot(x - ax - vx * t, z - az - vz * t) - w);
  }
  return d;
}

/** the colour of the flat at (x, z): the park's lawn and paths, the street, Luna Park's boardwalk and forecourt */
function groundColour(x, z, trees, c) {
  if (x >= 50) {
    if (z < -48.5) return c.copy(PLANKS[Math.floor(x / 2) % 2]); // (the boardwalk)
    if (x > FACE.x + 0.5) return c.copy(TAR); // (inside: there's no going in, just yet)
    return c.copy(PAVE); // (the forecourt's tiles are laid over it: see forecourtGeo)
  }
  if (z > PARK.z1 + 0.5) {
    // the street north of the station (Alfred Street), and the paving round the station
    if (z > 9 && z < 16) return c.copy(ROAD);
    return c.copy(PAVE);
  }
  const n = 0.5 + 0.5 * noise(x * 0.09, z * 0.09);
  c.copy(LAWN[0]).lerp(LAWN[1], n);
  let shade = 0;
  for (const [tx, tz] of trees) shade = Math.max(shade, 1 - smoothstep(2.5, 6.5, Math.hypot(x - tx, z - tz)));
  c.lerp(SHADE, shade * 0.55);
  const p = offPath(x, z);
  if (p < 0.6) c.lerp(z < -49 ? PAVE : PATH, smoothstep(0.6, -0.4, p));
  return c;
}

/** the flat, in 2 m squares: from Kirribilli's edge to Lavender Bay, and the water up to Alfred Street (bar the hill) */
function groundGeo(trees) {
  const S = 2, pos = [], col = [], c = new THREE.Color();
  const corner = (x, z) => { groundColour(x, z, trees, c); pos.push(x, 0, z); col.push(c.r, c.g, c.b); };
  for (let x = SHEET.x0; x < SHEET.x1; x += S) {
    for (let z = SHEET.z0; z < SHEET.z1; z += S) {
      if (x >= HILL.x && z >= HILL.z) continue;
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

/** the forecourt's tiles, in red and yellow rays fanning out from the face (each ray cut to the forecourt's edges) */
function forecourtGeo() {
  const N = 28, R = 90, X0 = 66, Z0 = -48.5, Z1 = -16, pos = [], col = [], c = new THREE.Color();
  // (Sutherland-Hodgman, one edge at a time: keep what's inside, cutting across where it crosses)
  const clip = (poly, inside, cut) => {
    const out = [];
    poly.forEach((a, i) => {
      const b = poly[(i + 1) % poly.length], ia = inside(a), ib = inside(b);
      if (ia) out.push(a);
      if (ia !== ib) out.push(cut(a, b));
    });
    return out;
  };
  const along = (k, v) => (a, b) => { const t = (v - a[k]) / (b[k] - a[k]); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * TAU, a1 = ((i + 1) / N) * TAU;
    let poly = [[FACE.x, FACE.z], [FACE.x - Math.cos(a0) * R, FACE.z + Math.sin(a0) * R], [FACE.x - Math.cos(a1) * R, FACE.z + Math.sin(a1) * R]];
    poly = clip(poly, (q) => q[0] >= X0, along(0, X0));
    poly = clip(poly, (q) => q[0] <= FACE.x, along(0, FACE.x));
    poly = clip(poly, (q) => q[1] >= Z0, along(1, Z0));
    poly = clip(poly, (q) => q[1] <= Z1, along(1, Z1));
    if (poly.length < 3) continue;
    c.copy(TILES[i % 2]).lerp(PAVE, 0.35);
    for (let j = 1; j < poly.length - 1; j++) {
      for (const q of [poly[0], poly[j], poly[j + 1]]) { pos.push(q[0], 0.02, q[1]); col.push(c.r, c.g, c.b); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/* ------------------------------------------------------------------ the station */
const BRICK = 0xa8553c, BRICK2 = 0x924a35, CREAM = 0xe8dcc0, GREEN = 0x2f5a3f, STEEL = 0x6d777d, GRANITE = 0xc2b59b;

/** a railing along (ax, az) to (bx, bz), at height y */
function railing(p, ax, az, bx, bz, y, color = GREEN) {
  const len = Math.hypot(bx - ax, bz - az), rot = [0, -Math.atan2(bz - az, bx - ax), 0], mid = [(ax + bx) / 2, 0, (az + bz) / 2];
  p.push(part(G.box(len, 0.07, 0.07), color, [mid[0], y + 1.05, mid[2]], rot), part(G.box(len, 0.04, 0.04), color, [mid[0], y + 0.5, mid[2]], rot));
  const n = Math.max(1, Math.round(len / 1.6));
  for (let i = 0; i <= n; i++) p.push(part(G.box(0.06, 1.05, 0.06), color, [ax + ((bx - ax) * i) / n, y + 0.52, az + ((bz - az) * i) / n]));
}

/**
 * The station: the building under the platform (brick, with its arches along the street side), the platform up
 * top, the stairs down off the end of it, and the viaduct the line runs along, on to the hill, where it goes in
 */
function station(p) {
  const { x0, x1, z0, z1, y } = PLAT, DB = RAIL_Y - 1.3;
  // the building, and its arches, and the platform on top
  p.push(part(G.box(x1 - x0, y, z1 - z0), BRICK, [(x0 + x1) / 2, y / 2, (z0 + z1) / 2]));
  for (let x = x0 + 2.5; x < x1 - 1; x += 4) {
    p.push(part(G.box(2.2, 2.6, 0.06), 0x2a2420, [x, 1.3, z1 + 0.02]), part(G.cyl(1.1, 1.1, 0.06, 14), 0x2a2420, [x, 2.6, z1 + 0.02], [Math.PI / 2, 0, 0]));
    p.push(part(G.box(2.6, 0.2, 0.1), CREAM, [x, 3.9, z1 + 0.04]));
  }
  p.push(part(G.box(x1 - x0 + 0.3, 0.3, z1 - z0 + 0.3), CREAM, [(x0 + x1) / 2, y - 0.15, (z0 + z1) / 2]));
  p.push(part(G.box(x1 - x0, 0.04, z1 - z0), 0xbdb8ab, [(x0 + x1) / 2, y + 0.01, (z0 + z1) / 2]));
  p.push(part(G.box(x1 - x0, 0.02, 0.35), 0xf2c230, [(x0 + x1) / 2, y + 0.04, z0 + 0.3])); // (the yellow line along the edge)
  railing(p, x0, z1 - 0.1, x1, z1 - 0.1, y);
  railing(p, x1 - 0.1, z0 + 1.2, x1 - 0.1, z1, y);
  // the stairs down to the street, between their walls
  const { n } = STAIRS, tread = (STAIRS.x1 - STAIRS.x0) / n;
  for (let i = 0; i < n; i++) {
    const top = y * ((i + 0.5) / n);
    p.push(part(G.box(tread, top, STAIRS.z1 - STAIRS.z0), i % 2 ? 0xc8c2b2 : 0xbdb6a5, [STAIRS.x0 + (i + 0.5) * tread, top / 2, (STAIRS.z0 + STAIRS.z1) / 2]));
  }
  for (const z of [STAIRS.z0 - 0.25, STAIRS.z1 + 0.25]) {
    for (let i = 0; i < 5; i++) {
      const a = STAIRS.x0 + (i * (STAIRS.x1 - STAIRS.x0)) / 5, b = a + (STAIRS.x1 - STAIRS.x0) / 5, h = (y * (i + 1)) / 5 + 1;
      p.push(part(G.box(b - a, h, 0.5), BRICK2, [(a + b) / 2, h / 2, z]));
    }
  }
  // the viaduct: its deck, the ballast and the sleepers and the rails on it; brick arches under it as far as the
  // stairs, and iron piers on past them over the street
  p.push(part(G.box(HILL.x - DECK.x0, RAIL_Y - 0.3 - DB, DECK.z1 - DECK.z0), BRICK2, [(HILL.x + DECK.x0) / 2, (RAIL_Y - 0.3 + DB) / 2, (DECK.z0 + DECK.z1) / 2]));
  p.push(part(G.box(HILL.x - DECK.x0, 0.2, DECK.z1 - DECK.z0 + 0.3), CREAM, [(HILL.x + DECK.x0) / 2, DB, (DECK.z0 + DECK.z1) / 2]));
  p.push(part(G.box(HILL.x - DECK.x0, 0.24, 3.2), 0x6b6560, [(HILL.x + DECK.x0) / 2, RAIL_Y - 0.3, TRACK_Z]));
  for (let x = DECK.x0 + 0.4; x < HILL.x; x += 0.7) p.push(part(G.box(0.24, 0.12, 2.5), 0x5a4a3a, [x, RAIL_Y - 0.12, TRACK_Z]));
  for (const s of [-1, 1]) p.push(part(G.box(HILL.x - DECK.x0, 0.14, 0.08), 0x9aa0a6, [(HILL.x + DECK.x0) / 2, RAIL_Y - 0.07, TRACK_Z + s * 0.72]));
  railing(p, DECK.x0, DECK.z0 + 0.1, HILL.x, DECK.z0 + 0.1, RAIL_Y - 0.3, STEEL);
  p.push(part(G.box(HILL.x - FORE.x1, DB, DECK.z1 - DECK.z0), BRICK, [(HILL.x + FORE.x1) / 2, DB / 2, (DECK.z0 + DECK.z1) / 2]));
  for (let x = FORE.x1 + 2.5; x < HILL.x - 1; x += 4) {
    p.push(part(G.box(2.4, 2.4, 0.06), 0x3a2e28, [x, 1.2, DECK.z0 - 0.02]), part(G.cyl(1.2, 1.2, 0.06, 14), 0x3a2e28, [x, 2.4, DECK.z0 - 0.02], [Math.PI / 2, 0, 0]));
  }
  for (const x of PIERS) p.push(part(G.box(1.2, DB, DECK.z1 - DECK.z0 - 0.4), 0x4a4f53, [x, DB / 2, (DECK.z0 + DECK.z1) / 2]));
}
const PIERS = [-33, -42.5, -51]; // (the viaduct's piers, over the forecourt)

/** the hill the line goes into: a sandstone face, with the tunnel's mouth in it, and the wall along the foot of it, by Luna Park */
function hill(p) {
  const top = HILL.y + 0.2, SAND = 0xc9a874, SAND2 = 0xb89660;
  p.push(part(G.box(6, top, SHEET.z1 - HILL.z), SAND, [HILL.x + 3, top / 2, (SHEET.z1 + HILL.z) / 2]));
  p.push(part(G.box(178 - HILL.x, top, 6), SAND, [(178 + HILL.x) / 2, top / 2, HILL.z + 3]));
  for (let y = 1.6; y < top; y += 1.6) {
    p.push(part(G.box(0.04, 0.08, SHEET.z1 - HILL.z), SAND2, [HILL.x - 0.01, y, (SHEET.z1 + HILL.z) / 2]));
    p.push(part(G.box(178 - HILL.x, 0.08, 0.04), SAND2, [(178 + HILL.x) / 2, y, HILL.z - 0.01]));
  }
  // (the tunnel's mouth: a stone arch round it)
  p.push(part(G.box(0.4, 1.2, 6.4), 0xd8c08f, [HILL.x - 0.2, RAIL_Y + 5.2, TRACK_Z]));
  for (const s of [-1, 1]) p.push(part(G.box(0.4, 5.4, 1.0), 0xd8c08f, [HILL.x - 0.2, RAIL_Y + 2.3, TRACK_Z + s * 2.7]));
}

/** the station's name, on boards along the platform (facing the street side: the way you see them, looking down the line) */
function platformSigns(s) {
  const draw = (c, cw, ch) => {
    c.fillStyle = '#1d2f5c'; c.fillRect(0, 0, cw, ch);
    c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `bold ${Math.round(ch * 0.52)}px sans-serif`; c.fillText('MILSONS POINT', cw / 2, ch / 2 + 2);
  };
  const posts = [];
  for (const x of [-13, 13]) {
    for (const k of [-1, 1]) {
      const m = signFace(4.4, 0.75, draw);
      m.position.set(x, PLAT.y + 2.6, 1.6 + k * 0.03);
      if (k < 0) m.rotation.y = Math.PI;
      s.add(m);
    }
    for (const dx of [-2, 2]) posts.push(part(G.box(0.1, 2.6, 0.1), 0x24272a, [x + dx, PLAT.y + 1.3, 1.6]));
  }
  // and at the foot of the stairs, over the way up
  const foot = signFace(5, 0.9, draw);
  foot.position.set(STAIRS.x0 + 4, 4.2, STAIRS.z1 + 0.52);
  s.add(foot);
  return posts;
}

/* ------------------------------------------------------------------ the Bridge, and over the water */
/** the Harbour Bridge: the granite pylons at either end, the steel arch between, and the deck hung under it, out over the land either side on piers */
function bridge(p) {
  const { x, z0, z1, deck, hw } = BR, mid = (z0 + z1) / 2, half = (z0 - z1) / 2;
  const u = (z) => (z - mid) / half, low = (z) => 1 + 47 * (1 - u(z) ** 2), high = (z) => low(z) + 3.5 + 12 * u(z) ** 2;
  for (const pz of [z0 + 5, z1 - 5]) {
    for (const s of [-1, 1]) {
      const px = x + s * (hw + 3);
      p.push(part(G.box(9, 32, 12), GRANITE, [px, 15, pz]), part(G.box(10, 1.6, 13), 0xa89c84, [px, 31.5, pz]), part(G.box(7.6, 6, 10.6), GRANITE, [px, 35, pz]));
      for (const k of [-1, 1]) p.push(part(G.box(0.1, 4, 1.6), 0x8d8270, [px - k * 4.52, 34, pz]));
    }
  }
  p.push(part(G.box(36, 2.4, 22), GRANITE, [x, 1.2, z0 + 4])); // (the abutment the north pylons stand on, at the water's edge)
  const zs = z1 - 70, ze = z0 + 120;
  p.push(part(G.box(hw * 2, 1.8, ze - zs), 0x55595c, [x, deck, (zs + ze) / 2]));
  for (const s of [-1, 1]) p.push(part(G.box(0.3, 1.2, ze - zs), 0x7d858a, [x + s * (hw - 0.2), deck + 1.4, (zs + ze) / 2]));
  for (let z = z0 + 14; z < ze; z += 16) for (const s of [-1, 1]) p.push(part(G.box(3, deck + 6, 3), GRANITE, [x + s * (hw - 2.5), deck / 2 - 3, z]));
  for (let z = z1 - 14; z > zs; z -= 16) for (const s of [-1, 1]) p.push(part(G.box(3, deck + 6, 3), GRANITE, [x + s * (hw - 2.5), deck / 2 - 3, z]));
  // the arch: two ribs, each a top and a bottom chord braced between, with hangers down to the deck and posts up to it
  const N = 28;
  for (const s of [-1, 1]) {
    const rx = x + s * (hw - 1.5);
    for (let i = 0; i < N; i++) {
      const a = z0 - ((z0 - z1) * i) / N, b = z0 - ((z0 - z1) * (i + 1)) / N;
      p.push(limb([rx, low(a), a], [rx, low(b), b], 0.9, 0.9, STEEL, 6), limb([rx, high(a), a], [rx, high(b), b], 0.8, 0.8, STEEL, 6));
      p.push(limb([rx, low(a), a], [rx, high(b), b], 0.28, 0.28, STEEL, 4), limb([rx, low(b), b], [rx, high(b), b], 0.28, 0.28, STEEL, 4));
      if (low(b) > deck + 1) p.push(limb([rx, low(b), b], [rx, deck, b], 0.16, 0.16, STEEL, 4));
      else if (low(b) < deck - 1) p.push(limb([rx, low(b), b], [rx, deck, b], 0.35, 0.35, STEEL, 4));
    }
  }
  for (let i = 1; i < N; i++) {
    const a = z0 - ((z0 - z1) * i) / N;
    p.push(part(G.box(2 * hw - 3, 0.5, 0.5), STEEL, [x, high(a), a]));
  }
  // (and the flags up on top of it)
  for (const [dz, color] of [[-6, 0x1d3f8f], [6, 0xd8322a]]) {
    p.push(part(G.box(0.15, 5, 0.15), 0xeeeeee, [x, high(mid + dz) + 2.5, mid + dz]), part(G.box(0.1, 1.4, 2.6), color, [x, high(mid + dz) + 4.2, mid + dz + 1.4]));
  }
}

/** a city block, far off: plain, with a few strips of window up its front, at y */
function tower(p, x, y, z, w, h, d, color) {
  p.push(part(G.box(w, h, d), color, [x, y + h / 2, z]));
  const glass = new THREE.Color(color).multiplyScalar(0.62).getHex();
  for (const k of [-0.25, 0.25]) p.push(part(G.box(w * 0.3, h * 0.9, 0.1), glass, [x + k * w, y + h * 0.48, z + d / 2 + 0.05]));
  p.push(part(G.box(w * 0.7, 1.4, d * 0.7), 0x8a8f94, [x, y + h + 0.7, z]));
}
const TOWERS = [0x8fa9bf, 0x6f8faf, 0xb9c3cb, 0xd9d4c5, 0x9fb3c2, 0xc9c1b0, 0xa7b4a8, 0xd9c49a, 0x7f97a8];

/** a house on the hill: walls, and its roof (terracotta, mostly) */
function house(p, x, z, r) {
  const y = landH(x, z), w = rand(5, 8), d = rand(5, 7), h = rand(3, 6), roof = pick([0xb4553a, 0xa04a34, 0x8a8f94, 0xc0653f]);
  p.push(part(G.box(w, h, d), pick([0xefe2c4, 0xdce8cf, 0xf1d9c9, 0xe6e2d6, 0xc98a6a]), [x, y + h / 2 - 0.5, z], [0, r, 0]));
  p.push(part(G.cone(Math.max(w, d) * 0.72, 2.2, 4), roof, [x, y + h + 0.6, z], [0, r + Math.PI / 4, 0], [1, 1, d / w]));
}

/** across the water: the Quay, the Rocks, the Opera House, the city's towers and Sydney Tower, and the Botanic Gardens round the point */
function city(p) {
  const y = (x, z) => Math.max(0, landH(x, z));
  // the Quay: the wharves, out on their piles, the sheds on them, and the Cahill Expressway over the back
  p.push(part(G.box(60, 1.4, 8), 0x8b8378, [-108, 0.5, -262]));
  for (let i = 0; i < 5; i++) {
    const x = -128 + i * 10;
    p.push(part(G.box(5, 1.2, 14), 0x8b8378, [x, 0.4, -252]), part(G.box(4, 2.6, 5), CREAM, [x, 2.3, -257]), part(G.box(4.4, 0.3, 5.4), GREEN, [x, 3.7, -257]));
  }
  p.push(part(G.box(64, 5, 8), 0x55625a, [-108, 4.5, -270]), part(G.box(64, 0.6, 8.4), 0xd9d1bd, [-108, 7.2, -270]));
  // (two of the ferries in, at the wharves)
  const fp = ferryParts();
  for (const x of [-123, -103]) for (const g of [fp.hull, fp.rails, fp.cabins]) p.push(g.clone().rotateY(Math.PI / 2).scale(0.45, 0.45, 0.45).translate(x, 0.1, -247));
  for (const g of [fp.hull, fp.rails, fp.cabins]) g.dispose();
  // the Rocks: old sandstone and brick, low, round the south end of the Bridge
  for (let i = 0; i < 16; i++) {
    const x = rand(-86, -30), z = rand(-268, -296), h = rand(6, 13);
    p.push(part(G.box(rand(8, 13), h, rand(8, 12)), pick([0xc9a874, 0xb4553a, 0xd9c49a, 0xa8553c]), [x, y(x, z) + h / 2, z]));
  }
  // the towers, thick behind the Quay, thinning out either side
  for (let i = 0; i < 80; i++) {
    const x = rand(-215, 190), z = rand(-282, -405);
    if (Math.hypot(x - OPERA[0], z - OPERA[1]) < 48 || (x < -175 && z > -330) || (Math.abs(x - BR.x) < 22 && z > -340) || (x > -90 && x < -28 && z > -300)) continue;
    const tall = 1 - Math.abs(x + 40) / 300, h = rand(18, 40) + rand(0, 70) * Math.max(0, tall), w = rand(10, 20), d = rand(10, 18);
    tower(p, x, y(x, z) - 1, z, w, h, d, pick(TOWERS));
  }
  // Sydney Tower, standing up out of the middle of it all, and the Crown, at Barangaroo
  const ty = y(-72, -345);
  p.push(part(G.cyl(2.2, 2.6, 104, 12), 0xd9d6cc, [-72, ty + 52, -345]), part(G.cyl(9, 8, 6, 20), 0xc9a24a, [-72, ty + 98, -345]));
  p.push(part(G.cyl(9.3, 9.3, 2.4, 20), 0x3a4552, [-72, ty + 98.5, -345]), part(G.cyl(6, 6, 2, 16), 0xd9d6cc, [-72, ty + 102, -345]), part(G.cyl(0.4, 0.8, 22, 6), 0xd9d6cc, [-72, ty + 114, -345]));
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU;
    p.push(limb([-72 + Math.cos(a) * 1.4, ty + 4, -345 + Math.sin(a) * 1.4], [-72 + Math.cos(a) * 7, ty + 95, -345 + Math.sin(a) * 7], 0.06, 0.06, 0x8a8f94, 3));
  }
  p.push(part(G.box(16, 82, 14), 0xe9ecef, [70, y(70, -284) + 41, -284], [0, 0.4, 0]), part(G.box(16.4, 82, 0.3), 0x9fb3c2, [70, y(70, -284) + 41, -284], [0, 0.4, 0]));
  // the Opera House's podium on Bennelong Point (its sails: see buildMilsons), and the gardens round the point past it
  p.push(part(G.box(52, 4, 58), 0xc3ab8f, [OPERA[0], 2, OPERA[1] - 2]));
  for (let i = 0; i < 24; i++) {
    const x = rand(-270, -185), z = rand(-262, -300);
    p.push(part(G.ico(rand(3, 5), 0), pick([0x3b6f35, 0x2f5f2f, 0x4d7a3a]), [x, y(x, z) + 3, z]));
  }
  // the Domain's towers beyond, and the southern suburbs, all one haze
  for (let x = -260; x < 260; x += 34) tower(p, x + rand(-8, 8), y(x, -440) - 2, -440 + rand(-10, 10), rand(16, 26), rand(20, 50), 16, pick(TOWERS));
}

/** our side: Kirribilli (Admiralty House, and the houses up the hill), North Sydney's towers, McMahons Point and Blues Point Tower */
function northShore(p) {
  for (let i = 0; i < 90; i++) {
    const x = rand(-420, -76), z = rand(-80, 70);
    if (landH(x, z) < 1.2 || (Math.abs(x - BR.x) < 16)) continue;
    house(p, x, z, rand(-0.3, 0.3));
  }
  // Admiralty House, and Kirribilli House next door, on the point
  p.push(part(G.box(16, 8, 11), 0xd9c49a, [-114, landH(-114, -64) + 3.5, -64]), part(G.box(17, 0.6, 12), 0xf2efe6, [-114, landH(-114, -64) + 7.6, -64]));
  p.push(part(G.cone(10, 3, 4), 0x7d6b55, [-114, landH(-114, -64) + 9.4, -64], [0, Math.PI / 4, 0], [1, 1, 0.7]), part(G.box(9, 6, 8), 0xefe2c4, [-136, landH(-136, -56) + 2.5, -56]));
  // North Sydney, up the hill, its towers going up over the station
  for (let i = 0; i < 30; i++) {
    const x = rand(-170, 150), z = rand(70, 200);
    tower(p, x, landH(x, z) - 1, z, rand(12, 22), rand(24, 70), rand(12, 18), pick(TOWERS));
  }
  // and along the street behind the station, shops and flats, a few storeys up
  for (let x = SHEET.x0 + 4; x < HILL.x - 4; x += 10) {
    const h = rand(6, 10);
    p.push(part(G.box(9, h, 10), pick([0xd9c49a, 0xc98a6a, 0xe8dcc0, 0xb9a07a, 0xa8553c]), [x, h / 2, 25]), part(G.box(9.2, 0.4, 10.2), 0x8a8f94, [x, h + 0.2, 25]));
    p.push(part(G.box(7, 1.6, 0.1), 0x2c3e55, [x, 1.4, 19.96]), part(G.box(9, 0.3, 1.4), pick([0x2f5a3f, 0xb4553a, 0x1d2f5c]), [x, 3, 19.3]));
  }
  // McMahons Point's houses, and out on the end of Blues Point, the Tower, all on its own
  for (let i = 0; i < 40; i++) {
    const x = rand(196, 300), z = rand(-90, 60);
    if (landH(x, z) < 1.2) continue;
    house(p, x, z, rand(-0.3, 0.3));
  }
  const by = landH(245, -122) - 1;
  p.push(part(G.box(13, 64, 13), 0xcbb99a, [245, by + 32, -122]));
  for (let f = 1; f < 25; f++) for (const [dx, dz, w, d] of [[0, 6.55, 13.1, 0.1], [6.55, 0, 0.1, 13.1], [-6.55, 0, 0.1, 13.1], [0, -6.55, 13.1, 0.1]]) {
    p.push(part(G.box(w, 1.2, d), 0x4a4a48, [245 + dx, by + f * 2.5, -122 + dz]));
  }
}

/* ------------------------------------------------------------------ Luna Park */
/**
 * The face, as a disc (in its own frame: facing +z, the middle of it at the origin), with its mouth cut out of the bottom
 * of it, round over the top, for the way in; the picture on it comes from its outline: see faceTexture
 */
function faceGeo() {
  const R = FACE.r, hw = MOUTH.hw, spring = MOUTH.top - FACE.y - hw, rim = -Math.sqrt(R * R - hw * hw);
  const s = new THREE.Shape();
  s.moveTo(hw, rim);
  s.lineTo(hw, spring);
  s.absarc(0, spring, hw, 0, Math.PI, false);
  s.lineTo(-hw, rim);
  s.absarc(0, 0, R, Math.atan2(rim, -hw), Math.atan2(rim, hw), true);
  const g = new THREE.ShapeGeometry(s, 48), pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + R) / (2 * R), (pos.getY(i) + R) / (2 * R));
  return g;
}

/** the face's picture: the rays of its headdress, and its big grin, eyes wide and eyebrows up, and red lips round the mouth */
function faceTexture() {
  const R = FACE.r, hw = MOUTH.hw, spring = MOUTH.top - FACE.y - hw;
  return canvasTexture(512, 512, (c, w, h) => {
    const k = w / (2 * R), X = (x) => w / 2 + x * k, Y = (y) => h / 2 - y * k;
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * TAU;
      c.fillStyle = i % 2 ? '#f2c230' : '#e8403a';
      c.beginPath(); c.moveTo(w / 2, h / 2); c.arc(w / 2, h / 2, w / 2 + 2, a, a + TAU / 22 + 0.01); c.fill();
    }
    c.fillStyle = '#2f6fd0'; c.beginPath(); c.arc(w / 2, h / 2, 6.9 * k, 0, TAU); c.fill(); // (a blue ring inside them)
    const skin = c.createRadialGradient(X(-1.5), Y(2), k, w / 2, h / 2, 6.5 * k);
    skin.addColorStop(0, '#ffe1a8'); skin.addColorStop(1, '#f0a85a');
    c.fillStyle = skin; c.beginPath(); c.arc(w / 2, h / 2, 6.4 * k, 0, TAU); c.fill();
    // the cheeks, rosy, and the grin, ear to ear, up round the mouth
    c.fillStyle = 'rgba(232, 80, 70, .45)';
    for (const s of [-1, 1]) { c.beginPath(); c.arc(X(s * 3.6), Y(-1.9), 1.2 * k, 0, TAU); c.fill(); }
    c.strokeStyle = '#c4262a'; c.lineCap = 'round'; c.lineWidth = 0.75 * k;
    c.beginPath(); c.arc(X(0), Y(-1.4), 4.9 * k, 0.12 * Math.PI, 0.88 * Math.PI); c.stroke();
    c.lineWidth = 1.1 * k;
    c.beginPath(); c.moveTo(X(hw + 0.45), Y(-R)); c.lineTo(X(hw + 0.45), Y(spring)); c.arc(X(0), Y(spring), (hw + 0.45) * k, 0, Math.PI, true); c.lineTo(X(-hw - 0.45), Y(-R)); c.stroke();
    // the eyes: wide, blue, and looking down the boardwalk at you
    for (const s of [-1, 1]) {
      c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(X(s * 2.2), Y(1.6), 1.15 * k, 0.85 * k, 0, 0, TAU); c.fill();
      c.strokeStyle = '#3a1a0a'; c.lineWidth = 0.14 * k; c.stroke();
      c.fillStyle = '#2f6fd0'; c.beginPath(); c.arc(X(s * 2.2), Y(1.45), 0.5 * k, 0, TAU); c.fill();
      c.fillStyle = '#111'; c.beginPath(); c.arc(X(s * 2.2), Y(1.45), 0.24 * k, 0, TAU); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(X(s * 2.2 + 0.15), Y(1.62), 0.09 * k, 0, TAU); c.fill();
      c.strokeStyle = '#6b3a1a'; c.lineWidth = 0.3 * k;
      c.beginPath(); c.arc(X(s * 2.2), Y(1.3), 1.6 * k, 1.2 * Math.PI, 1.8 * Math.PI); c.stroke();
    }
    c.fillStyle = '#e88a4a'; c.beginPath(); c.moveTo(X(0), Y(0.9)); c.lineTo(X(0.55), Y(-0.6)); c.lineTo(X(-0.55), Y(-0.6)); c.fill(); // (its nose)
  });
}

/** the face, the towers either side of it with LUNA PARK up between them, the walls along the front, and the rides behind */
function luna(s, p) {
  const face = new THREE.Mesh(faceGeo(), toonMat({ map: faceTexture() }));
  face.position.set(FACE.x, FACE.y, FACE.z);
  face.rotation.y = -Math.PI / 2;
  face.castShadow = true;
  s.add(face);
  // (a dark way in, through its mouth: there's no going in, just yet)
  const dark = new THREE.Mesh(new THREE.BoxGeometry(6, MOUTH.top + 0.4, MOUTH.hw * 2 + 0.1), new THREE.MeshBasicMaterial({ color: 0x140d0a }));
  dark.position.set(FACE.x + 3.15, (MOUTH.top + 0.4) / 2, FACE.z);
  s.add(dark);
  p.push(part(G.cyl(FACE.r - 0.05, FACE.r - 0.05, 0.7, 40), 0xd03a30, [FACE.x + 0.45, FACE.y, FACE.z], [0, 0, Math.PI / 2]));
  // its top teeth, along the top of the mouth
  for (let dz = -1.8; dz <= 1.81; dz += 0.6) {
    const top = MOUTH.top - MOUTH.hw + Math.sqrt(MOUTH.hw ** 2 - dz * dz);
    p.push(part(G.box(0.12, 0.55, 0.52), 0xfbf8ee, [FACE.x - 0.04, top - 0.3, FACE.z + dz]));
  }
  // the towers, either side: in bands, red and white and blue, with bulbs up them, and a spire on top
  for (const k of [-1, 1]) {
    const z = FACE.z + k * 12.5, x = FACE.x + 1;
    p.push(part(G.box(3.6, 3, 3.6), CREAM, [x, 1.5, z]));
    for (let i = 0; i < 9; i++) p.push(part(G.cyl(1.4, 1.5, 2.1, 12), [0xe8403a, 0xf6f1e4, 0x2f6fd0][i % 3], [x, 3 + 1.05 + i * 2.1, z]));
    for (let i = 0; i < 9; i++) p.push(part(G.cyl(1.62, 1.62, 0.16, 12), 0xf2c230, [x, 3 + i * 2.1, z]));
    p.push(part(G.cone(2.1, 4.2, 12), 0xe8403a, [x, 24.2, z]), part(G.sphere(0.45, 8, 6), 0xf2c230, [x, 26.6, z]));
    for (let y = 4; y < 22; y += 1.4) for (const a of [Math.PI, Math.PI * 0.75, Math.PI * 1.25]) p.push(part(G.sphere(0.12, 5, 4), 0xfff0a0, [x + Math.cos(a) * 1.55, y, z + Math.sin(a) * 1.55]));
  }
  // LUNA PARK, up between the towers, over the face
  const sign = signFace(17, 2.6, (c, cw, ch) => {
    c.fillStyle = '#1d2f5c'; c.fillRect(0, 0, cw, ch);
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `bold ${Math.round(ch * 0.78)}px sans-serif`;
    c.fillStyle = '#e8403a'; c.fillText('LUNA PARK', cw / 2 + 4, ch / 2 + 6);
    c.fillStyle = '#f2c230'; c.fillText('LUNA PARK', cw / 2, ch / 2 + 2);
  });
  sign.position.set(FACE.x + 0.6, 19.6, FACE.z);
  sign.rotation.y = -Math.PI / 2;
  s.add(sign);
  p.push(part(G.box(0.5, 3, 18), 0xf6f1e4, [FACE.x + 0.9, 19.6, FACE.z]));
  // the walls along the front, either side, painted, with bulbs along the top
  for (const [z0, z1] of [[SHEET.z0, FACE.z - FACE.r + 0.2], [FACE.z + FACE.r - 0.2, HILL.z]]) {
    p.push(part(G.box(1, 3.2, z1 - z0), 0xf6f1e4, [FACE.x + 0.6, 1.6, (z0 + z1) / 2]), part(G.box(1.1, 0.5, z1 - z0), 0x2f6fd0, [FACE.x + 0.6, 3.2, (z0 + z1) / 2]));
    let i = 0;
    for (let z = z0 + 0.5; z < z1; z += 0.9) p.push(part(G.sphere(0.13, 5, 4), [0xfff0a0, 0xff9a8a, 0xa0d8ff][i++ % 3], [FACE.x + 0.05, 3.55, z]));
  }
  // behind: Coney Island, the carousel, the Wild Mouse
  p.push(part(G.box(30, 9, 13), 0xf2c230, [156, 4.5, -50]), part(G.cyl(1, 1, 30, 3), 0xd8322a, [156, 10.6, -50], [0, 0, Math.PI / 2], [3, 1, 7.4]));
  for (let x = 143; x < 170; x += 4) p.push(part(G.box(2.2, 3.4, 0.1), 0x2c3e55, [x, 3.4, -43.45]));
  p.push(part(G.cyl(4, 4, 0.6, 20), 0xf6f1e4, [134, 0.3, -22]), part(G.cyl(0.25, 0.25, 6, 8), 0xf2c230, [134, 3, -22]));
  for (let i = 0; i < 16; i++) p.push(part(new THREE.ConeGeometry(4.6, 2.6, 2, 1, false, (i / 16) * TAU, TAU / 16), i % 2 ? 0xe8403a : 0xf6f1e4, [134, 6.2, -22])); // (its roof, in stripes)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    p.push(part(G.box(0.3, 0.7, 1.0), pick([0xf6f1e4, 0xd9a23a, 0x7a4a2a]), [134 + Math.cos(a) * 3.1, 1.6, -22 + Math.sin(a) * 3.1], [0, -a, 0]), limb([134 + Math.cos(a) * 3.1, 1.6, -22 + Math.sin(a) * 3.1], [134 + Math.cos(a) * 3.1, 4.9, -22 + Math.sin(a) * 3.1], 0.04, 0.04, 0xf2c230, 4));
  }
  const loop = [];
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * TAU;
    loop.push([138 + Math.cos(a) * 9, 5 + 3.5 * Math.sin(a * 3) + 2.5 * Math.cos(a), -34 + Math.sin(a) * 6.5]);
  }
  for (let i = 0; i < 40; i++) {
    p.push(limb(loop[i], loop[i + 1], 0.22, 0.22, 0xe8403a, 5));
    if (i % 3 === 0) p.push(limb([loop[i][0], 0, loop[i][2]], loop[i], 0.12, 0.12, 0xd9d6cc, 4));
  }
}

/** Luna Park's big wheel (the cars hang off it, and stay hanging as it goes round): returns { wheel, cars } */
function wheel(s) {
  const w = new THREE.Group(), R = 12.5, cars = [];
  w.add(vcMesh(merge([
    part(G.torus(R, 0.22, 5, 48), 0xf6f1e4, [0, 0, 0], [0, Math.PI / 2, 0]),
    part(G.torus(R - 1.2, 0.1, 5, 48), 0xe8403a, [0, 0, 0], [0, Math.PI / 2, 0]),
    ...Array.from({ length: 16 }, (_, i) => limb([0, 0, 0], [0, Math.cos((i / 16) * TAU) * R, Math.sin((i / 16) * TAU) * R], 0.08, 0.08, 0xf6f1e4, 4)),
  ]), { cast: false }));
  for (let i = 0; i < 16; i++) {
    const car = vcMesh(merge([part(G.box(1.2, 1.1, 1.2), [0xe8403a, 0x2f6fd0, 0xf2c230, 0x3aa35a][i % 4], [0, -0.9, 0]), part(G.box(0.06, 0.6, 0.06), 0x555555, [0, -0.2, 0])]), { cast: false });
    const a = (i / 16) * TAU;
    car.position.set(0, Math.cos(a) * R, Math.sin(a) * R);
    w.add(car);
    cars.push(car);
  }
  w.position.set(154, 16.5, -27);
  s.add(w, vcMesh(merge([-1, 1].map((k) => limb([154, 0, -27 + k * 5], [154, 16.5, -27], 0.35, 0.25, 0xdddddd, 6))), { cast: false }));
  w.traverse((c) => { c.userData.moves = true; }); // (nothing to fly into: see Flyovers)
  return { w, cars };
}

/** strings of coloured bulbs along the forecourt, pole to pole, sagging between */
function festoons(p) {
  const COLS = [0xff5a4a, 0xffd23a, 0x5ab4ff, 0x7ad65a, 0xffffff];
  for (const z of [-48, -20]) {
    for (let x = 60; x < FACE.x - 4; x += 9) {
      p.push(part(G.cyl(0.08, 0.1, 5, 6), 0x3a3d40, [x, 2.5, z]));
      if (x + 9 >= FACE.x - 4) continue;
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        p.push(part(G.sphere(0.1, 5, 4), COLS[i % COLS.length], [x + 9 * t, 4.9 - Math.sin(t * Math.PI) * 0.9, z]));
      }
    }
  }
}

/* ------------------------------------------------------------------ */
export function buildMilsons(world) {
  const s = new THREE.Group();
  s.position.x = OX;
  world.scene.add(s);
  const near = [], far = [], round = [];

  // --- the water, the land round it, and the flat down by it (with figs in the park, and the seawall all along)
  const water = new THREE.PlaneGeometry(924, 762).rotateX(-Math.PI / 2).translate(2, SEA, -79);
  s.add(new THREE.Mesh(water, seaMat()));
  s.add(vcMesh(terrainGeo(), { cast: false, receive: true }));
  const trees = [[-30, -22, 7.5], [-18, -44, 8], [6, -16, 7], [22, -46, 7.5], [36, -24, 8], [-38, -38, 7], [-2, -42, 6.5], [40, -50, 6]];
  for (const [x, z, h] of trees) {
    const m = vcMesh(fig(h));
    m.position.set(x + OX, 0, z);
    m.rotation.y = rand(0, TAU);
    m.scale.setScalar(rand(1.05, 1.25));
    world.addSway(m);
    world.scene.add(m);
    round.push([x, z, 0.7]);
    world.treeSpots.push({ x: x + OX, z, h: h + 2, palette: 'fig', n: 9 });
  }
  s.add(vcMesh(groundGeo(trees), { cast: false, receive: true }));
  s.add(vcMesh(forecourtGeo(), { cast: false, receive: true }));
  near.push(part(G.box(SHEET.x1 - SHEET.x0, 2.1, 0.6), 0xb9a27a, [(SHEET.x0 + SHEET.x1) / 2, -1, SHEET.z0 + 0.3]));
  near.push(part(G.box(0.6, 2.1, HILL.z - SHEET.z0), 0xb9a27a, [SHEET.x1 - 0.3, -1, (HILL.z + SHEET.z0) / 2]));
  railing(near, SHEET.x0, SHEET.z0 + 0.5, SHEET.x1, SHEET.z0 + 0.5, 0);
  railing(near, SHEET.x1 - 0.4, SHEET.z0 + 0.5, SHEET.x1 - 0.4, HILL.z, 0);

  // --- the station, the hill the line goes into, and the viaduct's piers over the forecourt
  station(near);
  hill(near);
  for (const x of PIERS) for (const z of [-3.6, -5.5]) round.push([x, z, 0.75]);
  const posts = platformSigns(s);
  near.push(...posts);
  for (const x of [-15, -11, 11, 15]) round.push([x, 1.6, 0.15]);
  const dark = new THREE.Mesh(new THREE.BoxGeometry(90, 5.4, 3.9), new THREE.MeshBasicMaterial({ color: 0x0a0a0c }));
  dark.position.set(HILL.x - 0.15 + 45, RAIL_Y + 2.45, TRACK_Z); // (the tunnel: dark all the way in, so she's gone once she's in it)
  s.add(dark);

  // --- the park: lamps along the paths, benches, and a bin or two (see main.js)
  const lamp = lampGeo();
  for (const [x, z] of [[-30, -14], [-16, -34], [-6, -46], [4, -32], [26, -38], [-30, -50], [-6, -50], [18, -50], [42, -50], [62, -46], [84, -46], [106, -46]]) {
    near.push(lamp.clone().translate(x, 0, z));
    round.push([x, z, 0.2]);
  }
  lamp.dispose();
  const bench = benchGeo(), backs = [-0.66, 0, 0.66].map((x) => ({ at: [x, 1.03, -0.26], face: 0, ground: [x, 1.1], hop: [0.45, 0.8] })), seats = [];
  for (const [x, z, r] of [[-20, -48.6, Math.PI], [0, -48.6, Math.PI], [24, -48.6, Math.PI], [72, -47, Math.PI], [94, -47, Math.PI], [-26, -26, Math.PI / 2], [14, -30, 0]]) {
    const b = vcMesh(bench.clone(), { cast: true, receive: true });
    b.position.set(x, 0, z);
    b.rotation.y = r;
    s.add(b);
    for (const k of [-0.6, 0.6]) round.push([x + k * Math.cos(r), z - k * Math.sin(r), 0.45]);
    seats.push({ obj: b, perches: backs });
  }
  for (const x of [-8, 8]) {
    const b = vcMesh(bench.clone(), { cast: true, receive: true });
    b.position.set(x, PLAT.y, PLAT.z1 - 0.7);
    b.rotation.y = Math.PI;
    s.add(b);
    for (const k of [-0.6, 0.6]) round.push([x + k, PLAT.z1 - 0.7, 0.45]);
  }
  bench.dispose();
  // (the chips the gulls are at, on the boardwalk)
  const chips = chipsGeo();
  for (const [x, z] of LUNA_GULLS) near.push(chips.clone().translate(x - OX, 0, z));
  chips.dispose();

  // --- Luna Park: the face, the towers, the walls, the rides behind, the bulbs along the forecourt and a ticket box
  luna(s, near);
  festoons(near);
  for (const z of [-48, -20]) for (let x = 60; x < FACE.x - 4; x += 9) round.push([x, z, 0.2]);
  near.push(part(G.box(2.4, 2.6, 2.4), 0xe8403a, [116, 1.3, -45]), part(G.box(2.5, 0.9, 2.5), 0xf6f1e4, [116, 1.9, -45]), part(G.cone(2, 1.6, 4), 0x2f6fd0, [116, 3.4, -45], [0, Math.PI / 4, 0]));
  round.push([116, -45, 1.5]);
  const big = wheel(s);

  // --- and all round: the Bridge, the city over the water (and the Opera House), and our side of the harbour
  bridge(far);
  city(far);
  northShore(far);
  const sails = sailsGeo().translate(-337, -3, 267).rotateY(Math.PI / 2).scale(2.2, 2.2, 2.2).translate(OPERA[0], 4, OPERA[1]);
  s.add(vcMesh(sails, { cast: false, receive: false }));
  // (and a ferry, out on the harbour, to and fro)
  const ferry = new THREE.Group(), fp = ferryParts();
  for (const g of [fp.hull, fp.rails, fp.cabins]) ferry.add(vcMesh(g, { cast: false }));
  ferry.scale.setScalar(0.8);
  ferry.traverse((c) => { c.userData.moves = true; });
  s.add(ferry);

  s.add(vcMesh(merge(near), { cast: true, receive: true }));
  s.add(vcMesh(merge(far), { cast: false, receive: false }));
  for (const [x, z, r] of round) world.colliders.push({ x: x + OX, z, r });

  return {
    seats, // (the backs of the benches, for turkeys to perch on: see main.js)
    update(dt, t) {
      big.w.rotation.x = t * 0.09;
      for (const c of big.cars) c.rotation.x = -big.w.rotation.x;
      // (she slows right down at either end, as if she's pulling in somewhere)
      const u = Math.sin(t * 0.03);
      ferry.position.set(-60 + 190 * u, 0.3 + Math.sin(t * 0.9) * 0.05, -150);
      ferry.rotation.x = Math.sin(t * 0.7) * 0.01;
    },
  };
}
