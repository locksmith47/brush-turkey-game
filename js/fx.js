import * as THREE from 'three';
import { toonMat, rand, pick, TAU } from './util.js';

/* A pool of instanced little chunks: dirt clods, dust, steam, sparkles, feathers. */
class Pool {
  constructor(scene, material, max, geo) {
    this.max = max;
    this.mesh = new THREE.InstancedMesh(geo, material, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    scene.add(this.mesh);
    this.items = [];
    this.free = [];
    for (let i = 0; i < max; i++) {
      this.free.push({
        pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(),
        color: new THREE.Color(), life: 0, max: 1, size: 0.1, grav: 10, drag: 0, grow: 0, flat: 1,
      });
    }
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
  }

  spawn() {
    if (!this.free.length) return null;
    const p = this.free.pop();
    this.items.push(p);
    return p;
  }

  update(dt, groundHeight) {
    const { _m, _q, _s } = this;
    let k = 0;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.life += dt;
      if (p.life >= p.max) {
        this.items[i] = this.items[this.items.length - 1];
        this.items.pop();
        this.free.push(p);
        continue;
      }
      p.vel.y -= p.grav * dt;
      const d = Math.exp(-p.drag * dt);
      p.vel.multiplyScalar(d);
      p.pos.addScaledVector(p.vel, dt);
      const gy = groundHeight(p.pos.x, p.pos.z) + p.size * 0.5;
      if (p.pos.y < gy && p.grav > 0) {
        p.pos.y = gy;
        p.vel.y *= -0.3;
        p.vel.x *= 0.6; p.vel.z *= 0.6;
      }
      p.rot.x += p.spin.x * dt; p.rot.y += p.spin.y * dt; p.rot.z += p.spin.z * dt;
      const t = p.life / p.max;
      let s = p.size * (1 + p.grow * t);
      if (t > 0.7) s *= (1 - t) / 0.3;
      _q.setFromEuler(p.rot);
      _s.set(s, s * p.flat, s);
      _m.compose(p.pos, _q, _s);
      this.mesh.setMatrixAt(k, _m);
      this.mesh.setColorAt(k, p.color);
      k++;
    }
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

/* Rings spreading across the water. Additive, so fading a ring out is just dimming its colour. */
class Ripples {
  constructor(scene, max) {
    this.max = max;
    const geo = new THREE.RingGeometry(0.84, 1, 36, 1).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3; // after the (transparent) water
    this.mesh.count = 0;
    this.mesh.setColorAt(0, new THREE.Color());
    scene.add(this.mesh);
    this.items = [];
    this._m = new THREE.Matrix4();
    this._c = new THREE.Color();
  }

  spawn(x, y, z, r0, r1, life, a) {
    if (this.items.length >= this.max) return;
    this.items.push({ x, y, z, r0, r1, t: 0, life, a });
  }

  update(dt) {
    const m = this._m, c = this._c, e = m.elements;
    let k = 0;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const r = this.items[i];
      r.t += dt;
      if (r.t >= r.life) {
        this.items[i] = this.items[this.items.length - 1];
        this.items.pop();
        continue;
      }
      const u = r.t / r.life;
      const s = r.r0 + (r.r1 - r.r0) * (1 - (1 - u) * (1 - u));
      m.makeScale(s, 1, s);
      e[12] = r.x; e[13] = r.y + 0.015; e[14] = r.z;
      this.mesh.setMatrixAt(k, m);
      const b = r.a * Math.min(1, u * 8) * (1 - u) ** 1.5;
      this.mesh.setColorAt(k, c.setRGB(b, b, b));
      k++;
    }
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}

/*
 * A red warning circle on the ground: the ring marks where an attack will land, and the disc inside
 * fills in as the attacker winds up. When it reaches the ring... get out of the way.
 */
let WARN_RING = null, WARN_DISC = null;
export class WarnCircle {
  constructor(scene) {
    WARN_RING ??= new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2);
    WARN_DISC ??= new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2);
    const red = { color: 0xff3b2f, transparent: true, depthWrite: false };
    this.ring = new THREE.Mesh(WARN_RING, new THREE.MeshBasicMaterial({ ...red, opacity: 0.75, side: THREE.DoubleSide }));
    this.fill = new THREE.Mesh(WARN_DISC, new THREE.MeshBasicMaterial({ ...red, opacity: 0.38 }));
    this.ring.add(this.fill);
    this.ring.visible = false;
    this.scene = scene;
    scene.add(this.ring);
  }

  /** at ground point p, radius r, wound up k (0..1) */
  show(p, r, k, time) {
    this.ring.visible = true;
    this.ring.position.set(p.x, p.y + 0.07, p.z);
    this.ring.scale.set(r, 1, r);
    const f = Math.max(0.001, Math.min(1, k));
    this.fill.scale.set(f, 1, f);
    this.ring.material.opacity = 0.6 + Math.sin(time * 18) * 0.25;
  }

  hide() { this.ring.visible = false; }
  dispose() { this.scene.remove(this.ring); }
}

export class FX {
  constructor(game) {
    this.game = game;
    const scene = game.scene;
    this.solid = new Pool(scene, toonMat({}), 900, new THREE.IcosahedronGeometry(1, 0));
    this.glow = new Pool(scene, new THREE.MeshBasicMaterial({ fog: false }), 400, new THREE.OctahedronGeometry(1, 0));
    this.ripples = new Ripples(scene, 260);
    this.rings = [];
    this.flung = []; // things knocked flying (a helmet off a turkey's head), tumbling to a stop
    const ringGeo = new THREE.TorusGeometry(1, 0.06, 6, 36);
    ringGeo.rotateX(Math.PI / 2);
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
      m.visible = false;
      scene.add(m);
      this.rings.push({ m, life: 0, max: 1, r: 1 });
    }
  }

  burst(pos, o = {}) {
    const pool = o.glow ? this.glow : this.solid;
    const n = o.n ?? 10;
    const colors = o.colors ?? [0x8b5a2b];
    for (let i = 0; i < n; i++) {
      const p = pool.spawn();
      if (!p) return;
      const a = rand(0, TAU), sp = rand(...(o.speed ?? [1.5, 4]));
      p.pos.copy(pos);
      if (o.jitter) p.pos.add(new THREE.Vector3(rand(-o.jitter, o.jitter), rand(0, o.jitter), rand(-o.jitter, o.jitter)));
      if (o.dir) p.vel.set(o.dir.x * sp + rand(-0.5, 0.5), rand(...(o.up ?? [2, 5])), o.dir.z * sp + rand(-0.5, 0.5)); // sprayed one way
      else p.vel.set(Math.cos(a) * sp, rand(...(o.up ?? [2, 5])), Math.sin(a) * sp);
      p.rot.set(rand(0, TAU), rand(0, TAU), rand(0, TAU));
      p.spin.set(rand(-8, 8), rand(-8, 8), rand(-8, 8));
      p.color.set(pick(colors));
      p.life = 0;
      p.max = rand(...(o.life ?? [0.5, 1.0]));
      p.size = rand(...(o.size ?? [0.05, 0.12]));
      p.grav = o.grav ?? 12;
      p.drag = o.drag ?? 0.5;
      p.grow = o.grow ?? 0;
      p.flat = o.flat ?? 1;
    }
  }

  dirt(pos, n = 12, power = 1) {
    this.burst(pos, { n, colors: [0x7a5230, 0x8b6238, 0x5e3e22, 0x9c7a4f], speed: [1 * power, 3.5 * power], up: [2.5 * power, 6 * power], size: [0.05, 0.12], life: [0.6, 1.1] });
  }

  dust(pos, n = 6) {
    this.burst(pos, { n, colors: [0xcbb88f, 0xd8c9a3, 0xb9a57c], speed: [0.6, 1.6], up: [0.3, 1.0], grav: 0, drag: 2.5, size: [0.1, 0.18], grow: 1.2, life: [0.4, 0.8] });
  }

  sparkle(pos, n = 14, colors = [0xffe066, 0xffffff, 0xfff3b0]) {
    this.burst(pos, { glow: true, n, colors, speed: [1, 3], up: [1.5, 4], grav: 3, drag: 1.5, size: [0.04, 0.09], life: [0.5, 1.0] });
  }

  steam(pos) {
    this.burst(pos, { n: 1, colors: [0xf4f1ea, 0xe6e2d8], speed: [0.05, 0.3], up: [0.5, 0.9], grav: -0.15, drag: 0.4, size: [0.12, 0.2], grow: 2.2, life: [1.8, 2.8], jitter: 0.6 });
  }

  feathers(pos, colors, n = 5) {
    this.burst(pos, { n, colors, speed: [0.8, 2], up: [1, 3], grav: 1.5, drag: 2.0, size: [0.06, 0.1], flat: 0.25, life: [0.8, 1.4] });
  }

  leafBits(pos, n = 5) {
    this.burst(pos, { n, colors: [0x9b6b3a, 0xb8834a, 0xc49a5a, 0x8e8a4b], speed: [0.8, 2.2], up: [1.5, 3], grav: 5, drag: 1.2, size: [0.06, 0.1], flat: 0.2, life: [0.5, 0.9] });
  }

  warnCircle() { return new WarnCircle(this.game.scene); }

  /** knock obj (a mesh, still where it was) flying off at vel, spinning: it bounces, tumbles to a stop and shrinks away */
  fling(obj, vel, spin, life = 1.6) {
    this.game.scene.attach(obj);
    this.flung.push({ obj, vel: vel.clone(), spin: spin.clone(), t: 0, life, scale: obj.scale.x });
  }

  /** a ring spreading out across the water at surface height y */
  ripple(x, y, z, r1 = 1, life = 1, a = 0.35, r0 = r1 * 0.2) {
    this.ripples.spawn(x, y, z, r0, r1, life, a);
  }

  /** a splash: droplets flying up and a couple of rings */
  splash(x, y, z, size = 1) {
    this.burst(new THREE.Vector3(x, y, z), { glow: true, n: Math.round(6 * size), colors: [0xffffff, 0xbfefff, 0xdff6ff], speed: [0.6, 1.6 * size], up: [1.5, 3.2], grav: 9, size: [0.04, 0.07], life: [0.4, 0.8] });
    this.ripple(x, y, z, 1.3 * size, 0.9, 0.5);
    this.ripple(x, y, z, 2.2 * size, 1.4, 0.3, 0.5 * size);
  }

  ring(pos, color = 0xffffff, r = 1.5, life = 0.45) {
    const ring = this.rings.find((x) => !x.m.visible);
    if (!ring) return;
    ring.m.visible = true;
    ring.m.position.copy(pos);
    ring.m.position.y += 0.08;
    ring.m.material.color.set(color);
    ring.life = 0; ring.max = life; ring.r = r;
  }

  update(dt) {
    const gh = (x, z) => this.game.world.groundHeight(x, z);
    this.solid.update(dt, gh);
    this.glow.update(dt, gh);
    this.ripples.update(dt);
    for (let i = this.flung.length - 1; i >= 0; i--) {
      const f = this.flung[i], o = f.obj;
      f.t += dt;
      f.vel.y -= 11 * dt;
      o.position.addScaledVector(f.vel, dt);
      const gy = gh(o.position.x, o.position.z) + 0.04;
      if (o.position.y < gy) {
        o.position.y = gy;
        f.vel.set(f.vel.x * 0.55, Math.abs(f.vel.y) * 0.3, f.vel.z * 0.55);
        f.spin.multiplyScalar(0.55);
      }
      o.rotation.x += f.spin.x * dt; o.rotation.y += f.spin.y * dt; o.rotation.z += f.spin.z * dt;
      o.scale.setScalar(f.scale * Math.min(1, (f.life - f.t) / 0.35));
      if (f.t >= f.life) { this.game.scene.remove(o); this.flung.splice(i, 1); }
    }
    for (const r of this.rings) {
      if (!r.m.visible) continue;
      r.life += dt;
      const t = r.life / r.max;
      if (t >= 1) { r.m.visible = false; continue; }
      const s = r.r * (0.3 + 0.7 * Math.sqrt(t));
      r.m.scale.set(s, 1, s);
      r.m.material.opacity = 1 - t;
    }
  }
}
