import * as THREE from 'three';
import { part, merge, vcMesh, G, limb, rand, pick, noise, smoothstep, TAU } from '../util.js';
import { fig } from './city.js';
import { benchGeo, lampGeo } from './hyde.js';
import { OX, BLUES, PIT } from './milsons.js';

/*
 * Blues Point, where it all starts: the turkeys' home. The reserve's lawn, out on the end of the point, with the harbour
 * round three sides of it, the Bridge across the water and the city beyond, and Blues Point Tower standing over the lot
 * at the hill end: twenty-odd floors of Harry Seidler, cream frame and dark glass, the plant room up on the roof. The
 * flock's mound is in its lee, and their playground's out on the lawn (a swing set, a trampoline, a seesaw, a sandpit for
 * a dust bath, a beach ball), with figs along the side and benches looking out at the Bridge.
 *
 * Till the Emperor Ibis turns up, that is, and puts his dish on the roof (see Opening). From then on it's the signal's:
 * the dish sweeps round, and every few seconds out goes a pulse (see Signal, in beacon.js).
 *
 * It's laid out in Milsons Point's frame (OX along from the rest of the world, south over the harbour -z, west +x), out
 * round past Luna Park and McMahons Point, the way the real one is: from there you can see it over Lavender Bay, and
 * from here, Luna Park's lights and the Bridge. The camera looks east from here, at the Bridge (its own leg: see LEGS).
 */
// the Tower: the middle of its foot, how far it goes out either side of that (it's square), how high its lobby is, how
// many floors there are over it and how high each is (its roof's at TOP), and the plant room's height on top of that
const TOWER = { x: 245, z: -96, half: 7.5, lobby: 4.2, floors: 22, fh: 2.6, plant: 3.4 };
const TOP = TOWER.lobby + TOWER.floors * TOWER.fh;
const CREAM = 0xe4dccb, CREAM2 = 0xd6cdb9, GLASS = 0x3b4550, GLASS2 = 0x4c5864, SAND = 0xc9a874, SAND2 = 0xb89660;
const LAWN = [new THREE.Color(0x6fa548), new THREE.Color(0x86b655)], SHADE = new THREE.Color(0x4f7f38), PAVE = new THREE.Color(0xcfc9bc);
const EDGE = 2.2; // m: the path round the edge, inside the seawall
const FIGS = [[262, -118, 6.5], [261.5, -150, 7], [228.5, -153, 6]];
const BENCHES = [[226.6, -121], [226.6, -137]]; // (along the east side, looking out at the Bridge)
const SANDPIT = { x: 234, z: -141, w: 5, d: 4 };

/** the reserve, in the world */
export const BLUES_RECT = [BLUES.x0 + OX, BLUES.z0, BLUES.x1 + OX, BLUES.z1];
/** the ground there: the lawn, level all over */
export const bluesGround = () => BLUES.y;
/** the Tower's foot, in the world (its middle, and how far it reaches out either side) */
export const TOWER_AT = { x: TOWER.x + OX, z: TOWER.z, half: TOWER.half, top: TOP + TOWER.plant };
/** the middle of the dish, up on the roof, in the world: where the signal goes out from */
export const DISH_AT = new THREE.Vector3(TOWER.x + OX, BLUES.y + TOP + TOWER.plant + 6.4, TOWER.z);
/** the roof, in the world: how high it is, where the Emperor stands on it (out the front of the plant room, over the lawn, his button by him) */
export const ROOF = { y: BLUES.y + TOP + 0.65, x: TOWER.x + OX, z: TOWER.z - 5.6 };

const at = (x, z) => [x + OX, z];
// where everything goes (see main.js and Opening): the playground, the flock's mound, where you and the flock start out,
// the gulls about the lawn, and the pit the Emperor's lot have dug down the end of it (in the world), the catapult in it
export const BLUES_SPOTS = {
  swing: [...at(250, -113), -Math.PI / 2], // (swinging out towards the Bridge)
  trampoline: at(236, -124),
  seesaw: at(251, -129),
  ball: at(244, -127),
  mound: at(232.5, -110),
  you: [...at(259, -121), -Math.PI / 2], // (out the back of the lot of them, looking out at the Bridge)
  flock: [[241, -117], [252, -120], [238, -129], [251, -136], [243, -140], [233, -118]].map(([x, z]) => at(x, z)),
  gulls: [[236, -134], [257, -125], [229, -131]].map(([x, z]) => at(x, z)),
  pit: { x0: PIT.x0 + OX, x1: PIT.x1 + OX, z0: PIT.z0, z1: PIT.z1 },
  catapult: at(245, -150),
};
/** is (x, z) in the sandpit? (a suntrap: see World.sunTrap) */
export const inSandpit = (x, z) => Math.abs(x - OX - SANDPIT.x) < SANDPIT.w / 2 - 0.2 && Math.abs(z - SANDPIT.z) < SANDPIT.d / 2 - 0.2;

/* ------------------------------------------------------------------ the Tower */
/**
 * Blues Point Tower, round its foot at (x, y, z): set back on pilotis over a glass lobby, then floor on floor of dark
 * glass behind the cream frame, the corners standing proud of it all the way up, a slender fin down the middle of each
 * floor's windows, and the plant room up on the roof. (`fine`: the bits you'd only see up close, the lobby's columns)
 */
export function towerParts(p, x, y, z, fine = true) {
  const { half, lobby, floors, fh, plant } = TOWER, w = half * 2;
  // the glass, set in behind the frame, and the lobby's, further in again
  p.push(part(G.box(w - 1, TOP - lobby, w - 1), GLASS, [x, y + (lobby + TOP) / 2, z]));
  p.push(part(G.box(w - 4, lobby, w - 4), GLASS2, [x, y + lobby / 2, z]));
  // a slab at each floor, wrapping round the lot (a touch deeper at the top, the roof's edge)
  for (let f = 0; f <= floors; f++) {
    const top = f === floors, h = top ? 1.1 : 0.55;
    p.push(part(G.box(w, h, w), f % 2 || top ? CREAM : CREAM2, [x, y + lobby + f * fh + (top ? 0.1 : 0), z]));
  }
  // the fins up each face, between the windows (and a wider one up the middle), and the corners
  for (const k of [-4.2, -2.1, 2.1, 4.2, 0]) {
    const fw = k ? 0.22 : 0.7;
    for (const [nx, nz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const fx = x + (nz ? k : nx * (half - 0.3)), fz = z + (nx ? k : nz * (half - 0.3));
      p.push(part(G.box(nz ? fw : 0.6, TOP - lobby, nz ? 0.6 : fw), CREAM, [fx, y + (lobby + TOP) / 2, fz]));
    }
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.push(part(G.box(1.7, TOP + 0.6, 1.7), CREAM, [x + sx * (half - 0.85), y + (TOP + 0.6) / 2, z + sz * (half - 0.85)]));
  // the plant room on the roof (louvred), and its parapet
  p.push(part(G.box(7, plant, 7), CREAM2, [x, y + TOP + plant / 2, z]), part(G.box(7.3, 0.35, 7.3), CREAM, [x, y + TOP + plant, z]));
  for (let k = -2.6; k <= 2.6; k += 0.65) for (const s of [-1, 1]) {
    p.push(part(G.box(0.3, plant * 0.6, 0.06), 0x8d877b, [x + k, y + TOP + plant / 2, z + s * 3.53]), part(G.box(0.06, plant * 0.6, 0.3), 0x8d877b, [x + s * 3.53, y + TOP + plant / 2, z + k]));
  }
  for (const s of [-1, 1]) p.push(part(G.box(w, 0.9, 0.3), CREAM, [x, y + TOP + 0.6, z + s * (half - 0.15)]), part(G.box(0.3, 0.9, w), CREAM, [x + s * (half - 0.15), y + TOP + 0.6, z]));
  if (!fine) return;
  // the pilotis round the lobby, and an awning over the way in, facing the lawn
  for (const k of [-5.2, -1.7, 1.7, 5.2]) for (const [nx, nz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    p.push(part(G.box(0.7, lobby, 0.7), CREAM2, [x + (nz ? k : nx * (half - 1.4)), y + lobby / 2, z + (nx ? k : nz * (half - 1.4))]));
  }
  p.push(part(G.box(5, 0.25, 2.4), CREAM, [x, y + 2.9, z - half + 0.2]), part(G.box(2.4, 2.6, 0.1), 0x2a323a, [x, y + 1.3, z - half + 2.05]));
}

/**
 * The Emperor's dish, on its mast on the plant room's roof (its foot at the origin): a lattice mast, the yoke it sweeps
 * round on (`yaw`), the dish itself tipped up on that (`tilt`), facing +z, and out in front of it, on its struts, the
 * horn the signal comes out of. Its face (`face`) and the tip of the horn (`tip`) light up purple once it's on
 */
export function dishRig() {
  const root = new THREE.Group(), yaw = new THREE.Group(), tilt = new THREE.Group();
  const STEEL = 0x9aa3ab, DARK = 0x5c636a, R = 4.4, DEEP = 1.5;
  const mast = [part(G.cyl(0.45, 0.7, 4.8, 8), DARK, [0, 2.4, 0]), part(G.cyl(1.4, 1.6, 0.4, 12), DARK, [0, 0.2, 0])];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    mast.push(limb([Math.cos(a) * 1.5, 0.3, Math.sin(a) * 1.5], [Math.cos(a) * 0.4, 4.4, Math.sin(a) * 0.4], 0.09, 0.07, STEEL, 5));
  }
  root.add(vcMesh(merge(mast)));
  yaw.position.y = 4.8;
  root.add(yaw);
  yaw.add(vcMesh(merge([
    part(G.cyl(0.8, 0.8, 0.5, 10), STEEL, [0, 0.25, 0]),
    ...[-1, 1].map((s) => part(G.box(0.3, 2.2, 0.6), STEEL, [s * 1.2, 1.2, 0])),
  ])));
  tilt.position.y = 1.4;
  tilt.rotation.x = -0.42;
  yaw.add(tilt);
  // the dish: a bowl turned on a lathe (its back, steel, and its face, which lights up), with a rim round it
  const bowl = (r0, lift) => Array.from({ length: 9 }, (_, i) => {
    const r = (i / 8) * r0;
    return new THREE.Vector2(r, (DEEP * r * r) / (R * R) + lift);
  });
  const back = new THREE.LatheGeometry(bowl(R, -0.12), 28).rotateX(Math.PI / 2);
  tilt.add(vcMesh(merge([part(back, STEEL), part(G.torus(R, 0.13, 6, 32), DARK, [0, 0, DEEP])])));
  const face = new THREE.Mesh(new THREE.LatheGeometry(bowl(R - 0.1, 0).reverse(), 28).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xdfe4ea, side: THREE.DoubleSide }));
  tilt.add(face);
  // the horn, out at the focus, on its struts
  const F = (R * R) / (4 * DEEP);
  const horn = [part(G.cone(0.42, 1.1, 10), DARK, [0, 0, F - 0.3], [-Math.PI / 2, 0, 0])];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU;
    horn.push(limb([Math.cos(a) * (R - 0.4), Math.sin(a) * (R - 0.4), DEEP - 0.1], [Math.cos(a) * 0.25, Math.sin(a) * 0.25, F - 0.6], 0.06, 0.05, STEEL, 4));
  }
  tilt.add(vcMesh(merge(horn)));
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 9), new THREE.MeshBasicMaterial({ color: 0x5a5560 }));
  tip.position.z = F + 0.3;
  tilt.add(tip);
  return { root, yaw, tilt, face, tip };
}

/* ------------------------------------------------------------------ the ground */
/** the lawn's colour at (x, z): mottled, darker in under the figs, and the path round the edge */
function groundColour(x, z, c) {
  if (x < BLUES.x0 + EDGE || x > BLUES.x1 - EDGE || z < BLUES.z0 + EDGE) return c.copy(PAVE);
  c.copy(LAWN[0]).lerp(LAWN[1], 0.5 + 0.5 * noise(x * 0.11, z * 0.11));
  let shade = 0;
  for (const [tx, tz] of FIGS) shade = Math.max(shade, 1 - smoothstep(2.5, 6.5, Math.hypot(x - tx, z - tz)));
  shade = Math.max(shade, 0.7 * (1 - smoothstep(0, 5, z - (TOWER.z - TOWER.half)))); // (and in the Tower's shadow, at the foot of it)
  return c.lerp(SHADE, shade * 0.55);
}

/** the reserve, in 1 m squares (the path's a step down the edge of it, all the way round bar the hill end), bar the pit */
function groundGeo() {
  const S = 1, pos = [], col = [], c = new THREE.Color();
  for (let x = BLUES.x0; x < BLUES.x1; x += S) {
    for (let z = BLUES.z0; z < BLUES.z1; z += S) {
      if (x >= PIT.x0 && x < PIT.x1 && z >= PIT.z0 && z < PIT.z1) continue; // (no lawn over the pit: see Opening)
      groundColour(x + S / 2, z + S / 2, c);
      for (const [dx, dz] of [[0, 0], [0, S], [S, 0], [S, 0], [0, S], [S, S]]) {
        pos.push(x + dx, BLUES.y, z + dz);
        col.push(c.r, c.g, c.b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * The seawall, round three sides of it: big sandstone blocks in courses, from down in the harbour up to a kerb at the
 * lawn's edge; and the hill end, a wall holding the hill back either side of the Tower, with a garden bed along the top
 */
function walls(p) {
  const { x0, x1, z0, z1, y } = BLUES, foot = -2.6, h = y - foot;
  const wall = (cx, cz, lx, lz) => {
    p.push(part(G.box(lx, h, lz), SAND, [cx, foot + h / 2, cz]));
    // (its courses, and the joints between the blocks, on the face of it)
    for (let k = foot + 0.55; k < y - 0.1; k += 0.55) p.push(part(G.box(lx + 0.04, 0.05, lz + 0.04), SAND2, [cx, k, cz]));
  };
  wall((x0 + x1) / 2, z0 - 0.5, x1 - x0 + 2, 1);
  wall(x0 - 0.5, (z0 + z1) / 2 - 1, 1, z1 - z0 + 2);
  wall(x1 + 0.5, (z0 + z1) / 2 - 1, 1, z1 - z0 + 2);
  // the kerb along the top
  p.push(part(G.box(x1 - x0, 0.22, 0.6), SAND2, [(x0 + x1) / 2, y + 0.11, z0 + 0.3]));
  for (const x of [x0 + 0.3, x1 - 0.3]) p.push(part(G.box(0.6, 0.22, z1 - z0), SAND2, [x, y + 0.11, (z0 + z1) / 2]));
  // the hill end: either side of the Tower, a wall up to the hill, and the bed along the top of it
  for (const [a, b] of [[x0, TOWER.x - TOWER.half - 0.5], [TOWER.x + TOWER.half + 0.5, x1]]) {
    p.push(part(G.box(b - a, 3.2, 1.2), SAND, [(a + b) / 2, y + 1.6, z1 + 0.6]), part(G.box(b - a + 0.2, 0.25, 1.4), SAND2, [(a + b) / 2, y + 3.25, z1 + 0.6]));
    for (let x = a + 0.8; x < b - 0.4; x += 1.3) p.push(part(G.ico(rand(0.6, 0.9), 0), pick([0x3f6b35, 0x4d7a3a, 0x355f30]), [x, y + 3.6, z1 + 1.6 + rand(-0.3, 0.3)], [0, rand(0, 3), 0], [1, 0.8, 1]));
  }
}

/** the sandpit: a timber frame, flush with the lawn, full of sand (raked smooth, mostly) */
function sandpit(p) {
  const { x, z, w, d } = SANDPIT, y = BLUES.y;
  p.push(part(G.box(w - 0.3, 0.06, d - 0.3), 0xe8d6a0, [x, y + 0.02, z]));
  for (const s of [-1, 1]) {
    p.push(part(G.box(w, 0.16, 0.18), 0x8a6a48, [x, y + 0.08, z + s * (d / 2 - 0.09)]), part(G.box(0.18, 0.16, d), 0x8a6a48, [x + s * (w / 2 - 0.09), y + 0.08, z]));
  }
  // (a bucket and spade, left in it)
  p.push(part(G.cyl(0.16, 0.12, 0.26, 10), 0xe84a3a, [x + 1.4, y + 0.15, z + 0.9]), part(G.box(0.12, 0.02, 0.5), 0x2f8fd0, [x - 1.5, y + 0.06, z - 0.8], [0, 0.6, 0.1]));
}

/* ------------------------------------------------------------------ */
export function buildBlues(world) {
  const s = new THREE.Group();
  s.position.x = OX;
  world.scene.add(s);
  const near = [], round = [];
  s.add(vcMesh(groundGeo(), { cast: false, receive: true }));
  walls(near);
  sandpit(near);
  towerParts(near, TOWER.x, BLUES.y, TOWER.z);
  // (the Tower's walls, to walk round: segments along each side of its foot)
  const { x: tx, z: tz, half } = TOWER;
  for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) {
    world.addSegment(tx + ax * (half - 0.2) + OX, tz + az * (half - 0.2), tx + bx * (half - 0.2) + OX, tz + bz * (half - 0.2), 0.3);
  }
  // the figs along the sides
  for (const [x, z, h] of FIGS) {
    const m = vcMesh(fig(h));
    m.position.set(x + OX, BLUES.y, z);
    m.rotation.y = rand(0, TAU);
    m.scale.setScalar(rand(1.05, 1.2));
    world.addSway(m);
    world.scene.add(m);
    round.push([x, z, 0.75]);
  }
  // lamps along the path, and benches looking out at the Bridge (their backs for turkeys to perch on: see main.js)
  const lamp = lampGeo();
  for (const z of [-112, -129, -146]) {
    near.push(lamp.clone().translate(BLUES.x0 + 1.1, BLUES.y, z));
    round.push([BLUES.x0 + 1.1, z, 0.2]);
  }
  lamp.dispose();
  const bench = benchGeo(), backs = [-0.66, 0, 0.66].map((x) => ({ at: [x, 1.03, -0.26], face: 0, ground: [x, 1.1], hop: [0.45, 0.8] })), seats = [];
  for (const [x, z] of BENCHES) {
    const b = vcMesh(bench.clone(), { cast: true, receive: true });
    b.position.set(x, BLUES.y, z);
    b.rotation.y = -Math.PI / 2;
    s.add(b);
    seats.push({ obj: b, perches: backs });
    round.push([x, z - 0.6, 0.35], [x, z + 0.6, 0.35]);
  }
  bench.dispose();
  // the sandpit's spots for a dust bath (see main.js: lying about in it, like on Benny's steps)
  const pit = new THREE.Object3D();
  pit.position.set(SANDPIT.x, BLUES.y, SANDPIT.z);
  s.add(pit);
  const sand = [[-1.5, -0.9], [0, -1], [1.5, -0.8], [-1.4, 0.8], [0.1, 0.9], [1.6, 0.5]].map(([x, z]) => ({ at: [x, 0.04, z], face: rand(0, TAU), ground: [x * 0.8, z * 0.8], hop: [0.3, 0.3], pose: 'sunbake' }));

  // the dish, on the plant room's roof (switched off, folded flat, and nobody's noticed it: till he's here, see Opening)
  const dish = dishRig();
  dish.root.position.set(TOWER.x, BLUES.y + TOP + TOWER.plant + 0.2, TOWER.z);
  s.add(dish.root);
  // (and the button that switches it on, on a pedestal out on the roof, striped like a hazard)
  const bx = TOWER.x + 2.5, bz = TOWER.z - 5.6, by = TOP + 0.65 + BLUES.y;
  near.push(part(G.box(0.8, 0.55, 0.8), 0x4a4f55, [bx, by + 0.275, bz]), part(G.box(0.86, 0.12, 0.86), 0xffd21f, [bx, by + 0.5, bz]));
  for (let k = -0.3; k <= 0.3; k += 0.2) near.push(part(G.box(0.07, 0.122, 0.88), 0x1e1e1e, [bx + k, by + 0.5, bz], [0, 0.6, 0]));
  near.push(part(G.cyl(0.26, 0.3, 0.12, 14), 0x8a8f95, [bx, by + 0.62, bz]), part(G.sphere(0.24, 14, 8), 0xe0241b, [bx, by + 0.68, bz], [0, 0, 0], [1, 0.55, 1]));
  const faceOff = new THREE.Color(0xdfe4ea), faceOn = new THREE.Color(0xc77dff), tipOff = new THREE.Color(0x5a5560), tipOn = new THREE.Color(0xf3d6ff);

  s.add(vcMesh(merge(near), { cast: true, receive: true }));
  for (const [x, z, r] of round) world.colliders.push({ x: x + OX, z, r });

  return {
    seats, // (the backs of the benches)
    sand: { obj: pit, perches: sand }, // (the sandpit)
    dish,
    power: 0, // 0..1: how far it's switched on (see Opening)
    sweep: Math.PI, // (which way round it's pointing: out over the lawn, to start with)
    update(dt, t) {
      // switched on, it sweeps round and round, its face aglow, and the horn pulsing with the signal (see Signal)
      const k = this.power;
      if (k > 0) this.sweep += dt * 0.5 * k;
      dish.yaw.rotation.y = this.sweep;
      dish.tilt.rotation.x = -0.42 * smoothstep(0, 0.4, k) + 0.9 * (1 - smoothstep(0, 0.4, k)); // (it comes up off its back)
      const glow = k * (0.75 + 0.25 * Math.sin(t * 5.5));
      dish.face.material.color.copy(faceOff).lerp(faceOn, glow);
      dish.tip.material.color.copy(tipOff).lerp(tipOn, glow);
      dish.tip.scale.setScalar(1 + glow * 0.35);
    },
  };
}
