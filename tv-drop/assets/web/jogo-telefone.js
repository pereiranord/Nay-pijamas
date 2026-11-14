/* Telefone Maluco — everyone writes a sentence; the next player draws it without seeing anything else; the next one
   describes that drawing; and so on. In the end the TV shows each chain from start to finish, and the players
   vote for the best part of each one. Board: gamer/sketch.js (the same as Rabisco). */
'use strict';
(() => {
  const WRITE = 45;
  const STARTERS = ['um pinguim vendendo picolé na praia', 'a vovó ganhando uma corrida de moto', 'um cachorro dando aula de matemática', 'o sofá fugindo de casa', 'um astronauta com medo de altura', 'uma pizza pedindo socorro', 'o gato que virou prefeito', 'um dinossauro no dentista'];
  const clean = (t) => String(t || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);

  J.define('telefone', {
    name: 'Telefone Maluco', kind: 'desenho', min: 3, max: 6, unit: 'pontos',
    tagline: 'Frase vira desenho, desenho vira frase.',
    grad: 'linear-gradient(135deg,#a8e6cf,#ffaaa5)',
    icon: '<path d="M4 6h9v7H8l-4 3z"/><path d="M13 10h7v7h-3l-3 2.5V17"/>',
    how: [['Escreva', 'Uma frase qualquer. Quanto mais estranha, melhor.'], ['Desenhe', 'Você recebe a frase de outra pessoa e desenha. Depois, descreve um desenho.'], ['Revele', 'A TV mostra cada corrente inteira, do começo ao fim.']],
    padHow: 'Escreva uma frase. Depois você vai desenhar a frase de outra pessoa e descrever o desenho de outra. No fim, a TV mostra a confusão.',
    settings: [
      { id: 'draw', label: 'Tempo para desenhar', options: [[45, '45 s'], [60, '60 s'], [90, '90 s']] },
      { id: 'steps', label: 'Tamanho da corrente', options: [[3, 'Curta · 3 passos'], [4, 'Média · 4 passos'], [6, 'Completa · todos']] },
    ],
    presets: { rapido: { draw: 45, steps: 3 }, normal: { draw: 60, steps: 4 }, longo: { draw: 90, steps: 6 } },

    /* ------------------------------------------------------------------ TV */
    tv(api) {
      const { esc, el, shuffle } = J;
      const bar = api.topbar(true);
      const view = el('div', 'center tf'); api.stage.appendChild(view);
      view.insertAdjacentHTML('beforebegin', `<style>
        .tf{gap:1rem;padding-top:5.4rem;padding-bottom:1.2rem}
        .tf-chain{display:flex;flex-wrap:wrap;gap:.9rem 1.6rem;justify-content:center;align-items:stretch;max-width:92rem}
        .tf-card{position:relative;width:var(--s);background:#fff;color:#16132b;border-radius:1.2rem;padding:.6rem;display:flex;flex-direction:column;gap:.4rem;animation:pop .45s both;box-shadow:0 1rem 2.4rem rgba(0,0,0,.45)}
        .tf-card img{display:block;width:100%;aspect-ratio:1;border-radius:.8rem}
        .tf-card .txt{flex:1;display:grid;place-items:center;text-align:center;font-weight:900;font-size:1.5rem;line-height:1.15;padding:.6rem;min-height:calc(var(--s) - 4rem);background:#fff6d6;border-radius:.8rem;word-break:break-word}
        .tf-card .by{display:flex;align-items:center;justify-content:center;gap:.4rem;font-weight:800;font-size:1rem} .tf-card .by .buddy{flex:none}
        .tf-card .n{position:absolute;left:-.7rem;top:-.7rem;width:2.6rem;height:2.6rem;border-radius:50%;background:var(--accent);color:#120f26;display:grid;place-items:center;font-weight:900;font-size:1.4rem}
        .tf-card:not(:last-child)::after{content:'→';position:absolute;right:-1.45rem;top:42%;color:var(--muted);font-size:1.6rem;font-weight:900}
        .tf-card .hearts{position:absolute;right:-.6rem;top:-.7rem;background:#ff4d6d;color:#fff;border-radius:999px;padding:.25rem .7rem;font-size:1.2rem;font-weight:900;animation:pop .4s both}
        .tf-card.win{box-shadow:0 0 0 .4rem var(--accent),0 1rem 3rem rgba(255,200,87,.5)}
      </style>`);
      const DRAW = api.settings.draw || 60;
      const P = shuffle(api.players), N = P.length, L = Math.max(2, Math.min(N, api.settings.steps || 4));
      const chains = P.map(() => []), score = {}, loves = {}, last = {};
      api.players.forEach((p) => { score[p.id] = 0; loves[p.id] = 0; bar.score(p, '0'); });
      let step = -1, phase = '', done = {}, texts = {}, boards = {}, ck = null, rc = -1, votes = {};
      const tell = (p, m) => { last[p.id] = m; api.send(p, m); };
      const present = () => api.players.filter((p) => p.on);
      const chainOf = (j) => (j - step + N * 8) % N; // which chain player j works on in this step
      const kind = () => (step === 0 ? 'write' : step % 2 ? 'draw' : 'desc');

      function next() {
        step++;
        if (step >= L) { rc = -1; reveal(); return; }
        phase = 'work'; done = {}; texts = {}; boards = {};
        const k = kind(), secs = k === 'draw' ? DRAW : WRITE;
        const what = k === 'write' ? 'Escreva uma frase no celular' : k === 'draw' ? 'Desenhe a frase que chegou no seu celular' : 'Descreva o desenho que chegou no seu celular';
        view.innerHTML = `<div class="kicker">Passo ${step + 1} de ${L}</div><div class="question">${what}</div><div class="kicker" style="color:var(--muted)">${k === 'write' ? 'Ninguém mais vai ver… por enquanto' : 'Você só vê o que a pessoa anterior fez'}</div><div class="waiters"></div>`;
        J.waiters(api, view.querySelector('.waiters'), done);
        api.sfx('reveal');
        P.forEach((p, j) => {
          const prev = chains[chainOf(j)][step - 1];
          if (k === 'draw') boards[p.id] = Sketch.board(null);
          tell(p, k === 'write' ? { k: 'write', secs, n: step + 1, of: L } : k === 'draw' ? { k: 'draw', secs, text: prev.text, n: step + 1, of: L } : { k: 'desc', secs, img: prev.board.image(420, 'image/jpeg', 0.75), n: step + 1, of: L });
        });
        ck = J.clock(api, bar, secs, collect);
      }

      function collect() {
        if (phase !== 'work') return;
        phase = 'between'; if (ck) ck.stop();
        const k = kind();
        P.forEach((p, j) => {
          const c = chains[chainOf(j)];
          if (k === 'draw') c.push({ type: 'draw', by: p, board: boards[p.id] });
          else c.push({ type: 'text', by: p, text: texts[p.id] || (k === 'write' ? J.pick(STARTERS) : 'não faço ideia do que é isso') });
        });
        api.players.forEach((p) => tell(p, { k: 'wait', text: 'Passando para o próximo…' }));
        api.after(900, next);
      }

      function reveal() {
        rc++;
        if (rc >= N) { api.end(api.players.map((p) => ({ id: p.id, pts: score[p.id], note: loves[p.id] ? loves[p.id] + (loves[p.id] === 1 ? ' voto' : ' votos') : '' }))); return; }
        phase = 'reveal'; votes = {};
        const c = chains[rc];
        view.innerHTML = `<div class="kicker">Corrente ${rc + 1} de ${N}</div><div class="question" style="font-size:2.4rem">Começou com ${esc(c[0].by.name)}…</div><div class="tf-chain" style="--s:${L <= 3 ? 20 : L <= 4 ? 17 : 13.5}rem"></div>`;
        const box = view.querySelector('.tf-chain');
        api.players.forEach((p) => tell(p, { k: 'wait', text: 'Olhe a TV!', sub: 'A corrente de ' + c[0].by.name }));
        let i = 0;
        const show = () => {
          const e = c[i], card = el('div', 'tf-card'); card.dataset.i = i;
          card.innerHTML = `<span class="n">${i + 1}</span>${e.type === 'draw' ? `<img alt="" src="${e.board.image(420, 'image/jpeg', 0.8)}">` : `<div class="txt">${esc(e.text)}</div>`}<div class="by"></div>`;
          const by = card.querySelector('.by'); by.appendChild(api.buddy(e.by, 1.9)); by.appendChild(el('span', '', esc(e.by.name)));
          box.appendChild(card); api.sfx(e.type === 'draw' ? 'pop' : 'select');
          i++;
          if (i < c.length) api.after(3000, show); else api.after(2200, vote);
        };
        api.after(900, show);
      }

      function vote() {
        phase = 'vote';
        const c = chains[rc];
        view.querySelector('.question').textContent = 'Qual foi a melhor parte? Vote no celular';
        api.players.forEach((p) => tell(p, { k: 'vote', secs: 12, items: c.map((e, i) => ({ i, label: (e.type === 'draw' ? 'Desenho de ' : 'Frase de ') + e.by.name, mine: e.by === p })) }));
        ck = J.clock(api, bar, 12, tally);
      }
      function tally() {
        if (phase !== 'vote') return;
        phase = 'tally'; if (ck) ck.stop();
        const c = chains[rc], count = c.map(() => 0);
        Object.keys(votes).forEach((id) => { count[votes[id]]++; });
        const top = Math.max(...count);
        c.forEach((e, i) => {
          if (!count[i]) return;
          const card = view.querySelector(`.tf-card[data-i="${i}"]`);
          card.appendChild(el('span', 'hearts', '♥ ' + count[i]));
          if (count[i] === top) card.classList.add('win');
          score[e.by.id] += count[i] * 100; loves[e.by.id] += count[i]; bar.score(e.by, J.fmtPts(score[e.by.id])); api.fx(e.by, 'good');
        });
        view.querySelector('.question').textContent = top ? 'A favorita da sala!' : 'Ninguém votou nessa';
        api.sfx(top ? 'good' : 'pop');
        api.players.forEach((p) => tell(p, { k: 'wait', text: J.fmtPts(score[p.id]) + ' pontos', sub: 'Vem aí a próxima corrente', total: score[p.id] }));
        api.after(3600, reveal);
      }

      return {
        start() { next(); },
        onMsg(p, m) {
          if (phase === 'work') {
            const k = kind();
            if (k === 'draw' && boards[p.id] && boards[p.id].apply(m)) return;
            if (k !== 'draw' && m.k === 'text') { const t = clean(m.text); if (!t) return; texts[p.id] = t; done[p.id] = true; }
            else if (k === 'draw' && m.k === 'done') done[p.id] = true;
            else return;
            J.waiters(api, view.querySelector('.waiters'), done); api.sfx('pop');
            if (present().every((x) => done[x.id])) collect();
          } else if (phase === 'vote' && m.k === 'v') {
            const i = m.i | 0, e = chains[rc][i];
            if (!e || e.by === p || votes[p.id] != null) return;
            votes[p.id] = i; api.sfx('pop');
            if (present().every((x) => votes[x.id] != null)) tally();
          }
        },
        sync(p) {
          const m = last[p.id]; if (!m) return;
          if (phase === 'work' && m.k === 'draw') { boards[p.id] = Sketch.board(null); done[p.id] = false; } // the phone starts a clean sheet: so does the TV
          api.send(p, phase === 'work' && ck ? { ...m, secs: Math.ceil(ck.left()) } : m);
        },
      };
    },

    /* ------------------------------------------------------------------ phone */
    pad(api) {
      const { root, me } = api, { esc } = J;
      root.innerHTML = `<style>
        .tp-area{width:100%;flex:1;min-height:90px;max-height:200px;border-radius:18px;background:rgba(0,0,0,.35);border:2px solid var(--line);padding:14px;font:800 22px/1.25 Archivo,sans-serif;color:var(--text);outline:none;resize:none}
        .tp-area:focus{border-color:var(--accent)}
        .tp-img{flex:1;min-height:0;display:grid;place-items:center} .tp-img img{max-width:100%;max-height:100%;aspect-ratio:1;border-radius:16px;background:#fff;box-shadow:0 0 0 3px rgba(255,255,255,.14)}
        .tp-head{display:flex;align-items:center;gap:8px} .tp-head .word{flex:1;min-width:0;text-transform:none;font-size:16px}
        .tp-opts{display:flex;flex-direction:column;gap:8px;width:100%} .tp-opts .btn{justify-content:flex-start;min-height:52px;font-size:16px}
        .tp-opts .btn.sel{border-color:var(--accent);background:rgba(61,245,167,.15)}
        @media (orientation:landscape) and (max-height:540px){.tp-desc{flex-direction:row!important}.tp-desc>*{flex:1}.tp-opts{display:grid;grid-template-columns:1fr 1fr}}
      </style>`;
      const h = J.padHud(api), box = h.box;
      h.pts('0');

      function textUi(m, title, place, img) {
        h.time(m.secs);
        box.innerHTML = `<div class="sect" style="margin:0">Passo ${m.n} de ${m.of} · ${esc(title)}</div><div class="tp-desc" style="flex:1;display:flex;flex-direction:column;gap:10px;min-height:0">${img ? `<div class="tp-img"><img alt="Desenho" src="${img}"></div>` : ''}
          <div style="display:flex;flex-direction:column;gap:10px;${img ? '' : 'flex:1'}"><textarea class="tp-area" id="t" maxlength="80" placeholder="${esc(place)}" autocomplete="off" autocapitalize="sentences"></textarea><button class="btn primary" id="send">Enviar</button></div></div>`;
        const t = box.querySelector('#t'), b = box.querySelector('#send');
        b.onclick = () => { const v = t.value.trim(); if (!v) { t.focus(); return; } api.send({ k: 'text', text: v }); b.textContent = 'Enviado · toque para mudar'; api.vib(30); t.blur(); };
        t.oninput = () => { b.textContent = 'Enviar'; };
      }

      return {
        start() { h.wait('Ligando o telefone…', ''); },
        onMsg(m) {
          if (m.k === 'write') { textUi(m, 'escreva uma frase', 'Ex.: um pinguim vendendo picolé na praia'); api.vib(40); }
          else if (m.k === 'desc') { textUi(m, 'o que é este desenho?', 'Descreva o que você vê', m.img); api.vib(40); }
          else if (m.k === 'draw') {
            h.time(m.secs);
            const sk = Sketch.pad(api, box, { head: `<div class="tp-head"><div class="word"><small>Passo ${m.n} de ${m.of} · desenhe</small>${esc(m.text)}</div><button class="btn small primary" id="done">Pronto</button></div>` });
            box.querySelector('#done').onclick = (e) => { sk.flush(); api.send({ k: 'done' }); e.target.disabled = true; e.target.textContent = 'Enviado'; api.vib(30); };
            api.vib(40);
          } else if (m.k === 'vote') {
            h.time(m.secs);
            box.innerHTML = `<div class="centered"><div class="big">Melhor parte?</div><div class="tp-opts">${m.items.map((x) => `<button class="btn" data-i="${x.i}" ${x.mine ? 'disabled' : ''}>${x.i + 1} · ${esc(x.label)}${x.mine ? ' (seu)' : ''}</button>`).join('')}</div></div>`;
            box.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => { if (box.querySelector('.sel')) return; b.classList.add('sel'); api.send({ k: 'v', i: +b.dataset.i }); api.vib(30); }; });
          } else if (m.k === 'wait') { if (m.total != null) h.pts(J.fmtPts(m.total)); h.wait(m.text, m.sub || '', me, 'wow'); }
        },
      };
    },
  });
})();
