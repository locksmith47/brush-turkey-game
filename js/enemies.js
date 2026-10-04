import * as THREE from 'three';
import { Ibis } from './ibis.js';
import { Snake } from './snake.js';
import { Spider } from './spider.js';
import { Keeper } from './keeper.js';
import { Crab } from './crab.js';
import { Plover } from './plover.js';
import { Gull, CaptainGull } from './gull.js';
import { Rat } from './rat.js';

const HOP = 0.9, HOP_MAX = 1.1; // turkeys hopping over anything lying dead: m up per m across it (from the middle), and m up at most

/* Owns every foe (and every carcass / leaf bag waiting to be hauled). */
export class Enemies {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.colliders = []; // (everything in the way: whatever's standing, and anything big lying about)
    this.standing = []; // (just what's standing: turkeys hop over whatever's lying dead, see hopOver)
    this.lying = [];
    this._v = new THREE.Vector3();
  }

  /**
   * `arg`: for a gull, the [x, z] of the chips it's guarding (Captain Gull, where he stands guard; a plover, where
   * it keeps watch, till it's given an ibis to ride: see Plover.ride); for an ibis, how far it wanders from (x, z)
   */
  spawn(kind, x, z, arg = null) {
    const g = this.game;
    const e = kind === 'snake' ? new Snake(g, x, z)
      : kind === 'plover' ? new Plover(g, x, z, arg ?? [x, z])
      : kind === 'gull' ? new Gull(g, x, z, arg ?? [x, z])
      : kind === 'captain' ? new CaptainGull(g, x, z, arg ?? [x, z])
      : kind === 'spider' ? new Spider(g, x, z)
      : kind === 'rat' ? new Rat(g, x, z)
        : kind === 'keeper' ? new Keeper(g, x, z)
          : kind === 'crab' ? new Crab(g, 'crab', x, z)
            : kind === 'kingcrab' ? new Crab(g, 'king', x, z)
              : new Ibis(g, kind, x, z, arg);
    this.list.push(e);
    if (kind === 'king') this.king = e;
    if (kind === 'keeper') this.keeper = e;
    if (kind === 'kingcrab') this.kingCrab = e;
    if (kind === 'captain') this.captain = e;
    return e;
  }

  /** a thrown turkey at p: which foe did it hit? */
  hitTest(p) {
    for (const e of this.list) if (e.canLatch() && e.hits(p)) return e;
    return null;
  }

  /** the nearest foe within maxDist of pos (to its edge) to go at; `chore`: only chores (true), or only things that fight back (false) */
  nearestAlive(pos, maxDist, chore = null) {
    let best = null, bd = maxDist;
    for (const e of this.list) {
      if (!e.alive || !e.targetable || (chore !== null && e.chore !== chore)) continue;
      const d = Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) - e.def.radius;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  nearestCarcass(pos, maxDist) {
    let best = null, bd = maxDist;
    for (const e of this.list) {
      if (!e.hasFreeSlot()) continue;
      const d = Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) - e.def.carryR;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /** speed multiplier for anything walking at p (spider silk is sticky) */
  slowAt(p) {
    let f = 1;
    for (const e of this.list) if (e.slowAt) f = Math.min(f, e.slowAt(p));
    return f;
  }

  /** the boss the player is currently fighting, if any */
  engagedBoss() {
    const p = this.game.player.pos;
    let best = null, bd = Infinity;
    for (const e of this.list) {
      if (!e.boss || !e.alive) continue;
      const d = Math.hypot(e.pos.x - p.x, e.pos.z - p.z);
      if (((e.engaged && d < 45) || d < 26) && d < bd) { bd = d; best = e; }
    }
    return best;
  }

  update(dt, camera) {
    this.colliders.length = this.standing.length = this.lying.length = 0;
    for (const e of this.list) {
      e.update(dt);
      if (e.gone) continue;
      e.updateLabel(camera, this._v);
      const r = e.colliderR();
      if (!r) continue;
      const c = { x: e.pos.x, z: e.pos.z, r };
      this.colliders.push(c);
      (e.state === 'carcass' ? this.lying : this.standing).push(c);
    }
    if (this.list.some((e) => e.gone)) this.list = this.list.filter((e) => !e.gone);
  }

  /** how high a turkey `r` across at (x, z) is, hopping over whatever's lying dead there (m; 0 if it's clear) */
  hopOver(x, z, r) {
    let h = 0;
    for (const c of this.lying) {
      const R = c.r + r * 0.5, d2 = (x - c.x) ** 2 + (z - c.z) ** 2;
      if (d2 < R * R) h = Math.max(h, Math.min(HOP_MAX, HOP * c.r) * Math.sqrt(1 - d2 / (R * R)));
    }
    return h;
  }
}
