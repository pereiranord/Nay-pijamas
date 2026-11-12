// The host's phone does everything the TV remote does: choose the game while the TV is in the catalog, change it,
// start, end the match and remove a player.
//   node tools/qa/check-host-phone.js /tmp/tvdrop.info /tmp/shots   (dev server running, see check-phone-layouts.js)
const { chromium, devices } = require('playwright');
const fs = require('fs');
const [,, infoFile, out] = process.argv;
const [port, , code, key] = fs.readFileSync(infoFile, 'utf8').trim().split(' ');
const base = 'http://127.0.0.1:' + port;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (ok, what) => { console.log((ok ? '  ✓ ' : '  ✗ ') + what); if (!ok) failures++; };

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const watch = (p, who) => { p.on('pageerror', (e) => errors.push(who + ': ' + e.message)); };
  const tv = await (await b.newContext({ viewport: { width: 1920, height: 1080 } })).newPage(); watch(tv, 'tv');
  await tv.goto(base + '/gamer-tv.html?key=' + key);
  await tv.waitForSelector('.hero h1');
  const screen = () => tv.evaluate(() => window.TV_STATE.screen + ':' + window.TV_STATE.gameId);
  const pads = [];
  for (const n of ['Ana', 'Bruno', 'Carla']) {
    const p = await (await b.newContext({ ...devices['Pixel 7'] })).newPage(); watch(p, n);
    await p.goto(base + '/jogar?sala=' + code);
    await p.fill('#name', n); await p.click('#go');
    await p.waitForFunction(() => window.PAD_STATE.joined && window.PAD_STATE.me, null, { timeout: 10000 });
    pads.push(p);
  }
  await sleep(400);
  check((await screen()).startsWith('catalog'), 'the TV is in the catalog');
  check(await pads[0].$('button.gcard[data-g="mente"]') !== null, 'the host phone lists the games while the TV is in the catalog');
  check(/escolhendo o jogo/.test(await pads[1].textContent('#list')), 'a guest phone says who is choosing');
  await pads[0].screenshot({ path: out + '/h1-phone-catalog.png' });
  await pads[1].screenshot({ path: out + '/h1-guest-catalog.png' });
  await pads[0].click('button.gcard[data-g="mente"]'); await sleep(600);
  check((await screen()) === 'lobby:mente', 'the host taps Quem Mente?: the TV opens its waiting room');
  await pads[0].click('button.gcard[data-g="rabisco"]'); await sleep(600);
  check((await screen()) === 'lobby:rabisco', 'the host changes the game from the phone');
  await pads[0].screenshot({ path: out + '/h2-phone-lobby.png' });
  await pads[1].evaluate(() => window.PAD_STATE.room_.send({ t: 'pick', g: 'arena' })); await sleep(400);
  check((await screen()) === 'lobby:rabisco', 'a guest cannot choose the game');
  // the TV goes back to the catalog with the remote: the phone follows; the phone picks again
  await tv.evaluate(() => { window.tvKey('back'); window.tvKey('back'); }); await sleep(500);
  check((await screen()).startsWith('catalog'), 'the TV remote goes back to the catalog');
  await pads[0].waitForSelector('button.gcard[data-g="batata"]');
  await pads[0].click('button.gcard[data-g="batata"]'); await sleep(600);
  check((await screen()) === 'lobby:batata', 'and the phone chooses again');
  await pads[0].click('#start'); await sleep(900);
  check((await tv.evaluate(() => window.TV_STATE.screen)) === 'intro', 'the host starts the match from the phone');
  check(await pads[0].$('#hostTab') !== null && await pads[1].$('#hostTab') === null, 'only the host has the tab to end the match');
  await pads[0].click('#skip'); await pads[0].waitForFunction(() => window.PAD_STATE.view === 'game', null, { timeout: 10000 }); await sleep(600);
  await pads[0].click('#hostTab'); await sleep(300);
  await pads[0].screenshot({ path: out + '/h3-phone-end-match.png' });
  await pads[0].click('.sheet [data-i="0"]'); await sleep(800);
  check((await screen()).startsWith('catalog'), 'the host ends the match from the phone: the TV is back in the catalog');
  check(await pads[0].$('#hostTab') === null, 'and the tab is gone');
  // remove a player from the phone
  await pads[0].click('#crew span:nth-child(3)'); await sleep(300);
  await pads[0].click('.sheet [data-i="0"]'); await sleep(800);
  check((await tv.evaluate(() => window.TV_STATE.players.map((p) => p.name).join(','))) === 'Ana,Bruno', 'the host removes Carla from the phone');
  check(/removido/.test(await pads[2].textContent('body')), 'Carla is told');
  console.log('errors:', errors.length ? errors.slice(0, 8) : 'none');
  console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
  await b.close();
  process.exit(failures ? 1 : 0);
})();
