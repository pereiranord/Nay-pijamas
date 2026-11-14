// shared by the drawing scenarios: draws something different per player on a Sketch pad
async function doodle(pad, i, sleep) {
  const cv = await pad.$('.sk-cv canvas');
  const box = await cv.boundingBox();
  const m = pad.mouse, P = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy];
  const line = async (pts) => { await m.move(...P(...pts[0])); await m.down(); for (const p of pts.slice(1)) await m.move(...P(...p), { steps: 5 }); await m.up(); };
  await pad.click(`.ink[data-i="${(i * 2 + 1) % 10}"]`);
  if (i % 3 === 0) { await line([[0.2, 0.8], [0.5, 0.2], [0.8, 0.8], [0.2, 0.8]]); await pad.click('.ink[data-i="5"]'); await line([[0.4, 0.55], [0.6, 0.55]]); }
  else if (i % 3 === 1) { await line([[0.25, 0.3], [0.75, 0.3], [0.75, 0.75], [0.25, 0.75], [0.25, 0.3]]); await pad.click('.sz[data-s="2"]'); await line([[0.4, 0.45], [0.41, 0.46]]); await line([[0.6, 0.45], [0.61, 0.46]]); }
  else { await line([[0.2, 0.5], [0.35, 0.3], [0.5, 0.5], [0.65, 0.7], [0.8, 0.5]]); await pad.click('.ink[data-i="3"]'); await line([[0.5, 0.15], [0.5, 0.85]]); }
  await sleep(150);
}
module.exports = async function desenho({ tv, pads, shot, startGame, sleep, state, cfg, out }) {
  await cfg('desenho', { secs: 45, rounds: 2 });
  await startGame('desenho', true);
  for (let round = 0; round < 2 && (await state()) === 'play'; round++) {
    await pads[0].waitForSelector('.sk-cv canvas', { timeout: 20000 });
    await sleep(300);
    for (let i = 0; i < pads.length; i++) await doodle(pads[i], i + round, sleep);
    if (round === 0) {
      await sleep(400); await shot('desenho-draw');
      await pads[0].setViewportSize({ width: 780, height: 360 }); await sleep(300);
      await pads[0].screenshot({ path: out + '/desenho-draw-pad-land.png' });
      await pads[0].setViewportSize({ width: 412, height: 839 }); await sleep(200);
    }
    for (let i = 0; i < pads.length; i++) await pads[i].click('#done');
    await pads[0].waitForSelector('.dr-opt', { timeout: 15000 });
    await sleep(900);
    if (round === 0) { await shot('desenho-vote'); }
    for (let i = 0; i < pads.length; i++) { const o = await pads[i].$$('.dr-opt'); await o[(i === 2 ? 1 : 0) % o.length].click(); await sleep(150); }
    await sleep(1500);
    if (round === 0) await shot('desenho-reveal');
    await sleep(5500);
  }
  for (let i = 0; i < 200 && (await state()) === 'play'; i++) await sleep(100);
  await sleep(2000); await shot('desenho-end');
};
module.exports.doodle = doodle;
