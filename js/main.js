import * as THREE from 'three';
import { World, ZONES, LEGS, OVAL, BEACH, FERRY, CITY } from './world.js';
import { Barriers } from './barriers.js';
import { Enemies } from './enemies.js';
import { Ghosts } from './ghosts.js';
import { FX } from './fx.js';
import { Audio } from './audio.js';
import { Ambience } from './ambience.js';
import { Flyovers } from './flyover.js';
import { Footprints } from './footprints.js';
import { Leaves } from './leaves.js';
import { Grubs } from './grubs.js';
import { Mounds } from './mound.js';
import { Turkeys } from './turkeys.js';
import { Player, MAX_HP } from './player.js';
import { Input } from './input.js';
import { Cursor } from './cursor.js';
import { HUD } from './hud.js';
import { Toys } from './toys.js';
import { Ferry } from './ferry.js';
import { BeachItem, BeachFlag } from './items.js';
import { Stumps, CricketGear } from './cricket.js';
import { Bin } from './bin.js';
import { BinBag } from './binbag.js';
import { BUILD_CREW } from './mound.js';
import { UMBRELLAS, FLAGS } from './props/beach.js';
import { SUBURB_BINS, SIDE_GATE } from './props/suburb.js';
import { HOME, START, TRACK, ARENAS, BUSH_BINS, BUSH_LITTER } from './props/bush.js';
import { CITY_BINS, CITY_BAGS, ALLEY_IBISES, CITY_IBISES, QUAY_GULLS, LANE_GATE, onKingsWay } from './props/city.js';
import { OVAL_BINS, FIELD_GATE, STUMPS, PLOVER_NESTS, CRICKET_KIT, OVAL_MOUND, OVAL_SNAKES, OVAL_SPIDER, MOWER } from './props/oval.js';
import { GULL_PATCHES, CAPTAIN_POST, WHARF_BINS } from './props/wharf.js';
import { LANE } from './props/harbour.js';
import { DevMenu } from './devmenu.js';
import { Saves } from './save.js';
import { Wasted } from './wasted.js';
import { clamp, damp, rand, smoothstep, lerp, TAU } from './util.js';

const THROW_RANGE = 11;
const WHISTLE_RANGE = 15;
const WHISTLE_MAX_R = 5.5;

/* ------------------------------------------------------------------ setup */
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
// (a window with no size yet, like a hidden tab, would make that 0/0: keep a sane shape until it has one)
const aspect = () => (innerWidth > 0 && innerHeight > 0 ? innerWidth / innerHeight : 16 / 9);
const camera = new THREE.PerspectiveCamera(50, aspect(), 0.1, 700);

const game = { scene, camera, renderer, time: 0, timeScale: 1, started: false, paused: false, stats: { leaves: 0, hatched: 0, plucked: 0, thrown: 0, lost: 0, converted: 0, saved: 0, wasted: 0 }, dev: { invincible: false } };
// nothing about beach turkeys shows up until the gate onto the beach is open (or you've got some anyway)
game.beachOpen = () => game.world.gates[OVAL].open || game.turkeys.counts.beach > 0 || game.turkeys.list.some((t) => t.kind === 'beach');
let shakeAmt = 0;
game.shake = (a) => { if (!game.loading) shakeAmt = Math.min(1.2, shakeAmt + a); };
game.audio = new Audio();
game.ambience = new Ambience(game); // (the sound of wherever you are, under everything else)
game.flyovers = new Flyovers(game); // (galahs, cockies and gulls going over, every so often)
game.footprints = new Footprints(game); // (in the sand at Manly)
game.world = new World(game);
game.barriers = new Barriers(game);
game.fx = new FX(game);
game.ghosts = new Ghosts(game);
game.hud = new HUD(game);
game.wasted = new Wasted(game); // (going down, GTA style, and being dug out of a mound after)
game.leaves = new Leaves(game);
game.grubs = new Grubs(game);
game.mounds = new Mounds(game);
game.player = new Player(game);
game.turkeys = new Turkeys(game);
game.enemies = new Enemies(game);
game.toys = new Toys(game);
game.ferry = new Ferry(game); // (tied up at Manly Wharf, going nowhere till the keys are got back off Captain Gull)
game.cursor = new Cursor(game);
window.game = game; // handy for poking around in devtools

const input = new Input();
const { world, player, turkeys, mounds, leaves, audio, hud, fx, enemies } = game;

/* ------------------------------------------------------------------ starting layout */
mounds.add(HOME.x, HOME.z, true);
for (const s of world.treeSpots) leaves.spawnCluster(s.x, s.z, s.palette === 'gum' ? 18 : 14, 4.2, s.palette);
for (const [x, z, n, r] of BUSH_LITTER) leaves.spawnCluster(x, z, n, r);

// the bush's clearings, each with a barricade across the way on for turkeys to knock down, and something
// guarding it: an ibis, a snake and an ibis, three ibises, then the funnel-web, whose web's strung across
// the way to the buried key
const barricade = {};
for (const a of ARENAS) {
  const b = game.barriers.addBarricade(a.at, a.to, { hp: a.hp, kind: a.barricade });
  b.guards = a.foes.map(([kind, back, side]) => enemies.spawn(kind, ...b.guardPost(back, side)));
  barricade[a.at] = b;
}
// the locals: ibises everywhere (one to most of the backyards, and round the Quay and up and down the city's
// street and back alley), giants by the key in the backyards and down the alley, a gang of them big and small
// picking over the bins down the bin alley, and at the end of it the King, on his throne of bins in front of
// the Town Hall: the end of the line
for (const [x, z] of [[4, -58], [-28, -52], [26, -78], [4, -90]]) enemies.spawn('ibis', x, z);
enemies.spawn('giant', -30, -80);
for (const [kind, x, z] of CITY_IBISES) enemies.spawn(kind, x, z);
for (const [kind, x, z] of ALLEY_IBISES) enemies.spawn(kind, x, z, 2.5); // (they don't stray far from their bins)
enemies.spawn('king', world.throne.down.x, world.throne.down.z);
// snakes lurking in the litter (and on the way round the oval), funnel-webs in their burrows (one out past
// the way out of the oval), and Big Kev on his oval, raking it with the oval's key (a key rake)
for (const [x, z] of [[34, -60], ...OVAL_SNAKES]) enemies.spawn('snake', x, z);
for (const [x, z] of [[-4, -79], OVAL_SPIDER]) enemies.spawn('spider', x, z);
enemies.spawn('keeper', 0, -142);
// and at Manly Wharf, Captain Gull, standing guard by the gangway with the ferry keys in his beak
enemies.spawn('captain', ...CAPTAIN_POST, CAPTAIN_POST);
// on the oval: its own mound, with some of the team's kit in it already; a pair of plovers to each nest,
// swooping anything that comes near (a taste of Big Kev); the stumps to dig up, and the cricket gear left
// lying about
mounds.add(...OVAL_MOUND).startWith(4, 'cricket', ['bat', 'helmet']);
for (const [x, z] of PLOVER_NESTS) {
  const [a, b] = [-1, 1].map((s) => enemies.spawn('plover', x + s * 1.3, z + 0.7, [x, z]));
  a.mate = b;
  b.mate = a;
}
for (const [x, z] of STUMPS) enemies.list.push(new Stumps(game, x, z));
for (const [type, x, z] of CRICKET_KIT) enemies.list.push(new CricketGear(game, type, x, z));
// each area hides a giant key for the padlocked gate out of it (or someone's got it)
game.barriers.spawnKeys();
// and a shortcut or two, latched on the far side: open once you've made it round
for (const s of [SIDE_GATE, LANE_GATE, FIELD_GATE]) game.barriers.addSideGate(s.a, s.b, s.latch, s.kind);
// wheelie bins to knock over: green ones spill garden clippings, red ones rubbish, yellow ones recycling
// (and down the city's bin alley, bin bags to tear open)
for (const [kind, x, z, face] of [...BUSH_BINS, ...SUBURB_BINS, ...OVAL_BINS, ...WHARF_BINS]) enemies.list.push(new Bin(game, kind, x, z, face));
for (const [kind, x, z, face] of CITY_BINS) enemies.list.push(new Bin(game, kind, x, z, face, kind === 'red')); // (the city's red bins are always overflowing)
for (const [x, z] of CITY_BAGS) enemies.list.push(new BinBag(game, x, z));
// the backyard playground (and the washing line, which is basically a merry-go-round)
game.toys.addTrampoline(30, -84);
game.toys.addSwingSet(-7, -43, 0);
game.toys.addHoist(-26, -46);
// and out in the bush, the gums' low branches to roost on
for (const r of world.roosts) game.toys.addRoost(r);
// in the city, the backs of the park benches, the bus stop's seat and the fountain's rim (and the benches along
// the Quay, and down the wharf at Manly)
for (const st of [...world.city.seats, ...world.wharf.seats]) game.toys.addPerches(st.obj, st.perches, { spread: 1, time: [10, 30] });
// at the oval, the stands (turkeys come and watch) and Big Kev's ride-on mower
for (const st of world.oval.stands) game.toys.addPerches(st.obj, st.perches, { spread: 3, time: [15, 40] });
game.toys.addMower(...MOWER);

// Manly: a beach mound to feed with stolen gear, crabs, and the King Crab in his rock pool at the Shelly Beach end
mounds.add(-18, -202, false, 'beach');
for (const [x, z] of [[-12, -218], [6, -230], [22, -208], [34, -232], [-4, -246]]) enemies.spawn('crab', x, z);
enemies.spawn('kingcrab', 55, -218);
const loot = [
  ['towel', -22, -210], ['ball', -18, -216], ['spade', -14, -220], ['bucket', -15, -221], ['thong', -14, -206], ['thong', -13, -206.5],
  ['sunscreen', -3, -212], ['towel', -1, -202], ['sunnies', 2, -203], ['hat', -8, -198], ['noodle', -6, -226], ['boogie', -8, -230],
  ['esky', 12, -214], ['umbrella', 12, -198], ['towel', 20, -220], ['ball', 26, -224], ['spade', 16, -204], ['bucket', 32, -212],
  ['towel', 38, -228], ['thong', 28, -216], ['sunnies', 26, -200], ['hat', 12, -222], ['boogie', 20, -234], ['surfboard', -16, -232],
  ['noodle', 38, -196], ['sunscreen', 42, -208],
  // beach chairs set up under the umbrellas
  ['chair', -17, -212], ['chair', 3.2, -205.8], ['chair', 20.2, -219.6], ['chair', 38, -201.6], ['chair', 36.2, -225.8],
  // things you need a swimmer to fetch
  ['surfboard', 15, -257], ['esky', 18, -255], ['ball', 5, -222], ['sunnies', 4, -222.5], ['towel', 47, -236],
];
for (const [type, x, z] of loot) enemies.list.push(new BeachItem(game, type, x, z));
// the lifesaving flags have to be dug out first; the umbrellas are bouncy
for (const [x, z] of FLAGS) enemies.list.push(new BeachFlag(game, x, z));
for (const [x, z, a, b] of UMBRELLAS) game.toys.addUmbrella(x, z, a, b);
// the wharf's seagulls, a few to each spilt packet of chips (and a couple more down at the Quay): they take it in
// turns to swoop, no more than a couple at a time (see Plover.mateBusy)
for (const [x, z, n] of [...GULL_PATCHES, ...QUAY_GULLS]) {
  const crew = Array.from({ length: n }, (_, i) => enemies.spawn('gull', x + Math.sin((i / n) * TAU) * 1.4, z + Math.cos((i / n) * TAU) * 1.4, [x, z]));
  for (const e of crew) e.crew = crew;
}
// you start out behind the mound, with a few turkeys poking up out of the ground in front of you
[[-1.6, -4.6, 0], [1.4, -4.2, 0], [0, -5.6, 0], [-2.9, -3.1, 0], [2.8, -2.9, 1], [-0.3, -3.1, 2]]
  .forEach(([x, z, s]) => { const t = turkeys.spawnSprout(START.x + x, START.z + z, s); t.growT = 0; });
game.grubs.spawn(START.x + 4.5, START.z - 2);
player.pos.set(START.x, world.groundHeight(START.x, START.z), START.z);

// saving your progress (see Saves): all of the above is what a new game starts out with, and a save says
// what's changed since. (Plus how far along you are: the areas you've been to, the tips you've been given)
const saves = new Saves(game, {
  get: () => ({ visited: [...visited], tip: tipIdx, told: bosses.map((h) => !!h.told), far: farPrompted, hurt: !!player.toldHurt, dugOut: game.wasted.told }),
  set: (d) => {
    for (const z of d.visited ?? []) visited.add(z);
    tipIdx = Math.max(tipIdx, d.tip ?? 0);
    bosses.forEach((h, i) => { h.told ||= !!d.told?.[i]; });
    farPrompted ||= !!d.far;
    player.toldHurt ||= !!d.hurt;
    game.wasted.told ||= !!d.dugOut;
  },
});
saves.register();
game.saves = saves;

/* ------------------------------------------------------------------ camera */
// (`leg`: the leg of the map it's looking down, see LEGS; `swing`: how much further round it's still to swing to
// get there; `sail`: 0..1, how far it's sat back to take in the harbour, out on the ferry)
const cam = { yaw: 0, dist: 12, zoom: 12, pitch: 0.74, tilt: 0, ahead: 0, leg: 0, swing: 0, sail: 0, target: new THREE.Vector3(START.x, 1, START.z) };
game.cam = cam;
const MIN_DIST = 3.2, MAX_DIST = 30;
const TURN_IN = 2.5; // metres into a place on the next leg before the camera swings round (so it doesn't flip back and forth at the gate)
const SWING = 2.4; // how quickly it swings round (1/s: see damp)
const SAIL = { dist: 6, pitch: 0.5, up: 2.5 }; // out on the ferry: metres further back, radians flatter and metres higher it looks (at your usual zoom)
const FOG = [scene.fog.near, scene.fog.far], SAIL_FOG = [95, 320]; // metres: where the haze starts, and where there's nothing but (and out on the harbour)
const focus = new THREE.Vector3();

/** swing round to look down leg `leg` (all at once, with `snap`) */
function turnTo(leg, snap = false) {
  cam.swing += LEGS[leg].yaw - LEGS[cam.leg].yaw;
  cam.leg = leg;
  if (snap) { cam.yaw += cam.swing; cam.swing = 0; }
}
/** straight round to look down the leg `at` is on (for turning up somewhere all at once: coming back to a mound, say) */
cam.snapTo = (at) => turnTo(ZONES[world.zoneOf(at.x, at.z)].leg, true);

function updateCamera(dt) {
  // round the corner onto the beach, the camera swings round with you to look down the way on (and so does
  // the sun, to stay over the same shoulder)
  const zone = world.zoneOf(player.pos.x, player.pos.z), leg = ZONES[zone].leg;
  if (leg !== cam.leg && world.depthIn(zone, player.pos.x, player.pos.z) > TURN_IN) turnTo(leg);
  if (cam.swing) {
    const d = Math.abs(cam.swing) < 1e-3 ? cam.swing : cam.swing * (1 - Math.exp(-SWING * dt));
    cam.yaw += d;
    cam.swing -= d;
  }
  world.setSunYaw(LEGS[cam.leg].yaw - cam.swing);
  // out on the ferry, it sits back and looks out, and you can see further: there's a harbour to take in (less
  // so the closer you've zoomed in)
  cam.sail = damp(cam.sail, zone === FERRY ? 1 : 0, 1.2, dt);
  const out = cam.sail * smoothstep(MIN_DIST, 12, cam.zoom);
  scene.fog.near = lerp(FOG[0], SAIL_FOG[0], cam.sail);
  scene.fog.far = lerp(FOG[1], SAIL_FOG[1], cam.sail);
  // zooming in swings the camera down towards eye level so you can see his face
  cam.dist = damp(cam.dist, cam.zoom + SAIL.dist * out, 10, dt);
  const close = 1 - smoothstep(MIN_DIST, 11, cam.dist);
  // (down the bin alley and in the King's court, it looks further ahead: there he is, on his throne at the end)
  cam.ahead = damp(cam.ahead, enemies.king?.alive && onKingsWay(player.pos.x, player.pos.z) ? -0.22 : 0, 1.5, dt);
  cam.pitch = clamp((cam.dist > 11 ? 0.74 + (cam.dist - 11) * 0.012 : lerp(0.74, 0.1, close)) + cam.tilt + cam.ahead - SAIL.pitch * out, 0.04, 1.45);
  const f = player.focus(focus); // (him, or the middle of him when he's lying there, out cold)
  if (game.wasted.stage === 'down') {
    // (up the screen a bit, so he's lying there above the WASTED, not hidden behind it)
    const up = cam.dist * 0.25 * game.wasted.lift;
    f.x += Math.sin(cam.yaw) * up;
    f.z += Math.cos(cam.yaw) * up;
  }
  cam.target.x = damp(cam.target.x, f.x, 8, dt);
  cam.target.y = damp(cam.target.y, f.y + lerp(0.8, 1.55, close) + SAIL.up * out, 8, dt);
  cam.target.z = damp(cam.target.z, f.z, 8, dt);
  const h = Math.cos(cam.pitch) * cam.dist;
  camera.position.set(
    cam.target.x + Math.sin(cam.yaw) * h,
    cam.target.y + Math.sin(cam.pitch) * cam.dist,
    cam.target.z + Math.cos(cam.yaw) * h,
  );
  camera.lookAt(cam.target);
  if (shakeAmt > 0) {
    camera.position.x += rand(-1, 1) * shakeAmt * 0.35;
    camera.position.y += rand(-1, 1) * shakeAmt * 0.35;
    shakeAmt = Math.max(0, shakeAmt - dt * 2.2);
  }
  // three.js only refreshes these at render time; the floating labels are projected before that,
  // so without this they'd use last frame's camera and trail a frame behind the scene
  camera.updateMatrixWorld();
  world.followSun(player.pos);
  world.fadeOccluders(camera.position, player.pos);
}
updateCamera(1);

/* ------------------------------------------------------------------ aiming */
const raycaster = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const aim = new THREE.Vector3();
const target = new THREE.Vector3();
const whistle = { active: false, center: new THREE.Vector3(), radius: 0, t: 0 };

function updateAim() {
  raycaster.setFromCamera(input.mouse, camera);
  let h = player.pos.y;
  for (let i = 0; i < 3; i++) {
    plane.constant = -h;
    if (!raycaster.ray.intersectPlane(plane, aim)) { aim.copy(player.pos); break; }
    h = world.groundHeight(aim.x, aim.z);
  }
  const clampTo = (out, max) => {
    const dx = aim.x - player.pos.x, dz = aim.z - player.pos.z, d = Math.hypot(dx, dz);
    const k = d > max ? max / d : 1;
    out.set(player.pos.x + dx * k, 0, player.pos.z + dz * k);
    world.resolve(out, 0.1);
    out.y = world.groundHeight(out.x, out.z);
    return out;
  };
  clampTo(target, THROW_RANGE);
  // throws can't sail over fences: stop just short of the first one in the way
  const clear = world.throwClear(player.pos.x, player.pos.z, target.x, target.z);
  if (clear < 1) {
    const dx = target.x - player.pos.x, dz = target.z - player.pos.z, d = Math.hypot(dx, dz) || 1;
    const k = Math.max(0, clear - 0.55 / d);
    target.set(player.pos.x + dx * k, 0, player.pos.z + dz * k);
    target.y = world.groundHeight(target.x, target.z);
  }
  if (!whistle.active) clampTo(whistle.center, WHISTLE_RANGE);
}

/* ------------------------------------------------------------------ actions */
let throwHold = 0, autoThrow = 0, pluckHold = 0, throwKind = null;
const move = { x: 0, z: 0 };

/** hands off (you've gone down): stop walking, whistling and throwing */
function letGo() {
  move.x = move.z = 0;
  throwHold = autoThrow = pluckHold = 0;
  if (whistle.active) { whistle.active = false; audio.whistleStop(); }
  player.whistling = false;
}

/** throw the next turkey; holding the button keeps throwing the same kind (so no landlubbers end up in the sea) */
function doThrow(manual) {
  const t = turkeys.throwAt(target, manual ? null : throwKind);
  if (t) {
    if (manual) throwKind = t.kind;
    player.playThrow();
    game.stats.thrown++;
  } else if (manual && turkeys.counts.squad === 0) {
    hud.toast(turkeys.counts.sprouts ? 'No turkeys with you. Pluck some with E!' : 'No turkeys with you. Whistle to call them!', 1.6);
  }
}

function tryPluck() {
  const t = turkeys.pluckNearest(player.pos);
  if (t) {
    player.playPluck();
    player.heading = Math.atan2(t.pos.x - player.pos.x, t.pos.z - player.pos.z);
    game.stats.plucked++;
  }
  return t;
}

/** M: mark out a new mound, and send a crew of turkeys to scratch it up (it takes at least BUILD_CREW) */
function buildMound() {
  const x = player.pos.x + Math.sin(player.heading) * 3, z = player.pos.z + Math.cos(player.heading) * 3;
  const why = mounds.whyNot(x, z);
  if (why) { hud.toast(why); audio.nope(); return; }
  const near = (t) => Math.hypot(t.pos.x - player.pos.x, t.pos.z - player.pos.z);
  const crew = turkeys.list.filter((t) => t.state === 'follow' && near(t) < 12).sort((a, b) => near(a) - near(b));
  if (crew.length < BUILD_CREW) {
    hud.toast(`It takes ${BUILD_CREW} turkeys to scratch up a mound (you've got ${crew.length} with you)`, 2.5);
    audio.nope();
    return;
  }
  const m = mounds.add(x, z, false, world.isSand(x, z) ? 'beach' : 'leaf', true);
  crew.slice(0, BUILD_CREW).forEach((t) => t.joinBuild(m));
  fx.ring(m.pos, 0xffd21f, 2.6, 0.6);
  audio.build();
  hud.toast(`${BUILD_CREW} turkeys are scratching up a new ${m.beach ? 'beach ' : ''}mound...`, 2.5);
}

function handleInput(dt) {
  if (input.isDown('KeyZ')) cam.yaw += dt * 2.2;
  if (input.isDown('KeyC')) cam.yaw -= dt * 2.2;
  // middle-drag orbits the camera (and tilts it up/down)
  if (input.mmb) {
    cam.yaw -= input.dragX * 0.006;
    cam.tilt = clamp(cam.tilt + input.dragY * 0.004, -0.5, 0.6);
  }
  document.body.style.cursor = input.mmb ? 'grabbing' : '';
  cam.zoom = clamp(cam.zoom * (1 + input.wheel * 0.12), MIN_DIST, MAX_DIST);

  let f = 0, r = 0;
  if (input.isDown('KeyW', 'ArrowUp')) f += 1;
  if (input.isDown('KeyS', 'ArrowDown')) f -= 1;
  if (input.isDown('KeyD', 'ArrowRight')) r += 1;
  if (input.isDown('KeyA', 'ArrowLeft')) r -= 1;
  const fx_ = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
  move.x = fx_ * f + -fz * r;
  move.z = fz * f + fx_ * r;
  const len = Math.hypot(move.x, move.z);
  if (len > 1) { move.x /= len; move.z /= len; }

  // throwing (hold to keep throwing)
  if (input.lmbPressed) { doThrow(true); throwHold = 0; autoThrow = 0; }
  else if (input.lmb) {
    throwHold += dt;
    if (throwHold > 0.35) { autoThrow -= dt; if (autoThrow <= 0) { autoThrow = 0.15; doThrow(false); } }
  }

  // whistle
  const wantWhistle = input.rmb || input.isDown('Space');
  if (wantWhistle && !whistle.active) { whistle.active = true; whistle.t = 0; audio.whistleStart(); }
  if (!wantWhistle && whistle.active) { whistle.active = false; audio.whistleStop(); }
  player.whistling = whistle.active;
  if (whistle.active) {
    whistle.t += dt;
    whistle.center.lerp(target, 1 - Math.exp(-20 * dt));
    whistle.radius = Math.min(WHISTLE_MAX_R, 0.6 + whistle.t * 9);
    const n = turkeys.whistle(whistle.center, whistle.radius);
    if (n) fx.sparkle(whistle.center, Math.min(6, n * 2), [0xffd21f]);
  }

  // plucking (hold E to keep plucking)
  if (input.pressed('KeyE')) { tryPluck(); pluckHold = 0; }
  else if (input.isDown('KeyE')) {
    pluckHold += dt;
    if (pluckHold > 0.32) { pluckHold = 0; tryPluck(); }
  }

  if (input.pressed('KeyX')) {
    const n = turkeys.dismiss();
    if (n) { audio.peep(2); hud.toast(`Dismissed ${n}`, 1); }
  }
  if (input.pressed('Tab')) {
    if (turkeys.cyclePreferred()) audio.peep(turkeys.candidate?.stage ?? 0);
    else {
      if (game.beachOpen()) hud.toast(turkeys.preferred === 'beach' ? 'No normal turkeys with you' : 'No beach turkeys with you', 1.4);
      audio.nope();
    }
  }
  if (input.pressed('KeyM')) buildMound();
  if (input.pressed('KeyH')) hud.toggleHelp();
}

/* ------------------------------------------------------------------ tips */
/** which area you're in (see ZONES) */
const zoneNow = () => world.zoneOf(player.pos.x, player.pos.z);
/** is the player in (or within `pad` of) one of the bush's clearings? */
const nearClearing = (name, pad = 6) => {
  const [x, z, r] = TRACK.clearings[name];
  return Math.hypot(player.pos.x - x, player.pos.z - z) < r + pad;
};
const tips = [
  { when: () => true, text: 'Walk up to a turkey poking out of the ground and press E to pluck it' },
  { when: () => game.stats.plucked >= 2, text: 'Aim at leaf litter and left-click to throw a turkey' },
  { when: () => game.stats.thrown >= 2, text: 'Turkeys rake the leaves back to the mound with their feet. Hold right-click to whistle them back' },
  { when: () => game.stats.leaves >= 4, text: 'Fill the mound to hatch more chicks!' },
  { when: () => game.stats.hatched >= 1, text: 'Grubs make turkeys grow. Bins are worth knocking over, too' },
  { when: () => nearClearing('ibis'), text: 'A barricade blocks the way on! Throw turkeys at it to knock it down, and some ON the ibis guarding it' },
  { when: () => nearClearing('gate'), text: 'The gate is padlocked. Find the giant golden key (look for the light beam)!' },
  { when: () => !barricade.guards.up, text: "The key's buried! Throw turkeys at it to dig it up, then enough of them can carry it to the gate" },
  { when: () => world.gates[0].open && zoneNow() === 1, text: 'Each key is bigger than the last: you will need a bigger flock!' },
  { when: () => zoneNow() === BEACH, text: 'Manly! Steal beach gear for the beach mound: it hatches BEACH turkeys' },
  { when: () => turkeys.list.some((t) => t.kind === 'beach' && t.state === 'follow'), text: 'Beach turkeys can swim! Others drown in deep water unless you whistle them out' },
  { when: () => turkeys.list.some((t) => t.kind === 'beach' && t.state === 'follow'), text: 'Tab swaps between normal and beach turkeys. The biggest always get thrown first' },
  { when: () => zoneNow() === BEACH && turkeys.list.some((t) => t.kind === 'beach'), text: 'Out of beach gear? Throw normal turkeys into a beach mound to turn them into beach turkeys' },
];
let tipIdx = 0, tipT = 1.5;
function updateTips(dt) {
  tipT -= dt;
  if (tipT > 0 || tipIdx >= tips.length) return;
  if (tips[tipIdx].when()) { hud.toast(tips[tipIdx].text, 5); tipIdx++; tipT = 6; }
  else tipT = 0.5;
}

/* ------------------------------------------------------------------ dev menu (~) */
// (just through the gate into each; and on the ferry, on her deck, wherever she's got to)
const ZONE_SPAWN = [[START.x, START.z], [6, -44], [-8, -104], [-16, -184], [76, -188], null, [362, -224]];
new DevMenu(game, {
  goto(v) {
    const zi = +v;
    for (let i = 0; i < zi; i++) game.barriers.unlock(i, true);
    const [x, z] = ZONE_SPAWN[zi] ?? [game.ferry.x - 10, LANE + 4];
    player.pos.set(x, world.groundHeight(x, z), z);
    cam.target.set(x, player.pos.y + 1, z);
    cam.snapTo(player.pos);
    // (your flock comes too, bunched up behind you)
    const [dx, dz] = LEGS[ZONES[zi].leg].dir;
    turkeys.list.filter((t) => t.state === 'follow').forEach((t, i) => {
      const back = 2 + Math.floor(i / 6) * 0.7, side = (i % 6) * 0.7 - 1.75;
      t.pos.set(x - dx * back - dz * side, 0, z - dz * back + dx * side);
    });
    hud.zoneTitle(ZONES[zi].name);
  },
  spawn(v) {
    const [kind, stage] = v.split(':');
    for (let i = 0; i < 10; i++) {
      const t = turkeys.spawnSprout(player.pos.x + rand(-2, 2), player.pos.z + rand(1, 3), +stage, kind);
      t.pluck();
    }
  },
  unlockAll() {
    game.barriers.gates.forEach((_, i) => game.barriers.unlock(i, true));
    game.barriers.barricades.forEach((b) => b.open(true));
    game.barriers.sideGates.forEach((s) => s.open(true));
    hud.toast('All gates unlocked');
  },
  killNearby() {
    enemies.list.filter((e) => e.alive && Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z) < 30).forEach((e) => e.die());
  },
  hatch() {
    const m = mounds.list.reduce((b, m2) => (!b || m2.pos.distanceTo(player.pos) < b.pos.distanceTo(player.pos) ? m2 : b), null);
    if (m) m.addLeaves(m.threshold - m.fill, null);
  },
  invincible() { game.dev.invincible = !game.dev.invincible; return game.dev.invincible; }, // (you and your turkeys)
  flyover() { if (!game.flyovers.send()) hud.toast('No clear way over from here (or some are going over already)', 3); },
  hurtMe() { player.hurt(25, null); },
  healMe() { player.hp = MAX_HP; },
  wasteMe() {
    if (game.dev.invincible || player.life !== 'ok') return;
    player.iframes = 0;
    player.hurt(player.hp, null);
  },
  saveNow() { hud.toast(saves.write() ? 'Saved' : 'Not saved (start playing first)', 2); },
  wipeSave() {
    Saves.clear();
    saves.on = false;
    location.reload();
  },
});

/* ------------------------------------------------------------------ zones & boss */
const visited = new Set([0]);
game.visited = visited; // (the HUD only counts the mounds in places you've been)
let zonePrompt = null; // { t, text }: a hint shown a moment after arriving somewhere new
let farPrompted = false;
// the bosses (and what they've got on them): said the first time you're close to one
const bosses = [
  { boss: enemies.king, text: "The King Ibis, with the key to the city round his neck! Fell him and the city's yours" },
  { boss: enemies.keeper, text: "Big Kev's rake is a key rake: it opens the gate out of the oval! Beat him and he'll drop it" },
  { boss: enemies.captain, text: "Captain Gull's got the ferry keys in his beak! Bring him down and they're yours" },
];
function updateZones(dt) {
  // the bush's track is a long walk: by the second clearing, it's time for a mound closer to hand
  if (!farPrompted && nearClearing('snake', 0)) {
    farPrompted = true;
    zonePrompt = { t: 2, text: `It's a long way back to the mound! Press M and ${BUILD_CREW} of your turkeys will scratch up a new one` };
  }
  const z = zoneNow();
  if (!visited.has(z)) {
    visited.add(z);
    hud.zoneTitle(ZONES[z].name);
    // a new area is a long walk from the old mounds: time to build one here
    if (z === 1) zonePrompt = { t: 3.5, text: `Press M and ${BUILD_CREW} of your turkeys will scratch up a new mound here` };
    // (the oval's got one already, with a bit of the team's kit in it)
    if (z === OVAL) zonePrompt = { t: 3.5, text: "The oval's mound has cricket gear in it already! Throw turkeys at the gear lying about and they'll carry it in" };
    // (out on the harbour, there's nothing to do but take in the sights)
    if (z === FERRY) zonePrompt = { t: 4, text: 'Sit back and enjoy the view! Z and C swing the camera round' };
    // (and over the other side, the King's waiting)
    if (z === CITY) zonePrompt = { t: 3.5, text: 'Circular Quay! The King Ibis holds court at the Town Hall, at the end of the bin alley' };
  }
  if (zonePrompt && (zonePrompt.t -= dt) <= 0) { hud.toast(zonePrompt.text, 6); zonePrompt = null; }
  for (const h of bosses) {
    if (h.told || !h.boss?.alive || Math.hypot(h.boss.pos.x - player.pos.x, h.boss.pos.z - player.pos.z) > 24) continue;
    h.told = true;
    hud.toast(h.text, 5);
  }
  hud.boss(enemies.engagedBoss());
}

/* ------------------------------------------------------------------ loop */
const clock = new THREE.Clock();
let first = true;

/** Esc: everything stands still (the sound too), with the controls up, till you press it again */
function setPaused(on) {
  game.paused = on;
  if (on) letGo();
  audio.pause(on);
  hud.pause(on);
}

/** `real`: seconds since the last frame (time itself can go slower: see game.timeScale) */
function step(real) {
  // (Esc pauses, and N turns the sound off or back on: any time, even while you're down)
  if (game.started) {
    if (input.pressed('Escape')) setPaused(!game.paused);
    if (input.pressed('KeyN')) hud.soundOff(audio.toggleOff(), true);
  }
  if (game.paused) { input.endFrame(); return; }
  const dt = real * game.timeScale;
  game.time += dt;
  const down = game.wasted.active;
  if (game.started && !down) { updateAim(); handleInput(dt); updateTips(dt); }
  else { letGo(); updateAim(); }

  game.ferry.update(dt); // (she carries everyone aboard before they get moving themselves)
  player.update(dt, move, target);
  updateCamera(dt);
  mounds.update(dt, camera);
  enemies.update(dt, camera);
  game.barriers.update(dt, camera);
  game.toys.update(dt); // rides move before their riders take their seats
  turkeys.update(dt);
  game.ghosts.update(dt);
  updateZones(dt);
  leaves.update(dt);
  game.grubs.update(dt, game.time);
  world.update(dt, game.time);
  game.ambience.update(dt);
  game.flyovers.update(dt);
  game.footprints.update(dt);
  saves.update(dt);
  fx.update(dt);
  game.cursor.update(dt, target, whistle, camera, !down);
  hud.update(dt);
  game.wasted.update(real); // (in real time: the slow-mo as you go down doesn't slow it down)
  input.endFrame();
}
game.step = step; // lets devtools fast-forward: for (let i = 0; i < 600; i++) game.step(1 / 60)
game.input = input;
game.aimTarget = target;

function frame() {
  requestAnimationFrame(frame);
  step(Math.min(clock.getDelta(), 1 / 20));
  renderer.render(scene, camera);
  if (first) { first = false; document.getElementById('loading').remove(); }
}
frame();

addEventListener('resize', () => {
  camera.aspect = aspect();
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* ------------------------------------------------------------------ play: a new game, or carry on */
const save = Saves.read();
const playBtn = document.getElementById('play'), newBtn = document.getElementById('new-game');
if (save) {
  playBtn.textContent = 'Continue';
  newBtn.classList.remove('hidden');
  const note = document.getElementById('save-note');
  const where = ZONES[world.zoneOf(save.player[0], save.player[1])].name, when = new Date(save.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  note.textContent = `Carry on in ${where} (saved ${when})`;
  note.classList.remove('hidden');
}

function start() {
  audio.init();
  document.getElementById('splash').classList.add('hidden');
  hud.show();
  hud.soundOff(audio.off); // (turned off last time: it still is)
  saves.on = true; // (from now on, it saves as you go)
  cam.snapTo(player.pos); // (looking down the way on, from wherever you are)
  setTimeout(() => { input.endFrame(); input.lmb = false; game.started = true; }, 50);
  setTimeout(() => hud.zoneTitle(ZONES[zoneNow()].name), 400);
}

playBtn.addEventListener('click', (e) => {
  e.currentTarget.blur();
  const ok = !save || saves.load(save);
  start();
  if (!ok) hud.toast("Some of your saved game couldn't be loaded", 5);
});

// (starting again means losing the save: one more click to be sure)
newBtn.addEventListener('click', (e) => {
  e.currentTarget.blur();
  if (!newBtn.classList.contains('sure')) {
    newBtn.classList.add('sure');
    newBtn.textContent = 'Sure? Your save will be lost';
    setTimeout(() => { newBtn.classList.remove('sure'); newBtn.textContent = 'New game'; }, 4000);
    return;
  }
  Saves.clear();
  start();
});

// (and whenever you leave the page, or switch away from it)
addEventListener('visibilitychange', () => { if (document.hidden) saves.write(); });
addEventListener('pagehide', () => saves.write());
