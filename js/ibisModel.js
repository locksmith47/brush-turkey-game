import * as THREE from 'three';
import { part, merge, vcMesh, G, limb, TAU } from './util.js';

/* Australian white ibis ("bin chicken"): white body, bare black head & neck,
   long down-curved black bill, lacy black tail plumes. Built at regular size; scaled per kind.
   And every one of them's the Emperor's, in his colours: a purple neckerchief (see opening.js). */
const WHITE = 0xf3f1ea, WHITE2 = 0xe4e0d4, BLACK = 0x1e1e1e, LEG = 0x2e2a2a, PURPLE = 0x7d2ae8;

let geos = null;
function build() {
  const body = [
    part(G.sphere(1, 16, 12), WHITE, [0, 0.8, -0.02], [-0.18, 0, 0], [0.21, 0.2, 0.36]),
    part(G.sphere(1, 12, 10), WHITE2, [0, 0.72, 0.02], [0, 0, 0], [0.17, 0.13, 0.26]),
    part(G.sphere(0.13, 12, 10), WHITE, [0, 0.9, 0.2]),
    // folded wings with black primary tips
    part(G.sphere(1, 12, 8), WHITE2, [0.16, 0.84, -0.08], [-0.25, 0.08, 0], [0.06, 0.13, 0.3]),
    part(G.sphere(1, 12, 8), WHITE2, [-0.16, 0.84, -0.08], [-0.25, -0.08, 0], [0.06, 0.13, 0.3]),
    part(G.sphere(1, 8, 6), BLACK, [0.13, 0.8, -0.34], [-0.4, 0.1, 0], [0.04, 0.05, 0.12]),
    part(G.sphere(1, 8, 6), BLACK, [-0.13, 0.8, -0.34], [-0.4, -0.1, 0], [0.04, 0.05, 0.12]),
    part(G.sphere(0.07, 8, 6), 0xd9534f, [0.19, 0.76, 0.05], [0, 0, 0], [0.3, 0.5, 1.2]),
    part(G.sphere(0.07, 8, 6), 0xd9534f, [-0.19, 0.76, 0.05], [0, 0, 0], [0.3, 0.5, 1.2]),
  ];
  // drooping lacy black tail plumes
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * 0.05;
    body.push(limb([x, 0.84, -0.3], [x * 1.6, 0.62 - Math.abs(i - 2) * 0.03, -0.55], 0.035, 0.012, BLACK, 5));
  }

  const neck = [
    part(G.sphere(0.1, 10, 8), WHITE, [0, 0.0, -0.02], [0, 0, 0], [1, 0.8, 1]),
    limb([0, 0, 0], [0, 0.16, 0.05], 0.055, 0.05, BLACK, 8),
    limb([0, 0.16, 0.05], [0, 0.3, 0.03], 0.05, 0.045, BLACK, 8),
  ];

  const head = [part(G.sphere(0.075, 12, 10), BLACK, [0, 0.02, 0.02], [0, 0, 0], [0.9, 0.95, 1.15])];
  const bill = [[0, 0, 0.08], [0, -0.015, 0.2], [0, -0.05, 0.31], [0, -0.1, 0.41], [0, -0.17, 0.48]];
  for (let i = 0; i < bill.length - 1; i++) head.push(limb(bill[i], bill[i + 1], 0.026 - i * 0.004, 0.022 - i * 0.004, BLACK, 6));

  const eyes = [];
  const dead = [];
  for (const s of [-1, 1]) {
    eyes.push(part(G.sphere(0.024, 8, 6), 0xffffff, [s * 0.052, 0.035, 0.05]));
    eyes.push(part(G.sphere(0.014, 6, 5), 0xb3261e, [s * 0.066, 0.035, 0.058]));
    eyes.push(part(G.sphere(0.007, 5, 4), 0x000000, [s * 0.073, 0.035, 0.062]));
    eyes.push(part(G.box(0.012, 0.012, 0.05), 0x3a3a3a, [s * 0.062, 0.06, 0.05], [0, 0, s * 0.5]));
    dead.push(part(G.box(0.006, 0.045, 0.01), 0xffffff, [s * 0.066, 0.035, 0.055], [0, s * 0.3, 0.8]));
    dead.push(part(G.box(0.006, 0.045, 0.01), 0xffffff, [s * 0.066, 0.035, 0.055], [0, s * 0.3, -0.8]));
  }

  const leg = [
    limb([0, 0, 0], [0, -0.3, 0.03], 0.032, 0.026, LEG, 6),
    part(G.sphere(0.03, 6, 5), LEG, [0, -0.3, 0.03]),
    limb([0, -0.3, 0.03], [0, -0.6, -0.01], 0.025, 0.022, LEG, 6),
    limb([0, -0.6, 0], [0.07, -0.615, 0.12], 0.014, 0.01, LEG, 4),
    limb([0, -0.6, 0], [0, -0.615, 0.15], 0.014, 0.01, LEG, 4),
    limb([0, -0.6, 0], [-0.07, -0.615, 0.12], 0.014, 0.01, LEG, 4),
    limb([0, -0.6, 0], [0, -0.615, -0.07], 0.012, 0.01, LEG, 4),
  ];

  const crown = [part(G.cyl(0.07, 0.065, 0.05, 12, true), 0xf5c518, [0, 0, 0])];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    crown.push(part(G.cone(0.02, 0.06, 4), 0xf5c518, [Math.sin(a) * 0.066, 0.05, Math.cos(a) * 0.066]));
    crown.push(part(G.sphere(0.011, 6, 4), i % 2 ? 0xe0245e : 0x2f7de1, [Math.sin(a) * 0.07, 0.0, Math.cos(a) * 0.07]));
  }
  crown.push(part(G.torus(0.068, 0.008, 4, 16), 0xffe066, [0, -0.022, 0], [Math.PI / 2, 0, 0]));

  // the neckerchief, knotted round the bottom of the neck, its point down the front
  const kerchief = [
    part(G.torus(0.062, 0.022, 5, 14), PURPLE, [0, 0.045, 0.01], [Math.PI / 2 + 0.3, 0, 0]),
    part(G.cone(0.07, 0.13, 3), PURPLE, [0, -0.02, 0.085], [Math.PI + 0.35, 0, 0], [1, 1, 0.35]),
  ];

  geos = {
    body: merge(body), neck: merge(neck), head: merge(head), eyes: merge(eyes), dead: merge(dead),
    leg: merge(leg), crown: merge(crown), kerchief: merge(kerchief), billTip: new THREE.Vector3(...bill[bill.length - 1]),
  };
}

/** an ibis rig, `scale` times life size (`crowned`: the King; `kerchief`: in the Emperor's colours, as all but he are) */
export function createIbisRig(scale, crowned = false, kerchief = true) {
  if (!geos) build();
  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);
  bodyPivot.add(vcMesh(geos.body));

  const neck = new THREE.Group();
  neck.position.set(0, 0.9, 0.26);
  neck.add(vcMesh(geos.neck));
  if (kerchief) neck.add(vcMesh(geos.kerchief));
  bodyPivot.add(neck);

  const head = new THREE.Group();
  head.position.set(0, 0.32, 0.03);
  head.add(vcMesh(geos.head));
  const eyes = vcMesh(geos.eyes, { cast: false });
  const deadEyes = vcMesh(geos.dead, { cast: false });
  deadEyes.visible = false;
  head.add(eyes, deadEyes);
  const billTip = new THREE.Object3D();
  billTip.position.copy(geos.billTip);
  head.add(billTip);
  if (crowned) {
    const crown = vcMesh(geos.crown);
    crown.position.set(0, 0.1, 0.0);
    crown.rotation.x = -0.15;
    crown.scale.setScalar(1.6);
    head.add(crown);
  }
  neck.add(head);

  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.position.set(0.09, 0.62, 0);
  legR.position.set(-0.09, 0.62, 0);
  legL.add(vcMesh(geos.leg));
  legR.add(vcMesh(geos.leg));
  root.add(legL, legR);

  root.scale.setScalar(scale);
  return { root, bodyPivot, neck, head, eyes, deadEyes, billTip, legL, legR };
}
