// Install on the phone (PWA): manifest and icons served by the TV, and the install sheet per browser.
//   node tools/qa/check-pwa.js /tmp/tvdrop.info /tmp/shots   (dev server running, see check-phone-layouts.js)
const { chromium, devices } = require('playwright');
const fs = require('fs');
const [,, infoFile, out] = process.argv;
const port = fs.readFileSync(infoFile, 'utf8').trim().split(' ')[0];
const base = 'http://127.0.0.1:' + port;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (ok, what) => { console.log((ok ? '  ✓ ' : '  ✗ ') + what); if (!ok) failures++; };
const IOS_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const IOS_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1';
const iphone = { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const page = async (opts, init) => {
    const ctx = await b.newContext(opts);
    if (init) await ctx.addInitScript(init);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    return p;
  };

  // files the phone needs to install the page
  const m = await (await fetch(base + '/manifest.webmanifest')).json();
  check(m.display === 'standalone' && m.start_url && m.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable'), 'manifest: standalone, start page, icons (with a maskable one)');
  for (const f of ['pwa/apple-touch-icon.png', 'pwa/icon-192.png', 'pwa/icon-512.png', 'pwa/icon-maskable-512.png']) {
    const r = await fetch(base + '/' + f);
    check(r.status === 200 && /image\/png/.test(r.headers.get('content-type')), 'served by the TV: ' + f);
  }

  // iPhone, Safari: the sheet shows on the connect screen, before connecting
  let p = await page({ ...iphone, userAgent: IOS_SAFARI });
  await p.goto(base + '/');
  await p.waitForSelector('#pwaSheet.on', { timeout: 5000 });
  const head = await p.content();
  check(/apple-touch-icon/.test(head) && /apple-mobile-web-app-capable/.test(head) && /rel="manifest"/.test(head), 'the page has the iPhone home-screen tags');
  const txt = await p.textContent('#pwaSheet');
  check(/no iPhone/.test(txt) && /Adicionar à Tela de Início/.test(txt) && /Safari/.test(txt), 'iPhone Safari: "Adicionar à Tela de Início" steps');
  check(await p.$eval('#pwaSheet', (e) => e.classList.contains('bottom')), 'and it points down, to Safari\'s bar');
  await sleep(400);
  await p.screenshot({ path: out + '/pwa-ios-safari.png' });
  await p.click('#pwaLater'); await sleep(400);
  check(!(await p.$('#pwaSheet')), '"Agora não" closes it');
  await p.reload(); await sleep(1500);
  check(!(await p.$('#pwaSheet')), 'and it doesn\'t come back on the next visit (for 3 days)');
  await p.context().close();

  // iPhone, Chrome: the share button is at the top
  p = await page({ ...iphone, userAgent: IOS_CHROME });
  await p.goto(base + '/');
  await p.waitForSelector('#pwaSheet.on', { timeout: 5000 });
  check(/barra de endereço/.test(await p.textContent('#pwaSheet')) && await p.$eval('#pwaSheet', (e) => e.classList.contains('top')), 'iPhone Chrome: share button in the address bar, sheet at the top');
  await sleep(300);
  await p.screenshot({ path: out + '/pwa-ios-chrome.png' });
  await p.context().close();

  // opened from the home screen: no sheet
  p = await page({ ...iphone, userAgent: IOS_SAFARI }, () => { Object.defineProperty(navigator, 'standalone', { get: () => true }); });
  await p.goto(base + '/'); await sleep(1800);
  check(!(await p.$('#pwaSheet')), 'already installed (opened from the icon): no sheet');
  await p.context().close();

  // Android
  p = await page({ ...devices['Pixel 7'] });
  await p.goto(base + '/');
  await p.waitForSelector('#pwaSheet.on', { timeout: 5000 });
  check(/Adicionar à tela inicial/.test(await p.textContent('#pwaSheet')), 'Android: "Adicionar à tela inicial" steps');
  await sleep(300);
  await p.screenshot({ path: out + '/pwa-android.png' });
  await p.click('#pwaNever'); await sleep(300);
  // settings still offers it
  await p.evaluate(() => { localStorage.clear(); });
  await p.context().close();

  // computer: nothing
  p = await page({ viewport: { width: 1280, height: 800 } });
  await p.goto(base + '/'); await sleep(1500);
  check(!(await p.$('#pwaSheet')), 'computer browser: no sheet');
  await p.context().close();

  console.log('errors:', errors.length ? errors.slice(0, 5) : 'none');
  console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
  await b.close();
  process.exit(failures ? 1 : 0);
})();
