import * as THREE from 'three';
import { Tentacle, Tube, BERTHS, ARM_HP } from './tentacle.js';
import { Fish, KINDS, CATCH } from './fish.js';
import { part, merge, vcMat, toonMat, G, canvasTexture, clamp, lerp, rand, smoothstep, angleDiff, TAU } from './util.js';
import { SEA } from './props/beach.js';
import { LANE, swell } from './props/harbour.js';
import { FERRY, CITY } from './world.js';

/*
 * The giant Australian cuttlefish, out in the middle of the harbour. The first time you're halfway over on the
 * ferry, the sky goes dark, something big starts circling under the boat, and she's pulled up dead in the water.
 * Up it comes out in front of her, lit up in every colour going (they do that: dark clouds passing down it,
 * shimmering blues and greens round its fins), and its tentacles come up over her sides, one after another (see
 * Tentacle). Beat them off, every one, and it's had enough: it shoots off backwards into the depths in a cloud of
 * ink, the storm clears, and she's on her way again, with a deck full of fish it's churned up (see Fish) to be
 * carried off to a mound at the Quay. After that, the crossing's a quiet one.
 *
 * Go down in the middle of it, and it's called off: it lets go of her and slinks off, the weather clears, and she
 * turns back for you. It'll be there waiting the next time you cross.
 */
const NAME = 'Giant Australian Cuttlefish';
const ARMS = 6; // tentacles it sends up over her sides, all told...
const AT_ONCE = [2, 3]; // ...this many at a time (and once it's lost a couple, this many)
const FIRST = [0.6, 2.6]; // s the first two stay under after it's come up, before they come up after her...
const NEXT = [1.5, 3.5]; // ...and the ones after
const WHERE = 0.5, WINDOW = 0.06; // how far over she is when it comes up for her (0 the wharf, 1 the Quay), give or take
const TIME = { brew: 5.5, rise: 2.4, beaten: 0.9, dive: 3.6, sink: 2.6 }; // s: circling under her while the storm brews, coming up, reeling from losing its last tentacle, going back down (and slinking off, called off)
const FISH_AT = 0.5, SAIL_AT = 2.4; // s into it going back down that the fish come flying up, and that she's let go
const SPOT = { ahead: 20, aside: 18, circle: [26, 13] }; // m: where it comes up, out in front of you (the way you're looking) and off her left side; and how far out from her middle it circles, before (along her, across her)
const UP = { y: 1, pitch: 0.5 }; // up: its middle m above the water, and its head up this much (radians)
const DEEP = -6.5; // m under the water, circling her
const INK = 0x170c26;
const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _r = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _c2 = new THREE.Color();
const r2 = (v) => Math.round(v * 100) / 100;

/* ------------------------------------------------------------------ its looks */
// (in its own frame: its head's towards +x, with its arms out in front of that, and its back's up)
const MANTLE = { x: -5, r: [8, 2.5, 4.4] }, HEAD = { x: 3.3, y: 0.15, r: [2.7, 2.2, 3.3] }; // m: its body, and its head in front of it
const FIN = { n: 30, w: 1.7, y: -0.3, from: MANTLE.x - MANTLE.r[0] + 0.7, to: MANTLE.x + MANTLE.r[0] * 0.92 }; // its fin, a skirt round either side of its body: segments along it, m wide, how high up it, and where it runs (x)
const ARM = { n: 8, len: [4.4, 6.6], rad: [0.55, 0.07] }; // its arms, round the front of its head: how many, how long (the top ones shortest, the bottom ones longest), how thick (root, tip)
// its colours: purples and magentas, dark clouds passing down it, white bands and spots, sea-green and blue
// shimmering round its sides, and a pale underside
const C = {
  purple: new THREE.Color(0x8a2fb0), magenta: new THREE.Color(0xc2358f), cloud: new THREE.Color(0x2a1a6b),
  teal: new THREE.Color(0x1fd1bf), blue: new THREE.Color(0x3d8bff), white: new THREE.Color(0xfff2fb),
  belly: new THREE.Color(0xf4d6e0), pale: new THREE.Color(0xfbf4f8),
};

/** a big golden eye, with a cuttlefish's W-shaped pupil */
function eyeTex() {
  return canvasTexture(128, 128, (c, w, h) => {
    const g = c.createRadialGradient(64, 64, 6, 64, 64, 64);
    g.addColorStop(0, '#fff4b8');
    g.addColorStop(0.5, '#ffc93c');
    g.addColorStop(0.82, '#d9861c');
    g.addColorStop(1, '#5a2a10');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#140a16';
    c.lineWidth = 17;
    c.lineJoin = c.lineCap = 'round';
    c.beginPath();
    c.moveTo(20, 48);
    c.quadraticCurveTo(32, 90, 47, 86);
    c.quadraticCurveTo(60, 82, 64, 62);
    c.quadraticCurveTo(68, 82, 81, 86);
    c.quadraticCurveTo(96, 90, 108, 48);
    c.stroke();
    c.fillStyle = 'rgba(255, 255, 255, 0.85)';
    c.beginPath();
    c.arc(86, 34, 8, 0, TAU);
    c.fill();
  });
}

/** the cuttlefish's body, head, eyes, fins and arms, and the colours going over them */
class Body {
  constructor(scene) {
    this.pale = 0; // (0..1: how white it's gone, alarmed)
    this.clouds = 5.5; // (how quick the dark clouds pass down it)
    const g = (this.group = new THREE.Group());
    g.rotation.order = 'YZX'; // (turned, then its head up, then rolled)
    g.visible = false;
    scene.add(g);

    // its skin (its colours worked out afresh every frame: see paint), and the markings on it that stay put
    const mantle = part(G.sphere(1, 34, 18), 0xffffff, [MANTLE.x, 0, 0], [0, 0, 0], MANTLE.r);
    const head = part(G.sphere(1, 24, 14), 0xffffff, [HEAD.x, HEAD.y, 0], [0, 0, 0], HEAD.r);
    const skin = merge([mantle, head]);
    skin.attributes.color.setUsage(THREE.DynamicDrawUsage);
    const P = skin.attributes.position, N = skin.attributes.normal, n = P.count;
    this.v = { x: new Float32Array(n), z: new Float32Array(n), edge: new Float32Array(n), under: new Float32Array(n), mark: new Float32Array(n) };
    for (let i = 0; i < n; i++) {
      const x = P.getX(i), z = P.getZ(i), ny = N.getY(i), top = smoothstep(0.1, 0.5, ny);
      this.v.x[i] = x;
      this.v.z[i] = z;
      this.v.edge[i] = Math.abs(N.getZ(i)) ** 3;
      this.v.under[i] = smoothstep(0.1, -0.55, ny);
      const zebra = smoothstep(0.8, 0.97, Math.sin(x * 2.3 + 1.4 * Math.sin(z * 0.8))) * 0.7, spot = Math.sin(x * 3.1) * Math.sin(z * 3.7 + x) > 0.82 ? 0.8 : 0;
      this.v.mark[i] = Math.max(zebra, spot) * top;
    }
    this.skin = new THREE.Mesh(skin, vcMat());
    this.skin.castShadow = true;

    // its fin, a frilly skirt round either side of its body (rippling: see ripple), sea-green and blue, edged white
    const cols = FIN.n + 1, fin = new THREE.BufferGeometry(), idx = [], fc = [];
    for (let s = 0; s < 2; s++) {
      for (let r = 0; r < 3; r++) {
        for (let i = 0; i < cols; i++) {
          const c = r === 0 ? C.purple : r === 1 ? _c.copy(C.teal).lerp(C.blue, 0.5 + 0.5 * Math.sin(i * 0.7)) : C.white;
          fc.push(c.r, c.g, c.b);
        }
      }
      for (let r = 0; r < 2; r++) {
        for (let i = 0; i < FIN.n; i++) {
          const a = (s * 3 + r) * cols + i, b = a + cols;
          idx.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
    }
    fin.setAttribute('position', new THREE.BufferAttribute(new Float32Array(2 * 3 * cols * 3), 3).setUsage(THREE.DynamicDrawUsage));
    fin.setAttribute('color', new THREE.Float32BufferAttribute(fc, 3));
    fin.setIndex(idx);
    this.fin = new THREE.Mesh(fin, toonMat({ vertexColors: true, side: THREE.DoubleSide }));
    this.fin.frustumCulled = false;

    // its eyes, out either side of its head, looking up and forward a bit (bulging out of it, like lenses)
    const lens = (r, uv) => {
      const geo = new THREE.SphereGeometry(r, 28, 14);
      if (uv) { // (the eye's picture, flat on the front of it)
        const p = geo.attributes.position, u = geo.attributes.uv;
        for (let i = 0; i < p.count; i++) u.setXY(i, 0.5 + p.getX(i) / (2 * r), 0.5 + p.getY(i) / (2 * r));
      }
      return geo.scale(1, 1, 0.3);
    };
    const tex = eyeTex(), lidGeo = lens(1.1), eyeGeo = lens(0.88, true);
    const lidMat = toonMat({ color: 0x4a1d52 }), eyeMat = toonMat({ map: tex });
    for (const s of [-1, 1]) {
      const zA = new THREE.Vector3(0.28, 0.5, 0.82 * s).normalize(), xA = new THREE.Vector3(0, 1, 0).cross(zA).normalize(), yA = zA.clone().cross(xA);
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xA, yA, zA));
      const at = new THREE.Vector3(HEAD.x + HEAD.r[0] * 0.25, HEAD.y + HEAD.r[1] * 0.42, s * HEAD.r[2] * 0.87);
      const lid = new THREE.Mesh(lidGeo, lidMat), eye = new THREE.Mesh(eyeGeo, eyeMat);
      lid.position.copy(at).addScaledVector(zA, -0.06);
      eye.position.copy(at).addScaledVector(zA, 0.05);
      lid.quaternion.copy(q);
      eye.quaternion.copy(q);
      g.add(lid, eye);
    }
    g.add(this.skin, this.fin);
    g.traverse((o) => { o.userData.moves = true; }); // (nothing for the birds going over to fly into: see Flyovers)

    // and its arms, round the front of its head (bent into shape out in the world, every frame: see shapeArms)
    const paint = (u, up, i, j, t, out) => {
      out.copy(C.purple).lerp(C.magenta, 0.5 + 0.5 * Math.sin(u * 5 + t * 0.9 + j));
      out.lerp(C.teal, smoothstep(0.5, 0.95, Math.sin(u * 18 - t * 5)) * 0.6);
      if ((i * 3 + j * 2) % 7 === 0 && i % 2) out.lerp(C.white, 0.7);
      out.lerp(C.belly, smoothstep(-0.25, -0.85, up) * 0.8); // (and paler underneath)
      if (this.pale) out.lerp(C.pale, this.pale);
    };
    this.arms = Array.from({ length: ARM.n }, (_, i) => {
      const a = ((i + 0.5) / ARM.n) * TAU, tube = new Tube(16, 8, (u) => lerp(ARM.rad[0], ARM.rad[1], u ** 0.8), paint);
      tube.mesh.visible = false;
      scene.add(tube.mesh);
      return { tube, a, len: lerp(ARM.len[0], ARM.len[1], (1 - Math.cos(a)) / 2) * rand(0.9, 1.1), ph: rand(0, TAU), ctrl: Array.from({ length: 5 }, () => new THREE.Vector3()) };
    });
  }

  /** at (x, y, z), turned `yaw`, head up `pitch`, rolled `roll`, with its arms spread out (`spread`, 0..1), at time t */
  place(x, y, z, yaw, pitch, roll, spread, t) {
    const g = this.group;
    g.visible = true;
    g.position.set(x, y, z);
    g.rotation.set(roll, yaw, pitch);
    g.updateMatrixWorld(true);
    this.paint(t);
    this.ripple(t);
    this.shapeArms(t, spread);
  }

  hide() {
    this.group.visible = false;
    for (const a of this.arms) a.tube.mesh.visible = false;
  }

  /** its colours, going over it: dark clouds rolling down it from its tail to its head, over the rest */
  paint(t) {
    const { x, z, edge, under, mark } = this.v, col = this.skin.geometry.attributes.color, A = col.array, pale = this.pale;
    for (let i = 0, n = x.length; i < n; i++) {
      const xi = x[i], zi = z[i];
      _c.copy(C.purple).lerp(C.magenta, 0.5 + 0.5 * Math.sin(xi * 0.45 + zi * 0.6 + t * 0.8));
      if (mark[i]) _c.lerp(C.white, mark[i]);
      _c.lerp(C.cloud, smoothstep(0.3, 0.95, Math.sin(xi * 0.7 - t * this.clouds + Math.abs(zi) * 0.35)) * 0.72 * (1 - under[i]));
      if (edge[i] > 0.02) _c.lerp(_c2.copy(C.teal).lerp(C.blue, 0.5 + 0.5 * Math.sin(xi * 0.8 + t * 2.4)), edge[i] * 0.85);
      _c.lerp(C.belly, under[i]);
      if (pale) _c.lerp(C.pale, pale);
      A[i * 3] = _c.r;
      A[i * 3 + 1] = _c.g;
      A[i * 3 + 2] = _c.b;
    }
    col.needsUpdate = true;
  }

  /** its fin rippling along either side of it, the way it gets about */
  ripple(t) {
    const geo = this.fin.geometry, P = geo.attributes.position.array, cols = FIN.n + 1;
    for (let s = 0; s < 2; s++) {
      for (let i = 0; i < cols; i++) {
        const u = i / FIN.n, x = lerp(FIN.from, FIN.to, u), taper = Math.sin(Math.PI * u) ** 0.5;
        const w = MANTLE.r[2] * Math.sqrt(Math.max(0, 1 - ((x - MANTLE.x) / MANTLE.r[0]) ** 2)), wave = Math.sin(u * 11 - t * 7.5 + s) * 0.55 * taper;
        for (let r = 0; r < 3; r++) {
          const k = r / 2, j = ((s * 3 + r) * cols + i) * 3;
          P[j] = x;
          P[j + 1] = FIN.y + wave * k * k;
          P[j + 2] = (s ? -1 : 1) * (w * 0.95 + FIN.w * taper * k);
        }
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
  }

  /** its arms: bunched up in front of its head (spread 0), or splayed out and writhing (spread 1), out in the world */
  shapeArms(t, spread) {
    const m = this.group.matrixWorld;
    for (const a of this.arms) {
      const ca = Math.cos(a.a), sa = Math.sin(a.a), rx = HEAD.x + HEAD.r[0] * 0.8, ry = HEAD.y + ca * 1.15, rz = sa * 1.55;
      _d.set(1, ca * 0.8 * spread, sa * 0.9 * spread).normalize(); // (the way it reaches out)
      const curl = (0.22 + 0.2 * Math.sin(t * 1.3 + a.ph)) * spread;
      for (let k = 0; k < 5; k++) {
        const s = (k / 4) * a.len, w = (Math.sin(t * 2.2 + a.ph + k * 1.1) * 0.5 * spread + Math.sin(t * 0.9 + a.ph) * 0.15) * (k / 4);
        _r.set(0, ca, sa); // (out from the middle of them)
        _s.set(0, -sa, ca); // (round)
        a.ctrl[k].set(rx, ry, rz).addScaledVector(_d, s).addScaledVector(_r, (curl * s * s) / a.len).addScaledVector(_s, w * a.len * 0.3).applyMatrix4(m);
      }
      a.tube.shape(a.ctrl, _r.set(0, ca, sa).transformDirection(m), t);
      a.tube.mesh.visible = true;
    }
  }
}

/* ------------------------------------------------------------------ dark patches on the water */
let SOFT = null; // (a round blob, soft round the edges)
/** a dark patch on the water, riding the swell: its shadow coming up from the deep, or a cloud of its ink */
class Patch {
  constructor(scene, color) {
    SOFT ??= canvasTexture(64, 64, (c) => {
      const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255, 255, 255, 1)');
      g.addColorStop(0.5, 'rgba(255, 255, 255, 0.8)');
      g.addColorStop(1, 'rgba(255, 255, 255, 0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 64, 64);
    });
    this.geo = new THREE.RingGeometry(0.02, 1, 20, 5);
    this.base = this.geo.attributes.position.array.slice(); // (each point, on a disc 1 across, flat in xy)
    this.geo.attributes.position.setUsage(THREE.DynamicDrawUsage);
    this.mesh = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color, map: SOFT, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2; // (after the water, which is see-through too)
    this.mesh.visible = false;
    this.mesh.userData.moves = true;
    scene.add(this.mesh);
  }

  /** at (x, z), rx along by rz across (half), turned `yaw`, `opacity` see-through, on the swell as it is at time t */
  set(x, z, rx, rz, yaw, opacity, t, storm) {
    const P = this.geo.attributes.position.array, B = this.base, c = Math.cos(yaw), s = Math.sin(yaw);
    for (let i = 0; i < P.length; i += 3) {
      const bx = B[i] * rx, bz = B[i + 1] * rz, X = x + bx * c + bz * s, Z = z - bx * s + bz * c;
      P[i] = X;
      P[i + 1] = swell(X, Z, t, storm) + 0.06;
      P[i + 2] = Z;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.mesh.material.opacity = opacity;
    this.mesh.visible = opacity > 0.005;
  }

  hide() { this.mesh.visible = false; }
}

/* ------------------------------------------------------------------ the cuttlefish */
export class Cuttle {
  constructor(game) {
    this.game = game;
    this.state = 'lurk'; // 'lurk' (waiting for her) | 'brew' | 'rise' | 'fight' | 'beaten' | 'dive' (off, beaten) | 'sink' (off, called off) | 'gone' (for good)
    this.t = 0;
    this.beaten = false;
    this.arms = []; // (its tentacles: up, or on their way)
    this.fish = []; // (the fish it churned up, for the save)
    this.sent = this.down = 0; // (tentacles it's sent up after her, and ones that have been beaten)
    this.recoil = 0;
    this.hp = 0;
    this.ox = this.oz = this.face = this.a1 = 0;
    this.body = new Body(game.scene);
    this.shade = new Patch(game.scene, 0x0b0a1c);
    this.inks = Array.from({ length: 4 }, () => ({ p: new Patch(game.scene, INK), x: 0, z: 0, r: 0, yaw: 0, t: 0, life: 1, left: 0 }));
    this.bossBar = { def: { name: NAME, hp: ARMS * ARM_HP }, hp: 0, grip: null }; // (see bar)
  }

  /** every frame, before the foes (it sends its tentacles up among them) */
  update(dt) {
    const g = this.game, f = g.ferry, p = g.player;
    const aboard = g.world.zoneOf(p.pos.x, p.pos.z) === FERRY;
    // (you've gone down, and come round somewhere else: it's off)
    if ((this.state === 'brew' || this.state === 'rise' || this.state === 'fight') && !aboard) this.callOff();
    const t = (this.t += dt);
    switch (this.state) {
      case 'lurk':
        if (!this.beaten && aboard && p.life === 'ok' && f.state === 'sailing' && Math.abs(f.across - WHERE) < WINDOW) this.brew();
        break;
      case 'brew':
        if (t >= TIME.brew) { this.state = 'rise'; this.t = 0; this.broke = false; }
        break;
      case 'rise':
        if (!this.broke && t > TIME.rise * 0.3) this.surface();
        if (this.broke) this.sendArms();
        if (t >= TIME.rise) { this.state = 'fight'; this.t = 0; }
        break;
      case 'fight':
        this.sendArms();
        break;
      case 'beaten':
        if (t >= TIME.beaten) this.dive();
        break;
      case 'dive':
        if (t >= SAIL_AT && f.held) { f.release(); g.audio.horn(); } // (and she's off again)
        if (t >= TIME.dive) {
          this.state = 'gone';
          f.release();
          g.hud.toast("It's gone! And it's left you a deck full of fish: get them to a mound at Circular Quay", 5);
        }
        break;
      case 'sink':
        if (t >= TIME.sink) this.state = 'lurk';
        break;
    }
    if (this.arms.some((a) => a.gone)) this.arms = this.arms.filter((a) => !a.gone);
    if (this.fish.some((o) => o.gone)) this.fish = this.fish.filter((o) => !o.gone);
    // (a tentacle hurt, it blanches)
    const hp = this.arms.reduce((s, a) => s + (a.alive ? Math.max(0, a.hp) : 0), 0);
    if (hp < this.hp) this.body.pale = Math.min(0.55, this.body.pale + (this.hp - hp) * 0.05);
    this.hp = hp;
    this.pose(dt);
    this.updateInk(dt);
    // (over at the Quay, with fish still aboard: a word about where they go)
    if (this.beaten && !this.toldFish && f.docked === 'quay' && aboard && this.fish.some((o) => !o.gone && g.world.zoneOf(o.pos.x, o.pos.z) === FERRY)) {
      this.toldFish = true;
      g.hud.toast("Throw turkeys at the fish and they'll carry them off the ferry, to the mound on the Quay", 5);
    }
  }

  /** here it comes: the storm closing in, her pulled up short, and it circling under her */
  brew() {
    const g = this.game, f = g.ferry;
    this.state = 'brew';
    this.t = 0;
    this.sent = this.down = 0;
    this.recoil = 0;
    f.hold();
    g.storm.brew();
    // (it'll come up out in front of you, the way you're looking, off her left side and facing her middle: where
    // you'll see it, over her cabins)
    const yaw = g.cam.yaw + g.cam.swing, s = -Math.sin(yaw) >= 0 ? 1 : -1;
    this.ox = clamp(g.player.pos.x - f.x, -14, 14) + s * SPOT.ahead;
    this.oz = -s * SPOT.aside;
    this.face = Math.atan2(this.oz, -this.ox);
    this.a1 = Math.atan2(this.oz / SPOT.circle[1], this.ox / SPOT.circle[0]);
    g.hud.toast("The sky's gone black... and something big is circling the ferry!", 4.5);
    g.audio.moan(1.5);
  }

  /** up it comes, out in front of her, in a burst of spray (and a crack of lightning behind it) */
  surface() {
    const g = this.game, f = g.ferry, x = f.x + this.ox, z = LANE + this.oz, d = Math.hypot(this.ox, this.oz);
    this.broke = true;
    g.fx.splash(x, SEA, z, 6);
    for (let i = 0; i < 3; i++) g.fx.burst(_v.set(x + rand(-4, 4), SEA + 0.5, z + rand(-3, 3)), { glow: true, n: 22, colors: [0xffffff, 0xdff6ff, 0xbfe3f0], speed: [2, 6], up: [5, 11], grav: 10, size: [0.1, 0.24], life: [0.9, 1.6] });
    for (let i = 0; i < 4; i++) g.fx.ripple(x, SEA + 0.1, z, 6 + i * 4, 1.5 + i * 0.5, 0.35);
    g.storm.strike(x + (this.ox / d) * 55 + rand(-12, 12), z + (this.oz / d) * 55 + rand(-12, 12));
    g.audio.sploosh();
    g.audio.moan(2.2);
    g.shake(0.7);
    g.hud.banner('GIANT CUTTLEFISH', 3);
    g.hud.toast('Throw turkeys on its tentacles as they come aboard, and keep out of the red!', 5);
  }

  /** its tentacles, up over her sides: as many at once as it's got the fight in it for, till it's got none left */
  sendArms() {
    const g = this.game, most = this.down >= 2 ? AT_ONCE[1] : AT_ONCE[0];
    while (this.sent < ARMS && this.arms.filter((a) => a.alive).length < most) {
      const a = new Tentacle(g, this, this.sent < FIRST.length ? FIRST[this.sent] : rand(...NEXT));
      g.enemies.list.push(a);
      this.arms.push(a);
      this.sent++;
    }
  }

  /**
   * Somewhere for tentacle t to come up over her side: a berth nobody else is on (or in the way of), near the action
   * (near you), and preferably not where it just was. Null if there's nowhere
   */
  berthFor(t) {
    const g = this.game, f = g.ferry, p = g.player.pos, used = this.arms.filter((a) => a !== t && a.berth).map((a) => a.berth);
    let best = null, bd = Infinity;
    for (const b of BERTHS) {
      if (used.includes(b) || b.clash.some((c) => used.includes(c))) continue;
      const [x, z] = b.lie[1], d = Math.hypot(f.x + x - p.x, LANE + z - p.z) + rand(0, 9) + (b === t.last ? 30 : 0);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  /** one of its tentacles has been beaten (see Tentacle.onDeath) */
  lost() {
    const g = this.game, f = g.ferry;
    this.down++;
    this.recoil = 1;
    this.body.pale = 1;
    // (a squirt of ink, in front of it)
    const d = Math.hypot(this.ox, this.oz);
    this.squirt(f.x + this.ox * (1 - 9 / d), LANE + this.oz * (1 - 9 / d), 6);
    g.audio.moan(1.4);
    if (this.down < ARMS) {
      g.hud.toast(this.down === 1 ? "That's one tentacle off! It's got plenty more" : `Another one off! ${ARMS - this.down} to go`, 2.5);
      return;
    }
    // that's the lot: it's had enough
    this.state = 'beaten';
    this.t = 0;
    this.beaten = true;
    this.splashFish();
  }

  /** back down to the depths it goes, backwards, in a cloud of ink (with a banner, and the storm clearing) */
  dive() {
    const g = this.game, f = g.ferry;
    this.state = 'dive';
    this.t = 0;
    g.storm.clear();
    this.squirt(f.x + this.ox, LANE + this.oz, 16, 7);
    g.audio.sploosh();
    g.hud.banner('CUTTLEFISH SENT PACKING');
    g.audio.fanfare();
  }

  /** called off (you went down, and you're somewhere else now): it lets go of her and slinks off, and she turns back for you */
  callOff() {
    const g = this.game, f = g.ferry, p = g.player.pos;
    for (const a of this.arms) a.leave();
    this.state = 'sink';
    this.t = 0;
    g.storm.clear();
    f.release();
    f.headFor(g.world.zoneOf(p.x, p.z) === CITY ? 'quay' : 'wharf');
  }

  /**
   * The fish it churns up going back down: flung up out of the water all round her (a moment after it's gone under),
   * landing on her deck, clear of her cabins
   */
  splashFish() {
    const g = this.game, f = g.ferry;
    CATCH.forEach((kind, i) => {
      const s = Math.random() < 0.5 ? 1 : -1, x = rand(-15, 15);
      const from = new THREE.Vector3(f.x + x + rand(-2, 2), SEA, LANE + s * rand(8.5, 12));
      const dx = clamp(x + rand(-3, 3), -16.5, 16.5), dz = s * (Math.abs(dx) > 11.8 ? rand(0.3, 5.3) : rand(3.2, 5.4));
      const o = new Fish(g, kind, from.x, from.z, { from, dx, dz, wait: TIME.beaten + FISH_AT + i * 0.17 + rand(0, 0.25) });
      g.enemies.list.push(o);
      this.fish.push(o);
    });
  }

  /** (dev) you, aboard her, nearly halfway over, and up it comes (again, if it's been seen off before) */
  summon() {
    if (this.state !== 'lurk' && this.state !== 'gone') return;
    this.beaten = false;
    this.toldFish = false;
    this.state = 'lurk';
    this.game.ferry.skipTo(WHERE - WINDOW * 0.9);
  }

  /** whether it's at her, from the storm brewing till it's gone back down (the camera sits up to take it in) */
  get fighting() { return this.state === 'brew' || this.state === 'rise' || this.state === 'fight' || this.state === 'beaten' || this.state === 'dive'; }

  /** the harbour's shut past it, till it's been seen off (see World.route): nobody's getting over to the Quay */
  bars(gate) { return !this.beaten && gate === this.game.world.gates[FERRY]; }

  /** for the boss bar at the top of the screen: the lot of it, all its tentacles together (or null, out of a fight) */
  bar() {
    if (this.state !== 'rise' && this.state !== 'fight' && this.state !== 'beaten') return null;
    const b = this.bossBar;
    b.hp = (ARMS - this.sent) * ARM_HP;
    b.grip = null;
    for (const a of this.arms) {
      if (!a.alive) continue;
      b.hp += Math.max(0, a.hp);
      b.grip ??= a.grip;
    }
    return b;
  }

  /* ---------------------------------------------------------------- where it is */
  /** where it is, and how it's holding itself, whatever it's up to */
  pose(dt) {
    const g = this.game, f = g.ferry, t = this.t, time = g.time, b = this.body, st = this.state;
    this.recoil = Math.max(0, this.recoil - dt * 1.4);
    b.pale = Math.max(0, b.pale - dt * 1.6);
    b.clouds = st === 'beaten' ? 14 : 5.5 + this.recoil * 6;
    if (st === 'lurk' || st === 'gone') { b.hide(); this.shade.hide(); return; }
    let ox = this.ox, oz = this.oz, y, yaw = this.face, pitch = 0, roll = 0, spread = 1, shade = 0;
    if (st === 'brew') {
      // circling her, deep down (just a shadow, from up here), and round to where it'll come up
      const [ex, ez] = SPOT.circle, a = this.a1 - 0.85 * (TIME.brew - t), k = smoothstep(TIME.brew - 1.8, TIME.brew, t);
      ox = lerp(ex * Math.cos(a), this.ox, k);
      oz = lerp(ez * Math.sin(a), this.oz, k);
      const round = Math.atan2(-ez * Math.cos(a), -ex * Math.sin(a));
      yaw = round + angleDiff(round, this.face) * k;
      y = SEA + DEEP;
      spread = 0.15;
      shade = 0.42 * smoothstep(0, 1.5, t);
    } else if (st === 'rise') {
      const k = clamp(t / TIME.rise, 0, 1), e = 1 - (1 - k) ** 3;
      y = lerp(SEA + DEEP, SEA + UP.y, e) + Math.sin(k * Math.PI) * 0.8;
      pitch = UP.pitch * smoothstep(0, 0.7, k);
      spread = lerp(0.15, 1, smoothstep(0.25, 0.9, k));
      shade = 0.42 * (1 - smoothstep(0, 0.4, k));
    } else if (st === 'fight' || st === 'beaten') {
      // bobbing there, watching, head up and arms writhing (reeling back when it loses one)
      const worked = st === 'beaten' ? 1 : this.recoil;
      y = SEA + UP.y + 0.3 * Math.sin(time * 0.8) + g.storm.k * 0.25 * Math.sin(time * 0.83);
      pitch = UP.pitch + 0.06 * Math.sin(time * 0.6) - worked * 0.22;
      yaw = this.face + 0.12 * Math.sin(time * 0.33) + worked * 0.06 * Math.sin(time * 17);
      roll = 0.06 * Math.sin(time * 0.47);
      if (st === 'beaten') b.pale = Math.max(b.pale, 0.5 + 0.5 * Math.sin(t * 30)); // (flashing, all of a fright)
    } else {
      // 'dive' or 'sink': off it goes, backwards (the way they do), tail first down into the depths, arms trailing
      const k = clamp(t / (st === 'dive' ? TIME.dive : TIME.sink), 0, 1), back = 14 * smoothstep(0, 1, k);
      ox -= Math.cos(this.face) * back;
      oz += Math.sin(this.face) * back;
      y = lerp(SEA + UP.y, SEA + DEEP - 4, smoothstep(0.08, 1, k));
      pitch = lerp(UP.pitch, 1, smoothstep(0, 0.5, k));
      spread = lerp(1, 0.1, smoothstep(0, 0.4, k));
    }
    b.place(f.x + ox, y, LANE + oz, yaw, pitch, roll, spread, time);
    if (shade > 0.005) this.shade.set(f.x + ox, LANE + oz, 10, 5.5, yaw, shade, time, g.storm.k);
    else this.shade.hide();
  }

  /** a cloud of ink in the water at (x, z), spreading out to r across, over `life` seconds */
  squirt(x, z, r, life = 5) {
    const o = this.inks.reduce((a, b) => (a.left <= b.left ? a : b));
    Object.assign(o, { x, z, r, yaw: rand(0, TAU), t: 0, life, left: life });
    this.game.fx.burst(_v.set(x, SEA + 0.3, z), { n: 18, colors: [0x120a1c, 0x24163a, 0x0a0a10, 0x3a1f4f], speed: [0.8, 3], up: [0.3, 1.6], grav: 1.5, drag: 1.8, size: [0.25, 0.5], grow: 1.6, life: [1.2, 2.2] });
  }

  updateInk(dt) {
    const g = this.game;
    for (const o of this.inks) {
      if (o.left <= 0) { o.p.hide(); continue; }
      o.t += dt;
      o.left -= dt;
      const k = o.t / o.life, r = o.r * (0.25 + 0.75 * (1 - (1 - k) ** 2));
      o.p.set(o.x, o.z, r, r * 0.8, o.yaw, 0.85 * Math.min(1, k * 8) * (1 - k) ** 1.2, g.time, g.storm.k);
    }
  }

  /* ---------------------------------------------------------------- the save */
  /** whether it's been seen off (null if not), and the fish it left lying about: [kind, x, z, heading] each */
  save() {
    if (!this.beaten) return null;
    return { fish: this.fish.filter((o) => !o.gone).map((o) => { const at = o.restAt(_v); return [o.kind, r2(at.x), r2(at.z), r2(o.heading)]; }) };
  }

  /** seen off, in a save: and its fish, wherever they'd got to */
  load(d) {
    const g = this.game;
    this.beaten = true;
    this.state = 'gone';
    for (const [kind, x, z, h] of d.fish ?? []) {
      if (!KINDS[kind]) continue;
      const o = new Fish(g, kind, x, z);
      o.heading = h;
      g.enemies.list.push(o);
      this.fish.push(o);
    }
  }
}
