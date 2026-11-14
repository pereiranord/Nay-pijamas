/* Cabo de Guerra — the TV splits everyone in two teams and shows the rope. Each tap on the phone pulls; a tap on
   the beat (the ring that pulses on the phone) pulls three times as hard. The strength of a team is the average
   of its players, so 2 against 3 is fair. The flag crossing a team's line gives that team the round. */
'use strict';
(() => {
  const TEAMS = { A: { name: 'Vermelho', color: '#ff4d6d' }, B: { name: 'Azul', color: '#3d8bff' } };
  const BEAT = 500, NEAR = 110, ON_BEAT = 3;

  J.define('cabo', {
    name: 'Cabo de Guerra', kind: 'times', min: 2, max: 6, unit: 'pontos',
    tagline: 'Dois times tocando o mais rápido possível.',
    grad: 'linear-gradient(135deg,#ff4d6d,#3d8bff)',
    icon: '<path d="M2 12h20"/><path d="M12 8v8"/><circle cx="5" cy="12" r="2"/><circle cx="19" cy="12" r="2"/><path d="M12 8l3 1.5-3 1.5"/>',
    how: [['Times', 'A TV divide todo mundo em dois lados.'], ['Toque', 'Cada toque no celular puxa a corda.'], ['Ritmo', 'Toque junto com o anel que pulsa: vale por três.']],
    padHow: 'Toque o mais rápido que conseguir para puxar a corda. Tocar junto com o anel que pulsa vale por três!',
    settings: [
      { id: 'wins', label: 'Rodadas para vencer', options: [[1, '1'], [2, '2'], [3, '3']] },
      { id: 'secs', label: 'Tempo máximo da rodada', options: [[20, '20 s'], [30, '30 s'], [45, '45 s']] },
    ],
    presets: { rapido: { wins: 1, secs: 20 }, normal: { wins: 2, secs: 30 }, longo: { wins: 3, secs: 45 } },

    /* ------------------------------------------------------------------ TV */
    tv(api) {
      const c = api.canvas();
      const WINS = api.settings.wins || 2, SECS = api.settings.secs || 30;
      const order = J.shuffle(api.players);
      const team = {}; order.forEach((p, i) => { team[p.id] = i % 2 ? 'B' : 'A'; });
      const members = (t) => order.filter((p) => team[p.id] === t);
      const S = {}; api.players.forEach((p) => { S[p.id] = { rate: 0, acc: 0, taps: 0, beats: 0 }; });
      const wins = { A: 0, B: 0 }, parts = new J.Particles();
      let phase = 'teams', pos = 0, vel = 0, left = SECS, count = 0, banner = '', bannerT = 0, round = 0, sinceTick = 0, lastWinner = null;
      const tellTeams = () => api.players.forEach((p) => api.send(p, { k: 'team', team: team[p.id], name: TEAMS[team[p.id]].name, color: TEAMS[team[p.id]].color, mates: members(team[p.id]).filter((x) => x !== p).map((x) => x.name), wins: [wins.A, wins.B], need: WINS }));

      function startRound() {
        round++; phase = 'teams'; pos = 0; vel = 0; left = SECS;
        api.players.forEach((p) => { S[p.id].rate = 0; S[p.id].acc = 0; });
        tellTeams();
        api.after(round === 1 ? 4200 : 2400, () => {
          phase = 'count'; count = 3; api.sfx('count'); api.all({ k: 'count', n: 3 });
          const id = api.every(800, () => { count--; if (count > 0) { api.sfx('count'); api.all({ k: 'count', n: count }); } else { api.cancel(id); phase = 'pull'; api.sfx('go'); api.all({ k: 'go', secs: SECS }); } });
        });
      }
      function endRound(w) {
        if (phase !== 'pull') return;
        phase = 'over'; lastWinner = w;
        if (w) { wins[w]++; banner = `Time ${TEAMS[w].name} puxou!`; api.sfx('win'); members(w).forEach((p) => api.fx(p, 'win')); members(w === 'A' ? 'B' : 'A').forEach((p) => api.fx(p, 'bad')); }
        else { banner = 'Empate! Ninguém cedeu.'; api.sfx('bad'); }
        bannerT = 3;
        api.players.forEach((p) => api.send(p, { k: 'end', won: w ? team[p.id] === w : null, wins: [wins.A, wins.B], need: WINS, taps: S[p.id].taps }));
        api.after(3200, () => {
          const champ = wins.A >= WINS ? 'A' : wins.B >= WINS ? 'B' : null;
          if (!champ) { startRound(); return; }
          api.end(api.players.map((p) => ({ id: p.id, pts: wins[team[p.id]] * 300 + (team[p.id] === champ ? 200 : 0), note: `${S[p.id].taps} toques · ${S[p.id].beats} no ritmo` })), { title: `Time ${TEAMS[champ].name} venceu!` });
        });
      }

      function step(dt) {
        sinceTick += dt;
        if (sinceTick >= 0.1) { // tap rate of each player, smoothed
          api.players.forEach((p) => { const s = S[p.id]; s.rate = s.rate * 0.7 + (s.acc / sinceTick) * 0.3; s.acc = 0; });
          sinceTick = 0;
        }
        if (phase === 'pull') {
          const power = (t) => { const m = members(t).filter((p) => p.on); return m.length ? m.reduce((a, p) => a + S[p.id].rate, 0) / m.length : 0; };
          const target = J.clamp((power('B') - power('A')) * 0.075, -0.3, 0.3); // even a walkover takes a few seconds
          vel += (target - vel) * Math.min(1, dt * 4);
          pos = J.clamp(pos + vel * dt, -1, 1);
          left -= dt;
          if (Math.abs(vel) > 0.05 && Math.random() < 0.5) parts.burst(640 + pos * 240 + (vel < 0 ? 230 : -230), 470, '#c9a76a', 1, { max: 90, life: 0.5, size: 4 });
          if (pos <= -1) endRound('A'); else if (pos >= 1) endRound('B');
          else if (left <= 0) endRound(Math.abs(pos) < 0.04 ? null : pos < 0 ? 'A' : 'B');
        }
        if (bannerT > 0) bannerT -= dt;
        parts.step(dt);
      }

      function draw(t) {
        const g = c.createLinearGradient(0, 0, 0, 720); g.addColorStop(0, '#16233f'); g.addColorStop(0.62, '#27456b'); g.addColorStop(0.62, '#2f6a3d'); g.addColorStop(1, '#1d4428');
        c.fillStyle = g; c.fillRect(0, 0, 1280, 720);
        // each team's line and the middle
        const cx = 640, y = 430, px = pos * 240;
        [['A', cx - 240], ['B', cx + 240]].forEach(([k, x]) => { c.fillStyle = J.rgba(TEAMS[k].color, 0.35); c.fillRect(x - 5, 460, 10, 150); c.fillStyle = TEAMS[k].color; c.font = '900 20px Archivo, sans-serif'; c.textAlign = 'center'; c.fillText('LINHA DO ' + TEAMS[k].name.toUpperCase(), x, 640); });
        c.strokeStyle = 'rgba(255,255,255,.35)'; c.setLineDash([10, 12]); c.lineWidth = 3; c.beginPath(); c.moveTo(cx, 380); c.lineTo(cx, 610); c.stroke(); c.setLineDash([]);
        // the rope, sagging a little when nobody pulls
        const rate = api.players.reduce((a, p) => a + S[p.id].rate, 0);
        const sag = Math.max(0, 14 - rate * 2);
        c.strokeStyle = '#d8b377'; c.lineWidth = 10; c.lineCap = 'round';
        c.beginPath(); c.moveTo(cx + px - 420, y); c.quadraticCurveTo(cx + px, y + sag, cx + px + 420, y); c.stroke();
        c.strokeStyle = 'rgba(90,60,20,.5)'; c.lineWidth = 2;
        for (let x = -410; x <= 410; x += 22) { c.beginPath(); c.moveTo(cx + px + x, y - 4 + sag * (1 - Math.abs(x) / 420)); c.lineTo(cx + px + x + 8, y + 4 + sag * (1 - Math.abs(x) / 420)); c.stroke(); }
        // the flag in the middle of the rope
        c.fillStyle = '#fff'; c.fillRect(cx + px - 3, y - 4 + sag, 6, 70);
        c.fillStyle = pos < -0.04 ? TEAMS.A.color : pos > 0.04 ? TEAMS.B.color : '#ffd23f';
        c.beginPath(); c.moveTo(cx + px, y + 14 + sag); c.lineTo(cx + px + (pos <= 0 ? -44 : 44), y + 30 + sag); c.lineTo(cx + px, y + 46 + sag); c.closePath(); c.fill();
        // the teams, leaning back and stamping with their own rhythm
        ['A', 'B'].forEach((k) => {
          const dir = k === 'A' ? -1 : 1;
          members(k).forEach((p, i) => {
            const s = S[p.id], x = cx + px + dir * (150 + i * 82), bob = Math.sin(t * (6 + s.rate * 2) + i) * Math.min(7, s.rate * 1.4);
            const pulling = phase === 'pull' && s.rate > 0.5;
            J.drawBuddy(c, x, y - 18 + bob, 36, p, { rot: dir * (0.12 + Math.min(0.3, s.rate * 0.04)), mood: phase === 'over' ? (lastWinner === k ? 'happy' : lastWinner ? 'sad' : 'wow') : pulling ? 'angry' : 'happy', t, alpha: p.on ? 1 : 0.35 });
            c.fillStyle = '#fff'; c.font = '800 18px Archivo, sans-serif'; c.textAlign = 'center'; c.fillText(p.name, x, y + 62);
          });
        });
        parts.draw(c);
        // scoreboard
        c.textAlign = 'center';
        [['A', 330], ['B', 950]].forEach(([k, x]) => {
          c.fillStyle = TEAMS[k].color; c.font = '900 40px Archivo, sans-serif'; c.fillText('TIME ' + TEAMS[k].name.toUpperCase(), x, 78);
          for (let i = 0; i < WINS; i++) { c.beginPath(); c.arc(x - (WINS - 1) * 18 + i * 36, 112, 11, 0, 7); c.fillStyle = i < wins[k] ? TEAMS[k].color : 'rgba(255,255,255,.15)'; c.fill(); }
        });
        c.fillStyle = '#fff'; c.font = '900 54px Archivo, sans-serif';
        if (phase === 'pull') c.fillText(Math.max(0, Math.ceil(left)), cx, 92);
        else if (phase === 'count') { c.font = '900 200px Archivo, sans-serif'; c.fillText(count, cx, 300); }
        else if (phase === 'teams') { c.font = '900 44px Archivo, sans-serif'; c.fillText(round === 1 ? 'Olhe o celular: qual é o seu time?' : 'Rodada ' + round, cx, 250); }
        if (bannerT > 0) { c.font = '900 64px Archivo, sans-serif'; c.fillStyle = lastWinner ? TEAMS[lastWinner].color : '#ffd23f'; c.fillText(banner, cx, 260); }
        if (phase === 'pull') { // the beat, for the room to clap along
          const k = 1 - ((performance.now() % BEAT) / BEAT);
          c.strokeStyle = `rgba(255,210,63,${0.25 + k * 0.6})`; c.lineWidth = 6; c.beginPath(); c.arc(cx, 190, 26 + k * 16, 0, 7); c.stroke();
        }
      }

      return {
        start() { startRound(); api.loop((dt, t) => { step(dt); draw(t); }); },
        onMsg(p, m) {
          if (m.k !== 'in' || phase !== 'pull') return;
          const n = J.clamp(m.n | 0, 0, 4), b = J.clamp(m.b | 0, 0, Math.min(n, 2)); // more than a person can tap is thrown away
          const s = S[p.id]; s.acc += n + b * (ON_BEAT - 1); s.taps += n; s.beats += b;
        },
        sync() { tellTeams(); if (phase === 'pull') api.all({ k: 'go', secs: Math.ceil(left) }); },
      };
    },

    /* ------------------------------------------------------------------ phone */
    pad(api) {
      const { root, me } = api, { esc } = J;
      root.innerHTML = `<style>
        .cb-top{text-align:center;flex:none;padding-top:8px} .cb-top b{font-size:22px} .cb-top small{display:block;color:var(--muted);font-weight:700;font-size:13px}
        .cb-pips{display:flex;gap:14px;justify-content:center;align-items:center;font-weight:900;font-size:13px;margin-top:4px} .cb-pips i{display:inline-block;width:12px;height:12px;border-radius:50%;background:rgba(255,255,255,.15);margin:0 2px}
        .cb-btn{flex:1;min-height:0;position:relative;border-radius:34px;background:var(--tc);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:#fff;font-weight:900;touch-action:none;box-shadow:inset 0 -12px 0 rgba(0,0,0,.22);overflow:hidden;transition:transform .05s,filter .2s}
        .cb-btn.down{transform:scale(.97)} .cb-btn.off{filter:grayscale(.8) brightness(.55)}
        .cb-btn b{font-size:clamp(40px,14vw,84px);line-height:1} .cb-btn span{font-size:15px;letter-spacing:.12em;text-transform:uppercase;opacity:.9}
        .cb-ring{position:absolute;left:50%;top:50%;width:min(62vw,62vh);height:min(62vw,62vh);margin:calc(min(62vw,62vh) / -2);border-radius:50%;border:8px solid rgba(255,255,255,.55);pointer-events:none;animation:cbbeat ${BEAT}ms linear infinite}
        @keyframes cbbeat{0%{transform:scale(1);opacity:1}100%{transform:scale(.62);opacity:.15}}
        .cb-hit{position:absolute;top:14%;font-size:18px;letter-spacing:.1em;text-transform:uppercase;color:#ffd23f;opacity:0} .cb-hit.on{animation:cbhit .45s}
        @keyframes cbhit{0%{opacity:1;transform:scale(1.4)}100%{opacity:0;transform:scale(1)}}
      </style><div class="cb-top"><b id="tn">…</b><small id="tm"></small><div class="cb-pips" id="pips"></div></div>
      <div class="cb-btn off" id="btn"><div class="cb-ring" hidden></div><em class="cb-hit" id="hit">No ritmo! ×3</em><b id="big">…</b><span id="sub">Aguarde</span></div>`;
      const btn = root.querySelector('#btn'), big = root.querySelector('#big'), sub = root.querySelector('#sub'), ring = root.querySelector('.cb-ring'), hit = root.querySelector('#hit');
      let live = false, n = 0, b = 0, taps = 0, t0 = 0;
      const pips = (w, need) => { root.querySelector('#pips').innerHTML = [['Vermelho', '#ff4d6d', w[0]], ['Azul', '#3d8bff', w[1]]].map(([nm, col, k]) => `<span style="color:${col}">${nm} ${Array.from({ length: need }, (_, i) => `<i style="${i < k ? 'background:' + col : ''}"></i>`).join('')}</span>`).join(''); };
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        btn.classList.add('down'); setTimeout(() => btn.classList.remove('down'), 60);
        if (!live) return;
        n++; taps++; big.textContent = taps;
        const ph = (performance.now() - t0) % BEAT;
        if (ph < NEAR || ph > BEAT - NEAR) { b++; hit.classList.remove('on'); void hit.offsetWidth; hit.classList.add('on'); api.vib(25); } else api.vib(8);
      });
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
      api.every(120, () => { if (live && n) { api.stream({ k: 'in', n: Math.min(n, 4), b: Math.min(b, 2) }); n = 0; b = 0; } });

      return {
        start() {},
        onMsg(m) {
          if (m.k === 'team') {
            live = false; ring.hidden = true; btn.classList.add('off');
            document.documentElement.style.setProperty('--tc', m.color); btn.style.setProperty('--tc', m.color);
            root.querySelector('#tn').textContent = 'Time ' + m.name; root.querySelector('#tn').style.color = m.color;
            root.querySelector('#tm').textContent = m.mates.length ? 'Com ' + m.mates.join(' e ') : 'Você puxa sozinho por esse lado';
            pips(m.wins, m.need); big.textContent = esc(me.name); sub.textContent = 'Prepare os dedos';
          } else if (m.k === 'count') { big.textContent = m.n; sub.textContent = 'Preparar…'; api.vib(30); }
          else if (m.k === 'go') { live = true; taps = 0; n = 0; b = 0; t0 = performance.now(); ring.hidden = false; ring.style.animation = 'none'; void ring.offsetWidth; ring.style.animation = ''; btn.classList.remove('off'); big.textContent = 'PUXE!'; sub.textContent = 'Toque sem parar · no anel vale ×3'; api.vib([80, 40, 80]); }
          else if (m.k === 'end') { live = false; ring.hidden = true; btn.classList.add('off'); pips(m.wins, m.need); big.textContent = m.won == null ? 'Empate' : m.won ? 'Vitória!' : 'Perdeu…'; sub.textContent = m.taps + ' toques no total'; }
        },
      };
    },
  });
})();
