import * as THREE from 'three';
import { Ibis } from './ibis.js';
import { Snake } from './snake.js';
import { Spider } from './spider.js';
import { Keeper } from './keeper.js';
import { Crab } from './crab.js';
import { Plover } from './plover.js';
import { Gull, CaptainGull } from './gull.js';
import { Rat } from './rat.js';

/* Owns every foe (and every carcass / leaf bag waiting to be hauled). */
export class Enemies {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.colliders = [];
    this._v = new THREE.Vector3();
  }

  /**
   * `arg`: for a plover, the [x, z] of the nest it guards (a gull, the chips it's guarding; Captain Gull, where
   * he stands guard); for an ibis, how far it wanders from (x, z)
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
    this.colliders.length = 0;
    for (const e of this.list) {
      e.update(dt);
      if (e.gone) continue;
      e.updateLabel(camera, this._v);
      const r = e.colliderR();
      if (r) this.colliders.push({ x: e.pos.x, z: e.pos.z, r });
    }
    if (this.list.some((e) => e.gone)) this.list = this.list.filter((e) => !e.gone);
  }
}
