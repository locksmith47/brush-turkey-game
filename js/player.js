import * as THREE from 'three';
import { createPlayerRig } from './playerModel.js';
import { damp, dampAngle, angleDiff, clamp, lerp, rand, TAU } from './util.js';

export class Player {
  constructor(game) {
    this.game = game;
    this.rig = createPlayerRig();
    this.rig.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
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
  }

  /** bowled over (e.g. by a spinning rake) */
  knock(from, power) {
    const dx = this.pos.x - from.x, dz = this.pos.z - from.z, d = Math.hypot(dx, dz) || 1;
    this.knockVel.set((dx / d) * power, 0, (dz / d) * power);
    this.dizzy = 1.1;
    this.game.fx.dust(this.pos, 8);
    this.game.audio.land();
    this.game.shake(0.4);
  }

  handPos(out) {
    return this.rig.armR.hand.getWorldPosition(out);
  }

  playThrow() { this.throwT = 0; }
  playPluck() { this.pluckT = 0; }

  /** move: {x, z} world-space direction with length 0..1; aim: world point */
  update(dt, move, aim) {
    const g = this.game;
    this.time += dt;
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

    // boing: walk onto the trampoline and you bounce
    const tr = g.toys.trampolineAt(this.pos);
    const floor = tr ? tr.matY - this.pos.y : 0;
    this.hopV -= 24 * dt;
    this.hop += this.hopV * dt;
    if (this.hop <= floor) {
      if (tr) {
        this.hop = floor;
        this.hopV = 10.5;
        tr.kick(1.3);
        g.audio.boing(3);
      } else {
        this.hop = 0;
        this.hopV = 0;
      }
    }
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
    if (this.speed > 0.4) this.heading = dampAngle(this.heading, Math.atan2(this.vel.x, this.vel.z), 12, dt);
    else if (this.whistling || this.throwT < 1) this.heading = dampAngle(this.heading, aimYaw, 10, dt);

    this.animate(dt, aimYaw);
  }

  animate(dt, aimYaw) {
    const r = this.rig;
    const k = clamp(this.speed / this.maxSpeed, 0, 1);
    this.phase += dt * (3 + this.speed * 1.55);
    const s = Math.sin(this.phase), c = Math.cos(this.phase);

    r.root.position.set(this.pos.x, this.pos.y + this.hop + Math.abs(s) * 0.06 * k * (this.hop > 0 ? 0 : 1), this.pos.z);
    r.root.rotation.set(0, this.heading, Math.sin(this.time * 14) * 0.15 * Math.min(1, this.dizzy));

    // legs
    r.legL.hip.rotation.x = -s * 0.65 * k;
    r.legR.hip.rotation.x = s * 0.65 * k;
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

    r.torso.rotation.set(torsoX, torsoY, Math.sin(this.phase) * 0.04 * k);
    r.armL.shoulder.rotation.set(lx, 0, lz);
    r.armL.elbow.rotation.x = le;
    r.armR.shoulder.rotation.set(rxa, 0, rz);
    r.armR.elbow.rotation.x = re;

    // head looks a little toward the cursor, tilts up to whistle
    const look = clamp(angleDiff(this.heading, aimYaw), -0.7, 0.7) * 0.6;
    r.head.rotation.y = damp(r.head.rotation.y, look, 8, dt);
    r.head.rotation.x = damp(r.head.rotation.x, -0.12 * w - 0.05 * k, 8, dt);

    // long hair streams back when running
    this.hair = damp(this.hair, 0.05 + k * 0.45 + torsoX * -0.6, 6, dt);
    r.hairBack.rotation.x = this.hair + Math.sin(this.phase * 2) * 0.05 * k;
    r.hairBack.rotation.z = Math.sin(this.phase) * 0.04 * k;

    r.root.updateMatrixWorld(true);
  }
}
