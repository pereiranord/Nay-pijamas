// Phone layout check (block 1): the Controle tab (3 modes + panels) and every tab on 11 phone/tablet shapes,
// upright and on their side, normal and big buttons. Needs the dev server (test DevServer) and Playwright:
//   TVDROP_DEV=600 TVDROP_DEV_INFO=/tmp/tvdrop.info gradle testReleaseUnitTest --tests "*DevServer*" &
//   node tools/qa/check-phone-layouts.js /tmp/tvdrop.info /tmp/shots
const { chromium, devices } = require('playwright');
const fs = require('fs');
const [,, infoFile, out, only] = process.argv;
const port = fs.readFileSync(infoFile, 'utf8').trim().split(' ')[0];
const base = 'http://127.0.0.1:' + port;
const pin = () => fs.readFileSync(infoFile, 'utf8').trim().split(' ')[1];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const phone = (w, h, extra = {}) => ({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, ...extra });
const MATRIX = [
  ['320x568', phone(320, 568)],
  ['360x740', phone(360, 740)],
  ['390x844', phone(390, 844)],
  ['412x915', phone(412, 915)],
  ['430x932', phone(430, 932)],
  ['568x320-land', phone(568, 320)],
  ['740x360-land', phone(740, 360)],
  ['844x390-land', phone(844, 390)],
  ['932x430-land', phone(932, 430)],
  ['tablet-800x1280', phone(800, 1280)],
  ['tablet-1280x800', phone(1280, 800)],
];
(async () => {
  const b = await chromium.launch();
  const rows = [];
  let bad = 0;
  for (const [name, dev] of MATRIX) {
    if (only && !name.includes(only)) continue;
    for (const size of ['normal', 'large']) {
      const c = await b.newContext(dev);
      await c.addInitScript((sz) => { localStorage.setItem('tvdrop.prefs', JSON.stringify({ size: sz })); }, size);
      const p = await c.newPage();
      await sleep(900); // the PIN changes after each pairing; the dev server rewrites it every 0.5 s
      await p.goto(base + '/?pair=' + pin());
      await p.waitForSelector('#appView:not([hidden])', { timeout: 8000 });
      const W = dev.viewport.width, H = dev.viewport.height;
      const measure = (label) => p.evaluate(({ W, H, label }) => {
        const vw = innerWidth, vh = innerHeight;
        const problems = [];
        if (vw !== W) problems.push(`layout ${vw}px instead of ${W}px (page zoomed out)`);
        if (document.documentElement.scrollWidth > vw + 1) problems.push('horizontal scroll');
        const visible = (e) => { const s = getComputedStyle(e); return s.visibility !== 'hidden' && s.display !== 'none' && e.getClientRects().length; };
        const scrollers = (e) => { for (let x = e.parentElement; x; x = x.parentElement) { const s = getComputedStyle(x); if (/(auto|scroll|hidden)/.test(s.overflowX) && x.scrollWidth > x.clientWidth + 1) return true; } return false; };
        const cut = [...document.querySelectorAll('#main button, #main input, #main .key, .nav button')].filter((e) => { if (!visible(e)) return false; const r = e.getBoundingClientRect(); return r.width && (r.right > vw + 1 || r.left < -1) && !scrollers(e); });
        if (cut.length) problems.push(cut.length + ' control(s) cut at the edge: ' + cut.slice(0, 3).map((e) => (e.getAttribute('aria-label') || e.textContent || e.className).trim().slice(0, 18)).join(', '));
        const small = [...document.querySelectorAll('#main button, .nav button')].filter((e) => { if (!visible(e)) return false; const r = e.getBoundingClientRect(); return r.width && r.height && (r.width < 40 || r.height < 40) && !e.closest('.chips,.chips-row,.edit,.vol-slider,.star,.gear'); });
        if (small.length) problems.push(small.length + ' button(s) under 40px: ' + small.slice(0, 3).map((e) => (e.getAttribute('aria-label') || e.textContent || e.className).trim().slice(0, 18)).join(', '));
        const portraitScrolled = vw < vh && (label === 'remote-more' || label === 'remote-num'); // opening a panel scrolls the page upright: expected
        if (label.startsWith('remote') && !portraitScrolled) {
          const navR = document.querySelector('.nav').getBoundingClientRect();
          const floor = navR.top > vh / 2 ? navR.top : vh; // a bottom bar hides what is under it
          const surf = document.querySelector('#surface').getBoundingClientRect();
          const target = document.querySelector('.dpad, .pad');
          const t = target ? target.getBoundingClientRect() : surf;
          if (t.bottom > floor + 1 || t.top < -1) problems.push(`direction surface off screen (top ${Math.round(t.top)}, bottom ${Math.round(t.bottom)}, visible to ${Math.round(floor)})`);
          if (t.width < 160) problems.push('direction surface too small: ' + Math.round(t.width));
          const nav3 = document.querySelector('.nav3').getBoundingClientRect();
          if (vw > vh && (nav3.bottom > vh + 1)) problems.push('Back/Home/Menu off screen on its side');
        }
        return problems;
      }, { W, H, label });
      const check = async (label, setup) => {
        try { await setup(); } catch (e) { bad++; rows.push(`✗ ${name.padEnd(16)} ${size.padEnd(6)} ${label.padEnd(14)} cannot tap: ${e.message.split('\n').find((l) => l.includes('intercepts')) || e.message.split('\n')[0]}`); await p.evaluate((l) => { const m = { 'remote-swipe': 'swipe', 'remote-pad': 'pad' }[l]; if (m) document.querySelector(`[data-mode="${m}"]`).click(); }, label); }
        await sleep(450);
        const pr = await measure(label);
        if (pr.length) bad++;
        rows.push(`${pr.length ? '✗' : '✓'} ${name.padEnd(16)} ${size.padEnd(6)} ${label.padEnd(14)} ${pr.join(' | ')}`);
        return pr;
      };
      await check('remote-dpad', () => p.evaluate(() => { S.remoteMode = 'dpad'; go('remote'); }));
      if (size === 'normal') await p.screenshot({ path: `${out}/r-${name}.png` });
      await check('remote-swipe', () => p.click('[data-mode="swipe"]', { timeout: 3000 }));
      await check('remote-pad', () => p.click('[data-mode="pad"]', { timeout: 3000 }));
      if (size === 'normal' && name.includes('land')) await p.screenshot({ path: `${out}/r-${name}-pad.png` });
      await p.click('[data-mode="dpad"]', { timeout: 3000 }).catch(() => p.evaluate(() => document.querySelector('[data-mode="dpad"]').click()));
      await check('remote-more', async () => { await p.click('#moreBtn', { timeout: 3000 }); });
      await check('remote-num', async () => { await p.click('#numBtn', { timeout: 3000 }); });
      for (const v of ['home', 'cast', 'apps', 'library', 'devices', 'settings']) await check(v, () => p.evaluate((x) => go(x), v));
      if (size === 'normal' && name.includes('land')) { await p.evaluate(() => go('home')); await sleep(400); await p.screenshot({ path: `${out}/h-${name}.png` }); }
      await c.close();
    }
  }
  console.log(rows.join('\n'));
  console.log(bad ? `\n${bad} screen(s) with problems` : '\nall screens OK');
  await b.close();
})();
