import * as THREE from 'three';
import { part, merge, G, clamp, smoothstep } from './util.js';
import { towerParts, dishRig, DISH_AT, TOWER_AT } from './props/blues.js';
import { BLUES, MILSONS, LUNA } from './world.js';

/*
 * The Emperor's signal, and the Tower it comes from, seen from everywhere. Once his dish is on (see Opening), every few
 * seconds out goes a pulse: purple rings off the dish, and a shimmer across the land, sweeping out over the lot.
 *
 * Over at Blues Point, Milsons Point and Luna Park it's the real thing you see (see blues.js). Everywhere else, the
 * Tower's a long way off, on the horizon, and it's drawn as it would be from out there: hazy, the same way off however
 * far you walk (like the moon), a little round ahead of the way the camera looks down the way on (it swings round with
 * it, at the corner onto the beach), so you can always find it. Zoom right in and look up, and there it is.
 */
export const PULSE = 3.2; // seconds between pulses
const FAR = 400; // m: how far off the Tower looks, from anywhere it's not to be seen for real
const SIZE = 0.62; // (and how big it's drawn out there, against life size, so it reads)
const BEARING = 0.42; // radians: how far round to the right of the way on it stands
const RING = { life: 2.6, r: [3, 70], tube: 0.045 }; // a ring off the dish: how long it lasts, how big it starts and ends up (life size), and how thick (against how big)
const WAVE = { speed: 75, h: 9, past: 70 }; // the shimmer across the land: m/s, how high, and how far past you it goes before it's gone
const PURPLE = new THREE.Color(0xb24dff);
const HAZE = new THREE.Color(0xd2e8f2), HAZE_K = 0.5; // (the sky at the horizon, and how much of it's between you and the Tower)
const _v = new THREE.Vector3();

/** the far Tower: the lot, merged, its colours already hazed (no fog: it's well past it), shaded by which way each face looks */
function farGeo() {
  const p = [];
  towerParts(p, 0, 0, 0, false);
  // (the headland it stands on, going down into the harbour)
  p.push(part(G.sphere(1, 20, 8), 0x5f7f4a, [0, -6, 0], [0, 0, 0], [70, 8.5, 55]));
  const g = merge(p), n = g.attributes.normal, c = g.attributes.color, col = new THREE.Color(), sun = new THREE.Vector3(0.5, 0.7, 0.5).normalize();
  for (let i = 0; i < c.count; i++) {
    const lit = 0.68 + 0.32 * Math.max(0, n.getX(i) * sun.x + n.getY(i) * sun.y + n.getZ(i) * sun.z);
    col.setRGB(c.getX(i), c.getY(i), c.getZ(i)).multiplyScalar(lit).lerp(HAZE, HAZE_K);
    c.setXYZ(i, col.r, col.g, col.b);
  }
  return g;
}

/** a shimmer wall's look: brightest at its foot, fading up it, and fading out away from you (so the far side of it's never seen) */
function waveMat() {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: PURPLE.clone() }, opacity: { value: 0 }, you: { value: new THREE.Vector3() } },
    vertexShader: `varying float vY; varying vec3 vW;
      void main() { vY = position.y; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 color; uniform float opacity; uniform vec3 you; varying float vY; varying vec3 vW;
      void main() {
        float up = (1.0 - vY) * smoothstep(0.0, 0.12, vY);
        float near = 1.0 - smoothstep(30.0, 85.0, distance(vW.xz, you.xz));
        gl_FragColor = vec4(color * up * near * opacity, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  });
}

export class Beacon {
  constructor(game) {
    this.game = game;
    this.t = 0; // (time into the pulse)
    this.pulses = 0; // (how many have gone out: see Opening)
    // the far Tower, with its dish (which sweeps round, like the real one)
    this.far = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, transparent: true });
    this.far.add(new THREE.Mesh(farGeo(), mat));
    const d = dishRig();
    d.root.position.y = TOWER_AT.top + 0.2;
    d.root.traverse((o) => { if (o.isMesh) o.material = o.material.isMeshBasicMaterial ? o.material : mat; });
    d.face.material = d.face.material.clone();
    d.face.material.fog = false;
    d.tip.material.fog = false;
    this.far.add(d.root);
    this.farDish = d;
    this.far.scale.setScalar(SIZE);
    this.far.visible = false;
    this.farMat = mat;
    game.scene.add(this.far);
    this.bearing = null;
    // rings off the dish (each its own material, to fade on its own), and the shimmers across the land
    const ringGeo = new THREE.TorusGeometry(1, RING.tube, 5, 64).rotateX(Math.PI / 2);
    this.rings = Array.from({ length: 8 }, () => {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: PURPLE, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      m.visible = false;
      m.frustumCulled = false;
      game.scene.add(m);
      return { m, t: 0, s: 1, on: false };
    });
    const wallGeo = new THREE.CylinderGeometry(1, 1, 1, 160, 1, true).translate(0, 0.5, 0);
    this.waves = Array.from({ length: 4 }, () => {
      const m = new THREE.Mesh(wallGeo, waveMat());
      m.visible = false;
      m.frustumCulled = false;
      game.scene.add(m);
      return { m, r: 0, on: false, cx: 0, cz: 0 };
    });
  }

  /** is the signal going out? (from the moment the Emperor switches his dish on: see Opening) */
  get on() { return this.game.world.blues.power > 0.5; }

  /** which way the far Tower lies: a little round to the right of the way on (`yaw`: which way the camera's leg looks, see World.setSunYaw) */
  dirAt(yaw, out) {
    const a = yaw - BEARING;
    return out.set(-Math.sin(a), 0, -Math.cos(a));
  }

  update(dt) {
    const g = this.game, p = g.player.pos, zone = g.world.zoneOf(p.x, p.z), real = zone === BLUES || zone === MILSONS || zone === LUNA;
    // the far Tower, out on the horizon (not where the real one's to be seen, or in a storm, or with the map up)
    const storm = g.storm?.k ?? 0, show = !real && !g.travel.frozen;
    this.far.visible = show && storm < 0.95;
    this.farMat.opacity = 1 - storm;
    this.dirAt(g.world.sunYaw, _v);
    this.far.position.set(p.x + _v.x * FAR, -4, p.z + _v.z * FAR);
    const bp = g.world.blues;
    this.farDish.yaw.rotation.y = bp.sweep;
    this.farDish.tilt.rotation.x = bp.dish.tilt.rotation.x;
    this.farDish.face.material.color.copy(bp.dish.face.material.color);
    this.farDish.tip.material.color.copy(bp.dish.tip.material.color);
    this.farDish.tip.scale.copy(bp.dish.tip.scale);

    // the pulse: out it goes, off the dish (the real one, and the far one if that's the one in sight), and over the land
    if (this.on) {
      this.t += dt;
      if (this.t >= PULSE) {
        this.t -= PULSE;
        this.ring(DISH_AT, 1);
        if (show) this.ring(_v.set(0, (TOWER_AT.top + 6.4) * SIZE, 0).add(this.far.position), SIZE);
        const c = real ? TOWER_AT : this.far.position;
        this.wave(c.x, c.z);
        this.pulses++;
      }
    } else this.t = PULSE * 0.9; // (the first's straight away)
    for (const r of this.rings) {
      if (!r.on) continue;
      r.t += dt;
      const k = r.t / RING.life;
      if (k >= 1) { r.on = r.m.visible = false; continue; }
      const rad = (RING.r[0] + (RING.r[1] - RING.r[0]) * (1 - (1 - k) ** 2)) * r.s;
      r.m.scale.setScalar(rad);
      r.m.material.opacity = 0.9 * (1 - smoothstep(0.35, 1, k)) * (r.real ? 1 : 1 - storm);
    }
    for (const w of this.waves) {
      if (!w.on) continue;
      w.r += WAVE.speed * dt;
      const d = Math.hypot(p.x - w.cx, p.z - w.cz);
      if (w.r > d + WAVE.past) { w.on = w.m.visible = false; continue; }
      w.m.scale.set(w.r, WAVE.h, w.r);
      w.m.position.set(w.cx, p.y - 2.5, w.cz);
      const u = w.m.material.uniforms;
      u.you.value.copy(p);
      u.opacity.value = 0.42 * clamp(w.r / 30, 0, 1) * (1 - smoothstep(d, d + WAVE.past, w.r)) * (1 - storm);
    }
  }

  /** a ring off a dish at `at`, `s` times life size */
  ring(at, s) {
    const r = this.rings.find((x) => !x.on);
    if (!r) return;
    Object.assign(r, { on: true, t: 0, s, real: s === 1 });
    r.m.position.copy(at);
    r.m.visible = true;
  }

  /** a shimmer, out across the land from the foot of the Tower at (x, z) */
  wave(x, z) {
    const w = this.waves.find((x2) => !x2.on);
    if (!w) return;
    Object.assign(w, { on: true, r: 0, cx: x, cz: z });
    w.m.visible = true;
  }
}

