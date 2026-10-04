import { S } from './turkey.js';
import { OUTSIDE, inMouth } from './props/milsons.js';
import { smoothstep } from './util.js';
import { LUNA } from './world.js';

/*
 * As far as it goes, for now: in through Luna Park's mouth, a few steps along the way in, it all goes black, and up come
 * the words. A key (or a click) and you're back out in front of the face, your squad round you. Like going down, it
 * runs in real time.
 */
const DARK_T = 1.2; // going black...
const WORDS_T = 1.6; // ...and the words coming up out of it
const READY_T = 2.6; // (seconds of them before a key will take you back)
const LIGHT_T = 1.1; // back out in front of the face

export class Ending {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('ending');
    this.words = this.el.querySelector('.words');
    this.hint = this.el.querySelector('.hint');
    this.stage = null; // 'dark', 'words' or 'back'
    this.t = 0;
    this.seen = false; // (you've been in, at least the once: it's saved)
    this.shown = {};
  }

  get active() { return this.stage !== null; }

  /** real seconds since the last frame */
  update(real) {
    const g = this.game, p = g.player, input = g.input;
    if (!this.stage) {
      if (g.started && p.life === 'ok' && !g.ride.active && inMouth(p.pos.x, p.pos.z) && g.world.zoneOf(p.pos.x, p.pos.z) === LUNA) { // (the mouth's lined up with a strip right across the map: the bush's gate's on it)
        this.stage = 'dark';
        this.t = 0;
      }
      return;
    }
    const t = (this.t += real);
    p.iframes = Math.max(p.iframes, 0.5); // (nothing's having a go at you while you can't see it)
    if (this.stage === 'dark') {
      this.look(smoothstep(0, DARK_T, t), 0, 0);
      if (t >= DARK_T) {
        this.stage = 'words';
        this.t = 0;
        this.seen = true;
        this.out();
        g.audio.fanfare();
      }
    } else if (this.stage === 'words') {
      this.look(1, smoothstep(0, WORDS_T, t), smoothstep(READY_T, READY_T + 0.8, t));
      if (t >= READY_T && (input.hits.size || input.lmbPressed)) {
        this.stage = 'back';
        this.t = 0;
      }
    } else {
      this.look(1 - smoothstep(0.2, LIGHT_T, t), 1 - smoothstep(0, 0.5, t), 1 - smoothstep(0, 0.3, t));
      if (t >= LIGHT_T) this.stage = null;
    }
  }

  /** where a save made in the middle of it should put you: out in front of the face */
  comeBack() { return { x: OUTSIDE[0], z: OUTSIDE[1] }; }
  get zoom() { return this.game.cam.zoom; }

  /**
   * (all black) back out in front of the face, facing back down the forecourt, and the squad that came in with you
   * gathered just behind you, the way they do
   */
  out() {
    const g = this.game, p = g.player, tk = g.turkeys, [x, z] = OUTSIDE, was = p.pos.clone();
    p.pos.set(x, g.world.groundHeight(x, z), z);
    p.heading = -Math.PI / 2;
    p.vel.set(0, 0, 0);
    g.cam.target.set(x, p.pos.y + 1, z);
    const back = p.heading + Math.PI, d = 0.55 + tk.blobR; // (see Turkeys: where they gather)
    tk.rally.x = x + Math.sin(back) * d;
    tk.rally.z = z + Math.cos(back) * d;
    tk.list.forEach((t) => {
      if (t.state !== S.FOLLOW || Math.hypot(t.pos.x - was.x, t.pos.z - was.z) > 12) return;
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * tk.blobR;
      const tx = tk.rally.x + Math.cos(a) * r, tz = tk.rally.z + Math.sin(a) * r;
      t.pos.set(tx, g.world.groundHeight(tx, tz), tz);
    });
  }

  /** how it looks: how black, and how far up the words are, and the hint under them (each 0..1) */
  look(black, words, hint) {
    const s = this.shown, r = (v) => Math.round(v * 100) / 100;
    black = r(black); words = r(words); hint = r(hint);
    if (black !== s.black) {
      if (!black !== !s.black) this.el.classList.toggle('hidden', !black);
      s.black = black;
      this.el.style.opacity = black;
    }
    if (words !== s.words) { s.words = words; this.words.style.opacity = words; }
    if (hint !== s.hint) { s.hint = hint; this.hint.style.opacity = hint; }
  }
}
