/* TV Drop Jogos — the TV screen: room, players, game picker, countdown, results.
   The games themselves are in jogo-*.js; this file gives them players, timers, sounds and the stage. */
'use strict';
(() => {
  const { GAMES, ORDER, COLORS, SHAPES, esc, el, Sfx } = J;
  const $ = (s, r = document) => r.querySelector(s);
  const app = $('#app');
  const KEY = new URLSearchParams(location.search).get('key') || '';
  const REM = () => innerWidth / 96;
  const T = { players: [], state: 'lobby', sel: 0, room: '', url: '', game: null, inst: null, active: [], timers: [], loops: [], modal: null, last: {} };
  let ws = null, wsTimer = 0;

  /* ---------------------------------------------------------------- connection to the room */
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
    if (m.t === 'room') { T.room = m.code; T.url = m.url; if (T.state === 'lobby') renderLobby(); }
    else if (m.t === 'join') { const p = byId(m.id); if (p) { p.on = true; clearTimeout(p.gone); sync(p); changed(); if (T.inst && p.active && T.inst.onJoin) T.inst.onJoin(p); } else raw(m.id, { t: 'who' }); }
    else if (m.t === 'leave') left(m.id);
    else if (m.t === 'm') onMsg(m.id, m.d);
  }

  /* ---------------------------------------------------------------- players */
  const byId = (id) => T.players.find((p) => p.id === id);
  const leader = () => T.players.find((p) => p.on) || null;
  const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12);
  const pub = (p) => ({ id: p.id, name: p.name, color: p.color, shape: p.shape, idx: p.idx, on: p.on, cups: p.cups, active: p.active });

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
    if (T.state === 'lobby') prune(p);
    changed();
  }
  /** In the lobby a phone that went away loses its place after a while (a locked screen comes back sooner). */
  function prune(p) {
    clearTimeout(p.gone);
    p.gone = setTimeout(() => { if (!p.on && T.state === 'lobby') { T.players = T.players.filter((x) => x !== p); Sfx.play('leave'); changed(); } }, 15000);
  }

  function roomState() {
    const l = leader();
    return { t: 'lobby', state: T.state === 'count' ? 'intro' : T.state, room: T.room, players: T.players.map(pub), leader: l ? l.id : null, sel: ORDER[T.sel],
      game: T.game ? T.game.id : null, games: ORDER.map((id) => { const g = GAMES[id]; return { id, name: g.name, tagline: g.tagline, min: g.min, max: g.max, grad: g.grad, icon: g.icon }; }) };
  }
  /** Something about the room changed: tell every phone and redraw the lobby. */
  function changed() { all(roomState()); if (T.state === 'lobby') renderLobby(); }
  /** Brings one phone up to date (it just connected or came back). */
  function sync(p) {
    send(p, roomState());
    if ((T.state === 'intro' || T.state === 'count') && p.active) send(p, { t: 'game', g: T.game.id, phase: 'intro' });
    if (T.state === 'play' && p.active) { send(p, { t: 'game', g: T.game.id, phase: 'play' }); if (T.inst && T.inst.sync) T.inst.sync(p); }
    if (T.state === 'results' && T.last[p.id]) send(p, T.last[p.id]);
  }

  function onMsg(id, d) {
    if (!d || typeof d !== 'object') return;
    if (d.t === 'hello') { hello(id, d); return; }
    const p = byId(id);
    if (!p) { raw(id, { t: 'who' }); return; }
    const lead = leader() === p;
    switch (d.t) {
      case 'shape': if (T.state === 'lobby') { const used = new Set(T.players.filter((x) => x !== p).map((x) => x.shape)); let i = SHAPES.indexOf(p.shape); for (let k = 0; k < 6; k++) { i = (i + 1) % 6; if (!used.has(SHAPES[i])) break; } p.shape = SHAPES[i]; p.fresh = true; Sfx.play('pop'); changed(); } break;
      case 'name': { const n = cleanName(d.name); if (n) { p.name = n; changed(); } break; }
      case 'wave': { const s = $(`.slot[data-id="${p.id}"]`); if (s) { s.classList.remove('wave'); void s.offsetWidth; s.classList.add('wave'); Sfx.play('pop'); } break; }
      case 'pick': if (lead && T.state === 'lobby') { const i = ORDER.indexOf(d.g); if (i >= 0 && i !== T.sel) { T.sel = i; Sfx.play('move'); changed(); } } break;
      case 'start': if (lead) { if (T.state === 'lobby') tryStart(); else if (T.state === 'intro') countdown(); } break;
      case 'again': if (lead && T.state === 'results') tryStart(T.game.id); break;
      case 'menu': if (lead && T.state === 'results') toLobby(); break;
      case 'g': if (T.state === 'play' && p.active && T.inst) T.inst.onMsg(p, d); break;
      default: break;
    }
  }

  /* ---------------------------------------------------------------- lobby */
  function mountBuddies(root, rem, mood) {
    root.querySelectorAll('[data-buddy]').forEach((s) => { const p = byId(s.dataset.buddy); if (p) s.replaceWith(J.buddyEl(p, Math.round(rem * REM()), s.dataset.mood || mood)); });
  }
  const icon = (g) => `<svg viewBox="0 0 24 24">${g.icon}</svg>`;

  function renderLobby() {
    const g = GAMES[ORDER[T.sel]];
    const on = T.players.filter((p) => p.on);
    const l = leader();
    let hint;
    if (!T.players.length) hint = 'Aponte a câmera do celular para o QR Code para entrar na sala';
    else if (on.length < g.min) hint = `<span class="warn"><b>${esc(g.name)}</b> precisa de pelo menos ${g.min} jogadores</span> · faltam ${g.min - on.length}`;
    else hint = `<b>${esc(l ? l.name : '')}</b> escolhe o jogo no celular e toca em <b>Começar</b> · o controle da TV também funciona`;
    let slots = '';
    for (let i = 0; i < 6; i++) {
      const p = T.players.find((x) => x.idx === i);
      slots += p ? `<div class="slot on ${p.on ? '' : 'off'} ${p.fresh ? 'new' : ''}" data-id="${p.id}" style="--c:${p.color}">${p === l ? '<span class="tag">Líder</span>' : ''}${p.cups ? `<span class="cups">🏆 ${p.cups}</span>` : ''}<span data-buddy="${p.id}"></span><b>${esc(p.name)}</b></div>`
        : `<div class="slot">Vaga livre</div>`;
    }
    app.innerHTML = `<section class="screen" style="animation:none">
      <div class="brand"><i></i><span><b>TV Drop</b> Jogos</span></div>
      <div class="lobby-main">
        <div class="join"><h2>Entre com o celular</h2>
          <div class="qr"><img alt="" src="/api/v2/games/qr?key=${encodeURIComponent(KEY)}&r=${esc(T.room)}"></div>
          <p>Aponte a câmera para o código<br>ou abra no navegador do celular:</p>
          <div class="url">${esc(T.url.replace(/^https?:\/\//, ''))}</div>
          <div class="code-label">Código da sala</div>
          <div class="code">${(T.room || '····').split('').map((c) => `<span>${esc(c)}</span>`).join('')}</div>
        </div>
        <div class="right">
          <div class="slots">${slots}</div>
          <div class="games">${ORDER.map((id, i) => { const x = GAMES[id]; return `<div class="gcard ${i === T.sel ? 'sel' : ''} ${on.length && on.length < x.min ? 'dim' : ''}" style="--g:${x.grad}"><div class="ico">${icon(x)}</div><h3>${esc(x.name)}</h3><small>${x.min} a ${x.max} jogadores · ${esc(x.kind)}</small><p>${esc(x.tagline)}</p></div>`; }).join('')}</div>
        </div>
      </div>
      <div class="hint">${hint}</div></section>`;
    const img = $('.qr img');
    img.onerror = () => { const q = $('.qr'); q.classList.add('none'); q.textContent = 'Abra o endereço abaixo no navegador do celular'; };
    mountBuddies(app, 6.4);
    T.players.forEach((p) => { p.fresh = false; });
  }

  /* ---------------------------------------------------------------- start a game */
  function tryStart(id) {
    const g = GAMES[id || ORDER[T.sel]];
    const on = T.players.filter((p) => p.on);
    if (on.length < g.min) {
      Sfx.play('bad');
      all({ t: 'toast', text: `${g.name} precisa de pelo menos ${g.min} jogadores` });
      if (T.state !== 'lobby') toLobby();
      return;
    }
    startGame(g.id);
  }

  function stopGame() {
    T.timers.forEach((id) => clearTimeout(id)); T.timers = [];
    T.loops.forEach((stop) => stop()); T.loops = [];
    if (T.inst && T.inst.stop) { try { T.inst.stop(); } catch (e) { console.error(e); } }
    T.inst = null;
    clearTimeout(T.introTimer); clearInterval(T.countTimer);
    document.querySelectorAll('.countdown, .confetti').forEach((x) => x.remove());
  }

  function startGame(id) {
    stopGame();
    const g = GAMES[id];
    T.game = g; T.sel = ORDER.indexOf(id);
    T.active = T.players.filter((p) => p.on).slice(0, g.max);
    T.players.forEach((p) => { p.active = T.active.includes(p); });
    T.state = 'intro'; T.last = {};
    all(roomState());
    T.active.forEach((p) => send(p, { t: 'game', g: id, phase: 'intro' }));
    Sfx.play('select');
    app.innerHTML = `<section class="screen intro" style="--g:${g.grad}">
      <div class="big-ico">${icon(g)}</div><h1>${esc(g.name)}</h1><div class="tag">${esc(g.tagline)}</div>
      <div class="how">${g.how.map((h) => `<div><b>${esc(h[0])}</b>${esc(h[1])}</div>`).join('')}</div>
      <div class="introbar"><i style="animation-duration:8s"></i></div>
      <div class="hint">Olhe o celular: os controles já estão lá</div></section>`;
    T.introTimer = setTimeout(countdown, 8000);
  }

  function countdown() {
    if (T.state !== 'intro') return;
    clearTimeout(T.introTimer);
    T.state = 'count';
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
    T.state = 'play';
    app.innerHTML = '';
    const stage = el('div', 'stage');
    app.appendChild(stage);
    Sfx.play('go');
    const api = makeApi(stage);
    T.inst = T.game.tv(api);
    T.active.forEach((p) => send(p, { t: 'go' }));
    T.inst.start();
  }

  /** What a game gets to work with. Timers and loops are stopped for it when the game ends. */
  function makeApi(stage) {
    const safe = (fn) => (...a) => { try { return fn(...a); } catch (e) { console.error(e); } };
    const api = {
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
      /** Player chips along the top, with a score each and an optional clock. */
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
    return api;
  }

  /* ---------------------------------------------------------------- results */
  function finish(scores) {
    const g = T.game;
    stopGame();
    T.state = 'results';
    const rows = scores.map((s) => ({ p: byId(s.id), pts: Math.round(s.pts || 0), note: s.note || '' })).filter((r) => r.p).sort((a, b) => b.pts - a.pts);
    rows.forEach((r) => { r.place = 1 + rows.filter((x) => x.pts > r.pts).length; });
    const winners = rows.filter((r) => r.place === 1);
    winners.forEach((r) => { r.p.cups++; });
    const unit = g.unit || 'pontos';
    const col = (r, cls, h) => r ? `<div class="pcol ${cls}" style="--c:${r.p.color}"><div class="crown">${r.place === 1 ? '👑' : ''}</div><span data-buddy="${r.p.id}" data-mood="${r.place === 1 ? 'happy' : r.place === rows.length && rows.length > 2 ? 'sad' : 'wow'}"></span><b>${esc(r.p.name)}</b><span class="pts">${J.fmtPts(r.pts)} ${esc(J.unit(r.pts, unit))}${r.note ? ' · ' + esc(r.note) : ''}</span><div class="bar" style="height:${h}rem">${r.place}º</div></div>` : '';
    const rest = rows.slice(3).map((r) => `<span class="chip"><span data-buddy="${r.p.id}"></span>${r.place}º ${esc(r.p.name)}<em>${J.fmtPts(r.pts)}</em></span>`).join('');
    const title = winners.length > 1 ? 'Empate!' : `${esc(winners[0] ? winners[0].p.name : '')} venceu!`;
    app.innerHTML = `<section class="screen results"><div class="brand"><i></i><span><b>${esc(g.name)}</b></span></div>
      <h1>${title}</h1><div class="sub">Placar da noite: ${T.players.filter((p) => p.cups).sort((a, b) => b.cups - a.cups).map((p) => `${esc(p.name)} 🏆${p.cups}`).join(' · ')}</div>
      <div class="podium">${col(rows[1], '', 12)}${col(rows[0], 'first', 17)}${col(rows[2], '', 8.5)}</div>
      <div class="topbar" style="position:static;justify-content:center">${rest}</div>
      <div class="hint"><b>OK</b> joga de novo · <b>Voltar</b> escolhe outro jogo · ou pelo celular de <b>${esc(leader() ? leader().name : '')}</b></div></section>`;
    app.querySelectorAll('.pcol [data-buddy]').forEach((s) => { const p = byId(s.dataset.buddy); s.replaceWith(J.buddyEl(p, Math.round(11 * REM()), s.dataset.mood)); });
    mountBuddies(app, 2.4);
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

  function toLobby() {
    stopGame();
    T.state = 'lobby'; T.game = null; T.active = [];
    T.players.forEach((p) => { p.active = false; p.fresh = true; if (!p.on) prune(p); });
    renderLobby();
    all(roomState());
  }

  /* ---------------------------------------------------------------- the TV remote (and a keyboard, for testing) */
  function confirmBox(title, text, ok) {
    T.modal = { ok };
    const m = $('#modal');
    m.innerHTML = `<div><h2>${esc(title)}</h2><p>${text}</p></div>`;
    m.hidden = false;
  }
  function closeModal() { T.modal = null; $('#modal').hidden = true; }

  window.tvKey = (k) => {
    Sfx.unlock();
    if (T.modal) { if (k === 'ok') { const f = T.modal.ok; closeModal(); f(); } else if (k === 'back') closeModal(); return true; }
    if (T.state === 'lobby') {
      if (k === 'left' || k === 'right') { T.sel = (T.sel + (k === 'left' ? ORDER.length - 1 : 1)) % ORDER.length; Sfx.play('move'); changed(); }
      else if (k === 'ok') tryStart();
      else if (k === 'back') confirmBox('Sair dos jogos?', '<kbd>OK</kbd> sai · <kbd>Voltar</kbd> continua na sala', () => { if (window.TVHost) window.TVHost.exit(); });
    } else if (T.state === 'intro') {
      if (k === 'ok') countdown();
      else if (k === 'back') toLobby();
    } else if (T.state === 'play') {
      if (k === 'back') confirmBox('Encerrar esta partida?', '<kbd>OK</kbd> volta para a sala · <kbd>Voltar</kbd> continua jogando', toLobby);
      else if (T.inst && T.inst.onKey) T.inst.onKey(k);
    } else if (T.state === 'results') {
      if (k === 'ok') tryStart(T.game.id);
      else if (k === 'back') toLobby();
    }
    return true;
  };
  addEventListener('keydown', (e) => {
    const k = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Enter: 'ok', Escape: 'back', Backspace: 'back' }[e.key];
    if (k) { e.preventDefault(); window.tvKey(k); }
  });

  window.TV_STATE = T; // for automated tests
  renderLobby();
  connect();
})();
