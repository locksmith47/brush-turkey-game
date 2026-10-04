import * as THREE from 'three';
import { part, merge, vcMesh, G, limb, rand, pick, noise, smoothstep, clamp, TAU, toonMat, canvasTexture } from '../util.js';
import { fig } from './city.js';
import { SEA, seaMat } from './beach.js';
import { sailsGeo } from './opera.js';
import { ferryParts } from './harbour.js';
import { chipsGeo } from './wharf.js';
import { signFace, benchGeo, lampGeo } from './hyde.js';

/*
 * Milsons Point, over the Bridge, where the train from Museum comes in: in off the Bridge, down the west side of it,
 * to the platform up on the viaduct beside the Bridge's road, and on north past it into the hill, under North Sydney.
 * The stairs come down off the south end of the platform, by the Bridge's pylons, and Bradfield Park runs off along the
 * water from the foot of them, Alfred Street along the top of it. And the view: the Bridge going away over the harbour
 * on your left, and across it, the Quay, the Opera House and the city (a long way off, and kept simple). Round along the
 * water is Luna Park, its big face grinning at you over the boardwalk: walk in through its mouth, and that's as far as
 * it goes, for now.
 *
 * It's off on its own, well away from everywhere else (the train's the only way here, and the tunnels the only way
 * back): OX along from the rest of the world, and laid out the way the first leg is, looking down it, so south, over
 * the harbour, is -z, and round the corner into Luna Park, west, is +x (the second leg's way on).
 */
export const OX = -1000; // (how far along x from the rest of the world it all is: everything below's from there)
// the line: in off the Bridge, along the west side of it, past the platform and on north into the hill: x down the
// middle of it, the tops of its rails, the top of the deck under it (and the Bridge's, either side of the span), and z
// where it goes in, at the portal (and the road with it)
const LINE = { x: -57, y: 6.9, deck: 6.5, portal: 56 };
const PLAT = { x0: -55.2, x1: -49, z0: -14, z1: 30, y: 8 }; // the platform, up on the viaduct, along the west side of the line
/** where the train stops at Milsons Point (the middle of her): in off the Bridge, heading north, her doors opening onto the platform on her west side */
export const MILSONS_STOP = { x: OX + LINE.x, z: 8, y: PLAT.y, dir: [0, 1], side: -1 };
const STAIRS = { x0: -54.7, x1: -49.5, z0: -27.5, n: 27 }; // down off the south end of the platform, towards the water (the foot's at z0)
const HILL = { x: 26, z: -16, y: 10 }; // the hill behind Luna Park: its face (x), the wall along the foot of it (z), and how high
const PARK = { x0: -46, x1: 48, z0: -56, z1: -8 }; // Bradfield Park
const ALFRED = [-4, 4]; // (Alfred Street, along the top of the park and on under the station, the line and the Bridge's road)
const SHEET = { x0: -82, x1: 176, z0: -58, z1: 56 }; // the flat, down by the water (the land beyond's all hills, or harbour)
const PORTAL = { x0: -82, x1: -40, y: 13.2 }; // (the wall across the line and the road where they go in, and the hill over it)
// Luna Park's face, looking out at you from the end of the boardwalk: the middle of it (and how high up that is), how
// far it goes out either side and up and down from there (the ground cuts it off), and how far it bulges out at you
const FACE = { x: 124, z: -34, y: 7.2, rx: 8.4, ry: 9, d: 3.4 };
// (its mouth, the way in, a great grin: half as wide at the ground, how high the top of it is in the middle, and the
// corners of it (how far out, and how high: up higher than the middle, it's that pleased to see you). Behind it the way
// in: how wide (half), how high, and how far back it goes. And how close up to the face you can get, out either side
// of its mouth)
const MOUTH = { hw: 2.7, top: 4.8, corner: [4.3, 5.3], way: 2.9, h: 4.9, deep: 9, lips: 3.5 };
const BR = { x: -64, z0: -64, z1: -264, rise: 12, hw: 11 }; // the Bridge: down the middle, the pylons at either end, how far up its deck goes over the middle, and how wide (half)
const OPERA = [-152, -246]; // (the Opera House, on Bennelong Point)
/**
 * Blues Point, round past Luna Park and McMahons Point: the reserve's lawn, out on the end of the point (level, `y` up,
 * on the lines between the land's squares: see terrainH), with the Tower on the end of it nearest the hill (see blues.js)
 */
export const BLUES = { x0: 224, x1: 266, z0: -160, z1: -88, y: 1.2 };
// the pit the Emperor's lot have dug down the end of its lawn, the catapult down it (see Opening)
export const PIT = { x0: 243, x1: 247, z0: -154, z1: -145 };

export const MILSONS_RECT = [LINE.x - 2 + OX, -58, 50 + OX, PLAT.z1 + 2];
export const LUNA_RECT = [50 + OX, -60, FACE.x + MOUTH.deep + 1 + OX, HILL.z];
/** round the corner into Luna Park: no gate at all, just the boardwalk going on along the water */
export const LUNA_GAP = { x: 50 + OX, z: -36, d: [1, 0], hw: 19, span: [-55, -17] };

// what's about: a mound in the park, bins, ibises and rats, and seagulls round the chips on the boardwalk
export const MILSONS_MOUND = [OX - 12, -34];
export const MILSONS_BINS = [['red', OX - 42.5, -11, Math.PI / 2], ['yellow', OX + 8, -49, Math.PI], ['red', OX + 86, -45.5, Math.PI], ['green', OX + 106, -18.5, 0]];
export const MILSONS_IBISES = [['ibis', OX + 6, -24], ['ibis', OX + 30, -46], ['ibis', OX + 74, -26], ['big', OX + 102, -29], ['ibis', OX + 112, -45]];
export const MILSONS_RATS = [[OX - 40.5, -13], [OX - 38.5, -11.5], [OX + 84, -43.5], [OX + 88.5, -42.5], [OX + 104, -21.5]];
export const LUNA_GULLS = [[OX + 64, -52.5, 2], [OX + 96, -53, 3]];

/** is (x, z) in through Luna Park's mouth, and a few steps on along the way in? (as far as it goes, for now) */
export const inMouth = (x, z) => x - OX > FACE.x + 4 && Math.abs(z - FACE.z) < MOUTH.hw;
/** where you're stood after, just out in front of the face */
export const OUTSIDE = [FACE.x - 6 + OX, FACE.z];

/* ------------------------------------------------------------------ the lie of the land */
/** the ground: flat, bar the platform and the stairs down off it */
export function milsonsGround(x, z) {
  x -= OX;
  if (x >= PLAT.x0 && x <= PLAT.x1 && z >= PLAT.z0 && z <= PLAT.z1) return PLAT.y;
  if (x >= STAIRS.x0 - 0.3 && x <= STAIRS.x1 + 0.3 && z >= STAIRS.z0 && z < PLAT.z0) return (PLAT.y * (z - STAIRS.z0)) / (PLAT.z0 - STAIRS.z0);
  return 0;
}

const at = (x, z) => [x + OX, z];
const box = (x0, z0, x1, z1) => [x0 + OX, z0, x1 + OX, z1];
// the lie of the land (see Track): off the platform, down the stairs, round the foot of them and into the park
export const MILSONS_TRACK = {
  nodes: { plat: at(-52.1, PLAT.z0 + 1.6), foot: at(-52.1, STAIRS.z0 - 1.5), east: at(-43, -34), park: at(10, -24) },
  rooms: [
    { rect: box(PLAT.x0 + 0.3, PLAT.z0 + 0.3, PLAT.x1 - 0.3, PLAT.z1 - 0.3), nodes: ['plat'], ground: 'dirt' },
    { rect: box(STAIRS.x0 + 0.2, STAIRS.z0 - 3, STAIRS.x1 - 0.2, PLAT.z0 + 3), nodes: ['plat', 'foot'], ground: 'dirt' },
    { rect: box(LINE.x + 2.1, -48.8, -40, STAIRS.z0), nodes: ['foot', 'east'], ground: 'dirt' },
    { rect: box(PARK.x0 + 0.4, PARK.z0, HILL.x - 0.6, PARK.z1), nodes: ['east', 'park'] },
    { rect: box(PARK.x0 + 0.4, PARK.z0, PARK.x1 + 2.5, HILL.z - 0.6), nodes: ['park'] },
  ],
};
// and Luna Park's: along the boardwalk and over the forecourt, up to the face (and closer in, out either side of it,
// where it bulges out less), in through its mouth (between its bottom teeth, 1.85 either side of the middle of it),
// and on along the way in, up to the turnstiles
export const LUNA_TRACK = {
  nodes: { mouth: at(FACE.x - MOUTH.lips - 1, FACE.z), in: at(FACE.x + 2, FACE.z) },
  rooms: [
    { rect: box(49.5, -56, FACE.x - MOUTH.lips, HILL.z - 0.6), nodes: ['mouth'] },
    ...[[5.2, 2.25], [6.6, 1.2]].flatMap(([dz, dx]) => [box(FACE.x - 8, -56, FACE.x - dx, FACE.z - dz), box(FACE.x - 8, FACE.z + dz, FACE.x - dx, HILL.z - 0.6)]).map((rect) => ({ rect })),
    { rect: box(FACE.x - MOUTH.lips - 2.5, FACE.z - 1.85, FACE.x + 3, FACE.z + 1.85), nodes: ['mouth', 'in'], ground: 'dirt' },
    { rect: box(FACE.x, FACE.z - MOUTH.way + 0.45, FACE.x + MOUTH.deep - 2, FACE.z + MOUTH.way - 0.45), nodes: ['in'], ground: 'dirt' },
  ],
};

/* ------------------------------------------------------------------ the harbour, and the land round it */
// each headland, point or hill a lump: [x, z, rx, rz, how high, how gently it goes down into the water (0: sheer
// cliffs, 1: hillside all the way)]. The land's as high as the highest lump under it (see the harbour's)
const LUMPS = [
  [-150, -10, 110, 60, 12, 0.6], [-300, -20, 120, 80, 10, 0.6], [-118, -60, 30, 22, 5, 0.3], // Kirribilli
  [0, 150, 380, 130, 24, 0.85], // North Sydney, up the hill behind
  [240, -10, 60, 80, 14, 0.5], [245, -70, 34, 30, 9, 0.5], // McMahons Point, and the neck of Blues Point (the end of it's the reserve: see terrainH)
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

/** the hill behind Luna Park: up from the top of its wall, and on up to North Sydney */
const hillH = (x, z) => Math.max(landH(x, z), (HILL.y + 6 * smoothstep(-10, 50, z)) * smoothstep(198, 178, x));
/** and the one over the portal, where the line and the road go in: level with the top of its wall, going down either side of it */
const portalH = (x, z) => PORTAL.y * smoothstep(PORTAL.x0 - 12, PORTAL.x0, x) * smoothstep(PORTAL.x1 + 12, PORTAL.x1, x) * smoothstep(LINE.portal, LINE.portal + 6, z);

/** the height of the land all round: the flat (just under it: it's got its own ground), the hills, and the rest */
function terrainH(x, z) {
  // (Blues Point's reserve: just under its lawn, and the harbour right up to its seawall)
  // (bar the pit dug in it: well down, from the corners of the 6 m squares round it, under the lawn, see terrainGeo)
  if (x > PIT.x0 - 1.1 && x < PIT.x1 + 1.1 && z > PIT.z0 - 0.1 && z < PIT.z1 + 3.1) return -6;
  if (x >= BLUES.x0 && x <= BLUES.x1 && z >= BLUES.z0 && z <= BLUES.z1) return BLUES.y - 0.05;
  const out = Math.hypot(Math.max(SHEET.x0 - x, 0, x - SHEET.x1), Math.max(SHEET.z0 - z, 0, z - SHEET.z1));
  if (x >= HILL.x + 6 - 0.1 && z >= HILL.z + 6 - 0.1) return hillH(x, z);
  if (out < 0.1) return -0.05;
  const y = landH(x, z), h = y > 0 ? y * smoothstep(0, 30, out) : y, over = portalH(x, z); // (rising gently away from the flat)
  return over > 0 ? Math.max(h, over) : h;
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
    else if (y < 0.7) c.copy(steep > 0.5 ? C.rock : y > -0.1 && z > SHEET.z0 + 4 ? C.grass : C.sand); // (sand down at the water, grass back off it)
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
const PATHS = [[-47, -30.5, -24, -30, 1.8], [-24, -30, -8, -50.5, 1.6], [-24, -30, 20, -36, 1.4], [20, -36, 50, -40, 1.8]];

/**
 * What the flat's made of, in the 2 m square round (x, z): Luna Park's boardwalk and forecourt, the street and its
 * footpaths, the paving round the foot of the stairs and along the water, or (null) the park's lawn, which goes on
 * under the Bridge's road
 */
function groundKind(x, z) {
  if (x >= 50) {
    if (z < -48.5) return PLANKS[Math.floor(x / 2) % 2]; // (the boardwalk)
    if (x > FACE.x + 0.5) return TAR; // (under the way in, through the face's mouth)
    return PAVE; // (the forecourt's tiles are laid over it: see forecourtGeo)
  }
  if (z > ALFRED[0] && z < ALFRED[1]) return ROAD;
  if (x < LINE.x - 1.7) return null;
  if (z > PARK.z1 || x < PARK.x0 || z < -50) return PAVE;
  return null;
}

/** the lawn's colour at (x, z): mottled, and darker in under the figs */
function lawnColour(x, z, trees, c) {
  c.copy(LAWN[0]).lerp(LAWN[1], 0.5 + 0.5 * noise(x * 0.09, z * 0.09));
  let shade = 0;
  for (const [tx, tz] of trees) shade = Math.max(shade, 1 - smoothstep(2.5, 6.5, Math.hypot(x - tx, z - tz)));
  return c.lerp(SHADE, shade * 0.55);
}

/** the flat, in 2 m squares: from under the Bridge to Lavender Bay, and the water up to the portal (bar the hill) */
function groundGeo(trees) {
  const S = 2, pos = [], col = [], c = new THREE.Color();
  for (let x = SHEET.x0; x < SHEET.x1; x += S) {
    for (let z = SHEET.z0; z < SHEET.z1; z += S) {
      if (x >= HILL.x && z >= HILL.z) continue;
      const kind = groundKind(x + S / 2, z + S / 2);
      for (const [dx, dz] of [[0, 0], [0, S], [S, 0], [S, 0], [0, S], [S, S]]) {
        if (kind) c.copy(kind);
        else lawnColour(x + dx, z + dz, trees, c);
        pos.push(x + dx, 0, z + dz);
        col.push(c.r, c.g, c.b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** the park's paths, laid over the lawn (round at the ends), and the markings down Alfred Street */
function paths(p) {
  for (const [ax, az, bx, bz, w] of PATHS) {
    const len = Math.hypot(bx - ax, bz - az), s = new THREE.Shape();
    s.moveTo(0, -w);
    s.lineTo(len, -w);
    s.absarc(len, 0, w, -Math.PI / 2, Math.PI / 2, false);
    s.lineTo(0, w);
    s.absarc(0, 0, w, Math.PI / 2, Math.PI * 1.5, false);
    p.push(part(new THREE.ShapeGeometry(s, 6).rotateX(-Math.PI / 2).rotateY(Math.atan2(az - bz, bx - ax)), PATH, [ax, 0.02, az]));
  }
  for (let x = SHEET.x0 + 2; x < 48; x += 6) p.push(part(G.box(3, 0.02, 0.15), 0xf2efe6, [x, 0.02, (ALFRED[0] + ALFRED[1]) / 2]));
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
const SAND = 0xc9a874, SAND2 = 0xb89660, DARK = 0x231c18;

/** a railing along (ax, az) to (bx, bz), at height y */
function railing(p, ax, az, bx, bz, y, color = GREEN) {
  const len = Math.hypot(bx - ax, bz - az), rot = [0, -Math.atan2(bz - az, bx - ax), 0], mid = [(ax + bx) / 2, 0, (az + bz) / 2];
  p.push(part(G.box(len, 0.07, 0.07), color, [mid[0], y + 1.05, mid[2]], rot), part(G.box(len, 0.04, 0.04), color, [mid[0], y + 0.5, mid[2]], rot));
  const n = Math.max(1, Math.round(len / 1.6));
  for (let i = 0; i <= n; i++) p.push(part(G.box(0.06, 1.05, 0.06), color, [ax + ((bx - ax) * i) / n, y + 0.52, az + ((bz - az) * i) / n]));
}

/** an arch's dark doorway, on a wall at x facing along +x (k 1) or -x (k -1), its middle at z */
function archway(p, x, z, k = 1, w = 2.2, h = 2.6) {
  p.push(part(G.box(0.06, h, w), DARK, [x + k * 0.03, h / 2, z]), part(G.cyl(w / 2, w / 2, 0.06, 14), DARK, [x + k * 0.03, h, z], [0, 0, Math.PI / 2]));
  p.push(part(G.box(0.12, 0.22, w + 0.4), CREAM, [x + k * 0.06, h + w / 2 + 0.3, z]));
}

/** the way under for Alfred Street, through a wall at x facing along +x (k 1) or -x (k -1): dark, under a girder */
function underpass(p, x, k = 1) {
  const w = ALFRED[1] - ALFRED[0] + 1, m = (ALFRED[0] + ALFRED[1]) / 2;
  p.push(part(G.box(0.06, 4.6, w), DARK, [x + k * 0.03, 2.3, m]));
  p.push(part(G.box(0.4, 1.1, w + 1.6), GREEN, [x + k * 0.2, 5.15, m]), part(G.box(0.5, 0.12, w + 1.8), GREEN, [x + k * 0.25, 4.62, m]));
  for (const s of [-1, 1]) p.push(part(G.box(0.3, 4.6, 0.6), SAND2, [x + k * 0.15, 2.3, m + s * (w / 2 + 0.3)]));
}

/** a box down along z from a to b, at x, w wide and h deep, its top `top` over y(z) all the way (in lengths of no more than `step`, each tilted to follow it) */
function along(p, x, a, b, w, h, top, color, y, step = 8) {
  const n = Math.max(1, Math.ceil((b - a) / step));
  for (let i = 0; i < n; i++) {
    const za = a + ((b - a) * i) / n, zb = a + ((b - a) * (i + 1)) / n, ya = y(za) + top - h / 2, yb = y(zb) + top - h / 2;
    p.push(part(G.box(w, h, Math.hypot(zb - za, yb - ya) + 0.05), color, [x, (ya + yb) / 2, (za + zb) / 2], [-Math.atan2(yb - ya, zb - za), 0, 0]));
  }
}
const level = () => LINE.deck; // (the line's deck, off the Bridge: level all the way)

/** the line along its deck, from z a to b (the deck's top at y(z)): its ballast, its sleepers (from z `near` on: further off, you'd never see them) and its rails */
function track(p, a, b, y = level, near = a) {
  along(p, LINE.x, a, b, 3.2, 0.24, 0.22, 0x6b6560, y);
  for (let z = Math.max(a, near) + 0.35; z < b; z += 0.7) p.push(part(G.box(2.5, 0.12, 0.24), 0x5a4a3a, [LINE.x, y(z) + 0.28, z]));
  for (const s of [-1, 1]) along(p, LINE.x + s * 0.72, a, b, 0.08, 0.14, LINE.y - LINE.deck, 0x9aa0a6, y);
}

/**
 * The station: the brick building under the platform, with arches along its street side and Alfred Street through it,
 * the platform up on top, and the stairs down off the south end of it, between their walls, to the way in at the foot
 */
function station(p) {
  const { x0, x1, z0, z1, y } = PLAT, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
  p.push(part(G.box(x1 - x0, y - 0.3, z1 - z0), BRICK, [mx, (y - 0.3) / 2, mz]));
  for (let z = z0 + 2.5; z < z1 - 1; z += 4) if (z < ALFRED[0] - 2 || z > ALFRED[1] + 2) archway(p, x1, z);
  p.push(part(G.box(0.1, 0.22, z1 - z0), CREAM, [x1 + 0.05, 5.6, mz]));
  underpass(p, x1);
  // the platform: its edge, the yellow line along it, and railings round the back and the far end
  p.push(part(G.box(x1 - x0 + 0.3, 0.3, z1 - z0 + 0.3), CREAM, [mx, y - 0.15, mz]));
  p.push(part(G.box(x1 - x0, 0.04, z1 - z0), 0xbdb8ab, [mx, y + 0.01, mz]));
  p.push(part(G.box(0.35, 0.02, z1 - z0), 0xf2c230, [x0 + 0.45, y + 0.04, mz]));
  railing(p, x1 - 0.1, z0, x1 - 0.1, z1, y);
  railing(p, x0 + 0.6, z1 - 0.1, x1 - 0.1, z1 - 0.1, y);
  // the stairs, their walls stepping down with them, and the way in at the foot of them (its name on it: see platformSigns)
  const { n } = STAIRS, run = z0 - STAIRS.z0, tread = run / n, sx = (STAIRS.x0 + STAIRS.x1) / 2;
  for (let i = 0; i < n; i++) {
    const top = (y * (i + 0.5)) / n;
    p.push(part(G.box(STAIRS.x1 - STAIRS.x0, top, tread), i % 2 ? 0xc8c2b2 : 0xbdb6a5, [sx, top / 2, STAIRS.z0 + (i + 0.5) * tread]));
  }
  for (const x of [STAIRS.x0 - 0.25, STAIRS.x1 + 0.25]) {
    for (let i = 0; i < 6; i++) {
      const h = (y * (i + 1)) / 6 + 1, z = STAIRS.z0 + ((i + 0.5) * run) / 6;
      p.push(part(G.box(0.5, h, run / 6), BRICK2, [x, h / 2, z]), part(G.box(0.62, 0.12, run / 6 + 0.02), CREAM, [x, h + 0.06, z]));
    }
  }
  for (const x of FOOT) p.push(part(G.box(0.8, 4.4, 0.8), SAND, [x, 2.2, STAIRS.z0]), part(G.box(0.95, 0.25, 0.95), SAND2, [x, 4.52, STAIRS.z0]));
  p.push(part(G.box(STAIRS.x1 - STAIRS.x0 + 1.5, 0.9, 0.5), SAND, [sx, 3.85, STAIRS.z0]));
}
const FOOT = [STAIRS.x0 - 0.35, STAIRS.x1 + 0.35]; // (x: the piers either side of the way in, at the foot of the stairs)
const BED = { x0: STAIRS.x1 + 0.6, x1: PARK.x0, z0: STAIRS.z0 + 0.4, z1: PARK.z1 }; // (the garden bed beside the stairs, up to Alfred Street)

/**
 * The line's viaduct, from the Bridge's pylons on to the portal: brick, with blind arches along its west face where you
 * can see it (the stairs and the station are along it from there), and the line along the top of it; and the road
 * beside it, on its own deck, on granite piers, with Alfred Street under the lot
 */
function viaduct(p) {
  const za = BR.z0 + 10, zb = LINE.portal + 1, v0 = LINE.x - 1.7, v1 = LINE.x + 1.7, len = zb - za, mz = (za + zb) / 2;
  p.push(part(G.box(v1 - v0, LINE.deck - 0.3, len), BRICK2, [LINE.x, (LINE.deck - 0.3) / 2, mz]));
  p.push(part(G.box(v1 - v0 + 0.3, 0.3, len), CREAM, [LINE.x, LINE.deck - 0.15, mz]));
  for (let z = za + 2.6; z < STAIRS.z0 - 1.2; z += 4) archway(p, v1, z);
  track(p, za, zb);
  railing(p, v1 - 0.06, za, v1 - 0.06, STAIRS.z0 + 1, LINE.deck, STEEL);
  railing(p, v1 - 0.06, PLAT.z1, v1 - 0.06, LINE.portal, LINE.deck, STEEL);
  // the road: its deck, the parapet along its far side, the fence between it and the line, its lanes, and its piers
  const r0 = BR.x - BR.hw, r1 = v0, rm = (r0 + r1) / 2;
  p.push(part(G.box(r1 - r0, 1.4, len), 0x55595c, [rm, LINE.deck - 0.7, mz]), part(G.box(r1 - r0 + 0.2, 0.25, len), 0x8a8f94, [rm, LINE.deck - 1.3, mz]));
  p.push(part(G.box(0.3, 1.1, len), 0x7d858a, [r0 + 0.15, LINE.deck + 0.55, mz]));
  railing(p, r1 - 0.1, za, r1 - 0.1, LINE.portal, LINE.deck, STEEL);
  for (const x of [r0 + 4, r0 + 8, r0 + 12]) for (let z = za + 2; z < LINE.portal - 1; z += 8) p.push(part(G.box(0.15, 0.02, 3), 0xf2efe6, [x, LINE.deck + 0.01, z]));
  for (const z of [-44, -28, -13, 11, 27, 43]) for (const x of [r0 + 2.5, r1 - 2.6]) p.push(part(G.box(2.6, LINE.deck + 0.6, 2.6), GRANITE, [x, (LINE.deck - 3.4) / 2, z]));
}

/** the hill behind Luna Park: a sandstone face along the side of it, and the wall along the foot of it, by Luna Park */
function hill(p) {
  const top = HILL.y + 0.2;
  p.push(part(G.box(6, top, SHEET.z1 - HILL.z), SAND, [HILL.x + 3, top / 2, (SHEET.z1 + HILL.z) / 2]));
  p.push(part(G.box(178 - HILL.x, top, 6), SAND, [(178 + HILL.x) / 2, top / 2, HILL.z + 3]));
  for (let y = 1.6; y < top; y += 1.6) {
    p.push(part(G.box(0.04, 0.08, SHEET.z1 - HILL.z), SAND2, [HILL.x - 0.01, y, (SHEET.z1 + HILL.z) / 2]));
    p.push(part(G.box(178 - HILL.x, 0.08, 0.04), SAND2, [(178 + HILL.x) / 2, y, HILL.z - 0.01]));
  }
}

/**
 * Where the line and the road go in, under North Sydney: a sandstone wall across the end of them, the hill over it, and
 * their tunnels' mouths in it, the road's and the line's. Returns the mouths, [x0, x1, how high]
 */
function portal(p) {
  const z = LINE.portal, top = PORTAL.y + 0.25, mz = z + 3, mouths = [[BR.x - BR.hw + 0.5, LINE.x - 2.4, 12.2], [LINE.x - 1.8, LINE.x + 2.1, 12]];
  const piece = (x0, x1, y0, y1) => p.push(part(G.box(x1 - x0, y1 - y0, 6), SAND, [(x0 + x1) / 2, (y0 + y1) / 2, mz]));
  const [[a0, a1, ah], [b0, b1, bh]] = mouths;
  piece(PORTAL.x0, PORTAL.x1, -1, LINE.deck);
  piece(PORTAL.x0, a0, LINE.deck, top);
  piece(a1, b0, LINE.deck, top);
  piece(b1, PORTAL.x1, LINE.deck, top);
  piece(a0, a1, ah, top);
  piece(b0, b1, bh, top);
  p.push(part(G.box(PORTAL.x1 - PORTAL.x0 + 0.6, 0.5, 6.6), SAND2, [(PORTAL.x0 + PORTAL.x1) / 2, top + 0.25, mz]));
  for (const [x0, x1, h] of mouths) {
    p.push(part(G.box(x1 - x0 + 1.2, 0.6, 0.3), SAND2, [(x0 + x1) / 2, h + 0.3, z - 0.15]));
    for (const x of [x0 - 0.3, x1 + 0.3]) p.push(part(G.box(0.6, h - LINE.deck, 0.3), SAND2, [x, (h + LINE.deck) / 2, z - 0.15]));
  }
  return mouths;
}

/** the station's name: on boards hung across the platform, and over the way in at the foot of the stairs (returns the boards' frames) */
function platformSigns(s) {
  const draw = (c, cw, ch) => {
    c.fillStyle = '#1d2f5c'; c.fillRect(0, 0, cw, ch);
    c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `bold ${Math.round(ch * 0.52)}px sans-serif`; c.fillText('MILSONS POINT', cw / 2, ch / 2 + 2);
  };
  const posts = [], face = (w, h, x, y, z, gap = 0.04) => {
    for (const k of [-1, 1]) {
      const m = signFace(w, h, draw);
      m.position.set(x, y, z + k * gap);
      if (k < 0) m.rotation.y = Math.PI;
      s.add(m);
    }
  };
  for (const z of SIGNS) {
    face(3.4, 0.62, SIGN_X, PLAT.y + 2.75, z);
    for (const dx of [-1.9, 1.9]) posts.push(part(G.box(0.1, 3.2, 0.1), 0x24272a, [SIGN_X + dx, PLAT.y + 1.6, z]));
    posts.push(part(G.box(3.9, 0.1, 0.1), 0x24272a, [SIGN_X, PLAT.y + 3.15, z]), part(G.box(3.5, 0.72, 0.04), 0x24272a, [SIGN_X, PLAT.y + 2.75, z]));
  }
  face(4.8, 0.62, (STAIRS.x0 + STAIRS.x1) / 2, 3.85, STAIRS.z0, 0.27);
  return posts;
}
const SIGNS = [-2, 18], SIGN_X = (PLAT.x0 + PLAT.x1) / 2 + 0.3; // (where the boards hang across the platform)

/* ------------------------------------------------------------------ the Bridge, and over the water */
/** how high the top of the Bridge's deck is at z: level with the line's, either side of the span, and up over the middle of the harbour */
function deckY(z) {
  const mid = (BR.z0 + BR.z1) / 2, half = (BR.z0 - BR.z1) / 2;
  return LINE.deck + BR.rise * smoothstep(half + 6, 0, Math.abs(z - mid));
}

/**
 * The Harbour Bridge: the granite pylons at either end, the steel arch between, and the deck hung under it, the line
 * along the west side of it, up over the middle of the harbour and down again. This side, the line and the road go on
 * on viaducts of their own (see viaduct); the far side, the deck goes on into the city, on piers
 */
function bridge(p) {
  const { x, z0, z1, hw } = BR, mid = (z0 + z1) / 2, half = (z0 - z1) / 2;
  const u = (z) => (z - mid) / half, low = (z) => 1 + 47 * (1 - u(z) ** 2), high = (z) => low(z) + 3.5 + 12 * u(z) ** 2;
  for (const pz of [z0 + 5, z1 - 5]) {
    for (const s of [-1, 1]) {
      // (each up against the side of the deck, in courses of granite, with an arch through it, up high)
      const px = x + s * (hw + 2.6);
      p.push(part(G.box(9.8, 32, 12), GRANITE, [px, 15, pz]), part(G.box(10.8, 1.6, 13), 0xa89c84, [px, 31.5, pz]), part(G.box(8.4, 6, 10.6), GRANITE, [px, 35, pz]));
      for (const k of [-1, 1]) p.push(part(G.box(0.1, 4, 1.6), 0x8d8270, [px - k * 4.92, 34, pz]));
      for (const y of [9, 19.5]) p.push(part(G.box(10.1, 0.5, 12.3), 0xa89c84, [px, y, pz]));
      for (const k of [-1, 1]) p.push(part(G.box(4, 5, 0.06), 0x4d463e, [px, 23.5, pz + k * 6.03]), part(G.cyl(2, 2, 0.06, 16), 0x4d463e, [px, 26, pz + k * 6.03], [Math.PI / 2, 0, 0]));
    }
  }
  // (the abutment the north pylons stand on, at the water's edge: its coping, and the joints in its face)
  p.push(part(G.box(36, 2.4, 22), GRANITE, [x, 1.2, z0 + 4]), part(G.box(36.4, 0.35, 22.4), 0xa89c84, [x, 2.4, z0 + 4]));
  for (let k = -16.5; k < 17; k += 3) p.push(part(G.box(0.06, 2.1, 0.04), 0x8d8270, [x + k, 1.05, z0 + 15.02]));
  // the deck, from the far side to in between the pylons this side: the road, its parapets, and the line
  const zs = z1 - 70, ze = z0 + 10;
  along(p, x, zs, ze, hw * 2, 1.8, 0, 0x55595c, deckY);
  for (const s of [-1, 1]) along(p, x + s * (hw - 0.2), zs, ze, 0.3, 1.1, 1.1, 0x7d858a, deckY);
  track(p, zs, ze, deckY, -150);
  for (let z = z1 - 14; z > zs; z -= 16) for (const s of [-1, 1]) p.push(part(G.box(3, deckY(z) + 0.2, 3), GRANITE, [x + s * (hw - 2.5), (deckY(z) - 3.8) / 2, z]));
  // the arch: two ribs, each a top and a bottom chord braced between, with hangers down to the deck and posts up to it
  const N = 28;
  for (const s of [-1, 1]) {
    const rx = x + s * (hw - 1.5);
    for (let i = 0; i < N; i++) {
      const a = z0 - ((z0 - z1) * i) / N, b = z0 - ((z0 - z1) * (i + 1)) / N;
      p.push(limb([rx, low(a), a], [rx, low(b), b], 0.9, 0.9, STEEL, 6), limb([rx, high(a), a], [rx, high(b), b], 0.8, 0.8, STEEL, 6));
      p.push(limb([rx, low(a), a], [rx, high(b), b], 0.28, 0.28, STEEL, 4), limb([rx, low(b), b], [rx, high(b), b], 0.28, 0.28, STEEL, 4));
      const deck = deckY(b);
      if (low(b) > deck + 1) p.push(limb([rx, low(b), b], [rx, deck, b], 0.16, 0.16, STEEL, 4));
      else if (low(b) < deck - 2.8) p.push(limb([rx, low(b), b], [rx, deck - 1.8, b], 0.35, 0.35, STEEL, 4));
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

/** a car (lying along z, its wheels on y 0) */
function carGeo(color) {
  const p = [part(G.box(1.8, 0.75, 4.3), color, [0, 0.62, 0]), part(G.box(1.62, 0.62, 2.3), color, [0, 1.3, -0.25])];
  p.push(part(G.box(1.66, 0.42, 2.2), 0x26303a, [0, 1.3, -0.25]), part(G.box(1.7, 0.18, 0.06), 0xfff3c4, [0, 0.72, 2.16]), part(G.box(1.7, 0.16, 0.06), 0xc0302a, [0, 0.72, -2.16]));
  for (const [dx, dz] of [[-0.85, 1.35], [0.85, 1.35], [-0.85, -1.35], [0.85, -1.35]]) p.push(part(G.cyl(0.34, 0.34, 0.24, 10), 0x24272a, [dx, 0.34, dz], [0, 0, Math.PI / 2]));
  return merge(p);
}

/** the traffic on the Bridge's road, going over and coming back (keeping left), and off into the tunnel under North Sydney: returns its update(dt) */
function traffic(s) {
  const r0 = BR.x - BR.hw, far = BR.z1 - 60, back = LINE.portal + 14, cars = [];
  const colors = [0xd8322a, 0xf6f1e4, 0x2f6fd0, 0x3a3d40, 0xf2c230, 0x9aa0a6, 0x2f5a3f, 0xe8e8e8];
  for (let i = 0; i < 10; i++) {
    const m = vcMesh(carGeo(colors[i % colors.length]), { cast: true, receive: false }), lane = i % 4, north = lane >= 2;
    m.userData.moves = true;
    s.add(m);
    cars.push({ m, x: r0 + 2 + lane * 4, dir: north ? 1 : -1, z: far + ((back - far) * ((i * 0.37) % 1)), v: rand(12, 16) });
  }
  return (dt) => {
    for (const c of cars) {
      c.z += c.dir * c.v * dt;
      if (c.z > back) c.z = far;
      else if (c.z < far) c.z = back;
      const y = deckY(c.z), up = Math.atan2(deckY(c.z + 0.5) - deckY(c.z - 0.5), 1);
      c.m.position.set(c.x, y, c.z);
      c.m.rotation.set(-up, c.dir > 0 ? 0 : Math.PI, 0);
    }
  };
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
  const y = terrainH(x, z), w = rand(5, 8), d = rand(5, 7), h = rand(3, 6), roof = pick([0xb4553a, 0xa04a34, 0x8a8f94, 0xc0653f]);
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

/** our side: Kirribilli (Admiralty House, and the houses up the hill), North Sydney's towers and McMahons Point (Blues Point Tower's in blues.js) */
function northShore(p) {
  for (let i = 0; i < 90; i++) {
    const x = rand(-420, -76), z = rand(-80, 70);
    if (terrainH(x, z) < 1.2 || x > SHEET.x0 - 4) continue;
    house(p, x, z, rand(-0.3, 0.3));
  }
  // Admiralty House, and Kirribilli House next door, on the point
  p.push(part(G.box(16, 8, 11), 0xd9c49a, [-114, landH(-114, -64) + 3.5, -64]), part(G.box(17, 0.6, 12), 0xf2efe6, [-114, landH(-114, -64) + 7.6, -64]));
  p.push(part(G.cone(10, 3, 4), 0x7d6b55, [-114, landH(-114, -64) + 9.4, -64], [0, Math.PI / 4, 0], [1, 1, 0.7]), part(G.box(9, 6, 8), 0xefe2c4, [-136, landH(-136, -56) + 2.5, -56]));
  // North Sydney, up the hill, its towers going up over the station
  for (let i = 0; i < 30; i++) {
    const x = rand(-170, 150), z = rand(70, 200);
    tower(p, x, terrainH(x, z) - 1, z, rand(12, 22), rand(24, 70), rand(12, 18), pick(TOWERS));
  }
  // and along Alfred Street, past the station, shops with flats over them (their backs to you, from up on the
  // platform), and the bigger blocks behind them
  for (let x = PARK.x0 + 4.5; x < HILL.x - 4; x += 10) {
    const h = rand(7, 11), z = ALFRED[1] + 9, f = z - 5.04, b = z + 5.04;
    p.push(part(G.box(9, h, 10), pick([0xd9c49a, 0xc98a6a, 0xe8dcc0, 0xb9a07a, 0xa8553c]), [x, h / 2, z]), part(G.box(9.2, 0.5, 10.2), 0x8a8f94, [x, h + 0.25, z]));
    p.push(part(G.box(7, 1.8, 0.1), 0x2c3e55, [x, 1.3, f]), part(G.box(9, 0.3, 1.4), pick([0x2f5a3f, 0xb4553a, 0x1d2f5c]), [x, 3, f - 0.7]));
    for (let y = 4.4; y < h - 1; y += 3) for (const k of [-2.7, 0, 2.7]) p.push(part(G.box(1.3, 1.5, 0.1), 0x2c3e55, [x + k, y, f]), part(G.box(1.3, 1.5, 0.1), 0x2c3e55, [x + k, y, b]));
    p.push(part(G.box(2, 1.2, 2.4), 0x9aa0a6, [x + rand(-2.5, 2.5), h + 1.1, z + rand(-2.5, 2.5)])); // (something up on the roof)
    tower(p, x + rand(-1, 1), -0.5, z + 22 + rand(-2, 2), 8.6, rand(14, 24), 12, pick(TOWERS));
  }
  // McMahons Point's houses, and out on the end of Blues Point, the Tower, all on its own
  for (let i = 0; i < 40; i++) {
    const x = rand(196, 300), z = rand(-90, 60);
    if (terrainH(x, z) < 1.2 || (x > BLUES.x0 - 8 && x < BLUES.x1 + 8 && z < BLUES.z1 + 10)) continue; // (none up against the Tower)
    house(p, x, z, rand(-0.3, 0.3));
  }
}

/* ------------------------------------------------------------------ Luna Park */
// The face is built in a frame of its own: looking out along +z, with x across it, y up, and the middle of the foot of
// its mouth at the origin (faceAt puts it where it goes)
const FACE_PAINT = {
  skin: [new THREE.Color(0xffdcae), new THREE.Color(0xf0a464)], rosy: new THREE.Color(0xf47a72),
  lip: 0xd8262c, tooth: 0xfffaf0, nose: 0xf59a6a, brow: 0x4a2412, iris: 0x2f6fd0, red: 0xe8403a, gold: 0xf2c230, blue: 0x2f6fd0,
};
const FACE_EYE = { x: 2.8, y: 10.3 }; // (its eyes: how far either side of the middle, and how high)
const FACE_LOTS = [3.8, 5.6, 8.8]; // m up: its skin comes in lots split at these heights, each going see-through on its own (see luna)
const FACE_NA = 120; // (how finely its skin goes round, from one side of its mouth, up over the top, to the other)
// (along the way in, m back from the face: where the colour of its walls changes, with an arch of bulbs halfway between each)
const FACE_WAY = [0, -1.5, -3, -4.5, -6, -7.5, -MOUTH.deep];

/** a geometry built in the face's frame, put where the face is, looking back down the forecourt */
const faceAt = (g) => g.rotateY(-Math.PI / 2).translate(FACE.x, 0, FACE.z);

/** how high its upper lip is, x across from the middle of its mouth (from one corner of its grin, over to the other) */
const lipTop = (x) => MOUTH.top + (MOUTH.corner[1] - MOUTH.top) * Math.min(1, Math.abs(x) / MOUTH.corner[0]) ** 2.2;
/** and how steep it is there */
const lipSlope = (x) => (Math.sign(x) * (MOUTH.corner[1] - MOUTH.top) * 2.2 * Math.min(1, Math.abs(x) / MOUTH.corner[0]) ** 1.2) / MOUTH.corner[0];
/** and its lower lip, out either side of the way in: up from the ground, curving out to the corners of its grin */
function lipLow(x) {
  const [w, y] = MOUTH.corner, d = Math.abs(x) - MOUTH.hw;
  return d <= 0 ? -Infinity : y * Math.min(1, d / (w - MOUTH.hw)) ** (1 / 1.8);
}
/** how far the edge of its mouth is from the foot of it, at angle a (0: along the ground one way, π the other) */
function mouthEdge(a) {
  const c = Math.cos(a), s = Math.max(0, Math.sin(a));
  let lo = 0, hi = 10;
  for (let i = 0; i < 32; i++) {
    const r = (lo + hi) / 2, x = r * c, y = r * s;
    if (Math.abs(x) < MOUTH.corner[0] && y < lipTop(x) && y > lipLow(x)) lo = r; else hi = r;
  }
  return lo;
}
/** and how far the edge of the way in behind it is (a plain arch), that way */
function wayEdge(a) {
  const c = Math.abs(Math.cos(a)) / MOUTH.way, s = Math.max(0, Math.sin(a)) / MOUTH.h;
  return (c ** 3.2 + s ** 3.2) ** (-1 / 3.2);
}
/**
 * The angles everything round its mouth is worked out at, from 0 to π (FACE_NA + 1 of them): FACE_CORNER and the one
 * as far from the other end are right at the corners of its grin
 */
const FACE_CORNER = Math.round((FACE_NA * Math.atan2(MOUTH.corner[1], MOUTH.corner[0])) / Math.PI);
const FACE_ANGLES = Array.from({ length: FACE_NA + 1 }, (_, i) => {
  const c = Math.atan2(MOUTH.corner[1], MOUTH.corner[0]), n = FACE_CORNER, N = FACE_NA;
  return i <= n ? (c * i) / n : i >= N - n ? Math.PI - (c * (N - i)) / n : c + ((Math.PI - 2 * c) * (i - n)) / (N - 2 * n);
});

/** how far the edge of the face is from the foot of its mouth, at angle a (an ellipse round its middle, cut off by the ground) */
function faceEdge(a) {
  const c = Math.cos(a), s = Math.sin(a), A = (c / FACE.rx) ** 2 + (s / FACE.ry) ** 2, B = (2 * FACE.y * s) / FACE.ry ** 2;
  return (B + Math.sqrt(B * B - 4 * A * ((FACE.y / FACE.ry) ** 2 - 1))) / (2 * A);
}

/**
 * How far the face bulges out at (x, y): like a cushion, full across the middle and rounding off to its edge, its
 * cheeks plumped up by the grin, and its eyes set in a little
 */
function faceBulge(x, y) {
  let d = FACE.d;
  for (const k of [-1, 1]) {
    d += 0.55 * Math.exp(-((x - k * 5.1) ** 2 + (y - 6.6) ** 2) / 3.2) - 0.3 * Math.exp(-((x - k * FACE_EYE.x) ** 2 + (y - FACE_EYE.y) ** 2) / 1.6);
  }
  return d * Math.sqrt(Math.max(0, 1 - Math.hypot(x / FACE.rx, (y - FACE.y) / FACE.ry) ** 3.5));
}

/** the colour of its skin at (x, y), into c: lighter where it's out furthest, and rosy at the cheeks */
function faceSkin(x, y, c) {
  c.copy(FACE_PAINT.skin[0]).lerp(FACE_PAINT.skin[1], smoothstep(0.3, 1, Math.hypot(x / FACE.rx, (y - FACE.y) / FACE.ry)));
  for (const k of [-1, 1]) c.lerp(FACE_PAINT.rosy, 0.8 * smoothstep(1.9, 0.7, Math.hypot(x - k * 5.2, y - 6.7)));
  return c;
}

/** the part of polygon `poly` (its corners, each [x, y, z, and whatever else goes along with them]) below height h, or above it */
function sliceAt(poly, h, below) {
  const out = [], keep = (q) => (below ? q[1] < h : q[1] >= h);
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length];
    if (keep(a)) out.push(a);
    if (keep(a) !== keep(b)) out.push(a.map((v, j) => v + ((b[j] - v) * (h - a[1])) / (b[1] - a[1])));
  });
  return out;
}

/**
 * Triangles over a grid of points (`pts`: x, y, z, x, y, z...; each of `tris`: [a, b, c, and whatever `paint` wants]),
 * smooth (the normals worked out with their corners shared), each coloured by `paint(t, k, c)` (corner k of t, into c),
 * and cut into lots by height (`lots`: the heights between them, each a level cut). `flip`: facing the other way
 */
function gridGeo(pts, tris, lots, paint, flip = false) {
  const g = new THREE.BufferGeometry(), c = new THREE.Color(), s = flip ? -1 : 1;
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.setIndex(tris.flatMap((t) => t.slice(0, 3)));
  g.computeVertexNormals();
  const nrm = g.attributes.normal.array, out = [...lots, 0].map(() => ({ p: [], n: [], c: [] }));
  g.dispose();
  for (const t of tris) {
    let poly = (flip ? [2, 1, 0] : [0, 1, 2]).map((k) => {
      const v = t[k] * 3;
      paint(t, k, c);
      return [pts[v], pts[v + 1], pts[v + 2], nrm[v] * s, nrm[v + 1] * s, nrm[v + 2] * s, c.r, c.g, c.b];
    });
    out.forEach((o, i) => {
      const lot = i < lots.length ? sliceAt(poly, lots[i], true) : poly;
      if (i < lots.length) poly = sliceAt(poly, lots[i], false);
      for (let k = 2; k < lot.length; k++) {
        for (const q of [lot[0], lot[k - 1], lot[k]]) { o.p.push(q[0], q[1], q[2]); o.n.push(q[3], q[4], q[5]); o.c.push(q[6], q[7], q[8]); }
      }
    });
  }
  return out.map((o) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(o.p, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(o.n, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(o.c, 3));
    return geo;
  });
}

/**
 * The face's skin: bulging out, with its mouth through the bottom of it and its lips painted on round that, in lots by
 * height (see FACE_LOTS). `back`: the back of it instead, flat, plain, and facing the other way (all the one lot)
 */
function skinGeo(back = false) {
  const ROWS = 30, LIP = 2, pts = [], tris = [], cols = [], c = new THREE.Color(), plain = new THREE.Color(0xefe6d2), lips = new THREE.Color(FACE_PAINT.lip);
  const sc = Math.sin(FACE_ANGLES[FACE_CORNER]); // (how high round the corners of its grin are)
  const at = (i, j) => i * (ROWS + 1) + j;
  for (let i = 0; i <= FACE_NA; i++) {
    const a = FACE_ANGLES[i], r0 = back ? Math.max(mouthEdge(a), wayEdge(a)) : mouthEdge(a), r1 = faceEdge(a);
    // (how full its lips are: the top one fullest over the middle of its mouth, bar the dip in it there, and thinning
    // away to the corners of its grin, and the bottom ones thin, down to the ground)
    const lip = 0.35 + 0.75 * clamp((Math.sin(a) - sc) / (1 - sc), 0, 1) ** 1.5 - 0.25 * Math.exp(-(((a - Math.PI / 2) / 0.06) ** 2));
    for (let j = 0; j <= ROWS; j++) {
      const r = j <= LIP ? r0 + (lip * j) / LIP : r0 + lip + ((r1 - r0 - lip) * (j - LIP)) / (ROWS - LIP);
      const x = r * Math.cos(a), y = r * Math.sin(a);
      pts.push(x, y, back ? 0 : faceBulge(x, y));
      faceSkin(x, y, c);
      cols.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < FACE_NA; i++) {
    for (let j = 0; j < ROWS; j++) tris.push([at(i, j), at(i + 1, j + 1), at(i + 1, j), j < LIP], [at(i, j), at(i, j + 1), at(i + 1, j + 1), j < LIP]);
  }
  const paint = (t, k, out) => (back ? out.copy(plain) : t[3] ? out.copy(lips) : out.fromArray(cols, t[k] * 3));
  return gridGeo(pts, tris, back ? [] : FACE_LOTS, paint, back);
}

/**
 * The inside of its mouth (red), from the edge of it on the face, hollowing out behind its lips and in to the way in, and
 * on along that to the far end (warm, in bands), all facing in
 */
function liningGeo() {
  const T = 4, N = T + FACE_WAY.length, pts = [], tris = [], COLS = [0x9e2430, 0xf8e2a4, 0xf2c871].map((h) => new THREE.Color(h));
  const at = (i, k) => i * N + k;
  for (const a of FACE_ANGLES) {
    const m = mouthEdge(a), w = wayEdge(a), c = Math.cos(a), s = Math.sin(a), z = faceBulge(m * c, m * s);
    for (let j = 0; j < T; j++) {
      const r = m + (w - m) * (j / T) ** 2;
      pts.push(r * c, r * s, z * (1 - j / T));
    }
    for (const z of FACE_WAY) pts.push(w * c, w * s, z);
  }
  for (let i = 0; i < FACE_NA; i++) {
    for (let k = 0; k < N - 1; k++) tris.push([at(i, k), at(i + 1, k), at(i + 1, k + 1), k], [at(i, k), at(i + 1, k + 1), at(i, k + 1), k]);
  }
  return gridGeo(pts, tris, [], (t, _, c) => c.copy(COLS[t[3] < T ? 0 : 1 + ((t[3] - T + 1) % 2)]))[0];
}

/** a tube r round along pts ([x, y, z]s, in order), with a ball on each end (`caps`) */
function faceTube(pts, r, color, seg = 8, caps = true) {
  const path = new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q)), false, 'centripetal');
  const out = [part(new THREE.TubeGeometry(path, pts.length * 2, r, seg, false), color)];
  if (caps) for (const q of [pts[0], pts[pts.length - 1]]) out.push(part(G.sphere(r, seg, Math.ceil(seg / 2) + 1), color, q));
  return out;
}

/**
 * A tooth w wide and h long, the middle of its root at (x, y, z): a block, rounded off at the end (down, or `up`),
 * leaning over by `tilt` (radians, the way round the face's frame turns from x to y), and its front tipped up to the
 * light a little
 */
function faceTooth(x, y, z, w, h, tilt = 0, up = false) {
  const s = up ? 1 : -1, l = h - w / 2, lean = -0.25;
  const dx = -Math.sin(tilt) * s, dy = Math.cos(tilt) * s * Math.cos(lean), dz = Math.cos(tilt) * s * Math.sin(lean); // (from its root to its end)
  return [
    part(G.box(w, l, 0.36), FACE_PAINT.tooth, [x + (dx * l) / 2, y + (dy * l) / 2, z + (dz * l) / 2], [lean, 0, tilt]),
    part(G.cyl(w / 2, w / 2, 0.36, 14), FACE_PAINT.tooth, [x + dx * l, y + dy * l, z + dz * l], [Math.PI / 2 + lean, 0, 0]),
  ];
}

/** an arch of bulbs z along the way in: the rib they're on (into p), and the bulbs, warm, round it clear of the floor (into lit) */
function bulbArch(p, lit, z) {
  const rib = [], ring = [], len = [0];
  for (let i = 0; i <= 80; i++) {
    const a = (i / 80) * Math.PI, r = wayEdge(a);
    rib.push([(r - 0.1) * Math.cos(a), (r - 0.1) * Math.sin(a), z]);
    ring.push([(r - 0.22) * Math.cos(a), (r - 0.22) * Math.sin(a)]);
    if (i) len.push(len[i - 1] + Math.hypot(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1]));
  }
  p.push(...faceTube(rib, 0.07, FACE_PAINT.gold, 6, false));
  // (evenly round it, from one side to the other)
  const L = len[len.length - 1], n = Math.round(L / 0.5);
  for (let k = 0, i = 1; k < n; k++) {
    const s = ((k + 0.5) * L) / n;
    while (len[i] < s) i++;
    const t = (s - len[i - 1]) / (len[i] - len[i - 1]), x = ring[i - 1][0] + (ring[i][0] - ring[i - 1][0]) * t, y = ring[i - 1][1] + (ring[i][1] - ring[i - 1][1]) * t;
    if (y > 0.5) lit.push(part(G.sphere(0.085, 6, 4), k % 2 ? 0xffc46a : 0xfff4c8, [x, y, z]));
  }
}

/** the turnstiles across the way in, z along it: steel posts with a green light on top (into lit), and the arms across the way between them */
function turnstiles(p, lit, z) {
  for (const x of [-2.25, -0.75, 0.75, 2.25]) {
    p.push(part(G.box(0.32, 1, 0.9), 0xa7b0b6, [x, 0.5, z]), part(G.box(0.36, 0.06, 0.94), 0x3a3d40, [x, 1.03, z]));
    lit.push(part(G.sphere(0.06, 6, 4), 0x5aff7a, [x, 1.1, z + 0.32]));
    if (x > 2) continue;
    // (three arms on a tilted hub, the one across the way level)
    const hub = [x + 0.4, 0.92, z];
    p.push(part(G.sphere(0.1, 8, 6), 0x8a9298, hub));
    for (const [dx, dy, dz] of [[1, 0, 0], [-0.5, 0.61, -0.61], [-0.5, -0.61, 0.61]]) {
      p.push(limb(hub, [hub[0] + dx * 0.75, hub[1] + dy * 0.75, hub[2] + dz * 0.75], 0.035, 0.035, 0xd9dde0, 5));
    }
  }
}

/** the park, all lit up, through the far end of the way in (a picture of it, glowing, filling the arch there) */
function parkGlow() {
  const shape = new THREE.Shape();
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI, r = wayEdge(a) - 0.02;
    if (i) shape.lineTo(r * Math.cos(a), r * Math.sin(a)); else shape.moveTo(r * Math.cos(a), r * Math.sin(a));
  }
  const g = new THREE.ShapeGeometry(shape), pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + MOUTH.way) / (2 * MOUTH.way), pos.getY(i) / MOUTH.h);
  const tex = canvasTexture(256, 256, (c, w, h) => {
    const sky = c.createRadialGradient(w / 2, h, 8, w / 2, h * 0.8, w * 0.8);
    sky.addColorStop(0, '#fffbea'); sky.addColorStop(0.45, '#ffe08a'); sky.addColorStop(1, '#ff9a5a');
    c.fillStyle = sky; c.fillRect(0, 0, w, h);
    // (the rides in there, against the glow: the big wheel, and the Wild Mouse's track)
    c.strokeStyle = 'rgba(200, 90, 50, .5)'; c.lineWidth = 3;
    c.beginPath(); c.arc(w * 0.3, h * 0.45, w * 0.19, 0, TAU); c.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      c.beginPath(); c.moveTo(w * 0.3, h * 0.45); c.lineTo(w * 0.3 + Math.cos(a) * w * 0.19, h * 0.45 + Math.sin(a) * w * 0.19); c.stroke();
    }
    c.beginPath(); c.moveTo(w * 0.52, h * 0.8);
    for (let x = 0.52; x <= 1.01; x += 0.02) c.lineTo(w * x, h * (0.56 - 0.13 * Math.sin((x - 0.52) * 13)));
    c.stroke();
    // (and strings of bulbs across, in every colour)
    for (const [y, n] of [[0.16, 22], [0.3, 18]]) {
      for (let i = 0; i < n; i++) {
        c.fillStyle = ['#ff5a4a', '#ffd23a', '#5ab4ff', '#7ad65a', '#ffffff'][i % 5];
        c.beginPath(); c.arc(((i + 0.5) * w) / n, h * (y + 0.05 * Math.sin((i / (n - 1)) * Math.PI)), 3.2, 0, TAU); c.fill();
      }
    }
  });
  return new THREE.Mesh(faceAt(g.translate(0, 0, -MOUTH.deep + 0.03)), new THREE.MeshBasicMaterial({ map: tex }));
}

/**
 * The face, the way in through its mouth, the towers either side of it with LUNA PARK up between them, the walls along
 * the front, and the rides behind
 */
function luna(s, p, world) {
  const { way, h, deep } = MOUTH, F = FACE_PAINT, occluders = [];
  // the face, in lots by height (see FACE_LOTS): each but the lowest (round the sides of its mouth, with its back) goes
  // see-through while it's between the camera and you, on your way in under it
  const lots = skinGeo().map((g) => [g]);
  lots[0].push(...skinGeo(true));
  // its lips, round its mouth: the top one, from one corner of its grin over to the other, and the bottom ones, either
  // side of the way in, from the ground up to them
  const lip = FACE_ANGLES.map((a) => {
    const r = mouthEdge(a) + 0.2, x = r * Math.cos(a), y = r * Math.sin(a);
    return [x, y, faceBulge(x, y) + 0.12];
  });
  const c0 = FACE_CORNER, c1 = FACE_NA - c0;
  lots[0].push(...faceTube(lip.slice(0, c0 + 1), 0.36, F.lip, 10), ...faceTube(lip.slice(c1), 0.36, F.lip, 10));
  lots[1].push(...faceTube(lip.slice(c0, c1 + 1), 0.45, F.lip, 10));
  // its teeth: big ones all along under its top lip, following it round, and one either side at the bottom, clear of the way in
  for (let k = -4; k < 4; k++) {
    const x = (k + 0.5) * 0.88, y = lipTop(x);
    lots[1].push(...faceTooth(x, y + 0.15, faceBulge(x, y) - 0.12, 0.8, 1.5 - Math.abs(k + 0.5) * 0.12, Math.atan(lipSlope(x))));
  }
  for (const k of [-1, 1]) lots[0].push(...faceTooth(k * 2.3, 0, faceBulge(MOUTH.hw, 0) - 0.3, 0.7, 1.1, k * 0.12, true));
  // its nose (the bridge of it its own colour, just standing out)
  const nz = faceBulge(0, 7.4), bridge = faceSkin(0, 8.4, new THREE.Color()).getHex();
  lots[2].push(part(G.sphere(1, 16, 12), F.nose, [0, 7.4, nz + 0.25], [0, 0, 0], [1, 1.05, 0.95]), part(G.sphere(0.45, 10, 8), bridge, [0, 8.4, faceBulge(0, 8.4) - 0.1], [0, 0, 0], [1, 2, 0.6]));
  for (const k of [-1, 1]) lots[2].push(part(G.sphere(0.55, 12, 8), F.nose, [k * 0.78, 6.9, nz - 0.08]));
  // its eyes, wide and blue, looking out at you down the forecourt, and its eyebrows, up
  for (const k of [-1, 1]) {
    const x = k * FACE_EYE.x, y = FACE_EYE.y, z = faceBulge(x, y);
    lots[3].push(
      part(G.sphere(1, 20, 14), 0x3a1a0a, [x, y, z - 0.3], [0, 0, 0], [1.55, 1.92, 0.58]),
      part(G.sphere(1, 20, 14), 0xffffff, [x, y, z - 0.2], [0, 0, 0], [1.4, 1.75, 0.62]),
      part(G.sphere(1, 16, 12), F.iris, [x, y - 0.14, z + 0.27], [0, 0, 0], [0.96, 0.96, 0.28]),
      part(G.sphere(1, 12, 8), 0x111111, [x, y - 0.14, z + 0.45], [0, 0, 0], [0.47, 0.47, 0.14]),
      part(G.sphere(0.19, 8, 6), 0xffffff, [x + 0.3, y + 0.18, z + 0.58]),
    );
    const brow = [[1.25, 13.25], [1.9, 13.75], [2.75, 13.92], [3.6, 13.68], [4.25, 13.1]].map(([bx, by]) => [k * bx, by, faceBulge(k * bx, by) + 0.08]);
    lots[3].push(...faceTube(brow, 0.27, F.brow, 8));
  }
  lots.forEach((l, i) => {
    const m = vcMesh(faceAt(merge(l)), { cast: true }); // (no shadows on it: its teeth white, its cheeks rosy)
    s.add(m);
    if (i) occluders.push(m);
  });
  // round it, a blue band, and behind it the rays of its headdress, red and yellow
  const band = [];
  for (let i = 0; i <= 80; i++) {
    const a = (i / 80) * Math.PI, r = faceEdge(a);
    band.push([r * Math.cos(a), r * Math.sin(a), 0.1]);
  }
  const head = faceTube(band, 0.32, F.blue, 8, false);
  const rim = (f) => 1 / Math.hypot(Math.cos(f) / FACE.rx, Math.sin(f) / FACE.ry); // (the edge of it, from the middle)
  const pt = (f, r) => new THREE.Vector2(Math.cos(f) * r, FACE.y + Math.sin(f) * r);
  const f0 = Math.atan2(-FACE.y, faceEdge(0)) - 0.12, N = 26, df = (Math.PI - 2 * f0) / N;
  for (let k = 0; k < N; k++) {
    const f = f0 + (k + 0.5) * df, long = k % 2 === 0;
    const ray = new THREE.Shape([pt(f - df / 2, rim(f - df / 2) - 0.6), pt(f, rim(f) + (long ? 1.9 : 1.3)), pt(f + df / 2, rim(f + df / 2) - 0.6)]);
    head.push(part(new THREE.ExtrudeGeometry(ray, { depth: 0.36, bevelEnabled: false }), long ? F.red : F.gold, [0, 0, -0.44]));
  }
  p.push(...head.map(faceAt));

  // the way in: outside, its walls and its roof (see-through with you in under them); inside, the lining of it on from
  // its mouth, its floor, tiled, with a red carpet up the middle from out between its lips, arches of bulbs all along,
  // and at the far end, the turnstiles, a sign over them, and through them the park, all lit up
  const shell = [
    part(G.box(2 * way + 1.6, 1.3, deep + 0.6), F.red, [0, h + 0.77, 0.2 - (deep + 0.6) / 2]),
    part(G.box(2 * way + 1.6, h + 1.3, 0.4), 0xefe6d2, [0, (h + 1.3) / 2, -deep - 0.2]),
  ];
  for (const k of [-1, 1]) shell.push(part(G.box(0.8, h + 0.12, deep + 0.6), 0xefe6d2, [k * (way + 0.42), (h + 0.12) / 2, 0.2 - (deep + 0.6) / 2]));
  const walls = vcMesh(faceAt(merge(shell)), { cast: true, receive: true });
  s.add(walls);
  occluders.push(walls);
  const inside = [liningGeo()], lit = [];
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 12; j++) inside.push(part(G.box(way / 4, 0.04, deep / 12), (i + j) % 2 ? 0xc8463c : 0xf2dfb0, [-way + ((i + 0.5) * way) / 4, 0.02, (-(j + 0.5) * deep) / 12]));
  }
  inside.push(part(G.box(2, 0.05, deep + 1.3), 0xd8404c, [0, 0.045, 1.4 - (deep + 1.3) / 2]), part(G.cyl(1, 1, 0.05, 20), 0xd8404c, [0, 0.045, 1.4]));
  for (let k = 0; k < FACE_WAY.length - 1; k++) bulbArch(inside, lit, (FACE_WAY[k] + FACE_WAY[k + 1]) / 2);
  turnstiles(inside, lit, 1.4 - deep);
  for (const k of [-1, 1]) inside.push(limb([k * 1.4, 3.5, 1 - deep], [k * 1.4, h, 1 - deep], 0.025, 0.025, 0x3a3d40, 4));
  s.add(new THREE.Mesh(faceAt(merge(inside)), toonMat({ vertexColors: true, emissive: 0x3a2008 })));
  s.add(new THREE.Mesh(faceAt(merge(lit)), new THREE.MeshBasicMaterial({ vertexColors: true })));
  s.add(parkGlow());
  const fun = signFace(3.4, 0.62, (c, cw, ch) => {
    c.fillStyle = '#c4262a'; c.fillRect(0, 0, cw, ch);
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `bold ${Math.round(ch * 0.62)}px sans-serif`;
    c.fillStyle = '#f2c230'; c.fillText('JUST FOR FUN', cw / 2, ch / 2 + 2);
  });
  fun.position.set(FACE.x + deep - 1, 3.2, FACE.z);
  fun.rotation.y = -Math.PI / 2;
  s.add(fun);
  s.updateMatrixWorld(true);
  for (const m of occluders) world.addOccluder(m);

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
  sign.position.set(FACE.x + 0.6, 20.4, FACE.z);
  sign.rotation.y = -Math.PI / 2;
  s.add(sign);
  p.push(part(G.box(0.5, 3, 18), 0xf6f1e4, [FACE.x + 0.9, 20.4, FACE.z]));
  // the walls along the front, either side, from behind the face's headdress, painted, with bulbs along the top
  const edge = faceEdge(0); // (where the face comes down to the ground, either side)
  for (const [z0, z1] of [[SHEET.z0, FACE.z - edge], [FACE.z + edge, HILL.z]]) {
    p.push(part(G.box(1, 3.2, z1 - z0), 0xf6f1e4, [FACE.x + 1, 1.6, (z0 + z1) / 2]), part(G.box(1.1, 0.5, z1 - z0), 0x2f6fd0, [FACE.x + 1, 3.2, (z0 + z1) / 2]));
    let i = 0;
    for (let z = z0 + 0.5; z < z1; z += 0.9) p.push(part(G.sphere(0.13, 5, 4), [0xfff0a0, 0xff9a8a, 0xa0d8ff][i++ % 3], [FACE.x + 0.45, 3.55, z]));
  }
  // behind: Coney Island, the carousel, the Wild Mouse (clear of the way in)
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
    loop.push([143 + Math.cos(a) * 8.5, 5 + 3.5 * Math.sin(a * 3) + 2.5 * Math.cos(a), -34 + Math.sin(a) * 6.5]);
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
  const trees = [[-30, -22, 7.5], [-18, -44, 8], [6, -16, 7], [22, -46, 7.5], [36, -24, 8], [-38, -38, 7], [-2, -42, 6.5], [38, -45, 6], [-79.5, -32, 6], [-79.5, 16, 6.5]];
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
  near.push(part(G.box(SHEET.x1 - PARK.x0, 2.1, 0.6), 0xb9a27a, [(PARK.x0 + SHEET.x1) / 2, -1, SHEET.z0 + 0.3]));
  near.push(part(G.box(0.6, 2.1, HILL.z - SHEET.z0), 0xb9a27a, [SHEET.x1 - 0.3, -1, (HILL.z + SHEET.z0) / 2]));
  railing(near, PARK.x0, SHEET.z0 + 0.5, SHEET.x1, SHEET.z0 + 0.5, 0);
  railing(near, SHEET.x1 - 0.4, SHEET.z0 + 0.5, SHEET.x1 - 0.4, HILL.z, 0);
  paths(near);

  // --- the station, the line's viaduct (and the road's), the portal they go in at, and the hill behind Luna Park
  station(near);
  viaduct(near);
  hill(near);
  const dark = new THREE.MeshBasicMaterial({ color: 0x0a0a0c });
  for (const [a, b, h] of portal(near)) {
    // (the tunnels: dark all the way in, so she's gone once she's in hers)
    const m = new THREE.Mesh(new THREE.BoxGeometry(b - a, h - LINE.deck, 60), dark);
    m.position.set((a + b) / 2, (h + LINE.deck) / 2, LINE.portal + 30.05);
    s.add(m);
  }
  near.push(...platformSigns(s));
  for (const z of SIGNS) for (const dx of [-1.9, 1.9]) round.push([SIGN_X + dx, z, 0.15]);
  for (const x of FOOT) round.push([x, STAIRS.z0, 0.55]);
  // (the park's railing along Alfred Street, on its kerb, and the garden bed beside the stairs)
  near.push(part(G.box(HILL.x - BED.x0, 0.5, 0.45), SAND2, [(HILL.x + BED.x0) / 2, 0.25, PARK.z1 + 0.22]));
  railing(near, BED.x0, PARK.z1 + 0.22, HILL.x, PARK.z1 + 0.22, 0.5);
  near.push(part(G.box(BED.x1 - BED.x0, 0.45, BED.z1 - BED.z0), SAND2, [(BED.x0 + BED.x1) / 2, 0.22, (BED.z0 + BED.z1) / 2]));
  near.push(part(G.box(BED.x1 - BED.x0 - 0.4, 0.06, BED.z1 - BED.z0 - 0.4), 0x5b4632, [(BED.x0 + BED.x1) / 2, 0.45, (BED.z0 + BED.z1) / 2]));
  for (let z = BED.z0 + 1; z < BED.z1 - 0.6; z += 1.5) {
    const x = (BED.x0 + BED.x1) / 2 + rand(-0.5, 0.5);
    near.push(part(G.ico(rand(0.55, 0.85), 0), pick([0x3f6b35, 0x4d7a3a, 0x355f30]), [x, 0.85, z], [0, rand(0, 3), 0], [1, 0.8, 1]));
    if (Math.random() < 0.6) near.push(part(G.sphere(0.2, 6, 4), pick([0x6a5acd, 0x7b68ee, 0xf6f1e4]), [x + rand(-0.6, 0.6), 1.35, z + rand(-0.5, 0.5)]));
  }

  // --- the park: lamps along the paths, benches, and a bin or two (see main.js)
  const lamp = lampGeo();
  for (const [x, z] of [[-30, -14], [-16, -34], [-6, -46], [4, -32], [26, -38], [-30, -50], [-6, -50], [18, -50], [42, -50], [62, -46], [84, -46], [106, -46], [-36, -32.6], [-50.5, -40]]) {
    near.push(lamp.clone().translate(x, 0, z));
    round.push([x, z, 0.2]);
  }
  for (const z of [-10, 13, 28]) {
    near.push(lamp.clone().translate(PLAT.x1 - 0.45, PLAT.y, z));
    round.push([PLAT.x1 - 0.45, z, 0.2]);
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
  for (const z of [3, 23]) {
    // (and on the platform, along the back of it, looking out at the line)
    const b = vcMesh(bench.clone(), { cast: true, receive: true }), x = PLAT.x1 - 0.7;
    b.position.set(x, PLAT.y, z);
    b.rotation.y = -Math.PI / 2;
    s.add(b);
    for (const k of [-0.6, 0.6]) round.push([x, z + k, 0.45]);
    seats.push({ obj: b, perches: backs });
  }
  bench.dispose();
  // (the chips the gulls are at, on the boardwalk)
  const chips = chipsGeo();
  for (const [x, z] of LUNA_GULLS) near.push(chips.clone().translate(x - OX, 0, z));
  chips.dispose();

  // --- Luna Park: the face, the towers, the walls, the rides behind, the bulbs along the forecourt and a ticket box
  luna(s, near, world);
  festoons(near);
  for (const z of [-48, -20]) for (let x = 60; x < FACE.x - 4; x += 9) round.push([x, z, 0.2]);
  near.push(part(G.box(2.4, 2.6, 2.4), 0xe8403a, [116, 1.3, -45]), part(G.box(2.5, 0.9, 2.5), 0xf6f1e4, [116, 1.9, -45]), part(G.cone(2, 1.6, 4), 0x2f6fd0, [116, 3.4, -45], [0, Math.PI / 4, 0]));
  round.push([116, -45, 1.5]);
  const big = wheel(s);

  // --- and all round: the Bridge, the city over the water (and the Opera House), and our side of the harbour
  bridge(far);
  const cars = traffic(s);
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
      cars(dt);
      big.w.rotation.x = t * 0.09;
      for (const c of big.cars) c.rotation.x = -big.w.rotation.x;
      // (she slows right down at either end, as if she's pulling in somewhere)
      const u = Math.sin(t * 0.03);
      ferry.position.set(-60 + 190 * u, 0.3 + Math.sin(t * 0.9) * 0.05, -150);
      ferry.rotation.x = Math.sin(t * 0.7) * 0.01;
    },
  };
}
