import * as THREE from 'three';
import { part, merge, vcMesh, G, limb, rand, pick, TAU, canvasTexture, toonMat } from '../util.js';

const CX = 0, CZ = -212; // centre of the oval
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
  const s = world.scene;

  // mowing rings, the pitch and the boundary rope
  const ground = [];
  for (let i = 9; i >= 1; i--) {
    ground.push(part(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), i % 2 ? 0x86c457 : 0x78b64b, [CX, 0.01 + (10 - i) * 0.001, CZ], [0, 0, 0], [i * 3.3, 1, i * 3.0]));
  }
  ground.push(part(new THREE.PlaneGeometry(3, 20).rotateX(-Math.PI / 2), 0xcdb982, [CX, 0.025, CZ]));
  for (const dz of [-8.8, 8.8]) ground.push(part(new THREE.PlaneGeometry(2.6, 0.08).rotateX(-Math.PI / 2), 0xffffff, [CX, 0.03, CZ + dz]));
  s.add(vcMesh(merge(ground), { cast: false, receive: true }));
  const rope = new THREE.Mesh(new THREE.TorusGeometry(31, 0.07, 4, 160).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  rope.scale.set(1, 1, 29 / 31);
  rope.position.set(CX, 0.06, CZ);
  s.add(rope);

  // stumps at each end of the pitch
  const stumps = [];
  for (let i = -1; i <= 1; i++) stumps.push(part(G.cyl(0.025, 0.025, 0.7, 6), 0xf2e6c9, [i * 0.09, 0.35, 0]));
  stumps.push(part(G.box(0.25, 0.025, 0.04), 0xf2e6c9, [0, 0.71, 0]));
  const stumpGeo = merge(stumps);
  put(world, stumpGeo, CX, CZ - 9.2, 0, [[0, 0, 0.2]]);
  put(world, stumpGeo, CX, CZ + 9.2, 0, [[0, 0, 0.2]]);

  // sightscreens behind each end
  const screen = merge([
    part(G.box(7, 3, 0.2), 0xf5f5f5, [0, 2.1, 0]),
    part(G.box(0.2, 0.8, 0.2), 0x9a9a9a, [-3, 0.4, 0]),
    part(G.box(0.2, 0.8, 0.2), 0x9a9a9a, [3, 0.4, 0]),
  ]);
  put(world, screen, CX, -178, 0, [[-2.6, 0, 0.8], [0, 0, 0.8], [2.6, 0, 0.8]]);
  put(world, screen, CX, -246, 0, [[-2.6, 0, 0.8], [0, 0, 0.8], [2.6, 0, 0.8]]);

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
  for (const [x, z] of [[-40, -180], [40, -184], [-42, -228], [42, -226], [-24, -246], [24, -244], [-40, -204]]) {
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
