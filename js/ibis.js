import * as THREE from 'three';
import { Foe } from './foe.js';
import { createIbisRig } from './ibisModel.js';
import { rand, damp, dampAngle } from './util.js';

const COMMON = { bodyY: 0.8, labelY: 1.35, carcassLabelY: 0.7 };
export const IBIS_KINDS = {
  ibis: { ...COMMON, name: 'Ibis', scale: 1.0, hp: 14, speed: 2.4, aggro: 7, leash: 7, reach: 0.8, peckR: 0.6, kills: 1, stompR: 0, radius: 0.35, maxLatch: 6, shakeAt: 4, shakeEvery: 5, value: 12, weight: 3, carryR: 0.75, slots: 8, cooldown: 1.6 },
  giant: { ...COMMON, name: 'Giant Ibis', scale: 2.7, hp: 140, speed: 2.2, aggro: 10, leash: 9, reach: 2.0, peckR: 0.95, kills: 1, stompR: 1.8, radius: 0.95, maxLatch: 14, shakeAt: 8, shakeEvery: 6, value: 38, weight: 10, carryR: 1.9, slots: 16, cooldown: 1.9 },
  king: {
    ...COMMON, name: 'King Ibis', boss: true, scale: 4.2, hp: 520, speed: 2.0, aggro: 15, leash: 12, reach: 3.1, peckR: 1.3, kills: 2, stompR: 2.7, radius: 1.45,
    maxLatch: 24, shakeAt: 10, shakeEvery: 4.5, value: 90, weight: 20, carryR: 2.8, slots: 28, cooldown: 1.5,
    grabR: 2.0, grabMax: 5, gripHP: 45, holdTime: 4.5, grabEvery: 9,
  },
};
const BODY = new THREE.Vector3(0, 0.8, -0.02);
// wind-ups: a red circle marks the spot and fills in, then the attack lands there
const PECK_T = 0.5, GRAB_T = 0.9, STOMP_T = 0.95;
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class Ibis extends Foe {
  constructor(game, kind, x, z) {
    super(game, IBIS_KINDS[kind], x, z);
    this.kind = kind;
    this.setRig(createIbisRig(this.def.scale, kind === 'king'));
    this.state = 'wander';
    this.wanderTo = this.home.clone();
    this.wanderT = 0;
    this.phase = 0;
    this.speedNow = 0;
    this.held = [];
    this.grabCool = 4;
    this.gripDmg = 0;
  }

  /* ---------------------------------------------------------------- body */
  hits(p) {
    this.bodyCenter(_v);
    const s = this.s, dx = p.x - _v.x, dz = p.z - _v.z, dy = p.y - _v.y;
    return dx * dx + dz * dz < (0.36 * s + 0.15) ** 2 && Math.abs(dy) < 0.26 * s + 0.15;
  }

  attachPoint(t, frame) {
    const dir = frame.worldToLocal(t.pos.clone()).sub(BODY);
    dir.y *= 0.8;
    if (dir.lengthSq() < 1e-4) dir.set(0, 1, 0);
    dir.normalize();
    return new THREE.Vector3(dir.x * 0.22, dir.y * 0.21, dir.z * 0.36).add(BODY);
  }

  hitFx(p) { this.game.fx.feathers(p, [0xffffff, 0xf3f1ea, 0xe4e0d4], 2 + Math.round(this.s)); }

  strikePoint(out) { return this.forward(out).multiplyScalar(this.def.reach).add(this.pos); }

  /** where the i-th turkey dangles from the beak */
  heldPos(i, out) {
    this.rig.billTip.getWorldPosition(out);
    const a = i * 1.26 + this.t * 3, r = 0.1 * this.s;
    out.x += Math.cos(a) * r;
    out.z += Math.sin(a) * r;
    out.y -= 0.12 * this.s + (i % 2) * 0.05 * this.s;
    return out;
  }

  get grip() {
    return this.state === 'hold' ? { fill: Math.min(1, this.gripDmg / this.def.gripHP), time: 1 - this.t / this.def.holdTime } : null;
  }

  onDamage(amount) {
    if (this.state === 'wander') { this.state = 'chase'; this.t = 0; }
    if (this.state === 'hold') {
      this.gripDmg += amount;
      if (this.gripDmg >= this.def.gripHP) this.releaseHeld(true);
    }
  }

  releaseHeld(stagger) {
    for (const t of this.held) t.releaseFromBeak();
    this.held.length = 0;
    if (stagger && this.alive) {
      this.state = 'stagger';
      this.t = 0;
      this.game.hud.toast('It let them go!', 2);
      this.game.audio.squawk(this.s, true);
    }
  }

  onDeath() {
    const g = this.game;
    this.releaseHeld(false);
    this.rig.eyes.visible = false;
    this.rig.deadEyes.visible = true;
    g.audio.squawk(this.s, true);
    g.fx.feathers(this.bodyCenter(_v).clone(), [0xffffff, 0xf3f1ea, 0x1e1e1e], 10 + Math.round(this.s * 4));
    if (this.kind === 'king') {
      g.hud.banner('KING IBIS FELLED');
      g.audio.fanfare();
    }
  }

  /* ---------------------------------------------------------------- AI */
  think(dt) {
    const g = this.game, d = this.def;
    this.grabCool -= dt;
    switch (this.state) {
      case 'wander': {
        this.wanderT -= dt;
        if (this.wanderT <= 0) {
          this.wanderT = rand(2.5, 6);
          this.wanderPoint(0, d.leash, this.wanderTo);
        }
        this.walk(this.wanderTo.x, this.wanderTo.z, d.speed * 0.45, dt, 0.4);
        if (this.latched.length) { this.state = 'chase'; break; }
        const tg = this.findTarget();
        if (tg) {
          this.target = tg;
          this.state = 'chase';
          this.t = 0;
          this.engaged = true;
          g.audio.squawk(this.s);
          if (this.kind === 'king') { g.audio.roar(); g.shake(0.6); }
        }
        break;
      }
      case 'chase': {
        if (this.wantsShake()) { this.state = 'shake'; this.t = 0; break; }
        // the King loves to scoop up a beakful when a bunch are in front of him
        if (d.grabMax && this.grabCool <= 0 && this.cool <= 0 && this.countNear(this.strikePoint(_v), d.grabR) >= 3) {
          this.startAttack('grab');
          break;
        }
        if (d.stompR && this.cool <= 0 && this.countNear(this.forward(_w).multiplyScalar(0.2 * this.s).add(this.pos), d.stompR) >= 4) {
          this.startAttack('stomp');
          break;
        }
        const tg = this.target;
        if (!tg || tg.dead || !tg.grounded || Math.hypot(tg.pos.x - this.pos.x, tg.pos.z - this.pos.z) > d.aggro * 1.6 || !this.sees(tg)) {
          this.target = this.findTarget();
          if (!this.target) {
            this.walk(this.home.x, this.home.z, d.speed * 0.6, dt, 0.5);
            if (!this.latched.length && this.t > 1) { this.state = 'wander'; this.engaged = false; }
          }
          break;
        }
        const dx = tg.pos.x - this.pos.x, dz = tg.pos.z - this.pos.z, dist = Math.hypot(dx, dz) || 1;
        const leashed = Math.hypot(this.home.x - this.pos.x, this.home.z - this.pos.z) > d.leash * 2;
        if (leashed) this.walk(this.home.x, this.home.z, d.speed, dt, 0.5);
        else this.walk(tg.pos.x - (dx / dist) * d.reach * 0.9, tg.pos.z - (dz / dist) * d.reach * 0.9, d.speed, dt, 0.15);
        this.heading = dampAngle(this.heading, Math.atan2(dx, dz), 6, dt);
        const sp = this.strikePoint(_v);
        if (this.cool <= 0 && Math.hypot(tg.pos.x - sp.x, tg.pos.z - sp.z) < d.peckR + 0.4) {
          const foot = this.forward(_w).multiplyScalar(0.35 * this.s).add(this.pos);
          if (d.grabMax && this.grabCool <= 0 && this.countNear(sp, d.grabR) >= 3) this.startAttack('grab');
          else this.startAttack(d.stompR && this.countNear(foot, d.stompR) >= 2 ? 'stomp' : 'peck');
        }
        break;
      }
      case 'peck':
        this.speedNow = damp(this.speedNow, 0, 10, dt);
        if (this.t >= PECK_T && !this.struck) {
          this.struck = true;
          if (this.killNear(this.aimAt, d.peckR, d.kills, 'peck')) g.audio.squawk(this.s);
          g.fx.dust(this.aimAt, 3 + Math.round(this.s));
        }
        if (this.t >= PECK_T + 0.4) this.backToChase(d.cooldown);
        break;
      case 'stomp': {
        this.speedNow = damp(this.speedNow, 0, 10, dt);
        if (this.t >= STOMP_T && !this.struck) {
          this.struck = true;
          // half of those caught underfoot get flattened; the other half are sent flying
          const foot = this.aimAt;
          let squash = Math.random() < 0.5;
          for (const t of this.turkeysNear(foot, d.stompR)) {
            if (squash) t.die('squash');
            else t.blastAway(foot, d.stompR + rand(2.5, 4), 2.2);
            squash = !squash;
          }
          g.fx.ring(foot, 0xfff3c4, d.stompR * 1.3, 0.5);
          g.fx.dust(foot, 10);
          g.audio.stomp(this.s);
          g.shake(0.25 * this.s / 2.7);
        }
        if (this.t >= STOMP_T + 0.45) this.backToChase(d.cooldown * 1.6);
        break;
      }
      case 'grab':
        this.speedNow = damp(this.speedNow, 0, 10, dt);
        if (this.t >= GRAB_T && !this.struck) {
          this.struck = true;
          const sp = this.aimAt;
          g.fx.dust(sp, 10);
          this.turkeysNear(sp, d.grabR).slice(0, d.grabMax).forEach((t, i) => { t.grabbedBy(this, i); this.held.push(t); });
          if (this.held.length) {
            this.state = 'hold';
            this.t = 0;
            this.gripDmg = 0;
            this.grabCool = d.grabEvery;
            g.audio.squawk(this.s);
            g.hud.toast(`The King snatched ${this.held.length} turkeys! Attack to break its grip!`, 3);
          }
        }
        if (this.state === 'grab' && this.t >= GRAB_T + 0.4) this.backToChase(d.cooldown);
        break;
      case 'hold':
        this.speedNow = damp(this.speedNow, 0, 6, dt);
        if (this.t >= d.holdTime) {
          for (const t of this.held) t.swallowed();
          this.held.length = 0;
          this.state = 'gulp';
          this.t = 0;
          g.audio.gulp();
        }
        break;
      case 'gulp':
        if (this.t >= 0.7) this.backToChase(d.cooldown);
        break;
      case 'stagger':
        this.speedNow = damp(this.speedNow, 0, 10, dt);
        if (this.t >= 1.4) this.backToChase(0.5);
        break;
      case 'shake':
        this.speedNow = damp(this.speedNow, 0, 10, dt);
        if (this.t >= 0.35 && this.latched.length) { this.shakeOff(); g.audio.squawk(this.s); }
        if (this.t >= 0.8) this.backToChase(this.cool);
        break;
    }
  }

  /** wind up a peck, stomp or grab: the spot is fixed now (and marked in red) so there's time to dodge */
  startAttack(kind) {
    const d = this.def;
    this.state = kind;
    this.t = 0;
    this.struck = false;
    if (kind === 'stomp') { this.aimAt = this.forward(new THREE.Vector3()).multiplyScalar(0.2 * this.s).add(this.pos); this.aimR = d.stompR; this.aimT = STOMP_T; }
    else { this.aimAt = this.strikePoint(new THREE.Vector3()); this.aimR = kind === 'grab' ? d.grabR : d.peckR; this.aimT = kind === 'grab' ? GRAB_T : PECK_T; }
    this.aimAt.y = this.game.world.groundHeight(this.aimAt.x, this.aimAt.z);
  }

  backToChase(cool) {
    this.state = 'chase';
    this.struck = false;
    this.cool = cool;
    this.t = 0;
  }

  dispose() {
    super.dispose();
    this.warn?.dispose();
  }

  /* ---------------------------------------------------------------- animation */
  pose(dt) {
    const r = this.rig, s = this.s;
    const k = Math.min(1, this.speedNow / (this.def.speed * 0.8));
    this.phase += dt * (2 + this.speedNow * 3.2 / s);
    const sw = Math.sin(this.phase), t = this.t;
    let neckX = Math.sin(this.phase * 2) * 0.06 * k, headX = 0, legLx = sw * 0.55 * k, legRx = -sw * 0.55 * k;
    let rollZ = 0, bodyY = Math.abs(Math.cos(this.phase)) * 0.03 * k;

    switch (this.state) {
      case 'peck': {
        // head drawn back through the wind-up, then a stab down
        const a = t < PECK_T ? -0.5 * (t / PECK_T) : t < PECK_T + 0.15 ? -0.5 + 2.1 * ((t - PECK_T) / 0.15) : 1.6 * Math.max(0, 1 - (t - PECK_T - 0.15) / 0.25);
        neckX = a * 0.8; headX = a * 0.5;
        break;
      }
      case 'grab': {
        const w = GRAB_T - 0.17;
        const a = t < w ? -0.7 * (t / w) : t < GRAB_T + 0.03 ? -0.7 + 2.4 * ((t - w) / 0.2) : 1.7 * Math.max(0, 1 - (t - GRAB_T - 0.03) / 0.35);
        neckX = a * 0.8; headX = a * 0.5;
        break;
      }
      case 'hold':
        neckX = -0.45; headX = 0.35 + Math.sin(t * 16) * 0.15; rollZ = Math.sin(t * 9) * 0.05;
        break;
      case 'gulp':
        neckX = -0.6 + Math.sin(t * 14) * 0.25; headX = -0.3;
        break;
      case 'stagger':
        neckX = 0.9 + Math.sin(t * 22) * 0.12; rollZ = Math.sin(t * 13) * 0.15; bodyY -= 0.03;
        break;
      case 'stomp': {
        const lift = t < STOMP_T ? Math.sin((t / STOMP_T) * Math.PI * 0.5) : Math.max(0, 1 - (t - STOMP_T) / 0.08);
        legLx = -1.1 * lift; neckX = -0.3 * lift; bodyY += 0.05 * lift;
        break;
      }
      case 'shake':
        rollZ = Math.sin(t * 40) * 0.35 * Math.sin(Math.min(1, t / 0.8) * Math.PI);
        neckX = Math.sin(t * 33) * 0.4;
        break;
      case 'wander':
        if (this.speedNow < 0.1) neckX = Math.max(0, Math.sin(t * 1.3)) * 1.1; // foraging
        break;
    }
    if (this.flinch > 0) rollZ += Math.sin(this.t * 50) * 0.08 * this.flinch;

    r.neck.rotation.x = neckX;
    r.head.rotation.x = headX;
    r.bodyPivot.rotation.z = rollZ;
    r.bodyPivot.position.y = bodyY;
    r.legL.rotation.x = legLx;
    r.legR.rotation.x = legRx;

    if (!this.alive) {
      // keel over onto one side about the body centre, legs in the air
      const phi = (Math.PI / 2 - 0.1) * (this.state === 'dying' ? this.roll * this.roll : 1);
      const sn = Math.sin(phi), by = BODY.y * s;
      r.root.rotation.set(0, this.heading, phi);
      r.root.position.set(
        this.pos.x + by * sn * Math.cos(this.heading),
        this.pos.y + by + (0.21 * s - by) * sn - by * Math.cos(phi),
        this.pos.z - by * sn * Math.sin(this.heading),
      );
      r.legL.rotation.x = -0.4; r.legR.rotation.x = 0.3;
      r.neck.rotation.x = 0.3;
    } else {
      r.root.position.copy(this.pos);
      r.root.rotation.set(0, this.heading, 0);
    }

    // a red circle on the ground where a peck, stomp or grab is about to land, filling in as it winds up
    if (this.alive && (this.state === 'peck' || this.state === 'stomp' || this.state === 'grab') && !this.struck) {
      this.warn ??= this.game.fx.warnCircle();
      this.warn.show(this.aimAt, this.aimR, this.t / this.aimT, this.game.time);
    } else this.warn?.hide();
  }
}
