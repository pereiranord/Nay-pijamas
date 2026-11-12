/* Leilão Maluco — everyone starts with the same play money. The TV shows a closed box with two clues and an
   appraisal; each player sends a secret bid on the phone; the highest takes the box and only then it is opened:
   treasure, junk or a cursed thing that costs money. Surprise events change the rules of a round.
   Play money only: nothing here is bought or sold for real. */
'use strict';
(() => {
  // [emoji, name, value, what it is, clue, clue]
  const ITEMS = [
    ['👑', 'Coroa do Rei Esquecido', 2400, 'Ouro maciço e 37 rubis. O rei esqueceu no ônibus.', 'Já esteve na cabeça de alguém importante', 'Brilha mesmo no escuro'],
    ['💎', 'Diamante do Tamanho de um Limão', 2000, 'Lapidado por um joalheiro que nunca errou.', 'Cabe na palma da mão', 'É a coisa mais dura desta sala'],
    ['🏺', 'Vaso da Dinastia Perdida', 1800, 'Três mil anos sem um arranhão. Não derrube.', 'Tem mais de três mil anos', 'Quebra fácil'],
    ['🗺️', 'Mapa do Tesouro Verdadeiro', 1600, 'O X marca um lugar que existe mesmo.', 'É feito de papel velho', 'Tem um X desenhado'],
    ['🎻', 'Violino do Maestro Fantasma', 1500, 'Só existem quatro iguais no mundo.', 'Faz barulho quando alguém sabe usar', 'É de madeira muito antiga'],
    ['🚀', 'Foguete de Bolso Funcionando', 2200, 'Leva uma pessoa até a Lua. Sem volta inclusa.', 'Veio de um laboratório secreto', 'Faz MUITO barulho'],
    ['🦖', 'Ovo de Dinossauro Intacto', 1700, 'Os cientistas estão brigando por ele.', 'É mais velho do que qualquer país', 'É redondo e pesado'],
    ['🖼️', 'Quadro do Pintor Misterioso', 1300, 'Ninguém entende, todo mundo quer.', 'Fica pendurado na parede', 'Ninguém sabe o que significa'],
    ['⌚', 'Relógio que Adianta a Sorte', 1250, 'De ouro, com ponteiros de platina.', 'Fica no pulso', 'Marca mais do que as horas'],
    ['🏆', 'Taça do Campeonato Impossível', 1400, 'Ganhou quem nunca tinha ganhado nada.', 'Já foi levantada por um time inteiro', 'É dourada'],
    ['🎸', 'Guitarra Autografada', 900, 'Assinada pela banda inteira, inclusive o baterista.', 'Tem rabiscos de caneta', 'Tem seis cordas'],
    ['📜', 'Carta de um Imperador', 850, 'Reclamando do preço do pão. Histórica.', 'Foi escrita à mão', 'O autor já morreu faz tempo'],
    ['🪙', 'Saco de Moedas Antigas', 800, 'Trinta moedas de prata de um navio naufragado.', 'Faz barulho de metal', 'Passou séculos debaixo d\'água'],
    ['🧸', 'Urso de Pelúcia Raríssimo', 750, 'Edição de 1902. Só falta um olho.', 'É fofo', 'É mais velho que a sua avó'],
    ['📷', 'Câmera do Primeiro Fotógrafo', 700, 'Ainda tira foto, se você esperar oito horas.', 'Tem uma lente', 'É uma caixa de madeira'],
    ['🎩', 'Cartola de Mágico Profissional', 650, 'Com coelho incluso. O coelho é sindicalizado.', 'Algo mora dentro dele', 'Já foi aplaudido de pé'],
    ['🛵', 'Lambreta Vermelha de 1960', 900, 'Pega na primeira pedalada. Quase sempre.', 'Tem duas rodas', 'É vermelha'],
    ['♟️', 'Xadrez de Marfim e Ébano', 600, 'Faltava um peão; acharam embaixo do sofá.', 'São 32 peças', 'É preto e branco'],
    ['📻', 'Rádio que Pega 1950', 550, 'Só toca músicas de setenta anos atrás.', 'Tem um botão que gira', 'Funciona sem internet'],
    ['🥇', 'Medalha Olímpica Perdida', 950, 'O atleta ainda está procurando.', 'Alguém suou muito por isso', 'Fica pendurado no pescoço'],
    ['🧭', 'Bússola de Pirata', 500, 'Aponta para onde você mais quer ir.', 'Cabe no bolso', 'Tem uma agulha que treme'],
    ['🎹', 'Piano de Parede Afinado', 800, 'Afinado ontem. Entrega por sua conta.', 'Pesa mais que um sofá', 'Tem teclas'],
    ['🕰️', 'Relógio de Pêndulo da Vovó', 400, 'Bate as horas com meia hora de atraso.', 'Faz tic-tac', 'Era de uma avó'],
    ['📚', 'Coleção de Gibis Completa', 380, 'Do número 1 ao 300, sem orelhas.', 'É feito de papel', 'São trezentos iguais, mas diferentes'],
    ['🪑', 'Cadeira de Diretor de Cinema', 300, 'Quem senta começa a mandar em todo mundo.', 'Dá para sentar', 'Dobra no meio'],
    ['🎮', 'Videogame de 1985 na Caixa', 420, 'Com duas fitas e o cheirinho original.', 'Tem botões', 'Ficou guardado em um armário'],
    ['🧥', 'Casaco de Astro do Rock', 350, 'Franjas, brilhos e um chiclete no bolso.', 'É de vestir', 'Já subiu em muitos palcos'],
    ['🚲', 'Bicicleta de Corrida', 320, 'Leve como uma pena, sem a pena.', 'Tem duas rodas', 'Anda sem gasolina'],
    ['🍷', 'Garrafa da Safra Lendária', 450, 'Ninguém teve coragem de abrir.', 'É de vidro', 'Está fechada há décadas'],
    ['🪞', 'Espelho que Elogia', 280, 'Diz que você está ótimo. Sempre.', 'Você se vê nele', 'Ele fala'],
    ['🔭', 'Telescópio de Varanda', 260, 'Dá para ver os anéis de Saturno e o vizinho.', 'Tem lentes', 'Aponta para cima'],
    ['🎳', 'Bola de Boliche da Sorte', 180, 'Só faz strike. Em pista inclinada.', 'É redonda e pesada', 'Tem três furos'],
    ['☂️', 'Guarda-chuva de Bengala', 150, 'Elegante. Abre quando quer.', 'Protege da chuva', 'Tem um cabo curvo'],
    ['🧳', 'Mala de Viagem com Adesivos', 200, 'Já foi a 40 países. Você não.', 'Tem rodinhas', 'Já viajou mais que você'],
    ['🎲', 'Dados Viciados', 220, 'Sempre dão seis. Use com moderação.', 'São pequenos e têm pontinhos', 'Vêm em par'],
    ['🪴', 'Samambaia Premiada', 160, 'Campeã estadual de samambaias de 2019.', 'Precisa de água', 'É verde'],
    ['🥁', 'Bateria de Garagem', 240, 'Os vizinhos pagariam para você não levar.', 'Faz barulho', 'Batem nela'],
    ['🧲', 'Ímã Gigante de Ferro-velho', 130, 'Gruda em tudo, inclusive no seu celular.', 'Atrai coisas', 'É pesado'],
    ['👢', 'Bota de Vaqueiro (só o pé esquerdo)', 60, 'O direito foi leiloado em outro lugar.', 'É de couro', 'Vem sozinho'],
    ['🧦', 'Meia Furada do Tio', 0, 'Furada no dedão. Lavada, pelo menos.', 'É de vestir', 'Tem um buraco'],
    ['🥫', 'Lata de Ar da Praia', 10, 'Ar legítimo de Copacabana, enlatado em 1998.', 'Está fechado há décadas', 'Veio da praia'],
    ['🪨', 'Pedra Comum', 0, 'Uma pedra. É isso.', 'É mais velho do que qualquer país', 'É a coisa mais dura desta sala'],
    ['📎', 'Clipe de Papel Torto', 0, 'Já foi reto um dia.', 'É de metal', 'Cabe no bolso'],
    ['🧻', 'Rolo de Papel Higiênico (meio)', 5, 'Meio rolo. Folha simples.', 'É feito de papel', 'É branco'],
    ['🍌', 'Casca de Banana Emoldurada', 20, 'Arte contemporânea, segundo o vendedor.', 'Fica pendurado na parede', 'Ninguém sabe o que significa'],
    ['🔑', 'Chave de uma Porta que Não Existe', 15, 'Abre alguma coisa, em algum lugar. Talvez.', 'É de metal', 'Abre alguma coisa'],
    ['📼', 'Fita de Vídeo sem Etiqueta', 30, 'Três horas de um casamento de desconhecidos.', 'Ficou guardado em um armário', 'Tem horas de gravação'],
    ['🧢', 'Boné de Brinde de Posto', 10, 'Tamanho único que não serve em ninguém.', 'É de vestir', 'Foi de graça para o primeiro dono'],
    ['🪥', 'Escova de Dentes Usada', 0, 'Pouco usada, garante o vendedor.', 'Tem cerdas', 'Fica no banheiro'],
    ['🎈', 'Balão Murcho de Festa', 0, 'A festa foi boa. Faz tempo.', 'Já esteve em uma festa', 'Era redondo'],
    ['📞', 'Lista Telefônica de 1994', 25, 'Mil páginas de números que não atendem mais.', 'É feito de papel velho', 'Tem milhares de nomes'],
    ['🧊', 'Cubo de Gelo Derretendo', 0, 'Era um cubo de gelo quando o leilão começou.', 'É gelado', 'Não vai durar muito'],
    ['🥄', 'Colher Torta de Mágico', 40, 'O mágico não conseguiu desentortar.', 'É de metal', 'Já foi aplaudido de pé'],
    ['📺', 'TV de Tubo que Só Pega Chuvisco', 35, 'Pesa 40 quilos. Chuvisco em cores.', 'Pesa mais que um sofá', 'Tem botões'],
    ['🧯', 'Extintor Vencido', 20, 'Venceu em 2003. Decorativo.', 'É vermelho', 'Pode salvar o dia (ou não)'],
    ['🪦', 'Estatueta Amaldiçoada', -300, 'Tudo dá errado para quem a leva. Começando pela carteira.', 'É mais velho que a sua avó', 'Ninguém quis ficar com ela'],
    ['🐝', 'Caixa de Abelhas Bravas', -200, 'Estavam dormindo. Não estão mais.', 'Algo mora dentro dele', 'Faz barulho'],
    ['🧾', 'Conta de Luz Atrasada', -250, 'Agora é sua. Com juros.', 'É feito de papel', 'Alguém estava doido para se livrar disso'],
    ['🦨', 'Gambá de Estimação Nervoso', -150, 'Lindo. Até se assustar.', 'É fofo', 'Ninguém quis ficar com ele'],
    ['🕳️', 'Buraco Portátil', -100, 'Você caiu dentro. A queda custou caro.', 'Cabe no bolso', 'Não dá para ver o fundo'],
    ['👻', 'Fantasma Inquilino', -350, 'Vem com a caixa. Não paga aluguel e come tudo.', 'Algo mora dentro dele', 'Veio de uma casa antiga'],
    ['🧨', 'Rojão Aceso', -200, 'Aceso. Era para ter avisado antes.', 'Faz MUITO barulho', 'Não vai durar muito'],
    ['🐘', 'Elefante Alugado (diária vencida)', -400, 'O dono cobra a diária de quem estiver com ele.', 'Pesa mais que um sofá', 'Come sem parar'],
    ['🧙', 'Varinha de Mágico de Verdade', 1900, 'Funciona. Não pergunte como testaram.', 'É de madeira muito antiga', 'Já foi aplaudido de pé'],
    ['🛸', 'Peça de Disco Voador', 2100, 'O governo nega que isso exista.', 'Veio de um laboratório secreto', 'Não é deste planeta'],
    ['🦜', 'Papagaio que Sabe Senhas', 700, 'Decorou a senha do banco de três milionários.', 'Ele fala', 'É verde'],
    ['🍫', 'Barra de Chocolate de 5 kg', 120, 'Vence amanhã. Boa sorte.', 'É doce', 'Não vai durar muito'],
    ['🪗', 'Sanfona de Forró Pé de Serra', 480, 'Já animou mil festas juninas.', 'Faz barulho quando alguém sabe usar', 'Já esteve em muitas festas'],
    ['⚽', 'Bola da Final de 1970', 1100, 'Com a marca da chuteira que fez o gol.', 'É redonda', 'Alguém suou muito por isso'],
    ['🧵', 'Carretel de Linha Dourada', 90, 'Dourada na cor. Poliéster na verdade.', 'É dourada', 'Cabe na palma da mão'],
    ['🗿', 'Estátua de Jardim Séria', 170, 'Encara as visitas. Espanta os pombos.', 'É de pedra', 'Fica no quintal'],
    ['🎟️', 'Ingresso para um Show de 1987', 70, 'O show foi ótimo. Você perdeu.', 'É feito de papel', 'O evento já acabou'],
  ];
  const EVENTS = {
    normal: null,
    relampago: ['Leilão relâmpago', 'Só 8 segundos para dar o lance!'],
    misterio: ['Item misterioso', 'Nenhuma pista. Só coragem.'],
    oportunidade: ['Rodada de oportunidade', 'Quem levar paga só a METADE do lance.'],
    raro: ['Item extremamente raro', 'O leiloeiro garante: vale uma fortuna.'],
    falsa: null, // looks like a normal round; the lie is told at the end
  };
  const money = (n) => (n < 0 ? '−$' : '$') + J.fmtPts(Math.abs(n));

  J.define('leilao', {
    name: 'Leilão Maluco', kind: 'blefe', min: 2, max: 6, unit: 'moedas',
    tagline: 'Dê lances em caixas misteriosas. Algumas valem ouro.',
    grad: 'linear-gradient(135deg,#e8c15a,#1f7a57)',
    icon: '<path d="M13 5l6 6M10.5 7.5l6 6M4 20l8-8"/><path d="M11.5 6.5l6 6-2 2-6-6z"/><path d="M14 21h7"/>',
    how: [['Avalie', 'Duas pistas e uma avaliação do leiloeiro sobre a caixa fechada.'], ['Dê lances', 'Em segredo, pelo celular. O maior leva.'], ['Revele', 'Tesouro ou tranqueira? Ganha quem terminar mais rico.']],
    padHow: 'Você tem dinheiro de mentira. Dê lances secretos nas caixas misteriosas: no fim, vale o dinheiro que sobrou mais o valor do que você comprou.',
    settings: [
      { id: 'items', label: 'Caixas', options: [[6, '6'], [8, '8'], [12, '12']] },
      { id: 'start', label: 'Dinheiro inicial', options: [[1000, '$1.000'], [2000, '$2.000']] },
      { id: 'secs', label: 'Tempo do lance', options: [[15, '15 s'], [20, '20 s'], [30, '30 s']] },
    ],
    presets: { rapido: { items: 6, start: 1000, secs: 15 }, normal: { items: 8, start: 1000, secs: 20 }, longo: { items: 12, start: 2000, secs: 30 } },

    /* ------------------------------------------------------------------ TV */
    tv(api) {
      const { esc, el, shuffle } = J;
      const bar = api.topbar(true);
      const view = el('div', 'center lm'); api.stage.appendChild(view);
      view.insertAdjacentHTML('beforebegin', `<style>
        .lm{gap:1rem}
        .lm-event{font:800 1.2rem/1 var(--font-mono,monospace);letter-spacing:.14em;text-transform:uppercase;background:#e8c15a;color:#1a1405;border-radius:999px;padding:.6rem 1.4rem;animation:pop .4s both}
        .lm-box{width:14rem;height:14rem;border-radius:2rem;background:linear-gradient(145deg,#8a5a2b,#4f3115);display:grid;place-items:center;font-size:8rem;box-shadow:0 1.6rem 4rem rgba(0,0,0,.55),inset 0 -1rem 0 rgba(0,0,0,.22),inset 0 .3rem 0 rgba(255,255,255,.18);position:relative}
        .lm-box::before{content:'';position:absolute;left:0;right:0;top:32%;height:1.2rem;background:#e8c15a;box-shadow:0 .3rem 0 rgba(0,0,0,.25)}
        .lm-box.closed{animation:lmshake 2.2s ease-in-out infinite} @keyframes lmshake{0%,84%,100%{transform:none}88%{transform:rotate(-5deg)}92%{transform:rotate(5deg)}96%{transform:rotate(-3deg)}}
        .lm-box.open{background:radial-gradient(circle,#fff8dc,#e8c15a);animation:pop .5s both} .lm-box.open::before{display:none}
        .lm-box.bad{background:radial-gradient(circle,#ffd6de,#ff4d6d)}
        .lm-box span{position:relative;z-index:1}
        .lm-clues{display:flex;gap:.8rem;flex-wrap:wrap;justify-content:center;max-width:64rem}
        .lm-clues span{background:var(--panel);border-radius:1rem;padding:.7rem 1.3rem;font-size:1.45rem;font-weight:800;animation:rise .4s both}
        .lm-est{font-size:1.3rem;color:var(--muted);font-weight:800}
        .lm-name{font-size:2.8rem;font-weight:900;text-align:center;line-height:1.1} .lm-desc{font-size:1.4rem;color:var(--muted);text-align:center;max-width:52rem}
        .lm-val{font-size:4rem;font-weight:900;color:#3df5a7} .lm-val.neg{color:#ff6b84}
        .lm-bids{display:flex;gap:1rem;align-items:flex-end;justify-content:center;min-height:9rem}
        .lm-bid{display:flex;flex-direction:column;align-items:center;gap:.3rem;font-weight:900;font-size:1.3rem;animation:rise .35s both;padding:.6rem .9rem;border-radius:1.1rem}
        .lm-bid.win{background:rgba(232,193,90,.22);box-shadow:0 0 0 .2rem #e8c15a} .lm-bid small{color:var(--muted);font-size:1rem}
        .lm-sold{font-size:2rem;font-weight:900;text-align:center}
      </style>`);
      const N = api.settings.items || 8, START = api.settings.start || 1000, SECS = api.settings.secs || 20;
      // the lot: mostly ordinary things, some treasures, some junk and a couple of cursed ones
      const fresh = J.fresh('leilao', ITEMS.map((x) => x[1]), ITEMS.length).map((n) => ITEMS.find((x) => x[1] === n));
      const tier = (lo, hi) => fresh.filter((x) => x[2] >= lo && x[2] <= hi);
      const want = { rare: Math.max(1, Math.round(N * 0.2)), good: Math.round(N * 0.25), bad: Math.max(1, Math.round(N * 0.15)), junk: Math.round(N * 0.2) };
      let lot = [...tier(1200, 9999).slice(0, want.rare), ...tier(450, 1199).slice(0, want.good), ...tier(-999, -1).slice(0, want.bad), ...tier(0, 99).slice(0, want.junk)];
      lot = shuffle(lot.concat(shuffle(tier(100, 449)).slice(0, Math.max(0, N - lot.length)))).slice(0, N);
      const events = lot.map(() => 'normal');
      const specials = shuffle(['relampago', 'misterio', 'oportunidade', 'falsa', 'relampago', 'oportunidade', 'misterio']).slice(0, Math.max(2, Math.round(N * 0.45)));
      shuffle(lot.map((_, i) => i).filter((i) => i > 0)).slice(0, specials.length).forEach((i, k) => { events[i] = specials[k]; });
      lot.forEach((x, i) => { if (x[2] >= 1200 && events[i] === 'normal' && Math.random() < 0.6) events[i] = 'raro'; if (events[i] === 'falsa' && x[2] >= 450) events[i] = 'normal'; });

      const cash = {}, bought = {}, last = {};
      api.players.forEach((p) => { cash[p.id] = START; bought[p.id] = []; });
      const wealth = (p) => cash[p.id] + bought[p.id].reduce((s, x) => s + x[2], 0);
      const paintBar = () => api.players.forEach((p) => bar.score(p, money(wealth(p))));
      let r = -1, phase = '', bids = {}, ck = null, item = null, ev = 'normal', shown = null;
      const tell = (p, m) => { last[p.id] = m; api.send(p, m); };
      const present = () => api.players.filter((p) => p.on);
      const mine = (p) => ({ cash: cash[p.id], wealth: wealth(p), bought: bought[p.id].map((x) => [x[0], x[1], x[2]]) });

      function show() {
        r++; phase = 'show'; bids = {}; item = lot[r]; ev = events[r];
        // what the auctioneer says: the truth, nothing (mystery) or the clues of a treasure (false offer)
        const liar = ev === 'falsa' ? J.pick(ITEMS.filter((x) => x[2] >= 900)) : item;
        const lo = Math.max(0, Math.round((liar[2] * J.rand(0.25, 0.7)) / 50) * 50), hi = Math.max(lo + 200, Math.round((Math.abs(liar[2]) * J.rand(1.3, 2.4) + 150) / 50) * 50);
        shown = ev === 'misterio' ? { clues: [], est: '' } : { clues: shuffle([liar[4], liar[5]]), est: `Avaliação do leiloeiro: entre ${money(lo)} e ${money(hi)}` };
        const E = EVENTS[ev];
        view.innerHTML = `<div class="kicker">Caixa ${r + 1} de ${N}</div>${E ? `<div class="lm-event">${esc(E[0])} · ${esc(E[1])}</div>` : ''}<div class="lm-box closed"><span>?</span></div>
          <div class="lm-clues">${shown.clues.map((c, i) => `<span style="animation-delay:${0.5 + i * 0.5}s">${esc(c)}</span>`).join('') || '<span>Sem pistas. Sem avaliação. Sem garantia.</span>'}</div><div class="lm-est">${esc(shown.est)}</div><div class="waiters"></div>`;
        api.sfx(E ? 'power' : 'reveal');
        api.players.forEach((p) => tell(p, { k: 'wait', text: E ? E[0] : 'Nova caixa', sub: E ? E[1] : 'Veja as pistas na TV', ...mine(p) }));
        api.after(E ? 3400 : 2600, bidding);
      }

      function bidding() {
        phase = 'bid';
        const secs = ev === 'relampago' ? 8 : SECS;
        J.waiters(api, view.querySelector('.waiters'), bids);
        api.players.forEach((p) => tell(p, { k: 'bid', secs, clues: shown.clues, est: shown.est, event: EVENTS[ev] ? EVENTS[ev][0] : '', half: ev === 'oportunidade', n: r + 1, of: N, ...mine(p) }));
        ck = J.clock(api, bar, secs, sell);
      }

      function sell() {
        if (phase !== 'bid') return;
        phase = 'reveal'; if (ck) ck.stop();
        const list = api.players.map((p) => ({ p, v: bids[p.id] || 0 })).sort((a, b) => b.v - a.v);
        const top = list[0].v;
        let winner = null;
        if (top > 0) { const tied = list.filter((x) => x.v === top).map((x) => x.p); const poor = Math.min(...tied.map((p) => cash[p.id])); winner = J.pick(tied.filter((p) => cash[p.id] === poor)); } // a tie goes to whoever has less money
        const paid = winner ? (ev === 'oportunidade' ? Math.round(top / 2) : top) : 0;
        view.innerHTML = `<div class="kicker">Caixa ${r + 1} de ${N} · os lances</div><div class="lm-bids"></div><div class="lm-sold"></div><div class="lm-box closed" style="width:9rem;height:9rem;font-size:5rem"><span>?</span></div><div class="lm-name"></div><div class="lm-desc"></div><div class="lm-val" hidden></div>`;
        const box = view.querySelector('.lm-bids');
        list.forEach((x, i) => { const d = el('div', 'lm-bid' + (x.p === winner ? ' win' : '')); d.style.animationDelay = i * 0.15 + 's'; d.appendChild(api.buddy(x.p, 3.6, x.p === winner ? 'happy' : 'wow')); d.insertAdjacentHTML('beforeend', `<span>${x.v ? money(x.v) : 'passou'}</span><small>${esc(x.p.name)}</small>`); box.appendChild(d); });
        view.querySelector('.lm-sold').textContent = winner ? `Vendido para ${winner.name} por ${money(paid)}${ev === 'oportunidade' ? ' (metade do lance!)' : ''}` : 'Ninguém quis. O leiloeiro abre assim mesmo…';
        api.sfx('drum');
        api.after(2600, () => {
          const b = view.querySelector('.lm-box'); b.className = 'lm-box open' + (item[2] < 0 ? ' bad' : ''); b.querySelector('span').textContent = item[0];
          view.querySelector('.lm-name').textContent = item[1];
          view.querySelector('.lm-desc').textContent = (ev === 'falsa' ? 'OFERTA FALSA! As pistas eram mentira. ' : '') + item[3];
          const v = view.querySelector('.lm-val'); v.hidden = false; v.textContent = 'Vale ' + money(item[2]); v.classList.toggle('neg', item[2] <= 0);
          if (winner) { cash[winner.id] -= paid; bought[winner.id].push(item); api.fx(winner, item[2] > paid ? 'good' : item[2] < 0 ? 'bad' : 'buzz'); }
          api.sfx(item[2] >= 1200 ? 'win' : item[2] > 99 ? 'good' : 'bad');
          paintBar();
          api.players.forEach((p) => tell(p, { k: 'sold', won: p === winner, paid, item: [item[0], item[1], item[2]], who: winner ? winner.name : '', fake: ev === 'falsa', ...mine(p) }));
          api.after(5200, () => { if (r + 1 >= N) end(); else show(); });
        });
      }
      function end() { api.end(api.players.map((p) => ({ id: p.id, pts: wealth(p), note: bought[p.id].length + (bought[p.id].length === 1 ? ' item' : ' itens') }))); }

      return {
        start() { paintBar(); show(); },
        onMsg(p, m) {
          if (phase !== 'bid' || m.k !== 'bid') return;
          const v = Math.max(0, Math.min(cash[p.id], Math.round((+m.v || 0) / 10) * 10)); // never more than the player has
          bids[p.id] = v; api.sfx('pop');
          J.waiters(api, view.querySelector('.waiters'), bids);
          api.send(p, { k: 'ok', v });
          if (present().every((x) => bids[x.id] != null) && ev !== 'relampago') { if (ck) ck.stop(); api.after(500, sell); }
        },
        sync(p) { if (last[p.id]) api.send(p, { ...last[p.id], ...mine(p), ...(phase === 'bid' && ck ? { secs: Math.ceil(ck.left()) } : {}) }); },
      };
    },

    /* ------------------------------------------------------------------ phone */
    pad(api) {
      const { root, me } = api, { esc } = J;
      root.innerHTML = `<style>
        .lp-clues{display:flex;flex-direction:column;gap:6px;flex:none} .lp-clues span{background:var(--panel);border-radius:12px;padding:8px 12px;font-weight:800;font-size:15px}
        .lp-clues small{color:var(--muted);font-weight:700;font-size:13px;padding:0 4px}
        .lp-ev{align-self:flex-start;background:#e8c15a;color:#1a1405;border-radius:999px;padding:5px 12px;font-weight:900;font-size:12px;letter-spacing:.08em;text-transform:uppercase}
        .lp-amt{background:#070809;border-radius:18px;text-align:center;padding:10px;font:800 44px/1.1 var(--font-mono,monospace);color:#e8c15a;flex:none} .lp-amt small{display:block;font:800 12px/1.4 Archivo,sans-serif;color:var(--muted);letter-spacing:.1em;text-transform:uppercase}
        .lp-chips{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;flex:none} .lp-chips button{min-height:50px;border-radius:14px;background:rgba(255,255,255,.1);font-weight:900;font-size:16px} .lp-chips button:active{transform:scale(.95)}
        .lp-chips .wide{grid-column:span 2;background:rgba(255,255,255,.05);font-size:14px}
        .lp-list{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:6px;width:100%}
        .lp-it{display:flex;align-items:center;gap:10px;background:var(--panel);border-radius:12px;padding:6px 12px;font-weight:800;font-size:14px;text-align:left} .lp-it i{font-style:normal;font-size:22px} .lp-it span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap} .lp-it b{color:#3df5a7} .lp-it b.neg{color:#ff6b84}
        .lp-grow{flex:1;min-height:0}
        @media (orientation:landscape) and (max-height:540px){.lp-bid{display:grid!important;grid-template-columns:1fr 1fr;gap:10px;align-content:start}.lp-amt{font-size:32px}.lp-chips button{min-height:40px}.lp-grow{display:none}}
      </style>`;
      const h = J.padHud(api), box = h.box;
      const list = (m) => (m.bought.length ? `<div class="sect" style="margin:6px 0 0;align-self:flex-start">Suas compras · patrimônio ${money(m.wealth)}</div><div class="lp-list">${m.bought.map((x) => `<div class="lp-it"><i>${x[0]}</i><span>${esc(x[1])}</span><b class="${x[2] <= 0 ? 'neg' : ''}">${money(x[2])}</b></div>`).join('')}</div>` : '');
      const head = (m) => h.pts(money(m.cash));

      function bidUi(m) {
        head(m); h.time(m.secs);
        let v = 0, sent = null;
        box.innerHTML = `<div class="lp-bid" style="flex:1;display:flex;flex-direction:column;gap:10px;min-height:0"><div class="lp-clues">${m.event ? `<span class="lp-ev">${esc(m.event)}</span>` : ''}${m.clues.map((c) => `<span>${esc(c)}</span>`).join('') || '<span>Item misterioso: sem pistas</span>'}<small>${esc(m.est)}</small></div>
          <div><div class="lp-amt"><small>Seu lance${m.half ? ' · você paga só a metade' : ''}</small><b id="amt">$0</b></div></div>
          <div class="lp-chips">${[10, 50, 100, 500].map((n) => `<button data-add="${n}">+${n}</button>`).join('')}<button class="wide" data-add="all">Tudo (${money(m.cash)})</button><button class="wide" data-add="zero">Zerar</button></div>
          <div class="lp-grow"></div><button class="btn primary" id="send">Passar a vez</button></div>`;
        const amt = box.querySelector('#amt'), send = box.querySelector('#send');
        const paint = () => { amt.textContent = money(v); send.textContent = sent === v ? (v ? 'Lance enviado · ' + money(v) : 'Você passou') : v ? 'Dar lance de ' + money(v) : 'Passar a vez'; send.disabled = sent === v; };
        box.querySelectorAll('[data-add]').forEach((b) => { b.onclick = () => { const a = b.dataset.add; v = a === 'all' ? m.cash : a === 'zero' ? 0 : Math.min(m.cash, v + +a); api.vib(10); paint(); }; });
        send.onclick = () => { sent = v; api.send({ k: 'bid', v }); api.vib(30); paint(); };
        paint();
      }

      return {
        start() { h.wait('Abrindo o leilão…', ''); },
        onMsg(m) {
          if (m.k === 'wait') { head(m); h.time(0); box.innerHTML = `<div class="centered"><div class="big">${esc(m.text)}</div><p class="muted">${esc(m.sub)}</p>${list(m)}</div>`; }
          else if (m.k === 'bid') { bidUi(m); api.vib(40); }
          else if (m.k === 'ok') { /* the TV has the bid; the button already says so */ }
          else if (m.k === 'sold') {
            head(m); h.time(0);
            const [emo, name, val] = m.item;
            const title = m.won ? (val > m.paid ? 'Grande negócio!' : val < 0 ? 'Ih… era amaldiçoado' : val >= m.paid * 0.6 ? 'É seu!' : 'Pagou caro…') : m.who ? m.who + ' levou' : 'Ninguém levou';
            box.innerHTML = `<div class="centered"><div class="statusbig">${emo}</div><div class="big">${esc(title)}</div><p class="muted" style="font-size:16px">${esc(name)} · vale ${money(val)}${m.won ? ' · você pagou ' + money(m.paid) : ''}${m.fake ? ' · as pistas eram falsas!' : ''}</p>${list(m)}</div>`;
          }
        },
      };
    },
  });
})();
