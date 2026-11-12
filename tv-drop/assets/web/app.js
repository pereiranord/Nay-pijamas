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
    r = await fetch(path, { method, headers, body, signal: ctrl.signal, cache: 'no-store' });
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
const VIEWS = { home: renderHome, cast: renderCast, remote: renderRemote, apps: renderApps, devices: renderDevices };

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

const has = (key) => !!(S.caps && S.caps.remote && (S.caps.remote.keys || []).includes(key));

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
  const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/v2/ws?token=' + encodeURIComponent(S.token));
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
  const viaWs = wsSend({ t: 'key', k: key }, true);
  if (viaWs) { const r = await viaWs; if (!r.ok) toast(r.message || 'A TV recusou o comando', false); return r.ok; }
  try { await api('/api/v2/remote/key', { method: 'POST', json: { key } }); return true; } catch (e) { toast(e.message, false); return false; }
}

async function sendText(text, opts = {}) {
  try { await api('/api/v2/remote/text', { method: 'POST', json: { text, replace: !!opts.replace, submit: !!opts.submit } }); return true; } catch (e) { toast(e.message, false); return false; }
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
    <div class="card"><h2>${esc(S.info ? S.info.name : 'TV')}</h2>
      <p class="sub">Android ${esc(S.info ? S.info.android : '?')} · TV Drop ${esc(S.info ? S.info.version : '')}</p>
      <div class="row"><button class="btn" data-go="devices">${icon('tv')}Dispositivo e diagnóstico</button></div>
    </div>`;
  renderConn();
  $$('[data-go]', main).forEach((b) => b.onclick = () => go(b.dataset.go));
  $('#findTv').onclick = findTv;
  updateNowPlaying();
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
        <button class="key" data-ctl="back" aria-label="Voltar 10 segundos">${icon('rew')}</button>
        <button class="key" data-ctl="toggle" id="npToggle" aria-label="Pausar ou continuar">${icon('pause')}</button>
        <button class="key" data-ctl="fwd" aria-label="Avançar 30 segundos">${icon('ff')}</button>
        <button class="key" data-ctl="stop" aria-label="Parar">${icon('stop')}</button>
      </div>
      <div class="transport">
        <button class="key" data-vol="down" aria-label="Diminuir volume">${icon('voldown')}</button>
        <button class="key" data-vol="mute" aria-label="Silenciar">${icon('mute')}</button>
        <button class="key" data-vol="up" aria-label="Aumentar volume">${icon('volup')}</button>
      </div>
      <div class="row" style="margin-top:12px"><button class="btn small" id="npExt"></button></div>`;
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
      <button class="btn primary" style="width:100%" id="nativeCast">${icon('phone')}Escolher vídeo do celular</button></div>` : ''}
    <div class="card"><h2>Enviar para a TV</h2><p class="sub">Link de vídeo (.mp4, .m3u8), YouTube ou qualquer página.</p>
      <div class="row"><input class="field grow" id="linkIn" type="url" inputmode="url" placeholder="https://…" autocomplete="off"><button class="btn primary" id="linkBtn">${icon('link')}Enviar</button></div>
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
  if (NATIVE) $('#nativeCast').onclick = () => NATIVE.pickAndCast();
  $('#linkBtn').onclick = sendLink;
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
  xhr.open('POST', '/api/upload?name=' + encodeURIComponent(next.name) + (auto ? '&auto=1' : ''));
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
      ${f.kind === 'video' || f.kind === 'audio' ? `<button class="btn small primary" data-play="${esc(f.name)}">Tocar</button>` : ''}
      ${f.kind === 'apk' ? `<button class="btn small primary" data-install="${esc(f.name)}">Instalar</button>` : ''}
      <button class="btn small danger" data-del="${esc(f.name)}" aria-label="Apagar ${esc(f.name)}">${icon('trash')}</button></div>`).join('')
    : '<div class="empty">Nenhum arquivo nesta categoria.</div>';
  $$('[data-play]', box).forEach((b) => b.onclick = () => api('/api/play?file=' + encodeURIComponent(b.dataset.play), { method: 'POST' }).then(() => { toast('Tocando na TV'); setTimeout(refreshStatus, 600); }, (e) => toast(e.message, false)));
  $$('[data-install]', box).forEach((b) => b.onclick = () => api('/api/install?file=' + encodeURIComponent(b.dataset.install), { method: 'POST' }).then((r) => toast(r.message), (e) => toast(e.message, false)));
  $$('[data-del]', box).forEach((b) => b.onclick = () => { if (confirm('Apagar ' + b.dataset.del + ' da TV?')) api('/api/delete?file=' + encodeURIComponent(b.dataset.del), { method: 'POST' }).then(refreshStatus, (e) => toast(e.message, false)); });
  $('#log').textContent = (S.status.log || []).join('\n') || 'Nada ainda.';
}

/* ---------------------------------------------------------------- REMOTE */
function renderRemote() {
  const main = $('#main');
  const caps = S.caps && S.caps.remote;
  const atvPaired = caps && caps.atv && caps.atv.paired;
  const k = (name, ico, label, extra = '') => `<div class="key-wrap"><button class="key ${extra}" data-key="${name}" aria-label="${label}" ${S.caps && !has(name) ? 'disabled' : ''}>${icon(ico)}</button><div class="key-label">${label}</div></div>`;
  main.innerHTML = header('Controle') + `
    ${caps && !atvPaired ? `<div class="notice">${icon('info')}<div>Teclas desativadas precisam do pareamento do controle. <button class="btn small" data-go="devices" style="margin-top:8px">Parear controle</button></div></div>` : ''}
    <div class="seg" role="group" aria-label="Modo do controle">
      <button data-mode="dpad" aria-pressed="${S.remoteMode === 'dpad'}">Direcional</button>
      <button data-mode="swipe" aria-pressed="${S.remoteMode === 'swipe'}">Deslizante</button>
      <button data-mode="pad" aria-pressed="${S.remoteMode === 'pad'}">Touchpad</button>
    </div>
    <div class="remote">
      <div class="key-row">${k('power', 'power', 'Ligar', 'power')}${k('settings', 'settings', 'Ajustes')}${k('menu', 'menu', 'Menu')}</div>
      <div id="surface"></div>
      <div class="key-row">${k('back', 'back', 'Voltar')}${k('home', 'home', 'Início')}
        <div class="key-wrap"><button class="key" id="kbdBtn" aria-label="Teclado" ${S.caps && caps && !caps.text ? 'disabled' : ''}>${icon('keyboard')}</button><div class="key-label">Teclado</div></div>
        <div class="key-wrap"><button class="key" id="micBtn" aria-label="Voz">${icon('mic')}</button><div class="key-label">Voz</div></div></div>
      <div class="key-row">${k('rew', 'rew', 'Voltar')}${k('playpause', 'playpause', 'Play/Pausa')}${k('ff', 'ff', 'Avançar')}</div>
      <div class="key-row">${k('voldown', 'voldown', 'Volume −')}${k('mute', 'mute', 'Mudo')}${k('volup', 'volup', 'Volume +')}</div>
      <div class="card kbd" id="kbd" hidden><h2>Teclado</h2><p class="sub">Selecione um campo de busca na TV e digite aqui.</p>
        <textarea id="kbdText" placeholder="Ex.: filmes de ação" autocapitalize="off"></textarea>
        <div class="row" style="margin-top:10px">
          <button class="btn primary" id="kbdSend">Enviar</button><button class="btn" id="kbdSearch">${icon('search')}Enviar e buscar</button></div>
        <div class="row" style="margin-top:10px">
          <button class="btn small" id="kbdDel">${icon('del')}Apagar</button><button class="btn small" id="kbdEnter">${icon('enter')}Enter</button><button class="btn small" id="kbdSpace">Espaço</button><button class="btn small" id="kbdClear">Limpar campo</button></div></div>
      <div class="card" id="voice" hidden><h2>Comando de voz</h2><p class="sub" id="voiceHint">Fale, por exemplo: “abrir YouTube”, “aumentar volume”, “voltar”, “pesquisar filmes de ação”.</p>
        <button class="mic" id="voiceGo" aria-label="Falar">${icon('mic')}</button>
        <div class="msg" id="voiceMsg" style="text-align:center"></div><div class="row" id="voiceConfirm" hidden><button class="btn primary" id="voiceYes">Executar</button><button class="btn" id="voiceNo">Cancelar</button></div></div>
    </div>`;
  renderConn();
  $$('[data-go]', main).forEach((b) => b.onclick = () => go(b.dataset.go));
  $$('[data-mode]', main).forEach((b) => b.onclick = () => { S.remoteMode = b.dataset.mode; store.set('remoteMode', S.remoteMode); $$('[data-mode]').forEach((x) => x.setAttribute('aria-pressed', x === b)); renderSurface(); });
  $$('[data-key]', main).forEach((b) => b.onclick = () => sendKey(b.dataset.key, b));
  $('#kbdBtn').onclick = () => { const p = $('#kbd'); p.hidden = !p.hidden; $('#voice').hidden = true; if (!p.hidden) $('#kbdText').focus(); };
  $('#kbdSend').onclick = () => { const t = $('#kbdText').value; if (t) sendText(t).then((ok) => ok && toast('Texto enviado')); };
  $('#kbdSearch').onclick = () => sendText($('#kbdText').value, { submit: true }).then((ok) => ok && toast('Buscando na TV'));
  $('#kbdDel').onclick = (e) => sendKey('del', e.currentTarget);
  $('#kbdEnter').onclick = (e) => sendKey('enter', e.currentTarget);
  $('#kbdSpace').onclick = () => sendText(' ');
  $('#kbdClear').onclick = () => sendText('', { replace: true }).then((ok) => ok && toast('Campo limpo'));
  setupVoice();
  renderSurface();
  wsConnect();
}

function renderSurface() {
  const box = $('#surface');
  if (!box) return;
  const dpadOk = !S.caps || has('up');
  if (S.remoteMode === 'dpad') {
    box.innerHTML = `<div class="dpad" role="group" aria-label="Direcional">
      <button class="up" data-key="up" aria-label="Cima" ${dpadOk ? '' : 'disabled'}>${icon('up')}</button>
      <button class="left" data-key="left" aria-label="Esquerda" ${dpadOk ? '' : 'disabled'}>${icon('left')}</button>
      <button class="ok" data-key="ok" aria-label="OK" ${dpadOk ? '' : 'disabled'}>OK</button>
      <button class="right" data-key="right" aria-label="Direita" ${dpadOk ? '' : 'disabled'}>${icon('right')}</button>
      <button class="down" data-key="down" aria-label="Baixo" ${dpadOk ? '' : 'disabled'}>${icon('down')}</button></div>`;
    $$('[data-key]', box).forEach((b) => b.onclick = () => sendKey(b.dataset.key, b));
  } else if (S.remoteMode === 'swipe') {
    box.innerHTML = `<div class="pad" id="pad" aria-label="Área de deslizar">${dpadOk ? 'Deslize para navegar · toque para OK' : 'O modo deslizante precisa das setas: pareie o controle em Dispositivos.'}</div>`;
    if (dpadOk) setupSwipe($('#pad'));
  } else {
    const ok = !S.caps || (S.caps.remote && S.caps.remote.pointer);
    box.innerHTML = `<div class="pad" id="pad" aria-label="Touchpad">${ok ? 'Arraste para mover o cursor · toque para clicar · dois dedos para rolar' : 'O touchpad precisa da acessibilidade do TV Drop ativada na TV (veja Dispositivos).'}</div>
      <label class="slider-row">Sensibilidade<input type="range" id="sens" min="0.6" max="4" step="0.1" value="${S.sensitivity}"></label>`;
    $('#sens').oninput = (e) => { S.sensitivity = +e.target.value; store.set('sensitivity', S.sensitivity); };
    if (ok) setupTouchpad($('#pad'));
  }
}

function ripple(pad, x, y) {
  const r = pad.getBoundingClientRect();
  const d = document.createElement('span');
  d.className = 'ripple'; d.style.left = (x - r.left) + 'px'; d.style.top = (y - r.top) + 'px';
  pad.appendChild(d); setTimeout(() => d.remove(), 500);
}

/** Swipe mode: every ~60 px of travel sends one arrow; a tap sends OK. */
function setupSwipe(pad) {
  let sx, sy, moved, start;
  pad.onpointerdown = (e) => { pad.setPointerCapture(e.pointerId); sx = e.clientX; sy = e.clientY; moved = false; start = Date.now(); };
  pad.onpointermove = (e) => {
    if (sx == null) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 60) return;
    moved = true;
    const key = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    sendKey(key); ripple(pad, e.clientX, e.clientY);
    sx = e.clientX; sy = e.clientY;
  };
  pad.onpointerup = (e) => { if (!moved && Date.now() - start < 400) { sendKey('ok'); ripple(pad, e.clientX, e.clientY); } sx = sy = null; };
  pad.onpointercancel = () => { sx = sy = null; };
}

/** Touchpad: one finger moves the cursor, a tap clicks, a long press holds, two fingers scroll. */
function setupTouchpad(pad) {
  const pts = new Map();
  let acc = { dx: 0, dy: 0 }, raf = 0, downAt = 0, travel = 0, longTimer = 0, scrollY = null, lastTap = 0;
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
    if (was === 1 && travel < 8 && Date.now() - downAt < 300) {
      pointer('tap'); buzz(); ripple(pad, e.clientX, e.clientY);
      lastTap = Date.now();
    }
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
      $('#voiceHint').textContent = 'Neste navegador o microfone não está disponível: navegadores só liberam o microfone em páginas seguras (https), e a página da TV é http. Use o app TV Drop no Android, que tem reconhecimento de voz.';
      $('#voiceGo').disabled = true;
    }
  };
  $('#voiceGo').onclick = () => listen(mode);
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
  const msg = $('#voiceMsg');
  const cmd = interpret(text);
  if (!cmd) { msg.innerHTML = `Ouvi “${esc(text)}”, mas não entendi o comando.`; msg.className = 'msg err'; return; }
  msg.innerHTML = `Ouvi “${esc(text)}” → <b>${esc(cmd.label)}</b>`;
  msg.className = 'msg ok';
  // Low confidence or important actions wait for a tap.
  if (cmd.confirm || (confidence && confidence < 0.6)) {
    $('#voiceConfirm').hidden = false;
    $('#voiceYes').onclick = () => { $('#voiceConfirm').hidden = true; cmd.run(); };
    $('#voiceNo').onclick = () => { $('#voiceConfirm').hidden = true; msg.textContent = 'Cancelado.'; };
  } else cmd.run();
}

/** Turns a sentence into a TV command. Recognition, interpretation and execution are kept apart. */
function interpret(raw) {
  const t = raw.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.!?,]/g, '').trim();
  const times = (s) => { const m = s.match(/(\d+)\s*(vezes|x)?/); return m ? Math.min(10, +m[1]) : 1; };
  const repeat = (key, n) => async () => { for (let i = 0; i < n; i++) { await sendKey(key); await new Promise((r) => setTimeout(r, 120)); } };
  let m;
  if ((m = t.match(/^(abr(ir|a|e)|abrir o|abra o|inicia(r)?|entra(r)? no?)\s+(o |a |no |na )?(.+)$/))) {
    const name = m[6].trim();
    const app = findApp(name);
    if (!app) return { label: `abrir “${name}” (não encontrei esse app na TV)`, run: () => toast('App não encontrado na TV: ' + name, false) };
    return { label: 'abrir ' + app.label, run: () => launchApp(app.pkg, app.label) };
  }
  if (/(aumenta|aumentar|sobe|subir|mais alto).*(volume|som)|volume.*(mais|alto|aumenta)/.test(t)) { const n = times(t); return { label: `aumentar volume${n > 1 ? ' ' + n + 'x' : ''}`, run: repeat('volup', n) }; }
  if (/(diminui|diminuir|abaixa|abaixar|desce|baixar|mais baixo).*(volume|som)|volume.*(menos|baixo|diminui)/.test(t)) { const n = times(t); return { label: `diminuir volume${n > 1 ? ' ' + n + 'x' : ''}`, run: repeat('voldown', n) }; }
  if (/^(mudo|silencia(r)?|tira(r)? o som|sem som)/.test(t)) return { label: 'silenciar', run: () => sendKey('mute') };
  if (/^(volta(r)?|voltar tela|anterior)$/.test(t)) return { label: 'voltar', run: () => sendKey('back') };
  if (/(inicio|tela inicial|home|menu principal)/.test(t)) return { label: 'ir para o início', run: () => sendKey('home') };
  if (/^(pausa(r)?|para(r)?( o video)?|pausar video)/.test(t)) return { label: 'pausar', run: () => (S.status && S.status.playing ? playerCtl('toggle') : sendKey('pause')) };
  if (/^(continua(r)?|reproduzi(r)?|toca(r)?|play|retoma(r)?)/.test(t)) return { label: 'reproduzir', run: () => (S.status && S.status.playing && S.status.paused ? playerCtl('toggle') : sendKey('play')) };
  if ((m = t.match(/^(pesquisa(r)?|procura(r)?|busca(r)?)\s+(por\s+)?(.+)$/))) {
    const q = raw.replace(/^\s*\S+\s+(por\s+)?/i, '').trim();
    return { label: `pesquisar “${q}”`, run: async () => { if (await sendKey('search')) { await new Promise((r) => setTimeout(r, 1500)); sendText(q, { submit: true }); } } };
  }
  if ((m = t.match(/^(cima|sobe|baixo|desce|esquerda|direita)( (\d+))?/))) {
    const map = { cima: 'up', sobe: 'up', baixo: 'down', desce: 'down', esquerda: 'left', direita: 'right' };
    const n = m[3] ? Math.min(10, +m[3]) : 1;
    return { label: `${m[1]}${n > 1 ? ' ' + n + 'x' : ''}`, run: repeat(map[m[1]], n) };
  }
  if (/^(ok|seleciona(r)?|confirma(r)?|entra(r)?)$/.test(t)) return { label: 'OK', run: () => sendKey('ok') };
  if (/(desliga(r)?|apaga(r)?)( a)? (tv|televisao)|^desligar$/.test(t) && !/ em /.test(t)) return { label: 'desligar a TV', confirm: true, run: () => sendKey('power') };
  return null;
}

function findApp(name) {
  const n = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '');
  const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9+]/g, '');
  for (const c of S.catalog) if (c.installed && (norm(c.name).includes(n) || n.includes(norm(c.name)) || norm(c.id) === n)) return { pkg: c.installed, label: c.name };
  for (const a of S.apps) if (norm(a.label).includes(n) || n.includes(norm(a.label))) return { pkg: a.pkg, label: a.label };
  return null;
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
const iconUrl = (pkg) => '/api/v2/apps/icon?pkg=' + encodeURIComponent(pkg) + '&token=' + encodeURIComponent(S.token);

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
      <div class="row" style="margin-top:10px"><button class="btn small" id="reloadApps">Atualizar lista</button></div></div>`;
  renderConn();
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

    <div class="card"><h2>Este aparelho</h2><p class="sub">${esc(deviceName())}</p>
      <div class="row"><button class="btn small" id="classic">Página clássica</button><button class="btn small danger" id="logout">Desconectar este aparelho</button></div></div>`;
  renderConn();
  $('#beep').onclick = findTv;
  if ($('#atvStart')) $('#atvStart').onclick = atvPairStart;
  if ($('#atvUnpair')) $('#atvUnpair').onclick = async () => { if (!confirm('Remover o pareamento do controle?')) return; try { await api('/api/v2/remote/unpair', { method: 'POST' }); await renderDevices(); } catch (e) { toast(e.message, false); } };
  $('#diagBtn').onclick = runDiagnostics;
  $('#classic').onclick = () => { location.href = '/classic.html'; };
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
    const r = await fetch('/api/v2/speed?bytes=' + n, { headers: { 'X-TVDrop-Token': S.token }, cache: 'no-store' });
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
  loadApps();
  go(store.get('view', 'home'));
  refreshStatus();
}

function boot() {
  fillIcons();
  $$('.nav button').forEach((b) => b.onclick = () => go(b.dataset.view));
  $('#pairForm').onsubmit = (e) => { e.preventDefault(); doPair($('#pinInput').value); };
  // Token handed over by the Android app: #token=...
  const hash = new URLSearchParams(location.hash.slice(1));
  if (hash.get('token')) { saveToken(hash.get('token')); history.replaceState(null, '', location.pathname); }
  // QR code from the TV: /?pair=123456
  const pin = new URLSearchParams(location.search).get('pair');
  if (pin) { history.replaceState(null, '', location.pathname); if (!S.token) { $('#pairView').hidden = false; $('#pinInput').value = pin; doPair(pin); return; } }
  if (!S.token) { showPairing(); return; }
  start();
}

setInterval(refreshStatus, 2000);
setInterval(() => { if (!document.hidden && S.token && (S.view === 'remote' || S.view === 'home')) loadCaps(); }, 15000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshStatus(); });
boot();
