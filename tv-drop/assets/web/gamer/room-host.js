/* TV Drop — game room, TV side: who is in the room, and the official record of what each phone sent.
   The TV is the authority: phones send intentions, this layer checks them before any game sees them.
   - players: id, name, character, color, connection state; the first one online is the host ("anfitrião");
   - every reliable message is applied once: a session id per phone page plus a sequence number, so
     messages sent again after a reconnect are confirmed but not applied twice;
   - limits: message size and a rate per phone for streamed input (joystick), so one phone can't flood the TV;
   - phones that leave outside a match lose their place after a while; the host can remove a player.
   Works in the browser and in Node (tests pass a fake socket). Nothing here knows about any particular game. */
'use strict';
(function (root) {
  const COLORS = ['#ff4d6d', '#ffd23f', '#3df5a7', '#3dc9ff', '#b47cff', '#ff9a3d'];
  const SHAPES = ['bola', 'quadrado', 'triangulo', 'estrela', 'hexagono', 'gota'];
  const MAX = 6;

  function RoomHost(o) {
    const WS = o.WebSocket || root.WebSocket;
    const now = o.now || (() => Date.now());
    const setT = o.setTimeout || root.setTimeout.bind(root), clearT = o.clearTimeout || root.clearTimeout.bind(root);
    const setI = o.setInterval || root.setInterval.bind(root);
    const on = o.on || {};
    const H = { players: [], code: '', url: '', connected: false, stats: { dup: 0, limited: 0, applied: 0 } };
    let ws = null, retryT = 0;

    /* ---------- connection to the TV's server ---------- */
    function connect() {
      clearT(retryT);
      let sock;
      try { sock = new WS(o.url()); } catch (e) { retryT = setT(connect, 2000); return; }
      ws = sock;
      sock.onopen = () => { if (ws === sock) { H.connected = true; emit('net', true); } };
      sock.onmessage = (e) => { if (ws !== sock) return; let m; try { m = JSON.parse(e.data); } catch (err) { return; } try { onHub(m); } catch (err) { console.error(err); } };
      sock.onclose = () => { if (ws !== sock) return; H.connected = false; emit('net', false); retryT = setT(connect, 1500); };
      sock.onerror = () => {};
    }
    setI(() => { if (ws && ws.readyState === 1) ws.send('p'); }, 15000);
    function rawSend(text) { if (ws && ws.readyState === 1) { ws.send(text); return true; } return false; }
    const raw = (id, msg) => rawSend(id + '|' + JSON.stringify(msg));
    function emit(ev, ...a) { if (on[ev]) { try { return on[ev](...a); } catch (e) { console.error(e); } } return undefined; }

    function onHub(m) {
      if (m.t === 'room') { H.code = m.code; H.url = m.url; emit('room', m.code, m.url); }
      else if (m.t === 'join') {
        const p = byId(m.id);
        if (p) { p.on = true; clearT(p.gone); emit('rejoin', p); emit('changed'); } else raw(m.id, { t: 'who' });
      } else if (m.t === 'leave') {
        if (m.kicked) { H.players = H.players.filter((x) => x.id !== m.id); emit('changed'); return; }
        const p = byId(m.id);
        if (!p) return;
        p.on = false;
        emit('leave', p);
        if (emit('quiet') !== false) prune(p);
        emit('changed');
      } else if (m.t === 'm') onPhone(m.id, m.d);
    }

    /* ---------- players ---------- */
    const byId = (id) => H.players.find((p) => p.id === id);
    const leader = () => H.players.find((p) => p.on) || null;
    const online = () => H.players.filter((p) => p.on);
    const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12);

    function hello(id, d) {
      let p = byId(id);
      const name = cleanName(d.name);
      if (!p) {
        const used = new Set(H.players.map((x) => x.idx));
        let idx = 0; while (used.has(idx)) idx++;
        if (idx >= MAX) { raw(id, { t: 'full' }); return; }
        const shapesUsed = new Set(H.players.map((x) => x.shape));
        const shape = SHAPES.includes(d.shape) && !shapesUsed.has(d.shape) ? d.shape : SHAPES.find((s) => !shapesUsed.has(s)) || SHAPES[idx];
        p = { id, name: name || 'Jogador ' + (idx + 1), idx, color: COLORS[idx], shape, on: true, cups: 0, active: false, fresh: true, ss: null, seq: 0, bucket: 40, bucketT: now() };
        H.players.push(p);
        emit('joined', p);
      } else { if (name) p.name = name; p.on = true; clearT(p.gone); }
      if (d.ss && d.ss !== p.ss) { p.ss = d.ss; p.seq = 0; } // a new page on that phone: its numbers start over
      emit('hello', p);
      emit('changed');
    }
    function prune(p) {
      clearT(p.gone);
      p.gone = setT(() => { if (!p.on && emit('quiet') !== false) { H.players = H.players.filter((x) => x !== p); emit('removed', p); emit('changed'); } }, o.pruneMs || 15000);
    }
    function kick(p) {
      rawSend('!kick|' + p.id);
      H.players = H.players.filter((x) => x !== p);
      clearT(p.gone);
      emit('removed', p);
      emit('changed');
    }

    /* ---------- what the phones send ---------- */
    function onPhone(id, d) {
      if (!d || typeof d !== 'object' || typeof d.t !== 'string') return;
      if (d.t === 'hello') { hello(id, d); return; }
      const p = byId(id);
      if (!p) { raw(id, { t: 'who' }); return; }
      if (d.s != null) {
        // reliable: apply each number once, confirm everything (also repeats, so the phone can let go of them)
        const s = Number(d.s);
        if (!Number.isFinite(s)) return;
        if (s <= p.seq) { H.stats.dup++; ack(p); return; }
        p.seq = s;
        ack(p);
      } else {
        // streamed input: a budget per phone (refills 40 per second, up to 40)
        const t = now();
        p.bucket = Math.min(40, p.bucket + ((t - p.bucketT) / 1000) * 40);
        p.bucketT = t;
        if (p.bucket < 1) { H.stats.limited++; return; }
        p.bucket -= 1;
      }
      H.stats.applied++;
      emit('message', p, d);
    }
    function ack(p) {
      // one confirmation per phone per 40 ms is enough (it covers every number up to it)
      if (p.ackT) return;
      p.ackT = setT(() => { p.ackT = 0; raw(p.id, { t: 'ack', s: p.seq }); }, 40);
    }

    return Object.assign(H, {
      start: connect,
      byId, leader, online, kick, prune,
      send: (p, msg) => raw(p.id, msg),
      sendId: (id, msg) => raw(id, msg),
      all: (msg) => raw('*', msg),
      /** For tests: feed what the server would deliver. */
      _hub: onHub,
    });
  }
  RoomHost.COLORS = COLORS; RoomHost.SHAPES = SHAPES; RoomHost.MAX = MAX;
  if (typeof module !== 'undefined' && module.exports) module.exports = RoomHost; else root.RoomHost = RoomHost;
})(typeof window !== 'undefined' ? window : globalThis);
