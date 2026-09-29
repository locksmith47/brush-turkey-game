import * as THREE from 'three';
import { canvasTexture, clamp, TAU } from './util.js';

/*
 * Footprints in the sand at Bondi: your boots, and the flock's three-toed prints trailing after you, pressed in
 * as each foot comes down, and fading as the sand settles back. They're printed into the sand (darkening it,
 * the way a hollow in it would), not stuck on top, so they sit right in it, shadows and all.
 */
const LIFE = 16; // seconds a print lasts
const FRESH = 0.4; // (for the first part of that it's as fresh as it was, then it fades)
const MAX_BOOTS = 200, MAX_BIRDS = 3000; // prints at a time (with more than that coming, they all fade sooner)
const BOOT = [0.16, 0.38]; // metres: a boot print, wide by long (big boots: you can see them from up here)
const BOOT_SIDE = 0.11; // metres from the middle of you out to each foot
const BIRD = 0.22; // metres across a full-grown turkey's print (the chicks' are smaller)
const BIRD_SIDE = 0.07; // metres from the middle of a full-grown turkey out to each foot
const MOVING = 0.3; // m/s: slower than that, you're standing about, not walking
const ROCKS = -377; // z: north of here the beach turns to rock
// how much a print darkens the sand (fractions of red, green and blue: the blue most, so it looks a bit damp)
const DEPTH = new THREE.Color().setRGB(0.3, 0.34, 0.42, THREE.SRGBColorSpace);

const UP = new THREE.Vector3(0, 1, 0), PLANE = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2); // (the top of the picture: -z)
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _t = new THREE.Quaternion();
const _p = new THREE.Vector3(), _n = new THREE.Vector3(), _s = new THREE.Vector3();

/** a boot print, toe up: a right boot (its arch on the left), with the tread across it */
function bootTex() {
  return canvasTexture(64, 128, (c, w, h) => {
    c.fillStyle = '#000';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#fff';
    c.beginPath();
    c.moveTo(30, 4);
    c.bezierCurveTo(52, 4, 60, 26, 58, 50); // (round the toe, and down the outside)
    c.bezierCurveTo(56, 72, 50, 84, 48, 100);
    c.bezierCurveTo(48, 118, 40, 125, 31, 125); // (round the heel)
    c.bezierCurveTo(20, 125, 14, 116, 15, 102);
    c.bezierCurveTo(16, 88, 22, 78, 16, 62); // (and in at the arch)
    c.bezierCurveTo(6, 44, 6, 6, 30, 4);
    c.fill();
    // (the tread: rows of lugs, and the arch pressed in less than the rest)
    c.fillStyle = '#000';
    for (let y = 14; y < 64; y += 9) c.fillRect(8, y, 52, 3.5);
    for (let y = 96; y < 122; y += 8) c.fillRect(12, y, 40, 3);
    c.fillStyle = 'rgba(0, 0, 0, 0.45)';
    c.fillRect(8, 70, 52, 20);
  });
}

/** a turkey's print, toes up: three long toes forward, and one back (big feet, for scratching up mounds) */
function birdTex() {
  return canvasTexture(64, 64, (c, w, h) => {
    c.fillStyle = '#000';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = c.fillStyle = '#fff';
    c.lineCap = 'round';
    c.lineWidth = 6;
    const x = 32, y = 40;
    for (const a of [-0.55, 0, 0.55]) {
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + Math.sin(a) * 25, y - Math.cos(a) * 32);
      c.stroke();
    }
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x, y + 18);
    c.stroke();
    c.beginPath();
    c.arc(x, y, 6, 0, TAU);
    c.fill();
  });
}

/** one kind of print: an instanced mesh of them, going round and round (the newest in place of the oldest) */
class Prints {
  constructor(scene, map, max) {
    const mat = new THREE.MeshBasicMaterial({
      map, color: DEPTH, blending: THREE.SubtractiveBlending, transparent: true, depthWrite: false, fog: false, toneMapped: false,
      side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
    });
    this.mesh = new THREE.InstancedMesh(PLANE, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.setColorAt(0, new THREE.Color(0, 0, 0));
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.visible = false;
    this.mesh.renderOrder = -1; // (in before the sea, so a wave washing up over them covers them)
    scene.add(this.mesh);
    this.max = max;
    this.born = new Float32Array(max).fill(-1e9);
    this.next = 0;
    this.life = LIFE;
  }

  /** a print at x, z, facing `heading`, `w` wide (less than 0: the other foot) and `l` long, tipped with the sand's slope */
  add(world, x, z, heading, w, l, now) {
    const i = this.next;
    this.next = (i + 1) % this.max;
    this.mesh.count = Math.max(this.mesh.count, i + 1);
    // (the one this goes over is still showing: they're coming too thick and fast, so they'll all fade sooner)
    this.life = Math.min(this.life, Math.max(3, now - this.born[i]));
    this.born[i] = now;
    const e = 0.15, y = world.groundHeight(x, z);
    _n.set(world.groundHeight(x - e, z) - world.groundHeight(x + e, z), 2 * e, world.groundHeight(x, z - e) - world.groundHeight(x, z + e)).normalize();
    _q.setFromUnitVectors(UP, _n).multiply(_t.setFromAxisAngle(UP, heading + Math.PI));
    this.mesh.setMatrixAt(i, _m.compose(_p.set(x, y + 0.015, z), _q, _s.set(w, 1, l)));
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** each one fading as it gets older (every so often: they fade slowly); how many are still showing */
  fade(now, dt) {
    this.life = Math.min(LIFE, this.life + dt * 0.5); // (back to lasting their full time, once they've thinned out)
    const col = this.mesh.instanceColor;
    let showing = 0;
    for (let i = 0; i < this.mesh.count; i++) {
      const u = (now - this.born[i]) / this.life, k = u < FRESH ? 1 : clamp((1 - u) / (1 - FRESH), 0, 1);
      if (k > 0) showing++;
      col.setXYZ(i, k * k, k * k, k * k); // (squared: the fade looks even, once it's on the screen)
    }
    col.needsUpdate = true;
    this.mesh.visible = showing > 0;
    return showing;
  }
}

/** somewhere a print shows: the dry sand (not the water, the promenade or the rocks) */
const onSand = (world, x, z) => z > ROCKS && world.isSand(x, z);

export class Footprints {
  constructor(game) {
    this.game = game;
    this.boots = new Prints(game.scene, bootTex(), MAX_BOOTS);
    this.birds = new Prints(game.scene, birdTex(), MAX_BIRDS);
    this.step = null; // (which step you're up to: a new one, and a foot's come down)
    this.steps = new WeakMap(); // turkey -> which step it's up to
    this.fadeT = 0;
    this.showing = false;
  }

  /** every frame, at Bondi (or while there are prints still to fade): a print wherever a foot's come down */
  update(dt) {
    const g = this.game, w = g.world, p = g.player, now = g.time;
    const here = w.zoneOf(p.pos.z) === 4;
    if (!here && !this.showing) return;
    if (here) {
      // you: left foot, right foot, as he walks (not up in the air, or down and out)
      const k = Math.floor((p.phase - Math.PI / 2) / Math.PI);
      if (k !== this.step) {
        if (this.step !== null && p.life === 'ok' && p.hop < 0.05 && p.speed > MOVING && onSand(w, p.pos.x, p.pos.z)) {
          const side = k & 1 ? -1 : 1, c = Math.cos(p.heading), s = Math.sin(p.heading); // (1: the left foot, out to his left)
          this.boots.add(w, p.pos.x + c * BOOT_SIDE * side, p.pos.z - s * BOOT_SIDE * side, p.heading, -BOOT[0] * side, BOOT[1], now);
        }
        this.step = k;
      }
      // and the flock, all hurrying after you
      for (const t of g.turkeys.list) {
        const k2 = Math.floor(t.phase / Math.PI), last = this.steps.get(t);
        if (k2 === last) continue;
        this.steps.set(t, k2);
        if (last === undefined || !t.grounded || t.swimming || Math.hypot(t.vel.x, t.vel.z) < MOVING || !onSand(w, t.pos.x, t.pos.z)) continue;
        const side = k2 & 1 ? -1 : 1, c = Math.cos(t.heading), s = Math.sin(t.heading), r = BIRD_SIDE * t.scale * side;
        this.birds.add(w, t.pos.x + c * r, t.pos.z - s * r, t.heading, -BIRD * t.scale * side, BIRD * t.scale, now);
      }
    }
    if ((this.fadeT -= dt) <= 0) {
      this.fadeT = 0.1;
      this.showing = this.boots.fade(now, 0.1) + this.birds.fade(now, 0.1) > 0;
    }
  }
}
