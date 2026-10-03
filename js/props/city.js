import * as THREE from 'three';
import { part, merge, vcMesh, G, limb, rand, pick, TAU, toonMat, canvasTexture, smoothstep } from '../util.js';
import { staticBinGeo, knockedBinGeo, KNOCKED_AT } from '../bin.js';
import { bagGeo, tornBagGeo } from '../binbag.js';

/*
 * The city, at the end of the line. You come off the ferry onto Circular Quay (the station, with the Cahill
 * Expressway up on top of it, across the back), and over it to a street along the near side, a row of shops, a
 * back alley behind them, another row of buildings, and a plaza. Laneways run through the rows: two from the
 * street into the alley (and one more between them, gated off from the street: it only opens from the alley
 * side), and two on from the alley to the plaza, never in line with the first. A giant ibis lurks down the far
 * end of the alley.
 *
 * From the far side of the plaza, the bin alley runs on between the backs of tall buildings: lined with bins
 * (knocked over and picked clean, most of them) and bin bags (torn open), with ibises big and small loitering
 * about them. It comes out into the King's court, where the King sits on his throne of bins in front of the
 * Town Hall, with the whole city at his feet.
 *
 * It's all laid out in its own frame (see toWorld): across the way, the Quay towards +z and the King's court
 * at -z, then turned a quarter to the right, to face on down the map's second leg with the rest of it.
 */
const QUAY = -74, STREET = -118, ALLEY = [-128, -138], PLAZA = -148, YARD = -170; // (the water's edge, and where the rows of buildings start and end)
// the laneways through each row: [name, x0, x1] (10 m across: room enough for the key and its carriers)
const FRONT_LANES = [['w', -40, -30], ['m', -4, 6], ['e', 20, 30]];
const BACK_LANES = [['w2', -20, -10], ['e2', 28, 38]];
// the bin alley, and the King's court at the end of it (up to the Town Hall). Its side towards x0 is the railings
// along the top of Hyde Park, with the gate in them that his key opens (see HYDE_GATE)
const BIN_ALLEY = ['bin', -26, -14], COURT = { x0: -46, x1: 0, z0: -198, z1: -224 };
/**
 * The King's throne of bins, in the middle of his court: it faces up the bin alley, with the Town Hall behind
 * it. He sits `sitZ` in front of the middle of the seat (`seatY` up), and gets down onto the ground at `front`
 */
const THRONE = { x: -20, z: -210, seatY: 1.65, sitZ: 0.5, front: 3.9 };

/* ------------------------------------------------------------------ the city's frame */
const FX = 282, FZ = -224; // (where its (0, 0) is in the world: it's turned a quarter to the right from there)
/** the world's [x, z] for (x, z) in the city's own frame */
export const toWorld = (x, z) => [FX - z, FZ + x];
const toLocal = (X, Z) => [Z - FZ, FX - X];
const rectToWorld = ([x0, z0, x1, z1]) => [FX - z1, FZ + x0, FX - z0, FZ + x1];
/** how far the King's court reaches along the top of Hyde Park, in the world (the railings there, with the gate in them: see HYDE_GATE) */
export const COURT_SPAN = [FX - COURT.z0, FX - COURT.z1];
/** the ground in the city: flat, bar at the Quay, which rises at the water's edge to meet the ferry's deck */
export function quayGround(x) { return 0.35 * smoothstep(362, 356.5, x); }

// the gate across the middle laneway's street end, latched on the alley side
export const LANE_GATE = { a: toWorld(-4, STREET), b: toWorld(6, STREET), latch: [1, 0], kind: 'wire' };
/** is (x, z) on the way to the King: down the bin alley, or in his court? */
export const onKingsWay = (X, Z) => {
  const [x, z] = toLocal(X, Z);
  return z < YARD && z > COURT.z1 && x > (z > COURT.z0 ? BIN_ALLEY[1] : COURT.x0) && x < (z > COURT.z0 ? BIN_ALLEY[2] : COURT.x1);
};

// the lie of the land (see Track): the Quay and the street, the alley, the plaza and the King's court, and the
// laneways between them (each reaching a way out into the open at either end, so anything big coming or going
// is always well inside one or the other), with a waypoint out in the open off each end of each laneway (clear
// of the trees, lamps and bins along the footpaths and walls), and round the King's throne. Everywhere else is
// buildings
const lane = ([name, x0, x1], z0, z1) => ({ rect: [x0, z1 - 4, x1, z0 + 6], nodes: [`${name}_s`, `${name}_n`] });
const LAYOUT = {
  nodes: Object.fromEntries([
    ...FRONT_LANES.flatMap(([name, x0, x1]) => [[`${name}_s`, [(x0 + x1) / 2, STREET + 5]], [`${name}_n`, [(x0 + x1) / 2, ALLEY[0] - 3]]]),
    ...BACK_LANES.flatMap(([name, x0, x1]) => [[`${name}_s`, [(x0 + x1) / 2, ALLEY[1] + 3]], [`${name}_n`, [(x0 + x1) / 2, PLAZA - 2]]]),
    ['bin_s', [THRONE.x, YARD + 3]], ['bin_n', [THRONE.x, COURT.z0 - 3]],
    // (the way round the throne keeps well clear of it: the key's carriers need the room)
    ...[['l', -1], ['r', 1]].flatMap(([s, k]) => [[`throne_${s}`, [THRONE.x + k * 8, THRONE.z + 5]], [`throne_b${s}`, [THRONE.x + k * 8, THRONE.z - 6.5]]]),
  ]),
  rooms: [
    { rect: [-46, STREET, 46, QUAY], nodes: FRONT_LANES.map(([n]) => `${n}_s`) },
    ...FRONT_LANES.map((l) => lane(l, STREET, ALLEY[0])),
    { rect: [-46, ALLEY[1], 46, ALLEY[0]], nodes: [...FRONT_LANES.map(([n]) => `${n}_n`), ...BACK_LANES.map(([n]) => `${n}_s`)] },
    ...BACK_LANES.map((l) => lane(l, ALLEY[1], PLAZA)),
    { rect: [-46, YARD, 46, PLAZA], nodes: [...BACK_LANES.map(([n]) => `${n}_n`), 'bin_s'] },
    lane(BIN_ALLEY, YARD, COURT.z0),
    { rect: [COURT.x0, COURT.z1, COURT.x1, COURT.z0], nodes: ['bin_n', 'throne_l', 'throne_r', 'throne_bl', 'throne_br'] },
  ],
};
/** the same, in the world */
export const STREETS = {
  nodes: Object.fromEntries(Object.entries(LAYOUT.nodes).map(([name, [x, z]]) => [name, toWorld(x, z)])),
  rooms: LAYOUT.rooms.map((r) => ({ ...r, rect: rectToWorld(r.rect) })),
};

function flat(w, d, color, x, z, y) {
  return part(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), color, [x, y, z]);
}

let frame = null; // (everything's built in the city's own frame: see buildCity)
function put(world, geo, x, z, rotY = 0, colliders = []) {
  const m = vcMesh(geo, { cast: true, receive: true });
  m.position.set(x, 0, z);
  m.rotation.y = rotY;
  frame.add(m);
  for (const [cx, cz, r] of colliders) collide(world, x + cx, z + cz, r);
  return m;
}

/** something round (radius r) at (x, z) in the city's frame, for everything to bump into */
function collide(world, x, z, r) {
  const [X, Z] = toWorld(x, z);
  world.colliders.push({ x: X, z: Z, r });
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

/** a Moreton Bay fig, about h + 2 tall: a stout trunk flaring into buttresses, heavy limbs out low and wide, and a dense dome of leaves over them (and no wider, or it'd get between the camera and you: see World.fadeOccluders) */
export function fig(h) {
  const bark = pick([0x8a8378, 0x837c71, 0x908a80]);
  const fork = h * 0.3 + 0.45, r0 = 0.3 + h * 0.034, r1 = r0 * 0.82; // (where the trunk splits, and how stout it is at the foot and there)
  const R = h * 0.42 + 0.6, top = h + 2, rim = fork + 0.9 + h * 0.22; // the canopy: how far it spreads, how high, and where it's widest
  // the trunk, turned on a lathe: flaring out at the foot, and rounded off over the top, where the limbs come out
  const prof = [[0, -0.3], [r0 * 1.6, -0.3], [r0 * 1.5, 0.08], [r0 * 1.24, 0.35], [r0 * 1.08, 0.75], [r0, 1.3], [r1, fork], [r1 * 0.75, fork + 0.3], [0, fork + 0.4]];
  const p = [part(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 10), bark, [0, 0, 0], [0, rand(0, TAU), 0])];
  // a buttress: a fin from `high` up the trunk down to the ground `reach` out, `thick` across (a cone on its side, its
  // bottom half in the ground), and a root running on out from the foot of it, down into the ground
  const buttress = (a, reach, high, thick, root) => {
    p.push(part(G.cone(1, 1, 4), bark, [Math.cos(a) * reach / 2, 0, Math.sin(a) * reach / 2], [0, -a, -Math.PI / 2], [high, reach, thick]));
    const b = a + rand(-0.25, 0.25), r = reach - 0.4;
    p.push(limb([Math.cos(a) * r, 0.08, Math.sin(a) * r], [Math.cos(b) * (reach + root), -0.2, Math.sin(b) * (reach + root)], thick * 0.8, thick * 0.45, bark, 5));
  };
  // a limb through `pts`, thinning from w0 to w1 (each length runs on past a bend, and the next starts back before it, by
  // as much as the bend opens up round its outside, so the two meet there instead of gaping)
  const bough = (pts, w0, w1) => {
    const v = pts.map((q) => new THREE.Vector3(...q)), n = v.length - 1, w = (k) => w0 + ((w1 - w0) * k) / n;
    const dir = v.slice(1).map((q, k) => q.clone().sub(v[k]).normalize());
    const over = (k) => (k > 0 && k < n ? w(k) * Math.tan(dir[k - 1].angleTo(dir[k]) / 2) : 0);
    for (let k = 0; k < n; k++) {
      p.push(limb(v[k].clone().addScaledVector(dir[k], -over(k)).toArray(), v[k + 1].clone().addScaledVector(dir[k], over(k + 1)).toArray(), w(k), w(k + 1), bark, 6));
    }
  };
  // the canopy's rim: a ring of clumps, every other one with a limb reaching up into it, and a buttress under that
  const n = 5, a0 = rand(0, TAU), ring = [];
  for (let j = 0; j < n * 2; j++) {
    const a = a0 + (j / (n * 2)) * TAU + rand(-0.12, 0.12), cr = R * rand(0.27, 0.32);
    ring.push({ a, cr, d: R - cr * rand(1, 1.12), y: rim + rand(-0.3, 0.3) });
  }
  for (let i = 0; i < n; i++) {
    const { a, d, y } = ring[i * 2], c = Math.cos(a), s = Math.sin(a), at = (r, up) => [c * r, up, s * r];
    buttress(a, r0 + rand(0.25, 0.4), h * rand(0.15, 0.2), rand(0.3, 0.36), rand(0.8, 1.2));
    if (i % 2 || i === n - 1) buttress(a + Math.PI / n + rand(-0.2, 0.2), r0 + rand(0.15, 0.3), h * rand(0.1, 0.13), 0.28, rand(0.4, 0.6)); // (and a smaller one between, here and there)
    // out of the top of the trunk, out low and wide, then up into the leaves
    bough([at(0.1, fork - 0.45), at(R * rand(0.2, 0.24), fork + rand(0.4, 0.6)), at(R * rand(0.44, 0.5), fork + rand(0.9, 1.1)), at(d, y - 0.2)], r1 * rand(0.76, 0.84), r1 * 0.3);
  }
  const greens = { crown: [0x3b6f35, 0x3f7538, 0x386a33], mid: [0x33652f, 0x386a33, 0x2f5f2f], rim: [0x2f5f2f, 0x2d5a2c, 0x2a5530] };
  const clump = (cr, colors, a, d, y) => p.push(part(G.ico(cr, 1), pick(colors), [Math.cos(a) * d, y, Math.sin(a) * d], [rand(-0.2, 0.2), rand(0, TAU), rand(-0.2, 0.2)], [1, 0.75, 1]));
  for (const { a, cr, d, y } of ring) clump(cr, greens.rim, a, d, y);
  // over it, a ring of bigger ones, and a few more on the crown (and a dark core to fill the lot out)
  const b0 = rand(0, TAU);
  for (let j = 0; j < 7; j++) clump(R * rand(0.3, 0.34), greens.mid, b0 + (j / 7) * TAU + rand(-0.2, 0.2), R * rand(0.54, 0.62), rim + (top - rim) * 0.45 + rand(-0.2, 0.2));
  for (let j = 0; j < 3; j++) {
    const cr = R * rand(0.31, 0.35);
    clump(cr, greens.crown, b0 + (j / 3) * TAU + rand(-0.4, 0.4), R * rand(0.1, 0.25), top - cr * 0.75);
  }
  p.push(part(G.ico(1, 1), 0x264d2b, [0, rim + 0.95, 0], [0, rand(0, 3), 0], [R * 0.78, (top - rim) * 0.36 + 0.3, R * 0.78]));
  return merge(p);
}

// bins: ibis heaven (the red ones are overflowing). Tip them over for what's inside: [kind, x, z, facing]. They
// stand in pairs along the walls of the bin alley...
const W = BIN_ALLEY[1] + 0.65, E = BIN_ALLEY[2] - 0.65, IN_W = Math.PI / 2, IN_E = -Math.PI / 2; // (facing into the alley)
const BINS = [
  ['red', -20, -101.5, 0], ['yellow', -19.2, -101.5, 0], ['red', 8, -116.5, Math.PI], ['red', 9, -116.5, Math.PI],
  ['red', -24, -129.3, Math.PI], ['red', 13, -129.3, Math.PI], ['yellow', 18, -136.7, 0], ['green', 44.5, -131, -Math.PI / 2],
  ['red', -2, -136.7, 0], ['green', -33.5, -166.5, 0.5], ['green', 33.5, -166.5, -0.5],
  ['red', W, -173.6, IN_W], ['yellow', W, -188.4, IN_W], ['red', E, -191.1, IN_E],
];
/** (and in the world: all of them overflowing, the red ones) */
export const CITY_BINS = BINS.map(([kind, x, z, face]) => [kind, ...toWorld(x, z), face - Math.PI / 2]);
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
].map(([x, z]) => toWorld(x, z));
// ...and the ones the ibises have been into already
const TORN_BAGS = [[-22.6, -176.4], [-17.8, -180.2], [-21.4, -186.8], [-18.3, -193.8], [-23.8, -197.1], [-2.8, -216.1]];
// ...and the ibises loitering round them, picking them over: [kind, x, z, with a pair of plovers?]
export const ALLEY_IBISES = [
  ['ibis', -23.2, -176.2], ['big', -17.2, -179.2, true], ['ibis', -22.8, -183.2],
  ['ibis', -16.9, -186.6], ['big', -22.4, -192.6], ['ibis', -17.1, -194.4],
].map(([kind, x, z, plover]) => [kind, ...toWorld(x, z), !!plover]);
// ...and the rest of the locals: a couple on the Quay, more up and down the street and round the plaza, and a
// giant down the back alley (a few of them with a pair of plovers)
export const CITY_IBISES = [
  ['ibis', -30, -84], ['ibis', 27, -82, true], ['ibis', -22, -108, true], ['ibis', 16, -110], ['ibis', 12, -133], ['ibis', 38, -133, true],
  ['ibis', 22, -153], ['giant', -32, -133, true],
].map(([kind, x, z, plover]) => [kind, ...toWorld(x, z), !!plover]);
// a mound on the Quay (for the fish the giant cuttlefish churns up, out on the harbour: see Cuttle)
export const QUAY_MOUND = toWorld(16, -84.5);
// and a couple of gulls on the Quay, after the tourists' chips: [x, z, how many]
export const QUAY_GULLS = [[-15, -80, 2]].map(([x, z, n]) => [...toWorld(x, z), n]);

/**
 * A row of buildings from z0 to z1 (all the way across, bar its laneways), a few of them to each block,
 * each a different height (between `heights`) and colour. They go see-through when they're in the way of
 * the camera. `from`: where the row starts, if not right out at the edge (past the King's court, it's Hyde Park)
 */
function row(world, z0, z1, lanes, shopfronts, heights = [5.5, 9.5], from = -50) {
  const cols = [0xa0523d, 0xd9c49a, 0x9aa3ab, 0x6fa3b0, 0xc47c5a, 0xb9b39f, 0xc9a27a, 0x8f9c84];
  const awnings = [0x2f6fb0, 0xc0392b, 0x2e8b57, 0xe0a526];
  const edges = [from, ...lanes.flatMap(([, x0, x1]) => [x0, x1]), 50];
  for (let i = 0; i < edges.length; i += 2) {
    const a = edges[i], b = edges[i + 1], n = Math.max(1, Math.round((b - a) / 11)), w = (b - a) / n;
    if (b - a < 1) continue; // (a laneway right at the start of it)
    for (let k = 0; k < n; k++) {
      const h = rand(...heights), x = a + w * (k + 0.5);
      const m = building(w - 0.1, h, z0 - z1, pick(cols));
      m.position.set(x, h / 2, (z0 + z1) / 2);
      frame.add(m);
      world.addOccluder(m);
      // (a shop awning over the footpath)
      if (shopfronts) {
        const aw = vcMesh(merge([part(G.box(w - 1.2, 0.12, 1.6), pick(awnings), [0, 0, 0.8], [0.18, 0, 0])]), { cast: true, receive: false });
        aw.position.set(x, 3.1, z0);
        frame.add(aw);
      }
    }
  }
}

export function buildCity(world) {
  frame = new THREE.Group();
  frame.position.set(FX, 0, FZ);
  frame.rotation.y = -Math.PI / 2;
  world.scene.add(frame);
  frame.updateMatrixWorld(true);
  const s = frame, track = world.trackAt(...toWorld(0, STREET + 5));
  const ground = [
    flat(111, 172, 0x9a978f, 9.5, -162, 0.005), // (concrete, under everything, as far as the top of Hyde Park)
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
      if (side < 0 && z < -130) continue; // (Hyde Park's there, past the King's court, and St Mary's)
      const w = rand(9, 12), h = rand(9, 24);
      const b = building(w, h, 12, pick(cols));
      b.position.set(side * (50 + w / 2), h / 2, z - 6);
      s.add(b);
    }
  }
  row(world, STREET, ALLEY[0], FRONT_LANES, true);
  row(world, ALLEY[1], PLAZA, BACK_LANES, false);
  row(world, YARD, COURT.z0, [BIN_ALLEY], false, [10, 17], COURT.x0);
  row(world, COURT.z0, COURT.z1 + 0.4, [['court', COURT.x0, COURT.x1]], false, [8, 13], COURT.x0);
  // (the way through a laneway keeps to the middle of it, clear of the corners, where the key's carriers need the room)
  const guide = (ax, az, bx, bz) => {
    const [AX, AZ] = toWorld(ax, az), [BX, BZ] = toWorld(bx, bz);
    track.addWall({ ax: AX, az: AZ, bx: BX, bz: BZ, active: true, guide: true }, false);
  };
  for (const [lanes, z0, z1] of [[FRONT_LANES, STREET, ALLEY[0]], [BACK_LANES, ALLEY[1], PLAZA], [[BIN_ALLEY], YARD, COURT.z0]]) {
    for (const [, x0, x1] of lanes) {
      for (const z of [z0, z1]) {
        guide(x0, z, x0 + (x1 - x0) * 0.35, z);
        guide(x1 - (x1 - x0) * 0.35, z, x1, z);
      }
    }
  }
  // (and it goes well clear of the King's throne, round the back of it)
  const { x: tx, z: tz } = THRONE;
  for (const [ax, az, bx, bz] of [[tx - 5, tz + 3, tx - 5, tz - 4.5], [tx - 5, tz - 4.5, tx + 5, tz - 4.5], [tx + 5, tz - 4.5, tx + 5, tz + 3]]) guide(ax, az, bx, bz);
  track.plan();

  // Moreton Bay figs in planters in the plaza, and street trees along the shops
  for (const [x, z, big] of [[-38, -158, 1], [42, -157, 1], [14, -167, 1], [-24, -115.5, 0], [14, -115.5, 0], [40, -115.5, 0]]) {
    const h = big ? rand(6, 7.5) : rand(4, 5), m = vcMesh(fig(h)), [X, Z] = toWorld(x, z);
    // (the trees themselves out in the world, not the city's frame: they sway, see World.addSway)
    m.position.set(X, 0, Z);
    world.addSway(m);
    world.scene.add(m);
    if (big) put(world, merge([part(G.cyl(2.2, 2.3, 0.5, 20), 0x9c9689, [0, 0.25, 0]), part(G.cyl(2.0, 2.0, 0.02, 20), 0x5b4230, [0, 0.5, 0])]), x, z, 0, [[0, 0, 2.3]]);
    else collide(world, x, z, 0.5);
    world.treeSpots.push({ x: X, z: Z, h: h + 2, palette: 'fig' });
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
  for (const x of [-40, -24, 8, 24, 40]) put(world, lamp, x, -99.4, -Math.PI / 2, [[0, 0, 0.15]]);
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
    collide(world, x + (n > 1 ? 0.55 : 0), z, n > 1 ? 1.2 : 0.8);
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
    collide(world, x + Math.sin(fell) * KNOCKED_AT, z + Math.cos(fell) * KNOCKED_AT, 0.42);
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

  // the King's court: his throne, in front of the Town Hall, and a bin fire burning either side of the way in
  throne(world);
  townHall(world);
  const flames = [];
  for (const x of [COURT.x0 + 10, COURT.x1 - 10]) fireBarrel(world, x, COURT.z0 - 1.5, flames);
  // and back at the start, the Quay; and the city's towers, all round the far end
  quay(world, lamp, bench, backs, seats);
  skyline();
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
        if (Math.hypot(p.x - f.at.x, p.z - f.at.z) < 45 && (f.ember -= dt) <= 0) {
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
  frame.add(g, glow);
  const [X, Z] = toWorld(x, z);
  flames.push({ g, outer, inner, glow, ph: rand(0, TAU), ember: 0, at: new THREE.Vector3(X, 1.2, Z) });
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

/** the King's throne (see throneGeo): he sits on it (see Ibis), and the way round the court goes round it */
function throne(world) {
  const T = THRONE, at = ([x, z, r]) => { const [X, Z] = toWorld(T.x + x, T.z + z); return { x: X, z: Z, r }; };
  world.addOccluder(put(world, throneGeo(), T.x, T.z));
  // (the back and the arms are always in the way; the seat is too, bar when he's sitting on it, which is up to him)
  const solid = [[-1.6, -1.8, 0.55], [0, -1.8, 0.55], [1.6, -1.8, 0.55], [-2.6, -0.5, 0.5], [-2.6, 0.5, 0.5], [2.6, -0.5, 0.5], [2.6, 0.5, 0.5], [-1.8, 0, 0.4], [1.8, 0, 0.4]];
  for (const c of solid) world.colliders.push(at(c));
  // (for him, in the world: where he sits, facing up the bin alley, and where he gets down off it)
  const [x, z] = toWorld(T.x, T.z), [sx, sz] = toWorld(T.x, T.z + T.sitZ), [dx, dz] = toWorld(T.x, T.z + T.front);
  world.throne = { x, z, seatY: T.seatY, face: -Math.PI / 2, sit: { x: sx, z: sz }, down: { x: dx, z: dz }, seat: [[-1.2, 0, 1.3], [0, 0, 1.3], [1.2, 0, 1.3]].map(at) };
}

/**
 * The Town Hall, closing off the far end of the King's court (and the end of the line): sandstone, with columns
 * and a pediment over the way in, right behind the throne, and the clock tower over that
 */
function townHall(world) {
  const z = COURT.z1 - 0.4, cx = THRONE.x, SAND = 0xdcc091, DARK = 0xc4a574;
  const w = 50 - COURT.x0, mid = (50 + COURT.x0) / 2; // (from the top of Hyde Park, across)
  const hall = building(w, 13, 18, SAND);
  hall.position.set(mid, 6.5, z - 9);
  frame.add(hall);
  const p = [
    part(G.box(w + 0.6, 0.8, 18.6), DARK, [mid, 13.2, z - 9]),
    part(G.box(w + 0.2, 0.4, 18.2), DARK, [mid, 4.4, z - 9]),
    part(G.box(15, 1.2, 1.2), DARK, [cx, 9.9, z + 0.1]),
    part(G.cyl(1, 1, 1, 3), SAND, [cx, 11.8, z + 0.1], [-Math.PI / 2, 0, 0], [8.6, 1.2, 2.2]),
    part(G.box(7.4, 12, 7.4), SAND, [cx, 19.4, z - 5]),
    part(G.box(8, 0.6, 8), DARK, [cx, 25.6, z - 5]),
    part(new THREE.SphereGeometry(3.6, 14, 8, 0, TAU, 0, Math.PI / 2), 0x5f8a78, [cx, 25.9, z - 5]),
    part(G.cyl(0.08, 0.08, 4, 5), 0xffffff, [cx, 31, z - 5]),
    // (the clock, looking down on the court: twenty to twelve, going by it)
    part(new THREE.CircleGeometry(2.2, 24), 0xfaf6ea, [cx, 20.5, z - 1.28]),
    part(G.box(0.14, 1.6, 0.05), 0x222222, [cx, 21.1, z - 1.24]),
    part(G.box(1.1, 0.14, 0.05), 0x222222, [cx - 0.5, 20.6, z - 1.24], [0, 0, -0.35]),
  ];
  for (let i = -3; i <= 3; i++) {
    p.push(part(G.cyl(0.42, 0.48, 9.2, 10), 0xeedcb4, [cx + i * 2.1, 4.6, z + 0.25]));
    collide(world, cx + i * 2.1, z + 0.25, 0.5);
  }
  frame.add(vcMesh(merge(p), { cast: true, receive: true }));
}

/**
 * Circular Quay: sandstone paving out to the water's edge (rising to meet the ferry's deck: see quayGround), the
 * wharf's green canopy over the gangway, lamps and benches along the water, and across the back, the station
 * up on its columns with the Cahill Expressway on top of it (see-through when it's in your way)
 */
function quay(world, lamp, bench, backs, seats) {
  const g = new THREE.PlaneGeometry(130, QUAY + 98, 65, 48).rotateX(-Math.PI / 2).translate(0, 0, (QUAY - 98) / 2);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color(), a = new THREE.Color(0xd8c9a8), b = new THREE.Color(0xc4b390);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, quayGround(FX - z) + 0.03);
    c.copy(a).lerp(b, (0.5 + 0.5 * Math.sin(x * 0.9) * Math.sin(z * 1.1)) * 0.45);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const slab = vcMesh(g, { cast: false, receive: true });
  frame.add(slab);
  // (the sea wall along the edge, with its coping)
  frame.add(vcMesh(merge([part(G.box(130, 2.1, 0.6), 0xb9a27a, [0, -0.7, QUAY - 0.3]), part(G.box(130, 0.12, 0.4), 0xcdbb95, [0, 0.41, QUAY - 0.2])]), { cast: false, receive: true }));

  // the wharf's canopy over the gangway, and its sign
  const canopy = [part(G.box(15, 0.3, 6), 0x2e5e4a, [0, 4.15, -78.2]), part(G.box(15.2, 0.55, 0.2), 0xf1e3b5, [0, 3.85, -75.2])], posts = [];
  for (const x of [-7, 7]) {
    for (const z of [-75.6, -80.8]) {
      canopy.push(part(G.cyl(0.14, 0.16, 4.2, 8), 0x2e5e4a, [x, 2, z]));
      posts.push([x, z, 0.25]);
    }
  }
  world.addOccluder(put(world, merge(canopy), 0, 0, 0, posts));
  const sign = (w, h, y, z, text, bg, fg) => {
    const tex = canvasTexture(512, Math.round((512 * h) / w), (c2, cw, ch) => {
      c2.fillStyle = bg; c2.fillRect(0, 0, cw, ch);
      c2.fillStyle = fg; c2.textAlign = 'center'; c2.textBaseline = 'middle';
      c2.font = `bold ${Math.round(ch * 0.62)}px sans-serif`; c2.fillText(text, cw / 2, ch / 2 + 2);
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), toonMat({ map: tex }));
    m.position.set(0, y, z);
    frame.add(m);
    world.addOccluder(m); // (see-through with the rest of it, walking in under it)
  };
  sign(7, 0.45, 3.85, -75.08, 'WHARF 3 · MANLY FERRIES', '#2e5e4a', '#f1e3b5');

  // lamps and benches along the water (turkeys perch on the benches' backs, looking out at the harbour)
  for (const x of [-44, -28, 20, 36]) put(world, lamp, x, -76.6, Math.PI / 2, [[0, 0, 0.15]]);
  for (const x of [-36, -16, 16, 30]) seats.push({ obj: put(world, bench, x, -79.5, 0, [[-0.6, 0, 0.45], [0.6, 0, 0.45]]), perches: backs });

  // the station, up on its columns, and the expressway along the top of it
  const st = [
    part(G.box(124, 3.2, 7), 0x6f8a78, [0, 6.1, -91]),
    part(G.box(124.1, 0.9, 7.1), 0x2c3e55, [0, 6.3, -91]), // (the platforms' windows)
    part(G.box(124.4, 0.5, 7.6), 0x55705f, [0, 4.35, -91]),
    part(G.box(124, 1.1, 10), 0x8a8d90, [0, 8.25, -91]),
    part(G.box(124, 0.8, 0.3), 0x9a9da0, [0, 9.2, -86.15]),
    part(G.box(124, 0.8, 0.3), 0x9a9da0, [0, 9.2, -95.85]),
  ], cols = [];
  for (const x of [-56, -40, -24, 24, 40, 56]) {
    for (const z of [-88.5, -93.5]) {
      st.push(part(G.box(1.1, 4.1, 1.1), 0x8f9a8f, [x, 2.05, z]));
      cols.push([x, z, 0.8]);
    }
  }
  world.addOccluder(put(world, merge(st), 0, 0, 0, cols));
  sign(13, 1.5, 6.2, -87.44, 'CIRCULAR QUAY', '#1d3f2e', '#f1e3b5');
}

/** the city's towers, crowding in round the far end and up either side, and Sydney Tower over the lot */
function skyline() {
  const cols = [0x8fa9bf, 0x6f8faf, 0xb9c3cb, 0xd9d4c5, 0x9fb3c2, 0xc9c1b0, 0xa7b4a8];
  for (let z = -252; z > -310; z -= 17) {
    for (let x = -96; x <= 96; x += 24) {
      if (x < -40) continue; // (Hyde Park's off that side: see buildHyde)
      const w = rand(11, 16), d = rand(11, 16), h = rand(28, 46) + (-252 - z) * 0.5, b = building(w, h, d, pick(cols));
      b.position.set(x + rand(-3, 3), h / 2, z + rand(-3, 3));
      frame.add(b);
    }
  }
  for (const side of [-1, 1]) {
    for (let z = -104; z > -250; z -= 18) {
      if (side < 0 && z < -130) continue; // (Hyde Park, and St Mary's)
      const w = rand(11, 15), h = rand(22, 42), b = building(w, h, 14, pick(cols));
      b.position.set(side * (64 + w / 2 + rand(0, 8)), h / 2, z + rand(-3, 3));
      frame.add(b);
    }
  }
  const tower = vcMesh(merge([
    part(G.cyl(1.3, 1.7, 80, 12), 0xd9d6cc, [0, 40, 0]),
    part(G.cyl(4.6, 5.4, 1.8, 20), 0x6f8faf, [0, 66.2, 0]),
    part(G.cyl(5.6, 4.4, 5.4, 20), 0xd9b25a, [0, 70, 0]),
    part(G.cyl(5.9, 5.9, 0.6, 20), 0xc49a3e, [0, 72.9, 0]),
    part(G.cyl(0.35, 0.7, 18, 8), 0xd9d6cc, [0, 82, 0]),
  ]), { cast: false });
  tower.position.set(34, 0, -266);
  frame.add(tower);
}
