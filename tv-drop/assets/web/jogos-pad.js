/* TV Drop Jogos — the phone: joins the room shown on the TV, then becomes the controller
   and the "second screen" of each game (effects for what happens to this player). */
'use strict';
(() => {
  const { GAMES, esc, el } = J;
  const $ = (s, r = document) => r.querySelector(s);
  const app = $('#app');
  const qs = new URLSearchParams(location.search);
  const store = {
    get(k, d) { try { const v = localStorage.getItem('tvdrop.jogos.' + k); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('tvdrop.jogos.' + k, v); } catch (e) { /* private mode */ } },
  };
  let ID = store.get('id', '');
  if (!/^[A-Za-z0-9]{12}$/.test(ID)) { ID = Array.from({ length: 12 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join(''); store.set('id', ID); }
  const P = { room: '', name: store.get('name', qs.get('nome') || ''), ws: null, joined: false, state: null, me: null, view: '', game: null, inst: null, phase: '', timers: [], loops: [], retry: 0, hostOn: true, stop: false };

  const vib = (pat) => { try { if (navigator.vibrate) navigator.vibrate(pat); } catch (e) { /* not available */ } };
  const icon = (g) => `<svg viewBox="0 0 24 24">${g.icon}</svg>`;
  const buddy = (p, size, mood) => J.buddyEl(p, size, mood);

  /* ---------------------------------------------------------------- effects on this phone */
  const FX = (() => {
    const cv = $('#fx'), c = cv.getContext('2d');
    let W = 0, H = 0, k = 1, items = [], cracks = null, running = false, lastT = 0;
    const size = () => { k = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * k; cv.height = H * k; };
    addEventListener('resize', size); size();
    const run = () => { if (!running) { running = true; lastT = performance.now(); requestAnimationFrame(tick); } };
    function tick(now) {
      const dt = Math.max(0, Math.min(0.05, (now - lastT) / 1000)); lastT = now;
      c.setTransform(k, 0, 0, k, 0, 0); c.clearRect(0, 0, W, H);
      if (cracks) drawCracks();
      items = items.filter((it) => { it.t += dt; return it.t < it.life && it.draw(it, dt) !== false; });
      if (items.length || cracks) requestAnimationFrame(tick); else { running = false; c.clearRect(0, 0, W, H); }
    }
    function drawCracks() {
      c.fillStyle = `rgba(120,0,20,${cracks.tint})`; c.fillRect(0, 0, W, H);
      const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.75); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.75)');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.lineCap = 'round';
      for (const l of cracks.lines) { c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = l.w; c.beginPath(); l.pts.forEach((p, i) => c[i ? 'lineTo' : 'moveTo'](p[0], p[1])); c.stroke(); c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = l.w * 0.5; c.beginPath(); l.pts.forEach((p, i) => c[i ? 'lineTo' : 'moveTo'](p[0] + 1.5, p[1] + 1.5)); c.stroke(); }
    }
    const api = {
      flash(color = '#fff', life = 0.45) { items.push({ t: 0, life, draw: (it) => { c.globalAlpha = 1 - it.t / it.life; c.fillStyle = color; c.fillRect(0, 0, W, H); c.globalAlpha = 1; } }); run(); },
      /** Paint-like splatters that run down the screen and fade. */
      splat(color = '#d1102f', n = 5, life = 3.2) {
        const dark = J.shade(color, -0.3);
        const blobs = Array.from({ length: n }, () => {
          const r = J.rand(46, 105), k = 16, edge = [];
          for (let i = 0; i < k; i++) edge.push(r * (Math.random() < 0.22 ? J.rand(1.25, 1.75) : J.rand(0.72, 1.08)));
          const drops = Array.from({ length: J.irand(7, 12) }, () => { const a = J.rand(0, Math.PI * 2), d = r * J.rand(1.25, 2.5); return { a, d, w: J.rand(3, r * 0.16), l: J.rand(1.2, 2.6) }; });
          const drips = Array.from({ length: J.irand(1, 3) }, () => ({ x: J.rand(-r * 0.55, r * 0.55), w: J.rand(7, 15), len: J.rand(60, 240), wait: J.rand(0, 0.5) }));
          return { x: J.rand(W * 0.05, W * 0.95), y: J.rand(H * 0.05, H * 0.8), r, edge, drops, drips, rot: J.rand(0, 7) };
        });
        const shape = (b, g) => {
          const k = b.edge.length, pt = (i) => { const a = b.rot + (i / k) * Math.PI * 2, rr = b.edge[((i % k) + k) % k] * g; return [b.x + Math.cos(a) * rr, b.y + Math.sin(a) * rr]; };
          c.beginPath();
          for (let i = 0; i <= k; i++) { const p0 = pt(i), p1 = pt(i + 1), mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2; if (!i) c.moveTo(mx, my); else c.quadraticCurveTo(p0[0], p0[1], mx, my); }
          c.closePath(); c.fill();
        };
        items.push({ t: 0, life, draw: (it) => {
          const a = Math.min(1, (it.life - it.t) / 1.1), g = 1 - Math.pow(1 - Math.min(1, it.t / 0.14), 3);
          c.globalAlpha = a * 0.94;
          for (const b of blobs) {
            c.fillStyle = color;
            for (const dr of b.drips) { const len = dr.len * Math.max(0, Math.min(1, (it.t - dr.wait) / 1.8)); if (len <= 0) continue; const x = b.x + dr.x, y0 = b.y + b.r * 0.4; c.beginPath(); c.moveTo(x - dr.w / 2, y0); c.lineTo(x - dr.w * 0.38, y0 + len); c.arc(x, y0 + len, dr.w * 0.55, Math.PI, 0, true); c.lineTo(x + dr.w / 2, y0); c.fill(); }
            shape(b, g);
            for (const dr of b.drops) { const x = b.x + Math.cos(dr.a) * dr.d * g, y = b.y + Math.sin(dr.a) * dr.d * g; c.beginPath(); c.ellipse(x, y, dr.w * dr.l, dr.w, dr.a, 0, 7); c.fill(); }
            c.fillStyle = dark; c.globalAlpha = a * 0.35; const inner = { ...b, x: b.x + b.r * 0.08, y: b.y + b.r * 0.1 }; shape(inner, g * 0.62);
            c.fillStyle = '#fff'; c.globalAlpha = a * 0.22; c.beginPath(); c.ellipse(b.x - b.r * 0.3, b.y - b.r * 0.34, b.r * 0.2 * g, b.r * 0.09 * g, -0.6, 0, 7); c.fill();
            c.globalAlpha = a * 0.94;
          }
          c.globalAlpha = 1;
        } }); run();
      },
      crack(tint = 0.35) {
        const cx = J.rand(W * 0.3, W * 0.7), cy = J.rand(H * 0.3, H * 0.6), lines = [];
        for (let i = 0; i < 11; i++) { let a = (i / 11) * Math.PI * 2 + J.rand(-0.2, 0.2), x = cx, y = cy; const pts = [[x, y]]; const len = J.rand(0.5, 1.1) * Math.max(W, H); for (let d = 0; d < len; d += 34) { a += J.rand(-0.35, 0.35); x += Math.cos(a) * 34; y += Math.sin(a) * 34; pts.push([x, y]); } lines.push({ pts, w: J.rand(1.2, 3) }); }
        for (let r = 60; r < 260; r += 70) { const pts = []; for (let i = 0; i <= 11; i++) { const a = (i / 11) * Math.PI * 2; pts.push([cx + Math.cos(a) * r * J.rand(0.8, 1.15), cy + Math.sin(a) * r * J.rand(0.8, 1.15)]); } lines.push({ pts, w: 1.2 }); }
        cracks = { lines, tint }; run();
      },
      confetti(n = 110) {
        const bits = Array.from({ length: n }, () => ({ x: J.rand(0, W), y: J.rand(-H, 0), vx: J.rand(-50, 50), vy: J.rand(220, 520), r: J.rand(0, 6), vr: J.rand(-7, 7), w: J.rand(7, 14), h: J.rand(5, 9), color: J.pick(J.COLORS) }));
        items.push({ t: 0, life: 3.6, draw: (it, dt) => { for (const b of bits) { b.x += b.vx * dt; b.y += b.vy * dt; b.r += b.vr * dt; c.save(); c.translate(b.x, b.y); c.rotate(b.r); c.fillStyle = b.color; c.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.abs(Math.cos(b.r * 1.7))); c.restore(); } } }); run();
      },
      stars(color = '#ffd23f', n = 26) {
        const bits = Array.from({ length: n }, () => { const a = J.rand(0, 7), v = J.rand(180, 620); return { x: W / 2, y: H * 0.45, vx: Math.cos(a) * v, vy: Math.sin(a) * v, s: J.rand(8, 22), r: J.rand(0, 6) }; });
        items.push({ t: 0, life: 1.5, draw: (it, dt) => { const a = 1 - it.t / it.life; for (const b of bits) { b.x += b.vx * dt; b.y += b.vy * dt; b.vx *= 0.97; b.vy = b.vy * 0.97 + 260 * dt; b.r += dt * 5; c.save(); c.translate(b.x, b.y); c.rotate(b.r); c.globalAlpha = a; c.fillStyle = color; J.shapePath(c, 'estrela', b.s); c.fill(); c.restore(); } c.globalAlpha = 1; } }); run();
      },
      flames(color = '#3dc9ff', life = 1.4) {
        items.push({ t: 0, life, draw: (it) => { const a = Math.min(1, (it.life - it.t) * 2); for (let i = 0; i < 16; i++) { const x = (i + 0.5) * (W / 16), h = H * (0.25 + 0.3 * Math.abs(Math.sin(it.t * 9 + i * 1.7))); const g = c.createLinearGradient(0, H, 0, H - h); g.addColorStop(0, J.rgba(color, 0.85 * a)); g.addColorStop(1, J.rgba(color, 0)); c.fillStyle = g; c.beginPath(); c.ellipse(x, H, W / 13, h, 0, Math.PI, 0); c.fill(); } } }); run();
      },
      shake() { app.classList.remove('shake'); void app.offsetWidth; app.classList.add('shake'); },
      stamp(text, color = '#ff4d6d') { const s = $('#stamp'); s.hidden = true; void s.offsetWidth; s.textContent = text; s.style.color = color; s.hidden = false; clearTimeout(s._t); s._t = setTimeout(() => { s.hidden = true; }, 2000); },
      clear() { cracks = null; items = []; $('#stamp').hidden = true; },
      /** The effects every game can ask for by name. */
      named(m) {
        switch (m.k) {
          case 'hit': api.splat('#d1102f', 2, 1.7); api.shake(); vib(90); break;
          case 'dead': api.flash('#ff1f3d', 0.5); $('#stamp').hidden = true; api.splat('#c20d2b', 5, 4); api.crack(0.38); api.shake(); vib([180, 60, 320]); break;
          case 'boom': api.flash('#fff', 0.6); $('#stamp').hidden = true; api.splat('#d1102f', 6, 4.5); api.crack(0.3); api.shake(); vib([400, 80, 400]); break;
          case 'win': api.confetti(); vib([60, 50, 60, 50, 160]); break;
          case 'good': api.stars(m.color || '#ffd23f'); vib(50); break;
          case 'bad': api.flash('#ff1f3d', 0.3); api.shake(); vib([70, 40, 70]); break;
          case 'stamp': api.stamp(m.text || '', m.color); vib(120); break;
          case 'flash': api.flash(m.color || '#fff', m.life || 0.4); break;
          case 'flames': api.flames(m.color); vib(40); break;
          case 'shake': api.shake(); vib(m.v || 40); break;
          case 'buzz': vib(m.v || 30); break;
          case 'clear': api.clear(); break;
          default: break;
        }
      },
    };
    return api;
  })();

  /* ---------------------------------------------------------------- connection (gamer/room-client.js) */
  // Reliable messages (answers, votes, drawings, room actions) are numbered and sent again after a drop until
  // the TV confirms them; joystick/steering input is streamed (only the latest one matters).
  const room = RoomClient({
    url: (r, id) => (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/v2/games/ws?room=' + encodeURIComponent(r) + '&id=' + id,
    room: () => P.room, id: ID,
    hello: () => ({ name: P.name, shape: store.get('shape', '') }),
    onMessage: (m) => { try { onMsg(m); } catch (err) { console.error(err); } },
    onStatus: (s) => {
      if (s === 'open') net('');
      else if (s === 'reconnecting' && P.joined) net('Sem conexão com a TV. Reconectando…');
    },
    onGiveUp: () => showJoin('Não consegui conectar na TV. Confira se o celular está no mesmo Wi-Fi.'),
  });
  P.room_ = room;
  P.ws = { send: (text) => { const m = JSON.parse(text); if (m.t === 'g' && m.mid == null) m.mid = P.mid; return m.t === 'g' && m.k === 'in' ? room.stream(m) : room.send(m); } }; // for automated tests
  const send = (m) => room.send(m);
  const net = (text) => { const n = $('#net'); n.hidden = !text; n.textContent = text; };
  document.addEventListener('visibilitychange', () => { if (!document.hidden && P.room) room.nudge(); });
  addEventListener('online', () => room.nudge());

  function onMsg(m) {
    switch (m.t) {
      case 'noroom': P.stop = true; showJoin('Sala não encontrada. Confira o código que aparece na TV.'); break;
      case 'full': P.stop = true; showJoin('A sala está cheia (6 jogadores).'); break;
      case 'closed': P.stop = true; leaveGame(); P.state = null; hostTab(); showJoin('A sala foi encerrada na TV.'); break;
      case 'kicked': P.stop = true; leaveGame(); P.state = null; hostTab(); showJoin('Você foi removido da sala pelo anfitrião. Pode entrar de novo com o código.'); break;
      case 'host': P.hostOn = m.on; net(m.on ? '' : 'A TV saiu dos jogos. Aguardando…'); break;
      case 'lobby': onRoom(m); break;
      case 'game': if (m.mid) P.mid = m.mid; onGame(m); break;
      case 'count': if (P.view === 'intro') { const b = $('#introBox'); if (b) b.innerHTML = `<div class="count">${m.n}</div>`; vib(30); } break;
      case 'go': if (m.mid) P.mid = m.mid; mount(); break;
      case 'g': if (P.inst && P.inst.onMsg) P.inst.onMsg(m); break;
      case 'fx': FX.named(m); if (P.inst && P.inst.onFx) P.inst.onFx(m); break;
      case 'end': showEnd(m); break;
      case 'toast': toast(m.text); break;
      default: break;
    }
  }

  function toast(text) {
    document.querySelectorAll('.toast').forEach((t) => t.remove());
    const t = el('div', 'toast', esc(text)); document.body.appendChild(t); vib(40);
    setTimeout(() => t.remove(), 2600);
  }

  /* ---------------------------------------------------------------- join */
  function showJoin(error) {
    P.joined = false; P.view = 'join';
    app.innerHTML = `<section class="view join">
      <div class="brand"><i></i><span>TV Drop Jogos</span></div>
      <h1>Entre na sala<br>que está na TV</h1>
      <div><label for="code">Código da sala</label><input class="field code" id="code" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="····" inputmode="numeric" value="${esc(P.room)}"></div>
      <div><label for="name">Seu nome</label><input class="field" id="name" maxlength="12" autocomplete="off" placeholder="Como te chamam?" value="${esc(P.name)}"></div>
      <div class="err">${esc(error || '')}</div>
      <button class="btn primary" id="go">Entrar</button>
      <p class="muted" style="text-align:center;font-size:13px">O celular precisa estar no mesmo Wi-Fi da TV.</p></section>`;
    const code = $('#code'), name = $('#name');
    code.oninput = () => { code.value = code.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); if (code.value.length === 4 && !name.value) name.focus(); };
    const go = () => {
      const c = code.value.trim().toUpperCase(), n = name.value.trim();
      if (c.length !== 4) { $('.err').textContent = 'O código tem 4 números e aparece na TV.'; code.focus(); return; }
      if (!n) { $('.err').textContent = 'Digite seu nome.'; name.focus(); return; }
      join(c, n);
    };
    $('#go').onclick = go;
    name.onkeydown = (e) => { if (e.key === 'Enter') go(); };
  }

  function join(room, name) {
    P.room = room; P.name = name.slice(0, 12); store.set('name', P.name);
    P.stop = false; P.retry = 0;
    P.room_.stop();
    app.innerHTML = `<section class="view centered"><div class="brand"><i></i><span>TV Drop Jogos</span></div><div class="big">Entrando na sala ${esc(room)}…</div></section>`;
    P.view = 'connecting';
    P.room_.start();
  }

  /* ---------------------------------------------------------------- room state */
  function onRoom(m) {
    P.joined = true; P.state = m;
    if (m.mid) P.mid = m.mid;
    P.me = m.players.find((p) => p.id === ID) || null;
    if (!P.me) return;
    document.documentElement.style.setProperty('--me', P.me.color);
    store.set('shape', P.me.shape);
    hostTab();
    if (m.state === 'lobby' || m.state === 'catalog') { leaveGame(); renderLobby(); } // catalog: the host can choose the game from here too
    else if (!P.me.active) { leaveGame(); renderWait(); }
    else if (m.state === 'results' && P.view === 'end') renderEndButtons();
  }

  function renderLobby() {
    const m = P.state, me = P.me, lead = m.leader === ID;
    const on = m.players.filter((p) => p.on).length;
    const sel = m.games.find((g) => g.id === m.sel) || m.games[0];
    const leaderName = (m.players.find((p) => p.id === m.leader) || {}).name || '';
    const focused = document.activeElement && document.activeElement.id === 'myName';
    if (P.view === 'lobby' && focused) { drawLobbyLists(); return; } // don't steal the keyboard while typing the name
    P.view = 'lobby';
    app.innerHTML = `<section class="view">
      <div class="brand"><i></i><span>Sala ${esc(m.room)}</span></div>
      <div class="me"><span id="meBuddy"></span><div class="col"><input id="myName" maxlength="12" autocomplete="off" value="${esc(me.name)}" aria-label="Seu nome">
        <small>${lead ? 'Você é o anfitrião: comanda tudo daqui' : 'Toque no personagem para acenar na TV'}</small></div>
        <button class="btn small" id="shape">Trocar</button></div>
      <div class="crew" id="crew"></div>
      <div class="scroll" id="list"></div>
      <div class="bottom" id="bottom"></div></section>`;
    $('#myName').onchange = (e) => { const n = e.target.value.trim(); if (n) { P.name = n; store.set('name', n); room.hello(); } };
    $('#shape').onclick = () => { send({ t: 'shape' }); vib(20); };
    drawLobbyLists();
    function drawLobbyLists() {
      const mm = P.state, onNow = mm.players.filter((p) => p.on).length, isLead = mm.leader === ID;
      const s = mm.games.find((g) => g.id === mm.sel) || mm.games[0];
      const b = buddy(P.me, 84); b.id = 'meBuddy'; b.onclick = () => { send({ t: 'wave' }); b.classList.remove('wave'); void b.offsetWidth; b.classList.add('wave'); vib(20); };
      $('#meBuddy').replaceWith(b);
      const crew = $('#crew'); crew.innerHTML = '';
      mm.players.forEach((p) => {
        const sp = el('span', p.on ? '' : 'off'); sp.appendChild(buddy(p, 26)); sp.appendChild(document.createTextNode(p.name + (p.cups ? ' 🏆' + p.cups : ''))); crew.appendChild(sp);
        if (isLead && p.id !== ID) sp.onclick = () => sheet(`Remover ${p.name}?`, 'O celular sai da sala e pode entrar de novo com o código.', [['Remover', () => send({ t: 'kick', id: p.id })], ['Cancelar', null]]);
      });
      const list = $('#list'), inCat = mm.state === 'catalog', keep = list.scrollTop;
      const card = (g, tag, sel) => `<${tag} class="gcard ${sel ? 'sel' : ''} ${onNow < g.min ? 'dim' : ''}" data-g="${g.id}" style="--g:${g.grad}"><div class="ico">${icon(g)}</div><div class="t"><b>${esc(g.name)}</b><small>${esc(g.tagline)}</small></div><em>${g.min}–${g.max}</em></${tag}>`;
      const leadName = esc((mm.players.find((p) => p.id === mm.leader) || {}).name || 'O anfitrião');
      if (isLead && inCat) {
        // the TV is in its catalog: the host picks here and the TV opens the waiting room of that game
        list.innerHTML = `<div class="sect">Escolha o jogo</div>` + mm.games.map((g) => card(g, 'button', false)).join('');
        $('#bottom').innerHTML = `<p class="muted" style="text-align:center;font-size:14px">Toque em um jogo: a sala de espera abre na TV</p>`;
      } else if (isLead) {
        const need = s.min - onNow;
        list.innerHTML = `<div class="sect">Jogo escolhido</div>` + card(s, 'div', true) + cfgHtml(mm.cfg, true)
          + `<div class="sect">Trocar de jogo</div>` + mm.games.filter((g) => g.id !== s.id).map((g) => card(g, 'button', false)).join('');
        bindCfg(list);
        $('#bottom').innerHTML = `<button class="btn primary" id="start" ${need > 0 ? 'disabled' : ''}>${need > 0 ? `Faltam ${need} jogador${need > 1 ? 'es' : ''}` : 'Começar ' + esc(s.name)}</button>`;
        $('#start').onclick = () => { send({ t: 'start' }); vib(30); };
      } else if (inCat) {
        list.innerHTML = `<div class="sect">${leadName} está escolhendo o jogo</div><p class="muted" style="font-size:15px;line-height:1.4">Quem escolhe é o anfitrião, pelo celular ou pelo controle da TV. Assim que escolher, a sala de espera aparece aqui.</p>`;
        $('#bottom').innerHTML = `<p class="muted" style="text-align:center;font-size:14px">${onNow} na sala</p>`;
      } else {
        list.innerHTML = `<div class="sect">${leadName} escolheu</div>` + card(s, 'div', true) + cfgHtml(mm.cfg, false);
        $('#bottom').innerHTML = `<p class="muted" style="text-align:center;font-size:14px">${onNow} na sala · o jogo começa quando ${leadName} tocar em Começar</p>`;
      }
      list.querySelectorAll('button[data-g]').forEach((x) => { x.onclick = () => { send({ t: 'pick', g: x.dataset.g }); vib(15); list.scrollTop = 0; }; });
      list.scrollTop = keep;
    }
    void on; void sel; void leaderName;
  }

  /** Match settings: the host changes them (same values as on the TV); everyone else sees them. */
  function cfgHtml(c, editable) {
    if (!c || !c.schema) return '';
    const preset = (c.presets.find((x) => x[0] === c.preset) || [0, ''])[1];
    if (!editable) {
      return `<div class="sect">Partida · ${esc(preset)}</div><div class="cfgro">${c.schema.map((s) => `<span><small>${esc(s.label)}</small><b>${esc(s.text)}</b></span>`).join('')}</div>`;
    }
    const row = (s) => (s.multi
      ? `<div class="cfgrow"><small>${esc(s.label)} · ${esc(s.text)}</small><div class="opts2 many"><button class="all ${c.values[s.id].length === s.options.length ? 'on' : ''}" data-mall="${s.id}">${esc(s.allLabel)}</button>${s.options.map(([v, l]) => `<button class="${c.values[s.id].includes(v) ? 'on' : ''}" data-mkey="${s.id}" data-v="${esc(v)}">${esc(l)}</button>`).join('')}</div></div>`
      : `<div class="cfgrow"><small>${esc(s.label)}</small><div class="opts2">${s.options.map(([v, l]) => `<button class="${c.values[s.id] === v ? 'on' : ''}" data-key="${s.id}" data-v='${JSON.stringify(v)}'>${esc(l)}</button>`).join('')}</div></div>`);
    return `<div class="sect">Configurar a partida</div><div class="cfg">
      <div class="seg4">${c.presets.map(([k, l]) => `<button class="${c.preset === k ? 'on' : ''}" data-preset="${k}">${esc(l)}</button>`).join('')}</div>
      ${c.schema.map(row).join('')}</div>`;
  }
  function bindCfg(box) {
    box.querySelectorAll('[data-preset]').forEach((b) => { b.onclick = () => { if (b.dataset.preset !== 'custom') send({ t: 'cfg', preset: b.dataset.preset }); vib(12); }; });
    box.querySelectorAll('[data-key]').forEach((b) => { b.onclick = () => { send({ t: 'cfg', key: b.dataset.key, v: JSON.parse(b.dataset.v) }); vib(12); }; });
    const c = P.state.cfg;
    box.querySelectorAll('[data-mkey]').forEach((b) => { b.onclick = () => {
      const s = c.schema.find((x) => x.id === b.dataset.mkey), cur = c.values[s.id], v = b.dataset.v;
      const next = cur.length === s.options.length ? [v] : cur.includes(v) ? cur.filter((x) => x !== v) : cur.concat(v); // from "everything", a tap chooses only that one
      if (next.length < s.min) { toast(s.min > 1 ? `Escolha pelo menos ${s.min}` : 'Deixe pelo menos uma'); return; }
      send({ t: 'cfg', key: s.id, v: next }); vib(12);
    }; });
    box.querySelectorAll('[data-mall]').forEach((b) => { b.onclick = () => { const s = c.schema.find((x) => x.id === b.dataset.mall); send({ t: 'cfg', key: s.id, v: s.options.map((o) => o[0]) }); vib(12); }; });
  }

  /** A question over the screen: sheet(title, text, [[label, fn], ...]). */
  function sheet(title, text, buttons) {
    document.querySelectorAll('.sheet').forEach((x) => x.remove());
    const sh = el('div', 'sheet', `<div class="card"><h3>${esc(title)}</h3><p>${esc(text)}</p>${buttons.map(([label], i) => `<button class="btn ${i === 0 ? 'danger' : ''}" data-i="${i}">${esc(label)}</button>`).join('')}</div>`);
    document.body.appendChild(sh);
    sh.onclick = (e) => { const b = e.target.closest('[data-i]'); if (!b && e.target !== sh) return; sh.remove(); if (b && buttons[+b.dataset.i][1]) buttons[+b.dataset.i][1](); };
  }
  /** During a match the host has a small tab at the top to end it from the phone. */
  function hostTab() {
    let t = $('#hostTab');
    const show = P.state && P.state.leader === ID && (P.state.state === 'play' || P.state.state === 'intro');
    if (!show) { if (t) t.remove(); return; }
    if (t) return;
    t = el('button', '', '<i></i>'); t.id = 'hostTab'; t.setAttribute('aria-label', 'Opções do anfitrião');
    t.onclick = () => sheet('Encerrar esta partida?', 'Todos voltam para a escolha de jogos e ninguém pontua.', [['Encerrar partida', () => send({ t: 'quit' })], ['Continuar jogando', null]]);
    document.body.appendChild(t);
  }


  function renderWait() {
    if (P.view === 'wait') return;
    P.view = 'wait';
    app.innerHTML = `<section class="view centered"><div id="wb"></div><div class="big">Partida em andamento</div><p class="muted">Você entra na próxima. Assista na TV!</p></section>`;
    $('#wb').appendChild(buddy(P.me, 120, 'wow'));
  }

  /* ---------------------------------------------------------------- a game on this phone */
  function leaveGame() {
    P.timers.forEach((id) => { clearTimeout(id); clearInterval(id); }); P.timers = [];
    P.loops.forEach((stop) => stop()); P.loops = [];
    if (P.inst && P.inst.stop) { try { P.inst.stop(); } catch (e) { console.error(e); } }
    P.inst = null; P.game = null; P.phase = '';
    FX.clear();
  }

  function onGame(m) {
    const g = GAMES[m.g];
    if (!g) return;
    if (P.game === g && P.inst && m.phase === 'play') return; // already playing: the TV is only bringing us up to date
    leaveGame();
    P.game = g; P.phase = m.phase;
    if (m.phase === 'play') { mount(); return; }
    P.view = 'intro';
    const lead = P.state && P.state.leader === ID;
    app.innerHTML = `<section class="view centered" style="--g:${g.grad}"><div id="introBox" class="centered" style="flex:none"><div class="gico">${icon(g)}</div><h1 class="big">${esc(g.name)}</h1>
      <p style="font-size:18px;line-height:1.35;max-width:320px">${esc(g.padHow)}</p></div>
      ${lead ? '<button class="btn small" id="skip">Pular explicação</button>' : '<p class="muted">Já vai começar…</p>'}</section>`;
    if (lead) $('#skip').onclick = () => send({ t: 'start' });
  }

  function mount() {
    const g = P.game;
    if (!g || P.inst) return;
    P.view = 'game'; P.phase = 'play';
    app.innerHTML = '';
    const root = el('section', 'view');
    app.appendChild(root);
    const api = {
      root, me: P.me, players: P.state ? P.state.players.filter((p) => p.active) : [], fx: FX, vib, buddy,
      send: (m) => room.send({ t: 'g', mid: P.mid, ...m }),
      stream: (m) => room.stream({ t: 'g', mid: P.mid, ...m }),
      after(ms, fn) { const id = setTimeout(fn, ms); P.timers.push(id); return id; },
      every(ms, fn) { const id = setInterval(fn, ms); P.timers.push(id); return id; },
      loop(fn) { let lastT = performance.now(), live = true; const tick = (now) => { if (!live) return; const dt = Math.max(0, Math.min(0.05, (now - lastT) / 1000)); lastT = now; fn(dt, now / 1000); requestAnimationFrame(tick); }; requestAnimationFrame(tick); const stop = () => { live = false; }; P.loops.push(stop); return stop; },
      stick: makeStick, hold: holdButton,
    };
    P.inst = g.pad(api);
    P.inst.start();
  }

  /** A thumb joystick: cb(x, y) with both from -1 to 1. It re-centres where the thumb lands. */
  function makeStick(box, cb) {
    box.classList.add('stick');
    box.innerHTML = '<div class="base"></div><div class="knob"></div><div class="tip">Mover</div>';
    const base = box.querySelector('.base'), knob = box.querySelector('.knob');
    const R = 62;
    let id = null, ox = 0, oy = 0;
    const set = (x, y) => { knob.style.transform = `translate(${x * R}px, ${y * R}px)`; cb(x, y); };
    box.addEventListener('pointerdown', (e) => {
      if (id !== null) return;
      id = e.pointerId; box.setPointerCapture(id);
      const r = box.getBoundingClientRect();
      ox = e.clientX; oy = e.clientY;
      const bx = J.clamp(ox - r.left, 80, r.width - 80), by = J.clamp(oy - r.top, 80, r.height - 80);
      base.style.left = knob.style.left = bx + 'px'; base.style.top = knob.style.top = by + 'px';
      ox = r.left + bx; oy = r.top + by;
      const dx = (e.clientX - ox) / R, dy = (e.clientY - oy) / R, l = Math.hypot(dx, dy) || 1, kk = Math.min(1, l) / l;
      set(dx * kk, dy * kk);
    });
    box.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      const dx = (e.clientX - ox) / R, dy = (e.clientY - oy) / R, l = Math.hypot(dx, dy) || 1, kk = Math.min(1, l) / l;
      set(dx * kk, dy * kk);
    });
    const up = (e) => { if (e.pointerId !== id) return; id = null; set(0, 0); };
    box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up);
  }

  /** A button that knows "pressed" and "released" (multi-touch safe). */
  function holdButton(btn, down, up) {
    let id = null;
    btn.addEventListener('pointerdown', (e) => { if (id !== null) return; id = e.pointerId; try { btn.setPointerCapture(id); } catch (err) { /* ignore */ } btn.classList.add('down'); down && down(); e.preventDefault(); });
    const end = (e) => { if (e.pointerId !== id) return; id = null; btn.classList.remove('down'); up && up(); };
    btn.addEventListener('pointerup', end); btn.addEventListener('pointercancel', end);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /* ---------------------------------------------------------------- end of a game */
  function showEnd(m) {
    leaveGame();
    P.view = 'end'; P.lastEnd = m;
    const mood = m.win ? 'happy' : m.place === m.n && m.n > 2 ? 'sad' : 'wow';
    app.innerHTML = `<section class="view centered"><div class="brand"><i></i><span>${esc(m.game)}</span></div>
      <div id="eb"></div>${m.team ? '' : `<div class="place">${m.place}º</div>`}
      <div class="big">${m.title ? esc(m.title) : m.win ? (m.team ? 'Vocês venceram!' : 'Você venceu!') : m.team ? 'Não foi dessa vez' : m.place === 2 ? 'Quase!' : 'Fim de jogo'}</div>
      <p class="muted" style="font-size:18px">${J.fmtPts(m.pts)} ${esc(J.unit(m.pts, m.unit || 'pontos'))}${m.note ? ' · ' + esc(m.note) : ''}</p>
      <div class="bottom" id="endBtns" style="width:100%"></div></section>`;
    $('#eb').appendChild(buddy(P.me, 130, mood));
    if (m.win) { FX.confetti(); vib([60, 50, 60, 50, 200]); }
    renderEndButtons();
  }
  function renderEndButtons() {
    const box = $('#endBtns');
    if (!box || !P.state) return;
    if (P.state.leader === ID) {
      box.innerHTML = '<button class="btn primary" id="again">Jogar de novo</button><button class="btn" id="menu">Escolher outro jogo</button>';
      $('#again').onclick = () => send({ t: 'again' });
      $('#menu').onclick = () => send({ t: 'menu' });
    } else box.innerHTML = '<p class="muted" style="text-align:center">O líder escolhe o que vem agora</p>';
  }

  /* ---------------------------------------------------------------- start */
  addEventListener('contextmenu', (e) => { if (e.target.tagName !== 'INPUT') e.preventDefault(); });
  window.PAD_STATE = P; // for automated tests
  const code = (qs.get('sala') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  P.room = code;
  if (code.length === 4 && P.name) join(code, P.name); else showJoin('');
})();
