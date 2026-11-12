/* Quem Mente? — a curious question with a blank. Everyone invents a convincing lie on the phone,
   then all answers (lies + the truth) go on the TV and everyone votes for what they think is true. */
'use strict';
(() => {
  // q: the sentence with ___ for the blank · a: the truth · alt: other spellings accepted as "the truth" · f: the game's own lies
  const QUESTIONS = [
    { q: 'O animal nacional da Escócia é o ___.', a: 'unicórnio', alt: ['unicornio'], f: ['texugo', 'cervo vermelho', 'salmão'] },
    { q: 'Na década de 1830, nos Estados Unidos, o ketchup era vendido como ___.', a: 'remédio', alt: ['remedio', 'medicamento'], f: ['tinta para tecido', 'graxa de sapato', 'perfume'] },
    { q: 'Os polvos têm ___ corações.', a: 'três', alt: ['3', 'tres'], f: ['dois', 'cinco', 'oito'] },
    { q: 'A guerra mais curta da história, entre o Reino Unido e Zanzibar, durou cerca de ___ minutos.', a: '38', alt: ['trinta e oito'], f: ['12', '90', '7'] },
    { q: 'O mel encontrado em tumbas do Egito antigo, com milhares de anos, ainda estava ___.', a: 'comestível', alt: ['comestivel', 'bom para comer', 'bom'], f: ['líquido e quente', 'cheio de abelhas', 'azul'] },
    { q: 'Na Suíça é proibido ter apenas um ___, porque o animal sofre de solidão.', a: 'porquinho-da-índia', alt: ['porquinho da india', 'porco da india', 'preá'], f: ['papagaio', 'peixe-dourado', 'coelho'] },
    { q: 'Por causa do potássio, as bananas são levemente ___.', a: 'radioativas', alt: ['radioativa', 'radioativo'], f: ['magnéticas', 'alcoólicas', 'fluorescentes'] },
    { q: 'O criador da lata de Pringles pediu para ter parte das suas cinzas guardada em ___.', a: 'uma lata de Pringles', alt: ['lata de pringles', 'pringles', 'uma lata'], f: ['um pote de maionese', 'uma garrafa de Coca-Cola', 'um saco de batatas'] },
    { q: 'O coração do camarão fica na ___.', a: 'cabeça', alt: ['cabeca'], f: ['cauda', 'barriga', 'pata'] },
    { q: 'Em Vênus, um dia dura mais do que um ___.', a: 'ano', alt: ['ano de venus'], f: ['século', 'mês da Terra', 'eclipse'] },
    { q: 'No verão, a Torre Eiffel fica cerca de 15 centímetros mais ___.', a: 'alta', alt: ['alto', 'comprida'], f: ['torta', 'leve', 'escura'] },
    { q: 'O primeiro produto com código de barras lido num caixa, em 1974, foi um pacote de ___.', a: 'chiclete', alt: ['chicletes', 'goma de mascar'], f: ['cigarros', 'leite em pó', 'pilhas'] },
    { q: 'O vombate, um marsupial australiano, faz cocô em formato de ___.', a: 'cubo', alt: ['cubos', 'quadrado', 'dado'], f: ['espiral', 'estrela', 'anel'] },
    { q: 'Na Roma antiga, a urina era recolhida e usada para ___ roupas.', a: 'lavar', alt: ['limpar', 'lavar roupas', 'branquear'], f: ['tingir', 'perfumar', 'engomar'] },
    { q: 'As lontras-marinhas dormem de ___ para não se separarem na correnteza.', a: 'mãos dadas', alt: ['maos dadas', 'mao dada', 'patas dadas'], f: ['cabeça para baixo', 'boca aberta', 'costas uma na outra'] },
    { q: 'O isqueiro foi inventado antes do ___.', a: 'fósforo', alt: ['fosforo', 'palito de fosforo'], f: ['cigarro', 'cachimbo', 'fogão'] },
    { q: 'A Universidade de Oxford é mais antiga do que o Império ___.', a: 'Asteca', alt: ['asteca', 'astecas'], f: ['Romano', 'Mongol', 'Persa'] },
    { q: 'A língua de uma baleia-azul pode pesar tanto quanto um ___.', a: 'elefante', alt: ['elefante adulto'], f: ['fusca', 'cavalo', 'piano de cauda'] },
    { q: 'Em 1932, o exército da Austrália entrou em "guerra" contra ___ — e perdeu.', a: 'emus', alt: ['emu', 'os emus', 'emas'], f: ['cangurus', 'coelhos', 'gafanhotos'] },
    { q: 'As primeiras cenouras cultivadas não eram laranja: eram ___.', a: 'roxas', alt: ['roxa', 'roxo', 'purpura'], f: ['azuis', 'pretas', 'verdes'] },
    { q: 'O pintor Salvador Dalí desenhou o logotipo do pirulito ___.', a: 'Chupa Chups', alt: ['chupa chups', 'chupachups', 'chupa chup'], f: ['Pop Rocks', 'Push Pop', 'Dum Dums'] },
    { q: 'Em 1995, a batata virou o primeiro vegetal cultivado no ___.', a: 'espaço', alt: ['espaco', 'espaço sideral'], f: ['Polo Sul', 'fundo do mar', 'deserto do Saara'] },
    { q: 'Sem conseguir seguro de vida, os astronautas da Apollo 11 deixaram ___ para as famílias venderem se algo desse errado.', a: 'autógrafos', alt: ['autografos', 'autografo', 'fotos autografadas', 'envelopes autografados'], f: ['pedras da Lua', 'relógios de ouro', 'cartas lacradas'] },
    { q: 'O tubarão-da-groenlândia pode viver cerca de ___ anos.', a: '400', alt: ['quatrocentos'], f: ['90', '150', '1000'] },
    { q: 'Um raio é cerca de cinco vezes mais quente do que a superfície do ___.', a: 'Sol', alt: ['sol'], f: ['magma de um vulcão', 'planeta Mercúrio', 'núcleo da Terra'] },
    { q: 'O forno de micro-ondas nasceu quando um engenheiro notou que um(a) ___ tinha derretido no bolso dele.', a: 'barra de chocolate', alt: ['chocolate', 'doce', 'barra de doce'], f: ['vela', 'picolé', 'manteiga'] },
    { q: 'As formigas não têm ___.', a: 'pulmões', alt: ['pulmoes', 'pulmao'], f: ['sangue', 'cérebro', 'olhos'] },
    { q: 'A palavra "robô" vem do tcheco e quer dizer ___.', a: 'trabalho forçado', alt: ['trabalho forcado', 'trabalho', 'servidao', 'escravo', 'trabalho escravo'], f: ['homem de ferro', 'boneco que anda', 'ajudante'] },
    { q: 'O estado brasileiro com mais municípios é ___.', a: 'Minas Gerais', alt: ['minas', 'mg'], f: ['São Paulo', 'Bahia', 'Rio Grande do Sul'] },
    { q: 'Santos Dumont ajudou a popularizar o ___ de pulso entre os homens.', a: 'relógio', alt: ['relogio'], f: ['bracelete', 'termômetro', 'compasso'] },
    { q: 'O beija-flor é a única ave que consegue voar para ___.', a: 'trás', alt: ['tras', 'atras', 'de re'], f: ['dentro da água', 'cima em linha reta', 'os lados'] },
    { q: 'A impressão ___ do coala é quase idêntica à de um ser humano.', a: 'digital', alt: ['digitais', 'do dedo'], f: ['dos dentes', 'do pé', 'do nariz'] },
  ];
  const ROUNDS = 3;

  J.define('mente', {
    name: 'Quem Mente?', kind: 'blefe', min: 3, max: 6, unit: 'pontos',
    tagline: 'Invente uma mentira convincente e descubra qual resposta é a verdadeira.',
    grad: 'linear-gradient(135deg,#3df5a7,#3dc9ff)',
    icon: '<path d="M4 5h16v11H9l-5 4z"/><path d="M9.5 9a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.7-.9 1.2"/><path d="M12 14.6v.1"/>',
    how: [['Minta', 'Escreva no celular uma resposta falsa que pareça verdade.'], ['Vote', 'Entre as respostas, escolha a que você acha verdadeira.'], ['Pontue', '1000 por acertar a verdade. 500 por cada um que cair na sua mentira.']],
    padHow: 'Você vai escrever uma mentira convincente para cada pergunta e depois votar na resposta que acha verdadeira.',

    /* ------------------------------------------------------------------ TV */
    tv(api) {
      const { esc, norm, shuffle, el } = J;
      const bar = api.topbar(true);
      const view = el('div', 'center'); api.stage.appendChild(view);
      const qs = shuffle(QUESTIONS).slice(0, ROUNDS);
      const score = {}, fooled = {};
      api.players.forEach((p) => { score[p.id] = 0; fooled[p.id] = 0; bar.score(p, '0'); });
      let r = -1, phase = '', lies = {}, votes = {}, opts = [], q = null, tickId = 0, deadline = 0, last = {};
      const mult = () => (r === ROUNDS - 1 ? 2 : 1);
      const present = () => api.players.filter((p) => p.on);
      const html = (text) => esc(text).replace(/_{3,}/, '<u>&nbsp;</u>');
      const tell = (p, m) => { last[p.id] = m; api.send(p, m); };

      function clock(secs, done) {
        api.cancel(tickId); deadline = Date.now() + secs * 1000;
        let lastWhole = 99;
        tickId = api.every(200, () => { const left = (deadline - Date.now()) / 1000; bar.time(left); const w = Math.ceil(left); if (w <= 5 && w > 0 && w !== lastWhole) { lastWhole = w; api.sfx('tick'); } if (left <= 0) { api.cancel(tickId); bar.time(null); done(); } });
      }
      function waiters(done) {
        const box = view.querySelector('.waiters');
        if (!box) return;
        box.innerHTML = '';
        api.players.forEach((p) => { const w = el('div', 'waiter' + (done[p.id] != null ? ' done' : '')); w.appendChild(api.buddy(p, 4.6, done[p.id] != null ? 'happy' : 'wow')); w.appendChild(el('span', '', esc(p.name))); box.appendChild(w); });
      }

      function ask() {
        r++; q = qs[r]; phase = 'write'; lies = {}; votes = {};
        view.innerHTML = `<div class="kicker">Pergunta ${r + 1} de ${ROUNDS}${mult() > 1 ? ' · pontos em dobro' : ''}</div><div class="question">${html(q.q)}</div>
          <div class="kicker" style="color:var(--muted)">Escreva uma mentira convincente no celular</div><div class="waiters"></div>`;
        waiters(lies); api.sfx('reveal');
        api.players.forEach((p) => tell(p, { k: 'write', q: q.q, n: r + 1, of: ROUNDS, secs: 50 }));
        clock(50, vote);
      }

      function vote() {
        if (phase !== 'write') return;
        phase = 'vote';
        const map = new Map(); // normalized text -> option
        for (const p of api.players) { const t = lies[p.id]; if (!t) continue; const k = norm(t); if (!map.has(k)) map.set(k, { text: t, by: [], truth: false, votes: [] }); map.get(k).by.push(p); }
        const truthKey = norm(q.a);
        for (const f of shuffle(q.f)) { if (map.size >= 4) break; const k = norm(f); if (!map.has(k) && k !== truthKey) map.set(k, { text: f, by: [], truth: false, votes: [] }); }
        opts = shuffle([...map.values(), { text: q.a, by: [], truth: true, votes: [] }]);
        view.innerHTML = `<div class="kicker">Qual é a verdade?</div><div class="question" style="font-size:2.4rem">${html(q.q)}</div>
          <div class="answers">${opts.map((o, i) => `<div class="answer" data-i="${i}" style="animation-delay:${i * 0.12}s"><span class="txt">${esc(o.text)}</span><span class="who"></span></div>`).join('')}</div><div class="waiters"></div>`;
        waiters(votes); api.sfx('select');
        api.players.forEach((p) => tell(p, { k: 'vote', q: q.q, secs: 30, opts: opts.map((o, i) => ({ i, text: o.text })).filter((o) => !opts[o.i].by.includes(p)) }));
        clock(30, reveal);
      }

      function reveal() {
        if (phase !== 'vote') return;
        phase = 'reveal'; api.cancel(tickId); bar.time(null);
        const w = view.querySelector('.waiters'); if (w) w.remove();
        view.querySelector('.kicker').textContent = 'Quem caiu em quê?';
        api.players.forEach((p) => tell(p, { k: 'reveal' }));
        for (const p of api.players) { const o = opts[votes[p.id]]; if (o) o.votes.push(p); }
        const gain = {}, lines = {};
        api.players.forEach((p) => { gain[p.id] = 0; lines[p.id] = []; });
        const card = (o) => view.querySelector(`.answer[data-i="${opts.indexOf(o)}"]`);
        const order = opts.filter((o) => !o.truth && o.votes.length).sort((a, b) => a.votes.length - b.votes.length);
        opts.filter((o) => !o.truth && !o.votes.length).forEach((o) => card(o).classList.add('fade'));
        const steps = [];
        const showVoters = (o) => { const cd = card(o); view.querySelectorAll('.answer.focus').forEach((x) => x.classList.remove('focus')); cd.classList.add('focus'); const who = cd.querySelector('.who'); o.votes.forEach((p, i) => api.after(i * 180, () => { who.appendChild(api.buddy(p, 2.9)); api.sfx('pop'); })); };
        for (const o of order) {
          steps.push([900, () => { showVoters(o); api.sfx('drum'); }]);
          steps.push([1700, () => {
            const cd = card(o); cd.classList.add('lie');
            const names = o.by.map((p) => p.name).join(' e ');
            cd.appendChild(el('span', 'label', o.by.length ? 'Mentira de ' + esc(names) : 'Mentira do jogo'));
            api.sfx('bad');
            const pts = 500 * mult() * o.votes.length;
            o.by.forEach((p) => { gain[p.id] += pts; fooled[p.id] += o.votes.length; lines[p.id].push(`+${pts} · ${o.votes.map((v) => v.name).join(', ')} caiu na sua mentira`); api.fx(p, 'good', { color: p.color }); });
            o.votes.forEach((p) => { lines[p.id].push('Você caiu na mentira de ' + (names || 'o jogo')); api.fx(p, 'stamp', { text: 'Enganado!', color: '#ff4d6d' }); });
          }]);
          steps.push([1900, () => card(o).classList.add('fade')]);
        }
        const truth = opts.find((o) => o.truth);
        steps.push([1000, () => { showVoters(truth); api.sfx('drum'); }]);
        steps.push([1800, () => {
          const cd = card(truth); cd.classList.add('truth'); cd.appendChild(el('span', 'label', 'Verdade'));
          api.sfx('reveal');
          truth.votes.forEach((p) => { gain[p.id] += 1000 * mult(); lines[p.id].push(`+${1000 * mult()} · você achou a verdade`); api.fx(p, 'stamp', { text: 'Acertou!', color: '#3df5a7' }); });
          if (!truth.votes.length) api.banner('Ninguém acertou!');
        }]);
        steps.push([2200, () => {
          api.players.forEach((p) => { score[p.id] += gain[p.id]; bar.score(p, J.fmtPts(score[p.id])); tell(p, { k: 'sum', add: gain[p.id], total: score[p.id], lines: lines[p.id], truth: q.a }); });
        }]);
        steps.push([3200, () => {
          if (r + 1 < ROUNDS) ask();
          else api.end(api.players.map((p) => ({ id: p.id, pts: score[p.id], note: fooled[p.id] ? 'enganou ' + fooled[p.id] : '' })));
        }]);
        let t = 0;
        for (const [wait, fn] of steps) { t += wait; api.after(t, fn); }
      }

      return {
        start() { ask(); },
        onMsg(p, m) {
          if (m.k === 'lie' && phase === 'write') {
            const text = String(m.text || '').replace(/\s+/g, ' ').trim().slice(0, 40);
            if (!text) return;
            const k = norm(text);
            if (k === norm(q.a) || q.alt.some((a) => norm(a) === k)) { api.send(p, { k: 'truth' }); return; }
            lies[p.id] = text; tell(p, { k: 'wait', text: 'Mentira enviada!' }); api.sfx('pop'); waiters(lies);
            if (present().every((x) => lies[x.id])) { api.cancel(tickId); api.after(600, vote); }
          } else if (m.k === 'vote' && phase === 'vote' && votes[p.id] == null) {
            const i = +m.i, o = opts[i];
            if (!o || o.by.includes(p)) return;
            votes[p.id] = i; tell(p, { k: 'wait', text: 'Voto registrado!' }); api.sfx('pop'); waiters(votes);
            if (present().every((x) => votes[x.id] != null)) { api.cancel(tickId); api.after(700, reveal); }
          }
        },
        sync(p) { if (last[p.id]) api.send(p, last[p.id]); },
      };
    },

    /* ------------------------------------------------------------------ phone */
    pad(api) {
      const { root, me } = api, { esc } = J;
      root.innerHTML = `<style>
        .qm{flex:1;display:flex;flex-direction:column;gap:14px;min-height:0}
        .qm .q{font-size:21px;font-weight:800;line-height:1.25;background:rgba(255,255,255,.07);border-radius:20px;padding:16px}
        .qm .q u{text-decoration:none;border-bottom:3px solid var(--accent);padding:0 22px;margin:0 2px}
        .qm textarea{width:100%;min-height:96px;border-radius:20px;background:rgba(0,0,0,.4);border:2px solid var(--line);padding:14px 16px;font:inherit;font-size:24px;font-weight:900;color:#fff;outline:none;resize:none;text-transform:uppercase;-webkit-user-select:text;user-select:text}
        .qm textarea:focus{border-color:var(--accent)}
        .qm .tip{color:var(--muted);font-size:14px;font-weight:700;min-height:20px}
        .qm .tip.warn{color:#ffd23f}
        .vopts{flex:1;overflow:auto;display:flex;flex-direction:column;gap:10px;min-height:0}
        .vopt{width:100%;text-align:left;border-radius:18px;padding:16px;font-size:20px;font-weight:900;text-transform:uppercase;background:rgba(255,255,255,.08);border:2px solid var(--line);min-height:62px}
        .vopt:active{transform:scale(.97);border-color:var(--accent)}
        .lines{display:flex;flex-direction:column;gap:8px;width:100%} .lines div{background:rgba(255,255,255,.07);border-radius:14px;padding:10px 14px;font-weight:700;font-size:15px;text-align:left}
      </style>
      <div class="hud"><span id="mb"></span><span class="name">${esc(me.name)}</span><span class="pillv" id="pts">0</span></div><div class="qm" id="box"></div>`;
      root.querySelector('#mb').replaceWith(api.buddy(me, 40));
      const box = root.querySelector('#box');
      const qh = (t) => esc(t).replace(/_{3,}/, '<u>&nbsp;</u>');
      const wait = (title, sub) => { box.innerHTML = `<div class="centered"><span id="wb"></span><div class="big">${esc(title)}</div><p class="muted">${esc(sub || 'Olhe para a TV')}</p></div>`; box.querySelector('#wb').replaceWith(api.buddy(me, 110)); };
      return {
        start() { wait('Prepare a cara de pau', 'A primeira pergunta já vem'); },
        onMsg(m) {
          if (m.k === 'write') {
            box.innerHTML = `<div class="q">${qh(m.q)}</div><textarea id="lie" maxlength="40" placeholder="Sua mentira" autocomplete="off" autocapitalize="characters"></textarea>
              <button class="btn primary" id="send">Enviar mentira</button><div class="tip" id="tip">Escreva algo que os outros acreditem. Não escreva a verdade!</div>`;
            const ta = box.querySelector('#lie');
            const go = () => { const t = ta.value.trim(); if (!t) { ta.focus(); return; } api.send({ k: 'lie', text: t }); };
            box.querySelector('#send').onclick = go;
            ta.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } };
            api.vib(40);
          } else if (m.k === 'truth') {
            const tip = box.querySelector('#tip'); if (tip) { tip.className = 'tip warn'; tip.textContent = 'Essa é a resposta verdadeira! Invente uma mentira.'; } const ta = box.querySelector('#lie'); if (ta) { ta.value = ''; ta.focus(); } api.fx.shake(); api.vib([40, 40, 40]);
          } else if (m.k === 'wait') { wait(m.text, 'Aguardando os outros…'); api.vib(25); }
          else if (m.k === 'vote') {
            box.innerHTML = `<div class="q">${qh(m.q)}</div><div class="tip">Toque na resposta que você acha verdadeira</div><div class="vopts">${m.opts.map((o) => `<button class="vopt" data-i="${o.i}">${esc(o.text)}</button>`).join('')}</div>`;
            box.querySelectorAll('.vopt').forEach((b) => { b.onclick = () => api.send({ k: 'vote', i: +b.dataset.i }); });
            api.vib(40);
          } else if (m.k === 'reveal') wait('Olhe para a TV', 'Hora da verdade');
          else if (m.k === 'sum') {
            root.querySelector('#pts').textContent = J.fmtPts(m.total);
            box.innerHTML = `<div class="centered"><div class="statusbig" style="color:${m.add ? 'var(--accent)' : 'var(--muted)'}">+${J.fmtPts(m.add)}</div><p class="muted">A verdade era: <b style="color:#fff">${esc(m.truth)}</b></p><div class="lines">${m.lines.map((l) => `<div>${esc(l)}</div>`).join('') || '<div>Ninguém caiu na sua mentira desta vez</div>'}</div></div>`;
          }
        },
      };
    },
  });
})();
