/* Mímica — the phone of whoever's turn it is shows a secret word; that person acts it out without talking and the
   room guesses out loud. The actor taps "Acertou" (and says who got it) or "Pular". The TV keeps the clock, the
   category as a hint and the history of each turn. Words: gamer/words.js, never the ones of the last matches. */
'use strict';
(() => {
  const CATS = ['filmes', 'animais', 'profissoes', 'objetos', 'celebridades', 'esportes', 'personagens', 'acoes', 'expressoes', 'desenhos', 'situacoes'];
  const SKIPS = 3;

  J.define('mimica', {
    name: 'Mímica', kind: 'grupo', min: 2, max: 6, unit: 'pontos',
    tagline: 'Faça sem falar. A sala adivinha.',
    grad: 'linear-gradient(135deg,#ff4fd8,#7c5cff)',
    icon: '<circle cx="12" cy="5" r="2.2"/><path d="M12 7.5v6M12 13.5l-3.5 6M12 13.5l3.5 6M5 8l7 2.5L19 6"/>',
    how: [['Segredo', 'A palavra aparece só no celular de quem está na vez.'], ['Represente', 'Sem falar e sem apontar objetos. A sala adivinha em voz alta.'], ['Acertou?', 'Toque em Acertou e diga quem foi. A próxima palavra aparece.']],
    padHow: 'Na sua vez, o celular mostra a palavra secreta: faça a mímica sem falar. Nas outras vezes, adivinhe em voz alta.',
    settings: [
      { id: 'secs', label: 'Tempo de cada vez', options: [[45, '45 s'], [60, '60 s'], [90, '90 s'], [120, '2 min']] },
      { id: 'rounds', label: 'Vezes de cada um', options: [[1, '1 vez'], [2, '2 vezes'], [3, '3 vezes']] },
      { id: 'level', label: 'Dificuldade', options: [['facil', 'Fácil'], ['medio', 'Misturado'], ['dificil', 'Difícil']] },
      { id: 'cats', label: 'Categorias', multi: true, allLabel: 'Tudo misturado', options: WORDS.options(CATS) },
    ],
    presets: { rapido: { secs: 45, rounds: 1, level: 'facil' }, normal: { secs: 60, rounds: 2, level: 'medio' }, longo: { secs: 90, rounds: 3, level: 'medio' } },

    /* ------------------------------------------------------------------ TV */
    tv(api) {
      const { esc, shuffle, el } = J;
      const bar = api.topbar(true);
      const view = el('div', 'center mm'); api.stage.appendChild(view);
      view.insertAdjacentHTML('beforebegin', `<style>
        .mm{gap:1.1rem}
        .mm-actor{display:flex;align-items:center;gap:1.6rem}
        .mm-actor .buddy{animation:mmbob 1.2s ease-in-out infinite} @keyframes mmbob{50%{transform:translateY(-.8rem) rotate(4deg)}}
        .mm-actor h1{font-size:3.6rem;line-height:1.05} .mm-actor p{font-size:1.5rem;color:var(--muted);font-weight:700}
        .mm-cat{font:800 1.15rem/1 var(--font-mono,monospace);letter-spacing:.14em;text-transform:uppercase;color:#120f26;background:#ff4fd8;border-radius:999px;padding:.6rem 1.3rem}
        .mm-count{font-size:6rem;font-weight:900;line-height:1} .mm-count small{font-size:1.4rem;color:var(--muted);font-weight:800;margin-left:.6rem}
        .mm-feed{display:flex;flex-wrap:wrap;gap:.6rem;justify-content:center;max-width:70rem}
        .mm-w{display:flex;align-items:center;gap:.5rem;background:var(--panel);border-radius:999px;padding:.4rem 1.1rem .4rem .5rem;font-size:1.25rem;font-weight:800;animation:pop .35s both;text-transform:uppercase}
        .mm-w.ok{background:rgba(61,245,167,.18)} .mm-w.no{opacity:.55;padding-left:1.1rem} .mm-w.no span{text-decoration:line-through}
        .mm-w .buddy{flex:none} .mm-w em{font-style:normal;color:var(--muted);font-size:1rem;text-transform:none}
      </style>`);
      const SECS = api.settings.secs || 60, ROUNDS = api.settings.rounds || 1;
      const cats = (api.settings.cats && api.settings.cats.length ? api.settings.cats : CATS).filter((c) => WORDS.CATS[c]);
      const tagged = WORDS.tagged(cats, api.settings.level || 'medio'), catOf = new Map(tagged), words = tagged.map((x) => x[0]);
      let order = []; for (let i = 0; i < ROUNDS; i++) order = order.concat(shuffle(api.players));
      const score = {}, hits = {}, last = {};
      api.players.forEach((p) => { score[p.id] = 0; hits[p.id] = 0; bar.score(p, '0'); });
      let turn = -1, actor = null, phase = '', queue = [], word = '', hist = [], skips = 0, ck = null, readyT = 0;
      const tell = (p, m) => { last[p.id] = m; api.send(p, m); };
      const others = () => api.players.filter((p) => p !== actor && p.on);
      const actorMsg = () => ({ k: 'act', word, cat: catOf.get(word) || '', secs: Math.ceil(ck ? ck.left() : SECS), skips, n: hist.filter((x) => x.ok).length, who: others().map((p) => p.id) });

      function nextTurn() {
        turn++;
        if (turn >= order.length) { api.end(api.players.map((p) => ({ id: p.id, pts: score[p.id], note: hits[p.id] + (hits[p.id] === 1 ? ' mímica acertada' : ' mímicas acertadas') }))); return; }
        actor = order[turn];
        if (!actor.on) { nextTurn(); return; }
        phase = 'ready'; hist = []; skips = SKIPS; queue = J.fresh('mimica', words, 16);
        view.innerHTML = `<div class="kicker">Vez ${turn + 1} de ${order.length}</div><div class="mm-actor"><span id="mb"></span><div><h1>${esc(actor.name)}, é com você!</h1><p>Fique de pé na frente da TV e toque em Começar no celular</p></div></div>`;
        view.querySelector('#mb').replaceWith(api.buddy(actor, 11, 'wow'));
        api.sfx('select');
        api.players.forEach((p) => tell(p, p === actor ? { k: 'ready', secs: SECS } : { k: 'watch', actor: actor.id, text: 'Prepare-se para adivinhar' }));
        readyT = api.after(15000, go);
      }

      function go() {
        if (phase !== 'ready') return;
        api.cancel(readyT); phase = 'act';
        view.innerHTML = `<div class="mm-actor"><span id="mb"></span><div><h1>${esc(actor.name)} está fazendo mímica</h1><p>Adivinhem em voz alta!</p></div></div><div class="mm-cat"></div><div class="mm-count">0<small>acertos</small></div><div class="mm-feed"></div>`;
        view.querySelector('#mb').replaceWith(api.buddy(actor, 9));
        api.sfx('go');
        ck = J.clock(api, bar, SECS, over);
        nextWord();
      }
      function nextWord() {
        word = queue.shift() || J.pick(words);
        view.querySelector('.mm-cat').textContent = 'Categoria: ' + (catOf.get(word) || '');
        tell(actor, actorMsg());
        others().forEach((p) => tell(p, { k: 'watch', actor: actor.id, text: 'Adivinhe em voz alta!', cat: catOf.get(word) || '', secs: Math.ceil(ck.left()) }));
      }
      function chip(h) {
        const d = el('div', 'mm-w ' + (h.ok ? 'ok' : 'no'));
        if (h.by) d.appendChild(api.buddy(h.by, 2.2));
        d.insertAdjacentHTML('beforeend', `<span>${esc(h.word)}</span>${h.by ? `<em>${esc(h.by.name)}</em>` : h.late ? '<em>não deu tempo</em>' : h.ok ? '' : '<em>pulou</em>'}`);
        return d;
      }
      function hit(byId) {
        const by = others().find((p) => p.id === byId) || (others().length === 1 ? others()[0] : null);
        hist.push({ word, ok: true, by });
        score[actor.id] += 100; hits[actor.id]++; bar.score(actor, J.fmtPts(score[actor.id]));
        if (by) { score[by.id] += 100; bar.score(by, J.fmtPts(score[by.id])); api.fx(by, 'good'); api.send(by, { k: 'got', total: score[by.id] }); }
        view.querySelector('.mm-count').firstChild.textContent = hist.filter((x) => x.ok).length;
        view.querySelector('.mm-feed').appendChild(chip(hist[hist.length - 1]));
        api.sfx('good'); api.fx(actor, 'buzz', { v: [40, 40, 80] });
        nextWord();
      }

      function over() {
        if (phase !== 'act') return;
        phase = 'over';
        hist.push({ word, ok: false, late: true });
        const n = hist.filter((x) => x.ok).length;
        view.innerHTML = `<div class="kicker">Tempo esgotado</div><div class="question" style="font-size:2.8rem">${esc(actor.name)}: ${n} ${n === 1 ? 'acerto' : 'acertos'}</div><div class="mm-feed"></div>`;
        const feed = view.querySelector('.mm-feed');
        hist.forEach((h, i) => { const c = chip(h); c.style.animationDelay = i * 0.12 + 's'; feed.appendChild(c); });
        api.sfx('reveal');
        api.players.forEach((p) => tell(p, { k: 'over', actor: actor.id, n, total: score[p.id], mine: p === actor }));
        api.after(Math.min(8000, 4200 + hist.length * 350), nextTurn);
      }

      return {
        start() { nextTurn(); },
        onMsg(p, m) {
          if (p !== actor) return;
          if (m.k === 'go') go();
          else if (phase === 'act' && m.k === 'hit' && m.word === word) hit(String(m.by || ''));
          else if (phase === 'act' && m.k === 'skip' && m.word === word) {
            if (skips <= 0) return;
            skips--; hist.push({ word, ok: false });
            view.querySelector('.mm-feed').appendChild(chip(hist[hist.length - 1])); api.sfx('pop');
            nextWord();
          }
        },
        onLeave(p) { if (p === actor && phase === 'ready') { api.cancel(readyT); phase = 'skip'; api.after(600, nextTurn); } else if (p === actor && phase === 'act') { if (ck) ck.stop(); over(); } },
        sync(p) { if (phase === 'act' && p === actor) api.send(p, actorMsg()); else if (last[p.id]) api.send(p, last[p.id]); },
      };
    },

    /* ------------------------------------------------------------------ phone */
    pad(api) {
      const { root, me } = api, { esc } = J;
      root.innerHTML = `<style>
        .mm-word{flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;text-align:center;background:var(--panel);border-radius:24px;padding:14px;border:2px solid rgba(255,79,216,.5)}
        .mm-word small{font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#ff8fe6}
        .mm-word b{font-size:clamp(26px,9vw,54px);line-height:1.05;text-transform:uppercase;word-break:break-word}
        .mm-word em{font-style:normal;color:var(--muted);font-weight:700;font-size:14px}
        .mm-btns{display:flex;gap:10px;flex:none} .mm-btns .btn{flex:1;min-height:76px;font-size:20px}
        .mm-btns .hitb{flex:2;background:linear-gradient(135deg,#3df5a7,#3dc9ff);color:var(--ink);border:0}
        .mm-who{display:grid;grid-template-columns:1fr 1fr;gap:10px;width:100%} .mm-who .btn{min-height:70px;justify-content:flex-start;gap:10px;padding:0 12px;font-size:17px;overflow:hidden}
        @media (orientation:landscape) and (max-height:540px){.mm-play{flex-direction:row!important}.mm-btns{flex-direction:column;width:34%}.mm-btns .btn{min-height:0}.mm-who{grid-template-columns:repeat(3,1fr)}.mm-who .btn{min-height:52px}}
      </style>`;
      const h = J.padHud(api), box = h.box;
      h.pts('0');
      let cur = null;

      function actUi(m) {
        cur = m; h.time(m.secs);
        box.innerHTML = `<div class="mm-play" style="flex:1;display:flex;flex-direction:column;gap:10px;min-height:0"><div class="mm-word"><small>${esc(m.cat)} · sem falar!</small><b>${esc(m.word)}</b><em>${m.n} ${m.n === 1 ? 'acerto' : 'acertos'} nesta vez</em></div>
          <div class="mm-btns"><button class="btn hitb" id="hit">Acertou!</button><button class="btn" id="skip" ${m.skips > 0 ? '' : 'disabled'}>Pular (${m.skips})</button></div></div>`;
        box.querySelector('#skip').onclick = () => { api.send({ k: 'skip', word: m.word }); api.vib(20); };
        box.querySelector('#hit').onclick = () => {
          api.vib(40);
          if (m.who.length <= 1) { api.send({ k: 'hit', word: m.word, by: m.who[0] || '' }); return; }
          box.innerHTML = `<div class="centered"><div class="big">Quem acertou?</div><div class="mm-who">${m.who.map((id) => `<button class="btn" data-id="${id}"><span data-b="${id}"></span>${esc(h.by(id).name)}</button>`).join('')}</div><button class="btn small" id="back">Voltar</button></div>`;
          box.querySelectorAll('[data-b]').forEach((s) => s.replaceWith(api.buddy(h.by(s.dataset.b), 44)));
          box.querySelectorAll('[data-id]').forEach((b) => { b.onclick = () => { api.send({ k: 'hit', word: m.word, by: b.dataset.id }); api.vib(30); }; });
          box.querySelector('#back').onclick = () => actUi({ ...m, secs: 0 });
        };
        if (!m.secs) h.time(Math.max(1, Math.ceil((endAt - Date.now()) / 1000)));
      }
      let endAt = 0;

      return {
        start() { h.wait('Aquecendo…', ''); },
        onMsg(m) {
          if (m.k === 'ready') {
            h.time(0);
            box.innerHTML = `<div class="centered"><span id="rb"></span><div class="big">Sua vez de fazer mímica!</div><p class="muted" style="font-size:16px;max-width:320px">Fique de pé na frente da TV. A palavra aparece aqui: não mostre o celular para ninguém.</p><button class="btn primary" id="go" style="width:100%">Começar (${m.secs} s)</button></div>`;
            box.querySelector('#rb').replaceWith(api.buddy(me, 96, 'wow'));
            box.querySelector('#go').onclick = () => api.send({ k: 'go' });
            api.vib([80, 60, 80]);
          } else if (m.k === 'act') { endAt = Date.now() + m.secs * 1000; actUi(m); }
          else if (m.k === 'watch') { h.wait(m.text, m.cat ? 'Categoria: ' + m.cat : h.by(m.actor).name + ' vai fazer a mímica', h.by(m.actor), 'wow'); if (m.secs) h.time(m.secs); }
          else if (m.k === 'got') h.pts(J.fmtPts(m.total));
          else if (m.k === 'over') { h.pts(J.fmtPts(m.total)); h.wait(m.mine ? m.n + (m.n === 1 ? ' acerto!' : ' acertos!') : 'Tempo esgotado', m.mine ? 'Boa! Veja as palavras na TV' : h.by(m.actor).name + ' fez ' + m.n, me, m.n ? 'happy' : 'sad'); }
          void cur;
        },
      };
    },
  });
})();
