import * as THREE from 'three';
import { vcMat, toonMat, clamp, smoothstep } from './util.js';
import { buildBush, BUSH_SOUTH, HOME, TRACK } from './props/bush.js';
import { Track } from './track.js';
import { buildSuburb, BACKYARDS } from './props/suburb.js';
import { buildCity, STREETS } from './props/city.js';
import { buildOval, FIELD } from './props/oval.js';
import { buildBeach, beachGround, waterAt, shoreDir, seaWave, isSand } from './props/beach.js';

/* The map is a long strip running north (-z): bush -> backyards -> city -> oval -> Bondi. */
export const BOUNDS = { xMin: -46, xMax: 46, zMin: -366, zMax: BUSH_SOUTH };
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
    this.occluders = []; // buildings that go see-through when they're in the way of the camera
    this.gates = FENCES.map((f) => ({ x: f.gateX, z: f.z, hw: f.gateHW, kind: f.kind, open: false }));
    this.track = this.zoneTrack(0, TRACK); // the way through the bush (the scrub either side of it is impassable)
    // each zone's lie of the land (where there's any to speak of: the beach and the wharf are wide open)
    this.tracks = [this.track, this.zoneTrack(1, BACKYARDS), this.zoneTrack(2, STREETS), this.zoneTrack(3, FIELD)];

    this.buildSky();
    this.buildLights();
    this.buildGround();
    buildBush(this);
    buildSuburb(this);
    buildCity(this);
    buildOval(this);
    this.beach = buildBeach(this);
  }

  /** zone i's track (see Track), with room to get through the gates in and out of it */
  zoneTrack(i, spec) {
    if (!spec.rooms) spec = Track.fromPaths(spec);
    const rooms = [...spec.rooms];
    for (const g of [this.gates[i - 1], this.gates[i]]) {
      if (g) rooms.push({ rect: [g.x - g.hw - 0.5, g.z - 3, g.x + g.hw + 0.5, g.z + 3], ground: 'dirt' });
    }
    return new Track({ ...spec, rooms });
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
    const flat = smoothstep(6, 16, Math.hypot(x - HOME.x, z - HOME.z)); // (the mound sits on the level)
    const rim = (smoothstep(44, 60, Math.abs(x)) + smoothstep(BUSH_SOUTH - 2, BUSH_SOUTH + 14, z)) * 4;
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
    const W = 280, D = 410, cz = -45; // stops at the Oval; the beach has its own finer ground
    const g = new THREE.PlaneGeometry(W, D, 140, 205);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, cz);
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const grassA = new THREE.Color(0x7fae4f), grassB = new THREE.Color(0x96b95a), dirt = new THREE.Color(0x9c7a4f);
    const dry = new THREE.Color(0xb7ad6a), lawn = new THREE.Color(0x86bd52), concrete = new THREE.Color(0xa9a79f), oval = new THREE.Color(0x74b548), c = new THREE.Color();
    const track = new THREE.Color(0xa48558), mould = new THREE.Color(0x4d5a2f);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, this.groundHeight(x, z));
      const zone = Math.min(3, this.zoneOf(z));
      if (zone === 0) {
        const n = 0.5 + 0.5 * Math.sin(x * 0.37 + Math.sin(z * 0.21) * 2) * Math.cos(z * 0.29 - x * 0.05);
        c.copy(grassA).lerp(grassB, n);
        c.lerp(dry, smoothstep(0.65, 1, 0.5 + 0.5 * Math.sin(x * 0.08 + z * 0.06 + 2.0)) * 0.6);
        c.lerp(dirt, (1 - smoothstep(3, 9, Math.hypot(x - HOME.x, z - HOME.z))) * 0.55);
        // the track: bare earth along the paths and in the clearings you fight in (the mound's is grassy),
        // and dark leaf mould under the scrub either side
        c.lerp(track, this.track.dirt(x, z));
        c.lerp(mould, smoothstep(0.5, 3, this.track.depth(x, z)) * 0.85);
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

  /** a building (a mesh, in place) that goes see-through whenever it's between the camera and the player */
  addOccluder(mesh) {
    mesh.updateMatrixWorld(true);
    const solid = mesh.material, fade = solid.clone();
    fade.transparent = true;
    fade.opacity = 0.22;
    fade.depthWrite = false;
    this.occluders.push({ mesh, solid, fade, box: new THREE.Box3().setFromObject(mesh) });
  }

  /** the lie of the land in the zone at z (null where it's all open ground) */
  trackAt(z) { return this.tracks[this.zoneOf(z)] ?? null; }

  isFree(x, z, r = 0.5) {
    const b = this.bounds;
    if (x < b.xMin + r || x > b.xMax - r || z < b.zMin + r || z > b.zMax - r) return false;
    const tr = this.trackAt(z);
    if (tr && !tr.inside(x, z, r)) return false;
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
    // (nothing gets out of a zone's open ground: into the bush's scrub, say, or a building)
    const tr = this.trackAt(p.z);
    if (tr && tr.clamp(p, r)) hit = true;
    return hit;
  }

  /**
   * A heading close to (ux, uz) along which something at (x, z), needing `pad` of room, won't run into a
   * rock, tree, shed or fence within `look` metres (it swings left or right round them). `memo.swing`
   * remembers which way it last swung, so it doesn't dither. Written into `out`; null if it's boxed in.
   */
  clearHeading(x, z, ux, uz, pad, look, memo, out) {
    const blocked = (dx, dz) => {
      const px = x + dx * look, pz = z + dz * look;
      for (const c of this.colliders) {
        const ex = px - c.x, ez = pz - c.z, m = c.r + pad;
        // (only things ahead count: anything it's already brushing past is beside or behind)
        if (ex * ex + ez * ez < m * m && (c.x - x) * dx + (c.z - z) * dz > 0) return true;
      }
      // (fences and the like the same: up against one ahead, or along one it's running too close to)
      for (const s of this.segments) {
        if (!s.active) continue;
        const t = segT(px, pz, s), cx = s.ax + (s.bx - s.ax) * t, cz = s.az + (s.bz - s.az) * t;
        const ex = px - cx, ez = pz - cz, m = s.r + pad;
        if (ex * ex + ez * ez < m * m && (cx - x) * dx + (cz - z) * dz > 0) return true;
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

  /** fraction (0..1) along a->b where a throw first hits a wall (or goes out of a zone's open ground), or 1 if clear */
  throwClear(ax, az, bx, bz) {
    let best = 1;
    for (const s of this.segments) {
      if (!s.active || !s.blockThrow) continue;
      const t = segIntersect(ax, az, bx, bz, s.ax, s.az, s.bx, s.bz);
      if (t !== null && t < best) best = t;
    }
    // (nor over the bush's scrub, or a building)
    const n = Math.ceil((Math.hypot(bx - ax, bz - az) * best) / 0.4);
    for (let i = 1; i <= n; i++) {
      const x = ax + ((bx - ax) * best * i) / n, z = az + ((bz - az) * best * i) / n, tr = this.trackAt(z);
      if (tr && !tr.inside(x, z)) return (best * (i - 1)) / n;
    }
    return best;
  }

  /** can something at a see as far as b? (not through scrub, buildings or fences) */
  canSee(ax, az, bx, bz) {
    const za = this.zoneOf(az), tr = this.tracks[za];
    return !tr || za !== this.zoneOf(bz) || tr.clearLine(ax, az, bx, bz, false);
  }

  /**
   * Next point to walk to on the way from (fx,fz) to (tx,tz), going through gates between zones, and in
   * the bush, along the track. Returns null if the way is still fenced off (or barricaded).
   */
  route(fx, fz, tx, tz, out) {
    const zf = this.zoneOf(fz), zt = this.zoneOf(tz);
    if (zf !== zt) {
      const dir = zt > zf ? 1 : -1; // +1 = heading north (-z)
      const gate = this.gates[dir > 0 ? zf : zf - 1];
      if (!gate.open) return null;
      const nearGap = Math.abs(fx - gate.x) < gate.hw - 0.3 && Math.abs(fz - gate.z) < 1.6;
      if (nearGap) return out.set(gate.x, 0, gate.z - dir * 2.5);
      tx = gate.x;
      tz = gate.z + dir * 1.3;
    }
    const tr = this.tracks[zf];
    return tr ? tr.route(fx, fz, tx, tz, out) : out.set(tx, 0, tz);
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
    // (and buildings: any the line from the camera to the player passes through)
    for (const o of this.occluders) {
      const mat = segHitsBox(cam.x, cam.y, cam.z, target.x, target.y + 1, target.z, o.box) ? o.fade : o.solid;
      if (o.mesh.material !== mat) o.mesh.material = mat;
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
/** does the segment a->b pass through box (a Box3)? */
function segHitsBox(ax, ay, az, bx, by, bz, box) {
  let t0 = 0, t1 = 1;
  for (const [a, d, lo, hi] of [[ax, bx - ax, box.min.x, box.max.x], [ay, by - ay, box.min.y, box.max.y], [az, bz - az, box.min.z, box.max.z]]) {
    if (Math.abs(d) < 1e-9) { if (a < lo || a > hi) return false; continue; }
    let u = (lo - a) / d, v = (hi - a) / d;
    if (u > v) [u, v] = [v, u];
    t0 = Math.max(t0, u);
    t1 = Math.min(t1, v);
    if (t0 > t1) return false;
  }
  return true;
}

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
