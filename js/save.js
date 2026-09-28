import { Bin } from './bin.js';
import { LeafBag } from './keeper.js';
import { PALETTES } from './leaves.js';
import { S } from './turkey.js';

/*
 * Saving your progress, in the browser (localStorage): a snapshot of whatever's changed since the game
 * began. That's the mounds (where, how full, what's stuck in them), the flock (every turkey, how big,
 * what kind, where), the litter lying about, which gates, barricades and side gates are open and where
 * the keys are, which foes have been beaten (and whether they've been carried off yet), what's been
 * hauled away, and where you are. Everything else starts out the way a new game does, so a foe that
 * hasn't been beaten is back at home, good as new.
 *
 * Continuing puts it all back quietly (game.loading): no banners, no fanfares, no bins spilling a
 * second time. It saves every little while once you're playing, and whenever you leave the page.
 *
 * Each copy of the game keeps its own save (the branch previews live alongside the real thing, on the same
 * site). Bump VERSION whenever the map changes, so an old save isn't read into a world it doesn't fit.
 */
const KEY = `turkmin-save:${location.pathname.replace(/index\.html$/, '')}`;
const VERSION = 1;
const EVERY = 20; // seconds between saves while you play
const PAL = Object.keys(PALETTES), SHAPES = ['leaf', 'box', 'can'];
const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;
const gearBits = (g) => (g?.helmet ? 1 : 0) + (g?.pads ? 2 : 0);

export class Saves {
  /** `progress`: { get(), set(d) } for main.js's own bits (zones seen, tips given...) */
  constructor(game, progress) {
    this.game = game;
    this.progress = progress;
    this.foes = new Map(); // id -> foe, for everything there was to begin with (see register)
    this.t = EVERY;
    this.on = false; // (only once you're playing: never over the top of a save you haven't picked up yet)
  }

  /** the save in the browser, if there is one (and it's one this version of the game can read) */
  static read() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY));
      return d?.v === VERSION ? d : null;
    } catch {
      return null;
    }
  }

  static clear() {
    try { localStorage.removeItem(KEY); } catch { /* (nothing to clear) */ }
  }

  static get key() { return KEY; }

  /**
   * Everything a new game starts with that a save might need to say something about, by a name that
   * sticks: what it is and where it started out. (The keys and barricades have their own places)
   */
  register() {
    const b = this.game.barriers, skip = new Set([...b.keys, ...b.barricades]);
    for (const e of this.game.enemies.list) {
      if (skip.has(e)) continue;
      let id = `${e.def.name}@${e.home.x.toFixed(1)},${e.home.z.toFixed(1)}`;
      for (let n = 2; this.foes.has(id); n++) id = `${id}#${n}`;
      this.foes.set(id, e);
    }
  }

  /** every EVERY seconds while you play (and whenever you leave the page: see main.js) */
  update(dt) {
    if (!this.on || this.game.wasted.active || (this.t -= dt) > 0) return; // (not while you're down: see snapshot)
    this.t = EVERY;
    this.write();
  }

  write() {
    if (!this.on) return false;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.snapshot()));
      this.game.hud.saved();
      return true;
    } catch (err) {
      console.warn('Could not save', err);
      return false;
    }
  }

  /* ---------------------------------------------------------------- what's saved */
  snapshot() {
    const g = this.game, w = g.world, b = g.barriers, p = g.player, keys = b.keys;
    // (gone down, or being dug out? then you're back at the mound you're coming back to, the camera as you had it)
    const at = g.wasted.active ? g.wasted.comeBack() : p.pos, zoom = g.wasted.active ? g.wasted.zoom : g.cam.zoom;
    return {
      v: VERSION,
      at: Date.now(),
      player: [r2(at.x), r2(at.z), r2(p.heading)],
      cam: [r2(g.cam.yaw), r2(zoom)],
      stats: { ...g.stats },
      progress: this.progress.get(),
      // (a key that's turning in its lock counts: its gate's as good as open)
      gates: w.gates.map((gt, i) => gt.open || keys[i]?.state === 'unlock'),
      sideGates: b.sideGates.map((s) => !s.shut),
      barricades: b.barricades.map((x) => !x.alive),
      keys: keys.map((k) => this.keyState(k)),
      foes: this.foeStates(),
      bag: this.bagState(),
      mounds: g.mounds.list.map((m) => m.saveState()),
      turkeys: g.turkeys.list.map((t) => this.turkeyState(t)).filter(Boolean),
      litter: this.litterState(),
      grubs: g.grubs.list.map((gr) => [r1(gr.pos.x), r1(gr.pos.z)]),
    };
  }

  /** null: it's in its lock; 'held': someone's still got it; { hp }: still buried; [x, z, heading]: lying about */
  keyState(k) {
    if (k.gone || k.state === 'unlock') return null;
    if (k.state === 'held') return 'held';
    if (k.alive) return { hp: r1(k.hp) };
    return [r2(k.pos.x), r2(k.pos.z), r2(k.heading)];
  }

  /** for each foe that's not its old self: 0 if it's gone (carried off, say), or where it's lying */
  foeStates() {
    const out = {};
    for (const [id, e] of this.foes) {
      if (e.gone) out[id] = 0;
      else if (!e.alive) out[id] = e instanceof Bin ? [r2(e.pos.x), r2(e.pos.z), r2(e.heading), r2(e.fall)] : [r2(e.pos.x), r2(e.pos.z), r2(e.heading)];
    }
    return out;
  }

  /** Big Kev's leaf bag (it turns up once he's beaten): null before then, 0 once it's been carried off */
  bagState() {
    if (this.game.enemies.keeper?.alive !== false) return null;
    const bag = this.game.enemies.list.find((e) => e instanceof LeafBag && !e.gone);
    return bag ? [r2(bag.pos.x), r2(bag.pos.z), r2(bag.heading)] : 0;
  }

  /** [stage, beach?, hen?, variant, kit, x, z, 's' in the ground | 'f' following you | 'i' out and about, growing time] */
  turkeyState(t) {
    if (t.dead || t.removed || t.state === S.DYING) return null;
    const st = t.state;
    const mode = st === S.SPROUT || st === S.BURROW ? 's' : st === S.FOLLOW || st === S.POP || st === S.DROWN || st === S.DIGOUT ? 'f' : 'i';
    const at = (st === S.THROWN || st === S.LAUNCHED) && t.flight?.to ? t.flight.to : t.pos; // (where it was headed)
    return [t.stage, t.kind === 'beach' ? 1 : 0, t.hen ? 1 : 0, t.variant, gearBits(t.gear), r1(at.x), r1(at.z), mode, mode === 's' ? r1(t.growT) : 0];
  }

  /** every piece lying about (or on its way down), flat: x, z, palette, shape */
  litterState() {
    const out = [];
    for (const l of this.game.leaves.list) {
      if (l.state === 'off' || l.state === 'flying') continue;
      const at = l.state === 'tossed' || l.state === 'kicked' ? l.to : l.pos;
      out.push(r1(at.x), r1(at.z), Math.max(0, PAL.indexOf(l.palette)), SHAPES.indexOf(l.shape));
    }
    return out;
  }

  /* ---------------------------------------------------------------- putting it back */
  /** into a new game, just started: returns false (and it's partly done) if something went wrong */
  load(d) {
    const g = this.game;
    g.loading = true;
    g.audio.muted = true;
    try {
      this.loadWorld(d);
      this.loadFlock(d);
      const [x, z, h] = d.player, p = g.player;
      p.pos.set(x, g.world.groundHeight(x, z), z);
      g.world.resolve(p.pos, p.radius, g.mounds.colliders);
      p.heading = h;
      g.cam.yaw = d.cam[0];
      g.cam.zoom = g.cam.dist = d.cam[1];
      g.cam.target.set(p.pos.x, p.pos.y + 1, p.pos.z);
      Object.assign(g.stats, d.stats);
      this.progress.set(d.progress);
      return true;
    } catch (err) {
      console.error('Could not load the save', err);
      return false;
    } finally {
      g.loading = false;
      g.audio.muted = false;
    }
  }

  loadWorld(d) {
    const g = this.game, b = g.barriers;
    d.barricades.forEach((open, i) => { if (open) b.barricades[i]?.open(true); });
    d.sideGates.forEach((open, i) => { if (open) b.sideGates[i]?.open(true); });
    // foes that were beaten go down again (quietly), and lie where they were, or are done with
    for (const [id, e] of this.foes) {
      const f = d.foes[id];
      if (f === undefined) continue;
      if (e.alive) this.fell(e, f);
      if (f === 0) { if (!e.gone) e.dispose(); continue; }
      if (e instanceof Bin) continue; // (it lies where it fell)
      e.pos.set(f[0], g.world.groundHeight(f[0], f[1]), f[1]);
      e.heading = f[2];
      e.settled = false;
    }
    // (Big Kev's leaf bag turned up as he went down: it's where it was, or it's been carried off)
    const bag = g.enemies.list.find((e) => e instanceof LeafBag && !e.gone);
    if (bag && d.bag === 0) bag.dispose();
    else if (bag && d.bag) { bag.pos.set(d.bag[0], 0, d.bag[1]); bag.heading = d.bag[2]; bag.settled = false; }
    // the keys: in their locks (so those gates are open), still held or buried, or lying about
    b.keys.forEach((k, i) => {
      const s = d.keys[i];
      if (d.gates[i]) { b.unlock(i, true); return; }
      if (k.gone || s === undefined || s === 'held') return;
      if (Array.isArray(s)) k.restoreAt(s[0], s[1], s[2]);
      else if (s?.hp !== undefined && k.alive) k.hp = Math.max(0.5, s.hp);
    });
    g.mounds.restore(d.mounds);
    // the litter lying about, and the grubs in it
    g.leaves.clear();
    const L = d.litter;
    for (let i = 0; i + 3 < L.length; i += 4) g.leaves.spawn(L[i], L[i + 1], PAL[L[i + 2]] ?? 'gum', SHAPES[L[i + 3]] ?? 'leaf');
    g.grubs.clear();
    for (const [x, z] of d.grubs) g.grubs.spawn(x, z);
  }

  /** a foe that was beaten: down it goes again, straight away, with no fuss (`f`: where it ended up) */
  fell(e, f) {
    e.die();
    if (Array.isArray(f)) {
      if (e instanceof Bin) e.fall = f[3];
      e.pos.set(f[0], e.pos.y, f[1]);
      e.heading = f[2];
      e.fallTo = f[2]; // (Big Kev: flat on his back, the way he was)
    }
    e.t = e.def.dieTime ?? 0.8;
    e.update(0);
  }

  loadFlock(d) {
    const g = this.game, T = g.turkeys, w = g.world;
    for (const t of T.list) { t.dispose(); t.dead = t.removed = true; }
    T.list.length = 0;
    for (const [stage, beach, hen, variant, gear, x, z, mode, growT] of d.turkeys) {
      const t = T.spawnSprout(x, z, stage, beach ? 'beach' : 'normal');
      t.hen = !!hen;
      t.variant = variant;
      t.gear = gear ? { helmet: !!(gear & 1), pads: !!(gear & 2) } : null;
      t.buildRig();
      if (mode === 's') { t.growT = growT; continue; }
      // (out of the ground: following you, or out and about; bar a landlubber out of its depth, which is with you)
      t.setState(mode === 'f' || (!t.canSwim && w.waterDepth(x, z) === 2) ? S.FOLLOW : S.IDLE);
      t.pos.y = w.groundHeight(x, z);
      w.resolve(t.pos, t.radius, g.mounds.colliders);
    }
  }
}
