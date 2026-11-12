/* STOP! (Adedonha) — the TV draws a letter, everyone fills one answer per category on the phone at the same time,
   the first to finish hits STOP and locks everybody. Then each category is shown on the TV: answers that don't
   start with the letter are out automatically, the others can be contested by the players (most of the others
   saying "não vale" removes it). A valid answer nobody else gave is worth more than a repeated one. */
'use strict';
(() => {
  const CATS = [['nome', 'Nome'], ['animal', 'Animal'], ['cidade', 'Cidade'], ['pais', 'País'], ['comida', 'Comida'], ['objeto', 'Objeto'], ['profissao', 'Profissão'], ['filme', 'Filme ou série'], ['marca', 'Marca'], ['fruta', 'Fruta'], ['celebridade', 'Celebridade'], ['cor', 'Cor'], ['parte', 'Parte do corpo'], ['esporte', 'Esporte'], ['mse', 'Minha sogra é…'], ['carro', 'Carro']];
  const LETTERS = 'ABCDEFGIJLMNOPRSTUV';
  const clean = (a, n) => Array.from({ length: n }, (_, i) => String((Array.isArray(a) ? a[i] : '') || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 30));

  J.define('stop', {
    name: 'STOP!', kind: 'palavras', min: 2, max: 6, unit: 'pontos',
    tagline: 'Uma letra, várias categorias e um botão de STOP.',
    grad: 'linear-gradient(135deg,#ff5d3d,#ffd23f)',
    icon: '<path d="M8.5 3h7L21 8.5v7L15.5 21h-7L3 15.5v-7z"/><path d="M8 12h8"/>',
    how: [['Sorteio', 'A TV sorteia uma letra para todos.'], ['Preencha', 'Uma resposta por categoria, no celular.'], ['STOP', 'Quem terminar trava todo mundo. Depois vem a conferência.']],
    padHow: 'Preencha uma resposta por categoria com a letra sorteada. Terminou? Aperte STOP e trave todo mundo.',
    settings: [
      { id: 'rounds', label: 'Rodadas', options: [[3, '3'], [5, '5'], [7, '7']] },
      { id: 'secs', label: 'Tempo para responder', options: [[60, '60 s'], [90, '90 s'], [120, '2 min']] },
      { id: 'pts', label: 'Pontos', options: [['10-5', 'Única 10 · repetida 5'], ['15-5', 'Única 15 · repetida 5'], ['10-10', 'Toda válida vale 10']] },
      { id: 'cats', label: 'Categorias', multi: true, min: 3, allLabel: 'Todas', def: ['nome', 'animal', 'cidade', 'comida', 'objeto', 'profissao'], options: CATS },
    ],
    presets: { rapido: { rounds: 3, secs: 60, pts: '10-5' }, normal: { rounds: 5, secs: 90, pts: '10-5' }, longo: { rounds: 7, secs: 120, pts: '10-5' } },

    /* ------------------------------------------------------------------ TV */
    tv(api) {
      const { esc, norm, el } = J;
      const bar = api.topbar(true);
      const view = el('div', 'center st'); api.stage.appendChild(view);
      view.insertAdjacentHTML('beforebegin', `<style>
        .st{gap:1.2rem}
        .st-letter{width:13rem;height:13rem;border-radius:2.6rem;background:linear-gradient(135deg,#ff5d3d,#ffd23f);color:#1a0d05;display:grid;place-items:center;font-size:9.5rem;font-weight:900;box-shadow:0 1.4rem 4rem rgba(255,93,61,.4);line-height:1}
        .st-letter.spin{animation:stspin .12s linear infinite} @keyframes stspin{50%{transform:scale(.94) rotate(-3deg)}}
        .st-letter.land{animation:pop .5s both}
        .st-cats{display:flex;flex-wrap:wrap;gap:.7rem;justify-content:center;max-width:60rem}
        .st-cats span{background:var(--panel);border-radius:999px;padding:.55rem 1.3rem;font-size:1.35rem;font-weight:800}
        .st-prog{display:flex;gap:1.4rem;flex-wrap:wrap;justify-content:center}
        .st-p{display:flex;flex-direction:column;align-items:center;gap:.3rem;font-weight:800;font-size:1.1rem}
        .st-p i{display:block;width:6rem;height:.6rem;border-radius:.3rem;background:rgba(255,255,255,.12);overflow:hidden} .st-p i b{display:block;height:100%;background:var(--accent);transition:width .3s}
        .st-rows{display:flex;flex-direction:column;gap:.6rem;width:min(64rem,92%)}
        .st-row{display:flex;align-items:center;gap:1rem;background:var(--panel);border-radius:1.2rem;padding:.5rem 1.2rem .5rem .6rem;font-size:1.7rem;font-weight:800;animation:rise .3s both}
        .st-row .buddy{flex:none} .st-row .nm{width:11rem;color:var(--muted);font-size:1.25rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .st-row .ans{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-transform:uppercase}
        .st-row .veto{color:#ff8fa3;font-size:1.1rem;white-space:nowrap}
        .st-row .tag{min-width:5.5rem;text-align:right;font-size:1.6rem}
        .st-row.bad .ans{text-decoration:line-through;opacity:.45} .st-row.bad .tag{color:#ff8fa3;font-size:1.1rem}
        .st-row.uniq{background:rgba(61,245,167,.18)} .st-row.uniq .tag{color:var(--accent)} .st-row.rep .tag{color:#ffd23f}
        .st-stamp{font-size:8rem;font-weight:900;color:#ff5d3d;border:.7rem solid currentColor;border-radius:1.6rem;padding:.2rem 2.4rem;transform:rotate(-8deg);animation:pop .4s both}
      </style>`);
      const ROUNDS = api.settings.rounds || 5, SECS = api.settings.secs || 90;
      const [UNIQ, REP] = String(api.settings.pts || '10-5').split('-').map(Number);
      const cats = (api.settings.cats && api.settings.cats.length ? api.settings.cats : ['nome', 'animal', 'cidade', 'comida', 'objeto', 'profissao']).map((id) => (CATS.find((c) => c[0] === id) || [id, id])[1]);
      const letters = J.fresh('stop', LETTERS.split(''), ROUNDS);
      const score = {}, last = {};
      api.players.forEach((p) => { score[p.id] = 0; bar.score(p, '0'); });
      let r = -1, letter = '', phase = '', ans = {}, vetoes = {}, oks = {}, ck = null, ci = 0, roundPts = {};
      const tell = (p, m) => { last[p.id] = m; api.send(p, m); };
      const present = () => api.players.filter((p) => p.on);
      const filled = (p) => (ans[p.id] || []).filter(Boolean).length;
      const startsOk = (t) => norm(t).charAt(0) === norm(letter);

      function spin() {
        r++; phase = 'spin'; ans = {}; roundPts = {};
        api.players.forEach((p) => { ans[p.id] = clean([], cats.length); roundPts[p.id] = 0; });
        letter = letters[r] || J.pick(LETTERS.split(''));
        view.innerHTML = `<div class="kicker">Rodada ${r + 1} de ${ROUNDS}</div><div class="st-letter spin">?</div><div class="st-cats">${cats.map((c) => `<span>${esc(c)}</span>`).join('')}</div>`;
        const box = view.querySelector('.st-letter');
        api.players.forEach((p) => tell(p, { k: 'spin', n: r + 1, of: ROUNDS }));
        let n = 0;
        const id = api.every(90, () => { box.textContent = LETTERS[(n++ * 7) % LETTERS.length]; api.sfx('move'); if (n > 22) { api.cancel(id); box.classList.remove('spin'); box.classList.add('land'); box.textContent = letter; api.sfx('reveal'); api.after(900, fill); } });
      }

      function fill() {
        phase = 'fill';
        view.innerHTML = `<div class="kicker">Rodada ${r + 1} de ${ROUNDS} · tudo com a letra</div><div class="st-letter">${esc(letter)}</div><div class="st-cats">${cats.map((c) => `<span>${esc(c)}</span>`).join('')}</div><div class="st-prog"></div>`;
        progress();
        api.players.forEach((p) => tell(p, { k: 'fill', letter, cats, n: r + 1, of: ROUNDS, secs: SECS }));
        ck = J.clock(api, bar, SECS, () => lock(null));
      }
      function progress() {
        const box = view.querySelector('.st-prog');
        if (!box) return;
        box.innerHTML = '';
        api.players.forEach((p) => { const d = el('div', 'st-p'); d.appendChild(api.buddy(p, 3.6, filled(p) === cats.length ? 'happy' : 'wow')); d.appendChild(el('span', '', esc(p.name))); d.appendChild(el('i', '', `<b style="width:${(filled(p) / cats.length) * 100}%"></b>`)); box.appendChild(d); });
      }

      function lock(by) {
        if (phase !== 'fill') return;
        phase = 'lock'; if (ck) ck.stop();
        view.innerHTML = `<div class="st-stamp">STOP!</div><div class="question" style="font-size:2.4rem">${by ? esc(by.name) + ' travou a rodada' : 'O tempo acabou'}</div>`;
        api.sfx('bad'); api.fxAll('stamp', { text: 'STOP!', color: '#ff5d3d' });
        api.players.forEach((p) => tell(p, { k: 'lock', by: by ? by.name : '' }));
        api.after(1900, () => { ci = 0; review(); }); // time for every phone to send what was typed
      }

      function review() {
        phase = 'review'; vetoes = {}; oks = {};
        api.players.forEach((p) => { vetoes[p.id] = new Set(); });
        const items = api.players.map((p) => { const text = ans[p.id][ci]; return { id: p.id, name: p.name, text, auto: !text ? 'vazio' : startsOk(text) ? '' : 'letra errada' }; });
        view.innerHTML = `<div class="kicker">Letra ${esc(letter)} · categoria ${ci + 1} de ${cats.length}</div><div class="question">${esc(cats[ci])}</div><div class="st-rows"></div><div class="kicker" style="color:var(--muted)">No celular: marque as respostas que não valem</div>`;
        const rows = view.querySelector('.st-rows');
        items.forEach((it, i) => {
          const p = api.players[i], row = el('div', 'st-row' + (it.auto ? ' bad' : ''));
          row.dataset.id = p.id; row.style.animationDelay = i * 0.08 + 's';
          row.appendChild(api.buddy(p, 3.2, it.auto ? 'sad' : 'happy'));
          row.insertAdjacentHTML('beforeend', `<span class="nm">${esc(p.name)}</span><span class="ans">${esc(it.text || '—')}</span><span class="veto"></span><span class="tag">${it.auto ? esc(it.auto) : ''}</span>`);
          rows.appendChild(row);
        });
        api.sfx('select');
        const open = items.some((it) => !it.auto);
        api.players.forEach((p) => tell(p, { k: 'review', ci, cat: cats[ci], n: cats.length, letter, items, secs: open ? 14 : 4 }));
        ck = J.clock(api, bar, open ? 14 : 4, tally);
      }
      function drawVetoes() {
        api.players.forEach((p) => { const cell = view.querySelector(`.st-row[data-id="${p.id}"] .veto`); if (cell) cell.textContent = vetoes[p.id].size ? '✗'.repeat(vetoes[p.id].size) + ' não vale' : ''; });
      }

      function tally() {
        if (phase !== 'review') return;
        phase = 'tally'; if (ck) ck.stop();
        const judges = present().length;
        const valid = {};
        api.players.forEach((p) => { const text = ans[p.id][ci]; const others = Math.max(1, judges - (p.on ? 1 : 0)); valid[p.id] = !!text && startsOk(text) && vetoes[p.id].size * 2 <= others; });
        const count = {};
        api.players.forEach((p) => { if (valid[p.id]) { const k = norm(ans[p.id][ci]); count[k] = (count[k] || 0) + 1; } });
        const gain = {};
        api.players.forEach((p) => {
          const row = view.querySelector(`.st-row[data-id="${p.id}"]`), text = ans[p.id][ci];
          let pts = 0, cls = 'bad', tag = !text ? 'vazio' : !startsOk(text) ? 'letra errada' : 'não valeu';
          if (valid[p.id]) { const uniq = count[norm(text)] === 1; pts = uniq ? UNIQ : REP; cls = uniq ? 'uniq' : 'rep'; tag = '+' + pts; }
          gain[p.id] = pts; score[p.id] += pts; roundPts[p.id] += pts;
          if (row) { row.className = 'st-row ' + cls; row.querySelector('.tag').textContent = tag; row.querySelector('.veto').textContent = ''; }
          bar.score(p, J.fmtPts(score[p.id]));
        });
        api.sfx('good');
        api.players.forEach((p) => { tell(p, { k: 'tally', cat: cats[ci], text: ans[p.id][ci], pts: gain[p.id], total: score[p.id] }); if (gain[p.id] === UNIQ && UNIQ > REP) api.fx(p, 'good'); });
        api.after(2600, () => { ci++; if (ci < cats.length) review(); else roundEnd(); });
      }

      function roundEnd() {
        phase = 'sum';
        const rows = api.players.slice().sort((a, b) => score[b.id] - score[a.id]);
        view.innerHTML = `<div class="kicker">Fim da rodada ${r + 1}</div><div class="question" style="font-size:2.6rem">Placar</div><div class="st-rows"></div>`;
        const box = view.querySelector('.st-rows');
        rows.forEach((p, i) => { const row = el('div', 'st-row' + (i === 0 ? ' uniq' : '')); row.appendChild(api.buddy(p, 3.2)); row.insertAdjacentHTML('beforeend', `<span class="nm">${esc(p.name)}</span><span class="ans">${J.fmtPts(score[p.id])} pontos</span><span class="tag">+${roundPts[p.id]}</span>`); box.appendChild(row); });
        api.sfx('reveal');
        api.players.forEach((p) => tell(p, { k: 'sum', pts: roundPts[p.id], total: score[p.id], last: r + 1 >= ROUNDS }));
        api.after(4200, () => { if (r + 1 >= ROUNDS) api.end(api.players.map((p) => ({ id: p.id, pts: score[p.id] }))); else spin(); });
      }

      return {
        start() { spin(); },
        onMsg(p, m) {
          if ((m.k === 'ans' || m.k === 'stop' || m.k === 'final') && (phase === 'fill' || (phase === 'lock' && m.k === 'final'))) {
            ans[p.id] = clean(m.a, cats.length);
            if (phase === 'fill') { progress(); if (m.k === 'stop') { if (filled(p) === cats.length) lock(p); else api.send(p, { k: 'no' }); } }
          } else if (m.k === 'veto' && phase === 'review' && m.ci === ci) {
            const target = api.players.find((x) => x.id === m.id);
            if (!target || target === p || !ans[target.id][ci] || !startsOk(ans[target.id][ci])) return;
            if (m.on) vetoes[target.id].add(p.id); else vetoes[target.id].delete(p.id);
            drawVetoes(); api.sfx('pop');
          } else if (m.k === 'ok' && phase === 'review' && m.ci === ci) {
            oks[p.id] = true;
            if (present().every((x) => oks[x.id])) tally();
          }
        },
        sync(p) { const m = last[p.id]; if (!m) return; api.send(p, m.k === 'fill' ? { ...m, a: ans[p.id], secs: Math.ceil(ck ? ck.left() : 1) } : m); },
      };
    },

    /* ------------------------------------------------------------------ phone */
    pad(api) {
      const { root, me } = api, { esc } = J;
      root.innerHTML = `<style>
        .st-top{display:flex;align-items:center;gap:12px;flex:none}
        .st-l{width:64px;height:64px;border-radius:18px;background:linear-gradient(135deg,#ff5d3d,#ffd23f);color:#1a0d05;display:grid;place-items:center;font-size:42px;font-weight:900;flex:none}
        .st-top b{display:block;font-size:18px} .st-top small{color:var(--muted);font-weight:700}
        .st-list{flex:1;min-height:0;overflow-y:auto;display:grid;grid-template-columns:1fr;gap:8px;align-content:start}
        .st-f{display:block;background:var(--panel);border-radius:14px;padding:6px 12px 8px;border:2px solid transparent}
        .st-f span{display:block;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
        .st-f input{width:100%;background:none;border:0;outline:none;font-size:20px;font-weight:800;padding:2px 0;text-transform:uppercase}
        .st-f:focus-within{border-color:var(--accent)} .st-f.ok span{color:var(--accent)} .st-f.warn span{color:#ffd23f}
        .stopbtn{flex:none;background:#ff5d3d;color:#fff;border:0;font-size:24px;letter-spacing:.08em;box-shadow:0 8px 24px rgba(255,93,61,.35)}
        .st-it{display:flex;align-items:center;gap:10px;background:var(--panel);border-radius:14px;padding:8px 10px;border:2px solid transparent;width:100%;text-align:left}
        .st-it .t{flex:1;min-width:0} .st-it b{display:block;font-size:19px;text-transform:uppercase;overflow:hidden;text-overflow:ellipsis;white-space:nowrap} .st-it small{color:var(--muted);font-weight:700;font-size:12px}
        .st-it em{font-style:normal;font-weight:900;font-size:12px;border-radius:999px;padding:6px 10px;background:rgba(255,255,255,.08);white-space:nowrap}
        .st-it.no{border-color:#ff4d6d} .st-it.no b{text-decoration:line-through;opacity:.5} .st-it.no em{background:#ff4d6d;color:#fff}
        .st-it.auto{opacity:.5} .st-it.mine{background:rgba(61,245,167,.12)}
        @media (orientation:landscape) and (max-height:540px){.st-list{grid-template-columns:1fr 1fr}.st-l{width:46px;height:46px;font-size:30px;border-radius:13px}.stopbtn{min-height:46px}}
      </style>`;
      const h = J.padHud(api), box = h.box;
      h.pts('0');
      let a = [], cats = [], sendT = 0, locked = true;
      const flush = () => { clearTimeout(sendT); sendT = 0; if (!locked) api.send({ k: 'ans', a }); };

      function fillUi(m) {
        cats = m.cats; a = cats.map((_, i) => (m.a && m.a[i]) || ''); locked = false;
        h.time(m.secs);
        box.innerHTML = `<div class="st-top"><div class="st-l">${esc(m.letter)}</div><div><b>Rodada ${m.n} de ${m.of}</b><small>Tudo começa com ${esc(m.letter)}</small></div></div>
          <div class="st-list">${cats.map((c, i) => `<label class="st-f"><span>${esc(c)}</span><input data-i="${i}" maxlength="30" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" enterkeyhint="next" value="${esc(a[i])}"></label>`).join('')}</div>
          <button class="btn stopbtn" id="stop" disabled>STOP!</button>`;
        const inputs = [...box.querySelectorAll('input')], stop = box.querySelector('#stop'), L = J.norm(m.letter);
        const paint = () => { inputs.forEach((inp, i) => { const v = a[i].trim(), f = inp.parentNode; f.classList.toggle('ok', !!v && J.norm(v).charAt(0) === L); f.classList.toggle('warn', !!v && J.norm(v).charAt(0) !== L); }); stop.disabled = !a.every((v) => v.trim()); };
        inputs.forEach((inp, i) => {
          inp.oninput = () => { a[i] = inp.value; paint(); if (!sendT) sendT = setTimeout(flush, 700); };
          inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); const nx = inputs[i + 1]; if (nx) nx.focus(); else inp.blur(); } };
        });
        stop.onclick = () => { clearTimeout(sendT); sendT = 0; api.send({ k: 'stop', a }); api.vib(60); };
        paint();
      }

      function reviewUi(m) {
        h.time(m.secs);
        const mine = m.items.find((x) => x.id === me.id), others = m.items.filter((x) => x.id !== me.id);
        box.innerHTML = `<div class="st-top"><div class="st-l">${esc(m.letter)}</div><div><b>${esc(m.cat)}</b><small>Categoria ${m.ci + 1} de ${m.n} · toque no que não vale</small></div></div>
          <div class="st-list">${mine ? `<div class="st-it mine ${mine.auto ? 'auto' : ''}"><div class="t"><b>${esc(mine.text || '—')}</b><small>Sua resposta${mine.auto ? ' · ' + esc(mine.auto) : ''}</small></div></div>` : ''}
          ${others.map((x) => `<button class="st-it ${x.auto ? 'auto' : ''}" data-id="${x.id}" ${x.auto ? 'disabled' : ''}><span data-b="${x.id}"></span><div class="t"><b>${esc(x.text || '—')}</b><small>${esc(x.name)}${x.auto ? ' · ' + esc(x.auto) : ''}</small></div>${x.auto ? '' : '<em>Vale</em>'}</button>`).join('')}</div>
          <button class="btn primary" id="ok">Pronto</button>`;
        box.querySelectorAll('[data-b]').forEach((s) => s.replaceWith(api.buddy(h.by(s.dataset.b), 34)));
        box.querySelectorAll('button.st-it').forEach((b) => { b.onclick = () => { const on = !b.classList.contains('no'); b.classList.toggle('no', on); b.querySelector('em').textContent = on ? 'Não vale' : 'Vale'; api.send({ k: 'veto', ci: m.ci, id: b.dataset.id, on }); api.vib(15); }; });
        box.querySelector('#ok').onclick = (e) => { api.send({ k: 'ok', ci: m.ci }); e.target.disabled = true; e.target.textContent = 'Esperando os outros…'; };
      }

      return {
        start() { h.wait('Preparando a roleta…', ''); },
        stop() { clearTimeout(sendT); },
        onMsg(m) {
          if (m.k === 'spin') { locked = true; h.wait('Sorteando a letra…', `Rodada ${m.n} de ${m.of}. Olhe a TV!`, me, 'wow'); }
          else if (m.k === 'fill') { fillUi(m); api.vib([40, 40, 40]); }
          else if (m.k === 'no') { api.fx.stamp('Falta resposta', '#ffd23f'); }
          else if (m.k === 'lock') { if (!locked) { clearTimeout(sendT); sendT = 0; api.send({ k: 'final', a }); } locked = true; h.time(0); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); h.wait('STOP!', m.by ? m.by + ' travou a rodada' : 'O tempo acabou', me, 'wow'); }
          else if (m.k === 'review') reviewUi(m);
          else if (m.k === 'tally') { h.time(0); h.pts(J.fmtPts(m.total)); box.innerHTML = `<div class="centered"><div class="statusbig" style="color:${m.pts ? 'var(--accent)' : 'var(--muted)'}">${m.pts ? '+' + m.pts : '0'}</div><div class="big" style="text-transform:uppercase">${esc(m.text || '—')}</div><p class="muted">${esc(m.cat)}</p></div>`; }
          else if (m.k === 'sum') { h.pts(J.fmtPts(m.total)); h.wait('+' + m.pts + ' nesta rodada', m.last ? 'Fim de jogo! Veja o placar na TV' : 'A próxima letra já vem', me, 'happy'); }
        },
      };
    },
  });
})();
