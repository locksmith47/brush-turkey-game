/*
 * The track through the bush: clearings joined by paths, with scrub everywhere else too thick for
 * anything to get through. Everything on the ground in the bush is kept on it, and it finds the way along
 * it: round the bends, and never past a barricade that's still up.
 *
 * Clearings (and the bends in the paths) are circles, each stretch of path a capsule between two of them.
 */
const STEP = 0.8; // how finely a straight line gets checked for staying on the track
const SEE = 0.25; // how far in from the edge a clear line has to keep
const CELL = 4; // (the lookup grid: each cell lists the shapes that reach into it)
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

/** how far (x, z) is inside shape s (negative) or outside it (positive) */
function depth(s, x, z) {
  if (s.node !== undefined) return Math.hypot(x - s.x, z - s.z) - s.r;
  const t = segT(x, z, s.ax, s.az, s.bx, s.bz);
  return Math.hypot(x - (s.ax + (s.bx - s.ax) * t), z - (s.az + (s.bz - s.az) * t)) - s.r;
}

export class Track {
  /**
   * `clearings`: { name: [x, z, radius, ground] }; `paths`: [from, ...bends ([x, z]), to] (names);
   * `width`: half the width of a path. Ground is 'grass' or 'dirt' (paths and bends are dirt)
   */
  constructor({ clearings, paths, width }) {
    this.width = width;
    this.nodes = [];
    this.byName = {};
    for (const [name, [x, z, r, ground]] of Object.entries(clearings)) {
      this.byName[name] = this.nodes.length;
      this.nodes.push({ x, z, r, ground, name });
    }
    this.edges = [];
    this.paths = paths.map((p) => {
      const ids = p.map((q) => (typeof q === 'string' ? this.byName[q] : this.nodes.push({ x: q[0], z: q[1], r: width, ground: 'dirt' }) - 1));
      const edges = [];
      for (let i = 1; i < ids.length; i++) {
        const a = this.nodes[ids[i - 1]], b = this.nodes[ids[i]];
        edges.push(this.edges.push({ a: ids[i - 1], b: ids[i], len: Math.hypot(b.x - a.x, b.z - a.z), blocked: false }) - 1);
      }
      return { from: p[0], to: p[p.length - 1], edges };
    });
    this.shapes = [
      ...this.nodes.map((n, i) => ({ node: i, x: n.x, z: n.z, r: n.r, ground: n.ground })),
      ...this.edges.map((e, i) => {
        const a = this.nodes[e.a], b = this.nodes[e.b];
        return { edge: i, a: e.a, b: e.b, ax: a.x, az: a.z, bx: b.x, bz: b.z, r: width, ground: 'dirt' };
      }),
    ];
    this.grid = new Map();
    for (const s of this.shapes) {
      const x0 = Math.min(s.ax ?? s.x, s.bx ?? s.x) - s.r, x1 = Math.max(s.ax ?? s.x, s.bx ?? s.x) + s.r;
      const z0 = Math.min(s.az ?? s.z, s.bz ?? s.z) - s.r, z1 = Math.max(s.az ?? s.z, s.bz ?? s.z) + s.r;
      for (let ix = Math.floor(x0 / CELL); ix <= Math.floor(x1 / CELL); ix++) {
        for (let iz = Math.floor(z0 / CELL); iz <= Math.floor(z1 / CELL); iz++) {
          const k = ix * 10007 + iz;
          if (!this.grid.has(k)) this.grid.set(k, []);
          this.grid.get(k).push(s);
        }
      }
    }
    this.walls = []; // barricades across the paths (world segments): nothing sees or goes past one that's up
    this.plan();
  }

  node(name) { return this.nodes[this.byName[name]]; }

  /** the stretch of the path from clearing `from` to clearing `to` that leaves `from` */
  firstEdge(from, to) {
    const p = this.paths.find((q) => q.from === from && q.to === to);
    return p && this.edges[p.edges[0]];
  }

  /** shortest ways between every pair of stops: distances, and which stop to head for next */
  plan() {
    const n = this.nodes.length;
    const D = (this.D = Array.from({ length: n }, () => new Float64Array(n).fill(Infinity)));
    const N = (this.next = Array.from({ length: n }, () => new Int16Array(n).fill(-1)));
    for (let i = 0; i < n; i++) { D[i][i] = 0; N[i][i] = i; }
    for (const e of this.edges) {
      if (e.blocked) continue;
      D[e.a][e.b] = D[e.b][e.a] = e.len;
      N[e.a][e.b] = e.b;
      N[e.b][e.a] = e.a;
    }
    for (let k = 0; k < n; k++) {
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (D[i][k] + D[k][j] < D[i][j]) { D[i][j] = D[i][k] + D[k][j]; N[i][j] = N[i][k]; }
        }
      }
    }
  }

  /** put a barricade (a world segment) across edge `e`: the way past it is shut until it's opened */
  block(e, seg) {
    e.blocked = true;
    e.wall = seg;
    this.walls.push(seg);
    this.plan();
  }

  unblock(e) {
    e.blocked = false;
    this.plan();
  }

  near(x, z) { return this.grid.get(Math.floor(x / CELL) * 10007 + Math.floor(z / CELL)) ?? []; }

  /** how far (x, z) is inside the track (negative) or out in the scrub (positive) */
  depth(x, z) {
    let d = Infinity;
    for (const s of this.shapes) d = Math.min(d, depth(s, x, z));
    return d;
  }

  /** how much the ground at (x, z) is bare earth (0..1): the paths and most clearings are, the grassy ones aren't */
  dirt(x, z) {
    let d = Infinity, g = Infinity;
    for (const s of this.shapes) {
      if (s.ground === 'grass') g = Math.min(g, depth(s, x, z));
      else d = Math.min(d, depth(s, x, z));
    }
    const ss = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
    // (fading out at the edges, and as a path comes into a grassy clearing, down to a faint trodden trail)
    return (1 - ss(-1.2, 0.8, d)) * (1 - 0.85 * (1 - ss(-4, 0, g)));
  }

  /** is (x, z) on the track, with `margin` to spare? */
  inside(x, z, margin = 0) {
    for (const s of this.near(x, z)) if (depth(s, x, z) <= -margin) return true;
    return false;
  }

  /** push p (something `r` round) back onto the track if it's strayed off; true if it moved */
  clamp(p, r = 0) {
    if (this.inside(p.x, p.z, r)) return false;
    let best = Infinity, bx = 0, bz = 0;
    for (const s of this.shapes) {
      const room = s.r - r;
      if (room <= 0) continue;
      let cx = s.x, cz = s.z;
      if (s.node === undefined) {
        const t = segT(p.x, p.z, s.ax, s.az, s.bx, s.bz);
        cx = s.ax + (s.bx - s.ax) * t;
        cz = s.az + (s.bz - s.az) * t;
      }
      const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz) || 1e-6;
      const out = d - room;
      if (out < best) { best = out; bx = cx + (dx / d) * room; bz = cz + (dz / d) * room; }
    }
    if (best === Infinity) return false;
    p.x = bx;
    p.z = bz;
    return true;
  }

  /** does a->b run into a barricade that's up? */
  walled(ax, az, bx, bz) {
    for (const w of this.walls) if (w.active && crossAt(ax, az, bx, bz, w.ax, w.az, w.bx, w.bz) !== null) return true;
    return false;
  }

  /** can you get straight from a to b without going into the scrub (or through a barricade)? */
  clearLine(ax, az, bx, bz) {
    if (this.walled(ax, az, bx, bz)) return false;
    // (both in the same clearing, or on the same stretch of path: nothing in between)
    for (const s of this.near(ax, az)) if (depth(s, ax, az) <= -SEE && depth(s, bx, bz) <= -SEE) return true;
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / STEP);
    for (let i = 1; i < n; i++) if (!this.inside(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n, SEE)) return false;
    return true;
  }

  /** how far along a->b it first goes off the track (0..1), or 1 if it never does (anywhere north of zMin doesn't count) */
  exitAlong(ax, az, bx, bz, zMin) {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / (STEP / 2));
    for (let i = 1; i <= n; i++) {
      const k = i / n, x = ax + (bx - ax) * k, z = az + (bz - az) * k;
      if (z > zMin && !this.inside(x, z)) return (i - 1) / n;
    }
    return 1;
  }

  /** the stops either end of where (x, z) is: the clearing (or bend) it's in, or both ends of its stretch of path */
  ends(x, z) {
    let best = null, bd = Infinity;
    for (const s of this.near(x, z)) {
      const d = depth(s, x, z);
      if (d < bd) { bd = d; best = s; }
    }
    if (!best) for (const s of this.shapes) { const d = depth(s, x, z); if (d < bd) { bd = d; best = s; } }
    return best.node !== undefined ? [best.node] : [best.a, best.b];
  }

  /**
   * Next point to head for on the way from (fx, fz) to (tx, tz): straight there if nothing's in the way,
   * otherwise the furthest stop along the way that's in plain sight. Null if there's no way through.
   */
  route(fx, fz, tx, tz, out) {
    // (aiming for somewhere off in the scrub: then it's the nearest bit of track to it it wants)
    if (!this.inside(tx, tz, SEE)) {
      this.clamp(_t.set(tx, 0, tz), SEE + 0.05);
      if (this.clearLine(fx, fz, _t.x, _t.z)) return out.set(tx, 0, tz);
      tx = _t.x;
      tz = _t.z;
    } else if (this.clearLine(fx, fz, tx, tz)) return out.set(tx, 0, tz);
    let best = Infinity, from = -1, to = -1;
    for (const s of this.ends(fx, fz)) {
      const a = this.nodes[s];
      if (this.walled(fx, fz, a.x, a.z)) continue;
      const da = Math.hypot(a.x - fx, a.z - fz);
      for (const e of this.ends(tx, tz)) {
        const b = this.nodes[e];
        if (this.walled(b.x, b.z, tx, tz)) continue;
        const c = da + this.D[s][e] + Math.hypot(tx - b.x, tz - b.z);
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
