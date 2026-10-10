import * as THREE from 'three';
import { World, ZONES, LEGS, OVAL, BEACH, FERRY, CITY, OPERA, MILSONS, LUNA, BLUES } from './world.js';
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
import { Turkeys, MAX_TURKEYS } from './turkeys.js';
import { Player, MAX_HP } from './player.js';
import { Input } from './input.js';
import { Cursor } from './cursor.js';
import { HUD } from './hud.js';
import { Toys } from './toys.js';
import { Ferry } from './ferry.js';
import { Storm } from './storm.js';
import { Cuttle } from './cuttlefish.js';
import { BeachItem, BeachFlag } from './items.js';
import { Stumps, CricketGear } from './cricket.js';
import { Bin } from './bin.js';
import { BinBag } from './binbag.js';
import { BUILD_CREW } from './mound.js';
import { UMBRELLAS, FLAGS } from './props/beach.js';
import { SUBURB_BINS, SIDE_GATE } from './props/suburb.js';
import { HOME, START, TRACK, ARENAS, BUSH_BINS, BUSH_LITTER } from './props/bush.js';
import { CITY_BINS, CITY_BAGS, TORN_BAG_SPOTS, ALLEY_IBISES, CITY_IBISES, QUAY_GULLS, QUAY_MOUND, LANE_GATE, onKingsWay } from './props/city.js';
import { OVAL_BINS, FIELD_GATE, STUMPS, CRICKET_KIT, OVAL_IBISES, OVAL_MOUND, OVAL_SNAKES, OVAL_SPIDER, MOWER } from './props/oval.js';
import { GULL_PATCHES, CAPTAIN_POST, WHARF_BINS, WHARF_MOUND } from './props/wharf.js';
import { LANE } from './props/harbour.js';
import { OPERA_GULLS, OPERA_BAR, BENNY } from './props/opera.js';
import { HYDE_MOUND, HYDE_BINS, HYDE_IBISES, HYDE_RATS } from './props/hyde.js';
import { OX, MILSONS_MOUND, MILSONS_BINS, MILSONS_IBISES, MILSONS_RATS, LUNA_GULLS } from './props/milsons.js';
import { Seal } from './seal.js';
import { DevMenu } from './devmenu.js';
import { Saves } from './save.js';
import { Wasted } from './wasted.js';
import { Travel } from './travel.js';
import { Ride } from './train.js';
import { Ending } from './ending.js';
import { Opening, SPROUTS } from './opening.js';
import { Beacon } from './beacon.js';
import { spin } from './hypno.js';
import { Rubbish } from './rubbish.js';
import { BLUES_SPOTS } from './props/blues.js';
import { clamp, damp, rand, smoothstep, lerp, angleDiff, TAU } from './util.js';

const THROW_RANGE = 11;
const WHISTLE_RANGE = 15;
const WHISTLE_MAX_R = 5.5;
const PLUCK = { reach: 2.3, near: 1.2, every: 0.3, far: 14, stuck: 0.8 }; // holding E: m he plucks from, m he walks up to, s between plucks, m he'll go for the next one, and s he'll keep at one he can't get to

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
game.storm = new Storm(game); // (out on the harbour, when the giant cuttlefish comes up)
game.ghosts = new Ghosts(game);
game.hud = new HUD(game);
game.wasted = new Wasted(game); // (going down, GTA style, and being dug out of a mound after)
game.travel = new Travel(game); // (diving into a mound, with your squad, to come out of another)
game.ending = new Ending(game); // (in through Luna Park's mouth: that's as far as it goes, for now)
game.leaves = new Leaves(game);
game.grubs = new Grubs(game);
game.mounds = new Mounds(game);
game.player = new Player(game);
game.turkeys = new Turkeys(game);
game.enemies = new Enemies(game);
game.rubbish = new Rubbish(game); // (what the ibis throw at you)
game.toys = new Toys(game);
game.ferry = new Ferry(game); // (tied up at Manly Wharf, going nowhere till the keys are got back off Captain Gull)
game.cuttle = new Cuttle(game); // (and halfway over, the first time you cross, the giant cuttlefish)
game.ride = new Ride(game); // (the train at Museum, waiting to take you over the Bridge to Milsons Point)
game.cursor = new Cursor(game);
game.beacon = new Beacon(game); // (the Emperor's signal, going out from Blues Point Tower, and the Tower itself, off on the horizon)
window.game = game; // handy for poking around in devtools

const input = new Input();
const { world, player, turkeys, mounds, leaves, audio, hud, fx, enemies } = game;

/* ------------------------------------------------------------------ starting layout */
mounds.add(HOME.x, HOME.z, true);
for (const s of world.treeSpots) leaves.spawnCluster(s.x, s.z, s.n ?? (s.palette === 'gum' ? 18 : 14), 4.2, s.palette);
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
// the Town Hall: the end of the line. From the oval on, some of them have a pair of plovers with them (a
// couple on the oval, on the way round, and round the Quay, up the street and down the alleys): one riding on
// the ibis's back, keeping a lookout, and its mate alongside on foot, taking it in turns to swoop (see
// Plover.crewBusy)
for (const [x, z] of [[4, -58], [-28, -52], [26, -78], [4, -90]]) enemies.spawn('ibis', x, z);
enemies.spawn('giant', -30, -80);
const ridden = (ibis) => {
  const pair = [0, 1.6].map((dx) => enemies.spawn('plover', ibis.pos.x + dx, ibis.pos.z).ride(ibis));
  for (const p of pair) p.crew = pair;
};
for (const [x, z] of OVAL_IBISES) ridden(enemies.spawn('ibis', x, z, 4));
for (const [kind, x, z, plover, roam] of [...CITY_IBISES, ...ALLEY_IBISES.map((a) => [...a, 2.5])]) { // (the alley's lot don't stray far from their bins)
  const e = enemies.spawn(kind, x, z, roam);
  if (plover) ridden(e);
}
enemies.spawn('king', world.throne.down.x, world.throne.down.z);
// snakes lurking in the litter (and on the way round the oval), funnel-webs in their burrows (one out past
// the way out of the oval), and Big Kev on his oval, raking it with the oval's key (a key rake)
for (const [x, z] of [[34, -60], ...OVAL_SNAKES]) enemies.spawn('snake', x, z);
for (const [x, z] of [[-4, -79], OVAL_SPIDER]) enemies.spawn('spider', x, z);
enemies.spawn('keeper', 0, -142);
// and at Manly Wharf, Captain Gull, standing guard by the gangway with the ferry keys in his beak
enemies.spawn('captain', ...CAPTAIN_POST, CAPTAIN_POST);
// on the oval: the padded mound, with some of the team's kit in it already (everything out of it comes out
// padded up, while there's kit to go round); the stumps to dig up, and the cricket gear left lying about, to
// bring it more kit
mounds.add(...OVAL_MOUND).startWith(4, 'cricket').padUp();
for (const [x, z] of STUMPS) enemies.list.push(new Stumps(game, x, z));
for (const [type, x, z] of CRICKET_KIT) enemies.list.push(new CricketGear(game, type, x, z));
// each area hides a giant key for the padlocked gate out of it (or someone's got it)
game.barriers.spawnKeys();
// and a shortcut or two, latched on the far side: open once you've made it round
for (const s of [SIDE_GATE, LANE_GATE, FIELD_GATE]) game.barriers.addSideGate(s.a, s.b, s.latch, s.kind);
// wheelie bins to knock over: green ones spill garden clippings, red ones rubbish, yellow ones recycling
// (and down the city's bin alley, bin bags to tear open)
for (const [kind, x, z, face] of [...BUSH_BINS, ...SUBURB_BINS, ...OVAL_BINS, ...WHARF_BINS, ...HYDE_BINS, ...MILSONS_BINS]) enemies.list.push(new Bin(game, kind, x, z, face));
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
for (const st of [...world.city.seats, ...world.wharf.seats, ...world.hyde.seats, ...world.milsons.seats]) game.toys.addPerches(st.obj, st.perches, { spread: 1, time: [10, 30] });
// at the oval, the stands (turkeys come and watch) and Big Kev's ride-on mower
for (const st of world.oval.stands) game.toys.addPerches(st.obj, st.perches, { spread: 3, time: [15, 40] });
game.toys.addMower(...MOWER);
// and round the back of the Opera House, Benny the seal, and his steps, to lie about in the sun on with him
for (const st of world.opera.seats) game.toys.addPerches(st.obj, st.perches, { pose: 'sunbake', spread: 2, time: [15, 40] });
game.benny = new Seal(game, ...BENNY);

// Hyde Park, through the gate out of the side of the King's court: the fountain to wash in, the statues' heads to
// sit on, a mound among the figs, bins, and ibises (a giant by the station), with the rats about the bins
mounds.add(...HYDE_MOUND).startWith(3, 'fig');
game.toys.addBath(world.hyde.bath.obj, world.hyde.bath.perches, { spread: 2 });
for (const st of world.hyde.statues) game.toys.addPerches(st.obj, st.perches, { spread: 1, time: [15, 40] });
for (const [kind, x, z] of [...HYDE_IBISES, ...MILSONS_IBISES]) enemies.spawn(kind, x, z, 5);
for (const [x, z] of [...HYDE_RATS, ...MILSONS_RATS]) enemies.spawn('rat', x, z);
// and over the Bridge, at Milsons Point: a mound in Bradfield Park, and seagulls round the chips on Luna Park's boardwalk
mounds.add(...MILSONS_MOUND).startWith(3, 'fig');

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
// (and the bar's, out on the Opera House's broadwalk)
for (const [x, z] of OPERA_BAR) game.toys.addUmbrella(x, z, 0xfaf7ef, 0xe0d9c8);
// the wharf's seagulls, a few to each spilt packet of chips (and a couple more down at the Quay, and along the
// broadwalk round the Opera House, and Luna Park's boardwalk): they take it in turns to swoop, no more than a couple at a
// time (see Plover.crewBusy). At the wharf and the Opera House there's an ibis picking over each lot of chips too, with
// one of the gulls up on its back, the way the plovers ride them (the ibis first, so the gull goes where it's just been)
for (const [x, z, n, ibis] of [...GULL_PATCHES.map((p) => [...p, true]), ...QUAY_GULLS, ...OPERA_GULLS.map((p) => [...p, true]), ...LUNA_GULLS]) {
  const mount = ibis && enemies.spawn('ibis', x, z, 2.5);
  const crew = Array.from({ length: n }, (_, i) => enemies.spawn('gull', x + Math.sin((i / n) * TAU) * 1.4, z + Math.cos((i / n) * TAU) * 1.4, [x, z]));
  for (const e of crew) e.crew = crew;
  if (mount) crew[0].ride(mount);
}
// (and there's always more where that came from, for an ibis after something to throw: the chips, and the torn bags
// down the bin alley)
for (const [x, z] of [...GULL_PATCHES, ...QUAY_GULLS, ...OPERA_GULLS, ...LUNA_GULLS]) game.rubbish.addSpot(x, z, true);
for (const [x, z] of TORN_BAG_SPOTS) game.rubbish.addSpot(x, z, false);
// a mound among the pines on the wharf's forecourt, to grow your flock again (if the cuttlefish has had the lot)
mounds.add(...WHARF_MOUND).startWith(3, 'pine');
// and over the harbour, a mound on the Quay (with a fish or two in it already), for the fish the giant cuttlefish
// churns up out on the harbour
mounds.add(...QUAY_MOUND).startWith(3, 'fish');
// you start out behind the mound, with a few turkeys poking up out of the ground in front of you (or that's where you
// all come down, out of the Emperor's catapult, in a new game: see Opening)
SPROUTS.forEach(([x, z, s]) => { const t = turkeys.spawnSprout(START.x + x, START.z + z, s); t.growT = 0; });
game.grubs.spawn(START.x + 4.5, START.z - 2);
player.pos.set(START.x, world.groundHeight(START.x, START.z), START.z);
// and over on Blues Point, home: the flock's playground and mound, and the Emperor's lot, waiting (see Opening)
game.opening = new Opening(game);

// saving your progress (see Saves): all of the above is what a new game starts out with, and a save says
// what's changed since. (Plus how far along you are: the areas you've been to, the tips you've been given)
const saves = new Saves(game, {
  get: () => ({ visited: [...visited], once: [...hud.told], told: bosses.map((h) => !!h.told), hurt: !!player.toldHurt, dugOut: game.wasted.told, travel: game.travel.told, ended: game.ending.seen }),
  set: (d) => {
    for (const z of d.visited ?? []) visited.add(z);
    for (const k of d.once ?? oldTips(d)) hud.told.add(k);
    bosses.forEach((h, i) => { h.told ||= !!d.told?.[i]; });
    player.toldHurt ||= !!d.hurt;
    game.wasted.told ||= !!d.dugOut;
    game.travel.told ||= !!d.travel;
    game.ending.seen ||= !!d.ended;
  },
});
saves.register();
game.saves = saves;

/* ------------------------------------------------------------------ camera */
// (`leg`: the leg of the map it's looking down, see LEGS; `swing`: how much further round it's still to swing to
// get there; `sail`: 0..1, how far it's sat back to take in the harbour, out on the ferry; `fight`: 0..1, how far
// it's sat up again to see the giant cuttlefish over her cabins; `vista`: 0..1, how far it can see, over at Milsons Point)
const cam = { yaw: 0, dist: 12, zoom: 12, pitch: 0.74, tilt: 0, ahead: 0, leg: 0, swing: 0, sail: 0, fight: 0, vista: 0, watch: 0, target: new THREE.Vector3(START.x, 1, START.z) };
game.cam = cam;
const MIN_DIST = 3.2, MAX_DIST = 30;
const TURN_IN = 2.5; // metres into a place on the next leg before the camera swings round (so it doesn't flip back and forth at the gate)
const SWING = 2.4; // how quickly it swings round (1/s: see damp)
const SAIL = { dist: 6, pitch: 0.5, up: 2.5 }; // out on the ferry: metres further back, radians flatter and metres higher it looks (at your usual zoom)
const FIGHT = { dist: 4, pitch: 0.15 }; // and with the cuttlefish at her: metres further back again, and radians less flat
const WATCH = { dist: 16, pitch: 0.3 }; // watching the train off into the tunnel: metres back, and radians flatter (where from, and at what, is the train's: see Ride.watchAt)
const SIGHTS = 0.7; // (and how much of that it sits back round the Opera House, to take in the sails)
const FOG = [scene.fog.near, scene.fog.far], SAIL_FOG = [95, 320]; // metres: where the haze starts, and where there's nothing but (and out on the harbour)
const VISTA_FOG = [150, 520]; // (and at Milsons Point and Luna Park, looking out over it all to the city)
/** is zone i over the harbour, at Milsons Point, Luna Park or Blues Point? */
const onIsle = (i) => i === MILSONS || i === LUNA || i === BLUES;
const focus = new THREE.Vector3(), cineLook = new THREE.Vector3();

/** swing round to look down leg `leg` (all at once, with `snap`) */
function turnTo(leg, snap = false) {
  cam.swing += LEGS[leg].yaw - LEGS[cam.leg].yaw;
  cam.leg = leg;
  if (snap) { cam.yaw += cam.swing; cam.swing = 0; }
}
/** straight round to look down the leg `at` is on (for turning up somewhere all at once: coming back to a mound, say) */
cam.snapTo = (at) => {
  const zone = world.zoneOf(at.x, at.z);
  turnTo(ZONES[zone].leg, true);
  cam.vista = onIsle(zone) ? 1 : 0; // (the haze, all at once, too)
  cam.watch = 0;
};

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
  // so the closer you've zoomed in). And round at the Opera House, there are the sails to take in
  cam.sail = damp(cam.sail, zone === FERRY ? 1 : zone === OPERA || zone === MILSONS ? SIGHTS : 0, 1.2, dt);
  const out = cam.sail * smoothstep(MIN_DIST, 12, cam.zoom);
  // (and over at Milsons Point, you can see for miles: the Bridge, and the city over the water)
  cam.vista = damp(cam.vista, onIsle(zone) ? 1 : 0, 1.5, dt);
  scene.fog.near = lerp(lerp(FOG[0], SAIL_FOG[0], cam.sail), VISTA_FOG[0], cam.vista);
  scene.fog.far = lerp(lerp(FOG[1], SAIL_FOG[1], cam.sail), VISTA_FOG[1], cam.vista);
  // (and when the giant cuttlefish comes up, it sits up to look down over her cabins, at it and its tentacles)
  cam.fight = damp(cam.fight, game.cuttle.fighting ? 1 : 0, 1, dt);
  // (and on the train at Museum, it settles down low on the platform to watch her go, off into the tunnel)
  cam.watch = damp(cam.watch, game.ride.watching ? 1 : 0, 1.2, dt);
  // zooming in swings the camera down towards eye level so you can see his face
  cam.dist = damp(cam.dist, lerp(cam.zoom + (SAIL.dist + FIGHT.dist * cam.fight) * out, WATCH.dist, cam.watch), 10, dt);
  const close = 1 - smoothstep(MIN_DIST, 11, cam.dist);
  // (down the bin alley and in the King's court, it looks further ahead: there he is, on his throne at the end)
  cam.ahead = damp(cam.ahead, enemies.king?.alive && onKingsWay(player.pos.x, player.pos.z) ? -0.22 : 0, 1.5, dt);
  cam.pitch = clamp((cam.dist > 11 ? 0.74 + (cam.dist - 11) * 0.012 : lerp(0.74, 0.1, close)) + cam.tilt + cam.ahead - (SAIL.pitch - FIGHT.pitch * cam.fight) * out - WATCH.pitch * cam.watch, 0.04, 1.45);
  const f = game.opening.focus ? focus.copy(game.opening.focus) : player.focus(focus); // (him, or the middle of him when he's lying there, out cold; or where he's coming down)
  if (game.wasted.stage === 'down') {
    // (up the screen a bit, so he's lying there above the WASTED, not hidden behind it)
    const up = cam.dist * 0.25 * game.wasted.lift;
    f.x += Math.sin(cam.yaw) * up;
    f.z += Math.cos(cam.yaw) * up;
  }
  if (cam.watch > 1e-3) f.lerp(game.ride.watchAt, cam.watch);
  const yaw = cam.yaw + angleDiff(cam.yaw, game.ride.watchYaw) * cam.watch;
  cam.target.x = damp(cam.target.x, f.x, 8, dt);
  cam.target.y = damp(cam.target.y, f.y + lerp(0.8, 1.55, close) + SAIL.up * out, 8, dt);
  cam.target.z = damp(cam.target.z, f.z, 8, dt);
  const h = Math.cos(cam.pitch) * cam.dist;
  camera.position.set(
    cam.target.x + Math.sin(yaw) * h,
    cam.target.y + Math.sin(cam.pitch) * cam.dist,
    cam.target.z + Math.cos(yaw) * h,
  );
  camera.lookAt(cam.target);
  // (the opening's scene has a camera of its own: see Opening)
  const cine = game.opening.cine;
  if (cine.k > 0) {
    camera.position.lerp(cine.pos, cine.k);
    camera.lookAt(cineLook.copy(cam.target).lerp(cine.look, cine.k));
  }
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
    if (manual) throwKind = turkeys.kindOf(t);
    player.playThrow();
    game.stats.thrown++;
  } else if (manual) audio.nope(); // (nobody with you to throw)
}

function tryPluck() {
  const t = turkeys.pluckNearest(player.pos, PLUCK.reach);
  if (t) {
    player.playPluck();
    player.heading = Math.atan2(t.pos.x - player.pos.x, t.pos.z - player.pos.z);
    game.stats.plucked++;
  }
  return t;
}

let pluckNext = null, pluckBest = 0, pluckStuck = 0;
const pluckSkip = new Set(); // (ones he couldn't get to, this go)
/**
 * E held: he goes from one turkey in the ground to the next, nearest first, and plucks each (bar ones he can't see,
 * over in the next place, or with the flock full). Steer yourself (`steering`) and he plucks whatever's in reach
 */
function pluckOn(dt, steering) {
  pluckHold += dt;
  if (player.pluckT < 1 || turkeys.plucked >= MAX_TURKEYS) return; // (mid-yank; or there's no room for any more)
  const p = player.pos, zone = zoneNow();
  let next = null, bd = PLUCK.far;
  for (const t of turkeys.list) {
    if (t.state !== 'sprout' || pluckSkip.has(t)) continue;
    const d = Math.hypot(t.pos.x - p.x, t.pos.z - p.z);
    if (d < bd && world.zoneOf(t.pos.x, t.pos.z) === zone && world.canSee(p.x, p.z, t.pos.x, t.pos.z)) { bd = d; next = t; }
  }
  if (!next) return;
  if (next !== pluckNext) { pluckNext = next; pluckBest = bd; pluckStuck = 0; }
  // (he walks right up to it first, unless you're steering; or he can't get any closer)
  const stuck = steering || bd < pluckBest - 0.05 ? (pluckStuck = 0) : (pluckStuck += dt) > PLUCK.stuck;
  pluckBest = Math.min(pluckBest, bd);
  if (bd < (steering || stuck ? PLUCK.reach : PLUCK.near)) {
    if (pluckHold > PLUCK.every) { pluckHold = 0; tryPluck(); }
    return;
  }
  if (stuck) { pluckSkip.add(next); pluckNext = null; return; } // (something's in the way: leave that one be)
  if (steering) return;
  move.x = (next.pos.x - p.x) / bd;
  move.z = (next.pos.z - p.z) / bd;
}

/** M: mark out a new mound, and send a crew of turkeys to scratch it up (it takes at least BUILD_CREW) */
function buildMound() {
  const x = player.pos.x + Math.sin(player.heading) * 3, z = player.pos.z + Math.cos(player.heading) * 3;
  const why = mounds.whyNot(x, z);
  if (why) { hud.toast(why); audio.nope(); return; }
  const near = (t) => Math.hypot(t.pos.x - player.pos.x, t.pos.z - player.pos.z);
  const crew = turkeys.list.filter((t) => t.state === 'follow' && near(t) < 12).sort((a, b) => near(a) - near(b));
  if (crew.length < BUILD_CREW) {
    hud.toast(`You need ${BUILD_CREW} turkeys with you to scratch up a mound`, 2.5);
    audio.nope();
    return;
  }
  const m = mounds.add(x, z, false, world.isSand(x, z) ? 'beach' : 'leaf', true);
  crew.slice(0, BUILD_CREW).forEach((t) => t.joinBuild(m));
  fx.ring(m.pos, 0xffd21f, 2.6, 0.6);
  audio.build();
  hud.told.add('mound'); // (no need to tell you how, now)
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

  // plucking (hold E to keep plucking, and he goes from one to the next)
  if (input.pressed('KeyE')) { tryPluck(); pluckHold = 0; pluckSkip.clear(); pluckNext = null; }
  else if (input.isDown('KeyE')) pluckOn(dt, f || r);

  if (input.pressed('KeyX') && turkeys.dismiss()) audio.peep(2, true);
  if (input.pressed('Tab')) {
    if (turkeys.cyclePreferred()) audio.peep(turkeys.candidate?.stage ?? 0, true);
    else audio.nope(); // (none of the other kind with you)
  }
  if (input.pressed('KeyM')) buildMound();
  if (input.pressed('KeyF') && !game.ferry.tryLever() && !game.ride.tryBoard()) game.travel.tryDive(); // (a lever, if you're by one: see Ferry; or the train's doors)
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
/** is there a beach turkey following you? */
const beachSquad = () => turkeys.list.some((t) => t.kind === 'beach' && t.state === 'follow');
/** or one padded up in its cricket kit? */
const paddedSquad = () => turkeys.list.some((t) => t.state === 'follow' && turkeys.kindOf(t) === 'padded');
/** by the padded mound, with kit left in it, and turkeys with you it could pad up? */
const byPadded = () => {
  const pad = mounds.list.find((m) => m.padded);
  return pad && pad.gear > 0 && Math.hypot(player.pos.x - pad.pos.x, player.pos.z - pad.pos.z) < 12 && turkeys.list.some((t) => t.state === 'follow' && turkeys.kindOf(t) !== 'padded');
};
// how things are done, each said the once (see HUD.toastOnce), when it's first needed: whichever's due first goes
// up, then there's a breather before the next. One you've no need of (you've worked it out, or it's been and gone)
// is never said at all
const tips = [
  { key: 'pluck', when: () => !game.stats.plucked, text: 'Walk up to a turkey poking out of the ground and press E to pluck it. Hold E to go on to the next' },
  { key: 'throw', when: () => game.stats.plucked >= 2 && !game.stats.thrown, text: 'Aim at leaf litter and left-click to throw a turkey' },
  { key: 'whistle', when: () => game.stats.thrown >= 2, text: 'Turkeys rake the leaves back to the mound with their feet. Hold right-click to whistle them back' },
  { key: 'fill', when: () => game.stats.leaves >= 4 && !game.stats.hatched, text: 'Fill the mound to hatch more chicks!' },
  { key: 'grubs', when: () => game.stats.hatched >= 1, text: 'Grubs make turkeys grow. Bins are worth knocking over, too' },
  { key: 'barricade', when: () => nearClearing('ibis') && barricade.ibis.up, text: "A barricade's blocking the way on. Throw turkeys at it to knock it down, and a few on the ibis guarding it" },
  { key: 'gate', when: () => nearClearing('gate') && !world.gates[0].unlocked, text: "The gate's padlocked. Find its giant golden key: look for the beam of light" },
  { key: 'dig', when: () => !barricade.guards.up && game.barriers.keys[0].alive, text: "The key's buried. Throw turkeys at it to dig it up, then enough of them can carry it to the gate" },
  // (building one yourself tells you all you need to know: see buildMound)
  { key: 'mound', when: () => nearClearing('snake', 0) || zoneNow() === 1, text: `Your mound's a long way back now. Press M and ${BUILD_CREW} of your turkeys will scratch up a new one` },
  { key: 'bigger', when: () => world.gates[0].open && zoneNow() === 1, text: "Each key's bigger than the last, so you'll need a bigger flock" },
  { key: 'tab-padded', when: paddedSquad, text: 'Press Tab to throw your padded turkeys, and again to go back to the others' },
  { key: 'manly', when: () => zoneNow() === BEACH, text: 'Manly! Pinch the beach gear for the beach mound: it hatches beach turkeys' },
  { key: 'swim', when: beachSquad, text: 'Beach turkeys can swim. The others drown in deep water, unless you whistle them out' },
  { key: 'tab', when: beachSquad, text: 'Press Tab to throw your beach turkeys, and again to go back to the others' },
  // (or the beach mound tells you, if you find out for yourself: see Mound.convert)
  { key: 'convert', when: () => zoneNow() === BEACH && turkeys.list.some((t) => t.kind === 'beach'), text: 'Out of beach gear? Throw normal turkeys into a beach mound to turn them into beach turkeys' },
  // (and a word as you first get to each of the places that need one)
  { key: 'oval', when: () => zoneNow() === OVAL, text: "The padded mound's chicks come out in cricket kit, while it's got any. Throw turkeys at the cricket gear lying about and they'll carry it in" },
  { key: 'repad', when: byPadded, text: 'Throw a turkey into the padded mound and out it comes padded up' },
  { key: 'lever', when: () => zoneNow() === FERRY && game.ferry.state === 'docked' && !game.ferry.call, text: "Pull the lever on her deck with F and she'll set sail" },
  { key: 'ferry', when: () => zoneNow() === FERRY && game.ferry.state === 'sailing', text: 'Sit back and enjoy the view! Z and C swing the camera round' },
  { key: 'quay', when: () => zoneNow() === CITY, text: 'Circular Quay! The King Ibis holds court at the Town Hall, at the end of the bin alley' },
];
/** what you'd been told, going by a save from before the tips had names (it only kept how far down the list you'd got, and a flag or two) */
function oldTips(d) {
  const told = ['pluck', 'throw', 'whistle', 'fill', 'grubs', 'barricade', 'gate', 'dig', 'bigger', 'manly', 'swim', 'tab', 'convert'].slice(0, d.tip ?? 0);
  if (d.far) told.push('mound');
  // (and the word as you first got to each place, you'd had if you'd been there)
  for (const [z, key] of [[OVAL, 'oval'], [FERRY, 'ferry'], [CITY, 'quay']]) if (d.visited?.includes(z)) told.push(key);
  return told;
}
let tipT = 4.5; // (the first waits for the name of the place to have been and gone)
function updateTips(dt) {
  if ((tipT -= dt) > 0) return;
  const tip = tips.find((t) => !hud.told.has(t.key) && t.when());
  tipT = tip && hud.toastOnce(tip.key, tip.text, 5) ? 6 : 0.5;
}

/* ------------------------------------------------------------------ dev menu (~) */
// (just through the gate into each; and on the ferry, on her deck, wherever she's got to)
const ZONE_SPAWN = [[START.x, START.z], [6, -44], [-34, -103], [-16, -184], [76, -188], null, [362, -224], [352, -249.5], [493, -279], [OX - 40, -30], [OX + 56, -36], BLUES_SPOTS.you];
new DevMenu(game, {
  goto(v) {
    const zi = +v;
    if (game.opening.blocksSave) game.opening.skip(); // (the opening's over, if it was still going)
    for (let i = 0; i < Math.min(zi, game.barriers.gates.length); i++) game.barriers.unlock(i, true);
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
      const t = turkeys.spawnSprout(player.pos.x + rand(-2, 2), player.pos.z + rand(1, 3), +stage, kind === 'beach' ? 'beach' : 'normal');
      if (kind === 'padded') { t.gear = { helmet: true, pads: true }; t.buildRig(); } // (in their cricket kit)
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
  showOff() { if (!turkeys.showOff()) hud.toast('No grown-up males stood about with you (spawn some adults, and stop)', 3); },
  cuttlefish() { // (aboard the ferry, nearly halfway over: up it comes, whether it's been seen off already or not)
    this.goto(FERRY);
    game.cuttle.summon();
  },
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
// the bosses (and what they've got on them): said the first time you're close to one
const bosses = [
  { boss: enemies.king, text: "The King Ibis, with the key to the city round his neck! Fell him and the city's yours" },
  { boss: enemies.keeper, text: "Big Kev's rake is a key rake: it opens the gate out of the oval! Beat him and he'll drop it" },
  { boss: enemies.captain, text: "Captain Gull's got the ferry keys in his beak! Bring him down and they're yours" },
];
function updateZones() {
  const z = zoneNow();
  if (!visited.has(z) && !game.opening.blocksSave && z !== BLUES) { // (not home: there's no getting back there, for now)
    visited.add(z);
    hud.zoneTitle(ZONES[z].name);
    tipT = Math.max(tipT, 3.5); // (any tip waits for the name of the place to have been and gone)
  }
  for (const h of bosses) {
    if (h.told || !h.boss?.alive || Math.hypot(h.boss.pos.x - player.pos.x, h.boss.pos.z - player.pos.z) > 24) continue;
    h.told = true; tipT = Math.max(tipT, 6); // (and any tip waits till he's been introduced)
    hud.toast(h.text, 5);
  }
  hud.boss(game.cuttle.bar() ?? enemies.engagedBoss());
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
  // (Esc pauses, and N turns the sound off or back on: any time, even while you're down. Bar Esc with the map up,
  // down in the tunnels: that's back out of the mound you went in by)
  if (game.started) {
    if (input.pressed('Escape') && !game.travel.frozen) setPaused(!game.paused);
    if (input.pressed('KeyN')) hud.soundOff(audio.toggleOff(), true);
  }
  if (game.paused) { input.endFrame(); return; }
  // (and with the map up, the world stands still: there's only the map)
  if (game.travel.frozen) { game.travel.update(real); input.endFrame(); return; }
  const dt = real * game.timeScale;
  game.time += dt;
  const down = game.wasted.active || game.travel.active || game.ride.active || game.ending.active || game.opening.active;
  if (game.started && !down) { updateAim(); handleInput(dt); if (!game.opening.blocksSave) updateTips(dt); }
  else { letGo(); updateAim(); game.opening.drive(move); }

  game.ferry.update(dt); // (she carries everyone aboard before they get moving themselves)
  game.cuttle.update(dt); // (its tentacles come up among the foes)
  game.opening.update(dt); // (you, flung out of the catapult, before you're posed)
  player.update(dt, move, target);
  updateCamera(dt);
  game.storm.update(dt); // (after the camera: it closes in the haze the camera's just set)
  mounds.update(dt, camera);
  enemies.update(dt, camera);
  game.rubbish.update(dt); // (anything they've thrown, on its way down)
  game.barriers.update(dt, camera);
  game.benny.update(dt);
  game.ride.update(dt); // (the train, and anyone getting on or off it)
  game.toys.update(dt); // rides move before their riders take their seats
  turkeys.update(dt);
  game.ghosts.update(dt);
  updateZones(dt);
  leaves.update(dt);
  game.grubs.update(dt, game.time);
  world.update(dt, game.time);
  game.beacon.update(dt);
  spin(game.time); // (the hypnotised lot's eyes, going round)
  game.ambience.update(dt);
  game.flyovers.update(dt);
  game.footprints.update(dt);
  saves.update(dt);
  fx.update(dt);
  game.cursor.update(dt, target, whistle, camera, !down);
  hud.update(dt);
  game.wasted.update(real); // (in real time: the slow-mo as you go down doesn't slow it down)
  game.travel.update(real); // (and so's getting about down the tunnels)
  game.ending.update(real); // (and the end, for now)
  input.endFrame();
}
game.step = step; // lets devtools fast-forward: for (let i = 0; i < 600; i++) game.step(1 / 60)
game.input = input;
game.aimTarget = target;

function frame() {
  requestAnimationFrame(frame);
  step(Math.min(clock.getDelta(), 1 / 20));
  if (!game.travel.frozen) renderer.render(scene, camera); // (bar with the map up: there's none of the world to see)
  if (first) { first = false; document.getElementById('loading').remove(); }
}
frame();

addEventListener('resize', () => {
  camera.aspect = aspect();
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  game.travel.resized(); // (the map, if it's up, drawn again to fit)
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

/** `fresh`: a new game (it starts at home, on Blues Point: see Opening), or carrying on */
function start(fresh) {
  if (fresh) game.opening.begin();
  else game.opening.skip();
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
  start(!save);
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
  start(true);
});

// (and whenever you leave the page, or switch away from it)
addEventListener('visibilitychange', () => { if (document.hidden) saves.write(); });
addEventListener('pagehide', () => saves.write());
