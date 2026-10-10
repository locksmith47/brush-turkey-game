import * as THREE from 'three';
import { Bin } from './bin.js';
import { PALETTES, JUNK } from './leaves.js';
import { part, merge, vcMesh, G, rand, pick, TAU } from './util.js';
import { WarnCircle } from './fx.js';

/*
 * What the ibis throw at you: rubbish, mostly, and the tourists' chips. An ibis picks something up (off a spilt
 * packet of chips, out of a torn bin bag, out of the top of a red or yellow bin, or out of the mess round one that's
 * been tipped over) and lobs it at whoever's nearest, you or a turkey. A red circle on the ground marks where it'll
 * come down, filling in till it does, and whatever's under it cops it like a peck. Rubbish lands as litter like any
 * other (to be raked home, or picked up and thrown again); chips go everywhere.
 */
// how high a throw goes (m, plus this much more per m it's thrown), and how long it's in the air (s, plus per m)
const ARC = [1.1, 0.2], AIR = [0.45, 0.06];
const CHIPS = [0xf2c94c, 0xe8b93a, 0xd9a52e];
const SIZE = 1.5; // (on the big side for a beakful, so you can see it coming)
const GEO = {};
const _v = new THREE.Vector3(), _c = new THREE.Color();

/** something to throw: a packet of chips (`chips`), or a bit of junk (a box or a can, in a red or yellow bin's colours) */
export function junk(palette = pick(['rubbish', 'recycling']), shape = pick(['box', 'can']), color = pick(PALETTES[palette])) {
  return { palette, shape, color };
}

/** it, small enough for an ibis's beak (at 1x) */
export function ammoMesh(what) {
  const key = what.chips ? 'chips' : `${what.shape}:${what.color}`;
  GEO[key] ??= merge(what.chips ? [
    part(G.box(0.15, 0.16, 0.05), 0xd9302b),
    part(G.box(0.152, 0.035, 0.052), 0xffd21f, [0, 0.035, 0]),
    ...[-0.045, -0.015, 0.015, 0.045].map((x, i) => part(G.box(0.02, 0.09, 0.02), CHIPS[i % 3], [x, 0.1, 0], [0, 0, (i - 1.5) * 0.15])),
  ] : what.shape === 'can' ? [
    part(G.cyl(0.04, 0.04, 0.14, 10), what.color, [0, 0, 0], [0, 0, Math.PI / 2]),
  ] : [
    part(G.box(0.17, 0.04, 0.12), what.color),
  ]).scale(SIZE, SIZE, SIZE);
  return vcMesh(GEO[key]);
}

export class Rubbish {
  constructor(game) {
    this.game = game;
    this.spots = []; // (where there's always more where that came from)
    this.lobs = [];
    this.warns = [];
  }

  /** a spilt packet of chips (`chips`), or a torn bin bag: there's always more to throw where that came from */
  addSpot(x, z, chips) { this.spots.push({ x, z, chips }); }

  /**
   * The nearest thing to throw within r of p, and no further than `leash` from `home`, into `at` (where it is): a
   * spot, a bin or a bit of litter, for take(). Null if there's nothing handy
   */
  find(p, r, home, leash, at) {
    const g = this.game;
    let best = null, bd = r * r;
    const near = (x, z) => {
      const d2 = (x - p.x) ** 2 + (z - p.z) ** 2;
      if (d2 >= bd || (x - home.x) ** 2 + (z - home.z) ** 2 > leash * leash) return false;
      bd = d2;
      at.set(x, 0, z);
      return true;
    };
    for (const s of this.spots) if (near(s.x, s.z)) best = s;
    for (const e of g.enemies.list) if (e instanceof Bin && e.alive && e.kind !== 'green' && near(e.pos.x, e.pos.z)) best = e;
    for (const shape of ['box', 'can']) {
      for (const l of g.leaves.pools[shape]) if (l.state === 'ground' && !l.owner && JUNK.has(l.palette) && near(l.pos.x, l.pos.z)) best = l;
    }
    return best;
  }

  /** how close an ibis has to get to it (to the middle of it) to get its beak in */
  reach(src, ibis) { return (src instanceof Bin ? src.def.radius + ibis.def.radius : 0.25) + 0.45 * ibis.s; }

  /** pick it up (from find): what it's got, or null if somebody's beaten it to it */
  take(src) {
    if (src instanceof Bin) return src.alive ? junk(src.kind === 'yellow' ? 'recycling' : 'rubbish') : null;
    if (this.spots.includes(src)) return src.chips ? { chips: true } : junk('rubbish');
    // (a bit of litter: up off the ground and into its beak)
    if (src.state !== 'ground' || src.owner) return null;
    src.state = 'off';
    src.dirty = true;
    src.mesh.getColorAt(src.i, _c);
    return junk(src.palette, src.shape, _c.getHex());
  }

  /**
   * A throw at `to`, `wind` seconds off being let go of (by `ibis`), hitting anything within r of where it lands.
   * The red circle's up from now, filling in till it lands. It's the thrower's to release() or cancel()
   */
  aim(ibis, to, r, wind) {
    const d = Math.hypot(to.x - ibis.pos.x, to.z - ibis.pos.z);
    const lob = {
      to: to.clone(), r, wind, air: AIR[0] + AIR[1] * d, h: ARC[0] + ARC[1] * d, t: 0, from: new THREE.Vector3(),
      by: ibis.pos.clone(), kills: ibis.def.kills, hurt: ibis.def.hurt, obj: null, what: null, flying: false,
      spin: new THREE.Vector3(rand(-14, 14), rand(-4, 4), rand(-14, 14)),
      warn: this.warns.pop() ?? new WarnCircle(this.game.scene),
    };
    this.lobs.push(lob);
    return lob;
  }

  /** let go of it: `obj`, in its beak, flies off to where it was aimed */
  release(lob, obj, what) {
    this.game.scene.attach(obj);
    lob.obj = obj;
    lob.what = what;
    lob.from.copy(obj.position);
    lob.t = lob.wind; // (in case it was a frame either way)
    lob.flying = true;
  }

  /** (the thrower's been stopped before it let go) */
  cancel(lob) { this.done(lob); }

  done(lob) {
    const i = this.lobs.indexOf(lob);
    if (i >= 0) this.lobs.splice(i, 1);
    lob.warn.hide();
    this.warns.push(lob.warn);
    if (lob.obj) this.game.scene.remove(lob.obj);
  }

  /** down it comes: whatever's under it cops it (the turkey nearest the middle, and you) */
  land(lob) {
    const g = this.game, p = lob.to;
    this.done(lob);
    if (lob.what.chips) g.fx.burst(_v.copy(p).setY(p.y + 0.1), { n: 12, colors: CHIPS, speed: [1, 2.6], up: [1.5, 3], grav: 9, size: [0.03, 0.06], life: [0.5, 0.9] });
    else g.leaves.spawn(p.x, p.z, lob.what.palette, lob.what.shape); // (and there it lies)
    g.fx.dust(p, 4);
    g.audio.land();
    const hit = g.turkeys.list
      .filter((t) => t.grounded && !t.dead && Math.hypot(t.pos.x - p.x, t.pos.z - p.z) < lob.r + t.radius)
      .sort((a, b) => Math.hypot(a.pos.x - p.x, a.pos.z - p.z) - Math.hypot(b.pos.x - p.x, b.pos.z - p.z));
    for (const t of hit.slice(0, lob.kills)) t.die('peck');
    const pl = g.player;
    if (Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z) < lob.r + pl.radius) pl.hurt(lob.hurt, lob.by, { knock: 4, stun: 0.25 });
  }

  update(dt) {
    const g = this.game;
    for (let i = this.lobs.length - 1; i >= 0; i--) {
      const lob = this.lobs[i];
      lob.t += dt;
      lob.warn.show(lob.to, lob.r, lob.t / (lob.wind + lob.air), g.time);
      if (!lob.flying) continue;
      const k = Math.min(1, (lob.t - lob.wind) / lob.air), o = lob.obj;
      o.position.lerpVectors(lob.from, lob.to, k);
      o.position.y += lob.h * 4 * k * (1 - k);
      o.rotation.x += lob.spin.x * dt;
      o.rotation.y += lob.spin.y * dt;
      o.rotation.z += lob.spin.z * dt;
      if (k >= 1) this.land(lob);
    }
  }

  /** an ibis that's gone down with something in its beak: it drops it at its feet */
  drop(obj, what, at) {
    const g = this.game;
    obj.parent?.remove(obj);
    if (what.chips) { g.fx.burst(at, { n: 6, colors: CHIPS, speed: [0.5, 1.5], up: [1, 2], grav: 9, size: [0.03, 0.06], life: [0.4, 0.7] }); return; }
    const a = rand(0, TAU);
    g.leaves.toss(at, at.x + Math.cos(a) * 0.6, at.z + Math.sin(a) * 0.6, what.palette, what.shape);
  }
}
