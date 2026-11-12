/* TV Drop 2.0 — one interface for the browser and the Android app (WebView).
 * Talks only to the TV Drop receiver on the TV (same origin): /api/* and /api/v2/*.
 * The Android app adds native extras through window.TVDropNative (voice, casting from the phone). */
'use strict';

const NATIVE = window.TVDropNative || null;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const store = {
  get(k, d) { try { const v = localStorage.getItem('tvdrop.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('tvdrop.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  del(k) { try { localStorage.removeItem('tvdrop.' + k); } catch (e) { /* ignore */ } },
};

/* Standalone index.html (opened from a file, the repository or another address): every call goes
 * to the TV chosen on the connection screen. Served by the TV itself, BASE stays '' (same origin). */
const STANDALONE = !!window.TVDROP_STANDALONE;
let BASE = STANDALONE ? store.get('base', '') : '';
const u = (path) => BASE + path;

/** 8-letter TV code ("1G58-28FG") -> "192.168.18.31:8080" (same packing as Codes.java). */
function decodeCode(code) {
  const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const c = String(code).toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (c.length !== 8) return null;
  let v = 0n;
  for (const ch of c) { const d = A.indexOf(ch); if (d < 0) return null; v = (v << 5n) | BigInt(d); }
  if (v >> 36n) return null;
  const port = 8080 + Number(v & 15n);
  v >>= 4n;
  return `${(v >> 24n) & 255n}.${(v >> 16n) & 255n}.${(v >> 8n) & 255n}.${v & 255n}:${port}`;
}

/** "1G58-28FG", "192.168.18.31", "192.168.18.31:8081" or "http://192.168.18.31:8080/..." -> "host:port". */
function parseTvAddress(input) {
  const s = String(input || '').trim();
  if (!s) return null;
  const fromCode = decodeCode(s);
  if (fromCode) return fromCode;
  const m = s.replace(/^https?:\/\//i, '').match(/^([a-z0-9.-]+)(?::(\d{2,5}))?(?:\/.*)?$/i);
  if (!m) return null;
  return m[1] + ':' + (m[2] || '8080');
}

const S = {
  token: '', info: null, caps: null, status: null, view: 'home',
  online: null, remoteMode: store.get('remoteMode', 'dpad'), sensitivity: store.get('sensitivity', 1.6),
  apps: [], catalog: [], appsLoaded: false, editApps: false, appSearch: '',
  fileFilter: 'all', xfers: [], ws: null, wsOk: false, wsWaiters: {}, wsSeq: 0,
};
// The token is a plain string (the classic page reads it raw).
try { S.token = localStorage.getItem('tvdrop.token') || ''; } catch (e) { /* ignore */ }
const saveToken = (t) => { S.token = t; try { t ? localStorage.setItem('tvdrop.token', t) : localStorage.removeItem('tvdrop.token'); } catch (e) { /* ignore */ } };

/* ---------------------------------------------------------------- icons */
const ICONS = {
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  cast: '<path d="M3 7V5h18v14h-6"/><path d="M3 11a8 8 0 0 1 8 8"/><path d="M3 15a4 4 0 0 1 4 4"/><path d="M3 19h.01"/>',
  remote: '<rect x="7" y="2" width="10" height="20" rx="4"/><circle cx="12" cy="8" r="2"/><path d="M10 14h.01M14 14h.01M10 17h.01M14 17h.01"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  tv: '<rect x="2" y="5" width="20" height="13" rx="2"/><path d="M8 21h8"/>',
  up: '<path d="M6 15l6-6 6 6"/>', down: '<path d="M6 9l6 6 6-6"/>', left: '<path d="M15 6l-6 6 6 6"/>', right: '<path d="M9 6l6 6-6 6"/>',
  back: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  power: '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/>',
  play: '<path d="M7 4l13 8-13 8z"/>', pause: '<path d="M7 4h4v16H7zM13 4h4v16h-4z"/>',
  playpause: '<path d="M4 4l9 8-9 8z"/><path d="M15 5v14M19 5v14"/>',
  rew: '<path d="M11 19l-8-7 8-7zM21 19l-8-7 8-7z"/>', ff: '<path d="M13 19l8-7-8-7zM3 19l8-7-8-7z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1"/>',
  volup: '<path d="M11 5L6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/>',
  voldown: '<path d="M11 5L6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>',
  mute: '<path d="M11 5L6 9H2v6h4l5 4z"/><path d="M23 9l-6 6M17 9l6 6"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5"/>',
  upload: '<path d="M12 16V4M6 10l6-6 6 6"/><path d="M4 20h16"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', x: '<path d="M18 6L6 18M6 6l12 12"/>',
  chevl: '<path d="M15 18l-6-6 6-6"/>', chevr: '<path d="M9 18l6-6-6-6"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  video: '<rect x="2" y="5" width="15" height="14" rx="2"/><path d="M17 10l5-3v10l-5-3"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/>',
  apk: '<path d="M5 9h14v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/><path d="M8 9a4 4 0 0 1 8 0M9 5L7.5 3M15 5l1.5-2"/>',
  pulse: '<path d="M3 12h4l3-8 4 16 3-8h4"/>', search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  enter: '<path d="M9 10l-5 5 5 5"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/>', del: '<path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/><path d="M18 9l-6 6M12 9l6 6"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  library: '<path d="M4 4v16M8 4v16"/><path d="M12 4l4 16"/><path d="M17 4h3v16h-3z"/>',
  next: '<path d="M5 4l10 8-10 8z"/><path d="M19 5v14"/>', prev: '<path d="M19 20L9 12l10-8z"/><path d="M5 19V5"/>',
  repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
  drag: '<path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01"/>',
  star: '<path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>',
  queue: '<path d="M3 6h13M3 12h13M3 18h9"/><path d="M17 15l4 3-4 3z"/>',
  bolt: '<path d="M13 2L3 14h8l-1 8 10-12h-8z"/>', cc: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M10 10a2 2 0 1 0 0 4M17 10a2 2 0 1 0 0 4"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  play2: '<circle cx="12" cy="12" r="10"/><path d="M10 8l6 4-6 4z"/>',
};
const icon = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const fillIcons = (root = document) => $$('[data-icon]', root).forEach((el) => { el.innerHTML = icon(el.dataset.icon); });

/* ---------------------------------------------------------------- feedback */
let toastTimer;
function toast(text, ok = true) {
  const t = $('#toast');
  t.textContent = text;
  t.className = 'toast show' + (ok ? '' : ' err');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 2600);
}
const buzz = () => { try { navigator.vibrate && navigator.vibrate(12); } catch (e) { /* ignore */ } };
const fmtTime = (ms) => { const s = Math.floor((ms || 0) / 1000); const h = Math.floor(s / 3600); const m = Math.floor(s / 60) % 60; const x = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`; };
const fmtSize = (n) => n >= 1073741824 ? (n / 1073741824).toFixed(2) + ' GB' : n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
const fmtDate = (t) => { if (!t) return ''; const d = new Date(t); return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };

/* ---------------------------------------------------------------- API */
class ApiError extends Error { constructor(msg, status, code) { super(msg); this.status = status; this.code = code; } }

async function api(path, { method = 'GET', json, body, timeout = 10000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  const headers = {};
  if (S.token) headers['X-TVDrop-Token'] = S.token;
  if (json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
  let r;
  try {
    r = await fetch(u(path), { method, headers, body, signal: ctrl.signal, cache: 'no-store' });
  } catch (e) {
    setOnline(false);
    throw new ApiError(e.name === 'AbortError' ? 'A TV demorou demais para responder.' : 'Sem conexão com a TV.', 0, 'network');
  } finally { clearTimeout(timer); }
  setOnline(true);
  let data = {};
  try { data = await r.json(); } catch (e) { /* not JSON */ }
  if (r.status === 401) { showPairing('Este aparelho não está mais autorizado. Conecte de novo com o código da TV.'); throw new ApiError(data.message || 'Não autorizado', 401, 'unauthorized'); }
  if (!r.ok || data.ok === false) throw new ApiError(data.message || ('Erro ' + r.status), r.status, data.error);
  return data;
}

function setOnline(on) {
  if (S.online === on) return;
  S.online = on;
  renderConn();
  if (on && S.view === 'remote') wsConnect();
}

/* ---------------------------------------------------------------- pairing */
function deviceName() {
  const ua = navigator.userAgent;
  if (NATIVE) return 'App TV Drop (' + (/Android/.test(ua) ? 'Android' : 'celular') + ')';
  if (/iPhone|iPad/.test(ua)) return 'iPhone / iPad (navegador)';
  if (/Android/.test(ua)) return 'Android (navegador)';
  if (/Mac/.test(ua)) return 'Mac (navegador)';
  if (/Windows/.test(ua)) return 'Windows (navegador)';
  return 'Navegador';
}

function showPairing(message) {
  saveToken('');
  wsClose();
  $('#appView').hidden = true;
  $('#pairView').hidden = false;
  $('#pairMsg').textContent = message || '';
  $('#pairMsg').className = 'msg' + (message ? ' err' : '');
  setTimeout(() => $('#pinInput').focus(), 50);
}

async function doPair(pin) {
  $('#pairBtn').disabled = true;
  try {
    const r = await api('/api/v2/pair', { method: 'POST', json: { pin, name: deviceName() } });
    saveToken(r.token);
    $('#pairView').hidden = true;
    await start();
    toast('Conectado à TV');
  } catch (e) {
    $('#pairMsg').textContent = e.message;
    $('#pairMsg').className = 'msg err';
  } finally { $('#pairBtn').disabled = false; }
}

/* ---------------------------------------------------------------- shell */
const VIEWS = { home: renderHome, cast: renderCast, remote: renderRemote, apps: renderApps, library: renderLibrary, devices: renderDevices };

function go(view) {
  if (!VIEWS[view]) view = 'home';
  S.view = view;
  store.set('view', view);
  $$('.nav button').forEach((b) => b.setAttribute('aria-current', b.dataset.view === view ? 'page' : 'false'));
  if (view !== 'remote') wsClose(); else wsConnect();
  VIEWS[view]();
  window.scrollTo(0, 0);
}

function header(title) {
  return `<div class="top"><h1>${esc(title)}</h1><div class="conn" id="conn"><span class="dot"></span><span></span></div></div>`;
}

function renderConn() {
  const c = $('#conn');
  if (!c) return;
  const name = S.info ? S.info.name : 'TV';
  if (S.online === false) { c.className = 'conn bad'; c.lastChild.textContent = 'Sem conexão'; }
  else if (S.online && S.info) { c.className = 'conn ok'; c.lastChild.textContent = name; }
  else { c.className = 'conn wait'; c.lastChild.textContent = 'Conectando…'; }
}

const receiverHas = (key) => !!(S.caps && S.caps.remote && (S.caps.remote.keys || []).includes(key));
/** Phone-direct Android TV Remote (app only): used when the TV can't reach its own remote service. */
const NATIVE_KEYS = ['up', 'down', 'left', 'right', 'ok', 'back', 'home', 'menu', 'settings', 'search', 'info', 'guide', 'captions', 'playpause', 'play', 'pause', 'stop', 'next', 'prev', 'ff', 'rew', 'volup', 'voldown', 'mute', 'power', 'del', 'enter', 'space'];
const nativeAtvOk = () => !!(S.nativeAtv && S.nativeAtv.paired);
const has = (key) => receiverHas(key) || (nativeAtvOk() && NATIVE_KEYS.includes(key));
const nativeWaiters = {};
let nativeSeq = 0;
window.tvdropNative = (id, r) => { const w = nativeWaiters[id]; if (w) { delete nativeWaiters[id]; w(r); } };
function nativeAtv(action, arg = '') {
  if (!NATIVE || !NATIVE.atv) return Promise.resolve({ ok: false, message: 'Só no app Android' });
  const id = 'n' + (++nativeSeq);
  return new Promise((resolve) => {
    nativeWaiters[id] = resolve;
    NATIVE.atv(action, typeof arg === 'string' ? arg : JSON.stringify(arg), id);
    setTimeout(() => { if (nativeWaiters[id]) { delete nativeWaiters[id]; resolve({ ok: false, message: 'O celular não respondeu.' }); } }, 25000);
  });
}
async function loadNativeAtv() {
  if (!NATIVE || !NATIVE.atv) return;
  S.nativeAtv = await nativeAtv('state');
}

async function loadCaps() {
  try { S.caps = await api('/api/v2/capabilities'); } catch (e) { /* keep last */ }
  return S.caps;
}

async function refreshStatus() {
  if (document.hidden || !S.token) return;
  try {
    S.status = await api('/api/status', { timeout: 6000 });
    if (S.view === 'home' || S.view === 'cast') updateNowPlaying();
    if (S.view === 'cast') updateFiles();
  } catch (e) { renderConn(); }
}

/* ---------------------------------------------------------------- WebSocket (keys + touchpad) */
function wsConnect() {
  if (S.ws || !S.token || !('WebSocket' in window)) return;
  const host = BASE ? new URL(BASE).host : location.host;
  const ws = new WebSocket((!BASE && location.protocol === 'https:' ? 'wss://' : 'ws://') + host + '/api/v2/ws?token=' + encodeURIComponent(S.token));
  S.ws = ws;
  ws.onopen = () => { S.wsOk = true; };
  ws.onclose = () => { S.wsOk = false; S.ws = null; if (S.view === 'remote' && S.token) setTimeout(wsConnect, 1500); };
  ws.onerror = () => { /* onclose follows */ };
  ws.onmessage = (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
    const w = m.id && S.wsWaiters[m.id];
    if (w) { delete S.wsWaiters[m.id]; w(m); }
    else if (m.t === 'ack' && !m.ok) toast(m.message || 'A TV recusou o comando', false);
  };
}
function wsClose() { if (S.ws) { const w = S.ws; S.ws = null; w.onclose = null; try { w.close(); } catch (e) { /* ignore */ } } S.wsOk = false; }
function wsSend(obj, wantAck) {
  if (!S.wsOk) return null;
  if (!wantAck) { S.ws.send(JSON.stringify(obj)); return Promise.resolve({ ok: true }); }
  const id = String(++S.wsSeq);
  return new Promise((resolve) => {
    S.wsWaiters[id] = resolve;
    S.ws.send(JSON.stringify({ ...obj, id }));
    setTimeout(() => { if (S.wsWaiters[id]) { delete S.wsWaiters[id]; resolve({ ok: false, message: 'A TV não respondeu a tempo.' }); } }, 4000);
  });
}

async function sendKey(key, el) {
  buzz();
  if (el) { el.classList.add('hit'); setTimeout(() => el.classList.remove('hit'), 140); }
  const native = async () => { const r = await nativeAtv('key', key); if (!r.ok) toast(r.message || 'A TV recusou o comando', false); return r.ok; };
  if (!receiverHas(key) && nativeAtvOk()) return native();
  const viaWs = wsSend({ t: 'key', k: key }, true);
  if (viaWs) {
    const r = await viaWs;
    if (r.ok) return true;
    if (nativeAtvOk() && NATIVE_KEYS.includes(key)) return native();
    toast(r.message || 'A TV recusou o comando', false); return false;
  }
  try { await api('/api/v2/remote/key', { method: 'POST', json: { key } }); return true; }
  catch (e) { if (nativeAtvOk() && NATIVE_KEYS.includes(key)) return native(); toast(e.message, false); return false; }
}

async function sendText(text, opts = {}) {
  const receiverText = S.caps && S.caps.remote && S.caps.remote.text;
  const native = async () => { const r = await nativeAtv('text', { text, submit: !!opts.submit }); if (!r.ok) toast(r.message, false); return r.ok; };
  if (!receiverText && nativeAtvOk() && !opts.replace) return native();
  try { await api('/api/v2/remote/text', { method: 'POST', json: { text, replace: !!opts.replace, submit: !!opts.submit } }); return true; }
  catch (e) { if (nativeAtvOk() && !opts.replace) return native(); toast(e.message, false); return false; }
}

function pointer(t, dx = 0, dy = 0) {
  if (!wsSend({ t, dx, dy }, false)) api('/api/v2/remote/pointer', { method: 'POST', json: { action: t, dx, dy } }).catch((e) => toast(e.message, false));
}

/* ---------------------------------------------------------------- HOME */
function renderHome() {
  const main = $('#main');
  const remoteReady = S.caps && S.caps.remote && S.caps.remote.atv && S.caps.remote.atv.paired;
  main.innerHTML = header('Início') + `
    ${!remoteReady && S.caps ? `<div class="notice">${icon('info')}<div>Para usar todas as teclas, Liga/Desliga e o teclado, pareie o controle com a TV em <b>Dispositivos</b>.</div></div>` : ''}
    <div class="quick">
      <button data-go="remote">${icon('remote')}Controle</button>
      <button data-go="cast">${icon('cast')}Transmitir</button>
      <button data-go="apps">${icon('grid')}Apps</button>
      <button id="findTv">${icon('bell')}Encontrar TV</button>
    </div>
    <div class="card" id="npCard"></div>
    <div class="card" id="continueCard" hidden></div>
    <div class="card" id="timerCard"></div>
    <div class="card"><h2>${esc(S.info ? S.info.name : 'TV')}</h2>
      <p class="sub">Android ${esc(S.info ? S.info.android : '?')} · TV Drop ${esc(S.info ? S.info.version : '')}</p>
      <div class="row"><button class="btn" data-go="devices">${icon('tv')}Dispositivo e diagnóstico</button></div>
    </div>`;
  renderConn();
  $$('[data-go]', main).forEach((b) => b.onclick = () => go(b.dataset.go));
  $('#findTv').onclick = findTv;
  updateNowPlaying();
  drawTimer();
  drawContinue();
}

/** "Continuar assistindo": the latest history entries with a resume point. */
async function drawContinue() {
  const box = $('#continueCard');
  if (!box) return;
  try {
    const h = await api('/api/v2/history');
    const items = h.items.filter((e) => e.resume).slice(0, 3);
    if (!items.length) return;
    box.hidden = false;
    box.innerHTML = `<h2>Continuar assistindo</h2><div class="list">${items.map((e, i) => `<div class="item"><div class="fileicon">${icon('history')}</div>
      <div class="t"><b>${esc(e.title)}</b><small>Parou em ${fmtTime(e.resume)}${e.duration ? ' de ' + fmtTime(e.duration) : ''}</small></div>
      <button class="btn small primary" data-cont="${i}">Continuar</button></div>`).join('')}</div>`;
    $$('[data-cont]', box).forEach((b) => b.onclick = () => api('/api/v2/history/play', { method: 'POST', json: { src: items[+b.dataset.cont].src, resume: true } }).then((r) => { toast(r.message); setTimeout(refreshStatus, 700); }, (e) => toast(e.message, false)));
  } catch (e) { /* no history route on old TVs */ }
}

async function findTv() {
  try { await api('/api/v2/beep', { method: 'POST' }); toast('A TV está tocando um som'); } catch (e) { toast(e.message, false); }
}

/* ---------------------------------------------------------------- Now playing (Home + Cast) */
function updateNowPlaying() {
  const card = $('#npCard');
  if (!card) return;
  const s = S.status;
  if (!s || !s.playing) {
    card.innerHTML = `<h2>Reprodução</h2><p class="sub" style="margin:0">Nada tocando no TV Drop agora.</p>`;
    card.dataset.state = 'idle';
    return;
  }
  let name = s.playing.split('/').pop(); try { name = decodeURIComponent(name); } catch (e) { /* ignore */ }
  if (card.dataset.state !== 'playing') {
    card.dataset.state = 'playing';
    card.innerHTML = `<h2>Tocando agora</h2>
      <div class="np-title" id="npTitle"></div><div class="np-audio" id="npAudio"></div>
      <input class="seek" id="npSeek" type="range" min="0" max="1" value="0" aria-label="Posição">
      <div class="times"><span id="npPos">0:00</span><span id="npDur">--:--</span></div>
      <div class="transport">
        <button class="key" data-q="prev" aria-label="Anterior da fila">${icon('prev')}</button>
        <button class="key" data-ctl="back" aria-label="Voltar 10 segundos">${icon('rew')}</button>
        <button class="key" data-ctl="toggle" id="npToggle" aria-label="Pausar ou continuar">${icon('pause')}</button>
        <button class="key" data-ctl="fwd" aria-label="Avançar 30 segundos">${icon('ff')}</button>
        <button class="key" data-q="next" aria-label="Próximo da fila">${icon('next')}</button>
      </div>
      <div class="transport">
        <button class="key" data-vol="down" aria-label="Diminuir volume">${icon('voldown')}</button>
        <button class="key" data-vol="mute" aria-label="Silenciar">${icon('mute')}</button>
        <button class="key" data-vol="up" aria-label="Aumentar volume">${icon('volup')}</button>
      </div>
      <div class="row" style="margin-top:12px"><button class="btn small" id="npTracks">${icon('cc')}Áudio, legenda e velocidade</button><button class="btn small" data-ctl="stop">${icon('stop')}Parar</button><button class="btn small" id="npExt"></button></div>
      <div class="tracks" id="tracksBox" hidden></div>`;
    $$('[data-q]', card).forEach((b) => b.onclick = () => queueCmd(b.dataset.q));
    $('#npTracks', card).onclick = toggleTracks;
    $$('[data-ctl]', card).forEach((b) => b.onclick = () => playerCtl(b.dataset.ctl));
    $$('[data-vol]', card).forEach((b) => b.onclick = () => { buzz(); api('/api/v2/volume', { method: 'POST', json: { action: b.dataset.vol } }).catch((e) => toast(e.message, false)); });
    const seek = $('#npSeek', card);
    seek.oninput = () => { seek.dataset.drag = '1'; $('#npPos').textContent = fmtTime(seek.value * 1000); };
    seek.onchange = () => { delete seek.dataset.drag; playerCtl('seek&ms=' + seek.value * 1000); };
    $('#npExt', card).onclick = () => playerCtl('external');
  }
  $('#npTitle').textContent = name;
  $('#npAudio').textContent = s.audio ? 'Áudio: ' + s.audio : '';
  $('#npToggle').innerHTML = icon(s.paused ? 'play' : 'pause');
  const seek = $('#npSeek');
  if (!seek.dataset.drag && s.duration > 0) { seek.max = Math.floor(s.duration / 1000); seek.value = Math.floor(s.position / 1000); $('#npPos').textContent = fmtTime(s.position); }
  $('#npDur').textContent = s.duration > 0 ? fmtTime(s.duration) : '--:--';
  $('#npExt').textContent = s.externalPlayer ? 'Abrir no ' + s.externalPlayer + ' da TV' : 'Sem som? Instale o VLC na TV';
}

async function playerCtl(cmd) {
  buzz();
  try { await api('/api/control?cmd=' + cmd, { method: 'POST' }); setTimeout(refreshStatus, 300); } catch (e) { toast(e.message, false); }
}

/* ---------------------------------------------------------------- CAST */
function renderCast() {
  const main = $('#main');
  main.innerHTML = header('Transmitir') + `
    ${NATIVE ? `<div class="card"><h2>Do celular, sem copiar</h2><p class="sub">A TV toca o vídeo direto do celular, em qualidade original.</p>
      <button class="btn primary" style="width:100%" id="nativeCast">${icon('phone')}Escolher vídeo do celular</button>
      <button class="btn" style="width:100%;margin-top:10px" id="nativeQueue">${icon('queue')}Adicionar vídeos do celular à fila</button></div>
      <div class="card"><h2>Espelhar a tela</h2><p class="sub">Mostra a tela do celular na TV (apresentações, fotos, jogos). Apps protegidos (bancos, Netflix…) aparecem pretos, e o som continua no celular.</p>
      <button class="btn" style="width:100%" id="nativeMirror">${icon('cast')}${NATIVE.mirroring && NATIVE.mirroring() ? 'Parar espelhamento' : 'Espelhar a tela do celular'}</button></div>` : ''}
    <div class="card" id="mirrorCard" hidden><h2>Espelhamento ativo</h2><p class="sub">Um celular está espelhando a tela nesta TV.</p><button class="btn danger" id="mirrorStop">Encerrar espelhamento</button></div>
    <div class="card"><h2>Enviar para a TV</h2><p class="sub">Link de vídeo (.mp4, .m3u8), YouTube ou qualquer página.</p>
      <div class="row"><input class="field grow" id="linkIn" type="url" inputmode="url" placeholder="https://…" autocomplete="off"><button class="btn primary" id="linkBtn">${icon('link')}Enviar</button><button class="btn" id="linkQueue">+ Fila</button></div>
      <div class="msg" id="linkMsg"></div></div>
    <div class="card"><h2>Enviar arquivos</h2><p class="sub">Vídeos, músicas, fotos, documentos e APKs. Vários de uma vez.</p>
      <div class="drop" id="drop" role="button" tabindex="0">${icon('upload')}<br>Toque para escolher<br><small>ou arraste para cá</small></div>
      <input type="file" id="pick" multiple hidden>
      <label class="slider-row" style="margin-top:12px"><input type="checkbox" id="auto" ${store.get('autoOpen', true) ? 'checked' : ''} style="flex:none;width:20px;height:20px"> Tocar vídeo / instalar APK assim que chegar</label>
      <div id="xfers"></div></div>
    <div class="card" id="npCard"></div>
    <div class="card"><h2>Arquivos recebidos</h2>
      <div class="chips" id="chips">${[['all', 'Todos'], ['video', 'Vídeos'], ['audio', 'Músicas'], ['image', 'Fotos'], ['document', 'Documentos'], ['apk', 'APKs'], ['other', 'Outros']].map(([k, l]) => `<button data-f="${k}" aria-pressed="${S.fileFilter === k}">${l}</button>`).join('')}</div>
      <div class="list" id="files"><div class="empty">Carregando…</div></div></div>
    <div class="card"><h2>Atividade</h2><pre class="log" id="log"></pre></div>`;
  renderConn();
  if (NATIVE) {
    $('#nativeCast').onclick = () => NATIVE.pickAndCast();
    $('#nativeQueue').onclick = () => (NATIVE.pickToQueue ? NATIVE.pickToQueue() : toast('Atualize o app do celular', false));
    $('#nativeMirror').onclick = () => (NATIVE.mirror ? NATIVE.mirror() : toast('Atualize o app do celular', false));
  }
  if (S.caps && S.caps.mirror && S.caps.mirror.active) $('#mirrorCard').hidden = false;
  $('#mirrorStop').onclick = () => api('/api/v2/mirror/stop', { method: 'POST' }).then((r) => { toast(r.message); $('#mirrorCard').hidden = true; }, (e) => toast(e.message, false));
  $('#linkBtn').onclick = sendLink;
  $('#linkQueue').onclick = () => {
    const url = $('#linkIn').value.trim(), c = classifyLink(url);
    if (!c || c.kind !== 'media') { $('#linkMsg').textContent = 'Só links diretos de vídeo/áudio entram na fila (o player do TV Drop toca eles).'; $('#linkMsg').className = 'msg err'; return; }
    queueAdd(url);
  };
  $('#linkIn').onkeydown = (e) => { if (e.key === 'Enter') sendLink(); };
  const drop = $('#drop'), pick = $('#pick');
  drop.onclick = () => pick.click();
  drop.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') pick.click(); };
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); uploadAll([...e.dataTransfer.files]); };
  pick.onchange = () => { uploadAll([...pick.files]); pick.value = ''; };
  $('#auto').onchange = (e) => store.set('autoOpen', e.target.checked);
  $$('#chips button').forEach((b) => b.onclick = () => { S.fileFilter = b.dataset.f; $$('#chips button').forEach((x) => x.setAttribute('aria-pressed', x === b)); updateFiles(true); });
  renderXfers();
  updateNowPlaying();
  updateFiles(true);
}

/** Decides how a link should open on the TV. */
function classifyLink(url) {
  let u; try { u = new URL(url); } catch (e) { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const path = u.pathname.toLowerCase();
  if (/\.(mp4|mkv|webm|mov|m4v|m3u8|mpd|ts|mp3|m4a|aac|flac|ogg|wav)$/.test(path)) return { kind: 'media', label: 'vídeo/áudio direto' };
  if (/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(u.hostname)) return { kind: 'app', label: 'YouTube' };
  if (/(^|\.)netflix\.com$/.test(u.hostname)) return { kind: 'app', label: 'Netflix' };
  return { kind: 'page', label: 'página da internet' };
}

async function sendLink() {
  const url = $('#linkIn').value.trim();
  const msg = $('#linkMsg');
  const c = classifyLink(url);
  if (!c) { msg.textContent = 'Cole um link que comece com http:// ou https://'; msg.className = 'msg err'; return; }
  try {
    if (c.kind === 'media') await api('/api/play', { method: 'POST', body: url });
    else await api('/api/v2/remote/link', { method: 'POST', json: { link: url } });
    msg.textContent = 'Enviado (' + c.label + ').'; msg.className = 'msg ok';
    if (c.kind === 'media') setTimeout(refreshStatus, 600);
  } catch (e) { msg.textContent = e.message; msg.className = 'msg err'; }
}

function uploadAll(files) {
  files.forEach((f) => S.xfers.unshift({ file: f, name: f.name, size: f.size, sent: 0, state: 'queued', xhr: null }));
  renderXfers();
  pumpUploads();
}

function pumpUploads() {
  if (S.xfers.some((x) => x.state === 'sending')) return;
  const next = [...S.xfers].reverse().find((x) => x.state === 'queued');
  if (!next) return;
  next.state = 'sending';
  const xhr = new XMLHttpRequest();
  next.xhr = xhr;
  const auto = $('#auto') ? $('#auto').checked : store.get('autoOpen', true);
  xhr.open('POST', u('/api/upload?name=' + encodeURIComponent(next.name) + (auto ? '&auto=1' : '')));
  if (S.token) xhr.setRequestHeader('X-TVDrop-Token', S.token);
  const t0 = Date.now();
  xhr.upload.onprogress = (e) => { if (e.lengthComputable) { next.sent = e.loaded; next.speed = e.loaded / Math.max(0.1, (Date.now() - t0) / 1000); renderXfers(); } };
  xhr.onload = () => {
    let j = {}; try { j = JSON.parse(xhr.responseText); } catch (e) { /* ignore */ }
    next.state = xhr.status === 200 ? 'done' : 'error';
    next.message = j.message || (xhr.status === 401 ? 'Não autorizado' : 'Erro ' + xhr.status);
    if (j.name && j.name !== next.name) next.message += ' Salvo como "' + j.name + '".';
    if (xhr.status === 401) showPairing();
    renderXfers(); refreshStatus(); pumpUploads();
  };
  xhr.onerror = () => { next.state = 'error'; next.message = 'A conexão com a TV caiu.'; renderXfers(); pumpUploads(); };
  xhr.onabort = () => { next.state = 'cancelled'; next.message = 'Cancelado.'; renderXfers(); pumpUploads(); };
  xhr.send(next.file);
  renderXfers();
}

function renderXfers() {
  const box = $('#xfers');
  if (!box) return;
  box.innerHTML = S.xfers.slice(0, 8).map((x, i) => {
    const pct = x.size ? Math.round((x.sent / x.size) * 100) : 0;
    const label = { queued: 'Na fila', sending: `${pct}% · ${fmtSize(x.sent)} de ${fmtSize(x.size)}${x.speed ? ' · ' + fmtSize(x.speed) + '/s' : ''}`, done: x.message, error: x.message, cancelled: x.message }[x.state];
    return `<div class="xfer"><div class="row"><b class="grow" style="overflow-wrap:anywhere">${esc(x.name)}</b>
      ${x.state === 'sending' || x.state === 'queued' ? `<button class="btn small" data-cancel="${i}">Cancelar</button>` : `<span class="pill ${x.state === 'done' ? 'ok' : 'warn'}">${x.state === 'done' ? 'Concluído' : x.state === 'cancelled' ? 'Cancelado' : 'Erro'}</span>`}</div>
      <small class="sub">${esc(label || '')}</small>${x.state === 'sending' ? `<div class="bar"><i style="width:${pct}%"></i></div>` : ''}</div>`;
  }).join('');
  $$('[data-cancel]', box).forEach((b) => b.onclick = () => { const x = S.xfers[+b.dataset.cancel]; if (x.xhr && x.state === 'sending') x.xhr.abort(); else { x.state = 'cancelled'; x.message = 'Cancelado.'; renderXfers(); } });
}

let lastFilesKey = '';
function updateFiles(force) {
  const box = $('#files');
  if (!box || !S.status) return;
  const files = S.status.files.filter((f) => S.fileFilter === 'all' || f.kind === S.fileFilter);
  const key = S.fileFilter + JSON.stringify(files);
  if (!force && key === lastFilesKey) { $('#log').textContent = (S.status.log || []).join('\n') || 'Nada ainda.'; return; }
  lastFilesKey = key;
  const ic = { video: 'video', audio: 'music', image: 'image', apk: 'apk', document: 'file', other: 'file' };
  box.innerHTML = files.length ? files.map((f) => `<div class="item"><div class="fileicon">${icon(ic[f.kind] || 'file')}</div>
      <div class="t"><b>${esc(f.name)}</b><small>${fmtSize(f.size)} · ${esc(f.name.split('.').pop().toUpperCase())}${f.modified ? ' · ' + fmtDate(f.modified) : ''}</small></div>
      ${f.kind === 'video' || f.kind === 'audio' ? `<button class="btn small primary" data-play="${esc(f.name)}">Tocar</button><button class="btn small" data-fq="${esc(f.name)}" aria-label="Adicionar ${esc(f.name)} à fila">+ Fila</button>` : ''}
      ${f.kind === 'apk' ? `<button class="btn small primary" data-install="${esc(f.name)}">Instalar</button>` : ''}
      <button class="btn small danger" data-del="${esc(f.name)}" aria-label="Apagar ${esc(f.name)}">${icon('trash')}</button></div>`).join('')
    : '<div class="empty">Nenhum arquivo nesta categoria.</div>';
  $$('[data-play]', box).forEach((b) => b.onclick = () => api('/api/play?file=' + encodeURIComponent(b.dataset.play), { method: 'POST' }).then(() => { toast('Tocando na TV'); setTimeout(refreshStatus, 600); }, (e) => toast(e.message, false)));
  $$('[data-fq]', box).forEach((b) => b.onclick = () => queueAdd('inbox:' + b.dataset.fq, b.dataset.fq));
  $$('[data-install]', box).forEach((b) => b.onclick = () => api('/api/install?file=' + encodeURIComponent(b.dataset.install), { method: 'POST' }).then((r) => toast(r.message), (e) => toast(e.message, false)));
  $$('[data-del]', box).forEach((b) => b.onclick = () => { if (confirm('Apagar ' + b.dataset.del + ' da TV?')) api('/api/delete?file=' + encodeURIComponent(b.dataset.del), { method: 'POST' }).then(refreshStatus, (e) => toast(e.message, false)); });
  $('#log').textContent = (S.status.log || []).join('\n') || 'Nada ainda.';
}

/* ---------------------------------------------------------------- REMOTE */
const REPEAT_KEYS = new Set(['up', 'down', 'left', 'right', 'volup', 'voldown', 'chup', 'chdown', 'del', 'rew', 'ff']);
const KEY_INFO = {
  power: ['power', 'Liga/Desliga'], input: ['tv', 'Fonte'], assistant: ['mic', 'Assistente'], settings: ['settings', 'Ajustes'],
  back: ['back', 'Voltar'], home: ['home', 'Início'], menu: ['menu', 'Menu'], apps: ['grid', 'Todos os apps'], recents: ['history', 'Recentes'],
  rew: ['rew', 'Retroceder'], playpause: ['playpause', 'Play/Pausa'], ff: ['ff', 'Avançar'], stop: ['stop', 'Parar'], prev: ['prev', 'Anterior'], next: ['next', 'Próximo'],
  mute: ['mute', 'Mudo'], search: ['search', 'Pesquisar'], info: ['info', 'Info'], guide: ['library', 'Guia'], captions: ['cc', 'Legendas'],
};

/** Why a key is unavailable, in plain words. */
function keyHint(key) {
  const r = S.caps && S.caps.remote;
  if (r && r.atv && !r.atv.paired) return 'Esta tecla precisa do controle pareado: Dispositivos → Parear controle.';
  return 'Esta TV não aceita esta tecla agora.';
}

/** Press = one key; hold = repeats (arrows, volume, channel...). Unavailable keys explain why. */
function bindKey(el, key) {
  let timer = 0, repeat = 0, pressed = false;
  const stop = () => {
    if (pressed && /^(volup|voldown|mute)$/.test(key)) setTimeout(() => loadCaps().then(drawRemoteStatus), 700);
    pressed = false; clearTimeout(timer); clearInterval(repeat); el.classList.remove('hit');
  };
  el.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    if (!has(key)) { toast(keyHint(key), false); return; }
    pressed = true;
    el.setPointerCapture && el.setPointerCapture(e.pointerId);
    el.classList.add('hit');
    sendKey(key);
    if (REPEAT_KEYS.has(key)) timer = setTimeout(() => { repeat = setInterval(() => { if (pressed) { buzz(); sendKey(key); } }, 120); }, 420);
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((t) => el.addEventListener(t, stop));
  // keyboard activation (Enter/Space on a focused button)
  el.addEventListener('click', (e) => { if (e.detail === 0) { if (has(key)) sendKey(key, el); else toast(keyHint(key), false); } });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

function rkey(key, extra = '', label) {
  const [ico, name] = KEY_INFO[key] || [key, key];
  return `<button class="key ${extra} ${S.caps && !has(key) ? 'off' : ''}" data-rk="${key}" aria-label="${label || name}">${icon(ico)}</button>`;
}

function renderRemote() {
  const main = $('#main');
  const caps = S.caps && S.caps.remote;
  const limited = caps && !(caps.atv && caps.atv.paired) && !nativeAtvOk();
  main.innerHTML = header('Controle') + `
    <div class="rstatus" id="rstatus"></div>
    ${limited ? `<div class="notice">${icon('info')}<div>Algumas teclas estão apagadas porque o controle ainda não foi pareado. <button class="btn small" data-go="devices" style="margin-top:8px">Parear controle</button></div></div>` : ''}
    <div class="seg" role="group" aria-label="Modo do controle">
      <button data-mode="dpad" aria-pressed="${S.remoteMode === 'dpad'}">${icon('remote')}Direcional</button>
      <button data-mode="swipe" aria-pressed="${S.remoteMode === 'swipe'}">${icon('pulse')}Deslizante</button>
      <button data-mode="pad" aria-pressed="${S.remoteMode === 'pad'}">${icon('grid')}Touchpad</button>
    </div>
    <div class="remote-grid">
      <div class="rcol">
        <div class="key-row top4">${rkey('power', 'power')}${rkey('input')}${rkey('assistant')}${rkey('settings')}</div>
        <div id="surface"></div>
        <div class="key-row nav3">${rkey('back', 'big')}${rkey('home', 'big')}${rkey('menu', 'big')}</div>
      </div>
      <div class="rcol">
        <div class="rockers">
          <div class="rocker" aria-label="Volume">
            <button class="rk-up ${S.caps && !has('volup') ? 'off' : ''}" data-rk="volup" aria-label="Aumentar volume">${icon('plus')}</button>
            <span class="rk-label">VOL</span>
            <button class="rk-down ${S.caps && !has('voldown') ? 'off' : ''}" data-rk="voldown" aria-label="Diminuir volume"><svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg></button>
          </div>
          <div class="media-pad">
            ${rkey('playpause', 'play-big')}
            <div class="media-row">${rkey('rew', 'small')}${rkey('mute', 'small')}${rkey('ff', 'small')}</div>
          </div>
          <div class="rocker" aria-label="Canal">
            <button class="rk-up ${S.caps && !has('chup') ? 'off' : ''}" data-rk="chup" aria-label="Próximo canal">${icon('up')}</button>
            <span class="rk-label">CH</span>
            <button class="rk-down ${S.caps && !has('chdown') ? 'off' : ''}" data-rk="chdown" aria-label="Canal anterior">${icon('down')}</button>
          </div>
        </div>
        <div class="actionbar">
          <button class="abtn" id="kbdBtn">${icon('keyboard')}<span>Teclado</span></button>
          <button class="abtn" id="micBtn">${icon('mic')}<span>Voz</span></button>
          <button class="abtn" id="numBtn"><b style="font-size:17px">123</b><span>Números</span></button>
          <button class="abtn" id="moreBtn">${icon('plus')}<span>Mais</span></button>
        </div>
        <div class="card panel" id="numPanel" hidden>
          <div class="numpad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button class="nkey ${S.caps && !has('num' + n) ? 'off' : ''}" data-rk="num${n}">${n}</button>`).join('')}
            <button class="nkey ${S.caps && !has('info') ? 'off' : ''}" data-rk="info">${icon('info')}</button>
            <button class="nkey ${S.caps && !has('num0') ? 'off' : ''}" data-rk="num0">0</button>
            <button class="nkey ${S.caps && !has('del') ? 'off' : ''}" data-rk="del">${icon('del')}</button></div>
        </div>
        <div class="card panel" id="morePanel" hidden>
          <div class="colors">${['red', 'green', 'yellow', 'blue'].map((c) => `<button class="ckey c-${c} ${S.caps && !has(c) ? 'off' : ''}" data-rk="${c}" aria-label="Botão ${c}"></button>`).join('')}</div>
          <div class="more-grid">${['search', 'guide', 'captions', 'recents', 'apps', 'stop', 'prev', 'next'].map((k) => `<div class="key-wrap">${rkey(k)}<div class="key-label">${KEY_INFO[k][1]}</div></div>`).join('')}</div>
        </div>
        <div class="quickapps" id="quickApps"></div>
        <div class="card kbd" id="kbd" hidden><div class="row"><h2 class="grow" style="margin:0">Teclado</h2>
          <label class="slider-row" style="margin:0;flex:none"><input type="checkbox" id="kbdLive" ${store.get('liveTyping', false) ? 'checked' : ''} style="width:20px;height:20px"> Digitar ao vivo</label></div>
          <p class="sub" style="margin-top:6px" id="kbdHint"></p>
          <textarea id="kbdText" placeholder="Ex.: filmes de ação" autocapitalize="off" autocomplete="off" spellcheck="false"></textarea>
          <div class="row" style="margin-top:10px" id="kbdSendRow"><button class="btn primary" id="kbdSend">Enviar</button><button class="btn" id="kbdSearch">${icon('search')}Enviar e buscar</button></div>
          <div class="row" style="margin-top:10px">
            <button class="btn small" data-rk="del">${icon('del')}Apagar</button><button class="btn small" id="kbdEnter">${icon('enter')}Enter</button><button class="btn small" id="kbdSpace">Espaço</button><button class="btn small" id="kbdClear">Limpar campo</button></div></div>
        <div class="card" id="voice" hidden><h2>Voz e comandos</h2><p class="sub" id="voiceHint">Fale, por exemplo: “abrir YouTube”, “volume em 20”, “voltar”, “pesquisar filmes de ação”.</p>
          <button class="mic" id="voiceGo" aria-label="Falar">${icon('mic')}</button>
          <div class="row" style="margin-top:14px"><input class="field grow" id="cmdText" placeholder="Ou digite: abrir Netflix, volume em 20…" autocomplete="off"><button class="btn primary" id="cmdGo">${icon('bolt')}</button></div>
          <div class="msg" id="voiceMsg" style="text-align:center"></div><div class="row" id="voiceConfirm" hidden><button class="btn primary" data-yes>Executar</button><button class="btn" data-no>Cancelar</button></div></div>
        <div class="card" id="timerCard"></div>
        <div class="card kb-hint" id="kbHint"><h2>Atalhos do teclado</h2><p class="sub" style="margin:0">Setas · Enter = OK · Esc/Backspace = Voltar · H = Início · Espaço = Play/Pausa · + / − = Volume · M = Mudo · PgUp/PgDn = Canal · 0–9</p></div>
      </div>
    </div>`;
  renderConn();
  $$('[data-go]', main).forEach((b) => b.onclick = () => go(b.dataset.go));
  $$('[data-mode]', main).forEach((b) => b.onclick = () => { S.remoteMode = b.dataset.mode; store.set('remoteMode', S.remoteMode); $$('[data-mode]').forEach((x) => x.setAttribute('aria-pressed', x === b)); renderSurface(); });
  $$('[data-rk]', main).forEach((b) => bindKey(b, b.dataset.rk));
  const panel = (id) => { const ids = ['numPanel', 'morePanel', 'kbd', 'voice']; ids.forEach((x) => { if (x !== id) $('#' + x).hidden = true; }); const p = $('#' + id); p.hidden = !p.hidden; return !p.hidden; };
  $('#numBtn').onclick = () => panel('numPanel');
  $('#moreBtn').onclick = () => panel('morePanel');
  $('#kbdBtn').onclick = () => { if (panel('kbd')) $('#kbdText').focus(); };
  setupKeyboard();
  setupVoice();
  const voiceToggle = $('#micBtn').onclick; // from setupVoice: toggles the card and explains when there is no mic
  $('#micBtn').onclick = () => { ['numPanel', 'morePanel'].forEach((x) => { $('#' + x).hidden = true; }); voiceToggle(); };
  renderSurface();
  drawRemoteStatus();
  drawQuickApps();
  drawTimer();
  wsConnect();
}

/** App on screen, volume (with a slider when the TV reports it) and which path the remote uses. */
function drawRemoteStatus() {
  const box = $('#rstatus');
  if (!box) return;
  const r = S.caps && S.caps.remote;
  const atv = r && r.atv;
  const chips = [];
  if (atv && atv.currentApp) {
    const a = S.apps.find((x) => x.pkg === atv.currentApp);
    chips.push(`<span class="chip">${a ? `<img src="${iconUrl(a.pkg)}" alt="" onerror="this.remove()">` : icon('tv')}${esc(a ? a.label : atv.currentApp.split('.').pop())}</span>`);
  }
  const via = atv && atv.paired ? 'Controle pareado' : nativeAtvOk() ? 'Controle pelo celular' : r && r.accessibility && r.accessibility.enabled ? 'Acessibilidade' : 'Controle limitado';
  chips.push(`<span class="chip ${atv && atv.paired || nativeAtvOk() ? 'ok' : ''}">${icon('remote')}${via}</span>`);
  const volKnown = atv && atv.volumeMax > 0 && atv.volumeLevel >= 0;
  if (volKnown) chips.push(`<span class="chip">${icon(atv.muted ? 'mute' : 'volup')}${atv.muted ? 'Mudo' : atv.volumeLevel + '/' + atv.volumeMax}</span>`);
  box.innerHTML = `<div class="chips-row">${chips.join('')}</div>` + (volKnown ? `<label class="slider-row vol-slider">${icon('voldown')}<input type="range" id="volSlider" min="0" max="${atv.volumeMax}" value="${atv.volumeLevel}" aria-label="Volume">${icon('volup')}</label>` : '');
  const sl = $('#volSlider');
  if (sl) sl.onchange = async () => { await execute({ intent: 'volumeSet', args: { level: +sl.value } }); setTimeout(() => loadCaps().then(drawRemoteStatus), 600); };
}

/** Favourite installed apps, one tap away from the remote. */
async function drawQuickApps() {
  const box = $('#quickApps');
  if (!box) return;
  await loadApps();
  const favs = getFavs().map(favInfo).filter((f) => f && f.installed).slice(0, 12);
  if (!favs.length) { box.innerHTML = ''; return; }
  box.innerHTML = favs.map((f) => `<button class="qa" data-pkg="${esc(f.pkg)}" data-name="${esc(f.label)}" style="background:${esc(f.color)}" aria-label="Abrir ${esc(f.label)}">
    <img src="${iconUrl(f.pkg)}" alt="" onerror="this.remove()"><span>${esc(f.label)}</span></button>`).join('');
  $$('.qa', box).forEach((b) => b.onclick = () => launchApp(b.dataset.pkg, b.dataset.name));
}

function setupKeyboard() {
  const ta = $('#kbdText');
  const live = () => $('#kbdLive').checked;
  const hint = () => {
    $('#kbdHint').textContent = live() ? 'Cada letra vai direto para o campo selecionado na TV.' : 'Selecione um campo de busca na TV, digite aqui e toque em Enviar.';
    $('#kbdSendRow').hidden = live();
  };
  hint();
  let last = '', pending = '', flushTimer = 0;
  const flush = () => { if (pending) { const p = pending; pending = ''; sendText(p); } };
  $('#kbdLive').onchange = (e) => { store.set('liveTyping', e.target.checked); last = ta.value; hint(); };
  ta.addEventListener('input', () => {
    if (!live()) return;
    const v = ta.value;
    if (v.startsWith(last)) { pending += v.slice(last.length); clearTimeout(flushTimer); flushTimer = setTimeout(flush, 180); }
    else if (last.startsWith(v)) { flush(); for (let i = 0; i < last.length - v.length; i++) sendKey('del'); }
    else { flush(); sendText(v, { replace: true }); }
    last = v;
  });
  ta.addEventListener('keydown', (e) => { if (live() && e.key === 'Enter') { e.preventDefault(); flush(); sendKey('enter'); } });
  $('#kbdSend').onclick = () => { const t = ta.value; if (t) sendText(t).then((ok) => ok && toast('Texto enviado')); };
  $('#kbdSearch').onclick = () => sendText(ta.value, { submit: true }).then((ok) => ok && toast('Buscando na TV'));
  $('#kbdEnter').onclick = () => sendKey('enter');
  $('#kbdSpace').onclick = () => sendText(' ');
  $('#kbdClear').onclick = () => { ta.value = ''; last = ''; sendText('', { replace: true }).then((ok) => ok && toast('Campo limpo')); };
}

// Desktop: keyboard shortcuts while the remote is open.
document.addEventListener('keydown', (e) => {
  if (S.view !== 'remote' || e.ctrlKey || e.metaKey || e.altKey) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName)) return;
  const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'ok', Escape: 'back', Backspace: 'back',
    h: 'home', H: 'home', m: 'mute', M: 'mute', ' ': 'playpause', '+': 'volup', '=': 'volup', '-': 'voldown', PageUp: 'chup', PageDown: 'chdown' };
  let key = map[e.key];
  if (!key && /^[0-9]$/.test(e.key)) key = 'num' + e.key;
  if (!key) return;
  e.preventDefault();
  if (!has(key)) { toast(keyHint(key), false); return; }
  const el = $(`[data-rk="${key}"], .dpad [data-key="${key}"]`);
  sendKey(key, el);
});

function renderSurface() {
  const box = $('#surface');
  if (!box) return;
  const dpadOk = !S.caps || has('up');
  if (S.remoteMode === 'dpad') {
    box.innerHTML = `<div class="dpad ${dpadOk ? '' : 'off'}" role="group" aria-label="Direcional">
      <button class="up" data-rk="up" aria-label="Cima">${icon('up')}</button>
      <button class="left" data-rk="left" aria-label="Esquerda">${icon('left')}</button>
      <button class="ok" data-rk="ok" aria-label="OK">OK</button>
      <button class="right" data-rk="right" aria-label="Direita">${icon('right')}</button>
      <button class="down" data-rk="down" aria-label="Baixo">${icon('down')}</button></div>`;
    $$('[data-rk]', box).forEach((b) => bindKey(b, b.dataset.rk));
  } else if (S.remoteMode === 'swipe') {
    box.innerHTML = `<div class="pad" id="pad" aria-label="Área de deslizar"><div>${dpadOk ? 'Deslize para navegar<br><small>Toque = OK · segure após deslizar = continua</small>' : 'O modo deslizante precisa das setas: pareie o controle em Dispositivos.'}</div></div>`;
    if (dpadOk) setupSwipe($('#pad'));
  } else {
    const ok = !S.caps || (S.caps.remote && S.caps.remote.pointer);
    box.innerHTML = `<div class="pad" id="pad" aria-label="Touchpad"><div>${ok ? 'Arraste para mover o cursor<br><small>Toque = clique · dois toques = clique duplo · dois dedos = rolar</small>' : 'O touchpad precisa da acessibilidade do TV Drop ativada na TV (veja Dispositivos).'}</div></div>
      <div class="padbar">
        <button class="btn small" data-pt="tap">Clique</button><button class="btn small" data-pt="longpress">Segurar</button>
        <button class="btn small" data-pt="scrollup">${icon('up')}</button><button class="btn small" data-pt="scrolldown">${icon('down')}</button>
        <button class="btn small" data-pt="hide">Ocultar</button></div>
      <label class="slider-row">Sensibilidade<input type="range" id="sens" min="0.6" max="4" step="0.1" value="${S.sensitivity}"></label>`;
    $('#sens').oninput = (e) => { S.sensitivity = +e.target.value; store.set('sensitivity', S.sensitivity); };
    $$('[data-pt]', box).forEach((b) => b.onclick = () => {
      buzz();
      const t = b.dataset.pt;
      if (t === 'scrollup') pointer('scroll', 0, 300); else if (t === 'scrolldown') pointer('scroll', 0, -300); else pointer(t);
    });
    if (ok) setupTouchpad($('#pad'));
  }
}

function ripple(pad, x, y) {
  const r = pad.getBoundingClientRect();
  const d = document.createElement('span');
  d.className = 'ripple'; d.style.left = (x - r.left) + 'px'; d.style.top = (y - r.top) + 'px';
  pad.appendChild(d); setTimeout(() => d.remove(), 500);
}

/** Swipe mode: every ~55 px sends one arrow; holding still after a swipe keeps repeating it; a tap is OK. */
function setupSwipe(pad) {
  let sx, sy, moved, start, lastKey = null, holdTimer = 0, holdRepeat = 0;
  const stopHold = () => { clearTimeout(holdTimer); clearInterval(holdRepeat); };
  const armHold = () => { stopHold(); holdTimer = setTimeout(() => { holdRepeat = setInterval(() => { if (lastKey) { buzz(); sendKey(lastKey); } }, 170); }, 450); };
  pad.onpointerdown = (e) => { pad.setPointerCapture(e.pointerId); sx = e.clientX; sy = e.clientY; moved = false; start = Date.now(); lastKey = null; };
  pad.onpointermove = (e) => {
    if (sx == null) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 55) return;
    moved = true;
    const key = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    lastKey = key;
    buzz(); sendKey(key); ripple(pad, e.clientX, e.clientY);
    sx = e.clientX; sy = e.clientY;
    armHold();
  };
  const end = (e) => { stopHold(); if (sx != null && !moved && Date.now() - start < 400) { buzz(); sendKey('ok'); ripple(pad, e.clientX, e.clientY); } sx = sy = null; };
  pad.onpointerup = end;
  pad.onpointercancel = () => { stopHold(); sx = sy = null; };
}

/** Touchpad: one finger moves the cursor, a tap clicks, a long press holds, two fingers scroll. */
function setupTouchpad(pad) {
  const pts = new Map();
  let acc = { dx: 0, dy: 0 }, raf = 0, downAt = 0, travel = 0, longTimer = 0, scrollY = null;
  const flush = () => { raf = 0; if (acc.dx || acc.dy) { pointer('move', Math.round(acc.dx), Math.round(acc.dy)); acc = { dx: 0, dy: 0 }; } };
  pad.onpointerdown = (e) => {
    pad.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) { downAt = Date.now(); travel = 0; longTimer = setTimeout(() => { if (travel < 8) { pointer('longpress'); buzz(); } }, 650); }
    if (pts.size === 2) { clearTimeout(longTimer); scrollY = [...pts.values()].reduce((a, p) => a + p.y, 0) / 2; }
  };
  pad.onpointermove = (e) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    travel += Math.abs(dx) + Math.abs(dy);
    if (pts.size >= 2) {
      const y = [...pts.values()].reduce((a, q) => a + q.y, 0) / pts.size;
      if (Math.abs(y - scrollY) > 40) { pointer('scroll', 0, (y - scrollY) * 4); scrollY = y; }
      return;
    }
    acc.dx += dx * S.sensitivity; acc.dy += dy * S.sensitivity;
    if (!raf) raf = requestAnimationFrame(flush);
  };
  const end = (e) => {
    const was = pts.size;
    pts.delete(e.pointerId);
    clearTimeout(longTimer);
    if (was === 1 && travel < 8 && Date.now() - downAt < 300) { pointer('tap'); buzz(); ripple(pad, e.clientX, e.clientY); }
    if (pts.size < 2) scrollY = null;
  };
  pad.onpointerup = end; pad.onpointercancel = end;
}

/* ---------------------------------------------------------------- VOICE */
let recognizer = null;
function voiceAvailable() {
  if (NATIVE && NATIVE.voice) return 'native';
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR && window.isSecureContext) return 'web';
  return null;
}

function setupVoice() {
  const mode = voiceAvailable();
  const btn = $('#micBtn');
  btn.onclick = () => {
    $('#kbd').hidden = true;
    const card = $('#voice'); card.hidden = !card.hidden;
    if (!mode) {
      $('#voiceHint').textContent = 'Neste navegador o microfone não está disponível (só em páginas https; a da TV é http). Digite o comando abaixo, ou use o app TV Drop no Android para falar.';
      $('#voiceGo').disabled = true;
    }
  };
  $('#voiceGo').onclick = () => listen(mode);
  const runTyped = () => { const v = $('#cmdText').value.trim(); if (v) { runCommand(v, 1, $('#voiceMsg'), $('#voiceConfirm')); $('#cmdText').value = ''; } };
  $('#cmdGo').onclick = runTyped;
  $('#cmdText').onkeydown = (e) => { if (e.key === 'Enter') runTyped(); };
}

function listen(mode) {
  const msg = $('#voiceMsg');
  $('#voiceConfirm').hidden = true;
  if (mode === 'native') { $('#voiceGo').classList.add('on'); msg.textContent = 'Ouvindo…'; NATIVE.voice(); return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognizer = new SR();
  recognizer.lang = 'pt-BR'; recognizer.interimResults = false; recognizer.maxAlternatives = 1;
  recognizer.onstart = () => { $('#voiceGo').classList.add('on'); msg.textContent = 'Ouvindo…'; msg.className = 'msg'; };
  recognizer.onerror = (e) => { $('#voiceGo').classList.remove('on'); msg.textContent = 'Não consegui ouvir (' + e.error + ').'; msg.className = 'msg err'; };
  recognizer.onend = () => $('#voiceGo').classList.remove('on');
  recognizer.onresult = (e) => { const r = e.results[0][0]; onVoiceText(r.transcript, r.confidence); };
  recognizer.start();
}

// Called by the Android app after speech recognition.
window.tvdropVoiceResult = (text) => { $('#voiceGo') && $('#voiceGo').classList.remove('on'); onVoiceText(text, 1); };
window.tvdropVoiceError = (m) => { if ($('#voiceGo')) { $('#voiceGo').classList.remove('on'); $('#voiceMsg').textContent = m; $('#voiceMsg').className = 'msg err'; } };

function onVoiceText(text, confidence) {
  runCommand(text, confidence, $('#voiceMsg'), $('#voiceConfirm'));
}

/* ---------------------------------------------------------------- ASSISTANT: interpret -> check -> execute -> confirm */
function assistantContext() {
  const apps = [];
  for (const c of S.catalog) if (c.installed) apps.push({ name: c.name, pkg: c.installed });
  for (const a of S.apps) if (!apps.some((x) => x.pkg === a.pkg)) apps.push({ name: a.label, pkg: a.pkg });
  return { apps, shortcuts: getShortcuts().map((x) => x.name) };
}

/** Why an intent can't run on this TV right now (null = it can). */
function incompatible(cmd) {
  const k = (key) => (has(key) ? null : 'esta TV não aceita a tecla "' + key + '" agora (pareie o controle em Dispositivos)');
  switch (cmd.intent) {
    case 'key': return k(cmd.args.key);
    case 'keys': return k(cmd.args.key);
    case 'power': return k('power');
    case 'search': return k('search') || (S.caps && S.caps.remote && !S.caps.remote.text ? 'digitar na TV não está disponível' : null);
    case 'text': return S.caps && S.caps.remote && !S.caps.remote.text && !nativeAtvOk() ? 'digitar na TV não está disponível' : null;
    case 'app': return cmd.args.missing ? '"' + cmd.args.missing + '" não está instalado na TV' : null;
    case 'volumeSet': { const a = S.caps && S.caps.remote && S.caps.remote.atv; return a && a.volumeMax > 0 && a.volumeLevel >= 0 ? null : 'a TV não informou o volume atual (pareie o controle)'; }
    default: return null;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function execute(cmd) {
  const a = cmd.args || {};
  switch (cmd.intent) {
    case 'app': return launchApp(a.pkg, a.name);
    case 'key': return sendKey(a.key);
    case 'keys': for (let i = 0; i < a.times; i++) { await sendKey(a.key); await sleep(140); } return true;
    case 'volumeStep': for (let i = 0; i < a.steps; i++) { await api('/api/v2/volume', { method: 'POST', json: { action: a.dir } }); await sleep(120); } return true;
    case 'volumeSet': {
      const atv = S.caps.remote.atv;
      const target = Math.max(0, Math.min(atv.volumeMax, a.level));
      const diff = target - atv.volumeLevel;
      for (let i = 0; i < Math.abs(diff); i++) { await sendKey(diff > 0 ? 'volup' : 'voldown'); await sleep(120); }
      return true;
    }
    case 'search': if (await sendKey('search')) { await sleep(1500); return sendText(a.query, { submit: true }); } return false;
    case 'text': return sendText(a.text);
    case 'timer':
      if (a.action === 'power' && !has('power')) { toast('Sem o controle pareado a TV não desliga sozinha: no fim, a reprodução será encerrada.', false); await sleep(1800); }
      return setTimer(a.minutes, a.action);
    case 'timerCancel': return cancelTimer();
    case 'shortcut': { const sc = getShortcuts().find((x) => x.name === a.name); return sc ? runShortcut(sc) : false; }
    case 'queueNext': return queueCmd('next');
    case 'queuePrev': return queueCmd('prev');
    case 'playerToggle':
      if (S.status && S.status.playing) { if ((a.want === 'pause') !== !!S.status.paused) return playerCtl('toggle'); return true; }
      return sendKey(a.want === 'pause' ? 'pause' : 'play');
    case 'power': return sendKey('power');
    case 'go': go(a.view); return true;
    default: return false;
  }
}

/** Interprets a sentence and runs it; important or uncertain commands wait for a tap. */
function runCommand(text, confidence, msg, confirmBox) {
  const cmd = window.TVDropAssistant ? TVDropAssistant.interpret(text, assistantContext()) : null;
  if (!cmd) { msg.innerHTML = `“${esc(text)}”: não entendi o comando.`; msg.className = 'msg err'; return; }
  const why = incompatible(cmd);
  if (why) { msg.innerHTML = `“${esc(text)}” → ${esc(cmd.label)}: <b>${esc(why)}</b>.`; msg.className = 'msg err'; return; }
  msg.innerHTML = `“${esc(text)}” → <b>${esc(cmd.label)}</b>`;
  msg.className = 'msg ok';
  const go_ = async () => { const ok = await execute(cmd); if (ok === false) { msg.innerHTML += ' — <span style="color:var(--red)">não foi executado</span>'; } };
  if (cmd.confirm || (confidence && confidence < 0.6)) {
    confirmBox.hidden = false;
    $('[data-yes]', confirmBox).onclick = () => { confirmBox.hidden = true; go_(); };
    $('[data-no]', confirmBox).onclick = () => { confirmBox.hidden = true; msg.textContent = 'Cancelado.'; };
  } else go_();
}

/* ---------------------------------------------------------------- APPS */
async function loadApps(force) {
  if (S.appsLoaded && !force) return;
  try { const r = await api('/api/v2/apps'); S.apps = r.apps; S.catalog = r.catalog; S.appsLoaded = true; } catch (e) { toast(e.message, false); }
}

const favKey = () => 'favs.' + (S.info ? S.info.model || 'tv' : 'tv');
function getFavs() {
  let f = store.get(favKey(), null);
  if (!f) f = S.catalog.map((c) => ({ cat: c.id }));
  return f;
}
const setFavs = (f) => store.set(favKey(), f);
const iconUrl = (pkg) => u('/api/v2/apps/icon?pkg=') + encodeURIComponent(pkg) + '&token=' + encodeURIComponent(S.token);

function favInfo(f) {
  if (f.cat) {
    const c = S.catalog.find((x) => x.id === f.cat);
    if (!c) return null;
    return { key: 'cat:' + c.id, label: c.name, pkg: c.installed, installed: !!c.installed, color: c.color, storePkg: c.packages[0] };
  }
  const a = S.apps.find((x) => x.pkg === f.pkg);
  return { key: 'pkg:' + f.pkg, label: a ? a.label : f.pkg, pkg: f.pkg, installed: !!a, color: '#2a2e33', storePkg: f.pkg };
}

async function launchApp(pkg, label) {
  buzz();
  try { await api('/api/v2/apps/launch', { method: 'POST', json: { pkg } }); toast('Abrindo ' + (label || pkg) + ' na TV'); } catch (e) { toast(e.message, false); }
}

async function renderApps() {
  const main = $('#main');
  main.innerHTML = header('Apps') + `<div class="empty">Carregando apps da TV…</div>`;
  renderConn();
  await loadApps();
  drawApps();
}

function drawApps() {
  const main = $('#main');
  const favs = getFavs().map((f, i) => ({ ...favInfo(f), i })).filter((x) => x.label);
  const q = S.appSearch.toLowerCase();
  const all = S.apps.filter((a) => !q || a.label.toLowerCase().includes(q) || a.pkg.includes(q));
  main.innerHTML = header('Apps') + `
    <div class="card"><div class="row"><h2 class="grow" style="margin:0">Favoritos</h2>
      <button class="btn small" id="editFavs">${icon(S.editApps ? 'x' : 'edit')}${S.editApps ? 'Concluir' : 'Organizar'}</button></div>
      <p class="sub" style="margin-top:6px">${S.editApps ? 'Use as setas para reordenar e ✕ para remover.' : 'Toque para abrir na TV. Apps esmaecidos não estão instalados.'}</p>
      <div class="apps" id="favGrid">${favs.map((f) => `
        <div class="app-tile ${f.installed ? '' : 'missing'}" data-i="${f.i}" role="button" tabindex="0" style="background:${esc(f.color)}" aria-label="${esc(f.label)}">
          ${f.installed ? `<img src="${iconUrl(f.pkg)}" alt="" loading="lazy" onerror="this.remove()" onload="if(this.naturalWidth<=this.naturalHeight)this.classList.add('icon')">` : ''}
          <span class="name">${esc(f.label)}</span>${f.installed ? '' : '<span class="badge">Não instalado</span>'}
          ${S.editApps ? `<div class="edit"><button data-left="${f.i}" aria-label="Mover para a esquerda">${icon('chevl')}</button><button data-rm="${f.i}" aria-label="Remover">${icon('x')}</button><button data-right="${f.i}" aria-label="Mover para a direita">${icon('chevr')}</button></div>` : ''}
        </div>`).join('') || '<div class="empty">Nenhum favorito.</div>'}</div></div>
    <div class="card"><h2>Instalados na TV (${S.apps.length})</h2>
      <input class="field" id="appSearch" placeholder="Pesquisar apps" value="${esc(S.appSearch)}" style="margin:8px 0">
      <div class="list" id="allApps">${all.map((a) => `<div class="app-row"><img src="${iconUrl(a.pkg)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
        <div class="t"><b>${esc(a.label)}</b><br><small class="sub mono">${esc(a.pkg)}</small></div>
        <button class="btn small" data-fav="${esc(a.pkg)}" aria-label="Adicionar aos favoritos">${icon('plus')}</button>
        <button class="btn small primary" data-open="${esc(a.pkg)}">Abrir</button></div>`).join('') || '<div class="empty">Nenhum app encontrado.</div>'}</div>
      <div class="row" style="margin-top:10px"><button class="btn small" id="reloadApps">Atualizar lista</button></div></div>
    <div class="card"><h2>Meus atalhos</h2><p class="sub">Sequências de comandos com um toque. Os passos são conferidos antes de rodar.</p><div id="scBox"></div></div>
    <div class="card"><h2>Buscar filmes e séries</h2><div id="searchBox"></div></div>`;
  renderConn();
  drawShortcuts();
  drawSearch();
  $('#editFavs').onclick = () => { S.editApps = !S.editApps; drawApps(); };
  $('#reloadApps').onclick = async () => { await loadApps(true); drawApps(); };
  const search = $('#appSearch');
  search.oninput = () => { S.appSearch = search.value; const pos = search.selectionStart; drawApps(); const s2 = $('#appSearch'); s2.focus(); s2.setSelectionRange(pos, pos); };
  $$('#favGrid .app-tile').forEach((t) => {
    const open = () => {
      if (S.editApps) return;
      const f = favInfo(getFavs()[+t.dataset.i]);
      if (f.installed) launchApp(f.pkg, f.label);
      else if (confirm(f.label + ' não está instalado na TV. Abrir a loja de apps da TV?')) api('/api/v2/apps/store', { method: 'POST', json: { pkg: f.storePkg } }).then((r) => toast(r.message), (e) => toast(e.message, false));
    };
    t.onclick = open;
    t.onkeydown = (e) => { if (e.key === 'Enter') open(); };
  });
  const move = (i, d) => { const f = getFavs(); const j = i + d; if (j < 0 || j >= f.length) return; [f[i], f[j]] = [f[j], f[i]]; setFavs(f); drawApps(); };
  $$('[data-left]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); move(+b.dataset.left, -1); });
  $$('[data-right]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); move(+b.dataset.right, 1); });
  $$('[data-rm]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); const f = getFavs(); f.splice(+b.dataset.rm, 1); setFavs(f); drawApps(); });
  $$('[data-open]').forEach((b) => b.onclick = () => { const a = S.apps.find((x) => x.pkg === b.dataset.open); launchApp(b.dataset.open, a && a.label); });
  $$('[data-fav]').forEach((b) => b.onclick = () => {
    const pkg = b.dataset.fav, f = getFavs();
    const dup = f.some((x) => (x.pkg === pkg) || (x.cat && (S.catalog.find((c) => c.id === x.cat) || {}).installed === pkg));
    if (dup) { toast('Já está nos favoritos'); return; }
    f.push({ pkg }); setFavs(f); toast('Adicionado aos favoritos'); drawApps();
  });
}

/* ---------------------------------------------------------------- QUEUE + PLAYER EXTRAS */
async function queueCmd(what) {
  buzz();
  try { const r = await api('/api/v2/queue/' + what, { method: 'POST' }); toast(r.message); setTimeout(refreshStatus, 600); if (S.view === 'library') drawLibrary(); return true; }
  catch (e) { toast(e.message, false); return false; }
}

async function queueAdd(src, title, mode = 'end') {
  try { const r = await api('/api/v2/queue/add', { method: 'POST', json: { src, title, mode } }); toast(r.message); if (mode === 'now') setTimeout(refreshStatus, 600); return true; }
  catch (e) { toast(e.message, false); return false; }
}

async function toggleTracks() {
  const box = $('#tracksBox');
  if (!box) return;
  if (!box.hidden) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = '<div class="sub">Carregando faixas…</div>';
  try {
    const t = await api('/api/v2/player/tracks');
    const opt = (list, none) => (none ? `<option value="-1:-1">Sem legenda</option>` : '') + list.map((x) => `<option value="${x.group}:${x.track}" ${x.selected ? 'selected' : ''} ${x.supported === false ? 'disabled' : ''}>${esc(x.label)}${x.supported === false ? ' (sem suporte)' : ''}</option>`).join('');
    const anyText = t.text.some((x) => x.selected);
    box.innerHTML = `
      <label>Áudio<select class="field" id="trAudio">${opt(t.audio) || '<option>Única faixa</option>'}</select></label>
      <label>Legenda<select class="field" id="trText">${t.text.length ? opt(t.text, true) : '<option>Sem legendas no arquivo</option>'}</select></label>
      <label>Velocidade<select class="field" id="trSpeed">${[0.5, 0.75, 1, 1.25, 1.5, 2].map((v) => `<option value="${v}" ${Math.abs(t.speed - v) < 0.01 ? 'selected' : ''}>${v}x</option>`).join('')}</select></label>`;
    if (!anyText && t.text.length) $('#trText').value = '-1:-1';
    const pick = (type, sel) => { const [g, k] = sel.value.split(':').map(Number); api('/api/v2/player/track', { method: 'POST', json: { type, group: g, track: k } }).then((r) => toast(r.message), (e) => toast(e.message, false)); };
    $('#trAudio').onchange = (e) => pick('audio', e.target);
    if (t.text.length) $('#trText').onchange = (e) => pick('text', e.target);
    $('#trSpeed').onchange = (e) => api('/api/v2/player/speed', { method: 'POST', json: { speed: +e.target.value } }).then((r) => toast(r.message), (er) => toast(er.message, false));
  } catch (e) { box.innerHTML = `<div class="sub">${esc(e.message)}</div>`; }
}

/* ---------------------------------------------------------------- TIMER */
let timerTick = 0;
async function setTimer(minutes, action) {
  try { const r = await api('/api/v2/timer', { method: 'POST', json: { minutes, action } }); toast(r.message); drawTimer(r); return true; }
  catch (e) { toast(e.message, false); return false; }
}
async function cancelTimer() {
  try { const r = await api('/api/v2/timer/cancel', { method: 'POST' }); toast(r.message); drawTimer(r); return true; }
  catch (e) { toast(e.message, false); return false; }
}

/** Timer card: countdown when active, quick choices otherwise. */
async function drawTimer(state) {
  const box = $('#timerCard');
  if (!box) return;
  if (!state) { try { state = await api('/api/v2/timer'); } catch (e) { return; } }
  clearInterval(timerTick);
  const powerOk = has('power');
  const labels = { pause: 'pausar', mute: 'silenciar', stop: 'encerrar a reprodução', power: 'desligar a TV' };
  if (state.active) {
    const end = Date.now() + state.remainingMs;
    box.innerHTML = `<h2>Temporizador</h2><div class="timer-big" id="tLeft"></div><p class="sub" style="text-align:center">para ${esc(labels[state.action] || state.action)}</p>
      <button class="btn danger" style="width:100%" id="tCancel">Cancelar</button>`;
    const upd = () => { const ms = Math.max(0, end - Date.now()); const el = $('#tLeft'); if (!el) { clearInterval(timerTick); return; } el.textContent = fmtTime(ms); if (!ms) { clearInterval(timerTick); setTimeout(() => drawTimer(), 1500); } };
    upd(); timerTick = setInterval(upd, 1000);
    $('#tCancel').onclick = cancelTimer;
    return;
  }
  const sel = store.get('timerAction', 'pause');
  box.innerHTML = `<h2>Temporizador</h2><p class="sub">Roda na TV: funciona mesmo com o celular desligado.</p>
    <label class="sub" style="display:block">Ao terminar:</label>
    <select class="field" id="tAction"><option value="pause">Pausar</option><option value="mute">Silenciar</option><option value="stop">Encerrar a reprodução</option>
      <option value="power" ${powerOk ? '' : 'disabled'}>Desligar a TV${powerOk ? '' : ' (pareie o controle)'}</option></select>
    <div class="choice">${[15, 30, 45, 60].map((m) => `<button data-min="${m}">${m < 60 ? m + ' min' : '1 h'}</button>`).join('')}</div>
    <div class="row"><input class="field grow" id="tCustom" type="number" min="1" max="720" inputmode="numeric" placeholder="Minutos"><button class="btn" id="tGo">Iniciar</button></div>`;
  $('#tAction').value = sel === 'power' && !powerOk ? 'pause' : sel;
  $('#tAction').onchange = (e) => store.set('timerAction', e.target.value);
  $$('[data-min]', box).forEach((b) => b.onclick = () => setTimer(+b.dataset.min, $('#tAction').value));
  $('#tGo').onclick = () => { const m = +$('#tCustom').value; if (m > 0) setTimer(m, $('#tAction').value); else toast('Digite os minutos', false); };
}

/* ---------------------------------------------------------------- LIBRARY */
function renderLibrary() {
  const main = $('#main');
  main.innerHTML = header('Biblioteca') + `
    <div class="card"><div class="row"><h2 class="grow" style="margin:0">Fila de reprodução</h2>
      <select class="field" id="qRepeat" style="max-width:150px;min-height:40px" aria-label="Repetição"><option value="off">Sem repetir</option><option value="all">Repetir fila</option><option value="one">Repetir item</option></select></div>
      <p class="sub" style="margin-top:6px">Toca na TV em sequência, mesmo com o celular em outra tela. Arraste ⋮⋮ para reordenar.</p>
      <div class="list" id="qList"><div class="empty">Carregando…</div></div>
      <div class="row" style="margin-top:10px"><button class="btn small" data-qc="prev">${icon('prev')}Anterior</button><button class="btn small primary" data-qc="next">${icon('next')}Próximo</button>
        <button class="btn small" id="qSave">Salvar como playlist</button><button class="btn small danger" id="qClear">Limpar</button></div></div>
    <div class="card"><h2>Playlists</h2><div class="list" id="plList"><div class="empty">Carregando…</div></div></div>
    <div class="card"><div class="row"><h2 class="grow" style="margin:0">Histórico</h2>
      <label class="slider-row" style="margin:0;flex:none"><input type="checkbox" id="hOn" style="width:20px;height:20px"> Ativado</label></div>
      <p class="sub" style="margin-top:6px">Guardado só na TV. "Continuar" retoma de onde parou no player do TV Drop.</p>
      <div class="list" id="hList"><div class="empty">Carregando…</div></div>
      <div class="row" style="margin-top:10px"><button class="btn small danger" id="hClear">Limpar histórico</button></div></div>
    <div class="card"><h2>Arquivos recebidos</h2><p class="sub">Fotos, vídeos, músicas, documentos e APKs enviados para a TV.</p><button class="btn" data-go="cast">${icon('file')}Ver arquivos recebidos</button></div>`;
  renderConn();
  $$('[data-go]', main).forEach((b) => b.onclick = () => go(b.dataset.go));
  $$('[data-qc]', main).forEach((b) => b.onclick = () => queueCmd(b.dataset.qc));
  $('#qRepeat').onchange = (e) => api('/api/v2/queue/repeat', { method: 'POST', json: { mode: e.target.value } }).then((r) => toast(r.message), (er) => toast(er.message, false));
  $('#qClear').onclick = () => { if (confirm('Limpar a fila?')) api('/api/v2/queue/clear', { method: 'POST' }).then(drawLibrary, (e) => toast(e.message, false)); };
  $('#qSave').onclick = () => { const n = prompt('Nome da playlist:'); if (n) api('/api/v2/playlists/save', { method: 'POST', json: { name: n } }).then((r) => { toast(r.message); drawLibrary(); }, (e) => toast(e.message, false)); };
  $('#hClear').onclick = () => { if (confirm('Apagar todo o histórico?')) api('/api/v2/history/clear', { method: 'POST' }).then(drawLibrary, (e) => toast(e.message, false)); };
  $('#hOn').onchange = (e) => api('/api/v2/history/enabled', { method: 'POST', json: { enabled: e.target.checked } }).then(drawLibrary, (er) => toast(er.message, false));
  drawLibrary();
}

async function drawLibrary() {
  if (S.view !== 'library') return;
  try {
    const [q, pl, h] = await Promise.all([api('/api/v2/queue'), api('/api/v2/playlists'), api('/api/v2/history')]);
    $('#qRepeat').value = q.repeat;
    const ql = $('#qList');
    ql.innerHTML = q.items.length ? q.items.map((it, i) => `<div class="qrow ${i === q.current ? 'cur' : ''}" data-i="${i}">
        <div class="handle" aria-label="Arrastar para reordenar">${icon('drag')}</div>
        <div class="t"><b>${i === q.current ? '▶ ' : ''}${esc(it.title)}</b><small>${esc(it.src.startsWith('inbox:') ? 'Arquivo na TV' : (it.src.match(/^https?:\/\/(\d+\.\d+\.\d+\.\d+):\d+\/s\//) ? 'Do celular' : 'Link'))}</small></div>
        <button class="btn small primary" data-qp="${i}" aria-label="Tocar">${icon('play')}</button>
        <button class="btn small danger" data-qr="${i}" aria-label="Remover">${icon('x')}</button></div>`).join('')
      : '<div class="empty">A fila está vazia. Adicione itens em Transmitir (botão “+ Fila”).</div>';
    $$('[data-qp]', ql).forEach((b) => b.onclick = () => api('/api/v2/queue/play', { method: 'POST', json: { index: +b.dataset.qp } }).then((r) => { toast(r.message); drawLibrary(); setTimeout(refreshStatus, 600); }, (e) => toast(e.message, false)));
    $$('[data-qr]', ql).forEach((b) => b.onclick = () => api('/api/v2/queue/remove', { method: 'POST', json: { index: +b.dataset.qr } }).then(drawLibrary, (e) => toast(e.message, false)));
    setupDrag(ql);

    const pll = $('#plList');
    pll.innerHTML = pl.playlists.length ? pl.playlists.map((p) => `<div class="item"><div class="fileicon">${icon('queue')}</div>
        <div class="t"><b>${esc(p.name)}</b><small>${p.count} ${p.count === 1 ? 'item' : 'itens'}</small></div>
        <button class="btn small primary" data-pplay="${esc(p.name)}">Tocar</button><button class="btn small" data-pload="${esc(p.name)}">Para a fila</button>
        <button class="btn small danger" data-pdel="${esc(p.name)}" aria-label="Apagar">${icon('trash')}</button></div>`).join('')
      : '<div class="empty">Nenhuma playlist. Monte uma fila e toque em “Salvar como playlist”.</div>';
    $$('[data-pplay]', pll).forEach((b) => b.onclick = () => api('/api/v2/playlists/load', { method: 'POST', json: { name: b.dataset.pplay, play: true } }).then((r) => { toast('Tocando a playlist'); drawLibrary(); }, (e) => toast(e.message, false)));
    $$('[data-pload]', pll).forEach((b) => b.onclick = () => api('/api/v2/playlists/load', { method: 'POST', json: { name: b.dataset.pload } }).then((r) => { toast(r.message); drawLibrary(); }, (e) => toast(e.message, false)));
    $$('[data-pdel]', pll).forEach((b) => b.onclick = () => { if (confirm('Apagar a playlist ' + b.dataset.pdel + '?')) api('/api/v2/playlists/delete', { method: 'POST', json: { name: b.dataset.pdel } }).then(drawLibrary, (e) => toast(e.message, false)); });

    $('#hOn').checked = h.enabled;
    const hl = $('#hList');
    hl.innerHTML = !h.enabled ? '<div class="empty">Histórico desativado.</div>' : h.items.length ? h.items.map((e, i) => `<div class="item">
        <button class="star ${e.favorite ? 'on' : ''}" data-hfav="${i}" aria-label="Favoritar">${icon('star')}</button>
        <div class="t"><b>${esc(e.title)}</b><small>${fmtDate(e.time)}${e.duration ? ' · ' + fmtTime(e.position) + ' de ' + fmtTime(e.duration) : ''}</small></div>
        ${e.resume ? `<button class="btn small primary" data-hres="${i}">Continuar</button>` : ''}
        <button class="btn small" data-hplay="${i}">${e.resume ? 'Do início' : 'Tocar'}</button>
        <button class="btn small" data-hq="${i}" aria-label="Adicionar à fila">+ Fila</button></div>`).join('')
      : '<div class="empty">Nada assistido ainda.</div>';
    const item = (b, k) => h.items[+b.dataset[k]];
    $$('[data-hres]', hl).forEach((b) => b.onclick = () => api('/api/v2/history/play', { method: 'POST', json: { src: item(b, 'hres').src, resume: true } }).then((r) => { toast(r.message); setTimeout(refreshStatus, 600); }, (e) => toast(e.message, false)));
    $$('[data-hplay]', hl).forEach((b) => b.onclick = () => api('/api/v2/history/play', { method: 'POST', json: { src: item(b, 'hplay').src } }).then((r) => { toast(r.message); setTimeout(refreshStatus, 600); }, (e) => toast(e.message, false)));
    $$('[data-hq]', hl).forEach((b) => b.onclick = () => { const e = item(b, 'hq'); queueAdd(e.src, e.title); });
    $$('[data-hfav]', hl).forEach((b) => b.onclick = () => api('/api/v2/history/favorite', { method: 'POST', json: { src: item(b, 'hfav').src } }).then(drawLibrary, (e) => toast(e.message, false)));
  } catch (e) { toast(e.message, false); }
}

/** Drag & drop by the handle (touch and mouse), then one "move" call. */
function setupDrag(list) {
  $$('.handle', list).forEach((h) => {
    h.onpointerdown = (e) => {
      const row = h.closest('.qrow');
      const rows = $$('.qrow', list);
      const from = rows.indexOf(row);
      const startY = e.clientY;
      const heights = rows.map((r) => r.getBoundingClientRect());
      let to = from;
      h.setPointerCapture(e.pointerId);
      row.classList.add('dragging');
      h.onpointermove = (ev) => {
        const dy = ev.clientY - startY;
        row.style.transform = `translateY(${dy}px)`;
        const y = heights[from].top + heights[from].height / 2 + dy;
        to = rows.length - 1;
        for (let i = 0; i < rows.length; i++) if (y < heights[i].top + heights[i].height / 2) { to = i; break; }
        rows.forEach((r, i) => { if (r === row) return; let shift = 0; if (from < to && i > from && i <= to) shift = -heights[from].height; if (from > to && i < from && i >= to) shift = heights[from].height; r.style.transform = shift ? `translateY(${shift}px)` : ''; });
      };
      h.onpointerup = h.onpointercancel = () => {
        h.onpointermove = h.onpointerup = h.onpointercancel = null;
        rows.forEach((r) => { r.style.transform = ''; });
        row.classList.remove('dragging');
        if (to !== from) api('/api/v2/queue/move', { method: 'POST', json: { from, to } }).then(drawLibrary, (er) => toast(er.message, false));
      };
    };
  });
}

/* ---------------------------------------------------------------- SHORTCUTS ("Meus Atalhos") */
const STEP_TYPES = { app: 'Abrir app', key: 'Tecla', volume: 'Volume', text: 'Digitar texto', wait: 'Esperar', timer: 'Temporizador', link: 'Abrir link' };
const DEFAULT_SHORTCUTS = [
  { name: 'Modo filme', steps: [{ type: 'app', value: 'netflix' }, { type: 'volume', dir: 'up', value: 2 }] },
  { name: 'Modo música', steps: [{ type: 'app', value: 'youtube' }, { type: 'volume', dir: 'up', value: 3 }] },
  { name: 'Modo descanso', steps: [{ type: 'key', value: 'pause' }, { type: 'timer', value: 30, action: 'stop' }] },
];
const getShortcuts = () => store.get('shortcuts', DEFAULT_SHORTCUTS);
const setShortcuts = (v) => store.set('shortcuts', v);

function appByRef(ref) {
  const c = S.catalog.find((x) => x.id === ref);
  if (c) return c.installed ? { pkg: c.installed, name: c.name } : { missing: c.name };
  const a = S.apps.find((x) => x.pkg === ref);
  return a ? { pkg: a.pkg, name: a.label } : { missing: ref };
}

function stepLabel(st) {
  switch (st.type) {
    case 'app': { const a = appByRef(st.value); return 'Abrir ' + (a.name || a.missing); }
    case 'key': return 'Tecla ' + st.value;
    case 'volume': return 'Volume ' + (st.dir === 'down' ? '−' : '+') + st.value;
    case 'text': return 'Digitar “' + st.value + '”';
    case 'wait': return 'Esperar ' + st.value + ' s';
    case 'timer': return 'Temporizador ' + st.value + ' min (' + ({ pause: 'pausar', mute: 'silenciar', stop: 'encerrar', power: 'desligar' }[st.action] || st.action) + ')';
    case 'link': return 'Abrir ' + st.value;
    default: return st.type;
  }
}

/** Problems that would stop a shortcut, checked before running anything. */
function shortcutProblems(sc) {
  const out = [];
  for (const st of sc.steps) {
    if (st.type === 'app') { const a = appByRef(st.value); if (a.missing) out.push(a.missing + ' não está instalado'); }
    if (st.type === 'key' && !has(st.value)) out.push('a tecla ' + st.value + ' não está disponível');
    if (st.type === 'text' && S.caps && S.caps.remote && !S.caps.remote.text) out.push('digitar não está disponível');
    if (st.type === 'timer' && st.action === 'power' && !has('power')) out.push('desligar exige o controle pareado');
  }
  return out;
}

async function runShortcut(sc) {
  const problems = shortcutProblems(sc);
  if (problems.length && !confirm('O atalho "' + sc.name + '" tem passos que não vão funcionar:\n• ' + problems.join('\n• ') + '\n\nExecutar os outros passos mesmo assim?')) return false;
  toast('Executando ' + sc.name);
  for (const st of sc.steps) {
    try {
      if (st.type === 'app') { const a = appByRef(st.value); if (a.pkg) { await api('/api/v2/apps/launch', { method: 'POST', json: { pkg: a.pkg } }); await sleep(2500); } }
      else if (st.type === 'key') { if (has(st.value)) await sendKey(st.value); }
      else if (st.type === 'volume') for (let i = 0; i < +st.value; i++) { await api('/api/v2/volume', { method: 'POST', json: { action: st.dir === 'down' ? 'down' : 'up' } }); await sleep(120); }
      else if (st.type === 'text') await sendText(st.value);
      else if (st.type === 'wait') await sleep(Math.min(60, +st.value) * 1000);
      else if (st.type === 'timer') await api('/api/v2/timer', { method: 'POST', json: { minutes: +st.value, action: st.action || 'pause' } });
      else if (st.type === 'link') await api('/api/v2/remote/link', { method: 'POST', json: { link: st.value } });
    } catch (e) { toast(sc.name + ': ' + e.message, false); return false; }
    await sleep(200);
  }
  toast(sc.name + ' concluído');
  return true;
}

function drawShortcuts() {
  const box = $('#scBox');
  if (!box) return;
  const list = getShortcuts();
  box.innerHTML = list.map((sc, i) => {
    const p = shortcutProblems(sc);
    return `<div class="sc"><div class="fileicon">${icon('bolt')}</div><div class="t"><b>${esc(sc.name)}</b><small>${esc(sc.steps.map(stepLabel).join(' → ') || 'Sem passos')}</small>${p.length ? `<br><span class="pill warn">${esc(p[0])}</span>` : ''}</div>
      <button class="btn small primary" data-scrun="${i}">Executar</button><button class="btn small" data-scedit="${i}" aria-label="Editar">${icon('edit')}</button></div>`;
  }).join('') + `<div class="row" style="margin-top:8px"><button class="btn small" id="scNew">${icon('plus')}Novo atalho</button></div><div id="scEditor"></div>`;
  $$('[data-scrun]', box).forEach((b) => b.onclick = () => runShortcut(getShortcuts()[+b.dataset.scrun]));
  $$('[data-scedit]', box).forEach((b) => b.onclick = () => editShortcut(+b.dataset.scedit));
  $('#scNew').onclick = () => editShortcut(-1);
}

function editShortcut(index) {
  const list = getShortcuts();
  const sc = index >= 0 ? JSON.parse(JSON.stringify(list[index])) : { name: '', steps: [] };
  const ed = $('#scEditor');
  const appOpts = () => S.catalog.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}${c.installed ? '' : ' (não instalado)'}</option>`).join('')
    + S.apps.filter((a) => !S.catalog.some((c) => c.installed === a.pkg)).map((a) => `<option value="${esc(a.pkg)}">${esc(a.label)}</option>`).join('');
  const keyOpts = Object.entries({ home: 'Início', back: 'Voltar', ok: 'OK', up: 'Cima', down: 'Baixo', left: 'Esquerda', right: 'Direita', playpause: 'Play/Pausa', play: 'Play', pause: 'Pausa', mute: 'Mudo', menu: 'Menu', settings: 'Ajustes', power: 'Liga/Desliga', search: 'Pesquisar' })
    .map(([k, l]) => `<option value="${k}">${l}${has(k) ? '' : ' (indisponível)'}</option>`).join('');
  const draw = () => {
    ed.innerHTML = `<div class="card" style="background:var(--surface-2);margin-top:12px"><h2>${index >= 0 ? 'Editar atalho' : 'Novo atalho'}</h2>
      <input class="field" id="scName" placeholder="Nome (ex.: Modo filme)" value="${esc(sc.name)}" style="margin:8px 0">
      <div class="list">${sc.steps.map((st, i) => `<div class="step"><span class="pill">${i + 1}</span><span class="grow">${esc(stepLabel(st))}</span>
        <button class="btn small" data-up="${i}" aria-label="Subir">${icon('up')}</button><button class="btn small danger" data-del="${i}" aria-label="Remover">${icon('x')}</button></div>`).join('') || '<div class="empty">Nenhum passo ainda.</div>'}</div>
      <div class="row" style="margin-top:10px"><select class="field" id="stType">${Object.entries(STEP_TYPES).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
      <div class="row" style="margin-top:8px" id="stArgs"></div>
      <div class="row" style="margin-top:8px"><button class="btn small" id="stAdd">${icon('plus')}Adicionar passo</button></div>
      <div class="row" style="margin-top:14px"><button class="btn primary" id="scSave">Salvar</button>${index >= 0 ? '<button class="btn danger" id="scDel">Excluir</button>' : ''}<button class="btn" id="scCancel">Cancelar</button></div></div>`;
    const args = () => {
      const t = $('#stType').value, a = $('#stArgs');
      a.innerHTML = t === 'app' ? `<select class="field" id="stV">${appOpts()}</select>`
        : t === 'key' ? `<select class="field" id="stV">${keyOpts}</select>`
          : t === 'volume' ? `<select class="field" id="stDir"><option value="up">Aumentar</option><option value="down">Diminuir</option></select><input class="field" id="stV" type="number" min="1" max="20" value="2">`
            : t === 'wait' ? `<input class="field" id="stV" type="number" min="1" max="60" value="3" placeholder="segundos">`
              : t === 'timer' ? `<input class="field" id="stV" type="number" min="1" max="720" value="30" placeholder="minutos"><select class="field" id="stAct"><option value="pause">Pausar</option><option value="mute">Silenciar</option><option value="stop">Encerrar</option><option value="power">Desligar</option></select>`
                : `<input class="field" id="stV" placeholder="${t === 'link' ? 'https://…' : 'texto'}">`;
    };
    $('#stType').onchange = args; args();
    $('#stAdd').onclick = () => {
      const t = $('#stType').value, v = $('#stV').value.trim();
      if (!v) { toast('Preencha o passo', false); return; }
      if (t === 'link' && !/^https?:\/\//i.test(v)) { toast('O link precisa começar com http(s)://', false); return; }
      const st = { type: t, value: ['volume', 'wait', 'timer'].includes(t) ? +v : v };
      if (t === 'volume') st.dir = $('#stDir').value;
      if (t === 'timer') st.action = $('#stAct').value;
      sc.name = $('#scName').value; sc.steps.push(st); draw();
    };
    $$('[data-del]', ed).forEach((b) => b.onclick = () => { sc.name = $('#scName').value; sc.steps.splice(+b.dataset.del, 1); draw(); });
    $$('[data-up]', ed).forEach((b) => b.onclick = () => { const i = +b.dataset.up; if (i > 0) { [sc.steps[i - 1], sc.steps[i]] = [sc.steps[i], sc.steps[i - 1]]; } sc.name = $('#scName').value; draw(); });
    $('#scSave').onclick = () => {
      sc.name = $('#scName').value.trim();
      if (!sc.name || !sc.steps.length) { toast('Dê um nome e adicione pelo menos um passo', false); return; }
      const l = getShortcuts(); if (index >= 0) l[index] = sc; else l.push(sc); setShortcuts(l); toast('Atalho salvo'); drawShortcuts();
    };
    if ($('#scDel')) $('#scDel').onclick = () => { if (confirm('Excluir o atalho?')) { const l = getShortcuts(); l.splice(index, 1); setShortcuts(l); drawShortcuts(); } };
    $('#scCancel').onclick = () => { ed.innerHTML = ''; };
  };
  draw();
  ed.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ---------------------------------------------------------------- CONTENT SEARCH (TMDB, needs the user's key) */
const PROVIDER_TO_APP = { 8: 'netflix', 1796: 'netflix', 119: 'prime', 337: 'disney', 350: 'appletv', 1899: 'max', 384: 'max', 307: 'globoplay', 300: 'pluto', 531: 'paramount', 15: 'hulu', 73: 'tubi' };

function drawSearch() {
  const box = $('#searchBox');
  if (!box) return;
  const key = store.get('tmdbKey', '');
  if (!key) {
    box.innerHTML = `<p class="sub">Para buscar filmes e séries e ver onde estão disponíveis, use uma chave gratuita do TMDB (themoviedb.org → Configurações → API). A chave fica só neste aparelho.</p>
      <div class="row"><input class="field grow" id="tmdbKey" placeholder="Chave da API (v3) ou token de leitura (v4)" autocomplete="off"><button class="btn primary" id="tmdbSave">Salvar</button></div>`;
    $('#tmdbSave').onclick = () => { const v = $('#tmdbKey').value.trim(); if (v) { store.set('tmdbKey', v); drawSearch(); } };
    return;
  }
  box.innerHTML = `<div class="row"><input class="field grow" id="sq" placeholder="Nome do filme ou série" autocomplete="off"><button class="btn primary" id="sGo">${icon('search')}</button></div>
    <div class="list" id="sRes"></div><div class="row" style="margin-top:8px"><button class="btn small" id="tmdbForget">Remover chave</button></div>
    <p class="sub" style="margin-top:8px">Disponibilidade no Brasil segundo o TMDB (dados do JustWatch). Pode não estar completa.</p>`;
  $('#tmdbForget').onclick = () => { store.del('tmdbKey'); drawSearch(); };
  const run = () => tmdbSearch($('#sq').value.trim());
  $('#sGo').onclick = run;
  $('#sq').onkeydown = (e) => { if (e.key === 'Enter') run(); };
}

async function tmdb(path, params = {}) {
  const key = store.get('tmdbKey', '');
  const u = new URL('https://api.themoviedb.org/3' + path);
  const headers = {};
  if (key.length > 60) headers.Authorization = 'Bearer ' + key; else u.searchParams.set('api_key', key);
  u.searchParams.set('language', 'pt-BR');
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u, { headers });
  if (r.status === 401) throw new Error('Chave do TMDB recusada. Confira a chave.');
  if (!r.ok) throw new Error('TMDB respondeu ' + r.status);
  return r.json();
}

async function tmdbSearch(q) {
  const box = $('#sRes');
  if (!q) return;
  box.innerHTML = '<div class="empty">Buscando…</div>';
  try {
    const data = await tmdb('/search/multi', { query: q, include_adult: 'false', region: 'BR' });
    const items = (data.results || []).filter((x) => x.media_type === 'movie' || x.media_type === 'tv').slice(0, 8);
    if (!items.length) { box.innerHTML = '<div class="empty">Nada encontrado.</div>'; return; }
    box.innerHTML = items.map((x, i) => `<div class="result"><img alt="" src="${x.poster_path ? 'https://image.tmdb.org/t/p/w154' + esc(x.poster_path) : ''}" onerror="this.style.visibility='hidden'">
      <div class="t"><b>${esc(x.title || x.name)}</b> <small class="sub">${esc((x.release_date || x.first_air_date || '').slice(0, 4))} · ${x.media_type === 'tv' ? 'Série' : 'Filme'}</small>
      <p>${esc(x.overview || 'Sem descrição.')}</p><div class="providers" id="prov${i}"><span class="sub">Verificando onde assistir…</span></div></div></div>`).join('');
    items.forEach(async (x, i) => {
      const el = $('#prov' + i);
      try {
        const p = await tmdb(`/${x.media_type}/${x.id}/watch/providers`);
        const br = (p.results || {}).BR || {};
        const offers = [...(br.flatrate || []), ...(br.free || []), ...(br.ads || [])];
        if (!offers.length) { el.innerHTML = '<span class="sub">Sem streaming confirmado no Brasil.</span>'; return; }
        const seen = new Set();
        el.innerHTML = offers.filter((o) => !seen.has(o.provider_id) && seen.add(o.provider_id)).map((o) => {
          const app = PROVIDER_TO_APP[o.provider_id] ? appByRef(PROVIDER_TO_APP[o.provider_id]) : null;
          return app && app.pkg ? `<button class="btn small primary" data-open="${esc(app.pkg)}" data-name="${esc(app.name)}">Abrir ${esc(o.provider_name)}</button>`
            : `<span class="pill">${esc(o.provider_name)}${app && app.missing ? ' (não instalado)' : ''}</span>`;
        }).join('');
        $$('[data-open]', el).forEach((b) => b.onclick = () => launchApp(b.dataset.open, b.dataset.name));
      } catch (e) { el.innerHTML = `<span class="sub">${esc(e.message)}</span>`; }
    });
  } catch (e) { box.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}

/* ---------------------------------------------------------------- DEVICES */
async function renderDevices() {
  const main = $('#main');
  await loadCaps();
  const r = S.caps ? S.caps.remote : null;
  const atv = r && r.atv ? r.atv : {};
  const acc = r && r.accessibility ? r.accessibility : {};
  main.innerHTML = header('Dispositivos') + `
    <div class="card"><h2>${esc(S.info ? S.info.name : 'TV')}</h2>
      <p class="sub">${S.online ? '<span class="pill ok">Online</span>' : '<span class="pill warn">Offline</span>'} · Android ${esc(S.info ? S.info.android : '?')} (SDK ${esc(S.info ? S.info.sdk : '?')}) · ${esc(location.host)}</p>
      <div class="row"><button class="btn" id="beep">${icon('bell')}Encontrar minha TV</button></div></div>

    <div class="card"><h2>Controle remoto da TV</h2>
      <p class="sub">Usa o serviço de controle do próprio Google TV para enviar todas as teclas, Liga/Desliga e o teclado.</p>
      <p>${atv.paired ? '<span class="pill ok">Pareado</span>' : atv.available ? '<span class="pill warn">Não pareado</span>' : '<span class="pill warn">Serviço não encontrado</span>'}
        ${atv.connected ? ' <span class="pill ok">Conectado</span>' : ''}</p>
      ${atv.lastError ? `<p class="sub">Último erro: ${esc(atv.lastError)}</p>` : ''}
      <div id="atvPair">${atv.paired ? '<button class="btn small danger" id="atvUnpair">Remover pareamento</button>'
        : '<button class="btn primary" id="atvStart">Parear controle</button>'}</div>
      <div class="msg" id="atvMsg"></div></div>

    ${NATIVE && NATIVE.atv ? `<div class="card"><h2>Controle direto pelo celular</h2>
      <p class="sub">Alternativa: o próprio app fala com o serviço de controle da TV. Use se o pareamento acima não funcionar.</p>
      <p>${nativeAtvOk() ? '<span class="pill ok">Pareado</span>' : S.nativeAtv && S.nativeAtv.available ? '<span class="pill warn">Não pareado</span>' : '<span class="pill warn">Serviço não encontrado</span>'}</p>
      <div id="natPair">${nativeAtvOk() ? '<button class="btn small danger" id="natUnpair">Remover</button>' : '<button class="btn" id="natStart">Parear pelo celular</button>'}</div>
      <div class="msg" id="natMsg"></div></div>` : ''}
    <div class="card"><h2>Touchpad (acessibilidade)</h2>
      <p class="sub">O cursor na tela da TV precisa do serviço de acessibilidade do TV Drop${acc.dpad ? '' : '. Nesta TV ele também faz Voltar e Início'}.</p>
      <p>${acc.enabled ? '<span class="pill ok">Ativado</span>' : '<span class="pill warn">Desativado</span>'}</p>
      ${acc.enabled ? '' : `<p class="sub">Ative uma vez pelo Termux / computador:</p><code class="code-box">${esc(acc.enableCommand || '')}</code>`}</div>

    <div class="card"><h2>Aparelhos autorizados</h2><div class="list" id="devList"><div class="empty">Carregando…</div></div>
      <label class="slider-row" style="margin-top:12px"><input type="checkbox" id="legacy" style="flex:none;width:20px;height:20px"> Permitir apps antigos (TV Drop 1.0) sem pareamento</label></div>

    <div class="card"><h2>Diagnóstico de conexão</h2><p class="sub">Mede a rede entre este aparelho e a TV (não é a velocidade da internet).</p>
      <div class="diag" id="diag"><div><small>Latência</small><b id="dLat">—</b></div><div><small>Download (TV → aqui)</small><b id="dDown">—</b></div>
        <div><small>Upload (aqui → TV)</small><b id="dUp">—</b></div><div><small>Rotas da API</small><b id="dApi">—</b></div></div>
      <button class="btn" id="diagBtn">${icon('pulse')}Testar conexão</button><div class="msg" id="diagMsg"></div></div>

    <div class="card"><h2>Este aparelho</h2><p class="sub">${esc(deviceName())}${STANDALONE ? ' · conectado a ' + esc(BASE.replace('http://', '')) : ''}</p>
      <div class="row">${STANDALONE ? '<button class="btn small" id="switchTv">Trocar de TV</button>' : ''}<button class="btn small" id="classic">Página clássica</button><button class="btn small danger" id="logout">Desconectar este aparelho</button></div></div>`;
  renderConn();
  $('#beep').onclick = findTv;
  if ($('#atvStart')) $('#atvStart').onclick = atvPairStart;
  if ($('#atvUnpair')) $('#atvUnpair').onclick = async () => { if (!confirm('Remover o pareamento do controle?')) return; try { await api('/api/v2/remote/unpair', { method: 'POST' }); await renderDevices(); } catch (e) { toast(e.message, false); } };
  $('#diagBtn').onclick = runDiagnostics;
  if ($('#natStart')) $('#natStart').onclick = async () => {
    const msg = $('#natMsg');
    msg.textContent = 'Pedindo o código à TV…'; msg.className = 'msg';
    const r = await nativeAtv('pairStart');
    if (!r.ok) { msg.textContent = r.message; msg.className = 'msg err'; return; }
    $('#natPair').innerHTML = `<p class="sub">Digite o código que apareceu na TV:</p><div class="row"><input class="field grow mono" id="natCode" maxlength="6" autocapitalize="characters" style="text-transform:uppercase;font-size:20px;letter-spacing:.2em"><button class="btn primary" id="natFinish">Confirmar</button></div>`;
    msg.textContent = '';
    $('#natFinish').onclick = async () => {
      const f = await nativeAtv('pairFinish', $('#natCode').value.trim());
      if (!f.ok) { msg.textContent = f.message; msg.className = 'msg err'; return; }
      toast('Controle pareado pelo celular!'); await loadNativeAtv(); renderDevices();
    };
  };
  if ($('#natUnpair')) $('#natUnpair').onclick = async () => { await nativeAtv('unpair'); await loadNativeAtv(); renderDevices(); };
  $('#classic').onclick = () => { location.href = u('/classic.html'); };
  if ($('#switchTv')) $('#switchTv').onclick = showConnect;
  $('#logout').onclick = async () => {
    if (!confirm('Desconectar este aparelho da TV? Você vai precisar do código de novo.')) return;
    try { const s = await api('/api/v2/session'); if (s.device) await api('/api/v2/devices/revoke', { method: 'POST', json: { id: s.device.id } }); } catch (e) { /* ignore */ }
    showPairing('Desconectado.');
  };
  loadDevices();
}

async function loadDevices() {
  const box = $('#devList');
  try {
    const r = await api('/api/v2/devices');
    $('#legacy').checked = r.legacyOpen;
    $('#legacy').onchange = (e) => api('/api/v2/settings', { method: 'POST', json: { legacyOpen: e.target.checked } }).then(() => toast('Ajuste salvo'), (er) => toast(er.message, false));
    box.innerHTML = r.devices.map((d) => `<div class="item"><div class="fileicon">${icon('phone')}</div>
      <div class="t"><b>${esc(d.name)}${d.current ? ' <span class="pill ok">este</span>' : ''}</b><small>Último acesso: ${fmtDate(d.lastSeen)}</small></div>
      <button class="btn small" data-rename="${esc(d.id)}" aria-label="Renomear">${icon('edit')}</button>
      ${d.current ? '' : `<button class="btn small danger" data-revoke="${esc(d.id)}" aria-label="Remover">${icon('trash')}</button>`}</div>`).join('') || '<div class="empty">Nenhum aparelho.</div>';
    $$('[data-rename]', box).forEach((b) => b.onclick = () => { const n = prompt('Novo nome (ex.: Celular da sala):'); if (n) api('/api/v2/devices/rename', { method: 'POST', json: { id: b.dataset.rename, name: n } }).then(loadDevices, (e) => toast(e.message, false)); });
    $$('[data-revoke]', box).forEach((b) => b.onclick = () => { if (confirm('Remover este aparelho? Ele não poderá mais controlar a TV.')) api('/api/v2/devices/revoke', { method: 'POST', json: { id: b.dataset.revoke } }).then(loadDevices, (e) => toast(e.message, false)); });
  } catch (e) { box.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}

async function atvPairStart() {
  const msg = $('#atvMsg');
  msg.textContent = 'Pedindo o código à TV…'; msg.className = 'msg';
  try {
    await api('/api/v2/remote/pair/start', { method: 'POST', timeout: 20000 });
    $('#atvPair').innerHTML = `<p class="sub">Digite o código de 6 caracteres que apareceu na tela da TV:</p>
      <div class="row"><input class="field grow mono" id="atvCode" maxlength="6" autocapitalize="characters" placeholder="A1B2C3" style="text-transform:uppercase;font-size:20px;letter-spacing:.2em">
      <button class="btn primary" id="atvFinish">Confirmar</button></div>`;
    msg.textContent = '';
    $('#atvCode').focus();
    $('#atvFinish').onclick = async () => {
      try {
        await api('/api/v2/remote/pair/finish', { method: 'POST', json: { code: $('#atvCode').value.trim() }, timeout: 20000 });
        toast('Controle pareado!');
        await loadCaps(); renderDevices();
      } catch (e) { msg.textContent = e.message; msg.className = 'msg err'; }
    };
  } catch (e) { msg.textContent = e.message; msg.className = 'msg err'; }
}

async function runDiagnostics() {
  const msg = $('#diagMsg');
  msg.textContent = 'Testando…'; msg.className = 'msg';
  try {
    const lat = [];
    for (let i = 0; i < 5; i++) { const t = performance.now(); await api('/api/v2/ping'); lat.push(performance.now() - t); }
    lat.sort((a, b) => a - b);
    $('#dLat').textContent = Math.round(lat[2]) + ' ms';
    const n = 4000000;
    let t = performance.now();
    const r = await fetch(u('/api/v2/speed?bytes=' + n), { headers: { 'X-TVDrop-Token': S.token }, cache: 'no-store' });
    await r.arrayBuffer();
    $('#dDown').textContent = ((n * 8) / ((performance.now() - t) / 1000) / 1e6).toFixed(1) + ' Mb/s';
    const up = new Uint8Array(2000000);
    t = performance.now();
    await api('/api/v2/speed', { method: 'POST', body: up, timeout: 30000 });
    $('#dUp').textContent = ((up.length * 8) / ((performance.now() - t) / 1000) / 1e6).toFixed(1) + ' Mb/s';
    const routes = ['/api/v2/info', '/api/v2/capabilities', '/api/status', '/api/v2/apps'];
    let ok = 0;
    for (const p of routes) { try { await api(p); ok++; } catch (e) { /* counted */ } }
    $('#dApi').textContent = ok + '/' + routes.length;
    const quality = lat[2] < 30 ? 'ótima' : lat[2] < 80 ? 'boa' : 'instável';
    msg.textContent = 'Conexão ' + quality + '.'; msg.className = 'msg ok';
  } catch (e) { msg.textContent = e.message; msg.className = 'msg err'; }
}

/* ---------------------------------------------------------------- boot */
async function start() {
  $('#appView').hidden = false;
  fillIcons();
  try { S.info = await api('/api/v2/info'); } catch (e) { /* offline banner */ }
  await loadCaps();
  await loadNativeAtv();
  loadApps();
  go(store.get('view', 'home'));
  refreshStatus();
}

/* ---------------------------------------------------------------- CONNECT (standalone only) */
function showConnect(message) {
  wsClose();
  $('#appView').hidden = true;
  $('#pairView').hidden = true;
  $('#connectView').hidden = false;
  const msg = $('#connectMsg');
  msg.textContent = message || '';
  msg.className = 'msg' + (message ? ' err' : '');
  const last = store.get('base', '');
  if (last && !$('#tvAddr').value) $('#tvAddr').value = last.replace('http://', '');
  if (location.protocol === 'https:') $('#connectNote').textContent = 'Esta página está em https, e o navegador não deixa uma página https falar com a TV (http). Ao conectar, você vai para a página da própria TV.';
  setTimeout(() => $('#tvAddr').focus(), 50);
}

async function doConnect(input) {
  const hp = parseTvAddress(input);
  const msg = $('#connectMsg');
  if (!hp) { msg.textContent = 'Digite o código de 8 letras da TV (ex.: 1G58-28FG) ou o endereço (ex.: 192.168.18.31).'; msg.className = 'msg err'; return; }
  if (location.protocol === 'https:') { location.href = 'http://' + hp + '/'; return; }
  msg.textContent = 'Procurando a TV em ' + hp + '…'; msg.className = 'msg';
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch('http://' + hp + '/api/v2/info', { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(timer);
    const info = await r.json();
    if (info.app !== 'tvdrop') throw new Error('não é o TV Drop');
    const newBase = 'http://' + hp;
    if (newBase !== BASE) saveToken('');
    BASE = newBase;
    store.set('base', BASE);
    $('#connectView').hidden = true;
    if (S.token) start(); else showPairing();
  } catch (e) {
    msg.textContent = 'Não encontrei o TV Drop em ' + hp + '. Confira se a TV está ligada, com o TV Drop aberto, e no mesmo Wi-Fi.';
    msg.className = 'msg err';
  }
}

function boot() {
  fillIcons();
  $('#connectForm').onsubmit = (e) => { e.preventDefault(); doConnect($('#tvAddr').value); };
  if ($('#pairSwitch')) $('#pairSwitch').onclick = (e) => { e.preventDefault(); showConnect(); };
  if (STANDALONE) $('#pairSwitch').hidden = false;
  $$('.nav button').forEach((b) => b.onclick = () => go(b.dataset.view));
  $('#pairForm').onsubmit = (e) => { e.preventDefault(); doPair($('#pinInput').value); };
  // Token handed over by the Android app: #token=...
  const hash = new URLSearchParams(location.hash.slice(1));
  if (hash.get('token')) { saveToken(hash.get('token')); history.replaceState(null, '', location.pathname); }
  // QR code from the TV: /?pair=123456
  const pin = new URLSearchParams(location.search).get('pair');
  if (pin) { history.replaceState(null, '', location.pathname); if (!S.token) { $('#pairView').hidden = false; $('#pinInput').value = pin; doPair(pin); return; } }
  if (STANDALONE && !BASE) { showConnect(); return; }
  if (!S.token) { showPairing(); return; }
  start();
}

setInterval(refreshStatus, 2000);
setInterval(() => { if (!document.hidden && S.token && (S.view === 'remote' || S.view === 'home')) loadCaps().then(() => { if (S.view === 'remote') drawRemoteStatus(); }); }, 15000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshStatus(); });
boot();
