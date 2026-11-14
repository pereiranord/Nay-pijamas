// Party games harness: one TV page + N phones against the dev server.
// usage: node tools/qa/play/play.js <infoFile> <outDir> <game> [players]   (dev server running, see check-phone-layouts.js)
// Plays one whole match of a game with simulated phones (real pages, real taps) and saves screenshots.
const { chromium, devices } = require('playwright');
const fs = require('fs');
const [,, infoFile, out, scenario = 'lobby', nPlayers = '3'] = process.argv;
const [port, , code, key] = fs.readFileSync(infoFile, 'utf8').trim().split(' ');
const base = 'http://127.0.0.1:' + port;
const NAMES = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Fábio'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const watch = (p, who) => { p.on('pageerror', (e) => errors.push(who + ': ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(who + ' console: ' + m.text()); }); };
  const tvCtx = await b.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
  const tv = await tvCtx.newPage(); watch(tv, 'tv');
  await tv.goto(base + '/jogos-tv.html?key=' + key);
  await tv.waitForSelector('.hero h1');
  const pads = [];
  for (let i = 0; i < +nPlayers; i++) {
    const c = await b.newContext({ ...devices['Pixel 7'] });
    const p = await c.newPage(); watch(p, NAMES[i]);
    await p.goto(base + '/jogar?sala=' + code);
    await p.fill('#name', NAMES[i]);
    await p.click('#go');
    await p.waitForFunction(() => window.PAD_STATE.joined && window.PAD_STATE.me, null, { timeout: 8000 });
    pads.push(p);
  }
  await sleep(700);
  const shot = async (name, which = 'both') => {
    if (which !== 'pad') await tv.screenshot({ path: `${out}/${name}-tv.png` });
    if (which !== 'tv') await pads[0].screenshot({ path: `${out}/${name}-pad.png` });
  };
  const padSend = (i, m) => pads[i].evaluate((msg) => window.PAD_STATE.ws.send(JSON.stringify(msg)), m);
  const state = () => tv.evaluate(() => window.TV_STATE.screen);
  const pick = async (g) => { await padSend(0, { t: 'pick', g }); await sleep(300); };
  const startGame = async (g, introShot) => {
    await tv.evaluate((x) => window.Central.lobby(x), g); await sleep(400); await tv.evaluate((x) => window.Central.start(x), g); await sleep(900);
    if (introShot) { await shot(g + '-intro'); await pads[1 % pads.length].screenshot({ path: `${out}/${g}-intro-pad2.png` }); }
    await padSend(0, { t: 'start' }); // skip the explanation
    for (let i = 0; i < 60 && (await state()) !== 'play'; i++) await sleep(100);
    await sleep(400);
  };
  const cfg = (game, values) => tv.evaluate(([x, v]) => { window.TV_STATE.cfg[x] = { preset: 'custom', values: v }; }, [game, values]);
  const S = { ...require('./games-scenarios.js') };
  for (const f of fs.readdirSync(__dirname + '/scn')) if (f.endsWith('.js')) S[f.slice(0, -3)] = require('./scn/' + f);
  try {
    await S[scenario]({ tv, pads, shot, padSend, state, pick, startGame, sleep, out, base, code, cfg });
  } catch (e) { errors.push('scenario: ' + (e.stack || e.message)); await shot('error').catch(() => {}); }
  console.log('state:', await state());
  console.log('errors:', errors.length ? errors.slice(0, 12) : 'none');
  await b.close();
})();
