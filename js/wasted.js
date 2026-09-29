import * as THREE from 'three';
import { S } from './turkey.js';
import { BUILD_CREW } from './mound.js';
import { clamp, lerp, smoothstep, rand, pick, TAU } from './util.js';

/*
 * Going down, GTA style. When your health runs out, over backwards you go (like Big Kev), time slows right
 * down, the colour drains out of everything and up comes WASTED. Then it all fades to black... and back in on
 * the nearest mound (the nearest you could walk to from where you fell), where you're buried up to your
 * eyeballs and a crew of turkeys is busy digging you out. They're your own: your squad, topped up with the
 * nearest of the rest of your flock. Or, if you've no turkeys left above ground at all, ten grown ones turn up
 * to dig you out, and stick with you after. Out you pop, as good as new.
 *
 * It all runs in real time (the slow-mo doesn't slow it down), and the look of it (the grey, the word, the
 * black) is set from here every frame rather than left to CSS transitions, so it keeps in step with the game.
 */
const SLOW = 0.4; // how slow everything goes as you go down
const TEXT_AT = 1.0; // (seconds in) WASTED comes up
const DARK_AT = 3.5; // it all starts to fade to black...
const DARK_T = 0.7;
const HOLD_T = 0.3; // ...black, while you're put back in the mound and the crew's gathered round it...
const LIGHT_T = 0.9; // ...and fading back in on them digging
const DIG_ZOOM = 7.5; // (the camera comes in closer to see them at it, and back out again after)
const DIG = { work: 22, min: 1.6, max: 3 }; // then turkey-seconds of digging to get you out (seconds, clamped)
const RESCUERS = 10; // with nobody left above ground: grown turkeys that turn up to dig you out
// what can come and dig you out: any of your turkeys above ground and about (not ones in the ground, being
// carried off in a beak or already swallowed, say)
const CAN_DIG = new Set([S.FOLLOW, S.POP, S.IDLE, S.GOTO, S.SEEK, S.RAKE, S.EAT, S.ATTACK, S.HAUL, S.TOY, S.SWING, S.BUILD, S.DROWN, S.THROWN]);
const SAND = [0xecd9a4, 0xe2cc92, 0xd8c286];
const AGAIN = ['Dug out by your turkeys!', 'Back on your feet!', 'Your turkeys dug you out. Try not to make a habit of it', 'Up you come! Your turkeys had you out in no time'];
const _v = new THREE.Vector3();

export class Wasted {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('wasted');
    this.word = document.getElementById('wasted-word');
    this.shade = document.getElementById('wasted-shade');
    this.black = document.getElementById('blackout');
    this.stage = null; // 'down' (WASTED), 'dig' (buried in the mound, being dug out) or 'pop' (on his way out)
    this.t = 0;
    this.told = false; // (the first time: where you come back, and why it's worth building mounds as you go)
    this.shown = {}; // (what's on screen now, so the page is only touched when it changes)
  }

  get active() { return this.stage !== null; }

  /** he's gone down: WASTED */
  start() {
    const g = this.game;
    if (this.active) return;
    this.stage = 'down';
    this.t = 0;
    this.zoom = g.cam.zoom;
    this.lift = 0;
    this.mound = g.mounds.refuge(g.player.pos); // (where he'll be back: known now, in case the game's saved meanwhile)
    g.stats.wasted = (g.stats.wasted ?? 0) + 1;
    document.body.classList.add('wasted');
    g.hud.clearToast();
    g.audio.wasted();
  }

  /** real seconds since the last frame */
  update(real) {
    if (!this.stage) return;
    const g = this.game, t = (this.t += real);
    // (no steam coming off the mound he'll be dug out of, to drift across his face)
    if (this.mound) this.mound.steamT = Math.max(this.mound.steamT, 0.2);
    if (this.stage === 'down') {
      // everything slows right down and the colour drains out of it; WASTED; then it all fades to black (the
      // camera drifting round him, and in a little, all the while)
      g.timeScale = t < DARK_AT ? lerp(1, SLOW, smoothstep(0, 0.35, t)) : lerp(SLOW, 1, smoothstep(DARK_AT, DARK_AT + DARK_T, t));
      g.cam.yaw += real * 0.1;
      g.cam.zoom = lerp(this.zoom, Math.max(4.5, this.zoom * 0.7), smoothstep(0, 3, t));
      this.lift = smoothstep(0.5, 1.5, t); // (him up above the word, not hidden behind it: see updateCamera)
      this.look(smoothstep(0.1, 1.2, t), smoothstep(TEXT_AT, TEXT_AT + 0.25, t), smoothstep(DARK_AT, DARK_AT + DARK_T, t));
      if (t >= DARK_AT + DARK_T) this.respawn();
    } else if (this.stage === 'dig') {
      // back from black on the mound, and the crew digging away at it: he comes up out of it bit by bit
      const p = g.player, m = this.mound;
      this.look(0, 0, 1 - smoothstep(HOLD_T, HOLD_T + LIGHT_T, t));
      p.digK = clamp((t - HOLD_T) / (LIGHT_T + this.digT), 0, 1);
      if ((this.dirtT -= real) <= 0 && t > HOLD_T) {
        // (dirt flying off the top, round him, as they get into it)
        this.dirtT = rand(0.16, 0.32);
        _v.set(m.pos.x + rand(-0.35, 0.35), m.pos.y + m.h, m.pos.z + rand(-0.35, 0.35));
        if (m.beach) g.fx.burst(_v, { n: 5, colors: SAND, speed: [0.8, 2.2], up: [2, 4], size: [0.05, 0.1], life: [0.5, 0.9] });
        else g.fx.dirt(_v, 5, 0.75);
        m.bump = Math.max(m.bump, rand(0.3, 0.6));
        g.audio.leaf();
      }
      if (t >= HOLD_T + LIGHT_T + this.digT) this.pop();
    } else if (g.player.life === 'ok') this.finish(); // ('pop': he's landed on his feet)
  }

  /** at full black: back at the mound, buried up to his eyeballs, with his crew round it, already digging */
  respawn() {
    const g = this.game, p = g.player, cam = g.cam;
    let m = this.mound;
    if (!m || m.building || !g.mounds.list.includes(m)) m = this.mound = g.mounds.refuge(p.pos);
    g.timeScale = 1;
    document.body.classList.remove('wasted');
    g.hud.clearToast();
    cam.zoom = cam.dist = Math.min(this.zoom, DIG_ZOOM);
    cam.snapTo(m.pos); // (looking down the way on from there, if it's round the corner from where you went down)
    p.bury(m, cam.yaw); // (facing the camera)
    cam.target.set(m.pos.x, m.pos.y + 1, m.pos.z);
    this.crew = this.gatherCrew(m);
    this.digT = clamp(DIG.work / Math.max(1, this.crew.length), DIG.min, DIG.max);
    this.stage = 'dig';
    this.t = 0;
    this.dirtT = 0;
    this.look(0, 0, 1);
  }

  /**
   * Who digs him out of mound m: his squad, topped up to a full crew (as many as it takes to scratch up a mound)
   * with the nearest of the rest of his turkeys above ground; or, with none left above ground at all, ten new
   * grown ones. They're put straight round the mound (it's all black: nobody sees them get there)
   */
  gatherCrew(m) {
    const g = this.game, T = g.turkeys;
    const up = T.list.filter((t) => !t.dead && !t.removed && CAN_DIG.has(t.state));
    // (the nearest first, bar any in the middle of carrying something or scratching up a mound)
    const cost = (t) => Math.hypot(t.pos.x - m.pos.x, t.pos.z - m.pos.z) + (t.state === S.HAUL || t.state === S.BUILD ? 1000 : 0);
    const squad = up.filter((t) => t.state === S.FOLLOW);
    const rest = up.filter((t) => t.state !== S.FOLLOW).sort((a, b) => cost(a) - cost(b));
    const crew = [...squad, ...rest.slice(0, Math.max(0, BUILD_CREW - squad.length))];
    this.fresh = !crew.length;
    if (this.fresh) for (let i = 0; i < RESCUERS; i++) crew.push(T.spawnSprout(m.pos.x, m.pos.z, 2, m.beach ? 'beach' : 'normal'));
    const spots = this.digSpots(m, crew.length);
    crew.forEach((t, i) => t.digOut(m, spots[i].x, spots[i].z));
    return crew;
  }

  /**
   * Where n turkeys stand to dig him out of mound m: in rings round it, facing in, bar a gap on the camera's
   * side (where he'll come out). Only somewhere a turkey could stand: out of the trees, and out of the deep
   */
  digSpots(m, n) {
    const g = this.game, w = g.world, gap = 0.55, arc = TAU - gap * 2, spots = [];
    for (let ring = 0; spots.length < n && ring < 8; ring++) {
      const R = m.r + 0.75 + ring * 0.85, cap = Math.max(1, Math.floor((arc * R) / 0.8)), ok = [];
      for (let i = 0; i < cap; i++) {
        const a = g.cam.yaw + gap + ((i + 0.5) / cap) * arc, x = m.pos.x + Math.sin(a) * R, z = m.pos.z + Math.cos(a) * R;
        if (w.isFree(x, z, 0.35) && w.waterDepth(x, z) < 2 && !g.mounds.list.some((o) => o !== m && Math.hypot(o.pos.x - x, o.pos.z - z) < o.r + 0.4)) ok.push(new THREE.Vector3(x, 0, z));
      }
      // (spread out evenly over whatever room there is on this ring)
      const take = Math.min(n - spots.length, ok.length);
      for (let j = 0; j < take; j++) spots.push(ok[Math.floor(((j + 0.5) * ok.length) / take)]);
    }
    // (hemmed in all round? anywhere near will do)
    while (spots.length < n) {
      const a = rand(0, TAU), s = new THREE.Vector3(m.pos.x + Math.sin(a) * (m.r + 1), 0, m.pos.z + Math.cos(a) * (m.r + 1));
      w.resolve(s, 0.35, g.mounds.colliders);
      spots.push(s);
    }
    return spots;
  }

  /** dug out: up he pops, out of the top of the mound, and the crew's with him now */
  pop() {
    const g = this.game, m = this.mound;
    this.stage = 'pop';
    g.player.popOut(this.landing(m));
    _v.set(m.pos.x, m.pos.y + m.h, m.pos.z);
    if (m.beach) g.fx.burst(_v, { n: 30, colors: SAND, speed: [1.5, 4], up: [3, 6.5], size: [0.05, 0.12], life: [0.6, 1.1] });
    else g.fx.dirt(_v, 34, 1.7);
    g.fx.leafBits(_v, 10);
    g.fx.ring(m.pos, 0xffd21f, m.r * 2.4, 0.6);
    m.bump = 1;
    g.audio.erupt();
    g.audio.tada();
    for (const t of this.crew) if (!t.dead && t.state === S.DIGOUT) t.digDone();
    if (this.fresh) g.hud.toast(`With no turkeys left, ${RESCUERS} big ones turned up to dig you out. They're with you now!`, 4.5);
    else if (!this.told) g.hud.toast('Your turkeys dug you out! You come back at the nearest mound: build them as you go (M)', 5.5);
    else g.hud.toast(pick(AGAIN), 2.5);
    this.told = true;
  }

  /** where he comes down, popping out: just off the mound on the camera's side (or round from there, if that's no good) */
  landing(m) {
    const g = this.game, w = g.world, out = new THREE.Vector3(), R = m.r + 1.3;
    for (let i = 0; i < 14; i++) {
      const a = g.cam.yaw + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.45;
      out.set(m.pos.x + Math.sin(a) * R, 0, m.pos.z + Math.cos(a) * R);
      if (w.isFree(out.x, out.z, 0.5) && !w.waterDepth(out.x, out.z) && !g.mounds.blocked(out.x, out.z, 0.5)) break;
    }
    w.resolve(out, g.player.radius, g.mounds.colliders);
    out.y = w.groundHeight(out.x, out.z);
    return out;
  }

  /** back on his feet: all done */
  finish() {
    this.stage = null;
    this.game.timeScale = 1;
    this.game.cam.zoom = this.zoom; // (and the camera eases back out to where you had it)
    this.look(0, 0, 0);
  }

  /** where a save made in the middle of all this should put him: back at the mound he's coming back to */
  comeBack() {
    const m = this.mound;
    return m ? this.landing(m) : this.game.player.pos;
  }

  /** how it all looks: how much the colour's drained out, how far up WASTED is, how dark it's gone (each 0..1) */
  look(grey, text, black) {
    const s = this.shown, r = (v) => Math.round(v * 100) / 100;
    grey = r(grey); text = r(text); black = r(black);
    if (grey !== s.grey) {
      s.grey = grey;
      this.game.renderer.domElement.style.filter = grey ? `grayscale(${grey}) contrast(${1 + grey * 0.15}) brightness(${1 - grey * 0.1})` : '';
      this.shade.style.opacity = grey;
    }
    if (text !== s.text) {
      s.text = text;
      this.el.style.opacity = text;
      this.word.style.transform = `scale(${(1.3 - 0.3 * (1 - (1 - text) ** 3)).toFixed(3)})`; // (settling as it comes up)
    }
    if (black !== s.black) { s.black = black; this.black.style.opacity = black; }
  }
}
