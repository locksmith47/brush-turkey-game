import * as THREE from 'three';
import { Foe } from './foe.js';
import { keyRakeGeo } from './key.js';
import { part, merge, vcMesh, G, limb, rand, randInt, pick, damp, dampAngle, angleDiff, clamp, TAU } from './util.js';

/*
 * Big Kev, Keeper of the Oval: a larger-than-life groundskeeper with a key rake (a rake that's the key to
 * the gate out of the oval).
 *  - slams the rake down on turkeys in front of him
 *  - SPIN ATTACK: a red ring grows on the ground, then he whirls the rake round.
 *    Everything in the ring gets swept away: whistle your turkeys out!
 *  - after spinning he's dizzy (takes extra damage), and he swats off clingers
 *  - beaten, he drops the key rake and a giant bag of leaves, and goes down flat on his back, out cold
 *    (stars round his head): his big belly makes a fine trampoline
 */
const DEF = {
  name: 'Big Kev, Keeper of the Oval', boss: true, hp: 700, scale: 2.7, radius: 1.0, bodyY: 1.2, labelY: 2.1,
  aggro: 11, leash: 16, maxLatch: 20, shakeAt: 9, shakeEvery: 5, spinR: 6.2, sweepR: 1.6, speed: 2.4, dieTime: 1.2,
};
const SKIN = 0xe9a27f, VIS = 0xff7a1a, SILVER = 0xdfe3e6, KHAKI = 0xb89b6a, HAT = 0x7a5a3a;
const SWEEP_T = 1.0; // the rake slam's wind-up (a red circle marks where it'll land)
const _v = new THREE.Vector3();
let GEO = null;

/* --- two-bone IK so both hands stay wrapped around the rake handle --- */
const ARM1 = 0.28, ARM2 = 0.35; // shoulder->elbow, elbow->hand
const GRIPS = [0.08, -0.18]; // where the left & right hands hold the handle (rake space)
const POLES = [new THREE.Vector3(1, -0.4, -0.7), new THREE.Vector3(-1, -0.4, -0.7)]; // elbows out & back
const _t = new THREE.Vector3(), _u = new THREE.Vector3(), _f = new THREE.Vector3(), _p = new THREE.Vector3();
const _bx = new THREE.Vector3(), _by = new THREE.Vector3(), _bz = new THREE.Vector3(), _m = new THREE.Matrix4();

function solveArm(arm, target, pole) {
  _t.copy(target).sub(arm.shoulder.position);
  const d = clamp(_t.length(), 0.05, (ARM1 + ARM2) * 0.999);
  _t.normalize();
  const a = Math.acos(clamp((ARM1 * ARM1 + d * d - ARM2 * ARM2) / (2 * ARM1 * d), -1, 1));
  _p.copy(pole).addScaledVector(_t, -pole.dot(_t)).normalize();
  _u.copy(_t).multiplyScalar(Math.cos(a)).addScaledVector(_p, Math.sin(a)); // upper arm direction
  _f.copy(_t).multiplyScalar(d).addScaledVector(_u, -ARM1).normalize(); // forearm direction
  // shoulder frame: -y along the upper arm, +z towards where the forearm bends
  _by.copy(_u).negate();
  _bz.copy(_f).addScaledVector(_u, -_f.dot(_u));
  if (_bz.lengthSq() < 1e-6) _bz.copy(_p);
  _bz.normalize();
  _bx.crossVectors(_by, _bz).normalize();
  arm.shoulder.quaternion.setFromRotationMatrix(_m.makeBasis(_bx, _by, _bz));
  arm.elbow.rotation.set(-Math.acos(clamp(_f.dot(_u), -1, 1)), 0, 0);
}

function geos() {
  if (GEO) return GEO;
  const thigh = merge([limb([0, 0, 0], [0, -0.42, 0], 0.12, 0.11, KHAKI, 10), part(G.sphere(0.12, 10, 8), KHAKI, [0, 0, 0])]);
  const shin = merge([
    part(G.sphere(0.075, 8, 6), SKIN, [0, 0, 0]),
    limb([0, 0, 0], [0, -0.2, 0], 0.075, 0.07, SKIN, 8),
    limb([0, -0.2, 0], [0, -0.4, 0], 0.08, 0.075, 0x2f4a2f, 8),
    part(G.box(0.16, 0.13, 0.3), 0x3a2a1c, [0, -0.45, 0.05]),
    part(G.box(0.17, 0.04, 0.32), 0x1c140e, [0, -0.505, 0.05]),
  ]);
  const torso = [
    part(G.sphere(1, 16, 12), VIS, [0, 0.2, 0.05], [0, 0, 0], [0.27, 0.27, 0.27]),
    part(G.cyl(0.24, 0.26, 0.4, 16), VIS, [0, 0.42, 0], [0, 0, 0], [1, 1, 0.8]),
    part(G.sphere(1, 14, 8), VIS, [0, 0.6, 0], [0, 0, 0], [0.26, 0.1, 0.21]),
    part(G.torus(0.265, 0.025, 4, 24), SILVER, [0, 0.18, 0.04], [Math.PI / 2, 0, 0], [1, 1.05, 1]),
    part(G.torus(0.25, 0.025, 4, 24), SILVER, [0, 0.36, 0.01], [Math.PI / 2, 0, 0], [1, 0.82, 1]),
    part(G.box(0.05, 0.55, 0.02), SILVER, [0.12, 0.37, 0.215], [-0.08, 0, 0]),
    part(G.box(0.05, 0.55, 0.02), SILVER, [-0.12, 0.37, 0.215], [-0.08, 0, 0]),
    part(G.sphere(1, 12, 8), KHAKI, [0, -0.02, 0], [0, 0, 0], [0.24, 0.12, 0.2]),
    part(G.cyl(0.075, 0.08, 0.14, 10), SKIN, [0, 0.68, 0]),
  ];
  const head = [
    part(G.sphere(0.17, 16, 12), SKIN, [0, 0.14, 0.01], [0, 0, 0], [0.98, 1.08, 1]),
    part(G.sphere(0.05, 8, 6), 0xd9625a, [0, 0.12, 0.17]),
    part(G.box(0.3, 0.06, 0.04), 0x151515, [0, 0.18, 0.15]),
    part(G.box(0.1, 0.02, 0.01), 0x6f8faf, [0.07, 0.19, 0.172]),
    part(G.sphere(1, 10, 8), 0xe6e1d6, [0.06, 0.06, 0.16], [0, 0.3, -0.35], [0.08, 0.04, 0.05]),
    part(G.sphere(1, 10, 8), 0xe6e1d6, [-0.06, 0.06, 0.16], [0, -0.3, 0.35], [0.08, 0.04, 0.05]),
    part(G.sphere(1, 8, 6), 0xe6e1d6, [0.11, 0.02, 0.13], [0, 0, 0], [0.03, 0.05, 0.03]),
    part(G.sphere(1, 8, 6), 0xe6e1d6, [-0.11, 0.02, 0.13], [0, 0, 0], [0.03, 0.05, 0.03]),
    part(G.box(0.1, 0.03, 0.03), 0xe6e1d6, [0.08, 0.23, 0.15], [0, 0, -0.2]),
    part(G.box(0.1, 0.03, 0.03), 0xe6e1d6, [-0.08, 0.23, 0.15], [0, 0, 0.2]),
    part(G.sphere(0.04, 8, 6), SKIN, [0.17, 0.13, 0]),
    part(G.sphere(0.04, 8, 6), SKIN, [-0.17, 0.13, 0]),
    part(G.cyl(0.33, 0.33, 0.025, 20), HAT, [0, 0.27, 0]),
    part(G.cyl(0.15, 0.18, 0.16, 16), HAT, [0, 0.35, 0]),
    part(G.cyl(0.182, 0.182, 0.04, 16, true), 0x3a2a1a, [0, 0.3, 0]),
    part(G.box(0.12, 0.03, 0.2), 0x6a4a2e, [0, 0.43, 0]),
  ];
  const upper = merge([
    part(G.sphere(0.1, 10, 8), VIS, [0, 0, 0]),
    limb([0, 0, 0], [0, -0.17, 0], 0.095, 0.088, VIS, 10),
    limb([0, -0.17, 0], [0, -ARM1, 0], 0.07, 0.068, SKIN, 8),
  ]);
  const lower = merge([
    part(G.sphere(0.07, 8, 6), SKIN, [0, 0, 0]),
    limb([0, 0, 0], [0, -0.3, 0], 0.068, 0.06, SKIN, 8),
    part(G.sphere(0.08, 10, 8), SKIN, [0, -ARM2, 0], [0, 0, 0], [1, 1.05, 0.95]),
  ]);
  GEO = { thigh, shin, torso: merge(torso), head: merge(head), upper, lower };
  return GEO;
}

function createKeeperRig(scale) {
  const g = geos();
  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 0.97;
  root.add(hips);
  const mkLeg = (x) => {
    const hip = new THREE.Group();
    hip.position.set(x, 0, 0);
    hip.add(vcMesh(g.thigh));
    const knee = new THREE.Group();
    knee.position.y = -0.42;
    knee.add(vcMesh(g.shin));
    hip.add(knee);
    hips.add(hip);
    return { hip, knee };
  };
  const legL = mkLeg(0.13), legR = mkLeg(-0.13);
  const torso = new THREE.Group();
  torso.position.y = 0.05;
  const belly = vcMesh(g.torso); // (it wobbles when he's bounced on)
  torso.add(belly);
  hips.add(torso);
  const head = new THREE.Group();
  head.position.y = 0.74;
  head.add(vcMesh(g.head));
  torso.add(head);
  const mkArm = (x) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(x, 0.55, 0);
    shoulder.add(vcMesh(g.upper));
    const elbow = new THREE.Group();
    elbow.position.y = -ARM1;
    elbow.add(vcMesh(g.lower));
    shoulder.add(elbow);
    torso.add(shoulder);
    return { shoulder, elbow };
  };
  const armL = mkArm(0.3), armR = mkArm(-0.3);
  const rake = new THREE.Group();
  rake.position.set(0, 0.4, 0.26);
  const rakeMesh = vcMesh(keyRakeGeo());
  rake.add(rakeMesh);
  const tip = new THREE.Object3D();
  tip.position.set(0, -2.2, 0);
  rake.add(tip);
  torso.add(rake);
  // dizzy (or out cold): stars going round his head
  const stars = new THREE.Group();
  const starGeo = new THREE.OctahedronGeometry(0.055, 0), starMat = new THREE.MeshBasicMaterial({ color: 0xffe066 });
  for (let i = 0; i < 5; i++) {
    const st = new THREE.Mesh(starGeo, starMat);
    st.userData.a = (i / 5) * TAU;
    stars.add(st);
  }
  stars.position.y = 0.62;
  stars.visible = false;
  head.add(stars);
  root.scale.setScalar(scale);
  root.rotation.order = 'YXZ'; // (so he can topple over backwards, whichever way he's facing)
  return { root, bodyPivot: torso, hips, torso, belly, head, legL, legR, armL, armR, rake, rakeMesh, tip, stars };
}

export class Keeper extends Foe {
  constructor(game, x, z) {
    super(game, DEF, x, z);
    this.setRig(createKeeperRig(DEF.scale));
    this.state = 'rake';
    this.speedNow = 0;
    this.phase = 0;
    this.spinCool = 3;
    this.wanderTo = this.home.clone();
    this.wanderT = 0;
    const ring = new THREE.RingGeometry(0.93, 1, 64).rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: 0xff3b2f, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }));
    this.fill = new THREE.Mesh(new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff3b2f, transparent: true, opacity: 0.15, depthWrite: false }));
    this.ring.add(this.fill);
    this.ring.visible = false;
    game.scene.add(this.ring);
  }

  get damageMult() { return this.state === 'dizzy' ? 1.6 : 1; }

  hits(p) {
    if (!this.alive) return false;
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z, h = p.y - this.pos.y;
    return dx * dx + dz * dz < (0.34 * this.s) ** 2 && h > 0 && h < 1.7 * this.s;
  }

  latchFrame(p) {
    const h = (p.y - this.pos.y) / this.s;
    if (h > 1.0) return this.rig.torso;
    this.rig.root.worldToLocal(_v.copy(p));
    return _v.x > 0 ? this.rig.legL.hip : this.rig.legR.hip;
  }

  attachPoint(t, frame) {
    const l = frame.worldToLocal(t.pos.clone());
    const r = frame === this.rig.torso ? 0.3 : 0.14;
    const d = Math.hypot(l.x, l.z) || 1;
    l.x = (l.x / d) * r;
    l.z = (l.z / d) * r;
    return l;
  }

  hitFx(p) { this.game.fx.burst(p, { n: 3, colors: [VIS, SILVER, KHAKI], speed: [1, 2], up: [1, 2.5], size: [0.04, 0.08], flat: 0.3 }); }

  rakeHead(out) {
    this.rig.tip.getWorldPosition(out);
    out.y = this.game.world.groundHeight(out.x, out.z);
    return out;
  }

  onDamage() {
    if (this.state === 'rake') { this.state = 'chase'; this.t = 0; this.game.audio.oi(); }
  }

  onDeath() {
    const g = this.game, r = this.rig;
    this.ring.visible = false;
    g.hud.banner('GROUNDSKEEPER VANQUISHED');
    g.audio.fanfare();
    // down he goes, flat on his back (turning a little as he topples, so as to land in the clear)...
    this.fallFrom = this.heading;
    this.fallTo = this.clearFall();
    // ...and his key rake flies out of his hands, landing in front of him
    r.rakeMesh.updateWorldMatrix(true, false);
    if (this.key && !this.key.gone) this.key.release(r.rakeMesh.matrixWorld, this.fallTo, 4.8);
    r.rake.visible = false;
  }

  /** which way to face so as to fall flat on his back somewhere clear, as near as can be to the way he's facing */
  clearFall() {
    const w = this.game.world, s = this.s;
    for (let i = 0; i < 9; i++) {
      const h = this.heading + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.4, bx = -Math.sin(h), bz = -Math.cos(h);
      if ([0.8, 1.6, 2.1].every((d) => w.isFree(this.pos.x + bx * d * s, this.pos.z + bz * d * s, 0.6))) return h;
    }
    return this.heading;
  }

  /** instead of being hauled away, Kev lies there out cold, with his leaf bag dropped beside him */
  becomeCarcass() {
    const g = this.game;
    this.state = 'out';
    this.t = 0;
    this.heading = this.fallTo ?? this.heading;
    const a = this.heading + Math.PI / 2;
    const bag = new LeafBag(g, this.pos.x + Math.sin(a) * 3.2, this.pos.z + Math.cos(a) * 3.2);
    g.enemies.list.push(bag);
    g.fx.dust(bag.pos, 12);
    // (he hits the deck)
    g.fx.dust(this.along(1.3, 0, _v), 16);
    g.shake(0.35);
    g.audio.stomp(3);
    g.hud.toast(this.key && !this.key.gone ? 'Big Kev is out cold! His key rake opens the gate, and his leaf bag is for a mound' : 'Big Kev is out cold, and he dropped his leaf bag! Haul it to a mound!', 3.5);
    // and his belly's a trampoline now
    this.belly = new Belly(g, this);
    g.toys.addBouncer(this.belly);
  }

  /** the point `d` (in his own lengths) along him from his feet towards his head, lying down, `up` off the ground */
  along(d, up, out) {
    return out.set(this.pos.x - Math.sin(this.heading) * d * this.s, this.pos.y + up, this.pos.z - Math.cos(this.heading) * d * this.s);
  }

  colliderR() { return this.alive ? this.def.radius : 0; }

  /** lying down he's long: his legs and his head are in the way (his belly's for bouncing on) */
  moreColliders(list) {
    if (this.state !== 'out') return;
    for (const [d, r] of [[0.35, 0.75], [0.85, 0.85], [1.9, 0.65]]) {
      this.along(d, 0, _v);
      list.push({ x: _v.x, z: _v.z, r });
    }
  }

  /* ---------------------------------------------------------------- AI */
  think(dt) {
    const g = this.game, d = this.def;
    this.spinCool -= dt;
    switch (this.state) {
      case 'rake': {
        this.wanderT -= dt;
        if (this.wanderT <= 0) {
          this.wanderT = rand(3, 6);
          this.wanderPoint(2, 9, this.wanderTo);
        }
        this.walk(this.wanderTo.x, this.wanderTo.z, 0.8, dt, 0.5, 2);
        if (Math.random() < dt * 3) g.fx.leafBits(this.rakeHead(_v), 1);
        const tg = this.findTarget();
        if (tg || this.latched.length) { this.target = tg; this.state = 'chase'; this.t = 0; this.engaged = true; g.audio.oi(); }
        break;
      }
      case 'chase': {
        if (this.wantsShake()) { this.state = 'swat'; this.t = 0; break; }
        if (this.spinCool <= 0 && this.cool <= 0 && this.countNear(this.pos, d.spinR * 0.9) >= 4) {
          this.state = 'spinWind'; this.t = 0; g.audio.oi(); break;
        }
        const tg = this.target;
        if (!tg || tg.dead || !tg.grounded || !this.sees(tg)) {
          this.target = this.findTarget(d.aggro * 1.3);
          if (!this.target) {
            this.walk(this.home.x, this.home.z, d.speed * 0.6, dt, 1);
            if (!this.latched.length && this.t > 2) { this.state = 'rake'; this.engaged = false; }
          }
          break;
        }
        const dx = tg.pos.x - this.pos.x, dz = tg.pos.z - this.pos.z, dist = Math.hypot(dx, dz) || 1;
        const want = 5.0;
        this.walk(tg.pos.x - (dx / dist) * want, tg.pos.z - (dz / dist) * want, d.speed, dt, 0.3, 3);
        this.heading = dampAngle(this.heading, Math.atan2(dx, dz), 3, dt);
        if (this.cool <= 0 && Math.abs(dist - want) < 1.8) {
          this.state = 'sweep';
          this.t = 0;
          this.struck = false;
          this.slamAt = this.rakeHead(new THREE.Vector3()); // where the rake will come down (marked in red)
        }
        break;
      }
      case 'sweep':
        this.speedNow = damp(this.speedNow, 0, 10, dt);
        if (this.t >= SWEEP_T && !this.struck) {
          this.struck = true;
          // half of those under the rake get flattened, the other half are flung clear
          const p = this.slamAt;
          let squash = Math.random() < 0.5;
          for (const t of this.turkeysNear(p, d.sweepR)) {
            if (squash) t.die('swept');
            else t.blastAway(p, d.sweepR + rand(2.5, 4.5), 2.6);
            squash = !squash;
          }
          g.fx.dust(p, 12);
          g.fx.leafBits(p, 10);
          g.fx.ring(p, 0xfff3c4, d.sweepR * 1.4, 0.4);
          g.audio.stomp(2.7);
          g.shake(0.3);
        }
        if (this.t >= SWEEP_T + 0.65) { this.state = 'chase'; this.cool = 1.3; this.t = 0; }
        break;
      case 'spinWind':
        this.speedNow = damp(this.speedNow, 0, 10, dt);
        if (this.t >= 1.5) { this.state = 'spin'; this.t = 0; this.shakeOff(); g.audio.whoosh(); this.knocked = false; this.spun = new Set(); }
        break;
      case 'spin': {
        this.heading += dt * TAU * 1.9;
        // the rake catches everything in the ring: half get swept to their doom, half get launched clear
        if (this.t > 0.08) {
          for (const t of this.turkeysNear(this.pos, d.spinR)) {
            if (this.spun.has(t)) continue;
            this.spun.add(t);
            if (Math.random() < 0.5) t.die('swept');
            else t.blastAway(this.pos, d.spinR + rand(1.5, 4.5), 3.2);
          }
        }
        const p = g.player;
        if (!this.knocked && Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < d.spinR + p.radius) {
          this.knocked = true;
          p.knock(this.pos, 14);
        }
        if (Math.random() < dt * 20) g.fx.leafBits(this.rakeHead(_v), 2);
        if (this.t >= 1.1) { this.state = 'dizzy'; this.t = 0; this.spinCool = 7; g.hud.toast("Kev's dizzy! Pile on!", 1.8); }
        break;
      }
      case 'dizzy':
        this.speedNow = 0;
        if (this.t >= 2.8) { this.state = 'chase'; this.t = 0; this.cool = 0.8; }
        break;
      case 'swat':
        this.speedNow = damp(this.speedNow, 0, 10, dt);
        if (this.t >= 0.4 && this.latched.length) { this.shakeOff(); g.audio.oi(); }
        if (this.t >= 0.9) { this.state = 'chase'; this.t = 0; }
        break;
    }
  }

  /* ---------------------------------------------------------------- animation */
  pose(dt) {
    const r = this.rig, t = this.t;
    const k = clamp(this.speedNow / 2, 0, 1);
    this.phase += dt * (2 + this.speedNow * 1.6);
    const s = Math.sin(this.phase), c = Math.cos(this.phase);
    let legL = -s * 0.5 * k, legR = s * 0.5 * k, kneeL = Math.max(0, c) * 0.7 * k, kneeR = Math.max(0, -c) * 0.7 * k;
    let hipsY = 0.97 + Math.abs(s) * 0.03 * k, torsoX = 0.05, torsoY = 0, torsoZ = 0, headX = 0;
    // default: both hands on the rake, rake angled down in front
    let rakeX = -0.95, rakeZ = 0, rakeY = 0;

    switch (this.state) {
      case 'rake': {
        const rk = Math.sin(this.game.time * 3);
        rakeX = -1.0 - rk * 0.2; torsoX = 0.15 + rk * 0.05;
        break;
      }
      case 'sweep': {
        // rake up high through the wind-up, then down it comes
        const up = t < SWEEP_T - 0.15 ? t / (SWEEP_T - 0.15) : Math.max(0, 1 - (t - (SWEEP_T - 0.15)) / 0.15);
        rakeX = -0.95 - up * 2.3;
        torsoX = 0.1 - up * 0.25 + (t > SWEEP_T && t < SWEEP_T + 0.35 ? 0.3 : 0);
        break;
      }
      case 'spinWind': {
        const w = Math.min(1, t / 0.5);
        hipsY -= 0.12 * w; kneeL = kneeR = 0.6 * w; legL = legR = -0.35 * w; torsoX = 0.3 * w;
        rakeX = 1.57 * w - 0.95 * (1 - w); rakeZ = -1.45 * w;
        break;
      }
      case 'spin':
        hipsY -= 0.08; kneeL = kneeR = 0.4; rakeX = 1.57; rakeZ = -1.5; torsoX = 0.2;
        break;
      case 'dizzy':
        torsoZ = Math.sin(t * 5) * 0.12; torsoX = 0.1 + Math.sin(t * 3.3) * 0.08; headX = Math.sin(t * 4) * 0.2;
        rakeX = -0.6 + Math.sin(t * 3) * 0.15;
        break;
      case 'swat':
        torsoY = Math.sin(t * 18) * 0.5; torsoX = 0.4; rakeX = -0.5 + Math.sin(t * 18) * 0.5;
        break;
    }
    // beaten: over he goes backwards like a felled tree (bouncing once as he lands), and there he lies, arms
    // flung out, out cold
    let fall = 0, lift = 0, spread = 0;
    if (!this.alive) {
      const k = this.state === 'dying' ? Math.min(1, this.t / this.def.dieTime) : 1;
      fall = k * k;
      const bounce = this.state === 'out' ? Math.max(0, Math.sin(Math.min(1, this.t / 0.35) * Math.PI)) * 0.08 * Math.max(0, 1 - this.t / 0.35) : 0;
      fall -= bounce;
      lift = 0.21 * fall;
      spread = Math.min(1, k * 1.4);
      if (this.state === 'dying') this.heading = this.fallFrom + angleDiff(this.fallFrom, this.fallTo) * Math.min(1, k * 1.5);
      hipsY = 0.97; legL = legR = 0.1 * spread; kneeL = kneeR = 0.12 * spread;
      torsoX = 0; torsoY = 0; torsoZ = 0; headX = -0.25 * spread;
    }
    if (this.flinch > 0) torsoZ += Math.sin(this.t * 40) * 0.05 * this.flinch;

    r.hips.position.y = hipsY;
    r.legL.hip.rotation.set(legL, 0, 0.13 * spread); r.legR.hip.rotation.set(legR, 0, -0.13 * spread);
    r.legL.knee.rotation.x = kneeL; r.legR.knee.rotation.x = kneeR;
    r.torso.rotation.set(torsoX, torsoY, torsoZ);
    r.head.rotation.x = headX;
    if (this.alive) {
      r.rake.rotation.set(rakeX, rakeY, rakeZ);
      r.rake.updateMatrix();
      solveArm(r.armL, _v.set(0, GRIPS[0], 0).applyMatrix4(r.rake.matrix), POLES[0]);
      solveArm(r.armR, _v.set(0, GRIPS[1], 0).applyMatrix4(r.rake.matrix), POLES[1]);
    } else {
      // (arms thrown out above his head, flat on the ground)
      r.armL.shoulder.rotation.set(0, 0.42 * spread, (Math.PI / 2 + 0.55) * spread);
      r.armR.shoulder.rotation.set(0, -0.42 * spread, -(Math.PI / 2 + 0.55) * spread);
      r.armL.elbow.rotation.set(-0.35 * spread, 0, 0);
      r.armR.elbow.rotation.set(-0.35 * spread, 0, 0);
    }
    const pitch = -Math.PI / 2 * fall;
    r.root.position.set(this.pos.x, this.pos.y + lift * this.s, this.pos.z);
    r.root.rotation.set(pitch, this.heading, 0);

    // his belly: breathing as he lies there, and squashing when something bounces on it
    if (this.belly) {
      const d = this.belly.dip, br = Math.sin(this.game.time * 1.7) * 0.025;
      r.belly.scale.set(1 - d * 0.06, 1 - d * 0.03, 1 + d * 0.16 + br);
    }

    const dizzy = this.state === 'dizzy' || !this.alive;
    r.stars.visible = dizzy;
    if (dizzy) {
      // (round and round, level whichever way his head's lying: above his face once he's down)
      const spin = this.alive ? 4 : 2.6, rad = this.alive ? 0.22 : 0.3;
      r.stars.position.set(0, 0.62 - 0.44 * fall, 0.4 * fall);
      r.stars.rotation.x = -(pitch + torsoX + headX);
      r.stars.children.forEach((st, i) => {
        const a = st.userData.a + this.game.time * spin;
        st.position.set(Math.cos(a) * rad, Math.sin(a * 2 + i) * 0.03, Math.sin(a) * rad);
        st.rotation.y = this.game.time * 3;
      });
    }

    // a red circle where the rake's about to slam down
    if (this.alive && this.state === 'sweep' && !this.struck) {
      this.slamWarn ??= this.game.fx.warnCircle();
      this.slamWarn.show(this.slamAt, this.def.sweepR, t / SWEEP_T, this.game.time);
    } else this.slamWarn?.hide();

    // the spin warning ring
    const warn = this.state === 'spinWind' || this.state === 'spin';
    this.ring.visible = warn;
    if (warn) {
      const grow = this.state === 'spin' ? 1 : Math.min(1, t / 1.2);
      const rr = this.def.spinR * grow;
      this.ring.position.set(this.pos.x, this.game.world.groundHeight(this.pos.x, this.pos.z) + 0.06, this.pos.z);
      this.ring.scale.set(rr, 1, rr);
      this.ring.material.opacity = 0.45 + Math.sin(this.game.time * 20) * 0.25;
    }
  }

  dispose() {
    super.dispose();
    this.game.scene.remove(this.ring);
    this.slamWarn?.dispose();
  }
}

/*
 * Knocked-out Kev's belly: turkeys bounce on it just like the backyard trampoline (walk onto it, get thrown
 * at it, or hop up for a go), and it wobbles (he mutters in his sleep)
 */
class Belly {
  constructor(game, kev) {
    this.game = game;
    this.kev = kev;
    const c = kev.along(1.22, 0, new THREE.Vector3()); // (up from his feet: his hips, then his belly)
    this.x = c.x;
    this.z = c.z;
    this.matR = 1.05;
    this.matY = kev.pos.y + 0.53 * kev.s; // (the top of it, him lying down)
    this.dip = 0;
    this.dipV = 0;
  }

  kick(power = 1) { this.dipV -= 2.2 * power; }

  bounce(t) {
    const g = this.game;
    if (!t.bounces) t.bounces = randInt(2, 4);
    t.bounces--;
    this.kick(0.7 + t.stage * 0.25);
    g.audio.boing(t.stage);
    if (Math.random() < 0.25) g.audio.oi();
    t.squash = 1;
    if (Math.random() < 0.4) g.fx.sparkle(t.pos, 3, [0xffe066, 0xffffff]);
    g.hud.toastOnce('kev-belly', 'Boing! Big Kev makes a good trampoline', 2.5, 600);
    if (t.bounces > 0) {
      const a = rand(0, TAU), r = rand(0, 0.55);
      t.hopTo(this.x + Math.cos(a) * r, this.z + Math.sin(a) * r, rand(0.8, 1.05), rand(2.6, 4.0), this.matY);
      t.flight.spin = Math.random() < 0.45 ? pick([-1, 1]) : 0; // the odd flip
    } else {
      // ...and off, to one side of him or the other
      const h = this.kev.heading + pick([-1, 1]) * Math.PI / 2 + rand(-0.5, 0.5), d = rand(3.2, 4.6);
      t.hopTo(this.x + Math.sin(h) * d, this.z + Math.cos(h) * d, 1.1, 3.4);
      t.flight.spin = pick([-1, 1]);
      if (t.bounceRejoin) t.joinAfterHop = true;
      t.bounceRejoin = false;
    }
  }

  update(dt) {
    // (a big soft belly: it gives, and wobbles back)
    this.dipV += (-this.dip * 80 - this.dipV * 6) * dt;
    this.dip += this.dipV * dt;
  }
}

/* The giant bag of leaves Kev drops. Starts life ready to haul. */
export class LeafBag extends Foe {
  constructor(game, x, z) {
    super(game, { name: 'Leaf bag', hp: 1, scale: 1, radius: 1, value: 120, weight: 16, carryR: 1.4, slots: 20, labelY: 2, carcassLabelY: 2.4, palette: 'autumn', icon: '🍂', loot: true }, x, z);
    const p = [
      part(G.sphere(1, 16, 12), 0x3f7f3a, [0, 0.95, 0], [0, 0, 0], [1.15, 1.0, 1.15]),
      part(G.cyl(0.25, 0.4, 0.35, 12), 0x3f7f3a, [0, 1.95, 0]),
      part(G.torus(0.26, 0.05, 6, 12), 0xf2d24b, [0, 2.0, 0], [Math.PI / 2, 0, 0]),
    ];
    for (let i = 0; i < 12; i++) p.push(part(G.box(0.22, 0.02, 0.1), pick([0xd9602b, 0xe8a33d, 0xc0392b, 0xf2c14e]), [rand(-0.2, 0.2), 2.2 + rand(0, 0.15), rand(-0.2, 0.2)], [rand(0, 3), rand(0, 3), rand(0, 3)]));
    const root = new THREE.Group();
    root.add(vcMesh(merge(p)));
    this.setRig({ root });
    this.alive = false;
    this.becomeCarcass();
  }

  get targetable() { return false; }

  pose() {
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.set(0, this.heading, this.carrying ? Math.sin(this.game.time * 8) * 0.04 : 0);
  }
}
