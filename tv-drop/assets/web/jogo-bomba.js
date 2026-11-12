/* Desarme a Bomba — cooperative. One player is the technician: only that phone shows the bomb's modules (wires,
   symbols, lights…) and can touch them. The others get pieces of the manual, each a different piece. The TV shows
   the bomb from outside: clock, mistakes and which modules are still armed. Nobody can solve it alone.
   The bomb and its rules live in gamer/bomb-logic.js (tested by the thousands); the TV decides every action. */
'use strict';
(() => {
  const B = window.BombLogic;
  const sym = (i) => `<svg viewBox="0 0 24 24">${B.SYMBOLS[i]}</svg>`;
  const mmss = (s) => { s = Math.max(0, Math.ceil(s)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
  const MAX = 3;

  J.define('bomba', {
    name: 'Desarme a Bomba', kind: 'cooperativo', min: 2, max: 6, unit: 'pontos',
    tagline: 'Uma pessoa vê a bomba. As outras têm o manual.',
    grad: 'linear-gradient(135deg,#ff3b3b,#7a0f1f)',
    icon: '<circle cx="11" cy="14" r="6.5"/><path d="M15.5 9.5l2-2M17 5l1 1.5 1.8.2-1.3 1.3.3 1.8"/><path d="M8.5 12.5a3 3 0 0 1 2.5-1.5"/>',
    how: [['Descreva', 'O técnico vê a bomba no celular e conta o que aparece.'], ['Consulte', 'Cada um dos outros tem um pedaço diferente do manual.'], ['Desarme', 'Um erro custa tempo. Três erros, e tudo explode.']],
    padHow: 'Jogo em equipe: um de vocês será o técnico e verá a bomba no celular; os outros recebem pedaços do manual. Conversem!',
    settings: [
      { id: 'level', label: 'Dificuldade', options: [['facil', 'Fácil · 3 módulos'], ['medio', 'Média · 4 módulos'], ['dificil', 'Difícil · 5 módulos']] },
      { id: 'time', label: 'Tempo', options: [[180, '3 min'], [300, '5 min'], [420, '7 min']] },
    ],
    presets: { rapido: { level: 'facil', time: 180 }, normal: { level: 'medio', time: 300 }, longo: { level: 'dificil', time: 420 } },

    /* ------------------------------------------------------------------ TV */
    tv(api) {
      const { esc, el } = J;
      const view = el('div', 'bm'); api.stage.appendChild(view);
      const bomb = B.make(api.settings.level || 'medio');
      const TIME = api.settings.time || 300, PENALTY = 20;
      // the technician changes from one match to the next
      const tech = api.players.find((p) => p.id === J.fresh('bomba.tech', api.players.map((p) => p.id), 1)[0]) || api.players[0];
      const experts = api.players.filter((p) => p !== tech);
      const hands = B.deal(bomb, experts.length);
      let deadline = Date.now() + TIME * 1000, over = false, active = -1, lastBeep = 0;
      const left = () => (deadline - Date.now()) / 1000;
      view.innerHTML = `<style>
        .bm{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:3rem;padding:2rem 3rem;background:radial-gradient(circle at 50% 40%,rgba(255,40,40,.16),transparent 60%)}
        .bm.alarm{animation:bmalarm .5s 2} @keyframes bmalarm{50%{background-color:rgba(255,0,0,.35)}}
        .bm.safe{background:radial-gradient(circle at 50% 40%,rgba(61,245,167,.22),transparent 60%)}
        .bm-case{width:44rem;background:linear-gradient(160deg,#2b2d36,#15161c);border-radius:2.2rem;padding:1.8rem;border:.25rem solid #3d404d;box-shadow:0 2rem 5rem rgba(0,0,0,.6),inset 0 .2rem 0 rgba(255,255,255,.08);display:flex;flex-direction:column;gap:1.3rem}
        .bm.shake .bm-case{animation:shake .45s}
        .bm-top{display:flex;align-items:center;gap:1.4rem}
        .bm-clock{flex:1;background:#070809;border-radius:1.1rem;border:.2rem solid #000;text-align:center;font:800 6.4rem/1.15 var(--font-mono,monospace);color:#ff3b3b;text-shadow:0 0 1.6rem rgba(255,59,59,.8);letter-spacing:.06em}
        .bm.safe .bm-clock{color:#3df5a7;text-shadow:0 0 1.6rem rgba(61,245,167,.8)}
        .bm-x{display:flex;flex-direction:column;gap:.5rem} .bm-x i{width:2.6rem;height:2.6rem;border-radius:.6rem;background:#070809;display:grid;place-items:center;font:900 1.7rem/1 var(--font-mono,monospace);color:#333;font-style:normal}
        .bm-x i.on{color:#fff;background:#ff3b3b;box-shadow:0 0 1.2rem #ff3b3b}
        .bm-mods{display:grid;grid-template-columns:1fr 1fr;gap:.8rem}
        .bm-mod{background:#1b1c23;border-radius:1rem;padding:.9rem 1.1rem;display:flex;align-items:center;gap:.9rem;font-size:1.35rem;font-weight:800;border:.15rem solid #2f313c}
        .bm-mod .led{width:1.1rem;height:1.1rem;border-radius:50%;background:#ff3b3b;box-shadow:0 0 .8rem #ff3b3b;flex:none;animation:bmled 1s steps(2) infinite} @keyframes bmled{50%{opacity:.35}}
        .bm-mod.ok{color:#3df5a7;border-color:rgba(61,245,167,.5)} .bm-mod.ok .led{background:#3df5a7;box-shadow:0 0 .8rem #3df5a7;animation:none}
        .bm-mod.act{border-color:#ffc857} .bm-mod small{margin-left:auto;font-size:.9rem;color:var(--muted);font-weight:700}
        .bm-side{flex:1;max-width:30rem;display:flex;flex-direction:column;gap:1.2rem}
        .bm-role{background:var(--panel);border-radius:1.4rem;padding:1.1rem 1.3rem}
        .bm-role h3{font:800 .95rem/1 var(--font-mono,monospace);letter-spacing:.14em;text-transform:uppercase;color:var(--accent);margin-bottom:.7rem}
        .bm-who{display:flex;align-items:center;gap:.7rem;font-size:1.5rem;font-weight:900;margin-top:.3rem} .bm-who .buddy{flex:none}
        .bm-role p{color:var(--muted);font-size:1.1rem;line-height:1.35;margin-top:.5rem}
        .bm-msg{min-height:5rem;font-size:1.7rem;font-weight:900;line-height:1.2}
        .bm-msg.bad{color:#ff8fa3} .bm-msg.good{color:#3df5a7}
      </style>
      <div class="bm-case"><div class="bm-top"><div class="bm-clock">${mmss(TIME)}</div><div class="bm-x">${'<i>✗</i>'.repeat(MAX)}</div></div>
        <div class="bm-mods">${bomb.modules.map((m, i) => `<div class="bm-mod" data-i="${i}"><span class="led"></span>${esc(m.title)}<small></small></div>`).join('')}</div></div>
      <div class="bm-side"><div class="bm-role"><h3>Técnico · vê a bomba</h3><div class="bm-who" id="bt"></div><p>Descreva em voz alta o que aparece no seu celular.</p></div>
        <div class="bm-role"><h3>Manual · ${experts.length > 1 ? 'cada um tem um pedaço' : 'com o manual inteiro'}</h3><div id="be"></div><p>Leiam as regras e digam ao técnico o que fazer.</p></div>
        <div class="bm-msg">A bomba está armada.</div></div>`;
      const who = (p) => { const d = el('div', 'bm-who'); d.appendChild(api.buddy(p, 2.8)); d.appendChild(el('span', '', esc(p.name))); return d; };
      view.querySelector('#bt').replaceWith(who(tech));
      const be = view.querySelector('#be'); experts.forEach((p) => be.appendChild(who(p)));
      const clockEl = view.querySelector('.bm-clock'), msgEl = view.querySelector('.bm-msg');
      const say = (text, cls) => { msgEl.className = 'bm-msg ' + (cls || ''); msgEl.textContent = text; };

      const status = () => ({ strikes: bomb.strikes, secs: Math.max(0, Math.ceil(left())), solved: bomb.modules.map((m) => m.solved), max: MAX });
      const opMsg = () => ({ k: 'op', serial: bomb.facts.serial, batteries: bomb.facts.batteries, mods: bomb.modules.map((m) => ({ type: m.type, title: m.title, view: m.view, solved: m.solved, cut: m.state.cut || [], prog: m.state.prog || 0, need: Array.isArray(m.solution) ? m.solution.length : 0 })), ...status() });
      const manMsg = (p) => ({ k: 'man', pages: hands[experts.indexOf(p)] || [], tech: tech.id, titles: bomb.modules.map((m) => m.title), ...status() });
      const hello = (p) => api.send(p, p === tech ? opMsg() : manMsg(p));
      function paint() {
        view.querySelectorAll('.bm-x i').forEach((x, i) => x.classList.toggle('on', i < bomb.strikes));
        bomb.modules.forEach((m, i) => { const c = view.querySelector(`.bm-mod[data-i="${i}"]`); c.classList.toggle('ok', m.solved); c.classList.toggle('act', i === active && !m.solved); c.querySelector('small').textContent = m.solved ? 'desarmado' : i === active ? 'mexendo…' : 'armado'; });
      }

      function finish(won) {
        if (over) return;
        over = true;
        const secs = Math.max(0, Math.ceil(left())), solved = bomb.modules.filter((m) => m.solved).length;
        const pts = won ? 500 + secs * 5 + (MAX - bomb.strikes) * 100 : solved * 100;
        view.classList.toggle('safe', won);
        if (won) { say('Bomba desarmada! Faltavam ' + mmss(secs) + '.', 'good'); api.sfx('win'); api.fxAll('win'); }
        else { clockEl.textContent = bomb.strikes >= MAX ? 'ERRO' : '00:00'; say(bomb.strikes >= MAX ? 'Três erros. BUM!' : 'O tempo acabou. BUM!', 'bad'); api.sfx('boom'); api.fxAll('boom'); view.classList.add('shake'); }
        api.players.forEach((p) => api.send(p, { k: 'fim', won, ...status() }));
        const note = won ? `${mmss(secs)} de sobra · ${bomb.strikes} ${bomb.strikes === 1 ? 'erro' : 'erros'}` : `${solved} de ${bomb.modules.length} módulos`;
        api.after(3800, () => api.end(api.players.map((p) => ({ id: p.id, pts, note })), { title: won ? 'Bomba desarmada!' : 'A bomba explodiu!', padTitle: won ? 'Bomba desarmada!' : 'A bomba explodiu!', lost: !won }));
      }

      api.every(100, () => {
        if (over) return;
        const s = left();
        clockEl.textContent = mmss(s);
        const beat = s <= 10 ? 0.25 : s <= 30 ? 0.5 : 1;
        if (Date.now() - lastBeep >= beat * 1000) { lastBeep = Date.now(); J.Sfx.tone(s <= 30 ? 1320 : 880, 0.06, { type: 'square', vol: 0.09 }); }
        if (s <= 0) finish(false);
      });

      return {
        start() { paint(); api.players.forEach(hello); api.sfx('reveal'); },
        onMsg(p, m) {
          if (over || p !== tech) return;
          if (m.k === 'look') { active = m.i | 0; paint(); return; }
          if (m.k !== 'act') return;
          const i = m.i | 0, mod = bomb.modules[i];
          const r = B.act(bomb, i, m.a);
          if (r.ignored) return;
          active = i;
          if (!r.ok) {
            deadline -= PENALTY * 1000;
            say(`Erro em ${mod.title}! −${PENALTY} segundos`, 'bad'); api.sfx('bad'); api.fxAll('bad');
            view.classList.remove('alarm', 'shake'); void view.offsetWidth; view.classList.add('alarm', 'shake');
          } else if (r.done) { say(`${mod.title}: desarmado!`, 'good'); api.sfx('good'); api.fxAll('good', { color: '#3df5a7' }); }
          else api.sfx('pop');
          paint();
          api.send(tech, { k: 'upd', i, ok: r.ok, done: !!r.done, cut: mod.state.cut || [], prog: mod.state.prog || 0, ...status() });
          experts.forEach((x) => api.send(x, { k: 'st', ...status(), bad: !r.ok }));
          if (bomb.strikes >= MAX) finish(false);
          else if (bomb.modules.every((x) => x.solved)) finish(true);
        },
        sync(p) { if (!over) hello(p); },
        __solution: (i) => bomb.modules[i].solution, // for automated tests
      };
    },

    /* ------------------------------------------------------------------ phone */
    pad(api) {
      const { root, me } = api, { esc } = J;
      root.innerHTML = `<style>
        .bp-top{display:flex;align-items:center;gap:8px;flex:none}
        .bp-clock{font:800 26px/1 var(--font-mono,monospace);color:#ff5a5a;background:#070809;border-radius:12px;padding:8px 12px;letter-spacing:.04em}
        .bp-x{display:flex;gap:4px} .bp-x i{width:22px;height:22px;border-radius:6px;background:rgba(255,255,255,.08);display:grid;place-items:center;font-style:normal;font-weight:900;font-size:13px;color:transparent} .bp-x i.on{background:#ff3b3b;color:#fff}
        .bp-plate{flex:1;min-width:0;background:#d9dbe3;color:#16171d;border-radius:10px;padding:5px 10px;font:800 13px/1.25 var(--font-mono,monospace)} .bp-plate b{font-size:17px;letter-spacing:.1em}
        .bp-tabs{display:flex;gap:6px;overflow-x:auto;flex:none;padding-bottom:2px} .bp-tab{flex:none;min-height:40px;padding:0 12px;border-radius:12px;background:var(--panel);font-weight:800;font-size:13px;border:2px solid transparent;white-space:nowrap}
        .bp-tab.on{border-color:#ffc857} .bp-tab.ok{color:#3df5a7;background:rgba(61,245,167,.12)}
        .bp-panel{flex:1;min-height:0;overflow-y:auto;background:#1b1c23;border-radius:20px;padding:12px;display:flex;flex-direction:column;gap:10px;border:2px solid #2f313c}
        .bp-panel.ok{border-color:#3df5a7} .bp-panel h3{font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
        .bp-wire{display:flex;align-items:center;gap:10px;min-height:46px;width:100%} .bp-wire em{font-style:normal;font-weight:900;width:20px;color:var(--muted)}
        .bp-wire span{flex:1;height:16px;border-radius:8px;box-shadow:inset 0 -4px 0 rgba(0,0,0,.25),0 2px 6px rgba(0,0,0,.4)} .bp-wire small{width:74px;text-align:right;font-weight:800;font-size:12px;color:var(--muted)}
        .bp-wire.cut span{background:linear-gradient(90deg,var(--c) 0 42%,transparent 42% 58%,var(--c) 58%)!important;opacity:.55}
        .bp-syms{display:grid;grid-template-columns:1fr 1fr;gap:10px;flex:none} .bp-sym{min-height:104px;border-radius:16px;background:#d9dbe3;color:#16171d;display:grid;place-items:center} .bp-sym svg{width:56px;height:56px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
        .bp-sym.on{background:#3df5a7}
        .bp-disp{background:#070809;border-radius:12px;padding:10px;text-align:center;font:800 30px/1 var(--font-mono,monospace);letter-spacing:.3em;color:#ffd23f;min-height:52px}
        .bp-keys{display:grid;grid-template-columns:repeat(3,1fr);gap:8px} .bp-keys button{min-height:48px;border-radius:12px;background:rgba(255,255,255,.1);font-weight:900;font-size:20px} .bp-keys .go{background:#3df5a7;color:var(--ink);font-size:14px}
        .bp-info{display:flex;gap:8px;flex-wrap:wrap} .bp-info span{background:rgba(255,255,255,.08);border-radius:10px;padding:8px 12px;font-weight:800;font-size:14px} .bp-info i{display:inline-block;width:14px;height:14px;border-radius:50%;vertical-align:-2px;margin-right:6px}
        .bp-lamp{width:96px;height:96px;border-radius:50%;background:#0b0c10;border:4px solid #2f313c;align-self:center;transition:background .08s,box-shadow .08s}
        .bp-simon{display:grid;grid-template-columns:1fr 1fr;gap:10px} .bp-simon button{min-height:60px;border-radius:16px;font-weight:900;color:#16171d;text-transform:uppercase;font-size:14px;box-shadow:inset 0 -5px 0 rgba(0,0,0,.25)}
        .bp-dots{display:flex;gap:6px;justify-content:center} .bp-dots i{width:12px;height:12px;border-radius:50%;background:rgba(255,255,255,.15)} .bp-dots i.on{background:#3df5a7}
        .bp-big{width:150px;height:150px;border-radius:50%;align-self:center;font-weight:900;font-size:18px;color:#16171d;box-shadow:inset 0 -10px 0 rgba(0,0,0,.25),0 8px 22px rgba(0,0,0,.5);flex:none}
        .bp-big:active{transform:scale(.95)} .bp-count{text-align:center;font-weight:900;font-size:18px}
        .bp-row{display:flex;gap:8px} .bp-row .btn{flex:1;min-height:48px;font-size:15px}
        .mn-page{background:#f1ead8;color:#2a2416;border-radius:16px;padding:12px 14px;display:flex;flex-direction:column;gap:8px}
        .mn-page h3{font-size:18px} .mn-page.ok{opacity:.45} .mn-page p{font-size:14px;line-height:1.35}
        .mn-page em{font-style:normal;font-weight:800;font-size:12px;background:#2a2416;color:#f1ead8;border-radius:999px;padding:3px 10px;align-self:flex-start}
        .mn-page li{font-size:16px;font-weight:700;line-height:1.3;margin:6px 0 6px 2px;list-style:none;border-left:4px solid #c9502f;padding-left:8px}
        .mn-page table{border-collapse:collapse;width:100%;font-size:14px;font-weight:800} .mn-page td,.mn-page th{border:1.5px solid #2a2416;padding:6px 4px;text-align:center} .mn-page th{background:#2a2416;color:#f1ead8;font-size:11px}
        .mn-page td i{display:inline-block;width:12px;height:12px;border-radius:50%;vertical-align:-1px;margin-right:4px;border:1px solid #2a2416}
        .mn-cols{display:flex;gap:10px} .mn-col{flex:1;border:1.5px solid #2a2416;border-radius:10px;padding:6px;text-align:center} .mn-col b{font-size:12px;display:block;margin-bottom:4px} .mn-col svg{display:block;width:38px;height:38px;margin:4px auto;fill:none;stroke:#2a2416;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
        .mn-list{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:10px}
        @media (orientation:landscape) and (max-height:540px){.bp-panel{flex-direction:row;flex-wrap:wrap;align-content:flex-start}.bp-panel>*{flex:1 1 44%}.bp-panel h3{flex-basis:100%}.bp-big{width:110px;height:110px;flex:none}.bp-lamp{width:64px;height:64px;flex:none}.bp-keys{grid-template-columns:repeat(6,1fr);flex-basis:100%}.bp-keys button{min-height:40px}.bp-syms{grid-template-columns:repeat(4,1fr);flex-basis:100%}.bp-sym{min-height:84px}.bp-wire{flex:1 1 44%;min-height:38px}.bp-plate{flex:none}.mn-list{display:grid;grid-template-columns:1fr 1fr;align-content:start}}
      </style><div class="bp-top"><div class="bp-clock" id="ck">--:--</div><div class="bp-x" id="xs"></div><div class="bp-plate" id="plate" hidden></div></div><div class="gbox" id="box"></div>`;
      const box = root.querySelector('#box'), ckEl = root.querySelector('#ck'), xs = root.querySelector('#xs'), plate = root.querySelector('#plate');
      let end = 0, S = null, tab = 0, counts = {}, typed = {}, live = true, flashAt = Date.now();
      api.every(200, () => { if (live && end) ckEl.textContent = mmss((end - Date.now()) / 1000); });
      const status = (m) => { end = Date.now() + m.secs * 1000; xs.innerHTML = Array.from({ length: m.max }, (_, i) => `<i class="${i < m.strikes ? 'on' : ''}">✗</i>`).join(''); };
      const dot = (c) => `<i style="background:${B.COLORS[c]}"></i>`;

      /* ---- technician ---- */
      function drawOp() {
        box.innerHTML = `<div class="bp-tabs">${S.mods.map((m, i) => `<button class="bp-tab ${i === tab ? 'on' : ''} ${m.solved ? 'ok' : ''}" data-i="${i}">${m.solved ? '✓ ' : ''}${esc(m.title)}</button>`).join('')}</div><div class="bp-panel ${S.mods[tab].solved ? 'ok' : ''}" id="panel"></div>`;
        box.querySelectorAll('.bp-tab').forEach((b) => { b.onclick = () => { tab = +b.dataset.i; flashAt = Date.now(); api.send({ k: 'look', i: tab }); drawOp(); api.vib(10); }; });
        const m = S.mods[tab], p = box.querySelector('#panel'), act = (a) => { api.send({ k: 'act', i: tab, a }); api.vib(25); };
        if (m.solved) { p.innerHTML = `<div class="centered"><div class="statusbig" style="color:#3df5a7">✓</div><div class="big">${esc(m.title)} desarmado</div></div>`; return; }
        if (m.type === 'fios') {
          p.innerHTML = `<h3>Fios · toque para cortar</h3>${m.view.colors.map((c, i) => `<button class="bp-wire ${m.cut[i] ? 'cut' : ''}" data-w="${i}" style="--c:${B.COLORS[c]}" ${m.cut[i] ? 'disabled' : ''}><em>${i + 1}</em><span style="background:${B.COLORS[c]}"></span><small>${c}${m.cut[i] ? ' ✂' : ''}</small></button>`).join('')}`;
          p.querySelectorAll('.bp-wire').forEach((b) => { b.onclick = () => act({ cut: +b.dataset.w }); });
        } else if (m.type === 'simbolos') {
          p.innerHTML = `<h3>Símbolos · aperte na ordem certa (${m.prog} de 4)</h3><div class="bp-syms">${m.view.syms.map((s) => `<button class="bp-sym" data-s="${s}">${sym(s)}</button>`).join('')}</div>`;
          p.querySelectorAll('.bp-sym').forEach((b) => { b.onclick = () => { b.classList.add('on'); act({ press: +b.dataset.s }); }; });
        } else if (m.type === 'senha') {
          const t = typed[tab] || '';
          p.innerHTML = `<h3>Senha de 4 números</h3><div class="bp-info"><span>${dot(m.view.light)}Luz ${m.view.light}</span><span>Palavra: ${esc(m.view.word)}</span></div><div class="bp-disp">${t.padEnd(4, '·')}</div><div class="bp-keys">${'123456789'.split('').map((d) => `<button data-d="${d}">${d}</button>`).join('')}<button data-d="x">⌫</button><button data-d="0">0</button><button class="go" data-d="ok" ${t.length === 4 ? '' : 'disabled'}>Enviar</button></div>`;
          p.querySelectorAll('[data-d]').forEach((b) => { b.onclick = () => { const d = b.dataset.d; if (d === 'ok') { act({ code: typed[tab] }); typed[tab] = ''; } else typed[tab] = d === 'x' ? t.slice(0, -1) : (t + d).slice(0, 4); api.vib(8); drawOp(); }; });
        } else if (m.type === 'cores') {
          p.innerHTML = `<h3>A luz pisca uma sequência · repete sozinha</h3><div class="bp-lamp" id="lamp"></div><div class="bp-dots">${Array.from({ length: m.need }, (_, i) => `<i class="${i < m.prog ? 'on' : ''}"></i>`).join('')}</div><div class="bp-simon">${B.SIMON.map((c) => `<button data-c="${c}" style="background:${B.COLORS[c]}">${c}</button>`).join('')}</div>`;
          p.querySelectorAll('[data-c]').forEach((b) => { b.onclick = () => act({ press: b.dataset.c }); });
        } else if (m.type === 'botao') {
          const n = counts[tab] || 0;
          p.innerHTML = `<h3>Botão · conte os apertos e confirme</h3><button class="bp-big" id="big" style="background:${B.COLORS[m.view.color]}">${esc(m.view.label)}</button><div class="bp-info" style="justify-content:center"><span>${dot(m.view.color)}Botão ${m.view.color}</span></div><div class="bp-count">Apertos: ${n}</div><div class="bp-row"><button class="btn" id="zero">Zerar</button><button class="btn primary" id="conf" ${n ? '' : 'disabled'}>Confirmar</button></div>`;
          p.querySelector('#big').onclick = () => { counts[tab] = Math.min(9, n + 1); api.vib(15); drawOp(); };
          p.querySelector('#zero').onclick = () => { counts[tab] = 0; drawOp(); };
          p.querySelector('#conf').onclick = () => { act({ n: counts[tab] }); counts[tab] = 0; };
        }
      }
      // the lamp of the color sequence: on 0.6 s, off 0.25 s, a pause, and again
      api.every(60, () => {
        const lamp = box.querySelector('#lamp');
        if (!lamp || !S || S.mods[tab].type !== 'cores') return;
        const seq = S.mods[tab].view.seq, cycle = seq.length * 850 + 1500, t = (Date.now() - flashAt) % cycle, i = Math.floor(t / 850);
        const on = i < seq.length && t % 850 < 600;
        lamp.style.background = on ? B.COLORS[seq[i]] : '#0b0c10'; lamp.style.boxShadow = on ? '0 0 30px ' + B.COLORS[seq[i]] : 'none';
      });

      /* ---- experts ---- */
      function drawManual(m) {
        const solved = (title) => (S.solved || [])[m.titles.indexOf(title)];
        const page = (p) => {
          let body = '';
          if (p.type === 'text') body = `<ul>${p.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`;
          else if (p.type === 'table') body = `<table><tr>${p.head.map((x) => `<th>${esc(x)}</th>`).join('')}</tr>${p.rows.map((r) => `<tr>${r.map((x) => `<td>${B.COLORS[x] ? dot(x) : ''}${esc(x)}</td>`).join('')}</tr>`).join('')}</table>`;
          else body = `<div class="mn-cols">${p.cols.map((c) => `<div class="mn-col"><b>${esc(c.name)}</b>${c.syms.map(sym).join('')}</div>`).join('')}</div>`;
          const part = p.type === 'text' ? 'regras' : p.type === 'table' ? 'linhas' : 'colunas';
          return `<div class="mn-page ${solved(p.title) ? 'ok' : ''}"><h3>${solved(p.title) ? '✓ ' : ''}${esc(p.title)}</h3>${p.have < p.total ? `<em>Você tem ${p.have} de ${p.total} ${part}</em>` : ''}<p>${esc(p.intro)}</p>${body}</div>`;
        };
        box.innerHTML = `<div class="sect" style="margin:0">Seu pedaço do manual · técnico: ${esc((api.players.find((p) => p.id === m.tech) || {}).name || '')}</div><div class="mn-list">${m.pages.map(page).join('') || '<p class="muted">Sem páginas para você nesta bomba: ajude a conferir!</p>'}</div>`;
      }

      let man = null;
      return {
        start() { box.innerHTML = '<div class="centered"><div class="big">Armando a bomba…</div></div>'; },
        stop() { live = false; },
        onMsg(m) {
          if (m.k === 'op') { S = m; status(m); plate.hidden = false; plate.innerHTML = `Nº de série <b>${esc(m.serial)}</b><br>Pilhas: <b>${m.batteries}</b>`; if (tab >= m.mods.length) tab = 0; drawOp(); api.vib([60, 40, 60]); }
          else if (m.k === 'upd') { if (!S) return; status(m); const x = S.mods[m.i]; x.cut = m.cut; x.prog = m.prog; x.solved = m.done || x.solved; S.solved = m.solved; drawOp(); }
          else if (m.k === 'man') { man = m; S = { solved: m.solved }; status(m); drawManual(m); api.vib(40); }
          else if (m.k === 'st') { status(m); if (man) { S = { solved: m.solved }; const sc = box.querySelector('.mn-list'), y = sc ? sc.scrollTop : 0; drawManual(man); const s2 = box.querySelector('.mn-list'); if (s2) s2.scrollTop = y; } }
          else if (m.k === 'fim') { live = false; status(m); ckEl.textContent = m.won ? mmss(m.secs) : 'BUM'; box.innerHTML = `<div class="centered"><span id="fb"></span><div class="big">${m.won ? 'Bomba desarmada!' : 'A bomba explodiu!'}</div></div>`; box.querySelector('#fb').replaceWith(api.buddy(me, 110, m.won ? 'happy' : 'dead')); }
        },
      };
    },
  });
})();
