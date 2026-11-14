// One match of Desarme a Bomba played through the phones' screens: one mistake on purpose, then every module solved
// with the solution read from the TV page (the test plays the experts' role).
module.exports = async function bomba({ tv, pads, shot, startGame, sleep, state, cfg, out }) {
  await cfg('bomba', { level: 'dificil', time: 300 });
  await startGame('bomba', true);
  let t = -1;
  for (let k = 0; k < 60 && t < 0; k++) { for (let i = 0; i < pads.length; i++) if (await pads[i].$('.bp-tabs')) { t = i; break; } if (t < 0) await sleep(150); }
  if (t < 0) throw new Error('no technician');
  const tech = pads[t], expert = pads[(t + 1) % pads.length];
  await sleep(500);
  await tv.screenshot({ path: out + '/bomba-start-tv.png' });
  await expert.screenshot({ path: out + '/bomba-manual-pad.png', fullPage: false });
  // the solutions, as the experts would work them out
  const mods = await tech.evaluate(() => window.PAD_STATE.inst ? null : null) || null; void mods;
  const info = await tv.evaluate(() => window.__bomb || null); void info;
  const tabs = await tech.$$('.bp-tab');
  for (let i = 0; i < tabs.length; i++) {
    await (await tech.$$('.bp-tab'))[i].click(); await sleep(300);
    const type = await tech.evaluate(() => { const p = document.querySelector('#panel'); return p.querySelector('.bp-wire') ? 'fios' : p.querySelector('.bp-sym') ? 'simbolos' : p.querySelector('.bp-keys') ? 'senha' : p.querySelector('.bp-simon') ? 'cores' : 'botao'; });
    await tech.screenshot({ path: `${out}/bomba-${type}-pad.png` });
    if (i === 0) { await tech.setViewportSize({ width: 780, height: 360 }); await sleep(300); await tech.screenshot({ path: `${out}/bomba-${type}-pad-land.png` }); await tech.setViewportSize({ width: 412, height: 839 }); await sleep(200); }
    const sol = await tv.evaluate((n) => window.TV_STATE.inst.__solution(n), i);
    if (type === 'fios') {
      if (i === 0) { const n = await tech.$$('.bp-wire'); await n[(sol + 1) % n.length].click(); await sleep(500); await tv.screenshot({ path: out + '/bomba-error-tv.png' }); }
      await (await tech.$$('.bp-wire'))[sol].click();
    } else if (type === 'simbolos') { for (const s of sol) { await tech.click(`.bp-sym[data-s="${s}"]`); await sleep(250); } }
    else if (type === 'senha') { for (const d of sol) { await tech.click(`.bp-keys [data-d="${d}"]`); await sleep(80); } await tech.click('.bp-keys [data-d="ok"]'); }
    else if (type === 'cores') { for (const c of sol) { await tech.click(`.bp-simon [data-c="${c}"]`); await sleep(250); } }
    else { for (let k = 0; k < sol; k++) { await tech.click('#big'); await sleep(80); } await tech.click('#conf'); }
    await sleep(500);
    if (i === 1) await tv.screenshot({ path: out + '/bomba-mid-tv.png' });
  }
  await sleep(1200);
  await tv.screenshot({ path: out + '/bomba-win-tv.png' });
  for (let i = 0; i < 100 && (await state()) === 'play'; i++) await sleep(100);
  await sleep(2000); await shot('bomba-end');
};
