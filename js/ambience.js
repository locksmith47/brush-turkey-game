import { rand, clamp } from './util.js';
import { shoreX } from './props/beach.js';

/*
 * The sound of each place, under everything else that's going on. There's a bed of sound that's always there:
 * a breeze through the bush, the hum of the suburbs, the city's traffic, a crowd at the oval, the surf at
 * Bondi, the harbour slopping about under the wharf. Over the top of it comes the odd call: a kookaburra
 * having a laugh, a whipbird cracking, a magpie warbling, a crow, somebody mowing a few streets over, a car
 * going by, the crossing going off, the crowd going up, gulls. All synthesized, like the rest (see Audio).
 * Walk through a gate and one place fades into the next.
 */
const LEVEL = 1; // the lot of it, against the rest of the game's sounds
const FADE = 1.2; // seconds (a time constant) for one place's bed to fade into the next
const LINGER = 8; // seconds a faded-out bed hangs about (in case you pop straight back), before it's put away
const NOISE_LEN = 6; // seconds of noise the beds loop through (long enough that you can't hear it going round)

// each place's bed: layers of filtered noise, each with a slow swell and ebb to it (wobble: [how much, how often]...)
const BEDS = [
  // the bush: a breeze through the leaves, coming and going, over a low murmur of the trees
  [{ type: 'bandpass', f: 1100, q: 0.5, vol: 0.06, wobble: [[0.55, 0.07], [0.3, 0.19]] }, { type: 'lowpass', f: 300, vol: 0.1 }],
  // the backyards: the far-off hum of the suburbs, and a lighter breeze
  [{ type: 'lowpass', f: 420, vol: 0.12, wobble: [[0.25, 0.05]] }, { type: 'bandpass', f: 1600, q: 0.6, vol: 0.03, wobble: [[0.5, 0.09], [0.3, 0.23]] }],
  // the city: the rumble of traffic, and tyres on the road
  [{ type: 'lowpass', f: 220, vol: 0.3, wobble: [[0.3, 0.06], [0.2, 0.17]] }, { type: 'bandpass', f: 750, q: 0.7, vol: 0.05, wobble: [[0.4, 0.11]] }],
  // the oval: a crowd (from the game at the ground next door), murmuring away, and the breeze across the field
  [{ type: 'bandpass', f: 480, q: 1.4, vol: 0.11, wobble: [[0.3, 0.21], [0.2, 0.37]] }, { type: 'bandpass', f: 1150, q: 2, vol: 0.05, wobble: [[0.4, 0.29], [0.3, 0.53]] }, { type: 'lowpass', f: 500, vol: 0.06 }],
  // Bondi: the roar of the surf, and the hiss of the foam (the waves themselves come in: see wave)
  [{ type: 'lowpass', f: 520, vol: 0.16, wobble: [[0.2, 0.05]] }, { type: 'highpass', f: 3500, vol: 0.007, wobble: [[0.5, 0.12]] }],
  // the wharf: the harbour slopping about under it, and a bit of a breeze off the water
  [{ type: 'lowpass', f: 380, vol: 0.15, wobble: [[0.5, 0.8], [0.3, 1.3]] }, { type: 'bandpass', f: 2000, q: 0.5, vol: 0.012 }],
];

// and the calls over the top: how often (seconds between, give or take), and what, how likely each one is
const CALLS = [
  { every: [7, 16], calls: { kooka: 2, whipbird: 3, bellbirds: 3, crow: 1 } }, // the bush
  { every: [8, 18], calls: { magpie: 3, mower: 2, dog: 2, crow: 1 } }, // the backyards
  { every: [4, 10], calls: { car: 6, crossing: 1.5, beep: 1, brakes: 1 } }, // the city
  { every: [7, 15], calls: { cheer: 2, tock: 2, magpie: 2 } }, // the oval
  { every: [6, 14], calls: { gulls: 1 } }, // Bondi (and the waves: see update)
  { every: [5, 12], calls: { gulls: 2, creak: 2, bell: 1 } }, // the wharf (and the water slapping at the pilings)
];

export class Ambience {
  constructor(game) {
    this.game = game;
    this.bus = null; // (everything in the background goes through this, on its way out to the speakers)
    this.beds = new Map(); // zone -> its bed, while it's playing or fading out
    this.zone = -1;
    this.callT = rand(3, 6);
    this.waveT = 0;
    this.levelT = 0;
  }

  /** set up, once the sound's going (it only can be once you've clicked Play); false till then */
  ready() {
    if (this.bus) return true;
    const a = this.game.audio, c = a.ctx;
    if (!c) return false;
    this.bus = c.createGain();
    this.bus.gain.value = LEVEL;
    this.bus.connect(a.master);
    const len = c.sampleRate * NOISE_LEN;
    this.buf = c.createBuffer(1, len, c.sampleRate);
    const d = this.buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  /** every frame: the bed for wherever you are (fading from the last one), and every so often a call */
  update(dt) {
    const g = this.game, a = g.audio;
    if (!g.started || !this.ready()) return;
    const c = a.ctx, p = g.player.pos, zone = g.world.zoneOf(p.z);
    if (zone !== this.zone) {
      const old = this.beds.get(this.zone);
      if (old) old.out.gain.setTargetAtTime(0, c.currentTime, FADE);
      let bed = this.beds.get(zone);
      if (!bed) this.beds.set(zone, (bed = this.bed(BEDS[zone])));
      bed.idle = 0;
      this.zone = zone;
      this.levelT = 0;
      this.callT = Math.min(this.callT, rand(2, 5)); // (something to hear soon after you get there)
    }
    // (the surf's louder down by the water, and quieter up on the promenade)
    const surf = zone === 4 ? 1 - clamp((shoreX(p.z) - p.x) / 70, 0, 0.6) : 1;
    if ((this.levelT -= dt) <= 0) {
      this.levelT = 0.5;
      this.beds.get(zone).out.gain.setTargetAtTime(LEVEL * surf, c.currentTime, FADE);
    }
    // (a bed that's faded right out is put away, a while after)
    for (const [z, bed] of this.beds) {
      if (z !== zone && (bed.idle += dt) > LINGER) { bed.stop(); this.beds.delete(z); }
    }
    if (a.quiet) return; // (nothing new while the sound's off)

    // the waves rolling in at Bondi, and the water slapping at the wharf's pilings
    if (zone >= 4 && (this.waveT -= dt) <= 0) {
      if (zone === 4) { this.wave(surf); this.waveT = rand(4.5, 7.5); }
      else { this.slap(); this.waveT = rand(0.6, 1.9); }
    }
    if ((this.callT -= dt) > 0) return;
    const set = CALLS[zone];
    this.callT = rand(...set.every);
    let r = Math.random() * Object.values(set.calls).reduce((s, w) => s + w, 0);
    for (const [name, w] of Object.entries(set.calls)) {
      if ((r -= w) > 0) continue;
      this[name](rand(-0.8, 0.8));
      break;
    }
  }

  /* ---------------------------------------------------------------- the building blocks */
  /** a place's bed: layers of filtered noise going round and round (each with its slow swell and ebb) */
  bed(layers) {
    const c = this.game.audio.ctx, out = c.createGain(), nodes = [];
    out.gain.value = 0;
    out.connect(this.bus);
    for (const { type, f, q = 0.7, vol, wobble = [] } of layers) {
      const s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
      s.buffer = this.buf;
      s.loop = true;
      fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      g.gain.value = vol;
      s.connect(fl).connect(g).connect(out);
      s.start(0, rand(0, NOISE_LEN));
      nodes.push(s);
      for (const [depth, hz] of wobble) {
        const l = c.createOscillator(), lg = c.createGain();
        l.frequency.value = hz;
        lg.gain.value = vol * depth;
        l.connect(lg).connect(g.gain);
        l.start(c.currentTime + rand(0, 1 / hz)); // (each swelling in its own time)
        nodes.push(l);
      }
    }
    return { out, idle: 0, stop: () => { for (const n of nodes) n.stop(); out.disconnect(); } };
  }

  /** where a call goes: off to one side (`pan`, -1 left to 1 right), muffled by the distance (`lp`: a lowpass, Hz) */
  out(pan = 0, lp = 0) {
    const c = this.game.audio.ctx, p = c.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    if (!lp) p.connect(this.bus);
    else {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lp;
      p.connect(f).connect(this.bus);
    }
    return p;
  }

  /**
   * A longer sound, faded in and out (a mower going, a car going by, a wave rolling in). It's noise (`type`
   * 'noise'), or a note at `freq` (an oscillator `type`) that can `bend` ([from, to], times `freq`) and wobble
   * (`vib` Hz, `vibHz` times a second). It goes through a filter (`filter`: [type, then the frequencies it
   * sweeps through, evenly over its length], `q`), can come and go in pulses (`trem`: how much, `tremHz`: how
   * quick), and sits off to one side (`pan`) or goes across (`pan`: [from, to]). `vol`: at its loudest
   */
  held({ type = 'noise', freq = 100, bend = null, vib = 0, vibHz = 0, filter = null, q = 0.7, dur = 3, fadeIn = 1, fadeOut = 1, vol = 0.05, trem = 0, tremHz = 0, pan = 0, delay = 0 }) {
    const c = this.game.audio.ctx, t0 = c.currentTime + delay, t1 = t0 + dur;
    const pn = c.createStereoPanner(), g = c.createGain();
    if (Array.isArray(pan)) {
      pn.pan.setValueAtTime(pan[0], t0);
      pn.pan.linearRampToValueAtTime(pan[1], t1);
    } else pn.pan.value = clamp(pan, -1, 1);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + fadeIn);
    g.gain.setValueAtTime(vol, t1 - fadeOut);
    g.gain.linearRampToValueAtTime(0, t1);
    let src;
    if (type === 'noise') {
      src = c.createBufferSource();
      src.buffer = this.buf;
      src.loop = true;
      src.start(t0, rand(0, NOISE_LEN));
    } else {
      src = c.createOscillator();
      src.type = type;
      src.frequency.setValueAtTime(freq * (bend ? bend[0] : 1), t0);
      if (bend) src.frequency.linearRampToValueAtTime(freq * bend[1], t1);
      src.start(t0);
      if (vib) {
        const l = c.createOscillator(), lg = c.createGain();
        l.frequency.value = vibHz;
        lg.gain.value = vib;
        l.connect(lg).connect(src.frequency);
        l.start(t0); l.stop(t1);
      }
    }
    src.stop(t1 + 0.05);
    let node = src;
    if (filter) {
      const [ft, ...fs] = filter, f = c.createBiquadFilter();
      f.type = ft;
      f.Q.value = q;
      f.frequency.setValueAtTime(fs[0], t0);
      fs.slice(1).forEach((v, i) => f.frequency.linearRampToValueAtTime(v, t0 + (dur * (i + 1)) / (fs.length - 1)));
      node = node.connect(f);
    }
    if (trem) {
      const tg = c.createGain(), l = c.createOscillator(), lg = c.createGain();
      tg.gain.value = 1 - trem / 2;
      l.frequency.value = tremHz;
      lg.gain.value = trem / 2;
      l.connect(lg).connect(tg.gain);
      l.start(t0); l.stop(t1);
      node = node.connect(tg);
    }
    node.connect(g).connect(pn).connect(this.bus);
  }

  /* ---------------------------------------------------------------- the bush */
  /** a kookaburra having a good laugh: a chuckle that builds into a cackle and dies off, with a mate joining in */
  kooka(pan) {
    const a = this.game.audio;
    for (const [who, at, n, side] of [[1, 0, 24, 0], [0.86, 0.55, 17, 0.35]]) {
      const out = this.out(pan + side, 3200);
      for (let i = 0; i < n; i++) {
        const u = i / n, t = at + i * 0.1 + (i ? rand(-0.015, 0.015) : 0);
        const loud = Math.min(1, 0.3 + u * 2.4) * clamp(1 - (u - 0.72) / 0.4, 0.15, 1) * who;
        const f = (620 + 950 * Math.sin(Math.PI * Math.min(1, u * 1.25))) * (i % 2 ? 1.24 : 1) * (0.9 + who * 0.1);
        a.tone({ freq: f, freq2: f * 0.7, type: 'sawtooth', dur: 0.085, vol: 0.08 * loud, attack: 0.01, delay: t, vib: f * 0.06, vibHz: 42, out });
        a.noise({ dur: 0.06, vol: 0.04 * loud, type: 'bandpass', f1: f * 2, q: 3, delay: t, out });
      }
    }
  }

  /** an eastern whipbird: a long whistle, rising, that cracks like a whip at the end (and his missus answers: chew-chew) */
  whipbird(pan) {
    const a = this.game.audio, out = this.out(pan, 8000);
    a.tone({ freq: 1900, freq2: 2600, dur: 1.15, vol: 0.06, attack: 0.95, out });
    a.tone({ freq: 2300, freq2: 7400, dur: 0.07, vol: 0.09, delay: 1.1, out });
    a.noise({ dur: 0.05, vol: 0.05, type: 'highpass', f1: 4500, delay: 1.14, out });
    for (const d of [1.34, 1.52]) a.tone({ freq: 3100, freq2: 2100, dur: 0.11, vol: 0.05, attack: 0.01, delay: d, out: this.out(pan - 0.5) });
  }

  /** bell miners: little pings, clear as a bell, here and there through the trees */
  bellbirds(pan) {
    const a = this.game.audio;
    for (let i = 0, n = 4 + ((Math.random() * 4) | 0), t = 0; i < n; i++, t += rand(0.25, 0.9)) {
      a.tone({ freq: rand(2500, 2900), dur: 0.22, vol: 0.035, attack: 0.004, delay: t, out: this.out(pan + rand(-0.4, 0.4)) });
    }
  }

  /** a crow (an Australian raven, strictly) somewhere off in the distance: aah... aah... aaaaah */
  crow(pan) {
    const a = this.game.audio, out = this.out(pan, 2400);
    [[0, 0.3], [0.45, 0.3], [0.9, 0.8]].forEach(([d, len], i) => {
      a.tone({ freq: 560 - i * 20, freq2: 430 - i * 50, type: 'sawtooth', dur: len, vol: 0.06, attack: 0.04, delay: d, vib: 18, vibHz: 28, out });
      a.noise({ dur: len * 0.8, vol: 0.024, type: 'bandpass', f1: 1100, q: 2, delay: d, out });
    });
  }

  /* ---------------------------------------------------------------- the backyards (and the oval) */
  /** a magpie carolling, and another one joining in: a warbling tumble of notes, like a gargle of flutes */
  magpie(pan) {
    const a = this.game.audio, notes = [587, 659, 784, 880, 988, 1175, 1319, 1568];
    for (const [side, at] of [[0, 0], [0.4, 0.45]]) {
      const out = this.out(pan + side, 5000);
      let t = at, f = notes[(Math.random() * notes.length) | 0];
      for (let i = 0; i < 9; i++) {
        const f2 = notes[(Math.random() * notes.length) | 0], len = rand(0.09, 0.2);
        a.tone({ freq: f, freq2: f2, type: 'triangle', dur: len, vol: 0.065, attack: 0.02, delay: t, vib: f * 0.03, vibHz: 22, out });
        f = f2;
        t += len * rand(0.7, 1.1);
      }
    }
  }

  /** somebody mowing their lawn a few streets over: it starts up, drones on a while, and stops */
  mower(pan) {
    const dur = rand(10, 13);
    this.held({ type: 'sawtooth', freq: rand(56, 64), bend: [0.97, 1.02], vib: 1.5, vibHz: 0.7, filter: ['lowpass', 520], dur, fadeIn: 2.5, fadeOut: 3, vol: 0.055, pan });
  }

  /** a dog over the back fence, having a bark at something */
  dog(pan) {
    const a = this.game.audio, out = this.out(pan, 2200);
    for (let i = 0, n = 2 + ((Math.random() * 3) | 0), t = 0; i < n; i++, t += rand(0.28, 0.4)) {
      a.tone({ freq: 460, freq2: 300, type: 'sawtooth', dur: 0.13, vol: 0.06, attack: 0.01, delay: t, vib: 30, vibHz: 50, out });
      a.noise({ dur: 0.1, vol: 0.045, type: 'bandpass', f1: 800, q: 1.5, delay: t, out });
    }
  }

  /* ---------------------------------------------------------------- the city */
  /** a car going by, from one side across to the other (its engine dropping as it goes past) */
  car() {
    const dir = Math.random() < 0.5 ? 1 : -1, dur = rand(2.2, 3.2), pan = [-0.9 * dir, 0.9 * dir];
    this.held({ type: 'noise', filter: ['bandpass', 420, 1300, 380], q: 0.9, dur, fadeIn: dur * 0.5, fadeOut: dur * 0.5, vol: 0.17, pan });
    this.held({ type: 'sawtooth', freq: rand(70, 90), bend: [1.08, 0.9], filter: ['lowpass', 300], dur, fadeIn: dur * 0.5, fadeOut: dur * 0.5, vol: 0.05, pan });
  }

  /** the pedestrian crossing: tock... tock... tock... then the zap, and the rapid ticking (quick, across you go) */
  crossing(pan) {
    const a = this.game.audio, out = this.out(pan, 6000);
    let t = 0;
    for (let i = 0; i < 3; i++, t += 0.95) a.tone({ freq: 880, type: 'square', dur: 0.035, vol: 0.04, delay: t, out });
    a.tone({ freq: 2600, freq2: 700, dur: 0.16, vol: 0.06, delay: t, out }); // (pew!)
    for (t += 0.2; t < 6.5; t += 0.1) a.tone({ freq: 1100, type: 'square', dur: 0.02, vol: 0.035, delay: t, out });
  }

  /** a toot of a car horn, somewhere down the street: somebody's not happy */
  beep(pan) {
    const a = this.game.audio, out = this.out(pan, 2500);
    for (const [d, len] of [[0, 0.14], [0.22, 0.34]]) {
      for (const f of [415, 523]) a.tone({ freq: f, type: 'square', dur: len, vol: 0.03, attack: 0.01, delay: d, out });
    }
  }

  /** a bus pulling up at a stop: the air brakes going psssht */
  brakes(pan) {
    this.game.audio.noise({ dur: 0.9, vol: 0.055, type: 'highpass', f1: 2500, f2: 4500, attack: 0.03, out: this.out(pan) });
  }

  /* ---------------------------------------------------------------- the oval */
  /** the crowd at the ground next door going up for something (a six, maybe), then a round of applause */
  cheer(pan) {
    this.held({ type: 'noise', filter: ['bandpass', 500, 900, 650], q: 0.9, dur: 3.2, fadeIn: 0.8, fadeOut: 2, vol: 0.24, pan });
    this.held({ type: 'noise', filter: ['bandpass', 2400], q: 0.6, dur: 3, fadeIn: 1.2, fadeOut: 1.6, vol: 0.1, trem: 0.8, tremHz: 11, delay: 0.8, pan });
  }

  /** leather on willow, over at the nets */
  tock(pan) {
    const a = this.game.audio, out = this.out(pan, 5000);
    a.tone({ freq: 1250, freq2: 900, type: 'triangle', dur: 0.06, vol: 0.065, out });
    a.noise({ dur: 0.03, vol: 0.04, type: 'bandpass', f1: 2500, q: 2, out });
  }

  /* ---------------------------------------------------------------- Bondi and the wharf */
  /** a wave rolling in and breaking, then the foam hissing up the sand (`k`: how near the water you are) */
  wave(k) {
    const pan = Math.cos(this.game.cam.yaw) * 0.6; // (the sea's off to the east)
    this.held({ type: 'noise', filter: ['lowpass', 280, 900, 420], q: 0.5, dur: 4.2, fadeIn: 2, fadeOut: 2.2, vol: 0.28 * k, pan });
    this.held({ type: 'noise', filter: ['bandpass', 1800, 3200], q: 0.5, dur: 2.8, fadeIn: 0.25, fadeOut: 2.4, vol: 0.045 * k, delay: 1.8, pan: pan * 0.6 });
  }

  /** the harbour slapping at the pilings, under the wharf */
  slap() {
    this.game.audio.noise({ dur: rand(0.2, 0.35), vol: rand(0.12, 0.22), type: 'lowpass', f1: 700, f2: 250, attack: 0.02, out: this.out(rand(-0.5, 0.5)) });
  }

  /** a gull or two: kee-ow, kee-ow (`k`: louder, for the ones going right over you) */
  gulls(pan, k = 1) {
    const a = this.game.audio;
    for (let i = 0, n = 2 + ((Math.random() * 3) | 0), t = 0; i < n; i++, t += rand(0.4, 0.65)) {
      const f = rand(1150, 1400), out = this.out(pan + rand(-0.2, 0.2), 4500);
      a.tone({ freq: f, freq2: f * 1.5, type: 'sawtooth', dur: 0.08, vol: 0.07 * k, attack: 0.02, delay: t, vib: 60, vibHz: 38, out });
      a.tone({ freq: f * 1.5, freq2: f * 0.85, type: 'sawtooth', dur: 0.32, vol: 0.08 * k, attack: 0.01, delay: t + 0.07, vib: 70, vibHz: 38, out });
    }
  }

  /** a mooring rope creaking as the ferry rides the swell */
  creak(pan) {
    this.game.audio.tone({ freq: 280, freq2: 360, type: 'sawtooth', dur: 0.5, vol: 0.03, attack: 0.1, vib: 25, vibHz: 32, out: this.out(pan, 1500) });
  }

  /** the bell on a buoy out in the harbour: ding */
  bell(pan) {
    const a = this.game.audio, out = this.out(pan, 6000);
    a.tone({ freq: 1175, dur: 2.6, vol: 0.035, attack: 0.003, out });
    a.tone({ freq: 2950, dur: 1.2, vol: 0.01, attack: 0.003, out });
  }

  /* ---------------------------------------------------------------- birds going over (see Flyovers) */
  /** a sulphur-crested cockatoo's screech, a galah's chet-chet, or a gull (`pan`: where it is, across the screen) */
  screech(kind, pan) {
    const a = this.game.audio;
    if (a.quiet || !this.ready()) return;
    if (kind === 'gull') { this.gulls(pan, 1.4); return; }
    const out = this.out(pan);
    if (kind === 'cockatoo') {
      const f = rand(850, 1000);
      a.tone({ freq: f, freq2: f * 1.4, type: 'sawtooth', dur: 0.55, vol: 0.15, attack: 0.03, vib: 300, vibHz: 75, out });
      a.noise({ dur: 0.5, vol: 0.12, type: 'bandpass', f1: 2200, f2: 1600, q: 1.2, attack: 0.03, out });
    } else {
      for (const d of [0, 0.16]) a.tone({ freq: rand(2200, 2400), freq2: 1600, type: 'sawtooth', dur: 0.1, vol: 0.14, attack: 0.01, delay: d, vib: 150, vibHz: 60, out });
    }
  }
}
