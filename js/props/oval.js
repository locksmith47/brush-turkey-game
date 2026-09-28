import * as THREE from 'three';
import { part, merge, vcMesh, G, limb, rand, pick, TAU, canvasTexture, toonMat } from '../util.js';
import { picketGeo, wireGeo, wireMat, placeAlong } from './fences.js';

/*
 * The oval. You come in from the city at the near end, by the oval's own mound, but the left of the ground's
 * shut off: the members' stand is across it, with the players' race (the caged-in lane the players run out
 * down) from it to the field. The way on is round to the right, past the plovers' nests and a snake or two,
 * and up behind the grandstand, which is hard up against the field on the far side: the players' tunnel
 * through the middle of it takes you out onto the field (Kev's ride-on mower is parked at the back of it).
 * Beat Big Kev for his key rake, and the way out is the gap in the fence on the far left, straight down from
 * the gate to the beach. The field's white picket fence keeps you out bar those two ways (you can throw over it,
 * mind), and the gate in it at the near end is latched on the field side: once you're on the field you can let
 * yourself out of it, a shortcut back to the mound. Turkeys can sit in either stand, and on the mower.
 */
const CX = 0, CZ = -262; // centre of the oval
const RX = 28, RZ = 24; // (the fence round the field: an ellipse)
const ell = (a) => [CX + RX * Math.cos(a), CZ + RZ * Math.sin(a)];
const NEAR = Math.asin(4 / RX); // (the gate at the near end: 8 m across)
const NEAR_Z = CZ + RZ * Math.cos(NEAR);
const OUT = Math.PI + Math.acos(16 / RX); // (the way out, on the far left: straight down from the beach gate)
const OUT_HW = 6 / Math.hypot(RX * Math.sin(OUT), RZ * Math.cos(OUT)); // (half its width, as an angle round the fence: 12 m across, room for the key)
// the stands, both from z = STAND_N to STAND_S: the members' on the left, its front on x = LEFT_X, and the
// grandstand on the right, its front on x = RIGHT_X, with a straight bit of the field's fence along in front of
// it (on x = RIGHT_FENCE). The tunnel through the grandstand is TUN either side of the middle, the players' race
// RACE either side
const STAND_N = -276, STAND_S = -248;
const LEFT_X = -38, LEFT_D = 8, RIGHT_X = 28.4, RIGHT_D = 8.6, RIGHT_FENCE = 28;
const BACK = RIGHT_X + RIGHT_D; // (the back of the grandstand: the way up to the tunnel runs along behind it)
const TUN = 3, RACE = 1.2;
const A_R = Math.asin((STAND_S - CZ) / RZ); // (where the fence round the field meets the straight bit in front of the grandstand)
export const FIELD_GATE = { a: [CX - 4, NEAR_Z], b: [CX + 4, NEAR_Z], latch: [0, -1], kind: 'picket' };
// the lie of the land (see Track): open ground, bar the stands and the players' race, with the fences as walls
// (and guides a way into the way out). The near side is one room and the far side another; then the field, and
// the ground either side of it between the stands (in two, the race between them), the way up behind the
// grandstand, and the tunnel. Waypoints at the gates and the tunnel's ends, and round the outside of the field
export const FIELD = {
  nodes: {
    in: [-20, -226], gs: [CX, NEAR_Z], se: [31, -238], se2: [41.5, -243], back: [41, -252], tunE: [41, CZ], tunW: [24, CZ],
    out: ell(OUT), nw: [-32, -279], n: [CX, -294], ne: [38, -288],
  },
  rooms: [
    { rect: [-46, STAND_S, 46, -220], nodes: ['in', 'gs', 'se', 'se2'] },
    { rect: [-46, -300, 46, STAND_N], nodes: ['out', 'nw', 'n', 'ne'] },
    { rect: [CX - RX + 0.5, -300, RIGHT_FENCE, -220], nodes: ['in', 'gs', 'tunW', 'out', 'n'] },
    { rect: [LEFT_X, CZ + RACE, RIGHT_FENCE, -220], nodes: ['in', 'gs'] },
    { rect: [LEFT_X, -300, RIGHT_FENCE, CZ - RACE], nodes: ['out', 'nw', 'n'] },
    { rect: [BACK, -300, 46, -220], nodes: ['se2', 'back', 'tunE', 'ne'] },
    { rect: [20, CZ - TUN, 46, CZ + TUN], nodes: ['tunW', 'tunE'] },
  ],
};
// the fence's three stretches round the field, between the near gate, the way out and the straight bit in front of
// the grandstand: [from, to] (angles round it), and how far guides reach into the gap at either end
const ARCS = [
  [A_R, Math.PI / 2 - NEAR, 0, 0.7 * NEAR],
  [Math.PI / 2 + NEAR, OUT - OUT_HW, 0.7 * NEAR, 0.7 * OUT_HW],
  [OUT + OUT_HW, 2 * Math.PI - A_R, 0.7 * OUT_HW, 0],
];
// the oval's own mound, by the way in (it's got a bit of the kit in it already)
export const OVAL_MOUND = [-34, -232];
// the stumps at either end of the pitch (turkeys can dig them up); a pair of plovers on each nest and snakes in
// the grass on the way round to the right (and one up behind the grandstand); a funnel-web's burrow out past the
// way out; and cricket gear left lying about: plenty by the mound, bits and pieces all over, and the team's kit
// piled up at the end of the grandstand
export const STUMPS = [[CX, CZ - 9.2], [CX, CZ + 9.2]];
export const PLOVER_NESTS = [[-6, -231], [22, -240]];
export const OVAL_SNAKES = [[9, -225], [39.5, -246]];
export const OVAL_SPIDER = [-36, -290];
export const CRICKET_KIT = [
  ['bat', -26, -241], ['ball', -24, -233.5], ['gloves', -41, -242], ['cap', -29, -224], ['helmet', -12, -237],
  ['ball', 5, -233], ['pads', 13, -229], ['ball', 27, -236],
  ['kitbag', 32, -246.2], ['cooler', 35.5, -246], ['bat', 30.2, -244.8], ['pads', 34, -244], ['helmet', 36.6, -244.4],
  ['bat', 2.6, -251], ['helmet', -2.2, -251.8], ['pads', -2.5, -273.5], ['gloves', 2.8, -273], ['ball', 11, -247], ['ball', -13, -280],
  ['cap', 9, -296], ['ball', -31, -287],
];
// bins by Kev's shed and at the end of the members' stand (tip them over for what's inside): [kind, x, z, facing]
export const OVAL_BINS = [
  ['red', 38.6, -222.3, 0.1], ['yellow', 40.3, -222.1, -0.1], ['green', 45, -231.2, -Math.PI / 2],
  ['green', -44, -243.5, Math.PI / 2], ['red', -44, -245.1, Math.PI / 2],
];
// Big Kev's ride-on mower, parked at the back of the tunnel, pointing the way in (see Toys): [x, z, facing]
export const MOWER = [43.4, -254, -2.47];

function put(world, geo, x, z, rotY = 0, colliders = []) {
  const m = vcMesh(geo, { cast: true, receive: true });
  m.position.set(x, 0, z);
  m.rotation.y = rotY;
  world.scene.add(m);
  for (const [cx, cz, r] of colliders) world.colliders.push({ x: x + cx, z: z + cz, r });
  return m;
}

function autumnTree(h) {
  const p = [limb([0, 0, 0], [0.1, h * 0.55, 0], 0.3, 0.22, 0x8a7a6a, 8)];
  const cols = [0xd9602b, 0xe8a33d, 0xc0392b, 0xf2c14e, 0xd2691e];
  for (let i = 0; i < 8; i++) {
    const a = rand(0, TAU), r = rand(0.3, 1.8);
    p.push(part(G.ico(rand(1.0, 1.5), 1), pick(cols), [Math.cos(a) * r, h * 0.55 + rand(0.6, 2.4), Math.sin(a) * r], [rand(0, 3), rand(0, 3), 0], [1, 0.8, 1]));
  }
  return merge(p);
}

/** a chain-wire fence from (ax, az) to (bx, bz) */
function wire(world, ax, az, bx, bz, height) {
  const g = wireGeo(Math.hypot(bx - ax, bz - az), { height });
  for (const m of [vcMesh(g.frame, { cast: true }), new THREE.Mesh(g.mesh, wireMat())]) world.scene.add(placeAlong(m, ax, az, bx, bz));
}

/* ---------------------------------------------------------------- the stands */
const ROWS = 5, TREAD = 1.25, RISE = 0.55, STEP0 = 0.7, ROW0 = 0.3; // (the tiers: how deep each is, how much higher than the last, the first one's height, and how far back from the front it starts)
const TOP = STEP0 + ROWS * RISE, Z_TOP = ROW0 + ROWS * TREAD, H_BACK = TOP + 1.7; // (the walkway along the top, and the wall behind it)
const SEAT = 0.62; // (seat to seat, along a row)
const ROOF0 = 2.6, TILT = 0.06; // (the roof comes out this far from the front, tipped up a touch)
const CONCRETE = [0xd3cec3, 0xc6c1b5], STEPS = 0xe2ddd2;

/**
 * A block of seating `len` long and `depth` deep, facing -z: a low wall along the front (z = 0), tiers of seats
 * stepping up from there to a walkway along the top, a wall across the back, and a roof over the back of it.
 * `aisles` ([x, half-width]) have steps up between the seats; `gate` (the same) is a gap in the front wall with
 * steps down to the ground. Returns the geometry, and where turkeys can sit: every other seat, each hopped up to
 * from the grass in front of the stand (see Perches), higher and higher up the rows
 */
function standGeo(len, depth, { seat, trim, wall, roof, aisles = [], gate = null }) {
  const p = [], perches = [], hl = len / 2;
  const clear = (x) => aisles.every(([ax, aw]) => Math.abs(x - ax) > aw + 0.32);
  const front = gate ? [[-hl, gate[0] - gate[1]], [gate[0] + gate[1], hl]] : [[-hl, hl]];
  for (const [a, b] of front) {
    p.push(part(G.box(b - a, 0.95, ROW0), wall, [(a + b) / 2, 0.475, ROW0 / 2]));
    p.push(part(G.box(b - a, 0.1, ROW0 + 0.02), trim, [(a + b) / 2, 0.8, ROW0 / 2]));
  }
  if (gate) for (let s = 0; s < 3; s++) p.push(part(G.box(gate[1] * 2, (STEP0 * (s + 1)) / 3, 0.3), STEPS, [gate[0], (STEP0 * (s + 1)) / 6, 0.15 - 0.3 * (2 - s)]));
  for (let r = 0; r < ROWS; r++) {
    const y = STEP0 + r * RISE, z = ROW0 + r * TREAD;
    p.push(part(G.box(len, y, TREAD), CONCRETE[r % 2], [0, y / 2, z + TREAD / 2]));
    for (const [ax, aw] of aisles) p.push(part(G.box(aw * 2, y + RISE / 2, TREAD / 2), STEPS, [ax, (y + RISE / 2) / 2, z + TREAD * 0.75])); // (a step halfway up)
    for (let x = -hl + 0.55, k = 0; x <= hl - 0.5; x += SEAT, k++) {
      if (!clear(x)) continue;
      p.push(
        part(G.box(0.5, 0.07, 0.42), seat, [x, y + 0.42, z + 0.42]),
        part(G.box(0.5, 0.4, 0.06), seat, [x, y + 0.66, z + 0.66], [0.12, 0, 0]),
        part(G.box(0.07, 0.38, 0.07), 0x6f7478, [x, y + 0.2, z + 0.42]),
      );
      if ((k + r) % 2 || (gate && Math.abs(x - gate[0]) < gate[1] + 1)) continue; // (not over the race)
      perches.push({ at: [x, y + 0.455, z + 0.42], face: Math.PI, ground: [x, -1.8], hop: [0.42 + r * 0.09, 0.75 + r * 0.2] });
    }
  }
  p.push(part(G.box(len, TOP, depth - 0.3 - Z_TOP), CONCRETE[ROWS % 2], [0, TOP / 2, (Z_TOP + depth - 0.3) / 2]));
  p.push(part(G.box(len, H_BACK, 0.3), wall, [0, H_BACK / 2, depth - 0.15]));
  p.push(part(G.box(len + 0.02, 0.3, 0.32), trim, [0, H_BACK - 0.5, depth - 0.15]));
  // (round the back, which is what you see on the way past: a plinth, and a pier every few metres up to the stripe)
  p.push(part(G.box(len + 0.02, 0.6, 0.36), CONCRETE[1], [0, 0.3, depth - 0.15]));
  const bays = Math.max(2, Math.round(len / 3.6));
  for (let i = 0; i <= bays; i++) p.push(part(G.box(0.4, H_BACK - 0.65, 0.2), CONCRETE[0], [-hl + 0.2 + (i * (len - 0.4)) / bays, (H_BACK - 0.65) / 2, depth + 0.1]));
  // screens at either end, stepping up with the tiers
  const end = new THREE.Shape([[0, 0], [0, 1.3], [Z_TOP, TOP + 1.2], [depth, H_BACK], [depth, 0]].map(([a, b]) => new THREE.Vector2(a, b)));
  for (const x of [-hl, hl - 0.3]) p.push(part(new THREE.ExtrudeGeometry(end, { depth: 0.3, bevelEnabled: false }), wall, [x + 0.3, 0, 0], [0, -Math.PI / 2, 0]));
  p.push(...roofGeo(len, depth, roof, trim));
  return { geo: merge(p), perches };
}

/** the roof over the back of a stand `len` long (see standGeo), with a stripe along its front edge */
function roofGeo(len, depth, roof, trim) {
  const rl = depth + 0.4 - ROOF0, ry = H_BACK + 0.25;
  return [
    part(G.box(len + 0.4, 0.16, rl), roof, [0, ry, ROOF0 + rl / 2], [TILT, 0, 0]),
    part(G.box(len + 0.44, 0.34, 0.1), trim, [0, ry + (rl / 2) * Math.sin(TILT), ROOF0], [TILT, 0, 0]),
  ];
}

/** a signpost pointing the way to the players' tunnel (off to the left of it), 3.2 m wide */
function tunnelSign() {
  const tex = canvasTexture(512, 128, (c, w, h) => {
    c.fillStyle = '#1f3f7a'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#ffd21f'; c.lineWidth = 6; c.strokeRect(6, 6, w - 12, h - 12);
    c.fillStyle = '#ffd21f';
    c.beginPath(); c.moveTo(24, h / 2); c.lineTo(70, h / 2 - 32); c.lineTo(70, h / 2 - 13); c.lineTo(112, h / 2 - 13);
    c.lineTo(112, h / 2 + 13); c.lineTo(70, h / 2 + 13); c.lineTo(70, h / 2 + 32); c.closePath(); c.fill();
    c.fillStyle = '#ffffff'; c.font = 'bold 46px sans-serif'; c.textBaseline = 'middle';
    c.fillText("PLAYERS' TUNNEL", 128, h / 2 + 2);
  });
  const g = new THREE.Group();
  const board = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), toonMat({ map: tex }));
  board.position.y = 2.5;
  g.add(board, vcMesh(merge([part(G.box(3.3, 0.9, 0.08), 0x1f3f7a, [0, 2.5, -0.05]), part(G.cyl(0.06, 0.06, 2.9, 8), 0x8f969c, [0, 1.45, -0.1])])));
  return g;
}

export function buildOval(world) {
  const s = world.scene, track = world.tracks[3];

  // mowing rings, the pitch and the boundary rope
  const ground = [];
  for (let i = 9; i >= 1; i--) {
    ground.push(part(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), i % 2 ? 0x86c457 : 0x78b64b, [CX, 0.01 + (10 - i) * 0.001, CZ], [0, 0, 0], [i * 2.85, 1, i * 2.45]));
  }
  ground.push(part(new THREE.PlaneGeometry(3, 20).rotateX(-Math.PI / 2), 0xcdb982, [CX, 0.025, CZ]));
  for (const dz of [-8.8, 8.8]) ground.push(part(new THREE.PlaneGeometry(2.6, 0.08).rotateX(-Math.PI / 2), 0xffffff, [CX, 0.03, CZ + dz]));
  s.add(vcMesh(merge(ground), { cast: false, receive: true }));
  const rope = new THREE.Mesh(new THREE.TorusGeometry(25.8, 0.07, 4, 160).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  rope.scale.set(1, 1, 22.3 / 25.8);
  rope.position.set(CX, 0.06, CZ);
  s.add(rope);

  // the picket fence round the field: you can't get through it (bar the tunnel and the way out), but you can
  // throw over it. It runs straight along in front of the grandstand, with a gap for the tunnel
  const pickets = [], posts = [];
  const fence = (ax, az, bx, bz, guide = false) => {
    if (!guide) {
      const g = picketGeo(Math.hypot(bx - ax, bz - az));
      g.rotateY(-Math.atan2(bz - az, bx - ax));
      g.translate(ax, 0, az);
      pickets.push(g);
      world.addSegment(ax, az, bx, bz, 0.1, false);
    }
    track.addWall({ ax, az, bx, bz, active: true, guide }, false);
  };
  const post = ([x, z], h = 1.45) => posts.push(part(G.box(0.18, h, 0.18), 0xf7f7f2, [x, h / 2, z]), part(G.cone(0.14, 0.16, 4), 0xf7f7f2, [x, h + 0.08, z], [0, Math.PI / 4, 0]));
  const along = (a0, a1, guide = false) => {
    const n = Math.max(1, Math.ceil((a1 - a0) / 0.1));
    for (let i = 0; i < n; i++) fence(...ell(a0 + ((a1 - a0) * i) / n), ...ell(a0 + ((a1 - a0) * (i + 1)) / n), guide);
  };
  for (const [a0, a1, g0, g1] of ARCS) {
    along(a0, a1);
    if (g0) along(a0 - g0, a0, true);
    if (g1) along(a1, a1 + g1, true);
    post(ell(a0));
    post(ell(a1));
  }
  const [sx, sz] = ell(A_R), [nx, nz] = ell(-A_R), straight = [[sx, sz], [RIGHT_FENCE, sz], [RIGHT_FENCE, CZ + TUN], [RIGHT_FENCE, CZ - TUN], [RIGHT_FENCE, nz], [nx, nz]];
  for (const [a, b] of [[0, 1], [1, 2], [3, 4], [4, 5]]) fence(...straight[a], ...straight[b]);
  for (const p of straight.slice(1, 5)) post(p);

  // the players' race, from the gate in the members' stand down to the field: caged in with chain-wire all the
  // way to the picket fence (it's not open ground at all: see FIELD)
  const rx = CX - RX * Math.sqrt(1 - (RACE / RZ) ** 2); // (where it meets the picket fence)
  for (const z of [CZ - RACE, CZ + RACE]) {
    wire(world, LEFT_X, z, rx, z, 2.1);
    world.addSegment(LEFT_X - 0.5, z, rx + 0.3, z, 0.1, true);
    track.addWall({ ax: LEFT_X - 0.5, az: z, bx: rx + 0.3, bz: z, active: true }, false);
    post([rx, z], 1.6);
  }
  s.add(vcMesh(part(G.box(rx - LEFT_X, 0.03, RACE * 2), 0xbdb8ad, [(LEFT_X + rx) / 2, 0.015, CZ]), { cast: false, receive: true }));
  // and up behind the grandstand, the way on stops at the tunnel: another chain-wire fence across from the back of
  // the stand to the side of the ground
  wire(world, BACK, CZ - TUN, 46.3, CZ - TUN, 2.4);
  world.addSegment(BACK - 0.3, CZ - TUN, 47, CZ - TUN, 0.1, true);
  track.addWall({ ax: BACK - 0.3, az: CZ - TUN, bx: 47, bz: CZ - TUN, active: true }, false);
  // (and all down both sides of the ground: decoration, the bounds stop you anyway)
  for (const x of [-46.3, 46.3]) wire(world, x, -220.3, x, -299.7, 2.4);
  track.plan();
  s.add(vcMesh(merge([...pickets, ...posts]), { cast: true, receive: true }));

  // the members' stand on the left (its steps come down in the middle to the players' race), and the grandstand
  // on the right, in two halves either side of the tunnel. Turkeys come and sit in them (see Perches)
  const stands = [];
  const stand = (x, z, len, depth, rotY, look) => {
    const { geo, perches } = standGeo(len, depth, look);
    const m = vcMesh(geo, { cast: true, receive: true });
    m.position.set(x, 0, z);
    m.rotation.y = rotY;
    s.add(m);
    world.addOccluder(m);
    stands.push({ obj: m, perches });
  };
  stand(LEFT_X, CZ, STAND_S - STAND_N, LEFT_D, -Math.PI / 2, {
    seat: 0x2e7d4f, trim: 0xf2c14e, wall: 0xefe9da, roof: 0x3d6b4b, aisles: [[-7, 0.6], [0, RACE], [7, 0.6]], gate: [0, RACE],
  });
  const grand = { seat: 0x2f6fb0, trim: 0xffd21f, wall: 0xe8e4da, roof: 0xd4d6d8, aisles: [[0, 0.6]] };
  const half = (STAND_S - STAND_N) / 2 - TUN;
  for (const side of [-1, 1]) stand(RIGHT_X, CZ + side * (TUN + half / 2), half, RIGHT_D, Math.PI / 2, grand);
  // the players' tunnel: concrete underfoot, the roof carrying on over the back of it (and the back wall over the
  // way in), and a sign pointing the way
  const tunnel = vcMesh(merge([
    part(G.box(TUN * 2, 0.04, RIGHT_D + 0.4), 0xbdb8ad, [0, 0.02, RIGHT_D / 2]),
    part(G.box(TUN * 2 + 0.2, 1.3, 0.4), grand.wall, [0, H_BACK - 0.65, RIGHT_D - 0.2]),
    part(G.box(TUN * 2 + 0.2, 0.3, 0.42), grand.trim, [0, H_BACK - 0.5, RIGHT_D - 0.2]),
    ...roofGeo(TUN * 2 - 0.8, RIGHT_D, grand.roof, grand.trim),
  ]), { cast: true, receive: true });
  tunnel.position.set(RIGHT_X, 0, CZ);
  tunnel.rotation.y = Math.PI / 2;
  s.add(tunnel);
  world.addOccluder(tunnel);
  const sign = tunnelSign();
  sign.position.set(44.3, 0, CZ + 2.8);
  s.add(sign);
  world.colliders.push({ x: 44.3, z: CZ + 2.7, r: 0.15 });
  // (the grass worn bare along the way up to it, and through it)
  for (const [x, z] of [[41, -238], [41, -244], [41, -250], [41, -256], [40, -262], [34, -262], [27, -262]]) world.stainGround(x, z, 2.6, 0x9c8a5f, 0.3);

  // the plovers' nests: a scrape in the grass, with a clutch of speckled eggs
  const nest = [part(G.cyl(0.42, 0.46, 0.04, 14), 0xb09a64, [0, 0.015, 0])];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    nest.push(part(G.box(0.2, 0.03, 0.04), pick([0xc8b476, 0xa8925a, 0xd6c48a]), [Math.cos(a) * 0.38, 0.04, Math.sin(a) * 0.38], [0, -a + rand(-0.4, 0.4), 0]));
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.4, x = Math.cos(a) * 0.1, z = Math.sin(a) * 0.1;
    nest.push(part(G.sphere(1, 10, 8), 0x8d8a55, [x, 0.07, z], [Math.PI / 2 - 0.3, a, 0], [0.055, 0.075, 0.055]));
    for (let k = 0; k < 5; k++) nest.push(part(G.sphere(0.012, 5, 4), 0x3d3222, [x + rand(-0.04, 0.04), 0.1 + rand(-0.02, 0.02), z + rand(-0.04, 0.04)]));
  }
  const nestGeo = merge(nest);
  for (const [x, z] of PLOVER_NESTS) put(world, nestGeo, x, z, rand(0, TAU));

  // sightscreens behind each end
  const screen = merge([
    part(G.box(7, 3, 0.2), 0xf5f5f5, [0, 2.1, 0]),
    part(G.box(0.2, 0.8, 0.2), 0x9a9a9a, [-3, 0.4, 0]),
    part(G.box(0.2, 0.8, 0.2), 0x9a9a9a, [3, 0.4, 0]),
  ]);
  put(world, screen, CX, -228, 0, [[-2.6, 0, 0.8], [0, 0, 0.8], [2.6, 0, 0.8]]);
  put(world, screen, CX, -289.5, 0, [[-2.6, 0, 0.8], [0, 0, 0.8], [2.6, 0, 0.8]]);

  // the scoreboard, up over the back of the members' stand (outside the play area)
  const board = canvasTexture(256, 128, (c, w, h) => {
    c.fillStyle = '#1d2b1d'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#f5f0d8'; c.font = 'bold 26px monospace';
    c.fillText('TURKEYS  0/0', 18, 44);
    c.fillText('IBISES   ---', 18, 80);
    c.fillStyle = '#ffd21f'; c.fillText('OVERS  20.0', 18, 114);
  });
  const sb = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 0.6), [toonMat({ color: 0x1d2b1d }), toonMat({ color: 0x1d2b1d }), toonMat({ color: 0x1d2b1d }), toonMat({ color: 0x1d2b1d }), toonMat({ map: board }), toonMat({ color: 0x1d2b1d })]);
  sb.position.set(-54, 7, CZ - 6);
  sb.rotation.y = Math.PI / 2;
  s.add(sb);
  s.add(vcMesh(merge([part(G.box(0.4, 5, 0.4), 0x5a5a5a, [-54, 2.5, CZ - 9]), part(G.box(0.4, 5, 0.4), 0x5a5a5a, [-54, 2.5, CZ - 3])])));

  // autumn trees shedding red & gold leaves
  for (const [x, z] of [[-41, -228], [10, -223], [44, -236], [-43, -283], [-26, -296], [40, -297], [26, -294]]) {
    const h = rand(5, 6.5);
    const m = vcMesh(autumnTree(h));
    m.position.set(x, 0, z);
    world.addSway(m);
    s.add(m);
    world.colliders.push({ x, z, r: 0.45 });
    world.treeSpots.push({ x, z, h: h + 2, palette: 'autumn' });
    world.stainGround(x, z, 4.5, 0xc0703a, 0.35);
  }

  // Kev's shed, in the corner on the way round (his mower's parked up behind the grandstand: see Toys)
  put(world, merge([
    part(G.box(5, 2.8, 3.6), 0xb0a080, [0, 1.4, 0]),
    part(G.box(5.4, 0.15, 4.2), 0x6d6d6d, [0, 2.95, 0], [0.1, 0, 0]),
    part(G.box(2, 2.2, 0.06), 0x5d7a5a, [0.8, 1.1, 1.82]),
    part(G.box(0.9, 0.6, 0.06), 0x9fd0ee, [-1.4, 1.8, 1.82]),
  ]), 42.5, -226, -Math.PI / 2, [[0, -1.6, 1.9], [0, 1.6, 1.9]]);

  return { stands };
}
