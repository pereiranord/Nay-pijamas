/* Pesca Maluca — a lake full of odd fish on the TV. Swipe up on the phone to cast (longer swipe = farther, where
   the rare fish are); when a fish bites the phone shakes: pull right then. Too early and the fish runs away, too
   late and it takes the bait. The pull is judged by the time measured on the phone itself (from the moment the bite
   appeared there), so a slow Wi-Fi doesn't steal anybody's fish. */
'use strict';
(() => {
  // zone: how far from the shore it lives (0 near … 1 far)
  const KINDS = {
    sardinha: { name: 'Sardinha', pts: 10, color: '#b9d6e8', len: 30, zone: [0, 0.45], speed: 70, w: 30 },
    tilapia: { name: 'Tilápia', pts: 20, color: '#7fd1a0', len: 40, zone: [0.15, 0.7], speed: 55, w: 24 },
    dourado: { name: 'Dourado', pts: 50, color: '#ffc94d', len: 52, zone: [0.45, 1], speed: 80, w: 14 },
    espada: { name: 'Peixe-espada', pts: 80, color: '#8fa3ff', len: 74, zone: [0.65, 1], speed: 110, w: 8 },
    bau: { name: 'Baú do tesouro', pts: 150, color: '#c98a3a', len: 44, zone: [0.75, 1], speed: 12, w: 3 },
    bota: { name: 'Bota velha', pts: 0, color: '#7a6a5a', len: 36, zone: [0, 1], speed: 26, w: 5 },
    tubarao: { name: 'Tubarão ladrão', pts: -30, color: '#8c98a8', len: 96, zone: [0.55, 1], speed: 60, w: 5 },
  };
  const BITE_MS = 1100, SHORE = 600, FAR = 150;

  J.define('pesca', {
    name: 'Pesca Maluca', kind: 'ação', min: 2, max: 6, unit: 'pontos',
    tagline: 'Arremesse com um deslize e puxe na hora certa.',
    grad: 'linear-gradient(135deg,#3dc9ff,#1f4fd8)',
    icon: '<path d="M4 4l12 8"/><path d="M16 12v4a2.5 2.5 0 0 1-5 0"/><path d="M3 18c2-2 4 2 6 0M13 20c2-2 4 2 6 0"/>',
    how: [['Arremesse', 'Deslize o dedo para cima: quanto mais longo, mais longe.'], ['Espere', 'O celular treme quando o peixe morde.'], ['Puxe', 'Na hora certa, o peixe é seu. Os raros ficam longe.']],
    padHow: 'Deslize para cima para arremessar a linha. Quando o celular tremer, toque para puxar. Peixes raros ficam mais longe da margem.',
    settings: [{ id: 'secs', label: 'Tempo de pescaria', options: [[60, '1 min'], [90, '1 min 30'], [120, '2 min'], [180, '3 min']] }],
    presets: { rapido: { secs: 60 }, normal: { secs: 90 }, longo: { secs: 180 } },

    /* ------------------------------------------------------------------ TV */
    tv(api) {
      const c = api.canvas(), bar = api.topbar(true), parts = new J.Particles();
      const SECS = api.settings.secs || 90;
      const P = api.players, n = P.length;
      const S = {}; // each player's rod
      P.forEach((p, i) => { S[p.id] = { x: 1280 * ((i + 0.5) / n), state: 'idle', hx: 0, hy: 0, tx: 0, ty: 0, fly: 0, fish: null, biteAt: 0, score: 0, count: 0, best: null, msg: '', msgT: 0 }; bar.score(p, '0'); });
      let fish = [], left = SECS, over = false, spawnT = 0;
      const bag = []; Object.keys(KINDS).forEach((k) => { for (let i = 0; i < KINDS[k].w; i++) bag.push(k); });
      const say = (p, text, color) => { S[p.id].msg = text; S[p.id].msgT = 1.8; S[p.id].msgC = color || '#fff'; };
      const tell = (p, m) => { S[p.id].last = m; api.send(p, m); };

      function spawn(anywhere) {
        const kind = J.pick(bag), K = KINDS[kind], dir = Math.random() < 0.5 ? 1 : -1;
        const z = J.rand(K.zone[0], K.zone[1]);
        fish.push({ kind, x: anywhere ? J.rand(60, 1220) : dir > 0 ? -80 : 1360, y: SHORE - 60 - z * (SHORE - 60 - FAR), dir, v: K.speed * J.rand(0.75, 1.25), wob: J.rand(0, 7), target: null, wait: 0, flee: 0 });
      }
      function reel(p, quiet) { const s = S[p.id]; if (s.fish) { s.fish.target = null; s.fish.flee = 1.4; s.fish = null; } s.state = 'idle'; if (!quiet) tell(p, { k: 'idle', total: s.score }); }

      function cast(p, power, angle) {
        const s = S[p.id];
        if (s.state !== 'idle' || over) return;
        s.state = 'fly'; s.fly = 0; s.hx = s.x; s.hy = SHORE + 20;
        s.tx = J.clamp(s.x + angle * 300, 30, 1250); s.ty = SHORE - 70 - power * (SHORE - 70 - FAR);
        api.sfx('dash'); tell(p, { k: 'cast' });
      }
      function pull(p, dt) {
        const s = S[p.id];
        if (over || s.state === 'idle' || s.state === 'fly') return;
        if (s.state === 'bite' && s.fish && dt >= 0 && dt <= BITE_MS) { // the phone saw the bite and answered in time
          const f = s.fish, K = KINDS[f.kind];
          fish = fish.filter((x) => x !== f);
          s.fish = null; s.state = 'idle';
          s.score = Math.max(0, s.score + K.pts); bar.score(p, J.fmtPts(s.score));
          if (K.pts > 0) { s.count++; if (!s.best || K.pts > KINDS[s.best].pts) s.best = f.kind; }
          parts.burst(s.hx, s.hy, '#dff6ff', 22, { max: 240, life: 0.7, size: 5 });
          say(p, (K.pts > 0 ? '+' : '') + (K.pts || 'Nada: ') + (K.pts ? ' ' : '') + K.name, K.pts >= 50 ? '#ffd23f' : K.pts > 0 ? '#3df5a7' : '#ff8fa3');
          api.sfx(K.pts >= 50 ? 'power' : K.pts > 0 ? 'good' : 'bad'); api.fx(p, K.pts >= 50 ? 'good' : K.pts > 0 ? 'buzz' : 'bad');
          tell(p, { k: 'res', kind: 'catch', name: K.name, pts: K.pts, total: s.score });
          return;
        }
        // nothing was biting (or the answer came from a bite that already ended): the line comes back empty
        const early = s.state === 'wait';
        say(p, early ? 'Cedo demais!' : 'Escapou!', '#ffb199'); api.sfx('pop');
        reel(p, true); tell(p, { k: 'res', kind: early ? 'early' : 'late', total: s.score });
      }

      function step(dt) {
        if (over) { parts.step(dt); return; }
        left -= dt; bar.time(left);
        if (left <= 0) {
          over = true; bar.time(null); api.sfx('win');
          P.forEach((p) => api.send(p, { k: 'fim', total: S[p.id].score }));
          api.after(2600, () => api.end(P.map((p) => ({ id: p.id, pts: S[p.id].score, note: S[p.id].count + (S[p.id].count === 1 ? ' peixe' : ' peixes') + (S[p.id].best ? ' · melhor: ' + KINDS[S[p.id].best].name : '') }))));
          return;
        }
        spawnT -= dt;
        if (spawnT <= 0 && fish.length < 9 + n * 2) { spawn(false); spawnT = J.rand(0.5, 1.4); }
        const now = Date.now();
        P.forEach((p) => {
          const s = S[p.id];
          if (s.msgT > 0) s.msgT -= dt;
          if (s.state === 'fly') {
            s.fly += dt / 0.55; const k = Math.min(1, s.fly);
            s.hx = J.lerp(s.x, s.tx, k); s.hy = J.lerp(SHORE + 20, s.ty, k) - Math.sin(k * Math.PI) * 130;
            if (k >= 1) { s.state = 'wait'; s.hx = s.tx; s.hy = s.ty; s.landed = now; parts.burst(s.hx, s.hy, '#dff6ff', 12, { max: 140, life: 0.5 }); api.sfx('pop'); }
          } else if (s.state === 'wait' && !s.fish && now - s.landed > 500) {
            // the closest free fish notices the bait
            let best = null, bd = 170;
            for (const f of fish) { if (f.target || f.flee > 0) continue; const d = Math.hypot(f.x - s.hx, f.y - s.hy); if (d < bd) { bd = d; best = f; } }
            if (best) { best.target = s; best.wait = J.rand(0.3, 1.5); s.fish = best; }
          } else if (s.state === 'bite' && now - s.biteAt > BITE_MS + 900) { // nobody pulled: the fish leaves with the bait
            say(p, 'Levou a isca!', '#ffb199'); api.sfx('bad');
            reel(p, true); tell(p, { k: 'res', kind: 'late', total: s.score });
          }
          if (!p.on && s.state !== 'idle') reel(p, true);
        });
        for (const f of fish) {
          const K = KINDS[f.kind];
          f.wob += dt * 5;
          if (f.flee > 0) { f.flee -= dt; f.x += f.dir * f.v * 3 * dt; }
          else if (f.target) {
            const s = f.target;
            if (f.wait > 0) { f.wait -= dt; f.x += f.dir * f.v * 0.3 * dt; }
            else if (s.state === 'wait') {
              const dx = s.hx - f.x, dy = s.hy - f.y, d = Math.hypot(dx, dy) || 1;
              f.dir = dx >= 0 ? 1 : -1;
              if (d < 10) { s.state = 'bite'; s.biteAt = Date.now(); const pl = P.find((x) => S[x.id] === s); api.send(pl, { k: 'bite', ms: BITE_MS }); api.sfx('tick'); }
              else { f.x += (dx / d) * 120 * dt; f.y += (dy / d) * 120 * dt; }
            } else if (s.state === 'bite') { f.x = s.hx + Math.sin(f.wob * 3) * 5; f.y = s.hy + Math.cos(f.wob * 4) * 4; }
            else { f.target = null; }
          } else f.x += f.dir * f.v * dt;
        }
        fish = fish.filter((f) => f.x > -140 && f.x < 1420);
        parts.step(dt);
      }

      function drawFish(f, t) {
        const K = KINDS[f.kind], L = K.len;
        c.save(); c.translate(f.x, f.y + Math.sin(f.wob) * 3); c.scale(f.dir, 1);
        if (f.kind === 'bau') { c.fillStyle = K.color; c.fillRect(-L / 2, -L / 3, L, L * 0.66); c.fillStyle = '#ffd23f'; c.fillRect(-L / 2, -L / 12, L, L / 7); c.fillRect(-4, -L / 6, 8, L / 3); }
        else if (f.kind === 'bota') { c.fillStyle = K.color; c.fillRect(-L / 4, -L / 2, L / 2, L * 0.8); c.fillRect(-L / 4, L * 0.1, L * 0.75, L * 0.3); }
        else {
          const tail = Math.sin(f.wob * 2) * 0.35;
          c.fillStyle = K.color;
          c.beginPath(); c.ellipse(0, 0, L / 2, L * (f.kind === 'espada' ? 0.14 : 0.24), 0, 0, 7); c.fill();
          c.save(); c.translate(-L / 2, 0); c.rotate(tail); c.beginPath(); c.moveTo(4, 0); c.lineTo(-L * 0.3, -L * 0.2); c.lineTo(-L * 0.3, L * 0.2); c.closePath(); c.fill(); c.restore();
          if (f.kind === 'espada') { c.fillRect(L / 2 - 2, -2, L * 0.45, 4); }
          if (f.kind === 'tubarao') { c.beginPath(); c.moveTo(-L * 0.1, -L * 0.2); c.lineTo(L * 0.08, -L * 0.46); c.lineTo(L * 0.18, -L * 0.2); c.closePath(); c.fill(); c.fillStyle = '#fff'; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(L * 0.2 + i * 7, L * 0.06); c.lineTo(L * 0.2 + i * 7 + 3.5, L * 0.15); c.lineTo(L * 0.2 + i * 7 + 7, L * 0.06); c.fill(); } }
          c.fillStyle = '#fff'; c.beginPath(); c.arc(L * 0.3, -L * 0.06, Math.max(3, L * 0.06), 0, 7); c.fill();
          c.fillStyle = '#16132b'; c.beginPath(); c.arc(L * 0.32, -L * 0.06, Math.max(1.5, L * 0.03), 0, 7); c.fill();
        }
        c.restore(); void t;
      }

      function draw(t) {
        const g = c.createLinearGradient(0, 0, 0, SHORE); g.addColorStop(0, '#0b3f73'); g.addColorStop(1, '#1f86c9');
        c.fillStyle = g; c.fillRect(0, 0, 1280, SHORE);
        c.strokeStyle = 'rgba(255,255,255,.12)'; c.lineWidth = 3;
        for (let r = 0; r < 7; r++) { c.beginPath(); for (let x = 0; x <= 1280; x += 40) { const y = 120 + r * 72 + Math.sin(x * 0.02 + t * 1.3 + r) * 7; c[x ? 'lineTo' : 'moveTo'](x, y); } c.stroke(); }
        c.fillStyle = 'rgba(255,255,255,.5)'; c.font = '800 15px Archivo, sans-serif'; c.textAlign = 'left';
        c.fillText('LONGE: PEIXES RAROS (E TUBARÕES)', 24, FAR - 6); c.fillText('PERTO: PEIXES COMUNS', 24, SHORE - 14);
        fish.forEach((f) => drawFish(f, t));
        c.fillStyle = '#e2c98f'; c.fillRect(0, SHORE, 1280, 120); c.fillStyle = '#cfb274'; c.fillRect(0, SHORE, 1280, 8);
        P.forEach((p) => {
          const s = S[p.id];
          const rodX = s.x + 26, rodY = SHORE + 6;
          c.strokeStyle = '#6b4a2a'; c.lineWidth = 5; c.beginPath(); c.moveTo(s.x + 6, SHORE + 56); c.lineTo(rodX, rodY); c.stroke();
          if (s.state !== 'idle') {
            c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(rodX, rodY); c.quadraticCurveTo((rodX + s.hx) / 2, Math.min(rodY, s.hy) - 30, s.hx, s.hy); c.stroke();
            const bob = s.state === 'bite' ? Math.sin(t * 40) * 5 : Math.sin(t * 3 + s.x) * 2;
            c.fillStyle = '#fff'; c.beginPath(); c.arc(s.hx, s.hy + bob, 8, 0, 7); c.fill(); c.fillStyle = p.color; c.beginPath(); c.arc(s.hx, s.hy + bob, 8, Math.PI, 0); c.fill();
            if (s.state === 'bite') { c.strokeStyle = '#ffd23f'; c.lineWidth = 4; c.beginPath(); c.arc(s.hx, s.hy, 20 + (t * 60) % 22, 0, 7); c.stroke(); }
          }
          J.drawBuddy(c, s.x, SHORE + 56, 30, p, { t, mood: s.state === 'bite' ? 'wow' : 'happy', alpha: p.on ? 1 : 0.35 });
          c.fillStyle = '#3a2a12'; c.font = '800 16px Archivo, sans-serif'; c.textAlign = 'center'; c.fillText(p.name, s.x, SHORE + 112);
          if (s.msgT > 0) { c.globalAlpha = Math.min(1, s.msgT * 2); c.font = '900 26px Archivo, sans-serif'; c.lineWidth = 6; c.strokeStyle = 'rgba(0,0,0,.55)'; c.strokeText(s.msg, s.x, SHORE - 16 - (1.8 - s.msgT) * 26); c.fillStyle = s.msgC; c.fillText(s.msg, s.x, SHORE - 16 - (1.8 - s.msgT) * 26); c.globalAlpha = 1; }
        });
        parts.draw(c);
        if (over) { c.fillStyle = 'rgba(0,0,0,.45)'; c.fillRect(0, 0, 1280, 720); c.fillStyle = '#fff'; c.font = '900 72px Archivo, sans-serif'; c.textAlign = 'center'; c.fillText('Fim da pescaria!', 640, 340); }
      }

      return {
        start() { for (let i = 0; i < 8 + n; i++) spawn(true); P.forEach((p) => tell(p, { k: 'idle', total: 0, secs: SECS })); api.loop((dt, t) => { step(dt); draw(t); }); },
        onMsg(p, m) {
          if (m.k === 'cast') cast(p, J.clamp(+m.p || 0, 0.05, 1), J.clamp(+m.a || 0, -1, 1));
          else if (m.k === 'pull') pull(p, +m.dt);
        },
        onLeave(p) { reel(p, true); },
        sync(p) { reel(p, true); tell(p, { k: 'idle', total: S[p.id].score, secs: Math.ceil(left) }); },
      };
    },

    /* ------------------------------------------------------------------ phone */
    pad(api) {
      const { root } = api;
      root.innerHTML = `<style>
        .pf-zone{flex:1;min-height:0;position:relative;border-radius:28px;background:linear-gradient(180deg,#0b3f73,#1f86c9);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;text-align:center;touch-action:none;overflow:hidden;padding:16px}
        .pf-zone b{font-size:clamp(30px,10vw,60px);line-height:1.05} .pf-zone span{font-weight:800;font-size:16px;opacity:.9;max-width:300px}
        .pf-zone.bite{background:linear-gradient(180deg,#ffb300,#ff5d3d);animation:pfbite .16s linear infinite} @keyframes pfbite{50%{transform:translateX(4px)}}
        .pf-zone.good{background:linear-gradient(180deg,#19a86f,#3df5a7);color:#062a1b} .pf-zone.bad{background:linear-gradient(180deg,#5a2330,#a33a4d)}
        .pf-arrow{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none}
        .pf-hint{position:absolute;bottom:14px;left:0;right:0;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;opacity:.7}
      </style>`;
      const h = J.padHud(api), box = h.box;
      h.pts('0');
      box.innerHTML = `<div class="pf-zone" id="z"><svg class="pf-arrow" id="ar"></svg><b id="big">…</b><span id="sub"></span><em class="pf-hint" id="hint"></em></div>`;
      const z = box.querySelector('#z'), big = box.querySelector('#big'), sub = box.querySelector('#sub'), hint = box.querySelector('#hint'), ar = box.querySelector('#ar');
      let state = 'idle', biteAt = 0, start = null, backT = 0;
      const show = (cls, title, text, tip) => { z.className = 'pf-zone ' + cls; big.textContent = title; sub.textContent = text; hint.textContent = tip || ''; };
      const idle = () => { state = 'idle'; show('', 'Arremesse!', 'Deslize o dedo para cima. Mais longo = mais longe.', 'Para os lados muda a direção'); };
      z.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (state === 'idle') { start = { x: e.clientX, y: e.clientY }; try { z.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
        else if (state === 'wait' || state === 'bite') { api.send({ k: 'pull', dt: state === 'bite' ? Math.round(performance.now() - biteAt) : -1 }); api.vib(30); state = 'sent'; show('', 'Puxando…', '', ''); }
      });
      z.addEventListener('pointermove', (e) => { if (!start) return; const r = z.getBoundingClientRect(); ar.innerHTML = `<line x1="${start.x - r.left}" y1="${start.y - r.top}" x2="${e.clientX - r.left}" y2="${e.clientY - r.top}" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".8"/>`; });
      const end = (e) => {
        if (!start) return;
        const dy = start.y - e.clientY, dx = e.clientX - start.x, r = z.getBoundingClientRect();
        start = null; ar.innerHTML = '';
        if (state !== 'idle' || dy < 30) return;
        api.send({ k: 'cast', p: Math.min(1, dy / (r.height * 0.6)), a: Math.max(-1, Math.min(1, dx / (r.width * 0.45))) });
        api.vib(20); state = 'sent'; show('', 'Lá vai…', '', '');
      };
      z.addEventListener('pointerup', end); z.addEventListener('pointercancel', () => { start = null; ar.innerHTML = ''; });

      return {
        start() { idle(); },
        stop() { clearTimeout(backT); },
        onMsg(m) {
          clearTimeout(backT);
          if (m.total != null) h.pts(J.fmtPts(m.total));
          if (m.k === 'idle') { if (m.secs) h.time(m.secs); idle(); }
          else if (m.k === 'cast') { state = 'wait'; show('', 'Esperando…', 'Quando o celular tremer, toque para puxar.', 'Tocar agora recolhe a linha'); }
          else if (m.k === 'bite') { state = 'bite'; biteAt = performance.now(); show('bite', 'PUXE!', 'Toque agora!', ''); api.vib([120, 50, 120, 50, 120]); }
          else if (m.k === 'res') {
            state = 'res';
            if (m.kind === 'catch') show(m.pts > 0 ? 'good' : 'bad', (m.pts > 0 ? '+' : '') + m.pts, m.name, '');
            else show('bad', m.kind === 'early' ? 'Cedo demais!' : 'Escapou…', m.kind === 'early' ? 'O peixe ainda não tinha mordido.' : 'Ele levou a isca.', '');
            backT = setTimeout(idle, 1100);
          } else if (m.k === 'fim') { state = 'over'; h.time(0); show('', 'Fim!', J.fmtPts(m.total) + ' pontos', ''); }
        },
      };
    },
  });
})();
