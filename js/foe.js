import * as THREE from 'three';
import { clamp, damp, dampAngle, rand, pinLabel, labelFade, Dial, TAU } from './util.js';

export const STRENGTH = [1, 1.5, 2];
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3();

/*
 * Shared behaviour for everything turkeys can fight: being clung to, taking damage,
 * dying, and then being hauled back to a mound as a pile of leaves.
 * Subclasses provide a rig and override think / pose / hits / etc.
 */
export class Foe {
  constructor(game, def, x, z) {
    this.game = game;
    this.def = def;
    this.pos = new THREE.Vector3(x, game.world.groundHeight(x, z), z);
    this.home = new THREE.Vector3(x, 0, z);
    this.zone = game.world.zoneOf(z);
    this.heading = rand(0, TAU);
    this.hp = def.hp ?? 1;
    this.alive = true;
    this.state = 'idle';
    this.t = 0;
    this.cool = 1;
    this.sinceShake = 0;
    this.latched = [];
    this.slots = null;
    this.gone = false;
    this.flinch = 0;
    this.hitT = 0;
    this.roll = 0;
    this.boss = !!def.boss;
    this.engaged = false;
    this.label = document.createElement('div');
    this.label.className = 'mound-label small';
    this.label.style.display = 'none';
    document.getElementById('labels').appendChild(this.label);
  }

  setRig(rig) {
    this.rig = rig;
    this.baseScale = rig.root.scale.x;
    this.game.scene.add(rig.root);
  }

  get s() { return this.def.scale ?? 1; }
  get targetable() { return this.alive; }

  /* ---------------------------------------------------------------- overridables */
  bodyCenter(out) { return out.set(this.pos.x, this.pos.y + (this.def.bodyY ?? 0.5) * this.s, this.pos.z); }
  hits() { return false; }
  latchFrame() { return this.rig.bodyPivot ?? this.rig.root; }
  attachPoint(t, frame) { return frame.worldToLocal(t.pos.clone()); }
  think() {}
  pose() {}
  hitFx(p) { this.game.fx.feathers(p, [0xffffff, 0xdddddd], 3); }
  onDamage() {}
  onDeath() {}
  onLatched() {}

  /* ---------------------------------------------------------------- clinging */
  canLatch() { return this.targetable && this.latched.length < (this.def.maxLatch ?? 8); }

  latch(t) {
    if (!this.latched.length) this.sinceShake = 0;
    this.latched.push(t);
    const f = this.latchFrame(t.pos);
    t.attachObj = f;
    t.attachLocal = this.attachPoint(t, f);
    this.engaged = true;
    this.onLatched(t);
  }

  unlatch(t) {
    const i = this.latched.indexOf(t);
    if (i >= 0) this.latched.splice(i, 1);
  }

  wantsShake() {
    const d = this.def;
    return this.latched.length >= (d.shakeAt ?? 99) || (this.latched.length > 0 && this.sinceShake > (d.shakeEvery ?? 99));
  }

  shakeOff() {
    for (const t of [...this.latched]) t.flingFrom(this);
    this.latched.length = 0;
    this.sinceShake = 0;
  }

  /* ---------------------------------------------------------------- damage */
  damage(amount, attacker) {
    if (!this.alive || this.invulnerable) return;
    amount *= this.damageMult ?? 1;
    this.hp -= amount;
    this.flinch = Math.min(1, this.flinch + amount * 0.5);
    this.engaged = true;
    this.onDamage(amount, attacker);
    this.hitT -= amount;
    if (this.hitT <= 0) {
      this.hitT = 1.5 * this.s;
      this.hitFx(this.bodyCenter(_v).clone());
      this.game.audio.peck();
    }
    if (this.hp <= 0) this.die();
  }

  die() {
    this.alive = false;
    this.hp = 0;
    this.state = 'dying';
    this.t = 0;
    for (const t of [...this.latched]) t.dropOff();
    this.latched.length = 0;
    this.hideLabels();
    this.onDeath();
  }

  /* ---------------------------------------------------------------- AI helpers */
  findTarget(range = this.def.aggro ?? 6, from = this.pos) {
    const w = this.game.world, leash = (this.def.leash ?? 8) * 2;
    let best = null, bd = range;
    for (const t of this.game.turkeys.list) {
      if (!t.grounded || t.dead || w.zoneOf(t.pos.z) !== this.zone) continue;
      const d = Math.hypot(t.pos.x - from.x, t.pos.z - from.z);
      if (d < bd && Math.hypot(t.pos.x - this.home.x, t.pos.z - this.home.z) < leash) { bd = d; best = t; }
    }
    return best;
  }

  turkeysNear(p, r) {
    return this.game.turkeys.list
      .filter((t) => t.grounded && !t.dead && Math.hypot(t.pos.x - p.x, t.pos.z - p.z) < r + t.radius)
      .sort((a, b) => Math.hypot(a.pos.x - p.x, a.pos.z - p.z) - Math.hypot(b.pos.x - p.x, b.pos.z - p.z));
  }

  killNear(p, r, max, cause) {
    const list = this.turkeysNear(p, r).slice(0, max);
    list.forEach((t) => t.die(cause));
    return list.length;
  }

  countNear(p, r) { return this.turkeysNear(p, r).length; }

  forward(out) { return out.set(Math.sin(this.heading), 0, Math.cos(this.heading)); }

  walk(tx, tz, speed, dt, stop = 0.1, turn = 5) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z, d = Math.hypot(dx, dz);
    this.speedNow = damp(this.speedNow ?? 0, d > stop ? speed : 0, 6, dt);
    if (d > 0.01 && this.speedNow > 0.01) {
      this.heading = dampAngle(this.heading, Math.atan2(dx, dz), turn, dt);
      this.pos.x += Math.sin(this.heading) * this.speedNow * dt;
      this.pos.z += Math.cos(this.heading) * this.speedNow * dt;
    }
    return d;
  }

  /* ---------------------------------------------------------------- hauling */
  becomeCarcass() {
    this.state = 'carcass';
    this.t = 0;
    this.slots = new Array(this.def.slots ?? 8).fill(null);
    this.game.fx.dust(this.pos, 8);
    this.game.audio.land();
  }

  slotPos(i, out) {
    const a = (i / this.slots.length) * TAU, r = this.def.carryR + 0.25;
    return out.set(this.pos.x + Math.cos(a) * r, 0, this.pos.z + Math.sin(a) * r);
  }

  joinCarry(t) {
    if (this.state !== 'carcass') return -1;
    let best = -1, bd = Infinity;
    const w = this.game.world;
    for (let i = 0; i < this.slots.length; i++) {
      if (this.slots[i]) continue;
      this.slotPos(i, _v);
      if (!t.canSwim && w.waterDepth(_v.x, _v.z) === 2) continue; // only swimmers can grab it from the water
      const d = Math.hypot(_v.x - t.pos.x, _v.z - t.pos.z);
      if (d < bd) { bd = d; best = i; }
    }
    if (best >= 0) this.slots[best] = t;
    return best;
  }

  leaveCarry(t) {
    if (!this.slots) return;
    const i = this.slots.indexOf(t);
    if (i >= 0) this.slots[i] = null;
  }

  hasFreeSlot() { return this.state === 'carcass' && this.slots.some((s) => !s); }

  strength(swimmersOnly = false) {
    let s = 0;
    for (let i = 0; i < this.slots.length; i++) {
      const t = this.slots[i];
      if (!t || (swimmersOnly && !t.canSwim)) continue;
      this.slotPos(i, _v);
      if (Math.hypot(_v.x - t.pos.x, _v.z - t.pos.z) < 1.0) s += STRENGTH[t.stage];
    }
    return s;
  }

  /**
   * A heading close to (ux, uz) that doesn't march the load (and its carriers) into a rock, tree or
   * shed; loads slide round things in their way instead of getting stuck on them. Null if boxed in.
   */
  clearWay(ux, uz) {
    this.swingMemo ??= {};
    return this.game.world.clearHeading(this.pos.x, this.pos.z, ux, uz, this.def.carryR + 0.2, 1.0, this.swingMemo, _u);
  }

  /**
   * A heading close to (ux, uz) that keeps every landlubber holding this load out of deep water
   * (it skirts round rock pools), or null if there isn't one.
   */
  dryWay(ux, uz) {
    const w = this.game.world, lubbers = [];
    for (let i = 0; i < this.slots.length; i++) if (this.slots[i] && !this.slots[i].canSwim) lubbers.push(i);
    const ok = (x, z) => lubbers.every((i) => {
      this.slotPos(i, _w);
      return w.waterDepth(_w.x + x * 0.8, _w.z + z * 0.8) < 2;
    });
    if (ok(ux, uz)) return _u.set(ux, 0, uz);
    const side = this.detour ?? 1;
    for (const a of [0.5, 1.0, 1.5]) {
      for (const s of [side, -side]) {
        const c = Math.cos(a * s), sn = Math.sin(a * s), rx = ux * c - uz * sn, rz = ux * sn + uz * c;
        if (ok(rx, rz)) { this.detour = s; return _u.set(rx, 0, rz); }
      }
    }
    return null;
  }

  updateCarcass(dt) {
    const g = this.game, d = this.def;
    const st = this.strength();
    this.carrying = st >= d.weight;
    if (!this.carrying) return;
    const m = g.mounds.nearestReachable(this.pos, this.def.mound ?? 'leaf');
    if (!m) return;
    m.edgePoint(this.pos, _w, d.carryR);
    const wp = g.world.route(this.pos.x, this.pos.z, _w.x, _w.z, _v);
    if (wp) {
      const speed = clamp(1.2 + 0.12 * (st - d.weight), 1.2, 3.0);
      const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z, dist = Math.hypot(dx, dz) || 1;
      let ux = dx / dist, uz = dz / dist;
      const clear = this.clearWay(ux, uz); // round rocks and trees
      if (clear) { ux = clear.x; uz = clear.z; }
      if (this.pos.z < -249) { // (there's only water at Bondi)
        const dry = this.dryWay(ux, uz);
        if (dry) { ux = dry.x; uz = dry.z; }
        else if (this.strength(true) < d.weight) return; // stuck at the water's edge unless the swimmers can manage alone
      }
      const step = Math.min(dist, speed * dt);
      this.pos.x += ux * step;
      this.pos.z += uz * step;
      // most things get carried sideways; beach chairs face where they're going (for the passenger's benefit)
      this.heading = dampAngle(this.heading, Math.atan2(ux, uz) - (d.faceMove ? 0 : Math.PI / 2), 2, dt);
    }
    if (Math.hypot(m.pos.x - this.pos.x, m.pos.z - this.pos.z) < m.r + d.carryR + 0.5) this.startAbsorb(m);
  }

  startAbsorb(m) {
    this.state = 'absorb';
    this.t = 0;
    this.mound = m;
    for (const t of this.slots) if (t) t.carryDone();
    this.slots.fill(null);
    this.hideLabels();
    this.game.audio.rumble(0.8);
  }

  finishAbsorb() {
    const g = this.game, m = this.mound;
    const top = m.pos.clone();
    top.y += m.h;
    m.addLeaves(this.def.value, top, this.def.palette);
    g.fx.leafBits(top, 20);
    g.fx.dirt(top, 20, 1.3);
    g.fx.ring(m.pos, 0xffd21f, m.r * 2.5, 0.7);
    g.audio.absorb();
    if (!this.def.quiet) g.hud.toast(`${this.def.name} mounded!`, 2.5);
    this.dispose();
  }

  /* ---------------------------------------------------------------- update */
  update(dt) {
    const g = this.game, d = this.def;
    this.t += dt;
    this.cool -= dt;
    this.sinceShake += dt;
    this.flinch = Math.max(0, this.flinch - dt * 3);

    if (this.alive) this.think(dt);
    else if (this.state === 'dying') {
      const dieT = d.dieTime ?? 0.8;
      this.roll = Math.min(1, this.t / dieT);
      if (this.t >= dieT) this.becomeCarcass();
    } else if (this.state === 'carcass') this.updateCarcass(dt);
    else if (this.state === 'absorb') {
      const m = this.mound, k = Math.min(1, this.t / 0.9);
      this.pos.x = damp(this.pos.x, m.pos.x, 4, dt);
      this.pos.z = damp(this.pos.z, m.pos.z, 4, dt);
      this.pos.y = m.pos.y + m.h * Math.sin(k * Math.PI * 0.5);
      if (k >= 1) { this.finishAbsorb(); return; }
    }

    if (this.alive || this.state === 'carcass') {
      g.world.resolve(this.pos, this.alive ? d.radius : d.carryR * 0.7, this.alive ? g.mounds.colliders : null);
    }
    if (this.state !== 'absorb' && !this.airborne) this.pos.y = g.world.groundHeight(this.pos.x, this.pos.z);
    this.pose(dt);
    if (this.state === 'absorb') this.rig.root.scale.setScalar(this.baseScale * (1 - Math.min(1, this.t / 0.9) * 0.95));
    this.rig.root.updateMatrixWorld(true);
  }

  colliderR() {
    if (this.alive) return this.solid === false ? 0 : this.def.radius;
    return this.state === 'carcass' ? this.def.carryR * 0.7 : 0;
  }

  updateLabel(camera, v) {
    const pp = this.game.player.pos, dist = Math.hypot(pp.x - this.pos.x, pp.z - this.pos.z);
    let fade = this.def.noLabel ? 0 : labelFade(dist);
    v.set(this.pos.x, this.pos.y + (this.alive ? this.def.labelY : this.def.carcassLabelY ?? 1) * this.s + 0.2, this.pos.z);
    const carcass = this.state === 'carcass', chore = this.alive && this.def.task && this.hp < this.def.hp;
    if (carcass) {
      // loot (beach gear, keys, flags...) shows its dial once turkeys are on it; a beaten foe always
      // does, but only when you're close
      if (this.def.loot) { if (!this.slots.some(Boolean)) fade = 0; }
      else fade = Math.min(fade, labelFade(dist, 13, 4));
    }
    if (carcass || chore) {
      // a dial rather than numbers: for a load, how close the carriers are to lifting it (and, once it's up,
      // how much spare help there is, which speeds it along); for a chore, how far along it is
      if (this.label.style.display !== 'none') this.label.style.display = 'none';
      this.dial ??= new Dial();
      if (!this.dial.pin(v, camera, fade)) return;
      if (carcass) {
        const st = this.strength(), w = this.def.weight;
        this.dial.icon(this.def.icon ?? '');
        this.dial.set(st / w, (st - w) / (this.def.maxExtra ?? 15), st >= w ? 'lift' : '');
      } else {
        this.dial.icon(this.def.task === 'dig' ? '⛏️' : '💪');
        this.dial.set(1 - Math.max(0, this.hp) / this.def.hp);
      }
      return;
    }
    this.dial?.hide();
    // a foe that's been hurt: a little health bar
    const show = this.alive && !this.boss && this.hp < this.def.hp && this.targetable;
    if (!show) { if (this.label.style.display !== 'none') this.label.style.display = 'none'; return; }
    if (!pinLabel(this.label, v, camera, fade)) return;
    const pct = Math.round(Math.max(0, this.hp / this.def.hp) * 100);
    const html = `<div class="bar"><i style="width:${pct}%;background:${pct > 50 ? '#7bd34f' : pct > 25 ? '#ffc53d' : '#ff5a3d'}"></i></div>`;
    if (html !== this.labelHTML) { this.labelHTML = html; this.label.innerHTML = html; } // only touch the DOM on changes
  }

  hideLabels() {
    this.label.style.display = 'none';
    this.dial?.hide();
  }

  dispose() {
    if (this.slots) for (const t of this.slots) if (t) t.carryDone();
    this.state = 'gone';
    this.gone = true;
    this.game.scene.remove(this.rig.root);
    this.label.remove();
    this.dial?.remove();
  }
}
