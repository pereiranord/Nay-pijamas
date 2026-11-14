/* Quem Sou Eu? — the player of the turn holds the phone on the forehead: the screen shows a word everybody can see
   except that player. The friends give hints; tilt the phone down when you get it, up to skip. The same word is on
   the friends' phones, with the same two buttons, so the game works on phones without a motion sensor too.
   The TV never shows the word (the guesser could read it): only the clock, the count and the words already done. */
'use strict';
(() => {
  const CATS = ['personagens', 'animais', 'profissoes', 'objetos', 'celebridades', 'comidas', 'desenhos', 'lugares', 'esportes'];

  J.define('quemsou', {
    name: 'Quem Sou Eu?', kind: 'grupo', min: 2, max: 6, unit: 'pontos',
    tagline: 'O celular vai na testa. Os outros dão as dicas.',
    grad: 'linear-gradient(135deg,#ffd23f,#ff4fa0)',
    icon: '<circle cx="12" cy="13" r="6"/><rect x="8" y="3" width="8" height="5" rx="1"/><path d="M10 14.5a2.5 2.5 0 0 0 4 0"/>',
    how: [['Na testa', 'Segure o celular na testa, com a tela virada para os amigos.'], ['Dicas', 'Os amigos ajudam sem falar a palavra.'], ['Incline', 'Para baixo: acertou. Para cima: pula. Ou um amigo toca no botão.']],
    padHow: 'Na sua vez, o celular vai na testa com a tela para os amigos. Incline para baixo quando acertar e para cima para pular.',
    settings: [
      { id: 'secs', label: 'Tempo de cada vez', options: [[45, '45 s'], [60, '60 s'], [90, '90 s']] },
      { id: 'rounds', label: 'Vezes de cada um', options: [[1, '1 vez'], [2, '2 vezes'], [3, '3 vezes']] },
      { id: 'cats', label: 'Categorias', multi: true, allLabel: 'Tudo misturado', options: WORDS.options(CATS) },
    ],
    presets: { rapido: { secs: 45, rounds: 1 }, normal: { secs: 60, rounds: 2 }, longo: { secs: 90, rounds: 3 } },

    /* ------------------------------------------------------------------ TV */
    tv(api) {
      const { esc, shuffle, el } = J;
      const bar = api.topbar(true);
      const view = el('div', 'center qs'); api.stage.appendChild(view);
      view.insertAdjacentHTML('beforebegin', `<style>
        .qs{gap:1.1rem}
        .qs-who{display:flex;align-items:center;gap:1.6rem} .qs-who h1{font-size:3.4rem;line-height:1.05} .qs-who p{font-size:1.45rem;color:var(--muted);font-weight:700;max-width:40rem}
        .qs-head{position:relative} .qs-head .card{position:absolute;left:50%;top:-2.2rem;transform:translateX(-50%) rotate(-4deg);width:7rem;height:4.2rem;border-radius:.7rem;background:#ffd23f;color:#1a1405;display:grid;place-items:center;font-size:2.4rem;font-weight:900;box-shadow:0 .5rem 1.2rem rgba(0,0,0,.4)}
        .qs-count{font-size:6rem;font-weight:900;line-height:1} .qs-count small{font-size:1.4rem;color:var(--muted);font-weight:800;margin-left:.6rem}
        .qs-feed{display:flex;flex-wrap:wrap;gap:.6rem;justify-content:center;max-width:72rem}
        .qs-w{background:rgba(61,245,167,.18);border-radius:999px;padding:.5rem 1.2rem;font-size:1.3rem;font-weight:800;animation:pop .35s both;text-transform:uppercase}
        .qs-w.no{background:var(--panel);opacity:.55;text-decoration:line-through}
      </style>`);
      const SECS = api.settings.secs || 60, ROUNDS = api.settings.rounds || 1;
      const cats = (api.settings.cats && api.settings.cats.length ? api.settings.cats : CATS).filter((c) => WORDS.CATS[c]);
      const tagged = WORDS.tagged(cats, 'facil'), catOf = new Map(tagged), words = tagged.map((x) => x[0]); // well-known things: this one is about speed
      let order = []; for (let i = 0; i < ROUNDS; i++) order = order.concat(shuffle(api.players));
      const score = {}, last = {};
      api.players.forEach((p) => { score[p.id] = 0; bar.score(p, '0'); });
      let turn = -1, guesser = null, phase = '', queue = [], word = '', hist = [], ck = null, readyT = 0;
      const tell = (p, m) => { last[p.id] = m; api.send(p, m); };
      const hits = () => hist.filter((x) => x.ok).length;
      const msg = (p) => ({ k: p === guesser ? 'show' : 'help', word, cat: catOf.get(word) || '', guesser: guesser.id, secs: Math.ceil(ck ? ck.left() : SECS), n: hits() });

      function nextTurn() {
        turn++;
        if (turn >= order.length) { api.end(api.players.map((p) => ({ id: p.id, pts: score[p.id], note: score[p.id] / 100 + (score[p.id] === 100 ? ' acerto' : ' acertos') }))); return; }
        guesser = order[turn];
        if (!guesser.on) { nextTurn(); return; }
        phase = 'ready'; hist = []; queue = J.fresh('quemsou', words, 30);
        view.innerHTML = `<div class="kicker">Vez ${turn + 1} de ${order.length}</div><div class="qs-who"><div class="qs-head"><span class="card">?</span><span id="qb"></span></div><div><h1>${esc(guesser.name)}, celular na testa!</h1><p>Tela virada para os amigos. Toque em Começar e levante o celular: a palavra aparece depois da contagem.</p></div></div>`;
        view.querySelector('#qb').replaceWith(api.buddy(guesser, 11, 'wow'));
        api.sfx('select');
        api.players.forEach((p) => tell(p, p === guesser ? { k: 'ready', secs: SECS } : { k: 'wait', guesser: guesser.id, text: 'Prepare as dicas!', sub: 'A palavra de ' + guesser.name + ' vai aparecer aqui' }));
        readyT = api.after(20000, go);
      }
      function go() {
        if (phase !== 'ready') return;
        api.cancel(readyT); phase = 'count';
        api.send(guesser, { k: 'count' });
        api.after(3200, () => {
          phase = 'act';
          view.innerHTML = `<div class="qs-who"><div class="qs-head"><span class="card">?</span><span id="qb"></span></div><div><h1>${esc(guesser.name)} está adivinhando</h1><p>Deem dicas sem falar a palavra!</p></div></div><div class="qs-count">0<small>acertos</small></div><div class="qs-feed"></div>`;
          view.querySelector('#qb').replaceWith(api.buddy(guesser, 9));
          api.sfx('go');
          ck = J.clock(api, bar, SECS, over);
          nextWord();
        });
      }
      function nextWord() { word = queue.shift() || J.pick(words); api.players.forEach((p) => tell(p, msg(p))); }
      function mark(ok) {
        hist.push({ word, ok });
        const feed = view.querySelector('.qs-feed');
        feed.appendChild(el('span', 'qs-w' + (ok ? '' : ' no'), esc(word)));
        while (feed.children.length > 14) feed.firstChild.remove();
        if (ok) { score[guesser.id] += 100; bar.score(guesser, J.fmtPts(score[guesser.id])); view.querySelector('.qs-count').firstChild.textContent = hits(); api.sfx('good'); api.fx(guesser, 'flash', { color: '#3df5a7', life: 0.5 }); api.fx(guesser, 'buzz', { v: [60, 40, 60] }); }
        else { api.sfx('pop'); api.fx(guesser, 'flash', { color: '#ff9a3d', life: 0.4 }); api.fx(guesser, 'buzz', { v: 40 }); }
        nextWord();
      }
      function over() {
        if (phase !== 'act') return;
        phase = 'over';
        const n = hits();
        view.innerHTML = `<div class="kicker">Tempo esgotado</div><div class="question" style="font-size:2.8rem">${esc(guesser.name)}: ${n} ${n === 1 ? 'acerto' : 'acertos'}</div><div class="qs-feed">${hist.map((x, i) => `<span class="qs-w ${x.ok ? '' : 'no'}" style="animation-delay:${i * 0.08}s">${esc(x.word)}</span>`).join('')}<span class="qs-w no" style="text-decoration:none">${esc(word)} (não deu tempo)</span></div>`;
        api.sfx('reveal');
        api.players.forEach((p) => tell(p, { k: 'over', n, mine: p === guesser, guesser: guesser.id, total: score[p.id] }));
        api.after(Math.min(8000, 4500 + hist.length * 250), nextTurn);
      }

      return {
        start() { nextTurn(); },
        onMsg(p, m) {
          if (m.k === 'go' && p === guesser) go();
          else if (phase === 'act' && (m.k === 'hit' || m.k === 'skip') && m.word === word) mark(m.k === 'hit'); // the first tap (or tilt) on this word counts
        },
        onLeave(p) { if (p === guesser && phase === 'ready') { api.cancel(readyT); phase = 'skip'; api.after(600, nextTurn); } },
        sync(p) { if (phase === 'act') api.send(p, msg(p)); else if (last[p.id]) api.send(p, last[p.id]); },
      };
    },

    /* ------------------------------------------------------------------ phone */
    pad(api) {
      const { root, me } = api, { esc } = J;
      root.innerHTML = `<style>
        .qp-card{flex:1;min-height:0;position:relative;border-radius:26px;background:#ffd23f;color:#1a1405;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:16px;overflow:hidden}
        .qp-card small{font-size:13px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;opacity:.65}
        .qp-card b{font-size:clamp(34px,13vw,92px);line-height:1;text-transform:uppercase;word-break:break-word;margin:8px 0}
        .qp-zones{position:absolute;inset:0;display:flex;flex-direction:column} .qp-zones button{flex:1;display:flex;align-items:flex-start;justify-content:center;padding:10px;font-weight:900;font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:rgba(26,20,5,.55)}
        .qp-zones button:last-child{align-items:flex-end} .qp-zones button:active{background:rgba(0,0,0,.12)}
        .qp-sensor{position:absolute;right:12px;top:10px;font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;background:rgba(0,0,0,.14);border-radius:999px;padding:4px 10px;z-index:2}
        .qp-help{flex:1;min-height:0;border-radius:24px;background:var(--panel);border:2px solid rgba(255,210,63,.5);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:6px;padding:14px}
        .qp-help small{font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#ffd23f} .qp-help b{font-size:clamp(28px,10vw,56px);line-height:1.05;text-transform:uppercase;word-break:break-word}
        .qp-btns{display:flex;gap:10px;flex:none} .qp-btns .btn{flex:1;min-height:68px} .qp-btns .hitb{flex:2;background:linear-gradient(135deg,#3df5a7,#3dc9ff);color:var(--ink);border:0}
        @media (orientation:landscape) and (max-height:540px){.qp-play{flex-direction:row!important}.qp-btns{flex-direction:column;width:30%}.qp-btns .btn{min-height:0}.qp-card b{font-size:clamp(34px,22vh,92px)}}
      </style>`;
      const h = J.padHud(api), box = h.box;
      h.pts('0');
      let cur = null, armed = true, sensor = false, mine = false, lastMark = 0;
      const mark = (k) => { if (!cur || Date.now() - lastMark < 700) return; lastMark = Date.now(); api.send({ k, word: cur.word }); api.vib(k === 'hit' ? [60, 40, 60] : 40); };
      // motion sensor: screen facing the floor = got it, facing the ceiling = skip; back to upright to arm again
      const onMotion = (e) => {
        const g = e.accelerationIncludingGravity; if (!g || g.z == null) return;
        if (!sensor) { sensor = true; const s = box.querySelector('.qp-sensor'); if (s) s.textContent = 'Sensor ligado'; }
        if (!mine || !cur) return;
        if (Math.abs(g.z) < 3.5) armed = true;
        else if (armed && g.z < -6.5) { armed = false; mark('hit'); }
        else if (armed && g.z > 6.5) { armed = false; mark('skip'); }
      };
      const listen = () => { try { if (window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function') DeviceMotionEvent.requestPermission().then((r) => { if (r === 'granted') addEventListener('devicemotion', onMotion); }).catch(() => {}); else addEventListener('devicemotion', onMotion); } catch (e) { /* no sensor */ } };

      return {
        start() { h.wait('Embaralhando as cartas…', ''); },
        stop() { removeEventListener('devicemotion', onMotion); },
        onMsg(m) {
          if (m.k === 'ready') {
            mine = true; cur = null; h.time(0);
            box.innerHTML = `<div class="centered"><span id="rb"></span><div class="big">Sua vez de adivinhar!</div><p class="muted" style="font-size:16px;max-width:330px">Toque em Começar e coloque o celular na testa, com a tela para os amigos. Incline para <b style="color:#fff">baixo</b> quando acertar e para <b style="color:#fff">cima</b> para pular.</p><button class="btn primary" id="go" style="width:100%">Começar (${m.secs} s)</button></div>`;
            box.querySelector('#rb').replaceWith(api.buddy(me, 96, 'wow'));
            box.querySelector('#go').onclick = () => { listen(); api.send({ k: 'go' }); };
            api.vib([80, 60, 80]);
          } else if (m.k === 'count') {
            let n = 3; box.innerHTML = `<div class="qp-card"><small>Celular na testa!</small><b id="cn">3</b></div>`;
            const id = api.every(1000, () => { n--; const c = box.querySelector('#cn'); if (c && n > 0) { c.textContent = n; api.vib(30); } else clearInterval(id); });
          } else if (m.k === 'show') {
            mine = true; cur = m; armed = false; h.time(m.secs);
            box.innerHTML = `<div class="qp-card"><span class="qp-sensor">${sensor ? 'Sensor ligado' : 'Toque: em cima pula, embaixo acerta'}</span><small>${esc(m.cat)}</small><b>${esc(m.word)}</b><small>${m.n} ${m.n === 1 ? 'acerto' : 'acertos'}</small><div class="qp-zones"><button data-k="skip">▲ pular</button><button data-k="hit">acertou ▼</button></div></div>`;
            box.querySelectorAll('[data-k]').forEach((b) => { b.onclick = () => mark(b.dataset.k); });
          } else if (m.k === 'help') {
            mine = false; cur = m; h.time(m.secs);
            const g = h.by(m.guesser);
            box.innerHTML = `<div class="qp-play" style="flex:1;display:flex;flex-direction:column;gap:10px;min-height:0"><div class="qp-help"><small>${esc(g.name)} é… · ${esc(m.cat)}</small><b>${esc(m.word)}</b><span class="muted" style="font-weight:700">Dê dicas sem falar a palavra</span></div>
              <div class="qp-btns"><button class="btn hitb" data-k="hit">Acertou!</button><button class="btn" data-k="skip">Pular</button></div></div>`;
            box.querySelectorAll('[data-k]').forEach((b) => { b.onclick = () => mark(b.dataset.k); });
          } else if (m.k === 'wait') { mine = false; cur = null; h.wait(m.text, m.sub, h.by(m.guesser), 'wow'); }
          else if (m.k === 'over') { cur = null; mine = false; h.pts(J.fmtPts(m.total)); h.wait(m.mine ? m.n + (m.n === 1 ? ' acerto!' : ' acertos!') : 'Tempo esgotado', m.mine ? 'Pode baixar o celular' : h.by(m.guesser).name + ' acertou ' + m.n, me, m.n ? 'happy' : 'sad'); }
        },
      };
    },
  });
})();
