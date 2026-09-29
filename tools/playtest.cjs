#!/usr/bin/env node
/*
 * Plays the game in headless Chromium, to see a change working (not part of the game: see CLAUDE.md).
 *
 *   node tools/playtest.cjs [scenario.cjs] [outDir]
 *
 * With no scenario it's a smoke test: load, click Play, a few seconds of game, a screenshot, and a report of
 * anything the page threw. A scenario exports async ({ page, ev, adv, shot, sleep, log }) => { ... }, run once
 * Play's been clicked:
 *   ev(fn, arg)  page.evaluate: window.game has everything (game.player, game.turkeys, game.enemies...)
 *   adv(secs)    runs the game on that much (its own frame loop is frozen: this steps it at 60fps, then renders)
 *   shot(name)   a screenshot, to outDir/name.png (CSS transitions run in real time: sleep() before HUD shots)
 * Exits 1 if the page threw anything.
 *
 * It serves the repo itself, and the three.js the importmap wants comes from the npm registry (jsdelivr is
 * blocked from the cloud sandbox); anything else from outside (Google Fonts) is fetched with curl, which goes
 * through the sandbox's proxy, and cached.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CACHE = path.join(os.tmpdir(), 'turkmin-playtest');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.cjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }

/** the three.js package the importmap asks for, from the npm registry (fetched once) */
function threeDir() {
  const ver = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/three@([\d.]+)/)[1];
  const dir = path.join(CACHE, `three-${ver}`);
  if (!fs.existsSync(path.join(dir, 'package'))) {
    fs.mkdirSync(dir, { recursive: true });
    execFileSync('npm', ['pack', `three@${ver}`, '--silent', '--pack-destination', dir], { stdio: 'ignore' });
    execFileSync('tar', ['-xzf', path.join(dir, `three-${ver}.tgz`), '-C', dir]);
  }
  return { ver, dir: path.join(dir, 'package') };
}

/** the repo, served as-is */
function serve() {
  const server = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

(async () => {
  const scenario = process.argv[2] ? require(path.resolve(process.argv[2])) : null;
  const out = path.resolve(process.argv[3] ?? path.join(CACHE, 'shots'));
  fs.mkdirSync(out, { recursive: true });
  const three = threeDir();
  const server = await serve();
  const browser = await playwright.chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`${e.message}\n${e.stack}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  // (no proxy for the browser itself: it would send the page on 127.0.0.1 there too. Outside requests go this way)
  const cdn = `https://cdn.jsdelivr.net/npm/three@${three.ver}/`;
  await page.route(/^https:\/\//, async (route) => {
    const url = route.request().url();
    const f = path.join(CACHE, crypto.createHash('md5').update(url).digest('hex'));
    try {
      if (url.startsWith(cdn)) return await route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(three.dir, url.slice(cdn.length))) });
      if (!fs.existsSync(f)) execFileSync('curl', ['-sSfL', '-A', 'Mozilla/5.0 Chrome/140', '-o', f, '-D', `${f}.h`, url], { timeout: 30000 });
      const type = [...fs.readFileSync(`${f}.h`, 'utf8').matchAll(/^content-type:\s*(.+)$/gim)].pop()?.[1].trim();
      await route.fulfill({ contentType: type ?? 'application/octet-stream', body: fs.readFileSync(f), headers: { 'access-control-allow-origin': '*' } });
    } catch {
      await route.abort(); // (the game carries on without it: a fallback font, say)
    }
  });

  const log = (...a) => console.log(...a);
  const sleep = (ms) => page.waitForTimeout(ms);
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const adv = (secs) => ev((n) => {
    const g = window.game;
    for (let i = 0; i < n; i++) g.step(1 / 60);
    g.renderer.render(g.scene, g.camera);
  }, Math.round(secs * 60));
  const shot = async (name) => {
    const f = path.join(out, `${name}.png`);
    await page.screenshot({ path: f });
    log('shot', f);
  };

  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => !document.getElementById('loading'), null, { timeout: 60000 }); // (the first frame's drawn)
    await page.click('#play');
    await page.waitForFunction(() => window.game.started);
    await ev(() => { window.requestAnimationFrame = () => 0; }); // (the game's own loop stops: adv() drives it now)
    await sleep(100);
    if (scenario) await scenario({ page, ev, adv, shot, sleep, log });
    else {
      await adv(3);
      await shot('smoke');
      log(await ev(() => {
        const g = window.game, p = g.player;
        return `zone ${g.world.zoneOf(p.pos.x, p.pos.z)}, player at ${p.pos.x.toFixed(1)},${p.pos.z.toFixed(1)} (${p.life}, ${p.hp} hp), ${g.turkeys.list.length} turkeys, ${g.enemies.list.length} foes`;
      }));
    }
  } catch (e) {
    errors.push(`(playtest) ${e.stack ?? e}`);
  }
  log(errors.length ? `${errors.length} error(s):\n${errors.join('\n')}` : 'no errors');
  await browser.close();
  server.close();
  process.exitCode = errors.length ? 1 : 0;
})();
