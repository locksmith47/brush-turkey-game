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

/*
 * The bush is a long way through the scrub now: from the mound's grassy clearing, a dirt track winds north
 * through three little clearings, each with a barricade across the way out for turkeys to knock down, and
 * something nasty guarding it (an ibis; a snake and an ibis together; three ibises), and up to the
 * padlocked gate. The key's off to the right of the gate, buried behind a funnel-web's web: tear the web
 * down (the spider will have something to say about that) and the turkeys can dig it up. The scrub either
 * side is far too thick to get through (or throw anything over): the track is the only way.
 */
export const BUSH_SOUTH = 108; // the far (south) end of the bush
export const HOME = { x: 4, z: 84 }; // the mound
export const START = { x: 4, z: 95 }; // where you start out (just behind the mound, looking north over it)
export const TRACK = {
  width: 3.2, // (half the width of a path)
  // name: [x, z, radius, ground]
  clearings: {
    home: [4, 88, 15, 'grass'],
    ibis: [-24, 54, 10, 'dirt'],
    snake: [28, 28, 11, 'dirt'],
    ibises: [-10, -4, 12, 'dirt'],
    gate: [6, -32, 6.5, 'dirt'],
    guards: [26, -20, 9, 'dirt'],
    key: [41, -30, 3.5, 'dirt'],
  },
  // from, any bends on the way ([x, z]), to
  paths: [
    ['home', [-12, 70], 'ibis'],
    ['ibis', [-20, 36], [6, 40], 'snake'],
    ['snake', [30, 8], [12, 6], 'ibises'],
    ['ibises', [-8, -22], 'gate'],
    ['gate', 'guards'],
    ['guards', 'key'],
  ],
};
/**
 * The clearings you have to fight your way through: the clearing each one's barricade shuts you off from,
 * how much shoving it takes to knock down, what it is (logs, bar the funnel-web's: its web, strung across
 * the way to the key), and who guards it: [kind, metres back into the clearing from it, metres across]
 * (the funnel-web's burrow is close enough that its silk reaches the web it's strung across the way)
 */
export const ARENAS = [
  { at: 'ibis', to: 'snake', hp: 40, foes: [['ibis', 4.5, 0]] },
  { at: 'snake', to: 'ibises', hp: 60, foes: [['snake', 4.5, 2.5], ['ibis', 6, -2.5]] },
  { at: 'ibises', to: 'gate', hp: 75, foes: [['ibis', 4.5, -3], ['ibis', 6, 0], ['ibis', 4.5, 3]] },
  { at: 'guards', to: 'key', hp: 60, barricade: 'web', foes: [['spider', 4.6, 0]] },
];
export const BUSH_BINS = [['green', -8.5, 83.5, Math.PI / 2], ['red', -7.5, 87.5, Math.PI / 2]];
/** patches of leaf litter on the track, [x, z, leaves' worth, spread] (on top of what's under the gums) */
export const BUSH_LITTER = [
  [-2, 80, 14, 2], [13, 92, 12, 1.8], [10, 78, 10, 2], // round the mound
  [-7, 72, 6, 1.5], [-17, 63, 6, 1.5], // the way to the ibis
  [-28, 50, 8, 2], [-19, 58, 6, 1.5],
  [-4, 39, 6, 1.5], [14, 36, 6, 1.5], // the way to the snake and the ibis
  [22, 30, 8, 2], [33, 22, 6, 1.5],
  [22, 7, 6, 1.5], // the way to the ibises
  [-14, -1, 8, 2], [-4, -9, 8, 2],
  [2, -27, 5, 1.5], // the gate
  [22, -16, 8, 2], // the funnel-web's clearing
];
// the gums round the clearings' edges, [clearing, bearing from its middle] (well clear of where the paths
// come in), and some beside the paths along the way, [x, z]; each has a low branch reaching in over the
// track to roost on
const GUMS = [
  ['home', -1.1], ['home', 0], ['home', 0.9], ['home', 1.9], ['home', 2.95],
  ['ibis', 2.4], ['ibis', -2.2],
  ['snake', 0.45], ['snake', -2.0],
  ['ibises', 2.2], ['ibises', -0.35], ['ibises', 0.9],
  ['guards', 1.7],
  [-5.8, 71.4], [-7.5, 41.6], [21.4, 3.4],
];
// (rocks sit off to the side in the clearings, out of the way of anything being carried through)
const ROCKS = [[12, 81, 1.0], [-27, 57, 1.1], [31, 33, 0.9], [-15, 0, 1.3], [25, -15, 0.9]];
const LOGS = [[-1, 96, 0.3], [-16, -7, 1.9]];

function rock(world, x, z, s) {
  const m = vcMesh(merge([
    part(G.dodec(s), 0x9a9a92, [0, s * 0.35, 0], [rand(0, 3), rand(0, 3), 0], [1.2, 0.7, 1]),
    part(G.dodec(s * 0.5), 0x8a8a84, [s * 0.9, s * 0.15, s * 0.3], [rand(0, 3), 0, 0], [1, 0.7, 1]),
  ]), { cast: true, receive: true });
  m.position.set(x, world.groundHeight(x, z) - 0.1, z);
  m.rotation.y = rand(0, TAU);
  world.scene.add(m);
  world.colliders.push({ x, z, r: s * 1.1 });
}

function log(world, x, z, a) {
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

/**
 * A gum tree. `roost` gives it a low branch for roosting on, and `face` is which way (bearing, in the
 * ground plane) that branch should reach: out over the track, so turkeys can get up to it
 */
function addTree(world, x, z, h, collide, roost = null, spot = null, face = null) {
  const m = vcMesh(makeEucalyptus(h, roost));
  m.position.set(x, world.groundHeight(x, z), z);
  // (a branch at angle a in the tree's own space ends up at bearing a - rotation.y)
  m.rotation.y = roost && face !== null ? roost.a - face : rand(0, TAU);
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

/** a scrubby bush: a few clumps of foliage (`flowers`: a wattle, all yellow bobbles) */
function shrubGeo(flowers) {
  const greens = [0x5f8a45, 0x6d9a4e, 0x557d3e, 0x78a055];
  const p = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + rand(-0.4, 0.4), r = rand(0.35, 0.55);
    p.push(part(G.ico(rand(0.75, 0.95), 1), pick(greens), [Math.cos(a) * r, rand(0.65, 0.95), Math.sin(a) * r], [rand(0, 3), rand(0, 3), 0], [1, 0.85, 1]));
  }
  p.push(part(G.ico(0.85, 1), pick(greens), [0, 1.45, 0], [rand(0, 3), rand(0, 3), 0], [1, 0.8, 1]));
  if (flowers) {
    for (let i = 0; i < 16; i++) {
      const a = rand(0, TAU), y = rand(0.6, 1.9), r = 1.02 - Math.abs(y - 1.1) * 0.35;
      p.push(part(new THREE.OctahedronGeometry(0.13, 0), pick([0xffd21f, 0xffe04a, 0xf5c518]), [Math.cos(a) * r, y, Math.sin(a) * r], [rand(0, 3), rand(0, 3), 0]));
    }
  }
  return merge(p);
}

/**
 * The scrub: everywhere in the bush that isn't the track is packed with bushes, right up to its edges.
 * They're instanced, a few meshes to each patch of ground so the ones out of sight get skipped
 */
function buildScrub(world, track) {
  const TILE = 16, SP = 2.55;
  const geos = [shrubGeo(false), shrubGeo(true)];
  const tiles = new Map();
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const c = new THREE.Color();
  for (let gx = -48; gx <= 48; gx += SP) {
    for (let gz = -36.5; gz <= BUSH_SOUTH + 4; gz += SP) {
      const x = gx + rand(-0.8, 0.8), z = gz + rand(-0.8, 0.8);
      const d = track.depth(x, z);
      if (d < 0.9) continue; // (on the track, or right at its edge)
      const deep = d > 6; // (well back from the track, fewer and bigger ones will do)
      if (deep && Math.random() < 0.55) continue;
      const k = Math.floor(x / TILE) * 1000 + Math.floor(z / TILE);
      if (!tiles.has(k)) tiles.set(k, [[], []]);
      const v = Math.random() < 0.1 ? 1 : 0;
      const k2 = rand(0.95, 1.35) * (deep ? 1.3 : 1);
      p.set(x, world.groundHeight(x, z) - 0.1, z);
      q.setFromAxisAngle(up, rand(0, TAU));
      s.set(k2 * rand(0.9, 1.15), k2 * rand(0.8, 1.15), k2 * rand(0.9, 1.15));
      c.setHSL(rand(0.2, 0.3), rand(0.1, 0.35), rand(0.72, 0.95)); // (shades of green, some greyer, some darker)
      tiles.get(k)[v].push({ m: m.compose(p, q, s).clone(), c: c.clone() });
    }
  }
  for (const lists of tiles.values()) {
    lists.forEach((list, v) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geos[v], vcMat(), list.length);
      list.forEach((b, i) => { im.setMatrixAt(i, b.m); im.setColorAt(i, b.c); });
      im.castShadow = true;
      im.computeBoundingSphere();
      world.scene.add(im);
    });
  }
}

export function buildBush(world) {
  const track = world.track;
  // the gums round the clearings, each with a low branch reaching in over the track (brush turkeys sleep up
  // in the trees), and the litter they shed spilling out onto it
  const _p = new THREE.Vector3();
  for (const [a, b] of GUMS) {
    let x = a, z = b;
    if (typeof a === 'string') {
      const [cx, cz, r] = TRACK.clearings[a];
      x = cx + Math.cos(b) * (r + 0.3);
      z = cz + Math.sin(b) * (r + 0.3);
    }
    // (facing the nearest bit of track)
    track.clamp(_p.set(x, 0, z), track.width * 0.5);
    const face = Math.atan2(_p.z - z, _p.x - x);
    const h = rand(6, 8.5);
    const roost = { a: ((Math.floor(rand(0, 4)) + 0.5) / 4) * TAU, y: h * rand(0.32, 0.37), len: rand(2.1, 2.5), rise: rand(0.12, 0.25) };
    const spot = { x, z, h, palette: 'gum' };
    addTree(world, x, z, h, true, roost, spot, face);
    world.treeSpots.push(spot);
    world.stainGround(x, z, 6.5, 0x8f6a3e, 0.55);
  }
  // more of them standing up out of the scrub
  const tall = [];
  for (let i = 0; i < 400 && tall.length < 26; i++) {
    const x = rand(-44, 44), z = rand(-34, BUSH_SOUTH);
    if (track.depth(x, z) < 3.5 || tall.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 9)) continue;
    tall.push([x, z]);
    addTree(world, x, z, rand(7, 10), false);
  }
  buildScrub(world, track);
  // dense bush beyond the edges
  for (let z = -40; z < BUSH_SOUTH + 22; z += rand(3, 5)) {
    addTree(world, -rand(50, 64), z, rand(6, 10), false);
    addTree(world, rand(50, 64), z, rand(6, 10), false);
  }
  for (let x = -66; x < 66; x += rand(3, 5)) addTree(world, x, BUSH_SOUTH + rand(4, 20), rand(6, 10), false);

  for (const [x, z, s] of ROCKS) rock(world, x, z, s);
  for (const [x, z, a] of LOGS) log(world, x, z, a);

  // grass tufts (instanced): all over the mound's clearing, and here and there along the track
  const tuft = merge([
    part(G.cone(0.05, 0.5, 3), 0x6f9a3e, [0, 0.25, 0], [0.2, 0, 0.15]),
    part(G.cone(0.05, 0.42, 3), 0x86b04c, [0.06, 0.21, 0.03], [-0.25, 0, -0.2]),
    part(G.cone(0.05, 0.38, 3), 0x5f8a35, [-0.05, 0.19, -0.04], [0.1, 0, -0.35]),
  ]);
  const N = 900;
  const grass = new THREE.InstancedMesh(tuft, vcMat(), N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const [hx, hz, hr] = TRACK.clearings.home;
  for (let i = 0; i < N; i++) {
    let x, z;
    for (let k = 0; k < 30; k++) {
      if (i < N * 0.55) { const a = rand(0, TAU), d = Math.sqrt(Math.random()) * (hr + 1); x = hx + Math.cos(a) * d; z = hz + Math.sin(a) * d; }
      else { x = rand(-46, 46); z = rand(-37, BUSH_SOUTH); }
      if (Math.hypot(x - HOME.x, z - HOME.z) > 4 && track.depth(x, z) < 0.8) break;
    }
    p.set(x, world.groundHeight(x, z), z);
    q.setFromAxisAngle(up, rand(0, TAU));
    s.setScalar(rand(0.7, 1.5));
    grass.setMatrixAt(i, m.compose(p, q, s));
  }
  world.scene.add(grass);

  // ferns along the edges of the track
  const fern = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU;
    fern.push(part(G.cone(0.16, 1.1, 4), 0x4f7f35, [Math.cos(a) * 0.4, 0.35, Math.sin(a) * 0.4], [Math.sin(a), 0, -Math.cos(a)], [1, 1, 0.3]));
  }
  const fernGeo = merge(fern);
  for (let i = 0, n = 0; i < 2000 && n < 70; i++) {
    const x = rand(-46, 46), z = rand(-37, BUSH_SOUTH);
    const d = track.depth(x, z);
    if (d < -0.9 || d > 0.4 || !world.isFree(x, z, 0) && d < 0) continue;
    const mesh = vcMesh(fernGeo);
    mesh.position.set(x, world.groundHeight(x, z), z);
    mesh.rotation.y = rand(0, TAU);
    mesh.scale.setScalar(rand(0.8, 1.3));
    world.scene.add(mesh);
    n++;
  }
}
