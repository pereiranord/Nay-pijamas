/* TV Drop — party games: what the TV screen and the phone controllers share.
   Each game file calls J.define(id, { ...meta, tv(api), pad(api) }). */
'use strict';
const J = (() => {
  const COLORS = ['#ff4d6d', '#ffd23f', '#3df5a7', '#3dc9ff', '#b47cff', '#ff9a3d'];
  const COLOR_NAMES = ['Rosa', 'Amarelo', 'Verde', 'Azul', 'Roxo', 'Laranja'];
  const SHAPES = ['bola', 'quadrado', 'triangulo', 'estrela', 'hexagono', 'gota'];
  const GAMES = {};
  const ORDER = [];
  const define = (id, def) => { def.id = id; GAMES[id] = def; ORDER.push(id); };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const irand = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /** "Pão-de-Açúcar!" -> "pao de acucar": for comparing typed answers. */
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const ordinal = (n) => n + 'º';

  /** Edit distance, for "almost!" on guesses. */
  function distance(a, b) {
    const m = a.length, n = b.length;
    if (!m || !n) return m + n;
    let prev = Array.from({ length: n + 1 }, (_, i) => i);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }

  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.round(clamp(k < 0 ? v * (1 + k) : v + (255 - v) * k, 0, 255));
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }
  const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

  /* ---------- the players' characters: one shape + one color each ---------- */
  function shapePath(c, shape, r) {
    c.beginPath();
    const poly = (n, rot, rad = r) => { for (let i = 0; i < n; i++) { const a = rot + (i * 2 * Math.PI) / n; c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rad, Math.sin(a) * rad); } c.closePath(); };
    if (shape === 'quadrado') { const s = r * 0.84; c.moveTo(-s, -s); c.lineTo(s, -s); c.lineTo(s, s); c.lineTo(-s, s); c.closePath(); }
    else if (shape === 'triangulo') { c.moveTo(0, -r * 0.98); c.lineTo(r * 0.98, r * 0.78); c.lineTo(-r * 0.98, r * 0.78); c.closePath(); }
    else if (shape === 'estrela') { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rad = i % 2 ? r * 0.58 : r * 1.06; c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rad, Math.sin(a) * rad); } c.closePath(); }
    else if (shape === 'hexagono') poly(6, Math.PI / 6, r * 0.98);
    else if (shape === 'gota') { c.moveTo(0, -r * 1.12); c.bezierCurveTo(r * 0.5, -r * 0.45, r * 0.95, -r * 0.05, r * 0.95, r * 0.3); c.arc(0, r * 0.3, r * 0.95, 0, Math.PI); c.bezierCurveTo(-r * 0.95, -r * 0.05, -r * 0.5, -r * 0.45, 0, -r * 1.12); c.closePath(); }
    else c.arc(0, 0, r, 0, Math.PI * 2);
  }

  /** Draws a character. o: { mood: 'happy'|'sad'|'wow'|'dead'|'angry', look:[x,y], t (seconds, for blinking), alpha } */
  function drawBuddy(c, x, y, r, p, o = {}) {
    const color = p.color || COLORS[0];
    c.save();
    c.translate(x, y);
    if (o.rot) c.rotate(o.rot);
    if (o.alpha != null) c.globalAlpha = o.alpha;
    c.lineJoin = 'round';
    // soft shadow on the ground
    if (o.shadow !== false) { c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.ellipse(0, r * 1.08, r * 0.8, r * 0.16, 0, 0, Math.PI * 2); c.fill(); }
    shapePath(c, p.shape, r);
    c.lineWidth = r * 0.3; c.strokeStyle = shade(color, -0.45); c.stroke();
    c.fillStyle = color; c.fill();
    c.lineWidth = r * 0.14; c.strokeStyle = color; c.stroke();
    // shine
    c.save(); shapePath(c, p.shape, r); c.clip();
    c.fillStyle = 'rgba(255,255,255,.22)'; c.beginPath(); c.ellipse(-r * 0.35, -r * 0.55, r * 0.75, r * 0.42, -0.5, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(0,0,0,.12)'; c.beginPath(); c.ellipse(r * 0.2, r * 0.95, r * 1.1, r * 0.5, 0, 0, Math.PI * 2); c.fill();
    c.restore();
    // face
    const mood = o.mood || 'happy';
    const cy = p.shape === 'triangulo' || p.shape === 'gota' ? r * 0.22 : 0;
    const ex = r * 0.3, ey = cy - r * 0.08, er = r * 0.2;
    const look = o.look || [0, 0];
    const blink = o.t != null && ((o.t + (p.idx || 0) * 0.7) % 3.4) < 0.12;
    const ink = '#1a1330';
    c.lineCap = 'round';
    for (const s of [-1, 1]) {
      if (mood === 'dead') { c.strokeStyle = ink; c.lineWidth = r * 0.09; c.beginPath(); c.moveTo(s * ex - er * 0.6, ey - er * 0.6); c.lineTo(s * ex + er * 0.6, ey + er * 0.6); c.moveTo(s * ex + er * 0.6, ey - er * 0.6); c.lineTo(s * ex - er * 0.6, ey + er * 0.6); c.stroke(); continue; }
      if (blink) { c.strokeStyle = ink; c.lineWidth = r * 0.08; c.beginPath(); c.moveTo(s * ex - er * 0.7, ey); c.lineTo(s * ex + er * 0.7, ey); c.stroke(); continue; }
      c.fillStyle = '#fff'; c.beginPath(); c.ellipse(s * ex, ey, er, er * (mood === 'wow' ? 1.25 : 1.1), 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = ink; c.beginPath(); c.arc(s * ex + look[0] * er * 0.4, ey + look[1] * er * 0.4, er * (mood === 'wow' ? 0.42 : 0.55), 0, Math.PI * 2); c.fill();
      if (mood === 'angry' || mood === 'sad') { c.strokeStyle = ink; c.lineWidth = r * 0.08; c.beginPath(); const d = mood === 'angry' ? 1 : -1; c.moveTo(s * (ex + er * 0.9), ey - er * (1.55 + 0.3 * d)); c.lineTo(s * (ex - er * 0.9), ey - er * (1.55 - 0.3 * d)); c.stroke(); }
    }
    c.strokeStyle = ink; c.fillStyle = ink; c.lineWidth = r * 0.08;
    const my = cy + r * 0.34;
    c.beginPath();
    if (mood === 'happy') { c.arc(0, my - r * 0.08, r * 0.2, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke(); }
    else if (mood === 'wow') { c.ellipse(0, my, r * 0.1, r * 0.14, 0, 0, Math.PI * 2); c.fill(); }
    else if (mood === 'sad' || mood === 'dead') { c.arc(0, my + r * 0.14, r * 0.18, 1.15 * Math.PI, 1.85 * Math.PI); c.stroke(); }
    else { c.moveTo(-r * 0.16, my); c.lineTo(r * 0.16, my); c.stroke(); }
    c.restore();
  }

  /** A character as an element (for menus and text games). */
  function buddyEl(p, size = 96, mood = 'happy') {
    const cv = document.createElement('canvas');
    const k = Math.min(3, window.devicePixelRatio || 1);
    cv.width = cv.height = Math.round(size * k);
    cv.style.width = cv.style.height = size + 'px';
    cv.className = 'buddy';
    const c = cv.getContext('2d');
    c.scale(k, k);
    drawBuddy(c, size / 2, size * 0.47, size * 0.33, p, { mood });
    return cv;
  }

  /* ---------- sounds: a tiny synth, no files ---------- */
  const Sfx = (() => {
    let ac = null, master = null, muted = false;
    const ctx = () => {
      if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination); } catch (e) { ac = null; } }
      if (ac && ac.state === 'suspended') ac.resume().catch(() => {});
      return ac;
    };
    function tone(freq, dur, { type = 'sine', vol = 0.3, at = 0, slide = 0, attack = 0.005 } = {}) {
      const a = ctx(); if (!a || muted) return;
      const t = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
    }
    function noise(dur, { vol = 0.3, at = 0, low = 800 } = {}) {
      const a = ctx(); if (!a || muted) return;
      const t = a.currentTime + at, len = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const s = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.setValueAtTime(low * 4, t); f.frequency.exponentialRampToValueAtTime(low / 4, t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.buffer = buf; s.connect(f); f.connect(g); g.connect(master); s.start(t);
    }
    const S = {
      join: () => { tone(523, 0.12, { type: 'triangle' }); tone(784, 0.18, { type: 'triangle', at: 0.09 }); },
      leave: () => tone(330, 0.2, { type: 'triangle', slide: -120 }),
      move: () => tone(660, 0.05, { type: 'square', vol: 0.08 }),
      select: () => { tone(660, 0.08, { type: 'triangle' }); tone(990, 0.14, { type: 'triangle', at: 0.07 }); },
      tick: () => tone(880, 0.07, { type: 'square', vol: 0.12 }),
      count: () => tone(440, 0.16, { type: 'triangle', vol: 0.35 }),
      go: () => { tone(880, 0.4, { type: 'triangle', vol: 0.4 }); tone(1320, 0.4, { type: 'sine', vol: 0.2 }); },
      shot: () => tone(900, 0.09, { type: 'sawtooth', vol: 0.1, slide: -600 }),
      hit: () => { noise(0.14, { vol: 0.35, low: 1200 }); tone(180, 0.14, { type: 'square', vol: 0.2, slide: -90 }); },
      boom: () => { noise(0.7, { vol: 0.7, low: 500 }); tone(90, 0.6, { type: 'sine', vol: 0.6, slide: -50 }); },
      power: () => { tone(523, 0.08, { type: 'square', vol: 0.15 }); tone(659, 0.08, { type: 'square', vol: 0.15, at: 0.07 }); tone(1047, 0.16, { type: 'square', vol: 0.15, at: 0.14 }); },
      dash: () => noise(0.18, { vol: 0.2, low: 3000 }),
      pass: () => tone(500, 0.16, { type: 'sine', vol: 0.3, slide: 500 }),
      good: () => { tone(784, 0.1, { type: 'triangle' }); tone(1175, 0.2, { type: 'triangle', at: 0.09 }); },
      bad: () => { tone(220, 0.16, { type: 'sawtooth', vol: 0.2 }); tone(165, 0.26, { type: 'sawtooth', vol: 0.2, at: 0.13 }); },
      pop: () => tone(700, 0.07, { type: 'sine', vol: 0.25, slide: 500 }),
      reveal: () => { tone(392, 0.12, { type: 'triangle' }); tone(523, 0.12, { type: 'triangle', at: 0.1 }); tone(659, 0.12, { type: 'triangle', at: 0.2 }); tone(784, 0.3, { type: 'triangle', at: 0.3 }); },
      drum: () => { for (let i = 0; i < 14; i++) noise(0.05, { vol: 0.12 + i * 0.012, at: i * 0.07, low: 2500 }); },
      win: () => { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i === 5 ? 0.6 : 0.14, { type: 'triangle', vol: 0.35, at: i * 0.13 })); },
      lap: () => { tone(988, 0.1, { type: 'square', vol: 0.15 }); tone(1319, 0.2, { type: 'square', vol: 0.15, at: 0.1 }); },
      skid: () => noise(0.3, { vol: 0.15, low: 4000 }),
      fuse: () => noise(0.05, { vol: 0.08, low: 6000 }),
    };
    return { play: (n) => { try { if (S[n]) S[n](); } catch (e) { /* no audio */ } }, tone, noise, mute: (m) => { muted = m; }, unlock: ctx };
  })();

  /* ---------- particles for the canvas games ---------- */
  class Particles {
    constructor() { this.list = []; }
    burst(x, y, color, n = 16, o = {}) {
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2), v = rand(o.min || 40, o.max || 260);
        this.list.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: rand(0.3, o.life || 0.8), size: rand(2, o.size || 5), color, drag: o.drag || 2.2, g: o.g || 0 });
      }
    }
    add(p) { this.list.push({ life: 0, max: 0.5, size: 3, vx: 0, vy: 0, drag: 0, g: 0, ...p }); }
    step(dt) {
      for (let i = this.list.length - 1; i >= 0; i--) {
        const p = this.list[i];
        p.life += dt;
        if (p.life >= p.max) { this.list.splice(i, 1); continue; }
        p.vx -= p.vx * p.drag * dt; p.vy -= p.vy * p.drag * dt; p.vy += p.g * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
      }
      if (this.list.length > 900) this.list.splice(0, this.list.length - 900);
    }
    draw(c) {
      c.save(); c.globalCompositeOperation = 'lighter';
      for (const p of this.list) { const k = 1 - p.life / p.max; c.globalAlpha = k; c.fillStyle = p.color; c.beginPath(); c.arc(p.x, p.y, p.size * (0.4 + 0.6 * k), 0, Math.PI * 2); c.fill(); }
      c.restore();
    }
  }

  if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) { // older TV WebViews
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r); this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath(); };
  }
  /** n items of `pool` that were not drawn recently (remembered on this device under `key`), so words don't repeat
      from one match to the next. When everything was used, the oldest come back first. */
  function fresh(key, pool, n = 1) {
    let used = [];
    try { used = JSON.parse(localStorage.getItem('tvdrop.used.' + key) || '[]'); } catch (e) { used = []; }
    if (!Array.isArray(used)) used = [];
    const inPool = new Set(pool), cap = Math.min(1500, Math.floor(pool.length * 0.7));
    used = used.filter((w) => inPool.has(w));
    const usedSet = new Set(used);
    const out = shuffle(pool.filter((w) => !usedSet.has(w))).slice(0, n);
    for (let i = 0; out.length < n && i < used.length; i++) if (!out.includes(used[i])) out.push(used[i]); // oldest first
    used = used.filter((w) => !out.includes(w)).concat(out).slice(-cap);
    try { localStorage.setItem('tvdrop.used.' + key, JSON.stringify(used)); } catch (e) { /* private mode */ }
    return out;
  }
  /* ---------- pieces most games repeat ---------- */
  /** TV: a countdown on the top bar's timer. Returns { stop(), left() }; `each(left)` runs once per second. */
  function clock(api, bar, secs, done, each) {
    const deadline = Date.now() + secs * 1000;
    let lastWhole = 1e9, live = true;
    const stop = () => { if (!live) return; live = false; api.cancel(id); bar.time(null); };
    const id = api.every(200, () => {
      if (!live) return;
      const left = (deadline - Date.now()) / 1000; bar.time(left);
      const w = Math.ceil(left);
      if (w !== lastWhole) { lastWhole = w; if (w <= 5 && w > 0) api.sfx('tick'); if (each) each(left); }
      if (left <= 0) { stop(); done(); }
    });
    return { stop, left: () => Math.max(0, (deadline - Date.now()) / 1000) };
  }
  /** TV: one face per player, marked when `done[id]` is set (who already answered). */
  function waiters(api, box, done, players) {
    if (!box) return;
    box.innerHTML = '';
    (players || api.players).forEach((p) => { const ok = done[p.id] != null && done[p.id] !== false; const w = el('div', 'waiter' + (ok ? ' done' : '')); w.appendChild(api.buddy(p, 4.6, ok ? 'happy' : 'wow')); w.appendChild(el('span', '', esc(p.name))); box.appendChild(w); });
  }
  /** Phone: the usual top line (character, name, clock, points) and a box for the game.
      Returns { box, time(secs | 0), pts(text), wait(title, sub, player, mood), by(id) }. */
  function padHud(api) {
    const { root, me } = api;
    root.insertAdjacentHTML('beforeend', `<div class="hud"><span id="hudB"></span><span class="name">${esc(me.name)}</span><span class="pillv" id="hudClock" hidden></span><span class="pillv" id="hudPts" hidden></span></div><div class="gbox" id="box"></div>`);
    root.querySelector('#hudB').replaceWith(api.buddy(me, 40));
    const box = root.querySelector('#box'), clockEl = root.querySelector('#hudClock'), ptsEl = root.querySelector('#hudPts');
    let end = 0;
    api.every(250, () => { const left = Math.ceil((end - Date.now()) / 1000); const on = end && left > 0; clockEl.hidden = !on; if (on) { clockEl.textContent = left + ' s'; clockEl.style.color = left <= 10 ? '#ff4d6d' : ''; } });
    const by = (id) => api.players.find((p) => p.id === id) || { id, name: '?', color: '#888888', shape: 'bola' };
    return {
      box, by,
      time(secs) { end = secs ? Date.now() + secs * 1000 : 0; },
      pts(text) { ptsEl.hidden = text == null; ptsEl.textContent = text; },
      wait(title, sub, p, mood) { end = 0; box.innerHTML = `<div class="centered"><span id="wb"></span><div class="big">${esc(title)}</div><p class="muted" style="font-size:16px;max-width:320px">${esc(sub || '')}</p></div>`; box.querySelector('#wb').replaceWith(api.buddy(p || me, 110, mood)); },
    };
  }

  /** "1 ponto", "2 pontos". */
  const unit = (n, u) => (Math.abs(n) === 1 ? String(u).replace(/s$/, '') : u);
  const fmtPts = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  return { COLORS, COLOR_NAMES, SHAPES, GAMES, ORDER, define, clamp, lerp, rand, irand, pick, shuffle, esc, norm, el, ordinal, distance, shade, rgba, shapePath, drawBuddy, buddyEl, Sfx, Particles, fmtPts, unit, fresh, clock, waiters, padHud };
})();
