import * as THREE from 'three';
import { part, merge, vcMesh, G, limb, rand, pick, TAU, toonMat, canvasTexture } from '../util.js';

function flat(w, d, color, x, z, y) {
  return part(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), color, [x, y, z]);
}

function put(world, geo, x, z, rotY = 0, colliders = []) {
  const m = vcMesh(geo, { cast: true, receive: true });
  m.position.set(x, 0, z);
  m.rotation.y = rotY;
  world.scene.add(m);
  for (const [cx, cz, r] of colliders) world.colliders.push({ x: x + cx, z: z + cz, r });
  return m;
}

let windowTex = null;
export function building(w, h, d, color) {
  windowTex ??= canvasTexture(64, 64, (c) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, 64, 64);
    c.fillStyle = '#e6e6e6'; c.fillRect(12, 10, 40, 42);
    c.fillStyle = '#3b5068'; c.fillRect(16, 14, 32, 34);
    c.fillStyle = '#6f8faf'; c.fillRect(18, 16, 12, 30);
  });
  windowTex.wrapS = windowTex.wrapT = THREE.RepeatWrapping;
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      if (f === 2 || f === 3) { uv.setXY(i, 0.02, 0.02); continue; } // roof/floor: plain wall colour
      const across = f < 2 ? d : w;
      uv.setXY(i, uv.getX(i) * Math.max(1, Math.round(across / 3)), uv.getY(i) * Math.max(1, Math.round(h / 3.4)));
    }
  }
  const m = new THREE.Mesh(g, toonMat({ map: windowTex, color }));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function fig(h) {
  const p = [limb([0, 0, 0], [0, h * 0.5, 0], 0.55, 0.4, 0x7d7368, 9)];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    p.push(limb([0, 0.6, 0], [Math.cos(a) * 1.1, 0, Math.sin(a) * 1.1], 0.2, 0.08, 0x7d7368, 5));
  }
  const greens = [0x2f5f2f, 0x3b6f35, 0x2a5530];
  for (let i = 0; i < 9; i++) {
    const a = rand(0, TAU), r = rand(0.5, 2.6);
    p.push(part(G.ico(rand(1.3, 1.9), 1), pick(greens), [Math.cos(a) * r, h * 0.55 + rand(0.5, 2.4), Math.sin(a) * r], [rand(0, 3), rand(0, 3), 0], [1, 0.7, 1]));
  }
  return merge(p);
}

// bins: ibis heaven (the red ones are overflowing). Tip them over for what's inside: [kind, x, z, facing]
export const CITY_BINS = [
  ['red', -20, -101.5, 0], ['yellow', -19.2, -101.5, 0], ['red', 14, -118.5, Math.PI], ['red', 15, -118.5, Math.PI],
  ['yellow', 42, -142, -Math.PI / 2], ['red', -43, -150, Math.PI / 2], ['red', -2, -121.5, Math.PI],
  ['green', -33.5, -126.5, 0.5], ['green', 33.5, -126.5, -0.5],
];

export function buildCity(world) {
  const s = world.scene;
  const ground = [
    flat(92, 6, 0xc9c6bd, 0, -101, 0.03),
    flat(92, 10, 0x4a4d52, 0, -109, 0.02),
    flat(92, 6, 0xc9c6bd, 0, -117, 0.03),
  ];
  for (let x = -44; x < 46; x += 6) ground.push(flat(3, 0.18, 0xf2d24b, x, -109, 0.035));
  for (const z of [-104.5, -113.5]) ground.push(flat(92, 0.15, 0xf2f2f2, 0, z, 0.035));
  for (let x = -11; x <= -5; x += 1) ground.push(flat(0.55, 9, 0xf2f2f2, x, -109, 0.04));
  for (let i = 0; i < 23; i++) {
    for (let j = 0; j < 12; j++) {
      ground.push(flat(4, 4, (i + j) % 2 ? 0xd6cdbd : 0xcdc3b2, -44 + i * 4 + 2, -122 - j * 4 - 2, 0.03));
    }
  }
  s.add(vcMesh(merge(ground), { cast: false, receive: true }));

  // buildings frame the streets (outside the play area)
  const cols = [0xa0523d, 0xd9c49a, 0x9aa3ab, 0x6fa3b0, 0xc47c5a, 0xb9b39f];
  for (let z = -100; z > -166; z -= 13) {
    for (const side of [-1, 1]) {
      const w = rand(9, 12), h = rand(9, 24);
      const b = building(w, h, 12, pick(cols));
      b.position.set(side * (50 + w / 2), h / 2, z - 6);
      s.add(b);
    }
  }

  // Moreton Bay figs in planters + street trees
  for (const [x, z, big] of [[-36, -130, 1], [36, -130, 1], [-38, -160, 1], [38, -160, 1], [-30, -117, 0], [10, -117, 0], [32, -117, 0]]) {
    const h = big ? rand(6, 7.5) : rand(4, 5);
    const m = vcMesh(fig(h));
    m.position.set(x, 0, z);
    world.addSway(m);
    s.add(m);
    if (big) put(world, merge([part(G.cyl(2.2, 2.3, 0.5, 20), 0x9c9689, [0, 0.25, 0]), part(G.cyl(2.0, 2.0, 0.02, 20), 0x5b4230, [0, 0.5, 0])]), x, z, 0, [[0, 0, 2.3]]);
    else world.colliders.push({ x, z, r: 0.5 });
    world.treeSpots.push({ x, z, h: h + 2, palette: 'fig' });
  }

  // benches, lamps, bus stop
  const bench = merge([
    part(G.box(2, 0.08, 0.5), 0x8a5a3a, [0, 0.48, 0]),
    part(G.box(2, 0.5, 0.08), 0x8a5a3a, [0, 0.8, -0.22], [-0.15, 0, 0]),
    part(G.box(0.08, 0.5, 0.5), 0x333333, [-0.9, 0.25, 0]),
    part(G.box(0.08, 0.5, 0.5), 0x333333, [0.9, 0.25, 0]),
  ]);
  for (const [x, z, r] of [[-8, -124, 0], [22, -124, 0], [-44, -136, Math.PI / 2], [44, -150, -Math.PI / 2]]) put(world, bench, x, z, r, [[-0.6, 0, 0.45], [0.6, 0, 0.45]].map(([a, b, c]) => [a * Math.cos(r), -a * Math.sin(r), c]));
  const lamp = merge([
    part(G.cyl(0.07, 0.09, 4, 8), 0x3a3f44, [0, 2, 0]),
    limb([0, 3.9, 0], [0.6, 4.1, 0], 0.05, 0.05, 0x3a3f44, 6),
    part(G.box(0.4, 0.14, 0.25), 0xfff3c4, [0.7, 4.0, 0]),
  ]);
  for (let x = -40; x <= 40; x += 16) {
    put(world, lamp, x, -99.4, -Math.PI / 2, [[0, 0, 0.15]]);
    put(world, lamp, x + 8, -118.8, Math.PI / 2, [[0, 0, 0.15]]);
  }
  put(world, merge([
    part(G.box(4, 0.1, 1.6), 0x6c7a89, [0, 2.5, 0]),
    part(G.box(0.08, 2.5, 0.08), 0x6c7a89, [-1.9, 1.25, -0.7]),
    part(G.box(0.08, 2.5, 0.08), 0x6c7a89, [1.9, 1.25, -0.7]),
    part(G.box(3.6, 2.0, 0.04), 0xbfe3f5, [0, 1.4, -0.75]),
    part(G.box(2.4, 0.08, 0.4), 0x8a5a3a, [0, 0.5, -0.4]),
  ]), 26, -101, 0, [[-1.3, -0.5, 0.6], [0, -0.5, 0.6], [1.3, -0.5, 0.6]]);

  // fountain
  put(world, merge([
    part(G.cyl(2.3, 2.4, 0.6, 28), 0xbab3a4, [0, 0.3, 0]),
    part(G.cyl(2.05, 2.05, 0.03, 28), 0x6cc3ea, [0, 0.52, 0]),
    part(G.cyl(0.25, 0.35, 1.6, 10), 0xbab3a4, [0, 0.8, 0]),
    part(G.cyl(0.8, 0.5, 0.25, 16), 0xbab3a4, [0, 1.6, 0]),
    part(G.ico(0.35, 1), 0xbfe9ff, [0, 1.9, 0]),
  ]), -28, -146, 0, [[0, 0, 2.4]]);

  // the King's throne: an overflowing skip bin
  const skip = [
    part(G.box(5, 1.6, 2.6), 0xe0a526, [0, 0.8, 0]),
    part(G.box(5.2, 0.12, 2.8), 0xb88418, [0, 1.62, 0]),
  ];
  for (let i = 0; i < 16; i++) skip.push(part(G.ico(rand(0.2, 0.45), 0), pick([0xe8e2d0, 0x6b4f3a, 0xd94c3d, 0x4d96ff, 0x333333]), [rand(-2.2, 2.2), 1.7 + rand(0, 0.4), rand(-1, 1)], [rand(0, 3), rand(0, 3), 0]));
  put(world, merge(skip), 6, -164, 0, [[-1.6, 0, 1.4], [0, 0, 1.4], [1.6, 0, 1.4]]);
}
