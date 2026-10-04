import * as THREE from 'three';
import { canvasTexture, smoothstep, TAU } from './util.js';

/*
 * Spiral eyes: the wildlife the Emperor's signal has got to (see Beacon) goes about with great purple spirals for eyes,
 * turning round and round, cartoon hypnotised. Everything that's turned on the turkeys has them: the gulls, the
 * plovers, the crabs, the rats, the snakes, the funnel-webs and the giant cuttlefish (not the ibis, who were never
 * anyone's but the Emperor's, and not Benny, who's nobody's but his own).
 *
 * They're the eyes themselves: a ball in place of each (the creature's own are gone, or hidden while they're showing),
 * the spiral wound round the front of it and ringed dark round the sides, all sharing the one spiral, which spins (see spin).
 */
const SPIN = 4.5; // radians a second
const BIG = 1.08; // (how much bigger than the eye it stands in for a spiral one is: just enough to cover it)

let TEX = null, BALL_TEX = null, MAT = null, BALL = null;
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

/** the same, for an eyeball: dark out to the corners (round the sides of the ball), so nothing's see-through */
function ballTexture() {
  BALL_TEX ??= canvasTexture(128, 128, (c, w) => {
    c.fillStyle = '#3c1361';
    c.fillRect(0, 0, w, w);
    c.drawImage(texture().image, 0, 0, w, w);
  });
  BALL_TEX.center.set(0.5, 0.5);
  return BALL_TEX;
}

/** the material for a spiral eye (one for the lot) */
export function spiralMat() {
  MAT ??= new THREE.MeshBasicMaterial({ map: ballTexture() });
  return MAT;
}

/** a texture for laying a spiral over an eye that's got its own (the cuttlefish's lenses: see Cuttle) */
export const spiralTex = texture;

/** every frame: round they go, all together */
export function spin(time) {
  if (TEX) TEX.rotation = -time * SPIN;
  if (BALL_TEX) BALL_TEX.rotation = -time * SPIN;
}

/** an eyeball, 1 round, looking out along +z: the spiral laid straight on from the front (and round the back, not that it shows) */
function ballGeo() {
  const g = new THREE.SphereGeometry(1, 20, 14), p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) / 2, 0.5 + p.getY(i) / 2);
  return g;
}

const _n = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1);
/**
 * Spiral eyes, a pair, on `parent` (a head, say): each in place of an eye at `at` (its middle, in the parent's space, x
 * mirrored for the other), `r` round, looking out along `out`. `own`: the creature's own eyes, if it's still got them
 * (hidden while the spirals are showing: see swirlIn). Returns their group, to swell up as they go spiral (see Opening)
 */
export function spiralEyes(parent, at, out, r, own = null) {
  BALL ??= ballGeo();
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(BALL, spiralMat());
    _n.set(out[0] * s, out[1], out[2]).normalize();
    m.position.set(at[0] * s, at[1], at[2]);
    m.quaternion.setFromUnitVectors(_z, _n);
    m.castShadow = false;
    g.add(m);
  }
  g.userData = { r: r * BIG, own };
  parent.add(g);
  swirlIn(g, 1);
  return g;
}

/** how far they've gone spiral (0..1): out of the middle of the eye they swell, over it, a touch too far, and settle */
export function swirlIn(g, k) {
  const { r, own } = g.userData, s = k <= 0 ? 0 : smoothstep(0, 0.6, k) * (1 + 0.35 * Math.sin(smoothstep(0.3, 1, k) * Math.PI));
  g.visible = s > 0;
  for (const m of g.children) m.scale.setScalar(Math.max(s, 1e-3) * r);
  if (own) own.visible = s < 0.8; // (its own eyes, till the spirals are over them)
}
