/* TV Drop — remote extras: turning the TV on from standby, my buttons, Google on the TV, search in every app,
   routines on the TV, Siri links, invites for visitors and children, gestures.
   Loaded before app.js and only defines functions: they use app.js's helpers ($, api, S, icon...) when called. */

/* ---------------------------------------------------------------- shared */
const tvHostPort = () => (BASE ? new URL(BASE).host : location.host);
const tvOrigin = () => (BASE ? BASE.replace(/\/$/, '') : location.origin);
const isOwner = () => !S.caps || !S.caps.role || S.caps.role === 'owner';

/** A sheet over the bottom of the screen (on top of the remote), with a title and a close button. */
function sheet(title, body) {
  closeSheet();
  const w = document.createElement('div');
  w.className = 'xsheet-wrap';
  w.id = 'xsheet';
  w.innerHTML = `<div class="xsheet card" role="dialog" aria-label="${esc(title)}"><div class="row kbd-head"><h2 class="grow" style="margin:0">${esc(title)}</h2>
    <button class="sheet-x" data-x aria-label="Fechar">${icon('close')}</button></div>${body}</div>`;
  document.body.appendChild(w);
  w.addEventListener('click', (e) => { if (e.target === w) closeSheet(); });
  $('[data-x]', w).onclick = closeSheet;
  return $('.xsheet', w);
}
function closeSheet() { const s = $('#xsheet'); if (s) s.remove(); }

/** Copies text (works on the TV's http page, where the clipboard API isn't allowed); else selects the field. */
function copyText(text, input) {
  let ok = false;
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
    ok = document.execCommand('copy');
    ta.remove();
  } catch (e) { ok = false; }
  if (!ok && input) { input.focus(); input.select(); }
  toast(ok ? 'Link copiado' : 'Selecione o link e copie', ok);
}

/* ---------------------------------------------------------------- 2. turning the TV on */
const normMac = (v) => { const h = String(v || '').replace(/[^0-9a-f]/gi, ''); return h.length === 12 ? h.toUpperCase().match(/../g).join(':') : null; };
const wakeInfo = () => store.get('wake', {})[tvHostPort()] || {};

/** While the TV answers, keep its network address (MAC) and IP: needed to wake it later, when it can't answer. */
function rememberWake() {
  const w = S.caps && S.caps.wake;
  if (!w) return;
  const all = store.get('wake', {});
  const cur = all[tvHostPort()] || {};
  const mac = cur.manual ? cur.mac : (normMac(w.mac) || cur.mac || '');
  all[tvHostPort()] = { mac, manual: !!cur.manual, ip: w.ip || cur.ip, keepAwake: !!w.keepAwake };
  store.set('wake', all);
  if (mac && NATIVE && NATIVE.setWake) NATIVE.setWake(tvHostPort(), mac);
}

function nativeWake(mac, ip) {
  if (!NATIVE || !NATIVE.wake) return Promise.resolve(null);
  const id = 'w' + (++nativeSeq);
  return new Promise((resolve) => {
    nativeWaiters[id] = resolve;
    NATIVE.wake(mac || '', ip || '', id);
    setTimeout(() => { if (nativeWaiters[id]) { delete nativeWaiters[id]; resolve({ ok: false, message: 'O celular não respondeu.' }); } }, 15000);
  });
}

/** Power pressed while the TV doesn't answer: the Android app sends Wake-on-LAN (and WAKEUP); a browser explains. */
async function wakeTv() {
  const w = wakeInfo();
  if (NATIVE && NATIVE.wake) {
    toast('Mandando o sinal de ligar para a TV…');
    const r = await nativeWake(w.mac, w.ip);
    if (!r || !r.ok) { wakeHelp(r && r.message); return false; }
    return waitForTv();
  }
  wakeHelp();
  return false;
}

async function waitForTv() {
  for (let i = 0; i < 18; i++) {
    await sleep(2500);
    try {
      await api('/api/v2/info', { timeout: 2000 });
      S.online = true; renderConn(); toast('A TV ligou');
      loadCaps();
      if (S.view === 'remote') { wsClose(); wsConnect(); }
      return true;
    } catch (e) { /* not yet */ }
  }
  toast('A TV não ligou. Veja "Ligar a TV pelo celular" em Dispositivos.', false);
  return false;
}

function wakeHelp(reason) {
  sheet('A TV não está respondendo', `<p class="sub">${reason ? esc(reason) + '<br><br>' : ''}Ela está em repouso profundo, ou fora do Wi-Fi. Para ligar pelo celular:</p>
    <ol class="xsteps">
      <li>Com a TV ligada, ative em Dispositivos <b>“Pronto para ligar pelo celular”</b>. Aí o Liga/Desliga daqui liga a TV, inclusive no iPhone.</li>
      <li>Ou use o <b>app TV Drop no Android</b>: ele manda o sinal de ligar pela rede (Wake-on-LAN).</li>
      <li>Na TV, em <b>Configurações → Sistema → Energia</b> (ou Rede), ative “Ligar com Wi-Fi/rede”, “Wake on LAN” ou “Início rápido”. O nome muda conforme a marca.</li>
    </ol>
    <button class="btn" data-x2 style="width:100%;margin-top:8px">Entendi</button>`);
  $('[data-x2]').onclick = closeSheet;
}

function wakeCard() {
  const w = wakeInfo();
  const ka = S.caps && S.caps.wake ? S.caps.wake.keepAwake : w.keepAwake;
  return `<div class="card" id="wakeCard"><h2>Ligar a TV pelo celular</h2>
    <p class="sub">Desligar sempre funciona. Para <b>ligar</b> a TV quando ela está em repouso:</p>
    ${isOwner() ? `<label class="slider-row"><input type="checkbox" id="keepAwake" ${ka ? 'checked' : ''} style="flex:none;width:20px;height:20px">
      <span><b>Pronto para ligar pelo celular</b><br><small class="sub">O TV Drop fica acordado com a TV em repouso, e o Liga/Desliga daqui liga a TV (inclusive no iPhone e pela Siri). Gasta um pouco mais de energia em repouso.</small></span></label>` : ''}
    <p class="sub" style="margin-top:12px">Endereço de rede da TV (MAC), para o sinal de ligar pela rede (Wake-on-LAN) do app Android: <b id="macNow">${esc(w.mac || 'a TV não informou')}</b></p>
    <div class="row"><input class="field grow mono" id="macIn" placeholder="AA:BB:CC:DD:EE:FF" value="${esc(w.manual ? w.mac : '')}" autocapitalize="characters" autocomplete="off" aria-label="Endereço MAC da TV"><button class="btn" id="macSave">Salvar</button></div>
    <p class="sub" style="margin-top:8px">Onde achar: na TV, Configurações → Sistema → Sobre → Status (Endereço MAC do Wi-Fi ou da Ethernet).</p>
    ${NATIVE && NATIVE.wake ? '<button class="btn" id="wakeTest" style="margin-top:6px">Enviar sinal de ligar agora</button>'
      : '<p class="sub">O navegador não consegue mandar o sinal de ligar pela rede. Use “Pronto para ligar” ou o app Android.</p>'}
    <details class="sub" style="margin-top:10px"><summary>O que ativar na TV</summary><p>Configurações → Sistema → Energia (ou Rede e Internet): “Ligar com Wi-Fi”, “Ligar pela rede”, “Wake on LAN/WLAN”, “Início rápido” ou “Modo de espera de rede”. Pela Ethernet costuma funcionar melhor que pelo Wi-Fi.</p></details></div>`;
}

function bindWakeCard() {
  if ($('#keepAwake')) $('#keepAwake').onchange = (e) => api('/api/v2/settings', { method: 'POST', json: { keepAwake: e.target.checked } })
    .then((r) => { toast(r.keepAwake ? 'Pronto: dá para ligar a TV pelo celular' : 'Desativado'); loadCaps().then(rememberWake); }, (er) => toast(er.message, false));
  $('#macSave').onclick = () => {
    const v = $('#macIn').value.trim();
    const all = store.get('wake', {});
    const cur = all[tvHostPort()] || {};
    if (!v) { cur.manual = false; cur.mac = normMac(S.caps && S.caps.wake && S.caps.wake.mac) || ''; }
    else { const m = normMac(v); if (!m) { toast('Endereço inválido (ex.: A4:5E:60:0B:1C:2D)', false); return; } cur.mac = m; cur.manual = true; }
    all[tvHostPort()] = cur; store.set('wake', all);
    if (cur.mac && NATIVE && NATIVE.setWake) NATIVE.setWake(tvHostPort(), cur.mac);
    $('#macNow').textContent = cur.mac || 'a TV não informou';
    toast('Salvo');
  };
  if ($('#wakeTest')) $('#wakeTest').onclick = async () => {
    const w = wakeInfo();
    const r = await nativeWake(w.mac, w.ip);
    toast(r && r.ok ? 'Sinal de ligar enviado' : (r && r.message) || 'Não deu para enviar', !!(r && r.ok));
  };
}

/* ---------------------------------------------------------------- 3 and 7. Google on the TV, search in every app */
async function googleAsk(q) {
  q = (q || '').trim();
  if (!q) { toast('Fale ou digite o que procurar', false); return false; }
  try { await api('/api/v2/remote/search', { method: 'POST', json: { query: q } }); toast('Perguntei ao Google da TV: “' + q + '”'); return true; }
  catch (e) { toast(e.message, false); return false; }
}

function askGoogle() {
  const el = sheet('Perguntar ao Google da TV', `<p class="sub">O que você falar ou digitar abre na busca do Google TV, com resultados de todos os apps e respostas do Google.</p>
    <div class="kbd-input"><input class="field" id="gq" placeholder="Ex.: filmes do Tom Hanks" autocomplete="off" enterkeyhint="search" style="padding-right:60px" aria-label="O que perguntar">
      <button class="kbd-mic" id="gqMic" aria-label="Falar">${icon('mic')}</button></div>
    <div class="vchips">${['Filmes de comédia', 'Previsão do tempo', 'Jogo do Flamengo', 'Séries de suspense', 'Desenhos para crianças'].map((c) => `<button class="vchip" data-gq="${c}">${c}</button>`).join('')}</div>
    <button class="btn primary" id="gqGo" style="width:100%;margin-top:12px">${icon('search')}Perguntar na TV</button>`);
  const go_ = () => googleAsk($('#gq').value).then((ok) => { if (ok) closeSheet(); });
  $('#gqGo').onclick = go_;
  $('#gq').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); go_(); } };
  $('#gqMic').onclick = () => dictate((t) => { $('#gq').value = t; go_(); }, $('#gqMic'), $('#gq'));
  $$('[data-gq]', el).forEach((b) => b.onclick = () => { $('#gq').value = b.dataset.gq; go_(); });
}

/** Search links of the main apps (each app decides whether it opens its search: the Google TV one covers all). */
const APP_SEARCH = [
  ['com.google.android.youtube.tv', 'YouTube', (q) => 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q)],
  ['com.netflix.ninja', 'Netflix', (q) => 'https://www.netflix.com/search?q=' + encodeURIComponent(q)],
  ['com.amazon.amazonvideo.livingroom', 'Prime Video', (q) => 'https://www.primevideo.com/search/?phrase=' + encodeURIComponent(q)],
  ['com.globo.globotv', 'Globoplay', (q) => 'https://globoplay.globo.com/busca/?q=' + encodeURIComponent(q)],
  ['com.disney.disneyplus', 'Disney+', (q) => 'https://www.disneyplus.com/search?q=' + encodeURIComponent(q)],
  ['com.wbd.stream', 'Max', (q) => 'https://play.max.com/search?q=' + encodeURIComponent(q)],
];
function drawSearchWhere() {
  const box = $('#kbdWhere');
  if (!box) return;
  const installed = new Set((S.apps || []).map((a) => a.pkg));
  const apps = APP_SEARCH.filter((a) => !S.appsLoaded || installed.has(a[0]));
  box.innerHTML = `<span class="sub">Buscar em:</span><button class="vchip" data-where="google">${icon('search')}Google TV (todos os apps)</button>`
    + apps.map((a, i) => `<button class="vchip" data-where="${i}">${esc(a[1])}</button>`).join('');
  $$('[data-where]', box).forEach((b) => b.onclick = () => {
    const q = $('#kbdText').value.trim();
    if (!q) { toast('Digite ou fale o que procurar', false); $('#kbdText').focus(); return; }
    rememberText(q);
    if (b.dataset.where === 'google') { googleAsk(q); return; }
    const a = apps[+b.dataset.where];
    api('/api/v2/remote/link', { method: 'POST', json: { link: a[2](q) } }).then(() => toast('Buscando no ' + a[1]), (e) => toast(e.message, false));
  });
}

/* ---------------------------------------------------------------- 4. my buttons */
const MYBTN_DEFAULT = ['key:captions', 'key:input', 'act:google', 'rt:boanoite'];
const MYBTN_MAX = 8;
const ACT_INFO = { kbd: ['keyboard', 'Teclado'], voice: ['mic', 'Voz'], google: ['search', 'Google da TV'], peek: ['eye', 'Ver a tela'], timer30: ['timer', 'Desligar em 30 min'], find: ['bell', 'Achar a TV'] };
const KEY_EXTRA = {
  chup: ['up', 'Canal +'], chdown: ['down', 'Canal −'], volup: ['volup', 'Volume +'], voldown: ['voldown', 'Volume −'],
  red: ['bolt', 'Vermelho'], green: ['bolt', 'Verde'], yellow: ['bolt', 'Amarelo'], blue: ['bolt', 'Azul'],
  up: ['up', 'Cima'], down: ['down', 'Baixo'], left: ['left', 'Esquerda'], right: ['right', 'Direita'], ok: ['enter', 'OK'],
};
const keyLabel = (k) => (KEY_INFO[k] || KEY_EXTRA[k] || [0, k])[1];
const splitId = (id) => [id.slice(0, id.indexOf(':')), id.slice(id.indexOf(':') + 1)];

function myBtnInfo(id) {
  const [type, v] = splitId(id);
  if (type === 'key') { const k = KEY_INFO[v] || KEY_EXTRA[v]; return k ? { icon: k[0], label: k[1] } : null; }
  if (type === 'act') { const a = ACT_INFO[v]; return a ? { icon: a[0], label: a[1] } : null; }
  if (type === 'app') { const a = (S.apps || []).find((x) => x.pkg === v); return { icon: 'grid', label: a ? a.label : v.split('.').pop(), img: iconUrl(v) }; }
  if (type === 'rt') { const r = (S.routines || []).find((x) => x.id === v); return r ? { icon: r.icon || 'bolt', label: r.name } : null; }
  return null;
}

async function drawMyButtons() {
  const box = $('#myBtns');
  if (!box) return;
  const ids = store.get('myButtons', MYBTN_DEFAULT);
  if (ids.some((id) => id.startsWith('rt:')) && !S.routines) await loadRoutines();
  if (ids.some((id) => id.startsWith('app:')) && !S.appsLoaded) await loadApps();
  if (!$('#myBtns')) return;
  box.innerHTML = ids.map((id) => { const i = myBtnInfo(id); return i ? `<button class="mbtn" data-mb="${esc(id)}" aria-label="${esc(i.label)}">${i.img ? `<img src="${i.img}" alt="" onerror="this.remove()">` : icon(i.icon)}<span>${esc(i.label)}</span></button>` : ''; }).join('')
    + `<button class="mbtn ghost" id="mbEdit" aria-label="Escolher meus botões">${icon('edit')}<span>Editar</span></button>`;
  $$('[data-mb]', box).forEach((b) => {
    const [type, v] = splitId(b.dataset.mb);
    if (type === 'key') bindKey(b, v); else b.onclick = () => runMyButton(type, v);
  });
  $('#mbEdit').onclick = editMyButtons;
}

function runMyButton(type, v) {
  buzz();
  if (type === 'app') { const a = (S.apps || []).find((x) => x.pkg === v); launchApp(v, a ? a.label : v); }
  else if (type === 'rt') runRoutineNow(v);
  else if (v === 'kbd') { openKbd(false); setTimeout(() => { if ($('#kbdText')) $('#kbdText').focus(); }, 50); }
  else if (v === 'voice') $('#micBtn').click();
  else if (v === 'google') askGoogle();
  else if (v === 'peek') peekScreen();
  else if (v === 'timer30') api('/api/v2/timer', { method: 'POST', json: { minutes: 30, action: 'power' } }).then(() => toast('A TV desliga em 30 minutos'), (e) => toast(e.message, false));
  else if (v === 'find') findTv();
}

async function editMyButtons() {
  await Promise.all([loadApps(), loadRoutines()]);
  let order = store.get('myButtons', MYBTN_DEFAULT).slice();
  const groups = [
    ['Ações', Object.keys(ACT_INFO).map((k) => 'act:' + k)],
    ['Rotinas', (S.routines || []).map((r) => 'rt:' + r.id)],
    ['Teclas', ['captions', 'input', 'settings', 'assistant', 'search', 'guide', 'info', 'recents', 'apps', 'mute', 'chup', 'chdown', 'stop', 'prev', 'next', 'rew', 'ff', 'red', 'green', 'yellow', 'blue'].map((k) => 'key:' + k)],
    ['Apps', (S.apps || []).filter((a) => !a.system).slice(0, 40).map((a) => 'app:' + a.pkg)],
  ];
  const el = sheet('Meus botões', `<p class="sub">Escolha até ${MYBTN_MAX}. Eles ficam logo abaixo do volume, na ordem em que você marcar.</p>
    ${groups.filter((g) => g[1].length).map(([t, ids]) => `<h3 class="xh">${t}</h3><div class="xpick">${ids.map((id) => { const i = myBtnInfo(id); return i ? `<label class="xchip"><input type="checkbox" value="${esc(id)}" ${order.includes(id) ? 'checked' : ''}>${icon(i.icon)}<span>${esc(i.label)}</span></label>` : ''; }).join('')}</div>`).join('')}
    <div class="row" style="margin-top:14px"><button class="btn" id="mbReset">Voltar ao padrão</button><button class="btn primary grow" id="mbSave">Salvar</button></div>`);
  $$('input[type=checkbox]', el).forEach((c) => c.onchange = () => {
    if (c.checked) {
      if (order.length >= MYBTN_MAX) { c.checked = false; toast('No máximo ' + MYBTN_MAX, false); return; }
      order.push(c.value);
    } else order = order.filter((x) => x !== c.value);
  });
  $('#mbSave').onclick = () => { store.set('myButtons', order); closeSheet(); drawMyButtons(); toast('Botões salvos'); };
  $('#mbReset').onclick = () => { store.set('myButtons', MYBTN_DEFAULT); closeSheet(); drawMyButtons(); };
}

/* ---------------------------------------------------------------- 8. routines (they run on the TV) */
async function loadRoutines() {
  try { const r = await api('/api/v2/routines'); S.routines = r.routines; } catch (e) { S.routines = S.routines || []; }
  return S.routines;
}
const DAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
function scheduleText(r) {
  if (!r.time) return 'no botão';
  const d = r.days || [];
  const days = !d.length || d.length === 7 ? 'todo dia' : d.join(',') === '2,3,4,5,6' ? 'seg a sex' : d.map((x) => DAY_SHORT[x - 1]).join(', ');
  return `${r.time} · ${days}${r.enabled ? '' : ' · pausada'}`;
}

async function drawRoutines() {
  const box = $('#routinesCard');
  if (!box) return;
  await loadRoutines();
  if (!$('#routinesCard')) return;
  const own = isOwner();
  box.innerHTML = `<div class="row"><h2 class="grow" style="margin:0">Rotinas</h2>${own ? `<button class="btn small" id="rtNew">${icon('plus')}Nova</button>` : ''}</div>
    <p class="sub" style="margin:6px 0 10px">Rodam na própria TV, até com o celular desligado.</p>
    <div class="list">${(S.routines || []).map((r) => `<div class="item"><div class="fileicon">${icon(r.icon || 'bolt')}</div>
      <div class="t"><b>${esc(r.name)}</b><small>${esc(scheduleText(r))} · ${r.actions.length} ${r.actions.length === 1 ? 'ação' : 'ações'}</small></div>
      <button class="btn small primary" data-rtrun="${esc(r.id)}" aria-label="Rodar ${esc(r.name)}">${icon('play')}</button>
      ${own ? `<button class="btn small" data-rtedit="${esc(r.id)}" aria-label="Editar ${esc(r.name)}">${icon('edit')}</button>` : ''}</div>`).join('') || '<div class="empty">Nenhuma rotina.</div>'}</div>`;
  $$('[data-rtrun]', box).forEach((b) => b.onclick = () => runRoutineNow(b.dataset.rtrun));
  $$('[data-rtedit]', box).forEach((b) => b.onclick = () => editRoutine(S.routines.find((r) => r.id === b.dataset.rtedit)));
  if ($('#rtNew')) $('#rtNew').onclick = () => editRoutine(null);
}

function runRoutineNow(id) {
  buzz();
  api('/api/v2/routines/run', { method: 'POST', json: { id } }).then((r) => toast(r.message), (e) => toast(e.message, false));
}

const ACTION_TYPES = { key: 'Tecla', volume: 'Volume', app: 'Abrir app', link: 'Abrir link', text: 'Digitar texto', search: 'Buscar no Google da TV', timer: 'Temporizador', power: 'Ligar ou desligar a TV', wait: 'Esperar' };
function actionText(a) {
  switch (a.type) {
    case 'key': return 'Tecla ' + keyLabel(a.key) + (a.times > 1 ? ' ×' + a.times : '');
    case 'volume': return (a.dir === 'down' ? 'Baixar' : 'Aumentar') + ' o volume ' + a.steps + '×';
    case 'app': { const x = (S.apps || []).find((p) => p.pkg === a.pkg); return 'Abrir ' + (x ? x.label : a.pkg); }
    case 'link': return 'Abrir ' + a.url;
    case 'text': return 'Digitar “' + a.text + '”';
    case 'search': return 'Google da TV: “' + a.query + '”';
    case 'timer': return 'Temporizador de ' + a.minutes + ' min e ' + ({ power: 'desligar', pause: 'pausar', mute: 'silenciar', stop: 'parar' }[a.action] || a.action);
    case 'power': return a.state === 'off' ? 'Desligar a TV' : 'Ligar a TV';
    case 'wait': return 'Esperar ' + a.seconds + ' s';
    default: return a.type;
  }
}

async function editRoutine(r) {
  await loadApps();
  const cur = r ? JSON.parse(JSON.stringify(r)) : { name: '', time: null, days: [], enabled: true, icon: 'bolt', actions: [] };
  const el = sheet(r ? 'Editar rotina' : 'Nova rotina', `
    <label class="sub" for="rtName">Nome</label><input class="field" id="rtName" value="${esc(cur.name)}" placeholder="Ex.: Hora do filme" autocomplete="off">
    <div class="row" style="margin-top:12px;align-items:center"><label class="slider-row grow" style="margin:0"><input type="checkbox" id="rtTimed" ${cur.time ? 'checked' : ''} style="flex:none;width:20px;height:20px"> Rodar sozinha às</label>
      <input class="field" type="time" id="rtTime" value="${esc(cur.time || '22:00')}" style="width:130px" aria-label="Horário"></div>
    <div class="xdays">${[1, 2, 3, 4, 5, 6, 7].map((d) => `<button class="vchip ${!cur.days.length || cur.days.includes(d) ? 'on' : ''}" data-day="${d}">${DAY_SHORT[d - 1]}</button>`).join('')}</div>
    <label class="slider-row" style="margin-top:6px"><input type="checkbox" id="rtOn" ${cur.enabled ? 'checked' : ''} style="flex:none;width:20px;height:20px"> Ativa</label>
    <h3 class="xh">Ações, em ordem</h3><div class="list" id="rtActs"></div>
    <select class="field" id="rtType" style="margin-top:8px" aria-label="Tipo de ação">${Object.entries(ACTION_TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
    <div id="rtParams" style="margin-top:8px"></div>
    <button class="btn" id="rtAdd" style="width:100%;margin-top:8px">${icon('plus')}Adicionar ação</button>
    <div class="msg" id="rtMsg"></div>
    <div class="row" style="margin-top:14px">${r ? `<button class="btn danger" id="rtDel" aria-label="Apagar rotina">${icon('trash')}</button>` : ''}<button class="btn primary grow" id="rtSave">Salvar rotina</button></div>`);
  const drawActs = () => {
    $('#rtActs').innerHTML = cur.actions.map((a, i) => `<div class="item"><div class="t"><b>${i + 1}. ${esc(actionText(a))}</b></div><button class="btn small" data-rm="${i}" aria-label="Tirar a ação ${i + 1}">${icon('trash')}</button></div>`).join('') || '<div class="empty">Nenhuma ação ainda.</div>';
    $$('[data-rm]', el).forEach((b) => b.onclick = () => { cur.actions.splice(+b.dataset.rm, 1); drawActs(); });
  };
  const keys = [...new Set(Object.keys(KEY_INFO).concat(Object.keys(KEY_EXTRA)))];
  const params = () => {
    $('#rtParams').innerHTML = {
      key: `<div class="row"><select class="field grow" id="pKey" aria-label="Tecla">${keys.map((k) => `<option value="${k}">${esc(keyLabel(k))}</option>`).join('')}</select><input class="field" id="pTimes" type="number" min="1" max="20" value="1" style="width:80px" aria-label="Vezes"></div>`,
      volume: `<div class="row"><select class="field grow" id="pDir" aria-label="Direção"><option value="down">Baixar</option><option value="up">Aumentar</option></select><input class="field" id="pSteps" type="number" min="1" max="30" value="5" style="width:80px" aria-label="Passos"></div>`,
      app: `<select class="field" id="pApp" aria-label="App">${(S.apps || []).filter((a) => !a.system).map((a) => `<option value="${esc(a.pkg)}">${esc(a.label)}</option>`).join('')}</select>`,
      link: '<input class="field" id="pUrl" placeholder="https://www.youtube.com/watch?v=…" autocomplete="off" aria-label="Link">',
      text: '<input class="field" id="pText" placeholder="Texto para digitar na TV" autocomplete="off" aria-label="Texto">',
      search: '<input class="field" id="pQuery" placeholder="Ex.: jornal ao vivo" autocomplete="off" aria-label="O que buscar">',
      timer: `<div class="row"><input class="field" id="pMin" type="number" min="1" max="720" value="30" style="width:90px" aria-label="Minutos"><select class="field grow" id="pTAct" aria-label="No fim"><option value="power">e desligar a TV</option><option value="pause">e pausar</option><option value="mute">e silenciar</option><option value="stop">e parar o vídeo</option></select></div>`,
      power: '<select class="field" id="pState" aria-label="Ligar ou desligar"><option value="off">Desligar</option><option value="on">Ligar (precisa de “Pronto para ligar”)</option></select>',
      wait: '<input class="field" id="pSec" type="number" min="1" max="60" value="5" aria-label="Segundos">',
    }[$('#rtType').value];
  };
  $('#rtType').onchange = params;
  params(); drawActs();
  $('#rtAdd').onclick = () => {
    const t = $('#rtType').value;
    const v = (id) => ($('#' + id) ? $('#' + id).value.trim() : '');
    const a = { type: t };
    if (t === 'key') { a.key = v('pKey'); a.times = +v('pTimes') || 1; }
    if (t === 'volume') { a.dir = v('pDir'); a.steps = +v('pSteps') || 1; }
    if (t === 'app') { if (!v('pApp')) { toast('Nenhum app na lista', false); return; } a.pkg = v('pApp'); }
    if (t === 'link') { if (!/^https?:\/\/\S+$/i.test(v('pUrl'))) { toast('O link começa com https://', false); return; } a.url = v('pUrl'); }
    if (t === 'text') { if (!v('pText')) return; a.text = v('pText'); }
    if (t === 'search') { if (!v('pQuery')) return; a.query = v('pQuery'); }
    if (t === 'timer') { a.minutes = +v('pMin') || 30; a.action = v('pTAct'); }
    if (t === 'power') a.state = v('pState');
    if (t === 'wait') a.seconds = +v('pSec') || 5;
    cur.actions.push(a);
    drawActs();
  };
  $$('[data-day]', el).forEach((b) => b.onclick = () => b.classList.toggle('on'));
  $('#rtSave').onclick = async () => {
    cur.name = $('#rtName').value.trim();
    cur.enabled = $('#rtOn').checked;
    cur.time = $('#rtTimed').checked ? $('#rtTime').value : null;
    const days = $$('[data-day].on', el).map((b) => +b.dataset.day);
    cur.days = days.length === 7 ? [] : days;
    try {
      await api('/api/v2/routines/save', { method: 'POST', json: { routine: cur } });
      closeSheet(); toast('Rotina salva'); drawRoutines(); drawMyButtons();
    } catch (e) { $('#rtMsg').textContent = e.message; $('#rtMsg').className = 'msg err'; }
  };
  if ($('#rtDel')) $('#rtDel').onclick = async () => {
    if (!confirm('Apagar esta rotina?')) return;
    try { await api('/api/v2/routines/delete', { method: 'POST', json: { id: r.id } }); closeSheet(); drawRoutines(); drawMyButtons(); } catch (e) { toast(e.message, false); }
  };
}

/* ---------------------------------------------------------------- 1. Siri Shortcuts (one link = one action) */
function siriCard() {
  const base = tvOrigin() + '/api/v2/act?token=' + encodeURIComponent(S.token || '') + '&';
  const items = [
    ['Desligar a TV', 'power=off'], ['Ligar a TV', 'power=on', 'Precisa de “Pronto para ligar pelo celular”.'],
    ['Pausar ou continuar', 'key=playpause'], ['Aumentar o volume', 'volume=up&times=3'], ['Baixar o volume', 'volume=down&times=3'],
    ['Mudo', 'key=mute'], ['Abrir o YouTube', 'app=youtube'], ['Abrir a Netflix', 'app=netflix'],
    ['Perguntar ao Google da TV', 'search=TEXTO', 'No Atalhos, ponha antes a ação “Ditar texto” e troque TEXTO pela variável “Texto ditado”.'],
  ].concat((S.routines || []).map((r) => ['Rotina: ' + r.name, 'routine=' + encodeURIComponent(r.id)]));
  return `<div class="card" id="siriCard"><h2>Atalhos da Siri e automações</h2>
    <p class="sub">Cada link faz uma coisa na TV. No iPhone: copie o link, abra o app <b>Atalhos</b> → <b>+</b> → <b>Adicionar ação</b> → <b>Obter conteúdo do URL</b> e cole. Dê um nome, por exemplo “Desligar a TV”, e diga: <b>“E aí Siri, desligar a TV”</b>. Funciona no Wi-Fi de casa.</p>
    <div class="list">${items.map(([t, q, note], i) => `<div class="siri-row"><b>${esc(t)}</b>${note ? `<small class="sub">${esc(note)}</small>` : ''}
      <div class="row"><input class="field grow mono" readonly value="${esc(base + q)}" id="siri${i}" aria-label="Link: ${esc(t)}"><button class="btn small" data-copy="${i}">Copiar</button></div></div>`).join('')}</div>
    <p class="sub" style="margin-top:10px">O link leva a chave deste aparelho: quem tiver o link controla a TV. Para cancelar todos, remova este aparelho em “Aparelhos autorizados”. Também serve para Home Assistant e outros apps de automação.</p></div>`;
}
function bindSiriCard() {
  $$('#siriCard [data-copy]').forEach((b) => b.onclick = () => { const i = $('#siri' + b.dataset.copy); copyText(i.value, i); });
}

/* ---------------------------------------------------------------- 10. visitors and children */
function inviteCard() {
  return `<div class="card" id="inviteCard"><h2>Convidar visita ou criança</h2>
    <p class="sub">Um link que entra sem o código do Google. A visita usa o controle e transmite, mas não mexe nos ajustes, nos apps nem nos aparelhos. A criança também tem horário e apps bloqueados.</p>
    <div class="seg" role="group" aria-label="Tipo de convite"><button data-irole="guest" aria-pressed="true">Visita</button><button data-irole="kids" aria-pressed="false">Criança</button></div>
    <div class="row" style="margin-top:10px;align-items:center"><label class="sub" style="margin:0" for="iDur">Vale por</label><select class="field grow" id="iDur"><option value="4">4 horas</option><option value="24" selected>1 dia</option><option value="168">7 dias</option><option value="0">Até eu remover</option></select></div>
    <div id="iKids" hidden><div class="row" style="margin-top:10px;align-items:center"><span class="sub" style="margin:0">Horário</span><input class="field" type="time" id="iFrom" value="08:00" style="width:120px" aria-label="Das"><span class="sub">às</span><input class="field" type="time" id="iTo" value="20:00" style="width:120px" aria-label="Até"></div>
      <h3 class="xh">Bloquear apps</h3><div class="xpick" id="iApps"></div></div>
    <input class="field" id="iName" placeholder="Nome (opcional): Visita, Ana…" style="margin-top:10px" autocomplete="off" aria-label="Nome">
    <button class="btn primary" id="iMake" style="width:100%;margin-top:10px">Criar convite</button>
    <div id="iOut"></div><div class="list" id="iList"></div></div>`;
}
async function bindInviteCard() {
  let role = 'guest';
  $$('[data-irole]').forEach((b) => b.onclick = () => {
    role = b.dataset.irole;
    $$('[data-irole]').forEach((x) => x.setAttribute('aria-pressed', x === b));
    $('#iKids').hidden = role !== 'kids';
  });
  $('#iMake').onclick = async () => {
    const body = { role, deviceHours: +$('#iDur').value, label: $('#iName').value.trim() };
    if (role === 'kids') {
      body.hours = $('#iFrom').value + '-' + ($('#iTo').value === '00:00' ? '24:00' : $('#iTo').value);
      body.blocked = $$('#iApps input:checked').map((c) => c.value);
    }
    try { showInvite(await api('/api/v2/invites', { method: 'POST', json: body })); drawInvites(); } catch (e) { toast(e.message, false); }
  };
  drawInvites();
  await loadApps();
  if ($('#iApps')) $('#iApps').innerHTML = (S.apps || []).filter((a) => !a.system).map((a) => `<label class="xchip"><input type="checkbox" value="${esc(a.pkg)}"><span>${esc(a.label)}</span></label>`).join('') || '<div class="empty">Sem apps</div>';
}
function showInvite(r) {
  $('#iOut').innerHTML = `<div class="invite-out"><p class="sub">Mande este link. Ele vale uma vez, por 24 horas, e a pessoa precisa estar no Wi-Fi da casa:</p>
    <div class="row"><input class="field grow mono" readonly id="iUrl" value="${esc(r.url)}" aria-label="Link do convite"><button class="btn small" id="iCopy">Copiar</button></div>
    <img class="invite-qr" alt="QR Code do convite" onerror="this.remove()" src="${u('/api/v2/qr?text=' + encodeURIComponent(r.url) + '&token=' + encodeURIComponent(S.token))}">
    <p class="sub">Ou aponte a câmera do celular da pessoa para o QR Code. Código: <b class="mono">${esc(r.code)}</b></p></div>`;
  $('#iCopy').onclick = () => copyText(r.url, $('#iUrl'));
}
async function drawInvites() {
  const box = $('#iList');
  if (!box) return;
  try {
    const r = await api('/api/v2/invites');
    box.innerHTML = r.invites.length ? '<h3 class="xh">Convites abertos</h3>' + r.invites.map((i) => `<div class="item"><div class="t"><b>${esc(i.label)} · ${i.role === 'kids' ? 'criança' : 'visita'}</b><small>vale até ${fmtDate(i.expiresAt)}</small></div>
      <button class="btn small danger" data-icancel="${esc(i.code)}" aria-label="Cancelar convite">${icon('trash')}</button></div>`).join('') : '';
    $$('[data-icancel]', box).forEach((b) => b.onclick = () => api('/api/v2/invites/cancel', { method: 'POST', json: { code: b.dataset.icancel } }).then(drawInvites));
  } catch (e) { box.innerHTML = ''; }
}
const roleText = (d) => (d.role === 'kids' ? 'criança' : d.role === 'guest' ? 'visita' : '');
function roleBadge(d) {
  if (!d.role || d.role === 'owner') return '';
  return ` <span class="pill warn">${roleText(d)}</span>`;
}
function roleDetails(d) {
  const parts = [];
  if (d.expires) parts.push('vale até ' + fmtDate(d.expires));
  if (d.hours) parts.push('horário ' + d.hours.replace('-', ' às '));
  if (d.blocked && d.blocked.length) parts.push(d.blocked.length + ' app(s) bloqueado(s)');
  return parts.length ? ' · ' + parts.join(' · ') : '';
}

/** The visitor opened the invite link: get a token for this phone. */
async function redeemInvite(code) {
  showPairing();
  pairMsg('Entrando com o convite…');
  try {
    const r = await api('/api/v2/pair/invite', { method: 'POST', json: { code, name: deviceName() } });
    saveToken(r.token);
    $('#pairView').hidden = true;
    toast(r.device.role === 'kids' ? 'Conectado no modo criança' : 'Conectado como visita');
    start();
  } catch (e) { pairMsg(e.message, true); }
}

/* ---------------------------------------------------------------- 9. gestures */
/** Swipe mode: two fingers up/down change the volume. */
function setupTwoFingerVolume(el) {
  if (!el || el.dataset.twofinger) return;
  el.dataset.twofinger = '1';
  let y0 = null;
  const mid = (e) => (e.touches[0].clientY + e.touches[1].clientY) / 2;
  el.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 2) return;
    S.twoFinger = true; y0 = mid(e); e.preventDefault();
  }, { passive: false });
  el.addEventListener('touchmove', (e) => {
    if (y0 === null || e.touches.length < 2) return;
    e.preventDefault();
    const y = mid(e);
    if (Math.abs(y0 - y) >= 34) { sendKey(y0 > y ? 'volup' : 'voldown'); y0 = y; }
  }, { passive: false });
  const end = (e) => { if (e.touches.length < 2 && y0 !== null) { y0 = null; setTimeout(() => { S.twoFinger = false; }, 80); } };
  el.addEventListener('touchend', end);
  el.addEventListener('touchcancel', end);
}
/** The Android app: shaking the phone (option on) = play/pause. */
window.tvdropShake = () => { if (S.token) { sendKey('playpause'); toast('Play/pausa (você chacoalhou o celular)'); } };

/** A child's phone outside the agreed hours: one clear screen instead of failing buttons. */
function showLocked(message) {
  if ($('#lockedView')) { $('#lockedMsg').textContent = message; return; }
  const v = document.createElement('section');
  v.className = 'pair'; v.id = 'lockedView';
  v.innerHTML = `<div class="box"><div class="logo">${icon('timer')}</div><h1 style="margin:0 0 6px;font-size:26px">Agora não</h1>
    <p class="sub" id="lockedMsg">${esc(message)}</p><button class="btn" id="lockedRetry" style="width:100%;margin-top:14px">Tentar de novo</button></div>`;
  document.body.appendChild(v);
  $('#lockedRetry').onclick = () => loadCaps().then(() => { if (S.caps && !$('#lockedView')) go(S.view); });
}
function hideLocked() { const v = $('#lockedView'); if (v) v.remove(); }
