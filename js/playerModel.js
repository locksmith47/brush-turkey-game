import * as THREE from 'three';
import { part, merge, vcMesh, G, limb, toonMat, canvasTexture, TAU } from './util.js';

const SKIN = 0xf1c7a0;
const JEANS = 0x2f4f82;
const JEANS_DARK = 0x263f69;
const SHIRT = 0x5b90d2;
const SHIRT_DARK = 0x4a7dbd;
const SHIRT_ROLL = 0x86b0e3;
const TEE = 0xf6f6f2;
const HAIR = 0xf0d078;
const HAIR_DARK = 0xd8b458;
const STACHE = 0xb98a3e;
const HAT = 0x3f7a4a;
const HAT_DARK = 0x2f5f38;
const BOOT = 0x7a5230;

/* the little mountain-skyline patch on the front of the cap */
function patchTexture() {
  return canvasTexture(128, 72, (c, w, h) => {
    c.fillStyle = '#f3ecd9';
    c.fillRect(0, 0, w, h);
    const stripes = ['#6b4f9e', '#c9447a', '#e8674a', '#f39b3d', '#f7c948'];
    const sh = (h - 16) / stripes.length;
    stripes.forEach((col, i) => { c.fillStyle = col; c.fillRect(6, 6 + i * sh, w - 12, sh + 1); });
    c.fillStyle = '#1c1c28';
    c.beginPath();
    c.moveTo(6, h - 10);
    const pts = [[14, 44], [26, 36], [34, 40], [46, 18], [54, 30], [62, 12], [72, 32], [80, 24], [92, 40], [104, 30], [122, 46]];
    for (const [x, y] of pts) c.lineTo(x, y);
    c.lineTo(w - 6, h - 10);
    c.closePath();
    c.fill();
    c.strokeStyle = '#1c1c28';
    c.lineWidth = 4;
    c.strokeRect(4, 4, w - 8, h - 8);
  });
}

function legGeo() {
  return {
    thigh: merge([
      limb([0, 0.02, 0], [0, -0.45, 0], 0.092, 0.078, JEANS, 10),
      part(G.sphere(0.092, 10, 8), JEANS, [0, 0.0, 0]),
    ]),
    shin: merge([
      part(G.sphere(0.078, 10, 8), JEANS, [0, 0, 0]),
      limb([0, 0, 0], [0, -0.38, 0], 0.077, 0.074, JEANS, 10),
      part(G.cyl(0.08, 0.084, 0.06, 10), JEANS_DARK, [0, -0.36, 0]),
      part(G.box(0.13, 0.12, 0.25), BOOT, [0, -0.43, 0.04]),
      part(G.sphere(0.068, 10, 8), BOOT, [0, -0.445, 0.15], [0, 0, 0], [1, 0.8, 1]),
      part(G.box(0.14, 0.035, 0.3), 0x2a2018, [0, -0.49, 0.05]),
      part(G.box(0.135, 0.02, 0.02), 0xd9c7a0, [0, -0.39, 0.1]),
    ]),
  };
}

function armGeo() {
  return {
    upper: merge([
      part(G.sphere(0.078, 10, 8), SHIRT, [0, 0, 0]),
      limb([0, 0, 0], [0, -0.28, 0], 0.072, 0.064, SHIRT, 10),
    ]),
    lower: merge([
      part(G.cyl(0.072, 0.07, 0.07, 10), SHIRT_ROLL, [0, -0.01, 0]),
      part(G.torus(0.068, 0.014, 5, 12), SHIRT_DARK, [0, -0.045, 0], [Math.PI / 2, 0, 0]),
      limb([0, -0.03, 0], [0, -0.25, 0.0], 0.05, 0.043, SKIN, 8),
      part(G.sphere(0.058, 10, 8), SKIN, [0, -0.3, 0.005], [0, 0, 0], [0.85, 1.1, 0.7]),
      part(G.sphere(0.024, 6, 5), SKIN, [0.035, -0.27, 0.035]),
    ]),
  };
}

function torsoGeo() {
  const gap = 0.4;
  const shirt = new THREE.CylinderGeometry(0.214, 0.206, 0.56, 18, 1, true, gap, TAU - gap * 2);
  const yoke = new THREE.SphereGeometry(0.216, 18, 6, Math.PI / 2 + gap, TAU - gap * 2, 0, Math.PI / 2);
  const p = [
    // white tee
    part(G.cyl(0.2, 0.178, 0.52, 16), TEE, [0, 0.25, 0], [0, 0, 0], [1, 1, 0.72]),
    part(G.sphere(0.2, 16, 8), TEE, [0, 0.5, 0], [0, 0, 0], [1, 0.42, 0.72]),
    part(G.torus(0.075, 0.018, 5, 14), 0xe2e2dc, [0, 0.575, 0.01], [Math.PI / 2 - 0.2, 0, 0], [1, 1, 0.9]),
    // open blue overshirt
    part(shirt, SHIRT, [0, 0.25, 0], [0, 0, 0], [1, 1, 0.74]),
    part(yoke, SHIRT, [0, 0.52, 0], [0, 0, 0], [1, 0.42, 0.74]),
    part(G.torus(0.11, 0.028, 5, 16, TAU - 1.3), SHIRT_DARK, [0, 0.57, -0.005], [Math.PI / 2 - 0.15, 0, Math.PI / 2 + 0.65], [1, 0.9, 0.9]),
    part(G.box(0.045, 0.54, 0.02), SHIRT_DARK, [0.075, 0.25, 0.146], [0, 0.35, 0]),
    part(G.box(0.045, 0.54, 0.02), SHIRT_DARK, [-0.075, 0.25, 0.146], [0, -0.35, 0]),
    part(G.box(0.085, 0.09, 0.012), SHIRT_DARK, [0.13, 0.37, 0.126], [0, 0.62, 0]),
    part(G.box(0.085, 0.09, 0.012), SHIRT_DARK, [-0.13, 0.37, 0.126], [0, -0.62, 0]),
    part(G.cyl(0.06, 0.066, 0.13, 10), SKIN, [0, 0.6, 0]),
  ];
  for (let i = 0; i < 4; i++) p.push(part(G.sphere(0.011, 6, 4), 0xf4f0e0, [0.078, 0.44 - i * 0.12, 0.158]));
  return merge(p);
}

function hipsGeo() {
  return merge([
    part(G.sphere(1, 14, 10), JEANS, [0, 0.97, 0], [0, 0, 0], [0.2, 0.13, 0.145]),
    part(G.cyl(0.187, 0.19, 0.05, 16), 0x4a3020, [0, 1.03, 0], [0, 0, 0], [1, 1, 0.76]),
    part(G.box(0.05, 0.04, 0.02), 0xc9b27a, [0, 1.03, 0.145]),
  ]);
}

function headGeo() {
  const p = [
    part(G.sphere(0.165, 18, 14), SKIN, [0, 0.14, 0.01], [0, 0, 0], [0.95, 1.1, 1.0]),
    part(G.sphere(0.123, 14, 10), 0xe2b48a, [0, 0.05, 0.045], [0, 0, 0], [1, 0.82, 1]),
    part(G.sphere(0.035, 8, 6), SKIN, [0.158, 0.13, 0.0], [0, 0, 0], [0.5, 1, 0.8]),
    part(G.sphere(0.035, 8, 6), SKIN, [-0.158, 0.13, 0.0], [0, 0, 0], [0.5, 1, 0.8]),
    part(G.sphere(0.042, 10, 8), 0xeab28a, [0, 0.12, 0.172], [0, 0, 0], [0.9, 1, 1.1]),
    // moustache
    part(G.sphere(0.042, 10, 8), STACHE, [0, 0.074, 0.168], [0, 0, 0], [1.5, 0.6, 0.7]),
    part(G.sphere(0.036, 10, 8), STACHE, [0.052, 0.064, 0.158], [0, 0.35, -0.4], [1.5, 0.6, 0.65]),
    part(G.sphere(0.036, 10, 8), STACHE, [-0.052, 0.064, 0.158], [0, -0.35, 0.4], [1.5, 0.6, 0.65]),
    part(G.sphere(0.022, 8, 6), STACHE, [0.088, 0.042, 0.138]),
    part(G.sphere(0.022, 8, 6), STACHE, [-0.088, 0.042, 0.138]),
    part(G.torus(0.028, 0.008, 4, 10, Math.PI), 0x8a3b30, [0, 0.044, 0.158], [0, 0, Math.PI]),
    // eyebrows
    part(G.box(0.062, 0.016, 0.02), HAIR_DARK, [0.06, 0.218, 0.148], [0, 0.2, 0.12]),
    part(G.box(0.062, 0.016, 0.02), HAIR_DARK, [-0.06, 0.218, 0.148], [0, -0.2, -0.12]),
  ];
  for (const s of [-1, 1]) {
    p.push(part(G.sphere(0.031, 10, 8), 0xffffff, [s * 0.058, 0.168, 0.138]));
    p.push(part(G.sphere(0.019, 8, 6), 0x3a78b5, [s * 0.058, 0.168, 0.162]));
    p.push(part(G.sphere(0.01, 6, 4), 0x111111, [s * 0.058, 0.168, 0.176]));
    p.push(part(G.sphere(0.005, 4, 3), 0xffffff, [s * 0.052, 0.176, 0.18]));
  }
  // hair: back cap, side locks framing the face, a bit of fringe
  const cap = new THREE.SphereGeometry(0.182, 18, 12, Math.PI / 2 + 0.95, TAU - 1.9, 0, Math.PI * 0.62);
  p.push(part(cap, HAIR, [0, 0.16, -0.01], [0, 0, 0], [1, 1.06, 1.03]));
  for (const s of [-1, 1]) {
    p.push(part(G.sphere(1, 10, 8), HAIR, [s * 0.152, 0.03, -0.015], [0.1, 0, s * -0.08], [0.055, 0.2, 0.085]));
    p.push(part(G.sphere(1, 8, 6), HAIR_DARK, [s * 0.14, -0.08, -0.03], [0.1, 0, s * -0.15], [0.045, 0.14, 0.07]));
    p.push(part(G.sphere(1, 8, 6), HAIR, [s * 0.12, 0.2, 0.115], [0, 0, s * 0.5], [0.05, 0.03, 0.035]));
  }
  // cap: crown, band, brim, button
  const crown = new THREE.SphereGeometry(0.186, 18, 8, 0, TAU, 0, Math.PI / 2);
  p.push(part(crown, HAT, [0, 0.215, -0.005], [-0.12, 0, 0], [1.0, 0.86, 1.06]));
  p.push(part(G.cyl(0.19, 0.19, 0.04, 18, true), HAT_DARK, [0, 0.215, -0.005], [-0.12, 0, 0], [1, 1, 1.06]));
  const brim = new THREE.CylinderGeometry(0.165, 0.165, 0.018, 16, 1, false, -Math.PI / 2, Math.PI);
  p.push(part(brim, HAT_DARK, [0, 0.225, 0.115], [0.12, 0, 0], [1.05, 1, 0.95]));
  p.push(part(G.sphere(0.022, 8, 6), HAT, [0, 0.37, -0.03]));
  return merge(p);
}

function hairBackGeo() {
  const p = [
    part(G.cyl(0.15, 0.19, 0.46, 14), HAIR, [0, -0.22, -0.02], [0.08, 0, 0], [1, 1, 0.42]),
    part(G.sphere(0.15, 12, 8), HAIR, [0, 0.0, -0.02], [0, 0, 0], [1, 0.6, 0.5]),
  ];
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * 0.07;
    p.push(part(G.cone(0.05, 0.14, 6), i % 2 ? HAIR_DARK : HAIR, [x, -0.5, -0.045], [Math.PI + 0.1, 0, x * 0.8], [1, 1, 0.5]));
  }
  for (let i = 0; i < 4; i++) {
    p.push(part(G.box(0.012, 0.4, 0.01), HAIR_DARK, [(i - 1.5) * 0.08, -0.24, -0.1], [0.08, 0, 0]));
  }
  return merge(p);
}

/* Builds the player: a cartoonish ~30 year old with long blonde hair, a moustache,
   a green cap, white tee, open blue shirt and jeans. Returns the joint handles. */
export function createPlayerRig() {
  const root = new THREE.Group();
  const hips = vcMesh(hipsGeo());
  root.add(hips);

  const leg = legGeo();
  const mkLeg = (x) => {
    const hip = new THREE.Group();
    hip.position.set(x, 0.96, 0);
    hip.add(vcMesh(leg.thigh));
    const knee = new THREE.Group();
    knee.position.set(0, -0.45, 0);
    knee.add(vcMesh(leg.shin));
    hip.add(knee);
    root.add(hip);
    return { hip, knee };
  };
  const legL = mkLeg(0.105), legR = mkLeg(-0.105);

  const torso = new THREE.Group();
  torso.position.set(0, 1.02, 0);
  torso.add(vcMesh(torsoGeo()));
  root.add(torso);

  const arm = armGeo();
  const mkArm = (x) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(x, 0.49, 0);
    shoulder.add(vcMesh(arm.upper));
    const elbow = new THREE.Group();
    elbow.position.set(0, -0.28, 0);
    elbow.add(vcMesh(arm.lower));
    const hand = new THREE.Object3D();
    hand.position.set(0, -0.32, 0.02);
    elbow.add(hand);
    shoulder.add(elbow);
    torso.add(shoulder);
    return { shoulder, elbow, hand };
  };
  const armL = mkArm(0.255), armR = mkArm(-0.255);

  const head = new THREE.Group();
  head.position.set(0, 0.655, 0);
  head.scale.setScalar(1.14);
  head.add(vcMesh(headGeo()));
  torso.add(head);

  const patch = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.073), toonMat({ map: patchTexture() }));
  patch.position.set(0, 0.29, 0.168);
  patch.rotation.x = -0.42;
  head.add(patch);

  const hairBack = new THREE.Group();
  hairBack.position.set(0, 0.12, -0.1);
  hairBack.add(vcMesh(hairBackGeo()));
  head.add(hairBack);

  return { root, torso, head, hairBack, legL, legR, armL, armR };
}
