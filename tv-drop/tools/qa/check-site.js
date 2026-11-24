// The site (the single-file index.html on an https address): asks for the TV once, remembers it, opens the TV's
// own page (Google's code + iPhone install). Usage: python3 tools/build_web.py /tmp/site.html &&
//   node tools/qa/check-site.js /tmp/site.html /tmp/tvdrop.info /tmp/shots   (dev server running)
const { chromium } = require('playwright');
const fs = require('fs');
const [,, html, info, out] = process.argv;
const port = fs.readFileSync(info, 'utf8').trim().split(' ')[0];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1' });
  await ctx.route('https://site.tvdrop.test/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: fs.readFileSync(html) }));
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('https://site.tvdrop.test/');
  await p.waitForSelector('#connectView:not([hidden])');
  console.log('site: asks for the TV address:', await p.isVisible('#tvAddr'));
  console.log('site: no install sheet on the site itself:', !(await p.$('#pwaSheet')));
  await p.screenshot({ path: out + '/site-1.png' });
  await p.fill('#tvAddr', '127.0.0.1:' + port);
  await Promise.all([p.waitForURL('http://127.0.0.1:' + port + '/', { timeout: 8000 }), p.click('#connectForm button')]);
  console.log('site → TV page:', p.url());
  await p.waitForSelector('#pairView:not([hidden])', { timeout: 8000 });
  console.log('TV page asks to Conectar (Google code):', await p.isVisible('#pairStart'));
  await p.waitForSelector('#pwaSheet.on', { timeout: 5000 }).catch(() => {});
  console.log('TV page offers the iPhone install:', !!(await p.$('#pwaSheet')));
  await p.goto('https://site.tvdrop.test/');
  await p.waitForSelector('#connectView:not([hidden])');
  console.log('next visit, the TV is remembered:', await p.inputValue('#tvAddr'), '|', await p.textContent('#connectHint'));
  await p.screenshot({ path: out + '/site-2.png' });
  console.log('errors:', errors.length ? errors : 'none');
  await b.close();
})();
