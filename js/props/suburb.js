import * as THREE from 'three';
import { part, merge, vcMesh, G, limb, rand, pick, TAU } from '../util.js';
import { palingGeo, placeAlong } from './fences.js';

const Z0 = -38, Z1 = -98;

/*
 * The backyards are six yards in two rows, paling fences between them. You come in from the bush into the
 * back lawn (the middle of the near row), and the gate out to the city is in the middle of the far row,
 * with the key off in the yard to its left. There's no straight way through: round to the left (the
 * barbecue yard, then the key's yard) or round to the right (the shed, then the trampoline), each yard with
 * its own locals. The side gate between the two middle yards is latched on the far side, so once you've
 * made it round, you can let yourself back through it: a shortcut home.
 */
const XW = -15, XE = 15, ZM = -68; // (the fences: two running away from you, and one across the middle)
// the open gateways between yards: [name, x, z, width] (on the fence line through that spot)
const DOORS = [
  ['s_sw', XW, -53, 6], ['s_se', XE, -47, 6], ['sw_nw', -33, ZM, 6], ['se_ne', 35, ZM, 6],
  ['nw_n', XW, -84, 8], // (wide enough to get the key through)
  ['ne_n', XE, -89, 6],
];
// the latched side gate from the back lawn to the far yard ([x, z] ends; it opens from the latch side)
export const SIDE_GATE = { a: [-4, ZM], b: [2, ZM], latch: [0, -1], kind: 'painted' };

// each yard: its name, the ground it covers ([x0, z0, x1, z1]), its gateways, and its lawn's two stripes
const YARDS = [
  ['sw', [-46, ZM, XW, Z0], ['s_sw', 'sw_nw'], [0x86bd52, 0x78ae48]],
  ['s', [XW, ZM, XE, Z0], ['s_sw', 's_se', 's_n'], [0x8cc458, 0x7db44c]],
  ['se', [XE, ZM, 46, Z0], ['s_se', 'se_ne'], [0x90c65c, 0x80b64e]],
  ['nw', [-46, Z1, XW, ZM], ['sw_nw', 'nw_n'], [0x7aa94a, 0x6c9c40]],
  ['n', [XW, Z1, XE, ZM], ['nw_n', 'ne_n', 's_n'], [0x8cc458, 0x7db44c]],
  ['ne', [XE, Z1, 46, ZM], ['se_ne', 'ne_n'], [0x88c056, 0x79b04a]],
];

// the lie of the land (see Track): each yard's a room (overlapping its neighbours a little over the fence),
// with a waypoint in every gateway, and another room straddling each gateway (so anything big on its way
// through, like the key, is always well inside one or the other); the fences are walls
const GAPS = [...DOORS, ['s_n', (SIDE_GATE.a[0] + SIDE_GATE.b[0]) / 2, ZM, SIDE_GATE.b[0] - SIDE_GATE.a[0]]];
export const BACKYARDS = {
  nodes: Object.fromEntries(GAPS.map(([name, x, z]) => [name, [x, z]])),
  rooms: [
    ...YARDS.map(([, [x0, z0, x1, z1], nodes]) => ({ rect: [x0 - 0.5, z0 - 0.5, x1 + 0.5, z1 + 0.5], nodes })),
    ...GAPS.map(([name, x, z, w]) => {
      const d = Math.max(3, w / 2);
      return { rect: x === XW || x === XE ? [x - d, z - w / 2, x + d, z + w / 2] : [x - w / 2, z - d, x + w / 2, z + d], nodes: [name] };
    }),
  ],
};

function put(world, geo, x, z, rotY = 0, colliders = []) {
  const m = vcMesh(geo, { cast: true, receive: true });
  m.position.set(x, 0, z);
  m.rotation.y = rotY;
  world.scene.add(m);
  for (const [cx, cz, r] of colliders) world.colliders.push({ x: x + cx, z: z + cz, r });
  return m;
}

function jacaranda(h) {
  const p = [];
  const bark = 0x6f625a;
  p.push(limb([0, -0.2, 0], [0.3, h * 0.45, 0.1], 0.32, 0.22, bark, 8));
  const purples = [0x9b7fd4, 0x8a6cc8, 0xb39ae0, 0xa58bdb];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + rand(-0.3, 0.3), len = rand(1.8, 2.8);
    const end = [Math.cos(a) * len, h * 0.45 + rand(1.0, 1.8), Math.sin(a) * len];
    p.push(limb([0.3, h * 0.45, 0.1], end, 0.14, 0.07, bark, 6));
    for (let k = 0; k < 3; k++) {
      p.push(part(G.ico(rand(0.9, 1.3), 1), pick(purples), [end[0] + rand(-0.6, 0.6), end[1] + rand(0, 0.6), end[2] + rand(-0.6, 0.6)], [rand(0, 3), rand(0, 3), 0], [1, 0.6, 1]));
    }
  }
  p.push(part(G.ico(1.6, 1), pick(purples), [0, h * 0.45 + 2.2, 0], [0, 0, 0], [1.3, 0.6, 1.3]));
  return merge(p);
}

function house(color, trim) {
  const p = [
    part(G.box(9, 4.2, 12), color, [0, 2.1, 0]),
    part(new THREE.CylinderGeometry(0.01, 7.2, 3, 4, 1), 0xb5523b, [0, 5.7, 0], [0, Math.PI / 4, 0], [0.95, 1, 1.25]),
    part(G.box(0.2, 2.1, 1.1), 0x5a3a28, [-4.55, 1.05, 0]),
    part(G.box(3.2, 0.25, 12.4), trim, [-5.5, 3.0, 0]),
  ];
  for (const z of [-3.8, 3.6]) p.push(part(G.box(0.2, 1.3, 1.8), 0x2c3e55, [-4.55, 2.4, z]), part(G.box(0.24, 1.5, 2.0), trim, [-4.5, 2.4, z]));
  for (const z of [-5.8, 5.8]) p.push(part(G.cyl(0.1, 0.1, 3, 6), trim, [-7, 1.5, z]));
  for (let y = 0.35; y < 4; y += 0.35) p.push(part(G.box(9.04, 0.04, 12.04), trim, [0, y, 0]));
  return merge(p);
}

/** a gate leaf along +x from its hinge (0) to len: palings on a Z-brace */
function gateLeafGeo(len) {
  return merge([
    palingGeo(len, { height: 1.7 }),
    part(G.box(Math.hypot(len, 1.0), 0.1, 0.05), 0x8a6a4a, [len / 2, 0.85, -0.1], [0, 0, Math.atan2(1.0, len)]),
  ]);
}

/**
 * A paling fence from a to b ([x, z]), with gaps ([from, to], distances along it) for the gateways. It's
 * solid (you can't get through it, or throw anything over it), and a wall in the yards' track, with guide
 * walls a way into each gap, so the way through a gateway keeps off its posts (a load's carriers need the
 * room)
 */
function fenceLine(world, track, [ax, az], [bx, bz], gaps) {
  const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
  const at = (d) => [ax + ux * d, az + uz * d];
  const posts = [];
  let from = 0, inset = 0;
  for (const [g0, g1] of [...gaps.sort((p, q) => p[0] - q[0]), [len, len]]) {
    const [x0, z0] = at(from), [x1, z1] = at(g0);
    for (let d = from; d < g0 - 0.01; d += 12) {
      const [px, pz] = at(d), [qx, qz] = at(Math.min(g0, d + 12));
      world.scene.add(placeAlong(vcMesh(palingGeo(Math.min(12, g0 - d)), { cast: true, receive: true }), px, pz, qx, qz));
    }
    world.addSegment(x0, z0, x1, z1, 0.12, true);
    track.addWall({ ax: x0, az: z0, bx: x1, bz: z1, active: true }, false);
    const next = g0 < len ? (g1 - g0) * 0.35 : 0;
    for (const [d0, d1] of [[from - inset, from], [g0, g0 + next]]) {
      if (d1 - d0 < 0.01) continue;
      const [gx0, gz0] = at(d0), [gx1, gz1] = at(d1);
      track.addWall({ ax: gx0, az: gz0, bx: gx1, bz: gz1, active: true, guide: true }, false);
    }
    if (g0 < len) posts.push(at(g0), at(g1));
    from = g1;
    inset = next;
  }
  // (gateposts, a bit taller than the fence)
  const p = [];
  for (const [x, z] of posts) p.push(part(G.box(0.2, 2.15, 0.2), 0x7a5c3e, [x, 1.07, z]), part(G.box(0.26, 0.06, 0.26), 0x6a4e34, [x, 2.17, z]));
  world.scene.add(vcMesh(merge(p), { cast: true, receive: true }));
}

/** the gate of an open gateway (width w, at x, z on a fence running along (ux, uz)), both leaves swung back flat against the fence */
function openGate(world, x, z, ux, uz, w, side) {
  const hw = w / 2, nx = -uz * side, nz = ux * side;
  for (const s of [-1, 1]) {
    const hx = x + ux * hw * s + nx * 0.14, hz = z + uz * hw * s + nz * 0.14;
    // (not quite flat: swung back as far as it'll go)
    const ex = hx + ux * s * hw * Math.cos(0.1) + nx * hw * Math.sin(0.1), ez = hz + uz * s * hw * Math.cos(0.1) + nz * hw * Math.sin(0.1);
    world.scene.add(placeAlong(vcMesh(gateLeafGeo(hw), { cast: true, receive: true }), hx, hz, ex, ez));
  }
}

// wheelie bins up against the fences (tip them over for what's inside): [kind, x, z, facing]
export const SUBURB_BINS = [
  ['green', 42, -74, -Math.PI / 2], ['red', 42, -75.6, -Math.PI / 2], ['yellow', 42, -77.2, -Math.PI / 2],
  ['green', -42, -82.4, Math.PI / 2], ['red', -42, -84, Math.PI / 2], ['yellow', -42, -85.6, Math.PI / 2],
  ['green', -35.5, -46.5, 0.4],
];

export function buildSuburb(world) {
  const track = world.tracks[1];
  // each yard's lawn, mown in stripes (this way in one, that way in the next)
  const stripes = [];
  YARDS.forEach(([, [x0, z0, x1, z1], , [a, b]], i) => {
    const across = i % 2 === 0, w = x1 - x0, d = z1 - z0, n = Math.round((across ? w : d) / 4);
    for (let k = 0; k < n; k++) {
      const plane = across ? new THREE.PlaneGeometry(w / n, d) : new THREE.PlaneGeometry(w, d / n);
      const cx = across ? x0 + (w / n) * (k + 0.5) : (x0 + x1) / 2, cz = across ? (z0 + z1) / 2 : z0 + (d / n) * (k + 0.5);
      stripes.push(part(plane.rotateX(-Math.PI / 2), k % 2 ? a : b, [cx, 0.01, cz]));
    }
  });
  world.scene.add(vcMesh(merge(stripes), { cast: false, receive: true }));

  // houses beyond the side fences
  const hues = [[0xefe6cf, 0xffffff], [0xcfe0e8, 0xf5f5f5], [0xdce8cf, 0xffffff], [0xf1d9c9, 0xffffff]];
  [[-56, -50], [-56, -80], [56, -52], [56, -82]].forEach(([x, z], i) => {
    put(world, house(...hues[i]), x, z, x > 0 ? 0 : Math.PI);
  });

  // side fences (decoration; the bounds stop you anyway)
  for (const x of [-46.3, 46.3]) {
    for (let z = Z0; z > Z1; z -= 12) {
      const f = vcMesh(palingGeo(12), { cast: true, receive: true });
      placeAlong(f, x, z, x, z - 12);
      world.scene.add(f);
    }
  }

  // the fences between the yards, with their gateways (the side gate's gap gets its own gate: see Barriers)
  const along = (x, z, vertical) => DOORS.filter(([, dx, dz]) => (vertical ? dx === x : dz === z));
  for (const x of [XW, XE]) {
    const gaps = along(x, 0, true).map(([, , z, w]) => [Z0 - z - w / 2, Z0 - z + w / 2]);
    fenceLine(world, track, [x, Z0], [x, Z1], gaps);
  }
  const gaps = along(0, ZM, false).map(([, x, , w]) => [x + 46 - w / 2, x + 46 + w / 2]);
  gaps.push([SIDE_GATE.a[0] + 46, SIDE_GATE.b[0] + 46]);
  fenceLine(world, track, [-46, ZM], [46, ZM], gaps);
  track.plan();
  // (their gates left wide open)
  for (const [, x, z, w] of DOORS) {
    if (x === XW || x === XE) openGate(world, x, z, 0, -1, w, x < 0 ? 1 : -1);
    else openGate(world, x, z, 1, 0, w, 1);
  }

  // jacarandas: purple flower drop instead of gum leaves (one or two a yard, clear of the gateways)
  for (const [x, z] of [[9, -63], [-30, -58], [22, -62], [40, -44], [-28, -92], [-40, -74], [10, -73], [38, -92]]) {
    const h = rand(4.5, 5.5);
    const m = vcMesh(jacaranda(h));
    m.position.set(x, 0, z);
    m.rotation.y = rand(0, TAU);
    world.scene.add(m);
    world.addSway(m);
    world.colliders.push({ x, z, r: 0.45 });
    world.treeSpots.push({ x, z, h: h + 2, palette: 'jacaranda' });
    world.stainGround(x, z, 5, 0x8f79c2, 0.4);
  }

  // the garden shed, out the back of the yard on the right
  put(world, merge([
    part(G.box(4, 2.3, 3), 0x5d7a5a, [0, 1.15, 0]),
    part(G.box(4.4, 0.12, 3.5), 0x4d664b, [0, 2.45, 0], [0.12, 0, 0]),
    part(G.box(1.2, 1.9, 0.05), 0x4a6247, [0.8, 0.95, 1.52]),
  ]), 36, -48, 0, [[-1.2, 0, 1.6], [1.2, 0, 1.6]]);

  for (const [x, z, rot] of [[-22, -94, 0.2], [9, -95, 0.3]]) {
    const bed = [part(G.box(3, 0.45, 1.2), 0x8a6a4a, [0, 0.22, 0]), part(G.box(2.8, 0.05, 1.0), 0x4a3321, [0, 0.46, 0])];
    for (let i = 0; i < 9; i++) bed.push(part(G.ico(0.14, 0), pick([0xff6b6b, 0xffd93d, 0xffffff, 0xc77dff, 0x4d96ff]), [rand(-1.2, 1.2), 0.6, rand(-0.35, 0.35)]));
    put(world, merge(bed), x, z, rot, [[-0.9, 0, 0.7], [0.9, 0, 0.7]]);
  }

  // the barbecue, and a lemon tree
  put(world, merge([part(G.box(1.2, 0.9, 0.7), 0x333333, [0, 0.45, 0]), part(G.box(1.1, 0.12, 0.62), 0x555555, [0, 0.98, 0])]), -38, -60, 0.4, [[0, 0, 0.7]]);
  const lemon = [limb([0, 0, 0], [0, 1.2, 0], 0.12, 0.09, 0x6a5a4a, 6), part(G.ico(1.1, 1), 0x4f7f35, [0, 1.9, 0])];
  for (let i = 0; i < 12; i++) {
    const a = rand(0, TAU), e = rand(-0.6, 0.9);
    lemon.push(part(G.sphere(0.09, 6, 5), 0xffe135, [Math.cos(a) * Math.cos(e) * 1.05, 1.9 + Math.sin(e) * 1.05, Math.sin(a) * Math.cos(e) * 1.05]));
  }
  put(world, merge(lemon), -40, -44, 0, [[0, 0, 0.5]]);
}
