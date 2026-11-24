// Connecting with one code (Google's code shown on the TV), in a real browser against the dev server.
// The dev server's fake TV accepts the code ABC123.
//   node tools/qa/check-pairing.js /tmp/tvdrop.info /tmp/shots   (dev server running, see check-phone-layouts.js)
const { chromium, devices } = require('playwright');
const fs = require('fs');
const [,, infoFile, out] = process.argv;
const port = fs.readFileSync(infoFile, 'utf8').trim().split(' ')[0];
const base = 'http://127.0.0.1:' + port;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (ok, what) => { console.log((ok ? '  ✓ ' : '  ✗ ') + what); if (!ok) failures++; };

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const ctx = await b.newContext({ ...devices['Pixel 7'] });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(base + '/');
  await p.waitForSelector('#pairView:not([hidden])');
  check(await p.isVisible('#pairStart') && !(await p.isVisible('#pinInput')), 'first screen: only a Conectar button, no code to type yet');
  await p.screenshot({ path: out + '/pair1-start.png' });
  await p.click('#pairStart');
  await p.waitForSelector('#pinInput:visible');
  check(/6 caracteres/.test(await p.textContent('#pairHint')), 'after Conectar it asks for the 6-character code the TV shows');
  await p.fill('#pinInput', '12345');
  await p.click('#pairBtn'); await sleep(400);
  check(/6 caracteres/.test(await p.textContent('#pairMsg')), 'a typo is explained and the same code can be typed again');
  await p.fill('#pinInput', 'FFFFFF');
  await p.click('#pairBtn'); await sleep(4500);
  check(await p.isVisible('#pinInput') && /incorreto|código novo/i.test(await p.textContent('#pairMsg')), 'a wrong code: the TV is asked for a new one and the phone says so');
  await p.screenshot({ path: out + '/pair2-wrong.png' });
  await sleep(3500); // pairings may start every 3 s
  await p.click('#pairAgain'); await sleep(600);
  await p.fill('#pinInput', 'abc123');
  await p.screenshot({ path: out + '/pair3-code.png' });
  await p.click('#pairBtn');
  await p.waitForSelector('#appView:not([hidden])', { timeout: 10000 });
  check(true, 'the right code (typed in lower case) connects');
  const token = await p.evaluate(() => localStorage.getItem('tvdrop.token') || Object.entries(localStorage).find(([k]) => /token/.test(k)));
  check(!!token, 'the token is saved on this device');
  await p.screenshot({ path: out + '/pair4-connected.png' });
  await p.reload(); await sleep(1500);
  check(await p.isVisible('#appView') && !(await p.isVisible('#pairView')), 'after reloading the page it is still connected (no code again)');
  const devs = await (await fetch(base + '/api/v2/devices', { headers: { 'X-TVDrop-Token': typeof token === 'string' ? token : token[1] } })).json().catch(() => null);
  check(devs && devs.devices && devs.devices.length >= 1, 'the TV lists the device in Dispositivos');
  console.log('errors:', errors.length ? errors.slice(0, 5) : 'none');
  console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
  await b.close();
  process.exit(failures ? 1 : 0);
})();
