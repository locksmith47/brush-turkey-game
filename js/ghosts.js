import * as THREE from 'three';
import { createRig } from './turkeyModel.js';
import { rand } from './util.js';

const LIFE = 3.8;

/* When a turkey dies, a see-through turkey (with a little halo) drifts up and fades away. */
export class Ghosts {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.haloGeo = new THREE.TorusGeometry(0.1, 0.02, 6, 20).rotateX(Math.PI / 2);
  }

  spawn(turkey) {
    const rig = createRig(turkey.stage, 'normal', 0, turkey.hen);
    const mat = new THREE.MeshBasicMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0.75, depthWrite: false, fog: false });
    rig.root.traverse((o) => { if (o.isMesh) { o.material = mat; o.castShadow = false; } });
    rig.legL.visible = rig.legR.visible = false;
    rig.dirt.visible = false;
    rig.body.visible = rig.wingL.visible = rig.wingR.visible = true;
    const halo = new THREE.Mesh(this.haloGeo, new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, depthWrite: false, fog: false }));
    halo.position.set(0, turkey.stage === 0 ? 0.36 : 0.42, 0.08);
    rig.neck.add(halo);
    rig.root.position.copy(turkey.pos);
    rig.root.rotation.y = turkey.heading;
    this.game.scene.add(rig.root);
    this.list.push({ rig, mat, halo, t: 0, x0: turkey.pos.x, y0: turkey.pos.y, z0: turkey.pos.z, ph: rand(0, 6.28), s: turkey.scale });
    this.game.audio.ghost();
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const g = this.list[i];
      g.t += dt;
      const k = g.t / LIFE;
      if (k >= 1) {
        this.game.scene.remove(g.rig.root);
        g.mat.dispose();
        g.halo.material.dispose();
        this.list.splice(i, 1);
        continue;
      }
      const r = g.rig;
      r.root.position.set(
        g.x0 + Math.sin(g.t * 1.8 + g.ph) * 0.35,
        g.y0 + 0.3 + g.t * 0.85 + Math.sin(g.t * 4) * 0.06,
        g.z0 + Math.cos(g.t * 1.9 + g.ph) * 0.2,
      );
      r.root.rotation.z = Math.sin(g.t * 2.4 + g.ph) * 0.2;
      const s = g.s * (1 + k * 0.25);
      r.root.scale.setScalar(s);
      const flap = 0.5 + Math.sin(g.t * 7) * 0.6;
      r.wingL.rotation.z = flap;
      r.wingR.rotation.z = -flap;
      r.neck.rotation.x = -0.2 + Math.sin(g.t * 3) * 0.1;
      const fade = k < 0.1 ? k / 0.1 : 1 - Math.pow((k - 0.1) / 0.9, 2);
      g.mat.opacity = 0.75 * fade;
      g.halo.material.opacity = fade;
    }
  }
}
