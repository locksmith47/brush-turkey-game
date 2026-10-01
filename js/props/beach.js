import * as THREE from 'three';
import { part, merge, vcMesh, vcMat, toonMat, G, limb, rand, pick, smoothstep, lerp, TAU, canvasTexture } from '../util.js';
import { building } from './city.js';

/*
 * Manly Beach. You come out of the oval onto the promenade with the sea straight ahead of you, and the beach
 * runs off to your right (south: the sea's on your left all the way along it), under the Norfolk pines, round
 * to the rocks at the Shelly Beach end, where the King Crab's got his rock pool. The way on to the wharf is
 * along the promenade from there.
 */
/* ------------------------------------------------------------------ layout & water */
export const X0 = -46, X1 = 70; // the beach's north and south ends
export const KERB = -192.2; // z: the promenade's kerb (up above the sand, from here back to the oval's fence)
export const SEA = -0.3;
export const POOLS = [
  { x: 55, z: -218, r: 7, floor: -1.25, level: -0.22 }, // the King Crab's rock pool, on the rocks at Shelly
  { x: 5, z: -222, r: 3.3, floor: -1.0, level: -0.2 }, // a tidal pool on the sand
  { x: 47, z: -236, r: 2.6, floor: -0.9, level: -0.2 },
  { x: 50, z: -198, r: 2.8, floor: -0.9, level: -0.2 },
];
export const PUDDLES = [{ x: -10, z: -212, r: 2.2 }, { x: 22, z: -228, r: 1.8 }, { x: 30, z: -206, r: 2.4 }];
export const SANDBAR = { x: 16, z: -257, r: 4 };
// boulders about the rocks at the Shelly Beach end ([x, z, size]): off to either side of the way the King Crab's
// key goes, up out of his pool to the gate onto the wharf (it's a big key, and wedges between any two in its way)
const BOULDERS = [[64, -226, 1.2], [66, -214, 1.0], [67, -205, 0.9], [60, -233, 1.1], [52, -230, 1.3], [47, -224, 1.0], [46, -208, 1.2], [49, -204, 0.9]];
// water shallower than this is wading; deeper and turkeys have to swim
const WADE = 0.02, DEEP = 0.25;
const DRY = { depth: 0, level: 0 }, SEA_DEEP = { depth: 2, level: SEA, sea: true }, SEA_WADE = { depth: 1, level: SEA, sea: true };
const PUDDLE_LEVEL = -0.06, PUDDLE = { depth: 1, level: PUDDLE_LEVEL };
for (const p of POOLS) { p.deep = { depth: 2, level: p.level }; p.wade = { depth: 1, level: p.level }; }

/** z of the water's edge, x along the beach */
export function shoreZ(x) { return -239 + 2.5 * Math.sin((x + 20) * 0.045); }
/** how much the ground at x, z is the rocks at the Shelly Beach end (0..1: not at all up on the promenade) */
const rocks = (x, z) => smoothstep(44, 52, x) * smoothstep(KERB + 0.5, KERB - 2.5, z);

// beach umbrellas (bouncy!) and the red-and-yellow lifesaving flags (dig them out and steal them);
// both are set up by main.js as toys / loot
export const UMBRELLAS = [[1, -204, 0xe84a8a, 0xffffff], [18, -218, 0x1fb5c9, 0xffffff], [36, -200, 0xffd21f, 0x3a6ff0], [34, -224, 0xff6b35, 0xffffff]];
export const FLAGS = [2, 30].map((x) => [x, shoreZ(x) + 5]);

/** the swell on the open sea (the ocean mesh uses the same formula, so floaters ride the waves) */
export function seaWave(x, z, t) { return 0.07 * Math.sin(x * 0.28 + t * 1.3) + 0.05 * Math.sin(z * 0.21 - t * 1.05); }

export function beachHeight(x, z) {
  const sz = shoreZ(x);
  let h = z > sz ? -0.25 * smoothstep(sz + 10, sz, z) : -0.25 - 1.3 * smoothstep(sz, sz - 7, z);
  const db = Math.hypot(x - SANDBAR.x, z - SANDBAR.z);
  if (db < SANDBAR.r + 3) h = lerp(0.08, h, smoothstep(SANDBAR.r - 1, SANDBAR.r + 3, db));
  h += 0.35 * smoothstep(KERB - 1.3, KERB + 1.2, z); // the promenade, up above the sand
  const rock = rocks(x, z);
  if (rock > 0) h = lerp(h, Math.max(h, 0.1) + 0.25 + 0.2 * Math.sin(z * 0.55) * Math.cos((x + 50) * 0.7), rock * (z > sz - 2 ? 1 : 0.35));
  for (const p of POOLS) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.r + 0.5) h = Math.min(h, lerp(p.floor, h, smoothstep(p.r * 0.5, p.r + 0.5, d)));
  }
  for (const p of PUDDLES) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.r) h = Math.min(h, lerp(-0.14, h, smoothstep(p.r * 0.6, p.r, d)));
  }
  return h;
}

/** the ground as the world sees it (the promenade rises up from the oval's fence) */
export function beachGround(x, z) { return beachHeight(x, z) * smoothstep(-178, -181, z); }

/**
 * { depth: 0 dry | 1 wading | 2 deep, level: still-water height, sea?: true }
 * Depth comes from how far the surface is above the ground, so it always matches what you see. (The beach is
 * the only water you can get into: the harbour's all wharf and ferry deck, as far as your feet go)
 */
export function waterAt(x, z) {
  if (z > KERB || x < X0 - 1 || x > X1) return DRY;
  let wet = null;
  for (const p of POOLS) if (Math.hypot(x - p.x, z - p.z) < p.r) { wet = p; break; }
  if (!wet) {
    for (const p of PUDDLES) {
      if (Math.hypot(x - p.x, z - p.z) < p.r) return PUDDLE_LEVEL - beachGround(x, z) > WADE ? PUDDLE : DRY;
    }
    if (z > shoreZ(x) + 3) return DRY;
  }
  const level = wet ? wet.level : SEA;
  const d = level - beachGround(x, z);
  if (d < WADE) return DRY;
  if (wet) return d > DEEP ? wet.deep : wet.wade;
  return d > DEEP ? SEA_DEEP : SEA_WADE;
}

/** which way the nearest shore is from a spot in the water (pools: outwards; the sea: back up the beach) */
export function shoreDir(x, z, out) {
  for (const p of POOLS) {
    const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
    if (d < p.r) return d > 1e-4 ? out.set(dx / d, 0, dz / d) : out.set(1, 0, 0);
  }
  return out.set(0, 0, 1);
}

/** the dry sand (not the water, the promenade or the rocks) */
export function isSand(x, z) {
  return z < KERB - 1 && x > X0 && x < 45 && waterAt(x, z).depth === 0;
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

/** a Norfolk pine, h m tall (along the promenade here, and on the forecourt at Manly Wharf) */
export function norfolkPine(h) {
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

/** a sign on two posts (`w` metres across, its face towards +z), with `draw` painting its face */
function signboard(world, x, z, rotY, w, draw) {
  const h = w / 2, g = new THREE.Group(), tex = canvasTexture(512, 256, draw);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(w, h), toonMat({ map: tex, side: THREE.DoubleSide }));
  board.position.y = 1.5 + h / 2;
  g.add(board, vcMesh(merge([-1, 1].map((k) => part(G.box(0.14, 1.6 + h, 0.14), 0x5a4632, [k * (w / 2 - 0.2), (1.6 + h) / 2, -0.08])))));
  g.position.set(x, world.groundHeight(x, z), z);
  g.rotation.y = rotY;
  world.scene.add(g);
  for (const k of [-1, 1]) world.colliders.push({ x: x + Math.cos(rotY) * k * (w / 2 - 0.2), z: z - Math.sin(rotY) * k * (w / 2 - 0.2), r: 0.2 });
}

/* ------------------------------------------------------------------ build */
export function buildBeach(world) {
  const s = world.scene;

  // --- ground: finer than the main plane so pools and the shoreline look right (and on up the beach past the
  // north end, and out under the sea)
  const g = new THREE.PlaneGeometry(210, 122, 210, 122).rotateX(-Math.PI / 2).translate(-35, 0, -239);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  const C = {
    sand: new THREE.Color(0xecd9a4), sand2: new THREE.Color(0xe2cc92), wet: new THREE.Color(0xc9b27a), floor: new THREE.Color(0xb39c6a),
    path: new THREE.Color(0xcfcac0), grass: new THREE.Color(0x8cc458), rock: new THREE.Color(0x8e8b84), rock2: new THREE.Color(0x77746d),
  };
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = beachGround(x, z);
    pos.setY(i, h);
    const sz = shoreZ(x);
    if (z > -184) c.copy(C.grass);
    else if (z > KERB + 0.2) c.copy(C.path);
    else {
      const n = 0.5 + 0.5 * Math.sin(x * 1.7 + z * 0.9) * Math.sin(z * 1.3 - x * 0.4);
      c.copy(C.sand).lerp(C.sand2, n);
      c.lerp(C.wet, smoothstep(sz + 4, sz + 0.5, z));
      c.lerp(C.floor, smoothstep(sz, sz - 3, z));
      const rock = rocks(x, z) * (z > sz - 2 ? 1 : 0.5);
      if (rock > 0) c.lerp(Math.sin(x * 2.1 + z * 1.7) > 0 ? C.rock : C.rock2, rock);
      if (h < -0.35 && z > sz) c.lerp(C.floor, 0.6); // pool floors
    }
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const ground = new THREE.Mesh(g, vcMat());
  ground.receiveShadow = true;
  s.add(ground);

  // --- the ocean: gently heaving, with foam rolling in to the shore (the harbour's water carries on from its
  // south edge, on the same 4 m grid, riding the same swell: see Harbour)
  const ocean = new THREE.PlaneGeometry(244, 268, 61, 67).rotateX(-Math.PI / 2).translate(-50, SEA, -366);
  const oceanMesh = new THREE.Mesh(ocean, seaMat());
  s.add(oceanMesh);
  const opos = ocean.attributes.position;
  const foamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false });
  const foams = [];
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(116, 0.7).rotateX(-Math.PI / 2), foamMat.clone());
    f.position.set(12, SEA + 0.03, -239);
    f.userData.t = i / 4;
    s.add(f);
    foams.push(f);
  }
  // a wash line that hugs the curvy shore
  const wash = [];
  for (let x = X0 - 8; x < X1 - 2; x += 2) {
    const z0 = shoreZ(x), z1 = shoreZ(x + 2);
    wash.push(part(new THREE.PlaneGeometry(Math.hypot(2, z1 - z0) + 0.1, 0.9).rotateX(-Math.PI / 2), 0xffffff, [x + 1, SEA + 0.04, (z0 + z1) / 2 - 0.1], [0, -Math.atan2(z1 - z0, 2), 0]));
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

  // --- the promenade: its kerb, and the Norfolk pines all along it (none in front of either gate), on up
  // past the north end of the beach
  s.add(vcMesh(merge([part(G.box(X1 - X0 + 30, 0.3, 0.35), 0xbdb7aa, [(X0 + X1) / 2 - 15, 0.15, KERB])]), { cast: false, receive: true }));
  for (const x of [-72, -58, -40, -28, -2, 10, 22, 34, 46, 58]) {
    const h = rand(9, 11), z = -181 + rand(-0.4, 0.4);
    const m = vcMesh(norfolkPine(h));
    m.position.set(x, world.groundHeight(x, z), z);
    s.add(m);
    world.addSway(m);
    if (x < X0) continue; // (off the end of the beach: nobody's getting to those)
    world.colliders.push({ x, z, r: 0.5 });
    world.treeSpots.push({ x, z, h: h * 0.6, palette: 'pine' });
  }
  // "Manly: seven miles from Sydney, and a thousand miles from care", as the old ads had it, there to meet you
  // as you come out of the oval
  signboard(world, -4, -186.5, 0, 3.6, (c2, w, h) => {
    c2.fillStyle = '#1b6fa8'; c2.fillRect(0, 0, w, h);
    c2.strokeStyle = '#fff'; c2.lineWidth = 10; c2.strokeRect(12, 12, w - 24, h - 24);
    c2.fillStyle = '#ffd21f'; c2.textAlign = 'center';
    c2.font = 'bold 84px sans-serif'; c2.fillText('MANLY', w / 2, 104);
    c2.fillStyle = '#fff'; c2.font = 'italic 34px serif';
    c2.fillText('Seven miles from Sydney', w / 2, 160);
    c2.fillText('a thousand miles from care', w / 2, 204);
  });
  // (and at the far end, the way on to the ferries)
  signboard(world, 64, -181.6, -Math.PI / 2, 3, (c2, w, h) => {
    c2.fillStyle = '#1d5f3a'; c2.fillRect(0, 0, w, h);
    c2.strokeStyle = '#fff'; c2.lineWidth = 10; c2.strokeRect(12, 12, w - 24, h - 24);
    c2.fillStyle = '#fff'; c2.textAlign = 'center';
    c2.font = 'bold 60px sans-serif'; c2.fillText('MANLY WHARF', w / 2, 98);
    c2.font = 'bold 38px sans-serif'; c2.fillText('Ferries to Circular Quay', w / 2, 156);
    c2.fillStyle = '#ffd21f'; c2.font = 'bold 60px sans-serif'; c2.fillText('→', w / 2, 222);
  });

  // --- the surf club up off the north end of the beach, and the apartments behind it and along the back of
  // the promenade past the oval
  const club = [
    part(G.box(9, 6, 20), 0xefe2c4, [0, 3, 0]),
    part(G.box(10, 0.6, 21), 0xb5523b, [0, 6.3, 0]),
    part(G.box(0.3, 1.2, 12), 0x1b6fa8, [4.65, 5, 0]),
  ];
  for (let z = -8; z <= 8; z += 4) club.push(part(G.box(0.3, 2.2, 2.4), 0x6e5a48, [4.55, 1.5, z]));
  put(world, merge(club), -54, -206, 0, [], 0);
  const cols = [0xf1d9c9, 0xcfe0e8, 0xefe6cf, 0xdce8cf, 0xe8d0e0, 0xffffff];
  for (let z = -186; z > -250; z -= 13) {
    for (let k = 0; k < 2; k++) {
      const h = rand(9, 16) + k * 6;
      const b = building(11, h, 11, pick(cols));
      b.position.set(-68 - k * 15 + rand(-2, 2), h / 2 + 0.3, z + rand(-2, 2));
      s.add(b);
    }
  }
  for (let x = 52; x < 72; x += 13) {
    const h = rand(10, 18);
    const b = building(11, h, 10, pick(cols));
    b.position.set(x + rand(-1, 1), h / 2, -167 + rand(-1, 1));
    s.add(b);
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
  ]), -24, -214, Math.PI + 0.3, [[0, 0, 1.4]]);
  put(world, merge([
    part(G.cyl(0.6, 0.75, 0.6, 10), 0xdcc588, [0, 0.3, 0]),
    part(G.cyl(0.22, 0.25, 0.9, 8), 0xdcc588, [0.45, 0.45, 0.2]),
    part(G.cone(0.25, 0.3, 8), 0xd2b87a, [0.45, 1.05, 0.2]),
    part(G.cyl(0.2, 0.22, 0.75, 8), 0xdcc588, [-0.4, 0.4, -0.2]),
    part(G.cone(0.22, 0.28, 8), 0xd2b87a, [-0.4, 0.92, -0.2]),
    part(G.box(0.02, 0.18, 0.28), 0xd9453b, [0.45, 1.35, 0.2]),
  ]), 10, -210, 0, [[0, 0, 0.9]]);
  // (and boulders about the rocks at the Shelly Beach end)
  for (const [x, z, s] of BOULDERS) {
    put(world, part(G.dodec(s), 0x86837c, [0, 0.2, 0], [rand(0, 3), rand(0, 3), 0], [1.3, 0.7, 1]), x, z, 0, [[0, 0, 1.1]]);
  }

  // --- animation: swell, foam rolling in, glinting pools
  return {
    update(dt, t) {
      for (let i = 0; i < opos.count; i++) opos.setY(i, SEA + seaWave(opos.getX(i), opos.getZ(i), t));
      opos.needsUpdate = true;
      ocean.computeVertexNormals();
      for (const f of foams) {
        f.userData.t = (f.userData.t + dt * 0.09) % 1;
        const k = f.userData.t;
        f.position.z = -239 - 14 * (1 - k);
        f.scale.z = 1 + k * 2;
        f.material.opacity = Math.sin(k * Math.PI) * 0.6;
      }
      washMesh.material.opacity = 0.35 + 0.25 * Math.sin(t * 1.3);
      for (const m of poolMats) m.opacity = 0.68 + 0.06 * Math.sin(t * 2);
    },
  };
}

/** the sea's own material (the harbour's too: see Harbour) */
let SEA_MAT = null;
export function seaMat() {
  SEA_MAT ??= toonMat({ color: 0x1fa3c8, transparent: true, opacity: 0.8, depthWrite: false });
  return SEA_MAT;
}
