// Block 3 check: the shared room in a real browser, TV page + 6 phones.
//   - settings: the host phone changes a preset and a value; the TV and every phone show the same; a guest can't
//     change them; after the start they are locked; the game receives them;
//   - Wi-Fi drop in the middle of a match: answers sent meanwhile arrive once after reconnecting;
//   - actions of a finished match are ignored in the next one; a 7th phone is turned away.
//   node tools/qa/check-room.js /tmp/tvdrop.info /tmp/shots   (dev server running, see check-phone-layouts.js)
const { chromium, devices } = require('playwright');
const fs = require('fs');
const [,, infoFile, out] = process.argv;
const [port, , code, key] = fs.readFileSync(infoFile, 'utf8').trim().split(' ');
const base = 'http://127.0.0.1:' + port;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NAMES = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Fábio', 'Gil'];
let failures = 0;
const check = (ok, what) => { console.log((ok ? '  ✓ ' : '  ✗ ') + what); if (!ok) failures++; };

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const watch = (p, who) => { p.on('pageerror', (e) => errors.push(who + ': ' + e.message)); };
  const tv = await (await b.newContext({ viewport: { width: 1920, height: 1080 } })).newPage(); watch(tv, 'tv');
  await tv.goto(base + '/gamer-tv.html?key=' + key);
  await tv.waitForSelector('.hero h1');
  const pads = [];
  for (let i = 0; i < 6; i++) {
    const p = await (await b.newContext({ ...devices['Pixel 7'] })).newPage(); watch(p, NAMES[i]);
    await p.goto(base + '/jogar?sala=' + code);
    await p.fill('#name', NAMES[i]); await p.click('#go');
    await p.waitForFunction(() => window.PAD_STATE.joined && window.PAD_STATE.me, null, { timeout: 10000 });
    pads.push(p);
  }
  await sleep(500);
  check((await tv.evaluate(() => window.TV_STATE.players.length)) === 6, '6 phones in the room');
  const extra = await (await b.newContext({ ...devices['Pixel 7'] })).newPage();
  await extra.goto(base + '/jogar?sala=' + code); await extra.fill('#name', 'Gil'); await extra.click('#go'); await sleep(1500);
  check(await extra.evaluate(() => /cheia/.test(document.body.textContent)), 'a 7th phone is told the room is full');

  // settings: the TV opens the waiting room of Quem Mente?
  await tv.evaluate(() => window.Central.lobby('mente')); await sleep(700);
  await pads[0].waitForSelector('[data-preset="rapido"]');
  await pads[0].click('[data-preset="rapido"]'); await sleep(500);
  const tvCfg = () => tv.evaluate(() => { const c = window.TV_STATE.cfg.mente; return c.preset + ' ' + JSON.stringify(c.values); });
  check((await tvCfg()) === 'rapido {"questions":3,"write":35,"vote":20}', 'host phone picks "Rápido": the TV has it: ' + await tvCfg());
  await pads[0].click('[data-key="questions"][data-v="5"]'); await sleep(500);
  check((await tvCfg()).startsWith('custom {"questions":5'), 'host phone changes one value: the TV switches to Personalizado');
  const guestView = await pads[3].evaluate(() => document.querySelector('.cfgro') && document.querySelector('.cfgro').textContent);
  check(/5/.test(guestView || '') && /35 s/.test(guestView || ''), 'a guest phone shows the same settings, read-only');
  await pads[3].evaluate(() => window.PAD_STATE.room_.send({ t: 'cfg', key: 'questions', v: 8 })); await sleep(500);
  check((await tvCfg()).startsWith('custom {"questions":5'), 'a guest cannot change the settings');
  // on the TV with the remote: focus the presets row and choose Longo
  await tv.evaluate(() => { for (let i = 0; i < 8; i++) window.tvKey('up'); window.tvKey('right'); window.tvKey('right'); window.tvKey('ok'); }); await sleep(500);
  check((await tvCfg()).startsWith('longo'), 'the TV remote picks "Longo"');
  await tv.screenshot({ path: out + '/b3-lobby-settings.png' });
  await pads[0].screenshot({ path: out + '/b3-phone-settings.png' });
  await pads[0].evaluate(() => document.querySelector('.cfg').scrollIntoView({ block: 'center' })); await sleep(300);
  await pads[0].screenshot({ path: out + '/b3-phone-settings-panel.png' });
  await pads[3].screenshot({ path: out + '/b3-phone-guest.png' });
  await pads[0].click('[data-preset="rapido"]'); await sleep(400);

  // start: locked, and the game got them
  await tv.evaluate(() => window.Central.start('mente')); await sleep(700);
  await tv.screenshot({ path: out + '/b3-intro-settings.png' });
  await pads[0].evaluate(() => window.PAD_STATE.room_.send({ t: 'cfg', preset: 'longo' })); await sleep(400);
  check((await tvCfg()).startsWith('rapido'), 'after the start the settings are locked');
  await tv.evaluate(() => window.tvKey('ok'));
  await pads[0].waitForSelector('#lie', { timeout: 15000 });
  check(/Pergunta 1 de 3/.test(await tv.textContent('.kicker')), 'the game uses them: "Pergunta 1 de 3"');
  const timer = await tv.evaluate(() => +document.querySelector('.timer').textContent);
  check(timer <= 35 && timer >= 30, 'and the writing time of "Rápido" (35 s): ' + timer);

  // Wi-Fi drop: Bruno's phone loses the connection, writes his lie meanwhile, comes back
  const midBefore = await tv.evaluate(() => window.TV_STATE.matchId);
  await pads[1].evaluate(() => { window.__realWS = window.WebSocket; window.WebSocket = function () { throw new Error('offline'); }; window.PAD_STATE.room_.drop(); });
  await sleep(400);
  check(await tv.evaluate(() => !window.TV_STATE.players.find((p) => p.name === 'Bruno').on), 'the TV sees Bruno disconnected');
  await pads[1].fill('#lie', 'um pato de borracha'); await pads[1].click('#send'); await sleep(300);
  const pending = await pads[1].evaluate(() => window.PAD_STATE.room_.outbox.length);
  check(pending >= 1, 'the lie waits in Bruno\'s phone (' + pending + ' pending)');
  await pads[1].evaluate(() => { window.WebSocket = window.__realWS; window.PAD_STATE.room_.nudge(); });
  await sleep(1500);
  check(await tv.evaluate(() => window.TV_STATE.players.find((p) => p.name === 'Bruno').on), 'Bruno is back');
  check((await pads[1].evaluate(() => window.PAD_STATE.room_.outbox.length)) === 0, 'and his lie was confirmed by the TV');
  const waiters = await tv.evaluate(() => [...document.querySelectorAll('.waiter.done')].map((w) => w.textContent.trim()));
  check(waiters.some((w) => /Bruno/.test(w)), 'the TV shows Bruno\'s lie as sent: ' + waiters.join(','));
  // send the same lie again by hand with an old number: ignored
  const before = await tv.evaluate(() => window.ROOM.stats.dup);
  await pads[1].evaluate(() => { const r = window.PAD_STATE.room_; const s = r.seq; r.seq = s - 1; r.send({ t: 'g', mid: window.PAD_STATE.mid, k: 'lie', text: 'outra mentira' }); r.seq = s; });
  await sleep(400);
  check((await tv.evaluate(() => window.ROOM.stats.dup)) > before, 'a message with an old number is recognized as a repeat');

  // a finished match: its actions don't reach the next one
  await tv.evaluate(() => window.tvKey('back')); await sleep(300); await tv.evaluate(() => window.tvKey('left')); await tv.evaluate(() => window.tvKey('ok')); await sleep(800);
  await tv.evaluate(() => window.Central.lobby('mente')); await sleep(400);
  await tv.evaluate(() => window.Central.start('mente')); await sleep(500); await tv.evaluate(() => window.tvKey('ok'));
  await pads[2].waitForSelector('#lie', { timeout: 15000 });
  const midNow = await tv.evaluate(() => window.TV_STATE.matchId);
  check(midNow === midBefore + 1, 'the new match has a new number (' + midBefore + ' → ' + midNow + ')');
  await pads[2].evaluate((old) => window.PAD_STATE.room_.send({ t: 'g', mid: old, k: 'lie', text: 'de outra partida' }), midBefore);
  await sleep(500);
  const done = await tv.evaluate(() => [...document.querySelectorAll('.waiter.done')].map((w) => w.textContent.trim()));
  check(!done.some((w) => /Carla/.test(w)), 'an action from the previous match is ignored');

  console.log('errors:', errors.length ? errors.slice(0, 8) : 'none');
  console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
  await b.close();
  process.exit(failures ? 1 : 0);
})();
