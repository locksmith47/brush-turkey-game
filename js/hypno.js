import * as THREE from 'three';
import { canvasTexture, smoothstep, TAU } from './util.js';

/*
 * Spiral eyes: the wildlife the Emperor's signal has got to (see Beacon) goes about with great purple spirals for eyes,
 * turning round and round, cartoon hypnotised. Everything that's turned on the turkeys has them: the gulls, the
 * plovers, the crabs, the rats, the snakes, the funnel-webs and the giant cuttlefish (not the ibis, who were never
 * anyone's but the Emperor's, and not Benny, who's nobody's but his own).
 *
 * They're caps over each eye, bigger than it and bulging out of it, all sharing the one spiral, which spins (see spin).
 */
const SPIN = 4.5; // radians a second
const BIG = 1.5; // (how much bigger than the eye it's over a spiral is: they bulge, cartoon-style)
const BULGE = 0.9; // (how far round a ball each one's a cap of, in radians: the bigger, the more they bulge)

let TEX = null, MAT = null, DISC = null;
/** the spiral: purple, wound out from the middle of a pale lilac eye, ringed dark */
function texture() {
  TEX ??= canvasTexture(128, 128, (c, w) => {
    const m = w / 2;
    c.fillStyle = '#f4e6ff';
    c.beginPath();
    c.arc(m, m, m - 2, 0, TAU);
    c.fill();
    c.strokeStyle = '#8a2be2';
    c.lineWidth = 9;
    c.lineCap = 'round';
    c.beginPath();
    for (let a = 0; a < TAU * 3.1; a += 0.08) {
      const r = 3 + (a / TAU) * 17.5;
      c.lineTo(m + Math.cos(a) * r, m + Math.sin(a) * r);
    }
    c.stroke();
    c.strokeStyle = '#3c1361';
    c.lineWidth = 6;
    c.beginPath();
    c.arc(m, m, m - 5, 0, TAU);
    c.stroke();
  });
  TEX.center.set(0.5, 0.5);
  return TEX;
}

/** the material for a spiral eye (one for the lot) */
export function spiralMat() {
  MAT ??= new THREE.MeshBasicMaterial({ map: texture(), transparent: true, alphaTest: 0.5 });
  return MAT;
}

/** a texture for laying a spiral over an eye that's got its own (the cuttlefish's lenses: see Cuttle) */
export const spiralTex = texture;

/** every frame: round they go, all together */
export function spin(time) {
  if (TEX) TEX.rotation = -time * SPIN;
}

/** a spiral's shape: a shallow cap off a ball, its rim 1 round at z = 0 and bulging out along +z, the spiral laid flat across it */
function capGeo() {
  const g = new THREE.SphereGeometry(1, 20, 6, 0, TAU, 0, BULGE).rotateX(Math.PI / 2);
  const rim = Math.sin(BULGE), p = g.attributes.position, uv = g.attributes.uv;
  g.translate(0, 0, -Math.cos(BULGE)).scale(1 / rim, 1 / rim, 1 / rim);
  for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) / 2, 0.5 + p.getY(i) / 2);
  return g;
}

const _n = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1);
/**
 * Spirals over a pair of eyes, on `parent` (a head, say): each eye at `at` (its middle, in the parent's space), `r` round,
 * looking out along `out`, with the spiral laid over the front of it. `s` mirrors x for the other eye. Returns their group,
 * to scale up as they go spiral (see Opening), or to hide
 */
export function spiralEyes(parent, at, out, r, lift = r) {
  DISC ??= capGeo();
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(DISC, spiralMat());
    _n.set(out[0] * s, out[1], out[2]).normalize();
    m.position.set(at[0] * s, at[1], at[2]).addScaledVector(_n, lift);
    m.quaternion.setFromUnitVectors(_z, _n);
    m.scale.setScalar(r * BIG);
    m.castShadow = false;
    g.add(m);
  }
  parent.add(g);
  return g;
}

/** how big they are, `k` of the way to going spiral (0..1): they swell up over the eye, a touch too far, and settle */
export function swirlIn(g, k) {
  const s = k <= 0 ? 0 : smoothstep(0, 0.6, k) * (1 + 0.35 * Math.sin(smoothstep(0.3, 1, k) * Math.PI));
  g.visible = s > 0;
  g.scale.setScalar(s || 1e-3);
}
