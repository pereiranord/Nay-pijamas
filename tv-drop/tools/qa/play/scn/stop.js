module.exports = async function stop({ tv, pads, shot, startGame, sleep, state, padSend, cfg, out }) {
  await cfg('stop', { rounds: 3, secs: 60, pts: '10-5', cats: ['nome', 'animal', 'comida'] });
  await startGame('stop', true);
  const bank = { A: ['Ana', 'Anta', 'Arroz'], B: ['Bia', 'Boi', 'Bolo'], C: ['Caio', 'Cobra', 'Coxinha'], D: ['Davi', 'Dromedário', 'Doce'], E: ['Eva', 'Ema', 'Empada'], F: ['Fábio', 'Foca', 'Feijão'], G: ['Gabi', 'Gato', 'Goiabada'], I: ['Iara', 'Iguana', 'Iogurte'], J: ['João', 'Jacaré', 'Jiló'], L: ['Lia', 'Leão', 'Lasanha'], M: ['Mara', 'Macaco', 'Macarrão'], N: ['Nina', 'Naja', 'Nhoque'], O: ['Olga', 'Onça', 'Ovo'], P: ['Pedro', 'Pato', 'Pizza'], R: ['Rui', 'Rato', 'Risoto'], S: ['Sara', 'Sapo', 'Sopa'], T: ['Téo', 'Tatu', 'Torta'], U: ['Ugo', 'Urso', 'Uva'], V: ['Vera', 'Vaca', 'Vatapá'] };
  for (let round = 0; round < 3 && (await state()) === 'play'; round++) {
    await pads[0].waitForSelector('.st-list input', { timeout: 20000 });
    const letter = (await pads[0].textContent('.st-l')).trim();
    const w = bank[letter];
    if (round === 0) { await sleep(300); await shot('stop-fill'); }
    // the others answer by message: one repeats Ana's animal and gives a wrong letter, one leaves a blank
    for (let i = 1; i < pads.length; i++) await padSend(i, { t: 'g', k: 'ans', a: i === 1 ? [w[0] + 'x', w[1], 'Zebra'] : i === 2 ? [w[0] + 'y', '', w[2]] : [w[0] + i, w[1] + i, w[2] + i] });
    const inputs = await pads[0].$$('.st-list input');
    for (let i = 0; i < inputs.length; i++) { await inputs[i].fill(w[i]); await sleep(120); }
    if (round === 0) {
      await sleep(900); await shot('stop-filled');
      await pads[0].setViewportSize({ width: 780, height: 360 }); await sleep(300);
      await pads[0].screenshot({ path: out + '/stop-fill-pad-land.png' });
      await pads[0].setViewportSize({ width: 412, height: 839 }); await sleep(200);
    }
    await pads[0].click('#stop');
    for (let c = 0; c < 3; c++) {
      await pads[0].waitForFunction((n) => { const s = document.querySelector('.st-top small'); return s && s.textContent.indexOf('Categoria ' + n) === 0; }, c + 1, { timeout: 20000 });
      await sleep(400);
      if (round === 0 && c === 0) {
        const b = await pads[0].$('button.st-it:not(.auto)'); if (b) await b.click();
        await sleep(400); await shot('stop-review'); await pads[1].screenshot({ path: out + '/stop-review-pad2.png' });
      }
      for (let i = 0; i < pads.length; i++) await pads[i].click('#ok');
      if (round === 0 && c === 1) { await sleep(900); await shot('stop-tally'); }
    }
    await sleep(1500);
    if (round === 0) { await sleep(1800); await shot('stop-sum'); }
  }
  for (let i = 0; i < 200 && (await state()) === 'play'; i++) await sleep(100);
  await sleep(2000); await shot('stop-end');
};
