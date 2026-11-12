/* Batata-Bomba — a bomb with a hidden timer goes from phone to phone. To get rid of it you solve a
   quick challenge on your screen and choose who gets it next. Whoever holds it when it blows is out. */
'use strict';
J.define('batata', {
  name: 'Batata-Bomba', kind: 'reflexo', min: 2, max: 6, unit: 'pontos',
  tagline: 'Resolva o desafio no celular e passe a bomba antes que ela exploda.',
  grad: 'linear-gradient(135deg,#ffd23f,#ff9a3d)',
  icon: '<circle cx="11" cy="14" r="6.5"/><path d="M15.5 9.5l2.5-2.5"/><path d="M18 7c1-2 2.5-1 3.5-3"/>',
  how: [['Pegou?', 'O celular de quem está com a bomba treme e esquenta.'], ['Resolva', 'Acerte o desafio rápido que aparece na sua tela.'], ['Passe', 'Escolha para quem jogar. Quem explodir está fora.']],
  padHow: 'Quando a bomba chegar, resolva o desafio da tela e escolha para quem jogar. Ninguém sabe quando ela explode.',

  /* ------------------------------------------------------------------ TV */
  tv(api) {
    const { W, H } = api, { rand, pick, lerp } = J;
    const c = api.canvas();
    const bar = api.topbar(false);
    const parts = new J.Particles();
    const n = api.players.length;
    const seats = api.players.map((p, i) => { const a = -Math.PI / 2 + (i / n) * Math.PI * 2; return { p, x: W / 2 + Math.cos(a) * 430, y: 400 + Math.sin(a) * 205, alive: true, order: -1, passes: 0, hop: 0, gone: false }; });
    let holder = null, from = null, fly = 1, fuse = 0, total = 1, heat = 0, round = 0, phase = 'wait', time = 0, shake = 0, flash = 0, outCount = 0, task = '', taskT = 0, missT = 0, fuseTick = 0;

    const alive = () => seats.filter((s) => s.alive);
    const broadcast = () => api.all({ k: 'state', holder: holder ? holder.p.id : null, alive: alive().map((s) => s.p.id), heat, phase });

    function give(s, by) {
      from = by || null; holder = s; fly = by ? 0 : 1; task = ''; s.hop = 1;
      api.fx(s.p, 'shake', { v: [60, 40, 120] });
      api.sfx('pass');
      broadcast();
    }

    function newRound() {
      round++; phase = 'play'; heat = 0;
      const a = alive();
      total = rand(13, 22) + a.length * 1.5; fuse = 0;
      api.banner('Rodada ' + round, a.length + ' na roda');
      api.sfx('reveal');
      api.after(1400, () => give(pick(alive()), null));
    }

    function explode() {
      const s = holder;
      phase = 'boom'; s.alive = false; s.order = outCount++; holder = null;
      parts.burst(s.x, s.y - 70, '#ffd23f', 90, { max: 620, life: 1.3, size: 9 }); parts.burst(s.x, s.y - 70, '#ff4d6d', 70, { max: 480, life: 1.1, size: 8 }); parts.burst(s.x, s.y - 70, '#ffffff', 40, { max: 320 });
      shake = 26; flash = 1; api.sfx('boom');
      api.fx(s.p, 'boom');
      alive().forEach((x) => api.fx(x.p, 'shake', { v: 120 }));
      bar.out(s.p, true);
      api.banner(s.p.name + ' explodiu!');
      broadcast();
      api.after(2800, () => {
        const a = alive();
        if (a.length <= 1) {
          if (a[0]) a[0].order = outCount++;
          api.end(seats.map((x) => ({ id: x.p.id, pts: Math.max(0, x.order) * 100 + x.passes * 10, note: x.passes + (x.passes === 1 ? ' passe' : ' passes') })));
        } else newRound();
      });
    }

    function step(dt) {
      time += dt; parts.step(dt);
      seats.forEach((s) => { s.hop = Math.max(0, s.hop - dt * 3); });
      if (fly < 1) fly = Math.min(1, fly + dt * 3.2);
      taskT = Math.max(0, taskT - dt); missT = Math.max(0, missT - dt);
      if (phase !== 'play' || !holder) return;
      fuse += dt;
      const k = fuse / total, h = k > 0.82 ? 2 : k > 0.5 ? 1 : 0;
      if (h !== heat) { heat = h; broadcast(); }
      fuseTick -= dt;
      if (fuseTick <= 0) { fuseTick = lerp(0.5, 0.09, k); api.sfx(heat === 2 ? 'tick' : 'fuse'); }
      if (fuse >= total) explode();
    }

    function bombPos() {
      if (!holder) return null;
      const tx = holder.x, ty = holder.y - 122;
      if (fly >= 1 || !from) return [tx, ty];
      const e = fly < 0.5 ? 2 * fly * fly : 1 - Math.pow(-2 * fly + 2, 2) / 2;
      return [lerp(from.x, tx, e), lerp(from.y - 122, ty, e) - Math.sin(fly * Math.PI) * 170];
    }

    function draw() {
      c.save();
      if (shake > 0.4) { c.translate(rand(-shake, shake), rand(-shake, shake)); shake *= 0.9; } else shake = 0;
      const k = phase === 'play' && holder ? fuse / total : 0;
      const g = c.createRadialGradient(W / 2, 400, 60, W / 2, 400, 760);
      g.addColorStop(0, `rgb(${Math.round(60 + 110 * k)},${Math.round(34 + 10 * k)},${Math.round(92 - 50 * k)})`); g.addColorStop(1, '#0d0b1e');
      c.fillStyle = g; c.fillRect(-40, -40, W + 80, H + 80);
      // the table
      c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(W / 2, 420, 330, 150, 0, 0, 7); c.fill();
      c.strokeStyle = 'rgba(255,255,255,.1)'; c.lineWidth = 3; c.setLineDash([10, 14]); c.beginPath(); c.ellipse(W / 2, 400, 430, 205, 0, 0, 7); c.stroke(); c.setLineDash([]);
      const bp = bombPos();
      for (const s of seats) {
        const isH = s === holder && fly >= 1;
        const jump = Math.sin(s.hop * Math.PI) * 26 + (isH ? Math.abs(Math.sin(time * (8 + heat * 6))) * (4 + heat * 5) : 0);
        const look = bp && s.alive ? [J.clamp((bp[0] - s.x) / 200, -1, 1), J.clamp((bp[1] - s.y) / 200, -1, 1)] : [0, 0];
        J.drawBuddy(c, s.x, s.y - jump, 58, s.alive ? s.p : { ...s.p, color: '#5b5870' }, { mood: !s.alive ? 'dead' : isH ? (heat === 2 ? 'wow' : 'sad') : 'happy', look, t: time, alpha: s.alive ? 1 : 0.55 });
        c.font = '900 22px Roboto, sans-serif'; c.textAlign = 'center'; c.fillStyle = s.alive ? '#fff' : 'rgba(255,255,255,.4)'; c.fillText(s.p.name, s.x, s.y + 92);
      }
      if (bp) {
        const pulse = 1 + Math.sin(time * (6 + heat * 8)) * (0.04 + heat * 0.05), r = 40 * pulse;
        const jx = heat === 2 ? rand(-3, 3) : 0;
        c.save(); c.translate(bp[0] + jx, bp[1]);
        c.fillStyle = `rgba(255,${120 - heat * 50},40,${0.15 + heat * 0.12})`; c.beginPath(); c.arc(0, 0, r + 26 + heat * 10, 0, 7); c.fill();
        const bg = c.createRadialGradient(-r * 0.35, -r * 0.4, 4, 0, 0, r); bg.addColorStop(0, heat === 2 ? '#ff6a5a' : '#6b6880'); bg.addColorStop(1, heat === 2 ? '#7a0f1f' : '#17152a');
        c.fillStyle = bg; c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill();
        c.fillStyle = '#2b2940'; c.fillRect(-9, -r - 10, 18, 14);
        c.strokeStyle = '#c9a36a'; c.lineWidth = 5; c.lineCap = 'round'; c.beginPath(); c.moveTo(0, -r - 10); c.quadraticCurveTo(18, -r - 34, 30 - k * 22, -r - 40 + k * 26); c.stroke();
        const sx = 30 - k * 22, sy = -r - 40 + k * 26;
        c.restore();
        if (Math.random() < 0.8) parts.add({ x: bp[0] + sx + jx, y: bp[1] + sy, vx: rand(-90, 90), vy: rand(-150, 10), color: pick(['#ffd23f', '#ff9a3d', '#fff']), max: 0.4, size: 4 + heat * 2, g: 260 });
        if (holder && fly >= 1 && task && taskT > 0) {
          c.font = '800 20px Roboto, sans-serif'; const tw = c.measureText(task).width + 32, bx = J.clamp(holder.x, tw / 2 + 20, W - tw / 2 - 20), by = holder.y - 222;
          c.fillStyle = missT > 0 ? '#ff4d6d' : '#fff'; c.beginPath(); c.roundRect(bx - tw / 2, by - 22, tw, 44, 16); c.fill();
          c.fillStyle = missT > 0 ? '#fff' : '#120f26'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(missT > 0 ? 'Errou!' : task, bx, by); c.textBaseline = 'alphabetic';
        }
      }
      parts.draw(c);
      if (flash > 0.02) { c.fillStyle = `rgba(255,255,255,${flash})`; c.fillRect(-40, -40, W + 80, H + 80); flash *= 0.86; }
      c.restore();
    }

    return {
      start() { seats.forEach((s) => bar.score(s.p, '')); api.loop((dt) => { step(dt); draw(); }); newRound(); },
      onMsg(p, m) {
        const s = seats.find((x) => x.p === p);
        if (!s || s !== holder || phase !== 'play') return;
        if (m.k === 'task') { task = String(m.label || '').slice(0, 40); taskT = 6; }
        else if (m.k === 'miss') { missT = 0.9; api.sfx('bad'); }
        else if (m.k === 'pass') {
          const others = alive().filter((x) => x !== s && !x.gone);
          const to = others.find((x) => x.p.id === m.to) || pick(others.length ? others : alive().filter((x) => x !== s));
          if (!to) return;
          s.passes++; bar.score(s.p, s.passes);
          give(to, s);
        }
      },
      onLeave(p) {
        const s = seats.find((x) => x.p === p);
        if (!s) return;
        s.gone = true;
        if (s === holder && phase === 'play') { const others = alive().filter((x) => x !== s && !x.gone); if (others.length) give(pick(others), s); }
      },
      onJoin(p) { const s = seats.find((x) => x.p === p); if (s) s.gone = false; },
      sync(p) { api.send(p, { k: 'state', holder: holder ? holder.p.id : null, alive: alive().map((s) => s.p.id), heat, phase }); },
    };
  },

  /* ------------------------------------------------------------------ phone */
  pad(api) {
    const { root, me } = api, { pick, shuffle, irand, esc } = J;
    const COL = [['VERMELHO', '#ff4d6d'], ['VERDE', '#3df5a7'], ['AZUL', '#3dc9ff'], ['AMARELO', '#ffd23f']];
    let holder = null, aliveIds = [], heat = 0, mine = false, dead = false, lastType = '', locked = false, buzz = 0;
    root.innerHTML = `<style>
      .bt{flex:1;display:flex;flex-direction:column;border-radius:28px;padding:16px;gap:14px;min-height:0;transition:background .4s;background:rgba(255,255,255,.05);position:relative;overflow:hidden}
      .bt.h0{background:linear-gradient(180deg,#b3541e,#6b2a12)} .bt.h1{background:linear-gradient(180deg,#d9481f,#7d1410);animation:heat 1s infinite} .bt.h2{background:linear-gradient(180deg,#ff2a2a,#8a0010);animation:heat .35s infinite}
      @keyframes heat{50%{filter:brightness(1.35)}}
      .bt h2{font-size:26px;text-align:center;line-height:1.1} .bt .q{font-size:30px;font-weight:900;text-align:center;line-height:1.15}
      .opts{flex:1;display:grid;grid-template-columns:1fr 1fr;gap:12px;min-height:0}
      .opt{border-radius:22px;font-size:34px;font-weight:900;background:rgba(0,0,0,.35);border:2px solid rgba(255,255,255,.25);display:flex;align-items:center;justify-content:center;gap:10px;min-height:84px}
      .opt:active{transform:scale(.95)} .opt.c{border:0;box-shadow:inset 0 -8px 0 rgba(0,0,0,.25)}
      .opt.done{opacity:.25;pointer-events:none}
      .swipe{flex:1;border-radius:22px;background:rgba(0,0,0,.35);display:grid;place-items:center;font-size:120px;font-weight:900;touch-action:none;border:2px dashed rgba(255,255,255,.3)}
      .tapper{flex:1;border-radius:50%;aspect-ratio:1;max-height:100%;align-self:center;background:radial-gradient(circle at 35% 30%,#fff,#ffd23f 60%);color:#120f26;font-size:72px;font-weight:900;display:grid;place-items:center;box-shadow:0 12px 0 rgba(0,0,0,.3)}
      .tapper:active{transform:translateY(8px);box-shadow:0 4px 0 rgba(0,0,0,.3)}
      .lock{position:absolute;inset:0;background:rgba(10,0,0,.82);display:grid;place-items:center;font-size:44px;font-weight:900;z-index:3}
      .who{flex:1;display:flex;flex-direction:column;gap:10px;min-height:0;overflow:auto} .who .opt{font-size:24px;justify-content:flex-start;padding:0 16px;flex:1}
    </style>
    <div class="hud"><span id="bb"></span><span class="name">${esc(me.name)}</span><span class="pillv" id="alive"></span></div>
    <div class="bt" id="box"></div>`;
    root.querySelector('#bb').replaceWith(api.buddy(me, 40));
    const box = root.querySelector('#box');
    const by = (id) => api.players.find((p) => p.id === id) || { name: '?', color: '#888', shape: 'bola' };

    function idle() {
      box.className = 'bt';
      if (dead) { box.innerHTML = `<div class="centered"><div class="statusbig">BUM!</div><h2>Você explodiu</h2><p class="muted">Assista ao resto na TV</p></div>`; return; }
      if (!holder) { box.innerHTML = `<div class="centered"><h2>A bomba vai ser sorteada…</h2></div>`; return; }
      const h = by(holder);
      box.innerHTML = `<div class="centered"><span id="hb"></span><h2>A bomba está com<br>${esc(h.name)}</h2><p class="muted">Fique esperto: ela pode vir para você</p></div>`;
      box.querySelector('#hb').replaceWith(api.buddy(h, 120, 'wow'));
    }

    function head(text) { return `<h2>💣 Você está com a bomba!</h2><div class="q">${text}</div>`; }
    function wrong() {
      if (locked) return;
      locked = true; api.send({ k: 'miss' }); api.fx.named({ k: 'bad' });
      const l = J.el('div', 'lock', 'Errou!'); box.appendChild(l);
      api.after(800, () => { locked = false; if (mine) challenge(); });
    }
    function solved() {
      if (locked) return;
      api.vib(30);
      const others = aliveIds.filter((id) => id !== me.id);
      if (others.length <= 1) { api.send({ k: 'pass', to: others[0] }); return; }
      box.className = 'bt h' + heat;
      box.innerHTML = `<h2>Jogue para quem?</h2><div class="who"></div>`;
      const who = box.querySelector('.who');
      shuffle(others).forEach((id) => { const p = by(id); const b = J.el('button', 'opt'); b.appendChild(api.buddy(p, 56)); b.appendChild(document.createTextNode(p.name)); b.onclick = () => { api.send({ k: 'pass', to: id }); api.vib(40); }; who.appendChild(b); });
    }

    function challenge() {
      if (!mine || dead) return;
      const types = ['cor', 'deslize', 'toques', 'conta', 'ordem'].filter((t) => t !== lastType);
      const type = lastType = pick(types);
      box.className = 'bt h' + heat;
      if (type === 'cor') {
        const want = pick(COL), ink = pick(COL.filter((x) => x !== want));
        api.send({ k: 'task', label: 'Toque no ' + want[0] });
        box.innerHTML = head(`Toque na cor <span style="color:${ink[1]}">${want[0]}</span>`) + `<div class="opts">${shuffle(COL).map((x) => `<button class="opt c" style="background:${x[1]}" data-c="${x[0]}"></button>`).join('')}</div>`;
        box.querySelectorAll('.opt').forEach((b) => { b.onclick = () => (b.dataset.c === want[0] ? solved() : wrong()); });
      } else if (type === 'deslize') {
        const d = pick([['↑', 0, -1, 'cima'], ['↓', 0, 1, 'baixo'], ['←', -1, 0, 'a esquerda'], ['→', 1, 0, 'a direita']]);
        api.send({ k: 'task', label: 'Deslize para ' + d[3] });
        box.innerHTML = head('Deslize para ' + d[3]) + `<div class="swipe">${d[0]}</div>`;
        const sw = box.querySelector('.swipe'); let sx = 0, sy = 0, on = false;
        sw.onpointerdown = (e) => { on = true; sx = e.clientX; sy = e.clientY; try { sw.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } };
        sw.onpointerup = (e) => { if (!on) return; on = false; const dx = e.clientX - sx, dy = e.clientY - sy; if (Math.hypot(dx, dy) < 36) return; const hx = Math.abs(dx) > Math.abs(dy) ? Math.sign(dx) : 0, hy = hx ? 0 : Math.sign(dy); (hx === d[1] && hy === d[2]) ? solved() : wrong(); };
      } else if (type === 'toques') {
        let left = irand(5, 8);
        api.send({ k: 'task', label: 'Toque ' + left + ' vezes' });
        box.innerHTML = head('Toque ' + left + ' vezes!') + `<button class="tapper">${left}</button>`;
        const t = box.querySelector('.tapper');
        t.onpointerdown = () => { left--; api.vib(10); if (left <= 0) solved(); else t.textContent = left; };
      } else if (type === 'conta') {
        const a = irand(3, 12), b = irand(2, 9), plus = Math.random() < 0.6, res = plus ? a + b : a * b > 60 ? a + b : a * b, sym = res === a + b ? '+' : '×';
        const opts = new Set([res]); while (opts.size < 4) opts.add(Math.max(1, res + pick([-10, -3, -2, -1, 1, 2, 3, 10])));
        api.send({ k: 'task', label: `${a} ${sym} ${b} = ?` });
        box.innerHTML = head(`${a} ${sym} ${b} = ?`) + `<div class="opts">${shuffle([...opts]).map((v) => `<button class="opt" data-v="${v}">${v}</button>`).join('')}</div>`;
        box.querySelectorAll('.opt').forEach((x) => { x.onclick = () => (+x.dataset.v === res ? solved() : wrong()); });
      } else {
        let next = 1;
        api.send({ k: 'task', label: 'Toque em ordem: 1, 2, 3, 4' });
        box.innerHTML = head('Toque em ordem: 1 → 4') + `<div class="opts">${shuffle([1, 2, 3, 4]).map((v) => `<button class="opt" data-v="${v}">${v}</button>`).join('')}</div>`;
        box.querySelectorAll('.opt').forEach((x) => { x.onclick = () => { if (+x.dataset.v !== next) { wrong(); return; } x.classList.add('done'); api.vib(10); next++; if (next > 4) solved(); }; });
      }
    }

    api.every(120, () => { if (!mine || dead) return; buzz -= 120; if (buzz <= 0) { buzz = [800, 430, 190][heat]; api.vib(heat === 2 ? 70 : 35); } });

    return {
      start() { idle(); },
      onMsg(m) {
        if (m.k !== 'state') return;
        const was = mine, wasHeat = heat;
        holder = m.holder; aliveIds = m.alive; heat = m.heat;
        if (!dead && !aliveIds.includes(me.id)) dead = true;
        mine = holder === me.id && !dead;
        root.querySelector('#alive').textContent = dead ? 'fora' : aliveIds.length + ' vivos';
        if (mine && !was) { api.fx.named({ k: 'flash', color: '#ffb35c', life: 0.5 }); api.fx.shake(); locked = false; challenge(); }
        else if (mine && heat !== wasHeat) box.className = 'bt h' + heat;
        else if (!mine) idle();
      },
    };
  },
});
