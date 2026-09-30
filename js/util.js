import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const TAU = Math.PI * 2;
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
export const dampAngle = (a, b, lambda, dt) => a + angleDiff(a, b) * (1 - Math.exp(-lambda * dt));

/** 0..1, always the same for the same whole numbers i, j (and n, for another of them) */
export function hash(i, j, n = 0) {
  let h = Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1) ^ Math.imul(n + 1, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** smooth noise, -1..1, that changes over about a unit */
export function noise(x, z) {
  const i = Math.floor(x), j = Math.floor(z), u = smoothstep(0, 1, x - i), v = smoothstep(0, 1, z - j);
  return lerp(lerp(hash(i, j), hash(i + 1, j), u), lerp(hash(i, j + 1), hash(i + 1, j + 1), u), v) * 2 - 1;
}

/* ------------------------------------------------------------------ toon materials */
let _gradient = null;
export function gradientMap() {
  if (_gradient) return _gradient;
  const data = new Uint8Array([110, 175, 235, 255]);
  _gradient = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  _gradient.minFilter = _gradient.magFilter = THREE.NearestFilter;
  _gradient.generateMipmaps = false;
  _gradient.needsUpdate = true;
  return _gradient;
}

export function toonMat(params = {}) {
  return new THREE.MeshToonMaterial({ gradientMap: gradientMap(), ...params });
}

let _vcMat = null;
/** Shared toon material that takes its colour from vertex colours. */
export function vcMat() {
  if (!_vcMat) _vcMat = toonMat({ vertexColors: true });
  return _vcMat;
}

/* ------------------------------------------------------------------ geometry building */
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/**
 * Bake a primitive into a coloured, transformed, non-indexed geometry that can be merged.
 * pos/rot are [x,y,z]; scl is a number or [x,y,z].
 */
export function part(geo, color, pos = [0, 0, 0], rot = [0, 0, 0], scl = 1) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  geo.dispose();
  for (const k of Object.keys(g.attributes)) {
    if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  _p.set(pos[0], pos[1], pos[2]);
  _q.setFromEuler(_e.set(rot[0], rot[1], rot[2]));
  if (typeof scl === 'number') _s.set(scl, scl, scl);
  else _s.set(scl[0], scl[1], scl[2]);
  g.applyMatrix4(_m.compose(_p, _q, _s));
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/** Tint a baked part vertex-by-vertex, e.g. for gradients. fn(x,y,z,color) mutates color. */
export function tint(g, fn) {
  const p = g.attributes.position, c = g.attributes.color;
  const col = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    col.setRGB(c.getX(i), c.getY(i), c.getZ(i));
    fn(p.getX(i), p.getY(i), p.getZ(i), col);
    c.setXYZ(i, col.r, col.g, col.b);
  }
  return g;
}

export function merge(parts) {
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  g.computeBoundingSphere();
  return g;
}

export function vcMesh(geo, { cast = true, receive = false } = {}) {
  const m = new THREE.Mesh(geo, vcMat());
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

/* ------------------------------------------------------------------ primitives shorthands */
export const G = {
  sphere: (r = 1, w = 12, h = 9) => new THREE.SphereGeometry(r, w, h),
  box: (x = 1, y = 1, z = 1) => new THREE.BoxGeometry(x, y, z),
  cyl: (rt = 1, rb = 1, h = 1, s = 10, open = false) => new THREE.CylinderGeometry(rt, rb, h, s, 1, open),
  cone: (r = 1, h = 1, s = 10) => new THREE.ConeGeometry(r, h, s),
  ico: (r = 1, d = 0) => new THREE.IcosahedronGeometry(r, d),
  dodec: (r = 1) => new THREE.DodecahedronGeometry(r, 0),
  torus: (r = 1, t = 0.2, rs = 6, ts = 14, arc = TAU) => new THREE.TorusGeometry(r, t, rs, ts, arc),
  capsule: (r = 0.5, len = 1, cs = 4, rs = 10) => new THREE.CapsuleGeometry(r, len, cs, rs),
};

/** Cylinder oriented between two points (for limbs baked into merged geometry). */
export function limb(a, b, ra, rb, color, seg = 8) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const g = new THREE.CylinderGeometry(rb, ra, len, seg, 1);
  const mid = A.clone().add(B).multiplyScalar(0.5);
  const dir = B.clone().sub(A).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  const e = new THREE.Euler().setFromQuaternion(q);
  return part(g, color, [mid.x, mid.y, mid.z], [e.x, e.y, e.z]);
}

export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** world labels only show near the player: fully up close, fading out towards LABEL_RANGE */
export const LABEL_RANGE = 30;
/** 1 up close, fading over the last `band` metres to nothing at `range` */
export function labelFade(dist, range = LABEL_RANGE, band = 6) { return clamp((range - dist) / band, 0, 1); }

/**
 * Pin a DOM label to world point v (projected in place). Moved with a transform, not left/top,
 * so it never forces a layout. Returns false (and hides the label) when it's off screen or faded out.
 */
export function pinLabel(el, v, camera, fade = 1) {
  v.project(camera);
  const vis = fade > 0 && v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
  const disp = vis ? '' : 'none';
  if (el.style.display !== disp) el.style.display = disp;
  if (!vis) return false;
  el.style.transform = `translate(${Math.round((v.x + 1) * 0.5 * innerWidth)}px, ${Math.round((1 - v.y) * 0.5 * innerHeight)}px) translate(-50%, -100%)`;
  const op = fade < 1 ? fade.toFixed(2) : '';
  if (el.style.opacity !== op) el.style.opacity = op;
  return true;
}

/**
 * A progress dial floating over something in the world, a bit like a stamina wheel. The inner ring
 * fills up (e.g. carrying strength against a load's weight); once it's full, an outer ring shows any
 * extra (spare strength, which means a quicker trip). An icon can sit in the middle, a note under it.
 */
export class Dial {
  constructor(icon = '', size = '') {
    const el = document.createElement('div');
    this.base = size ? `dial ${size}` : 'dial';
    el.className = this.base;
    el.style.display = 'none';
    el.innerHTML = '<svg viewBox="0 0 44 44"><circle class="d-back" cx="22" cy="22" r="15"/>'
      + '<circle class="d-track" cx="22" cy="22" r="12.5"/>'
      + '<circle class="d-fill" cx="22" cy="22" r="12.5" pathLength="100" stroke-dasharray="0 100"/>'
      + '<circle class="d-extra" cx="22" cy="22" r="18.5" pathLength="100" stroke-dasharray="0 100"/></svg>'
      + '<span class="d-icon"></span><span class="d-note"></span>';
    document.getElementById('labels').appendChild(el);
    this.el = el;
    this.fillEl = el.querySelector('.d-fill');
    this.extraEl = el.querySelector('.d-extra');
    this.iconEl = el.querySelector('.d-icon');
    this.noteEl = el.querySelector('.d-note');
    this.f = this.e = -1;
    this.state = this.iconText = this.noteText = null;
    this.icon(icon);
  }

  /** fill and extra run 0..1; state is a CSS class ('lift' when it's full and off the ground, 'hot', 'wait') */
  set(fill, extra = 0, state = '') {
    const f = Math.round(clamp(fill, 0, 1) * 100), e = Math.round(clamp(extra, 0, 1) * 100);
    if (f !== this.f) { this.f = f; this.fillEl.setAttribute('stroke-dasharray', `${f} 100`); }
    if (e !== this.e) { this.e = e; this.extraEl.setAttribute('stroke-dasharray', `${e} 100`); }
    if (state !== this.state) { this.state = state; this.el.className = state ? `${this.base} ${state}` : this.base; }
  }

  icon(text) { if (text !== this.iconText) { this.iconText = text; this.iconEl.textContent = text; } }
  /** the note under it (`key`: a key to press for it, shown in front of it) */
  note(text, key = '') {
    const s = `${key}|${text}`;
    if (s === this.noteText) return;
    this.noteText = s;
    if (!key) { this.noteEl.textContent = text; return; }
    const k = document.createElement('kbd');
    k.textContent = key;
    this.noteEl.replaceChildren(k, ` ${text}`);
  }
  pin(v, camera, fade = 1) { return pinLabel(this.el, v, camera, fade); }
  hide() { if (this.el.style.display !== 'none') this.el.style.display = 'none'; }
  remove() { this.el.remove(); }
}

/** Tiny spatial hash for neighbour queries on the XZ plane. */
export class SpatialHash {
  constructor(cell = 1.5) {
    this.cell = cell;
    this.map = new Map();
  }
  clear() { this.map.clear(); }
  key(ix, iz) { return (ix + 2048) * 4096 + (iz + 2048); }
  insert(obj, x, z) {
    const k = this.key(Math.floor(x / this.cell), Math.floor(z / this.cell));
    let b = this.map.get(k);
    if (!b) { b = []; this.map.set(k, b); }
    b.push(obj);
  }
  query(x, z, r, out) {
    out.length = 0;
    const c = this.cell;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    const z0 = Math.floor((z - r) / c), z1 = Math.floor((z + r) / c);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const b = this.map.get(this.key(ix, iz));
        if (b) for (let i = 0; i < b.length; i++) out.push(b[i]);
      }
    }
    return out;
  }
}
