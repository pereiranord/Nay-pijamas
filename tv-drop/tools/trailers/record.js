// Records the Central Gamer trailers: real matches played by simulated players, with the TV full screen
// and one player's phone in a corner, then cuts 15 s and encodes H.264 for the TV.
//
//   TVDROP_DEV=900 TVDROP_DEV_INFO=/tmp/tvdrop.info gradle testReleaseUnitTest --tests "*DevServer*" &
//   node tools/trailers/record.js /tmp/tvdrop.info assets/web/media/trailers [game ...]
//
// Needs Playwright (Chromium) and ffmpeg.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const [,, infoFile, outDir, ...only] = process.argv;
const [port, , code, key] = fs.readFileSync(infoFile, 'utf8').trim().split(' ');
const base = 'http://127.0.0.1:' + port;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NAMES = ['Ana', 'Bruno', 'Carla', 'Diego'];
const LEN = 15;

async function session(game, players, play) {
  const b = await chromium.launch();
  try { return await record(b, game, players, play); } finally { await b.close().catch(() => {}); }
}

async function record(b, game, players, play) {
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'trailer-'));
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: tmp, size: { width: 1280, height: 720 } } });
  const t0 = Date.now();
  const stage = await ctx.newPage();
  const errors = [];
  stage.on('pageerror', (e) => errors.push(e.message));
  // the stage is served from the TV's own address (only inside this recording): the Central refuses to be framed by other sites
  await ctx.route(base + '/__trailer_stage.html*', (route) => route.fulfill({ contentType: 'text/html', body: fs.readFileSync(path.join(__dirname, 'stage.html'), 'utf8') }));
  await stage.goto(base + '/__trailer_stage.html?tv=' + encodeURIComponent(base + '/gamer-tv.html?key=' + key) + '&pad=' + encodeURIComponent(base + '/jogar?sala=' + code + '&nome=' + NAMES[0]));
  const tvF = () => stage.frames().find((f) => f !== stage.mainFrame() && f.url().includes('/gamer-tv.html'));
  const padF = () => stage.frames().find((f) => f !== stage.mainFrame() && f.url().includes('/jogar'));
  for (let i = 0; i < 60 && !(tvF() && padF()); i++) await sleep(100);
  await tvF().waitForSelector('.hero h1', { timeout: 15000 });
  // phone in the corner joins with its own form, like a person would
  const pad = padF();
  await pad.waitForFunction(() => window.PAD_STATE && (window.PAD_STATE.joined || document.querySelector('#name')), null, { timeout: 15000 });
  if (await pad.$('#name')) { await pad.fill('#name', NAMES[0]); await pad.click('#go'); }
  await pad.waitForFunction(() => window.PAD_STATE.joined && window.PAD_STATE.me, null, { timeout: 15000 });
  // the other players: headless phones
  const bots = [];
  for (let i = 1; i < players; i++) {
    const c = await b.newContext({ viewport: { width: 412, height: 915 } });
    const p = await c.newPage();
    p.on('pageerror', (e) => errors.push('bot: ' + e.message));
    await p.goto(base + '/jogar?sala=' + code);
    await p.fill('#name', NAMES[i]); await p.click('#go');
    await p.waitForFunction(() => window.PAD_STATE.joined && window.PAD_STATE.me, null, { timeout: 15000 });
    bots.push(p);
  }
  await sleep(600);
  const tv = tvF();
  const state = () => tv.evaluate(() => window.TV_STATE.screen);
  const start = async () => {
    await tv.evaluate((g) => window.Central.lobby(g), game);
    await sleep(500);
    await tv.evaluate((g) => window.Central.start(g), game);
    await sleep(700);
    await tv.evaluate(() => window.tvKey('ok')); // skip the explanation
    for (let i = 0; i < 80 && (await state()) !== 'play'; i++) await sleep(100);
  };
  await stage.evaluate(() => document.getElementById('phone').classList.add('on'));
  const botSend = (i, m) => bots[i].evaluate((msg) => window.PAD_STATE.ws.send(JSON.stringify(msg)), m);
  const mark = await play({ tv, pad, bots, botSend, start, state, stage, sleep });
  const from = Math.max(0, (mark - t0) / 1000);
  await sleep(500);
  const video = stage.video();
  await ctx.close();
  const src = await video.path();
  const out = path.join(outDir, game + '.mp4');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', from.toFixed(2), '-i', src, '-t', String(LEN),
    '-vf', `scale=1280:720,fps=30,fade=t=in:st=0:d=0.6,fade=t=out:st=${LEN - 0.8}:d=0.8`,
    '-c:v', 'libx264', '-profile:v', 'main', '-preset', 'slow', '-crf', '29', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', out]);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(game, (fs.statSync(out).size / 1024).toFixed(0) + ' KB', errors.length ? errors.slice(0, 3) : '');
}

// synthetic touches on the phone in the corner (pointer events with their own ids, like fingers)
const touch = (frame, sel, type, fx, fy, id) => frame.evaluate(({ sel, type, fx, fy, id }) => {
  const el = document.querySelector(sel); if (!el) return;
  const r = el.getBoundingClientRect();
  el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: id, clientX: r.left + r.width * fx, clientY: r.top + r.height * fy, pointerType: 'touch', isPrimary: id === 1 }));
}, { sel, type, fx, fy, id });

const GAMES = {
  async rabisco({ tv, pad, bots, start, state, sleep }) {
    // drawings for some of the words (coordinates 0..1 on the canvas; [ink, size, points])
    const ART = {
      cacto: [[4, 2, [[0.5, 0.9], [0.5, 0.25]]], [4, 2, [[0.5, 0.6], [0.3, 0.6], [0.3, 0.42]]], [4, 2, [[0.5, 0.5], [0.7, 0.5], [0.7, 0.32]]], [6, 2, [[0.3, 0.9], [0.7, 0.9]]], [3, 1, [[0.82, 0.12], [0.84, 0.14]]]],
      sol: [[3, 2, circle(0.5, 0.45, 0.17)], ...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => [2, 1, [[0.5 + Math.cos(k * 0.785) * 0.24, 0.45 + Math.sin(k * 0.785) * 0.24], [0.5 + Math.cos(k * 0.785) * 0.34, 0.45 + Math.sin(k * 0.785) * 0.34]]])],
      árvore: [[7, 2, [[0.5, 0.92], [0.5, 0.55]]], [4, 2, circle(0.5, 0.38, 0.2)], [1, 1, [[0.42, 0.32], [0.43, 0.33]]], [1, 1, [[0.58, 0.42], [0.59, 0.43]]]],
      peixe: [[5, 1, ellipse(0.48, 0.5, 0.24, 0.13)], [5, 1, [[0.26, 0.5], [0.12, 0.36], [0.12, 0.64], [0.26, 0.5]]], [0, 1, [[0.62, 0.46], [0.63, 0.47]]], [5, 0, [[0.78, 0.25], [0.8, 0.2]]]],
      barco: [[7, 1, [[0.2, 0.62], [0.8, 0.62], [0.7, 0.78], [0.3, 0.78], [0.2, 0.62]]], [0, 1, [[0.5, 0.62], [0.5, 0.18]]], [1, 1, [[0.5, 0.2], [0.75, 0.52], [0.5, 0.52]]], [5, 1, [[0.08, 0.86], [0.3, 0.82], [0.5, 0.86], [0.7, 0.82], [0.92, 0.86]]]],
      'balão': [[1, 1, ellipse(0.5, 0.36, 0.17, 0.21)], [0, 0, [[0.5, 0.57], [0.47, 0.7], [0.53, 0.8], [0.5, 0.92]]]],
      'coração': [[1, 2, [[0.5, 0.78], [0.25, 0.5], [0.28, 0.32], [0.4, 0.28], [0.5, 0.38], [0.6, 0.28], [0.72, 0.32], [0.75, 0.5], [0.5, 0.78]]]],
      nuvem: [[5, 1, [[0.25, 0.6], [0.2, 0.48], [0.3, 0.38], [0.42, 0.4], [0.5, 0.3], [0.63, 0.33], [0.68, 0.42], [0.8, 0.45], [0.8, 0.58], [0.25, 0.6]]], [5, 0, [[0.35, 0.7], [0.32, 0.78]]], [5, 0, [[0.5, 0.7], [0.47, 0.8]]], [5, 0, [[0.65, 0.7], [0.62, 0.78]]]],
      lua: [[3, 2, [[0.55, 0.2], [0.38, 0.3], [0.33, 0.5], [0.4, 0.68], [0.58, 0.78], [0.47, 0.6], [0.45, 0.45], [0.55, 0.2]]], [3, 0, [[0.75, 0.25], [0.76, 0.26]]], [3, 0, [[0.8, 0.6], [0.81, 0.61]]]],
      pizza: [[2, 2, [[0.5, 0.15], [0.2, 0.85], [0.8, 0.85], [0.5, 0.15]]], [1, 2, [[0.45, 0.55], [0.46, 0.56]]], [1, 2, [[0.58, 0.7], [0.59, 0.71]]], [1, 2, [[0.4, 0.75], [0.41, 0.76]]]],
    };
    function circle(cx, cy, r) { const p = []; for (let k = 0; k <= 16; k++) p.push([cx + Math.cos(k / 16 * 6.283) * r, cy + Math.sin(k / 16 * 6.283) * r]); return p; }
    function ellipse(cx, cy, rx, ry) { const p = []; for (let k = 0; k <= 16; k++) p.push([cx + Math.cos(k / 16 * 6.283) * rx, cy + Math.sin(k / 16 * 6.283) * ry]); return p; }
    // the phone in the corner draws, and one of the three words must be one we can draw: start again until both
    let pick = -1;
    for (let tries = 0; tries < 40 && pick < 0; tries++) {
      await start();
      await sleep(700);
      if (await pad.$('.choices [data-i]')) {
        const words = await pad.$$eval('.choices [data-i]', (bs) => bs.map((b) => b.textContent.trim().toLowerCase()));
        pick = words.findIndex((w) => ART[w]);
      }
      if (pick < 0) { await tv.evaluate(() => window.tvKey('back')); await sleep(250); await tv.evaluate(() => window.tvKey('ok')); await sleep(700); }
    }
    if (pick < 0) throw new Error('no drawable word came up');
    const mark = Date.now() - 400;
    await sleep(900);
    await pad.click(`.choices [data-i="${pick}"]`);
    await pad.waitForSelector('canvas.pad');
    const word = (await pad.evaluate(() => document.querySelector('.word').lastChild.textContent)).trim();
    const line = async (pts, per = 9) => {
      await touch(pad, 'canvas.pad', 'pointerdown', pts[0][0], pts[0][1], 1);
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
        const steps = Math.max(2, Math.round(Math.hypot(bx - ax, by - ay) * per * 6));
        for (let k = 1; k <= steps; k++) { await touch(pad, 'canvas.pad', 'pointermove', ax + ((bx - ax) * k) / steps, ay + ((by - ay) * k) / steps, 1); await sleep(22); }
      }
      await touch(pad, 'canvas.pad', 'pointerup', pts[pts.length - 1][0], pts[pts.length - 1][1], 1);
      await sleep(180);
    };
    const strokes = ART[word.toLowerCase()];
    const guesses = [[0.35, 0, 'casa'], [0.65, 1, word.slice(0, -1) + 'x'], [1.0, 0, word]];
    let gi = 0;
    for (let si = 0; si < strokes.length; si++) {
      const [ink, size, pts] = strokes[si];
      await pad.click(`.ink[data-i="${ink}"]`); await pad.click(`.sz[data-s="${size}"]`);
      await line(pts);
      while (gi < guesses.length && (si + 1) / strokes.length >= guesses[gi][0]) {
        const [, who, text] = guesses[gi++];
        const bot = bots[who] || bots[0];
        await bot.fill('#g', text); await bot.click('#send'); await sleep(500);
      }
    }
    await sleep(1400);
    if (bots[1]) { await bots[1].fill('#g', word); await bots[1].click('#send'); }
    await sleep(Math.max(0, LEN * 1000 - (Date.now() - mark) + 300));
    return mark;
  },

  async batata({ tv, pad, bots, botSend, start, sleep }) {
    await start();
    const mark = Date.now() + 300;
    const end = mark + LEN * 1000 + 500;
    while (Date.now() < end) {
      // the phone in the corner solves its challenges for real (taps), the others pass right away
      if (await pad.$('.bt.h0, .bt.h1, .bt.h2')) {
        await sleep(900);
        const ok = await pad.evaluate(() => {
          const q = document.querySelector('.bt .q'); if (!q) return false;
          const t = q.textContent;
          const btns = [...document.querySelectorAll('.bt .opt')];
          const who = document.querySelector('.who .opt'); if (who) { who.click(); return true; }
          const m = t.match(/(\d+)\s*([+×])\s*(\d+)/);
          if (m) { const v = m[2] === '+' ? +m[1] + +m[3] : +m[1] * +m[3]; const b = btns.find((x) => +x.textContent === v); if (b) { b.click(); return true; } }
          const color = t.match(/cor (\w+)/); if (color) { const b = btns.find((x) => x.dataset.c === color[1]); if (b) { b.click(); return true; } }
          const tap = document.querySelector('.tapper'); if (tap) { for (let i = 0; i < 9; i++) tap.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); return true; }
          if (/ordem/.test(t)) { for (let v = 1; v <= 4; v++) { const b = btns.find((x) => +x.dataset.v === v); if (b) b.click(); } return true; }
          return false;
        });
        if (!ok) { await botSend(0, { t: 'g', k: 'pass' }).catch(() => {}); }
        await sleep(700);
        const who = await pad.$('.who .opt'); if (who) await who.click();
      }
      for (let i = 0; i < bots.length; i++) {
        const holding = await bots[i].evaluate(() => !!document.querySelector('.bt.h0, .bt.h1, .bt.h2'));
        if (holding) { await sleep(1400); await botSend(i, { t: 'g', k: 'pass', to: undefined }); }
      }
      await sleep(250);
    }
    return mark;
  },

  async mente({ tv, pad, bots, start, sleep }) {
    await start();
    await pad.waitForSelector('#lie', { timeout: 20000 });
    const mark = Date.now() + 200;
    const lies = ['um pato de borracha', 'meia furada', 'sabão em pó'];
    await pad.click('#lie');
    for (const ch of 'QUEIJO RALADO') { await pad.type('#lie', ch); await sleep(70); }
    await sleep(400); await pad.click('#send');
    for (let i = 0; i < bots.length; i++) { await bots[i].fill('#lie', lies[i]); await bots[i].click('#send'); await sleep(300); }
    await pad.waitForSelector('.vopt', { timeout: 20000 });
    await sleep(1600);
    const opts = await pad.$$('.vopt'); await opts[1 % opts.length].click();
    for (let i = 0; i < bots.length; i++) { const o = await bots[i].$$('.vopt'); await o[(i + 2) % o.length].click(); await sleep(200); }
    // the reveal runs on the TV
    await sleep(Math.max(0, LEN * 1000 - (Date.now() - mark) + 300));
    return mark;
  },

  async arena({ tv, pad, bots, botSend, start, sleep }) {
    await start();
    const mark = Date.now() + 1500;
    const end = mark + LEN * 1000 + 500;
    await touch(pad, '#fire', 'pointerdown', 0.5, 0.5, 2);
    let a = 0, down = false;
    while (Date.now() < end) {
      a += 0.25;
      const x = 0.5 + Math.cos(a) * 0.32, y = 0.5 + Math.sin(a * 0.8) * 0.18;
      if (!down) { await touch(pad, '#stick', 'pointerdown', 0.5, 0.5, 1); down = true; }
      await touch(pad, '#stick', 'pointermove', x, y, 1);
      for (let i = 0; i < bots.length; i++) { const b = Date.now() / 600 + i * 2.1; await botSend(i, { t: 'g', k: 'in', x: Math.cos(b), y: Math.sin(b), f: true }); }
      if (Math.random() < 0.06) await touch(pad, '#dash', 'pointerdown', 0.5, 0.5, 3), await touch(pad, '#dash', 'pointerup', 0.5, 0.5, 3);
      await sleep(80);
    }
    return mark;
  },

  async corrida({ tv, pad, bots, start, sleep }) {
    await start();
    // the others drive on autopilot inside the TV page; the phone in the corner steers with its wheel
    await tv.evaluate(() => {
      window.__auto = setInterval(() => {
        const inst = window.TV_STATE.inst; if (!inst || !inst._dbg) { clearInterval(window.__auto); return; }
        const { cars, pts, N } = inst._dbg;
        cars.forEach((car, i) => { if (i === 0) return; const t = pts[(car.idx + 9 + i) % N]; let d = Math.atan2(t[1] - car.y, t[0] - car.x) - car.ang; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; car.steer = Math.max(-1, Math.min(1, d * 2.2)); car.gas = true; });
      }, 40);
    });
    await touch(pad, '#gas', 'pointerdown', 0.5, 0.5, 2);
    await touch(pad, '#wz', 'pointerdown', 0.5, 0.5, 1);
    const mark = Date.now() + 1200;
    const end = mark + LEN * 1000 + 500;
    while (Date.now() < end) {
      const s = await tv.evaluate(() => { const inst = window.TV_STATE.inst; if (!inst || !inst._dbg) return 0; const { cars, pts, N } = inst._dbg; const car = cars[0]; const t = pts[(car.idx + 9) % N]; let d = Math.atan2(t[1] - car.y, t[0] - car.x) - car.ang; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return Math.max(-1, Math.min(1, d * 2.2)); });
      await touch(pad, '#wz', 'pointermove', 0.5 + s * 0.2, 0.5, 1);
      await sleep(70);
    }
    return mark;
  },
};

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const list = only.length ? only : Object.keys(GAMES);
  const PLAYERS = { rabisco: 3, batata: 4, mente: 4, arena: 4, corrida: 4 };
  for (const g of list) {
    try { await session(g, PLAYERS[g], GAMES[g]); } catch (e) { console.log(g, 'FAILED', e.message.split('\n')[0]); }
  }
})();
