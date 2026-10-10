import * as THREE from 'three';
import { createPlayerRig } from './playerModel.js';
import { damp, dampAngle, angleDiff, clamp, lerp, rand, smoothstep, TAU } from './util.js';

export const MAX_HP = 100;
const REGEN_DELAY = 5; // seconds out of trouble before he starts to get his breath back...
const REGEN_RATE = 9; // ...and then how fast it comes back (health a second)
const IFRAMES = 0.6; // straight after a hit, a moment before the next one can land
const GRACE = 2.5; // just dug out of a mound: a moment to get his bearings before anything can hurt him
const FALL_T = 0.85; // going down: over backwards like a felled tree, the way Big Kev goes
const LIE_LIFT = 0.16; // (flat on his back, how far up his feet have to be for his back to rest on the ground)
const POP_T = 0.8; // bursting out of the top of the mound he's been dug out of
// diving into a mound, to go somewhere else (see Travel): down into a crouch, up and over, and in, head first
const CROUCH_T = 0.22, LEAP_T = 0.55, SINK_T = 0.3;
const HOP_T = 0.4; // hopping on or off the train (see Ride)
const SPRAWL_T = 1.5, GETUP_T = 0.55; // landing flat on his back out of the sky (see Opening): seconds seeing stars, and getting up
const MID = 0.98; // (the middle of him, up from his boots: what he turns head over heels about)
const _v = new THREE.Vector3();

/* stars going round his head, when he's seeing them (like Big Kev's) */
function starRing() {
  const stars = new THREE.Group();
  const geo = new THREE.OctahedronGeometry(0.045, 0), mat = new THREE.MeshBasicMaterial({ color: 0xffe066 });
  for (let i = 0; i < 5; i++) {
    const st = new THREE.Mesh(geo, mat);
    st.userData.a = (i / 5) * TAU;
    stars.add(st);
  }
  stars.visible = false;
  return stars;
}

export class Player {
  constructor(game) {
    this.game = game;
    this.rig = createPlayerRig();
    this.rig.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.rig.root.rotation.order = 'YXZ'; // (so he can topple over backwards, whichever way he's facing)
    this.stars = starRing();
    this.rig.head.add(this.stars);
    game.scene.add(this.rig.root);
    this.pos = new THREE.Vector3(0, 0, 9);
    this.vel = new THREE.Vector3();
    this.heading = Math.PI;
    this.radius = 0.42;
    this.maxSpeed = 6.2;
    this.speed = 0;
    this.phase = 0;
    this.throwT = 1;
    this.pluckT = 1;
    this.whistling = false;
    this.whistleK = 0;
    this.hair = 0;
    this.time = 0;
    this.knockVel = new THREE.Vector3();
    this.dizzy = 0;
    this.hop = 0; // height above the ground (trampolining!)
    this.hopV = 0;
    // his health, and how he's doing: 'ok', 'down' (out cold: WASTED), 'diving' (into a mound, to go somewhere
    // else), 'buried' (in a mound, waiting to be dug out) or 'rising' (bursting out of the top of it); or 'aboard' the
    // train, and 'alighting' from it; or 'flung' out of the Emperor's catapult, 'sprawled' where he came down, and
    // getting up after ('getup': see Opening)
    this.hp = MAX_HP;
    this.life = 'ok';
    this.lifeT = 0;
    this.iframes = 0;
    this.blink = 0; // (flickering, while nothing can hurt him just after he's been dug out)
    this.quiet = 99; // seconds since he was last hurt
    this.flinch = 0;
    this.landK = 0;
    this.beatT = 0;
    this.digK = 0; // how far he's been dug out of the mound (the turkeys at it set this)
    this.under = 0; // (and how far under he still is, before that: 1 is right under, out of sight)
    this.hopFrom = new THREE.Vector3(); // (hopping on or off the train: from where, to where)
    this.hopTo = new THREE.Vector3();
  }

  /** as far as anything after him is concerned: he's down, or buried in a mound (so leave him be) */
  get dead() { return this.life !== 'ok'; }
  /** up and about, and fair game */
  get grounded() { return this.life === 'ok'; }

  /**
   * Bowled over (by a spinning rake, say), or just knocked back a step: shoved away from `from` at `power`
   * (m/s), and dazed for `daze` seconds (stood there, seeing stars if it's a while)
   */
  knock(from, power, daze = 1.1) {
    const dx = this.pos.x - from.x, dz = this.pos.z - from.z, d = Math.hypot(dx, dz) || 1;
    this.knockVel.set((dx / d) * power, 0, (dz / d) * power);
    this.dizzy = Math.max(this.dizzy, daze);
    if (power < 8) return;
    this.game.fx.dust(this.pos, 8);
    this.game.audio.land();
    this.game.shake(0.4);
  }

  /**
   * Something's got him (a peck, a bite, a clip round the ear with a rake): `amount` off his health, knocked
   * back away from `from` at `knock` (m/s) and rooted to the spot for `stun` seconds. Nothing lands while he's
   * down, or for a moment after the last hit. True if it did
   */
  hurt(amount, from, { knock = 4, stun = 0.2 } = {}) {
    const g = this.game;
    if (this.life !== 'ok' || this.iframes > 0 || !g.started) return false;
    this.iframes = IFRAMES;
    if (from && knock) this.knock(from, knock, stun);
    if (g.dev?.invincible) return true; // (dev mode: knocked about, but none the worse for it)
    this.hp = Math.max(0, this.hp - amount);
    this.quiet = 0;
    this.flinch = 1;
    g.hud.hurt(amount / MAX_HP);
    g.input.rumble(Math.min(1, 0.35 + amount / MAX_HP * 2), this.hp <= 0 ? 400 : 160); // (and through the controller, if you're on one)
    g.audio.oof(this.hp <= 0);
    g.shake(Math.min(0.6, 0.15 + amount * 0.012));
    g.fx.burst(_v.set(this.pos.x, this.pos.y + this.hop + 1.35, this.pos.z), { glow: true, n: 7, colors: [0xffffff, 0xffe066, 0xff7a3d], speed: [1.5, 3.2], up: [0.3, 2], grav: 3, drag: 2.5, size: [0.04, 0.08], life: [0.25, 0.45] });
    if (this.hp <= 0) this.goDown(from);
    else if (!this.toldHurt) {
      this.toldHurt = true;
      g.hud.toast('Ouch! Foes go for you too. Keep out of the red circles, and get clear to heal', 5);
    }
    return true;
  }

  /** his health's all gone: over backwards he goes (facing whatever did it), out cold. WASTED */
  goDown(from) {
    this.life = 'down';
    this.lifeT = 0;
    this.landed = false;
    this.fallFrom = this.heading;
    this.fallTo = this.clearFall(from ? Math.atan2(from.x - this.pos.x, from.z - this.pos.z) : this.heading);
    this.throwT = this.pluckT = 1;
    this.whistling = false;
    this.dizzy = 0;
    if (from) this.knock(from, Math.max(6, this.knockVel.length()), 0); // (the last one sends him flying)
    this.game.wasted.start();
  }

  /** which way to face so as to fall flat on his back somewhere clear, as near as can be to `face` */
  clearFall(face) {
    const w = this.game.world;
    for (let i = 0; i < 9; i++) {
      const h = face + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.4, bx = -Math.sin(h), bz = -Math.cos(h);
      if ([0.6, 1.2, 1.8].every((d) => w.isFree(this.pos.x + bx * d, this.pos.z + bz * d, 0.3))) return h;
    }
    return face;
  }

  /**
   * Put back after going down: buried in mound m, up to his eyeballs, facing `facing` (the camera), waiting for
   * the turkeys to dig him out. Good as new, mind; bar with `heal` false, when he's only been down the tunnels,
   * off somewhere else (see Travel). `under`: how far under he starts out (1: right under, out of sight)
   */
  bury(m, facing, { heal = true, under = 0 } = {}) {
    this.life = 'buried';
    this.lifeT = 0;
    this.digSite = m;
    this.digK = 0;
    this.under = under;
    if (heal) {
      this.hp = MAX_HP;
      this.quiet = 99;
    }
    this.iframes = this.flinch = this.dizzy = this.landK = 0;
    this.knockVel.set(0, 0, 0);
    this.vel.set(0, 0, 0);
    this.speed = this.hop = this.hopV = 0;
    this.pos.set(m.pos.x, m.pos.y, m.pos.z);
    this.heading = facing;
  }

  /**
   * Into mound m, head first, to go somewhere else (see Travel): he turns to face it, crouches, and he's up and over
   * and in, boots and all. Then he's buried in it, right under
   */
  dive(m) {
    this.life = 'diving';
    this.lifeT = 0;
    this.digSite = m;
    this.throwT = this.pluckT = 1;
    this.whistling = false;
    this.flinch = this.dizzy = this.landK = 0;
    this.knockVel.set(0, 0, 0);
    this.vel.set(0, 0, 0);
    this.speed = this.hop = this.hopV = 0;
    this.diveFrom = this.pos.clone();
    this.heading = Math.atan2(m.pos.x - this.pos.x, m.pos.z - this.pos.z);
  }

  /** on the train: a hop in through her doorway at `door`, and he's aboard, out of sight (see Ride) */
  board(door) {
    this.life = 'aboard';
    this.lifeT = 0;
    this.throwT = this.pluckT = 1;
    this.whistling = false;
    this.flinch = this.dizzy = this.landK = 0;
    this.knockVel.set(0, 0, 0);
    this.vel.set(0, 0, 0);
    this.speed = this.hop = this.hopV = 0;
    this.hopFrom.copy(this.pos);
    this.hopTo.copy(door);
  }

  /** and off again, out of her doorway at `door`, in a hop down onto the platform at `to` */
  alight(door, to) {
    this.life = 'alighting';
    this.lifeT = 0;
    this.hopFrom.copy(door);
    this.hopTo.copy(to);
    this.pos.copy(door);
  }

  /**
   * Into the Emperor's catapult, and flung (see Opening): wherever it puts him (`pos`: the middle of him, `tumble`: how
   * far head over heels he's gone, `tuck`: how far he's curled up), arms going
   */
  fling() {
    this.life = 'flung';
    this.lifeT = 0;
    this.tumble = 0;
    this.tuck = 0;
    this.throwT = this.pluckT = 1;
    this.whistling = false;
    this.flinch = this.dizzy = this.landK = 0;
    this.knockVel.set(0, 0, 0);
    this.vel.set(0, 0, 0);
    this.speed = this.hop = this.hopV = 0;
  }

  /** and down he comes, flat on his back, seeing stars, till he gets up and gets his bearings */
  sprawl() {
    this.life = 'sprawled';
    this.lifeT = FALL_T;
    this.fallFrom = this.fallTo = this.heading;
    this.landed = true;
    this.tumble = 0;
  }

  /** dug out: up he pops out of the top of the mound, spinning round once, to land on his feet at `to` */
  popOut(to) {
    this.life = 'rising';
    this.lifeT = 0;
    this.popFrom = this.rig.root.position.clone();
    this.popTo = to.clone();
    this.popHeading = this.heading;
    const m = this.digSite, top = m.pos.y + m.dome.scale.y * m.group.scale.y;
    this.popH = Math.max(1, top + 0.6 - (this.popFrom.y + to.y) / 2);
  }

  handPos(out) {
    return this.rig.armR.hand.getWorldPosition(out);
  }

  /** what the camera keeps in the middle of the picture: him, or once he's down, the middle of him lying there */
  focus(out) {
    out.copy(this.pos);
    if (this.life === 'down') {
      const k = Math.min(1, this.lifeT / FALL_T) ** 2;
      out.x -= Math.sin(this.heading) * 0.8 * k;
      out.z -= Math.cos(this.heading) * 0.8 * k;
      out.y -= 0.55 * k;
    }
    return out;
  }

  playThrow() { this.throwT = 0; }
  playPluck() { this.pluckT = 0; }

  /** move: {x, z} world-space direction with length 0..1; aim: world point */
  update(dt, move, aim) {
    const g = this.game;
    this.time += dt;
    this.iframes = Math.max(0, this.iframes - dt);
    this.blink = Math.max(0, this.blink - dt);
    this.flinch = Math.max(0, this.flinch - dt * 3);
    this.landK = Math.max(0, this.landK - dt * 4);
    if (this.life !== 'ok') { this.updateOut(dt); return; }
    // (out of trouble a while, he gets his breath back; in a bad way, you can hear his heart going)
    this.quiet += dt;
    if (this.quiet > REGEN_DELAY && this.hp < MAX_HP) this.hp = Math.min(MAX_HP, this.hp + REGEN_RATE * dt);
    if (this.hp < MAX_HP * 0.3 && (this.beatT -= dt) <= 0) { this.beatT = 0.95; g.audio.heartbeat(); }
    this.dizzy = Math.max(0, this.dizzy - dt);
    const busy = this.pluckT < 1 || this.dizzy > 0;
    const water = g.world.waterAt(this.pos.x, this.pos.z);
    const speed = this.maxSpeed
      * (g.enemies.slowAt(this.pos) < 1 ? 0.6 : 1) // sticky spider silk
      * (water.depth === 2 ? 0.6 : water.depth === 1 ? 0.85 : 1); // wading
    const tx = busy ? 0 : move.x * speed, tz = busy ? 0 : move.z * speed;
    this.vel.x = damp(this.vel.x, tx, 12, dt);
    this.vel.z = damp(this.vel.z, tz, 12, dt);
    this.pos.x += (this.vel.x + this.knockVel.x) * dt;
    this.pos.z += (this.vel.z + this.knockVel.z) * dt;
    this.knockVel.multiplyScalar(Math.exp(-4 * dt));
    g.world.resolve(this.pos, this.radius, g.mounds.colliders);
    g.world.resolve(this.pos, this.radius, g.enemies.colliders);
    this.pos.y = g.world.groundHeight(this.pos.x, this.pos.z);
    this.bouncing(dt);
    this.speed = Math.hypot(this.vel.x, this.vel.z);

    // in the water: a wake behind him when he's moving, lazy rings when he stands still (like the turkeys)
    const w = g.world.waterAt(this.pos.x, this.pos.z);
    const surface = w.depth ? g.world.surfaceY(w, this.pos.x, this.pos.z) : this.pos.y;
    this.wade = damp(this.wade ?? 0, clamp((surface - this.pos.y - 0.45) / 0.45, 0, 1), 5, dt); // 0 dry .. 1 waist deep
    this.rippleT = (this.rippleT ?? 0) - dt;
    if (w.depth && this.rippleT <= 0) {
      const big = 0.7 + this.wade * 0.6;
      if (this.speed > 0.8) {
        this.rippleT = 0.14;
        g.fx.ripple(this.pos.x - this.vel.x * 0.05, surface, this.pos.z - this.vel.z * 0.05, 1.3 * big, 1.0, 0.32, 0.35 * big);
      } else {
        this.rippleT = rand(0.8, 1.2);
        g.fx.ripple(this.pos.x, surface, this.pos.z, 1.6 * big, 1.7, 0.26, 0.4 * big);
      }
    }

    const aimYaw = Math.atan2(aim.x - this.pos.x, aim.z - this.pos.z);
    if (this.facing !== undefined) this.heading = dampAngle(this.heading, this.facing, 8, dt); // (made to face a certain way, whichever way he's going: see Opening)
    else if (this.speed > 0.4) this.heading = dampAngle(this.heading, Math.atan2(this.vel.x, this.vel.z), 12, dt);
    else if (this.whistling || this.throwT < 1) this.heading = dampAngle(this.heading, aimYaw, 10, dt);

    this.animate(dt, aimYaw);
  }

  /**
   * boing: walk onto the trampoline (or Big Kev's belly) and you bounce. Out cold, he still bounces, less
   * and less, till he lies there on the mat
   */
  bouncing(dt) {
    const g = this.game;
    const tr = g.toys.trampolineAt(this.pos);
    const floor = tr ? tr.matY - this.pos.y : 0;
    this.hopV -= 24 * dt;
    this.hop += this.hopV * dt;
    if (this.hop > floor) return;
    const out = this.life !== 'ok';
    if (tr && (!out || this.hopV < -3)) {
      this.hopV = out ? -this.hopV * 0.45 : 10.5;
      tr.kick(out ? 0.8 : 1.3);
      g.audio.boing(3);
    } else this.hopV = 0;
    this.hop = floor;
  }

  /** down (out cold), diving into a mound, buried in one, or bursting out of one: no walking about, and nothing to aim at */
  updateOut(dt) {
    const g = this.game;
    this.lifeT += dt;
    this.speed = 0;
    if (this.life === 'down') {
      // (the last hit carries him on a way as he goes over)
      this.pos.x += this.knockVel.x * dt;
      this.pos.z += this.knockVel.z * dt;
      this.knockVel.multiplyScalar(Math.exp(-5 * dt));
      g.world.resolve(this.pos, this.radius, g.mounds.colliders);
      g.world.resolve(this.pos, this.radius, g.enemies.colliders);
      this.pos.y = g.world.groundHeight(this.pos.x, this.pos.z);
      this.bouncing(dt);
      if (!this.landed && this.lifeT >= FALL_T) {
        // (he hits the deck)
        this.landed = true;
        g.fx.dust(this.focus(_v), 14);
        g.audio.thud();
        g.shake(0.3);
      }
      this.poseDown();
    } else if (this.life === 'diving') {
      const was = this.lifeT - dt, t = this.lifeT;
      if (was < CROUCH_T && t >= CROUCH_T) g.audio.throw(); // (he's off)
      if (was < CROUCH_T + LEAP_T && t >= CROUCH_T + LEAP_T) {
        // (head first into the top of it)
        this.digSite.splash(26, 1.4);
        g.audio.gloop();
        g.audio.mound();
        g.shake(0.2);
      }
      if (t >= CROUCH_T + LEAP_T + SINK_T) {
        // (right in: buried in it now, out of sight, facing the way he went in)
        this.bury(this.digSite, this.heading, { heal: false, under: 1 });
        this.poseBuried();
      } else this.poseDiving(dt);
    } else if (this.life === 'buried') this.poseBuried();
    else if (this.life === 'aboard' || this.life === 'alighting') {
      // (a hop up into her doorway, or down out of it onto the platform)
      const k = Math.min(1, this.lifeT / HOP_T), dx = this.hopTo.x - this.hopFrom.x, dz = this.hopTo.z - this.hopFrom.z;
      this.pos.lerpVectors(this.hopFrom, this.hopTo, k);
      this.hop = Math.sin(k * Math.PI) * 0.45;
      if (dx || dz) this.heading = dampAngle(this.heading, Math.atan2(dx, dz), 14, dt);
      if (this.life === 'alighting' && k >= 1) {
        this.life = 'ok';
        this.hop = 0;
        this.landK = 1;
        g.audio.land();
      }
      this.speed = k < 1 ? this.maxSpeed * 0.5 : 0;
      this.animate(dt, this.heading);
      this.speed = 0;
    } else if (this.life === 'flung') this.poseFlung(dt);
    else if (this.life === 'sprawled') {
      this.pos.y = g.world.groundHeight(this.pos.x, this.pos.z);
      this.poseDown();
      if (this.lifeT >= FALL_T + SPRAWL_T) { this.life = 'getup'; this.lifeT = 0; }
    } else if (this.life === 'getup') {
      const k = Math.min(1, this.lifeT / GETUP_T);
      if (k >= 1) {
        // (on his feet, and a moment's grace to get his bearings)
        this.life = 'ok';
        this.iframes = this.blink = GRACE;
        this.landK = 1;
        g.audio.land();
        this.animate(dt, this.heading);
        return;
      }
      this.poseGetUp(k, dt);
    } else {
      const k = Math.min(1, this.lifeT / POP_T);
      this.pos.x = lerp(this.popFrom.x, this.popTo.x, k);
      this.pos.z = lerp(this.popFrom.z, this.popTo.z, k);
      this.pos.y = g.world.groundHeight(this.pos.x, this.pos.z);
      if (k >= 1) {
        // (on his feet, and a moment's grace to get his bearings)
        this.life = 'ok';
        this.pos.copy(this.popTo);
        this.heading = this.popHeading;
        this.iframes = this.blink = GRACE;
        this.landK = 1;
        g.fx.dust(this.pos, 10);
        g.audio.land();
        this.animate(dt, this.heading);
        return;
      }
      this.poseRising(k, dt);
    }
    this.rig.root.visible = (this.life !== 'buried' || this.under < 1) && (this.life !== 'aboard' || this.lifeT < HOP_T);
    this.rig.root.updateMatrixWorld(true);
  }

  /** stars round his head: when he's dazed, or out cold (`fall`: how far over he's gone, `level`: undoing the tilt of his head) */
  poseStars(show, fall, level) {
    const st = this.stars;
    st.visible = show;
    if (!show) return;
    const t = this.game.time, spin = fall > 0 ? 2.6 : 4, rad = fall > 0 ? 0.24 : 0.2;
    st.position.set(0, 0.46 - 0.3 * fall, 0.34 * fall);
    st.rotation.set(level, 0, 0);
    st.children.forEach((s, i) => {
      const a = s.userData.a + t * spin;
      s.position.set(Math.cos(a) * rad, Math.sin(a * 2 + i) * 0.025, Math.sin(a) * rad);
      s.rotation.y = t * 3;
    });
  }

  /** out cold: over backwards like a felled tree (a little bounce as he lands), arms flung out over his head */
  poseDown() {
    const r = this.rig, g = this.game, k = Math.min(1, this.lifeT / FALL_T);
    let fall = k * k;
    if (k >= 1) {
      const b = Math.min(1, (this.lifeT - FALL_T) / 0.3);
      fall -= Math.sin(b * Math.PI) * 0.07 * (1 - b);
    }
    const spread = Math.min(1, k * 1.4);
    this.heading = this.fallFrom + angleDiff(this.fallFrom, this.fallTo) * Math.min(1, k * 1.5);
    let y = this.pos.y + this.hop + LIE_LIFT * fall;
    // (out in deep water, he floats)
    const w = g.world.waterAt(this.pos.x, this.pos.z);
    if (w.depth === 2) y = lerp(y, Math.max(y, g.world.surfaceY(w, this.pos.x, this.pos.z) - 0.12), fall);
    const pitch = -Math.PI / 2 * fall, headX = -0.25 * spread;
    r.root.position.set(this.pos.x, y, this.pos.z);
    r.root.rotation.set(pitch, this.heading, 0);
    r.root.scale.setScalar(1);
    r.torso.rotation.set(0, 0, 0);
    r.torso.scale.set(1, 1 + Math.sin(this.time * 1.6) * 0.012 * spread, 1); // (still breathing, just)
    r.legL.hip.rotation.set(0.08 * spread, 0, 0.14 * spread);
    r.legR.hip.rotation.set(0.08 * spread, 0, -0.14 * spread);
    r.legL.knee.rotation.x = r.legR.knee.rotation.x = 0.15 * spread;
    r.armL.shoulder.rotation.set(0, 0.3 * spread, (Math.PI / 2 + 0.55) * spread);
    r.armR.shoulder.rotation.set(0, -0.3 * spread, -(Math.PI / 2 + 0.55) * spread);
    r.armL.elbow.rotation.x = r.armR.elbow.rotation.x = -0.35 * spread;
    r.head.rotation.set(headX, 0, 0);
    // (his hair flops out on the ground round his head as he lands)
    r.hairBack.rotation.set(lerp(this.hair, 2.5, fall * fall), 0, 0);
    this.poseStars(k > 0.6, fall, -(pitch + headX));
  }

  /** flung: curled up (as far as `tuck` says), going head over heels about the middle of him, his arms going like the clappers */
  poseFlung(dt) {
    const r = this.rig, turn = this.tumble, k = this.tuck, flail = Math.sin(this.time * 17) * 0.45;
    const s = Math.sin(turn);
    r.root.position.set(this.pos.x - MID * s * Math.sin(this.heading), this.pos.y - MID * Math.cos(turn), this.pos.z - MID * s * Math.cos(this.heading));
    r.root.rotation.set(turn, this.heading, 0);
    r.root.scale.setScalar(1);
    r.torso.rotation.set(0.45 * k, 0, 0);
    r.torso.scale.set(1, 1, 1);
    for (const l of [r.legL, r.legR]) {
      l.hip.rotation.set(-1.25 * k, 0, 0);
      l.knee.rotation.x = 1.8 * k;
    }
    r.armL.shoulder.rotation.set(-0.4, 0, Math.PI / 2 + 0.5 + flail);
    r.armR.shoulder.rotation.set(-0.4, 0, -(Math.PI / 2 + 0.5 - flail));
    r.armL.elbow.rotation.x = r.armR.elbow.rotation.x = -0.4;
    r.head.rotation.set(0.25 * k, 0, 0);
    this.hair = damp(this.hair, 1.3, 5, dt);
    r.hairBack.rotation.set(this.hair, 0, 0);
    this.poseStars(false, 0, 0);
  }

  /** getting up off his back (k: 0..1 of the way), heaving himself up onto his feet and shaking his head clear */
  poseGetUp(k, dt) {
    const r = this.rig, up = smoothstep(0, 1, k), fall = 1 - up, heave = Math.sin(k * Math.PI);
    r.root.position.set(this.pos.x, this.pos.y + LIE_LIFT * fall, this.pos.z);
    r.root.rotation.set(-Math.PI / 2 * fall, this.heading, 0);
    r.root.scale.setScalar(1);
    r.torso.rotation.set(0.5 * heave, 0, 0);
    r.torso.scale.set(1, 1, 1);
    for (const l of [r.legL, r.legR]) {
      l.hip.rotation.set(-0.9 * heave, 0, 0);
      l.knee.rotation.x = 1.4 * heave;
    }
    r.armL.shoulder.rotation.set(0, 0.3 * fall, (Math.PI / 2 + 0.55) * fall);
    r.armR.shoulder.rotation.set(0, -0.3 * fall, -(Math.PI / 2 + 0.55) * fall);
    r.armL.elbow.rotation.x = r.armR.elbow.rotation.x = -0.35 * fall;
    r.head.rotation.set(-0.25 * fall, Math.sin(k * 16) * 0.3 * (1 - k), 0);
    this.hair = damp(this.hair, 0.3, 5, dt);
    r.hairBack.rotation.set(lerp(this.hair, 2.5, fall * fall), 0, 0);
    this.poseStars(k < 0.6, 0, 0);
  }

  /**
   * Buried in the mound, head poking out of the top and an arm waving for help (both, as they get him loose),
   * wriggling about, and coming up out of it bit by bit as the turkeys dig
   */
  poseBuried() {
    const r = this.rig, m = this.digSite, t = this.lifeT, k = this.digK, up = 1 - this.under;
    const top = m.pos.y + m.dome.scale.y * m.group.scale.y; // (the top of the heap, as it looks right now)
    const sink = lerp(1.82, 1.3, k * k) - Math.max(0, Math.sin(t * 7)) * 0.04 + this.under * 0.6;
    r.root.position.set(this.pos.x, top - sink, this.pos.z);
    r.root.rotation.set(0, this.heading + Math.sin(t * 3) * 0.15, Math.sin(t * 6.3) * 0.06);
    r.root.scale.setScalar(1);
    r.torso.rotation.set(0, 0, 0);
    r.torso.scale.set(1, 1, 1);
    for (const l of [r.legL, r.legR]) { l.hip.rotation.set(0, 0, 0); l.knee.rotation.x = 0; }
    const wave = Math.sin(t * 10) * 0.45;
    r.armR.shoulder.rotation.set((Math.PI - 0.2) * up, 0, (-0.35 + wave) * up); // (down by his side, while he's right under)
    r.armR.elbow.rotation.x = -0.3 + Math.sin(t * 10 + 1) * 0.25;
    const both = clamp((k - 0.45) / 0.25, 0, 1); // (and then the other one, reaching out)
    r.armL.shoulder.rotation.set(lerp(0, Math.PI - 0.3, both), 0, lerp(0.1, 0.4, both) - wave * 0.5 * both);
    r.armL.elbow.rotation.x = lerp(-0.2, -0.4, both);
    r.head.rotation.set(Math.sin(t * 2.3) * 0.12, Math.sin(t * 3.1) * 0.5, Math.sin(t * 4.7) * 0.08);
    r.hairBack.rotation.set(0.1, 0, 0);
    this.poseStars(false);
  }

  /**
   * Into a mound head first: down into a crouch with his arms swung back, then a spring up off the ground and over
   * in an arc, arms out ahead of him, turning head over heels, and down into the top of it, boots last
   */
  poseDiving(dt) {
    const r = this.rig, m = this.digSite, t = this.lifeT, from = this.diveFrom;
    const top = m.pos.y + m.dome.scale.y * m.group.scale.y;
    const bend = smoothstep(0, CROUCH_T, t) * (1 - smoothstep(CROUCH_T, CROUCH_T + 0.1, t)); // (down into the crouch, and springing up out of it)
    const reach = smoothstep(CROUCH_T - 0.04, CROUCH_T + 0.14, t); // (his arms: from swung back to out ahead of him)
    const air = clamp((t - CROUCH_T) / LEAP_T, 0, 1), sink = clamp((t - CROUCH_T - LEAP_T) / SINK_T, 0, 1);
    // the middle of him: up off the ground in an arc, over the top of the heap and down into it, head first
    const y0 = from.y + MID - 0.24 * bend, y1 = top + 1.02, arc = 0.9 + m.r * 0.15;
    const mx = lerp(from.x, m.pos.x, air), mz = lerp(from.z, m.pos.z, air);
    const my = lerp(y0, y1, air) + 4 * arc * air * (1 - air) - sink * (y1 - top + MID + 0.4);
    const turn = Math.PI * 0.94 * smoothstep(0.05, 0.85, air);
    // (his boots hang off the middle of him: under it standing, over it upside down)
    const s = Math.sin(turn);
    r.root.position.set(mx - MID * s * Math.sin(this.heading), my - MID * Math.cos(turn), mz - MID * s * Math.cos(this.heading));
    r.root.rotation.set(turn, this.heading, 0);
    r.root.scale.setScalar(1);
    this.pos.set(mx, lerp(from.y, m.pos.y, air), mz); // (what the camera follows)
    r.torso.rotation.set(0.5 * bend, 0, 0);
    r.torso.scale.set(1, 1, 1);
    // (knees bent in the crouch, then legs out straight behind him)
    for (const l of [r.legL, r.legR]) {
      l.hip.rotation.set(lerp(0.08, -0.75, bend), 0, 0);
      l.knee.rotation.x = lerp(0.12, 1.5, bend);
    }
    // arms swung back, then up and over, to point the way in (with his head down between them)
    const arm = lerp(0.9 * bend, -(Math.PI - 0.12), reach);
    r.armL.shoulder.rotation.set(arm, 0, lerp(0.15, 0.12, reach));
    r.armR.shoulder.rotation.set(arm, 0, -lerp(0.15, 0.12, reach));
    r.armL.elbow.rotation.x = r.armR.elbow.rotation.x = lerp(-0.3, -0.05, reach);
    r.head.rotation.set(0.15 * reach, 0, 0);
    this.hair = damp(this.hair, 0.3 + air * 1.2, 5, dt);
    r.hairBack.rotation.set(this.hair, 0, 0);
    this.poseStars(false);
  }

  /** out of the top of the mound and down beside it, arms up (ta-da), spinning round once on the way */
  poseRising(k, dt) {
    const r = this.rig, air = Math.sin(k * Math.PI);
    r.root.position.lerpVectors(this.popFrom, this.popTo, k);
    r.root.position.y += 4 * this.popH * k * (1 - k);
    this.heading = this.popHeading - TAU * (1 - k) * (1 - k);
    r.root.rotation.set(0, this.heading, 0);
    r.root.scale.setScalar(1);
    r.torso.rotation.set(-0.15 * air, 0, 0);
    r.legL.hip.rotation.set(-0.6 * air, 0, 0.08);
    r.legR.hip.rotation.set(-0.45 * air, 0, -0.08);
    r.legL.knee.rotation.x = 1.1 * air;
    r.legR.knee.rotation.x = 0.9 * air;
    r.armL.shoulder.rotation.set(Math.PI - 0.3, 0, 0.55);
    r.armR.shoulder.rotation.set(Math.PI - 0.3, 0, -0.55);
    r.armL.elbow.rotation.x = r.armR.elbow.rotation.x = -0.2;
    r.head.rotation.set(-0.2 * air, 0, 0);
    this.hair = damp(this.hair, 0.6, 6, dt);
    r.hairBack.rotation.set(this.hair, 0, 0);
    this.poseStars(false);
  }

  animate(dt, aimYaw) {
    const r = this.rig;
    const k = clamp(this.speed / this.maxSpeed, 0, 1);
    this.phase += dt * (3 + this.speed * 1.55) * (this.facing === undefined ? 1 : -1); // (backwards, backing along)
    const s = Math.sin(this.phase), c = Math.cos(this.phase);

    // (just landed on his feet: a squash; flickering while nothing can touch him, just after he's been dug out)
    const sq = Math.sin(this.landK * Math.PI) * 0.12;
    r.root.position.set(this.pos.x, this.pos.y + this.hop + Math.abs(s) * 0.06 * k * (this.hop > 0 ? 0 : 1), this.pos.z);
    r.root.rotation.set(0, this.heading, Math.sin(this.time * 14) * 0.15 * Math.min(1, this.dizzy));
    r.root.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
    r.root.visible = this.blink <= 0 || Math.floor(this.time * 12) % 2 === 0;

    // legs
    r.legL.hip.rotation.set(-s * 0.65 * k, 0, 0);
    r.legR.hip.rotation.set(s * 0.65 * k, 0, 0);
    r.legL.knee.rotation.x = (0.1 + Math.max(0, c) * 0.9) * k;
    r.legR.knee.rotation.x = (0.1 + Math.max(0, -c) * 0.9) * k;

    // torso & breathing
    const breathe = Math.sin(this.time * 2.2) * 0.012;
    let torsoX = 0.1 * k, torsoY = 0;
    r.torso.scale.set(1, 1 + breathe, 1);

    // arms swing with the walk (and come up out of the water when he's wading deep)
    let lx = s * 0.55 * k, lz = 0.1, le = -0.25 - 0.35 * k;
    let rxa = -s * 0.55 * k, rz = -0.1, re = -0.25 - 0.35 * k;
    const wd = this.wade ?? 0;
    if (wd > 0) {
      lx = lerp(lx * 0.4, -0.55, wd); lz = lerp(lz, 0.45, wd); le = lerp(le, -1.25, wd);
      rxa = lerp(rxa * 0.4, -0.55, wd); rz = lerp(rz, -0.45, wd); re = lerp(re, -1.25, wd);
    }

    // whistle: left hand to the mouth
    this.whistleK = damp(this.whistleK, this.whistling ? 1 : 0, 14, dt);
    const w = this.whistleK;
    lx = lerp(lx, -1.25, w); lz = lerp(lz, -0.55, w); le = lerp(le, -2.0, w);

    // throw: overarm with the right arm
    if (this.throwT < 1) {
      this.throwT = Math.min(1, this.throwT + dt / 0.38);
      const t = this.throwT;
      let a;
      if (t < 0.3) a = lerp(0, 2.4, t / 0.3);
      else if (t < 0.6) a = lerp(2.4, 5.3, (t - 0.3) / 0.3);
      else a = lerp(5.3, TAU, (t - 0.6) / 0.4);
      rxa = a; re = -0.3; rz = -0.2;
      torsoY = Math.sin(t * Math.PI) * 0.35;
    }

    // pluck: bend down and yank
    if (this.pluckT < 1) {
      this.pluckT = Math.min(1, this.pluckT + dt / 0.36);
      const b = Math.sin(this.pluckT * Math.PI);
      torsoX += b * 0.75;
      lx = rxa = -b * 1.3;
      le = re = -0.3;
    }

    // hurt: rocked back, arms thrown out
    const f = this.flinch * this.flinch;
    torsoX -= 0.35 * f;
    lz += 0.5 * f; rz -= 0.5 * f;

    r.torso.rotation.set(torsoX, torsoY, Math.sin(this.phase) * 0.04 * k);
    r.armL.shoulder.rotation.set(lx, 0, lz);
    r.armL.elbow.rotation.x = le;
    r.armR.shoulder.rotation.set(rxa, 0, rz);
    r.armR.elbow.rotation.x = re;

    // head looks a little toward the cursor, tilts up to whistle (and snaps back when he's hit)
    const look = clamp(angleDiff(this.heading, aimYaw), -0.7, 0.7) * 0.6;
    this.lookY = damp(this.lookY ?? 0, look, 8, dt);
    this.lookX = damp(this.lookX ?? 0, -0.12 * w - 0.05 * k, 8, dt);
    r.head.rotation.set(this.lookX - 0.3 * f, this.lookY, 0);

    // long hair streams back when running
    this.hair = damp(this.hair, 0.05 + k * 0.45 + torsoX * -0.6, 6, dt);
    r.hairBack.rotation.x = this.hair + Math.sin(this.phase * 2) * 0.05 * k;
    r.hairBack.rotation.z = Math.sin(this.phase) * 0.04 * k;

    // (seeing stars after a spinning rake to the head)
    this.poseStars(this.dizzy > 0.4, 0, 0);

    r.root.updateMatrixWorld(true);
  }
}
