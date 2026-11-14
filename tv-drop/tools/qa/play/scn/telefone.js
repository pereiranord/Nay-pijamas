const { doodle } = require('./desenho.js');
module.exports = async function telefone({ tv, pads, shot, startGame, sleep, state, cfg, out }) {
  await cfg('telefone', { draw: 45, steps: 3 });
  await startGame('telefone', true);
  const phrases = ['um gato pilotando um avião', 'a casa que anda de skate', 'o sol tomando sorvete', 'uma vaca no espaço'];
  // step 1: write
  await pads[0].waitForSelector('#t', { timeout: 20000 });
  for (let i = 0; i < pads.length; i++) { await pads[i].fill('#t', phrases[i % phrases.length]); await pads[i].click('#send'); await sleep(120); if (i === 0) await shot('telefone-write'); }
  // step 2: draw
  await pads[0].waitForSelector('.sk-cv canvas', { timeout: 20000 });
  await sleep(300);
  for (let i = 0; i < pads.length; i++) await doodle(pads[i], i, sleep);
  await sleep(300); await shot('telefone-draw');
  await pads[0].setViewportSize({ width: 780, height: 360 }); await sleep(300);
  await pads[0].screenshot({ path: out + '/telefone-draw-pad-land.png' });
  await pads[0].setViewportSize({ width: 412, height: 839 }); await sleep(200);
  for (let i = 0; i < pads.length; i++) await pads[i].click('#done');
  // step 3: describe
  await pads[0].waitForSelector('.tp-img', { timeout: 20000 });
  await sleep(400); await shot('telefone-desc');
  for (let i = 0; i < pads.length; i++) { await pads[i].fill('#t', ['um triângulo sorrindo', 'uma caixa com olhos', 'um raio cortando a onda', 'não sei, parece um chapéu'][i % 4]); await pads[i].click('#send'); await sleep(120); }
  // reveal + vote, chain by chain
  for (let c = 0; c < pads.length && (await state()) === 'play'; c++) {
    await pads[0].waitForSelector('.tp-opts', { timeout: 30000 });
    await sleep(300);
    if (c === 0) await shot('telefone-vote');
    for (let i = 0; i < pads.length; i++) { const b = await pads[i].$('.tp-opts .btn:not([disabled])'); if (b) await b.click(); await sleep(100); }
    await sleep(1200);
    if (c === 0) await shot('telefone-tally');
    for (let i = 0; i < 80 && (await pads[0].$('.tp-opts')); i++) await sleep(150);
  }
  for (let i = 0; i < 200 && (await state()) === 'play'; i++) await sleep(100);
  await sleep(2000); await shot('telefone-end');
};
