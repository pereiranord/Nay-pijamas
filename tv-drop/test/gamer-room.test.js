// Tests for the shared game room layer (gamer/room-host.js on the TV, gamer/room-client.js on phones),
// with an in-memory copy of the TV's server (GameHub) and a virtual clock. Run: node test/gamer-room.test.js
'use strict';
const assert = require('assert');
const RoomHost = require('../assets/web/gamer/room-host.js');
const RoomClient = require('../assets/web/gamer/room-client.js');

/* ---------- virtual clock ---------- */
function Clock() {
  let t = 1000, seq = 0;
  const q = [];
  const add = (fn, ms, every) => { const id = ++seq; q.push({ id, at: t + ms, fn, every }); return id; };
  const c = {
    now: () => t,
    setTimeout: (fn, ms) => add(fn, ms || 0, 0),
    setInterval: (fn, ms) => add(fn, ms, ms),
    clearTimeout: (id) => { const i = q.findIndex((x) => x.id === id); if (i >= 0) q.splice(i, 1); },
    run(ms) {
      const end = t + ms;
      for (;;) {
        q.sort((a, b) => a.at - b.at || a.id - b.id);
        const next = q[0];
        if (!next || next.at > end) break;
        t = next.at;
        if (next.every) next.at = t + next.every; else q.shift();
        next.fn();
      }
      t = end;
    },
  };
  c.clearInterval = c.clearTimeout;
  return c;
}

/* ---------- in-memory GameHub (same rules as GameHub.java) ---------- */
function Hub(clock, code = '4321') {
  const H = { host: null, players: new Map(), code, delivered: [], down: false };
  const later = (fn) => clock.setTimeout(fn, 1);
  function Sock(kind, id) {
    const s = { readyState: 0, kind, id, sent: [], onopen: null, onmessage: null, onclose: null, onerror: null };
    s.send = (text) => { if (s.readyState !== 1) throw new Error('closed'); if (s.dead) return; s.sent.push(text); later(() => fromSock(s, text)); };
    s.close = () => { if (s.readyState === 3) return; s.readyState = 3; later(() => { gone(s); if (s.onclose) s.onclose(); }); };
    s.deliver = (obj) => later(() => { if (s.readyState === 1 && !s.dead && s.onmessage) s.onmessage({ data: typeof obj === 'string' ? obj : JSON.stringify(obj) }); });
    return s;
  }
  function WS(url) {
    const u = new URL(url, 'ws://tv');
    const isHost = u.searchParams.get('role') === 'host';
    const s = Sock(isHost ? 'host' : 'player', u.searchParams.get('id'));
    if (H.down) { later(() => { s.readyState = 3; if (s.onclose) s.onclose(); }); return s; }
    later(() => {
      s.readyState = 1;
      if (s.onopen) s.onopen();
      if (isHost) {
        if (H.host) H.host.close();
        H.host = s;
        s.deliver({ t: 'room', code: H.code, url: 'http://tv/jogar' });
        for (const id of H.players.keys()) s.deliver({ t: 'join', id });
      } else {
        if (u.searchParams.get('room') !== H.code) { s.deliver({ t: 'noroom' }); later(() => s.close()); return; }
        const old = H.players.get(s.id);
        H.players.set(s.id, s);
        if (old) old.close();
        s.deliver({ t: 'host', on: !!H.host });
        if (H.host) H.host.deliver({ t: 'join', id: s.id });
      }
    });
    return s;
  }
  function fromSock(s, text) {
    if (s.readyState !== 1) return;
    if (s.kind === 'host') {
      const bar = text.indexOf('|'); if (bar <= 0) return;
      const to = text.slice(0, bar), data = text.slice(bar + 1);
      if (to === '!kick') { const p = H.players.get(data); if (p) { H.players.delete(data); p.deliver({ t: 'kicked' }); later(() => p.close()); s.deliver({ t: 'leave', id: data, kicked: true }); } return; }
      if (to === '*') { for (const p of H.players.values()) p.deliver(data); return; }
      const p = H.players.get(to); if (p) p.deliver(data);
    } else {
      if (text.startsWith('{"t":"p"')) { s.deliver({ t: 'pong' }); return; }
      if (H.players.get(s.id) !== s) return;
      H.delivered.push(JSON.parse(text));
      if (H.host) H.host.deliver({ t: 'm', id: s.id, d: JSON.parse(text) });
    }
  }
  function gone(s) {
    if (s.kind === 'player' && H.players.get(s.id) === s) { H.players.delete(s.id); if (H.host) H.host.deliver({ t: 'leave', id: s.id }); }
    if (s.kind === 'host' && H.host === s) H.host = null;
  }
  H.WebSocket = WS;
  /** The phone's Wi-Fi drops: its socket dies without the phone hearing a close for a while. */
  // (like a real browser, the socket still looks open: sends vanish and nothing arrives)
  H.silence = (id) => { const p = H.players.get(id); if (p) { p.dead = true; H.players.delete(id); if (H.host) H.host.deliver({ t: 'leave', id }); } };
  return H;
}

function setup() {
  const clock = Clock();
  const hub = Hub(clock);
  const got = [];
  const events = [];
  const host = RoomHost({ WebSocket: hub.WebSocket, url: () => 'ws://tv/ws?role=host&key=k', now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, setInterval: clock.setInterval, pruneMs: 15000,
    on: { message: (p, d) => got.push([p.id, d]), joined: (p) => events.push('joined:' + p.name), removed: (p) => events.push('removed:' + p.name), quiet: () => true } });
  host.start();
  const phone = (id, name, opts = {}) => {
    const msgs = [];
    const c = RoomClient({ WebSocket: hub.WebSocket, url: (r, i) => `ws://tv/ws?room=${r}&id=${i}`, room: () => opts.room || '4321', id, hello: () => ({ name }),
      now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, setInterval: clock.setInterval, session: opts.session, onMessage: (m) => msgs.push(m) });
    c.msgs = msgs;
    c.start();
    return c;
  };
  return { clock, hub, host, got, events, phone };
}

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('a phone joins: the TV registers it with a color, a character and the host role', () => {
  const { clock, host, phone, events } = setup();
  const ana = phone('anaphone001', 'Ana');
  clock.run(100);
  assert.strictEqual(host.players.length, 1);
  assert.strictEqual(host.players[0].name, 'Ana');
  assert.strictEqual(host.leader().id, 'anaphone001');
  assert.deepStrictEqual(events, ['joined:Ana']);
  const bia = phone('biaphone002', 'Bia');
  clock.run(100);
  assert.strictEqual(host.players[1].color !== host.players[0].color, true);
  assert.strictEqual(host.players[1].shape !== host.players[0].shape, true);
  assert.strictEqual(ana.status, 'open'); assert.strictEqual(bia.status, 'open');
});

test('reliable messages: confirmed by the TV and then dropped from the outbox', () => {
  const { clock, phone, got } = setup();
  const ana = phone('anaphone001', 'Ana');
  clock.run(100);
  ana.send({ t: 'g', k: 'vote', i: 1 });
  ana.send({ t: 'g', k: 'vote', i: 2 });
  assert.strictEqual(ana.outbox.length, 2);
  clock.run(200);
  assert.deepStrictEqual(got.map((x) => x[1].i), [1, 2]);
  assert.strictEqual(ana.outbox.length, 0, 'the TV confirmed both');
});

test('Wi-Fi drop: what was sent during the drop arrives once, in order, after reconnecting', () => {
  const { clock, hub, host, phone, got } = setup();
  const ana = phone('anaphone001', 'Ana');
  clock.run(100);
  ana.send({ t: 'g', k: 'a' });
  clock.run(100);
  hub.silence('anaphone001'); // the network dies: the phone still believes it's connected
  ana.send({ t: 'g', k: 'b' });
  ana.send({ t: 'g', k: 'c' });
  clock.run(100);
  assert.strictEqual(host.players[0].on, false, 'the TV saw the phone go');
  assert.deepStrictEqual(got.map((x) => x[1].k), ['a']);
  clock.run(30000); // the pulse notices the dead connection and the phone reconnects by itself
  assert.strictEqual(ana.status, 'open');
  assert.strictEqual(host.players[0].on, true, 'back in the room');
  assert.deepStrictEqual(got.map((x) => x[1].k), ['a', 'b', 'c']);
  assert.strictEqual(ana.outbox.length, 0);
});

test('messages sent twice (resend after a reconnect) are applied once', () => {
  const { clock, hub, phone, got, host } = setup();
  const ana = phone('anaphone001', 'Ana');
  clock.run(100);
  ana.send({ t: 'g', k: 'x' });
  ana.send({ t: 'g', k: 'y' });
  clock.run(2); // delivered to the TV, but the confirmation is still on its way
  hub.players.get('anaphone001').close(); // the connection breaks before the ack arrives
  clock.run(20000);
  assert.deepStrictEqual(got.map((x) => x[1].k), ['x', 'y'], 'no duplicates');
  assert.ok(host.stats.dup >= 1, 'the repeats were recognized and confirmed');
  assert.strictEqual(ana.outbox.length, 0);
});

test('a reloaded phone page starts counting again and is not mistaken for repeats', () => {
  const { clock, phone, got } = setup();
  const a1 = phone('anaphone001', 'Ana', { session: 'page1' });
  clock.run(100);
  a1.send({ t: 'g', k: 'one' }); a1.send({ t: 'g', k: 'two' });
  clock.run(100);
  a1.stop();
  const a2 = phone('anaphone001', 'Ana', { session: 'page2' }); // same phone, new page
  clock.run(100);
  a2.send({ t: 'g', k: 'three' });
  clock.run(100);
  assert.deepStrictEqual(got.map((x) => x[1].k), ['one', 'two', 'three']);
});

test('streamed input (joystick) is limited per phone; reliable messages are not', () => {
  const { clock, phone, got, host } = setup();
  const ana = phone('anaphone001', 'Ana');
  clock.run(100);
  for (let i = 0; i < 300; i++) ana.stream({ t: 'g', k: 'in', i });
  for (let i = 0; i < 50; i++) ana.send({ t: 'g', k: 'r', i });
  clock.run(300);
  const streamed = got.filter((x) => x[1].k === 'in').length;
  assert.ok(streamed <= 45 && streamed >= 30, 'a burst of 300 joystick messages is cut to about 40: ' + streamed);
  assert.strictEqual(got.filter((x) => x[1].k === 'r').length, 50, 'every reliable message arrives');
  assert.ok(host.stats.limited > 200);
});

test('the host removes a player; a phone that left is forgotten after a while outside a match', () => {
  const { clock, host, phone, events } = setup();
  const ana = phone('anaphone001', 'Ana');
  const bia = phone('biaphone002', 'Bia');
  clock.run(100);
  host.kick(host.byId('biaphone002'));
  clock.run(100);
  assert.deepStrictEqual(host.players.map((p) => p.name), ['Ana']);
  assert.ok(bia.msgs.some((m) => m.t === 'kicked'));
  assert.strictEqual(bia.status, 'closed', 'a removed phone does not reconnect by itself');
  ana.stop();
  clock.run(5000);
  assert.strictEqual(host.players.length, 1, 'still kept for a moment (locked screen)');
  clock.run(15000);
  assert.strictEqual(host.players.length, 0);
  assert.ok(events.includes('removed:Ana'));
});

test('the TV restarts its page: phones are asked who they are and come back with their names', () => {
  const { clock, hub, phone, got } = setup();
  phone('anaphone001', 'Ana');
  clock.run(100);
  const got2 = [];
  const host2 = RoomHost({ WebSocket: hub.WebSocket, url: () => 'ws://tv/ws?role=host&key=k', now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, setInterval: clock.setInterval, on: { message: (p, d) => got2.push(d) } });
  host2.start();
  clock.run(300);
  assert.deepStrictEqual(host2.players.map((p) => p.name), ['Ana']);
  void got;
});

test('wrong room code: the phone is told and stops trying', () => {
  const { clock, phone } = setup();
  const x = phone('xphone00001', 'X', { room: '9999' });
  clock.run(30000);
  assert.ok(x.msgs.some((m) => m.t === 'noroom'));
  assert.strictEqual(x.status, 'closed');
});

test('the pulse measures the delay to the TV', () => {
  const { clock, phone } = setup();
  const ana = phone('anaphone001', 'Ana');
  clock.run(6000);
  assert.ok(ana.rtt != null && ana.rtt >= 0 && ana.rtt < 50, 'rtt ' + ana.rtt);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + '\n    ' + (e.stack || e.message).split('\n').slice(0, 4).join('\n    ')); }
}
console.log(failed ? `room: ${failed} de ${tests.length} testes falharam` : `room: ${tests.length} testes ok`);
process.exit(failed ? 1 : 0);
