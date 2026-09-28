import * as THREE from 'three';
import { Foe } from './foe.js';
import { part, merge, vcMesh, G, tint, rand, clamp, damp, dampAngle, TAU } from './util.js';

/*
 * Red-bellied black snake.
 *  - lurks in the leaf litter, rears up (red strike line shows where) and lunges
 *  - swallows a turkey whole: you can watch the bulge slide down its body...
 *    kill it before the bulge reaches the tail and the turkey pops out alive!
 *  - thrashes to fling off turkeys clinging to its back; dead snakes flip belly-up
 */
const DEF = {
  name: 'Black Snake', hp: 34, scale: 1, radius: 0.28, bodyY: 0.12, labelY: 0.9, carcassLabelY: 0.6,
  aggro: 6.5, leash: 7, maxLatch: 6, shakeAt: 3, shakeEvery: 4, value: 18, weight: 3, carryR: 0.9, slots: 8,
  strikeLen: 2.6, digestTime: 6.5, whirlR: 3.4, bite: 25,
};
const N = 16, SPACING = 0.29;
const BODY_LEN = N * SPACING + 0.6; // how much trail the head has to leave for the body to lie along
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
let SEG = null, HEAD = null, TONGUE = null;

function geos() {
  if (SEG) return;
  const red = new THREE.Color(0xd8373a), pink = new THREE.Color(0xe85a5f);
  SEG = tint(part(G.sphere(1, 10, 8), 0x151515), (x, y, z, c) => {
    if (y < -0.35) c.copy(red);
    else if (y < -0.1) c.copy(pink).lerp(c, 0.6);
  });
  const head = [
    part(G.sphere(1, 12, 10), 0x151515, [0, 0.02, 0.05], [0, 0, 0], [0.15, 0.1, 0.22]),
    part(G.sphere(1, 10, 8), 0xd8373a, [0, -0.035, 0.07], [0, 0, 0], [0.13, 0.05, 0.18]),
  ];
  for (const s of [-1, 1]) {
    head.push(part(G.sphere(0.04, 8, 6), 0xfff4d6, [s * 0.085, 0.07, 0.1]));
    head.push(part(G.sphere(0.022, 6, 5), 0x111111, [s * 0.1, 0.075, 0.115]));
    head.push(part(G.box(0.07, 0.016, 0.02), 0x3a3a3a, [s * 0.08, 0.11, 0.1], [0, 0, s * -0.4]));
  }
  HEAD = merge(head);
  TONGUE = merge([
    part(G.box(0.012, 0.008, 0.14), 0xe0245e, [0, 0, 0.07]),
    part(G.box(0.01, 0.008, 0.06), 0xe0245e, [0.012, 0, 0.16], [0, 0.4, 0]),
    part(G.box(0.01, 0.008, 0.06), 0xe0245e, [-0.012, 0, 0.16], [0, -0.4, 0]),
  ]);
}

export class Snake extends Foe {
  constructor(game, x, z) {
    super(game, DEF, x, z);
    geos();
    const root = new THREE.Group();
    this.headMesh = vcMesh(HEAD);
    this.headMesh.rotation.order = 'YXZ';
    this.headMesh.scale.setScalar(1.35);
    this.tongue = vcMesh(TONGUE, { cast: false });
    this.tongue.position.set(0, -0.01, 0.22);
    this.headMesh.add(this.tongue);
    root.add(this.headMesh);
    this.segs = [];
    for (let i = 0; i < N; i++) {
      const m = vcMesh(SEG);
      const r = 0.17 - (i / N) * 0.11;
      m.userData.r = r;
      m.scale.set(r, r * 0.75, r * 1.5);
      root.add(m);
      this.segs.push(m);
    }
    this.setRig({ root, bodyPivot: this.headMesh });

    // the path the head has taken: the body is laid along it. It's kept by length (not a fixed number
    // of points), so however slowly the snake moves there's always enough of it for the whole body
    this.trail = [];
    this.spare = [];
    for (let i = 0; i * 0.1 < BODY_LEN + 0.3; i++) this.trail.push(new THREE.Vector3(x - Math.sin(this.heading) * i * 0.1, 0, z - Math.cos(this.heading) * i * 0.1));
    this.state = 'lurk';
    this.stateT = rand(1, 4);
    this.wiggle = 0;
    this.speedNow = 0;
    this.rise = 0;
    this.meal = null;
    this.bulge = 0;
    this.flip = 0;

    const line = new THREE.PlaneGeometry(0.55, 1).translate(0, -0.5, 0).rotateX(-Math.PI / 2);
    this.warn = new THREE.Mesh(line, new THREE.MeshBasicMaterial({ color: 0xff1a1a, transparent: true, opacity: 0.5, depthWrite: false, fog: false }));
    this.warn.visible = false;
    game.scene.add(this.warn);

    // whirl attack telegraph
    this.whirlCool = 2;
    this.spin = 0;
    this.whirlRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff3b2f, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }));
    this.whirlRing.visible = false;
    game.scene.add(this.whirlRing);
  }

  /** too many turkeys in its face? spin round and fling them all away (it protects a meal fiercely) */
  wantsWhirl() {
    if (this.whirlCool > 0) return false;
    if (this.meal) return this.latched.length >= 1 || this.countNear(this.pos, this.def.whirlR) >= 1;
    return this.latched.length >= 2 || this.countNear(this.pos, 2.6) >= 2;
  }

  startWhirl() {
    this.whirlFrom = this.state;
    this.state = 'whirl';
    this.t = 0;
    this.game.audio.hiss(true);
  }

  /* ---------------------------------------------------------------- body */
  hits(p) {
    for (const m of this.segs) {
      m.getWorldPosition(_v);
      if (Math.hypot(p.x - _v.x, p.z - _v.z) < m.userData.r * 1.6 + 0.22 && Math.abs(p.y - _v.y) < 0.55) return true;
    }
    return false;
  }

  latchFrame(p) {
    let best = this.segs[0], bd = Infinity;
    for (const m of this.segs) {
      m.getWorldPosition(_v);
      const d = Math.hypot(p.x - _v.x, p.z - _v.z);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  attachPoint() { return new THREE.Vector3(rand(-0.3, 0.3), 1.05, 0); }

  hitFx(p) { this.game.fx.burst(p, { n: 3, colors: [0x151515, 0xd8373a], speed: [1, 2], up: [1, 2], size: [0.03, 0.06], flat: 0.3 }); }

  bellyPos(out) {
    const i = Math.min(N - 1, Math.floor(this.bulge * (N - 1)));
    return this.segs[i].getWorldPosition(out);
  }

  onDamage() {
    if (this.state === 'lurk' || this.state === 'slither') { this.state = 'chase'; this.t = 0; }
  }

  onDeath() {
    this.warn.visible = false;
    this.whirlRing.visible = false;
    this.game.audio.hiss(true);
    if (this.meal) {
      const m = this.meal;
      this.meal = null;
      m.releaseFromBelly(this.bellyPos(_v));
      this.game.hud.toast('The turkey popped out alive!', 2);
    }
  }

  /* ---------------------------------------------------------------- AI */
  think(dt) {
    const g = this.game, d = this.def;
    const moveTo = (x, z, speed, turn = 4) => this.walk(x, z, speed, dt, 0.3, turn);
    this.whirlCool -= dt;
    if (this.meal && this.state !== 'digest') this.bulge = Math.min(1, this.bulge + dt / d.digestTime);
    if (['chase', 'rear', 'digest', 'recover'].includes(this.state) && this.wantsWhirl()) this.startWhirl();
    switch (this.state) {
      case 'lurk':
        this.speedNow = damp(this.speedNow, 0, 5, dt);
        this.stateT -= dt;
        if (this.stateT <= 0) {
          this.state = 'slither';
          this.wanderTo = this.wanderPoint(1, d.leash, new THREE.Vector3());
        }
        this.aware(dt);
        break;
      case 'slither':
        if (moveTo(this.wanderTo.x, this.wanderTo.z, 1.4) < 0.5) { this.state = 'lurk'; this.stateT = rand(3, 7); }
        this.aware(dt);
        break;
      case 'chase': {
        if (this.wantsShake()) { this.state = 'thrash'; this.t = 0; break; }
        const tg = this.target;
        if (!tg || tg.dead || !tg.grounded || Math.hypot(this.home.x - this.pos.x, this.home.z - this.pos.z) > d.leash * 2 || !this.sees(tg)) {
          this.target = this.findTarget(d.aggro * 1.4);
          if (!this.target) { this.state = 'slither'; this.wanderTo = this.home.clone(); this.engaged = false; }
          break;
        }
        const dist = moveTo(tg.pos.x, tg.pos.z, 3.6, 6);
        if (dist < d.strikeLen && this.cool <= 0) {
          this.state = 'rear';
          this.t = 0;
          g.audio.hiss();
        }
        break;
      }
      case 'rear': {
        this.speedNow = damp(this.speedNow, 0, 12, dt);
        const tg = this.target;
        if (tg && !tg.dead) this.heading = dampAngle(this.heading, Math.atan2(tg.pos.x - this.pos.x, tg.pos.z - this.pos.z), 5, dt);
        if (this.wantsShake()) { this.state = 'thrash'; this.t = 0; break; }
        if (this.t >= 0.6) { this.state = 'strike'; this.t = 0; this.strikeFrom = this.pos.clone(); }
        break;
      }
      case 'strike': {
        const k = Math.min(1, this.t / 0.16);
        this.pos.x = this.strikeFrom.x + Math.sin(this.heading) * d.strikeLen * k;
        this.pos.z = this.strikeFrom.z + Math.cos(this.heading) * d.strikeLen * k;
        const hit = this.turkeysNear(this.pos, 0.5)[0];
        if (hit && this.meal) {
          hit.die('bite'); // mouth's full: a venomous bite will do
          this.state = 'recover';
          this.t = 0;
          g.audio.hiss();
        } else if (hit) {
          this.meal = hit;
          hit.eatenBy(this);
          this.bulge = 0;
          this.state = 'digest';
          this.t = 0;
          g.audio.gulp();
          g.hud.toast('A snake swallowed a turkey! Quick, beat it before it digests!', 3);
        } else if (this.hurtPlayer(this.pos, 0.45, d.bite, { knock: 4, stun: 0.35 })) {
          // (you're a bit big to swallow: a venomous bite will have to do)
          this.state = 'recover';
          this.t = 0;
          g.audio.hiss();
        } else if (k >= 1) { this.state = 'recover'; this.t = 0; }
        break;
      }
      case 'recover':
        this.speedNow = 0;
        if (this.t >= 0.6) { this.state = this.meal ? 'digest' : 'chase'; if (this.meal) this.t = this.bulge * d.digestTime; this.cool = 0.8; }
        break;
      case 'digest':
        this.bulge = Math.min(1, this.t / d.digestTime);
        moveTo(this.home.x, this.home.z, 0.7, 3);
        if (this.wantsShake()) { this.shakeOff(); g.audio.hiss(); }
        if (this.bulge >= 1) {
          const m = this.meal;
          this.meal = null;
          if (m) m.digested(this.bellyPos(_v));
          this.state = 'chase';
          this.cool = 1.5;
        }
        break;
      case 'whirl': {
        this.speedNow = 0;
        const spinning = this.t >= 0.35;
        if (spinning) {
          if (this.latched.length) this.shakeOff();
          for (const t of this.turkeysNear(this.pos, d.whirlR)) t.blastAway(this.pos, rand(4.5, 7), 2.8);
        }
        if (this.t >= 1.15) {
          this.whirlCool = this.meal ? 2.2 : 4;
          this.state = this.meal ? 'digest' : 'chase';
          this.t = this.meal ? this.bulge * d.digestTime : 0;
          this.cool = 0.5;
        }
        break;
      }
      case 'thrash':
        this.speedNow = 0;
        if (this.t >= 0.35 && this.latched.length) { this.shakeOff(); g.audio.hiss(); }
        if (this.t >= 0.8) { this.state = this.meal ? 'digest' : 'chase'; this.t = this.meal ? this.bulge * d.digestTime : 0; }
        break;
    }
  }

  alert(t) {
    if (!this.alive || (this.state !== 'lurk' && this.state !== 'slither') || !t.grounded) return;
    this.target = t;
    this.state = 'chase';
    this.engaged = true;
    this.game.audio.hiss();
  }

  aware() {
    if (this.latched.length) { this.state = 'chase'; this.engaged = true; return; }
    const tg = this.findTarget();
    if (tg) { this.target = tg; this.state = 'chase'; this.engaged = true; this.game.audio.hiss(); }
  }

  /* ---------------------------------------------------------------- animation */
  pose(dt) {
    const moving = this.alive && (this.speedNow > 0.05 || this.state === 'strike');
    this.wiggle += dt * (moving ? 5 + this.speedNow * 3 : 0);
    // the head weaves side to side as it moves: the trail turns that into S-curves
    const weave = moving && this.state !== 'strike' ? Math.sin(this.wiggle) * 0.35 : 0;
    const hx = this.pos.x + Math.cos(this.heading) * weave * 0.25;
    const hz = this.pos.z - Math.sin(this.heading) * weave * 0.25;
    const last = this.trail[0];
    if (Math.hypot(hx - last.x, hz - last.z) > 0.06 && this.state !== 'dying') {
      this.trail.unshift((this.spare.pop() ?? new THREE.Vector3()).set(hx, 0, hz));
      // trim what's beyond the tail (the points get reused)
      let len = 0;
      for (let i = 1; i < this.trail.length; i++) {
        len += Math.hypot(this.trail[i].x - this.trail[i - 1].x, this.trail[i].z - this.trail[i - 1].z);
        if (len > BODY_LEN) { while (this.trail.length > i + 1) this.spare.push(this.trail.pop()); break; }
      }
    }

    const root = this.rig.root;
    root.position.copy(this.pos);
    // whirl: coil up, then spin the whole body round twice
    const whirling = this.alive && this.state === 'whirl';
    this.spin = whirling ? Math.max(0, Math.min(1, (this.t - 0.35) / 0.8)) * Math.PI * 4 : 0;
    root.rotation.set(0, this.spin, 0);
    this.whirlRing.visible = whirling;
    if (whirling) {
      const r = this.def.whirlR * Math.min(1, this.t / 0.3);
      this.whirlRing.position.set(this.pos.x, this.game.world.groundHeight(this.pos.x, this.pos.z) + 0.05, this.pos.z);
      this.whirlRing.scale.set(r, 1, r);
      this.whirlRing.material.opacity = 0.4 + Math.sin(this.t * 30) * 0.2;
    }

    // rear up before striking
    const target = this.state === 'rear' ? 1 : this.state === 'whirl' ? 0.7 : this.state === 'strike' ? 0.5 : this.state === 'lurk' ? 0.15 : 0.1;
    this.rise = damp(this.rise, this.alive ? target : 0, 10, dt);
    this.flip = damp(this.flip, this.alive ? 0 : Math.PI, 6, dt);

    // place segments at fixed spacing along the trail
    let seg = 0, want = SPACING, acc = 0;
    for (let i = 1; i < this.trail.length && seg < N; i++) {
      const a = this.trail[i - 1], b = this.trail[i];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      while (acc + len >= want && seg < N) {
        const k = (want - acc) / (len || 1);
        this.placeSeg(seg++, a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k, Math.atan2(a.x - b.x, a.z - b.z));
        want += SPACING;
      }
      acc += len;
    }
    if (seg < N) {
      // trail too short (it can't be for long): the rest of the body carries straight on behind, rather than
      // being left wherever it was last put
      const n = this.trail.length, b = this.trail[n - 1], a = this.trail[Math.max(0, n - 2)];
      let dx = b.x - a.x, dz = b.z - a.z;
      const l = Math.hypot(dx, dz);
      if (l < 1e-4) { dx = -Math.sin(this.heading); dz = -Math.cos(this.heading); } else { dx /= l; dz /= l; }
      for (; seg < N; seg++, want += SPACING) this.placeSeg(seg, b.x + dx * (want - acc), b.z + dz * (want - acc), Math.atan2(-dx, -dz));
    }

    const hm = this.headMesh;
    hm.position.set(0, this.game.world.groundHeight(this.pos.x, this.pos.z) - this.pos.y + 0.13 + this.rise * 0.9, 0);
    hm.rotation.set(-this.rise * 0.5, this.heading, this.flip);
    const flick = this.alive && Math.sin(this.game.time * 9 + this.home.x) > 0.6;
    this.tongue.scale.set(1, 1, flick ? 1 : 0.05);

    // strike warning strip
    this.warn.visible = this.state === 'rear';
    if (this.warn.visible) {
      this.warn.position.set(this.pos.x, this.game.world.groundHeight(this.pos.x, this.pos.z) + 0.05, this.pos.z);
      this.warn.rotation.y = this.heading;
      this.warn.scale.set(1, 1, this.def.strikeLen * Math.min(1, this.t / 0.3));
      this.warn.material.opacity = 0.5 + Math.sin(this.t * 25) * 0.2;
    }
  }

  /** put body segment `seg` at (x, z), pointing along `yaw` (towards the head) */
  placeSeg(seg, x, z, yaw) {
    const m = this.segs[seg];
    const thrash = this.state === 'thrash' ? Math.sin(this.t * 30 + seg * 0.7) * 0.25 * (seg / N) : 0;
    const y = this.game.world.groundHeight(x, z) + m.userData.r * 0.7 + Math.max(0, this.rise * 0.55 - seg * 0.12);
    m.position.set(x - this.pos.x + Math.cos(this.heading) * thrash, y - this.pos.y, z - this.pos.z - Math.sin(this.heading) * thrash);
    m.rotation.set(0, yaw, this.flip);
    const bulge = this.meal ? Math.max(0, 1 - Math.abs(seg / (N - 1) - this.bulge) * 6) : 0;
    const r = m.userData.r * (1 + bulge * 1.1);
    m.scale.set(r, r * 0.75, m.userData.r * 1.5);
  }

  dispose() {
    super.dispose();
    this.game.scene.remove(this.warn);
    this.game.scene.remove(this.whirlRing);
  }
}
