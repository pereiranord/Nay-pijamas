module.exports = async function mimica({ tv, pads, shot, startGame, sleep, state, cfg, out }) {
  await cfg('mimica', { secs: 45, rounds: 1, level: 'medio', cats: ['animais', 'acoes', 'filmes'] });
  await startGame('mimica', true);
  for (let turn = 0; turn < pads.length && (await state()) === 'play'; turn++) {
    let a = -1;
    for (let t = 0; t < 100 && a < 0; t++) { for (let i = 0; i < pads.length; i++) if (await pads[i].$('#go')) { a = i; break; } if (a < 0) await sleep(150); }
    if (a < 0) break;
    if (turn === 0) { await sleep(300); await tv.screenshot({ path: out + '/mimica-ready-tv.png' }); await pads[a].screenshot({ path: out + '/mimica-ready-pad.png' }); }
    await pads[a].click('#go');
    await pads[a].waitForSelector('#hit');
    await sleep(500);
    if (turn === 0) {
      await pads[a].screenshot({ path: out + '/mimica-word-pad.png' });
      await pads[a].setViewportSize({ width: 780, height: 360 }); await sleep(300);
      await pads[a].screenshot({ path: out + '/mimica-word-pad-land.png' });
      await pads[a].setViewportSize({ width: 412, height: 839 }); await sleep(200);
      await pads[(a + 1) % pads.length].screenshot({ path: out + '/mimica-watch-pad.png' });
    }
    // two hits (choosing who got it), one skip, one more hit
    for (let n = 0; n < 4; n++) {
      await pads[a].waitForSelector('#hit');
      if (n === 2) { await pads[a].click('#skip'); await sleep(400); continue; }
      await pads[a].click('#hit');
      const who = await pads[a].$$('.mm-who [data-id]');
      if (who.length) { if (turn === 0 && n === 0) await pads[a].screenshot({ path: out + '/mimica-who-pad.png' }); await who[n % who.length].click(); }
      await sleep(500);
    }
    if (turn === 0) await tv.screenshot({ path: out + '/mimica-act-tv.png' });
    // wait for the clock of this turn to finish
    for (let i = 0; i < 400 && (await pads[a].$('#hit')); i++) await sleep(200);
    if (turn === 0) { await sleep(1500); await tv.screenshot({ path: out + '/mimica-over-tv.png' }); }
  }
  for (let i = 0; i < 300 && (await state()) === 'play'; i++) await sleep(100);
  await sleep(2000); await shot('mimica-end');
};
