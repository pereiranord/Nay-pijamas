module.exports = async function quemsou({ tv, pads, shot, startGame, sleep, state, cfg, out }) {
  await cfg('quemsou', { secs: 45, rounds: 1, cats: ['animais', 'personagens', 'comidas'] });
  await startGame('quemsou', true);
  for (let turn = 0; turn < pads.length && (await state()) === 'play'; turn++) {
    let a = -1;
    for (let t = 0; t < 120 && a < 0; t++) { for (let i = 0; i < pads.length; i++) if (await pads[i].$('#go')) { a = i; break; } if (a < 0) await sleep(150); }
    if (a < 0) break;
    const friend = pads[(a + 1) % pads.length];
    if (turn === 0) { await sleep(300); await tv.screenshot({ path: out + '/quemsou-ready-tv.png' }); await pads[a].screenshot({ path: out + '/quemsou-ready-pad.png' }); }
    await pads[a].click('#go');
    await pads[a].waitForSelector('.qp-zones', { timeout: 10000 });
    await sleep(400);
    if (turn === 0) {
      await pads[a].screenshot({ path: out + '/quemsou-word-pad.png' });
      await pads[a].setViewportSize({ width: 780, height: 360 }); await sleep(300);
      await pads[a].screenshot({ path: out + '/quemsou-word-pad-land.png' });
      await pads[a].setViewportSize({ width: 412, height: 839 }); await sleep(200);
      await friend.screenshot({ path: out + '/quemsou-help-pad.png' });
    }
    // a hit by the sensor (simulated), a hit by a friend's button, a skip on the forehead phone, one more hit
    await pads[a].evaluate(() => { const ev = (z) => { const e = new Event('devicemotion'); e.accelerationIncludingGravity = { x: 0, y: 0, z }; window.dispatchEvent(e); }; ev(0); ev(-9); });
    await sleep(900);
    await friend.click('[data-k="hit"]'); await sleep(900);
    await pads[a].click('.qp-zones [data-k="skip"]'); await sleep(900);
    await friend.click('[data-k="hit"]'); await sleep(600);
    if (turn === 0) await tv.screenshot({ path: out + '/quemsou-act-tv.png' });
    for (let i = 0; i < 400 && (await pads[a].$('.qp-zones')); i++) await sleep(200);
    if (turn === 0) { await sleep(1200); await tv.screenshot({ path: out + '/quemsou-over-tv.png' }); }
  }
  for (let i = 0; i < 300 && (await state()) === 'play'; i++) await sleep(100);
  await sleep(2000); await shot('quemsou-end');
};
