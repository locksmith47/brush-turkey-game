/*
 * The lie of the land in a zone: where you can get to, and how to get from anywhere to anywhere else.
 *
 * Rooms are the open ground (circles, capsules and rectangles; anything outside them all is off limits,
 * like the scrub in the bush or the buildings in the city), and walls (segments: fences, barricades) cut
 * across them. Waypoints sit in the rooms: from anywhere in a room you can walk straight to any of its
 * waypoints (unless there's a wall in the way), and a waypoint on the border of two rooms (a doorway) joins
 * them up. Everything on the ground is kept inside the rooms, and the way from one place to another goes
 * from waypoint to waypoint, cutting the corners wherever it can.
 *
 * A wall can be just a guide (`guide: true`), there to keep the way through a gateway to the middle of it
 * (a key and its carriers need the room): it only counts for the long way round, never for a step or two,
 * or for seeing past.
 */
const STEP = 0.8; // how finely a straight line gets checked for staying in the rooms
const SEE = 0.25; // how far in from the edge a clear line has to keep
const CELL = 4; // (the lookup grid: each cell lists the rooms that reach into it)
const GUIDED = 5; // (guide walls only count for lines longer than this)
const _t = { x: 0, z: 0, set(x, y, z) { this.x = x; this.z = z; return this; } };

function segT(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz;
  return l2 ? Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / l2)) : 0;
}

/** fraction along a->b where it crosses c->d, or null */
function crossAt(ax, az, bx, bz, cx, cz, dx, dz) {
  const rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz;
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * sz - (cz - az) * sx) / den;
  const u = ((cx - ax) * rz - (cz - az) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

/** how far (x, z) is inside room s (negative) or outside it (positive) */
function depth(s, x, z) {
  if (s.kind === 'circle') return Math.hypot(x - s.x, z - s.z) - s.r;
  if (s.kind === 'rect') {
    const dx = Math.max(s.x0 - x, x - s.x1), dz = Math.max(s.z0 - z, z - s.z1);
    return dx <= 0 && dz <= 0 ? Math.max(dx, dz) : Math.hypot(Math.max(dx, 0), Math.max(dz, 0));
  }
  const t = segT(x, z, s.ax, s.az, s.bx, s.bz);
  return Math.hypot(x - (s.ax + (s.bx - s.ax) * t), z - (s.az + (s.bz - s.az) * t)) - s.r;
}

/** the nearest point to (x, z) at least r inside room s, into out; false if r won't fit */
function inward(s, x, z, r, out) {
  if (s.kind === 'rect') {
    if (s.x1 - s.x0 < 2 * r || s.z1 - s.z0 < 2 * r) return false;
    out.x = Math.max(s.x0 + r, Math.min(s.x1 - r, x));
    out.z = Math.max(s.z0 + r, Math.min(s.z1 - r, z));
    return true;
  }
  const room = s.r - r;
  if (room <= 0) return false;
  let cx = s.x, cz = s.z;
  if (s.kind === 'capsule') {
    const t = segT(x, z, s.ax, s.az, s.bx, s.bz);
    cx = s.ax + (s.bx - s.ax) * t;
    cz = s.az + (s.bz - s.az) * t;
  }
  const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz);
  if (d <= room) { out.x = x; out.z = z; return true; }
  out.x = cx + (dx / d) * room;
  out.z = cz + (dz / d) * room;
  return true;
}

export class Track {
  /**
   * `nodes`: the waypoints, { name: [x, z] }. `rooms`: [{ rect: [x0, z0, x1, z1] } | { circle: [x, z, r] } |
   * { capsule: [ax, az, bx, bz, r] }, with `nodes` (the names of the waypoints in it) and `ground`].
   * `keepClear`: waypoints to keep things (like new mounds) off, for the paths through them. The bush's
   * `{ clearings, paths, width }` works too (see fromPaths)
   */
  constructor(spec) {
    if (!spec.rooms) spec = Track.fromPaths(spec);
    this.width = spec.width ?? 0;
    this.names = Object.keys(spec.nodes);
    this.byName = {};
    this.nodes = this.names.map((name, i) => {
      this.byName[name] = i;
      const [x, z] = spec.nodes[name];
      return { x, z, name, r: spec.clearings?.[name]?.[2] ?? 0, keepClear: spec.keepClear?.includes(name) ?? true };
    });
    this.paths = spec.paths ?? [];
    this.rooms = spec.rooms.map((r) => {
      const s = r.rect ? { kind: 'rect', x0: r.rect[0], z0: r.rect[1], x1: r.rect[2], z1: r.rect[3] }
        : r.circle ? { kind: 'circle', x: r.circle[0], z: r.circle[1], r: r.circle[2] }
          : { kind: 'capsule', ax: r.capsule[0], az: r.capsule[1], bx: r.capsule[2], bz: r.capsule[3], r: r.capsule[4] };
      s.nodes = (r.nodes ?? []).map((n) => this.byName[n]);
      s.ground = r.ground ?? 'grass';
      s.box = s.kind === 'rect' ? [s.x0, s.z0, s.x1, s.z1]
        : s.kind === 'circle' ? [s.x - s.r, s.z - s.r, s.x + s.r, s.z + s.r]
          : [Math.min(s.ax, s.bx) - s.r, Math.min(s.az, s.bz) - s.r, Math.max(s.ax, s.bx) + s.r, Math.max(s.az, s.bz) + s.r];
      return s;
    });
    // (the waypoints joined up: any two that share a room, as long as no wall's in the way)
    const seen = new Set();
    this.links = [];
    for (const s of this.rooms) {
      for (let i = 0; i < s.nodes.length; i++) {
        for (let j = i + 1; j < s.nodes.length; j++) {
          const a = Math.min(s.nodes[i], s.nodes[j]), b = Math.max(s.nodes[i], s.nodes[j]), k = a * 4096 + b;
          if (a === b || seen.has(k)) continue;
          seen.add(k);
          this.links.push({ a, b, len: Math.hypot(this.nodes[b].x - this.nodes[a].x, this.nodes[b].z - this.nodes[a].z) });
        }
      }
    }
    this.grid = new Map();
    for (const s of this.rooms) {
      for (let ix = Math.floor(s.box[0] / CELL); ix <= Math.floor(s.box[2] / CELL); ix++) {
        for (let iz = Math.floor(s.box[1] / CELL); iz <= Math.floor(s.box[3] / CELL); iz++) {
          const k = ix * 10007 + iz;
          if (!this.grid.has(k)) this.grid.set(k, []);
          this.grid.get(k).push(s);
        }
      }
    }
    this.walls = []; // fences, barricades, gates (world segments): no seeing or going through one that's up
    this.plan();
  }

  /**
   * The bush's layout: clearings ({ name: [x, z, radius, ground] }) joined by paths ([from, ...bends
   * ([x, z]), to]), `width` being half the width of a path. Each clearing is a room with a waypoint in the
   * middle, each bend a round room of its own, each stretch of path a room joining the two
   */
  static fromPaths({ clearings, paths, width }) {
    const nodes = {}, rooms = [];
    for (const [name, [x, z, r, ground]] of Object.entries(clearings)) {
      nodes[name] = [x, z];
      rooms.push({ circle: [x, z, r], nodes: [name], ground });
    }
    let bends = 0;
    const named = paths.map((p) => p.map((q) => {
      if (typeof q === 'string') return q;
      const name = `bend${bends++}`;
      nodes[name] = q;
      rooms.push({ circle: [q[0], q[1], width], nodes: [name], ground: 'dirt' });
      return name;
    }));
    for (const p of named) {
      for (let i = 1; i < p.length; i++) {
        const [ax, az] = nodes[p[i - 1]], [bx, bz] = nodes[p[i]];
        rooms.push({ capsule: [ax, az, bx, bz, width], nodes: [p[i - 1], p[i]], ground: 'dirt' });
      }
    }
    // (the clearings themselves are where new mounds belong; it's the bends in the paths to keep clear)
    return { nodes, rooms, width, clearings, keepClear: Object.keys(nodes).filter((n) => !clearings[n]), paths: named.map((p) => ({ from: p[0], to: p[p.length - 1], nodes: p })) };
  }

  node(name) { return this.nodes[this.byName[name]]; }

  /** the first stretch of the path from clearing `from` to clearing `to`: { a, b, len } (waypoint indices) */
  firstEdge(from, to) {
    const p = this.paths.find((q) => q.from === from && q.to === to);
    if (!p) return null;
    const a = this.byName[p.nodes[0]], b = this.byName[p.nodes[1]];
    return { a, b, len: Math.hypot(this.nodes[b].x - this.nodes[a].x, this.nodes[b].z - this.nodes[a].z) };
  }

  /** shortest ways between every pair of waypoints (around whatever walls are up): distances, and where to head next */
  plan() {
    const n = this.nodes.length;
    const D = (this.D = Array.from({ length: n }, () => new Float64Array(n).fill(Infinity)));
    const N = (this.next = Array.from({ length: n }, () => new Int16Array(n).fill(-1)));
    for (let i = 0; i < n; i++) { D[i][i] = 0; N[i][i] = i; }
    for (const l of this.links) {
      const a = this.nodes[l.a], b = this.nodes[l.b];
      if (this.walled(a.x, a.z, b.x, b.z)) continue;
      D[l.a][l.b] = D[l.b][l.a] = l.len;
      N[l.a][l.b] = l.b;
      N[l.b][l.a] = l.a;
    }
    for (let k = 0; k < n; k++) {
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (D[i][k] + D[k][j] < D[i][j]) { D[i][j] = D[i][k] + D[k][j]; N[i][j] = N[i][k]; }
        }
      }
    }
  }

  /** a wall (a world segment) across the way: no seeing past it or going through it while it's active */
  addWall(seg, replan = true) {
    this.walls.push(seg);
    if (replan) this.plan();
  }

  near(x, z) { return this.grid.get(Math.floor(x / CELL) * 10007 + Math.floor(z / CELL)) ?? []; }

  /** how far (x, z) is inside the rooms (negative) or out of them (positive) */
  depth(x, z) {
    let d = Infinity;
    for (const s of this.rooms) d = Math.min(d, depth(s, x, z));
    return d;
  }

  /** how much the ground at (x, z) is bare earth (0..1): paths and dirt rooms are, grassy ones aren't */
  dirt(x, z) {
    let d = Infinity, g = Infinity;
    for (const s of this.rooms) {
      if (s.ground === 'grass') g = Math.min(g, depth(s, x, z));
      else d = Math.min(d, depth(s, x, z));
    }
    const ss = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
    // (fading out at the edges, and as a path comes into a grassy clearing, down to a faint trodden trail)
    return (1 - ss(-1.2, 0.8, d)) * (1 - 0.85 * (1 - ss(-4, 0, g)));
  }

  /** is (x, z) in the rooms, with `margin` to spare? */
  inside(x, z, margin = 0) {
    for (const s of this.near(x, z)) if (depth(s, x, z) <= -margin) return true;
    return false;
  }

  /** push p (something `r` round) back into the rooms if it's strayed out; true if it moved */
  clamp(p, r = 0) {
    if (this.inside(p.x, p.z, r)) return false;
    let best = Infinity, bx = 0, bz = 0;
    for (const s of this.rooms) {
      if (!inward(s, p.x, p.z, r, _t)) continue;
      const d = Math.hypot(_t.x - p.x, _t.z - p.z);
      if (d < best) { best = d; bx = _t.x; bz = _t.z; }
    }
    if (best === Infinity) return false;
    p.x = bx;
    p.z = bz;
    return true;
  }

  /** is (x, z) within d of a waypoint the paths go through (somewhere to keep clear)? */
  keepClear(x, z, d) {
    return this.nodes.some((n) => n.keepClear && Math.hypot(n.x - x, n.z - z) < d);
  }

  /** is (x, z) within d of a wall that's up (a fence, say; not counting guides)? */
  nearWall(x, z, d) {
    for (const w of this.walls) {
      if (!w.active || w.guide) continue;
      const t = segT(x, z, w.ax, w.az, w.bx, w.bz);
      if (Math.hypot(x - (w.ax + (w.bx - w.ax) * t), z - (w.az + (w.bz - w.az) * t)) < d) return true;
    }
    return false;
  }

  /** does a->b run into a wall that's up? (`guides`: counting the guide walls, which only matter for the long way) */
  walled(ax, az, bx, bz, guides = Math.hypot(bx - ax, bz - az) > GUIDED) {
    const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), z0 = Math.min(az, bz), z1 = Math.max(az, bz);
    for (const w of this.walls) {
      if (!w.active || (w.guide && !guides)) continue;
      if (Math.max(w.ax, w.bx) < x0 || Math.min(w.ax, w.bx) > x1 || Math.max(w.az, w.bz) < z0 || Math.min(w.az, w.bz) > z1) continue;
      if (crossAt(ax, az, bx, bz, w.ax, w.az, w.bx, w.bz) !== null) return true;
    }
    return false;
  }

  /** can you get straight from a to b without leaving the rooms (or going through a wall)? (`guides`: see walled) */
  clearLine(ax, az, bx, bz, guides) {
    if (this.walled(ax, az, bx, bz, guides)) return false;
    // (both in the same room: nothing in between)
    for (const s of this.near(ax, az)) if (depth(s, ax, az) <= -SEE && depth(s, bx, bz) <= -SEE) return true;
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / STEP);
    for (let i = 1; i < n; i++) if (!this.inside(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n, SEE)) return false;
    return true;
  }

  /** the waypoints you could walk straight to from (x, z): those of the rooms it's in (or the nearest room) */
  ends(x, z) {
    const out = [];
    for (const s of this.near(x, z)) if (depth(s, x, z) <= 0) for (const n of s.nodes) if (!out.includes(n)) out.push(n);
    if (!out.length) {
      let best = null, bd = Infinity;
      for (const s of this.rooms) { const d = depth(s, x, z); if (d < bd && s.nodes.length) { bd = d; best = s; } }
      if (best) out.push(...best.nodes);
    }
    return out;
  }

  /**
   * Next point to head for on the way from (fx, fz) to (tx, tz): straight there if nothing's in the way,
   * otherwise the furthest waypoint along the way that's in plain sight. Null if there's no way through.
   */
  route(fx, fz, tx, tz, out) {
    // (aiming for somewhere off in the scrub, or inside a building: then it's the nearest bit of open ground to it)
    if (!this.inside(tx, tz, SEE)) {
      this.clamp(_t.set(tx, 0, tz), SEE + 0.05);
      if (this.clearLine(fx, fz, _t.x, _t.z)) return out.set(tx, 0, tz);
      tx = _t.x;
      tz = _t.z;
    } else if (this.clearLine(fx, fz, tx, tz)) return out.set(tx, 0, tz);
    const starts = this.ends(fx, fz).filter((s) => !this.walled(fx, fz, this.nodes[s].x, this.nodes[s].z));
    const goals = this.ends(tx, tz).filter((e) => !this.walled(this.nodes[e].x, this.nodes[e].z, tx, tz));
    let best = Infinity, from = -1, to = -1;
    for (const s of starts) {
      const a = this.nodes[s], da = Math.hypot(a.x - fx, a.z - fz);
      for (const e of goals) {
        const b = this.nodes[e], c = da + this.D[s][e] + Math.hypot(tx - b.x, tz - b.z);
        if (c < best) { best = c; from = s; to = e; }
      }
    }
    if (from < 0) return null;
    let at = from;
    for (let n = from; n !== to;) {
      n = this.next[n][to];
      if (!this.clearLine(fx, fz, this.nodes[n].x, this.nodes[n].z)) break;
      at = n;
    }
    return out.set(this.nodes[at].x, 0, this.nodes[at].z);
  }
}
