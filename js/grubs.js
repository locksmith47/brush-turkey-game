import * as THREE from 'three';
import { part, merge, vcMesh, G, rand, pick, TAU } from './util.js';

/* Juicy grubs hiding in the leaf litter. A turkey that eats one grows up a stage. */
export class Grubs {
  constructor(game) {
    this.game = game;
    this.list = [];
    const parts = [];
    const segs = 7;
    for (let i = 0; i < segs; i++) {
      const a = (i / (segs - 1)) * Math.PI * 1.2 - 0.3;
      const r = 0.075 - i * 0.004;
      const col = i === 0 ? 0xc98b3e : i % 2 ? 0xf6eed8 : 0xeadfbf;
      parts.push(part(G.sphere(r, 10, 8), col, [Math.cos(a) * 0.12, r, Math.sin(a) * 0.12]));
    }
    parts.push(part(G.sphere(0.018, 6, 5), 0x3a2410, [0.14, 0.1, -0.03]));
    this.geo = merge(parts);
    this.timer = 6;
  }

  spawn(x, z) {
    const m = vcMesh(this.geo);
    m.position.set(x, this.game.world.groundHeight(x, z) + 0.01, z);
    m.scale.setScalar(1.35);
    this.game.scene.add(m);
    const g = { mesh: m, pos: m.position, owner: null, ph: rand(0, TAU), sparkle: rand(0, 1.5), alive: true };
    this.list.push(g);
    this.game.fx.dirt(m.position, 6, 0.5);
    return g;
  }

  /** none at all (a save's about to put back the ones it had) */
  clear() {
    for (const g of this.list) {
      g.alive = false;
      this.game.scene.remove(g.mesh);
    }
    this.list.length = 0;
  }

  nearestFree(pos, maxDist) {
    let best = null, bd = maxDist;
    for (const g of this.list) {
      if (g.owner) continue;
      const d = Math.hypot(g.pos.x - pos.x, g.pos.z - pos.z);
      if (d < bd) { bd = d; best = g; }
    }
    return best;
  }

  claim(g, t) { g.owner = t; }
  release(g) { if (g) g.owner = null; }

  eat(g) {
    g.alive = false;
    this.game.scene.remove(g.mesh);
    this.list.splice(this.list.indexOf(g), 1);
    this.game.fx.burst(g.pos, { n: 6, colors: [0xf6eed8, 0xeadfbf], speed: [0.5, 1.5], up: [1, 2.5], size: [0.03, 0.06] });
  }

  update(dt, t) {
    for (const g of this.list) {
      g.mesh.rotation.y = g.ph + Math.sin(t * 5 + g.ph) * 0.5;
      g.mesh.rotation.z = Math.sin(t * 7 + g.ph) * 0.2;
      g.sparkle -= dt;
      if (g.sparkle <= 0) {
        g.sparkle = 1.4;
        this.game.fx.sparkle(g.pos, 3, [0xffffff, 0xfff3b0]);
      }
    }
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = rand(12, 20);
      if (this.list.length < 5) {
        // pop up somewhere in the leaf litter near the player
        const p = this.game.player.pos;
        const spots = this.game.world.treeSpots.filter((s) => Math.hypot(s.x - p.x, s.z - p.z) < 32);
        const s = spots.length ? pick(spots) : pick(this.game.world.treeSpots);
        for (let k = 0; k < 8; k++) {
          const a = rand(0, TAU), d = rand(1.5, 4.5);
          const x = s.x + Math.cos(a) * d, z = s.z + Math.sin(a) * d;
          if (this.game.world.isFree(x, z, 0.3)) { this.spawn(x, z); break; }
        }
      }
    }
  }
}
