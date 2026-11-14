// Pesca Maluca: each simulated phone casts with a real swipe, pulls when its screen says "PUXE!", and once pulls too early.
module.exports = async function pesca({ tv, pads, shot, startGame, sleep, state, cfg, out }) {
  await cfg('pesca', { secs: 60 });
  await startGame('pesca', true);
  await pads[0].waitForSelector('#z');
  await sleep(600);
  const swipe = async (p, power, side) => {
    const b = await (await p.$('#z')).boundingBox();
    const x = b.x + b.width / 2, y = b.y + b.height * 0.85;
    await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + side * b.width * 0.2, y - b.height * 0.6 * power, { steps: 5 }); await p.mouse.up();
  };
  const text = (p) => p.textContent('#big');
  const t0 = Date.now();
  let shots = 0, early = false;
  while ((await state()) === 'play' && Date.now() - t0 < 80000) {
    for (let i = 0; i < pads.length; i++) {
      const t = (await text(pads[i])).trim();
      if (t === 'Arremesse!') await swipe(pads[i], [0.35, 0.7, 1, 0.5][i % 4], [0, 0.6, -0.6, 0.3][(i + Math.floor((Date.now() - t0) / 9000)) % 4]);
      else if (t === 'PUXE!') { if (shots === 1) { await pads[i].screenshot({ path: out + '/pesca-bite-pad.png' }); shots = 2; } await pads[i].dispatchEvent('#z', 'pointerdown'); }
      else if (t === 'Esperando…' && !early && i === 1 && Date.now() - t0 > 4000) { early = true; await pads[i].dispatchEvent('#z', 'pointerdown'); }
    }
    if (shots === 0 && Date.now() - t0 > 3500) { shots = 1; await shot('pesca-play'); await pads[0].setViewportSize({ width: 780, height: 360 }); await sleep(250); await pads[0].screenshot({ path: out + '/pesca-play-pad-land.png' }); await pads[0].setViewportSize({ width: 412, height: 839 }); }
    if (shots === 2 && Date.now() - t0 > 30000) { shots = 3; await tv.screenshot({ path: out + '/pesca-mid-tv.png' }); }
    await sleep(120);
  }
  for (let i = 0; i < 200 && (await state()) === 'play'; i++) await sleep(100);
  await sleep(2000); await shot('pesca-end');
  console.log('scores:', await tv.evaluate(() => [...document.querySelectorAll('.pcol .pts')].map((x) => x.textContent).join(' | ')));
};
