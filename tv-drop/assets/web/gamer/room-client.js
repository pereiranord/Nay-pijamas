/* TV Drop — game room, phone side: one connection to the TV for every game.
   - reconnects by itself (1 s, 2 s, 4 s… up to 8 s; at once when the page comes back or the network returns);
   - reliable messages carry a sequence number and stay in an outbox until the TV confirms them ({t:'ack', s}),
     so an answer sent during a Wi-Fi drop arrives once, in order, after reconnecting;
   - "stream" messages (joystick, steering) are not queued: only the latest one matters;
   - a ping every 3 s answered by the TV's server ({t:'pong'}) detects silent dead connections and measures delay.
   Works in the browser and in Node (tests pass their own WebSocket). */
'use strict';
(function (root) {
  function RoomClient(o) {
    const WS = o.WebSocket || root.WebSocket;
    const now = o.now || (() => Date.now());
    const setT = o.setTimeout || root.setTimeout.bind(root), clearT = o.clearTimeout || root.clearTimeout.bind(root);
    const setI = o.setInterval || root.setInterval.bind(root);
    const sess = o.session || Math.random().toString(36).slice(2, 10);
    const R = { status: 'idle', rtt: null, joined: false, sess, seq: 0, outbox: [], stopped: false, tries: 0 };
    let ws = null, retryT = 0, lastPong = 0, pingAt = 0;

    function url() { return o.url(o.room(), o.id); }
    function status(s) { if (R.status !== s) { R.status = s; if (o.onStatus) o.onStatus(s, R); } }

    function connect() {
      if (R.stopped) return;
      clearT(retryT);
      let sock;
      try { sock = new WS(url()); } catch (e) { schedule(); return; }
      ws = sock;
      status(R.tries ? 'reconnecting' : 'connecting');
      sock.onopen = () => {
        if (ws !== sock) return;
        R.tries = 0; lastPong = now();
        status('open');
        raw({ t: 'hello', ...o.hello(), ss: sess });
        R.outbox.forEach((m) => raw(m)); // anything the TV didn't confirm, again and in order
      };
      sock.onmessage = (e) => {
        if (ws !== sock) return;
        let m; try { m = JSON.parse(e.data); } catch (err) { return; }
        lastPong = now();
        if (m.t === 'pong') { if (pingAt) R.rtt = now() - pingAt; return; }
        if (m.t === 'ack') { R.outbox = R.outbox.filter((x) => x.s > m.s); return; }
        // the TV doesn't know this phone (its page restarted) or just came back: introduce ourselves again
        if (m.t === 'who' || (m.t === 'host' && m.on)) raw({ t: 'hello', ...o.hello(), ss: sess });
        if (m.t === 'noroom' || m.t === 'full' || m.t === 'closed' || m.t === 'kicked') { R.stopped = true; R.outbox = []; }
        if (o.onMessage) o.onMessage(m);
      };
      sock.onclose = () => {
        if (ws !== sock) return;
        ws = null;
        if (R.stopped) { status('closed'); return; }
        R.tries++;
        status('reconnecting');
        if (!R.joined && R.tries > 4 && o.onGiveUp) { R.stopped = true; o.onGiveUp(); return; }
        schedule();
      };
      sock.onerror = () => {};
    }
    function schedule() { clearT(retryT); retryT = setT(connect, Math.min(8000, 1000 * Math.pow(2, Math.max(0, R.tries - 1)))); }
    function raw(m) { if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(m)); return true; } catch (e) { /* closing */ } } return false; }

    // pulse: if nothing came back for 9 s the connection is dead even if the phone hasn't noticed
    setI(() => {
      if (!ws || ws.readyState !== 1) return;
      if (now() - lastPong > 9000) { try { ws.close(); } catch (e) { /* ignore */ } if (ws && ws.onclose) ws.onclose(); return; }
      pingAt = now(); raw({ t: 'p' });
    }, 3000);

    return Object.assign(R, {
      start() { R.stopped = false; R.tries = 0; connect(); },
      /** Reliable: numbered, kept until the TV confirms it. */
      send(m) { const msg = { ...m, s: ++R.seq }; R.outbox.push(msg); if (R.outbox.length > 400) R.outbox.shift(); raw(msg); return msg.s; },
      /** Volatile: sent now if connected, dropped otherwise (the next one replaces it). */
      stream(m) { return raw(m); },
      /** Sent again (e.g. the name) without a sequence number. */
      hello() { return raw({ t: 'hello', ...o.hello(), ss: sess }); },
      /** Reconnect right away (page visible again, network back). */
      nudge() { if (R.stopped) return; if (!ws || ws.readyState > 1) { R.tries = Math.max(1, R.tries); connect(); } },
      stop() { R.stopped = true; clearT(retryT); const w = ws; ws = null; if (w) { try { w.close(); } catch (e) { /* ignore */ } } status('closed'); },
      /** For tests: cut the connection as a Wi-Fi drop would. */
      drop() { const w = ws; if (w) { try { w.close(); } catch (e) { /* ignore */ } } },
    });
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = RoomClient; else root.RoomClient = RoomClient;
})(typeof window !== 'undefined' ? window : globalThis);
