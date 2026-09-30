import * as THREE from 'three';
import { part, merge, vcMesh, G, rand, pick, TAU, canvasTexture, toonMat } from '../util.js';
import { norfolkPine } from './beach.js';

/*
 * Manly Wharf: along the promenade from the beach, you come out onto the forecourt (a fish and chip kiosk,
 * and the gulls that come with it), with the wharf building off to your right and the timber decking of the
 * wharf proper beyond, out to where the ferry ties up. Or would, if Captain Gull hadn't nicked the keys: he's
 * standing guard by the gangway, and nobody's going anywhere till they're got back off him.
 */
export const X0 = 70, X1 = 140, Z0 = -244, Z1 = -184; // (the wharf's edges: see ZONES)
export const DECK = 0.35; // m: the wharf's all up at the level of the promenade (and the ferry's deck is too)
const FORECOURT = { x1: 94, z0: -214 }; // (paved, up to here; the rest is decking)
const HOUSE = { x0: 96, x1: 132, z0: -200 }; // the wharf building, back against the edge on your right (+z)
const KIOSK = [84, -212]; // the fish and chip kiosk, on the forecourt
// Norfolk pines along the top of the forecourt, carried on from the promenade ([x, z, how tall]), and a mound among
// them to rake their needles into, out of reach of the gulls at the kiosk (it's where you come round, too, if you go
// down out on the harbour: see Mounds.refuge)
const PINES = [[76, -192.5, 10.5], [91.5, -187.5, 9.5], [92, -195, 9]];
export const WHARF_MOUND = [84, -189.5];
// the gulls: a few round each spilt packet of chips ([x, z, how many]), and Captain Gull by the gangway
export const GULL_PATCHES = [[82, -204, 2], [104, -224, 2], [120, -238, 2]];
export const CAPTAIN_POST = [131, -225];
// bins by the kiosk (tip them over: all chip papers), and at the end of the wharf building
export const WHARF_BINS = [['red', 90.5, -208.5, -Math.PI / 2], ['yellow', 90.5, -210.2, -Math.PI / 2], ['red', 133.2, -202, Math.PI / 2]];
const PLANK = [0x9a7a55, 0x876846, 0x8f7050];

/** the ground on the wharf (it's all the one level) */
export function wharfGround() { return DECK; }

function put(world, geo, x, z, rotY = 0, colliders = [], y = DECK) {
  const m = vcMesh(geo, { cast: true, receive: true });
  m.position.set(x, y, z);
  m.rotation.y = rotY;
  world.scene.add(m);
  for (const [cx, cz, r] of colliders) world.colliders.push({ x: x + cx, z: z + cz, r });
  return m;
}

/** the iron grate round the foot of a tree set in the paving */
function grateGeo() {
  return merge([
    part(G.cyl(1.15, 1.15, 0.04, 18), 0x9a958a, [0, 0.02, 0]),
    part(G.cyl(0.95, 0.95, 0.05, 18), 0x3b3a36, [0, 0.025, 0]),
    ...[0, 1, 2, 3].map((i) => part(G.box(1.85, 0.055, 0.06), 0x2a2926, [0, 0.03, 0], [0, (i * Math.PI) / 4, 0])),
  ]);
}

/** a harbourside lamp: a green cast-iron post with a lantern on top */
function lampGeo() {
  return merge([
    part(G.cyl(0.14, 0.18, 0.4, 8), 0x2e4a3a, [0, 0.2, 0]),
    part(G.cyl(0.06, 0.08, 3.4, 8), 0x2e4a3a, [0, 1.9, 0]),
    part(G.cyl(0.2, 0.12, 0.45, 6), 0xfff3c4, [0, 3.8, 0]),
    part(G.cone(0.24, 0.3, 6), 0x2e4a3a, [0, 4.17, 0]),
  ]);
}

/** a bollard, for the ferry's ropes */
function bollardGeo() {
  return merge([part(G.cyl(0.22, 0.26, 0.55, 10), 0x3a3f44, [0, 0.27, 0]), part(G.cyl(0.3, 0.3, 0.1, 10), 0x3a3f44, [0, 0.58, 0])]);
}

/** a spilt packet of chips, for the gulls to fight over */
function chipsGeo() {
  const p = [part(G.box(0.5, 0.012, 0.38), 0xf2efe6, [0, 0.006, 0], [0, 0.3, 0])];
  for (let i = 0; i < 14; i++) p.push(part(G.box(0.03, 0.03, rand(0.1, 0.18)), pick([0xf2c94c, 0xe8b93a, 0xd9a52e]), [rand(-0.45, 0.45), 0.02, rand(-0.35, 0.35)], [0, rand(0, TAU), 0]));
  return merge(p);
}

/** a painted sign's face (a plane `w` by `h`, its canvas drawn by `draw`), facing +z */
function signFace(w, h, draw, px = 512) {
  const tex = canvasTexture(px, Math.round((px * h) / w), draw);
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), toonMat({ map: tex }));
}

export function buildWharf(world) {
  const s = world.scene;

  // --- the decking: planks laid across the wharf (the forecourt paved over at the near end), on piles
  const deck = [];
  for (let x = X0, i = 0; x < X1 - 0.01; x += 0.5, i++) deck.push(part(G.box(0.48, 0.3, Z1 - Z0), PLANK[i % 3], [x + 0.25, DECK - 0.15, (Z0 + Z1) / 2]));
  deck.push(part(G.box(FORECOURT.x1 - X0, 0.3, Z1 - FORECOURT.z0), 0xcfcac0, [(X0 + FORECOURT.x1) / 2, DECK - 0.145, (FORECOURT.z0 + Z1) / 2]));
  for (let x = X0 + 2; x < FORECOURT.x1; x += 3) deck.push(part(G.box(0.06, 0.3, Z1 - FORECOURT.z0), 0xb9b4aa, [x, DECK - 0.143, (FORECOURT.z0 + Z1) / 2]));
  for (let z = FORECOURT.z0 + 3; z < Z1; z += 3) deck.push(part(G.box(FORECOURT.x1 - X0, 0.3, 0.06), 0xb9b4aa, [(X0 + FORECOURT.x1) / 2, DECK - 0.143, z]));
  // (the piles along the harbour side, and under the far end, standing in the water)
  for (let x = X0 + 1.5; x < X1; x += 3) deck.push(part(G.cyl(0.2, 0.2, 2.6, 8), 0x5a4632, [x, DECK - 1.3, Z0 + 0.2]));
  for (let z = Z0 + 3; z < Z1; z += 3) deck.push(part(G.cyl(0.2, 0.2, 2.6, 8), 0x5a4632, [X1 - 0.2, DECK - 1.3, z]));
  s.add(vcMesh(merge(deck), { cast: false, receive: true }));
  // (and a rail along the harbour side: the way on is the gangway, when there's a ferry in)
  const rail = [];
  for (let x = X0 + 1, n = 0; x < X1 - 0.5; x += 2.5, n++) rail.push(part(G.box(0.08, 0.95, 0.08), 0x2e4a3a, [x, DECK + 0.47, Z0 + 0.3]));
  rail.push(part(G.box(X1 - X0 - 1, 0.07, 0.07), 0x2e4a3a, [(X0 + X1) / 2, DECK + 0.95, Z0 + 0.3]), part(G.box(X1 - X0 - 1, 0.05, 0.05), 0x2e4a3a, [(X0 + X1) / 2, DECK + 0.5, Z0 + 0.3]));
  s.add(vcMesh(merge(rail), { cast: true, receive: false }));

  // --- the wharf building: a long, low pavilion, cream with a green roof, its name up on the end facing you
  const { x0, x1, z0 } = HOUSE, len = x1 - x0, dep = Z1 - z0 + 4, cz = z0 + dep / 2;
  const house = [
    part(G.box(len, 5, dep), 0xefe6cf, [0, 2.5, 0]),
    part(G.box(len + 0.6, 0.35, dep + 0.6), 0x2e5e4a, [0, 5.15, 0]),
    part(new THREE.CylinderGeometry(0.01, dep * 0.72, 2.6, 4, 1), 0x3d7a5f, [0, 6.6, 0], [0, Math.PI / 4, 0], [len / dep, 1, 1]),
  ];
  // (shopfronts along the side facing the wharf, and the way in at the near end)
  for (let x = -len / 2 + 3; x < len / 2 - 2; x += 5) house.push(part(G.box(3.4, 2.4, 0.08), 0x3b5068, [x, 1.6, -dep / 2 - 0.02]), part(G.box(3.8, 0.35, 1.1), pick([0x2f6fb0, 0xc0392b, 0x2e8b57, 0xe0a526]), [x, 3.1, -dep / 2 - 0.55], [0.2, 0, 0]));
  house.push(part(G.box(0.08, 3, 5), 0x3b5068, [-len / 2 - 0.02, 1.6, -2]));
  const hm = put(world, merge(house), (x0 + x1) / 2, cz, 0, [], DECK);
  world.addOccluder(hm);
  world.addSegment(x0, z0, x1, z0, 0.3, true);
  world.addSegment(x0, z0, x0, Z1 + 1, 0.3, true);
  world.addSegment(x1, z0, x1, Z1 + 1, 0.3, true);
  const name = signFace(11, 1.6, (c, w, h) => {
    c.fillStyle = '#2e5e4a'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#f5ecd0'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `bold ${Math.round(h * 0.7)}px serif`; c.fillText('MANLY WHARF', w / 2, h / 2 + 4);
  });
  name.position.set(x0 - 0.1, DECK + 4.1, cz);
  name.rotation.y = -Math.PI / 2;
  s.add(name);

  // --- the fish and chip kiosk on the forecourt (where the gulls hang about)
  const [kx, kz] = KIOSK;
  put(world, merge([
    part(G.box(4, 2.6, 3), 0xf7f2e4, [0, 1.3, 0]),
    part(G.box(4.4, 0.25, 3.4), 0x1f6fa8, [0, 2.72, 0]),
    part(G.box(3.2, 1.0, 0.08), 0x2c3e55, [0, 1.55, 1.52]),
    part(G.box(3.4, 0.12, 0.6), 0xd9d4c5, [0, 1.02, 1.75]),
    // (the awning, blue and white stripes)
    ...Array.from({ length: 6 }, (_, i) => part(G.box(0.7, 0.06, 1.3), i % 2 ? 0xffffff : 0x1f6fa8, [-1.75 + i * 0.7, 2.45, 2.1], [0.35, 0, 0])),
  ]), kx, kz, -Math.PI / 2, [[0, -0.9, 1.5], [0, 0.9, 1.5]]);
  const menu = signFace(2.6, 0.7, (c, w, h) => {
    c.fillStyle = '#1f6fa8'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `bold ${Math.round(h * 0.55)}px sans-serif`; c.fillText('FISH & CHIPS', w / 2, h / 2 + 3);
  });
  menu.position.set(kx - 1.55, DECK + 3.2, kz);
  menu.rotation.y = -Math.PI / 2;
  s.add(menu);

  // --- the pines on the forecourt, dropping their needles all about (see Leaves)
  const grate = grateGeo();
  for (const [x, z, h] of PINES) {
    put(world, grate, x, z, rand(0, TAU), [], DECK + 0.005);
    world.addSway(put(world, norfolkPine(h), x, z, rand(0, TAU), [[0, 0, 0.5]]));
    world.treeSpots.push({ x, z, h: h * 0.6, palette: 'pine' });
  }

  // --- down the wharf: lamps, benches looking out over the harbour (turkeys perch along the backs of them),
  // bollards at the berth, and the chips the gulls are fighting over
  for (const x of [78, 97, 116, 134]) put(world, lampGeo(), x, Z0 + 1.2, 0, [[0, 0, 0.25]]);
  const bench = merge([
    part(G.box(2, 0.08, 0.5), 0x8a5a3a, [0, 0.48, 0]),
    part(G.box(2, 0.5, 0.08), 0x8a5a3a, [0, 0.8, -0.22], [-0.15, 0, 0]),
    part(G.box(0.08, 0.5, 0.5), 0x333333, [-0.9, 0.25, 0]),
    part(G.box(0.08, 0.5, 0.5), 0x333333, [0.9, 0.25, 0]),
  ]);
  const seats = [], backs = [-0.66, 0, 0.66].map((x) => ({ at: [x, 1.05, -0.26], face: 0, ground: [x, 1.1], hop: [0.45, 0.8] }));
  for (const x of [87, 106, 125]) {
    // (their backs to you, looking out to sea: -z)
    const r = Math.PI;
    seats.push({ obj: put(world, bench, x, Z0 + 2.6, r, [[-0.6, 0, 0.45], [0.6, 0, 0.45]]), perches: backs });
  }
  for (const z of [-231, -217]) put(world, bollardGeo(), X1 - 1, z, 0, [[0, 0, 0.35]]);
  const chips = chipsGeo();
  for (const [x, z] of GULL_PATCHES) put(world, chips, x, z, rand(0, TAU), [], DECK + 0.005);
  put(world, chips, CAPTAIN_POST[0] - 1.5, CAPTAIN_POST[1] + 1, 0.8, [], DECK + 0.005);

  // --- the board by the gangway: no ferries while the Captain's got the keys (and then, all aboard)
  const board = (lines, bg) => canvasTexture(512, 256, (c, w, h) => {
    c.fillStyle = bg; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#ffd21f'; c.lineWidth = 8; c.strokeRect(10, 10, w - 20, h - 20);
    c.textAlign = 'center';
    lines.forEach(([text, size, col], i) => { c.fillStyle = col; c.font = `bold ${size}px sans-serif`; c.fillText(text, w / 2, 70 + i * 66); });
  });
  const shut = board([['FERRIES TO CIRCULAR QUAY', 34, '#fff'], ['SERVICE SUSPENDED', 44, '#ffd21f'], ['(the keys have gone missing)', 30, '#fff']], '#1d3f6e');
  const open = board([['FERRIES TO CIRCULAR QUAY', 34, '#fff'], ['NOW BOARDING', 52, '#7bd34f'], ['Wharf 1: all aboard!', 32, '#fff']], '#1d3f6e');
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.6), toonMat({ map: shut, side: THREE.DoubleSide }));
  const sx = X1 - 4.5, sz = -234.5;
  sign.position.set(sx, DECK + 2.9, sz);
  sign.rotation.y = -Math.PI / 2;
  s.add(sign);
  put(world, merge([-1.4, 1.4].map((k) => part(G.box(0.14, 2.2, 0.14), 0x2e4a3a, [0, 1.1, k]))), sx + 0.1, sz, 0, [[0, -1.4, 0.2], [0, 1.4, 0.2]]);

  let boarding = false;
  return {
    seats, // (for turkeys to perch on: see main.js)
    update() {
      // (the board changes over once the gangway's been unlocked)
      if (!boarding && world.gates[4]?.unlocked) {
        boarding = true;
        sign.material.map = open;
        sign.material.needsUpdate = true;
      }
    },
  };
}

