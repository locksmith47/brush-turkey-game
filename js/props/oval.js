import * as THREE from 'three';
import { part, merge, vcMesh, G, limb, rand, pick, TAU, canvasTexture, toonMat } from '../util.js';
import { picketGeo } from './fences.js';

/*
 * The field has a white picket fence round it, with a gateway either side (wide enough for the key) and a
 * gate at the near end, latched on the field side. You come in from the city at the near end, and the way
 * out to the beach is round at the far end: round the outside one way or the other (past a funnel-web's
 * burrow on the left, or a snake on the right), onto the field past Big Kev for the key, and back out again.
 * Once you're on the field you can let yourself out of the near gate: a shortcut back.
 */
const CX = 0, CZ = -212; // centre of the oval
const RX = 28, RZ = 24; // (the fence round the field: an ellipse)
const SIDE = 0.2527; // (the gateways either side: half their width, as an angle round the fence (12 m across))
const NEAR = Math.asin(4 / RX); // (and the gate at the near end: 8 m across)
const ell = (a) => [CX + RX * Math.cos(a), CZ + RZ * Math.sin(a)];
const NEAR_Z = CZ + RZ * Math.cos(NEAR);
export const FIELD_GATE = { a: [CX - 4, NEAR_Z], b: [CX + 4, NEAR_Z], latch: [0, -1], kind: 'picket' };
// the lie of the land (see Track): all open ground, bar the fence (walls, with guides a way into each
// gateway), with waypoints in the gateways and round the outside of the field
export const FIELD = {
  nodes: { gw: ell(Math.PI), ge: ell(0), gs: [CX, NEAR_Z], w: [-38, CZ], e: [38, CZ], sw: [-32, -182], se: [32, -182], nw: [-22, -244], ne: [22, -244] },
  rooms: [{ rect: [-46, -250, 46, -170], nodes: ['gw', 'ge', 'gs', 'w', 'e', 'sw', 'se', 'nw', 'ne'] }],
};
// the fence's three stretches, between the gateways: [from, to] (angles round it), and how far guides reach into the gateway at either end
const ARCS = [
  [SIDE, Math.PI / 2 - NEAR, 0.7 * SIDE, 0.7 * NEAR],
  [Math.PI / 2 + NEAR, Math.PI - SIDE, 0.7 * NEAR, 0.7 * SIDE],
  [Math.PI + SIDE, 2 * Math.PI - SIDE, 0.7 * SIDE, 0.7 * SIDE],
];
// the stumps at either end of the pitch (turkeys can dig them up), a pair of plovers nesting on the field
// either side, just in from each gateway (so they're the first thing you run into on your way to Big Kev),
// and cricket gear left lying about: the team's kit piled up by the fence round on the right, and bits and
// pieces all over
export const STUMPS = [[CX, CZ - 9.2], [CX, CZ + 9.2]];
export const PLOVER_NESTS = [[-19, -203], [19, -203]];
export const CRICKET_KIT = [
  ['ball', -9, -181], ['cap', 9, -179], ['gloves', -41, -191], ['ball', -42, -224],
  ['kitbag', 43, -209], ['cooler', 43, -215.5], ['bat', 39.5, -219], ['pads', 42.5, -222], ['helmet', 40, -224.5],
  ['bat', 2.6, -201], ['helmet', -2.2, -201.8], ['pads', -2.5, -223.5], ['gloves', 2.8, -223], ['ball', 11, -197], ['ball', -13, -230],
  ['cap', 9, -246], ['ball', -31, -237],
];
// bins by Kev's shed and along the western fence (tip them over for what's inside): [kind, x, z, facing]
export const OVAL_BINS = [
  ['red', 31.6, -240.6, 0.3], ['yellow', 32.5, -241.1, 0.3], ['green', 40.5, -241.2, -0.4],
  ['green', -44, -214.5, Math.PI / 2], ['red', -44, -216.1, Math.PI / 2],
];

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

  // the picket fence round the field: you can't get through it (bar the gateways), but you can throw over it
  const pickets = [], posts = [];
  const along = (a0, a1, fn) => {
    const n = Math.max(1, Math.ceil((a1 - a0) / 0.1));
    for (let i = 0; i < n; i++) fn(ell(a0 + ((a1 - a0) * i) / n), ell(a0 + ((a1 - a0) * (i + 1)) / n));
  };
  for (const [a0, a1, g0, g1] of ARCS) {
    along(a0, a1, ([ax, az], [bx, bz]) => {
      const g = picketGeo(Math.hypot(bx - ax, bz - az));
      g.rotateY(-Math.atan2(bz - az, bx - ax));
      g.translate(ax, 0, az);
      pickets.push(g);
      world.addSegment(ax, az, bx, bz, 0.1, false);
      track.addWall({ ax, az, bx, bz, active: true }, false);
    });
    for (const [c0, c1] of [[a0 - g0, a0], [a1, a1 + g1]]) along(c0, c1, ([ax, az], [bx, bz]) => track.addWall({ ax, az, bx, bz, active: true, guide: true }, false));
    for (const a of [a0, a1]) posts.push(part(G.box(0.18, 1.45, 0.18), 0xf7f7f2, [ell(a)[0], 0.72, ell(a)[1]]), part(G.cone(0.14, 0.16, 4), 0xf7f7f2, [ell(a)[0], 1.53, ell(a)[1]], [0, Math.PI / 4, 0]));
  }
  track.plan();
  s.add(vcMesh(merge([...pickets, ...posts]), { cast: true, receive: true }));

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
  put(world, screen, CX, -178, 0, [[-2.6, 0, 0.8], [0, 0, 0.8], [2.6, 0, 0.8]]);
  put(world, screen, CX, -239.5, 0, [[-2.6, 0, 0.8], [0, 0, 0.8], [2.6, 0, 0.8]]);

  // grandstand along the east side, scoreboard to the west (outside the play area)
  const stand = [];
  for (let i = 0; i < 6; i++) stand.push(part(G.box(3.2, 0.6, 40), i % 2 ? 0x2f6fb0 : 0x3a7fc2, [52 + i * 1.6, 0.3 + i * 0.6, CZ]));
  stand.push(part(G.box(12, 0.3, 42), 0xd9d9d9, [56, 6.2, CZ], [0, 0, 0.12]));
  for (const z of [-20, 0, 20]) stand.push(part(G.cyl(0.15, 0.15, 6, 8), 0x9a9a9a, [61, 3, CZ + z]));
  s.add(vcMesh(merge(stand), { cast: true, receive: true }));

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
  for (const [x, z] of [[-40, -180], [40, -184], [-42, -228], [42, -226], [-24, -246], [40, -247], [-40, -204]]) {
    const h = rand(5, 6.5);
    const m = vcMesh(autumnTree(h));
    m.position.set(x, 0, z);
    world.addSway(m);
    s.add(m);
    world.colliders.push({ x, z, r: 0.45 });
    world.treeSpots.push({ x, z, h: h + 2, palette: 'autumn' });
    world.stainGround(x, z, 4.5, 0xc0703a, 0.35);
  }

  // Kev's shed and his ride-on mower
  put(world, merge([
    part(G.box(5, 2.8, 3.6), 0xb0a080, [0, 1.4, 0]),
    part(G.box(5.4, 0.15, 4.2), 0x6d6d6d, [0, 2.95, 0], [0.1, 0, 0]),
    part(G.box(2, 2.2, 0.06), 0x5d7a5a, [0.8, 1.1, 1.82]),
    part(G.box(0.9, 0.6, 0.06), 0x9fd0ee, [-1.4, 1.8, 1.82]),
  ]), 36, -238, 0, [[-1.6, 0, 1.9], [1.6, 0, 1.9]]);
  put(world, merge([
    part(G.box(1.1, 0.5, 1.8), 0xc0392b, [0, 0.55, 0]),
    part(G.box(0.6, 0.12, 0.5), 0x222222, [0, 0.9, -0.2]),
    part(G.box(0.6, 0.5, 0.1), 0x222222, [0, 1.1, -0.45]),
    part(G.cyl(0.3, 0.3, 0.2, 12), 0x222222, [0.6, 0.3, -0.6], [0, 0, Math.PI / 2]),
    part(G.cyl(0.3, 0.3, 0.2, 12), 0x222222, [-0.6, 0.3, -0.6], [0, 0, Math.PI / 2]),
    part(G.cyl(0.2, 0.2, 0.15, 12), 0x222222, [0.55, 0.2, 0.6], [0, 0, Math.PI / 2]),
    part(G.cyl(0.2, 0.2, 0.15, 12), 0x222222, [-0.55, 0.2, 0.6], [0, 0, Math.PI / 2]),
    part(G.cyl(0.03, 0.03, 0.5, 6), 0x333333, [0, 1.05, 0.35], [-0.5, 0, 0]),
  ]), 30, -236, 0.4, [[0, 0, 1.1]]);
}
