import { MAX_HP } from './player.js';
import { diagram, fillCaps } from './padmap.js';

export class HUD {
  constructor(game) {
    this.game = game;
    this.el = {};
    for (const id of ['health', 'hp-fill', 'hp-lag', 'hurt', 'hud', 'help', 'toast', 'c-squad', 'c-stages', 'c-s0', 'c-s1', 'c-s2', 'c-padded', 'c-beach', 'c-s0-box', 'c-s1-box', 'c-s2-box', 'c-padded-box', 'c-beach-box', 'c-about', 'c-sprouts', 'throw-name', 't-hatched', 't-mounds', 't-lost', 'boss', 'boss-name', 'boss-hp', 'boss-lag', 'banner', 'banner-text', 'zone-title', 'zone-name', 'boss-grip', 'boss-grip-fill', 'boss-grip-time', 'tk-normal', 'tk-padded', 'tk-beach', 'throw-type', 'throw-kind', 'help-tab', 'saved', 'paused', 'muted', 'credits', 'credits-btn']) {
      this.el[id] = document.getElementById(id);
    }
    this.told = new Set(); // (the things you've been told the once: see toastOnce)
    this.toastT = 0;
    this.bannerT = 0;
    this.zoneT = 0;
    this.bossShown = false;
    this.tick = 0;
    this.cache = {};
    this.hurtK = 0; // (the red round the edges of the screen, flashing up when you're hurt)
    this.el['credits-btn'].addEventListener('click', (e) => { this.credits(); e.currentTarget.blur(); }); // (not Space's to press after)
    // (a controller, drawn on the pause screen; and the buttons' pictures wherever there's a key to press)
    document.getElementById('pad-map').innerHTML = diagram();
    fillCaps();
  }

  show() { this.el.hud.classList.remove('hidden'); }
  toggleHelp() { this.el.help.classList.toggle('hidden'); }

  /** paused (Esc): the screen dims, with how you're going, and the controls come up alongside (then go back to how they were) */
  pause(on) {
    this.el.paused.classList.toggle('hidden', !on);
    document.body.classList.toggle('paused', on);
    if (on) this.helpWas = !this.el.help.classList.contains('hidden');
    this.el.help.classList.toggle('hidden', !on && !this.helpWas);
    if (on) this.tally();
    else this.credits(false);
  }

  /** where the bird calls came from, under the tally on the pause screen: opened (or shut again) with its button */
  credits(on = this.el.credits.classList.contains('hidden')) {
    this.el.credits.classList.toggle('hidden', !on);
    this.el['credits-btn'].classList.toggle('on', on);
    this.el.paused.classList.toggle('credits-open', on); // (they take the controller's place: there's not the room for both)
  }

  /** how you're going, on the pause screen */
  tally() {
    const g = this.game;
    this.el['t-hatched'].textContent = g.stats.hatched;
    // (your mounds: not the ones still waiting for you further on, at the oval and the beach)
    this.el['t-mounds'].textContent = g.mounds.list.filter((m) => g.visited.has(g.world.zoneOf(m.pos.x, m.pos.z))).length;
    this.el['t-lost'].textContent = g.stats.lost;
  }

  /** the sound's off (N): a crossed-out speaker up in the corner, so you know. `say`: and a word about it */
  soundOff(off, say = false) {
    this.el.muted.classList.toggle('hidden', !off);
    if (say) this.toast(off ? 'Sound off: press N to turn it back on' : 'Sound on', 1.8);
  }

  toast(msg, secs = 2) {
    if (this.game.loading) return; // (a save being put back: nothing to announce)
    this.el.toast.textContent = this.game.input?.say(msg) ?? msg; // (with whatever's to press, on what you're playing with)
    this.el.toast.classList.add('show');
    this.toastT = secs;
  }

  /** whatever it was saying, it's gone (you've gone down: it'll only be in the way) */
  clearToast() {
    this.toastT = 0;
    this.el.toast.classList.remove('show');
  }

  /**
   * A toast that's only ever said the once, such as how something's done, the first time it's needed. What's been
   * said is remembered in the save (see main.js), by `key`. Not while you're down, where it'd go unseen: it'll
   * keep till next time. Returns whether it was said
   */
  toastOnce(key, msg, secs = 3) {
    if (this.told.has(key) || this.game.loading || this.game.wasted.active) return false;
    this.told.add(key);
    this.toast(msg, secs);
    return true;
  }

  /** you've been hurt (`k`: how badly, as a share of your health): the edges of the screen flash red */
  hurt(k) { this.hurtK = Math.min(1, this.hurtK + 0.45 + k * 2); }

  /** a little note in the corner that your progress is saved (the first time it saves as you play: after that, you know) */
  saved() {
    if (this.savedOnce) return;
    this.savedOnce = true;
    this.el.saved.classList.add('show');
    this.savedT = 2.5;
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

  hide(id, v) {
    if (this.cache['hide:' + id] === v) return;
    this.cache['hide:' + id] = v;
    this.el[id].classList.toggle('hidden', v);
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
    // your squad, and what's in it (chicks, juveniles and adults, then the padded-up turkeys and the beach turkeys:
    // bar any you've none of)
    this.set('c-squad', c.squad);
    this.hide('c-stages', !c.squad);
    for (const [id, n] of [['c-s0', c.stages[0]], ['c-s1', c.stages[1]], ['c-s2', c.stages[2]], ['c-padded', c.padded], ['c-beach', c.beach]]) {
      this.set(id, n);
      this.hide(`${id}-box`, !n);
    }
    // and the rest of your flock, if there's any: out and about, and still in the ground
    const about = c.field - c.squad;
    this.set('c-about', `${about} out and about`);
    this.hide('c-about', !about);
    this.set('c-sprouts', `${c.sprouts} to pluck`);
    this.hide('c-sprouts', !c.sprouts);
    // Next throw (and Tab) turn up once there's a choice of who to throw: padded turkeys, while there are any about,
    // and beach turkeys, once the beach is open
    const tu = g.turkeys, beach = g.beachOpen(), padded = tu.list.some((t) => !t.dead && tu.kindOf(t) === 'padded');
    if ((beach || padded) !== this.choiceShown) {
      this.choiceShown = beach || padded;
      for (const id of ['throw-type', 'throw-kind', 'help-tab']) this.el[id].classList.toggle('hidden', !this.choiceShown);
    }
    // next throw: the kind Tab picked (or whichever you've got), biggest first
    const cand = tu.candidate, kind = cand ? tu.kindOf(cand) : tu.preferred;
    this.set('throw-name', cand ? tu.stageName(cand.stage) : '—');
    this.setClass('tk-normal', (kind === 'normal' ? 'on' : '') + (c.normal ? '' : ' none'));
    this.setClass('tk-padded', (kind === 'padded' ? 'on' : '') + (c.padded ? '' : ' none') + (padded ? '' : ' hidden'));
    this.setClass('tk-beach', (kind === 'beach' ? 'on' : '') + (c.beach ? '' : ' none') + (beach ? '' : ' hidden'));
  }
}
