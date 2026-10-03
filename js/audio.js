/*
 * Tiny WebAudio synth: nearly every sound is generated as it's needed. The birds are the exception: they're real
 * recordings, cut down to single calls (in sounds/, and where each one came from is in sounds/CREDITS.txt and on the
 * pause screen). They come in once you've clicked Play, and till they do (or if they can't be had), the synthesized
 * ones stand in for them.
 */
const VOL = 0.45; // the lot, all together
// (sound off, remembered in the browser for next time: each copy of the game keeps its own, under the game's old name, like the save)
const OFF_KEY = `turkmin-sound-off:${location.pathname.replace(/index\.html$/, '')}`;
// the recordings: how many single calls there are of each (sounds/<name>-<1 to n>.mp3). They're all as loud as each
// other (the loudest fifth of a second of each, at -20 LUFS), and LEVEL is how loud each lot goes in (times the file),
// to sit where the synthesized sound it stands in for did
const BIRDS = { brushturkey: 9, silvergull: 4, galah: 4, cockatoo: 5, cockatoos: 1, boom: 1 };
const LEVEL = { brushturkey: 0.38, silvergull: 0.21, galah: 0.25, cockatoo: 0.39, cockatoos: 0.17, boom: 0.57 };
// a male's boom, as it goes in the recording (sounds/boom-1.mp3): when each of its three notes starts and how long it
// goes (seconds in), and how loud it is (times the loudest). The synthesized one keeps to it, and so does his pumping
// away with it (see Turkey.pose)
export const BOOM = [[0.03, 0.085, 0.45], [0.31, 0.105, 0.9], [0.515, 0.33, 1]];
// the bigger turkeys' honks (they'd a bit much to say): the share of the times they'd honk that they do, and the least
// milliseconds between two honks of the one size
const HONK = { share: 0.5, gap: 500 };

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.whistleOsc = null;
    this.last = {};
    this.birds = {}; // name -> its recordings, as they come in
    this.lastBird = {}; // (the one each played last time: not that one again straight off)
    this.muted = false; // (while a save's being put back)
    try { this.off = localStorage.getItem(OFF_KEY) === '1'; } catch { this.off = false; } // (you've turned it off: N)
  }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.off ? 0 : VOL;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.fetchBirds();
  }

  /** the recordings, fetched and decoded (each one's there to be heard the moment it's in) */
  fetchBirds() {
    for (const [name, n] of Object.entries(BIRDS)) {
      const set = (this.birds[name] = []);
      for (let i = 1; i <= n; i++) {
        fetch(`sounds/${name}-${i}.mp3`)
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status}`))))
          .then((b) => this.ctx.decodeAudioData(b))
          .then((buf) => set.push(buf))
          .catch(() => { /* (not to be had: the rest of them, or the synthesized call, will do) */ });
      }
    }
  }

  /** are any of the recordings of `name` in yet? */
  has(name) { return !!this.birds[name]?.length; }

  /**
   * One of the recordings of `name` (a different one from last time, if there's a choice), `rate` times as fast (and
   * as high), at `vol` times its LEVEL, `delay` seconds from now, going to `out`. False if there's none in yet, so
   * the synthesized one's wanted instead
   */
  bird(name, { rate = 1, vol = 1, delay = 0, out = this.master } = {}) {
    const set = this.birds[name];
    if (!set?.length) return false;
    if (this.quiet) return true;
    let i = (Math.random() * set.length) | 0;
    if (set.length > 1 && i === this.lastBird[name]) i = (i + 1 + ((Math.random() * (set.length - 1)) | 0)) % set.length;
    this.lastBird[name] = i;
    const c = this.ctx, s = c.createBufferSource(), g = c.createGain();
    s.buffer = set[i];
    s.playbackRate.value = rate;
    g.gain.value = LEVEL[name] * vol;
    s.connect(g).connect(out);
    s.start(c.currentTime + delay);
    return true;
  }

  /** N: all the sound off, or back on again (fading what's playing, and remembered for next time); true if it's off */
  toggleOff() {
    this.off = !this.off;
    try { localStorage.setItem(OFF_KEY, this.off ? '1' : '0'); } catch { /* (it just won't be remembered) */ }
    if (this.ctx) this.master.gain.setTargetAtTime(this.off ? 0 : VOL, this.ctx.currentTime, 0.03);
    return this.off;
  }

  /** paused (Esc): everything stops where it is, mid-honk and all, and carries on from there after */
  pause(on) {
    if (!this.ctx) return;
    if (on) this.ctx.suspend();
    else this.ctx.resume();
  }

  /** nothing to be heard: no sound yet, a save being put back, or you've turned it off */
  get quiet() { return !this.ctx || this.muted || this.off; }

  ok(name, ms) {
    if (this.quiet) return false;
    const now = performance.now();
    if (name && this.last[name] && now - this.last[name] < ms) return false;
    if (name) this.last[name] = now;
    return true;
  }

  /** `out`: where it goes (straight to the speakers, unless it's panned or part of the background: see Ambience) */
  tone({ freq = 440, freq2 = null, type = 'sine', dur = 0.15, vol = 0.3, attack = 0.005, delay = 0, vib = 0, vibHz = 0, out = this.master }) {
    if (this.quiet) return;
    const c = this.ctx, t0 = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (freq2) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq2), t0 + dur);
    if (vib) {
      const l = c.createOscillator(), lg = c.createGain();
      l.frequency.value = vibHz; lg.gain.value = vib;
      l.connect(lg).connect(o.frequency);
      l.start(t0); l.stop(t0 + dur + 0.05);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(out);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  noise({ dur = 0.2, vol = 0.2, type = 'bandpass', f1 = 1000, f2 = null, q = 1, delay = 0, attack = 0.01, out = this.master }) {
    if (this.quiet) return;
    const c = this.ctx, t0 = c.currentTime + delay;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf;
    s.loop = true; // (the buffer's only a second long: a long one would stop dead when it ran out)
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f1, t0);
    if (f2) f.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f).connect(g).connect(out);
    s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.05);
  }

  /* ---------------------------------------------------------------- game sounds */
  pluck() {
    if (!this.ok('pluck', 60)) return;
    this.noise({ dur: 0.08, vol: 0.25, f1: 2500, f2: 800, q: 0.8 });
    this.tone({ freq: 260, freq2: 1100, dur: 0.12, vol: 0.3, delay: 0.02 });
  }

  throw() {
    if (!this.ok('throw', 40)) return;
    this.noise({ dur: 0.3, vol: 0.18, f1: 500, f2: 2600, q: 2.5, attack: 0.03 });
  }

  land() {
    if (!this.ok('land', 50)) return;
    this.noise({ dur: 0.12, vol: 0.18, type: 'lowpass', f1: 700, f2: 200 });
  }

  /**
   * A turkey piping up: a chick peeps, and the bigger ones honk (the real thing: a juvenile's a bit higher and
   * quieter), only so often (see HONK). `always`: it's answering you (Tab or X), so it always does
   */
  peep(stage = 0, always = false) {
    if (stage && !always && Math.random() > HONK.share) return;
    if (!this.ok('peep' + stage, stage && !always ? HONK.gap : 90)) return;
    const p = 1 + (Math.random() - 0.5) * 0.15;
    if (stage && this.bird('brushturkey', { rate: p * (stage === 1 ? 1.25 : 1), vol: stage === 1 ? 0.5 : 1 })) return;
    if (stage === 0) {
      this.tone({ freq: 3000 * p, freq2: 2300 * p, dur: 0.07, vol: 0.12 });
      this.tone({ freq: 3200 * p, freq2: 2500 * p, dur: 0.07, vol: 0.1, delay: 0.09 });
    } else if (stage === 1) {
      this.tone({ freq: 1500 * p, freq2: 900 * p, dur: 0.12, vol: 0.13, type: 'triangle' });
    } else {
      this.tone({ freq: 170 * p, freq2: 120 * p, dur: 0.28, vol: 0.28, type: 'sawtooth', vib: 18, vibHz: 22 });
    }
  }

  /**
   * A male booming, his neck sac puffed right up: three deep, hollow ooms, the last one the longest (see BOOM). `vol`:
   * how loud (he's a way off, say); `rate`: how fast, and high, he goes (his notes come at BOOM's times over `rate`)
   */
  boom(vol = 1, rate = 1) {
    if (!this.ok('boom', 300)) return;
    if (this.bird('boom', { rate, vol })) return;
    // (till the real one's in: a hum for each note, with a lower one under it, and the last one falling away)
    for (const [at, len, k] of BOOM) {
      const o = { dur: (len + 0.15) / rate, attack: 0.02, delay: at / rate, vib: 5, vibHz: 20 }, end = len > 0.2 ? 0.7 : 0.95;
      this.tone({ ...o, freq: 330 * rate, freq2: 330 * end * rate, vol: 0.2 * k * vol });
      this.tone({ ...o, freq: 165 * rate, freq2: 165 * end * rate, vol: 0.06 * k * vol, type: 'triangle' });
    }
  }

  whistleStart() {
    if (!this.ctx || this.whistleOsc) return;
    const c = this.ctx, t0 = c.currentTime;
    const o = c.createOscillator(), g = c.createGain(), l = c.createOscillator(), lg = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(1700, t0);
    o.frequency.linearRampToValueAtTime(2300, t0 + 0.5);
    l.frequency.value = 9; lg.gain.value = 55;
    l.connect(lg).connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.13, t0 + 0.04);
    o.connect(g).connect(this.master);
    o.start(t0); l.start(t0);
    this.whistleOsc = { o, g, l };
  }

  whistleStop() {
    if (!this.whistleOsc) return;
    const { o, g, l } = this.whistleOsc, t0 = this.ctx.currentTime;
    g.gain.cancelScheduledValues(t0);
    g.gain.setValueAtTime(g.gain.value, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08);
    o.stop(t0 + 0.1); l.stop(t0 + 0.1);
    this.whistleOsc = null;
  }

  leaf() {
    if (!this.ok('leaf', 45)) return;
    this.noise({ dur: 0.1, vol: 0.09, type: 'highpass', f1: 3000, q: 0.5 });
  }

  mound() {
    if (!this.ok('mound', 50)) return;
    this.noise({ dur: 0.14, vol: 0.12, type: 'lowpass', f1: 900, f2: 300 });
    this.tone({ freq: 520, freq2: 700, dur: 0.07, vol: 0.06, type: 'triangle', delay: 0.02 });
  }

  rumble(dur = 1.2) {
    if (!this.ok('rumble', 300)) return;
    this.noise({ dur, vol: 0.35, type: 'lowpass', f1: 160, f2: 90, attack: 0.3 });
  }

  erupt() {
    if (!this.ok('erupt', 200)) return;
    this.noise({ dur: 0.6, vol: 0.4, type: 'lowpass', f1: 400, f2: 60 });
    this.tone({ freq: 90, freq2: 40, dur: 0.5, vol: 0.4 });
  }

  fwoop() {
    if (!this.ok('fwoop', 60)) return;
    this.tone({ freq: 300, freq2: 1400, dur: 0.22, vol: 0.14, type: 'triangle' });
  }

  grow() {
    if (!this.ok('grow', 100)) return;
    [660, 880, 1100, 1320].forEach((f, i) => this.tone({ freq: f, dur: 0.12, vol: 0.12, type: 'triangle', delay: i * 0.07 }));
  }

  gulp() {
    if (!this.ok('gulp', 80)) return;
    this.tone({ freq: 400, freq2: 140, dur: 0.12, vol: 0.2 });
  }

  build() {
    if (!this.ctx) return;
    [392, 523, 659].forEach((f, i) => this.tone({ freq: f, dur: 0.18, vol: 0.14, type: 'square', delay: i * 0.09 }));
  }

  nope() {
    if (!this.ok('nope', 250)) return;
    this.tone({ freq: 180, freq2: 140, dur: 0.18, vol: 0.14, type: 'square' });
  }

  /** picking out a mound on the map, down in the tunnels */
  tick() {
    if (!this.ok('tick', 40)) return;
    this.tone({ freq: 1250, freq2: 950, dur: 0.06, vol: 0.08, type: 'triangle' });
  }
  /* ---------------------------------------------------------------- you: hurt, down and dug out */
  /** a grunt when something gets you (a bigger one when it's the last straw) */
  oof(last = false) {
    if (!this.ok('oof', 120)) return;
    const f = last ? 150 : 190 + Math.random() * 40;
    this.tone({ freq: f, freq2: f * 0.6, dur: last ? 0.45 : 0.2, vol: 0.28, type: 'sawtooth', vib: 12, vibHz: 30 });
    this.tone({ freq: f * 2.1, freq2: f * 1.2, dur: last ? 0.35 : 0.16, vol: 0.07, type: 'square' });
    this.noise({ dur: 0.12, vol: 0.2, type: 'bandpass', f1: 900, q: 1.5 });
  }

  /** hitting the deck, flat on your back */
  thud() {
    if (!this.ctx) return;
    this.tone({ freq: 110, freq2: 45, dur: 0.35, vol: 0.4 });
    this.noise({ dur: 0.25, vol: 0.25, type: 'lowpass', f1: 600, f2: 120 });
  }

  /** WASTED: a swell of noise rushing in, then a deep boom (and a long low drone after) as the word comes up */
  wasted() {
    if (!this.ctx) return;
    this.noise({ dur: 1.1, vol: 0.2, type: 'lowpass', f1: 250, f2: 1600, attack: 0.9 });
    this.tone({ freq: 68, freq2: 30, dur: 2.4, vol: 0.5, delay: 0.95 });
    this.noise({ dur: 1.6, vol: 0.3, type: 'lowpass', f1: 1000, f2: 80, delay: 0.95 });
    this.tone({ freq: 196, freq2: 98, dur: 2.2, vol: 0.09, type: 'triangle', delay: 0.95, attack: 0.05 });
    this.tone({ freq: 233, freq2: 116, dur: 2.2, vol: 0.06, type: 'triangle', delay: 0.95, attack: 0.05 });
  }

  /** your heart going, when you're in a bad way */
  heartbeat() {
    if (!this.ok('heart', 400)) return;
    this.tone({ freq: 70, freq2: 42, dur: 0.14, vol: 0.34 });
    this.noise({ dur: 0.07, vol: 0.08, type: 'lowpass', f1: 240 });
    this.tone({ freq: 62, freq2: 40, dur: 0.14, vol: 0.24, delay: 0.2 });
  }

  /** out of the mound you pop: ta-da */
  tada() {
    if (!this.ctx) return;
    [523, 659, 784, 1046].forEach((f, i) => {
      this.tone({ freq: f, dur: i === 3 ? 0.5 : 0.14, vol: 0.12, type: 'square', delay: 0.05 + i * 0.08 });
      this.tone({ freq: f / 2, dur: i === 3 ? 0.5 : 0.14, vol: 0.08, type: 'triangle', delay: 0.05 + i * 0.08 });
    });
  }
  /* ---------------------------------------------------------------- combat */
  peck() {
    if (!this.ok('peck', 70)) return;
    this.noise({ dur: 0.05, vol: 0.12, type: 'bandpass', f1: 1800, q: 3 });
  }

  squawk(size = 1, dying = false) {
    if (!this.ok('squawk' + (dying ? 'd' : ''), 250)) return;
    const f = 900 / Math.sqrt(size);
    this.tone({ freq: f, freq2: f * (dying ? 0.35 : 0.7), dur: dying ? 0.6 : 0.25, vol: 0.2, type: 'sawtooth', vib: f * 0.08, vibHz: 30 });
    this.noise({ dur: 0.2, vol: 0.08, type: 'bandpass', f1: f * 2, q: 4 });
  }

  die(stage = 0) {
    if (!this.ok('die', 60)) return;
    const f = [1500, 900, 400][stage];
    this.tone({ freq: f, freq2: f * 0.4, dur: 0.25, vol: 0.16, type: 'triangle' });
  }

  ghost() {
    if (!this.ok('ghost', 120)) return;
    this.tone({ freq: 700, freq2: 300, dur: 1.1, vol: 0.07, type: 'sine', vib: 20, vibHz: 6, attack: 0.15 });
  }

  stomp(size = 1) {
    if (!this.ok('stomp', 100)) return;
    this.tone({ freq: 90 / Math.sqrt(size / 2.7), freq2: 35, dur: 0.45, vol: 0.45 });
    this.noise({ dur: 0.35, vol: 0.3, type: 'lowpass', f1: 500, f2: 80 });
  }

  thunk() {
    if (!this.ok('thunk', 110)) return;
    this.tone({ freq: 220, freq2: 140, dur: 0.08, vol: 0.18, type: 'triangle' });
    this.noise({ dur: 0.05, vol: 0.1, type: 'bandpass', f1: 900, q: 2 });
  }

  /** a hard knock off a helmet */
  clonk() {
    if (!this.ok('clonk', 120)) return;
    this.tone({ freq: 520, freq2: 380, dur: 0.12, vol: 0.2, type: 'triangle' });
    this.noise({ dur: 0.06, vol: 0.14, type: 'bandpass', f1: 1800, q: 3 });
    this.tone({ freq: 1560, dur: 0.1, vol: 0.04, type: 'square', delay: 0.01 });
  }

  /** a plover sounding off: kek-kek-kek-kek */
  kek() {
    if (!this.ok('kek', 700)) return;
    for (let i = 0; i < 5; i++) {
      const f = 2300 + Math.random() * 300;
      this.tone({ freq: f, freq2: f * 0.8, dur: 0.07, vol: 0.13, type: 'sawtooth', delay: i * 0.11 });
      this.noise({ dur: 0.05, vol: 0.05, type: 'bandpass', f1: f * 1.4, q: 5, delay: i * 0.11 });
    }
  }

  /** a gull going up: a harsh kee-ow, kee-ow (lower and louder, the bigger it is) */
  gull(size = 1) {
    if (!this.ok('gull', 500)) return;
    const k = Math.min(1.5, Math.max(0.6, size / 1.3));
    if (this.bird('silvergull', { rate: (0.96 + Math.random() * 0.08) / Math.sqrt(k), vol: k })) return;
    for (let i = 0, t = 0; i < 2; i++, t += 0.42) {
      const f = (1250 + Math.random() * 150) / Math.sqrt(k);
      this.tone({ freq: f, freq2: f * 1.5, type: 'sawtooth', dur: 0.08, vol: 0.08 * k, attack: 0.02, delay: t, vib: 60, vibHz: 38 });
      this.tone({ freq: f * 1.5, freq2: f * 0.85, type: 'sawtooth', dur: 0.3, vol: 0.09 * k, attack: 0.01, delay: t + 0.07, vib: 70, vibHz: 38 });
    }
  }

  /** knocked silly: a little tweet-tweet-tweet, going round and round */
  dazed() {
    if (!this.ok('dazed', 400)) return;
    for (let i = 0; i < 4; i++) this.tone({ freq: 2200 + (i % 2) * 500, freq2: 2600 + (i % 2) * 500, dur: 0.07, vol: 0.05, type: 'sine', delay: 0.05 + i * 0.13 });
  }

  clang() {
    if (!this.ok('clang', 120)) return;
    this.tone({ freq: 1300, freq2: 1250, dur: 0.18, vol: 0.07, type: 'square' });
    this.tone({ freq: 1870, dur: 0.14, vol: 0.05, type: 'triangle' });
  }

  crash() {
    if (!this.ctx) return;
    this.noise({ dur: 0.8, vol: 0.4, type: 'lowpass', f1: 1500, f2: 100 });
    this.tone({ freq: 120, freq2: 50, dur: 0.5, vol: 0.3 });
  }

  roar() {
    if (!this.ok('roar', 2000)) return;
    this.tone({ freq: 240, freq2: 90, dur: 1.4, vol: 0.35, type: 'sawtooth', vib: 30, vibHz: 18, attack: 0.1 });
    this.noise({ dur: 1.2, vol: 0.2, type: 'bandpass', f1: 600, f2: 200, q: 1.5, attack: 0.1 });
  }

  absorb() {
    if (!this.ctx) return;
    this.noise({ dur: 0.7, vol: 0.3, type: 'lowpass', f1: 800, f2: 120 });
    [523, 659, 784, 1046].forEach((f, i) => this.tone({ freq: f, dur: 0.2, vol: 0.1, type: 'triangle', delay: 0.2 + i * 0.08 }));
  }

  fanfare() {
    if (!this.ctx) return;
    [[392, 0], [523, 0.18], [659, 0.36], [784, 0.54], [1046, 0.8]].forEach(([f, d]) => {
      this.tone({ freq: f, dur: d > 0.7 ? 1.2 : 0.3, vol: 0.14, type: 'square', delay: d });
      this.tone({ freq: f / 2, dur: d > 0.7 ? 1.2 : 0.3, vol: 0.1, type: 'triangle', delay: d });
    });
  }
  /* ---------------------------------------------------------------- critters & keeper */
  hiss(long = false) {
    if (!this.ok('hiss', 300)) return;
    this.noise({ dur: long ? 1.0 : 0.6, vol: 0.16, type: 'highpass', f1: 3500, f2: 5000, q: 0.7, attack: 0.05 });
  }

  chitter(big = false) {
    if (!this.ok('chitter', 200)) return;
    for (let i = 0; i < (big ? 7 : 4); i++) this.noise({ dur: 0.04, vol: 0.14, type: 'bandpass', f1: 2600 + i * 150, q: 6, delay: i * 0.05 });
  }

  oi() {
    if (!this.ok('oi', 900)) return;
    this.tone({ freq: 190, freq2: 260, dur: 0.18, vol: 0.3, type: 'sawtooth' });
    this.tone({ freq: 260, freq2: 180, dur: 0.3, vol: 0.3, type: 'sawtooth', delay: 0.16 });
    this.noise({ dur: 0.4, vol: 0.08, type: 'bandpass', f1: 700, q: 2 });
  }

  whoosh() {
    if (!this.ctx) return;
    for (let i = 0; i < 2; i++) this.noise({ dur: 0.5, vol: 0.28, type: 'bandpass', f1: 300, f2: 1800, q: 1.5, delay: i * 0.55, attack: 0.15 });
  }
  /* ---------------------------------------------------------------- playground & gates */
  boing(stage = 0) {
    if (!this.ok('boing', 70)) return;
    const f = [340, 260, 190, 150][stage] * (1 + (Math.random() - 0.5) * 0.1);
    this.tone({ freq: f, freq2: f * 2.4, dur: 0.3, vol: 0.18, type: 'sine', vib: f * 0.12, vibHz: 28 });
  }

  unlock() {
    if (!this.ctx) return;
    this.noise({ dur: 0.12, vol: 0.3, type: 'bandpass', f1: 900, q: 3 });
    this.tone({ freq: 160, freq2: 110, dur: 0.18, vol: 0.3, type: 'square' });
    [1047, 1319, 1568, 2093].forEach((f, i) => this.tone({ freq: f, dur: 0.25, vol: 0.1, type: 'triangle', delay: 0.25 + i * 0.09 }));
  }
  /* ---------------------------------------------------------------- beach */
  splash() {
    if (!this.ok('splash', 90)) return;
    this.noise({ dur: 0.35, vol: 0.2, type: 'bandpass', f1: 1400, f2: 500, q: 0.8 });
    this.tone({ freq: 500, freq2: 200, dur: 0.15, vol: 0.06, type: 'sine', delay: 0.03 });
  }

  snip() {
    if (!this.ok('snip', 150)) return;
    this.noise({ dur: 0.04, vol: 0.2, type: 'highpass', f1: 3000, q: 1 });
    this.noise({ dur: 0.04, vol: 0.18, type: 'highpass', f1: 3500, q: 1, delay: 0.07 });
  }

  /** a turkey diving into the beach mound */
  gloop() {
    if (!this.ok('gloop', 80)) return;
    this.tone({ freq: 160, freq2: 520, dur: 0.16, vol: 0.22 });
    this.noise({ dur: 0.25, vol: 0.14, type: 'lowpass', f1: 900, f2: 250 });
  }

  /** a wheelie bin going over: a hollow plastic thud and everything inside rattling out */
  clatter() {
    if (!this.ok('clatter', 200)) return;
    this.tone({ freq: 110, freq2: 70, dur: 0.25, vol: 0.3, type: 'triangle' });
    this.noise({ dur: 0.18, vol: 0.25, type: 'lowpass', f1: 900, f2: 200 });
    for (let i = 0; i < 6; i++) this.noise({ dur: 0.05, vol: 0.1, type: 'bandpass', f1: 1800 + Math.random() * 2500, q: 8, delay: 0.12 + i * 0.07 + Math.random() * 0.04 });
  }

  /** the King Crab's water jet */
  jet() {
    if (!this.ok('jet', 400)) return;
    this.noise({ dur: 0.9, vol: 0.3, type: 'bandpass', f1: 2200, f2: 900, q: 0.7, attack: 0.04 });
    this.noise({ dur: 0.7, vol: 0.18, type: 'lowpass', f1: 600, f2: 300, delay: 0.05 });
  }

  /** the ferry's horn, out on the harbour: a long low blast and a short one (two notes a third apart, scooping up into it) */
  horn() {
    if (!this.ok('horn', 2000)) return;
    const c = this.ctx;
    for (const [at, len] of [[0, 1.5], [1.9, 0.7]]) {
      const t0 = c.currentTime + at, t1 = t0 + len;
      const f = c.createBiquadFilter(), g = c.createGain();
      f.type = 'lowpass'; f.frequency.value = 600; f.Q.value = 0.8;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.13, t0 + 0.12);
      g.gain.setValueAtTime(0.13, t1 - 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, t1);
      f.connect(g).connect(this.master);
      for (const hz of [98, 123.5]) {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(hz * 0.95, t0);
        o.frequency.exponentialRampToValueAtTime(hz, t0 + 0.18);
        o.connect(f);
        o.start(t0); o.stop(t1 + 0.05);
      }
    }
  }

  /** a big iron lever thrown over: the ratchet clacking round, and a heavy clunk as it hits the stop */
  lever() {
    if (!this.ok('lever', 300)) return;
    for (let i = 0; i < 4; i++) this.noise({ dur: 0.03, vol: 0.12, type: 'bandpass', f1: 2600 - i * 200, q: 6, delay: i * 0.045 });
    this.tone({ freq: 160, freq2: 90, dur: 0.14, vol: 0.28, type: 'triangle', delay: 0.2 });
    this.noise({ dur: 0.09, vol: 0.16, type: 'bandpass', f1: 1200, q: 3, delay: 0.2 });
    this.tone({ freq: 880, dur: 0.18, vol: 0.03, type: 'square', delay: 0.21 }); // (a bit of ring to it)
  }

  /* ---------------------------------------------------------------- out on the harbour, in a storm */
  /** thunder: a crack, if it's close (`near`, 0..1), and a long roll after it; `delay`: s till it gets to you */
  thunder(near = 0.5, delay = 0) {
    if (!this.ok('thunder', 400)) return;
    if (near > 0.4) this.noise({ dur: 0.35, vol: 0.35 * near, type: 'highpass', f1: 1800, f2: 600, q: 0.6, delay, attack: 0.005 });
    this.noise({ dur: 2.8 + near, vol: 0.28 + 0.2 * near, type: 'lowpass', f1: 380 + 500 * near, f2: 60, q: 0.8, delay: delay + 0.05, attack: 0.08 });
    this.noise({ dur: 1.8, vol: 0.18, type: 'lowpass', f1: 200, f2: 50, delay: delay + 0.5 + Math.random() * 0.4, attack: 0.3 });
    this.tone({ freq: 55, freq2: 32, dur: 1.6, vol: 0.2 * (0.5 + near), delay, attack: 0.05 });
  }

  /** the giant cuttlefish, somewhere down below: a long, deep groan (`size`: how big it sounds) */
  moan(size = 1) {
    if (!this.ok('moan', 900)) return;
    const f = 70 / Math.sqrt(size);
    this.tone({ freq: f * 1.3, freq2: f * 0.8, dur: 1.8 * size, vol: 0.22, type: 'sawtooth', vib: 6, vibHz: 5, attack: 0.25 });
    this.tone({ freq: f * 2.02, freq2: f * 1.5, dur: 1.5 * size, vol: 0.08, type: 'triangle', vib: 9, vibHz: 7, attack: 0.3 });
    this.noise({ dur: 1.6 * size, vol: 0.1, type: 'lowpass', f1: 300, f2: 90, attack: 0.3 });
  }

  /** her hull giving way as she's dragged under: iron groaning and creaking, and the water rushing in */
  groan() {
    if (!this.ok('groan', 1500)) return;
    this.tone({ freq: 58, freq2: 38, dur: 2.6, vol: 0.24, type: 'sawtooth', vib: 3, vibHz: 3, attack: 0.2 });
    this.tone({ freq: 240, freq2: 150, dur: 1.4, vol: 0.05, type: 'sawtooth', vib: 22, vibHz: 11, attack: 0.1, delay: 0.3 });
    this.tone({ freq: 310, freq2: 190, dur: 1.1, vol: 0.04, type: 'sawtooth', vib: 26, vibHz: 13, attack: 0.1, delay: 1.2 });
    this.noise({ dur: 3, vol: 0.2, type: 'lowpass', f1: 700, f2: 150, attack: 0.5, delay: 0.4 });
  }

  /** something big coming up out of the water, or going under */
  sploosh() {
    if (!this.ok('sploosh', 150)) return;
    this.noise({ dur: 0.9, vol: 0.32, type: 'bandpass', f1: 900, f2: 300, q: 0.7, attack: 0.02 });
    this.noise({ dur: 1.2, vol: 0.2, type: 'lowpass', f1: 500, f2: 120, delay: 0.05 });
    this.tone({ freq: 140, freq2: 60, dur: 0.5, vol: 0.14, delay: 0.02 });
  }

  /** a tentacle slapping down on the deck: wet, heavy, and felt through the whole boat */
  splat() {
    if (!this.ok('splat', 150)) return;
    this.noise({ dur: 0.5, vol: 0.4, type: 'lowpass', f1: 1600, f2: 150, attack: 0.004 });
    this.noise({ dur: 0.3, vol: 0.2, type: 'bandpass', f1: 1100, f2: 500, q: 2 });
    this.tone({ freq: 90, freq2: 40, dur: 0.45, vol: 0.35 });
  }

  /** a wet, slimy squelch (a tentacle thrashing about, grabbing hold, or letting go) */
  squelch() {
    if (!this.ok('squelch', 120)) return;
    this.noise({ dur: 0.28, vol: 0.22, type: 'bandpass', f1: 700, f2: 260, q: 4 });
    this.tone({ freq: 190, freq2: 90, dur: 0.22, vol: 0.12, vib: 40, vibHz: 30 });
  }

  /** a fish flapping about on the deck */
  flop() {
    if (!this.ok('flop', 90)) return;
    for (let i = 0; i < 3; i++) this.noise({ dur: 0.06, vol: 0.12, type: 'bandpass', f1: 1400 + Math.random() * 500, q: 2.5, delay: i * 0.11 });
  }

  /** Benny saying g'day: a bark or two (a fur seal's, gruff, more of a cough than a woof); `vol`: how near he is */
  bark(n = 1, vol = 1) {
    if (!this.ok('bark', 250)) return;
    for (let i = 0; i < n; i++) {
      const delay = i * 0.34, f = 330 - i * 25;
      this.tone({ freq: f, freq2: f * 0.62, dur: 0.22, vol: 0.2 * vol, type: 'sawtooth', vib: 18, vibHz: 22, attack: 0.015, delay });
      this.tone({ freq: f * 2, freq2: f * 1.3, dur: 0.18, vol: 0.05 * vol, type: 'square', attack: 0.015, delay });
      this.noise({ dur: 0.2, vol: 0.12 * vol, type: 'bandpass', f1: 800, f2: 400, q: 1.5, delay });
    }
  }

  /** and a flipper slapping his wet belly: a smack, with a bit of a thump under it */
  slap(vol = 1) {
    if (!this.ok('slap', 90)) return;
    this.noise({ dur: 0.09, vol: 0.3 * vol, type: 'bandpass', f1: 1900, f2: 900, q: 1.2, attack: 0.002 });
    this.noise({ dur: 0.16, vol: 0.14 * vol, type: 'lowpass', f1: 900, f2: 200, attack: 0.003 });
    this.tone({ freq: 150, freq2: 85, dur: 0.12, vol: 0.16 * vol, attack: 0.003 });
  }

  /** the Hills Hoist squeaking round */
  creak(speed = 1) {
    if (!this.ok('creak', 250)) return;
    const f = 620 + speed * 60;
    this.tone({ freq: f, freq2: f * 1.25, dur: 0.2, vol: 0.045, type: 'sawtooth', vib: 30, vibHz: 40, attack: 0.03 });
  }

  /** a bin bag splitting open */
  rip() {
    if (!this.ok('rip', 150)) return;
    this.noise({ dur: 0.22, vol: 0.2, type: 'highpass', f1: 1800, f2: 4000, q: 0.8 });
    this.noise({ dur: 0.12, vol: 0.1, type: 'bandpass', f1: 900, q: 2, delay: 0.05 });
  }

  /**
   * An ibis honking (the King's is a deep one, `size` being how big it is); `blast`: a double honk, fit to
   * shake the windows, with a rumble under it. `vol` scales it (for one heard from down the alley)
   */
  honk(size = 1, blast = false, vol = 1) {
    if (!this.ok('honk', 250)) return;
    const f = 560 / Math.sqrt(size);
    for (const [delay, k] of blast ? [[0, 1], [0.3, 0.84]] : [[0, 1]]) {
      this.tone({ freq: f * k * 1.1, freq2: f * k * 0.86, dur: blast ? 0.42 : 0.3, vol: 0.24 * vol, type: 'sawtooth', vib: f * 0.04, vibHz: 26, attack: 0.02, delay });
      this.tone({ freq: f * k * 1.62, freq2: f * k * 1.3, dur: blast ? 0.38 : 0.26, vol: 0.1 * vol, type: 'square', attack: 0.02, delay });
      this.noise({ dur: 0.26, vol: 0.09 * vol, type: 'bandpass', f1: f * 2.6, q: 3, delay });
    }
    if (blast) {
      this.tone({ freq: 72, freq2: 38, dur: 1.2, vol: 0.34 * vol, type: 'sine', attack: 0.03, delay: 0.05 });
      this.noise({ dur: 0.9, vol: 0.16 * vol, type: 'lowpass', f1: 400, f2: 120, attack: 0.05 });
    }
  }

  /* ---------------------------------------------------------------- Hyde Park, and the train */
  /** a rat squeaking (`big`: its last) */
  squeak(big = false) {
    if (!this.ok('squeak', 160)) return;
    const f = 2600 + Math.random() * 800;
    this.tone({ freq: f, freq2: f * 1.25, dur: big ? 0.22 : 0.07, vol: 0.07, type: 'triangle', vib: 120, vibHz: 50, attack: 0.004 });
    if (big) this.tone({ freq: f * 1.2, freq2: f * 0.7, dur: 0.18, vol: 0.06, type: 'triangle', delay: 0.2 });
  }

  /** the train's doors: the chime as they're closing, and a ding as they open (`open`) */
  chime(open = false) {
    if (!this.ok('chime', 400)) return;
    const notes = open ? [[1046, 0]] : [[659, 0], [523, 0.32]];
    for (const [f, delay] of notes) {
      this.tone({ freq: f, dur: 0.5, vol: 0.12, type: 'sine', delay });
      this.tone({ freq: f * 2, dur: 0.3, vol: 0.03, type: 'sine', delay });
    }
  }

  /** her motors winding up as she pulls away, and the rumble of her on the rails (`vol`: further off) */
  trainOff(vol = 1) {
    if (!this.ok('trainOff', 1000)) return;
    this.tone({ freq: 90, freq2: 330, dur: 4.5, vol: 0.06 * vol, type: 'sawtooth', attack: 0.4 });
    this.tone({ freq: 180, freq2: 660, dur: 4.5, vol: 0.025 * vol, type: 'square', attack: 0.6 });
    this.noise({ dur: 5, vol: 0.12 * vol, type: 'lowpass', f1: 180, f2: 420, attack: 0.8 });
  }

  /** her coming in: the rumble of her on the rails, her motors winding down, and the brakes hissing as she stops (over `dur` s) */
  trainIn(dur = 5, vol = 1) {
    if (!this.ok('trainIn', 1000)) return;
    this.tone({ freq: 330, freq2: 90, dur, vol: 0.05 * vol, type: 'sawtooth', attack: 0.2 });
    this.tone({ freq: 660, freq2: 180, dur, vol: 0.02 * vol, type: 'square', attack: 0.3 });
    this.noise({ dur: dur + 0.3, vol: 0.12 * vol, type: 'lowpass', f1: 420, f2: 160, attack: 0.2 });
    this.noise({ dur: 1.1, vol: 0.05 * vol, type: 'highpass', f1: 2600, f2: 1600, attack: 0.08, delay: dur - 0.6 });
  }
}
