/* TV Drop — Central Gamer on the TV.
   Screens: catalog → details → waiting room → intro → countdown → match → results → catalog.
   The room (players, phones, messages) and the match engine are the ones the games already use; the games
   themselves are in jogo-*.js. Navigation is made for the TV remote: arrows, OK and Back. */
'use strict';
(() => {
  const { GAMES, ORDER, COLORS, SHAPES, esc, el, Sfx } = J;
  const C = window.CATALOG;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const app = $('#app');
  const KEY = new URLSearchParams(location.search).get('key') || '';
  const REM = () => innerWidth / 96;
  const T = { players: [], screen: 'catalog', gameId: C.featured, room: '', url: '', game: null, inst: null, active: [], timers: [], loops: [], modal: null, last: {}, hero: null, rowOf: {} };
  let ws = null, wsTimer = 0;
  const playable = (id) => !!GAMES[id] && C.byId[id] && C.byId[id].status === 'ready';
  const svg = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`;
  const IC = {
    play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
    swap: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
  };

  /* ================================================================ connection to the room */
  function connect() {
    clearTimeout(wsTimer);
    try { ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/v2/games/ws?role=host&key=' + encodeURIComponent(KEY)); } catch (e) { wsTimer = setTimeout(connect, 2000); return; }
    ws.onopen = () => { $('#net').hidden = true; };
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (err) { return; } try { onHub(m); } catch (err) { console.error(err); } };
    ws.onclose = () => { $('#net').hidden = false; wsTimer = setTimeout(connect, 1500); };
  }
  setInterval(() => { if (ws && ws.readyState === 1) ws.send('p'); }, 15000);
  const raw = (id, msg) => { if (ws && ws.readyState === 1) ws.send(id + '|' + JSON.stringify(msg)); };
  const send = (p, msg) => raw(p.id, msg);
  const all = (msg) => raw('*', msg);

  function onHub(m) {
    if (m.t === 'room') { T.room = m.code; T.url = m.url; if (T.screen === 'lobby') renderLobby(); }
    else if (m.t === 'join') { const p = byId(m.id); if (p) { p.on = true; clearTimeout(p.gone); sync(p); changed(); if (T.inst && p.active && T.inst.onJoin) T.inst.onJoin(p); } else raw(m.id, { t: 'who' }); }
    else if (m.t === 'leave') { if (m.kicked) { T.players = T.players.filter((x) => x.id !== m.id); changed(); } else left(m.id); }
    else if (m.t === 'm') onMsg(m.id, m.d);
  }

  /* ================================================================ players */
  const byId = (id) => T.players.find((p) => p.id === id);
  const leader = () => T.players.find((p) => p.on) || null;
  const online = () => T.players.filter((p) => p.on);
  const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12);
  const pub = (p) => ({ id: p.id, name: p.name, color: p.color, shape: p.shape, idx: p.idx, on: p.on, cups: p.cups, active: p.active });
  const quiet = () => T.screen === 'catalog' || T.screen === 'details' || T.screen === 'lobby';

  function hello(id, d) {
    let p = byId(id);
    const name = cleanName(d.name);
    if (!p) {
      const used = new Set(T.players.map((x) => x.idx));
      let idx = 0; while (used.has(idx)) idx++;
      if (idx >= 6) { raw(id, { t: 'full' }); return; }
      const shapesUsed = new Set(T.players.map((x) => x.shape));
      const wanted = SHAPES.includes(d.shape) && !shapesUsed.has(d.shape) ? d.shape : SHAPES.find((s) => !shapesUsed.has(s)) || SHAPES[idx];
      p = { id, name: name || 'Jogador ' + (idx + 1), idx, color: COLORS[idx], shape: wanted, on: true, cups: 0, active: false, fresh: true };
      T.players.push(p);
      Sfx.play('join');
    } else { if (name) p.name = name; p.on = true; clearTimeout(p.gone); }
    sync(p);
    changed();
  }
  function left(id) {
    const p = byId(id);
    if (!p) return;
    p.on = false;
    if (T.inst && p.active && T.inst.onLeave) { try { T.inst.onLeave(p); } catch (e) { console.error(e); } }
    if (quiet()) prune(p);
    changed();
  }
  /** Outside a match, a phone that went away loses its place after a while (a locked screen comes back sooner). */
  function prune(p) {
    clearTimeout(p.gone);
    p.gone = setTimeout(() => { if (!p.on && quiet()) { T.players = T.players.filter((x) => x !== p); Sfx.play('leave'); changed(); } }, 15000);
  }
  function kick(p) {
    if (ws && ws.readyState === 1) ws.send('!kick|' + p.id);
    T.players = T.players.filter((x) => x !== p);
    Sfx.play('leave');
    toast(`${p.name} saiu da sala`);
    changed();
  }

  function roomState() {
    const l = leader();
    const state = T.screen === 'count' ? 'intro' : T.screen === 'details' ? 'catalog' : T.screen;
    return { t: 'lobby', state, room: T.room, players: T.players.map(pub), leader: l ? l.id : null, sel: T.gameId,
      game: T.game ? T.game.id : null,
      games: ORDER.filter(playable).map((id) => { const g = GAMES[id]; return { id, name: g.name, tagline: g.tagline, min: g.min, max: g.max, grad: g.grad, icon: g.icon }; }) };
  }
  /** Something about the room changed: tell every phone and update what the TV shows. */
  function changed() {
    all(roomState());
    if (T.screen === 'lobby') updateLobby();
    if (T.screen === 'catalog') updatePlayersChip();
  }
  function sync(p) {
    send(p, roomState());
    if ((T.screen === 'intro' || T.screen === 'count') && p.active) send(p, { t: 'game', g: T.game.id, phase: 'intro' });
    if (T.screen === 'play' && p.active) { send(p, { t: 'game', g: T.game.id, phase: 'play' }); if (T.inst && T.inst.sync) T.inst.sync(p); }
    if (T.screen === 'results' && T.last[p.id]) send(p, T.last[p.id]);
  }

  function onMsg(id, d) {
    if (!d || typeof d !== 'object') return;
    if (d.t === 'hello') { hello(id, d); return; }
    const p = byId(id);
    if (!p) { raw(id, { t: 'who' }); return; }
    const lead = leader() === p;
    switch (d.t) {
      case 'shape': if (quiet()) { const used = new Set(T.players.filter((x) => x !== p).map((x) => x.shape)); let i = SHAPES.indexOf(p.shape); for (let k = 0; k < 6; k++) { i = (i + 1) % 6; if (!used.has(SHAPES[i])) break; } p.shape = SHAPES[i]; p.fresh = true; Sfx.play('pop'); changed(); } break;
      case 'name': { const n = cleanName(d.name); if (n) { p.name = n; changed(); } break; }
      case 'wave': { const s = $(`.pcard[data-id="${p.id}"]`); if (s) { s.classList.remove('new'); void s.offsetWidth; s.classList.add('new'); Sfx.play('pop'); } break; }
      case 'pick': if (lead && T.screen === 'lobby' && playable(d.g) && d.g !== T.gameId) { T.gameId = d.g; Sfx.play('move'); renderLobby(); all(roomState()); } break;
      case 'start': if (lead) { if (T.screen === 'lobby') tryStart(); else if (T.screen === 'intro') countdown(); } break;
      case 'again': if (lead && T.screen === 'results') tryStart(T.game.id); break;
      case 'menu': if (lead && T.screen === 'results') toCatalog(); break;
      case 'g': if (T.screen === 'play' && p.active && T.inst) T.inst.onMsg(p, d); break;
      default: break;
    }
  }

  /* ================================================================ focus (TV remote) */
  // F.rows: arrays of focusable elements, top to bottom. Left/right inside a row; up/down picks the item
  // in the next row closest to the current one horizontally.
  const F = { rows: [], r: 0, c: 0, onMove: null };
  function setRows(rows, r = 0, c = 0) { F.rows = rows.filter((x) => x.length); F.r = Math.min(r, F.rows.length - 1); F.c = Math.min(c, (F.rows[F.r] || []).length - 1); paint(); }
  function cur() { return (F.rows[F.r] || [])[F.c]; }
  function paint() {
    $$('.is-focus').forEach((x) => x.classList.remove('is-focus'));
    const e = cur();
    if (e) e.classList.add('is-focus');
    if (F.onMove) F.onMove(e);
  }
  function move(k) {
    if (!F.rows.length) return false;
    const row = F.rows[F.r];
    if (k === 'left' || k === 'right') {
      const n = F.c + (k === 'left' ? -1 : 1);
      if (n < 0 || n >= row.length) return false;
      F.c = n;
    } else {
      const nr = F.r + (k === 'up' ? -1 : 1);
      if (nr < 0 || nr >= F.rows.length) return false;
      const x = cur().getBoundingClientRect();
      const cx = x.left + x.width / 2;
      let best = 0, bd = 1e9;
      F.rows[nr].forEach((e, i) => { const r = e.getBoundingClientRect(); const d = Math.abs(r.left + r.width / 2 - cx); if (d < bd) { bd = d; best = i; } });
      F.r = nr; F.c = best;
    }
    Sfx.play('move');
    paint();
    return true;
  }
  function press() { const e = cur(); if (e && e._act) { Sfx.play('select'); e._act(); } }

  /* ================================================================ shared pieces */
  const coverUrl = (id, w = 960, title = true) => Covers.url(id, { w, title });
  function backdrop(root) {
    const b = el('div', 'backdrop');
    b.innerHTML = '<div class="bd-layer"></div><div class="bd-layer"></div><div class="bd-shade"></div>';
    root.prepend(b);
    let front = null;
    return {
      /** Shows this game behind the screen: its trailer when it has one, its art (slowly moving) otherwise. */
      show(id) {
        const g = C.byId[id];
        const layers = $$('.bd-layer', b);
        const next = layers.find((x) => x !== front) || layers[0];
        next.innerHTML = '';
        next.className = 'bd-layer';
        const art = coverUrl(id, 1600, false);
        if (g.trailer && !document.documentElement.classList.contains('novideo')) {
          const v = document.createElement('video');
          v.muted = true; v.loop = true; v.autoplay = true; v.playsInline = true; v.preload = 'auto';
          v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
          v.poster = art; v.src = g.trailer;
          v.onerror = () => { next.innerHTML = `<img alt="" src="${art}">`; next.classList.add('art'); };
          next.appendChild(v);
          const p = v.play(); if (p && p.catch) p.catch(() => {});
        } else { next.innerHTML = `<img alt="" src="${art}">`; next.classList.add('art'); }
        requestAnimationFrame(() => { next.classList.add('on'); if (front) front.classList.remove('on'); const old = front; front = next; setTimeout(() => { if (old && old !== front) old.innerHTML = ''; }, 1000); });
      },
      stop() { $$('video', b).forEach((v) => { try { v.pause(); } catch (e) { /* ignore */ } }); },
    };
  }
  const metaChips = (g) => `<span class="gchip">${svg(IC.users).replace('<svg', '<svg style="width:1rem;height:1rem;fill:none;stroke:currentColor;stroke-width:2"')}${esc(C.players(g))}</span><span class="gchip">${esc(C.minutes(g))}</span><span class="gchip">${esc(C.category(g))}</span>${g.status === 'ready' ? '<span class="gchip ok"><i></i>Disponível</span>' : '<span class="gchip soon">Em breve</span>'}`;
  function topbar(root, extra = '') {
    const t = el('div', 'gtop');
    t.innerHTML = `<div class="gbrand"><i></i>TV Drop <span>Central Gamer</span></div><div class="grow"></div><span class="gchip" id="pchip" hidden></span>${extra}`;
    root.appendChild(t);
    return t;
  }
  function updatePlayersChip() {
    const c = $('#pchip');
    if (!c) return;
    const n = online().length;
    c.hidden = !n;
    c.innerHTML = `${svg(IC.users).replace('<svg', '<svg style="width:1rem;height:1rem;fill:none;stroke:currentColor;stroke-width:2"')}${n} ${n === 1 ? 'jogador na sala' : 'jogadores na sala'}`;
  }
  function toast(text) {
    $$('.toast2').forEach((x) => x.remove());
    const t = el('div', 'toast2 glass', esc(text));
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }
  function stopVideos() { $$('video').forEach((v) => { try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) { /* ignore */ } }); }

  /* ================================================================ catalog */
  function renderCatalog(focusId) {
    T.screen = 'catalog';
    stopVideos();
    app.innerHTML = '';
    const scr = el('section', 'scr cat');
    app.appendChild(scr);
    const bd = backdrop(scr);
    topbar(scr, '<span class="ghint"><b>OK</b> escolher · <b>Voltar</b> sair</span>');
    const sc = el('div', 'scroller');
    sc.innerHTML = `<div class="hero"></div><div class="rails">${C.rails.map((r, ri) => `<div class="rail" data-r="${ri}"><h2>${esc(r.title)}<small>${r.ids.length} ${r.ids.length === 1 ? 'jogo' : 'jogos'}</small></h2><div class="track">${r.ids.map((id) => tile(id)).join('')}</div></div>`).join('')}</div>`;
    scr.appendChild(sc);
    const hero = $('.hero', sc);
    const showHero = (id) => {
      const g = C.byId[id];
      T.hero = id;
      hero.style.setProperty('--glow', g.color);
      hero.innerHTML = `<div class="swap"><div class="t-eyebrow">${g.status === 'ready' ? 'Em destaque' : 'Em breve'} · ${esc(C.category(g))}</div>
        <h1 class="t-display">${esc(g.name)}</h1><p class="tag">${esc(g.tagline)}</p><div class="meta">${metaChips(g)}</div>
        <div class="acts"><button class="gbtn primary ${g.status === 'ready' ? '' : 'off'}" data-a="play">${svg(IC.play)}${g.status === 'ready' ? 'Jogar agora' : 'Em breve'}</button><button class="gbtn" data-a="info">${svg(IC.info)}Ver detalhes</button></div></div>`;
      const [pb, ib] = $$('.acts .gbtn', hero);
      pb._act = () => (g.status === 'ready' ? openLobby(id) : (toast(`${g.name} ainda está em desenvolvimento`), Sfx.play('bad')));
      ib._act = () => renderDetails(id);
      return [pb, ib];
    };
    let heroTimer = 0, heroBtns = showHero(focusId || T.hero || C.featured);
    bd.show(T.hero);
    // tiles: cover art, OK opens the details
    $$('.tile', sc).forEach((t) => {
      t._act = () => renderDetails(t.dataset.id);
      t.style.setProperty('--glow', C.byId[t.dataset.id].color);
    });
    const rows = () => [heroBtns, ...$$('.rail', sc).map((r) => $$('.tile', r))];
    let startRow = 0, startCol = 0;
    if (focusId) {
      const rails = $$('.rail', sc);
      for (let i = 0; i < rails.length; i++) { const k = $$('.tile', rails[i]).findIndex((t) => t.dataset.id === focusId); if (k >= 0) { startRow = i + 1; startCol = k; break; } }
    }
    F.onMove = (e) => {
      if (!e) return;
      const railEl = e.closest('.rail');
      $$('.rail').forEach((r) => r.classList.toggle('cur', r === railEl));
      if (railEl) {
        const id = e.dataset.id;
        if (id !== T.hero) {
          clearTimeout(heroTimer);
          heroTimer = setTimeout(() => { heroBtns = showHero(id); F.rows[0] = heroBtns; bd.show(id); }, 380);
        }
        // keep the focused tile in view
        const track = $('.track', railEl), tiles = $$('.tile', railEl), i = tiles.indexOf(e);
        const step = tiles[1] ? tiles[1].offsetLeft - tiles[0].offsetLeft : 0;
        const visible = Math.max(1, Math.floor((innerWidth - 8 * REM()) / Math.max(1, step)));
        const first = Math.max(0, Math.min(i - visible + 2, tiles.length - visible));
        track.style.transform = `translateX(${-Math.max(0, first) * step}px)`;
      }
      // vertical: the first rail sits under the hero; lower rails scroll up and the hero steps back
      const r = F.r;
      scr.classList.toggle('deep', r >= 2);
      const rails = $$('.rail', sc);
      // lower rails: the focused one moves up to just under the top bar (the ones above leave the screen)
      const y = r >= 2 ? $('.rails', sc).offsetTop + rails[r - 1].offsetTop - 7.6 * REM() : 0;
      sc.style.transform = `translateY(${-y}px)`;
    };
    setRows(rows(), startRow, startCol);
    updatePlayersChip();
    all(roomState());
  }
  function tile(id) {
    const g = C.byId[id];
    return `<div class="tile ${g.status === 'ready' ? '' : 'soon'}" data-id="${id}">${g.status === 'ready' ? '' : '<span class="badge gchip soon glass">Em breve</span>'}
      <div class="art"><img alt="" src="${coverUrl(id, 640)}"><div class="shine"></div></div>
      <div class="cap"><b>${esc(g.name)}</b><span>${esc(C.players(g))} · ${esc(C.minutes(g))}</span></div></div>`;
  }

  /* ================================================================ details */
  function renderDetails(id) {
    const g = C.byId[id];
    T.screen = 'details'; T.gameId = id; T.hero = id;
    stopVideos();
    app.innerHTML = '';
    const scr = el('section', 'scr det');
    app.appendChild(scr);
    const bd = backdrop(scr);
    bd.show(id);
    topbar(scr, '<span class="ghint"><b>Voltar</b> catálogo</span>');
    const body = el('div', 'det-body');
    body.innerHTML = `<div class="t-eyebrow">${esc(C.category(g))}${g.status === 'ready' ? '' : ' · Em breve'}</div>
      <h1 class="t-display">${esc(g.name)}</h1><p class="desc">${esc(g.description)}</p>
      <dl class="facts"><div><dt>Jogadores</dt><dd>${esc(C.players(g).replace(' jogadores', ''))}</dd></div><div><dt>Partida</dt><dd>${esc(C.minutes(g))}</dd></div><div><dt>Categoria</dt><dd>${esc(C.category(g))}</dd></div><div><dt>Situação</dt><dd style="color:${g.status === 'ready' ? 'var(--ok)' : 'var(--accent)'}">${g.status === 'ready' ? 'Disponível' : 'Em desenvolvimento'}</dd></div></dl>
      <div class="steps">${g.how.map((h, i) => `<div class="step glass"><b><em>0${i + 1}</em>${esc(h[0])}</b><p>${esc(h[1])}</p></div>`).join('')}</div>
      <div class="acts">${g.status === 'ready' ? `<button class="gbtn primary" data-a="play">${svg(IC.play)}Jogar</button>` : `<button class="gbtn primary off" data-a="play">Em breve</button>`}<button class="gbtn" data-a="back">${svg(IC.back)}Voltar</button>${g.status === 'ready' ? '' : '<span class="soon-note">Este jogo está em desenvolvimento.</span>'}</div>`;
    scr.appendChild(body);
    const [pb, bb] = $$('.acts .gbtn', body);
    pb._act = () => (g.status === 'ready' ? openLobby(id) : (toast(`${g.name} ainda está em desenvolvimento`), Sfx.play('bad')));
    bb._act = () => renderCatalog(id);
    F.onMove = null;
    setRows([[pb, bb]], 0, g.status === 'ready' ? 0 : 1);
    all(roomState());
  }

  /* ================================================================ waiting room */
  function openLobby(id) {
    if (!playable(id)) return;
    T.gameId = id;
    renderLobby();
  }
  function renderLobby() {
    const g = C.byId[T.gameId], run = GAMES[T.gameId];
    T.screen = 'lobby';
    stopVideos();
    app.innerHTML = '';
    const scr = el('section', 'scr lob');
    scr.style.setProperty('--game-a', J.rgba(g.color, 0.26));
    scr.style.setProperty('--game-b', J.rgba(g.color2, 0.22));
    app.appendChild(scr);
    topbar(scr, '<span class="ghint"><b>Voltar</b> detalhes do jogo</span>');
    const grid = el('div', 'lob-grid');
    grid.innerHTML = `<div class="join2 glass"><h2>Entre pelo celular</h2>
        <div class="qr2"><img alt="QR Code da sala" src="/api/v2/games/qr?key=${encodeURIComponent(KEY)}&r=${esc(T.room)}"></div>
        <p>Aponte a câmera do celular para o código,<br>ou abra no navegador:</p>
        <div class="url2">${esc(T.url.replace(/^https?:\/\//, '') || 'carregando…')}</div>
        <div class="t-eyebrow">Código da sala</div>
        <div class="digits">${(T.room || '····').split('').map((c) => `<span>${esc(c)}</span>`).join('')}</div></div>
      <div class="lob-main">
        <div class="lob-game"><img alt="" src="${coverUrl(g.id, 640)}"><div><div class="t-eyebrow">Sala de espera</div><h1 class="t-display">${esc(g.name)}</h1><div class="meta">${metaChips(g)}</div></div></div>
        <div class="pgrid"></div>
        <div class="lob-foot"><button class="gbtn primary" data-a="start">${svg(IC.play)}Iniciar partida</button><button class="gbtn" data-a="swap">${svg(IC.swap)}Trocar de jogo</button><span class="lob-msg"></span></div>
      </div>`;
    scr.appendChild(grid);
    const img = $('.qr2 img', grid);
    img.onerror = () => { const q = $('.qr2', grid); q.classList.add('none'); q.textContent = 'Abra o endereço abaixo no navegador do celular'; };
    const [sb, wb] = $$('.lob-foot .gbtn', grid);
    sb._act = () => tryStart();
    wb._act = () => renderCatalog(g.id);
    void run;
    updateLobby(true);
    all(roomState());
  }
  /** Redraws only the players and the start button, keeping the focus where it was. */
  function updateLobby(first) {
    const box = $('.pgrid');
    if (!box) return;
    const run = GAMES[T.gameId];
    const l = leader();
    const before = cur();
    const keepId = before && before.dataset ? before.dataset.id : null;
    let html = '';
    for (let i = 0; i < 6; i++) {
      const p = T.players.find((x) => x.idx === i);
      html += p ? `<div class="pcard glass ${p.on ? '' : 'off'} ${p.fresh ? 'new' : ''}" data-id="${p.id}"><span data-buddy="${p.id}"></span><div class="who"><b>${esc(p.name)}</b><div class="st"><i></i>${p.on ? 'Conectado' : 'Reconectando…'}</div></div>${p === l ? '<span class="host">Anfitrião</span>' : ''}<span class="x">OK remove</span></div>`
        : `<div class="pcard empty">Vaga livre</div>`;
    }
    box.innerHTML = html;
    $$('[data-buddy]', box).forEach((s) => { const p = byId(s.dataset.buddy); if (p) s.replaceWith(J.buddyEl(p, Math.round(6.4 * REM()), p.on ? 'happy' : 'sad')); });
    T.players.forEach((p) => { p.fresh = false; });
    const n = online().length, need = run.min - n;
    const msg = $('.lob-msg');
    const sb = $('.lob-foot .gbtn.primary');
    sb.classList.toggle('off', need > 0);
    msg.className = 'lob-msg ' + (need > 0 ? 'need' : 'ok');
    msg.textContent = !T.players.length ? 'Esperando os jogadores entrarem…' : need > 0 ? `Faltam ${need} ${need === 1 ? 'jogador' : 'jogadores'} (mínimo ${run.min})` : `${n} ${n === 1 ? 'jogador pronto' : 'jogadores prontos'}${n > run.max ? ` · jogam os ${run.max} primeiros` : ''}`;
    const cards = $$('.pcard[data-id]', box);
    cards.forEach((c) => { c._act = () => { const p = byId(c.dataset.id); if (p) confirmBox(`Remover ${p.name}?`, 'O celular sai da sala e pode entrar de novo com o código.', [['Remover', () => kick(p)], ['Cancelar', null]]); }; });
    const foot = $$('.lob-foot .gbtn');
    const rows = [cards.slice(0, 3), cards.slice(3), foot];
    F.onMove = null;
    if (first) { setRows(rows, rows.length - 1, 0); return; }
    // keep the focus on the same player (or on the buttons)
    const flat = rows.filter((x) => x.length);
    let r = flat.length - 1, c = foot.indexOf(before);
    if (keepId) flat.forEach((row, ri) => row.forEach((e, ci) => { if (e.dataset.id === keepId) { r = ri; c = ci; } }));
    setRows(rows, r, Math.max(0, c));
  }

  /* ================================================================ start a match */
  function tryStart(id) {
    const gid = id || T.gameId;
    const g = GAMES[gid];
    if (!g) return;
    const on = online();
    if (on.length < g.min) {
      Sfx.play('bad');
      toast(`${g.name} precisa de pelo menos ${g.min} jogadores`);
      all({ t: 'toast', text: `${g.name} precisa de pelo menos ${g.min} jogadores` });
      if (T.screen !== 'lobby') { T.gameId = gid; renderLobby(); }
      return;
    }
    startGame(gid);
  }
  function stopGame() {
    T.timers.forEach((id) => clearTimeout(id)); T.timers = [];
    T.loops.forEach((stop) => stop()); T.loops = [];
    if (T.inst && T.inst.stop) { try { T.inst.stop(); } catch (e) { console.error(e); } }
    T.inst = null;
    clearTimeout(T.introTimer); clearInterval(T.countTimer);
    $$('.countdown, .confetti').forEach((x) => x.remove());
  }
  function startGame(id) {
    stopGame();
    stopVideos();
    const g = GAMES[id], meta = C.byId[id];
    T.game = g; T.gameId = id;
    T.active = online().slice(0, g.max);
    T.players.forEach((p) => { p.active = T.active.includes(p); });
    T.screen = 'intro'; T.last = {};
    all(roomState());
    T.active.forEach((p) => send(p, { t: 'game', g: id, phase: 'intro' }));
    Sfx.play('select');
    app.innerHTML = '';
    const scr = el('section', 'scr intro2');
    app.appendChild(scr);
    const b = el('div', 'backdrop');
    b.innerHTML = `<div class="bd-layer on art"><img alt="" src="${coverUrl(id, 1600, false)}"></div><div class="bd-shade"></div>`;
    scr.appendChild(b);
    const body = el('div', 'intro2-body');
    body.innerHTML = `<div class="t-eyebrow" style="color:var(--accent)">Prepare-se</div><h1 class="t-display">${esc(meta.name)}</h1><p class="tag">${esc(meta.tagline)}</p>
      <div class="steps">${meta.how.map((h, i) => `<div class="step glass"><b><em>0${i + 1}</em>${esc(h[0])}</b><p>${esc(h[1])}</p></div>`).join('')}</div>
      <div class="bar"><i style="animation-duration:8s"></i></div><div class="ghint">Olhe o celular: os controles já estão lá · <b>OK</b> começa agora</div>`;
    scr.appendChild(body);
    F.rows = []; F.onMove = null;
    T.introTimer = setTimeout(countdown, 8000);
  }
  function countdown() {
    if (T.screen !== 'intro') return;
    clearTimeout(T.introTimer);
    T.screen = 'count';
    const box = el('div', 'countdown');
    document.body.appendChild(box);
    let n = 3;
    const show = () => {
      if (n === 0) { clearInterval(T.countTimer); box.remove(); begin(); return; }
      box.innerHTML = `<b>${n}</b>`; Sfx.play('count'); T.active.forEach((p) => send(p, { t: 'count', n })); n--;
    };
    show();
    T.countTimer = setInterval(show, 850);
  }
  function begin() {
    T.screen = 'play';
    app.innerHTML = '';
    const stage = el('div', 'stage');
    app.appendChild(stage);
    Sfx.play('go');
    T.inst = T.game.tv(makeApi(stage));
    T.active.forEach((p) => send(p, { t: 'go' }));
    T.inst.start();
  }

  /** What a game gets to work with. Timers and loops are stopped for it when the game ends. */
  function makeApi(stage) {
    const safe = (fn) => (...a) => { try { return fn(...a); } catch (e) { console.error(e); } };
    return {
      stage, players: T.active, W: 1280, H: 720, rem: REM,
      send: (p, m) => send(p, { t: 'g', ...m }),
      all: (m) => T.active.forEach((p) => send(p, { t: 'g', ...m })),
      fx: (p, k, d) => send(p, { t: 'fx', k, ...(d || {}) }),
      fxAll: (k, d) => T.active.forEach((p) => send(p, { t: 'fx', k, ...(d || {}) })),
      sfx: Sfx.play,
      after(ms, fn) { const id = setTimeout(safe(fn), ms); T.timers.push(id); return id; },
      every(ms, fn) { const id = setInterval(safe(fn), ms); T.timers.push(id); return id; },
      cancel(id) { clearTimeout(id); clearInterval(id); },
      loop(fn) {
        let lastT = performance.now(), live = true;
        const tick = (now) => { if (!live) return; const dt = Math.max(0, Math.min(0.05, (now - lastT) / 1000)); lastT = now; try { fn(dt, now / 1000); } catch (e) { console.error(e); } requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
        const stop = () => { live = false; };
        T.loops.push(stop);
        return stop;
      },
      canvas() { const cv = el('canvas', 'full'); cv.width = 1280; cv.height = 720; stage.appendChild(cv); return cv.getContext('2d'); },
      buddy: (p, rem, mood) => J.buddyEl(p, Math.round(rem * REM()), mood),
      topbar(withTimer) {
        const bar = el('div', 'topbar');
        const chips = {};
        T.active.forEach((p) => { const c = el('div', 'chip'); c.appendChild(J.buddyEl(p, Math.round(2.4 * REM()))); c.appendChild(el('span', '', esc(p.name))); const em = el('em'); c.appendChild(em); bar.appendChild(c); chips[p.id] = { c, em }; });
        bar.appendChild(el('div', 'grow'));
        const timer = el('div', 'timer'); timer.hidden = !withTimer; bar.appendChild(timer);
        stage.appendChild(bar);
        return {
          el: bar,
          score(p, text) { const x = chips[p.id]; if (!x) return; if (x.em.textContent !== String(text)) { x.em.textContent = text; x.c.classList.remove('bump'); void x.c.offsetWidth; x.c.classList.add('bump'); } },
          out(p, isOut) { if (chips[p.id]) chips[p.id].c.classList.toggle('out', !!isOut); },
          time(sec) { timer.hidden = sec == null; timer.textContent = sec == null ? '' : Math.max(0, Math.ceil(sec)); timer.classList.toggle('low', sec != null && sec <= 5 && sec > 0); },
        };
      },
      banner(text, small) { const b = el('div', 'banner', esc(text) + (small ? `<small>${esc(small)}</small>` : '')); stage.appendChild(b); setTimeout(() => b.remove(), 2300); },
      end: (scores) => finish(scores),
    };
  }

  /* ================================================================ results */
  function finish(scores) {
    const g = T.game;
    stopGame();
    T.screen = 'results';
    const rows = scores.map((s) => ({ p: byId(s.id), pts: Math.round(s.pts || 0), note: s.note || '' })).filter((r) => r.p).sort((a, b) => b.pts - a.pts);
    rows.forEach((r) => { r.place = 1 + rows.filter((x) => x.pts > r.pts).length; });
    const winners = rows.filter((r) => r.place === 1);
    winners.forEach((r) => { r.p.cups++; });
    const unit = g.unit || 'pontos';
    const col = (r, cls, h) => r ? `<div class="pcol ${cls}" style="--c:${r.p.color}"><div class="crown">${r.place === 1 ? '👑' : ''}</div><span data-buddy="${r.p.id}" data-mood="${r.place === 1 ? 'happy' : r.place === rows.length && rows.length > 2 ? 'sad' : 'wow'}"></span><b>${esc(r.p.name)}</b><span class="pts">${J.fmtPts(r.pts)} ${esc(J.unit(r.pts, unit))}${r.note ? ' · ' + esc(r.note) : ''}</span><div class="bar" style="height:${h}rem">${r.place}º</div></div>` : '';
    const rest = rows.slice(3).map((r) => `<span class="chip"><span data-buddy="${r.p.id}"></span>${r.place}º ${esc(r.p.name)}<em>${J.fmtPts(r.pts)}</em></span>`).join('');
    const title = winners.length > 1 ? 'Empate!' : `${esc(winners[0] ? winners[0].p.name : '')} venceu!`;
    app.innerHTML = `<section class="screen results"><div class="gbrand"><i></i>${esc(C.byId[g.id] ? C.byId[g.id].name : g.name)}</div>
      <h1 class="t-display">${title}</h1><div class="sub">Placar da noite: ${T.players.filter((p) => p.cups).sort((a, b) => b.cups - a.cups).map((p) => `${esc(p.name)} 🏆${p.cups}`).join(' · ')}</div>
      <div class="podium">${col(rows[1], '', 12)}${col(rows[0], 'first', 17)}${col(rows[2], '', 8.5)}</div>
      <div class="topbar" style="position:static;justify-content:center">${rest}</div>
      <div class="res-acts"><button class="gbtn primary">${svg(IC.play)}Jogar de novo</button><button class="gbtn">Voltar ao catálogo</button></div></section>`;
    $$('.pcol [data-buddy]').forEach((s) => { const p = byId(s.dataset.buddy); s.replaceWith(J.buddyEl(p, Math.round(11 * REM()), s.dataset.mood)); });
    $$('.topbar [data-buddy]').forEach((s) => { const p = byId(s.dataset.buddy); if (p) s.replaceWith(J.buddyEl(p, Math.round(2.4 * REM()))); });
    const [again, back] = $$('.res-acts .gbtn');
    again._act = () => tryStart(g.id);
    back._act = () => toCatalog();
    F.onMove = null;
    setRows([[again, back]]);
    Sfx.play('drum'); setTimeout(() => Sfx.play('win'), 950);
    confetti();
    rows.forEach((r) => { T.last[r.p.id] = { t: 'end', place: r.place, n: rows.length, pts: r.pts, unit, win: r.place === 1, game: g.name, note: r.note }; send(r.p, T.last[r.p.id]); });
    all(roomState());
  }
  function confetti() {
    const cv = el('canvas', 'confetti'); cv.width = 1280; cv.height = 720; cv.style.width = '100%'; cv.style.height = '100%';
    document.body.appendChild(cv);
    const c = cv.getContext('2d');
    const bits = Array.from({ length: 150 }, () => ({ x: J.rand(0, 1280), y: J.rand(-700, -10), vx: J.rand(-40, 40), vy: J.rand(140, 330), r: J.rand(0, 6), vr: J.rand(-6, 6), w: J.rand(8, 16), h: J.rand(5, 10), color: J.pick(COLORS) }));
    let lastT = performance.now(), t = 0;
    const tick = (now) => {
      if (!cv.isConnected) return;
      const dt = Math.max(0, Math.min(0.05, (now - lastT) / 1000)); lastT = now; t += dt;
      c.clearRect(0, 0, 1280, 720);
      for (const b of bits) { b.x += b.vx * dt; b.y += b.vy * dt; b.r += b.vr * dt; c.save(); c.translate(b.x, b.y); c.rotate(b.r); c.fillStyle = b.color; c.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.abs(Math.cos(b.r * 1.7))); c.restore(); }
      if (t < 6) requestAnimationFrame(tick); else cv.remove();
    };
    requestAnimationFrame(tick);
  }
  /** After a match (or when it is cancelled): back to the catalog; the room stays open with everyone in it. */
  function toCatalog() {
    const id = T.game ? T.game.id : T.gameId;
    stopGame();
    T.game = null; T.active = [];
    T.players.forEach((p) => { p.active = false; p.fresh = true; if (!p.on) prune(p); });
    renderCatalog(id);
  }

  /* ================================================================ modal + remote */
  function confirmBox(title, text, buttons) {
    const m = $('#modal');
    m.innerHTML = `<div class="glass"><h2>${esc(title)}</h2><p>${esc(text)}</p><div class="acts">${buttons.map(([label], i) => `<button class="gbtn ${i === 0 ? 'primary' : ''}">${esc(label)}</button>`).join('')}</div></div>`;
    m.hidden = false;
    const saved = { rows: F.rows, r: F.r, c: F.c, onMove: F.onMove };
    const btns = $$('.gbtn', m);
    const close = () => { m.hidden = true; T.modal = null; F.rows = saved.rows; F.r = saved.r; F.c = saved.c; F.onMove = saved.onMove; paint(); };
    btns.forEach((b, i) => { b._act = () => { close(); if (buttons[i][1]) buttons[i][1](); }; });
    T.modal = { close };
    F.onMove = null;
    setRows([btns], 0, buttons.length > 1 ? 1 : 0); // the safe choice is focused first
  }

  window.tvKey = (k) => {
    Sfx.unlock();
    if (T.modal) { if (k === 'back') T.modal.close(); else if (k === 'ok') press(); else move(k); return true; }
    switch (T.screen) {
      case 'catalog':
        if (k === 'back') confirmBox('Sair da Central Gamer?', online().length ? 'A sala fecha e os celulares conectados saem.' : 'Você volta para a tela do TV Drop.', [['Sair', () => { if (window.TVHost) window.TVHost.exit(); }], ['Continuar', null]]);
        else if (k === 'ok') press(); else move(k);
        break;
      case 'details':
        if (k === 'back') renderCatalog(T.gameId); else if (k === 'ok') press(); else move(k);
        break;
      case 'lobby':
        if (k === 'back') renderDetails(T.gameId); else if (k === 'ok') press(); else move(k);
        break;
      case 'intro':
        if (k === 'ok') countdown(); else if (k === 'back') { stopGame(); T.active = []; T.players.forEach((p) => { p.active = false; }); renderLobby(); }
        break;
      case 'play':
        if (k === 'back') confirmBox('Encerrar esta partida?', 'Todos voltam para o catálogo e ninguém pontua.', [['Encerrar', toCatalog], ['Continuar jogando', null]]);
        else if (T.inst && T.inst.onKey) T.inst.onKey(k);
        break;
      case 'results':
        if (k === 'back') toCatalog(); else if (k === 'ok') press(); else move(k);
        break;
      default: break;
    }
    return true;
  };
  addEventListener('keydown', (e) => {
    const k = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Enter: 'ok', Escape: 'back', Backspace: 'back' }[e.key];
    if (k) { e.preventDefault(); window.tvKey(k); }
  });

  /* ================================================================ start */
  // weak TV GPUs: measure the first second of animation; if frames are slow, turn off blur and moving art
  (() => {
    let n = 0, t0 = 0;
    const tick = (t) => { if (!t0) t0 = t; n++; if (t - t0 < 1500) requestAnimationFrame(tick); else if (n / ((t - t0) / 1000) < 40) document.documentElement.classList.add('lowfx'); };
    requestAnimationFrame(tick);
  })();
  window.TV_STATE = T; // for automated tests and the trailer recorder
  window.Central = { details: renderDetails, lobby: openLobby, start: tryStart, catalog: renderCatalog };
  Covers.ready().then(() => { renderCatalog(); connect(); });
})();
