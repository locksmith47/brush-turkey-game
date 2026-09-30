import * as THREE from 'three';
import { vcMesh, part, merge, tint, G, limb, clamp, rand, pick, pinLabel } from './util.js';
import { palingGeo, picketGeo, railGeo, wireGeo, wireMat, placeAlong } from './props/fences.js';
import { Key } from './key.js';
import { Foe } from './foe.js';
import { TRACK } from './props/bush.js';
import { webTexture } from './spider.js';
import { POOLS } from './props/beach.js';

/* One giant key per area (bar the city: the King Ibis is the end of the line); each needs more turkeys to lift than the last. */
const KEYS = [
  { x: TRACK.clearings.key[0], z: TRACK.clearings.key[1], size: 1.0, weight: 4, slots: 8, heading: 0.6, buried: 18 }, // buried behind the funnel-web's web, off to the right of the gate
  { x: -34, z: -86, size: 1.6, weight: 10, slots: 14, heading: 2.2 }, // in the far yard on the left, the giant ibis's
  { holder: 'keeper', model: 'rake', size: 2.3, weight: 18, slots: 24 }, // Big Kev's rake is a key rake
  { x: POOLS[0].x - 3, z: POOLS[0].z + 1, size: 2.7, weight: 22, slots: 26, heading: -1.2 }, // sunk in the King Crab's rock pool
  { holder: 'captain', model: 'ferry', size: 3.0, weight: 26, slots: 28 }, // the ferry keys: Captain Gull's nicked them
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
    const hw = gate.hw, [dx, dz] = gate.d, px = -dz, pz = dx; // (d: the way on through it; p: along the fence)
    this.seg = game.world.addSegment(gate.x - px * hw, gate.z - pz * hw, gate.x + px * hw, gate.z + pz * hw, 0.25, true);
    this.center = new THREE.Vector3(gate.x, 0, gate.z);
    // (all of it built in the gate's own frame: the fence along x, and the side you come at it from towards +z)
    this.frame = new THREE.Group();
    this.frame.position.set(gate.x, game.world.groundHeight(gate.x - dx, gate.z - dz), gate.z);
    this.frame.rotation.y = Math.atan2(-dx, -dz);
    game.scene.add(this.frame);

    // double gate: two leaves hinged at the outer posts, chained & padlocked in the middle
    this.leaves = [-1, 1].map((side) => {
      const pivot = new THREE.Group();
      pivot.position.x = side * hw;
      pivot.scale.x = -side; // the right leaf is mirrored
      const g = leafGeo(this.kind, hw);
      pivot.add(vcMesh(g.solid, { cast: true, receive: true }));
      if (g.mesh) pivot.add(new THREE.Mesh(g.mesh, wireMat()));
      this.frame.add(pivot);
      return pivot;
    });
    this.state = 'locked';
    this.t = 0;
    this.openK = 0; // (how far open the leaves are swung)
    if (!gate.lock) {
      // (no padlock on this one: it's shut till it's opened for you, see Ferry)
      this.state = 'shut';
      return;
    }

    const h = this.kind === 'picket' ? 0.75 : this.kind === 'rail' ? 0.85 : 1.05;
    this.lock = new THREE.Group();
    this.lock.position.set(0, h, 0.18);
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
    this.frame.add(this.lock);

    // a glowing see-through ring marks the gate
    const glow = { color: 0xffd21f, transparent: true, depthWrite: false };
    this.ring = new THREE.Group();
    this.ring.position.y = 0.07;
    this.ring.scale.set(hw + 1.3, 1, 2.1);
    this.ringLine = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 6, 64).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ ...glow, opacity: 0.85 }));
    this.ringDisc = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ ...glow, opacity: 0.12 }));
    this.ringWall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1.8, 48, 1, true).translate(0, 0.9, 0), new THREE.MeshBasicMaterial({ ...glow, opacity: 0.1, side: THREE.DoubleSide }));
    this.ring.add(this.ringLine, this.ringDisc, this.ringWall);
    this.frame.add(this.ring);
    this.ringFade = 1;

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
    this.gate.unlocked = true;
    this.label.style.display = 'none';
    // (the ferry's gangway only opens with the ferry in: it's got the say from here on, see Ferry)
    if (!this.gate.ferry || g.ferry?.docked === 'wharf') this.setOpen(true);
    if (silent) return;
    g.audio.unlock();
    g.fx.sparkle(this.lockWorld(new THREE.Vector3()), 24);
    g.hud.banner('GATE UNLOCKED', 3);
  }

  /** open for everyone to go through, or shut (not locked: the ferry's gangways, as it comes and goes) */
  setOpen(open) {
    this.seg.active = !open;
    this.gate.open = open;
    if (this.locked || this.state === 'opening') return; // (the padlock's got to come off first: it swings open after)
    this.state = open ? 'swing' : 'shut';
  }

  update(dt, camera, v) {
    this.t += dt;
    if (!this.lock) { this.swingLeaves(dt); return; }
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
      this.openK = 1 - (1 - k) ** 3;
      this.leaves[0].rotation.y = 1.8 * this.openK;
      this.leaves[1].rotation.y = -1.8 * this.openK;
      if (t > 2.2) this.state = this.gate.open ? 'open' : 'shut';
    } else this.swingLeaves(dt);

    // "needs the key" hint when the player is near a locked gate
    const p = this.game.player.pos;
    const near = this.locked && Math.hypot(p.x - this.center.x, p.z - this.center.z) < 14;
    if (!near) { if (this.label.style.display !== 'none') this.label.style.display = 'none'; return; }
    pinLabel(this.label, v.set(this.center.x, 2.9, this.center.z), camera);
  }

  /** the leaves swinging open (or shut again) as the gate's opened and shut for the ferry */
  swingLeaves(dt) {
    const want = this.gate.open ? 1 : 0;
    if (this.openK === want) return;
    this.openK = want ? Math.min(1, this.openK + dt / 1.1) : Math.max(0, this.openK - dt / 1.1);
    const e = this.openK * this.openK * (3 - 2 * this.openK);
    this.leaves[0].rotation.y = 1.8 * e;
    this.leaves[1].rotation.y = -1.8 * e;
    if (this.openK === want) this.state = want ? 'open' : 'shut';
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

/**
 * half of a web strung across the track (the funnel-web's, across the way to the bush's key), from its
 * anchor in the scrub (0) along +x to the middle of the track (len), billowing a little
 */
function webHalf(len) {
  const H = 3.4, g = new THREE.PlaneGeometry(len, H, 10, 8).translate(len / 2, H / 2, 0);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    uv.setXY(i, (x / len) * 0.5, 0.06 + (y / H) * 0.88); // (the two halves make one web between them)
    pos.setZ(i, Math.sin((x / len) * Math.PI * 0.5) * Math.sin((y / H) * Math.PI) * 0.35);
  }
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: webTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  m.renderOrder = 2;
  return m;
}

/*
 * A barricade across the track out of one of the bush's clearings: logs, or for the funnel-web, its web.
 * Nothing gets past it (or is thrown over it) till turkeys knock it down: throw them at it and they shove,
 * lined up along its face (the dial fills as they go), while whatever's holding the clearing does its best
 * to stop them. Over it goes at last, the two halves bursting open into the scrub (the web tears down the
 * middle and shrivels away).
 */
class Barricade extends Foe {
  /** `spec`: { hp: how much shoving it takes, kind: 'logs' | 'web' } */
  constructor(game, edge, at, spec) {
    const track = game.world.track, a = track.nodes[edge.a], b = track.nodes[edge.b];
    const dx = (b.x - a.x) / edge.len, dz = (b.z - a.z) / edge.len; // (along the track, out of the clearing)
    const px = -dz, pz = dx, hw = track.width + 0.8; // (across it, and into the scrub either side)
    const x = a.x + dx * at, z = a.z + dz * at, web = spec.kind === 'web';
    // (it's got at from the clearing's side: that's where it counts as being, for turkeys looking for work)
    super(game, {
      name: web ? 'Web' : 'Barricade', hp: spec.hp, scale: 1, radius: track.width + 0.2, labelY: 2.2, task: 'push', dieTime: 0.8,
    }, x - dx * 1.3, z - dz * 1.3);
    this.center = new THREE.Vector3(x, game.world.groundHeight(x, z), z);
    this.edge = edge;
    this.kind = spec.kind ?? 'logs';
    this.guards = [];
    this.out = new THREE.Vector3(dx, 0, dz);
    this.across = new THREE.Vector3(px, 0, pz);
    this.reach = track.width - 0.4; // (how far along it turkeys can get at it: not into the scrub)
    this.thick = web ? 0.15 : 0.7; // (how far out from its line its face is, about a turkey's head height up: the logs are piled thick)
    this.seg = game.world.addSegment(x - px * hw, z - pz * hw, x + px * hw, z + pz * hw, 0.45, true);
    track.addWall(this.seg);

    // two halves anchored in the scrub either side, meeting in the middle of the track
    const group = new THREE.Group();
    group.position.copy(this.center);
    group.rotation.y = Math.atan2(-pz, px);
    this.leaves = [-1, 1].map((side) => {
      const pivot = new THREE.Group();
      pivot.position.x = side * hw;
      pivot.scale.x = -side;
      pivot.add(web ? webHalf(hw) : vcMesh(logPileGeo(hw), { cast: true, receive: true }));
      group.add(pivot);
      return pivot;
    });
    this.setRig({ root: group });
    this.group = group;
    this.state = 'up';
    this.wob = 0;
  }

  get up() { return this.alive; }

  /** where along it the guards stand: `back` metres into the clearing from it, `side` metres across */
  guardPost(back, side) {
    return [this.center.x - this.out.x * back + this.across.x * side, this.center.z - this.out.z * back + this.across.z * side];
  }

  /**
   * Where turkey t shoves: at its face (whichever side t's on), square on, wherever along it t's got to
   * (so a crowd of them spreads out along it), and far enough back that leaning into it, its beak just meets
   * it (not its whole head in amongst the logs). Fills `stand` (where to be) and `face` (what to face)
   */
  attackSpot(t, stand, face) {
    const c = this.center, rx = t.pos.x - c.x, rz = t.pos.z - c.z;
    const u = clamp(rx * this.across.x + rz * this.across.z, -this.reach, this.reach);
    const back = Math.max(this.seg.r + t.radius + 0.08, this.thick + t.pushReach);
    const off = (rx * this.out.x + rz * this.out.z < 0 ? -1 : 1) * back;
    face.set(c.x + this.across.x * u, 0, c.z + this.across.z * u);
    stand.set(face.x + this.out.x * off, 0, face.z + this.out.z * off);
  }

  colliderR() { return 0; } // (it's a wall: the segment does the blocking)
  bodyCenter(out) { return out.copy(this.center).addScaledVector(this.out, -0.45).setY(this.center.y + 0.8); }

  hitFx(p) {
    const g = this.game;
    if (this.kind === 'web') g.fx.burst(p, { n: 3, colors: [0xffffff, 0xeef2f5], speed: [0.4, 1.2], up: [0.3, 1.2], grav: 1, drag: 1.5, size: [0.03, 0.06], life: [0.6, 1.1] });
    else {
      g.fx.burst(p, { n: 3, colors: [0x7d5f40, 0x8b6a48, 0x6d8f4e], speed: [0.8, 2], up: [1, 2.5], size: [0.04, 0.08], life: [0.4, 0.8] });
      g.audio.thunk();
    }
  }

  /** being shoved: it rocks, and whoever's guarding it comes for whoever's doing the shoving */
  onDamage(amount, attacker) {
    this.wob = 1;
    if (attacker) for (const f of this.guards) if (f.alive) f.alert(attacker);
  }

  /** knocked down: the way on is clear */
  onDeath() {
    const g = this.game;
    this.seg.active = false;
    g.world.track.plan();
    // (anything given up on for being out of reach behind it is fair game again)
    for (const l of g.leaves.list) if (l.snubT > g.time && Math.hypot(l.pos.x - this.center.x, l.pos.z - this.center.z) < 20) l.snubT = 0;
    if (this.silent) return;
    if (this.kind === 'web') {
      g.audio.snip();
      g.fx.burst(this.center.clone().setY(this.center.y + 1.6), { n: 24, colors: [0xffffff, 0xf2f2f2, 0xdde6ee], speed: [0.5, 2.2], up: [0.4, 1.8], grav: 1.2, drag: 1.5, size: [0.03, 0.07], life: [0.8, 1.6] });
    } else {
      g.audio.clatter();
      g.audio.stomp(1.4);
      g.fx.dust(this.center, 18);
      g.fx.leafBits(this.center, 12);
    }
    g.shake(0.25);
  }

  /** debug helper: knock it down straight away */
  open(silent = false) {
    if (!this.alive) return;
    this.silent = silent;
    this.die();
  }

  /** (it doesn't move, or get hauled off: it just stands there till it's knocked down, then it's done with) */
  update(dt) {
    this.t += dt;
    this.flinch = Math.max(0, this.flinch - dt * 3);
    if (this.state === 'dying') {
      this.roll = Math.min(1, this.t / this.def.dieTime);
      if (this.t >= this.def.dieTime) this.becomeCarcass();
    }
    this.pose(dt);
  }

  /** down for good: it stays where it fell, but it's no longer anything anyone need bother with */
  becomeCarcass() {
    this.state = 'down';
    this.roll = 1;
    this.pose(0);
    this.label.remove();
    this.dial?.remove();
    this.gone = true;
  }

  pose(dt) {
    this.wob = Math.max(0, this.wob - dt * 3);
    const [l, r] = this.leaves, web = this.kind === 'web';
    let open, fade = 0;
    if (this.alive) {
      // giving way (and rattling as it's shoved) the further they get
      const loose = 1 - Math.max(0, this.hp) / this.def.hp;
      open = loose * 0.14 + Math.sin(this.game.time * 31) * 0.035 * this.wob;
      fade = loose * 0.35;
    } else {
      // over it goes: the halves burst open into the scrub (a web sags and shrivels away to nothing)
      const k = this.state === 'dying' ? this.roll : 1;
      open = 0.14 + 1.55 * (1 - (1 - k) ** 3);
      fade = web ? 0.35 + 0.65 * k : 0;
      if (web && k >= 1) this.group.visible = false;
    }
    l.rotation.y = open;
    r.rotation.y = -open;
    if (web) for (const h of this.leaves) {
      h.children[0].material.opacity = 1 - fade;
      h.scale.y = 1 - fade * 0.6;
    }
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
    this.track = w.trackAt(this.center.x, this.center.z);
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
    const text = onLatchSide ? '🔓 A shortcut back' : '🔒 Latched on the other side';
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
      // the fence runs right across (along x on the first leg, z on the second), bar the gate in it
      const along = !gate.d[0], c = along ? gate.z : gate.x, g0 = (along ? gate.x : gate.z) - gate.hw, g1 = g0 + 2 * gate.hw;
      const at = (u) => (along ? [u, c] : [c, u]);
      for (const [a, b] of [[gate.span[0], g0], [g1, gate.span[1]]]) {
        w.addSegment(...at(a), ...at(b), 0.25, true);
        // (the posts stood on whatever the ground's like there: a wharf's decking is up off the water, and
        // out in the water, they stand in it)
        for (let u = a; u < b - 0.01; u += 12) {
          const len = Math.min(12, b - u), [ax, az] = at(u), [bx, bz] = at(u + len);
          const y = Math.max(0, w.groundHeight((ax + bx) / 2, (az + bz) / 2));
          if (gate.kind === 'wood') {
            w.scene.add(placeAlong(vcMesh(palingGeo(len), { cast: true, receive: true }), ax, az, bx, bz, y));
          } else if (gate.kind === 'picket') {
            w.scene.add(placeAlong(vcMesh(picketGeo(len), { cast: true, receive: true }), ax, az, bx, bz, y));
          } else if (gate.kind === 'rail') {
            w.scene.add(placeAlong(vcMesh(railGeo(len), { cast: true, receive: true }), ax, az, bx, bz, y));
          } else {
            const g = wireGeo(len);
            w.scene.add(placeAlong(vcMesh(g.frame, { cast: true, receive: true }), ax, az, bx, bz, y));
            w.scene.add(placeAlong(new THREE.Mesh(g.mesh, wireMat()), ax, az, bx, bz, y));
          }
        }
      }
      this.gates.push(new Gate(game, gate, i));
    });
    this._v = new THREE.Vector3();
  }

  /** drop each area's key into the world, or into its holder's hands (needs game.enemies, which hauls them) */
  spawnKeys() {
    this.keys = KEYS.map((spec, i) => {
      const k = new Key(this.game, spec, this.game.world.gates[i], i);
      this.game.enemies.list.push(k);
      return k;
    });
  }

  /**
   * a barricade across the track out of clearing `at` (towards `to`), till turkeys knock it down: `spec` is
   * { hp: how much shoving that takes, kind: 'logs' | 'web' (strung across it by the funnel-web) }. It's one
   * of game.enemies too (it's something turkeys go at)
   */
  addBarricade(at, to, spec) {
    const track = this.game.world.track;
    const b = new Barricade(this.game, track.firstEdge(at, to), track.node(at).r + 1.6, spec);
    this.barricades.push(b);
    this.game.enemies.list.push(b);
    return b;
  }

  /** a side gate across the opening a->b in a fence, that only opens from its `latch` side */
  addSideGate(a, b, latch, kind) {
    const s = new SideGate(this.game, a, b, latch, kind);
    this.sideGates.push(s);
    return s;
  }

  /** debug helper: open gate i straight away (and tidy away its key, wherever it is) */
  unlock(i, silent = false) {
    if (!this.gates[i].lock) return; // (the gangway at Circular Quay: that's the ferry's to open)
    this.gates[i].unlock(silent);
    const k = this.keys?.[i];
    if (k && !k.gone && k.state !== 'unlock') k.dispose();
  }

  update(dt, camera) {
    for (const g of this.gates) g.update(dt, camera, this._v);
    for (const s of this.sideGates) s.update(dt, camera, this._v); // (the barricades are updated with the enemies)
  }
}
