import * as THREE from 'three';
import { part, merge, vcMesh, G, pinLabel } from './util.js';
import { cap } from './padmap.js';

/*
 * A lever for getting the ferry going: a big red-knobbed handle on a green cast-iron post, standing in a yellow
 * ring on the deck where you can't miss it. Walk up to it and press F, and over it goes with a clack (see Ferry: the
 * one on her deck sets her off for the other side, the ones on the wharves call her over). It stays over while
 * she's under way, and springs back up once she's in.
 */
const REACH = 2.3; // m from it you can pull it
const UP = -0.55, OVER = 0.7; // radians: the handle, leaning back ready, and pulled over
const THROW = 14, BACK = 3; // (how quick it goes over, and how lazily it comes back up: see damp)
const KNOB = 1.12; // m up the handle, its knob
const _v = new THREE.Vector3();

/** the post, and the ring round its foot (in its own frame: the handle goes over towards +z) */
function postGeo() {
  const IRON = 0x2e5e4a, BRASS = 0xc9a23a;
  return merge([
    part(G.cyl(0.62, 0.62, 0.04, 20), 0xf2c230, [0, 0.02, 0]),
    part(G.cyl(0.44, 0.44, 0.05, 20), 0x2b2b2b, [0, 0.025, 0]),
    part(G.box(0.36, 0.14, 0.4), IRON, [0, 0.1, 0]),
    part(G.box(0.26, 0.8, 0.26), IRON, [0, 0.55, 0]),
    part(G.box(0.34, 0.08, 0.34), IRON, [0, 0.98, 0]),
    // (the quadrant it runs in, notched, and the brass plate on the front)
    ...[-1, 1].map((s) => part(G.torus(0.3, 0.025, 4, 10, 1.6), BRASS, [s * 0.09, 1.02, 0], [0, Math.PI / 2, Math.PI / 2 - 0.8])),
    part(G.box(0.2, 0.14, 0.02), BRASS, [0, 0.72, 0.14]),
  ]);
}

/** the handle, from the pivot up: a steel rod... */
function rodGeo() {
  return merge([part(G.sphere(0.07, 8, 6), 0x9aa3a8, [0, 0, 0]), part(G.cyl(0.04, 0.045, KNOB, 8), 0x9aa3a8, [0, KNOB / 2, 0])]);
}

/** ...with a fat red knob on top of it */
function knobGeo() {
  return merge([part(G.sphere(0.15, 14, 10), 0xe0312b, [0, 0, 0]), part(G.sphere(0.05, 6, 5), 0xff9a8a, [0.05, 0.08, 0.07])]); // (a shine on it)
}

export class Lever {
  /**
   * On `parent` (the scene, or the ferry: it goes wherever she goes) at (x, y, z) in its frame, going over towards
   * `face` (radians round from +z). `text()`: what pulling it would do, or null if it'd do nothing just now;
   * `pull()`: do it
   */
  constructor(game, parent, [x, y, z], face, { text, pull }) {
    this.game = game;
    this.text = text;
    this.pull = pull;
    this.on = false; // (pulled over: she's on her way)
    this.a = UP;
    this.group = new THREE.Group();
    this.group.position.set(x, y, z);
    this.group.rotation.y = face;
    this.pivot = new THREE.Group();
    this.pivot.position.y = 1.02;
    this.knob = vcMesh(knobGeo());
    this.knob.position.y = KNOB + 0.06;
    this.pivot.add(vcMesh(rodGeo()), this.knob);
    this.group.add(vcMesh(postGeo(), { cast: true, receive: true }), this.pivot);
    this.group.traverse((o) => { o.userData.moves = true; });
    parent.add(this.group);
    // (its prompt, over it, while you're close enough to pull it)
    this.el = document.createElement('div');
    this.el.className = 'prompt';
    this.el.style.display = 'none';
    this.el.innerHTML = `<kbd class="kb">F</kbd>${cap('x')}<span></span>`;
    this.words = this.el.querySelector('span');
    document.getElementById('labels').appendChild(this.el);
    this.shown = null;
  }

  /** where it stands, out in the world */
  at(out) { return this.group.getWorldPosition(out); }

  /** are you close enough to pull it? */
  inReach(p) {
    this.at(_v);
    return Math.hypot(p.x - _v.x, p.z - _v.z) < REACH;
  }

  /** F, by it: over it goes, if there's any point (true), or a clunk and nothing doing (false) */
  tryPull() {
    const g = this.game;
    if (!this.text()) {
      g.audio.nope();
      return false;
    }
    this.on = true;
    g.audio.lever();
    this.pull();
    return true;
  }

  /** every frame: the handle going over (or back), and its prompt */
  update(dt, camera) {
    const g = this.game, p = g.player, want = this.on ? OVER : UP;
    this.a += (want - this.a) * (1 - Math.exp(-(this.on ? THROW : BACK) * dt));
    this.pivot.rotation.x = this.a;
    // (ready to go, with you about: its knob swells and shrinks a bit, to catch your eye)
    const text = this.text(), d = Math.hypot(p.pos.x - this.at(_v).x, p.pos.z - _v.z);
    this.knob.scale.setScalar(text && !this.on && d < 16 ? 1 + 0.14 * Math.max(0, Math.sin(g.time * 6)) : 1);
    const say = d < REACH && p.life === 'ok' && !g.travel.active ? text : null;
    if (say !== this.shown) {
      this.shown = say;
      if (say) this.words.textContent = say;
      else this.el.style.display = 'none';
    }
    if (say) pinLabel(this.el, _v.setY(_v.y + 2.3), camera);
  }
}
