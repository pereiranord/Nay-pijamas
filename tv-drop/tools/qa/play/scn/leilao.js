module.exports = async function leilao({ tv, pads, shot, startGame, sleep, state, cfg, out }) {
  await cfg('leilao', { items: 6, start: 1000, secs: 15 });
  await startGame('leilao', true);
  for (let round = 0; round < 6 && (await state()) === 'play'; round++) {
    await pads[0].waitForSelector('#send', { timeout: 25000 });
    await sleep(300);
    if (round === 0) {
      await shot('leilao-bid');
      await pads[0].setViewportSize({ width: 780, height: 360 }); await sleep(300);
      await pads[0].screenshot({ path: out + '/leilao-bid-pad-land.png' });
      await pads[0].setViewportSize({ width: 412, height: 839 }); await sleep(200);
    }
    for (let i = 0; i < pads.length; i++) {
      if (!(await pads[i].$('#send'))) continue;
      const taps = (i + round) % 4; // 0 = pass
      for (let k = 0; k < taps; k++) await pads[i].click('[data-add="100"]');
      if (i === 1 && round === 2) await pads[i].click('[data-add="all"]');
      await pads[i].click('#send'); await sleep(120);
    }
    if (round === 0) { await sleep(1500); await shot('leilao-bids'); }
    await pads[0].waitForSelector('.statusbig', { timeout: 20000 });
    if (round < 2) { await sleep(700); await shot('leilao-reveal' + round); }
    for (let i = 0; i < 100 && (await pads[0].$('.statusbig')); i++) await sleep(150);
  }
  for (let i = 0; i < 200 && (await state()) === 'play'; i++) await sleep(100);
  await sleep(2000); await shot('leilao-end');
};
