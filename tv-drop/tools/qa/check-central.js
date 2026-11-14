// Central Gamer check (block 2): drives the TV page with the remote keys and three phones; screenshots of every screen.
//   node tools/qa/check-central.js /tmp/tvdrop.info /tmp/shots   (with the dev server running, see check-phone-layouts.js)
const { chromium, devices } = require('playwright');
const fs = require('fs');
const [,, infoFile, out] = process.argv;
const [port, , code, key] = fs.readFileSync(infoFile, 'utf8').trim().split(' ');
const base = 'http://127.0.0.1:' + port;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch();
  const errors = [];
  const watch = (p, who) => { p.on('pageerror', (e) => errors.push(who + ': ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_|MEDIA/.test(m.text())) errors.push(who + ' console: ' + m.text()); }); };
  const tvc = await b.newContext({ viewport: { width: 1920, height: 1080 } });
  const tv = await tvc.newPage(); watch(tv, 'tv');
  await tv.goto(base + '/gamer-tv.html?key=' + key);
  await tv.waitForSelector('.hero h1');
  await sleep(1600);
  const key_ = async (k, n = 1, wait = 260) => { for (let i = 0; i < n; i++) { await tv.evaluate((x) => window.tvKey(x), k); await sleep(wait); } };
  const shot = (n) => tv.screenshot({ path: `${out}/${n}.png` });
  const screen = () => tv.evaluate(() => window.TV_STATE.screen);
  await shot('c1-catalog');
  await key_('down'); await key_('right', 2); await sleep(900); await shot('c2-rail');
  await key_('down', 2); await sleep(900); await shot('c3-deep');
  await key_('down', 2); await key_('right'); await sleep(700); await shot('c4-coop');
  await key_('up', 4); await key_('left', 2); await sleep(500);
  console.log('focused tile:', await tv.evaluate(() => document.querySelector('.is-focus') && document.querySelector('.is-focus').dataset.id), 'screen', await screen());
  await key_('ok'); await sleep(1000); await shot('d1-details');
  console.log('details of:', await tv.evaluate(() => window.TV_STATE.gameId));
  await key_('ok'); await sleep(900); await shot('l1-lobby-empty');
  console.log('screen after Jogar:', await screen());
  // phones join
  const NAMES = ['Ana', 'Bruno', 'Carla'];
  const pads = [];
  for (const n of NAMES) {
    const c = await b.newContext({ ...devices['Pixel 7'] });
    const p = await c.newPage(); watch(p, n);
    await p.goto(base + '/jogar?sala=' + code);
    await p.fill('#name', n); await p.click('#go');
    await p.waitForSelector('#myName', { timeout: 8000 });
    pads.push(p);
  }
  await sleep(900);
  await shot('l2-lobby-players');
  await pads[0].screenshot({ path: `${out}/p1-phone-lobby.png` });
  // remove Carla with the remote
  await key_('up'); await key_('right', 2); await sleep(300); // buttons → player cards (the settings rows are above them)
  console.log('focused card:', await tv.evaluate(() => (document.querySelector('.pcard.is-focus b') || {}).textContent));
  await key_('ok'); await sleep(500); await shot('l3-remove');
  await key_('left'); await key_('ok'); await sleep(900);
  console.log('players after remove:', await tv.evaluate(() => window.TV_STATE.players.map((p) => p.name).join(',')));
  await pads[2].screenshot({ path: `${out}/p2-phone-kicked.png` });
  // start
  await key_('down', 2); await sleep(200);
  console.log('focused button:', await tv.evaluate(() => (document.querySelector('.gbtn.is-focus') || {}).textContent));
  await key_('ok'); await sleep(1200); await shot('g1-intro');
  await pads[0].screenshot({ path: `${out}/p3-phone-intro.png` });
  await key_('ok'); await sleep(4200); await shot('g2-play');
  console.log('screen:', await screen());
  // cancel the match → catalog; the phones go back to "choosing"
  await key_('back'); await sleep(400); await shot('g3-cancel');
  await key_('left'); await key_('ok'); await sleep(1400);
  console.log('after cancel:', await screen());
  await pads[0].screenshot({ path: `${out}/p4-phone-browse.png` });
  await shot('c5-catalog-with-players');
  // a "coming soon" game
  await tv.evaluate(() => window.Central.details('investigacao')); await sleep(1100); await shot('d2-soon');
  await key_('left'); await key_('ok'); await sleep(500);
  console.log('soon play stays on:', await screen());
  // exit question
  await key_('back'); await sleep(500); await key_('back'); await sleep(400); await shot('c6-exit');
  console.log('errors:', errors.length ? errors.slice(0, 12) : 'none');
  await b.close();
})();
