module.exports = async function cabo({ tv, pads, shot, startGame, sleep, state, cfg, out }) {
  await cfg('cabo', { wins: 2, secs: 20 });
  await startGame('cabo', true);
  await sleep(1500); await shot('cabo-teams');
  const teamOf = async (p) => (await p.textContent('#tn')).trim();
  for (let round = 0; round < 3 && (await state()) === 'play'; round++) {
    await pads[0].waitForFunction(() => /PUXE|^\d+$/.test(document.querySelector('#big').textContent) && !document.querySelector('#btn').classList.contains('off'), null, { timeout: 20000 });
    const teams = [];
    for (const p of pads) teams.push(await teamOf(p));
    // red taps hard in rounds 1 and 3, blue in round 2
    const strong = round === 1 ? 'Time Azul' : 'Time Vermelho';
    const t0 = Date.now();
    let shotDone = false;
    let loops = 0;
    while (await pads[0].evaluate(() => !document.querySelector('#btn').classList.contains('off'))) {
      for (let i = 0; i < pads.length; i++) {
        const k = teams[i] === strong ? 1 : (loops % 2);
        await pads[i].evaluate((n) => { const b = document.querySelector('#btn'); for (let j = 0; j < n; j++) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); }, k);
      }
      loops++;
      await sleep(110);
      if (!shotDone && Date.now() - t0 > 2500 && round === 0) { shotDone = true; await shot('cabo-pull'); await pads[0].setViewportSize({ width: 780, height: 360 }); await sleep(200); await pads[0].screenshot({ path: out + '/cabo-pull-pad-land.png' }); await pads[0].setViewportSize({ width: 412, height: 839 }); }
      if (Date.now() - t0 > 30000) break;
    }
    await sleep(700);
    if (round === 0) await shot('cabo-round');
    await sleep(2000);
  }
  for (let i = 0; i < 200 && (await state()) === 'play'; i++) await sleep(100);
  await sleep(2000); await shot('cabo-end');
};
