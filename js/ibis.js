import * as THREE from 'three';
import { Foe } from './foe.js';
import { createIbisRig } from './ibisModel.js';
import { keyGeo } from './key.js';
import { part, merge, vcMesh, G, rand, damp, dampAngle, angleDiff, clamp, canvasTexture, pinLabel } from './util.js';

const COMMON = { bodyY: 0.8, labelY: 1.35, carcassLabelY: 0.7 };
export const IBIS_KINDS = {
  ibis: { ...COMMON, name: 'Ibis', scale: 1.0, hp: 14, speed: 2.4, aggro: 7, leash: 7, reach: 0.8, peckR: 0.6, kills: 1, hurt: 10, stompR: 0, radius: 0.35, maxLatch: 6, shakeAt: 4, shakeEvery: 5, value: 12, weight: 3, carryR: 0.75, slots: 8, cooldown: 1.6 },
  big: { ...COMMON, name: 'Big Ibis', scale: 1.8, hp: 50, speed: 2.3, aggro: 8, leash: 7, reach: 1.35, peckR: 0.75, kills: 1, hurt: 14, stompR: 1.1, radius: 0.62, maxLatch: 10, shakeAt: 6, shakeEvery: 5.5, value: 22, weight: 6, carryR: 1.3, slots: 12, cooldown: 1.7 },
  giant: { ...COMMON, name: 'Giant Ibis', scale: 2.7, hp: 140, speed: 2.2, aggro: 10, leash: 9, reach: 2.0, peckR: 0.95, kills: 1, hurt: 18, stompR: 1.8, radius: 0.95, maxLatch: 14, shakeAt: 8, shakeEvery: 6, value: 38, weight: 10, carryR: 1.9, slots: 16, cooldown: 1.9 },
  king: {
    ...COMMON, name: 'King Ibis', boss: true, scale: 4.2, hp: 520, speed: 2.0, aggro: 15, leash: 10, reach: 3.1, peckR: 1.3, kills: 2, hurt: 24, stompR: 2.7, radius: 1.45,
    maxLatch: 24, shakeAt: 10, shakeEvery: 4.5, value: 90, weight: 20, carryR: 2.8, slots: 28, cooldown: 1.5,
    grabR: 2.0, grabMax: 5, gripHP: 45, holdTime: 4.5, grabEvery: 9,
    // on his throne, he gets up for turkeys this close (or for anyone having a go at him); his honk blows
    // everything this close clean away, and he's got one in him every so often
    rouse: 9.5, honkR: 5.5, honkEvery: 12,
  },
};
const BODY = new THREE.Vector3(0, 0.8, -0.02);
// wind-ups: a red circle marks the spot and fills in, then the attack lands there
const PECK_T = 0.5, GRAB_T = 0.9, STOMP_T = 0.95, HONK_T = 0.8;
// the King getting up off his throne (he stands, honks, then hops down), and back onto it (turns round, hops
// up, sits down); sat down, his belly's this far up off his feet (at 1x), and his legs stick out in front
const RISE_HONK = 0.55, RISE_HOP = 0.85, RISE_T = 1.45, MOUNT_TURN = 0.35, MOUNT_HOP = 0.45, MOUNT_SIT = 0.4;
const BELLY = 0.59, SIT_LEGS = -1.3;
const AURA = [0xffe066, 0xfff3b0, 0xffd23f, 0xffffff];
let auraTex = null;
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
// the King's chain (in neck space: round the bottom of his neck, lower at the front) and the key hung on it
const CHAIN = { y: 0.07, z: 0.022, r: 0.068, tilt: 0.35 }, PENDANT = 0.1;

export class Ibis extends Foe {
  /** `roam`: how far it wanders from where it starts (the lot picking over the bins keep close to them) */
  constructor(game, kind, x, z, roam = null) {
    super(game, IBIS_KINDS[kind], x, z);
    this.kind = kind;
    this.setRig(createIbisRig(this.def.scale, kind === 'king'));
    this.state = 'wander';
    this.roam = roam ?? this.def.leash;
    this.wanderTo = this.home.clone();
    this.wanderT = 0;
    this.phase = 0;
    this.speedNow = 0;
    this.held = [];
    this.grabCool = 4;
    this.gripDmg = 0;
    this.sit = 0; // (how far sat down he is, on his throne)
    this.perch = 0; // (how high his feet are off the ground)
    this.look = 0;
    this.honkCool = 0;
    if (kind === 'king') {
      this.wearKey();
      this.makeAura();
      this.callT = 2;
      // he holds court from his throne, when there is one (his home's in front of it, where he gets down)
      this.throne = game.world.throne ?? null;
      if (this.throne) this.takeSeat();
    }
  }

  /** the King wears the key to the city on a gold chain round his neck (small enough to wear) */
  wearKey() {
    const neck = this.rig.neck, c = CHAIN;
    const chain = vcMesh(merge([part(G.torus(c.r, 0.009, 5, 24), 0xf2c230, [0, 0, 0], [Math.PI / 2, 0, 0])]));
    chain.position.set(0, c.y, c.z);
    chain.rotation.x = c.tilt;
    neck.add(chain);
    // the key hangs off the front of the chain, bow up, face out (and it keeps hanging down whatever his neck's doing)
    this.pendant = new THREE.Group();
    this.pendant.position.set(0, c.y - c.r * Math.sin(c.tilt), c.z + c.r * Math.cos(c.tilt));
    const key = vcMesh(keyGeo());
    key.scale.setScalar(PENDANT);
    key.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0)));
    key.position.set(0, -1.31 * PENDANT - 0.01, 0.025);
    this.pendant.add(key);
    neck.add(this.pendant);
    this.pendantKey = key;
  }

  /** he's got aura: a golden glow on the ground round him (it swells when he honks), and sparkles coming off his crown */
  makeAura() {
    auraTex ??= canvasTexture(128, 128, (c) => {
      const r = c.createRadialGradient(64, 64, 0, 64, 64, 64);
      r.addColorStop(0, 'rgba(255, 214, 90, 0)');
      r.addColorStop(0.5, 'rgba(255, 214, 90, 0.1)');
      r.addColorStop(0.8, 'rgba(255, 222, 115, 0.85)');
      r.addColorStop(0.88, 'rgba(255, 242, 180, 1)');
      r.addColorStop(1, 'rgba(255, 214, 90, 0)');
      c.fillStyle = r;
      c.fillRect(0, 0, 128, 128);
    });
    const mat = new THREE.MeshBasicMaterial({ map: auraTex, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
    this.aura = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), mat);
    this.game.scene.add(this.aura);
    this.sparkT = 0;
  }

  updateAura(dt) {
    const g = this.game, a = this.aura, t = g.time;
    a.visible = this.alive;
    if (!this.alive) return;
    const flare = Math.max(0, 1 - (t - (this.honkAt ?? -9)) / (this.honkBig ? 0.9 : 0.5)) * (this.honkBig ? 1 : 0.4);
    const r = (this.sit > 0.5 ? 4.6 : 3.3) * (1 + 0.05 * Math.sin(t * 2.6)) + flare * 3;
    a.position.set(this.pos.x, this.pos.y + 0.07, this.pos.z);
    a.scale.set(r, 1, r);
    a.material.opacity = Math.min(1, 0.4 + 0.14 * Math.sin(t * 2.6) + flare * 0.6);
    if (Math.hypot(g.player.pos.x - this.pos.x, g.player.pos.z - this.pos.z) > 50 || (this.sparkT -= dt) > 0) return;
    this.sparkT = rand(0.12, 0.3);
    this.rig.head.getWorldPosition(_w);
    _w.y += 0.12 * this.s;
    g.fx.burst(_w, { glow: true, n: 1, colors: AURA, jitter: 0.25 * this.s, speed: [0.2, 0.9], up: [0.3, 1.2], grav: -0.4, drag: 1, size: [0.05, 0.1], life: [0.8, 1.5] });
  }

  /** straight onto his throne, sat down (as he starts out) */
  takeSeat() {
    const th = this.throne;
    this.state = 'throne';
    this.t = 0;
    this.pos.set(th.sit.x, this.pos.y, th.sit.z);
    this.heading = th.face;
    this.sit = 1;
    this.perch = th.seatY;
    this.seatSolid(false);
  }

  /** the seat's in everyone else's way, bar when he's on it */
  seatSolid(on) {
    const cs = this.game.world.colliders;
    for (const c of this.throne.seat) {
      const i = cs.indexOf(c);
      if (i >= 0) cs.splice(i, 1);
    }
    if (on) cs.push(...this.throne.seat);
  }

  /** how far up off the ground he is (on his throne, or hopping on or off it) */
  lift() { return this.perch - this.sit * BELLY * this.s; }

  /**
   * HONK. A big one (`blast`) blows everything close clean off its feet (and off him), and shakes the ground;
   * a little one's just to remind everyone who's in charge (`vol`: quieter, from further off)
   */
  honk(blast, vol = 1) {
    const g = this.game, d = this.def;
    g.audio.honk(this.s, blast, vol);
    this.honkT = 0;
    this.honkAt = g.time;
    this.honkBig = blast;
    g.fx.sparkle(this.rig.head.getWorldPosition(_w), blast ? 26 : 6, AURA);
    if (!blast) return;
    this.honkCool = d.honkEvery;
    g.shake(0.7);
    g.fx.ring(this.pos, 0xffd23f, d.honkR * 1.6, 0.8);
    g.fx.ring(this.pos, 0xfff3c4, d.honkR, 0.5);
    g.fx.dust(this.pos, 14);
    this.shakeOff();
    for (const t of this.turkeysNear(this.pos, d.honkR)) t.blastAway(this.pos, d.honkR + rand(1, 2.5), 2.4);
    this.hurtPlayer(this.pos, d.honkR, 10, { knock: 12, stun: 0.6 }); // (and you, if you're that close)
  }

  /* ---------------------------------------------------------------- body */
  bodyCenter(out) { return out.set(this.pos.x, this.pos.y + this.lift() + this.def.bodyY * this.s, this.pos.z); }

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
    if (this.state === 'wander' || this.state === 'return') { this.state = 'chase'; this.t = 0; }
    if (this.state === 'throne' || this.state === 'mount') this.roused = true;
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
      // a key to a gate flies off his chain (growing back to full size on the way); the key to the city, he gets
      // to keep: the city's yours now, and that's the end of the line
      if (this.key && !this.key.gone && this.pendant?.visible) {
        this.pendantKey.updateWorldMatrix(true, false);
        this.key.release(this.pendantKey.matrixWorld, this.heading, 6.5);
        g.hud.toast('The King\'s key flew off his neck! Carry it to the gate', 3.5);
        this.pendant.visible = false;
      } else if (!g.loading) g.hud.toast("The King is felled, and the city's yours! That's the end of the line... for now", 6);
      // (and if he was up on his throne, he topples off it)
      if (this.throne) {
        if (this.perch || this.sit) {
          this.pos.set(this.throne.down.x, this.pos.y, this.throne.down.z);
          this.perch = this.sit = 0;
        }
        this.seatSolid(true);
      }
    }
  }

  alert(t) {
    if (!this.alive || this.state !== 'wander' || !t.grounded) return;
    this.target = t;
    this.state = 'chase';
    this.t = 0;
    this.engaged = true;
    this.game.audio.squawk(this.s);
  }

  /* ---------------------------------------------------------------- AI */
  think(dt) {
    const g = this.game, d = this.def;
    this.grabCool -= dt;
    this.honkCool -= dt;
    switch (this.state) {
      case 'throne': this.onThrone(dt); break;
      case 'rise': this.rising(); break;
      case 'mount': this.mounting(dt); break;
      case 'return': {
        // back to his throne (and straight back up for anyone who comes after him)
        const tg = this.findTarget();
        if (tg || this.latched.length) { this.target = tg; this.engaged = true; this.backToChase(this.cool); break; }
        if (this.walk(this.home.x, this.home.z, d.speed * 0.6, dt, 0.25) < 0.3) this.mount();
        break;
      }
      case 'wander': {
        this.wanderT -= dt;
        if (this.wanderT <= 0) {
          this.wanderT = rand(2.5, 6);
          this.wanderPoint(0, this.roam, this.wanderTo);
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
        // the King honks every so often: with a crowd round him (or on him), a big one that blows the lot
        // away; otherwise, just letting them all know he's there
        if (d.honkR && this.honkCool <= 0 && this.cool <= 0) {
          if (this.latched.length >= 3 || this.countNear(this.pos, d.honkR) >= 5) { this.startAttack('honk'); break; }
          this.honk(false);
          this.honkCool = rand(4, 6);
        }
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
            if (!this.latched.length && this.t > 1) { this.state = this.throne ? 'return' : 'wander'; this.t = 0; this.engaged = false; }
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
          this.hurtPlayer(this.aimAt, d.peckR, d.hurt);
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
          this.hurtPlayer(foot, d.stompR, d.hurt * 1.4, { knock: 7, stun: 0.45 });
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
          this.hurtPlayer(sp, d.grabR, d.hurt * 0.8, { knock: 5, stun: 0.3 }); // (you're too big for his beak: a nip)
          if (this.held.length) {
            this.state = 'hold';
            this.t = 0;
            this.gripDmg = 0;
            this.grabCool = d.grabEvery;
            g.audio.squawk(this.s);
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
      case 'honk':
        this.speedNow = damp(this.speedNow, 0, 10, dt);
        if (this.t >= HONK_T && !this.struck) { this.struck = true; this.honk(true); }
        if (this.t >= HONK_T + 0.7) this.backToChase(d.cooldown);
        break;
    }
  }

  /* ---------------------------------------------------------------- the King's throne */
  /** sat on his throne, taking it all in: turkeys coming too close (or anyone having a go at him) get him up */
  onThrone(dt) {
    const g = this.game, p = g.player.pos, d = this.def;
    this.speedNow = 0;
    const tg = this.findTarget(d.rouse);
    if (tg || this.latched.length || this.roused) {
      this.target = tg;
      this.rise();
      return;
    }
    // (and a honk now and then, so the whole alley knows who's in charge)
    const far = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
    if (!this.hailed && far < 30) {
      this.hailed = true;
      this.callT = rand(5, 7);
      this.honk(false);
      g.hud.banner('ALL HAIL THE KING IBIS', 4);
    } else if (far < 36 && (this.callT -= dt) <= 0) {
      this.callT = rand(5, 9);
      this.honk(false, clamp(1.25 - far / 36, 0.35, 1));
    }
  }

  /** up off his throne: he stands up on it, HONKS (blowing everything near him clean away), and hops down to sort them out */
  rise() {
    this.state = 'rise';
    this.t = 0;
    this.roused = false;
    this.struck = false;
    this.engaged = true;
    this.hopFrom = this.pos.clone();
    this.game.audio.squawk(this.s);
  }

  rising() {
    const th = this.throne, t = this.t;
    this.speedNow = 0;
    this.sit = Math.max(0, 1 - t / 0.45);
    if (t >= RISE_HONK && !this.struck) { this.struck = true; this.honk(true); }
    if (t < RISE_HOP) return;
    // (down off it, onto the carpet in front)
    const u = Math.min(1, (t - RISE_HOP) / (RISE_T - RISE_HOP));
    this.pos.x = this.hopFrom.x + (th.down.x - this.hopFrom.x) * u;
    this.pos.z = this.hopFrom.z + (th.down.z - this.hopFrom.z) * u;
    this.perch = th.seatY * (1 - u) + Math.sin(u * Math.PI) * 1.1;
    if (u < 1) return;
    this.perch = 0;
    this.seatSolid(true);
    this.game.fx.dust(this.pos, 14);
    this.game.audio.stomp(this.s);
    this.game.shake(0.3);
    this.backToChase(0.4);
  }

  /** back up onto his throne: he turns round, hops up and sits himself down */
  mount() {
    this.state = 'mount';
    this.t = 0;
    this.hopFrom = this.pos.clone();
    this.seatSolid(false);
  }

  mounting(dt) {
    const th = this.throne, t = this.t;
    this.speedNow = damp(this.speedNow, 0, 10, dt);
    this.heading = dampAngle(this.heading, th.face, 9, dt);
    const u = clamp((t - MOUNT_TURN) / MOUNT_HOP, 0, 1);
    this.pos.x = this.hopFrom.x + (th.sit.x - this.hopFrom.x) * u;
    this.pos.z = this.hopFrom.z + (th.sit.z - this.hopFrom.z) * u;
    this.perch = th.seatY * u + Math.sin(u * Math.PI) * 0.9;
    this.sit = clamp((t - MOUNT_TURN - MOUNT_HOP) / MOUNT_SIT, 0, 1);
    if (this.sit < 1) return;
    this.heading = th.face;
    this.state = 'throne';
    this.t = 0;
    this.callT = rand(4, 7);
    this.honk(false);
  }

  /** wind up a peck, stomp or grab: the spot is fixed now (and marked in red) so there's time to dodge */
  startAttack(kind) {
    const d = this.def;
    this.state = kind;
    this.t = 0;
    this.struck = false;
    if (kind === 'stomp') { this.aimAt = this.forward(new THREE.Vector3()).multiplyScalar(0.2 * this.s).add(this.pos); this.aimR = d.stompR; this.aimT = STOMP_T; }
    else if (kind === 'honk') { this.aimAt = this.pos.clone(); this.aimR = d.honkR; this.aimT = HONK_T; }
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
    if (this.aura) this.game.scene.remove(this.aura);
    this.honkEl?.remove();
  }

  /** (and the King's honks, in big gold letters over his head for a moment) */
  updateLabel(camera, v) {
    super.updateLabel(camera, v);
    if (this.honkAt === undefined) return;
    const el = (this.honkEl ??= document.getElementById('labels').appendChild(document.createElement('div')));
    if (this.game.time - this.honkAt > 1.1) { if (el.style.display !== 'none') el.style.display = 'none'; return; }
    if (this.honkShown !== this.honkAt) {
      this.honkShown = this.honkAt;
      el.className = this.honkBig ? 'honk-word' : 'honk-word small';
      el.innerHTML = this.honkBig ? '<b>HONK!</b>' : '<b>honk</b>'; // (a new one each time, so its animation starts over)
    }
    // (over his head, but kept on screen: stood up, he's taller than the camera takes in, close up)
    this.rig.head.getWorldPosition(v);
    v.y += 0.3 * this.s;
    v.project(camera);
    v.set(clamp(v.x, -0.8, 0.8), Math.min(v.y, 0.5), v.z).unproject(camera);
    pinLabel(el, v, camera);
  }

  /* ---------------------------------------------------------------- animation */
  pose(dt) {
    const r = this.rig, s = this.s;
    const k = Math.min(1, this.speedNow / (this.def.speed * 0.8));
    this.phase += dt * (2 + this.speedNow * 3.2 / s);
    const sw = Math.sin(this.phase), t = this.t;
    let neckX = Math.sin(this.phase * 2) * 0.06 * k, headX = 0, legLx = sw * 0.55 * k, legRx = -sw * 0.55 * k;
    let rollZ = 0, bodyY = Math.abs(Math.cos(this.phase)) * 0.03 * k, look = 0;

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
      case 'honk': {
        // (drawing a breath: head down, chest out)
        const a = Math.min(1, t / HONK_T);
        neckX = 0.45 * a; headX = 0.25 * a; bodyY += 0.04 * a;
        break;
      }
      case 'throne': {
        // sat back, chin up, keeping an eye on you
        const p = this.game.player.pos;
        neckX = -0.15 + Math.sin(t * 0.9) * 0.04;
        look = clamp(angleDiff(this.heading, Math.atan2(p.x - this.pos.x, p.z - this.pos.z)), -0.9, 0.9);
        break;
      }
    }
    // the honk itself: head thrown right back, bill to the sky
    if (this.honkT !== undefined) {
      this.honkT += dt;
      const e = Math.sin(Math.min(1, this.honkT / (this.honkBig ? 0.8 : 0.5)) * Math.PI);
      neckX += (-0.85 - neckX) * e;
      headX += (-0.55 - headX) * e;
    }
    // (sat on his throne: legs out in front of him, over the edge of the seat)
    if (this.sit > 0) {
      legLx += (SIT_LEGS - 0.08 - legLx) * this.sit;
      legRx += (SIT_LEGS + 0.08 - legRx) * this.sit;
    }
    if (this.flinch > 0) rollZ += Math.sin(this.t * 50) * 0.08 * this.flinch;

    this.look = damp(this.look, look, 3, dt);
    r.neck.rotation.set(neckX, this.look, 0);
    r.head.rotation.x = headX;
    // (the King's key hangs straight down off its chain, swinging a little as he goes)
    if (this.pendant) this.pendant.rotation.set(-neckX - 0.18 + Math.sin(this.phase * 2) * 0.12 * k, 0, Math.sin(this.phase) * 0.1 * k + rollZ * -0.5);
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
      r.root.position.y += this.lift();
      r.root.rotation.set(0, this.heading, 0);
    }
    if (this.aura) this.updateAura(dt);

    // a red circle on the ground where a peck, stomp, grab or honk is about to land, filling in as it winds up
    if (this.alive && (this.state === 'peck' || this.state === 'stomp' || this.state === 'grab' || this.state === 'honk') && !this.struck) {
      this.warn ??= this.game.fx.warnCircle();
      this.warn.show(this.aimAt, this.aimR, this.t / this.aimT, this.game.time);
    } else this.warn?.hide();
  }
}
