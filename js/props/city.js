import * as THREE from 'three';
import { part, merge, vcMesh, G, limb, rand, pick, TAU, toonMat, canvasTexture } from '../util.js';
import { staticBinGeo, knockedBinGeo, KNOCKED_AT } from '../bin.js';
import { bagGeo, tornBagGeo } from '../binbag.js';

/*
 * The city: a street along the near side, a row of shops, a back alley behind them, another row of
 * buildings, and a plaza. Laneways run through the rows: two from the street into the alley (and one more
 * between them, gated off from the street: it only opens from the alley side), and two on from the alley to
 * the plaza, never in line with the first. A giant ibis lurks down the far end of the alley.
 *
 * From the far side of the plaza, the bin alley runs on towards the gate out, between the backs of tall
 * buildings: lined with bins (knocked over and picked clean, most of them) and bin bags (torn open), with
 * ibises big and small loitering about them. It comes out into the King's court, where the King sits on his
 * throne of bins in front of the gate, with the key to it round his neck.
 */
const STREET = -118, ALLEY = [-128, -138], PLAZA = -148, YARD = -170; // (where the rows of buildings start and end)
// the laneways through each row: [name, x0, x1] (10 m across: room enough for the key and its carriers)
const FRONT_LANES = [['w', -40, -30], ['m', -4, 6], ['e', 20, 30]];
const BACK_LANES = [['w2', -20, -10], ['e2', 28, 38]];
// the bin alley, in line with the gate out, and the King's court at the end of it (up to the fence)
const BIN_ALLEY = ['bin', -26, -14], COURT = { x0: -40, x1: 0, z0: -198, z1: -220 };
// the gate across the middle laneway's street end, latched on the alley side
export const LANE_GATE = { a: [-4, STREET], b: [6, STREET], latch: [0, -1], kind: 'wire' };
/**
 * The King's throne of bins, in the middle of his court: it faces up the bin alley, with the gate out behind
 * it. He sits `sitZ` in front of the middle of the seat (`seatY` up), and gets down onto the ground at `front`
 */
export const THRONE = { x: -20, z: -208, seatY: 1.65, sitZ: 0.5, front: 3.9 };
/** is (x, z) on the way to the King: down the bin alley, or in his court? */
export const onKingsWay = (x, z) => z < YARD && z > COURT.z1 && x > (z > COURT.z0 ? BIN_ALLEY[1] : COURT.x0) && x < (z > COURT.z0 ? BIN_ALLEY[2] : COURT.x1);

// the lie of the land (see Track): the street, the alley, the plaza and the King's court, and the laneways
// between them (each reaching a way out into the open at either end, so anything big coming or going is
// always well inside one or the other), with a waypoint out in the open off each end of each laneway (clear
// of the trees, lamps and bins along the footpaths and walls), and round the King's throne. Everywhere else
// is buildings
const lane = ([name, x0, x1], z0, z1) => ({ rect: [x0, z1 - 4, x1, z0 + 6], nodes: [`${name}_s`, `${name}_n`] });
export const STREETS = {
  nodes: Object.fromEntries([
    ...FRONT_LANES.flatMap(([name, x0, x1]) => [[`${name}_s`, [(x0 + x1) / 2, STREET + 5]], [`${name}_n`, [(x0 + x1) / 2, ALLEY[0] - 3]]]),
    ...BACK_LANES.flatMap(([name, x0, x1]) => [[`${name}_s`, [(x0 + x1) / 2, ALLEY[1] + 3]], [`${name}_n`, [(x0 + x1) / 2, PLAZA - 2]]]),
    ['bin_s', [THRONE.x, YARD + 3]], ['bin_n', [THRONE.x, COURT.z0 - 3]],
    // (the way round the throne keeps well clear of it: the key's carriers need the room)
    ...[['l', -1], ['r', 1]].flatMap(([s, k]) => [[`throne_${s}`, [THRONE.x + k * 8, THRONE.z + 5]], [`throne_b${s}`, [THRONE.x + k * 8, THRONE.z - 6.5]]]),
  ]),
  rooms: [
    { rect: [-46, STREET, 46, -98], nodes: FRONT_LANES.map(([n]) => `${n}_s`) },
    ...FRONT_LANES.map((l) => lane(l, STREET, ALLEY[0])),
    { rect: [-46, ALLEY[1], 46, ALLEY[0]], nodes: [...FRONT_LANES.map(([n]) => `${n}_n`), ...BACK_LANES.map(([n]) => `${n}_s`)] },
    ...BACK_LANES.map((l) => lane(l, ALLEY[1], PLAZA)),
    { rect: [-46, YARD, 46, PLAZA], nodes: [...BACK_LANES.map(([n]) => `${n}_n`), 'bin_s'] },
    lane(BIN_ALLEY, YARD, COURT.z0),
    { rect: [COURT.x0, COURT.z1, COURT.x1, COURT.z0], nodes: ['bin_n', 'throne_l', 'throne_r', 'throne_bl', 'throne_br'] },
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

// bins: ibis heaven (the red ones are overflowing). Tip them over for what's inside: [kind, x, z, facing]. They
// stand in pairs along the walls of the bin alley...
const W = BIN_ALLEY[1] + 0.65, E = BIN_ALLEY[2] - 0.65, IN_W = Math.PI / 2, IN_E = -Math.PI / 2; // (facing into the alley)
export const CITY_BINS = [
  ['red', -20, -101.5, 0], ['yellow', -19.2, -101.5, 0], ['red', 8, -116.5, Math.PI], ['red', 9, -116.5, Math.PI],
  ['red', -24, -129.3, Math.PI], ['red', 13, -129.3, Math.PI], ['yellow', 18, -136.7, 0], ['green', 44.5, -131, -Math.PI / 2],
  ['red', -2, -136.7, 0], ['green', -33.5, -166.5, 0.5], ['green', 33.5, -166.5, -0.5],
  ['red', W, -173.6, IN_W], ['yellow', W, -188.4, IN_W], ['red', E, -191.1, IN_E],
];
// ...where most of them have been knocked over and picked clean already: [kind, x, z, facing, which way it fell]
const KNOCKED_BINS = [
  ['yellow', W, -174.4, IN_W, IN_W + 0.7], ['red', E, -177.1, IN_E, IN_E - 0.5], ['green', E, -177.9, IN_E, Math.PI + 0.2],
  ['red', W, -180.6, IN_W, IN_W - 0.35], ['yellow', W, -181.4, IN_W, IN_W + 0.15], ['red', E, -184.1, IN_E, -0.25],
  ['yellow', E, -184.9, IN_E, IN_E + 0.6], ['red', W, -187.6, IN_W, IN_W - 0.6], ['green', E, -191.9, IN_E, IN_E - 0.3],
  ['red', W, -194.6, IN_W, Math.PI - 0.25], ['red', W, -195.4, IN_W, IN_W + 0.45],
];
// bin bags dumped down the bin alley and round the King's court, to tear open: [x, z]...
export const CITY_BAGS = [
  [-24.7, -178.2], [-15.3, -181.3], [-15.2, -188.2], [-24.8, -191.3], [-15.6, -196.6],
  [-36.8, -201.5], [-37.4, -202.6], [-3.6, -202.2], [-37.6, -215.4],
];
// ...and the ones the ibises have been into already
const TORN_BAGS = [[-22.6, -176.4], [-17.8, -180.2], [-21.4, -186.8], [-18.3, -193.8], [-23.8, -197.1], [-2.8, -216.1]];
// ...and the ibises loitering round them, picking them over: [kind, x, z]
export const ALLEY_IBISES = [
  ['ibis', -23.2, -176.2], ['big', -17.2, -179.2], ['ibis', -22.8, -183.2],
  ['ibis', -16.9, -186.6], ['big', -22.4, -192.6], ['ibis', -17.1, -194.4],
];

/**
 * A row of buildings from z0 to z1 (all the way across, bar its laneways), a few of them to each block,
 * each a different height (between `heights`) and colour. They go see-through when they're in the way of
 * the camera
 */
function row(world, z0, z1, lanes, shopfronts, heights = [5.5, 9.5]) {
  const cols = [0xa0523d, 0xd9c49a, 0x9aa3ab, 0x6fa3b0, 0xc47c5a, 0xb9b39f, 0xc9a27a, 0x8f9c84];
  const awnings = [0x2f6fb0, 0xc0392b, 0x2e8b57, 0xe0a526];
  const edges = [-50, ...lanes.flatMap(([, x0, x1]) => [x0, x1]), 50];
  for (let i = 0; i < edges.length; i += 2) {
    const a = edges[i], b = edges[i + 1], n = Math.max(1, Math.round((b - a) / 11)), w = (b - a) / n;
    for (let k = 0; k < n; k++) {
      const h = rand(...heights), x = a + w * (k + 0.5), m = building(w - 0.1, h, z0 - z1, pick(cols));
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
  // the plaza's paving (the last row cut short at the buildings, not running on into the bin alley and over its drain)
  for (let i = 0; i < 23; i++) {
    for (let j = 0, z = PLAZA; z > YARD; j++, z -= 4) {
      const d = Math.min(4, z - YARD);
      ground.push(flat(4, d, (i + j) % 2 ? 0xd6cdbd : 0xcdc3b2, -44 + i * 4 + 2, z - d / 2, 0.03));
    }
  }
  binAlleyGround(ground);
  s.add(vcMesh(merge(ground), { cast: false, receive: true }));

  // buildings frame the streets (outside the play area), and the two rows between the street, the alley and
  // the plaza; beyond the plaza, the bin alley's a canyon between the backs of tall buildings, and the King's
  // court is hemmed in by more
  const cols = [0xa0523d, 0xd9c49a, 0x9aa3ab, 0x6fa3b0, 0xc47c5a, 0xb9b39f];
  for (let z = -100; z > COURT.z1 + 4; z -= 13) {
    for (const side of [-1, 1]) {
      const w = rand(9, 12), h = rand(9, 24);
      const b = building(w, h, 12, pick(cols));
      b.position.set(side * (50 + w / 2), h / 2, z - 6);
      s.add(b);
    }
  }
  row(world, STREET, ALLEY[0], FRONT_LANES, true);
  row(world, ALLEY[1], PLAZA, BACK_LANES, false);
  row(world, YARD, COURT.z0, [BIN_ALLEY], false, [10, 17]);
  row(world, COURT.z0, COURT.z1 + 0.4, [['court', COURT.x0, COURT.x1]], false, [8, 13]);
  // (the way through a laneway keeps to the middle of it, clear of the corners, where the key's carriers need the room)
  for (const [lanes, z0, z1] of [[FRONT_LANES, STREET, ALLEY[0]], [BACK_LANES, ALLEY[1], PLAZA], [[BIN_ALLEY], YARD, COURT.z0]]) {
    for (const [, x0, x1] of lanes) {
      for (const z of [z0, z1]) {
        track.addWall({ ax: x0, az: z, bx: x0 + (x1 - x0) * 0.35, bz: z, active: true, guide: true }, false);
        track.addWall({ ax: x1 - (x1 - x0) * 0.35, az: z, bx: x1, bz: z, active: true, guide: true }, false);
      }
    }
  }
  // (and it goes well clear of the King's throne, round the back of it to the gate)
  const { x: tx, z: tz } = THRONE;
  for (const [ax, az, bx, bz] of [[tx - 5, tz + 3, tx - 5, tz - 4.5], [tx - 5, tz - 4.5, tx + 5, tz - 4.5], [tx + 5, tz - 4.5, tx + 5, tz + 3]]) {
    track.addWall({ ax, az, bx, bz, active: true, guide: true }, false);
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
  // (turkeys come and perch along the backs of the benches, like they own the place: see Perches)
  const seats = [], backs = [-0.66, 0, 0.66].map((x) => ({ at: [x, 1.05, -0.26], face: 0, ground: [x, 1.1], hop: [0.45, 0.8] }));
  for (const [x, z, r] of [[-30, -151, 0], [6, -155, 0], [-44, -106, Math.PI / 2], [44, -162, -Math.PI / 2]]) {
    seats.push({ obj: put(world, bench, x, z, r, [[-0.6, 0, 0.45], [0.6, 0, 0.45]].map(([a, b, c]) => [a * Math.cos(r), -a * Math.sin(r), c])), perches: backs });
  }
  const lamp = merge([
    part(G.cyl(0.07, 0.09, 4, 8), 0x3a3f44, [0, 2, 0]),
    limb([0, 3.9, 0], [0.6, 4.1, 0], 0.05, 0.05, 0x3a3f44, 6),
    part(G.box(0.4, 0.14, 0.25), 0xfff3c4, [0.7, 4.0, 0]),
  ]);
  for (const x of [-40, -24, 8, 24, 40]) put(world, lamp, x, -99.4, -Math.PI / 2, [[0, 0, 0.15]]); // (none in front of the gate)
  for (const x of [-20, -8, 11, 36]) put(world, lamp, x, -117.2, Math.PI / 2, [[0, 0, 0.15]]);
  for (const [x, z] of [[-30, -168.6], [2, -168.6], [30, -168.6]]) put(world, lamp, x, z, Math.PI / 2, [[0, 0, 0.15]]); // (none in front of the bin alley)
  const stop = put(world, merge([
    part(G.box(4, 0.1, 1.6), 0x6c7a89, [0, 2.5, 0]),
    part(G.box(0.08, 2.5, 0.08), 0x6c7a89, [-1.9, 1.25, -0.7]),
    part(G.box(0.08, 2.5, 0.08), 0x6c7a89, [1.9, 1.25, -0.7]),
    part(G.box(3.6, 2.0, 0.04), 0xbfe3f5, [0, 1.4, -0.75]),
    part(G.box(2.4, 0.08, 0.4), 0x8a5a3a, [0, 0.5, -0.4]),
  ]), 26, -101, 0, [[-1.3, -0.5, 0.6], [0, -0.5, 0.6], [1.3, -0.5, 0.6]]);
  // (a couple of them waiting for the bus, sat side by side on the seat, looking up the street for it)
  seats.push({ obj: stop, perches: [-0.55, 0.65].map((x) => ({ at: [x, 0.54, -0.4], face: -Math.PI / 2, ground: [x, 0.6], hop: [0.35, 0.5] })) });

  // out the back: pallets and crates stacked against the walls of the alley
  const crates = [];
  for (const [x, z, n] of [[-44.5, -137, 1], [33, -129.8, 3], [42, -137, 2]]) {
    for (let i = 0; i < n; i++) crates.push(part(G.box(1.1, 0.9, 1.1), pick([0xa47c52, 0x8f6b45, 0xb58d5e]), [x + (i % 2) * 1.15, 0.45 + Math.floor(i / 2) * 0.9, z], [0, rand(-0.2, 0.2), 0]));
    world.colliders.push({ x: x + (n > 1 ? 0.55 : 0), z, r: n > 1 ? 1.2 : 0.8 });
  }
  s.add(vcMesh(merge(crates), { cast: true, receive: true }));

  // fountain: a basin of water with a rounded stone lip round it (turkeys perch on the lip, looking out)
  const fountain = put(world, merge([
    part(G.cyl(2.3, 2.4, 0.42, 28), 0xbab3a4, [0, 0.21, 0]),
    part(G.torus(2.14, 0.16, 8, 44), 0xc4bdae, [0, 0.46, 0], [Math.PI / 2, 0, 0]),
    part(G.cyl(2.05, 2.05, 0.03, 28), 0x6cc3ea, [0, 0.5, 0]),
    part(G.cyl(0.25, 0.35, 1.6, 10), 0xbab3a4, [0, 0.8, 0]),
    part(G.cyl(0.8, 0.5, 0.25, 16), 0xbab3a4, [0, 1.6, 0]),
    part(G.ico(0.35, 1), 0xbfe9ff, [0, 1.9, 0]),
  ]), 24, -159, 0, [[0, 0, 2.4]]);
  seats.push({
    obj: fountain,
    perches: Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * TAU + 0.3, x = Math.cos(a), z = Math.sin(a);
      return { at: [x * 2.14, 0.62, z * 2.14], face: Math.PI / 2 - a, ground: [x * 3.1, z * 3.1], hop: [0.38, 0.55] };
    }),
  });

  // down the bin alley: the bins and bags the ibises have been into, and what was in them strewn about (they've
  // had the lot), the backs of the buildings, a dumpster or two, and festoon lights strung across it
  const junk = [];
  for (const [kind, x, z, facing, fell] of KNOCKED_BINS) {
    junk.push(knockedBinGeo(kind, facing, fell).translate(x, 0, z));
    world.colliders.push({ x: x + Math.sin(fell) * KNOCKED_AT, z: z + Math.cos(fell) * KNOCKED_AT, r: 0.42 });
    scraps(junk, x + Math.sin(fell) * 1.45, z + Math.cos(fell) * 1.45, fell, 6);
  }
  for (const [x, z] of TORN_BAGS) {
    junk.push(tornBagGeo().rotateY(rand(0, TAU)).translate(x, 0, z));
    scraps(junk, x, z, rand(0, TAU), 5, 1.2);
  }
  for (let i = 0; i < 4; i++) scraps(junk, THRONE.x + rand(-6, 6), THRONE.z + rand(4, 8), rand(0, TAU), 4, 1.4);
  alleyWalls(junk);
  s.add(vcMesh(merge(junk), { cast: false, receive: true }));
  for (const [x, z, face] of [[W + 0.1, -184.5, Math.PI / 2], [E - 0.1, -173.8, -Math.PI / 2]]) put(world, dumpster(), x, z, face, [[0, -0.55, 0.75], [0, 0.55, 0.75]]);
  festoons(s);

  // the King's court: his throne, and a bin fire burning either side of the way in
  throne(world);
  const flames = [];
  for (const x of [COURT.x0 + 10, COURT.x1 - 10]) fireBarrel(world, x, COURT.z0 - 1.5, flames);
  return {
    seats, // (for turkeys to perch on: see main.js)
    update(dt, t) {
      const p = world.game.player.pos;
      for (const f of flames) {
        const a = Math.sin(t * 11 + f.ph) * 0.6 + Math.sin(t * 23.7 + f.ph * 2) * 0.4;
        f.outer.scale.set(1 + a * 0.07, 1 + a * 0.2, 1 + a * 0.07);
        f.inner.scale.set(1, 1 + Math.sin(t * 17 + f.ph) * 0.18, 1);
        f.g.rotation.y += dt * 1.6;
        f.glow.material.opacity = 0.36 + a * 0.05;
        // (and embers floating up out of it, when there's anyone about to see them)
        if (Math.abs(p.z - f.at.z) < 45 && (f.ember -= dt) <= 0) {
          f.ember = rand(0.08, 0.2);
          world.game.fx.burst(f.at, { glow: true, n: 1, colors: [0xffa040, 0xffd060, 0xff6a20], speed: [0.1, 0.5], up: [1.4, 2.6], grav: 0.4, drag: 1.2, size: [0.03, 0.06], life: [0.7, 1.3] });
        }
      }
    },
  };
}

/** the bin alley's grimy asphalt (a drain down the middle, oil stains, puddles), the court's old concrete slabs, and the King's red carpet */
function binAlleyGround(ground) {
  const [, x0, x1] = BIN_ALLEY, cx = (x0 + x1) / 2, cz = (YARD + COURT.z0) / 2;
  ground.push(flat(x1 - x0, YARD - COURT.z0, 0x5f5c57, cx, cz, 0.02), flat(0.3, YARD - COURT.z0, 0x46433e, cx, cz, 0.03));
  // (grime: each patch a hair higher than the last, so where two overlap one's plainly on top, and all of them under
  // the stains the rubbish has left)
  for (let i = 0; i < 9; i++) {
    ground.push(part(new THREE.CircleGeometry(rand(0.4, 1.1), 12).rotateX(-Math.PI / 2), pick([0x45423e, 0x4b4843, 0x3f3d39]), [rand(x0 + 1, x1 - 1), 0.021 + i * 0.00075, rand(COURT.z0 + 1, YARD - 1)], [0, rand(0, TAU), 0], [1, 1, rand(0.5, 0.9)]));
  }
  // (puddles, lying over the drain and any mess in the way)
  for (const [x, z, r] of [[-19, -181.5, 1.3], [-22.5, -190.5, 0.9], [-16.5, -197, 1.1]]) {
    ground.push(part(new THREE.CircleGeometry(r, 16).rotateX(-Math.PI / 2), 0x6e8494, [x, 0.033, z], [0, rand(0, TAU), 0], [1, 1, 0.65]));
  }
  const nx = Math.round((COURT.x1 - COURT.x0) / 4), nz = Math.round((COURT.z0 - COURT.z1) / 4.4);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) ground.push(flat(4, 4.4, (i + j) % 2 ? 0xb1aa9d : 0xa8a194, COURT.x0 + i * 4 + 2, COURT.z0 - j * 4.4 - 2.2, 0.025));
  }
  // (the red carpet up to the throne: well, a tatty old rug off someone's kerb)
  const r0 = COURT.z0 - 0.8, r1 = THRONE.z + 1.4, rl = r0 - r1, rz = (r0 + r1) / 2;
  ground.push(flat(2.4, rl, 0xa3242c, THRONE.x, rz, 0.04));
  for (const k of [-1, 1]) ground.push(flat(0.14, rl, 0xd9a93a, THRONE.x + k * 1.13, rz, 0.045));
  for (let i = 0; i < 11; i++) ground.push(flat(0.05, 0.25, 0xe8d8a8, THRONE.x - 1.1 + i * 0.22, r0 + 0.12, 0.042));
  for (const [dx, dz, w, d] of [[-0.5, -2.2, 0.7, 0.5], [0.4, 1.8, 0.5, 0.8]]) ground.push(flat(w, d, 0x7e1b22, THRONE.x + dx, rz + dz, 0.043));
}

let sheets = 0; // (how many bits of paper scraps() has dropped so far)
/** what's left of a bin's (or bag's) rubbish once the ibises have been through it, strewn about round (x, z), mostly off towards `dir` */
function scraps(p, x, z, dir, n, spread = 1.8) {
  const paper = [0xd9d4c5, 0xbfb8a5, 0xc9b99a, 0x9fb0bf, 0xd7c9a8];
  p.push(part(new THREE.CircleGeometry(rand(0.6, 0.9), 10).rotateX(-Math.PI / 2), 0x4b4842, [x, 0.028, z], [0, rand(0, TAU), 0], [1, 1, 0.6])); // (a stain)
  for (let i = 0; i < n; i++) {
    const a = dir + rand(-1, 1), d = rand(0.1, spread), px = x + Math.sin(a) * d, pz = z + Math.cos(a) * d, k = Math.random();
    // (torn paper, wrappers: each sheet a hair higher than the last, so where they land on each other one's plainly on top,
    // and all of them clear of the King's rug)
    if (k < 0.45) p.push(part(G.box(rand(0.12, 0.3), 0.012, rand(0.1, 0.24)), pick(paper), [px, 0.041 + (sheets++ % 5) * 0.0015, pz], [0, rand(0, TAU), 0]));
    else if (k < 0.7) p.push(part(G.cyl(0.018, 0.018, 0.2, 5), 0xece6d6, [px, 0.04, pz], [Math.PI / 2, 0, rand(0, TAU)])); // (chicken bones)
    else if (k < 0.88) p.push(part(G.cyl(0.07, 0.075, 0.04, 8), 0xa9b0b5, [px, 0.035, pz])); // (a can, stamped flat)
    else p.push(part(G.box(0.42, 0.035, 0.42), 0xc9a877, [px, 0.04, pz], [0, rand(0, TAU), 0])); // (a pizza box, licked clean)
  }
}

/** the backs of the buildings down the bin alley: drainpipes, back doors with a light over them, air-conditioners, graffiti */
function alleyWalls(p) {
  const walls = [[BIN_ALLEY[1], 1, [-178, -189.6], [[-183.2, 3.1]]], [BIN_ALLEY[2], -1, [-175.6, -186.4, -196.2], [[-181, 2.8], [-192.4, 3.4]]]];
  for (const [x, k, doors, acs] of walls) {
    const f = x + k * 0.03; // (the face of the wall, k being which way it faces)
    for (let z = YARD - 2.5; z > COURT.z0 + 1; z -= 6.2) {
      p.push(part(G.cyl(0.07, 0.07, 9, 8), 0x8d9296, [f + k * 0.1, 4.5, z]), limb([f + k * 0.1, 0.35, z], [f + k * 0.4, 0.06, z], 0.07, 0.07, 0x8d9296, 8));
    }
    for (const z of doors) {
      p.push(
        part(G.box(0.08, 2.3, 1.3), 0x2f3338, [f, 1.15, z]),
        part(G.box(0.1, 2.1, 1.1), pick([0x55606b, 0x6b4f3a, 0x3d5a6b]), [f + k * 0.02, 1.05, z]),
        part(G.box(0.7, 0.14, 1.5), 0x9c988f, [f + k * 0.35, 0.07, z]),
        part(G.box(0.25, 0.16, 0.3), 0xfff0c0, [f + k * 0.14, 2.55, z]),
      );
    }
    for (const [z, y] of acs) {
      p.push(part(G.box(0.6, 0.62, 0.95), 0xd8d6cc, [f + k * 0.3, y, z]), part(G.box(0.02, 0.48, 0.8), 0x6b6e70, [f + k * 0.61, y, z]));
    }
    // (each tag sprayed over the ones before it, a hair further out from the wall, so where they overlap it's clear which is on top)
    for (let i = 0; i < 5; i++) {
      p.push(part(G.box(0.02, rand(0.4, 1.1), rand(0.8, 2.2)), pick([0xe84a8a, 0x3aa0ff, 0x7bd34f, 0xff8c1a, 0xb36bff]), [f + k * (0.012 + i * 0.005), rand(0.8, 1.9), rand(COURT.z0 + 3, YARD - 3)], [rand(-0.3, 0.3), 0, 0]));
    }
    crownTag(p, f + k * 0.05, 2.3, COURT.z0 + 2.4); // (where the King's patch starts: sprayed over the lot)
  }
}

/** a crown sprayed on a wall (a wall along z, at x), at height y */
function crownTag(p, x, y, z) {
  const gold = 0xf2c230;
  p.push(part(G.box(0.02, 0.26, 1.2), gold, [x, y, z]));
  for (let i = -1; i <= 1; i++) {
    p.push(
      part(G.box(0.02, 0.62, 0.12), gold, [x, y + 0.4, z + i * 0.45 - 0.13], [0.45, 0, 0]),
      part(G.box(0.02, 0.62, 0.12), gold, [x, y + 0.4, z + i * 0.45 + 0.13], [-0.45, 0, 0]),
      part(G.sphere(0.07, 6, 5), 0xe0245e, [x, y + 0.74, z + i * 0.45]),
    );
  }
}

/** a commercial dumpster: a big steel bin on castors, one half of its lid flung open (long side along x, front +z) */
function dumpster() {
  const c = 0x2f5f4a, c2 = 0x264c3b;
  const p = [
    part(G.box(2.0, 1.1, 1.2), c, [0, 0.75, 0]),
    part(G.box(2.06, 0.08, 1.26), c2, [0, 1.32, 0]),
    part(G.box(1.0, 0.06, 1.24), c2, [-0.5, 1.39, 0], [0.1, 0, 0]),
    part(G.box(1.0, 0.06, 1.24), c2, [0.5, 2.0, -0.55], [-1.45, 0, 0]),
  ];
  for (const x of [-0.85, 0.85]) for (const z of [-0.45, 0.45]) p.push(part(G.cyl(0.09, 0.09, 0.08, 10), 0x222222, [x, 0.12, z], [0, 0, Math.PI / 2]));
  for (let i = 0; i < 6; i++) p.push(part(G.ico(rand(0.18, 0.3), 1), pick([0x1f2326, 0x2c3136, 0xe8e2d0]), [rand(0.1, 0.8), 1.35 + rand(0, 0.15), rand(-0.4, 0.4)], [rand(0, 3), rand(0, 3), 0]));
  return merge(p);
}

/** festoon lights strung across the bin alley, zigzagging from wall to wall */
function festoons(s) {
  const [, x0, x1] = BIN_ALLEY, cable = [], bulbs = [], hi = 8.4; // (up out of the way of the camera)
  let prev = null;
  for (let i = 0; i <= 5; i++) {
    const at = [i % 2 ? x1 - 0.1 : x0 + 0.1, hi, YARD - 1.5 - i * 5.3];
    for (let k = 1, a = prev; prev && k <= 10; k++) {
      const u = k / 10, b = [prev[0] + (at[0] - prev[0]) * u, hi - Math.sin(u * Math.PI) * 1.2, prev[2] + (at[2] - prev[2]) * u];
      cable.push(limb(a, b, 0.018, 0.018, 0x2b2b2b, 4));
      if (k < 10) bulbs.push(part(G.sphere(0.1, 7, 5), pick([0xfff1b8, 0xffd27a, 0xffe9a0, 0xffc7a0]), [b[0], b[1] - 0.13, b[2]]));
      a = b;
    }
    prev = at;
  }
  s.add(vcMesh(merge(cable), { cast: false }));
  s.add(new THREE.Mesh(merge(bulbs), new THREE.MeshBasicMaterial({ vertexColors: true })));
}

let glowTex = null;
/** a bin fire: a rusty old drum with a fire going in it (the flames flicker and throw up embers: see buildCity's update) */
function fireBarrel(world, x, z, flames) {
  put(world, merge([
    part(G.cyl(0.4, 0.37, 0.95, 14), 0x7a4a2a, [0, 0.475, 0]),
    part(G.torus(0.4, 0.03, 5, 16), 0x5a3520, [0, 0.3, 0], [Math.PI / 2, 0, 0]),
    part(G.torus(0.39, 0.03, 5, 16), 0x5a3520, [0, 0.68, 0], [Math.PI / 2, 0, 0]),
    part(G.cyl(0.36, 0.36, 0.03, 14), 0x241a14, [0, 0.95, 0]),
  ]), x, z, 0, [[0, 0, 0.45]]);
  const mat = (color, opacity, map = null) => new THREE.MeshBasicMaterial({ color, map, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  const g = new THREE.Group();
  g.position.set(x, 0.92, z);
  const outer = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.0, 9, 1, true).translate(0, 0.5, 0), mat(0xff7a1a, 0.85));
  const inner = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.62, 8, 1, true).translate(0, 0.31, 0), mat(0xffd84a, 0.9));
  g.add(outer, inner);
  // (and the firelight on the ground round it)
  glowTex ??= canvasTexture(64, 64, (c) => {
    const r = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255, 190, 90, 1)');
    r.addColorStop(0.35, 'rgba(255, 150, 60, 0.55)');
    r.addColorStop(1, 'rgba(255, 120, 40, 0)');
    c.fillStyle = r;
    c.fillRect(0, 0, 64, 64);
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 5.5).rotateX(-Math.PI / 2), mat(0xffffff, 0.36, glowTex));
  glow.position.set(x, 0.06, z);
  world.scene.add(g, glow);
  flames.push({ g, outer, inner, glow, ph: rand(0, TAU), ember: 0, at: new THREE.Vector3(x, 1.2, z) });
}

/**
 * The King's throne (in its own frame: the middle of the seat at the origin, facing +z). The seat's a skip,
 * heaped with bin bags for a cushion; the back's a pyramid of wheelie bins (big commercial ones), with a
 * fan of lids behind the top one for a crest; there's another bin standing each side for arms, with one
 * lying across the top of them, and more bags piled round the foot of it
 */
function throneGeo() {
  const B = 1.3, H = 1.02 * B + 0.08, D = 0.7 * B, back = -1.3 - D / 2 - 0.02, kinds = ['red', 'yellow', 'green'];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const place = (g, x, y, z, ry = 0, rx = 0, s = 1) => g.applyMatrix4(m.compose(v.set(x, y, z), q.setFromEuler(e.set(rx, ry, 0)), sc.setScalar(s)));
  const p = [
    part(G.box(4.2, 1.4, 2.6), 0xe0a526, [0, 0.7, 0]),
    part(G.box(4.34, 0.12, 2.74), 0xb88418, [0, 1.4, 0]),
  ];
  // (hazard stripes: near enough painted on, as any thicker and the sun throws jaggy little slivers of shadow off
  // them, and none of them hanging off the ends)
  for (let i = 0; i < 6; i++) p.push(part(G.box(0.24, 1.0, 0.006), 0x2b2b2b, [-1.7 + i * 0.68, 0.72, 1.303], [0, 0, 0.6]));
  for (let i = 0; i < 6; i++) {
    p.push(part(G.ico(0.6, 1), pick([0x1f2326, 0x272c31, 0x2e343a]), [(i % 3 - 1) * 1.3 + rand(-0.2, 0.2), 1.42, (i < 3 ? -0.55 : 0.55) + rand(-0.1, 0.1)], [rand(0, 3), rand(0, 3), 0], [1.05, 0.42, 0.9]));
  }
  // the back: 5 bins, then 4, 3 and 1, each row sat on the lids of the one under it, the top one's lid flung back
  // (spaced out so no two lids overlap, however skew-whiff they're sat: side by side at the same height, they flicker)
  [5, 4, 3, 1].forEach((n, r) => {
    for (let i = 0; i < n; i++) p.push(place(staticBinGeo(kinds[(i + r) % 3], r === 3 ? 2.2 : rand(0, 0.12)), (i - (n - 1) / 2) * 0.88, r * H, back, rand(-0.04, 0.04), 0, B));
  });
  const top = 3 * H + 1.02 * B;
  // (the crest's lids are stepped back from the middle one out, so none of them is flat against the next)
  [0xf1c40f, 0xc0392b, 0xf1c40f, 0xc0392b, 0xf1c40f].forEach((c, i) => {
    const a = (i - 2) * 0.42;
    p.push(part(G.box(0.62, 1.05, 0.06), c, [Math.sin(a) * 0.62, top + 0.1 + Math.cos(a) * 0.62, back - 0.5 - Math.abs(i - 2) * 0.07], [0, 0, -a]));
  });
  // the arms: a bin either side, front and back (far enough apart that their lids don't overlap), and one lying
  // across them, its lid end forwards
  for (const k of [-1, 1]) {
    const x = k * 2.6, kind = k < 0 ? 'red' : 'green';
    p.push(place(staticBinGeo('yellow'), x, 0, -0.54, 0, 0, B), place(staticBinGeo(kind), x, 0, 0.54, 0, 0, B));
    p.push(place(staticBinGeo(kind, 0.5), x, H + D / 2, -1.02 * B / 2, 0, Math.PI / 2, B));
  }
  for (const [x, z, s] of [[-2.8, 1.75, 1.1], [-2.15, 2.2, 0.8], [2.85, 1.7, 1.15], [3.3, 1.05, 0.85], [-3.4, -1.3, 0.95], [3.35, -1.7, 0.9], [-1.1, -2.7, 0.8]]) {
    p.push(place(bagGeo(), x, 0, z, rand(0, TAU), 0, s));
  }
  return merge(p);
}

/** the King's throne (see throneGeo): he sits on it (see Ibis), and the way to the gate goes round it */
function throne(world) {
  const T = THRONE, at = ([x, z, r]) => ({ x: T.x + x, z: T.z + z, r });
  world.addOccluder(put(world, throneGeo(), T.x, T.z));
  // (the back and the arms are always in the way; the seat is too, bar when he's sitting on it, which is up to him)
  const solid = [[-1.6, -1.8, 0.55], [0, -1.8, 0.55], [1.6, -1.8, 0.55], [-2.6, -0.5, 0.5], [-2.6, 0.5, 0.5], [2.6, -0.5, 0.5], [2.6, 0.5, 0.5], [-1.8, 0, 0.4], [1.8, 0, 0.4]];
  for (const c of solid) world.colliders.push(at(c));
  world.throne = { ...T, seat: [[-1.2, 0, 1.3], [0, 0, 1.3], [1.2, 0, 1.3]].map(at) };
}
