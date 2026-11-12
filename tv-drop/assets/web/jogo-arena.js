/* Arena Neon — top-down ship battle. Phone: joystick + fire + dash. Last ship flying wins the round. */
'use strict';
J.define('arena', {
  name: 'Arena Neon', kind: 'ação', min: 2, max: 6, unit: 'pontos',
  tagline: 'Batalha de naves. A última que sobrar leva a rodada.',
  grad: 'linear-gradient(135deg,#ff4d6d,#b47cff)',
  icon: '<path d="M12 3l7 17-7-4-7 4z"/><path d="M12 9v4"/>',
  how: [['Mova', 'Arraste o joystick no celular para pilotar a nave.'], ['Atire', 'Segure TIRO. Cada nave aguenta 3 acertos.'], ['Sobreviva', 'Quem sobrar ganha a rodada. Vence quem ganhar 3.']],
  padHow: 'Polegar esquerdo pilota. Segure TIRO para atirar e use IMPULSO para escapar. Você tem 3 vidas por rodada.',
  settings: [
    { id: 'wins', label: 'Rodadas para vencer', options: [[2, '2'], [3, '3'], [5, '5']] },
    { id: 'zone', label: 'A arena fecha após', options: [[20, '20 s'], [32, '32 s'], [45, '45 s']] },
  ],
  presets: { rapido: { wins: 2, zone: 20 }, normal: { wins: 3, zone: 32 }, longo: { wins: 5, zone: 45 } },

  /* ------------------------------------------------------------------ TV */
  tv(api) {
    const { W, H } = api, { clamp, rand, pick } = J;
    const c = api.canvas();
    const bar = api.topbar(false);
    const parts = new J.Particles();
    const B = { l: 40, t: 96, r: W - 40, b: H - 36 };
    const BLOCKS = [[300, 240, 120, 46], [860, 240, 120, 46], [300, 470, 120, 46], [860, 470, 120, 46], [610, 150, 60, 60], [610, 530, 60, 60]];
    const WIN = api.settings.wins || 3, ZONE = api.settings.zone || 32, POWERS = { triple: ['#ffd23f', 'TIRO TRIPLO'], shield: ['#3dc9ff', 'ESCUDO'], speed: ['#3df5a7', 'TURBO'], heal: ['#ff4d6d', '+1 VIDA'] };
    const ships = api.players.map((p) => ({ p, x: 0, y: 0, vx: 0, vy: 0, ang: 0, hp: 3, alive: true, fire: 0, dash: 0, inv: 0, power: null, powerT: 0, shield: false, ix: 0, iy: 0, f: false, wins: 0, kills: 0, gone: false, dashT: 0, zoneT: 0 }));
    let bullets = [], powers = [], rings = [], round = 0, phase = 'wait', roundT = 0, powerT = 4, shake = 0, zone = 0, time = 0;

    // the floor is drawn once
    const floor = document.createElement('canvas'); floor.width = W; floor.height = H;
    (() => {
      const f = floor.getContext('2d');
      const g = f.createRadialGradient(W / 2, H / 2, 80, W / 2, H / 2, 760); g.addColorStop(0, '#1b1440'); g.addColorStop(1, '#0a0818'); f.fillStyle = g; f.fillRect(0, 0, W, H);
      f.strokeStyle = 'rgba(120,100,255,.13)'; f.lineWidth = 1;
      for (let x = B.l; x <= B.r; x += 48) { f.beginPath(); f.moveTo(x, B.t); f.lineTo(x, B.b); f.stroke(); }
      for (let y = B.t; y <= B.b; y += 48) { f.beginPath(); f.moveTo(B.l, y); f.lineTo(B.r, y); f.stroke(); }
      for (const [w, a] of [[14, 0.1], [7, 0.22], [2.5, 1]]) { f.strokeStyle = `rgba(180,124,255,${a})`; f.lineWidth = w; f.strokeRect(B.l, B.t, B.r - B.l, B.b - B.t); }
      for (const [x, y, w, h] of BLOCKS) {
        f.fillStyle = '#231a52'; f.fillRect(x, y, w, h);
        for (const [lw, a] of [[10, 0.12], [2.5, 0.95]]) { f.strokeStyle = `rgba(61,201,255,${a})`; f.lineWidth = lw; f.strokeRect(x, y, w, h); }
      }
    })();

    const state = (s) => api.send(s.p, { k: 'st', hp: s.hp, alive: s.alive, power: s.power, shield: s.shield, wins: s.wins, round });
    const living = () => ships.filter((s) => s.alive && !s.gone);

    function newRound() {
      round++; phase = 'play'; roundT = 0; zone = 0; bullets = []; powers = []; powerT = 3;
      const act = ships.filter((s) => !s.gone);
      act.forEach((s, i) => {
        const a = -Math.PI / 2 + (i / act.length) * Math.PI * 2;
        Object.assign(s, { x: W / 2 + Math.cos(a) * 430, y: (B.t + B.b) / 2 + Math.sin(a) * 210, vx: 0, vy: 0, ang: a + Math.PI, hp: 3, alive: true, inv: 1.2, power: null, shield: false, fire: 0.6, dash: 0 });
        api.fx(s.p, 'clear'); state(s);
      });
      api.all({ k: 'round', n: round });
      api.banner('Rodada ' + round);
      api.sfx('reveal');
    }

    function hitBlock(x, y, r) {
      for (const [bx, by, bw, bh] of BLOCKS) { const nx = clamp(x, bx, bx + bw), ny = clamp(y, by, by + bh); const dx = x - nx, dy = y - ny; if (dx * dx + dy * dy < r * r) return [nx, ny, dx, dy]; }
      return null;
    }

    function damage(s, by) {
      if (!s.alive || s.inv > 0) return;
      if (s.shield) { s.shield = false; s.inv = 0.4; parts.burst(s.x, s.y, '#3dc9ff', 18); api.sfx('pop'); api.fx(s.p, 'flash', { color: '#3dc9ff' }); state(s); return; }
      s.hp--; s.inv = 0.7; shake = Math.max(shake, 6);
      parts.burst(s.x, s.y, s.p.color, 14); api.sfx('hit');
      if (s.hp > 0) { api.fx(s.p, 'hit'); state(s); return; }
      s.alive = false;
      parts.burst(s.x, s.y, s.p.color, 60, { max: 420, life: 1.1, size: 7 }); parts.burst(s.x, s.y, '#ffffff', 26, { max: 300 });
      rings.push({ x: s.x, y: s.y, t: 0, color: s.p.color }); shake = 16; api.sfx('boom');
      api.fx(s.p, 'dead'); state(s); bar.out(s.p, true);
      if (by && by !== s) { by.kills++; api.fx(by.p, 'stamp', { text: 'Abateu!', color: by.p.color }); }
    }

    function endRound() {
      phase = 'over';
      const alive = living();
      const w = alive.length === 1 ? alive[0] : null;
      if (w) { w.wins++; api.fx(w.p, 'good', { color: w.p.color }); api.banner(w.p.name + ' venceu a rodada!', w.wins + ' de ' + WIN); api.sfx('good'); }
      else api.banner('Ninguém sobrou!', 'rodada empatada');
      ships.forEach((s) => { bar.score(s.p, '★'.repeat(s.wins) || '·'); });
      const champ = ships.find((s) => s.wins >= WIN);
      const left = ships.filter((s) => !s.gone);
      api.after(2600, () => {
        if (champ || round >= WIN * 2 + 1 || left.length < 2) api.end(ships.map((s) => ({ id: s.p.id, pts: s.wins * 10 + s.kills, note: s.kills + (s.kills === 1 ? ' abate' : ' abates') })));
        else { ships.forEach((s) => bar.out(s.p, s.gone)); newRound(); }
      });
    }

    function step(dt) {
      time += dt;
      if (phase !== 'play') { parts.step(dt); return; }
      roundT += dt;
      if (roundT > ZONE) zone = Math.min(250, zone + 14 * dt);
      const Z = { l: B.l + zone * 1.6, t: B.t + zone, r: B.r - zone * 1.6, b: B.b - zone };
      for (const s of ships) {
        if (!s.alive || s.gone) continue;
        const top = s.power === 'speed' ? 470 : 330;
        s.vx += s.ix * 1700 * dt; s.vy += s.iy * 1700 * dt;
        s.vx -= s.vx * 3.6 * dt; s.vy -= s.vy * 3.6 * dt;
        const sp = Math.hypot(s.vx, s.vy);
        if (sp > top && s.dashT <= 0) { s.vx *= top / sp; s.vy *= top / sp; }
        s.dashT = Math.max(0, (s.dashT || 0) - dt);
        if (Math.hypot(s.ix, s.iy) > 0.25) { const want = Math.atan2(s.iy, s.ix); let d = want - s.ang; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; s.ang += d * Math.min(1, 14 * dt); }
        s.x += s.vx * dt; s.y += s.vy * dt;
        if (s.x < B.l + 18) { s.x = B.l + 18; s.vx = Math.abs(s.vx) * 0.5; } if (s.x > B.r - 18) { s.x = B.r - 18; s.vx = -Math.abs(s.vx) * 0.5; }
        if (s.y < B.t + 18) { s.y = B.t + 18; s.vy = Math.abs(s.vy) * 0.5; } if (s.y > B.b - 18) { s.y = B.b - 18; s.vy = -Math.abs(s.vy) * 0.5; }
        const hb = hitBlock(s.x, s.y, 18);
        if (hb) { const l = Math.hypot(hb[2], hb[3]) || 1; s.x = hb[0] + (hb[2] / l) * 18; s.y = hb[1] + (hb[3] / l) * 18; const dot = s.vx * (hb[2] / l) + s.vy * (hb[3] / l); if (dot < 0) { s.vx -= 1.5 * dot * (hb[2] / l); s.vy -= 1.5 * dot * (hb[3] / l); } }
        s.inv = Math.max(0, s.inv - dt); s.fire -= dt; s.dash = Math.max(0, s.dash - dt);
        if (s.power && s.power !== 'shield') { s.powerT -= dt; if (s.powerT <= 0) { s.power = null; state(s); } }
        if (sp > 60 && Math.random() < 0.5) parts.add({ x: s.x - Math.cos(s.ang) * 16, y: s.y - Math.sin(s.ang) * 16, vx: -Math.cos(s.ang) * 60 + rand(-20, 20), vy: -Math.sin(s.ang) * 60 + rand(-20, 20), color: s.p.color, max: 0.35, size: 4 });
        if (s.f && s.fire <= 0) {
          s.fire = 0.27;
          for (const off of s.power === 'triple' ? [-0.2, 0, 0.2] : [0]) { const a = s.ang + off; bullets.push({ x: s.x + Math.cos(a) * 22, y: s.y + Math.sin(a) * 22, vx: Math.cos(a) * 720 + s.vx * 0.3, vy: Math.sin(a) * 720 + s.vy * 0.3, t: 0, s }); }
          api.sfx('shot');
        }
        if (s.x < Z.l || s.x > Z.r || s.y < Z.t || s.y > Z.b) { s.zoneT = (s.zoneT || 0) + dt; if (s.zoneT > 0.8) { s.zoneT = 0; s.inv = 0; damage(s, null); } } else s.zoneT = 0;
      }
      // ships push each other
      const act = living();
      for (let i = 0; i < act.length; i++) for (let j = i + 1; j < act.length; j++) {
        const a = act[i], b = act[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
        if (d < 36) { const nx = dx / d, ny = dy / d, push = (36 - d) / 2; a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push; const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny; if (rel < 0) { a.vx += rel * nx; a.vy += rel * ny; b.vx -= rel * nx; b.vy -= rel * ny; } }
      }
      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.t += dt; b.x += b.vx * dt; b.y += b.vy * dt;
        let dead = b.t > 1.15 || b.x < B.l || b.x > B.r || b.y < B.t || b.y > B.b || hitBlock(b.x, b.y, 4);
        if (!dead) for (const s of act) { if (s !== b.s && s.alive && (s.x - b.x) ** 2 + (s.y - b.y) ** 2 < 22 * 22) { s.vx += b.vx * 0.12; s.vy += b.vy * 0.12; damage(s, b.s); dead = true; break; } }
        if (dead) { parts.burst(b.x, b.y, b.s.p.color, 5, { max: 120, life: 0.3, size: 3 }); bullets.splice(i, 1); }
      }
      powerT -= dt;
      if (powerT <= 0 && powers.length < 2) {
        powerT = rand(5, 8);
        for (let tries = 0; tries < 20; tries++) { const x = rand(Z.l + 60, Z.r - 60), y = rand(Z.t + 60, Z.b - 60); if (!hitBlock(x, y, 34)) { powers.push({ x, y, type: pick(Object.keys(POWERS)), t: 0 }); api.sfx('pop'); break; } }
      }
      for (let i = powers.length - 1; i >= 0; i--) {
        const pw = powers[i]; pw.t += dt;
        const s = act.find((x) => (x.x - pw.x) ** 2 + (x.y - pw.y) ** 2 < 34 * 34);
        if (s) {
          powers.splice(i, 1);
          if (pw.type === 'heal') s.hp = Math.min(3, s.hp + 1); else if (pw.type === 'shield') s.shield = true; else { s.power = pw.type; s.powerT = 8; }
          parts.burst(pw.x, pw.y, POWERS[pw.type][0], 24); api.sfx('power');
          api.fx(s.p, 'flash', { color: POWERS[pw.type][0] }); api.send(s.p, { k: 'got', label: POWERS[pw.type][1], color: POWERS[pw.type][0] }); state(s);
        } else if (pw.t > 12) powers.splice(i, 1);
      }
      for (let i = rings.length - 1; i >= 0; i--) { rings[i].t += dt; if (rings[i].t > 0.6) rings.splice(i, 1); }
      parts.step(dt);
      if (living().length <= 1) endRound();
    }

    function draw() {
      c.save();
      if (shake > 0.3) { c.translate(rand(-shake, shake), rand(-shake, shake)); shake *= 0.88; } else shake = 0;
      c.drawImage(floor, 0, 0);
      if (zone > 0) {
        const Z = { l: B.l + zone * 1.6, t: B.t + zone, r: B.r - zone * 1.6, b: B.b - zone };
        c.fillStyle = `rgba(255,40,80,${0.16 + 0.06 * Math.sin(time * 6)})`;
        c.beginPath(); c.rect(B.l, B.t, B.r - B.l, B.b - B.t); c.rect(Z.l, Z.t, Z.r - Z.l, Z.b - Z.t); c.fill('evenodd');
        c.strokeStyle = '#ff4d6d'; c.lineWidth = 3; c.strokeRect(Z.l, Z.t, Z.r - Z.l, Z.b - Z.t);
      }
      for (const pw of powers) {
        const col = POWERS[pw.type][0], r = 17 + Math.sin(pw.t * 5) * 3;
        c.fillStyle = J.rgba(col, 0.2); c.beginPath(); c.arc(pw.x, pw.y, r + 12, 0, 7); c.fill();
        c.fillStyle = col; c.beginPath(); c.arc(pw.x, pw.y, r, 0, 7); c.fill();
        c.fillStyle = '#120f26'; c.font = '900 18px Roboto, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText({ triple: '≡', shield: '◯', speed: '»', heal: '+' }[pw.type], pw.x, pw.y + 1);
      }
      c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
      for (const b of bullets) { c.strokeStyle = J.rgba(b.s.p.color, 0.35); c.lineWidth = 12; c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(b.x - b.vx * 0.03, b.y - b.vy * 0.03); c.stroke(); c.strokeStyle = '#fff'; c.lineWidth = 4; c.stroke(); }
      for (const r of rings) { c.strokeStyle = J.rgba(r.color, 1 - r.t / 0.6); c.lineWidth = 8 * (1 - r.t / 0.6); c.beginPath(); c.arc(r.x, r.y, 20 + r.t * 320, 0, 7); c.stroke(); }
      c.restore();
      parts.draw(c);
      for (const s of ships) {
        if (!s.alive || s.gone) continue;
        if (s.inv > 0 && Math.floor(time * 18) % 2) continue;
        c.save(); c.translate(s.x, s.y);
        c.fillStyle = J.rgba(s.p.color, 0.18); c.beginPath(); c.arc(0, 0, 30, 0, 7); c.fill();
        if (s.shield) { c.strokeStyle = '#3dc9ff'; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, 27 + Math.sin(time * 8) * 1.5, 0, 7); c.stroke(); }
        c.rotate(s.ang);
        c.lineJoin = 'round'; c.beginPath(); c.moveTo(22, 0); c.lineTo(-15, -15); c.lineTo(-8, 0); c.lineTo(-15, 15); c.closePath();
        c.fillStyle = s.p.color; c.fill(); c.lineWidth = 3; c.strokeStyle = '#fff'; c.stroke();
        c.fillStyle = '#120f26'; c.beginPath(); c.arc(3, 0, 4.5, 0, 7); c.fill();
        c.restore();
        c.font = '800 15px Roboto, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
        c.fillStyle = 'rgba(0,0,0,.6)'; c.fillText(s.p.name, s.x + 1, s.y - 33); c.fillStyle = '#fff'; c.fillText(s.p.name, s.x, s.y - 34);
        for (let i = 0; i < 3; i++) { c.fillStyle = i < s.hp ? s.p.color : 'rgba(255,255,255,.18)'; c.fillRect(s.x - 17 + i * 12, s.y + 30, 9, 4); }
      }
      c.restore();
    }

    return {
      start() { ships.forEach((s) => bar.score(s.p, '·')); newRound(); api.loop((dt) => { step(dt); draw(); }); },
      onMsg(p, m) {
        const s = ships.find((x) => x.p === p);
        if (!s) return;
        if (m.k === 'in') { const x = clamp(+m.x || 0, -1, 1), y = clamp(+m.y || 0, -1, 1); s.ix = x; s.iy = y; s.f = !!m.f; }
        else if (m.k === 'dash' && s.alive && s.dash <= 0 && phase === 'play') {
          const l = Math.hypot(s.ix, s.iy), dx = l > 0.2 ? s.ix / l : Math.cos(s.ang), dy = l > 0.2 ? s.iy / l : Math.sin(s.ang);
          s.vx = dx * 880; s.vy = dy * 880; s.dashT = 0.22; s.inv = Math.max(s.inv, 0.3); s.dash = 2.2;
          parts.burst(s.x, s.y, '#ffffff', 12, { max: 160, life: 0.35 }); api.sfx('dash'); api.send(p, { k: 'dashed', cd: 2.2 });
        }
      },
      onLeave(p) { const s = ships.find((x) => x.p === p); if (s) { s.ix = s.iy = 0; s.f = false; } },
      sync(p) { const s = ships.find((x) => x.p === p); if (s) state(s); },
    };
  },

  /* ------------------------------------------------------------------ phone */
  pad(api) {
    const { root, me } = api;
    let x = 0, y = 0, f = false, sent = '', alive = true;
    root.innerHTML = `<div class="hud"><span id="ab"></span><span class="name">${J.esc(me.name)}</span><span class="pillv" id="hp">♥♥♥</span><span class="pillv" id="wins">★ 0</span></div>
      <div class="status" id="st">Prepare-se</div>
      <div class="padzone"><div id="stick"></div><div class="actions"><button class="abtn fire" id="fire">Tiro<small>segure</small></button><button class="abtn dash" id="dash">Impulso<div class="cool" id="cool"></div></button></div></div>`;
    root.querySelector('#ab').replaceWith(api.buddy(me, 40));
    const $ = (s) => root.querySelector(s);
    const push = () => { const s = Math.round(x * 20) + ',' + Math.round(y * 20) + ',' + (f ? 1 : 0); if (s !== sent) { sent = s; api.stream({ k: 'in', x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, f }); } };
    api.stick($('#stick'), (nx, ny) => { x = nx; y = ny; });
    api.hold($('#fire'), () => { f = true; push(); api.vib(12); }, () => { f = false; push(); });
    api.hold($('#dash'), () => { if (alive) api.send({ k: 'dash' }); });
    api.every(33, push);
    const status = (t, color) => { const st = $('#st'); st.textContent = t; st.style.color = color || ''; };
    return {
      start() {},
      onMsg(m) {
        if (m.k === 'st') {
          $('#hp').textContent = '♥'.repeat(Math.max(0, m.hp)) + '♡'.repeat(Math.max(0, 3 - m.hp));
          $('#hp').style.color = m.hp <= 1 ? '#ff4d6d' : '';
          $('#wins').textContent = '★ ' + m.wins;
          if (alive && !m.alive) status('Eliminado! Assista na TV', '#ff4d6d');
          alive = m.alive;
          root.querySelector('.padzone').style.opacity = alive ? 1 : 0.35;
          if (alive && m.shield) status('Escudo ativo', '#3dc9ff');
        } else if (m.k === 'round') { status('Rodada ' + m.n); api.vib(40); }
        else if (m.k === 'got') { status(m.label, m.color); api.vib([30, 30, 60]); api.after(2500, () => { if (alive) status(''); }); }
        else if (m.k === 'dashed') { const cool = $('#cool'); cool.style.transition = 'none'; cool.style.transform = 'scaleY(1)'; void cool.offsetWidth; cool.style.transition = `transform ${m.cd}s linear`; cool.style.transform = 'scaleY(0)'; api.vib(25); }
      },
    };
  },
});
