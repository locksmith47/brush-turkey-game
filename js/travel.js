import { S } from './turkey.js';
import { ZONES } from './world.js';
import { TravelMap } from './map.js';
import { clamp, smoothstep, rand } from './util.js';

/*
 * Getting about underground. Stand by one of your mounds and press F: in you dive, head first, and your squad
 * piles in after you. Down in the tunnels it all goes dark, and up comes a map of everywhere you've been, with your
 * mounds marked on it. Pick one, and it's a cut to that one: the flock pops out of the top of it, one after
 * another, and sets to digging you out (the way they do when you've gone down: see Wasted). Or Esc, and it's
 * back out of the one you went into.
 *
 * Like going down, it all runs in real time; the world stands still while the map's up.
 */
const REACH = 2.6; // metres out from the edge of a mound you can dive into it from
const CREW_GAP = [0.15, 0.03, 0.8]; // the squad's off after you this long after you're off, one after another (s: the first, each after that, the last)
const JOIN_MAX = 4.5; // seconds after you're in for the squad to follow you in (any still on the way are taken along)
const SETTLE_T = 0.4; // (a moment once they're all in, before it goes dark)
const DARK_T = 0.45; // going dark...
const MAP_T = 0.3; // ...and the map coming up out of it
const BACK_T = 0.25; // picked: back to black...
const LIGHT_T = 0.6; // ...and up comes the picture, on the mound you're coming out of
const POP_AT = 0.3; // (seconds into that, the first of the squad pops out of the top of it...)
const POP_ALL = 1.3; // (...and the rest after it, one at a time, all out inside this)
const DIG = { work: 14, min: 1.1, max: 2.2 }; // then turkey-seconds of digging to get you out (seconds, clamped)
const ALONE = 2.4; // seconds it takes you to wriggle out on your own, with no squad to dig you out
const HEAD_T = 0.35; // (your head coming up out of the dirt, once they're at it)
const CLOSE = 9; // the camera comes in this close (at most) to see you go in...
const DIG_ZOOM = 7.5; // ...and this close, to see you dug out

export class Travel {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('travel');
    this.mapEl = document.getElementById('travel-map');
    this.map = new TravelMap(game, (m) => this.pick(m));
    this.stage = null; // 'dive' (in you go), 'dark', 'map' (where to?), 'back' (picked), 'out' (being dug out) or 'pop'
    this.t = 0;
    this.told = false; // (how it's done: said the first time you're by a mound with somewhere else to go)
    this.tellT = 0;
    this.shown = {}; // (what's on screen now, so the page is only touched when it changes)
  }

  get active() { return this.stage !== null; }
  /** the map's up: the world stands still, and there's none of it to see */
  get frozen() { return this.stage === 'map' || this.stage === 'back'; }

  /** your mounds: the finished ones, in places you've been */
  known() {
    const g = this.game;
    return g.mounds.list.filter((m) => !m.building && g.visited.has(g.world.zoneOf(m.pos.x, m.pos.z)));
  }

  /** the finished mound you're right by (the nearest, if there's more than one), or null */
  nearest() {
    const g = this.game, p = g.player.pos;
    let best = null, bd = REACH;
    for (const m of g.mounds.list) {
      if (m.building) continue;
      const d = Math.hypot(m.pos.x - p.x, m.pos.z - p.z) - m.r;
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  /** could you dive into mound m right now, with somewhere else to come out? */
  canDiveAt(m) {
    const g = this.game, p = g.player;
    if (m.building || this.active || !g.started || p.life !== 'ok') return false;
    return Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z) < m.r + REACH && this.known().length > 1;
  }

  /** F: into the mound you're by, and your squad after you (or why not) */
  tryDive() {
    const g = this.game, m = this.nearest();
    if (this.active || g.player.life !== 'ok') return;
    if (!m) g.hud.toast('Walk up to one of your mounds, then press F to dive in', 2.5);
    else if (this.known().length < 2) g.hud.toast("It's the only mound you've got! Build another (M) somewhere else, then dive in here to get there", 4);
    else { this.dive(m); return; }
    g.audio.nope();
  }

  /** in you go, head first, and your squad after you (the nearest first) */
  dive(m) {
    const g = this.game, [first, each, last] = CREW_GAP;
    this.stage = 'dive';
    this.t = 0;
    this.from = m;
    this.inT = null;
    this.zoom = g.cam.zoom;
    g.cam.zoom = Math.min(this.zoom, CLOSE);
    g.player.dive(m);
    const near = (t) => Math.hypot(t.pos.x - m.pos.x, t.pos.z - m.pos.z);
    this.crew = g.turkeys.list.filter((t) => t.state === S.FOLLOW).sort((a, b) => near(a) - near(b));
    this.crew.forEach((t, i) => t.diveAfter(m, first + Math.min(i * each, last) + rand(0, 0.15)));
    g.hud.clearToast();
  }

  /** is this one of the squad still on its way in after you? */
  coming(t) {
    return t.hole === this.from && (t.state === S.DIVE || (t.state === S.TUNNEL && t.tunnel === 'in'));
  }

  /** real seconds since the last frame */
  update(real) {
    if (!this.stage) { this.tell(real); return; }
    const g = this.game, p = g.player, t = (this.t += real);
    // (no steam coming off the mounds, across the picture: not the one you're going into, nor whichever you'll come
    // out of, with any there was off it gone by then)
    if (this.stage === 'dive' || this.stage === 'dark') for (const m of g.mounds.list) m.steamT = Math.max(m.steamT, 0.2);
    if (this.stage === 'dive') {
      if (p.life !== 'buried') return;
      // (you're in: and the squad after you, or they've had long enough, and any still on the way are taken along)
      this.inT ??= t;
      if (this.crew.some((c) => this.coming(c)) && t - this.inT < JOIN_MAX) { this.allInT = t; return; }
      if (t - (this.allInT ?? t) < SETTLE_T) return;
      for (const c of this.crew) if (this.coming(c)) c.goUnder();
      this.stage = 'dark';
      this.t = 0;
    } else if (this.stage === 'dark') {
      this.look(smoothstep(0, DARK_T, t), 0);
      if (t >= DARK_T) this.openMap();
    } else if (this.stage === 'map') {
      this.look(1, smoothstep(0, MAP_T, t));
      if (g.input.pressed('Escape')) this.pick(this.from);
      else this.map.keys(g.input);
    } else if (this.stage === 'back') {
      this.look(1, 1 - smoothstep(0, BACK_T, t));
      if (t >= BACK_T) this.arrive(this.to);
    } else if (this.stage === 'out') this.digOut(real);
    else if (p.life === 'ok') this.finish(); // ('pop': you've landed on your feet)
  }

  /** at full black: up comes the map (with your squad down there with you: the ones that made it in) */
  openMap() {
    this.stage = 'map';
    this.t = 0;
    this.crew = this.crew.filter((c) => c.state === S.TUNNEL && c.tunnel === 'under');
    this.map.open(this.from, this.known(), this.crew.length);
  }

  /** picked where to come out (the mound you went in by: nowhere) */
  pick(m) {
    if (this.stage !== 'map') return;
    this.stage = 'back';
    this.t = 0;
    this.to = m;
    if (m !== this.from) this.game.audio.whoosh(); // (off down the tunnels)
  }

  /** the map's gone, it's all black: you're under mound m, your squad down there with you, and up comes the picture */
  arrive(m) {
    const g = this.game, cam = g.cam, zone = g.world.zoneOf(m.pos.x, m.pos.z);
    this.map.close();
    this.stage = 'out';
    this.t = 0;
    cam.zoom = cam.dist = Math.min(this.zoom, DIG_ZOOM);
    cam.snapTo(m.pos); // (looking down the way on from there, if it's round the corner from where you went in)
    g.player.bury(m, cam.yaw, { heal: false, under: 1 }); // (facing the camera)
    cam.target.set(m.pos.x, m.pos.y + 1, m.pos.z);
    for (const c of this.crew) c.hole = m;
    this.spots = g.wasted.digSpots(m, this.crew.length); // (in rings round it, bar a gap your side, where you'll come out)
    this.popGap = Math.min(0.12, POP_ALL / Math.max(1, this.crew.length));
    this.popped = 0;
    this.digT = this.crew.length ? clamp(DIG.work / this.crew.length, DIG.min, DIG.max) : ALONE;
    this.digAt = null;
    this.dirtT = 0;
    if (zone !== g.world.zoneOf(this.from.pos.x, this.from.pos.z)) g.hud.zoneTitle(ZONES[zone].name);
  }

  /** out of the tunnels: the squad pops out of the top of the mound, one after another, and digs you out */
  digOut(real) {
    const g = this.game, p = g.player, m = this.to, t = this.t;
    m.steamT = Math.max(m.steamT, 0.2);
    this.look(1 - smoothstep(0, LIGHT_T, t), 0);
    while (this.popped < this.crew.length && t >= POP_AT + this.popped * this.popGap) {
      const c = this.crew[this.popped], s = this.spots[this.popped++];
      if (c.state === S.TUNNEL) c.popOutOf(m, s.x, s.z);
    }
    // once they're all out and down, they're at it (on your own: you wriggle out yourself)
    if (this.digAt === null) {
      if (this.popped < this.crew.length || this.crew.some((c) => c.state === S.TUNNEL)) return;
      this.digAt = Math.max(t, POP_AT);
    }
    const k = t - this.digAt;
    if (k < 0) return;
    p.under = 1 - smoothstep(0, HEAD_T, k);
    p.digK = clamp(k / (HEAD_T + this.digT), 0, 1);
    if ((this.dirtT -= real) <= 0) {
      this.dirtT = rand(0.16, 0.32);
      g.wasted.scatter(m);
    }
    if (k >= HEAD_T + this.digT) {
      this.stage = 'pop';
      g.wasted.popFrom(m, this.crew);
    }
  }

  /** out, and on your feet: all done */
  finish() {
    this.stage = null;
    this.game.cam.zoom = this.zoom; // (and the camera eases back out to where you had it)
    this.look(0, 0);
  }

  /** the first time you're by a mound with somewhere else to go: how it's done */
  tell(real) {
    if (this.told || (this.tellT -= real) > 0) return;
    this.tellT = 0.5;
    const m = this.nearest();
    if (!m || !this.canDiveAt(m)) return;
    this.told = true;
    this.game.hud.toast('Press F to dive into the mound, and your squad will follow you in: you can come out of any mound you like', 6);
  }

  /** the window's changed size: the map, drawn again to fit (if it's up) */
  resized() { if (this.frozen) this.map.draw(); }

  /** where a save made in the middle of all this should put you: by the mound you're coming out of (or went into) */
  comeBack() {
    return this.game.wasted.landing(this.stage === 'out' || this.stage === 'pop' ? this.to : this.from);
  }

  /** how it looks: how dark it's gone, and how far up the map is (each 0..1) */
  look(black, map) {
    const s = this.shown, r = (v) => Math.round(v * 100) / 100;
    black = r(black); map = r(map);
    if (black !== s.black) {
      if (!black !== !s.black) this.el.classList.toggle('hidden', !black);
      s.black = black;
      this.el.style.opacity = black;
    }
    if (map !== s.map) { s.map = map; this.mapEl.style.opacity = map; }
  }
}
