import * as THREE from 'three';
import { Plover, PINNED } from './plover.js';
import { ferryKeyGeo } from './key.js';
import { part, merge, vcMesh, G, limb } from './util.js';

/*
 * Silver gulls: seagulls, chip thieves, the terror of every wharf. They loaf about round a spilt packet of
 * chips, and go for anything that comes near it the way the plovers do: up, round and down, beak first (see
 * Plover), a few of them at a time. Grab hold of one on the ground and it tries to take off, turkey and all,
 * but it can't get away with one hanging off it. The turkey drags it back down, and there it sits for a few
 * seconds, seeing stars: the time to mob it.
 *
 * And Captain Gull, who's nicked the ferry keys: a great big gull in a skipper's cap, with the keys (on their
 * cork float) in his beak. He guards the gangway onto the ferry, and his swoops can take out a couple of
 * turkeys at once, but he has to come down for a breather after every one, and that's when to pile on: it takes
 * two to drag him down (just the one, and he shakes it off in no time). Bring him down and the keys are yours.
 */
const WHITE = 0xf7f7f4, GREY = 0xb9c3cb, GREY2 = 0xa7b1ba, BLACK = 0x1c1c1c, RED = 0xd33a2c, RED2 = 0xb52a20, GOLD = 0xf2c230;
const GULL = {
  name: 'Seagull', hp: 20, scale: 1.3, radius: 0.28, bodyY: 0.42, labelY: 0.85, carcassLabelY: 0.45, dieTime: 0.6,
  alarmR: 8, maxLatch: 5, shakeAt: 3, shakeEvery: 3, value: 8, weight: 2, carryR: 0.6, slots: 6,
  swoopR: 0.8, speed: 3.2, hurt: 8, kills: 1, cry: 'gull', squawk: 0.6, together: 2, rest: [2.5, 4.5],
  drag: 1, stun: 4, // (how many turkeys hanging off it drag it down as it takes off, and how long it's out for, in seconds)
  feathers: [WHITE, GREY, BLACK], dead: [WHITE, GREY, BLACK, RED],
  tips: {
    up: ['gull', 'Seagulls! Dodge the red circle, and when one lands, throw a turkey on it: it can\'t take off with one hanging off'],
    you: ['gull-you', 'Swooped! Those gulls are after your chips'],
    ...PINNED,
  },
};
const CAPTAIN = {
  ...GULL, name: 'Captain Gull', boss: true, hp: 260, scale: 2.6, radius: 0.6, labelY: 0.9, carcassLabelY: 0.5, dieTime: 0.9,
  alarmR: 13, maxLatch: 12, shakeAt: 7, shakeEvery: 5, value: 45, weight: 12, carryR: 1.3, slots: 16,
  swoopR: 1.6, speed: 3.0, hurt: 20, kills: 2, squawk: 1.6, alt: 4.5, rest: [3.5, 5.5], drag: 2, stun: 3.5,
  tips: {
    up: ['captain', "Captain Gull! He's got the ferry keys. Dodge his swoops, and when he lands, get two turkeys on him"],
    you: ['captain-you', 'Swooped by the Captain! He goes for you as well'],
    away: ['captain-away', 'He shook it off! It takes two turkeys to hold the Captain down'],
    down: ['captain-down', "The Captain's down, seeing stars! Pile on!"],
  },
};
const KEY_IN_BEAK = 0.075; // (how big the ferry keys are in his beak, against how big they are on the ground)

let geos = null;
function build() {
  const body = [
    // white underneath, the pale grey of its back and folded wings on top
    part(G.sphere(1, 14, 10), WHITE, [0, 0.4, 0], [-0.1, 0, 0], [0.12, 0.105, 0.22]),
    part(G.sphere(1, 14, 10), GREY, [0, 0.44, -0.02], [-0.1, 0, 0], [0.123, 0.07, 0.205]),
    // a short white tail, and a full white chest up to the neck
    part(G.box(0.1, 0.026, 0.12), WHITE, [0, 0.43, -0.25], [0.18, 0, 0]),
    part(G.sphere(1, 10, 8), WHITE, [0, 0.46, 0.13], [0, 0, 0], [0.08, 0.08, 0.075]),
  ];
  const neck = [limb([0, -0.03, -0.01], [0, 0.09, 0.03], 0.056, 0.05, WHITE, 8)];
  const head = [
    part(G.sphere(0.066, 12, 10), WHITE, [0, 0, 0], [0, 0, 0], [0.9, 1, 1.15]),
    // the bill: bright red, a little hooked at the tip
    part(G.cyl(0.013, 0.018, 0.08, 6), RED, [0, -0.012, 0.11], [Math.PI / 2, 0, 0]),
    part(G.cone(0.013, 0.025, 6), RED2, [0, -0.02, 0.155], [Math.PI / 2 + 0.6, 0, 0]),
  ];
  const eyes = [], dead = [];
  for (const s of [-1, 1]) {
    // (a white eye, with a red ring round it)
    eyes.push(part(G.sphere(0.014, 8, 6), RED, [s * 0.05, 0.014, 0.034]));
    eyes.push(part(G.sphere(0.011, 8, 6), WHITE, [s * 0.056, 0.014, 0.037]));
    eyes.push(part(G.sphere(0.005, 6, 4), BLACK, [s * 0.064, 0.014, 0.039]));
    dead.push(part(G.box(0.005, 0.03, 0.008), BLACK, [s * 0.058, 0.014, 0.037], [0, s * 0.3, 0.8]));
    dead.push(part(G.box(0.005, 0.03, 0.008), BLACK, [s * 0.058, 0.014, 0.037], [0, s * 0.3, -0.8]));
  }
  // red legs, and webbed feet
  const leg = [
    limb([0, 0, 0], [0, -0.17, 0.01], 0.015, 0.013, RED, 6),
    part(G.sphere(0.015, 6, 5), RED, [0, -0.17, 0.01]),
    limb([0, -0.17, 0.01], [0, -0.325, -0.01], 0.012, 0.011, RED, 6),
    part(new THREE.CircleGeometry(0.06, 3).rotateX(-Math.PI / 2).rotateY(Math.PI / 2), RED2, [0, -0.33, 0.035]),
  ];
  // a wing, reaching out along +x from the shoulder: grey on top, white underneath, the tip black with a white spot
  const wing = [
    part(G.sphere(1, 12, 8), GREY2, [0.2, 0.004, -0.02], [0, 0, 0], [0.2, 0.016, 0.085]),
    part(G.sphere(1, 12, 8), WHITE, [0.2, -0.008, -0.02], [0, 0, 0], [0.195, 0.012, 0.083]),
    part(G.sphere(1, 10, 8), BLACK, [0.41, 0, -0.05], [0, 0.35, 0], [0.12, 0.013, 0.055]),
    part(G.sphere(1, 6, 5), WHITE, [0.46, 0.006, -0.065], [0, 0.35, 0], [0.028, 0.013, 0.02]),
  ];
  // the Captain's cap: white, with a black band and peak, and a gold badge
  const cap = [
    part(G.cyl(0.066, 0.07, 0.05, 14), WHITE, [0, 0.07, -0.01]),
    part(G.cyl(0.082, 0.078, 0.016, 14), WHITE, [0, 0.1, -0.012], [0.1, 0, 0]),
    part(G.cyl(0.072, 0.072, 0.016, 14), BLACK, [0, 0.052, -0.01]),
    part(G.box(0.1, 0.008, 0.055), BLACK, [0, 0.049, 0.068], [-0.3, 0, 0]),
    part(G.sphere(0.013, 6, 5), GOLD, [0, 0.075, 0.056], [0, 0, 0], [1, 1, 0.5]),
  ];
  geos = {
    body: merge(body), neck: merge(neck), head: merge(head), eyes: merge(eyes), dead: merge(dead), leg: merge(leg), wing: merge(wing), cap: merge(cap),
  };
}

/** a gull (laid out like a plover's, so it flies and swoops the same: see Plover's pose), in the Captain's cap or not */
function gullRig(scale, captain) {
  if (!geos) build();
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);
  bodyPivot.add(vcMesh(geos.body));
  const neck = new THREE.Group();
  neck.position.set(0, 0.48, 0.15);
  neck.add(vcMesh(geos.neck));
  bodyPivot.add(neck);
  const head = new THREE.Group();
  head.position.set(0, 0.12, 0.035);
  head.add(vcMesh(geos.head));
  if (captain) head.add(vcMesh(geos.cap));
  const eyes = vcMesh(geos.eyes, { cast: false }), deadEyes = vcMesh(geos.dead, { cast: false });
  deadEyes.visible = false;
  head.add(eyes, deadEyes);
  neck.add(head);
  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.position.set(0.05, 0.34, 0);
  legR.position.set(-0.05, 0.34, 0);
  legL.add(vcMesh(geos.leg));
  legR.add(vcMesh(geos.leg));
  bodyPivot.add(legL, legR);
  const wingL = new THREE.Group(), wingR = new THREE.Group();
  wingL.position.set(0.1, 0.47, 0.1);
  wingR.position.set(-0.1, 0.47, 0.1);
  wingL.add(vcMesh(geos.wing));
  const wr = vcMesh(geos.wing);
  wr.scale.x = -1;
  wingR.add(wr);
  bodyPivot.add(wingL, wingR);
  root.scale.setScalar(scale);
  return { root, bodyPivot, neck, head, eyes, deadEyes, legL, legR, wingL, wingR };
}

export class Gull extends Plover {
  /** `patch`: [x, z] of the chips it's guarding */
  constructor(game, x, z, patch, def = GULL) {
    super(game, x, z, patch, def, (s) => gullRig(s, def.boss));
  }
}

export class CaptainGull extends Gull {
  constructor(game, x, z, post) {
    super(game, x, z, post, CAPTAIN);
    // the ferry keys, crossways in his beak (laid out as the key itself is: see Key.release)
    const hold = new THREE.Group();
    hold.position.set(0, -0.016, 0.14);
    hold.rotation.set(0, 0, 0.25);
    hold.scale.setScalar(KEY_IN_BEAK);
    this.beakKey = vcMesh(ferryKeyGeo());
    this.beakKey.position.x = 0.1;
    hold.add(this.beakKey);
    this.rig.head.add(hold);
    this.keyHold = hold;
  }

  onDeath() {
    super.onDeath();
    const g = this.game;
    g.hud.banner('CAPTAIN GULL GROUNDED');
    g.audio.fanfare();
    // the keys fly out of his beak (growing back to full size on the way)
    if (this.keyHold.visible) {
      this.beakKey.updateWorldMatrix(true, false);
      if (this.key && !this.key.gone) {
        this.key.release(this.beakKey.matrixWorld, this.heading, 4.5);
        g.hud.toast("He's dropped the ferry keys! Carry them to the gangway", 3.5);
      }
      this.keyHold.visible = false;
    }
  }
}
