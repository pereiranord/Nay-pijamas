/* Desenho Relâmpago — everybody gets the same theme and draws at the same time on the phone. While they draw the TV
   shows the works blurred (alive, but secret); then it becomes a gallery with numbers and no names, and each player
   votes for a favourite that isn't their own. The names appear only after the votes. Board: gamer/sketch.js. */
'use strict';
(() => {
  J.define('desenho', {
    name: 'Desenho Relâmpago', kind: 'desenho', min: 3, max: 6, unit: 'pontos',
    tagline: 'Todos desenham o mesmo tema. A galeria decide.',
    grad: 'linear-gradient(135deg,#ffc857,#ff7a9a)',
    icon: '<rect x="3.5" y="4" width="17" height="13" rx="2"/><path d="M7 13l3-3 2.5 2.5L15 10l2.5 3M9 20h6"/>',
    how: [['Tema', 'O mesmo desafio para todos, na TV e no celular.'], ['Desenhe', 'Cores, pincel e borracha. Ninguém vê o desenho dos outros.'], ['Galeria', 'Voto secreto no favorito. Não vale votar no próprio.']],
    padHow: 'Todos desenham o mesmo tema ao mesmo tempo. Depois, vote no seu desenho favorito (menos no seu).',
    settings: [
      { id: 'secs', label: 'Tempo para desenhar', options: [[45, '45 s'], [60, '60 s'], [90, '90 s'], [120, '2 min']] },
      { id: 'rounds', label: 'Temas', options: [[2, '2'], [3, '3'], [5, '5']] },
    ],
    presets: { rapido: { secs: 45, rounds: 2 }, normal: { secs: 60, rounds: 3 }, longo: { secs: 90, rounds: 5 } },

    /* ------------------------------------------------------------------ TV */
    tv(api) {
      const { esc, shuffle, el } = J;
      const bar = api.topbar(true);
      const view = el('div', 'center dr'); api.stage.appendChild(view);
      view.insertAdjacentHTML('beforebegin', `<style>
        .dr{gap:1rem;padding-top:5.4rem;padding-bottom:1.2rem;justify-content:flex-start}
        .dr-theme{font-size:2.6rem;font-weight:900;text-align:center;line-height:1.1;max-width:80rem}
        .dr-theme.huge{font-size:4.6rem;margin-top:10rem;animation:pop .5s both}
        .dr-grid{flex:1;min-height:0;display:flex;flex-wrap:wrap;gap:1.1rem 1.4rem;justify-content:center;align-content:center}
        .dr-tile{position:relative;background:#fff;border-radius:1.2rem;padding:.5rem .5rem .4rem;color:#120f26;text-align:center;font-weight:900;font-size:1.15rem;animation:pop .45s both;box-shadow:0 1rem 2.4rem rgba(0,0,0,.45)}
        .dr-tile canvas,.dr-tile img{display:block;width:var(--s);height:var(--s);border-radius:.8rem;background:#fff}
        .dr-tile.secret>canvas{filter:blur(1.1rem) saturate(1.3);opacity:.85}
        .dr-tile .cap{display:flex;align-items:center;justify-content:center;gap:.4rem;min-height:2rem;margin-top:.3rem}
        .dr-tile .cap .buddy{flex:none}
        .dr-tile .num{position:absolute;left:-.7rem;top:-.7rem;width:3rem;height:3rem;border-radius:50%;background:var(--accent);color:#120f26;display:grid;place-items:center;font-size:1.7rem;box-shadow:0 .3rem .8rem rgba(0,0,0,.4)}
        .dr-tile .hearts{position:absolute;right:-.6rem;top:-.7rem;background:#ff4d6d;color:#fff;border-radius:999px;padding:.3rem .8rem;font-size:1.3rem;animation:pop .4s both}
        .dr-tile.win{box-shadow:0 0 0 .45rem var(--accent),0 1rem 3rem rgba(255,200,87,.5);transform:scale(1.05)}
        .dr-tile.done .cap::after{content:'✓';color:#1fa56d;margin-left:.2rem}
      </style>`);
      const SECS = api.settings.secs || 60, ROUNDS = api.settings.rounds || 3;
      const themes = J.fresh('desenho', WORDS.THEMES, ROUNDS);
      const score = {}, wins = {}, last = {};
      api.players.forEach((p) => { score[p.id] = 0; wins[p.id] = 0; bar.score(p, '0'); });
      let r = -1, phase = '', boards = {}, done = {}, entries = [], votes = {}, ck = null, theme = '';
      const tell = (p, m) => { last[p.id] = m; api.send(p, m); };
      const present = () => api.players.filter((p) => p.on);
      const size = (n) => (n <= 3 ? 21 : n <= 4 ? 17 : 15);

      function show() {
        r++; phase = 'show'; theme = themes[r] || J.pick(WORDS.THEMES); boards = {}; done = {}; votes = {};
        view.innerHTML = `<div class="kicker">Tema ${r + 1} de ${ROUNDS}</div><div class="dr-theme huge">${esc(theme)}</div>`;
        api.sfx('reveal');
        api.players.forEach((p) => tell(p, { k: 'theme', theme, n: r + 1, of: ROUNDS }));
        api.after(3600, draw);
      }

      function draw() {
        phase = 'draw';
        view.innerHTML = `<div class="kicker">Tema ${r + 1} de ${ROUNDS} · todos desenhando</div><div class="dr-theme">${esc(theme)}</div><div class="dr-grid" style="--s:${size(api.players.length) - 2}rem"></div>`;
        const grid = view.querySelector('.dr-grid');
        api.players.forEach((p, i) => {
          const t = el('div', 'dr-tile secret'); t.dataset.id = p.id; t.style.animationDelay = i * 0.08 + 's';
          const cv = el('canvas'); cv.width = cv.height = 360; t.appendChild(cv);
          const cap = el('div', 'cap'); cap.appendChild(api.buddy(p, 2)); cap.appendChild(el('span', '', esc(p.name))); t.appendChild(cap);
          grid.appendChild(t);
          boards[p.id] = Sketch.board(cv);
        });
        api.players.forEach((p) => tell(p, { k: 'draw', theme, secs: SECS }));
        api.sfx('go');
        ck = J.clock(api, bar, SECS, gallery);
      }

      function gallery() {
        if (phase !== 'draw') return;
        phase = 'vote'; if (ck) ck.stop();
        entries = shuffle(api.players.filter((p) => boards[p.id] && !boards[p.id].empty())).map((p, i) => ({ p, n: i + 1, img: boards[p.id].image(420, 'image/jpeg', 0.8), votes: [] }));
        if (entries.length < 2) { // nothing to choose from: no points, next theme
          view.innerHTML = `<div class="kicker">Tema ${r + 1} de ${ROUNDS}</div><div class="dr-theme huge">Quase ninguém desenhou…</div>`;
          api.players.forEach((p) => tell(p, { k: 'res', votes: 0, pts: 0, total: score[p.id], none: true }));
          api.after(3000, next); return;
        }
        view.innerHTML = `<div class="kicker">Galeria · vote no celular</div><div class="dr-theme">${esc(theme)}</div><div class="dr-grid" style="--s:${size(entries.length)}rem">${entries.map((e, i) => `<div class="dr-tile" data-n="${e.n}" style="animation-delay:${i * 0.18}s"><span class="num">${e.n}</span><img alt="" src="${e.img}"><div class="cap">Desenho ${e.n}</div></div>`).join('')}</div>`;
        api.sfx('reveal');
        const thumbs = entries.map((e) => ({ n: e.n, img: boards[e.p.id].image(200, 'image/jpeg', 0.7) }));
        api.players.forEach((p) => tell(p, { k: 'vote', theme, secs: 25, items: thumbs.filter((t) => entries[t.n - 1].p !== p) }));
        ck = J.clock(api, bar, 25, reveal);
      }

      function reveal() {
        if (phase !== 'vote') return;
        phase = 'reveal'; if (ck) ck.stop();
        api.players.forEach((p) => { const e = entries[votes[p.id] - 1]; if (e) e.votes.push(p); });
        const top = Math.max(...entries.map((e) => e.votes.length));
        view.querySelector('.kicker').textContent = top ? 'E os votos foram para…' : 'Ninguém votou';
        entries.forEach((e) => {
          const t = view.querySelector(`.dr-tile[data-n="${e.n}"]`), cap = t.querySelector('.cap');
          cap.innerHTML = ''; cap.appendChild(api.buddy(e.p, 2)); cap.appendChild(el('span', '', esc(e.p.name)));
          const win = top > 0 && e.votes.length === top;
          const pts = e.votes.length * 100 + (win ? 100 : 0);
          if (e.votes.length) t.appendChild(el('span', 'hearts', '♥ ' + e.votes.length));
          if (win) { t.classList.add('win'); wins[e.p.id]++; api.fx(e.p, 'good'); }
          score[e.p.id] += pts; bar.score(e.p, J.fmtPts(score[e.p.id]));
          e.pts = pts; e.win = win;
        });
        api.sfx(top ? 'good' : 'pop');
        api.players.forEach((p) => { const e = entries.find((x) => x.p === p); tell(p, { k: 'res', votes: e ? e.votes.length : 0, pts: e ? e.pts : 0, total: score[p.id], won: !!(e && e.win), drew: !!e }); });
        api.after(6500, next);
      }
      function next() { if (r + 1 >= ROUNDS) api.end(api.players.map((p) => ({ id: p.id, pts: score[p.id], note: wins[p.id] ? wins[p.id] + (wins[p.id] === 1 ? ' galeria vencida' : ' galerias vencidas') : '' }))); else show(); }

      return {
        start() { show(); },
        onMsg(p, m) {
          if (phase === 'draw') {
            if (boards[p.id] && boards[p.id].apply(m)) return;
            if (m.k === 'done') { done[p.id] = true; const t = view.querySelector(`.dr-tile[data-id="${p.id}"]`); if (t) t.classList.add('done'); api.sfx('pop'); if (present().every((x) => done[x.id])) gallery(); }
          } else if (phase === 'vote' && m.k === 'v') {
            const e = entries[(m.n | 0) - 1];
            if (!e || e.p === p || votes[p.id]) return;
            votes[p.id] = e.n; api.sfx('pop'); api.send(p, { k: 'voted', n: e.n });
            if (present().every((x) => votes[x.id] || entries.every((en) => en.p === x))) reveal();
          }
        },
        sync(p) {
          const m = last[p.id]; if (!m) return;
          if (phase === 'draw' && m.k === 'draw') { if (boards[p.id]) boards[p.id].clear(); done[p.id] = false; api.send(p, { ...m, secs: Math.ceil(ck.left()) }); } // the phone starts a clean sheet: so does the TV
          else api.send(p, m);
        },
      };
    },

    /* ------------------------------------------------------------------ phone */
    pad(api) {
      const { root, me } = api, { esc } = J;
      root.innerHTML = `<style>
        .dr-head{display:flex;align-items:center;gap:8px} .dr-head .word{flex:1;min-width:0;text-transform:none;font-size:16px}
        .dr-opts{flex:1;min-height:0;overflow-y:auto;display:grid;grid-template-columns:1fr 1fr;gap:10px;align-content:start}
        .dr-opt{position:relative;background:#fff;border-radius:16px;padding:5px;border:4px solid transparent}
        .dr-opt img{display:block;width:100%;aspect-ratio:1;border-radius:11px}
        .dr-opt i{position:absolute;left:8px;top:8px;width:30px;height:30px;border-radius:50%;background:var(--accent);color:var(--ink);display:grid;place-items:center;font-style:normal;font-weight:900}
        .dr-opt.sel{border-color:var(--accent)} .dr-opts.voted .dr-opt:not(.sel){opacity:.4}
        @media (orientation:landscape) and (max-height:540px){.dr-opts{grid-template-columns:repeat(4,1fr)}}
      </style>`;
      const h = J.padHud(api), box = h.box;
      h.pts('0');
      return {
        start() { h.wait('Apontando os lápis…', ''); },
        onMsg(m) {
          if (m.k === 'theme') h.wait(m.theme, `Tema ${m.n} de ${m.of}. Já vai começar!`, me, 'wow');
          else if (m.k === 'draw') {
            h.time(m.secs);
            const sk = Sketch.pad(api, box, { head: `<div class="dr-head"><div class="word"><small>Tema</small>${esc(m.theme)}</div><button class="btn small primary" id="done">Pronto</button></div>` });
            box.querySelector('#done').onclick = (e) => { sk.flush(); api.send({ k: 'done' }); e.target.disabled = true; e.target.textContent = 'Enviado'; api.vib(30); };
            api.vib(40);
          } else if (m.k === 'vote') {
            h.time(m.secs);
            box.innerHTML = `<div class="sect" style="margin:0">Vote no seu favorito · ${esc(m.theme)}</div><div class="dr-opts">${m.items.map((x) => `<button class="dr-opt" data-n="${x.n}"><img alt="Desenho ${x.n}" src="${x.img}"><i>${x.n}</i></button>`).join('')}</div>`;
            box.querySelectorAll('.dr-opt').forEach((b) => { b.onclick = () => { if (box.querySelector('.voted')) return; api.send({ k: 'v', n: +b.dataset.n }); b.classList.add('sel'); box.querySelector('.dr-opts').classList.add('voted'); api.vib(30); }; });
            if (!m.items.length) h.wait('Só o seu desenho na galeria', 'Aguarde os votos');
          } else if (m.k === 'voted') { const o = box.querySelector('.dr-opts'); if (o) { o.classList.add('voted'); const b = o.querySelector(`[data-n="${m.n}"]`); if (b) b.classList.add('sel'); } }
          else if (m.k === 'res') { h.time(0); h.pts(J.fmtPts(m.total)); h.wait(m.none ? 'Sem galeria desta vez' : m.won ? 'Seu desenho venceu!' : m.drew ? (m.votes ? m.votes + (m.votes === 1 ? ' voto' : ' votos') + ' no seu desenho' : 'Nenhum voto desta vez') : 'Você não desenhou', m.pts ? '+' + m.pts + ' pontos' : 'Veja os autores na TV', me, m.won || m.votes ? 'happy' : 'sad'); }
        },
      };
    },
  });
})();
