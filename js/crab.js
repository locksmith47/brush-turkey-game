import * as THREE from 'three';
import { Foe } from './foe.js';
import { part, merge, vcMesh, G, limb, rand, pick, damp, dampAngle, clamp, TAU } from './util.js';
import { POOLS, shoreZ } from './props/beach.js';

/*
 * Crabs scuttle sideways, snip up a turkey in each claw and drag them into the sea.
 * Hit a crab hard enough and it lets go. The King Crab grabs three per claw, slams,
 * sprays bubbles that float landlubbers away, and retreats to heal in its rock pool,
 * where only beach turkeys can follow.
 */
const COMMON = { bodyY: 0.38, labelY: 1.0, carcassLabelY: 0.6, mound: 'beach' };
const KINDS = {
  crab: { ...COMMON, name: 'Crab', hp: 30, scale: 1, radius: 0.6, aggro: 7, leash: 10, maxLatch: 6, shakeAt: 4, shakeEvery: 5, value: 9, weight: 3, carryR: 0.95, slots: 8, speed: 3.2, perClaw: 1, gripHP: 12, drownTime: 3.5, cooldown: 1.4, pinch: 12 },
  king: {
    ...COMMON, name: 'King Crab', boss: true, hp: 700, scale: 3.4, radius: 1.9, aggro: 14, leash: 14, maxLatch: 22, shakeAt: 10, shakeEvery: 5, value: 60, weight: 20,
    carryR: 2.7, slots: 26, speed: 2.4, perClaw: 3, gripHP: 45, drownTime: 5, cooldown: 1.6, pinch: 22,
  },
};
const SHELL = 0xe0502a, SHELL2 = 0xc9431f, BELLY = 0xf2a36b, KING = 0xa3251c, KING2 = 0x7d1a14;
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

// the King's claw slam: a red circle marks where it'll land, filling in until... wham
const SLAM_R = 2.4, SLAM_WIND = 1.35, SLAM_HURT = 30;
// and its water jet: a red lane on the ground first, then a blast of seawater down it that bowls turkeys away
const JET_LEN = 10, JET_W = 1.8, JET_WIND = 1.1, JET_FIRE = 0.85, JET_HURT = 15;
const RED = { color: 0xff3b2f, transparent: true, depthWrite: false };

function crabGeo(king) {
  const shell = king ? KING : SHELL, shell2 = king ? KING2 : SHELL2;
  const body = [
    part(G.sphere(1, 18, 10), shell, [0, 0.38, 0], [0, 0, 0], [0.55, 0.2, 0.42]),
    part(G.sphere(1, 14, 8), BELLY, [0, 0.31, 0.02], [0, 0, 0], [0.5, 0.12, 0.38]),
    part(G.box(0.12, 0.03, 0.03), 0x3a1a10, [0, 0.36, 0.41]),
  ];
  for (let i = 0; i < 7; i++) body.push(part(G.sphere(0.06, 6, 5), shell2, [rand(-0.35, 0.35), 0.54, rand(-0.25, 0.2)], [0, 0, 0], [1, 0.5, 1]));
  if (king) {
    for (let i = 0; i < 14; i++) {
      const a = rand(0, TAU), r = rand(0.1, 0.45);
      body.push(part(G.cone(0.05, 0.16, 5), 0xf2c38a, [Math.cos(a) * r, 0.55, Math.sin(a) * r * 0.75]));
    }
    // a crown of shells
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      body.push(part(G.cone(0.05, 0.16, 6), i % 2 ? 0xfff1d6 : 0xf5c518, [Math.cos(a) * 0.12, 0.66, Math.sin(a) * 0.12 + 0.05]));
    }
    body.push(part(G.torus(0.12, 0.025, 4, 14), 0xf5c518, [0, 0.6, 0.05], [Math.PI / 2, 0, 0]));
  }
  for (const s of [-1, 1]) {
    body.push(limb([s * 0.12, 0.44, 0.3], [s * 0.15, 0.64, 0.34], 0.025, 0.02, shell, 5));
    body.push(part(G.sphere(0.06, 8, 6), 0xffffff, [s * 0.15, 0.66, 0.35]));
    body.push(part(G.sphere(0.035, 6, 5), 0x111111, [s * 0.155, 0.665, 0.4]));
    body.push(part(G.box(0.09, 0.02, 0.02), 0x3a1a10, [s * 0.14, 0.74, 0.36], [0, 0, s * -0.5]));
  }
  const leg = merge([
    limb([0, 0, 0], [0.45, 0.2, 0], 0.045, 0.035, shell, 5),
    limb([0.45, 0.2, 0], [0.78, -0.33, 0], 0.035, 0.015, shell, 5),
  ]);
  const arm = merge([
    limb([0, 0, 0], [0.18, 0.04, 0.22], 0.06, 0.055, shell, 6),
    part(G.sphere(1, 12, 8), shell, [0.22, 0.06, 0.38], [0, 0.3, 0], [0.13, 0.12, 0.19]),
    part(G.cone(0.08, 0.3, 8), shell2, [0.24, 0.0, 0.6], [Math.PI / 2 + 0.1, 0, 0]),
  ]);
  const finger = part(G.cone(0.07, 0.28, 8), shell2, [0, 0, 0.14], [Math.PI / 2 - 0.1, 0, 0]);
  return { body: merge(body), leg, arm, finger };
}

const GEO = {};

function createCrabRig(kind) {
  const king = kind === 'king';
  GEO[kind] ??= crabGeo(king);
  const g = GEO[kind];
  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);
  bodyPivot.add(vcMesh(g.body));
  const legs = [];
  const zs = [0.16, 0.03, -0.1, -0.23];
  for (const side of [1, -1]) {
    for (let i = 0; i < 4; i++) {
      const l = new THREE.Group();
      l.position.set(side * 0.42, 0.33, zs[i]);
      l.scale.x = side;
      l.add(vcMesh(g.leg));
      l.userData = { side, ph: (i + (side > 0 ? 0 : 1)) % 2 ? Math.PI : 0, yaw: (i - 1.5) * 0.25 * side };
      bodyPivot.add(l);
      legs.push(l);
    }
  }
  const claws = [1, -1].map((side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.33, 0.36, 0.28);
    shoulder.scale.x = side;
    shoulder.add(vcMesh(g.arm));
    const finger = new THREE.Group();
    finger.position.set(0.24, 0.1, 0.46);
    finger.add(vcMesh(g.finger));
    shoulder.add(finger);
    const tip = new THREE.Object3D();
    tip.position.set(0.24, 0.05, 0.7);
    shoulder.add(tip);
    bodyPivot.add(shoulder);
    return { shoulder, finger, tip };
  });
  root.scale.setScalar(KINDS[kind].scale);
  return { root, bodyPivot, legs, claws };
}

export class Crab extends Foe {
  constructor(game, kind, x, z) {
    super(game, KINDS[kind], x, z);
    this.kind = kind;
    this.setRig(createCrabRig(kind));
    this.state = 'wander';
    this.wanderTo = this.home.clone();
    this.wanderT = 0;
    this.speedNow = 0;
    this.phase = 0;
    this.side = 1;
    this.held = [];
    this.gripDmg = 0;
    this.open = 0;
    this.lift = 0;
    this.bubbleCool = 6;
    this.retreatCool = 0;
    this.retreated = false;
    this.jetCool = 5;
    if (kind === 'king') this.buildTelegraphs();
  }

  /** the King's warning markings (and the jet itself), hidden until needed */
  buildTelegraphs() {
    const s = this.game.scene;
    this.warn = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 56).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ ...RED, opacity: 0.75, side: THREE.DoubleSide }));
    this.warnFill = new THREE.Mesh(new THREE.CircleGeometry(1, 56).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ ...RED, opacity: 0.38 }));
    this.warn.add(this.warnFill);
    this.warn.visible = false;
    s.add(this.warn);
    // a lane marked out in front of it, filling up towards the far end
    const strip = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5);
    this.lane = new THREE.Mesh(strip, new THREE.MeshBasicMaterial({ ...RED, opacity: 0.2, side: THREE.DoubleSide }));
    this.laneFill = new THREE.Mesh(strip, new THREE.MeshBasicMaterial({ ...RED, opacity: 0.35, side: THREE.DoubleSide }));
    this.laneFill.position.y = 0.01;
    this.lane.add(this.laneFill);
    this.lane.visible = false;
    s.add(this.lane);
    // the jet: a stretched see-through tube of seawater from its mouth to the ground
    this.jet = new THREE.Mesh(new THREE.CylinderGeometry(1, 0.7, 1, 14, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5), new THREE.MeshBasicMaterial({ color: 0xcff4ff, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }));
    this.jet.rotation.order = 'YXZ';
    this.jet.visible = false;
    s.add(this.jet);
  }

  /** where the King's water comes out */
  mouthPos(out) {
    return out.set(this.pos.x + Math.sin(this.heading) * 0.45 * this.s, this.pos.y + 0.36 * this.s, this.pos.z + Math.cos(this.heading) * 0.45 * this.s);
  }

  /** is something at p (`r` across) standing in the lane a jet fired along `heading` would hit? */
  inLane(p, r, heading) {
    const fx = Math.sin(heading), fz = Math.cos(heading), start = 0.4 * this.s;
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    const along = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
    return along > start && along < start + JET_LEN && side < JET_W / 2 + r;
  }

  /** turkeys standing in the lane a jet fired along `heading` would hit */
  laneTurkeys(heading) {
    return this.game.turkeys.list.filter((t) => t.grounded && !t.dead && this.inLane(t.pos, t.radius, heading));
  }

  /* ---------------------------------------------------------------- body */
  hits(p) {
    this.bodyCenter(_v);
    const s = this.s, dx = p.x - _v.x, dz = p.z - _v.z;
    return dx * dx + dz * dz < (0.55 * s + 0.15) ** 2 && Math.abs(p.y - _v.y) < 0.25 * s + 0.2;
  }

  attachPoint(t, frame) {
    const l = frame.worldToLocal(t.pos.clone());
    const d = Math.hypot(l.x / 0.55, l.z / 0.42) || 1;
    return new THREE.Vector3((l.x / d) * 0.5, 0.52, (l.z / d) * 0.38);
  }

  hitFx(p) { this.game.fx.burst(p, { n: 3, colors: [SHELL, BELLY, 0xffffff], speed: [1, 2], up: [1, 2.5], size: [0.04, 0.07] }); }

  heldPos(i, out) {
    const c = this.rig.claws[i % 2], k = Math.floor(i / 2);
    c.tip.getWorldPosition(out);
    out.y -= (0.12 + k * 0.1) * this.s;
    out.x += (k - 1) * 0.12 * this.s * (i % 2 ? -1 : 1);
    return out;
  }

  get grip() {
    if (this.state !== 'carry') return null;
    return { fill: Math.min(1, this.gripDmg / this.def.gripHP), time: 1 - (this.soakT ?? 0) / this.def.drownTime };
  }

  onDamage(amount) {
    if (this.state === 'wander') { this.state = 'chase'; this.t = 0; }
    if (this.state === 'carry') {
      this.gripDmg += amount;
      if (this.gripDmg >= this.def.gripHP) this.letGo(true);
    }
  }

  letGo(stagger) {
    for (const t of this.held) t.releaseFromBeak();
    this.held.length = 0;
    if (stagger && this.alive) {
      this.state = 'stagger';
      this.t = 0;
    }
  }

  onDeath() {
    this.letGo(false);
    this.game.audio.snip();
    if (this.kind === 'king') {
      this.game.hud.banner('KING CRAB CRACKED');
      this.game.audio.fanfare();
    }
  }

  /** the nearest deep water to drag prey into */
  nearestDeep(out) {
    if (this.kind === 'king') { const p = POOLS[0]; return out.set(p.x, 0, p.z); }
    let best = out.set(this.pos.x, 0, shoreZ(this.pos.x) - 5), bd = Math.abs(best.z - this.pos.z); // (straight out to sea)
    for (const p of POOLS) {
      const d = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
      if (d < bd) { bd = d; best = out.set(p.x, 0, p.z); }
    }
    return best;
  }

  /** scuttle towards (x, z) sideways; face the goal only when `face` is set */
  scuttle(x, z, speed, dt, face = false) {
    const dx = x - this.pos.x, dz = z - this.pos.z, d = Math.hypot(dx, dz);
    const inWater = this.game.world.waterDepth(this.pos.x, this.pos.z) === 2;
    this.speedNow = damp(this.speedNow, d > 0.3 ? speed * (inWater ? 0.8 : 1) : 0, 8, dt);
    if (d > 0.01) {
      const dir = Math.atan2(dx, dz);
      let want = dir;
      if (!face) {
        // keep a side leading: pick whichever sideways heading needs the least turning
        const a = dir + Math.PI / 2, b = dir - Math.PI / 2;
        want = Math.abs(Math.atan2(Math.sin(a - this.heading), Math.cos(a - this.heading))) < Math.abs(Math.atan2(Math.sin(b - this.heading), Math.cos(b - this.heading))) ? a : b;
      }
      this.heading = dampAngle(this.heading, want, 5, dt);
      const step = Math.min(d, this.speedNow * dt);
      this.pos.x += (dx / d) * step;
      this.pos.z += (dz / d) * step;
    }
    return d;
  }

  /* ---------------------------------------------------------------- AI */
  think(dt) {
    const g = this.game, d = this.def, king = this.kind === 'king';
    this.bubbleCool -= dt;
    this.retreatCool -= dt;
    this.jetCool -= dt;
    switch (this.state) {
      case 'wander': {
        this.wanderT -= dt;
        if (this.wanderT <= 0) {
          this.wanderT = rand(2, 4);
          const a = rand(0, TAU), r = rand(1, d.leash * 0.6);
          this.wanderTo.set(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r);
        }
        this.scuttle(this.wanderTo.x, this.wanderTo.z, d.speed * 0.5, dt);
        const tg = this.findTarget();
        if (tg || this.latched.length) {
          this.target = tg;
          this.state = 'chase';
          this.t = 0;
          this.engaged = true;
          g.audio.snip();
          if (king) { g.audio.roar(); g.shake(0.5); }
        }
        break;
      }
      case 'chase': {
        if (this.wantsShake()) { this.state = 'shake'; this.t = 0; break; }
        if (king && this.hp < d.hp * 0.6 && this.retreatCool <= 0) {
          this.state = 'retreat';
          this.t = 0;
          this.retreatCool = 24;
          g.hud.toastOnce('crab-pool', 'Back to its rock pool it goes. Only beach turkeys can swim after it', 3.5);
          break;
        }
        const front = this.forward(_w).multiplyScalar(1.1 * this.s).add(this.pos);
        if (king && this.cool <= 0 && this.countNear(front, SLAM_R) >= 4) {
          this.state = 'slam';
          this.t = 0;
          this.struck = false;
          this.slamAt = front.clone(); // marked on the ground now, so there's time to get out of the way
          g.audio.snip();
          break;
        }
        if (king && this.bubbleCool <= 0 && this.countNear(front, 6) >= 3) { this.state = 'bubbles'; this.t = 0; break; }
        const tg = this.target;
        if (king && this.jetCool <= 0 && tg && !tg.dead) {
          // lined up on a group of turkeys? hose them
          const aim = Math.atan2(tg.pos.x - this.pos.x, tg.pos.z - this.pos.z);
          if (this.laneTurkeys(aim).length >= 3) {
            this.state = 'jet';
            this.t = 0;
            this.jetAim = aim;
            this.jetHit = new Set();
            g.audio.hiss();
            break;
          }
        }
        if (!tg || tg.dead || !tg.grounded || Math.hypot(this.home.x - this.pos.x, this.home.z - this.pos.z) > d.leash * 2) {
          this.target = this.findTarget(d.aggro * 1.3);
          if (!this.target) {
            this.scuttle(this.home.x, this.home.z, d.speed * 0.7, dt);
            if (!this.latched.length && this.t > 1.5) { this.state = 'wander'; this.engaged = false; }
          }
          break;
        }
        const reach = 0.95 * this.s;
        const dist = Math.hypot(tg.pos.x - this.pos.x, tg.pos.z - this.pos.z);
        this.scuttle(tg.pos.x, tg.pos.z, d.speed, dt, dist < reach + 1.2 * this.s);
        if (dist < reach + 0.3 && this.cool <= 0) { this.state = 'snip'; this.t = 0; this.struck = false; g.audio.snip(); }
        break;
      }
      case 'snip': {
        this.speedNow = damp(this.speedNow, 0, 12, dt);
        const tg = this.target;
        if (tg && !tg.dead) this.heading = dampAngle(this.heading, Math.atan2(tg.pos.x - this.pos.x, tg.pos.z - this.pos.z), 8, dt);
        if (this.t >= 0.45 && !this.struck) {
          this.struck = true;
          g.audio.snip();
          const taken = new Set();
          let nipped = false;
          for (let c = 0; c < 2; c++) {
            this.rig.claws[c].tip.getWorldPosition(_v);
            const got = this.turkeysNear(_v, 0.55 * this.s).filter((t) => !taken.has(t)).slice(0, d.perClaw);
            got.forEach((t, k) => { taken.add(t); t.grabbedBy(this, c + k * 2); this.held.push(t); });
            // (you're too big to carry off: a nasty pinch will do)
            nipped ||= this.hurtPlayer(_v, 0.55 * this.s, d.pinch, { knock: 4, stun: 0.3 });
          }
          if (this.held.length) {
            this.state = 'carry';
            this.t = 0;
            this.soakT = 0;
            this.gripDmg = 0;
          }
        }
        if (this.state === 'snip' && this.t >= 0.9) { this.state = 'chase'; this.cool = d.cooldown; this.t = 0; }
        break;
      }
      case 'carry': {
        // off to the water with its catch
        this.nearestDeep(_w);
        this.scuttle(_w.x, _w.z, d.speed * 0.8, dt);
        if (g.world.waterDepth(this.pos.x, this.pos.z) === 2) {
          this.soakT += dt;
          if (this.soakT >= d.drownTime) {
            for (const t of this.held) t.die('drown');
            this.held.length = 0;
            this.state = 'chase';
            this.cool = d.cooldown;
            this.t = 0;
          }
        }
        break;
      }
      case 'stagger':
        this.speedNow = damp(this.speedNow, 0, 10, dt);
        if (this.t >= 1.1) { this.state = 'chase'; this.t = 0; this.cool = 0.6; }
        break;
      case 'shake':
        this.speedNow = damp(this.speedNow, 0, 10, dt);
        if (this.t >= 0.35 && this.latched.length) { this.shakeOff(); g.audio.snip(); }
        if (this.t >= 0.8) { this.state = 'chase'; this.t = 0; }
        break;
      case 'slam': {
        // claws up while the red circle fills in, then down they come on whatever's still inside it
        this.speedNow = damp(this.speedNow, 0, 10, dt);
        const at = this.slamAt;
        this.heading = dampAngle(this.heading, Math.atan2(at.x - this.pos.x, at.z - this.pos.z), 6, dt);
        if (this.t >= SLAM_WIND && !this.struck) {
          this.struck = true;
          // half of those caught get flattened, the other half are sent flying
          let squash = Math.random() < 0.5;
          for (const t of this.turkeysNear(at, SLAM_R)) {
            if (squash) t.die('squash');
            else t.blastAway(at, rand(3.5, 5.5), 2.4);
            squash = !squash;
          }
          this.hurtPlayer(at, SLAM_R, SLAM_HURT, { knock: 8, stun: 0.5 });
          g.fx.ring(at, 0xfff3c4, SLAM_R * 1.3, 0.5);
          g.fx.dust(at, 14);
          g.audio.stomp(this.s);
          g.shake(0.4);
        }
        if (this.t >= SLAM_WIND + 0.5) { this.state = 'chase'; this.cool = d.cooldown * 1.5; this.t = 0; }
        break;
      }
      case 'jet': {
        // takes aim down a lane (marked in red), then hoses it: everything in it gets bowled away
        this.speedNow = damp(this.speedNow, 0, 10, dt);
        this.heading = dampAngle(this.heading, this.jetAim, 8, dt);
        if (this.t >= JET_WIND && this.t < JET_WIND + JET_FIRE) {
          if (!this.firing) { this.firing = true; g.audio.jet(); g.shake(0.2); }
          const fx = Math.sin(this.jetAim), fz = Math.cos(this.jetAim);
          const mouth = this.mouthPos(_v);
          for (const t of this.laneTurkeys(this.jetAim)) {
            if (this.jetHit.has(t)) continue;
            this.jetHit.add(t);
            const along = (t.pos.x - mouth.x) * fx + (t.pos.z - mouth.z) * fz;
            t.blastAway(mouth, along + rand(4, 6.5), 2.2);
            g.fx.splash(t.pos.x, t.pos.y + 0.3, t.pos.z, 0.7);
          }
          // (you too, if you're in the way of it)
          const p = g.player;
          if (!this.jetHit.has(p) && this.inLane(p.pos, p.radius, this.jetAim)) {
            this.jetHit.add(p);
            if (p.hurt(JET_HURT, mouth, { knock: 12, stun: 0.6 })) g.fx.splash(p.pos.x, p.pos.y + 1, p.pos.z, 0.9);
          }
          // spray streaming out of its mouth, and a splash where the jet comes down
          g.fx.burst(mouth, { glow: true, dir: _w.set(fx, 0, fz), n: 3, colors: [0xffffff, 0xcff4ff, 0x9fdcf2], speed: [11, 16], up: [-1, 1.5], grav: 5, drag: 0.4, size: [0.06, 0.12], life: [0.4, 0.7] });
          if (Math.random() < dt * 14) {
            const ex = this.pos.x + fx * (0.4 * this.s + JET_LEN), ez = this.pos.z + fz * (0.4 * this.s + JET_LEN);
            g.fx.splash(ex + rand(-0.5, 0.5), g.world.groundHeight(ex, ez) + 0.05, ez + rand(-0.5, 0.5), 0.8);
          }
        }
        if (this.t >= JET_WIND + JET_FIRE) { this.firing = false; this.state = 'chase'; this.t = 0; this.jetCool = 8; this.cool = 0.8; }
        break;
      }
      case 'bubbles': {
        this.speedNow = damp(this.speedNow, 0, 10, dt);
        // a cone of bubbles that floats landlubbers away (beach turkeys just swim through it)
        const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
        if (this.t > 0.4 && this.t < 1.6) {
          if (Math.random() < dt * 30) {
            const a = this.heading + rand(-0.4, 0.4), r = rand(0.8, 1.2) * this.s;
            g.fx.burst(_v.set(this.pos.x + Math.sin(a) * r, this.pos.y + 0.5 * this.s, this.pos.z + Math.cos(a) * r), { glow: true, n: 2, colors: [0xdff6ff, 0xbfefff, 0xffffff], speed: [3, 6], up: [0.2, 1.2], grav: -0.6, drag: 1.2, size: [0.08, 0.16], life: [0.8, 1.3] });
          }
          for (const t of this.turkeysNear(this.pos, 8)) {
            if (t.canSwim) continue;
            const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z, dd = Math.hypot(dx, dz) || 1;
            if ((dx * fx + dz * fz) / dd > 0.75) t.blastAway(this.pos, dd + rand(5, 8), 3.5);
          }
        }
        if (this.t >= 1.8) { this.state = 'chase'; this.bubbleCool = 9; this.t = 0; }
        break;
      }
      case 'retreat': {
        // sulk in the deep middle of the pool, healing, until the timer runs out
        const p = POOLS[0];
        this.scuttle(p.x, p.z, d.speed, dt);
        if (Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < 1) this.hp = Math.min(d.hp, this.hp + dt * 6);
        if (this.wantsShake()) { this.shakeOff(); g.audio.snip(); }
        if (this.t >= 8) { this.state = 'chase'; this.t = 0; }
        break;
      }
    }
  }

  /* ---------------------------------------------------------------- animation */
  pose(dt) {
    const r = this.rig, t = this.t;
    const k = Math.min(1, this.speedNow / 2);
    this.phase += dt * (6 + this.speedNow * 5);
    let open = 0.1, lift = 0, roll = Math.sin(this.phase) * 0.06 * k;
    if (this.state === 'snip') { open = t < 0.45 ? 0.9 : 0; lift = t < 0.45 ? 0.5 : 0.1; }
    else if (this.state === 'carry') { open = 0; lift = 0.55 + Math.sin(this.game.time * 10) * 0.06; }
    else if (this.state === 'shake') { roll = Math.sin(t * 40) * 0.3; open = 0.5 + Math.sin(t * 30) * 0.4; lift = 0.4; }
    else if (this.state === 'slam') {
      // claws raised high, trembling more and more as it winds up
      lift = t < SLAM_WIND ? 1.15 * Math.min(1, t / 0.6) + Math.sin(t * 24) * 0.06 * (t / SLAM_WIND) : -0.2;
      open = 0.6;
    } else if (this.state === 'jet') { lift = 0.75; open = 0.95; roll = this.firing ? Math.sin(t * 45) * 0.04 : 0; }
    else if (this.state === 'bubbles') { lift = 0.3; open = 0.8; roll = Math.sin(t * 20) * 0.04; }
    else if (this.state === 'chase' || this.state === 'wander') { open = 0.15 + Math.max(0, Math.sin(this.game.time * 3)) * 0.4; }
    if (this.flinch > 0) roll += Math.sin(this.t * 50) * 0.06 * this.flinch;
    this.open = damp(this.open, open, 14, dt);
    this.lift = damp(this.lift, lift, 10, dt);

    for (const l of r.legs) {
      const u = l.userData;
      const step = Math.sin(this.phase + u.ph);
      l.rotation.set(0, u.yaw, (Math.max(0, step) * 0.45 * k + 0.05) * u.side);
    }
    for (const c of r.claws) {
      c.shoulder.rotation.x = -this.lift;
      c.finger.rotation.x = -this.open * 0.8;
    }
    r.bodyPivot.rotation.set(0, 0, roll);
    r.bodyPivot.position.y = Math.abs(Math.sin(this.phase)) * 0.02 * k;

    if (!this.alive) {
      // flipped on its back, legs in the air
      const flip = Math.PI * (this.state === 'dying' ? this.roll : 1);
      r.root.rotation.set(0, this.heading, flip);
      r.root.position.set(this.pos.x, this.pos.y + Math.sin(flip / 2) * 0.72 * this.s, this.pos.z);
      for (const c of r.claws) c.finger.rotation.x = -0.9;
    } else {
      r.root.position.copy(this.pos);
      r.root.rotation.set(0, this.heading, 0);
    }
    if (this.warn) this.poseTelegraphs();
  }

  /** the King's red warning markings on the ground, and the jet of water itself */
  poseTelegraphs() {
    const g = this.game, t = this.t, pulse = Math.sin(g.time * 18);
    // markings sit on the ground, or on the water's surface out in the pool
    const floor = (x, z) => { const w = g.world.waterAt(x, z); return w.depth ? Math.max(w.level, g.world.groundHeight(x, z)) : g.world.groundHeight(x, z); };
    const slamming = this.alive && this.state === 'slam' && !this.struck;
    this.warn.visible = slamming;
    if (slamming) {
      const at = this.slamAt, k = Math.min(1, t / SLAM_WIND);
      this.warn.position.set(at.x, floor(at.x, at.z) + 0.07, at.z);
      this.warn.scale.set(SLAM_R, 1, SLAM_R);
      this.warnFill.scale.set(k, 1, k); // fills in to the edge: when it gets there, down come the claws
      this.warn.material.opacity = 0.6 + pulse * 0.25;
    }
    const jetting = this.alive && this.state === 'jet';
    this.lane.visible = jetting;
    this.jet.visible = jetting && !!this.firing;
    if (!jetting) return;
    const fx = Math.sin(this.jetAim), fz = Math.cos(this.jetAim), start = 0.4 * this.s;
    const lx = this.pos.x + fx * start, lz = this.pos.z + fz * start;
    this.lane.position.set(lx, floor(lx, lz) + 0.07, lz);
    this.lane.rotation.y = this.jetAim;
    this.lane.scale.set(JET_W, 1, JET_LEN);
    this.laneFill.scale.set(1, 1, Math.min(1, t / JET_WIND));
    this.lane.material.opacity = this.firing ? 0.12 : 0.2 + pulse * 0.08;
    this.laneFill.material.opacity = this.firing ? 0.15 : 0.35;
    if (this.firing) {
      // from its mouth down to the ground at the end of the lane
      const m = this.mouthPos(_v);
      const drop = m.y - g.world.groundHeight(lx + fx * JET_LEN, lz + fz * JET_LEN);
      const grow = Math.min(1, (t - JET_WIND) / 0.15), fade = Math.min(1, (JET_WIND + JET_FIRE - t) / 0.2);
      this.jet.position.copy(m);
      this.jet.rotation.set(Math.atan2(drop, JET_LEN), this.jetAim, 0);
      const w = (0.32 + Math.sin(g.time * 50) * 0.04) * fade;
      this.jet.scale.set(w, w, Math.hypot(JET_LEN, drop) * grow);
      this.jet.material.opacity = 0.6 * fade;
    }
  }

  dispose() {
    super.dispose();
    if (this.warn) for (const m of [this.warn, this.lane, this.jet]) this.game.scene.remove(m);
  }
}
