import * as THREE from 'three';
import { part, merge, G, rand, pick, canvasTexture, toonMat } from '../util.js';

/* Australian timber paling fence running along +x from 0 to len (built at origin). */
export function palingGeo(len, { height = 1.8, weathered = false, gaps = false } = {}) {
  const p = [];
  const post = weathered ? 0x7d7266 : 0x8a6a4a;
  const cols = weathered ? [0x9a9084, 0x8c8276, 0xa59b8e] : [0xb08560, 0xa57a55, 0xbb9068, 0x9f7550];
  const posts = Math.max(2, Math.round(len / 2.4) + 1);
  for (let i = 0; i < posts; i++) {
    p.push(part(G.box(0.14, height + 0.15, 0.14), post, [(i / (posts - 1)) * len, (height + 0.15) / 2, -0.08]));
  }
  p.push(part(G.box(len, 0.1, 0.06), post, [len / 2, 0.35, -0.1]));
  p.push(part(G.box(len, 0.1, 0.06), post, [len / 2, height - 0.3, -0.1]));
  const w = 0.14;
  for (let x = w / 2; x < len; x += w + 0.012) {
    if (gaps && Math.random() < 0.12) continue;
    const h = height - rand(0, 0.06) - (gaps && Math.random() < 0.2 ? rand(0.2, 0.6) : 0);
    p.push(part(G.box(w, h, 0.03), pick(cols), [x, h / 2, 0], [0, 0, gaps ? rand(-0.05, 0.05) : 0]));
  }
  return merge(p);
}

/* white picket fence along +x */
export function picketGeo(len, { height = 1.15, weathered = false } = {}) {
  const white = weathered ? 0xd9d4c4 : 0xf7f7f2, rail = weathered ? 0xc9c3b2 : 0xeeeeea;
  const p = [];
  const posts = Math.max(2, Math.round(len / 2.4) + 1);
  for (let i = 0; i < posts; i++) p.push(part(G.box(0.13, height + 0.1, 0.13), rail, [(i / (posts - 1)) * len, (height + 0.1) / 2, -0.07]));
  p.push(part(G.box(len, 0.08, 0.04), rail, [len / 2, 0.3, -0.06]));
  p.push(part(G.box(len, 0.08, 0.04), rail, [len / 2, height - 0.3, -0.06]));
  for (let x = 0.1; x < len; x += 0.2) {
    if (weathered && Math.random() < 0.12) continue;
    const h = height - (weathered ? rand(0, 0.15) : 0);
    p.push(part(G.box(0.1, h, 0.025), white, [x, h / 2, 0], [0, 0, weathered ? rand(-0.08, 0.08) : 0]));
    p.push(part(G.cone(0.071, 0.1, 4), white, [x, h + 0.05, 0], [0, Math.PI / 4, 0], [1, 1, 0.35]));
  }
  return merge(p);
}

/* the blue-painted iron railing along the Bondi promenade */
export function railGeo(len, { height = 1.2 } = {}) {
  const blue = 0x2f6fb0, p = [];
  const posts = Math.max(2, Math.round(len / 1.6) + 1);
  for (let i = 0; i < posts; i++) {
    const x = (i / (posts - 1)) * len;
    p.push(part(G.box(0.09, height, 0.09), blue, [x, height / 2, 0]));
    p.push(part(G.sphere(0.07, 8, 6), blue, [x, height + 0.05, 0]));
  }
  for (const y of [0.3, 0.72, height - 0.05]) p.push(part(G.cyl(0.03, 0.03, len, 6), blue, [len / 2, y, 0], [0, 0, Math.PI / 2]));
  for (let x = 0.2; x < len; x += 0.2) p.push(part(G.cyl(0.012, 0.012, 0.42, 4), blue, [x, 0.51, 0]));
  return merge(p);
}

let _wireMat = null;
/** see-through chain-wire mesh material */
export function wireMat() {
  if (_wireMat) return _wireMat;
  const tex = canvasTexture(64, 64, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.strokeStyle = '#d4d8dc';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(0, h / 2); c.lineTo(w / 2, 0); c.lineTo(w, h / 2); c.lineTo(w / 2, h); c.closePath();
    c.stroke();
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  _wireMat = toonMat({ map: tex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
  return _wireMat;
}

/** chain-wire fence along +x: returns { frame (vertex coloured geo), mesh (textured plane geo) } */
export function wireGeo(len, { height = 2.1 } = {}) {
  const pole = 0x8f969c;
  const p = [];
  const posts = Math.max(2, Math.round(len / 3) + 1);
  for (let i = 0; i < posts; i++) p.push(part(G.cyl(0.05, 0.05, height, 8), pole, [(i / (posts - 1)) * len, height / 2, 0]));
  p.push(part(G.cyl(0.035, 0.035, len, 6), pole, [len / 2, height - 0.03, 0], [0, 0, Math.PI / 2]));
  p.push(part(G.cyl(0.03, 0.03, len, 6), pole, [len / 2, 0.08, 0], [0, 0, Math.PI / 2]));
  const plane = new THREE.PlaneGeometry(len, height - 0.12);
  plane.translate(len / 2, height / 2, 0);
  const uv = plane.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len * 3, uv.getY(i) * (height - 0.12) * 3);
  return { frame: merge(p), mesh: plane };
}

/** place a fence mesh from (ax,az) to (bx,bz) */
export function placeAlong(obj, ax, az, bx, bz, y = 0) {
  obj.position.set(ax, y, az);
  obj.rotation.y = -Math.atan2(bz - az, bx - ax);
  return obj;
}
