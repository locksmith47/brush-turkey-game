import { MAX_HP } from './player.js';

export class HUD {
  constructor(game) {
    this.game = game;
    this.el = {};
    for (const id of ['health', 'hp-fill', 'hp-lag', 'hurt', 'hud', 'help', 'toast', 'c-squad', 'c-field', 'c-sprouts', 'c-s0', 'c-s1', 'c-s2', 'throw-name', 'c-leaves', 'c-hatched', 'c-mounds', 'c-lost', 'boss', 'boss-name', 'boss-hp', 'boss-lag', 'banner', 'banner-text', 'zone-title', 'zone-name', 'boss-grip', 'boss-grip-fill', 'boss-grip-time', 'c-beach', 'tk-normal', 'tk-beach', 'throw-type', 'throw-kind', 'c-beach-box', 'help-tab', 'c-kit', 'c-kit-box', 'saved']) {
      this.el[id] = document.getElementById(id);
    }
    this.toastT = 0;
    this.bannerT = 0;
    this.zoneT = 0;
    this.bossShown = false;
    this.tick = 0;
    this.cache = {};
    this.hurtK = 0; // (the red round the edges of the screen, flashing up when you're hurt)
  }

  show() { this.el.hud.classList.remove('hidden'); }
  toggleHelp() { this.el.help.classList.toggle('hidden'); }

  toast(msg, secs = 2) {
    if (this.game.loading) return; // (a save being put back: nothing to announce)
    this.el.toast.textContent = msg;
    this.el.toast.classList.add('show');
    this.toastT = secs;
  }

  /** whatever it was saying, it's gone (you've gone down: it'll only be in the way) */
  clearToast() {
    this.toastT = 0;
    this.el.toast.classList.remove('show');
  }

  /** a toast that won't repeat itself for a while */
  toastOnce(key, msg, secs = 3, every = 15) {
    this.onceT ??= {};
    const now = performance.now() / 1000;
    if (this.onceT[key] && now - this.onceT[key] < every) return;
    this.onceT[key] = now;
    this.toast(msg, secs);
  }

  /** you've been hurt (`k`: how badly, as a share of your health): the edges of the screen flash red */
  hurt(k) { this.hurtK = Math.min(1, this.hurtK + 0.45 + k * 2); }

  /** a little note in the corner that your progress has just been saved */
  saved() {
    this.el.saved.classList.add('show');
    this.savedT = 1.8;
  }

  banner(text, secs = 4.5) {
    if (this.game.loading) return;
    this.el['banner-text'].textContent = text;
    this.el.banner.classList.add('show');
    this.bannerT = secs;
  }

  zoneTitle(name, secs = 3.5) {
    this.el['zone-name'].textContent = name;
    this.el['zone-title'].classList.add('show');
    this.zoneT = secs;
  }

  /** Dark Souls style boss bar for whichever boss is engaged (or null) */
  boss(e) {
    const show = !!e;
    if (show !== this.bossShown) {
      this.bossShown = show;
      this.el.boss.classList.toggle('hidden', !show);
    }
    if (!show) return;
    this.set('boss-name', e.def.name);
    const grip = e.grip;
    if (!!grip !== this.gripShown) {
      this.gripShown = !!grip;
      this.el['boss-grip'].classList.toggle('hidden', !grip);
    }
    if (grip) {
      this.el['boss-grip-fill'].style.width = (grip.fill * 100).toFixed(1) + '%';
      this.el['boss-grip-time'].style.width = (Math.max(0, grip.time) * 100).toFixed(1) + '%';
    }
    const pct = (Math.max(0, e.hp) / e.def.hp * 100).toFixed(1) + '%';
    if (this.cache.bossPct !== pct) {
      this.cache.bossPct = pct;
      this.el['boss-hp'].style.width = pct;
      this.el['boss-lag'].style.width = pct;
    }
  }

  set(id, v) {
    if (this.cache[id] === v) return;
    this.cache[id] = v;
    this.el[id].textContent = v;
  }

  setClass(id, v) {
    if (this.cache['class:' + id] === v) return;
    this.cache['class:' + id] = v;
    this.el[id].className = v;
  }

  update(dt) {
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.el.banner.classList.remove('show');
    }
    if (this.zoneT > 0) {
      this.zoneT -= dt;
      if (this.zoneT <= 0) this.el['zone-title'].classList.remove('show');
    }
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) this.el.toast.classList.remove('show');
    }
    if (this.savedT > 0) {
      this.savedT -= dt;
      if (this.savedT <= 0) this.el.saved.classList.remove('show');
    }
    // the red round the edges: a flash when you're hurt, and a slow throb while you're in a bad way
    const p = this.game.player, hp = Math.max(0, p.hp) / MAX_HP;
    this.hurtK = Math.max(0, this.hurtK - dt * 1.8);
    const low = p.life === 'ok' && hp < 0.3 ? ((0.3 - hp) / 0.3) * 0.35 + 0.3 + Math.sin(this.game.time * 6.6) * 0.12 : 0;
    const red = Math.round(Math.max(this.hurtK, low) * 100) / 100;
    if (red !== this.cache.red) { this.cache.red = red; this.el.hurt.style.opacity = red; }
    this.tick -= dt;
    if (this.tick > 0) return;
    this.tick = 0.1;
    const g = this.game, c = g.turkeys.counts;
    // your health (a pale chunk hangs on for a moment where you've just lost some)
    const pct = (hp * 100).toFixed(1) + '%';
    if (this.cache.hp !== pct) {
      this.cache.hp = pct;
      this.el['hp-fill'].style.width = pct;
      this.el['hp-lag'].style.width = pct;
    }
    this.setClass('health', hp > 0.5 ? '' : hp > 0.25 ? 'mid' : 'low');
    this.set('c-squad', c.squad);
    this.set('c-field', c.field);
    this.set('c-sprouts', c.sprouts);
    this.set('c-s0', c.stages[0]);
    this.set('c-s1', c.stages[1]);
    this.set('c-s2', c.stages[2]);
    this.set('c-beach', c.beach);
    this.set('c-kit', c.kit);
    // (the padded-up count turns up once you've got some)
    if (c.kit && !this.kitShown) { this.kitShown = true; this.el['c-kit-box'].classList.remove('hidden'); }
    // beach turkey bits of the HUD stay hidden until Bondi's open
    const bondi = g.bondiOpen();
    if (bondi !== this.bondiShown) {
      this.bondiShown = bondi;
      for (const id of ['throw-type', 'throw-kind', 'c-beach-box', 'help-tab']) this.el[id].classList.toggle('hidden', !bondi);
    }
    // next throw: the kind Tab picked (or whichever you've got), biggest first
    const cand = g.turkeys.candidate, kind = cand ? cand.kind : g.turkeys.preferred;
    this.set('throw-name', cand ? g.turkeys.stageName(cand.stage) : '—');
    this.setClass('tk-normal', (kind === 'normal' ? 'on' : '') + (c.normal ? '' : ' none'));
    this.setClass('tk-beach', (kind === 'beach' ? 'on' : '') + (c.beach ? '' : ' none'));
    this.set('c-leaves', Math.floor(g.stats.leaves));
    this.set('c-hatched', g.stats.hatched);
    // (your mounds: not the ones still waiting for you further on, at the oval and the beach)
    this.set('c-mounds', g.mounds.list.filter((m) => g.visited.has(g.world.zoneOf(m.pos.z))).length);
    this.set('c-lost', g.stats.lost);
  }
}
