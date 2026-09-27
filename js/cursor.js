import * as THREE from 'three';
import { STAGES } from './turkeyModel.js';
import { pinLabel } from './util.js';

const DOTS = 18;

/* Aim reticle, throw-arc preview, whistle ring, "next throw" marker and pluck prompt. */
export class Cursor {
  constructor(game) {
    this.game = game;
    const scene = game.scene;

    const ringGeo = new THREE.TorusGeometry(0.42, 0.045, 6, 32);
    ringGeo.rotateX(Math.PI / 2);
    this.reticle = new THREE.Group();
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false });
    this.reticle.add(new THREE.Mesh(ringGeo, ringMat));
    for (let i = 0; i < 4; i++) {
      const tick = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.22), ringMat);
      const a = (i / 4) * Math.PI * 2;
      tick.position.set(Math.sin(a) * 0.6, 0, Math.cos(a) * 0.6);
      tick.rotation.y = a;
      this.reticle.add(tick);
    }
    scene.add(this.reticle);

    this.dots = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.06, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false }), DOTS);
    this.dots.frustumCulled = false;
    scene.add(this.dots);

    const wg = new THREE.CylinderGeometry(1, 1, 0.5, 48, 1, true);
    wg.translate(0, 0.25, 0);
    this.whistleMesh = new THREE.Mesh(wg, new THREE.MeshBasicMaterial({ color: 0xffd21f, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd21f, transparent: true, opacity: 0.15, depthWrite: false }));
    disc.position.y = 0.04;
    this.whistleMesh.add(disc);
    this.whistleMesh.visible = false;
    scene.add(this.whistleMesh);

    this.marker = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.3, 4).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    scene.add(this.marker);

    this.prompt = document.createElement('div');
    this.prompt.className = 'mound-label';
    this.prompt.innerHTML = '<kbd>E</kbd> Pluck';
    this.prompt.style.display = 'none';
    document.getElementById('labels').appendChild(this.prompt);

    this._m = new THREE.Matrix4();
    this._p = new THREE.Vector3();
    this._h = new THREE.Vector3();
    this.t = 0;
  }

  update(dt, target, whistle, camera) {
    const g = this.game;
    this.t += dt;
    this.reticle.position.set(target.x, target.y + 0.06, target.z);
    this.reticle.rotation.y += dt * 1.5;
    const pulse = 1 + Math.sin(this.t * 6) * 0.06;
    this.reticle.scale.setScalar(pulse);

    // dotted throw arc from the hand to the reticle
    const cand = g.turkeys.candidate;
    if (cand && !whistle.active) {
      const from = g.player.handPos(this._h);
      const d = Math.hypot(target.x - from.x, target.z - from.z);
      const h = 1.6 + d * 0.16;
      for (let i = 0; i < DOTS; i++) {
        const k = (i + ((this.t * 2) % 1)) / DOTS;
        this._p.lerpVectors(from, target, k);
        this._p.y += h * 4 * k * (1 - k);
        this._m.makeTranslation(this._p.x, this._p.y, this._p.z);
        this.dots.setMatrixAt(i, this._m);
      }
      this.dots.count = DOTS;
      this.dots.instanceMatrix.needsUpdate = true;
      this.marker.visible = true;
      const top = cand.rig.headTop * cand.scale;
      this.marker.position.set(cand.pos.x, cand.pos.y + top + 0.35 + Math.sin(this.t * 8) * 0.06, cand.pos.z);
      this.marker.rotation.y += dt * 4;
      this.marker.material.color.set(cand.stage === 0 ? 0xffffff : STAGES[cand.stage].hud);
    } else {
      this.dots.count = 0;
      this.marker.visible = false;
    }

    // whistle ring
    this.whistleMesh.visible = whistle.active;
    if (whistle.active) {
      this.whistleMesh.position.set(whistle.center.x, g.world.groundHeight(whistle.center.x, whistle.center.z), whistle.center.z);
      this.whistleMesh.scale.set(whistle.radius, 1 + Math.sin(this.t * 20) * 0.15, whistle.radius);
    }

    // pluck prompt over the nearest sprout in reach
    const sprout = g.turkeys.nearestSprout(g.player.pos, 2.3);
    if (sprout) pinLabel(this.prompt, this._p.set(sprout.pos.x, g.world.groundHeight(sprout.pos.x, sprout.pos.z) + 0.9, sprout.pos.z), camera);
    else if (this.prompt.style.display !== 'none') this.prompt.style.display = 'none';
  }
}
