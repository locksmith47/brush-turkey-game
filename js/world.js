import * as THREE from 'three';
import { vcMat, toonMat, clamp, smoothstep } from './util.js';
import { buildBush } from './props/bush.js';
import { buildSuburb } from './props/suburb.js';
import { buildCity } from './props/city.js';
import { buildOval } from './props/oval.js';
import { buildBeach, beachGround, waterAt, shoreDir, seaWave, isSand } from './props/beach.js';

/* The map is a long strip running north (-z): bush -> backyards -> city -> oval -> Bondi. */
export const BOUNDS = { xMin: -46, xMax: 46, zMin: -366, zMax: 46 };
export const ZONES = [
  { name: 'The Bush', zMin: -38 },
  { name: 'The Backyards', zMin: -98 },
  { name: 'The City', zMin: -170 },
  { name: 'The Oval', zMin: -250 },
  { name: 'Bondi Beach', zMin: -350 },
  { name: 'The Wharf', zMin: -366 },
];
export const FENCES = [
  { z: -38, kind: 'wood', gateX: 6, gateHW: 2.6 },
  { z: -98, kind: 'wire', gateX: -8, gateHW: 2.6 },
  { z: -170, kind: 'picket', gateX: -20, gateHW: 2.6 },
  { z: -250, kind: 'rail', gateX: -16, gateHW: 2.6 },
  { z: -350, kind: 'rail', gateX: -30, gateHW: 2.6 },
];

export class World {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.bounds = BOUNDS;
    this.colliders = []; // circles {x, z, r}
    this.segments = []; // capsules {ax, az, bx, bz, r, active, blockThrow}
    this.treeSpots = []; // {x, z, h, palette}
    this.roosts = []; // low branches turkeys can roost on: {tree, x, z, perches, spot} (the toys pick these up)
    this.swayers = [];
    this.gates = FENCES.map((f) => ({ x: f.gateX, z: f.z, hw: f.gateHW, kind: f.kind, open: false }));

    this.buildSky();
    this.buildLights();
    this.buildGround();
    buildBush(this);
    buildSuburb(this);
    buildCity(this);
    buildOval(this);
    this.beach = buildBeach(this);
  }

  zoneOf(z) {
    for (let i = 0; i < ZONES.length - 1; i++) if (z > ZONES[i].zMin) return i;
    return ZONES.length - 1;
  }

  groundHeight(x, z) {
    if (z < -250) return beachGround(x, z);
    // bumpy bush that flattens out towards the suburbs, rising into a rim at the edges
    const bush = smoothstep(-38, -26, z);
    if (bush <= 0) return 0;
    const h = 0.45 * Math.sin(x * 0.11 + 0.7) * Math.cos(z * 0.09 - 0.3)
      + 0.25 * Math.sin(x * 0.05 - z * 0.07 + 1.9)
      + 0.12 * Math.sin(x * 0.31 + z * 0.23);
    const flat = smoothstep(6, 16, Math.hypot(x, z));
    const rim = (smoothstep(44, 60, Math.abs(x)) + smoothstep(44, 60, z)) * 4;
    return (h * flat + rim) * bush;
  }

  buildSky() {
    const g = new THREE.SphereGeometry(500, 24, 16);
    const col = new Float32Array(g.attributes.position.count * 3);
    const top = new THREE.Color(0x4f9fe0), hor = new THREE.Color(0xd9eef7), c = new THREE.Color();
    for (let i = 0; i < g.attributes.position.count; i++) {
      const y = g.attributes.position.getY(i) / 500;
      c.copy(hor).lerp(top, clamp(y * 1.6, 0, 1));
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.sky = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }));
    this.scene.add(this.sky);
    this.scene.fog = new THREE.Fog(0xcfe6ee, 60, 150);
  }

  buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xdff0ff, 0x6e5a3a, 1.6));
    const sun = new THREE.DirectionalLight(0xfff0d0, 2.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = sun.shadow.camera;
    s.left = -28; s.right = 28; s.top = 28; s.bottom = -28; s.near = 1; s.far = 110;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
    this.sunOffset = new THREE.Vector3(18, 40, 14);
    this.scene.add(sun, sun.target);
    this.sun = sun;
  }

  followSun(p) {
    this.sun.position.copy(p).add(this.sunOffset);
    this.sun.target.position.copy(p);
    this.sky.position.set(p.x, 0, p.z);
  }

  buildGround() {
    const W = 280, D = 390, cz = -55; // stops at the Oval; the beach has its own finer ground
    const g = new THREE.PlaneGeometry(W, D, 140, 195);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, cz);
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const grassA = new THREE.Color(0x7fae4f), grassB = new THREE.Color(0x96b95a), dirt = new THREE.Color(0x9c7a4f);
    const dry = new THREE.Color(0xb7ad6a), lawn = new THREE.Color(0x86bd52), concrete = new THREE.Color(0xa9a79f), oval = new THREE.Color(0x74b548), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, this.groundHeight(x, z));
      const zone = Math.min(3, this.zoneOf(z));
      if (zone === 0) {
        const n = 0.5 + 0.5 * Math.sin(x * 0.37 + Math.sin(z * 0.21) * 2) * Math.cos(z * 0.29 - x * 0.05);
        c.copy(grassA).lerp(grassB, n);
        c.lerp(dry, smoothstep(0.65, 1, 0.5 + 0.5 * Math.sin(x * 0.08 + z * 0.06 + 2.0)) * 0.6);
        c.lerp(dirt, (1 - smoothstep(3, 9, Math.hypot(x, z))) * 0.55);
      } else if (zone === 1) {
        c.copy(lawn);
      } else if (zone === 2) {
        c.copy(concrete);
      } else {
        c.copy(oval);
      }
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    this.groundColors = g.attributes.color;
    this.groundGeo = g;
    const ground = new THREE.Mesh(g, vcMat());
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.ground = ground;
  }

  stainGround(x, z, r, color = 0x8a6a40, amt = 0.5) {
    const pos = this.groundGeo.attributes.position, col = this.groundColors, c = new THREE.Color(), t = new THREE.Color(color);
    for (let i = 0; i < pos.count; i++) {
      const d = Math.hypot(pos.getX(i) - x, pos.getZ(i) - z);
      if (d > r) continue;
      c.setRGB(col.getX(i), col.getY(i), col.getZ(i)).lerp(t, (1 - d / r) * amt);
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  }

  addSegment(ax, az, bx, bz, r = 0.25, blockThrow = true) {
    const s = { ax, az, bx, bz, r, active: true, blockThrow };
    this.segments.push(s);
    return s;
  }

  /* ---------------------------------------------------------------- water */
  /** { depth: 0 dry | 1 wading | 2 swimming, level: water surface height } */
  waterAt(x, z) { return waterAt(x, z); }
  waterDepth(x, z) { return waterAt(x, z).depth; }
  /** height of the water's surface right now (the sea rides the swell); `w` is waterAt(x, z) */
  surfaceY(w, x, z) { return w.sea ? w.level + seaWave(x, z, this.game.time) : w.level; }
  shoreDir(x, z, out) { return shoreDir(x, z, out); }
  isSand(x, z) { return isSand(x, z); }

  addSway(mesh) { this.swayers.push({ m: mesh, ph: Math.random() * 6.28 }); }

  isFree(x, z, r = 0.5) {
    const b = this.bounds;
    if (x < b.xMin + r || x > b.xMax - r || z < b.zMin + r || z > b.zMax - r) return false;
    for (const c of this.colliders) if (Math.hypot(x - c.x, z - c.z) < c.r + r) return false;
    for (const s of this.segments) if (s.active && segDist(x, z, s) < s.r + r) return false;
    return true;
  }

  /** push a point out of obstacles and keep it in bounds; returns true if it moved */
  resolve(p, r = 0.4, extra = null) {
    let hit = pushCircles(p, r, this.colliders);
    if (extra) hit = pushCircles(p, r, extra) || hit;
    for (const s of this.segments) {
      if (!s.active) continue;
      const min = s.r + r;
      const t = segT(p.x, p.z, s);
      const cx = s.ax + (s.bx - s.ax) * t, cz = s.az + (s.bz - s.az) * t;
      const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
      if (d2 < min * min) {
        const d = Math.sqrt(d2) || 1e-4;
        p.x = cx + (dx / d) * min;
        p.z = cz + (dz / d) * min;
        hit = true;
      }
    }
    const b = this.bounds;
    const x = clamp(p.x, b.xMin + r, b.xMax - r), z = clamp(p.z, b.zMin + r, b.zMax - r);
    if (x !== p.x || z !== p.z) { p.x = x; p.z = z; hit = true; }
    return hit;
  }

  /**
   * A heading close to (ux, uz) along which something at (x, z), needing `pad` of room, won't run into a
   * rock, tree or shed within `look` metres (it swings left or right round them). `memo.swing` remembers
   * which way it last swung, so it doesn't dither. Written into `out`; null if it's boxed in.
   */
  clearHeading(x, z, ux, uz, pad, look, memo, out) {
    const blocked = (dx, dz) => {
      const px = x + dx * look, pz = z + dz * look;
      for (const c of this.colliders) {
        const ex = px - c.x, ez = pz - c.z, m = c.r + pad;
        // (only things ahead count: anything it's already brushing past is beside or behind)
        if (ex * ex + ez * ez < m * m && (c.x - x) * dx + (c.z - z) * dz > 0) return true;
      }
      return false;
    };
    if (!blocked(ux, uz)) return out.set(ux, 0, uz);
    const side = memo.swing ?? 1;
    for (const a of [0.35, 0.7, 1.05, 1.4, 1.75]) {
      for (const s of [side, -side]) {
        const c = Math.cos(a * s), sn = Math.sin(a * s), rx = ux * c - uz * sn, rz = ux * sn + uz * c;
        if (!blocked(rx, rz)) { memo.swing = s; return out.set(rx, 0, rz); }
      }
    }
    return null;
  }

  /** fraction (0..1) along a->b where a throw first hits a wall, or 1 if clear */
  throwClear(ax, az, bx, bz) {
    let best = 1;
    for (const s of this.segments) {
      if (!s.active || !s.blockThrow) continue;
      const t = segIntersect(ax, az, bx, bz, s.ax, s.az, s.bx, s.bz);
      if (t !== null && t < best) best = t;
    }
    return best;
  }

  /**
   * Next point to walk to on the way from (fx,fz) to (tx,tz), going through gates
   * between zones. Returns null if the way is still fenced off.
   */
  route(fx, fz, tx, tz, out) {
    const zf = this.zoneOf(fz), zt = this.zoneOf(tz);
    if (zf === zt) return out.set(tx, 0, tz);
    const dir = zt > zf ? 1 : -1; // +1 = heading north (-z)
    const gate = this.gates[dir > 0 ? zf : zf - 1];
    if (!gate.open) return null;
    const nearGap = Math.abs(fx - gate.x) < gate.hw - 0.3 && Math.abs(fz - gate.z) < 1.6;
    return nearGap ? out.set(gate.x, 0, gate.z - dir * 2.5) : out.set(gate.x, 0, gate.z + dir * 1.3);
  }

  /** trees between the camera and the player go see-through so they never hide the action */
  fadeOccluders(cam, target) {
    this.fadeMat ??= toonMat({ vertexColors: true, transparent: true, opacity: 0.2, depthWrite: false });
    const ax = cam.x, az = cam.z, vx = target.x - ax, vz = target.z - az, l2 = vx * vx + vz * vz || 1;
    for (const s of this.swayers) {
      const p = s.m.position;
      const t = ((p.x - ax) * vx + (p.z - az) * vz) / l2;
      const k = clamp(t, 0, 1);
      const near = t > -0.3 && t < 0.92 && Math.hypot(ax + vx * k - p.x, az + vz * k - p.z) < 3.6;
      const mat = near ? this.fadeMat : vcMat();
      if (s.m.material !== mat) s.m.material = mat;
      s.m.visible = Math.hypot(ax - p.x, az - p.z) > 3.4; // camera inside the canopy: hide the whole tree
    }
  }

  update(dt, t) {
    this.beach.update(dt, t);
    for (const s of this.swayers) {
      s.m.rotation.z = Math.sin(t * 0.7 + s.ph) * 0.012;
      s.m.rotation.x = Math.cos(t * 0.53 + s.ph) * 0.01;
    }
  }
}

/* ------------------------------------------------------------------ geometry helpers */
function pushCircles(p, r, list) {
  let hit = false;
  for (const c of list) {
    const dx = p.x - c.x, dz = p.z - c.z, min = c.r + r, d2 = dx * dx + dz * dz;
    if (d2 < min * min) {
      const d = Math.sqrt(d2) || 1e-4;
      p.x = c.x + (dx / d) * min;
      p.z = c.z + (dz / d) * min;
      hit = true;
    }
  }
  return hit;
}

function segT(x, z, s) {
  const vx = s.bx - s.ax, vz = s.bz - s.az;
  const l2 = vx * vx + vz * vz || 1e-6;
  return clamp(((x - s.ax) * vx + (z - s.az) * vz) / l2, 0, 1);
}

export function segDist(x, z, s) {
  const t = segT(x, z, s);
  return Math.hypot(x - (s.ax + (s.bx - s.ax) * t), z - (s.az + (s.bz - s.az) * t));
}

/** closest point on segment s to (x,z), written into out */
export function segClosest(x, z, s, out) {
  const t = segT(x, z, s);
  return out.set(s.ax + (s.bx - s.ax) * t, 0, s.az + (s.bz - s.az) * t);
}

function segIntersect(ax, az, bx, bz, cx, cz, dx, dz) {
  const rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz;
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * sz - (cz - az) * sx) / den;
  const u = ((cx - ax) * rz - (cz - az) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}
