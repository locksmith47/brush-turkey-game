import * as THREE from 'three';
import { Foe } from './foe.js';
import { part, merge, vcMesh, G, limb, rand, pick, damp, dampAngle, canvasTexture, TAU } from './util.js';

/*
 * Sydney funnel-web spider.
 *  - hides in its burrow (can't be hurt) surrounded by sticky silk that slows everyone
 *  - turkeys stepping on the trip lines lure it out: it rushes, rears up (fangs dripping) and bites
 *  - after a while it scuttles home to heal... unless it's badly hurt, then it's enraged
 */
const DEF = {
  name: 'Funnel-web', hp: 45, scale: 1.4, radius: 0.75, bodyY: 0.34, labelY: 0.95, carcassLabelY: 0.6,
  aggro: 4.8, leash: 8, maxLatch: 8, shakeAt: 5, shakeEvery: 4, value: 27, weight: 4, carryR: 1.3, slots: 10,
  webR: 4.8, reach: 1.5, biteR: 1.05, kills: 2, bite: 30,
};
const BLACK = 0x17161c, SHINE = 0x2c2a36;
const _v = new THREE.Vector3();
let BODY = null, FANGS = null, LEG = null;
let WEB_TEX = null, FUNNEL_TEX = null, HOLE_TEX = null;

/** a funnel-web's silk: trip lines, a sagging spiral and a sheen (also strung across the way to the bush's key) */
export function webTexture() {
  WEB_TEX ??= canvasTexture(512, 512, (c, w, h) => {
    const cx = w / 2, cy = h / 2, R = w * 0.455; // the sheet is 2.2 web-radii wide
    const sheen = c.createRadialGradient(cx, cy, 20, cx, cy, R);
    sheen.addColorStop(0, 'rgba(255,255,255,0.32)');
    sheen.addColorStop(0.35, 'rgba(255,255,255,0.12)');
    sheen.addColorStop(1, 'rgba(255,255,255,0.03)');
    c.fillStyle = sheen;
    c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
    const spokes = 22, angles = [];
    for (let i = 0; i < spokes; i++) angles.push((i / spokes) * Math.PI * 2 + (Math.random() - 0.5) * 0.12);
    c.strokeStyle = 'rgba(255,255,255,0.8)';
    c.lineWidth = 1.7;
    for (const a of angles) {
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * 28, cy + Math.sin(a) * 28);
      c.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      c.stroke();
    }
    c.strokeStyle = 'rgba(255,255,255,0.55)';
    c.lineWidth = 1.1;
    for (let r = 44; r < R - 6; r += 10 + Math.random() * 7) {
      c.beginPath();
      c.moveTo(cx + Math.cos(angles[0]) * r, cy + Math.sin(angles[0]) * r);
      for (let i = 0; i < spokes; i++) {
        const a0 = angles[i], a1 = angles[(i + 1) % spokes] + (i + 1 >= spokes ? Math.PI * 2 : 0);
        const am = (a0 + a1) / 2, sag = r * 0.93;
        c.quadraticCurveTo(cx + Math.cos(am) * sag, cy + Math.sin(am) * sag, cx + Math.cos(a1) * r, cy + Math.sin(a1) * r);
      }
      c.stroke();
    }
    c.strokeStyle = 'rgba(255,255,255,0.3)';
    c.lineWidth = 1;
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * Math.PI * 2, r1 = 30 + Math.random() * 90, a2 = a + (Math.random() - 0.5) * 1.2, r2 = 30 + Math.random() * 110;
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      c.lineTo(cx + Math.cos(a2) * r2, cy + Math.sin(a2) * r2);
      c.stroke();
    }
  });
  return WEB_TEX;
}

function funnelTexture() {
  FUNNEL_TEX ??= canvasTexture(256, 128, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,255,255,0.18)');
    g.addColorStop(1, 'rgba(255,255,255,0.7)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(255,255,255,0.6)';
    c.lineWidth = 1.2;
    for (let i = 0; i < 48; i++) {
      const x = Math.random() * w;
      c.beginPath();
      c.moveTo(x, 0);
      c.quadraticCurveTo(x + (Math.random() - 0.5) * 20, h / 2, x + (Math.random() - 0.5) * 10, h);
      c.stroke();
    }
  });
  return FUNNEL_TEX;
}

function holeTexture() {
  HOLE_TEX ??= canvasTexture(128, 128, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(4,2,1,1)');
    g.addColorStop(0.55, 'rgba(18,10,6,0.95)');
    g.addColorStop(0.85, 'rgba(40,25,15,0.45)');
    g.addColorStop(1, 'rgba(40,25,15,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  });
  return HOLE_TEX;
}

function geos() {
  if (BODY) return;
  const body = [
    part(G.sphere(1, 14, 10), BLACK, [0, 0.34, 0.12], [0, 0, 0], [0.26, 0.16, 0.3]),
    part(G.sphere(1, 14, 10), 0x241c20, [0, 0.4, -0.38], [0.2, 0, 0], [0.3, 0.25, 0.36]),
    part(G.sphere(1, 10, 8), SHINE, [0, 0.47, -0.32], [0.2, 0, 0], [0.16, 0.08, 0.2]),
  ];
  for (let i = 0; i < 6; i++) body.push(part(G.sphere(0.022, 6, 5), 0x66ccff, [(i % 3 - 1) * 0.05, 0.47 + Math.floor(i / 3) * 0.02, 0.3 - Math.floor(i / 3) * 0.02]));
  for (const s of [-1, 1]) {
    body.push(part(G.sphere(0.055, 8, 6), 0xfff4d6, [s * 0.09, 0.45, 0.33]));
    body.push(part(G.sphere(0.032, 6, 5), 0xc0172b, [s * 0.1, 0.45, 0.375]));
    body.push(part(G.box(0.1, 0.022, 0.03), 0x000000, [s * 0.09, 0.51, 0.34], [0, 0, s * -0.45]));
  }
  BODY = merge(body);
  const f = [];
  for (const s of [-1, 1]) {
    f.push(part(G.sphere(1, 10, 8), BLACK, [s * 0.07, -0.02, 0.06], [0.3, 0, 0], [0.07, 0.1, 0.09]));
    f.push(limb([s * 0.07, -0.08, 0.1], [s * 0.06, -0.2, 0.16], 0.022, 0.006, 0xd9d4c7, 6));
  }
  FANGS = merge(f);
  LEG = merge([
    limb([0, 0, 0], [0.42, 0.28, 0], 0.05, 0.04, BLACK, 6),
    part(G.sphere(0.045, 6, 5), SHINE, [0.42, 0.28, 0]),
    limb([0.42, 0.28, 0], [0.82, -0.32, 0], 0.04, 0.022, BLACK, 6),
  ]);
}

export class Spider extends Foe {
  constructor(game, x, z) {
    super(game, DEF, x, z);
    geos();
    const root = new THREE.Group();
    const bodyPivot = new THREE.Group();
    root.add(bodyPivot);
    bodyPivot.add(vcMesh(BODY));
    this.fangs = vcMesh(FANGS);
    this.fangs.position.set(0, 0.36, 0.38);
    bodyPivot.add(this.fangs);
    this.legs = [];
    const zs = [0.22, 0.08, -0.06, -0.2], yaws = [-0.75, -0.2, 0.3, 0.8];
    for (const side of [1, -1]) {
      for (let i = 0; i < 4; i++) {
        const g = new THREE.Group();
        g.position.set(side * 0.2, 0.32, zs[i]);
        g.scale.x = side;
        const m = vcMesh(LEG);
        g.add(m);
        g.userData = { side, i, yaw: yaws[i] * side, ph: (i % 2 === 0) === (side > 0) ? 0 : Math.PI };
        bodyPivot.add(g);
        this.legs.push(g);
      }
    }
    root.scale.setScalar(DEF.scale);
    this.setRig({ root, bodyPivot });

    this.buildWeb();
    this.state = 'hide';
    this.hideK = 1;
    this.outT = 0;
    this.speedNow = 0;
    this.phase = 0;
    this.heading = rand(0, TAU);
  }

  buildWeb() {
    const R = DEF.webR, hx = this.home.x, hz = this.home.z, w = this.game.world;
    const g = new THREE.Group();
    const baseY = w.groundHeight(hx, hz);
    g.position.set(hx, baseY, hz);

    // silk sheet: a ground-hugging grid wearing a hand-drawn web (trip lines, sagging spiral, sheen)
    const sheet = new THREE.PlaneGeometry(R * 2.2, R * 2.2, 28, 28).rotateX(-Math.PI / 2);
    const pos = sheet.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, w.groundHeight(hx + pos.getX(i), hz + pos.getZ(i)) - baseY + 0.05);
    g.add(new THREE.Mesh(sheet, new THREE.MeshBasicMaterial({
      map: webTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    })));

    // the funnel: a flared silk tube dropping into a dark burrow
    const prof = [[0.34, 0.0], [0.42, 0.1], [0.62, 0.24], [0.95, 0.34], [1.35, 0.32], [1.7, 0.18], [1.95, 0.04]]
      .map(([r, y]) => new THREE.Vector2(r, y));
    g.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 32), new THREE.MeshBasicMaterial({
      map: funnelTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide,
    })));
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.62, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: holeTexture(), transparent: true, depthWrite: false }));
    hole.position.y = 0.07;
    g.add(hole);
    const clods = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + rand(-0.2, 0.2), r = rand(1.9, 2.2);
      clods.push(part(G.dodec(rand(0.07, 0.13)), pick([0x5b3b22, 0x6e4a2b, 0x4a3321]), [Math.cos(a) * r, 0.04, Math.sin(a) * r], [rand(0, 3), rand(0, 3), 0]));
    }
    g.add(vcMesh(merge(clods), { cast: false, receive: true }));

    // dew drops that twinkle on the threads
    this.dew = [];
    const dewMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const dewGeo = new THREE.OctahedronGeometry(0.035, 0);
    for (let i = 0; i < 16; i++) {
      const a = rand(0, TAU), r = rand(2.1, R * 0.95), x = Math.cos(a) * r, z = Math.sin(a) * r;
      const m = new THREE.Mesh(dewGeo, dewMat);
      m.position.set(x, w.groundHeight(hx + x, hz + z) - baseY + 0.09, z);
      m.userData.ph = rand(0, TAU);
      g.add(m);
      this.dew.push(m);
    }
    this.game.scene.add(g);
    this.web = g;
  }

  get targetable() { return this.alive && this.state !== 'hide' && this.state !== 'emerge'; }
  get invulnerable() { return !this.targetable; }
  get solid() { return this.targetable; }

  /** sticky silk slows anything walking over it */
  slowAt(p) {
    if (!this.alive) return 1;
    return Math.hypot(p.x - this.home.x, p.z - this.home.z) < DEF.webR ? 0.45 : 1;
  }

  hits(p) {
    if (!this.targetable) return false;
    this.bodyCenter(_v);
    const dx = p.x - _v.x, dz = p.z - _v.z;
    return dx * dx + dz * dz < (0.5 * this.s + 0.15) ** 2 && Math.abs(p.y - _v.y) < 0.35 * this.s + 0.2;
  }

  hitFx(p) { this.game.fx.burst(p, { n: 3, colors: [0x17161c, 0x2c2a36], speed: [1, 2], up: [1, 2.5], size: [0.03, 0.06] }); }

  onDamage() {
    if (this.hp < this.def.hp * 0.35 && !this.enraged) {
      this.enraged = true;
      this.game.hud.toast('The funnel-web is enraged!', 2);
      this.game.audio.chitter(true);
    }
  }

  onDeath() { this.game.audio.chitter(true); }

  // (a turkey tearing at the web across the way: out it comes, as if it had stepped on a trip line)
  alert(t) {
    if (!this.alive || this.state !== 'hide' || !t.grounded) return;
    this.target = t;
    this.state = 'emerge';
    this.t = 0;
    this.game.audio.chitter();
  }

  /* ---------------------------------------------------------------- AI */
  think(dt) {
    const g = this.game, d = this.def;
    const speed = this.enraged ? 6 : 4.8;
    switch (this.state) {
      case 'hide': {
        this.hp = Math.min(d.hp, this.hp + dt * 1.2);
        const tg = this.findTarget(d.webR, this.home);
        if (tg) { this.target = tg; this.state = 'emerge'; this.t = 0; g.audio.chitter(); }
        break;
      }
      case 'emerge':
        if (this.t >= 0.35) { this.state = 'rush'; this.t = 0; this.outT = 0; this.engaged = true; }
        break;
      case 'rush': {
        this.outT += dt;
        if (this.wantsShake()) { this.state = 'buck'; this.t = 0; break; }
        const tg = this.target;
        const far = Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z) > d.leash;
        if (!tg || tg.dead || !tg.grounded || far || (this.outT > 8 && !this.enraged) || !this.sees(tg)) {
          this.target = this.findTarget(d.webR + 2, this.home);
          if (!this.target || far || (this.outT > 8 && !this.enraged)) { this.state = 'retreat'; this.t = 0; }
          break;
        }
        const dist = this.walk(tg.pos.x, tg.pos.z, speed, dt, d.reach * 0.8, 8);
        if (dist < d.reach && this.cool <= 0) { this.state = 'rear'; this.t = 0; g.audio.chitter(); }
        break;
      }
      case 'rear': {
        this.speedNow = damp(this.speedNow, 0, 12, dt);
        const tg = this.target;
        if (tg && !tg.dead) this.heading = dampAngle(this.heading, Math.atan2(tg.pos.x - this.pos.x, tg.pos.z - this.pos.z), 6, dt);
        if (Math.random() < dt * 8) g.fx.burst(this.fangs.getWorldPosition(_v), { glow: true, n: 1, colors: [0x9dff5c], speed: [0, 0.2], up: [0, 0.2], grav: 6, size: [0.03, 0.05], life: [0.4, 0.6] });
        if (this.t >= (this.enraged ? 0.45 : 0.65)) { this.state = 'bite'; this.t = 0; this.struck = false; }
        break;
      }
      case 'bite': {
        const k = Math.min(1, this.t / 0.15);
        if (!this.struck) {
          this.pos.x += Math.sin(this.heading) * 5 * dt;
          this.pos.z += Math.cos(this.heading) * 5 * dt;
        }
        if (k >= 1 && !this.struck) {
          this.struck = true;
          const p = this.forward(_v).multiplyScalar(0.6 * this.s).add(this.pos);
          this.killNear(p, d.biteR, d.kills, 'bite');
          this.hurtPlayer(p, d.biteR, d.bite, { knock: 4, stun: 0.4 });
          g.fx.dust(p, 4);
        }
        if (this.t >= 0.6) { this.state = 'rush'; this.cool = this.enraged ? 0.7 : 1.2; this.t = 0; }
        break;
      }
      case 'buck':
        this.speedNow = 0;
        if (this.t >= 0.3 && this.latched.length) { this.shakeOff(); g.audio.chitter(); }
        if (this.t >= 0.7) { this.state = 'rush'; this.t = 0; }
        break;
      case 'retreat':
        if (this.wantsShake()) { this.state = 'buck'; this.t = 0; break; }
        if (this.walk(this.home.x, this.home.z, speed, dt, 0.2, 8) < 0.35) {
          this.state = 'hide';
          this.t = 0;
          this.engaged = false;
          for (const t of [...this.latched]) t.flingFrom(this);
          this.latched.length = 0;
        }
        break;
    }
  }

  /* ---------------------------------------------------------------- animation */
  pose(dt) {
    const r = this.rig, s = this.s;
    const hidden = this.alive && this.state === 'hide';
    const emerging = this.alive && this.state === 'emerge';
    this.hideK = damp(this.hideK, hidden ? 1 : emerging ? 0.4 : 0, 10, dt);
    this.phase += dt * (3 + (this.speedNow ?? 0) * 3.5);
    const k = Math.min(1, (this.speedNow ?? 0) / 3);

    let pitch = 0, fang = 0, frontLift = 0, rollZ = 0;
    if (this.state === 'rear') { const a = Math.min(1, this.t / 0.3); pitch = -0.55 * a; fang = -0.6 * a; frontLift = 0.9 * a; }
    else if (this.state === 'bite') { const a = 1 - Math.min(1, this.t / 0.2); pitch = -0.55 * a + 0.15; fang = 0.4; }
    else if (this.state === 'buck') { rollZ = Math.sin(this.t * 35) * 0.3; pitch = -0.4 * Math.sin(Math.min(1, this.t / 0.7) * Math.PI); }
    if (this.flinch > 0) rollZ += Math.sin(this.t * 50) * 0.06 * this.flinch;

    r.bodyPivot.rotation.set(pitch, 0, rollZ);
    r.bodyPivot.position.y = Math.abs(Math.sin(this.phase * 2)) * 0.02 * k;
    this.fangs.rotation.x = fang;
    for (const g of this.legs) {
      const u = g.userData;
      const sw = Math.sin(this.phase + u.ph) * 0.35 * k;
      const lift = Math.max(0, Math.cos(this.phase + u.ph)) * 0.35 * k;
      g.rotation.set(0, u.yaw + sw * u.side, (lift + (u.i === 0 ? frontLift : 0)) * u.side);
      if (!this.alive) g.rotation.set(0, u.yaw * 0.5, -0.5 * u.side); // legs curled up in the air
    }

    if (this.dew) for (const d of this.dew) d.scale.setScalar(this.alive ? 0.4 + Math.max(0, Math.sin(this.game.time * 2.2 + d.userData.ph)) * 0.9 : 0.4);
    const y = this.pos.y - this.hideK * 0.42 * s;
    if (!this.alive) {
      const flip = Math.PI * (this.state === 'dying' ? this.roll : 1);
      r.root.rotation.set(0, this.heading, flip);
      r.root.position.set(this.pos.x, this.pos.y + Math.sin(flip / 2) * 0.55 * s, this.pos.z);
    } else {
      r.root.rotation.set(0, this.heading, 0);
      r.root.position.set(this.pos.x, y, this.pos.z);
    }
  }

  dispose() {
    super.dispose();
    this.game.scene.remove(this.web);
  }
}
