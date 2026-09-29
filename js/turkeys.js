import * as THREE from 'three';
import { Turkey, S } from './turkey.js';
import { STAGES } from './turkeyModel.js';
import { SpatialHash, damp, clamp, rand, TAU } from './util.js';
import { FERRY } from './world.js';

export const MAX_TURKEYS = 100;
const _v = new THREE.Vector3();

/* Owns every turkey: squad logic, throwing, whistling, plucking and personal space. */
export class Turkeys {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.rally = new THREE.Vector3();
    this.blobR = 1;
    this.hash = new SpatialHash(1.0);
    this.nbrs = [];
    this.preferred = 'normal'; // which kind Tab has picked to throw (the biggest of that kind always goes first)
    this.candidate = null;
    this.counts = { squad: 0, field: 0, sprouts: 0, stages: [0, 0, 0], beach: 0, normal: 0, kit: 0 };
  }

  spawnSprout(x, z, stage = 0, kind = 'normal') {
    const t = new Turkey(this.game, stage, x, z, S.SPROUT, kind);
    t.growT = rand(0, 10);
    this.list.push(t);
    return t;
  }

  /**
   * `hen` keeps a turkey that's coming back out of a mound the bird it was (otherwise it's pot luck);
   * `gear`: the cricket kit it comes out in, if any
   */
  launchChick(from, tx, tz, kind = 'normal', stage = 0, hen = undefined, gear = null) {
    const t = new Turkey(this.game, stage, from.x, from.z, S.LAUNCHED, kind);
    if ((hen !== undefined && hen !== t.hen) || gear) {
      t.hen = hen ?? t.hen;
      t.gear = gear;
      t.buildRig();
    }
    t.launchFrom(from, new THREE.Vector3(tx, this.game.world.groundHeight(tx, tz), tz));
    this.list.push(t);
    return t;
  }

  get plucked() {
    let n = 0;
    for (const t of this.list) if (!t.dead && t.state !== S.SPROUT && t.state !== S.LAUNCHED && t.state !== S.BURROW) n++;
    return n;
  }

  nearestSprout(pos, maxD) {
    let best = null, bd = maxD;
    for (const t of this.list) {
      if (t.state !== S.SPROUT) continue;
      const d = Math.hypot(t.pos.x - pos.x, t.pos.z - pos.z);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  pluckNearest(pos, maxD = 2.3) {
    const t = this.nearestSprout(pos, maxD);
    if (!t) return null;
    if (this.plucked >= MAX_TURKEYS) {
      this.game.hud.toast(`Your flock is full (${MAX_TURKEYS})!`);
      this.game.audio.nope();
      return null;
    }
    t.pluck();
    return t;
  }

  /**
   * Who gets thrown next: the biggest turkey of the chosen kind (nearest first among equals).
   * If there are none of that kind with you, the other kind stands in, unless `strict`.
   */
  findCandidate(kind = this.preferred, strict = false) {
    const p = this.game.player.pos;
    let best = null, bs = -Infinity, alt = null, as = -Infinity;
    for (const t of this.list) {
      if (t.state !== S.FOLLOW) continue;
      const d = Math.hypot(t.pos.x - p.x, t.pos.z - p.z);
      if (d > 9) continue;
      const score = t.stage * 100 - d;
      if (t.kind === kind) { if (score > bs) { bs = score; best = t; } }
      else if (score > as) { as = score; alt = t; }
    }
    return best ?? (strict ? null : alt);
  }

  /** throw the next turkey at target; `kind` = only that kind (holding the button keeps to one kind) */
  throwAt(target, kind = null) {
    const t = kind ? this.findCandidate(kind, true) : this.findCandidate();
    if (!t) return null;
    const from = this.game.player.handPos(_v);
    t.throwTo(from, target);
    this.game.audio.throw();
    this.game.audio.peep(t.stage);
    return t;
  }

  whistle(center, radius) {
    let n = 0;
    for (const t of this.list) {
      if (!t.busy && !t.bouncing) continue; // (bouncing on the trampoline's no excuse)
      if (Math.hypot(t.pos.x - center.x, t.pos.z - center.z) < radius + t.radius) {
        if (t.joinSquad()) n++;
      }
    }
    return n;
  }

  /** send the squad off to stand in groups: one per size, and the beach turkeys in their own */
  dismiss() {
    const p = this.game.player;
    const groups = [[], [], [], []];
    for (const t of this.list) if (t.state === S.FOLLOW) groups[t.kind === 'beach' ? 3 : t.stage].push(t);
    const present = groups.map((g, i) => (g.length ? i : -1)).filter((i) => i >= 0);
    if (!present.length) return 0;
    const back = p.heading + Math.PI;
    present.forEach((s, gi) => {
      const a = back + (gi - (present.length - 1) / 2) * 1.1;
      const cx = p.pos.x + Math.sin(a) * 3.2, cz = p.pos.z + Math.cos(a) * 3.2;
      const g = groups[s];
      g.forEach((t, i) => {
        const rr = Math.sqrt(i / g.length) * (0.4 + Math.sqrt(g.length) * 0.35), aa = i * 2.4;
        t.dismissTo(cx + Math.cos(aa) * rr, cz + Math.sin(aa) * rr);
      });
    });
    return present.reduce((n, s) => n + groups[s].length, 0);
  }

  /** Tab: swap between throwing normal and beach turkeys; false if you've none of the other kind with you */
  cyclePreferred() {
    const other = this.preferred === 'beach' ? 'normal' : 'beach';
    if (!this.list.some((t) => t.state === S.FOLLOW && t.kind === other)) return false;
    this.preferred = other;
    return true;
  }

  update(dt) {
    const g = this.game, p = g.player;
    const c = this.counts;
    c.squad = c.field = c.sprouts = 0;
    c.stages[0] = c.stages[1] = c.stages[2] = c.beach = c.normal = c.kit = 0;
    for (const t of this.list) {
      if (t.dead) continue;
      if (t.state === S.FOLLOW || t.state === S.DIVE || t.state === S.TUNNEL || t.state === S.DIGOUT) { // (with you down the tunnels, too, and digging you out)
        c.squad++;
        c.stages[t.stage]++;
        if (t.kind === 'beach') c.beach++; else c.normal++;
        if (t.gear?.helmet || t.gear?.pads) c.kit++;
      }
      if (t.state === S.SPROUT || t.state === S.BURROW || t.state === S.LAUNCHED) c.sprouts++;
      else c.field++;
    }

    // the squad gathers in a tight blob just behind the player (or, when he's gone down, round beside him
    // as he lies there)
    this.blobR = 0.35 + Math.sqrt(c.squad) * 0.3;
    const back = p.heading + Math.PI, dist = 0.55 + this.blobR;
    let rx = p.pos.x + Math.sin(back) * dist, rz = p.pos.z + Math.cos(back) * dist;
    if (p.life === 'down') {
      const f = p.focus(_v), side = p.heading + Math.PI / 2;
      rx = f.x + Math.sin(side) * (0.8 + this.blobR);
      rz = f.z + Math.cos(side) * (0.8 + this.blobR);
    }
    // (aboard the ferry, they gather round you on her deck, not back on the wharf you've just stepped off)
    if (g.world.zoneOf(p.pos.x, p.pos.z) === FERRY) {
      const [x0, z0, x1, z1] = g.ferry.bounds, m = this.blobR + 0.5;
      rx = clamp(rx, x0 + m, x1 - m);
      rz = clamp(rz, z0 + m, z1 - m);
    }
    const moving = p.speed > 0.5;
    const lam = moving ? 6 : 2;
    this.rally.x = damp(this.rally.x, rx, lam, dt);
    this.rally.z = damp(this.rally.z, rz, lam, dt);

    for (const t of this.list) t.update(dt);
    if (this.list.some((t) => t.removed)) this.list = this.list.filter((t) => !t.removed);

    this.separate();
    this.candidate = this.findCandidate();
  }

  /* turkeys never overlap each other (or the player) */
  separate() {
    const g = this.game, hash = this.hash, nbrs = this.nbrs;
    hash.clear();
    const jostles = (t) => t.grounded || t.state === S.DROWN; // (drowning turkeys thrash about in a heap otherwise)
    for (const t of this.list) if (jostles(t)) hash.insert(t, t.pos.x, t.pos.z);
    const pp = g.player.pos, pr = g.player.radius;
    for (let iter = 0; iter < 2; iter++) {
      for (const a of this.list) {
        if (!jostles(a)) continue;
        hash.query(a.pos.x, a.pos.z, 0.8, nbrs);
        for (const b of nbrs) {
          if (b === a || b.id < a.id) continue;
          if (a.obj && a.obj === b.obj) continue; // carriers of the same thing may squeeze in shoulder to shoulder
          const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
          const min = (a.radius + b.radius) * 1.06;
          const d2 = dx * dx + dz * dz;
          if (d2 >= min * min) continue;
          let d = Math.sqrt(d2);
          let nx, nz;
          if (d < 1e-4) { const ang = rand(0, TAU); nx = Math.cos(ang); nz = Math.sin(ang); d = 0; }
          else { nx = dx / d; nz = dz / d; }
          const push = (min - d) * 0.5;
          a.pos.x -= nx * push; a.pos.z -= nz * push;
          b.pos.x += nx * push; b.pos.z += nz * push;
        }
        const dx = a.pos.x - pp.x, dz = a.pos.z - pp.z, min = a.radius + pr;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min) {
          const d = Math.sqrt(d2) || 1e-4;
          a.pos.x = pp.x + (dx / d) * min;
          a.pos.z = pp.z + (dz / d) * min;
        }
      }
    }
    for (const t of this.list) {
      if (!t.grounded) continue;
      g.world.resolve(t.pos, t.radius, g.mounds.colliders);
      g.world.resolve(t.pos, t.radius, g.enemies.colliders);
      t.settle(); // on the ground, or afloat
      t.rig.root.position.copy(t.pos);
    }
  }

  stageName(s) { return STAGES[s].name; }
}
