import * as THREE from 'three';
import { part, merge, vcMesh, vcMat, G, limb, rand, pick, TAU } from '../util.js';

/**
 * A gum tree h high. `roost` ({ a, y, len, rise }) adds a low bare branch sticking out under the canopy
 * (angle a, at height y) for turkeys to roost on; it gets `from` and `to` filled in (the branch's line)
 */
export function makeEucalyptus(h, roost = null) {
  const parts = [];
  const bark = pick([0xe8e0d0, 0xd9d0bd, 0xefe7da]);
  parts.push(limb([0, -0.3, 0], [0.15, h * 0.55, 0.05], 0.42, 0.3, bark, 9));
  parts.push(limb([0.15, h * 0.55, 0.05], [-0.1, h * 0.95, 0.1], 0.3, 0.2, bark, 8));
  for (let i = 0; i < 4; i++) {
    const a = rand(0, TAU);
    parts.push(part(G.box(0.18, rand(0.6, 1.2), 0.04), 0xb8a88c, [Math.cos(a) * 0.36, rand(0.3, 0.9), Math.sin(a) * 0.36], [0, -a, rand(-0.2, 0.2)]));
  }
  const greens = [0x6d8f4e, 0x7f9f5c, 0x5f8045, 0x8aa866];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + rand(-0.4, 0.4);
    const y0 = h * rand(0.55, 0.85), len = rand(1.6, 2.6);
    const end = [Math.cos(a) * len, y0 + rand(0.8, 1.6), Math.sin(a) * len];
    parts.push(limb([0, y0, 0], end, 0.16, 0.08, bark, 6));
    for (let k = 0; k < 3; k++) {
      parts.push(part(G.ico(rand(0.9, 1.4), 1), pick(greens), [end[0] + rand(-0.7, 0.7), end[1] + rand(-0.1, 0.5), end[2] + rand(-0.7, 0.7)], [rand(0, 3), rand(0, 3), 0], [1, 0.55, 1]));
    }
  }
  for (let k = 0; k < 3; k++) {
    parts.push(part(G.ico(rand(1.2, 1.7), 1), pick(greens), [rand(-0.6, 0.6), h + rand(0, 0.8), rand(-0.6, 0.6)], [0, rand(0, 3), 0], [1, 0.55, 1]));
  }
  if (roost) {
    // (from the middle of the trunk, out between two of the big branches, with a tuft of leaves at the end)
    const k = (roost.y + 0.3) / (h * 0.55 + 0.3), c = Math.cos(roost.a), s = Math.sin(roost.a);
    roost.from = [0.15 * k, roost.y, 0.05 * k];
    roost.to = [roost.from[0] + c * roost.len, roost.y + roost.rise, roost.from[2] + s * roost.len];
    parts.push(limb(roost.from, roost.to, 0.14, 0.07, bark, 6));
    const [ex, ey, ez] = roost.to;
    parts.push(limb(roost.to, [ex + c * 0.35 - s * 0.2, ey + 0.35, ez + s * 0.35 + c * 0.2], 0.05, 0.03, bark, 4));
    for (let i = 0; i < 2; i++) {
      parts.push(part(G.ico(rand(0.35, 0.5), 1), pick(greens), [ex + c * rand(0.3, 0.55), ey + rand(0.2, 0.45), ez + s * rand(0.3, 0.55)], [rand(0, 3), rand(0, 3), 0], [1, 0.6, 1]));
    }
  }
  return merge(parts);
}

// spots along a roosting branch (fractions of the way out), each sitting on top of the branch
const PERCHES = [0.42, 0.66, 0.88];

/** `spot` (with a roost) is the tree's entry in world.treeSpots: the patch of litter it sheds onto */
function addTree(world, x, z, h, collide, roost = null, spot = null) {
  const m = vcMesh(makeEucalyptus(h, roost));
  m.position.set(x, world.groundHeight(x, z), z);
  m.rotation.y = rand(0, TAU);
  world.scene.add(m);
  world.addSway(m);
  if (collide) world.colliders.push({ x, z, r: 0.55 });
  if (roost) {
    const { from, to } = roost;
    const perches = PERCHES.map((t) => new THREE.Vector3(
      from[0] + (to[0] - from[0]) * t,
      from[1] + (to[1] - from[1]) * t + (0.14 - 0.07 * t) * 0.85,
      from[2] + (to[2] - from[2]) * t,
    ));
    world.roosts.push({ tree: m, x, z, perches, spot });
  }
}

export function buildBush(world) {
  const inner = [
    [-14, -10], [16, -14], [-20, 12], [12, 18], [-4, -24], [26, 4], [-28, -6], [4, 30],
    [-12, 30], [30, -24], [-32, -28], [22, 32], [38, 12], [-40, 14], [-22, -30], [40, -8], [-36, 36],
  ];
  for (const [x, z] of inner) {
    const h = rand(6, 8.5);
    // every one of them has a good low branch for roosting on (brush turkeys sleep up in the trees)
    const roost = { a: ((Math.floor(rand(0, 4)) + 0.5) / 4) * TAU, y: h * rand(0.32, 0.37), len: rand(2.1, 2.5), rise: rand(0.12, 0.25) };
    const spot = { x, z, h, palette: 'gum' };
    addTree(world, x, z, h, true, roost, spot);
    world.treeSpots.push(spot);
    world.stainGround(x, z, 6.5, 0x8f6a3e, 0.55);
  }
  // dense bush beyond the edges
  for (let z = -40; z < 70; z += rand(3, 5)) {
    addTree(world, -rand(50, 64), z, rand(6, 10), false);
    addTree(world, rand(50, 64), z, rand(6, 10), false);
  }
  for (let x = -66; x < 66; x += rand(3, 5)) addTree(world, x, rand(50, 66), rand(6, 10), false);

  const rocks = [[6, -12, 1.1], [-9, 6, 0.8], [18, 8, 1.4], [-18, -18, 1.2], [3, 16, 0.7], [-30, 22, 1.5], [28, -10, 1.0], [14, -28, 1.3]];
  for (const [x, z, s] of rocks) {
    const m = vcMesh(merge([
      part(G.dodec(s), 0x9a9a92, [0, s * 0.35, 0], [rand(0, 3), rand(0, 3), 0], [1.2, 0.7, 1]),
      part(G.dodec(s * 0.5), 0x8a8a84, [s * 0.9, s * 0.15, s * 0.3], [rand(0, 3), 0, 0], [1, 0.7, 1]),
    ]), { cast: true, receive: true });
    m.position.set(x, world.groundHeight(x, z) - 0.1, z);
    m.rotation.y = rand(0, TAU);
    world.scene.add(m);
    world.colliders.push({ x, z, r: s * 1.1 });
  }

  for (const [x, z, a] of [[-8, -16, 0.6], [22, -2, 2.2], [-24, 4, 1.2]]) {
    const m = vcMesh(merge([
      part(G.cyl(0.35, 0.4, 4.5, 10), 0x8b6a48, [0, 0.35, 0], [0, 0, Math.PI / 2]),
      part(G.cyl(0.3, 0.3, 0.02, 10), 0xd2b48c, [2.26, 0.35, 0], [0, 0, Math.PI / 2]),
      part(G.cyl(0.33, 0.33, 0.02, 10), 0xd2b48c, [-2.26, 0.35, 0], [0, 0, Math.PI / 2]),
      part(G.ico(0.3, 0), 0x5f8045, [0.8, 0.7, 0.1], [0, 0, 0], [1, 0.5, 1]),
    ]), { cast: true, receive: true });
    m.position.set(x, world.groundHeight(x, z), z);
    m.rotation.y = a;
    world.scene.add(m);
    for (let k = -2; k <= 2; k++) world.colliders.push({ x: x + Math.cos(-a) * k, z: z + Math.sin(-a) * k, r: 0.55 });
  }

  // grass tufts (instanced)
  const tuft = merge([
    part(G.cone(0.05, 0.5, 3), 0x6f9a3e, [0, 0.25, 0], [0.2, 0, 0.15]),
    part(G.cone(0.05, 0.42, 3), 0x86b04c, [0.06, 0.21, 0.03], [-0.25, 0, -0.2]),
    part(G.cone(0.05, 0.38, 3), 0x5f8a35, [-0.05, 0.19, -0.04], [0.1, 0, -0.35]),
  ]);
  const N = 900;
  const grass = new THREE.InstancedMesh(tuft, vcMat(), N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < N; i++) {
    let x, z;
    do { x = rand(-52, 52); z = rand(-37, 52); } while (Math.hypot(x, z) < 5);
    p.set(x, world.groundHeight(x, z), z);
    q.setFromAxisAngle(up, rand(0, TAU));
    s.setScalar(rand(0.7, 1.5));
    grass.setMatrixAt(i, m.compose(p, q, s));
  }
  world.scene.add(grass);

  // ferns + golden wattle bushes
  const fern = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU;
    fern.push(part(G.cone(0.16, 1.1, 4), 0x4f7f35, [Math.cos(a) * 0.4, 0.35, Math.sin(a) * 0.4], [Math.sin(a), 0, -Math.cos(a)], [1, 1, 0.3]));
  }
  const fernGeo = merge(fern);
  const wattle = [];
  for (let i = 0; i < 6; i++) wattle.push(part(G.ico(rand(0.45, 0.65), 1), pick([0x6a8a45, 0x7a9a50]), [rand(-0.5, 0.5), rand(0.4, 0.9), rand(-0.5, 0.5)]));
  for (let i = 0; i < 26; i++) wattle.push(part(G.ico(0.09, 0), pick([0xffd21f, 0xffe04a, 0xf5c518]), [rand(-0.8, 0.8), rand(0.4, 1.3), rand(-0.8, 0.8)]));
  const wattleGeo = merge(wattle);
  for (let i = 0; i < 40; i++) {
    const x = rand(-42, 42), z = rand(-34, 42);
    if (Math.hypot(x, z) < 9 || !world.isFree(x, z, 1.5)) continue;
    const isWattle = i % 3 === 0;
    const mesh = vcMesh(isWattle ? wattleGeo : fernGeo);
    mesh.position.set(x, world.groundHeight(x, z), z);
    mesh.rotation.y = rand(0, TAU);
    mesh.scale.setScalar(rand(0.8, 1.3));
    world.scene.add(mesh);
    if (isWattle) world.colliders.push({ x, z, r: 0.8 });
  }
}
