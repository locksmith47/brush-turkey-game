import * as THREE from 'three';
import { createIbisRig } from './ibisModel.js';
import { gullRig } from './gull.js';
import { swirlIn } from './hypno.js';
import { staticBinGeo } from './bin.js';
import { Mound } from './mound.js';
import { Turkey, S } from './turkey.js';
import { Perches } from './toys.js';
import { ZONES } from './world.js';
import { BLUES_SPOTS, ROOF } from './props/blues.js';
import { OX } from './props/milsons.js';
import { START } from './props/bush.js';
import { part, merge, vcMesh, G, limb, rand, pick, clamp, damp, dampAngle, smoothstep, TAU } from './util.js';

/*
 * How it all starts: at home on Blues Point, the flock having the time of their lives in the shadow of the Tower (the
 * swings, the trampoline, the seesaw, a dust bath in the sandpit, a beach ball to chase), you along with them. Till the
 * Emperor Ibis turns up.
 *
 * He comes in over the harbour and lands on the Tower's roof, where he's had his dish put up, and he switches it on: out
 * goes the signal (see Beacon), and the gulls on the lawn go spiral-eyed, his. His ibis come out of the Tower and round
 * up the flock, the tarp comes off the catapult they've had hidden down the end of the lawn (its bucket's a wheelie bin,
 * naturally), and in you all go, and off: north, over the Tower, over the lot, to come down in the bush, where the game
 * starts. It's a scene, cut like one (the camera's its own: see cine, and main.js), bar the playing about at the start.
 *
 * Only a new game has it. Carrying on a save, it's been and gone (see skip): he's up there on the roof, the dish going.
 * Saves wait till you're down in the bush (see blocksSave).
 */
const PLAY_T = 24; // seconds of just being turkeys, before he turns up
const EMPEROR = 4.6; // how big he is (the King's 4.2)
// the scene, in seconds from when he's first heard: where each bit of it starts
const BEAT = {
  arrive: 0.9, land: 5.4, honk: 6, turn: 7.4, peck: 8, power: 8.6, wide: 10, gull: 12.6, gulls: 14.4, ibis: 16,
  herd: 18.4, tarp: 19.6, load: 21.2, you: 24, fire: 25.4, white: 28, bush: 29,
};
// his way in, over the harbour from the city (Milsons Point's frame: its start, and the point it bends round, both in the air)
const FLY = { from: [150, 78, -165], via: [208, 104, -128] };
const HENCH = 1.15; // how big his ibis are
// where they go: the four rounding up the flock (out of the Tower's lobby), and the two crewing the catapult (under its tarp)
const HERD = [[240, -139], [244.5, -137.5], [249, -138.5], [252.5, -142]];
const CREW = [[242.4, -152.4], [248.2, -154.4]];
const RUN = 9; // m/s: his ibis, scurrying
const STAGING = [250.5, -147.5]; // (where you're rounded up to, beside the catapult)
// the catapult: how long its arm is, the angles it rests at (bucket down, behind) and stops at (up and over, in front), how
// long it takes to swing up, and where along that everything in the bucket's let go
const ARM = { L: 4.2, rest: -0.365, stop: 1.9, swing: 0.32, let: 1.15, pivot: [0, 2.0, 0.6] };
const BIN = 2.6; // (the wheelie bin it's got for a bucket, how many times life size)
const LAUNCH = { T: 4.6, h: 150, far: 300 }; // out of it: seconds in the air (they're gone before they're down), how high, how far north
const DROP = { h: [32, 55], T: [1.3, 1.8], you: 46, youT: 1.55 }; // and down into the bush: how high they come down from, and how long it takes them (and you)
export const SPROUTS = [[-1.6, -4.6, 0], [1.4, -4.2, 0], [0, -5.6, 0], [-2.9, -3.1, 0], [2.8, -2.9, 1], [-0.3, -3.1, 2]]; // (where they come down, round where you do: see main.js)
const GOLD = 0xf2c230, GOLD2 = 0xffe27a, VELVET = 0x5b1a8c, PURPLE = 0x7d2ae8, ERMINE = 0xfbfaf4, WHITE = 0xf3f1ea, BLACK = 0x1e1e1e;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Vector3();

/** (x, z) in Milsons Point's frame, in the world */
const at = (x, z) => [x + OX, z];
const ease = (k) => 1 - (1 - k) ** 2;

/* ------------------------------------------------------------------ the Emperor */
/**
 * The Emperor Ibis: an ibis bigger than the King, in the full imperial get-up. An imperial crown (arches, a velvet cap,
 * an orb and cross on top, jewels round it), a purple cape lined with ermine and a train down behind his tail, an ermine
 * collar, a gold chain with an amethyst on it, and a monocle. And for getting about, a pair of wings to spread (an ibis's
 * stay folded away, see ibisModel.js)
 */
function emperorRig() {
  const r = createIbisRig(EMPEROR);
  r.root.rotation.order = 'YXZ';
  // the crown
  const crown = [
    part(G.cyl(0.078, 0.072, 0.05, 16, true), GOLD, [0, 0, 0]),
    part(G.torus(0.076, 0.009, 4, 20), GOLD2, [0, -0.024, 0], [Math.PI / 2, 0, 0]),
    part(G.torus(0.078, 0.008, 4, 20), GOLD2, [0, 0.024, 0], [Math.PI / 2, 0, 0]),
    part(G.sphere(0.07, 14, 8), VELVET, [0, 0.022, 0], [0, 0, 0], [1, 0.95, 1]),
    part(G.sphere(0.018, 10, 8), GOLD, [0, 0.112, 0]),
    part(G.box(0.007, 0.034, 0.007), GOLD, [0, 0.142, 0]), part(G.box(0.022, 0.007, 0.007), GOLD, [0, 0.146, 0]),
  ];
  for (const a of [0, Math.PI / 2]) crown.push(part(G.torus(0.074, 0.009, 4, 14, Math.PI), GOLD, [0, 0.02, 0], [0, a, 0]));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    crown.push(part(G.sphere(i ? 0.011 : 0.018, 6, 5), i ? [0xe0245e, 0x2f7de1, 0x23b26d][i % 3] : 0xa64dff, [Math.sin(a) * 0.08, 0, Math.cos(a) * 0.08]));
  }
  const c = vcMesh(merge(crown));
  c.position.set(0, 0.1, -0.005);
  c.rotation.x = -0.12;
  c.scale.setScalar(1.45);
  r.head.add(c);
  // the monocle, over his right eye, on its chain
  const mono = vcMesh(merge([
    part(G.torus(0.024, 0.0045, 4, 16), GOLD, [-0.072, 0.036, 0.062], [0, Math.PI / 2 - 0.5, 0]),
    limb([-0.074, 0.013, 0.058], [-0.05, -0.07, 0.0], 0.0025, 0.0025, GOLD2, 4),
  ]), { cast: false });
  r.head.add(mono);
  // the cape: over his back (bar his chest), the train down behind his tail, and their ermine edges
  const ermine = (n, pts) => pts.slice(0, n).map((p) => part(G.box(0.012, 0.024, 0.012), BLACK, p));
  const capeShell = new THREE.SphereGeometry(1, 20, 10, Math.PI * 0.85, Math.PI * 1.3, 0, 1.95);
  const cape = [
    part(capeShell, VELVET, [0, 0.815, -0.05], [-0.22, 0, 0], [0.245, 0.235, 0.4]),
    part(G.box(0.44, 0.02, 0.62), VELVET, [0, 0.58, -0.5], [-1.05, 0, 0]),
    part(G.box(0.47, 0.05, 0.06), ERMINE, [0, 0.31, -0.64], [-1.05, 0, 0]),
    // the collar, round the bottom of his neck
    part(G.torus(0.115, 0.04, 6, 18), ERMINE, [0, 0.93, 0.18], [Math.PI / 2 - 0.55, 0, 0]),
    // and the chain, over the collar, with the amethyst on it
    part(G.torus(0.14, 0.009, 4, 22), GOLD, [0, 0.86, 0.2], [Math.PI / 2 - 0.95, 0, 0]),
    part(new THREE.OctahedronGeometry(0.034), 0xa64dff, [0, 0.74, 0.31], [0, 0, 0], [1, 1.4, 0.6]),
    ...ermine(10, Array.from({ length: 10 }, (_, i) => {
      const a = (i / 10) * TAU;
      return [Math.cos(a) * 0.115, 0.93 + Math.sin(a) * 0.02, 0.18 + Math.sin(a) * 0.1];
    })),
    ...ermine(6, Array.from({ length: 6 }, (_, i) => [(i - 2.5) * 0.07, 0.31, -0.61])),
  ];
  r.bodyPivot.add(vcMesh(merge(cape)));
  // his wings, for flying (folded away out of sight, otherwise)
  const wing = merge([
    part(G.sphere(1, 14, 8), WHITE, [0.4, 0, -0.04], [0, 0, 0], [0.42, 0.025, 0.17]),
    part(G.sphere(1, 10, 6), BLACK, [0.74, 0, -0.1], [0, 0.35, 0], [0.18, 0.022, 0.09]),
    part(G.sphere(1, 10, 6), 0xe4e0d4, [0.25, 0.012, 0.02], [0, 0, 0], [0.24, 0.02, 0.12]),
  ]);
  for (const s of [1, -1]) {
    const w = new THREE.Group(), m = vcMesh(wing);
    m.scale.x = s;
    w.add(m);
    w.position.set(s * 0.14, 0.88, -0.02);
    r.bodyPivot.add(w);
    r[s > 0 ? 'flyL' : 'flyR'] = w;
  }
  return r;
}

/** one of his ibis: an ibis like any other, but in his colours, a purple neckerchief */
function henchRig() {
  const r = createIbisRig(HENCH);
  r.root.rotation.order = 'YXZ';
  r.neck.add(vcMesh(merge([
    part(G.torus(0.062, 0.022, 5, 14), PURPLE, [0, 0.045, 0.01], [Math.PI / 2 + 0.3, 0, 0]),
    part(G.cone(0.07, 0.13, 3), PURPLE, [0, -0.02, 0.085], [Math.PI + 0.35, 0, 0], [1, 1, 0.35]),
  ])));
  return r;
}

/* ------------------------------------------------------------------ the catapult */
/**
 * The catapult, on the ground at its middle, aimed down +z: a timber frame on four wheels, the arm on a sinew-wound axle
 * between two A-frames, a padded bar out the front for the arm to come up against, and a lever at the back to let it go.
 * Its bucket is a red wheelie bin, on the end of the arm. Returns its parts (the arm to swing, the bin to sit in)
 */
function catapultRig() {
  const WOOD = 0x8a5a32, WOOD2 = 0x6f4526, IRON = 0x3d3f44, ROPE = 0xc9b183;
  const root = new THREE.Group(), [px, py, pz] = ARM.pivot;
  const frame = [];
  for (const s of [-1, 1]) {
    frame.push(part(G.box(0.26, 0.3, 5.4), WOOD, [s * 1.0, 0.62, 0]));
    // the A-frames up to the axle, and the uprights holding the bar out the front
    frame.push(limb([s * 1.0, 0.7, -0.7], [s * 0.88, py + 0.1, pz], 0.12, 0.13, WOOD2, 6), limb([s * 1.0, 0.7, 1.9], [s * 0.88, py + 0.1, pz], 0.12, 0.13, WOOD2, 6));
    frame.push(limb([s * 1.0, 0.7, 2.6], [s * 0.88, 3.95, 1.3], 0.11, 0.12, WOOD2, 6));
    // the wheels (a hub, spokes and an iron tyre each)
    for (const z of [-1.9, 1.9]) {
      frame.push(part(G.torus(0.52, 0.07, 5, 18), IRON, [s * 1.22, 0.58, z], [0, Math.PI / 2, 0]), part(G.cyl(0.13, 0.13, 0.22, 10), WOOD2, [s * 1.22, 0.58, z], [0, 0, Math.PI / 2]));
      for (let i = 0; i < 6; i++) frame.push(part(G.box(0.06, 1.0, 0.07), WOOD, [s * 1.22, 0.58, z], [(i / 6) * Math.PI, 0, 0]));
    }
    // the skein of rope wound round the axle, either side of the arm
    frame.push(part(G.cyl(0.32, 0.32, 0.55, 12), ROPE, [s * 0.5, py, pz], [0, 0, Math.PI / 2]));
  }
  for (const z of [-2.4, -0.4, 2.2]) frame.push(part(G.box(2.26, 0.24, 0.26), WOOD2, [0, 0.62, z]));
  frame.push(part(G.cyl(0.11, 0.11, 2.3, 8), IRON, [px, py, pz], [0, 0, Math.PI / 2]));
  frame.push(part(G.box(2.0, 0.32, 0.32), WOOD2, [0, 3.95, 1.3]), part(G.box(1.2, 0.36, 0.4), 0x9b2d2d, [0, 3.95, 1.12])); // (the bar, padded)
  // the lever at the back (it gets pulled: see Opening's fire)
  const lever = new THREE.Group();
  lever.position.set(1.3, 0.78, -2.5);
  lever.add(vcMesh(merge([limb([0, 0, 0], [0, 1.1, 0], 0.05, 0.04, WOOD2, 5), part(G.sphere(0.1, 8, 6), 0x9b2d2d, [0, 1.12, 0])])));
  root.add(vcMesh(merge(frame)), lever);
  // the arm, on the axle, its bin out the end of it (the arm's along -z from the axle: back, behind it, at rest)
  const arm = new THREE.Group();
  arm.position.set(px, py, pz);
  arm.rotation.x = ARM.rest;
  arm.add(vcMesh(merge([
    part(G.box(0.3, 0.3, ARM.L + 0.5), WOOD, [0, 0, -(ARM.L - 0.5) / 2]),
    part(G.box(0.36, 0.36, 0.2), IRON, [0, 0, -ARM.L * 0.55]), part(G.box(0.36, 0.36, 0.2), IRON, [0, 0, -ARM.L * 0.85]),
  ])));
  const bin = new THREE.Group();
  bin.position.set(0, 0.15, -ARM.L);
  bin.rotation.x = -ARM.rest; // (stood up straight, at rest)
  const binMesh = vcMesh(staticBinGeo('red', 2.1));
  binMesh.scale.setScalar(BIN);
  bin.add(binMesh);
  arm.add(bin);
  root.add(arm);
  // the rope holding the arm down till it's let go, from the end of it to the back of the frame
  const rope = vcMesh(merge([limb([0, 0.6, -2.9], [0, 0.62, -3.4], 0.04, 0.04, ROPE, 4)]));
  root.add(rope);
  return { root, arm, bin, lever, rope };
}

/** the tarp over the catapult: lumpy, lashed down, the colour of a tarp left out for a while */
function tarpGeo() {
  const g = new THREE.SphereGeometry(1, 22, 10, 0, TAU, 0, Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + 0.08 * Math.sin(x * 9 + z * 5) * Math.cos(z * 7) * y;
    p.setXYZ(i, x * k, y * k, z * k);
  }
  g.computeVertexNormals();
  return merge([
    part(g, 0x66764c, [0, 0, -0.6], [0, 0, 0], [1.9, 4.3, 4.0]),
    ...[-2.2, 0, 2].map((z) => part(G.torus(1, 0.03, 4, 24, Math.PI), 0xc9b183, [0, 0, z - 0.6], [0, Math.PI / 2, 0], [1, 4.0 * Math.sqrt(1 - ((z - 0) / 4.2) ** 2), 1.95])),
  ]);
}

/**
 * The bin, as somewhere to sit (see Perches): in round the rim of it, everyone facing the way they're going. Nobody gets
 * in of their own accord (no nearestSeat), and nobody gets out (canLeave): they're put in, and they're flung out
 */
class Bucket extends Perches {
  constructor(game, obj) {
    const H = (1.02 - 0.02) * BIN, seats = [[-0.17, -0.22], [0.17, -0.22], [-0.2, 0.02], [0.2, 0.02], [-0.17, 0.25], [0.17, 0.25]];
    super(game, obj, seats.map(([x, z]) => ({ at: [x * BIN, H, z * BIN], face: 0, ground: [x * BIN, -3.5] })), { pose: 'roost', time: [1e6, 1e6] });
  }

  nearestSeat() { return null; }
  canLeave() { return false; }
  /** up and in (from wherever they've been rounded up to: the further, the bigger the flap) */
  hop(i) {
    const t = this.seats[i].rider, d = t ? Math.hypot(t.pos.x - this.perches[i].spot.x, t.pos.z - this.perches[i].spot.z) : 2;
    return { T: 0.5 + d * 0.05, h: 1.4 + d * 0.06 };
  }
}

/* ------------------------------------------------------------------ */
export class Opening {
  constructor(game) {
    this.game = game;
    this.stage = null; // null (not started), 'play', 'scene', 'land' (coming down in the bush) or 'done'
    this.t = 0;
    this.cine = { k: 0, pos: new THREE.Vector3(), look: new THREE.Vector3() }; // (the scene's camera, and how far it's taken over: see main.js)
    this.focus = null; // (what the game's own camera looks at instead of you, coming down in the bush)
    this.flock = [];
    this.white = document.getElementById('whiteout');
    this.shown = -1;
    this.build();
  }

  /** the scene's on: no hands on anything (see main.js) */
  get active() { return this.stage === 'scene' || this.stage === 'land'; }
  /** no saving till you're down in the bush: carrying on from the middle of this, it'd be over before it started */
  get blocksSave() { return this.stage !== null && this.stage !== 'done'; }

  /** everything at Blues Point that's there in any game: the playground, the flock's mound, the catapult, him and his lot, the gulls */
  build() {
    const g = this.game, toys = g.toys, w = g.world, sp = BLUES_SPOTS;
    // the playground (and the benches' backs, and the sandpit for a dust bath)
    this.rides = [
      toys.addSwingSet(...sp.swing),
      toys.addSeesaw(...sp.seesaw, 0),
      ...w.blues.seats.map((st) => toys.addPerches(st.obj, st.perches, { spread: 1, time: [10, 30] })),
      toys.addPerches(w.blues.sand.obj, w.blues.sand.perches, { pose: 'sunbake', spread: 2, time: [12, 30] }),
    ];
    this.tramp = toys.addTrampoline(...sp.trampoline);
    this.ball = toys.addBall(...sp.ball);
    // the flock's mound, in the Tower's lee: home (just to look at: there's no coming back to it, for now)
    const m = new Mound(g, ...sp.mound, true);
    m.dial.remove();
    w.colliders.push({ x: sp.mound[0], z: sp.mound[1], r: m.r * 0.9 });
    // the catapult, down the far end of the lawn under its tarp
    const [cx, cz] = sp.catapult;
    this.cat = catapultRig();
    this.cat.root.position.set(cx, w.groundHeight(cx, cz), cz);
    g.scene.add(this.cat.root);
    this.cat.root.updateMatrixWorld(true);
    this.bucket = new Bucket(g, this.cat.bin);
    this.tarp = vcMesh(tarpGeo());
    this.tarp.position.copy(this.cat.root.position);
    g.scene.add(this.tarp);
    for (const [x, z, r] of [[0, 1.6, 1.5], [0, -1.6, 1.5]]) w.colliders.push({ x: cx + x, z: cz + z, r });
    this.armA = ARM.rest;
    // the Emperor (out of sight, till he's here)
    this.emp = { rig: emperorRig(), pos: new THREE.Vector3(), heading: Math.PI, neck: 0, head: 0, flap: 0, wings: 0, legs: 0, pitch: 0, look: 0 };
    this.emp.rig.root.visible = false;
    g.scene.add(this.emp.rig.root);
    // his ibis: in the Tower's lobby, and under the tarp
    this.hench = [...HERD, ...CREW].map(([x, z], i) => {
      const rig = henchRig(), crew = i >= HERD.length;
      rig.root.visible = false;
      g.scene.add(rig.root);
      const [wx, wz] = at(x, z);
      return { rig, crew, post: new THREE.Vector3(wx, w.groundHeight(wx, wz), wz), pos: new THREE.Vector3(), heading: Math.PI, phase: rand(0, TAU), speed: 0, out: false, neck: 0 };
    });
    // the gulls about the lawn (nobody's but their own, till the signal gets to them)
    this.gulls = sp.gulls.map(([x, z]) => {
      const rig = gullRig(1.25);
      rig.root.position.set(x, w.groundHeight(x, z), z);
      rig.root.rotation.y = rand(0, TAU);
      swirlIn(rig.spirals, 0);
      g.scene.add(rig.root);
      return { rig, heading: rig.root.rotation.y, peckT: rand(1, 3), peck: 0, k: 0, at: null };
    });
  }

  /* ---------------------------------------------------------------- starting */
  /** a new game: out of the ground at home they come, round you, on Blues Point (in place of the bush's sprouts: see main.js) */
  begin() {
    const g = this.game, tk = g.turkeys, sp = BLUES_SPOTS;
    for (const t of tk.list) t.vanish();
    this.flock = SPROUTS.map(([, , stage], i) => {
      const [x, z] = sp.flock[i], t = new Turkey(g, stage, x, z, S.IDLE);
      if (stage === 2 && t.hen) { t.hen = false; t.buildRig(); } // (the grown-up's a male: he shows off)
      t.heading = rand(0, TAU);
      tk.list.push(t);
      return t;
    });
    const p = g.player, [x, z, h] = sp.you;
    p.pos.set(x, g.world.groundHeight(x, z), z);
    p.heading = h;
    g.cam.target.set(x, p.pos.y + 1, z);
    this.stage = 'play';
    this.t = 0;
    this.playT = 1.5;
    // (and off they go to play, a couple straight off)
    this.flock[1].goPlay({ set: this.rides[1], i: 0 });
    this.flock[3].goPlay({ set: this.rides[1], i: 1 });
    this.flock[2].goPlay({ set: this.rides[0], i: 0 });
  }

  /** carrying on a save (or skipping it, from the dev menu): it's all been and gone */
  skip() {
    const g = this.game, p = g.player;
    if (this.active) {
      // (from the middle of it: everyone out of the bin, or the air, and back on their feet)
      for (const t of this.flock) if (!t.dead && (t.seat?.set === this.bucket || t.state === S.LAUNCHED)) { t.leaveSeat(); t.flight = null; t.setState(S.IDLE); }
      if (p.life !== 'ok') { p.life = 'ok'; p.pos.y = g.world.groundHeight(p.pos.x, p.pos.z); }
      this.flight = this.hop = this.drop = null;
      this.end();
    }
    this.stage = 'done';
    g.world.blues.power = 1;
    this.tarp.visible = false;
    this.cat.rope.visible = false;
    this.armA = ARM.stop;
    this.cat.lever.rotation.x = -0.9;
    this.placeEmperor();
    for (const h of this.hench) {
      h.out = true;
      h.pos.copy(h.post);
      h.heading = Math.PI + rand(-0.5, 0.5);
    }
    for (const gl of this.gulls) gl.k = 1;
  }

  /** him, stood on the roof, looking down over his lawn */
  placeEmperor() {
    const e = this.emp;
    e.pos.set(ROOF.x, ROOF.y, ROOF.z);
    e.heading = Math.PI;
    e.wings = e.legs = e.pitch = 0;
    e.rig.root.visible = true;
  }

  /** the scene: no hands on anything, and the camera's its own; and (black bars) it looks like one */
  enter() {
    const g = this.game;
    this.stage = 'scene';
    this.t = 0;
    document.body.classList.add('cine');
    g.hud.clearToast();
    g.audio.honk(EMPEROR, false, 0.45); // (heard, a long way off, before he's seen)
    for (const t of this.flock) if (!t.dead) t.joinSquad();
  }

  /** all over: you're back in charge, down in the bush */
  end() {
    const g = this.game;
    this.stage = 'done';
    this.cine.k = 0;
    this.focus = null;
    document.body.classList.remove('cine');
    this.whiten(0);
    g.hud.zoneTitle(ZONES[0].name);
  }

  /** where you're walked to (`move`, as from the keys: see main.js), while the scene's on */
  drive(move) {
    const p = this.game.player, s = this.t;
    move.x = move.z = 0;
    if (this.stage !== 'scene' || p.life !== 'ok' || s < BEAT.ibis || s > BEAT.you) return;
    const [x, z] = at(...STAGING), dx = x - p.pos.x, dz = z - p.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.6) return;
    const k = Math.min(1, d / 2) * 0.75;
    move.x = (dx / d) * k;
    move.z = (dz / d) * k;
  }

  /* ---------------------------------------------------------------- every frame */
  update(dt) {
    const g = this.game;
    if (this.stage === 'play') this.updatePlay(dt);
    else if (this.stage === 'scene') this.updateScene(dt);
    else if (this.stage === 'land') this.updateLand(dt);
    this.poseCatapult(dt);
    this.poseEmperor(dt);
    for (const h of this.hench) this.poseHench(h, dt);
    for (const gl of this.gulls) this.poseGull(gl, dt);
    // (the signal, as it goes out over the scene)
    if (this.stage === 'scene' && g.beacon.pulses !== this.pulses) {
      if (this.pulses !== undefined && this.t < BEAT.white) g.audio.pulse();
      this.pulses = g.beacon.pulses;
    }
  }

  /** the flock at play: every so often, one that's at a loose end is off to one of the toys (or he shows off), till He's here */
  updatePlay(dt) {
    const g = this.game;
    this.t += dt;
    if ((this.playT -= dt) <= 0) {
      this.playT = rand(2.5, 4.5);
      const idle = this.flock.filter((t) => t.state === S.IDLE && !t.dead && t.playCool <= 0 && !t.showT);
      if (idle.length) {
        const t = pick(idle), r = Math.random();
        const male = idle.find((x) => x.canShow);
        if (male && r < 0.2) male.showOff();
        else if (r < 0.45) t.hopTo(this.tramp.x + rand(-0.6, 0.6), this.tramp.z + rand(-0.6, 0.6), 0.6 + Math.hypot(t.pos.x - this.tramp.x, t.pos.z - this.tramp.z) * 0.04, 1.8, this.tramp.matY);
        else {
          const free = this.rides.flatMap((set) => set.seats.map((s, i) => (s.rider ? null : { set, i }))).filter(Boolean);
          if (free.length) t.goPlay(pick(free));
        }
      }
    }
    if (this.t >= PLAY_T && g.player.life === 'ok' && !g.paused) this.enter();
  }

  updateScene(dt) {
    const g = this.game, p = g.player, s = (this.t += dt), prev = s - dt, hit = (b) => prev < BEAT[b] && s >= BEAT[b];
    const e = this.emp, bp = g.world.blues;
    // you, stopped in your tracks, looking up at him (till you're rounded up)
    if (s < BEAT.ibis && p.life === 'ok') {
      _v.copy(e.rig.root.visible ? e.pos : _w.set(ROOF.x, ROOF.y, ROOF.z));
      p.heading = dampAngle(p.heading, Math.atan2(_v.x - p.pos.x, _v.z - p.pos.z), 4, dt);
    }
    // him: in over the harbour, down onto the roof, and a honk at the lot of you
    if (s >= BEAT.arrive && s < BEAT.land) {
      const k = ease(clamp((s - BEAT.arrive) / (BEAT.land - BEAT.arrive), 0, 1));
      const [ax, ay, az] = FLY.from, [bx, by, bz] = FLY.via;
      const a = _v.set(ax + OX, ay, az), b = _w.set(bx + OX, by, bz), c = _q.set(ROOF.x, ROOF.y, ROOF.z);
      const was = e.pos.clone();
      e.pos.set(0, 0, 0).addScaledVector(a, (1 - k) ** 2).addScaledVector(b, 2 * k * (1 - k)).addScaledVector(c, k * k);
      if (s - dt >= BEAT.arrive) e.heading = dampAngle(e.heading, Math.atan2(e.pos.x - was.x, e.pos.z - was.z), 6, dt);
      e.rig.root.visible = true;
      e.wings = 1;
      e.flap = Math.sin(s * (k > 0.8 ? 11 : 6.5)) * (k > 0.8 ? 0.9 : 0.6);
      e.legs = k > 0.75 ? 0.2 : 1.3;
      e.pitch = k > 0.8 ? -0.4 * smoothstep(0.8, 1, k) : 0.15;
      if ((s * 6.5) % TAU < dt * 6.5) g.audio.whoosh();
    }
    if (hit('land')) {
      this.placeEmperor();
      e.heading = Math.atan2(ROOF.x - (FLY.via[0] + OX), ROOF.z - FLY.via[2]);
      e.wings = 1;
      g.audio.stomp(2);
      g.shake(0.3);
    }
    if (s >= BEAT.land) {
      e.wings = damp(e.wings, s < BEAT.honk ? 0.6 : s >= BEAT.wide && s < BEAT.gull ? 1 : 0, 6, dt);
      e.flap = s >= BEAT.wide && s < BEAT.gull ? 0.5 + Math.sin(s * 3) * 0.12 : damp(e.flap, 0.6, 5, dt);
      const face = s < BEAT.turn || s >= BEAT.power + 0.5 ? Math.PI : Math.PI / 2;
      e.heading = dampAngle(e.heading, face, 5, dt);
    }
    if (hit('honk')) { g.audio.honk(EMPEROR, true); g.shake(0.5); e.honkT = 0; }
    if (hit('peck')) e.peckT = 0;
    if (hit('power')) { g.audio.clonk(); g.audio.powerUp(); }
    bp.power = smoothstep(BEAT.power, BEAT.power + 2.2, s);
    // the gulls, as it gets to them (one after another)
    for (const [i, gl] of this.gulls.entries()) {
      const k = clamp((s - BEAT.gull - 0.3 - i * 0.7) / 1.1, 0, 1);
      if (k > 0 && gl.k === 0) g.audio.hypno();
      gl.k = k;
    }
    // his ibis, out of the Tower (and from under the tarp, as it comes off)
    if (hit('ibis')) for (const [i, h] of this.hench.entries()) if (!h.crew) this.sendOut(h, i * 0.3);
    if (hit('herd')) g.audio.honk(HENCH, false, 0.8);
    if (hit('tarp')) {
      this.tarpT = 0;
      g.audio.whoosh();
      for (const h of this.hench) if (h.crew) { h.pos.copy(h.post); h.out = true; h.heading = Math.PI / 2 * (h.post.x < this.cat.root.position.x ? -1 : 1); }
    }
    if (this.tarpT !== undefined && this.tarpT < 1.2) {
      const k = (this.tarpT += dt) / 1.2;
      this.tarp.position.set(this.cat.root.position.x + ease(Math.min(1, k)) * 7, this.cat.root.position.y + Math.sin(Math.min(1, k) * Math.PI) * 4, this.cat.root.position.z - k * 2);
      this.tarp.rotation.z = -k * 1.6;
      this.tarp.scale.set(1, 1 - k * 0.6, 1);
      if (k >= 1) this.tarp.visible = false;
    }
    // into the bin with you all: them first, one at a time, then you
    if (s >= BEAT.load && s < BEAT.fire) {
      const n = Math.floor((s - BEAT.load) / 0.38);
      this.flock.forEach((t, i) => {
        if (i > n || t.dead || i >= this.bucket.seats.length || t.seat?.set === this.bucket) return;
        if (t.state === S.THROWN && t.flight?.seat) return;
        t.sunT = t.showT = 0;
        t.bounces = 0;
        t.peck = 0;
        t.mount({ set: this.bucket, i });
        if (i % 2 === 0) this.hench[i % HERD.length].honkT = 0;
      });
    }
    if (hit('you')) {
      this.hop = { from: p.pos.clone().add(_v.set(0, 0.98, 0)), t: 0 };
      p.fling();
      g.audio.honk(HENCH, false);
      g.audio.oof();
    }
    if (this.hop && !this.flight) {
      const k = Math.min(1, (this.hop.t += dt) / 0.75);
      this.cat.bin.localToWorld(_v.set(0, 1.02 * BIN + 0.3, 0));
      p.pos.lerpVectors(this.hop.from, _v, k);
      p.pos.y += Math.sin(k * Math.PI) * 3;
      p.tumble = k < 1 ? k * TAU : this.armA - ARM.rest;
      p.tuck = Math.min(1, k * 2);
      p.heading = dampAngle(p.heading, 0, 8, dt);
    }
    // and away
    if (hit('fire')) {
      this.fireT = 0;
      g.audio.twang();
      g.shake(0.6);
    }
    if (this.flight) {
      const f = this.flight, k = (f.t += dt) / f.T;
      p.pos.lerpVectors(f.from, f.to, k);
      p.pos.y += f.h * 4 * k * (1 - k);
      p.tumble += dt * 7;
      p.tuck = 1;
    }
    // white, and down in the bush
    if (s >= BEAT.white) this.whiten(s < BEAT.bush ? smoothstep(BEAT.white, BEAT.bush - 0.1, s) : 1);
    if (hit('bush')) { this.landInBush(); return; }
    this.shoot(s);
  }

  /** one of his ibis, out of the Tower's lobby, `wait` seconds from now */
  sendOut(h, wait) {
    const [x, z] = at(245, -101.6);
    h.pos.set(x, this.game.world.groundHeight(x, z), z);
    h.wait = wait;
    h.heading = Math.PI;
  }

  /** away it goes, the arm up and over, and the bin flinging the lot of you out over the end of it, north */
  release() {
    const g = this.game, p = g.player;
    for (const t of this.flock) {
      if (t.dead || t.seat?.set !== this.bucket || t.state !== S.SWING) continue;
      const from = t.pos.clone(), to = new THREE.Vector3(from.x + rand(-8, 8), -20, from.z + LAUNCH.far + rand(-20, 20));
      t.leaveSeat();
      t.flight = { from, to, T: LAUNCH.T + rand(-0.3, 0.3), h: LAUNCH.h + rand(-15, 15), spin: rand(1.5, 3) * pick([-1, 1]) };
      t.flung = false;
      t.setState(S.LAUNCHED);
    }
    this.flight = { from: p.pos.clone(), to: new THREE.Vector3(p.pos.x, -20, p.pos.z + LAUNCH.far), T: LAUNCH.T, h: LAUNCH.h, t: 0 };
    this.hop = null;
    g.fx.dust(this.cat.bin.getWorldPosition(_v), 20);
  }

  /** (all white) down out of the sky over the bush, the lot of you, where a new game starts */
  landInBush() {
    const g = this.game, p = g.player, tk = g.turkeys, w = g.world;
    this.flight = null;
    const live = this.flock.filter((t) => !t.dead && !t.removed);
    SPROUTS.forEach(([dx, dz, stage], i) => {
      const x = START.x + dx, z = START.z + dz, y = w.groundHeight(x, z);
      let t = live[i];
      if (!t) { t = new Turkey(g, stage, x, z, S.LAUNCHED); tk.list.push(t); }
      t.dropEverything();
      t.flight = { from: new THREE.Vector3(x + rand(-3, 3), y + rand(...DROP.h), z + rand(-3, 3)), to: new THREE.Vector3(x, y, z), T: rand(...DROP.T), h: 0, spin: rand(1.5, 3) };
      t.pos.copy(t.flight.from);
      t.setState(S.LAUNCHED);
      t.growT = 0;
    });
    for (const t of live.slice(SPROUTS.length)) t.vanish(); // (there's no more than that in the bush to start with)
    this.flock = [];
    const y = w.groundHeight(START.x, START.z);
    this.drop = { from: new THREE.Vector3(START.x + 2, y + DROP.you, START.z + 3), to: new THREE.Vector3(START.x, y + 0.98, START.z), t: 0 };
    p.pos.copy(this.drop.from);
    p.heading = Math.PI;
    this.focus = new THREE.Vector3(START.x, y, START.z);
    const cam = g.cam;
    cam.target.set(START.x, y + 1, START.z);
    cam.snapTo(this.focus);
    cam.tilt = 0;
    this.cine.k = 0;
    this.stage = 'land';
    this.t = BEAT.bush;
    document.body.classList.remove('cine');
  }

  /** coming down in the bush: you hit the deck (and get up, and it's all yours) */
  updateLand(dt) {
    const g = this.game, p = g.player, s = (this.t += dt);
    this.whiten(1 - smoothstep(BEAT.bush + 0.1, BEAT.bush + 1.1, s));
    const d = this.drop;
    if (d) {
      const k = Math.min(1, (d.t += dt) / DROP.youT);
      p.pos.lerpVectors(d.from, d.to, k * k);
      p.tumble += dt * 8;
      p.tuck = 1 - smoothstep(0.7, 1, k);
      if (k >= 1) {
        this.drop = null;
        p.pos.set(START.x, g.world.groundHeight(START.x, START.z), START.z);
        p.heading = Math.PI;
        p.sprawl();
        g.audio.thud();
        g.fx.dust(p.pos, 18);
        g.shake(0.5);
      }
    }
    if (!d && p.life === 'ok') this.end();
  }

  /** how white it's gone (0..1) */
  whiten(k) {
    k = Math.round(k * 100) / 100;
    if (k === this.shown || !this.white) return;
    this.shown = k;
    this.white.style.opacity = k;
    this.white.classList.toggle('hidden', !k);
  }

  /* ---------------------------------------------------------------- the camera */
  /** where the scene's camera is, `s` seconds in (cut from shot to shot, each drifting a little, like a real one) */
  shoot(s) {
    const g = this.game, c = this.cine, e = this.emp, R = ROOF.y, P = (x, y, z) => _v.set(x + OX, y, z), L = (x, y, z) => _w.set(x + OX, y, z);
    if (s < BEAT.arrive) { c.k = 0; return; }
    c.k = 1;
    let pos, look;
    if (s < BEAT.land) {
      // him, coming in over the harbour, from down on the lawn
      const k = (s - BEAT.arrive) / (BEAT.land - BEAT.arrive);
      pos = P(236 + k * 2, 3 + k, -158 + k * 3);
      look = L(245, 30, -100).lerp(_q.copy(e.pos).setY(e.pos.y + 2), smoothstep(0.05, 0.4, k));
    } else if (s < BEAT.turn) {
      // up close, landing, and his honk
      const k = (s - BEAT.land) / (BEAT.turn - BEAT.land);
      pos = P(240.6 - k * 0.8, R + 0.5 + k * 0.5, -113.5 + k * 1.2);
      look = L(245, R + 3.8, -101.6);
    } else if (s < BEAT.wide) {
      // the button, and the dish coming up
      const k = (s - BEAT.turn) / (BEAT.wide - BEAT.turn);
      pos = P(234.5 + k * 1.5, R + 4.5 + k * 3, -117.5 - k * 1.5);
      look = L(246.5, R + 3.5 + k * 3.5, -99.5);
    } else if (s < BEAT.gull) {
      // and it's on: the lot, from down the lawn
      const k = (s - BEAT.wide) / (BEAT.gull - BEAT.wide);
      pos = P(270 - k * 2, 26 + k, -190 + k * 3);
      look = L(245, 38, -100);
    } else if (s < BEAT.gulls) {
      // a gull, its eyes going
      const gl = this.gulls[0].rig.root.position, k = (s - BEAT.gull) / (BEAT.gulls - BEAT.gull), p = g.player.pos;
      const d = Math.hypot(p.x - gl.x, p.z - gl.z) || 1, dx = (p.x - gl.x) / d, dz = (p.z - gl.z) / d, r = 1.9 - k * 0.4;
      pos = _v.set(gl.x + dx * r - dz * 0.6, gl.y + 0.85 - k * 0.1, gl.z + dz * r + dx * 0.6);
      look = _w.set(gl.x, gl.y + 0.55, gl.z);
    } else if (s < BEAT.ibis) {
      // and the rest of them, round the flock
      const k = (s - BEAT.gulls) / (BEAT.ibis - BEAT.gulls);
      pos = P(247 - k, 12, -165 + k);
      look = L(245, 0.6, -135);
    } else if (s < BEAT.herd) {
      // his ibis, out of the Tower
      const k = (s - BEAT.ibis) / (BEAT.herd - BEAT.ibis);
      pos = P(239 + k * 0.5, 2.2 + k * 0.2, -118 + k);
      look = L(245, 1.5, -107);
    } else if (s < BEAT.load) {
      // rounding you up, and the tarp coming off
      const k = (s - BEAT.herd) / (BEAT.load - BEAT.herd);
      pos = P(259 - k * 2, 15 - k * 2, -167 + k * 2);
      look = L(247, 0.5, -134);
    } else if (s < BEAT.fire + 0.1) {
      // into the bin
      const k = (s - BEAT.load) / (BEAT.fire - BEAT.load);
      pos = P(258 - k, 4.6 + k * 0.6, -143.5 - k);
      look = L(245, 2.6, -152.5);
    } else {
      // and away: after you, up and over the Tower
      const k = smoothstep(0, 1.1, s - BEAT.fire - 0.1), p = g.player.pos;
      pos = P(258 - 1, 5.2, -144.5).lerp(_q.set(p.x + 8, p.y + 6, p.z - 22), k);
      look = L(245, 2.6, -152.5).lerp(_q.set(p.x, p.y - 8 * k, p.z + 14 * k), smoothstep(0, 0.35, s - BEAT.fire - 0.1));
    }
    c.pos.copy(pos);
    c.look.copy(look);
  }

  /* ---------------------------------------------------------------- posing */
  poseCatapult(dt) {
    const cat = this.cat;
    if (this.fireT !== undefined && this.stage === 'scene') {
      const t = (this.fireT += dt), was = this.armA;
      // (the lever pulled, the rope gone, and up it comes, quicker and quicker, hard into the bar and a bounce off it)
      cat.lever.rotation.x = -0.9 * smoothstep(0, 0.12, t);
      cat.rope.visible = false;
      this.armA = t < ARM.swing ? ARM.rest + (ARM.stop - ARM.rest) * (t / ARM.swing) ** 2 : ARM.stop - 0.18 * Math.exp(-(t - ARM.swing) * 6) * Math.abs(Math.sin((t - ARM.swing) * 14));
      if (was < ARM.let && this.armA >= ARM.let && !this.flight) {
        cat.arm.rotation.x = this.armA;
        cat.root.updateMatrixWorld(true);
        this.release();
      }
      if (was < ARM.stop - 0.01 && this.armA >= ARM.stop - 0.01) { this.game.audio.thunk(); this.game.shake(0.4); }
    }
    cat.arm.rotation.x = this.armA;
    cat.root.updateMatrixWorld(true);
  }

  poseEmperor(dt) {
    const e = this.emp, r = e.rig;
    if (!r.root.visible) return;
    const t = this.game.time;
    let neck = Math.sin(t * 0.8) * 0.05 - 0.12, head = 0;
    if (this.stage === 'done' || (this.stage === 'scene' && this.t > BEAT.gull)) {
      // (stood about up there, surveying it all, chin up)
      e.look = damp(e.look, Math.sin(t * 0.37) * 0.6, 2, dt);
    } else e.look = damp(e.look, 0, 4, dt);
    if (e.peckT !== undefined) {
      const k = (e.peckT += dt) / 0.6, a = k < 0.5 ? -0.4 * (k / 0.5) : k < 0.75 ? -0.4 + 2.2 * ((k - 0.5) / 0.25) : 1.8 * Math.max(0, 1 - (k - 0.75) / 0.6);
      neck += a * 0.8;
      head += a * 0.5;
      if (k > 1.4) e.peckT = undefined;
    }
    if (e.honkT !== undefined) {
      const k = Math.sin(Math.min(1, (e.honkT += dt) / 0.9) * Math.PI);
      neck += (-0.85 - neck) * k;
      head += (-0.55 - head) * k;
      if (e.honkT > 0.9) e.honkT = undefined;
    }
    const flying = e.legs > 0.5;
    if (flying) { neck = 0.9; head = -0.7; }
    r.neck.rotation.set(neck, e.look, 0);
    r.head.rotation.x = head;
    r.legL.rotation.x = r.legR.rotation.x = e.legs;
    r.flyL.visible = r.flyR.visible = e.wings > 0.02;
    r.flyL.scale.setScalar(Math.max(0.02, e.wings));
    r.flyR.scale.setScalar(Math.max(0.02, e.wings));
    r.flyL.rotation.z = e.flap;
    r.flyR.rotation.z = -e.flap;
    r.bodyPivot.position.y = Math.sin(t * 1.3) * 0.006;
    r.root.position.copy(e.pos);
    r.root.rotation.set(e.pitch, e.heading, 0);
  }

  /** one of his ibis: out and scurrying to its post, then stood there, bobbing, honking now and then */
  poseHench(h, dt) {
    const r = h.rig;
    if (h.wait !== undefined) {
      if ((h.wait -= dt) > 0) return;
      h.wait = undefined;
      h.out = true;
    }
    r.root.visible = h.out;
    if (!h.out) return;
    const dx = h.post.x - h.pos.x, dz = h.post.z - h.pos.z, d = Math.hypot(dx, dz);
    h.speed = damp(h.speed, d > 0.2 ? RUN : 0, 6, dt);
    if (d > 0.05) {
      const step = Math.min(d, h.speed * dt);
      h.pos.x += (dx / d) * step;
      h.pos.z += (dz / d) * step;
      if (d > 0.3) h.heading = dampAngle(h.heading, Math.atan2(dx, dz), 8, dt);
    } else {
      // (at its post: facing you, the way it's there to keep an eye on you)
      const p = this.game.player.pos;
      h.heading = dampAngle(h.heading, Math.atan2(p.x - h.pos.x, p.z - h.pos.z), 3, dt);
    }
    h.pos.y = this.game.world.groundHeight(h.pos.x, h.pos.z);
    const k = Math.min(1, h.speed / 3);
    h.phase += dt * (2 + h.speed * 3.4 / HENCH);
    const sw = Math.sin(h.phase);
    let neck = Math.sin(h.phase * 2) * 0.08 * k + (1 - k) * Math.max(0, Math.sin(this.game.time * 1.1 + h.phase)) * 0.25, head = 0;
    if (h.honkT !== undefined) {
      const e = Math.sin(Math.min(1, (h.honkT += dt) / 0.5) * Math.PI);
      neck += (-0.85 - neck) * e;
      head += (-0.55 - head) * e;
      if (h.honkT > 0.5) h.honkT = undefined;
    }
    r.neck.rotation.set(neck, 0, 0);
    r.head.rotation.x = head;
    r.legL.rotation.x = sw * 0.7 * k;
    r.legR.rotation.x = -sw * 0.7 * k;
    r.bodyPivot.position.y = Math.abs(Math.cos(h.phase)) * 0.04 * k;
    r.root.position.copy(h.pos);
    r.root.rotation.set(0.12 * k, h.heading, 0);
  }

  /** a gull on the lawn: pecking about, then (spiral-eyed) turning to stare at you, its head going round with its eyes */
  poseGull(gl, dt) {
    const r = gl.rig, t = this.game.time;
    swirlIn(r.spirals, gl.k);
    let neck = 0, head = 0;
    if (gl.k > 0) {
      const p = this.game.player.pos, rp = r.root.position;
      gl.heading = dampAngle(gl.heading, Math.atan2(p.x - rp.x, p.z - rp.z), 2.5, dt);
      neck = -0.25;
      r.neck.rotation.z = Math.sin(t * 2.2 + rp.x) * 0.25 * gl.k; // (woozy)
    } else {
      if ((gl.peckT -= dt) <= 0) { gl.peckT = rand(1.2, 3.5); gl.peck = 0.6; gl.heading += rand(-0.8, 0.8); }
      gl.peck = Math.max(0, gl.peck - dt);
      neck = gl.peck > 0 ? Math.sin((gl.peck / 0.6) * Math.PI) * 1.2 : 0;
      head = neck * 0.4;
    }
    r.neck.rotation.x = neck;
    r.head.rotation.x = head;
    r.wingL.rotation.set(0, 1.45, -0.12); // (folded)
    r.wingR.rotation.set(0, -1.45, 0.12);
    r.root.rotation.y = gl.heading;
  }
}

