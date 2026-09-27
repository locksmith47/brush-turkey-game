import * as THREE from 'three';
import { part, merge, vcMesh, G, limb, rand, pick, TAU } from '../util.js';
import { palingGeo, placeAlong } from './fences.js';

const Z0 = -38, Z1 = -98;

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

// wheelie bins out by the side fences (tip them over for what's inside): [kind, x, z, facing]
export const SUBURB_BINS = [
  ['green', 42, -68.4, -Math.PI / 2], ['red', 42, -70, -Math.PI / 2], ['yellow', 42, -71.6, -Math.PI / 2],
  ['green', -42, -82.4, Math.PI / 2], ['red', -42, -84, Math.PI / 2], ['yellow', -42, -85.6, Math.PI / 2],
  ['green', -35.5, -46.5, 0.4],
];

export function buildSuburb(world) {
  // mowing stripes
  const stripes = [];
  for (let x = -46, i = 0; x < 46; x += 4, i++) {
    stripes.push(part(new THREE.PlaneGeometry(4, Z0 - Z1).rotateX(-Math.PI / 2), i % 2 ? 0x8cc458 : 0x7db44c, [x + 2, 0.01, (Z0 + Z1) / 2]));
  }
  const lawn = vcMesh(merge(stripes), { cast: false, receive: true });
  world.scene.add(lawn);

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

  // jacarandas: purple flower drop instead of gum leaves
  for (const [x, z] of [[-30, -50], [-6, -66], [30, -62], [12, -46], [-28, -88], [26, -90], [-42, -70], [40, -44]]) {
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

  put(world, merge([
    part(G.box(4, 2.3, 3), 0x5d7a5a, [0, 1.15, 0]),
    part(G.box(4.4, 0.12, 3.5), 0x4d664b, [0, 2.45, 0], [0.12, 0, 0]),
    part(G.box(1.2, 1.9, 0.05), 0x4a6247, [0.8, 0.95, 1.52]),
  ]), 34, -50, 0, [[-1.2, 0, 1.6], [1.2, 0, 1.6]]);

  for (const [x, z, rot] of [[4, -56, 0], [-14, -92, 0.3]]) {
    const bed = [part(G.box(3, 0.45, 1.2), 0x8a6a4a, [0, 0.22, 0]), part(G.box(2.8, 0.05, 1.0), 0x4a3321, [0, 0.46, 0])];
    for (let i = 0; i < 9; i++) bed.push(part(G.ico(0.14, 0), pick([0xff6b6b, 0xffd93d, 0xffffff, 0xc77dff, 0x4d96ff]), [rand(-1.2, 1.2), 0.6, rand(-0.35, 0.35)]));
    put(world, merge(bed), x, z, rot, [[-0.9, 0, 0.7], [0.9, 0, 0.7]]);
  }

  put(world, merge([part(G.box(1.2, 0.9, 0.7), 0x333333, [0, 0.45, 0]), part(G.box(1.1, 0.12, 0.62), 0x555555, [0, 0.98, 0])]), -36, -58, 0.4, [[0, 0, 0.7]]);

  // a lemon tree
  const lemon = [limb([0, 0, 0], [0, 1.2, 0], 0.12, 0.09, 0x6a5a4a, 6), part(G.ico(1.1, 1), 0x4f7f35, [0, 1.9, 0])];
  for (let i = 0; i < 12; i++) {
    const a = rand(0, TAU), e = rand(-0.6, 0.9);
    lemon.push(part(G.sphere(0.09, 6, 5), 0xffe135, [Math.cos(a) * Math.cos(e) * 1.05, 1.9 + Math.sin(e) * 1.05, Math.sin(a) * Math.cos(e) * 1.05]));
  }
  put(world, merge(lemon), -38, -44, 0, [[0, 0, 0.5]]);
}
