import * as THREE from 'three';
import { vcMat, toonMat, clamp, smoothstep } from './util.js';
import { buildBush, BUSH_SOUTH, HOME, TRACK } from './props/bush.js';
import { Track } from './track.js';
import { buildSuburb, BACKYARDS } from './props/suburb.js';
import { buildOval, FIELD } from './props/oval.js';
import { buildBeach, beachGround, waterAt, shoreDir, seaWave, isSand } from './props/beach.js';
import { buildWharf, wharfGround, DECK } from './props/wharf.js';
import { buildHarbour } from './props/harbour.js';
import { buildCity, STREETS, quayGround } from './props/city.js';
import { buildOpera, operaGround, onSteps, OPERA_TRACK } from './props/opera.js';
import { buildHyde, hydeGround, HYDE_TRACK, HYDE_RECT, HYDE_GATE } from './props/hyde.js';
import { buildMilsons, milsonsGround, MILSONS_TRACK, LUNA_TRACK, MILSONS_RECT, LUNA_RECT, LUNA_GAP } from './props/milsons.js';

/*
 * The map runs the way the turkeys came, north to south: out of the bush, through the backyards and across
 * the oval (heading -z), to Manly Beach, where it turns right, south, along the sand (heading +x) to the
 * wharf, over the harbour on the ferry, and into the city. Each leg has its own way ahead (and the camera
 * swings round to face down the second one as you come out onto the beach). Round the end of the Quay, back
 * out along the water, is the Opera House: off the way on, and seen side on, looking down the first leg again.
 * Through the side of the King's court is Hyde Park, and at the far end of that, Museum station: the train
 * from there goes under the city and over the Bridge to Milsons Point, which is off on its own, well away from
 * the rest (there's no walking there: see Ride), with Luna Park round the corner from it.
 */
export const LEGS = [
  { yaw: 0, dir: [0, -1] },
  { yaw: -Math.PI / 2, dir: [1, 0] },
];
/** the areas, in order: what's in each ([x0, z0, x1, z1]: its bounds) and which leg it's on */
export const ZONES = [
  { name: 'The Bush', rect: [-46, -38, 46, BUSH_SOUTH], leg: 0 },
  { name: 'The Backyards', rect: [-46, -98, 46, -38], leg: 0 },
  { name: 'The Oval', rect: [-46, -178, 46, -98], leg: 0 },
  { name: 'Manly Beach', rect: [-46, -270, 70, -178], leg: 1 },
  { name: 'Manly Wharf', rect: [70, -244, 140, -184], leg: 1 },
  { name: 'The Manly Ferry', rect: [140, -242, 356, -178], leg: 1 }, // (bounds: wherever the deck's got to, see Ferry)
  { name: 'The City', rect: [356, -270, 502, -178], leg: 1 },
  { name: 'The Opera House', rect: [304, -290, 356, -242], leg: 0 },
  { name: 'Hyde Park', rect: HYDE_RECT, leg: 1 },
  { name: 'Milsons Point', rect: MILSONS_RECT, leg: 0 },
  { name: 'Luna Park', rect: LUNA_RECT, leg: 1 },
];
export const OVAL = 2, BEACH = 3, WHARF = 4, FERRY = 5, CITY = 6, OPERA = 7, HYDE = 8, MILSONS = 9, LUNA = 10;
/**
 * The fences between them, each with a gate in it at (x, z), going through which (along `d`) takes you on from
 * area `from` to area `to` (the next one along, unless it says). `span`: how far the fence runs either way along
 * its line (it's right across the area, by default). The ferry's two gangways (`ferry`) are only open while the
 * ferry's in at that end, and there's no padlock at all on the one at Circular Quay (`lock` false): the ferry keys
 * are for the wharf's. And round the end of the Quay, the way onto the Opera House's broadwalk is no gate at all,
 * just a gap in the railing (`gap`), as is the way round from Milsons Point into Luna Park
 */
export const FENCES = [
  { x: 6, z: -38, d: [0, -1], kind: 'wood' },
  { x: -8, z: -98, d: [0, -1], kind: 'wire' },
  { x: -16, z: -178, d: [0, -1], kind: 'rail' },
  { x: 70, z: -188, d: [1, 0], kind: 'rail', span: [-249, -175] },
  { x: 140, z: -224, d: [1, 0], kind: 'rail', span: [-246, -182], ferry: true },
  { x: 356, z: -224, d: [1, 0], kind: 'rail', span: [-245, -175], ferry: true, lock: false },
  { x: 356, z: -249.5, d: [-1, 0], kind: 'rail', hw: 4.5, span: [-273, -245], lock: false, gap: true },
  { ...HYDE_GATE, kind: 'rail', from: CITY, to: HYDE }, // (in a laneway out of the side of the King's court)
  { ...LUNA_GAP, kind: 'rail', lock: false, gap: true, from: MILSONS, to: LUNA },
];
const SUN = new THREE.Vector3(18, 40, 14); // (where the sun is from you, looking down the first leg)
const _v = new THREE.Vector3(), _k = new THREE.Vector3();

export class World {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.colliders = []; // circles {x, z, r}
    this.segments = []; // capsules {ax, az, bx, bz, r, active, blockThrow}
    this.treeSpots = []; // {x, z, h, palette}
    this.roosts = []; // low branches turkeys can roost on: {tree, x, z, perches, spot} (the toys pick these up)
    this.swayers = [];
    this.occluders = []; // buildings that go see-through when they're in the way of the camera
    this.gates = FENCES.map((f, i) => ({
      x: f.x, z: f.z, d: f.d, hw: f.hw ?? 2.6, kind: f.kind, ferry: !!f.ferry, lock: f.lock ?? true, gap: !!f.gap,
      span: f.span ?? (f.d[0] ? [-273, -175] : [-49, 49]), open: !!f.gap, unlocked: f.lock === false,
      from: f.from ?? i, to: f.to ?? i + 1,
    }));
    // (each area's gates, and which way through each is out of it: +1 along `d`, -1 back against it)
    this.links = ZONES.map((_, i) => this.gates.flatMap((g) => (g.from === i ? [[g, 1]] : g.to === i ? [[g, -1]] : [])));
    // (and the way from any area to any other: the gate out of the first to head for, or null if there's no way at all)
    this.hops = ZONES.map((_, i) => {
      const hop = ZONES.map(() => null), seen = new Set([i]), queue = [i];
      while (queue.length) {
        const z = queue.shift();
        for (const [g, s] of this.links[z]) {
          const next = s > 0 ? g.to : g.from;
          if (seen.has(next)) continue;
          seen.add(next);
          hop[next] = z === i ? [g, s] : hop[z];
          queue.push(next);
        }
      }
      return hop;
    });
    this.track = this.zoneTrack(0, TRACK); // the way through the bush (the scrub either side of it is impassable)
    // each zone's lie of the land (where there's any to speak of: the beach is wide open, and the ferry's all deck)
    this.tracks = [
      this.track, this.zoneTrack(1, BACKYARDS), this.zoneTrack(2, FIELD), null, null, null, this.zoneTrack(CITY, STREETS), this.zoneTrack(OPERA, OPERA_TRACK),
      this.zoneTrack(HYDE, HYDE_TRACK), this.zoneTrack(MILSONS, MILSONS_TRACK), this.zoneTrack(LUNA, LUNA_TRACK),
    ];

    this.buildSky();
    this.buildLights();
    this.buildGround();
    buildBush(this);
    buildSuburb(this);
    this.oval = buildOval(this); // (its stands, for turkeys to sit in: see main.js)
    this.beach = buildBeach(this);
    this.wharf = buildWharf(this);
    this.harbour = buildHarbour(this);
    this.city = buildCity(this);
    this.opera = buildOpera(this); // (and Benny's steps, for turkeys to lie about on: see main.js)
    this.hyde = buildHyde(this); // (the fountain and the statues, for turkeys to wash in and sit on, and Museum station)
    this.milsons = buildMilsons(this); // (Milsons Point station, and Luna Park round the corner)
  }

  /** zone i's track (see Track), with room to get through the gates in and out of it */
  zoneTrack(i, spec) {
    if (!spec.rooms) spec = Track.fromPaths(spec);
    const rooms = [...spec.rooms];
    for (const [g] of this.links[i]) {
      // (3 m either side of it, and the width of the gateway: along x for a fence across the first leg, z the second)
      const ex = g.d[0] ? 3 : g.hw + 0.5, ez = g.d[0] ? g.hw + 0.5 : 3;
      rooms.push({ rect: [g.x - ex, g.z - ez, g.x + ex, g.z + ez], ground: 'dirt' });
    }
    return new Track({ ...spec, rooms });
  }

  /** which area (x, z) is in (anywhere off the map counts as in the nearest one) */
  zoneOf(x, z) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < ZONES.length; i++) {
      const [x0, z0, x1, z1] = ZONES[i].rect;
      // (the line between one area and the next belongs to the one further on)
      if (ZONES[i].leg ? x >= x0 && x < x1 && z >= z0 && z <= z1 : x >= x0 && x <= x1 && z > z0 && z <= z1) return i;
      const d = Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1));
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  /** how far (x, z) is into area i (negative: outside it) */
  depthIn(i, x, z) {
    const [x0, z0, x1, z1] = ZONES[i].rect;
    return Math.min(x - x0, x1 - x, z - z0, z1 - z);
  }

  /** what keeps everything in area i: its rect (the ferry's is its deck, wherever that's got to) */
  boundsOf(i) {
    return i === FERRY && this.game.ferry ? this.game.ferry.bounds : ZONES[i].rect;
  }

  groundHeight(x, z) {
    const zone = this.zoneOf(x, z);
    if (zone === BEACH) return beachGround(x, z);
    if (zone === WHARF) return wharfGround(x, z);
    if (zone === FERRY) return this.game.ferry ? this.game.ferry.groundAt(x, z) : DECK;
    if (zone === CITY) return quayGround(x, z);
    if (zone === OPERA) return operaGround(x, z);
    if (zone === HYDE) return hydeGround(x, z);
    if (zone === MILSONS || zone === LUNA) return milsonsGround(x, z);
    return this.bushHeight(x, z);
  }

  /** the lie of the land down the first leg: bumpy bush that flattens out towards the suburbs, rising into a rim at the edges */
  bushHeight(x, z) {
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
    this.hemi = new THREE.HemisphereLight(0xdff0ff, 0x6e5a3a, 1.6); // (it goes dark in a storm: see Storm)
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xfff0d0, 2.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = sun.shadow.camera;
    s.left = -28; s.right = 28; s.top = 28; s.bottom = -28; s.near = 1; s.far = 110;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun, sun.target);
    this.sun = sun;
    this.sunOffset = new THREE.Vector3();
    this.setSunYaw(0);
  }

  /**
   * Round the corner, the sun comes round with you: `yaw` is how far round (the way the camera looks down the
   * leg you're on), so it's always over the same shoulder, lighting up the side of things you're looking at
   */
  setSunYaw(yaw) {
    if (this.sunYaw === yaw) return;
    this.sunYaw = yaw;
    this.sunOffset.copy(SUN).applyAxisAngle(_v.set(0, 1, 0), yaw);
    // (which ways are across and up on the sun's shadow map, and how big one of its squares is: see followSun)
    const s = this.sun.shadow.camera, fwd = this.sunOffset.clone().normalize(), across = new THREE.Vector3(0, 1, 0).cross(fwd).normalize();
    this.sunGrid = { axes: [across, fwd.cross(across)], step: (s.right - s.left) / this.sun.shadow.mapSize.x };
  }

  /** keep the sun (and its shadows) over the player, and the sky round him */
  followSun(p) {
    // (the shadow map only ever moves a whole square of itself at a time: slide it along smoothly and the jaggy edge
    // of every shadow crawls as you walk, which on a face the sun only grazes, like the King's skip, flickers like z-fighting)
    const { axes, step } = this.sunGrid;
    _v.copy(p);
    for (const a of axes) {
      const d = _v.dot(a);
      _v.addScaledVector(a, Math.round(d / step) * step - d);
    }
    this.sun.position.copy(_v).add(this.sunOffset);
    this.sun.target.position.copy(_v);
    this.sky.position.set(p.x, 0, p.z);
  }

  buildGround() {
    const W = 280, D = 338, cz = -9; // down the first leg, to the oval's far fence (round the corner, each place has its own)
    const g = new THREE.PlaneGeometry(W, D, 140, 169);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, cz);
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const grassA = new THREE.Color(0x7fae4f), grassB = new THREE.Color(0x96b95a), dirt = new THREE.Color(0x9c7a4f);
    const dry = new THREE.Color(0xb7ad6a), lawn = new THREE.Color(0x86bd52), concrete = new THREE.Color(0xa9a79f), oval = new THREE.Color(0x74b548), c = new THREE.Color();
    const track = new THREE.Color(0xa48558), mould = new THREE.Color(0x4d5a2f);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, this.bushHeight(x, z));
      const zone = Math.min(2, this.zoneOf(x, z));
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
      } else if (x < -47 || x > 47) {
        c.copy(concrete); // (off either side of the oval, round the back of the beach's buildings)
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
  /** somewhere turkeys can't help but lie down in the sun: the sand at the beach, and the steps down to Benny */
  sunTrap(x, z) { return isSand(x, z) || (this.zoneOf(x, z) === OPERA && onSteps(x, z)); }

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

  /** the lie of the land in the zone at (x, z) (null where it's all open ground) */
  trackAt(x, z) { return this.tracks[this.zoneOf(x, z)] ?? null; }

  /**
   * Keep p (radius r) in the area it's in: off its edges, bar along a fence into the area before or after it (the
   * fence sees to it there, and lets you through its gate). The ferry's ends are only open while she's in at them
   */
  keepIn(p, r) {
    const i = this.zoneOf(p.x, p.z), ferry = i === FERRY ? this.game.ferry : null;
    let [x0, z0, x1, z1] = this.boundsOf(i);
    for (const [g, s] of this.links[i]) {
      if (ferry && ferry.docked !== (s < 0 ? 'wharf' : 'quay')) continue;
      const along = g.d[0] ? p.z : p.x;
      if (along < g.span[0] || along > g.span[1]) continue;
      // (the side facing the gate: s is +1 for the way on out of it, -1 for the way back in)
      const dx = g.d[0] * s, dz = g.d[1] * s;
      if (dx > 0) x1 = Infinity; else if (dx < 0) x0 = -Infinity;
      if (dz > 0) z1 = Infinity; else if (dz < 0) z0 = -Infinity;
    }
    const x = clamp(p.x, x0 + r, x1 - r), z = clamp(p.z, z0 + r, z1 - r);
    if (x === p.x && z === p.z) return false;
    if (ferry) {
      // (off her deck, out over the water: back onto whichever's nearest, her deck or the wharf or the Quay, not
      // onto her wherever she's got to)
      const [h0, , h1] = ZONES[FERRY].rect, shore = p.x - h0 < h1 - p.x ? h0 - r : h1 + r;
      if (Math.abs(shore - p.x) < Math.abs(x - p.x)) { p.x = shore; return true; }
    }
    p.x = x;
    p.z = z;
    return true;
  }

  isFree(x, z, r = 0.5) {
    if (this.keepIn(_k.set(x, 0, z), r)) return false;
    const tr = this.trackAt(x, z);
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
    if (this.keepIn(p, r)) hit = true;
    // (nothing gets out of a zone's open ground: into the bush's scrub, say, or a building)
    const tr = this.trackAt(p.x, p.z);
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
      const x = ax + ((bx - ax) * best * i) / n, z = az + ((bz - az) * best * i) / n, tr = this.trackAt(x, z);
      if (tr && !tr.inside(x, z)) return (best * (i - 1)) / n;
    }
    return best;
  }

  /** can something at a see as far as b? (not through scrub, buildings or fences) */
  canSee(ax, az, bx, bz) {
    const za = this.zoneOf(ax, az), tr = this.tracks[za];
    return !tr || za !== this.zoneOf(bx, bz) || tr.clearLine(ax, az, bx, bz, false);
  }

  /**
   * Next point to walk to on the way from (fx,fz) to (tx,tz), going through gates between zones, and in
   * the bush, along the track. Returns null if the way is still fenced off (or barricaded), or there's no way
   * there on foot at all (Milsons Point's over the harbour). `ferry`: count the harbour as crossed, if the ferry's
   * running at all (it comes to whichever side you're on), bar past the giant cuttlefish, till it's been seen off
   * (see Cuttle.bars)
   */
  route(fx, fz, tx, tz, out, ferry = false) {
    const zf = this.zoneOf(fx, fz), zt = this.zoneOf(tx, tz);
    if (zf !== zt) {
      const hop = this.hops[zf][zt];
      if (!hop) return null;
      const [gate, s] = hop; // (s: +1 on through it the way it goes, -1 back the way you came)
      if (!gate.open && !(ferry && gate.ferry && this.gates[WHARF].unlocked && !this.game.cuttle?.bars(gate))) return null;
      const [dx, dz] = gate.d, rx = fx - gate.x, rz = fz - gate.z;
      const nearGap = Math.abs(rz * dx - rx * dz) < gate.hw - 0.3 && Math.abs(rx * dx + rz * dz) < 1.6;
      if (nearGap) return out.set(gate.x + dx * s * 2.5, 0, gate.z + dz * s * 2.5);
      tx = gate.x - dx * s * 1.3;
      tz = gate.z - dz * s * 1.3;
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

  /** every tree and building back solid and in sight (for a look down on the lot from high above: see TravelMap) */
  unfade() {
    for (const s of this.swayers) {
      s.m.material = vcMat();
      s.m.visible = true;
    }
    for (const o of this.occluders) o.mesh.material = o.solid;
  }

  update(dt, t) {
    this.beach.update(dt, t);
    this.wharf.update(dt, t);
    this.harbour.update(dt, t);
    this.city.update(dt, t);
    this.opera.update(dt, t);
    this.hyde.update(dt, t);
    this.milsons.update(dt, t);
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
