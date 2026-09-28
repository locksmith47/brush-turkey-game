import * as THREE from 'three';
import { World, ZONES } from './world.js';
import { Barriers } from './barriers.js';
import { Enemies } from './enemies.js';
import { Ghosts } from './ghosts.js';
import { FX } from './fx.js';
import { Audio } from './audio.js';
import { Leaves } from './leaves.js';
import { Grubs } from './grubs.js';
import { Mounds } from './mound.js';
import { Turkeys } from './turkeys.js';
import { Player, MAX_HP } from './player.js';
import { Input } from './input.js';
import { Cursor } from './cursor.js';
import { HUD } from './hud.js';
import { Toys } from './toys.js';
import { BeachItem, BeachFlag } from './items.js';
import { Stumps, CricketGear } from './cricket.js';
import { Bin } from './bin.js';
import { BinBag } from './binbag.js';
import { BUILD_CREW } from './mound.js';
import { UMBRELLAS, FLAGS } from './props/beach.js';
import { SUBURB_BINS, SIDE_GATE } from './props/suburb.js';
import { HOME, START, TRACK, ARENAS, BUSH_BINS, BUSH_LITTER } from './props/bush.js';
import { CITY_BINS, CITY_BAGS, ALLEY_IBISES, LANE_GATE, THRONE, onKingsWay } from './props/city.js';
import { OVAL_BINS, FIELD_GATE, STUMPS, PLOVER_NESTS, CRICKET_KIT } from './props/oval.js';
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

const game = { scene, camera, renderer, time: 0, timeScale: 1, started: false, stats: { leaves: 0, hatched: 0, plucked: 0, thrown: 0, lost: 0, converted: 0, saved: 0, wasted: 0 }, dev: { invincible: false } };
// nothing about beach turkeys shows up until the gate into Bondi is open (or you've got some anyway)
game.bondiOpen = () => game.world.gates[3].open || game.turkeys.counts.beach > 0 || game.turkeys.list.some((t) => t.kind === 'beach');
let shakeAmt = 0;
game.shake = (a) => { if (!game.loading) shakeAmt = Math.min(1.2, shakeAmt + a); };
game.audio = new Audio();
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
// the locals: ibises everywhere (one to most of the backyards, and up and down the city's street and back
// alley), giants by the key in the backyards and down the alley, a gang of them big and small picking over
// the bins down the bin alley, and at the end of it the King, on his throne of bins in front of the way
// out, with the city's key round his neck
for (const [x, z] of [[4, -58], [-28, -52], [26, -78], [4, -90]]) enemies.spawn('ibis', x, z);
enemies.spawn('giant', -30, -80);
for (const [x, z] of [[-22, -108], [16, -110], [12, -133], [38, -133], [22, -153]]) enemies.spawn('ibis', x, z);
enemies.spawn('giant', -32, -133);
for (const [kind, x, z] of ALLEY_IBISES) enemies.spawn(kind, x, z, 2.5); // (they don't stray far from their bins)
enemies.spawn('king', THRONE.x, THRONE.z + THRONE.front);
// snakes lurking in the litter, funnel-webs in their burrows (one each side of the way round the oval), and
// Big Kev on his oval, raking it with the oval's key (a key rake)
for (const [x, z] of [[34, -60], [38, -250]]) enemies.spawn('snake', x, z);
for (const [x, z] of [[-4, -79], [-37, -248]]) enemies.spawn('spider', x, z);
enemies.spawn('keeper', 0, -264);
// on the oval: a pair of plovers to each nest, swooping anything that comes near (a taste of Big Kev), the
// stumps to dig up, and the cricket gear left lying about
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
for (const [kind, x, z, face] of [...BUSH_BINS, ...SUBURB_BINS, ...CITY_BINS, ...OVAL_BINS]) {
  const overflowing = kind === 'red' && z < -98 && z > -220; // city bins are always overflowing
  enemies.list.push(new Bin(game, kind, x, z, face, overflowing));
}
for (const [x, z] of CITY_BAGS) enemies.list.push(new BinBag(game, x, z));
// the backyard playground (and the washing line, which is basically a merry-go-round)
game.toys.addTrampoline(30, -84);
game.toys.addSwingSet(-7, -43, 0);
game.toys.addHoist(-26, -46);
// and out in the bush, the gums' low branches to roost on
for (const r of world.roosts) game.toys.addRoost(r);

// Bondi: a beach mound to feed with stolen gear, crabs, and the King Crab in his rock pool
mounds.add(-22, -316, false, 'beach');
for (const [x, z] of [[-6, -322], [6, -340], [-16, -356], [8, -368], [22, -330]]) enemies.spawn('crab', x, z);
enemies.spawn('kingcrab', -6, -389);
const loot = [
  ['towel', -14, -312], ['ball', -8, -316], ['spade', -4, -320], ['bucket', -3, -319], ['thong', -18, -320], ['thong', -17.5, -321],
  ['sunscreen', -12, -331], ['towel', -22, -333], ['sunnies', -21, -336], ['hat', -26, -326], ['noodle', 2, -328], ['boogie', 6, -326],
  ['esky', -10, -346], ['umbrella', -26, -346], ['towel', -4, -354], ['ball', 0, -360], ['spade', -20, -350], ['bucket', -12, -366],
  ['towel', 4, -372], ['thong', -8, -362], ['sunnies', -24, -360], ['hat', -2, -346], ['boogie', 10, -354], ['surfboard', 8, -318],
  ['noodle', -28, -372], ['sunscreen', -16, -376],
  // beach chairs set up under the umbrellas
  ['chair', -12, -317], ['chair', -18.2, -337.2], ['chair', -4.4, -354.2], ['chair', -22.4, -372], ['chair', 1.8, -370.2],
  // things you need a swimmer to fetch
  ['surfboard', 33, -349], ['esky', 31, -352], ['ball', -2, -339], ['sunnies', -1.5, -338], ['towel', 12, -381],
];
for (const [type, x, z] of loot) enemies.list.push(new BeachItem(game, type, x, z));
// the lifesaving flags have to be dug out first; the umbrellas are bouncy
for (const [x, z] of FLAGS) enemies.list.push(new BeachFlag(game, x, z));
for (const [x, z, a, b] of UMBRELLAS) game.toys.addUmbrella(x, z, a, b);
// you start out behind the mound, with a few turkeys poking up out of the ground in front of you
[[-1.6, -4.6, 0], [1.4, -4.2, 0], [0, -5.6, 0], [-2.9, -3.1, 0], [2.8, -2.9, 1], [-0.3, -3.1, 2]]
  .forEach(([x, z, s]) => { const t = turkeys.spawnSprout(START.x + x, START.z + z, s); t.growT = 0; });
game.grubs.spawn(START.x + 4.5, START.z - 2);
player.pos.set(START.x, world.groundHeight(START.x, START.z), START.z);

// saving your progress (see Saves): all of the above is what a new game starts out with, and a save says
// what's changed since. (Plus how far along you are: the areas you've been to, the tips you've been given)
const saves = new Saves(game, {
  get: () => ({ visited: [...visited], tip: tipIdx, told: keyHolders.map((h) => !!h.told), far: farPrompted, hurt: !!player.toldHurt, dugOut: game.wasted.told }),
  set: (d) => {
    for (const z of d.visited ?? []) visited.add(z);
    tipIdx = Math.max(tipIdx, d.tip ?? 0);
    keyHolders.forEach((h, i) => { h.told ||= !!d.told?.[i]; });
    farPrompted ||= !!d.far;
    player.toldHurt ||= !!d.hurt;
    game.wasted.told ||= !!d.dugOut;
  },
});
saves.register();
game.saves = saves;

/* ------------------------------------------------------------------ camera */
const cam = { yaw: 0, dist: 12, zoom: 12, pitch: 0.74, tilt: 0, ahead: 0, target: new THREE.Vector3(START.x, 1, START.z) };
game.cam = cam;
const MIN_DIST = 3.2, MAX_DIST = 30;
const focus = new THREE.Vector3();
function updateCamera(dt) {
  // zooming in swings the camera down towards eye level so you can see his face
  cam.dist = damp(cam.dist, cam.zoom, 10, dt);
  const close = 1 - smoothstep(MIN_DIST, 11, cam.dist);
  // (down the bin alley and in the King's court, it looks further ahead: there he is, on his throne at the end)
  cam.ahead = damp(cam.ahead, enemies.king?.alive && onKingsWay(player.pos.x, player.pos.z) ? -0.22 : 0, 1.5, dt);
  cam.pitch = clamp((cam.dist > 11 ? 0.74 + (cam.dist - 11) * 0.012 : lerp(0.74, 0.1, close)) + cam.tilt + cam.ahead, 0.04, 1.45);
  const f = player.focus(focus); // (him, or the middle of him when he's lying there, out cold)
  if (game.wasted.stage === 'down') {
    // (up the screen a bit, so he's lying there above the WASTED, not hidden behind it)
    const up = cam.dist * 0.25 * game.wasted.lift;
    f.x += Math.sin(cam.yaw) * up;
    f.z += Math.cos(cam.yaw) * up;
  }
  cam.target.x = damp(cam.target.x, f.x, 8, dt);
  cam.target.y = damp(cam.target.y, f.y + lerp(0.8, 1.55, close), 8, dt);
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
      if (game.bondiOpen()) hud.toast(turkeys.preferred === 'beach' ? 'No normal turkeys with you' : 'No beach turkeys with you', 1.4);
      audio.nope();
    }
  }
  if (input.pressed('KeyM')) buildMound();
  if (input.pressed('KeyH')) hud.toggleHelp();
}

/* ------------------------------------------------------------------ tips */
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
  { when: () => world.gates[0].open && world.zoneOf(player.pos.z) === 1, text: 'Each key is bigger than the last: you will need a bigger flock!' },
  { when: () => world.zoneOf(player.pos.z) === 4, text: 'Bondi! Steal beach gear for the beach mound: it hatches BEACH turkeys' },
  { when: () => turkeys.list.some((t) => t.kind === 'beach' && t.state === 'follow'), text: 'Beach turkeys can swim! Others drown in deep water unless you whistle them out' },
  { when: () => turkeys.list.some((t) => t.kind === 'beach' && t.state === 'follow'), text: 'Tab swaps between normal and beach turkeys. The biggest always get thrown first' },
  { when: () => world.zoneOf(player.pos.z) === 4 && turkeys.list.some((t) => t.kind === 'beach'), text: 'Out of beach gear? Throw normal turkeys into a beach mound to turn them into beach turkeys' },
];
let tipIdx = 0, tipT = 1.5;
function updateTips(dt) {
  tipT -= dt;
  if (tipT > 0 || tipIdx >= tips.length) return;
  if (tips[tipIdx].when()) { hud.toast(tips[tipIdx].text, 5); tipIdx++; tipT = 6; }
  else tipT = 0.5;
}

/* ------------------------------------------------------------------ dev menu (~) */
const ZONE_SPAWN = [[START.x, START.z], [6, -44], [-8, -104], [-20, -226], [-16, -306], [-30, -406]];
new DevMenu(game, {
  goto(v) {
    const zi = +v;
    for (let i = 0; i < zi; i++) game.barriers.unlock(i, true);
    const [x, z] = ZONE_SPAWN[zi];
    player.pos.set(x, world.groundHeight(x, z), z);
    cam.target.set(x, player.pos.y + 1, z);
    turkeys.list.filter((t) => t.state === 'follow').forEach((t, i) => t.pos.set(x + (i % 6) * 0.7 - 2, 0, z + 2 + Math.floor(i / 6) * 0.7));
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
let zonePrompt = null; // { t, text }: a hint shown a moment after arriving somewhere new
let farPrompted = false;
// the bosses with a key on them: said the first time you're close to one
const keyHolders = [
  { boss: enemies.king, text: "The King Ibis wears the key to the gate round his neck! Fell him and it's yours" },
  { boss: enemies.keeper, text: "Big Kev's rake is a key rake: it opens the gate out of the oval! Beat him and he'll drop it" },
];
function updateZones(dt) {
  // the bush's track is a long walk: by the second clearing, it's time for a mound closer to hand
  if (!farPrompted && nearClearing('snake', 0)) {
    farPrompted = true;
    zonePrompt = { t: 2, text: `It's a long way back to the mound! Press M and ${BUILD_CREW} of your turkeys will scratch up a new one` };
  }
  const z = world.zoneOf(player.pos.z);
  if (!visited.has(z)) {
    visited.add(z);
    hud.zoneTitle(ZONES[z].name);
    // a new area is a long walk from the old mounds: time to build one here
    if (z === 1) zonePrompt = { t: 3.5, text: `Press M and ${BUILD_CREW} of your turkeys will scratch up a new mound here` };
  }
  if (zonePrompt && (zonePrompt.t -= dt) <= 0) { hud.toast(zonePrompt.text, 6); zonePrompt = null; }
  for (const h of keyHolders) {
    if (h.told || !h.boss?.alive || Math.hypot(h.boss.pos.x - player.pos.x, h.boss.pos.z - player.pos.z) > 24) continue;
    h.told = true;
    hud.toast(h.text, 5);
  }
  hud.boss(enemies.engagedBoss());
}

/* ------------------------------------------------------------------ loop */
const clock = new THREE.Clock();
let first = true;

/** `real`: seconds since the last frame (time itself can go slower: see game.timeScale) */
function step(real) {
  const dt = real * game.timeScale;
  game.time += dt;
  const down = game.wasted.active;
  if (game.started && !down) { updateAim(); handleInput(dt); updateTips(dt); }
  else { letGo(); updateAim(); }

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
  const where = ZONES[world.zoneOf(save.player[1])].name, when = new Date(save.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  note.textContent = `Carry on in ${where} (saved ${when})`;
  note.classList.remove('hidden');
}

function start() {
  audio.init();
  document.getElementById('splash').classList.add('hidden');
  hud.show();
  saves.on = true; // (from now on, it saves as you go)
  setTimeout(() => { input.endFrame(); input.lmb = false; game.started = true; }, 50);
  setTimeout(() => hud.zoneTitle(ZONES[world.zoneOf(player.pos.z)].name), 400);
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
