/* Corrida de Sofá — little sofas racing around the living-room rug. Phone: a steering wheel and a pedal.
   Three laps; cushions give turbo, spilled coffee makes you spin. */
'use strict';
J.define('corrida', {
  name: 'Corrida de Sofá', kind: 'corrida', min: 2, max: 6, unit: 'pontos',
  tagline: 'Três voltas pela sala. Pegue o turbo e fuja do café derramado.',
  grad: 'linear-gradient(135deg,#ff9a3d,#ff4d6d)',
  icon: '<path d="M5 11V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3"/><path d="M3 12a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v5H3z"/><path d="M6 17v2M18 17v2"/>',
  how: [['Vire', 'Arraste o volante no celular para os lados.'], ['Acelere', 'Segure o pedal. Fora do tapete o sofá anda devagar.'], ['3 voltas', 'Setas azuis dão turbo. Café derramado faz rodar.']],
  padHow: 'Polegar esquerdo no volante (arraste para os lados), polegar direito no pedal. São 3 voltas.',

  /* ------------------------------------------------------------------ TV */
  tv(api) {
    const { W, H } = api, { clamp, rand } = J;
    const c = api.canvas();
    const bar = api.topbar(true);
    const parts = new J.Particles();
    const LAPS = 3, HALF = 50;
    const CTRL = [[210, 215], [520, 165], [760, 265], [1000, 170], [1165, 310], [1100, 530], [880, 615], [700, 480], [520, 610], [250, 630], [125, 430]];
    // closed Catmull-Rom spline -> evenly indexed samples
    const pts = [];
    for (let i = 0; i < CTRL.length; i++) {
      const p0 = CTRL[(i - 1 + CTRL.length) % CTRL.length], p1 = CTRL[i], p2 = CTRL[(i + 1) % CTRL.length], p3 = CTRL[(i + 2) % CTRL.length];
      for (let s = 0; s < 36; s++) { const t = s / 36, t2 = t * t, t3 = t2 * t; pts.push([0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3), 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]); }
    }
    const N = pts.length;
    const at = (i) => pts[((i % N) + N) % N];
    const dirAt = (i) => { const a = at(i - 1), b = at(i + 1); return Math.atan2(b[1] - a[1], b[0] - a[0]); };
    const side = (i, off) => { const p = at(i), a = dirAt(i) + Math.PI / 2; return [p[0] + Math.cos(a) * off, p[1] + Math.sin(a) * off]; };
    const boosts = [0.2, 0.52, 0.8].map((f) => { const i = Math.floor(N * f); const p = side(i, rand(-16, 16)); return { x: p[0], y: p[1], a: dirAt(i) }; });
    const spills = [0.33, 0.66, 0.92].map((f) => { const i = Math.floor(N * f); const p = side(i, rand(-22, 22)); return { x: p[0], y: p[1], r: rand(0, 6) }; });

    // the room is drawn once
    const room = document.createElement('canvas'); room.width = W; room.height = H;
    (() => {
      const f = room.getContext('2d');
      f.fillStyle = '#2a1d4a'; f.fillRect(0, 0, W, H);
      for (let y = 0; y < H; y += 46) { f.fillStyle = (y / 46) % 2 ? '#2e2052' : '#281b47'; f.fillRect(0, y, W, 46); for (let x = ((y / 46) % 2) * 90; x < W; x += 180) { f.fillStyle = 'rgba(0,0,0,.18)'; f.fillRect(x, y, 2, 46); } }
      // furniture seen from above, just for looks
      const blob = (x, y, r, col) => { f.fillStyle = 'rgba(0,0,0,.25)'; f.beginPath(); f.arc(x + 5, y + 7, r, 0, 7); f.fill(); f.fillStyle = col; f.beginPath(); f.arc(x, y, r, 0, 7); f.fill(); };
      blob(640, 372, 62, '#6b4a2b'); blob(640, 372, 48, '#7d5a36'); blob(640, 372, 14, '#ffd23f');
      blob(330, 410, 34, '#1f7a4d'); for (let i = 0; i < 7; i++) blob(330 + Math.cos(i) * 26, 410 + Math.sin(i * 1.7) * 26, 16, '#2fa866');
      blob(960, 395, 30, '#3a2c66'); blob(960, 395, 20, '#ffe9a8');
      const path = () => { f.beginPath(); pts.forEach((p, i) => f[i ? 'lineTo' : 'moveTo'](p[0], p[1])); f.closePath(); };
      f.lineJoin = 'round'; f.lineCap = 'round';
      path(); f.strokeStyle = 'rgba(0,0,0,.3)'; f.lineWidth = HALF * 2 + 26; f.stroke();
      path(); f.strokeStyle = '#f4f1ff'; f.lineWidth = HALF * 2 + 14; f.stroke();
      f.setLineDash([22, 22]); path(); f.strokeStyle = '#ff4d6d'; f.lineWidth = HALF * 2 + 14; f.stroke(); f.setLineDash([]);
      path(); f.strokeStyle = '#3b3560'; f.lineWidth = HALF * 2; f.stroke();
      path(); f.strokeStyle = '#443d6e'; f.lineWidth = HALF * 2 - 22; f.stroke();
      f.setLineDash([18, 26]); path(); f.strokeStyle = 'rgba(255,255,255,.3)'; f.lineWidth = 3; f.stroke(); f.setLineDash([]);
      // start line
      const a = dirAt(0), p = at(0);
      f.save(); f.translate(p[0], p[1]); f.rotate(a);
      for (let i = -5; i < 5; i++) for (let j = 0; j < 2; j++) { f.fillStyle = (i + j) % 2 ? '#fff' : '#120f26'; f.fillRect(j * 10 - 10, i * 10, 10, 10); }
      f.restore();
      for (const s of spills) { f.save(); f.translate(s.x, s.y); f.rotate(s.r); f.fillStyle = '#3d2314'; f.beginPath(); f.ellipse(0, 0, 24, 16, 0, 0, 7); f.fill(); f.beginPath(); f.arc(18, 10, 8, 0, 7); f.arc(-17, -9, 6, 0, 7); f.fill(); f.fillStyle = 'rgba(255,255,255,.18)'; f.beginPath(); f.ellipse(-6, -5, 8, 3, -0.5, 0, 7); f.fill(); f.restore(); }
    })();

    const cars = api.players.map((p, i) => {
      const idx = -(7 + Math.floor(i / 2) * 8), pos = side(idx, i % 2 ? 22 : -22);
      return { p, x: pos[0], y: pos[1], ang: dirAt(idx), v: 0, steer: 0, gas: false, idx: ((idx % N) + N) % N, total: idx, boost: 0, spin: 0, fin: 0, place: 0, wrong: 0, bumpT: 0, lastSent: '', lap: 1 };
    });
    let time = 0, finished = 0, endAt = 0, over = false;

    function nearest(car) {
      let best = car.idx, bd = 1e9;
      for (let k = -24; k <= 44; k++) { const i = ((car.idx + k) % N + N) % N, p = pts[i], d = (p[0] - car.x) ** 2 + (p[1] - car.y) ** 2; if (d < bd) { bd = d; best = i; } }
      return [best, Math.sqrt(bd)];
    }

    function step(dt) {
      time += dt; parts.step(dt);
      if (over) return;
      for (const car of cars) {
        const [idx, dist] = nearest(car);
        let d = idx - car.idx; if (d > N / 2) d -= N; if (d < -N / 2) d += N;
        car.idx = idx; car.total += d;
        car.wrong = d < 0 && car.v > 60 ? car.wrong + dt : Math.max(0, car.wrong - dt * 2);
        const off = dist > HALF + 4;
        car.boost = Math.max(0, car.boost - dt); car.bumpT = Math.max(0, car.bumpT - dt);
        const top = (car.boost > 0 ? 455 : 310) * (off ? 0.42 : 1);
        if (car.spin > 0) { car.spin -= dt; car.ang += 13 * dt; car.v *= 1 - 2.2 * dt; }
        else if (!car.fin) {
          if (car.gas || car.boost > 0) car.v += (car.boost > 0 ? 900 : 430) * dt; else car.v -= car.v * 1.4 * dt;
          car.ang += car.steer * 3.3 * dt * clamp(car.v / 150, 0, 1);
        } else car.v -= car.v * 1.8 * dt;
        if (car.v > top) car.v += (top - car.v) * Math.min(1, (off ? 5 : 2.5) * dt);
        car.x = clamp(car.x + Math.cos(car.ang) * car.v * dt, 16, W - 16); car.y = clamp(car.y + Math.sin(car.ang) * car.v * dt, 96, H - 16);
        if (off && car.v > 70 && Math.random() < 0.3) parts.add({ x: car.x, y: car.y, vx: rand(-40, 40), vy: rand(-40, 40), color: '#6b5aa8', max: 0.4, size: 4 });
        if (car.boost > 0) parts.add({ x: car.x - Math.cos(car.ang) * 18, y: car.y - Math.sin(car.ang) * 18, vx: -Math.cos(car.ang) * 140 + rand(-30, 30), vy: -Math.sin(car.ang) * 140 + rand(-30, 30), color: Math.random() < 0.5 ? '#3dc9ff' : '#ffffff', max: 0.35, size: 6 });
        if (!car.fin && car.spin <= 0) {
          for (const b of boosts) if ((b.x - car.x) ** 2 + (b.y - car.y) ** 2 < 26 * 26 && car.boost < 1) { car.boost = 1.5; api.sfx('power'); api.fx(car.p, 'flames', { color: '#3dc9ff' }); }
          for (const s of spills) if ((s.x - car.x) ** 2 + (s.y - car.y) ** 2 < 24 * 24) { car.spin = 0.85; api.sfx('skid'); api.fx(car.p, 'bad'); api.send(car.p, { k: 'spin' }); }
        }
        const lap = clamp(Math.floor(car.total / N) + 1, 1, LAPS);
        if (lap > car.lap && !car.fin) { car.lap = lap; api.sfx('lap'); api.send(car.p, { k: 'lap', lap, last: lap === LAPS }); if (lap === LAPS && !cars.some((x) => x !== car && x.lap >= LAPS)) api.banner('Última volta!'); }
        if (!car.fin && car.total >= LAPS * N) {
          car.fin = time; car.place = ++finished;
          api.sfx('win'); parts.burst(car.x, car.y, car.p.color, 50, { max: 380, life: 1 });
          api.fx(car.p, car.place === 1 ? 'win' : 'good'); api.fx(car.p, 'stamp', { text: car.place + 'º lugar', color: car.p.color });
          if (finished === 1) { api.banner(car.p.name + ' chegou!', 'os outros têm 25 segundos'); endAt = time + 25; }
        }
      }
      for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i], b = cars[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
        if (d < 30) {
          const nx = dx / d, ny = dy / d, push = (30 - d) / 2;
          a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
          const hard = Math.abs(a.v - b.v) > 90;
          if (hard && a.bumpT <= 0 && b.bumpT <= 0) { const m = (a.v + b.v) / 2; a.v = m * 0.85; b.v = m * 0.85; a.bumpT = b.bumpT = 0.5; api.sfx('hit'); parts.burst((a.x + b.x) / 2, (a.y + b.y) / 2, '#ffffff', 10, { max: 140, life: 0.3 }); api.fx(a.p, 'shake', { v: 50 }); api.fx(b.p, 'shake', { v: 50 }); }
        }
      }
      const rank = cars.slice().sort((a, b) => (a.fin && b.fin ? a.fin - b.fin : a.fin ? -1 : b.fin ? 1 : b.total - a.total));
      rank.forEach((car, i) => {
        const pos = i + 1, s = pos + '|' + car.lap + '|' + (car.wrong > 1.2 ? 1 : 0) + '|' + (car.fin ? 1 : 0);
        bar.score(car.p, car.fin ? car.place + 'º ✓' : pos + 'º · V' + car.lap);
        if (s !== car.lastSent) { car.lastSent = s; api.send(car.p, { k: 'st', pos, lap: car.lap, laps: LAPS, wrong: car.wrong > 1.2, fin: !!car.fin, n: cars.length }); }
        car.pos = pos;
      });
      bar.time(endAt ? endAt - time : null);
      if (finished === cars.length || (endAt && time >= endAt) || time > 240) {
        over = true;
        const table = [100, 70, 50, 35, 25, 15];
        api.after(1500, () => api.end(rank.map((car, i) => ({ id: car.p.id, pts: table[i] || 10, note: car.fin ? fmt(car.fin) : 'não terminou' }))));
      }
    }
    const fmt = (t) => Math.floor(t / 60) + ':' + String((t % 60).toFixed(1)).padStart(4, '0');

    function sofa(car) {
      c.save(); c.translate(car.x, car.y); c.rotate(car.ang);
      c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.roundRect(-17, -11, 38, 28, 7); c.fill();
      c.fillStyle = '#16132b'; for (const [wx, wy] of [[-13, -15], [9, -15], [-13, 11], [9, 11]]) c.fillRect(wx, wy, 8, 4);
      const col = car.p.color, dark = J.shade(col, -0.35), light = J.shade(col, 0.3);
      c.fillStyle = col; c.beginPath(); c.roundRect(-19, -14, 38, 28, 7); c.fill();
      c.fillStyle = dark; c.beginPath(); c.roundRect(-19, -14, 11, 28, 5); c.fill();          // backrest (rear)
      c.beginPath(); c.roundRect(-10, -14, 27, 6, 3); c.fill(); c.beginPath(); c.roundRect(-10, 8, 27, 6, 3); c.fill(); // armrests
      c.fillStyle = light; c.beginPath(); c.roundRect(-7, -7, 11, 14, 3); c.fill(); c.beginPath(); c.roundRect(5, -7, 11, 14, 3); c.fill(); // cushions
      c.restore();
    }

    function draw() {
      c.drawImage(room, 0, 0);
      for (const b of boosts) {
        c.save(); c.translate(b.x, b.y); c.rotate(b.a);
        const glow = 0.55 + 0.45 * Math.sin(time * 7);
        c.fillStyle = `rgba(61,201,255,${0.18 + 0.12 * glow})`; c.beginPath(); c.arc(0, 0, 26, 0, 7); c.fill();
        c.strokeStyle = `rgba(61,201,255,${0.6 + 0.4 * glow})`; c.lineWidth = 5; c.lineCap = 'round'; c.lineJoin = 'round';
        for (const ox of [-9, 2, 13]) { c.beginPath(); c.moveTo(ox - 6, -10); c.lineTo(ox + 3, 0); c.lineTo(ox - 6, 10); c.stroke(); }
        c.restore();
      }
      parts.draw(c);
      const ordered = cars.slice().sort((a, b) => a.y - b.y);
      for (const car of ordered) sofa(car);
      c.font = '800 14px Roboto, sans-serif'; c.textAlign = 'center';
      for (const car of ordered) {
        const label = (car.pos || '') + 'º ' + car.p.name, w = c.measureText(label).width + 14;
        c.fillStyle = 'rgba(13,11,30,.75)'; c.beginPath(); c.roundRect(car.x - w / 2, car.y - 42, w, 20, 10); c.fill();
        c.fillStyle = car.p.color; c.fillText(label, car.x, car.y - 28);
      }
    }

    return {
      start() { cars.forEach((car) => bar.score(car.p, 'V1')); api.loop((dt) => { step(dt); draw(); }); },
      onMsg(p, m) { const car = cars.find((x) => x.p === p); if (car && m.k === 'in') { car.steer = clamp(+m.s || 0, -1, 1); car.gas = !!m.g; } },
      onLeave(p) { const car = cars.find((x) => x.p === p); if (car) { car.gas = false; car.steer = 0; } },
      sync(p) { const car = cars.find((x) => x.p === p); if (car) { car.lastSent = ''; } },
      _dbg: { cars, pts, N },
    };
  },

  /* ------------------------------------------------------------------ phone */
  pad(api) {
    const { root, me } = api, { clamp, esc } = J;
    let steer = 0, gas = false, sent = '', tilt = false, tiltSeen = false, fin = false;
    root.innerHTML = `<style>
      .cr{flex:1;display:flex;gap:14px;min-height:0;touch-action:none}
      .wheelzone{flex:1.4;border-radius:28px;background:rgba(255,255,255,.06);border:1px solid var(--line);position:relative;touch-action:none;display:grid;place-items:center;overflow:hidden;min-height:200px}
      .wheel{width:min(82%,230px);aspect-ratio:1;border-radius:50%;border:22px solid var(--me);box-shadow:inset 0 0 0 4px rgba(0,0,0,.35),0 14px 30px rgba(0,0,0,.5);position:relative;will-change:transform;transition:transform .08s linear}
      .wheel::before{content:"";position:absolute;left:50%;top:50%;width:34%;height:34%;transform:translate(-50%,-50%);border-radius:50%;background:#16132b;box-shadow:0 0 0 4px var(--me)}
      .wheel::after{content:"";position:absolute;left:-2%;right:-2%;top:44%;height:12%;background:#16132b;border-radius:8px}
      .wheel i{position:absolute;left:50%;top:-20px;width:10px;height:18px;margin-left:-5px;background:#fff;border-radius:4px}
      .wheelzone .tip{position:absolute;bottom:12px;left:0;right:0;text-align:center;color:var(--muted);font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}
      .pedal{flex:1;border-radius:28px;background:linear-gradient(160deg,#3df5a7,#18a36a);color:#120f26;font-weight:900;font-size:20px;text-transform:uppercase;letter-spacing:.04em;box-shadow:inset 0 -8px 0 rgba(0,0,0,.22);touch-action:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px}
      .pedal.down{transform:scale(.95);filter:brightness(1.2)} .pedal small{font-size:11px;opacity:.7;letter-spacing:.12em}
      .posbig{font-size:54px;font-weight:900;line-height:1;color:var(--me);min-width:76px}
      .wrong{color:#ff4d6d;animation:pulse .5s infinite}
    </style>
    <div class="hud"><span class="posbig" id="pos">–</span><span class="name" id="lap">Volta 1/3</span><button class="btn small" id="tilt" hidden>Inclinar: não</button></div>
    <div class="status" id="st">Acelere!</div>
    <div class="cr"><div class="wheelzone" id="wz"><div class="wheel" id="wheel"><i></i></div><div class="tip">Arraste para virar</div></div><button class="pedal" id="gas">Acelerar<small>segure</small></button></div>`;
    const $ = (s) => root.querySelector(s);
    const wheel = $('#wheel'), wz = $('#wz');
    const show = () => { wheel.style.transform = `rotate(${steer * 80}deg)`; };
    let pid = null, x0 = 0;
    wz.addEventListener('pointerdown', (e) => { if (pid !== null || tilt) return; pid = e.pointerId; try { wz.setPointerCapture(pid); } catch (err) { /* ignore */ } x0 = e.clientX; });
    wz.addEventListener('pointermove', (e) => { if (e.pointerId !== pid) return; steer = clamp((e.clientX - x0) / 80, -1, 1); show(); });
    const up = (e) => { if (e.pointerId !== pid) return; pid = null; steer = 0; show(); };
    wz.addEventListener('pointerup', up); wz.addEventListener('pointercancel', up);
    api.hold($('#gas'), () => { gas = true; api.vib(12); }, () => { gas = false; });
    // tilting only works where the browser gives motion data to a plain-http page (the TV Drop app does; many browsers don't)
    const onTilt = (e) => { if (e.gamma == null) return; if (!tiltSeen) { tiltSeen = true; $('#tilt').hidden = false; } if (tilt) { steer = clamp(e.gamma / 28, -1, 1); show(); } };
    addEventListener('deviceorientation', onTilt);
    $('#tilt').onclick = () => { tilt = !tilt; $('#tilt').textContent = 'Inclinar: ' + (tilt ? 'sim' : 'não'); if (!tilt) { steer = 0; show(); } };
    api.every(33, () => { const s = Math.round(steer * 25) + ',' + (gas ? 1 : 0); if (s !== sent) { sent = s; api.send({ k: 'in', s: Math.round(steer * 100) / 100, g: gas }); } });
    const status = (t, cls) => { const st = $('#st'); st.textContent = t; st.className = 'status ' + (cls || ''); };
    return {
      start() {},
      stop() { removeEventListener('deviceorientation', onTilt); },
      onMsg(m) {
        if (m.k === 'st') {
          $('#pos').textContent = m.pos + 'º'; $('#lap').textContent = m.fin ? 'Chegou!' : `Volta ${m.lap}/${m.laps}`;
          if (m.fin && !fin) { fin = true; status('Você terminou em ' + m.pos + 'º!'); }
          else if (!fin) status(m.wrong ? 'Contramão! Vire o sofá' : '', m.wrong ? 'wrong' : '');
        } else if (m.k === 'lap') { status(m.last ? 'Última volta!' : 'Volta ' + m.lap); api.vib([40, 40, 40]); api.after(2000, () => { if (!fin) status(''); }); }
        else if (m.k === 'spin') { status('Escorregou no café!'); api.fx.crack(0.2); api.after(900, () => { api.fx.clear(); if (!fin) status(''); }); }
      },
    };
  },
});
