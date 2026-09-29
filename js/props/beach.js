import * as THREE from 'three';
import { part, merge, vcMesh, vcMat, toonMat, G, limb, rand, pick, clamp, smoothstep, lerp, TAU, canvasTexture } from '../util.js';
import { building } from './city.js';

/* ------------------------------------------------------------------ layout & water */
export const Z0 = -300; // the beach starts here and runs north to the wharf
export const SEA = -0.3;
export const POOLS = [
  { x: -6, z: -389, r: 7, floor: -1.25, level: -0.22 }, // the King Crab's rock pool
  { x: -2, z: -339, r: 3.3, floor: -1.0, level: -0.2 }, // a tidal pool on the sand
  { x: 12, z: -381, r: 2.6, floor: -0.9, level: -0.2 },
  { x: -26, z: -384, r: 2.8, floor: -0.9, level: -0.2 },
];
export const PUDDLES = [{ x: -12, z: -324, r: 2.2 }, { x: 4, z: -356, r: 1.8 }, { x: -18, z: -364, r: 2.4 }];
export const SANDBAR = { x: 33, z: -350, r: 4 };
// water shallower than this is wading; deeper and turkeys have to swim
const WADE = 0.02, DEEP = 0.25;
const DRY = { depth: 0, level: 0 }, SEA_DEEP = { depth: 2, level: SEA, sea: true }, SEA_WADE = { depth: 1, level: SEA, sea: true };
const PUDDLE_LEVEL = -0.06, PUDDLE = { depth: 1, level: PUDDLE_LEVEL };
for (const p of POOLS) { p.deep = { depth: 2, level: p.level }; p.wade = { depth: 1, level: p.level }; }

export function shoreX(z) { return 15 + 2.5 * Math.sin((z + 50) * 0.045); }
const onWharf = (x, z) => z < -401 && x < 8;

// beach umbrellas (bouncy!) and the red-and-yellow lifesaving flags (dig them out and steal them);
// both are set up by main.js as toys / loot
export const UMBRELLAS = [[-20, -335, 0xe84a8a, 0xffffff], [-6, -352, 0x1fb5c9, 0xffffff], [-24, -370, 0xffd21f, 0x3a6ff0], [0, -368, 0xff6b35, 0xffffff]];
export const FLAGS = [-332, -364].map((z) => [shoreX(z) - 5, z]);

/** the swell on the open sea (the ocean mesh uses the same formula, so floaters ride the waves) */
export function seaWave(x, z, t) { return 0.07 * Math.sin(x * 0.28 + t * 1.3) + 0.05 * Math.sin(z * 0.21 - t * 1.05); }

export function beachHeight(x, z) {
  const sx = shoreX(z);
  let h = x < sx ? -0.25 * smoothstep(sx - 10, sx, x) : -0.25 - 1.3 * smoothstep(sx, sx + 7, x);
  const db = Math.hypot(x - SANDBAR.x, z - SANDBAR.z);
  if (db < SANDBAR.r + 3) h = lerp(0.08, h, smoothstep(SANDBAR.r - 1, SANDBAR.r + 3, db));
  h += 0.35 * (1 - smoothstep(-33.5, -31, x)); // promenade up on the west side
  const rock = smoothstep(-374, -384, z); // rocky headland at the north end
  if (rock > 0) h = lerp(h, Math.max(h, 0.1) + 0.25 + 0.2 * Math.sin(x * 0.55) * Math.cos((z + 50) * 0.7), rock * (x < sx + 2 ? 1 : 0.35));
  for (const p of POOLS) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.r + 0.5) h = Math.min(h, lerp(p.floor, h, smoothstep(p.r * 0.5, p.r + 0.5, d)));
  }
  for (const p of PUDDLES) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.r) h = Math.min(h, lerp(-0.14, h, smoothstep(p.r * 0.6, p.r, d)));
  }
  if (onWharf(x, z)) h = 0.4;
  return h;
}

/** the ground as the world sees it (the beach blends in from the Oval's fence) */
export function beachGround(x, z) { return beachHeight(x, z) * smoothstep(-300, -303, z); }

/**
 * { depth: 0 dry | 1 wading | 2 deep, level: still-water height, sea?: true }
 * Depth comes from how far the surface is above the ground, so it always matches what you see.
 */
export function waterAt(x, z) {
  if (z > Z0 - 1) return DRY;
  let wet = null;
  for (const p of POOLS) if (Math.hypot(x - p.x, z - p.z) < p.r) { wet = p; break; }
  if (!wet) {
    for (const p of PUDDLES) {
      if (Math.hypot(x - p.x, z - p.z) < p.r) return PUDDLE_LEVEL - beachGround(x, z) > WADE ? PUDDLE : DRY;
    }
    if (x < shoreX(z) - 3) return DRY;
  }
  const level = wet ? wet.level : SEA;
  const d = level - beachGround(x, z);
  if (d < WADE) return DRY;
  if (wet) return d > DEEP ? wet.deep : wet.wade;
  return d > DEEP ? SEA_DEEP : SEA_WADE;
}

/** which way the nearest shore is from a spot in the water (pools: outwards; the sea: west) */
export function shoreDir(x, z, out) {
  for (const p of POOLS) {
    const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
    if (d < p.r) return d > 1e-4 ? out.set(dx / d, 0, dz / d) : out.set(1, 0, 0);
  }
  return out.set(-1, 0, 0);
}

export function isSand(x, z) {
  return z < Z0 - 2 && z > -398 && x > -31 && waterAt(x, z).depth === 0;
}

/* ------------------------------------------------------------------ building bits */
function put(world, geo, x, z, rotY = 0, colliders = [], y = null) {
  const m = vcMesh(geo, { cast: true, receive: true });
  m.position.set(x, y ?? world.groundHeight(x, z), z);
  m.rotation.y = rotY;
  world.scene.add(m);
  for (const [cx, cz, r] of colliders) world.colliders.push({ x: x + cx, z: z + cz, r });
  return m;
}

function norfolkPine(h) {
  const p = [limb([0, 0, 0], [0, h, 0], 0.28, 0.1, 0x6a5040, 8)];
  for (let i = 0; i < 7; i++) {
    const y = h * 0.3 + (i / 7) * h * 0.72, r = (1 - i / 7) * 2.2 + 0.4;
    p.push(part(G.cone(r, 0.9, 9), i % 2 ? 0x2f5a3a : 0x3a6a45, [0, y, 0], [0, i * 0.4, 0], [1, 0.55, 1]));
  }
  return merge(p);
}

function waterMat(color, opacity) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
}

/* ------------------------------------------------------------------ build */
export function buildBeach(world) {
  const s = world.scene;

  // --- ground: finer than the main plane so pools and the shoreline look right
  const g = new THREE.PlaneGeometry(260, 132, 260, 132).rotateX(-Math.PI / 2).translate(0, 0, -366);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  const C = {
    sand: new THREE.Color(0xecd9a4), sand2: new THREE.Color(0xe2cc92), wet: new THREE.Color(0xc9b27a), floor: new THREE.Color(0xb39c6a),
    path: new THREE.Color(0xcfcac0), grass: new THREE.Color(0x8cc458), rock: new THREE.Color(0x8e8b84), rock2: new THREE.Color(0x77746d),
    plank: new THREE.Color(0x9a7a55), plank2: new THREE.Color(0x876846),
  };
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = world.groundHeight(x, z);
    pos.setY(i, h);
    const sx = shoreX(z);
    if (onWharf(x, z)) c.copy(Math.floor(x * 1.5) % 2 ? C.plank : C.plank2);
    else if (x < -40) c.copy(C.grass);
    else if (x < -32) c.copy(C.path);
    else {
      const n = 0.5 + 0.5 * Math.sin(x * 1.7 + z * 0.9) * Math.sin(z * 1.3 - x * 0.4);
      c.copy(C.sand).lerp(C.sand2, n);
      c.lerp(C.wet, smoothstep(sx - 4, sx - 0.5, x));
      c.lerp(C.floor, smoothstep(sx, sx + 3, x));
      const rock = smoothstep(-376, -386, z) * (x < sx + 2 ? 1 : 0.5);
      if (rock > 0) c.lerp(Math.sin(x * 2.1 + z * 1.7) > 0 ? C.rock : C.rock2, rock);
      if (h < -0.35 && x < sx) c.lerp(C.floor, 0.6); // pool floors
    }
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const ground = new THREE.Mesh(g, vcMat());
  ground.receiveShadow = true;
  s.add(ground);

  // --- the ocean: gently heaving, with foam rolling in to the shore
  const ocean = new THREE.PlaneGeometry(240, 170, 60, 42).rotateX(-Math.PI / 2).translate(128, SEA, -368);
  const oceanMesh = new THREE.Mesh(ocean, toonMat({ color: 0x1fa3c8, transparent: true, opacity: 0.8, depthWrite: false }));
  s.add(oceanMesh);
  const opos = ocean.attributes.position;
  const foamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false });
  const foams = [];
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 130).rotateX(-Math.PI / 2), foamMat.clone());
    f.position.set(0, SEA + 0.03, -366);
    f.userData.t = i / 4;
    s.add(f);
    foams.push(f);
  }
  // a wash line that hugs the curvy shore
  const wash = [];
  for (let z = Z0 - 2; z > -432; z -= 2) {
    const x0 = shoreX(z), x1 = shoreX(z - 2);
    wash.push(part(new THREE.PlaneGeometry(0.9, Math.hypot(2, x1 - x0) + 0.1).rotateX(-Math.PI / 2), 0xffffff, [x0 + 0.1, SEA + 0.04, z - 1], [0, -Math.atan2(x1 - x0, 2), 0]));
  }
  const washMesh = new THREE.Mesh(merge(wash), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false }));
  s.add(washMesh);

  // --- rock pools & puddles
  const poolMats = [];
  for (const p of POOLS) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(p.r * 0.98, 40).rotateX(-Math.PI / 2), waterMat(0x3fb7d6, 0.72));
    m.position.set(p.x, p.level, p.z);
    s.add(m);
    poolMats.push(m.material);
    const rim = [];
    for (let i = 0; i < Math.round(p.r * 4); i++) {
      const a = (i / Math.round(p.r * 4)) * TAU + rand(-0.1, 0.1), rr = p.r + rand(0.2, 0.6);
      const x = p.x + Math.cos(a) * rr, z = p.z + Math.sin(a) * rr;
      rim.push(part(G.dodec(rand(0.3, 0.6)), pick([0x8e8b84, 0x77746d, 0x9a968d]), [x - p.x, world.groundHeight(x, z), z - p.z], [rand(0, 3), rand(0, 3), 0], [1, 0.6, 1]));
    }
    put(world, merge(rim), p.x, p.z, 0, [], 0);
  }
  for (const p of PUDDLES) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(p.r * 0.9, 28).rotateX(-Math.PI / 2), waterMat(0x9bdcec, 0.55));
    m.position.set(p.x, -0.06, p.z);
    s.add(m);
  }

  // --- promenade: kerb, Norfolk pines, the Pavilion and the hills of apartments
  s.add(vcMesh(merge([part(G.box(0.35, 0.3, 98), 0xbdb7aa, [-32.2, 0.15, -350])]), { cast: false, receive: true }));
  for (const z of [-312, -332, -352, -372, -392]) {
    const h = rand(9, 11);
    const m = vcMesh(norfolkPine(h));
    m.position.set(-40, world.groundHeight(-40, z), z);
    s.add(m);
    world.addSway(m);
    world.colliders.push({ x: -40, z, r: 0.5 });
    world.treeSpots.push({ x: -40, z, h: h * 0.6, palette: 'pine' });
  }
  const pav = [part(G.box(12, 5, 60), 0xefe2c4, [0, 2.5, 0]), part(G.box(13, 0.6, 61), 0xb5523b, [0, 5.3, 0])];
  for (let z = -27; z <= 27; z += 4.5) pav.push(part(G.box(0.3, 3.2, 2.4), 0x6e5a48, [6.05, 1.6, z]));
  put(world, merge(pav), -60, -350, 0, [], 0.3);
  const cols = [0xf1d9c9, 0xcfe0e8, 0xefe6cf, 0xdce8cf, 0xe8d0e0, 0xffffff];
  for (let z = -300; z > -430; z -= 12) {
    for (let k = 0; k < 2; k++) {
      const h = rand(7, 16) + k * 6;
      const b = building(10, h, 10, pick(cols));
      b.position.set(-76 - k * 14 + rand(-2, 2), h / 2 + 2 + k * 3, z + rand(-2, 2));
      s.add(b);
    }
  }

  // --- beach furniture (not stealable: the lifeguards would notice)
  put(world, merge([
    part(G.box(2.4, 1.4, 2.2), 0xffd21f, [0, 2.6, 0]),
    part(G.box(2.6, 0.15, 2.4), 0xd9453b, [0, 3.4, 0]),
    part(G.box(2.2, 0.5, 0.05), 0x9fd0ee, [0, 2.8, 1.12]),
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z]) => part(G.box(0.14, 2, 0.14), 0xdddddd, [x, 1, z])),
    part(G.cyl(0.03, 0.03, 1.6, 6), 0x999999, [1.1, 4.2, 1.1]),
    part(G.box(0.7, 0.45, 0.02), 0xd9453b, [1.45, 4.7, 1.1]),
    part(G.box(0.7, 0.22, 0.021), 0xffd21f, [1.45, 4.59, 1.1]),
  ]), -4, -312, 0.3, [[0, 0, 1.4]]);
  put(world, merge([
    part(G.cyl(0.6, 0.75, 0.6, 10), 0xdcc588, [0, 0.3, 0]),
    part(G.cyl(0.22, 0.25, 0.9, 8), 0xdcc588, [0.45, 0.45, 0.2]),
    part(G.cone(0.25, 0.3, 8), 0xd2b87a, [0.45, 1.05, 0.2]),
    part(G.cyl(0.2, 0.22, 0.75, 8), 0xdcc588, [-0.4, 0.4, -0.2]),
    part(G.cone(0.22, 0.28, 8), 0xd2b87a, [-0.4, 0.92, -0.2]),
    part(G.box(0.02, 0.18, 0.28), 0xd9453b, [0.45, 1.35, 0.2]),
  ]), -14, -344, 0, [[0, 0, 0.9]]);
  for (let i = 0; i < 6; i++) {
    const x = rand(-20, 30), z = rand(-388, -380);
    if (!world.isFree(x, z, 1.5) || waterAt(x, z).depth) continue;
    put(world, part(G.dodec(rand(0.8, 1.3)), 0x86837c, [0, 0.2, 0], [rand(0, 3), rand(0, 3), 0], [1.3, 0.7, 1]), x, z, 0, [[0, 0, 1.1]]);
  }

  // --- the wharf beyond the last gate: ferries to Circular Quay... coming soon
  for (let x = -44; x < 8; x += 3) put(world, part(G.cyl(0.2, 0.2, 2.2, 8), 0x5a4632, [0, -0.6, 0]), x, -416, 0, [], 0.4);
  const sign = canvasTexture(512, 256, (c2, w, h) => {
    c2.fillStyle = '#1d5f3a'; c2.fillRect(0, 0, w, h);
    c2.strokeStyle = '#fff'; c2.lineWidth = 10; c2.strokeRect(12, 12, w - 24, h - 24);
    c2.fillStyle = '#fff'; c2.textAlign = 'center';
    c2.font = 'bold 44px sans-serif'; c2.fillText('FERRIES TO', w / 2, 80);
    c2.font = 'bold 56px sans-serif'; c2.fillText('CIRCULAR QUAY', w / 2, 145);
    c2.fillStyle = '#ffd21f'; c2.font = 'bold 40px sans-serif'; c2.fillText('COMING SOON', w / 2, 210);
  });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.7), toonMat({ map: sign, side: THREE.DoubleSide }));
  board.position.set(-20, 2.7, -407);
  s.add(board);
  put(world, merge([part(G.box(0.15, 2.2, 0.15), 0x5a4632, [-1.5, 1.1, 0]), part(G.box(0.15, 2.2, 0.15), 0x5a4632, [1.5, 1.1, 0])]), -20, -407.1, 0, [[-1.5, 0, 0.2], [1.5, 0, 0.2]], 0.4);
  const ferry = put(world, merge([
    part(G.box(5, 1.4, 15), 0x1d6b3a, [0, 0.4, 0]),
    part(G.box(4.6, 1.3, 11), 0xf3e9cf, [0, 1.7, 0]),
    part(G.box(4.8, 0.2, 11.4), 0x1d6b3a, [0, 2.45, 0]),
    part(G.box(3.2, 1.0, 4), 0xf3e9cf, [0, 3.0, 0]),
    part(G.cyl(0.45, 0.5, 1.6, 12), 0xffd21f, [0, 4.1, 0]),
    ...Array.from({ length: 8 }, (_, i) => part(G.box(0.05, 0.6, 0.9), 0x2c3e55, [2.31, 1.8, -4.5 + i * 1.3])),
  ]), 32, -408, 0.05, [], SEA);
  ferry.userData.bob = true;

  // --- animation: swell, foam rolling in, glinting pools; and the ferry, which gives you a toot (and puffs steam out
  // of its funnel) whenever you come out onto the wharf
  let t0 = 0, onWharfNow = true, tootT = 0, tootCool = 0;
  const funnel = new THREE.Vector3();
  return {
    update(dt, t) {
      t0 += dt;
      for (let i = 0; i < opos.count; i++) opos.setY(i, SEA + seaWave(opos.getX(i), opos.getZ(i), t));
      opos.needsUpdate = true;
      ocean.computeVertexNormals();
      for (const f of foams) {
        f.userData.t = (f.userData.t + dt * 0.09) % 1;
        const k = f.userData.t;
        f.position.x = 15 + 14 * (1 - k);
        f.scale.x = 1 + k * 2;
        f.material.opacity = Math.sin(k * Math.PI) * 0.6;
      }
      washMesh.material.opacity = 0.35 + 0.25 * Math.sin(t * 1.3);
      for (const m of poolMats) m.opacity = 0.68 + 0.06 * Math.sin(t * 2);
      ferry.position.y = SEA + Math.sin(t * 0.9) * 0.08;
      ferry.rotation.z = Math.sin(t * 0.7) * 0.02;
      const g = world.game, p = g.player.pos, was = onWharfNow;
      onWharfNow = onWharf(p.x, p.z);
      tootCool -= dt;
      if (onWharfNow && !was && tootCool <= 0) { tootT = 2.6; tootCool = 30; g.audio.horn(); }
      if (tootT > 0) {
        tootT -= dt;
        // (a puff for each blast: see Audio.horn)
        if ((tootT > 1.1 || tootT < 0.7) && Math.random() < dt * 30) {
          g.fx.burst(ferry.localToWorld(funnel.set(0, 5, 0)), { n: 1, colors: [0xffffff, 0xf2f2ee], speed: [0.2, 0.7], up: [2.5, 3.5], grav: -0.3, drag: 0.9, size: [0.2, 0.3], grow: 2.4, life: [1.4, 2.2], jitter: 0.2 });
        }
      }
    },
  };
}
