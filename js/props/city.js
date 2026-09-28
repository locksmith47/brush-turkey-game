import * as THREE from 'three';
import { part, merge, vcMesh, G, limb, rand, pick, TAU, toonMat, canvasTexture } from '../util.js';

/*
 * The city: a street along the near side, a row of shops, a back alley behind them, another row of
 * buildings, and the King's plaza at the far end, with the gate out to the oval. Laneways run through the
 * rows: two from the street into the alley (and one more between them, gated off from the street: it only
 * opens from the alley side), and two on from the alley to the plaza, never in line with the first. A
 * giant ibis lurks down the far end of the alley, and the King holds court by the gate, with the key to it
 * round his neck.
 */
const STREET = -118, ALLEY = [-128, -138], PLAZA = -148; // (where the rows of buildings start and end)
// the laneways through each row: [name, x0, x1] (10 m across: room enough for the key and its carriers)
const FRONT_LANES = [['w', -40, -30], ['m', -4, 6], ['e', 20, 30]];
const BACK_LANES = [['w2', -20, -10], ['e2', 28, 38]];
// the gate across the middle laneway's street end, latched on the alley side
export const LANE_GATE = { a: [-4, STREET], b: [6, STREET], latch: [0, -1], kind: 'wire' };

// the lie of the land (see Track): the street, the alley and the plaza, and the laneways between them
// (each reaching a way out into the open at either end, so anything big coming or going is always well
// inside one or the other), with a waypoint out in the open off each end of each laneway (clear of the
// trees, lamps and bins along the footpaths and walls). Everywhere else is buildings
const lane = ([name, x0, x1], z0, z1) => ({ rect: [x0, z1 - 4, x1, z0 + 6], nodes: [`${name}_s`, `${name}_n`] });
export const STREETS = {
  nodes: Object.fromEntries([
    ...FRONT_LANES.flatMap(([name, x0, x1]) => [[`${name}_s`, [(x0 + x1) / 2, STREET + 5]], [`${name}_n`, [(x0 + x1) / 2, ALLEY[0] - 3]]]),
    ...BACK_LANES.flatMap(([name, x0, x1]) => [[`${name}_s`, [(x0 + x1) / 2, ALLEY[1] + 3]], [`${name}_n`, [(x0 + x1) / 2, PLAZA - 2]]]),
  ]),
  rooms: [
    { rect: [-46, STREET, 46, -98], nodes: FRONT_LANES.map(([n]) => `${n}_s`) },
    ...FRONT_LANES.map((l) => lane(l, STREET, ALLEY[0])),
    { rect: [-46, ALLEY[1], 46, ALLEY[0]], nodes: [...FRONT_LANES.map(([n]) => `${n}_n`), ...BACK_LANES.map(([n]) => `${n}_s`)] },
    ...BACK_LANES.map((l) => lane(l, ALLEY[1], PLAZA)),
    { rect: [-46, -170, 46, PLAZA], nodes: BACK_LANES.map(([n]) => `${n}_n`) },
  ],
};

function flat(w, d, color, x, z, y) {
  return part(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), color, [x, y, z]);
}

function put(world, geo, x, z, rotY = 0, colliders = []) {
  const m = vcMesh(geo, { cast: true, receive: true });
  m.position.set(x, 0, z);
  m.rotation.y = rotY;
  world.scene.add(m);
  for (const [cx, cz, r] of colliders) world.colliders.push({ x: x + cx, z: z + cz, r });
  return m;
}

let windowTex = null;
export function building(w, h, d, color) {
  windowTex ??= canvasTexture(64, 64, (c) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, 64, 64);
    c.fillStyle = '#e6e6e6'; c.fillRect(12, 10, 40, 42);
    c.fillStyle = '#3b5068'; c.fillRect(16, 14, 32, 34);
    c.fillStyle = '#6f8faf'; c.fillRect(18, 16, 12, 30);
  });
  windowTex.wrapS = windowTex.wrapT = THREE.RepeatWrapping;
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      if (f === 2 || f === 3) { uv.setXY(i, 0.02, 0.02); continue; } // roof/floor: plain wall colour
      const across = f < 2 ? d : w;
      uv.setXY(i, uv.getX(i) * Math.max(1, Math.round(across / 3)), uv.getY(i) * Math.max(1, Math.round(h / 3.4)));
    }
  }
  const m = new THREE.Mesh(g, toonMat({ map: windowTex, color }));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function fig(h) {
  const p = [limb([0, 0, 0], [0, h * 0.5, 0], 0.55, 0.4, 0x7d7368, 9)];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    p.push(limb([0, 0.6, 0], [Math.cos(a) * 1.1, 0, Math.sin(a) * 1.1], 0.2, 0.08, 0x7d7368, 5));
  }
  const greens = [0x2f5f2f, 0x3b6f35, 0x2a5530];
  for (let i = 0; i < 9; i++) {
    const a = rand(0, TAU), r = rand(0.5, 2.6);
    p.push(part(G.ico(rand(1.3, 1.9), 1), pick(greens), [Math.cos(a) * r, h * 0.55 + rand(0.5, 2.4), Math.sin(a) * r], [rand(0, 3), rand(0, 3), 0], [1, 0.7, 1]));
  }
  return merge(p);
}

// bins: ibis heaven (the red ones are overflowing). Tip them over for what's inside: [kind, x, z, facing]
export const CITY_BINS = [
  ['red', -20, -101.5, 0], ['yellow', -19.2, -101.5, 0], ['red', 8, -116.5, Math.PI], ['red', 9, -116.5, Math.PI],
  ['red', -24, -129.3, Math.PI], ['red', 13, -129.3, Math.PI], ['yellow', 18, -136.7, 0], ['green', 44.5, -131, -Math.PI / 2],
  ['red', -2, -136.7, 0], ['green', -33.5, -166.5, 0.5], ['green', 33.5, -166.5, -0.5],
];

/**
 * A row of buildings from z0 to z1 (all the way across, bar its laneways), a few of them to each block,
 * each a different height and colour. They go see-through when they're in the way of the camera
 */
function row(world, z0, z1, lanes, shopfronts) {
  const cols = [0xa0523d, 0xd9c49a, 0x9aa3ab, 0x6fa3b0, 0xc47c5a, 0xb9b39f, 0xc9a27a, 0x8f9c84];
  const awnings = [0x2f6fb0, 0xc0392b, 0x2e8b57, 0xe0a526];
  const edges = [-50, ...lanes.flatMap(([, x0, x1]) => [x0, x1]), 50];
  for (let i = 0; i < edges.length; i += 2) {
    const a = edges[i], b = edges[i + 1], n = Math.max(1, Math.round((b - a) / 11)), w = (b - a) / n;
    for (let k = 0; k < n; k++) {
      const h = rand(5.5, 9.5), x = a + w * (k + 0.5), m = building(w - 0.1, h, z0 - z1, pick(cols));
      m.position.set(x, h / 2, (z0 + z1) / 2);
      world.scene.add(m);
      world.addOccluder(m);
      // (a shop awning over the footpath)
      if (shopfronts) {
        const aw = vcMesh(merge([part(G.box(w - 1.2, 0.12, 1.6), pick(awnings), [0, 0, 0.8], [0.18, 0, 0])]), { cast: true, receive: false });
        aw.position.set(x, 3.1, z0);
        world.scene.add(aw);
      }
    }
  }
}

export function buildCity(world) {
  const s = world.scene, track = world.tracks[2];
  const ground = [
    flat(92, 6, 0xc9c6bd, 0, -101, 0.03),
    flat(92, 10, 0x4a4d52, 0, -109, 0.02),
    flat(92, 4, 0xc9c6bd, 0, -116, 0.03),
    flat(92, ALLEY[0] - ALLEY[1], 0x6f6c66, 0, (ALLEY[0] + ALLEY[1]) / 2, 0.02),
    flat(92, 0.3, 0x55524d, 0, (ALLEY[0] + ALLEY[1]) / 2, 0.03), // (the drain down the middle of the alley)
  ];
  for (const [, x0, x1] of FRONT_LANES) ground.push(flat(x1 - x0, STREET - ALLEY[0], 0x8f8b84, (x0 + x1) / 2, (STREET + ALLEY[0]) / 2, 0.025));
  for (const [, x0, x1] of BACK_LANES) ground.push(flat(x1 - x0, ALLEY[1] - PLAZA, 0x8f8b84, (x0 + x1) / 2, (ALLEY[1] + PLAZA) / 2, 0.025));
  for (let x = -44; x < 46; x += 6) ground.push(flat(3, 0.18, 0xf2d24b, x, -109, 0.035));
  for (const z of [-104.5, -113.5]) ground.push(flat(92, 0.15, 0xf2f2f2, 0, z, 0.035));
  for (let x = -11; x <= -5; x += 1) ground.push(flat(0.55, 9, 0xf2f2f2, x, -109, 0.04));
  // the plaza's paving
  for (let i = 0; i < 23; i++) {
    for (let j = 0; j < Math.round((PLAZA + 170) / 4); j++) {
      ground.push(flat(4, 4, (i + j) % 2 ? 0xd6cdbd : 0xcdc3b2, -44 + i * 4 + 2, PLAZA - j * 4 - 2, 0.03));
    }
  }
  s.add(vcMesh(merge(ground), { cast: false, receive: true }));

  // buildings frame the streets (outside the play area), and the two rows between the street, the alley and the plaza
  const cols = [0xa0523d, 0xd9c49a, 0x9aa3ab, 0x6fa3b0, 0xc47c5a, 0xb9b39f];
  for (let z = -100; z > -166; z -= 13) {
    for (const side of [-1, 1]) {
      const w = rand(9, 12), h = rand(9, 24);
      const b = building(w, h, 12, pick(cols));
      b.position.set(side * (50 + w / 2), h / 2, z - 6);
      s.add(b);
    }
  }
  row(world, STREET, ALLEY[0], FRONT_LANES, true);
  row(world, ALLEY[1], PLAZA, BACK_LANES, false);
  // (the way through a laneway keeps to the middle of it, clear of the corners, where the key's carriers need the room)
  for (const [lanes, z0, z1] of [[FRONT_LANES, STREET, ALLEY[0]], [BACK_LANES, ALLEY[1], PLAZA]]) {
    for (const [, x0, x1] of lanes) {
      for (const z of [z0, z1]) {
        track.addWall({ ax: x0, az: z, bx: x0 + (x1 - x0) * 0.35, bz: z, active: true, guide: true }, false);
        track.addWall({ ax: x1 - (x1 - x0) * 0.35, az: z, bx: x1, bz: z, active: true, guide: true }, false);
      }
    }
  }
  track.plan();

  // Moreton Bay figs in planters in the plaza, and street trees along the shops
  for (const [x, z, big] of [[-38, -158, 1], [42, -157, 1], [14, -167, 1], [-24, -115.5, 0], [14, -115.5, 0], [40, -115.5, 0]]) {
    const h = big ? rand(6, 7.5) : rand(4, 5);
    const m = vcMesh(fig(h));
    m.position.set(x, 0, z);
    world.addSway(m);
    s.add(m);
    if (big) put(world, merge([part(G.cyl(2.2, 2.3, 0.5, 20), 0x9c9689, [0, 0.25, 0]), part(G.cyl(2.0, 2.0, 0.02, 20), 0x5b4230, [0, 0.5, 0])]), x, z, 0, [[0, 0, 2.3]]);
    else world.colliders.push({ x, z, r: 0.5 });
    world.treeSpots.push({ x, z, h: h + 2, palette: 'fig' });
  }

  // benches, lamps, bus stop
  const bench = merge([
    part(G.box(2, 0.08, 0.5), 0x8a5a3a, [0, 0.48, 0]),
    part(G.box(2, 0.5, 0.08), 0x8a5a3a, [0, 0.8, -0.22], [-0.15, 0, 0]),
    part(G.box(0.08, 0.5, 0.5), 0x333333, [-0.9, 0.25, 0]),
    part(G.box(0.08, 0.5, 0.5), 0x333333, [0.9, 0.25, 0]),
  ]);
  for (const [x, z, r] of [[-30, -151, 0], [6, -155, 0], [-44, -106, Math.PI / 2], [44, -162, -Math.PI / 2]]) put(world, bench, x, z, r, [[-0.6, 0, 0.45], [0.6, 0, 0.45]].map(([a, b, c]) => [a * Math.cos(r), -a * Math.sin(r), c]));
  const lamp = merge([
    part(G.cyl(0.07, 0.09, 4, 8), 0x3a3f44, [0, 2, 0]),
    limb([0, 3.9, 0], [0.6, 4.1, 0], 0.05, 0.05, 0x3a3f44, 6),
    part(G.box(0.4, 0.14, 0.25), 0xfff3c4, [0.7, 4.0, 0]),
  ]);
  for (const x of [-40, -24, 8, 24, 40]) put(world, lamp, x, -99.4, -Math.PI / 2, [[0, 0, 0.15]]); // (none in front of the gate)
  for (const x of [-20, -8, 11, 36]) put(world, lamp, x, -117.2, Math.PI / 2, [[0, 0, 0.15]]);
  for (const [x, z] of [[-26, -168.6], [2, -168.6], [30, -168.6]]) put(world, lamp, x, z, Math.PI / 2, [[0, 0, 0.15]]);
  put(world, merge([
    part(G.box(4, 0.1, 1.6), 0x6c7a89, [0, 2.5, 0]),
    part(G.box(0.08, 2.5, 0.08), 0x6c7a89, [-1.9, 1.25, -0.7]),
    part(G.box(0.08, 2.5, 0.08), 0x6c7a89, [1.9, 1.25, -0.7]),
    part(G.box(3.6, 2.0, 0.04), 0xbfe3f5, [0, 1.4, -0.75]),
    part(G.box(2.4, 0.08, 0.4), 0x8a5a3a, [0, 0.5, -0.4]),
  ]), 26, -101, 0, [[-1.3, -0.5, 0.6], [0, -0.5, 0.6], [1.3, -0.5, 0.6]]);

  // out the back: pallets and crates stacked against the walls of the alley
  const crates = [];
  for (const [x, z, n] of [[-44.5, -137, 1], [33, -129.8, 3], [42, -137, 2]]) {
    for (let i = 0; i < n; i++) crates.push(part(G.box(1.1, 0.9, 1.1), pick([0xa47c52, 0x8f6b45, 0xb58d5e]), [x + (i % 2) * 1.15, 0.45 + Math.floor(i / 2) * 0.9, z], [0, rand(-0.2, 0.2), 0]));
    world.colliders.push({ x: x + (n > 1 ? 0.55 : 0), z, r: n > 1 ? 1.2 : 0.8 });
  }
  s.add(vcMesh(merge(crates), { cast: true, receive: true }));

  // fountain
  put(world, merge([
    part(G.cyl(2.3, 2.4, 0.6, 28), 0xbab3a4, [0, 0.3, 0]),
    part(G.cyl(2.05, 2.05, 0.03, 28), 0x6cc3ea, [0, 0.52, 0]),
    part(G.cyl(0.25, 0.35, 1.6, 10), 0xbab3a4, [0, 0.8, 0]),
    part(G.cyl(0.8, 0.5, 0.25, 16), 0xbab3a4, [0, 1.6, 0]),
    part(G.ico(0.35, 1), 0xbfe9ff, [0, 1.9, 0]),
  ]), 24, -159, 0, [[0, 0, 2.4]]);

  // the King's throne, by the gate out: an overflowing skip bin
  const skip = [
    part(G.box(5, 1.6, 2.6), 0xe0a526, [0, 0.8, 0]),
    part(G.box(5.2, 0.12, 2.8), 0xb88418, [0, 1.62, 0]),
  ];
  for (let i = 0; i < 16; i++) skip.push(part(G.ico(rand(0.2, 0.45), 0), pick([0xe8e2d0, 0x6b4f3a, 0xd94c3d, 0x4d96ff, 0x333333]), [rand(-2.2, 2.2), 1.7 + rand(0, 0.4), rand(-1, 1)], [rand(0, 3), rand(0, 3), 0]));
  put(world, merge(skip), -4, -165, 0, [[-1.6, 0, 1.4], [0, 0, 1.4], [1.6, 0, 1.4]]);
}
