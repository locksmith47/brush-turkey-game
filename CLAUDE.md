# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Brush Hour: a browser game about brush turkeys, built on three.js. Plain ES modules: no build step, no
package.json, no test suite. `index.html` pulls three@0.170.0 from jsdelivr through an importmap and
`js/main.js` does the rest. The map runs north to south through Sydney, in an L: down the first leg (-z)
through The Bush, The Backyards and The Oval, then right at the beach and down the second leg (+x) along Manly
Beach to Manly Wharf, over the harbour on The Manly Ferry, and into The City at Circular Quay. Each is shut off
from the next by a padlocked gate, whose key the turkeys have to win and carry to it. (The ferry's gangways
only open while she's in, and the King Ibis in the city is the end of the line, with no gate past him.)

## Commands

- **See a change working:** `node tools/playtest.cjs [scenario.cjs] [outDir]`. It serves the repo, plays it in
  headless Chromium and clicks Play. With no scenario it's a smoke test: one screenshot and a one-line report.
  It exits 1 if the page threw anything. The scenario API is in the file's header; screenshots go to
  `$TMPDIR/brush-turkey-playtest/shots/` unless you give `outDir`. For example, to see the player go down:
  ```js
  module.exports = async ({ ev, adv, shot }) => {
    await ev(() => window.game.player.hurt(999, null));
    await adv(2); // (game seconds: the game's own frame loop is frozen, adv() steps it)
    await shot('wasted');
  };
  ```
- **Lint:** there's no config in the repo, so rules and browser globals go on the command line. Expect 0 errors
  and a dozen old unused-variable warnings:
  `eslint --no-config-lookup --rule '{"no-undef": "error", "no-unused-vars": "warn"}' --global window,document,innerWidth,innerHeight,devicePixelRatio,addEventListener,requestAnimationFrame,localStorage,location,performance,getComputedStyle,console,setTimeout js/`
- **Play it yourself:** any static server at the repo root, e.g. `python3 -m http.server`.
- **Deploys:** GitHub Pages. master is at https://locksmith47.github.io/brush-turkey-game/ and every other branch
  at `.../branches/<branch>/`; a push to any branch redeploys the lot. Each copy keeps its own save (the
  localStorage key includes the path).

## Gotchas

- **Line endings are mixed, and there's no .gitattributes.** The older files are CRLF (`index.html`, `main.js`,
  `turkey.js`, `turkeys.js`, `player.js`, `mound.js`, `foe.js`, `hud.js`, `world.js`, `barriers.js`, `audio.js`,
  and others); newer ones are LF (`ibis.js`, `crab.js`, `keeper.js`, `save.js`, `wasted.js`, `util.js`,
  `style.css`, and others). Python text-mode read/write quietly turns CRLF into LF, and the diff becomes a
  whole-file rewrite. Use the Edit tool, or work on bytes and restore the endings. Check `git diff --stat`
  after any scripted edit.
- **Cloud sandbox:** cdn.jsdelivr.net is blocked (403), but registry.npmjs.org and Google Fonts are reachable.
  Don't give Playwright's Chromium the agent proxy: it sends the page on 127.0.0.1 through it too, and gets a
  405. `playtest.cjs` gets three.js from npm and routes outside requests itself.
- **Headless timing:** rendering is slow (SwiftShader). `playtest.cjs` freezes the game's frame loop and calls
  `game.step(1/60)` by hand; that call is a whole frame, and it fast-forwards from devtools too. CSS
  transitions, such as the HUD's bars, still run in real time, so `sleep()` before screenshotting them.
- **Saves:** leaving or reloading the page saves over whatever's in localStorage (on `pagehide`). To test
  loading an edited save, set `game.saves.on = false` first.
- `window.game` exposes everything. The dev menu (the backquote key) can:
  - skip to a zone, spawn turkeys, or open every gate;
  - toggle invincibility, or hurt, heal or waste you;
  - save, or wipe the save.

  Its actions are in `main.js`.

## Architecture

- **`game` (main.js) is the hub.** Every system hangs off it and reaches the others through it. main.js
  builds the level: every foe, bin, bit of loot and toy is spawned there. It also handles input, aim, camera,
  tips and zones. Each frame is `step(real)`, which runs everything on `dt = real * game.timeScale` (the
  slow-mo when you go down); only `game.wasted` runs on real time.
- **World** (`world.js`, `track.js`, `props/*`) holds the zones (`ZONES`: a rect each, and the leg it's on),
  `zoneOf(x, z)` and `groundHeight()`. Obstacles are circle colliders plus segment walls, and `resolve()` pushes
  things out of them (and `keepIn()` keeps them in their zone, bar through the fence into the next). `route()`
  gives the next waypoint anywhere, through open gates and round each zone's track, or null if the way's fenced
  off. `canSee()` and `throwClear()` stop seeing and throwing through scrub, fences and buildings. The camera
  swings round to look down whichever leg you're on (`cam.leg` in main.js), and the sun comes round with it.
- **The ferry** (`ferry.js`) is a zone that moves: its bounds are its deck (`world.boundsOf(FERRY)`), and
  `shift()` carries everything on it along. It saves where it's got to.
- **Turkeys** (`turkey.js`) are one big state machine (`S`). The `WALKING` set decides who's on the ground; the
  `BUSY` set decides who can be whistled back. A new state needs all of:
  - its entry in `S`, and in those sets;
  - a case in the update switch, and cleanup in `dropEverything()`;
  - its place in `pose()` (the scratching list) and in the heading-turn exclusions in `update()`;
  - a save mode in `save.js`'s `turkeyState`.

  `turkeys.js` runs the squad: rally point, throwing, whistling, plucking, separation.
- **Foes** (`foe.js`, held in `game.enemies.list`) are anything turkeys go at. That's the enemies, but also keys,
  barricades, bins and bags, beach loot and cricket gear. A beaten foe becomes a carcass for turkeys to haul
  to a mound, when their `STRENGTH` beats its `weight`. An enemy attack runs in three steps:
  1. `findTarget()` picks the nearest turkey on the ground, or the player.
  2. A red `fx.warnCircle()` telegraphs the attack.
  3. The strike hits turkeys (`killNear`, `blastAway`, `grabbedBy`) and the player
     (`hurtPlayer(point, radius, damage, { knock, stun })`).
- **Player** (`player.js`) has health (`hurt()`, regen, i-frames) and life states `ok`/`down`/`buried`/`rising`,
  each with its own pose. `dead`/`grounded` getters let foes target him like a turkey. `wasted.js` runs going
  down: WASTED, respawn at `mounds.refuge()`, the turkeys digging him out, popping out.
- **Mounds** (`mound.js`) fill with leaves and hatch chicks. A new one is scratched up by a crew of
  `BUILD_CREW` turkeys. `walk()`, `nearestReachable()` and `refuge()` find ones you can get to.
- **Saves** (`save.js`) are a snapshot of what's changed since a new game, with foes keyed by name and home.
  - Bump `VERSION` when the map changes.
  - Progress flags go through main.js's `Saves` get/set with defaults, so old saves still load.
  - The tips list in main.js is saved by index, so never insert tips in its middle. For a one-off message use
    `hud.toastOnce`, or a flag saved with progress (like `player.toldHurt`).
- **Models** are merged primitives with vertex colours, sharing one toon material (`util.js`: `part`, `merge`,
  `vcMesh`). So one thing can't be tinted through its material. Every sound is synthesized in `audio.js`.

## House style

- Comments narrate from the game's side in casual Aussie English, often in brackets
  (`// (he hits the deck)`). Methods get JSDoc one-liners, sections get `/* ---------------- name */` dividers,
  and tuning constants sit at the top of a file with their units. Match the comment density of the file.
- 2-space indent, single quotes, long lines are fine. Use module-level scratch vectors (`_v`, `_w`) rather than
  allocating every frame.
- Commit messages: a plain-English line about what the player gets ("Let you build as many mounds as you
  like"), then a body in the same voice.
