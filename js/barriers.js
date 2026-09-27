import * as THREE from 'three';
import { vcMesh, part, merge, tint, G, limb, clamp, rand, pick, pinLabel } from './util.js';
import { palingGeo, picketGeo, railGeo, wireGeo, wireMat, placeAlong } from './props/fences.js';
import { BOUNDS, ZONES } from './world.js';
import { Key } from './key.js';
import { TRACK } from './props/bush.js';

/* One giant key per area; each needs more turkeys to lift than the last. */
const KEYS = [
  { x: TRACK.clearings.key[0], z: TRACK.clearings.key[1], size: 1.0, weight: 4, slots: 8, heading: 0.6 }, // off to the right of the gate, behind its guards
  { x: -34, z: -86, size: 1.6, weight: 10, slots: 14, heading: 2.2 }, // in the far yard on the left, the giant ibis's
  { x: -41, z: -133, size: 2.3, weight: 20, slots: 24, heading: 0.2 }, // down the far end of the city's back alley
  { x: 6, z: -228, size: 2.6, weight: 22, slots: 26, heading: 1.0 }, // on the pitch, under Big Kev's nose
  { x: -3, z: -337, size: 3.0, weight: 26, slots: 28, heading: 0.4 }, // sunk in the King Crab's rock pool
];

function leafGeo(kind, w) {
  if (kind === 'painted') {
    // (a side gate painted up, so it stands out from the fence it's in, with its latch where the leaves meet)
    const green = new THREE.Color(0x3f6e4e);
    return {
      solid: merge([
        tint(palingGeo(w, { height: 1.75 }), (x, y, z, c) => c.lerp(green, 0.85)),
        part(G.box(Math.hypot(w, 1.1), 0.1, 0.05), 0x2f5540, [w / 2, 0.9, -0.1], [0, 0, Math.atan2(1.1, w)]),
        part(G.box(0.34, 0.07, 0.05), 0x222222, [w - 0.2, 1.12, 0.05]),
        part(G.box(0.34, 0.07, 0.05), 0x222222, [w - 0.2, 1.12, -0.12]),
      ]),
    };
  }
  if (kind === 'wood') {
    return { solid: merge([palingGeo(w), part(G.box(Math.hypot(w, 1.1), 0.1, 0.05), 0x8a6a4a, [w / 2, 0.9, -0.1], [0, 0, Math.atan2(1.1, w)])]) };
  }
  if (kind === 'picket') return { solid: picketGeo(w) };
  if (kind === 'rail') return { solid: railGeo(w) };
  const g = wireGeo(w, { height: 2.1 });
  const brace = part(G.cyl(0.035, 0.035, Math.hypot(w, 1.9), 6), 0xb0b6bb, [w / 2, 1.05, 0], [0, 0, -Math.atan2(w, 1.9)]);
  return { solid: merge([g.frame, brace, part(G.cyl(0.05, 0.05, 2.1, 6), 0xb0b6bb, [w, 1.05, 0])]), mesh: g.mesh };
}

function padlockGeo() {
  const brass = 0xd4a017;
  const body = [
    part(G.box(0.36, 0.3, 0.16), brass, [0, 0, 0]),
    part(G.cyl(0.18, 0.18, 0.16, 16, false), brass, [0, -0.15, 0], [Math.PI / 2, 0, 0], [1, 1, 1]),
    part(G.cyl(0.045, 0.045, 0.02, 10), 0x2a1d0e, [0, -0.04, 0.085], [Math.PI / 2, 0, 0]),
    part(G.box(0.03, 0.1, 0.02), 0x2a1d0e, [0, -0.1, 0.085]),
    part(G.box(0.38, 0.03, 0.17), 0xb8860b, [0, 0.14, 0]),
  ];
  const shackle = part(G.torus(0.12, 0.035, 8, 16, Math.PI), 0xcfd4d8, [0.12, 0, 0]);
  return { body: merge(body), shackle: merge([shackle, part(G.cyl(0.035, 0.035, 0.12, 8), 0xcfd4d8, [0.24, -0.06, 0])]) };
}

class Gate {
  constructor(game, gate, index) {
    this.game = game;
    this.gate = gate;
    this.index = index;
    this.kind = gate.kind;
    const hw = gate.hw, z = gate.z;
    this.seg = game.world.addSegment(gate.x - hw, z, gate.x + hw, z, 0.25, true);
    this.center = new THREE.Vector3(gate.x, 0, z);

    // double gate: two leaves hinged at the outer posts, chained & padlocked in the middle
    this.leaves = [-1, 1].map((side) => {
      const pivot = new THREE.Group();
      pivot.position.set(gate.x + side * hw, 0, z);
      pivot.scale.x = -side; // the right leaf is mirrored
      const g = leafGeo(this.kind, hw);
      pivot.add(vcMesh(g.solid, { cast: true, receive: true }));
      if (g.mesh) pivot.add(new THREE.Mesh(g.mesh, wireMat()));
      game.scene.add(pivot);
      return pivot;
    });

    const h = this.kind === 'picket' ? 0.75 : this.kind === 'rail' ? 0.85 : 1.05;
    this.lock = new THREE.Group();
    this.lock.position.set(gate.x, h, z + 0.18);
    const pl = padlockGeo();
    const body = vcMesh(pl.body);
    this.shackle = new THREE.Group();
    this.shackle.position.set(-0.12, 0.15, 0);
    this.shackle.add(vcMesh(pl.shackle));
    this.lock.add(body, this.shackle);
    const chain = [];
    for (let i = -4; i <= 4; i++) {
      if (i === 0) continue;
      chain.push(part(G.torus(0.07, 0.02, 4, 10), 0xaab0b6, [i * 0.1, 0.2 + Math.abs(i) * 0.012, -0.05], [0, i % 2 ? Math.PI / 2 : 0, 0]));
    }
    this.lock.add(vcMesh(merge(chain)));
    this.lock.scale.setScalar(1.7);
    game.scene.add(this.lock);

    // a glowing see-through ring marks the gate
    const glow = { color: 0xffd21f, transparent: true, depthWrite: false };
    this.ring = new THREE.Group();
    this.ring.position.set(gate.x, 0.07, z);
    this.ring.scale.set(hw + 1.3, 1, 2.1);
    this.ringLine = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 6, 64).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ ...glow, opacity: 0.85 }));
    this.ringDisc = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ ...glow, opacity: 0.12 }));
    this.ringWall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1.8, 48, 1, true).translate(0, 0.9, 0), new THREE.MeshBasicMaterial({ ...glow, opacity: 0.1, side: THREE.DoubleSide }));
    this.ring.add(this.ringLine, this.ringDisc, this.ringWall);
    game.scene.add(this.ring);
    this.ringFade = 1;

    this.state = 'locked';
    this.t = 0;
    this.label = document.createElement('div');
    this.label.className = 'mound-label small';
    this.label.innerHTML = '🔒 Needs the key';
    this.label.style.display = 'none';
    document.getElementById('labels').appendChild(this.label);
  }

  get locked() { return this.state === 'locked'; }

  lockWorld(out) {
    return this.lock.getWorldPosition(out);
  }

  unlock(silent = false) {
    if (!this.locked) return;
    const g = this.game;
    this.state = 'opening';
    this.t = 0;
    this.seg.active = false;
    this.gate.open = true;
    this.label.style.display = 'none';
    if (silent) return;
    g.audio.unlock();
    g.fx.sparkle(this.lockWorld(new THREE.Vector3()), 24);
    g.hud.banner('GATE UNLOCKED', 3);
    g.hud.toast(`${ZONES[this.index + 1].name} awaits...`, 3);
  }

  update(dt, camera, v) {
    this.t += dt;
    if (this.ring.visible) {
      this.ringFade = this.locked ? 1 : Math.max(0, this.ringFade - dt * 1.5);
      const pulse = 0.75 + Math.sin(this.game.time * 3.2 + this.index) * 0.25;
      this.ringLine.material.opacity = 0.85 * pulse * this.ringFade;
      this.ringDisc.material.opacity = 0.12 * pulse * this.ringFade;
      this.ringWall.material.opacity = 0.1 * pulse * this.ringFade;
      this.ringWall.scale.y = 0.9 + Math.sin(this.game.time * 3.2 + this.index) * 0.1;
      if (this.ringFade <= 0) this.ring.visible = false;
    }

    if (this.state === 'opening') {
      // shackle pops, padlock drops, the gates swing open
      const t = this.t;
      this.shackle.rotation.y = -Math.min(1, t / 0.2) * 1.4;
      this.shackle.position.y = 0.15 + Math.min(1, t / 0.2) * 0.08;
      if (t > 0.3) {
        const f = t - 0.3;
        this.lock.position.y = Math.max(0.15, this.lock.position.y - dt * (2 + f * 10));
        this.lock.rotation.z = Math.min(1.5, f * 3);
        if (f > 1.6) this.lock.visible = false;
      }
      const k = clamp((t - 0.45) / 1.1, 0, 1);
      const open = 1.8 * (1 - (1 - k) ** 3);
      this.leaves[0].rotation.y = open;
      this.leaves[1].rotation.y = -open;
      if (t > 2.2) this.state = 'open';
    }

    // "needs the key" hint when the player is near a locked gate
    const p = this.game.player.pos;
    const near = this.locked && Math.hypot(p.x - this.center.x, p.z - this.center.z) < 14;
    if (!near) { if (this.label.style.display !== 'none') this.label.style.display = 'none'; return; }
    pinLabel(this.label, v.set(this.center.x, 2.9, this.center.z), camera);
  }
}

/** half of a barricade: logs piled up, built along +x from its hinge (0) to the middle of the track (len) */
function logPileGeo(len) {
  const barks = [0x7d5f40, 0x8b6a48, 0x74563a], cut = 0xd2b48c, greens = [0x6d8f4e, 0x5f8045, 0x7f9f5c];
  const p = [];
  for (const [y, z, r, l] of [[0.34, 0.36, 0.34, len], [0.34, -0.36, 0.33, len - 0.15], [0.92, 0, 0.3, len - 0.4]]) {
    p.push(part(G.cyl(r, r * 1.08, l, 10), pick(barks), [l / 2, y, z], [0, 0, Math.PI / 2]));
    p.push(part(G.cyl(r * 0.85, r * 0.85, 0.02, 10), cut, [l + 0.005, y, z], [0, 0, Math.PI / 2]));
    p.push(part(G.cyl(r * 0.85, r * 0.85, 0.02, 10), cut, [-0.005, y, z], [0, 0, Math.PI / 2]));
  }
  // snapped-off branches poking out, still in leaf
  for (let i = 0; i < 3; i++) {
    const x = rand(0.6, len - 0.6), side = i % 2 ? 1 : -1;
    const end = [x + rand(-0.4, 0.4), rand(1.4, 1.9), side * rand(0.2, 0.6)];
    p.push(limb([x, 0.9, side * 0.1], end, 0.07, 0.04, pick(barks), 5));
    p.push(part(G.ico(rand(0.3, 0.45), 1), pick(greens), end, [rand(0, 3), rand(0, 3), 0], [1, 0.7, 1]));
  }
  return merge(p);
}

/*
 * A barricade of logs across the track out of one of the bush's clearings. Nothing gets past it (or is
 * thrown over it) while whatever's holding the clearing is still about; beat them all and it swings open.
 */
class Barricade {
  constructor(game, edge, at, guards, name) {
    this.game = game;
    const track = game.world.track, a = track.nodes[edge.a], b = track.nodes[edge.b];
    const dx = (b.x - a.x) / edge.len, dz = (b.z - a.z) / edge.len; // (along the track, out of the clearing)
    const px = -dz, pz = dx, hw = track.width + 0.8; // (across it, and into the scrub either side)
    const x = a.x + dx * at, z = a.z + dz * at;
    this.center = new THREE.Vector3(x, game.world.groundHeight(x, z), z);
    this.edge = edge;
    this.guards = guards;
    this.seg = game.world.addSegment(x - px * hw, z - pz * hw, x + px * hw, z + pz * hw, 0.45, true);
    track.addWall(this.seg);

    // two halves hinged in the scrub either side, meeting in the middle of the track; they swing open
    // (away from the clearing) like a pair of gates
    this.group = new THREE.Group();
    this.group.position.copy(this.center);
    this.group.rotation.y = Math.atan2(-pz, px);
    this.leaves = [-1, 1].map((side) => {
      const pivot = new THREE.Group();
      pivot.position.x = side * hw;
      pivot.scale.x = -side;
      pivot.add(vcMesh(logPileGeo(hw), { cast: true, receive: true }));
      this.group.add(pivot);
      return pivot;
    });
    game.scene.add(this.group);

    this.state = 'up';
    this.t = 0;
    this.label = document.createElement('div');
    this.label.className = 'mound-label small';
    this.label.innerHTML = `⚔️ Beat ${name} to get through`;
    this.label.style.display = 'none';
    document.getElementById('labels').appendChild(this.label);
  }

  get up() { return this.state === 'up'; }

  open(silent = false) {
    if (!this.up) return;
    const g = this.game;
    this.state = 'opening';
    this.t = 0;
    this.seg.active = false;
    g.world.track.plan();
    this.label.style.display = 'none';
    // (anything given up on for being out of reach behind it is fair game again)
    for (const l of g.leaves.list) if (l.snubT > g.time && Math.hypot(l.pos.x - this.center.x, l.pos.z - this.center.z) < 20) l.snubT = 0;
    if (silent) return;
    g.audio.clatter();
    g.fx.dust(this.center, 14);
    g.shake(0.2);
    g.hud.toast('The way through is clear!', 2.5);
  }

  update(dt, camera, v) {
    this.t += dt;
    if (this.up && this.guards.every((f) => !f.alive)) this.open();
    if (this.state === 'opening') {
      const k = clamp(this.t / 1.1, 0, 1), open = 1.65 * (1 - (1 - k) ** 3);
      this.leaves[0].rotation.y = open;
      this.leaves[1].rotation.y = -open;
      if (k >= 1) this.state = 'open';
    }
    // what it'll take to get past, when the player's close by
    const p = this.game.player.pos;
    const near = this.up && Math.hypot(p.x - this.center.x, p.z - this.center.z) < 14;
    if (!near) { if (this.label.style.display !== 'none') this.label.style.display = 'none'; return; }
    pinLabel(this.label, v.set(this.center.x, this.center.y + 2.3, this.center.z), camera);
  }
}

/*
 * A side gate in a fence, latched on the far side. From this side there's no way through it (or throwing
 * over it); come up to it from the other side, though, and you can let yourself through, and it stays open:
 * a shortcut back the way you came.
 */
class SideGate {
  /** the opening runs from a to b ([x, z]); `latch` is which side of it ([x, z] direction) it opens from */
  constructor(game, a, b, latch, kind = 'wood') {
    this.game = game;
    const w = game.world;
    let [ax, az] = a, [bx, bz] = b;
    // (the leaves swing open towards the latch side, the way the zone gates open outwards)
    if ((bz - az) * latch[0] - (bx - ax) * latch[1] < 0) [ax, az, bx, bz] = [bx, bz, ax, az];
    const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len, hw = len / 2;
    this.center = new THREE.Vector3((ax + bx) / 2, 0, (az + bz) / 2);
    this.latch = latch;
    this.seg = w.addSegment(ax, az, bx, bz, 0.25, true);
    this.track = w.trackAt(this.center.z);
    this.track?.addWall(this.seg);
    this.group = new THREE.Group();
    this.group.position.copy(this.center);
    this.group.rotation.y = Math.atan2(-uz, ux);
    this.leaves = [-1, 1].map((side) => {
      const pivot = new THREE.Group();
      pivot.position.x = side * hw;
      pivot.scale.x = -side;
      const g = leafGeo(kind, hw);
      pivot.add(vcMesh(g.solid, { cast: true, receive: true }));
      if (g.mesh) pivot.add(new THREE.Mesh(g.mesh, wireMat()));
      this.group.add(pivot);
      return pivot;
    });
    game.scene.add(this.group);
    this.state = 'shut';
    this.t = 0;
    this.label = document.createElement('div');
    this.label.className = 'mound-label small';
    this.label.innerHTML = '🔒 Latched on the other side';
    this.label.style.display = 'none';
    document.getElementById('labels').appendChild(this.label);
  }

  get shut() { return this.state === 'shut'; }

  open(silent = false) {
    if (!this.shut) return;
    const g = this.game;
    this.state = 'opening';
    this.t = 0;
    this.seg.active = false;
    this.track?.plan();
    this.label.style.display = 'none';
    if (silent) return;
    g.audio.unlock();
    g.fx.sparkle(this.center.clone().setY(1.2), 14);
    g.hud.toast('You unlatched the side gate: a shortcut back!', 3);
  }

  update(dt, camera, v) {
    this.t += dt;
    const p = this.game.player.pos, dx = p.x - this.center.x, dz = p.z - this.center.z, d = Math.hypot(dx, dz);
    // (up to it on the latch side: let yourself through)
    const onLatchSide = dx * this.latch[0] + dz * this.latch[1] > 0;
    if (this.shut && d < 3.2 && onLatchSide) this.open();
    if (this.state === 'opening') {
      const k = clamp(this.t / 1.1, 0, 1), open = 1.7 * (1 - (1 - k) ** 3);
      this.leaves[0].rotation.y = open;
      this.leaves[1].rotation.y = -open;
      if (k >= 1) this.state = 'open';
    }
    // (what it'll take to get through, from whichever side the player's on)
    if (!this.shut || d > 10) { if (this.label.style.display !== 'none') this.label.style.display = 'none'; return; }
    const text = onLatchSide ? '🔓 Unlatch it: a shortcut back' : '🔒 Latched on the other side';
    if (this.label.innerHTML !== text) this.label.innerHTML = text;
    pinLabel(this.label, v.set(this.center.x, 2.4, this.center.z), camera);
  }
}

export class Barriers {
  constructor(game) {
    this.game = game;
    this.barricades = [];
    this.sideGates = [];
    this.gates = [];
    const w = game.world;
    w.gates.forEach((gate, i) => {
      const z = gate.z, x0 = BOUNDS.xMin - 3, x1 = BOUNDS.xMax + 3;
      const left = gate.x - gate.hw, right = gate.x + gate.hw;
      w.addSegment(x0, z, left, z, 0.25, true);
      w.addSegment(right, z, x1, z, 0.25, true);
      // solid fence either side of the gate
      for (const [a, b] of [[x0, left], [right, x1]]) {
        for (let x = a; x < b - 0.01; x += 12) {
          const len = Math.min(12, b - x);
          if (gate.kind === 'wood') {
            w.scene.add(placeAlong(vcMesh(palingGeo(len), { cast: true, receive: true }), x, z, x + len, z));
          } else if (gate.kind === 'picket') {
            w.scene.add(placeAlong(vcMesh(picketGeo(len), { cast: true, receive: true }), x, z, x + len, z));
          } else if (gate.kind === 'rail') {
            w.scene.add(placeAlong(vcMesh(railGeo(len), { cast: true, receive: true }), x, z, x + len, z));
          } else {
            const g = wireGeo(len);
            w.scene.add(placeAlong(vcMesh(g.frame, { cast: true, receive: true }), x, z, x + len, z));
            w.scene.add(placeAlong(new THREE.Mesh(g.mesh, wireMat()), x, z, x + len, z));
          }
        }
      }
      this.gates.push(new Gate(game, gate, i));
    });
    this._v = new THREE.Vector3();
  }

  /** drop each area's key into the world (needs game.enemies, which hauls them) */
  spawnKeys() {
    this.keys = KEYS.map((spec, i) => {
      const k = new Key(this.game, spec, this.game.world.gates[i], i);
      this.game.enemies.list.push(k);
      return k;
    });
  }

  /** a barricade across the track out of clearing `at` (towards `to`), until all the `guards` are beaten */
  addBarricade(at, to, guards, name) {
    const track = this.game.world.track;
    const b = new Barricade(this.game, track.firstEdge(at, to), track.node(at).r + 1.6, guards, name);
    this.barricades.push(b);
    return b;
  }

  /** a side gate across the opening a->b in a fence, that only opens from its `latch` side */
  addSideGate(a, b, latch, kind) {
    const s = new SideGate(this.game, a, b, latch, kind);
    this.sideGates.push(s);
    return s;
  }

  /** debug helper: open gate i straight away (and tidy away its key) */
  unlock(i, silent = false) {
    this.gates[i].unlock(silent);
    const k = this.keys?.[i];
    if (k && !k.gone && k.state === 'carcass') k.dispose();
  }

  update(dt, camera) {
    for (const g of this.gates) g.update(dt, camera, this._v);
    for (const b of this.barricades) b.update(dt, camera, this._v);
    for (const s of this.sideGates) s.update(dt, camera, this._v);
  }
}
