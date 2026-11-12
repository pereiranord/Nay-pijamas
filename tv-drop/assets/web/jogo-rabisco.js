/* Rabisco Relâmpago — one player draws on the phone, the drawing shows up live on the TV,
   and everyone else types guesses. The faster the guess, the more points.
   Words: gamer/words.js (thousands, by category; the host picks the categories or "Tudo misturado"),
   never the ones used in the last matches. Board: gamer/sketch.js (colors, eraser, sizes, undo, clear). */
'use strict';
(() => {
  const CATS = ['animais', 'objetos', 'casa', 'profissoes', 'comidas', 'filmes', 'personagens', 'lugares', 'esportes', 'acoes', 'expressoes', 'absurdas', 'dificil', 'muitodificil'];
  const letter = (ch) => /[a-z0-9à-ú]/i.test(ch);

  /** Is the guess the word? Long expressions don't need every little word. Returns 'yes', 'near' or ''. */
  function judge(text, word) {
    const g = J.norm(text), w = J.norm(word);
    if (!g) return '';
    if (g === w || g.replace(/ /g, '') === w.replace(/ /g, '')) return 'yes';
    const ww = w.split(' ').filter((x) => x.length > 2), gw = new Set(g.split(' '));
    if (ww.length >= 3) {
      const hit = ww.filter((x) => gw.has(x)).length / ww.length;
      if (hit >= 0.75) return 'yes';
      if (hit >= 0.4) return 'near';
    }
    const d = J.distance(g, w);
    if (w.length >= 12 && d <= 2 && ww.length >= 2) return 'yes'; // a typo in a long answer
    return (w.length >= 5 && d <= 1) || (w.length >= 8 && d <= 2) || (w.length >= 14 && d <= 4) ? 'near' : '';
  }

  J.define('rabisco', {
    name: 'Rabisco Relâmpago', kind: 'desenho', min: 2, max: 6, unit: 'pontos',
    tagline: 'Um desenha no celular, o desenho aparece na TV e os outros adivinham.',
    grad: 'linear-gradient(135deg,#3dc9ff,#b47cff)',
    icon: '<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/><path d="M13 20h7"/>',
    how: [['Desenhe', 'Na sua vez, escolha uma palavra e desenhe no celular.'], ['Adivinhe', 'Os outros digitam palpites. Quem acerta antes ganha mais.'], ['Sem letras', 'Vale tudo no desenho, menos escrever a palavra.']],
    padHow: 'Na sua vez você desenha com o dedo. Nas outras, digite palpites o mais rápido que puder.',
    settings: [
      { id: 'secs', label: 'Tempo para desenhar', options: [[45, '45 s'], [70, '70 s'], [90, '90 s'], [120, '2 min']] },
      { id: 'rounds', label: 'Vezes que cada um desenha', options: [[1, '1 vez'], [2, '2 vezes'], [3, '3 vezes']] },
      { id: 'cats', label: 'Categorias', multi: true, allLabel: 'Tudo misturado', options: WORDS.options(CATS) },
    ],
    presets: { rapido: { secs: 45, rounds: 1 }, normal: { secs: 70, rounds: 2 }, longo: { secs: 90, rounds: 3 } },

    /* ------------------------------------------------------------------ TV */
    tv(api) {
      const { esc, shuffle, el } = J;
      const bar = api.topbar(true);
      const wrap = el('div', 'rb');
      wrap.innerHTML = `<style>
        .rb{position:absolute;inset:0;padding:5.6rem 2.4rem 1.6rem;display:flex;gap:2rem}
        .rb-board{height:100%;aspect-ratio:1;background:#fff;border-radius:1.6rem;box-shadow:0 1.6rem 4rem rgba(0,0,0,.5),0 0 0 .5rem rgba(255,255,255,.12);display:block}
        .rb-side{flex:1;display:flex;flex-direction:column;gap:1.1rem;min-width:0}
        .rb-who{display:flex;align-items:center;gap:.9rem;font-size:1.7rem;font-weight:900}
        .rb-who .buddy{width:4.4rem!important;height:4.4rem!important}
        .rb-who small{display:block;font-size:1rem;color:var(--muted);font-weight:700}
        .rb-hint{display:flex;flex-wrap:wrap;gap:.4rem .35rem;min-height:3.6rem}
        .rb-hint span{width:2.5rem;height:3.3rem;border-radius:.6rem;background:rgba(255,255,255,.1);border-bottom:.25rem solid var(--accent);display:grid;place-items:center;font-size:2rem;font-weight:900;text-transform:uppercase}
        .rb-hint span.gap{background:none;border:0;width:1rem} .rb-hint span.on{background:#fff;color:#120f26;animation:pop .35s both}
        .rb-hint.long{gap:.3rem .25rem} .rb-hint.long span{width:1.75rem;height:2.4rem;font-size:1.35rem;border-radius:.4rem} .rb-hint.long span.gap{width:.7rem}
        .rb-cat{align-self:flex-start;font:800 .95rem/1 var(--font-mono,monospace);letter-spacing:.12em;text-transform:uppercase;color:#120f26;background:var(--accent);border-radius:999px;padding:.45rem .9rem}
        .rb-feed{flex:1;display:flex;flex-direction:column;justify-content:flex-end;gap:.5rem;overflow:hidden}
        .rb-msg{display:flex;align-items:center;gap:.6rem;background:var(--panel);border-radius:1rem;padding:.4rem 1rem .4rem .4rem;font-size:1.25rem;font-weight:700;animation:rise .25s both;align-self:flex-start;max-width:100%}
        .rb-msg .buddy{width:2.4rem!important;height:2.4rem!important;flex:none}
        .rb-msg b{color:var(--muted);font-weight:800} .rb-msg span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .rb-msg.ok{background:rgba(61,245,167,.2);color:var(--accent)} .rb-msg.near{background:rgba(255,210,63,.16);color:#ffd23f}
        .rb-gallery{position:absolute;inset:0;padding:5.6rem 3rem 2rem;display:flex;flex-direction:column;align-items:center;gap:1.2rem}
        .rb-grid{flex:1;display:flex;flex-wrap:wrap;gap:1.2rem;justify-content:center;align-content:center;min-height:0}
        .rb-card{background:#fff;border-radius:1.2rem;padding:.6rem .6rem .5rem;color:#120f26;text-align:center;font-weight:900;font-size:1.1rem;animation:pop .5s both;transform-origin:center}
        .rb-card img{display:block;width:var(--s);height:var(--s);border-radius:.8rem;background:#fff}
        .rb-card span{display:block;max-width:var(--s);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .rb-card small{display:block;color:#6a6690;font-weight:700;font-size:.85rem}
      </style>
      <canvas class="rb-board" width="720" height="720"></canvas>
      <div class="rb-side"><div class="rb-who"></div><div class="rb-cat" hidden></div><div class="rb-hint"></div><div class="kicker" style="margin-top:.4rem">Palpites</div><div class="rb-feed"></div></div>`;
      api.stage.appendChild(wrap);
      const cvEl = wrap.querySelector('.rb-board'), board = Sketch.board(cvEl);
      const who = wrap.querySelector('.rb-who'), hintBox = wrap.querySelector('.rb-hint'), feedBox = wrap.querySelector('.rb-feed'), catBox = wrap.querySelector('.rb-cat');
      const score = {}, hits = {};
      api.players.forEach((p) => { score[p.id] = 0; hits[p.id] = 0; bar.score(p, '0'); });
      const TIME = api.settings.secs || 70;
      const perPlayer = api.settings.rounds || (api.players.length <= 3 ? 2 : 1);
      let order = []; for (let i = 0; i < perPlayer; i++) order = order.concat(shuffle(api.players));
      // the words of the chosen categories; three new ones per turn, none of them seen in the last matches
      const cats = (api.settings.cats && api.settings.cats.length ? api.settings.cats : CATS).filter((c) => WORDS.CATS[c]);
      const tagged = WORDS.tagged(cats), catOf = new Map(tagged);
      const words = tagged.map((x) => x[0]);
      const gallery = [];
      let turn = -1, drawer = null, phase = '', word = '', shown = [], got = {}, tickId = 0, deadline = 0, choices = [], last = {}, firstBonus = true;
      const tell = (p, m) => { last[p.id] = m; api.send(p, m); };
      const guessers = () => api.players.filter((p) => p !== drawer && p.on);
      const hintText = () => word.split('').map((ch, i) => (letter(ch) ? (shown[i] ? ch : '_') : ch)).join('');

      function drawHint(all) {
        hintBox.classList.toggle('long', word.length > 22);
        hintBox.innerHTML = word.split('').map((ch, i) => (letter(ch) ? `<span class="${all || shown[i] ? 'on' : ''}">${all || shown[i] ? esc(ch) : ''}</span>` : `<span class="gap">${ch === ' ' ? '' : esc(ch)}</span>`)).join('');
      }
      function feed(p, text, cls) {
        const m = el('div', 'rb-msg ' + (cls || ''));
        m.appendChild(api.buddy(p, 2.4)); m.appendChild(el('b', '', esc(p.name)));
        m.appendChild(el('span', '', esc(text)));
        feedBox.appendChild(m);
        while (feedBox.children.length > 8) feedBox.firstChild.remove();
      }
      function clock(secs, each, done) {
        api.cancel(tickId); deadline = Date.now() + secs * 1000;
        let lastWhole = 99;
        tickId = api.every(200, () => { const left = (deadline - Date.now()) / 1000; bar.time(left); const w = Math.ceil(left); if (w !== lastWhole) { lastWhole = w; if (w <= 5 && w > 0) api.sfx('tick'); if (each) each(left); } if (left <= 0) { api.cancel(tickId); bar.time(null); done(); } });
      }

      function nextTurn() {
        turn++;
        if (turn >= order.length) { showGallery(); return; }
        drawer = order[turn];
        if (!drawer.on) { nextTurn(); return; }
        phase = 'choose'; got = {}; word = ''; firstBonus = true; board.clear(); feedBox.innerHTML = ''; hintBox.innerHTML = ''; catBox.hidden = true;
        choices = J.fresh('rabisco', words, 3);
        who.innerHTML = ''; who.appendChild(api.buddy(drawer, 4.4, 'wow')); who.appendChild(el('div', '', `${esc(drawer.name)} está escolhendo<small>Rabisco ${turn + 1} de ${order.length}</small>`));
        api.sfx('select');
        api.players.forEach((p) => tell(p, p === drawer ? { k: 'choose', words: choices, cats: choices.map((w) => catOf.get(w) || ''), secs: 15 } : { k: 'wait', drawer: drawer.id, text: drawer.name + ' está escolhendo a palavra' }));
        clock(15, null, () => begin(choices[0]));
      }

      function begin(w) {
        if (phase !== 'choose') return;
        phase = 'draw'; word = w; shown = word.split('').map(() => false);
        who.innerHTML = ''; who.appendChild(api.buddy(drawer, 4.4)); who.appendChild(el('div', '', `${esc(drawer.name)} está desenhando<small>Rabisco ${turn + 1} de ${order.length}</small>`));
        const cat = catOf.get(word) || '';
        catBox.textContent = cat; catBox.hidden = !cat;
        drawHint(false);
        api.players.forEach((p) => tell(p, p === drawer ? { k: 'draw', word, cat, secs: TIME } : { k: 'guess', drawer: drawer.id, hint: hintText(), cat, secs: TIME }));
        const letters = word.split('').map((ch, i) => (letter(ch) ? i : -1)).filter((i) => i >= 0);
        const marks = letters.length >= 4 ? [TIME * 0.55, TIME * 0.3] : [];
        if (letters.length >= 9) marks.push(TIME * 0.15);
        const perMark = Math.max(1, Math.round(letters.length / 9)); // long expressions open more letters each time
        clock(TIME, (left) => {
          if (marks.length && left <= marks[0]) {
            marks.shift();
            for (let n = 0; n < perMark; n++) { const hidden = letters.filter((i) => !shown[i]); if (hidden.length > Math.ceil(letters.length / 2)) shown[J.pick(hidden)] = true; }
            drawHint(false); api.sfx('pop'); guessers().forEach((p) => { if (!got[p.id]) api.send(p, { k: 'hint', hint: hintText() }); });
          }
        }, endTurn);
      }

      function guess(p, text) {
        if (phase !== 'draw' || p === drawer || got[p.id]) return;
        const verdict = judge(text, word);
        if (!J.norm(text)) return;
        if (verdict === 'yes') {
          const left = Math.max(0, (deadline - Date.now()) / 1000);
          let pts = Math.round((400 + 600 * (left / TIME)) / 10) * 10;
          if (firstBonus) { pts += 100; firstBonus = false; }
          got[p.id] = pts; score[p.id] += pts; hits[p.id]++; score[drawer.id] += 200;
          bar.score(p, J.fmtPts(score[p.id])); bar.score(drawer, J.fmtPts(score[drawer.id]));
          feed(p, 'acertou! +' + pts, 'ok'); api.sfx('good');
          tell(p, { k: 'right', pts, total: score[p.id], word }); api.fx(p, 'good');
          api.send(drawer, { k: 'hit', name: p.name, total: score[drawer.id] }); api.fx(drawer, 'buzz', { v: [40, 40, 80] });
          if (guessers().every((x) => got[x.id])) { api.cancel(tickId); api.after(700, endTurn); }
        } else {
          const near = verdict === 'near';
          feed(p, near ? 'está quase!' : String(text).slice(0, 28), near ? 'near' : '');
          api.send(p, { k: 'miss', near }); api.sfx('pop');
        }
      }

      function endTurn() {
        if (phase !== 'draw') return;
        phase = 'over'; api.cancel(tickId); bar.time(null);
        drawHint(true); api.sfx('reveal');
        const n = Object.keys(got).length;
        api.banner(word.toUpperCase(), n ? n + (n === 1 ? ' pessoa acertou' : ' pessoas acertaram') : 'ninguém acertou');
        if (!board.empty()) { try { gallery.push({ img: cvEl.toDataURL('image/png'), word, by: drawer.name }); } catch (e) { /* ignore */ } }
        api.players.forEach((p) => tell(p, { k: 'over', word, total: score[p.id], got: !!got[p.id], drawer: p === drawer, n }));
        api.after(4200, nextTurn);
      }

      function showGallery() {
        phase = 'gallery';
        const done = () => api.end(api.players.map((p) => ({ id: p.id, pts: score[p.id], note: hits[p.id] + (hits[p.id] === 1 ? ' acerto' : ' acertos') })));
        if (!gallery.length) { done(); return; }
        api.players.forEach((p) => tell(p, { k: 'wait', text: 'A galeria da partida está na TV' }));
        const s = gallery.length <= 3 ? 22 : gallery.length <= 6 ? 15.5 : gallery.length <= 10 ? 11 : 8.4;
        wrap.remove();
        const g = el('div', 'rb-gallery');
        g.innerHTML = `<h1 style="font-size:2.8rem">Galeria da partida</h1><div class="rb-grid" style="--s:${s}rem">${gallery.map((x, i) => `<div class="rb-card" style="animation-delay:${i * 0.25}s;transform:rotate(${(i % 2 ? 1 : -1) * (1 + (i % 3))}deg)"><img alt="" src="${x.img}"><span>${esc(x.word)}</span><small>por ${esc(x.by)}</small></div>`).join('')}</div>`;
        g.insertAdjacentHTML('afterbegin', wrap.querySelector('style').outerHTML);
        api.stage.appendChild(g);
        api.sfx('reveal');
        api.after(Math.min(10000, 3500 + gallery.length * 700), done);
      }

      return {
        start() { nextTurn(); },
        onMsg(p, m) {
          if (p === drawer) {
            if (m.k === 'pick' && phase === 'choose') { const w = choices[+m.i]; if (w) { api.cancel(tickId); begin(w); } }
            else if (phase === 'draw') board.apply(m);
          } else if (m.k === 'guess') guess(p, m.text);
        },
        onLeave(p) { if (p === drawer && (phase === 'choose' || phase === 'draw')) { api.cancel(tickId); if (phase === 'choose') { phase = 'skip'; api.after(500, nextTurn); } else endTurn(); } },
        sync(p) { if (last[p.id]) api.send(p, last[p.id]); },
      };
    },

    /* ------------------------------------------------------------------ phone */
    pad(api) {
      const { root, me } = api, { esc } = J;
      root.innerHTML = `<style>
        .rp{flex:1;display:flex;flex-direction:column;gap:10px;min-height:0}
        .rp .word{font-size:22px;font-weight:900;text-align:center;text-transform:uppercase;background:rgba(255,255,255,.08);border-radius:16px;padding:10px}
        .rp .word small{display:block;font-size:11px;letter-spacing:.14em;color:var(--muted)}
        .choices{display:flex;flex-direction:column;gap:10px;width:100%} .choices .btn{text-transform:uppercase;min-height:66px;font-size:20px;flex-direction:column;gap:2px;padding:8px 14px;line-height:1.1}
        .choices .btn small{font-size:11px;letter-spacing:.12em;opacity:.7}
        .hintp{display:flex;flex-wrap:wrap;gap:5px;justify-content:center} .hintp span{width:26px;height:34px;border-radius:7px;background:rgba(255,255,255,.1);border-bottom:3px solid var(--accent);display:grid;place-items:center;font-weight:900;font-size:18px;text-transform:uppercase} .hintp span.gap{background:none;border:0;width:10px}
        .hintp.long span{width:17px;height:24px;font-size:13px;border-radius:5px;border-bottom-width:2px} .hintp.long span.gap{width:7px}
        .fb{min-height:28px;text-align:center;font-weight:900;font-size:18px}
        @media (orientation:landscape) and (max-height:540px){.choices{flex-direction:row}.choices .btn{flex:1;font-size:16px}.rp .centered{gap:8px}.rp .big{font-size:22px}}
      </style>
      <div class="hud"><span id="rbd"></span><span class="name">${esc(me.name)}</span><span class="pillv" id="clock"></span><span class="pillv" id="pts">0</span></div><div class="rp" id="box"></div>`;
      root.querySelector('#rbd').replaceWith(api.buddy(me, 40));
      const box = root.querySelector('#box'), clockEl = root.querySelector('#clock');
      const by = (id) => api.players.find((p) => p.id === id) || { name: '?', color: '#888', shape: 'bola' };
      let end = 0;
      api.every(250, () => { const left = Math.ceil((end - Date.now()) / 1000); clockEl.textContent = end && left > 0 ? left + ' s' : ''; clockEl.style.color = left <= 10 ? '#ff4d6d' : ''; });
      const hintHtml = (h) => h.split('').map((ch) => (ch === ' ' ? '<span class="gap"></span>' : ch === '_' ? '<span></span>' : letter(ch) ? `<span>${esc(ch)}</span>` : `<span class="gap">${esc(ch)}</span>`)).join('');
      const wait = (title, sub, p, mood) => { end = 0; box.innerHTML = `<div class="centered"><span id="wb"></span><div class="big">${esc(title)}</div><p class="muted">${esc(sub || '')}</p></div>`; box.querySelector('#wb').replaceWith(api.buddy(p || me, 110, mood)); };

      function guessUi(m) {
        const d = by(m.drawer);
        box.innerHTML = `<div class="word"><small>${esc(d.name)} está desenhando${m.cat ? ' · ' + esc(m.cat) : ''}</small><div class="hintp ${m.hint.length > 22 ? 'long' : ''}" id="hint">${hintHtml(m.hint)}</div></div>
          <div class="row" style="display:flex;gap:8px"><input class="field" id="g" style="flex:1;min-width:0;text-transform:uppercase" maxlength="60" placeholder="Seu palpite" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="send"><button class="btn primary" id="send" style="min-width:86px">Enviar</button></div>
          <div class="fb" id="fb">Olhe o desenho na TV</div>`;
        const inp = box.querySelector('#g');
        const go = () => { const t = inp.value.trim(); if (!t) return; api.send({ k: 'guess', text: t }); inp.value = ''; inp.focus(); };
        box.querySelector('#send').onclick = go;
        inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } };
      }

      return {
        start() { wait('Preparando os lápis…', ''); },
        onMsg(m) {
          if (m.k === 'choose') {
            end = Date.now() + m.secs * 1000;
            box.innerHTML = `<div class="centered"><div class="big">Sua vez de desenhar!</div><p class="muted">Escolha uma palavra</p><div class="choices">${m.words.map((w, i) => `<button class="btn ${i === 0 ? 'primary' : ''}" data-i="${i}">${esc(w)}<small>${esc((m.cats || [])[i] || '')}</small></button>`).join('')}</div></div>`;
            box.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => api.send({ k: 'pick', i: +b.dataset.i }); });
            api.vib([60, 40, 60]);
          } else if (m.k === 'wait') wait(m.text, 'Fique de olho na TV', m.drawer ? by(m.drawer) : me, 'wow');
          else if (m.k === 'draw') { end = Date.now() + m.secs * 1000; Sketch.pad(api, box, { head: `<div class="word"><small>Desenhe${m.cat ? ' · ' + esc(m.cat) : ''} · sem escrever a palavra</small>${esc(m.word)}</div>` }); api.vib(40); }
          else if (m.k === 'guess') { end = Date.now() + m.secs * 1000; guessUi(m); api.vib(40); }
          else if (m.k === 'hint') { const h = box.querySelector('#hint'); if (h) h.innerHTML = hintHtml(m.hint); }
          else if (m.k === 'miss') { const fb = box.querySelector('#fb'); if (fb) { fb.textContent = m.near ? 'Quase! Está muito perto' : 'Não é isso…'; fb.style.color = m.near ? '#ffd23f' : 'var(--muted)'; } if (m.near) api.vib([30, 30, 30]); }
          else if (m.k === 'right') { root.querySelector('#pts').textContent = J.fmtPts(m.total); box.innerHTML = `<div class="centered"><div class="statusbig" style="color:var(--accent)">+${m.pts}</div><div class="big">Acertou!</div><p class="muted" style="text-transform:uppercase;font-weight:900">${esc(m.word)}</p></div>`; }
          else if (m.k === 'hit') { root.querySelector('#pts').textContent = J.fmtPts(m.total); const w = box.querySelector('.sk-head .word small'); if (w) { w.textContent = m.name + ' acertou! +200 para você'; w.style.color = 'var(--accent)'; } }
          else if (m.k === 'over') { root.querySelector('#pts').textContent = J.fmtPts(m.total); wait(m.word.toUpperCase(), m.drawer ? (m.n ? m.n + (m.n === 1 ? ' pessoa acertou o seu rabisco' : ' acertaram o seu rabisco') : 'Ninguém acertou desta vez') : m.got ? 'Você acertou!' : 'Era essa a palavra', me, m.got || (m.drawer && m.n) ? 'happy' : 'sad'); }
        },
      };
    },
  });
})();
