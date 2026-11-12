/* Rabisco Relâmpago — one player draws on the phone, the drawing shows up live on the TV,
   and everyone else types guesses. The faster the guess, the more points. */
'use strict';
(() => {
  const WORDS = ('abacaxi,âncora,aranha,arco-íris,árvore,avião,baleia,balão,banana,bandeira,banheira,barco,bicicleta,bigode,bola,bolo,bombeiro,boneco de neve,borboleta,bota,cachorro,cadeira,café,caminhão,cama,camelo,caracol,castelo,cavalo,cebola,cenoura,chapéu,chave,chuva,chuveiro,cobra,coelho,cogumelo,coração,coroa,coruja,dente,dinossauro,elefante,escada,escova de dentes,espelho,estrela,fantasma,farol,foguete,formiga,fogueira,galinha,garfo,gato,geladeira,girafa,guarda-chuva,guitarra,hambúrguer,helicóptero,igreja,ilha,jacaré,janela,joaninha,lâmpada,lápis,leão,livro,lua,macaco,mala,martelo,melancia,mesa,microfone,montanha,morcego,nuvem,óculos,ovo frito,palhaço,panela,papagaio,pato,peixe,pente,pinguim,pipa,pirata,pizza,polvo,ponte,porco,praia,presente,quebra-cabeça,raio,relógio,robô,roda-gigante,sapo,sereia,skate,sol,sorvete,tartaruga,telefone,televisão,tesoura,tigre,tomada,trator,trem,tubarão,unicórnio,vaca,vassoura,vela,violão,vulcão,zebra,cacto,pé de moleque,pão de queijo,futebol,churrasco,carnaval,sofá,escorregador,tatu,capivara,tucano,coxinha,brigadeiro,rede,jangada,berimbau,pipoca,semáforo,ônibus,chinelo').split(',');
  const INK = ['#16132b', '#ff4d6d', '#ff9a3d', '#ffd23f', '#3ecf6e', '#3d9bff', '#9b5cff', '#8a5a3c', '#ffffff'];
  const SIZES = [5, 12, 26];
  const TIME = 70;

  /** Draws one stroke segment list on a square canvas of side S (points are 0..1000). */
  function strokeOn(c, S, st, from = 0) {
    const p = st.pts, k = S / 1000;
    c.strokeStyle = INK[st.c] || INK[0]; c.fillStyle = c.strokeStyle; c.lineWidth = (SIZES[st.w] || SIZES[1]) * (S / 720); c.lineCap = 'round'; c.lineJoin = 'round';
    if (p.length === 2) { c.beginPath(); c.arc(p[0] * k, p[1] * k, c.lineWidth / 2, 0, 7); c.fill(); return; }
    const i0 = Math.max(0, from - 2);
    c.beginPath(); c.moveTo(p[i0] * k, p[i0 + 1] * k);
    for (let i = i0 + 2; i < p.length; i += 2) c.lineTo(p[i] * k, p[i + 1] * k);
    c.stroke();
    if (from === 0) { c.beginPath(); c.arc(p[0] * k, p[1] * k, c.lineWidth / 2, 0, 7); c.fill(); }
  }

  J.define('rabisco', {
    name: 'Rabisco Relâmpago', kind: 'desenho', min: 2, max: 6, unit: 'pontos',
    tagline: 'Um desenha no celular, o desenho aparece na TV e os outros adivinham.',
    grad: 'linear-gradient(135deg,#3dc9ff,#b47cff)',
    icon: '<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/><path d="M13 20h7"/>',
    how: [['Desenhe', 'Na sua vez, escolha uma palavra e desenhe no celular.'], ['Adivinhe', 'Os outros digitam palpites. Quem acerta antes ganha mais.'], ['Sem letras', 'Vale tudo no desenho, menos escrever a palavra.']],
    padHow: 'Na sua vez você desenha com o dedo. Nas outras, digite palpites o mais rápido que puder.',

    /* ------------------------------------------------------------------ TV */
    tv(api) {
      const { esc, norm, shuffle, el } = J;
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
        .rb-feed{flex:1;display:flex;flex-direction:column;justify-content:flex-end;gap:.5rem;overflow:hidden}
        .rb-msg{display:flex;align-items:center;gap:.6rem;background:var(--panel);border-radius:1rem;padding:.4rem 1rem .4rem .4rem;font-size:1.25rem;font-weight:700;animation:rise .25s both;align-self:flex-start;max-width:100%}
        .rb-msg .buddy{width:2.4rem!important;height:2.4rem!important;flex:none}
        .rb-msg b{color:var(--muted);font-weight:800} .rb-msg span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .rb-msg.ok{background:rgba(61,245,167,.2);color:var(--accent)} .rb-msg.near{background:rgba(255,210,63,.16);color:#ffd23f}
        .rb-gallery{position:absolute;inset:0;padding:5.6rem 3rem 2rem;display:flex;flex-direction:column;align-items:center;gap:1.2rem}
        .rb-grid{flex:1;display:flex;flex-wrap:wrap;gap:1.2rem;justify-content:center;align-content:center;min-height:0}
        .rb-card{background:#fff;border-radius:1.2rem;padding:.6rem .6rem .5rem;color:#120f26;text-align:center;font-weight:900;font-size:1.1rem;animation:pop .5s both;transform-origin:center}
        .rb-card img{display:block;width:var(--s);height:var(--s);border-radius:.8rem;background:#fff}
        .rb-card small{display:block;color:#6a6690;font-weight:700;font-size:.85rem}
      </style>
      <canvas class="rb-board" width="720" height="720"></canvas>
      <div class="rb-side"><div class="rb-who"></div><div class="rb-hint"></div><div class="kicker" style="margin-top:.4rem">Palpites</div><div class="rb-feed"></div></div>`;
      api.stage.appendChild(wrap);
      const board = wrap.querySelector('.rb-board'), c = board.getContext('2d');
      const who = wrap.querySelector('.rb-who'), hintBox = wrap.querySelector('.rb-hint'), feedBox = wrap.querySelector('.rb-feed');
      const score = {}, hits = {};
      api.players.forEach((p) => { score[p.id] = 0; hits[p.id] = 0; bar.score(p, '0'); });
      const perPlayer = api.players.length <= 3 ? 2 : 1;
      let order = []; for (let i = 0; i < perPlayer; i++) order = order.concat(shuffle(api.players));
      const pool = shuffle(WORDS), gallery = [];
      let turn = -1, drawer = null, phase = '', word = '', shown = [], strokes = [], got = {}, tickId = 0, deadline = 0, choices = [], last = {}, firstBonus = true;
      const tell = (p, m) => { last[p.id] = m; api.send(p, m); };
      const guessers = () => api.players.filter((p) => p !== drawer && p.on);
      const hintText = () => word.split('').map((ch, i) => (/[a-z0-9à-ú]/i.test(ch) ? (shown[i] ? ch : '_') : ch)).join('');
      const clear = () => { c.fillStyle = '#fff'; c.fillRect(0, 0, 720, 720); };
      const redraw = () => { clear(); strokes.forEach((s) => strokeOn(c, 720, s)); };

      function drawHint(all) {
        hintBox.innerHTML = word.split('').map((ch, i) => (/[a-z0-9à-ú]/i.test(ch) ? `<span class="${all || shown[i] ? 'on' : ''}">${all || shown[i] ? esc(ch) : ''}</span>` : `<span class="gap">${ch === ' ' ? '' : esc(ch)}</span>`)).join('');
      }
      function feed(p, text, cls) {
        const m = el('div', 'rb-msg ' + (cls || ''));
        m.appendChild(api.buddy(p, 2.4)); m.appendChild(el('b', '', esc(p.name)));
        m.appendChild(el('span', '', esc(text)));
        feedBox.appendChild(m);
        while (feedBox.children.length > 9) feedBox.firstChild.remove();
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
        phase = 'choose'; strokes = []; got = {}; word = ''; firstBonus = true; clear(); feedBox.innerHTML = ''; hintBox.innerHTML = '';
        choices = [pool.pop(), pool.pop(), pool.pop()].filter(Boolean);
        who.innerHTML = ''; who.appendChild(api.buddy(drawer, 4.4, 'wow')); who.appendChild(el('div', '', `${esc(drawer.name)} está escolhendo<small>Rabisco ${turn + 1} de ${order.length}</small>`));
        api.sfx('select');
        api.players.forEach((p) => tell(p, p === drawer ? { k: 'choose', words: choices, secs: 12 } : { k: 'wait', drawer: drawer.id, text: drawer.name + ' está escolhendo a palavra' }));
        clock(12, null, () => begin(choices[0]));
      }

      function begin(w) {
        if (phase !== 'choose') return;
        phase = 'draw'; word = w; shown = word.split('').map(() => false);
        who.innerHTML = ''; who.appendChild(api.buddy(drawer, 4.4)); who.appendChild(el('div', '', `${esc(drawer.name)} está desenhando<small>Rabisco ${turn + 1} de ${order.length}</small>`));
        drawHint(false);
        api.players.forEach((p) => tell(p, p === drawer ? { k: 'draw', word, secs: TIME } : { k: 'guess', drawer: drawer.id, hint: hintText(), secs: TIME }));
        const letters = word.split('').map((ch, i) => (/[a-z0-9à-ú]/i.test(ch) ? i : -1)).filter((i) => i >= 0);
        const marks = letters.length >= 4 ? [TIME * 0.55, TIME * 0.3] : [];
        if (letters.length >= 9) marks.push(TIME * 0.15);
        clock(TIME, (left) => {
          if (marks.length && left <= marks[0]) {
            marks.shift();
            const hidden = letters.filter((i) => !shown[i]);
            if (hidden.length > Math.ceil(letters.length / 2)) { shown[J.pick(hidden)] = true; drawHint(false); api.sfx('pop'); guessers().forEach((p) => { if (!got[p.id]) api.send(p, { k: 'hint', hint: hintText() }); }); }
          }
        }, endTurn);
      }

      function guess(p, text) {
        if (phase !== 'draw' || p === drawer || got[p.id]) return;
        const g = norm(text), w = norm(word);
        if (!g) return;
        if (g === w || g.replace(/ /g, '') === w.replace(/ /g, '')) {
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
          const d = J.distance(g, w), near = (w.length >= 5 && d <= 1) || (w.length >= 8 && d <= 2);
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
        if (strokes.length) { try { gallery.push({ img: board.toDataURL('image/png'), word, by: drawer.name }); } catch (e) { /* ignore */ } }
        api.players.forEach((p) => tell(p, { k: 'over', word, total: score[p.id], got: !!got[p.id], drawer: p === drawer, n }));
        api.after(4200, nextTurn);
      }

      function showGallery() {
        phase = 'gallery';
        const done = () => api.end(api.players.map((p) => ({ id: p.id, pts: score[p.id], note: hits[p.id] + (hits[p.id] === 1 ? ' acerto' : ' acertos') })));
        if (!gallery.length) { done(); return; }
        api.players.forEach((p) => tell(p, { k: 'wait', text: 'A galeria da partida está na TV' }));
        const s = gallery.length <= 3 ? 22 : gallery.length <= 6 ? 15.5 : 11;
        wrap.remove();
        const g = el('div', 'rb-gallery');
        g.innerHTML = `<h1 style="font-size:2.8rem">Galeria da partida</h1><div class="rb-grid" style="--s:${s}rem">${gallery.map((x, i) => `<div class="rb-card" style="animation-delay:${i * 0.25}s;transform:rotate(${(i % 2 ? 1 : -1) * (1 + (i % 3))}deg)"><img alt="" src="${x.img}">${esc(x.word)}<small>por ${esc(x.by)}</small></div>`).join('')}</div>`;
        g.insertAdjacentHTML('afterbegin', wrap.querySelector('style').outerHTML);
        api.stage.appendChild(g);
        api.sfx('reveal');
        api.after(Math.min(9000, 3500 + gallery.length * 700), done);
      }

      return {
        start() { clear(); nextTurn(); },
        onMsg(p, m) {
          if (p === drawer) {
            if (m.k === 'pick' && phase === 'choose') { const w = choices[+m.i]; if (w) { api.cancel(tickId); begin(w); } }
            else if (phase === 'draw') {
              if (m.k === 's' && Array.isArray(m.p) && m.p.length >= 2 && m.p.length <= 400) {
                const pts = m.p.map((v) => J.clamp(+v || 0, 0, 1000));
                if (m.n || !strokes.length) { if (strokes.length < 600) { strokes.push({ c: m.c | 0, w: m.w | 0, pts }); strokeOn(c, 720, strokes[strokes.length - 1]); } }
                else { const st = strokes[strokes.length - 1], from = st.pts.length; if (from < 6000) { st.pts.push(...pts); strokeOn(c, 720, st, from); } }
              } else if (m.k === 'undo') { strokes.pop(); redraw(); }
              else if (m.k === 'clear') { strokes = []; clear(); }
            }
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
        .rp canvas.pad{width:100%;aspect-ratio:1;max-height:58vh;align-self:center;background:#fff;border-radius:18px;touch-action:none;display:block;box-shadow:0 0 0 3px rgba(255,255,255,.14)}
        .inks{display:flex;gap:6px;justify-content:space-between}
        .ink{flex:1;aspect-ratio:1;max-width:44px;border-radius:50%;border:3px solid rgba(255,255,255,.2)} .ink.on{border-color:#fff;transform:scale(1.15)}
        .tools{display:flex;gap:8px;align-items:center}
        .sz{width:46px;height:46px;border-radius:14px;background:rgba(255,255,255,.08);display:grid;place-items:center} .sz i{display:block;border-radius:50%;background:#fff} .sz.on{background:rgba(61,245,167,.25);box-shadow:inset 0 0 0 2px var(--accent)}
        .choices{display:flex;flex-direction:column;gap:12px;width:100%} .choices .btn{text-transform:uppercase;min-height:70px;font-size:22px}
        .hintp{display:flex;flex-wrap:wrap;gap:5px;justify-content:center} .hintp span{width:26px;height:34px;border-radius:7px;background:rgba(255,255,255,.1);border-bottom:3px solid var(--accent);display:grid;place-items:center;font-weight:900;font-size:18px;text-transform:uppercase} .hintp span.gap{background:none;border:0;width:10px}
        .grow1{flex:1}
        .fb{min-height:28px;text-align:center;font-weight:900;font-size:18px}
      </style>
      <div class="hud"><span id="rbd"></span><span class="name">${esc(me.name)}</span><span class="pillv" id="clock"></span><span class="pillv" id="pts">0</span></div><div class="rp" id="box"></div>`;
      root.querySelector('#rbd').replaceWith(api.buddy(me, 40));
      const box = root.querySelector('#box'), clockEl = root.querySelector('#clock');
      const by = (id) => api.players.find((p) => p.id === id) || { name: '?', color: '#888', shape: 'bola' };
      let end = 0;
      api.every(250, () => { const left = Math.ceil((end - Date.now()) / 1000); clockEl.textContent = end && left > 0 ? left + ' s' : ''; clockEl.style.color = left <= 10 ? '#ff4d6d' : ''; });
      const hintHtml = (h) => h.split('').map((ch) => (ch === ' ' ? '<span class="gap"></span>' : ch === '_' ? '<span></span>' : /[a-z0-9à-ú]/i.test(ch) ? `<span>${esc(ch)}</span>` : `<span class="gap">${esc(ch)}</span>`)).join('');
      const wait = (title, sub, p, mood) => { end = 0; box.innerHTML = `<div class="centered"><span id="wb"></span><div class="big">${esc(title)}</div><p class="muted">${esc(sub || '')}</p></div>`; box.querySelector('#wb').replaceWith(api.buddy(p || me, 110, mood)); };

      function drawUi(word) {
        let ink = 0, size = 1, cur = null, buf = [], fresh = false;
        const strokes = [];
        box.innerHTML = `<div class="word"><small>Desenhe</small>${esc(word)}</div><canvas class="pad" width="720" height="720"></canvas>
          <div class="inks">${INK.map((col, i) => `<button class="ink ${i === 0 ? 'on' : ''}" data-i="${i}" style="background:${col}" aria-label="Cor ${i + 1}"></button>`).join('')}</div>
          <div class="tools">${SIZES.map((s, i) => `<button class="sz ${i === 1 ? 'on' : ''}" data-s="${i}" aria-label="Espessura ${i + 1}"><i style="width:${6 + i * 9}px;height:${6 + i * 9}px"></i></button>`).join('')}<div class="grow1"></div><button class="btn small" id="undo">Desfazer</button><button class="btn small" id="wipe">Limpar</button></div>
          <div class="fb" id="fb">Sem escrever a palavra!</div>`;
        const cv = box.querySelector('canvas.pad'), c = cv.getContext('2d');
        const redraw = () => { c.fillStyle = '#fff'; c.fillRect(0, 0, 720, 720); strokes.forEach((s) => strokeOn(c, 720, s)); };
        redraw();
        const pos = (e) => { const r = cv.getBoundingClientRect(); return [Math.round(J.clamp((e.clientX - r.left) / r.width, 0, 1) * 1000), Math.round(J.clamp((e.clientY - r.top) / r.height, 0, 1) * 1000)]; };
        const flush = () => { if (!buf.length) return; api.send({ k: 's', c: ink, w: size, p: buf, n: fresh ? 1 : 0 }); buf = []; fresh = false; };
        let pid = null;
        cv.onpointerdown = (e) => { if (pid !== null) return; pid = e.pointerId; try { cv.setPointerCapture(pid); } catch (err) { /* ignore */ } const p = pos(e); cur = { c: ink, w: size, pts: [p[0], p[1]] }; strokes.push(cur); strokeOn(c, 720, cur); buf = [p[0], p[1]]; fresh = true; e.preventDefault(); };
        cv.onpointermove = (e) => { if (e.pointerId !== pid || !cur) return; const p = pos(e), n = cur.pts.length; if (Math.abs(p[0] - cur.pts[n - 2]) + Math.abs(p[1] - cur.pts[n - 1]) < 4) return; const from = cur.pts.length; cur.pts.push(p[0], p[1]); strokeOn(c, 720, cur, from); buf.push(p[0], p[1]); if (buf.length >= 60) flush(); };
        const up = (e) => { if (e.pointerId !== pid) return; pid = null; flush(); cur = null; };
        cv.onpointerup = up; cv.onpointercancel = up;
        api.every(45, flush);
        box.querySelectorAll('.ink').forEach((b) => { b.onclick = () => { ink = +b.dataset.i; box.querySelectorAll('.ink').forEach((x) => x.classList.toggle('on', x === b)); api.vib(10); }; });
        box.querySelectorAll('.sz').forEach((b) => { b.onclick = () => { size = +b.dataset.s; box.querySelectorAll('.sz').forEach((x) => x.classList.toggle('on', x === b)); api.vib(10); }; });
        box.querySelector('#undo').onclick = () => { if (!strokes.length) return; strokes.pop(); redraw(); api.send({ k: 'undo' }); };
        box.querySelector('#wipe').onclick = () => { strokes.length = 0; redraw(); api.send({ k: 'clear' }); };
      }

      function guessUi(m) {
        const d = by(m.drawer);
        box.innerHTML = `<div class="word"><small>${esc(d.name)} está desenhando · olhe a TV</small><div class="hintp" id="hint">${hintHtml(m.hint)}</div></div>
          <div class="row" style="display:flex;gap:8px"><input class="field" id="g" style="flex:1;min-width:0;text-transform:uppercase" maxlength="30" placeholder="Seu palpite" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="send"><button class="btn primary" id="send" style="min-width:86px">Enviar</button></div>
          <div class="fb" id="fb"></div>`;
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
            box.innerHTML = `<div class="centered"><div class="big">Sua vez de desenhar!</div><p class="muted">Escolha uma palavra</p><div class="choices">${m.words.map((w, i) => `<button class="btn ${i === 0 ? 'primary' : ''}" data-i="${i}">${esc(w)}</button>`).join('')}</div></div>`;
            box.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => api.send({ k: 'pick', i: +b.dataset.i }); });
            api.vib([60, 40, 60]);
          } else if (m.k === 'wait') wait(m.text, 'Fique de olho na TV', m.drawer ? by(m.drawer) : me, 'wow');
          else if (m.k === 'draw') { end = Date.now() + m.secs * 1000; drawUi(m.word); api.vib(40); }
          else if (m.k === 'guess') { end = Date.now() + m.secs * 1000; guessUi(m); api.vib(40); }
          else if (m.k === 'hint') { const h = box.querySelector('#hint'); if (h) h.innerHTML = hintHtml(m.hint); }
          else if (m.k === 'miss') { const fb = box.querySelector('#fb'); if (fb) { fb.textContent = m.near ? 'Quase! Está muito perto' : 'Não é isso…'; fb.style.color = m.near ? '#ffd23f' : 'var(--muted)'; } if (m.near) api.vib([30, 30, 30]); }
          else if (m.k === 'right') { root.querySelector('#pts').textContent = J.fmtPts(m.total); box.innerHTML = `<div class="centered"><div class="statusbig" style="color:var(--accent)">+${m.pts}</div><div class="big">Acertou!</div><p class="muted" style="text-transform:uppercase;font-weight:900">${esc(m.word)}</p></div>`; }
          else if (m.k === 'hit') { root.querySelector('#pts').textContent = J.fmtPts(m.total); const fb = box.querySelector('#fb'); if (fb) { fb.textContent = m.name + ' acertou! +200 para você'; fb.style.color = 'var(--accent)'; } }
          else if (m.k === 'over') { root.querySelector('#pts').textContent = J.fmtPts(m.total); wait(m.word.toUpperCase(), m.drawer ? (m.n ? m.n + ' acertaram o seu rabisco' : 'Ninguém acertou desta vez') : m.got ? 'Você acertou!' : 'Era essa a palavra', me, m.got || (m.drawer && m.n) ? 'happy' : 'sad'); }
        },
      };
    },
  });
})();
