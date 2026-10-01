import * as THREE from 'three';
import { part, merge, vcMesh, G, limb, tint, TAU } from './util.js';

/* Gameplay + look for each growth stage. */
export const STAGES = [
  { name: 'Chick', scale: 0.74, speed: 3.8, capacity: 1, radius: 0.25, hud: '#a57a4c' },
  { name: 'Juvenile', scale: 0.88, speed: 4.7, capacity: 2, radius: 0.31, hud: '#d9785c' },
  { name: 'Adult', scale: 1.04, speed: 5.7, capacity: 3, radius: 0.37, hud: '#ffd21f' },
];
// adult hens look just like the cocks bar the wattle (theirs is little more than a yellow neck), and are a
// touch smaller (only to look at: they're every bit as strong)
export const HEN_SCALE = 0.9;
// where a cock's wattle puffs up from, when he's showing off (in the neck's space: up at his throat, so it swells out
// in front of him and down over his chest)
const WATTLE_AT = new THREE.Vector3(0, 0, 0.03);

/* ------------------------------------------------------------------ shared bits */
function legGeo(len, r, color) {
  const f = len - 0.005;
  return merge([
    part(G.sphere(r * 1.25, 8, 6), color, [0, -0.05, 0]),
    limb([0, -0.05, 0], [0, -len + 0.03, -0.015], r, r * 0.85, color, 7),
    limb([0, -len + 0.03, 0], [0.055, -f, 0.1], r * 0.55, r * 0.4, color, 5),
    limb([0, -len + 0.03, 0], [0, -f, 0.125], r * 0.55, r * 0.4, color, 5),
    limb([0, -len + 0.03, 0], [-0.055, -f, 0.1], r * 0.55, r * 0.4, color, 5),
    limb([0, -len + 0.03, 0], [0, -f, -0.065], r * 0.5, r * 0.4, color, 5),
  ]);
}

function wingGeo(len, width, color, color2) {
  return merge([
    part(G.sphere(1, 12, 8), color, [0.02, -0.07, -0.14], [-0.2, 0, 0], [0.055, width, len]),
    part(G.sphere(1, 10, 6), color2, [0.03, -0.12, -0.2], [-0.35, 0, 0], [0.045, width * 0.6, len * 0.85]),
  ]);
}

function tailFan(r, thick, color, pos) {
  // a vertical fan: brush turkeys hold their tails flat and upright, like a keel. It's a solid slab
  // (a wedge cut from a cylinder is left open along the cuts, and from the front that shows up as
  // a hollow, inside-out "bat wing")
  const a0 = Math.PI * 0.42, a1 = Math.PI * 1.08;
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(Math.cos(a0) * r, Math.sin(a0) * r);
  s.absarc(0, 0, r, a0, a1, false);
  s.lineTo(0, 0);
  // the shape's x runs along the body (towards the head), y up; it's extruded sideways by `thick`
  const geo = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false, curveSegments: 14 })
    .translate(0, 0, -thick / 2)
    .rotateY(-Math.PI / 2);
  return part(geo, color, pos);
}

function eyes(x, y, z, r, pr) {
  const out = [];
  for (const s of [-1, 1]) {
    out.push(part(G.sphere(r, 10, 8), 0xfff8e6, [s * x, y, z]));
    out.push(part(G.sphere(pr, 8, 6), 0x141010, [s * (x + r * 0.55), y + r * 0.1, z + r * 0.45]));
    out.push(part(G.sphere(pr * 0.35, 6, 4), 0xffffff, [s * (x + r * 0.8), y + r * 0.4, z + r * 0.6]));
  }
  return out;
}

function dirtGeo() {
  const p = [part(G.cyl(0.2, 0.24, 0.05, 12), 0x3f2a18, [0, 0, 0])];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    p.push(part(G.dodec(0.055 + (i % 3) * 0.012), i % 2 ? 0x4a3321 : 0x57402b, [Math.cos(a) * 0.17, 0.03, Math.sin(a) * 0.17], [i, i * 2, 0]));
  }
  return merge(p);
}

/* ------------------------------------------------------------------ stage builders */
function adultLike(juvenile, hen = false) {
  const black = juvenile ? 0x4a3c30 : 0x1d1b1a;
  const black2 = juvenile ? 0x56463a : 0x252220;
  const belly = juvenile ? 0x66554a : 0x35302c;
  const tailC = juvenile ? 0x3e3228 : 0x191716;
  const tailR = juvenile ? 0.3 : 0.42;

  const body = [
    part(G.sphere(1, 16, 12), black, [0, 0.47, -0.03], [0, 0, 0], [0.25, 0.23, 0.36]),
    part(G.sphere(0.19, 14, 10), black2, [0, 0.52, 0.15], [0, 0, 0], [1, 1, 0.9]),
    part(G.sphere(1, 12, 8), belly, [0, 0.37, 0.0], [0, 0, 0], [0.2, 0.14, 0.27]),
    part(G.sphere(0.1, 10, 8), black, [0.1, 0.36, 0.0]),
    part(G.sphere(0.1, 10, 8), black, [-0.1, 0.36, 0.0]),
    tailFan(tailR, 0.045, tailC, [0, 0.5, -0.24]),
    tailFan(tailR * 0.72, 0.07, black2, [0, 0.5, -0.24]),
  ];
  // feather ridges across the tail fan
  for (let i = 0; i < 5; i++) {
    const a = Math.PI * (0.5 + i * 0.12);
    const len = tailR * 0.95;
    body.push(limb([0, 0.5, -0.24], [0, 0.5 + Math.sin(a) * len, -0.24 + Math.cos(a) * len], 0.03, 0.012, black2, 4));
  }
  // scalloped back feathers
  for (let i = 0; i < 5; i++) {
    body.push(part(G.sphere(1, 8, 6), black2, [(i % 2 ? 0.07 : -0.07), 0.64 - i * 0.012, 0.08 - i * 0.07], [0.3, 0, 0], [0.09, 0.03, 0.08]));
  }

  const neckC = juvenile ? 0xcf6f55 : 0xd42a2a;
  const headC = juvenile ? 0xd8664c : 0xe3282b;
  const neck = limb([0, -0.02, -0.02], [0, 0.22, 0.06], 0.058, 0.042, neckC, 10);
  // a hen's wattle is barely there: just the bottom of her neck gone yellow
  const henNeck = new THREE.Color(0xf2c52e);
  if (hen) tint(neck, (x, y, z, c) => c.lerp(henNeck, Math.min(1, Math.max(0, (0.13 - y) / 0.045))));
  const head = [
    neck,
    part(G.sphere(0.078, 14, 10), headC, [0, 0.255, 0.085], [0, 0, 0], [0.92, 1, 1.15]),
    part(G.cone(0.027, 0.085, 8), 0x2f2b28, [0, 0.245, 0.19], [Math.PI / 2, 0, 0]),
    ...eyes(0.056, 0.272, 0.115, 0.024, 0.014),
  ];
  for (let i = 0; i < 4; i++) {
    head.push(part(G.cone(0.011, 0.05, 4), 0x151313, [(i - 1.5) * 0.018, 0.33, 0.08 - i * 0.012], [-0.5, 0, (i - 1.5) * 0.25]));
  }
  let wattle = null;
  if (juvenile) {
    head.push(part(G.torus(0.06, 0.035, 6, 12), 0x4a3c30, [0, 0.02, 0], [Math.PI / 2, 0, 0]));
    head.push(part(G.sphere(0.05, 10, 8), 0xf0c040, [0, 0.02, 0.075], [0, 0, 0], [1.1, 1, 0.8]));
  } else if (!hen) {
    // the glorious yellow wattle (a thing of its own, so it can be puffed up: see createRig)
    const w = [
      part(G.torus(0.066, 0.042, 8, 16), 0xffd21f, [0, 0.03, 0.0], [Math.PI / 2, 0, 0]),
      part(G.sphere(0.115, 16, 12), 0xffcc12, [0, -0.02, 0.09], [0, 0, 0], [1.15, 1.05, 0.9]),
      part(G.sphere(0.088, 14, 10), 0xffb70f, [0, -0.12, 0.105], [0, 0, 0], [1.0, 1.25, 0.85]),
      part(G.sphere(0.05, 10, 8), 0xffdc3a, [0.08, 0.025, 0.08]),
      part(G.sphere(0.05, 10, 8), 0xffdc3a, [-0.08, 0.025, 0.08]),
      part(G.sphere(0.04, 8, 6), 0xffc21a, [0.05, -0.2, 0.1]),
      part(G.sphere(0.04, 8, 6), 0xffc21a, [-0.05, -0.2, 0.1]),
    ];
    const hi = new THREE.Color(0xffe45c), lo = new THREE.Color(0xffa000);
    for (const g of w) tint(g, (x, y, z, c) => c.lerp(y > 0 ? hi : lo, Math.min(1, Math.abs(y) * 3.2) * 0.6));
    head.push(w.shift()); // (the collar round his neck stays put: it's the sac hanging off the front that puffs up)
    wattle = merge(w).translate(-WATTLE_AT.x, -WATTLE_AT.y, -WATTLE_AT.z);
  }

  return {
    body: merge(body),
    head: merge(head),
    wattle,
    leg: legGeo(0.34, 0.028, 0x6b6158),
    wing: wingGeo(0.27, 0.14, juvenile ? 0x3e3228 : 0x24201d, juvenile ? 0x4d3d30 : 0x2e2824),
    neckPos: new THREE.Vector3(0, 0.62, 0.24),
    beakTip: new THREE.Vector3(0, 0.235, 0.24),
    hip: new THREE.Vector3(0.1, 0.34, 0.0),
    wingPos: new THREE.Vector3(0.2, 0.58, 0.08),
    headTop: 0.95,
  };
}

function chick() {
  const brown = 0x8a6a45, dark = 0x5e422a, light = 0xb89770;
  const body = [
    part(G.sphere(1, 16, 12), brown, [0, 0.42, 0], [0, 0, 0], [0.27, 0.25, 0.3]),
    part(G.sphere(1, 12, 8), light, [0, 0.34, 0.06], [0, 0, 0], [0.21, 0.16, 0.22]),
    part(G.sphere(1, 8, 6), dark, [0.1, 0.6, -0.03], [0, 0, 0], [0.05, 0.05, 0.22]),
    part(G.sphere(1, 8, 6), dark, [-0.1, 0.6, -0.03], [0, 0, 0], [0.05, 0.05, 0.22]),
    part(G.sphere(1, 8, 6), dark, [0, 0.66, -0.03], [0, 0, 0], [0.05, 0.035, 0.2]),
    part(G.cone(0.07, 0.14, 6), 0x6e5234, [0, 0.5, -0.3], [-2.2, 0, 0]),
    part(G.sphere(0.08, 8, 6), brown, [0.09, 0.3, 0.0]),
    part(G.sphere(0.08, 8, 6), brown, [-0.09, 0.3, 0.0]),
  ];
  const head = [
    limb([0, -0.02, 0], [0, 0.09, 0.03], 0.085, 0.08, 0xa47848, 10),
    part(G.sphere(0.14, 16, 12), 0xb4854f, [0, 0.15, 0.05]),
    part(G.sphere(0.1, 12, 8), 0xe0b77e, [0, 0.12, 0.12], [0, 0, 0], [1, 0.9, 0.7]),
    part(G.sphere(0.06, 8, 6), dark, [0, 0.26, 0.02], [0, 0, 0], [0.7, 0.5, 1.2]),
    part(G.cone(0.032, 0.075, 8), 0x5a4630, [0, 0.13, 0.215], [Math.PI / 2, 0, 0]),
    part(G.cone(0.02, 0.07, 4), dark, [0.02, 0.3, 0.02], [-0.4, 0, -0.3]),
    part(G.cone(0.02, 0.06, 4), dark, [-0.02, 0.3, 0.03], [-0.3, 0, 0.3]),
    ...eyes(0.075, 0.18, 0.13, 0.042, 0.027),
  ];
  return {
    body: merge(body),
    head: merge(head),
    leg: legGeo(0.3, 0.024, 0x7d6a55),
    wing: wingGeo(0.17, 0.1, 0x735538, dark),
    neckPos: new THREE.Vector3(0, 0.58, 0.16),
    beakTip: new THREE.Vector3(0, 0.12, 0.27),
    hip: new THREE.Vector3(0.09, 0.3, 0.0),
    wingPos: new THREE.Vector3(0.22, 0.5, 0.06),
    headTop: 0.87,
  };
}

/* ------------------------------------------------------------------ beach turkey swimwear */
const SHORTS = [0x1fb5c9, 0xff6b35, 0xe84a8a, 0x7bd34f, 0x3a6ff0, 0xffd21f];
const beachCache = {};

// body layout per stage: [body centre y, body z, radii, thigh x, thigh y, thigh r]
const BODY_DIMS = {
  0: { y: 0.42, z: 0, r: [0.27, 0.25, 0.3], tx: 0.09, ty: 0.3, tr: 0.08 },
  1: { y: 0.47, z: -0.03, r: [0.25, 0.23, 0.36], tx: 0.1, ty: 0.36, tr: 0.1 },
};
// mask & snorkel layout per stage (neck space): eye height, lens z, lens width, head radius, head centre z
const HEAD_DIMS = {
  0: { ey: 0.182, lz: 0.178, lw: 0.27, lh: 0.11, hr: 0.145, hz: 0.05, pr: 0.026, px: 0.07 },
  1: { ey: 0.275, lz: 0.148, lw: 0.18, lh: 0.075, hr: 0.088, hz: 0.085, pr: 0.016, px: 0.045 },
};

function shortsGeo(stage, color) {
  const d = BODY_DIMS[stage === 0 ? 0 : 1];
  const base = new THREE.Color(color), light = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.45);
  const shell = new THREE.SphereGeometry(1, 18, 10, 0, TAU, Math.PI * 0.44, Math.PI * 0.56);
  const shorts = tint(part(shell, color, [0, d.y, d.z], [0, 0, 0], [d.r[0] * 1.06, d.r[1] * 1.06, d.r[2] * 1.05]), (x, y, z, c) => {
    if (Math.sin(Math.atan2(z - d.z, x) * 6) > 0.55) c.copy(light); // bold surf stripes
    else c.copy(base);
  });
  const topY = d.y + d.r[1] * 1.06 * Math.cos(Math.PI * 0.44);
  const p = [
    shorts,
    part(G.torus(1, 0.07, 5, 24), 0x1c1c1c, [0, topY, d.z], [Math.PI / 2, 0, 0], [d.r[0] * 1.02, d.r[2] * 1.02, 0.3]),
  ];
  for (const s of [-1, 1]) p.push(part(G.cyl(d.tr * 1.3, d.tr * 1.4, d.tr * 1.3, 12, true), color, [s * d.tx, d.ty - d.tr * 0.4, 0]));
  // hibiscus flowers
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7 + 0.4, x = Math.cos(a) * d.r[0] * 1.08, z = d.z + Math.sin(a) * d.r[2] * 1.07;
    p.push(part(G.sphere(1, 6, 4), i % 2 ? 0xffffff : 0xff4f8b, [x, d.y - d.r[1] * 0.35, z], [0, -a, 0], [0.035, 0.035, 0.012]));
  }
  return merge(p);
}

function snorkelGeo(stage) {
  const h = HEAD_DIMS[stage === 0 ? 0 : 1];
  const s = stage === 0 ? 1.6 : 1;
  return merge([
    part(G.torus(h.hr * 1.05, 0.012 * s, 5, 20), 0x1c1c1c, [0, h.ey, h.hz], [Math.PI / 2, 0, 0], [1, 1.2, 1]),
    part(G.box(h.lw + 0.02 * s, h.lh + 0.02 * s, 0.02 * s), 0x1c1c1c, [0, h.ey, h.lz - 0.008 * s]),
    part(G.box(h.lw, h.lh, 0.022 * s), 0xaeeaff, [0, h.ey, h.lz]),
    part(G.sphere(h.pr, 8, 6), 0x111111, [h.px, h.ey, h.lz + 0.012 * s]),
    part(G.sphere(h.pr, 8, 6), 0x111111, [-h.px, h.ey, h.lz + 0.012 * s]),
    part(G.sphere(h.pr * 0.4, 6, 4), 0xffffff, [h.px + h.pr * 0.4, h.ey + h.pr * 0.4, h.lz + 0.018 * s]),
    part(G.sphere(h.pr * 0.4, 6, 4), 0xffffff, [-h.px + h.pr * 0.4, h.ey + h.pr * 0.4, h.lz + 0.018 * s]),
    limb([h.hr * 0.95, h.ey - 0.04 * s, h.hz + 0.02], [h.hr * 1.05, h.ey + 0.2 * s, h.hz - 0.01], 0.016 * s, 0.016 * s, 0xff8c1a, 8),
    part(G.sphere(0.022 * s, 8, 6), 0xff8c1a, [h.hr * 1.05, h.ey + 0.2 * s, h.hz - 0.01]),
    limb([h.hr * 0.95, h.ey - 0.04 * s, h.hz + 0.02], [h.hr * 0.3, h.ey - 0.07 * s, h.lz + 0.02 * s], 0.014 * s, 0.014 * s, 0xff8c1a, 6),
  ]);
}

function beachGeos(stage, variant) {
  const key = `${stage}:${variant}`;
  beachCache[key] ??= { shorts: shortsGeo(stage, SHORTS[variant % SHORTS.length]), snorkel: snorkelGeo(stage) };
  return beachCache[key];
}

/* ------------------------------------------------------------------ cricket kit (turkeys hatched on the oval) */
const KIT = { white: 0xf5f5f0, ridge: 0xe2e2da, strap: 0x2a3b6e, navy: 0x1d2b5e, steel: 0xc9ced4, gold: 0xd4a017 };
// per stage (chicks, then juveniles & adults; neck space): the helmet's dome (its rim sits just above the eyes),
// the peak, and the grille in front of the face; and the leg guards (leg space: hip at 0, foot at the bottom)
const HELMET = [
  { y: 0.215, z: 0.04, r: 0.155, peak: [0.26, 0.1, 0.225], face: 0.268, bars: [0.2, 0.16, 0.12], w: 0.11 },
  { y: 0.285, z: 0.075, r: 0.098, peak: [0.16, 0.07, 0.19], face: 0.248, bars: [0.272, 0.243, 0.214], w: 0.075 },
];
const PADS = [{ top: -0.08, bot: -0.27, w: 0.075, z: 0.03 }, { top: -0.09, bot: -0.31, w: 0.088, z: 0.036 }];

function helmetGeo(k) {
  const h = HELMET[k], s = h.r / 0.098, bar = 0.006 * s;
  const p = [
    // the dome over the top of the head, and down round the back
    part(new THREE.SphereGeometry(h.r, 18, 8, 0, TAU, 0, Math.PI / 2), KIT.navy, [0, h.y, h.z]),
    part(new THREE.SphereGeometry(h.r, 12, 4, Math.PI, Math.PI, Math.PI / 2, Math.PI * 0.28), KIT.navy, [0, h.y, h.z]),
    part(G.torus(h.r, 0.008 * s, 4, 24), KIT.navy, [0, h.y, h.z], [Math.PI / 2, 0, 0]),
    // the peak, and a little gold badge above it
    part(G.box(h.peak[0], 0.012 * s, h.peak[1]), KIT.navy, [0, h.y - 0.004 * s, h.peak[2]], [0.2, 0, 0]),
    part(G.box(0.03 * s, 0.03 * s, 0.01 * s), KIT.gold, [0, h.y + h.r * 0.55, h.z + h.r * 0.84], [-0.6, 0, 0]),
  ];
  // the grille: bars across the face, a couple down it, and struts back to the dome either side
  const top = h.bars[0], bot = h.bars[h.bars.length - 1];
  for (const y of h.bars) p.push(limb([-h.w, y, h.face - 0.012 * s], [h.w, y, h.face - 0.012 * s], bar, bar, KIT.steel, 5));
  for (const x of [-h.w * 0.4, h.w * 0.4]) p.push(limb([x, top + 0.01 * s, h.face], [x, bot - 0.008 * s, h.face], bar, bar, KIT.steel, 5));
  for (const sx of [-1, 1]) {
    p.push(limb([sx * h.w, top, h.face - 0.012 * s], [sx * h.r * 0.95, h.y - 0.004 * s, h.z + h.r * 0.3], bar, bar, KIT.steel, 5));
    p.push(limb([sx * h.w, bot, h.face - 0.012 * s], [sx * h.r * 0.95, h.y - 0.004 * s, h.z + h.r * 0.3], bar, bar, KIT.steel, 5));
  }
  return merge(p);
}

function padGeo(k) {
  const d = PADS[k], len = d.top - d.bot, mid = (d.top + d.bot) / 2, s = d.w / 0.088;
  const p = [
    part(G.box(d.w, len, 0.028 * s), KIT.white, [0, mid, d.z]),
    part(G.cyl(0.02 * s, 0.02 * s, d.w * 0.95, 10), KIT.white, [0, d.top, d.z + 0.004], [0, 0, Math.PI / 2]), // (the knee roll)
  ];
  // raised bolsters down the front, and the straps round the back
  for (const x of [-0.32, 0, 0.32]) p.push(part(G.box(d.w * 0.2, len * 0.92, 0.018 * s), KIT.ridge, [x * d.w, mid - len * 0.03, d.z + 0.017 * s]));
  for (const y of [d.top - len * 0.25, d.bot + len * 0.22]) p.push(part(G.box(d.w * 1.12, 0.014 * s, 0.07 * s), KIT.strap, [0, y, d.z - 0.022 * s]));
  return merge(p);
}

const kitCache = [];
function kitGeos(stage) {
  const k = stage === 0 ? 0 : 1;
  kitCache[k] ??= { helmet: helmetGeo(k), pad: padGeo(k) };
  return kitCache[k];
}

const cache = {};
let DIRT = null;
function geos(stage, hen = false) {
  const key = stage === 2 && hen ? 'hen' : stage;
  cache[key] ??= stage === 0 ? chick() : adultLike(stage === 1, key === 'hen');
  return cache[key];
}

/* beach turkeys' feathers have a blue sheen, so you can pick them out of a crowd (or the surf) */
const SEA_BLUE = new THREE.Color(0x2f86e0);
const blueCache = [];
function blueGeos(stage) {
  if (!blueCache[stage]) {
    const g = geos(stage), k = [0.42, 0.46, 0.5][stage];
    const blue = (geo) => tint(geo.clone(), (x, y, z, c) => c.lerp(SEA_BLUE, k));
    blueCache[stage] = { body: blue(g.body), wing: blue(g.wing) };
  }
  return blueCache[stage];
}

/* ------------------------------------------------------------------ rig */
/** `gear`: cricket kit it's wearing, if any ({ helmet, pads }) */
export function createRig(stage, kind = 'normal', variant = 0, hen = false, gear = null) {
  hen = hen && stage === 2; // (chicks and juveniles all look alike)
  const g = geos(stage, hen);
  const feathers = kind === 'beach' ? blueGeos(stage) : { body: g.body, wing: g.wing };
  DIRT ??= dirtGeo();
  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);
  const body = vcMesh(feathers.body);
  bodyPivot.add(body);

  const neck = new THREE.Group();
  neck.position.copy(g.neckPos);
  bodyPivot.add(neck);
  const head = vcMesh(g.head);
  neck.add(head);
  // (a cock's wattle, which puffs right up when he's showing off: see Turkey's showOff)
  let wattle = null;
  if (g.wattle) {
    wattle = vcMesh(g.wattle);
    wattle.position.copy(WATTLE_AT);
    neck.add(wattle);
  }
  const beak = new THREE.Object3D();
  beak.position.copy(g.beakTip);
  neck.add(beak);

  // legs hang off the body pivot, so they tumble with the body in a somersault
  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.position.set(g.hip.x, g.hip.y, g.hip.z);
  legR.position.set(-g.hip.x, g.hip.y, g.hip.z);
  legL.add(vcMesh(g.leg));
  legR.add(vcMesh(g.leg));
  bodyPivot.add(legL, legR);

  const wingL = new THREE.Group(), wingR = new THREE.Group();
  wingL.position.set(g.wingPos.x, g.wingPos.y, g.wingPos.z);
  wingR.position.set(-g.wingPos.x, g.wingPos.y, g.wingPos.z);
  const wl = vcMesh(feathers.wing), wr = vcMesh(feathers.wing);
  wr.scale.x = -1;
  wingL.add(wl);
  wingR.add(wr);
  bodyPivot.add(wingL, wingR);

  const dirt = vcMesh(DIRT, { cast: false, receive: true });
  dirt.position.set(0, g.neckPos.y, g.neckPos.z);
  dirt.visible = false;
  root.add(dirt);

  if (kind === 'beach') {
    // boardshorts ride on the body (so they hide with it underground); mask & snorkel on the head
    const bg = beachGeos(stage, variant);
    body.add(vcMesh(bg.shorts));
    head.add(vcMesh(bg.snorkel));
  }

  // padded up for cricket: a helmet on its head, and leg guards strapped on (they swing with the legs)
  let helmet = null, pads = null;
  if (gear?.helmet) head.add((helmet = vcMesh(kitGeos(stage).helmet)));
  if (gear?.pads) {
    pads = [vcMesh(kitGeos(stage).pad), vcMesh(kitGeos(stage).pad)];
    legL.add(pads[0]);
    legR.add(pads[1]);
  }

  root.scale.setScalar(STAGES[stage].scale * (hen ? HEN_SCALE : 1));
  return { root, bodyPivot, body, neck, head, wattle, beak, legL, legR, wingL, wingR, dirt, helmet, pads, neckPos: g.neckPos, headTop: g.headTop };
}
