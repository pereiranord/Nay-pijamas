// Scenarios for games.js
const out = process.argv[3];
module.exports = {
  async lobby({ tv, pads, shot, padSend, sleep, pick }) {
    await padSend(1, { t: 'wave' });
    await pick('rabisco');
    await sleep(500);
    await shot('lobby');
    await pads[1].screenshot({ path: out + '/lobby-pad2.png' });
  },

  async arena({ tv, pads, shot, padSend, startGame, sleep, state }) {
    await startGame('arena', true);
    const t0 = Date.now();
    let n = 0;
    while ((await state()) === 'play' && Date.now() - t0 < 260000) {
      for (let i = 0; i < pads.length; i++) { const a = Date.now() / 700 + i * 2; await padSend(i, { t: 'g', k: 'in', x: Math.cos(a), y: Math.sin(a), f: true }); if (n % 20 === i) await padSend(i, { t: 'g', k: 'dash' }); }
      await sleep(90); n++;
      if (n === 25) await shot('arena-play');
      if (n === 120) await shot('arena-play2');
    }
    await sleep(2500);
    await shot('arena-end');
    await pads[1].screenshot({ path: out + '/arena-end-pad2.png' });
  },

  async batata({ tv, pads, shot, padSend, startGame, sleep, state }) {
    await startGame('batata', true);
    const t0 = Date.now();
    let shots = 0, boom = false, picked = false;
    while ((await state()) === 'play' && Date.now() - t0 < 200000) {
      for (let i = 0; i < pads.length; i++) {
        const st = await pads[i].evaluate(() => { const b = document.querySelector('#box'); return b ? (/\bh[012]\b/.test(b.className) ? 'hold' : b.textContent.includes('BUM') ? 'boom' : '') : ''; });
        if (st === 'boom' && !boom) { boom = true; await sleep(300); await pads[i].screenshot({ path: out + '/batata-boom-pad.png' }); await tv.screenshot({ path: out + '/batata-boom-tv.png' }); }
        if (st !== 'hold') continue;
        await sleep(700);
        if (shots < 2) { shots++; await tv.screenshot({ path: `${out}/batata-play${shots}-tv.png` }); await pads[i].screenshot({ path: `${out}/batata-hold${shots}-pad.png` }); }
        // every other time, pass through the real "who gets it" screen
        const hasPicker = await pads[i].evaluate(() => { const p = window.PAD_STATE.inst; return !!p; });
        if (!picked && hasPicker && pads.length > 2) {
          // solve whatever challenge by brute force is unreliable; call the pass directly but screenshot a picker once via DOM
          picked = true;
        }
        await padSend(i, { t: 'g', k: 'pass' });
        await sleep(350);
      }
      await sleep(200);
    }
    await sleep(2500);
    await shot('batata-end');
  },

  async mente({ tv, pads, shot, startGame, sleep, state }) {
    await startGame('mente', true);
    const lies = ['um pato de borracha', 'queijo derretido', 'meia furada', 'sabão em pó', 'um sofá velho', 'pipoca doce'];
    for (let round = 0; round < 8 && (await state()) === 'play'; round++) {
      if (!(await pads[0].waitForSelector('#lie', { timeout: 30000 }).catch(() => null))) break;
      await sleep(400);
      if (round === 0) await shot('mente-write');
      for (let i = 0; i < pads.length; i++) { await pads[i].fill('#lie', i === 1 && round === 0 ? 'unicórnio' : lies[(i + round) % lies.length]); await pads[i].click('#send'); await sleep(150); }
      if (round === 0) {
        // Bruno typed what may be the truth: make sure he ends up with a lie either way
        await sleep(300);
        if (await pads[1].$('#lie')) { await pads[1].screenshot({ path: out + '/mente-truth-pad.png' }); await pads[1].fill('#lie', 'um dragão anão'); await pads[1].click('#send'); }
      }
      await pads[0].waitForSelector('.vopt', { timeout: 30000 });
      await sleep(900);
      if (round === 0) await shot('mente-vote');
      for (let i = 0; i < pads.length; i++) { const opts = await pads[i].$$('.vopt'); await opts[(i + round) % opts.length].click(); await sleep(150); }
      await sleep(5200);
      if (round === 0) await shot('mente-reveal');
      await pads[0].waitForSelector('.lines', { timeout: 40000 });
      if (round === 0) { await sleep(300); await shot('mente-sum'); }
    }
    for (let i = 0; i < 300 && (await state()) === 'play'; i++) await sleep(100);
    await sleep(2500);
    await shot('mente-end');
  },

  async rabisco({ tv, pads, shot, startGame, sleep, state }) {
    await startGame('rabisco', true);
    let turn = 0;
    while ((await state()) === 'play' && turn < 12) {
      let d = -1;
      for (let tries = 0; tries < 80 && d < 0; tries++) {
        for (let i = 0; i < pads.length; i++) if (await pads[i].$('.choices [data-i]')) { d = i; break; }
        if (d < 0) { if ((await state()) !== 'play') return; if (await tv.$('.rb-gallery')) break; await sleep(150); }
      }
      if (d < 0) break;
      if (turn === 0) { await sleep(300); await pads[d].screenshot({ path: out + '/rabisco-choose-pad.png' }); }
      await pads[d].click('.choices [data-i="0"]');
      await pads[d].waitForSelector('.sk-cv canvas');
      await sleep(300);
      const word = (await pads[d].evaluate(() => document.querySelector('.sk-head .word').lastChild.textContent)).trim();
      const box = await (await pads[d].$('.sk-cv canvas')).boundingBox();
      const m = pads[d].mouse, P = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy];
      // a house: square, roof, door, and a sun in yellow
      const line = async (pts) => { await m.move(...P(...pts[0])); await m.down(); for (const p of pts.slice(1)) await m.move(...P(...p), { steps: 6 }); await m.up(); };
      await line([[0.25, 0.85], [0.25, 0.45], [0.7, 0.45], [0.7, 0.85], [0.25, 0.85]]);
      await pads[d].click('.ink[data-i="1"]');
      await line([[0.2, 0.47], [0.475, 0.2], [0.75, 0.47]]);
      await pads[d].click('.ink[data-i="3"]'); await pads[d].click('.sz[data-s="2"]');
      await line([[0.85, 0.15], [0.86, 0.16]]);
      await pads[d].click('.ink[data-i="4"]');
      await line([[0.05, 0.9], [0.3, 0.88], [0.6, 0.91], [0.95, 0.88]]);
      await pads[d].click('#skEraser'); await line([[0.4, 0.6], [0.55, 0.75]]); await pads[d].click('#skEraser');
      if (turn === 0) { await pads[d].setViewportSize({ width: 780, height: 360 }); await sleep(400); await pads[d].screenshot({ path: out + '/rabisco-draw-pad-land.png' }); await pads[d].setViewportSize({ width: 412, height: 839 }); await sleep(300); }
      await sleep(300);
      const g = pads.findIndex((_, i) => i !== d);
      await pads[g].fill('#g', 'casa amarela'); await pads[g].click('#send'); await sleep(250);
      await pads[g].fill('#g', word.slice(0, -1) + 'x'); await pads[g].click('#send'); await sleep(350);
      if (turn === 0) { await tv.screenshot({ path: out + '/rabisco-draw-tv.png' }); await pads[d].screenshot({ path: out + '/rabisco-draw-pad.png' }); await pads[g].screenshot({ path: out + '/rabisco-guess-pad.png' }); }
      for (let i = 0; i < pads.length; i++) { if (i === d) continue; if (i === pads.length - 1 && pads.length > 2 && turn % 2) continue; if (!(await pads[i].$('#g'))) continue; await pads[i].fill('#g', word); await pads[i].click('#send'); await sleep(200); }
      if (turn === 0) { await sleep(400); await pads[g].screenshot({ path: out + '/rabisco-right-pad.png' }); }
      if (turn === 1) { await sleep(1500); await tv.screenshot({ path: out + '/rabisco-over-tv.png' }); }
      turn++;
      // wait for the turn to end (everyone guessed, or we cut the clock)
      await tv.evaluate(() => { /* nothing */ });
      for (let i = 0; i < 60; i++) { if (!(await pads[d].$('.sk-cv canvas'))) break; await sleep(200); if (i === 8) await tv.evaluate(() => { const T = window.TV_STATE; void T; }); }
      if (await pads[d].$('.sk-cv canvas')) { // someone didn't guess: let the drawer leave the turn by timing out faster in the test
        await tv.evaluate(() => { window.__skipClock = true; });
        for (let i = 0; i < 400 && (await pads[d].$('.sk-cv canvas')); i++) await sleep(200);
      }
    }
    for (let i = 0; i < 40 && !(await tv.$('.rb-gallery')) && (await state()) === 'play'; i++) await sleep(200);
    await sleep(2500);
    await tv.screenshot({ path: out + '/rabisco-gallery-tv.png' });
    for (let i = 0; i < 150 && (await state()) === 'play'; i++) await sleep(100);
    await sleep(2500);
    await shot('rabisco-end');
  },

  async corrida({ tv, pads, shot, padSend, startGame, sleep, state }) {
    await startGame('corrida', true);
    const t0 = Date.now();
    let n = 0;
    // autopilot inside the TV page: steer each sofa at a point ahead on the track (the last one drives worse)
    await tv.evaluate(() => {
      window.__auto = setInterval(() => {
        const inst = window.TV_STATE.inst; if (!inst || !inst._dbg) { clearInterval(window.__auto); return; }
        const { cars, pts, N } = inst._dbg;
        cars.forEach((car, i) => {
          const t = pts[(car.idx + 9 + i) % N]; let d = Math.atan2(t[1] - car.y, t[0] - car.x) - car.ang;
          while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
          car.steer = Math.max(-1, Math.min(1, d * 2.2)); car.gas = i === cars.length - 1 ? Math.random() < 0.8 : true;
        });
      }, 40);
    });
    while ((await state()) === 'play' && Date.now() - t0 < 260000) {
      await sleep(200); n++;
      if (n === 12) await shot('corrida-play');
      if (n === 60) { await shot('corrida-play2'); await padSend(0, { t: 'g', k: 'in', s: 0.6, g: true }); }
    }
    await sleep(2500);
    await shot('corrida-end');
  },
};

// Six players, TV remote keys, a phone that reloads mid-game, the "dead" effect, and a late joiner.
module.exports.misc = async ({ tv, pads, shot, padSend, startGame, sleep, state, base, code }) => {
  await tv.screenshot({ path: out + '/lobby6-tv.png' });
  await tv.keyboard.press('ArrowRight'); await tv.keyboard.press('ArrowRight'); await sleep(300);
  console.log('remote moved selection to:', await tv.evaluate(() => J.ORDER[window.TV_STATE.sel]));
  await tv.keyboard.press('Escape'); await sleep(300);
  console.log('exit question shown:', await tv.evaluate(() => !document.querySelector('#modal').hidden));
  await tv.screenshot({ path: out + '/modal-tv.png' });
  await tv.keyboard.press('Escape'); await sleep(200);
  await tv.keyboard.press('ArrowLeft'); await tv.keyboard.press('ArrowLeft'); await sleep(200);
  await tv.keyboard.press('Enter'); await sleep(800);
  console.log('remote OK started:', await state(), await tv.evaluate(() => window.TV_STATE.game.id));
  await tv.keyboard.press('Enter');
  for (let i = 0; i < 60 && (await state()) !== 'play'; i++) await sleep(100);
  await sleep(500);
  // phone 2 reloads in the middle of the match
  await pads[2].reload(); await sleep(1500);
  console.log('reloaded phone is back in the game:', await pads[2].evaluate(() => window.PAD_STATE.view), '| hud:', await pads[2].evaluate(() => !!document.querySelector('#stick')));
  // everyone shoots at the middle until someone dies; grab that phone
  let got = false;
  const t0 = Date.now();
  while ((await state()) === 'play' && Date.now() - t0 < 60000 && !got) {
    for (let i = 0; i < pads.length; i++) { const a = Date.now() / 500 + i; await padSend(i, { t: 'g', k: 'in', x: Math.cos(a) * 0.9, y: Math.sin(a) * 0.9, f: true }); }
    await sleep(120);
    for (let i = 0; i < pads.length && !got; i++) if (await pads[i].evaluate(() => /Eliminado/.test(document.querySelector('#st') ? document.querySelector('#st').textContent : ''))) { got = true; await sleep(250); await pads[i].screenshot({ path: out + '/arena-dead-pad.png' }); await tv.screenshot({ path: out + '/arena6-tv.png' }); }
  }
  console.log('dead effect captured:', got);
  await tv.keyboard.press('Escape'); await sleep(300);
  await tv.keyboard.press('Enter'); await sleep(600);
  console.log('back to lobby from remote:', await state());
  await pads[0].screenshot({ path: out + '/lobby-after-pad.png' });
};

// The TV Drop phone interface: the "Jogos" button opens the controller on top of the app.
module.exports.app = async ({ tv, pads, sleep, base, code }) => {
  const { chromium, devices } = require('playwright');
  const fs = require('fs');
  const b = await chromium.launch();
  const c = await b.newContext({ ...devices['Pixel 7'] });
  const p = await c.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  const pin = fs.readFileSync(process.argv[2], 'utf8').split(' ')[1];
  await p.goto(base + '/?pair=' + pin);
  await p.waitForSelector('#appView:not([hidden])', { timeout: 8000 });
  await p.waitForSelector('#gamesBtn');
  await sleep(600);
  await p.screenshot({ path: out + '/app-home.png' });
  console.log('hero text:', (await p.textContent('#gamesSub')).trim());
  await p.click('#gamesBtn');
  await p.waitForSelector('#gamepad iframe');
  const f = p.frameLocator('#gamepad iframe');
  await f.locator('#name').fill('Gui');
  await f.locator('#go').click();
  await f.locator('#myName').waitFor({ timeout: 8000 });
  await sleep(500);
  await p.screenshot({ path: out + '/app-gamepad.png' });
  console.log('players on TV now:', await tv.evaluate(() => window.TV_STATE.players.map((x) => x.name).join(', ')));
  await p.click('#gamepadX');
  console.log('closed overlay:', !(await p.$('#gamepad')), '| errors:', errs.length ? errs : 'none');
  await b.close();
};
