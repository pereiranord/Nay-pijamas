/* TV Drop — Central Gamer catalog: what the TV shows about each game.
   "ready" games are playable now (their code is in jogo-*.js); "soon" ones are planned and say so clearly.
   Trailers are real matches recorded by tools/trailers (never a still picture with a fake play button). */
'use strict';
window.CATALOG = (() => {
  const G = [
    {
      id: 'rabisco', name: 'Rabisco Relâmpago', status: 'ready', players: [2, 6], minutes: [10, 20],
      cats: ['criatividade', 'grupo'], color: '#3dc9ff', color2: '#b47cff',
      tagline: 'Um desenha no celular, todo mundo adivinha na TV.',
      description: 'Na sua vez, você escolhe uma palavra secreta e desenha com o dedo no celular. O traço aparece ao vivo na TV enquanto os outros chutam pelo celular. Quem acerta antes ganha mais pontos, e quem desenha ganha a cada acerto. No fim, a galeria da partida mostra todos os rabiscos.',
      how: [['Desenhe', 'Escolha uma entre três palavras e desenhe no celular.'], ['Adivinhe', 'Digite palpites. A TV avisa quando alguém chega perto.'], ['Pontue', 'Acertar rápido vale mais. A galeria fecha a partida.']],
      trailer: 'media/trailers/rabisco.mp4',
    },
    {
      id: 'batata', name: 'Batata-Bomba', status: 'ready', players: [2, 6], minutes: [5, 10],
      cats: ['grupo', 'competicao'], color: '#ffd23f', color2: '#ff7a2f',
      tagline: 'Passe a bomba antes que ela exploda na sua mão.',
      description: 'Uma bomba com tempo secreto passa de celular em celular. Para se livrar dela, resolva um desafio rápido na sua tela e escolha para quem jogar. O celular de quem está com a bomba esquenta e treme. Quem estiver segurando na explosão está fora.',
      how: [['Pegou?', 'Seu celular esquenta, treme e mostra um desafio.'], ['Resolva', 'Cor certa, deslize, conta ou sequência: rápido!'], ['Passe', 'Escolha a vítima. O último que sobrar vence.']],
      trailer: 'media/trailers/batata.mp4',
    },
    {
      id: 'mente', name: 'Quem Mente?', status: 'ready', players: [3, 6], minutes: [10, 15],
      cats: ['grupo'], color: '#3df5a7', color2: '#3dc9ff',
      tagline: 'Invente uma mentira convincente e ache a verdade.',
      description: 'A TV mostra um fato curioso com uma lacuna. Cada jogador inventa uma resposta falsa que pareça verdade. Depois, todas as respostas aparecem misturadas com a verdadeira e cada um vota na que acredita. Enganar os amigos dá pontos; achar a verdade dá mais ainda.',
      how: [['Minta', 'Escreva no celular uma resposta falsa que convença.'], ['Vote', 'Escolha qual resposta é a verdadeira.'], ['Revele', 'A TV mostra quem caiu em qual mentira.']],
      trailer: 'media/trailers/mente.mp4',
    },
    {
      id: 'arena', name: 'Arena Neon', status: 'ready', players: [2, 6], minutes: [5, 10],
      cats: ['competicao'], color: '#ff4d6d', color2: '#b47cff',
      tagline: 'Batalha de naves. A última que sobrar leva a rodada.',
      description: 'Cada jogador pilota uma nave numa arena de neon vista de cima. O celular vira joystick, botão de tiro e impulso. Pegue poderes, desvie dos tiros e fuja da zona que fecha. Ao levar dano, o celular respinga vermelho; ao ser eliminado, a tela racha.',
      how: [['Pilote', 'Joystick no polegar esquerdo, tiro e impulso no direito.'], ['Sobreviva', 'Três vidas por rodada e poderes pela arena.'], ['Vença', 'Quem ganhar três rodadas leva a partida.']],
      trailer: 'media/trailers/arena.mp4',
    },
    {
      id: 'corrida', name: 'Corrida de Sofá', status: 'ready', players: [2, 6], minutes: [3, 6],
      cats: ['competicao'], color: '#ff9a3d', color2: '#ff4d6d',
      tagline: 'Três voltas pela sala com volante e pedal no celular.',
      description: 'Sofás de corrida dão três voltas no tapete da sala. Arraste o volante no celular para virar e segure o pedal para acelerar. Setas azuis dão turbo; café derramado faz o sofá rodar. Fora do tapete, tudo fica mais lento.',
      how: [['Vire', 'Arraste o volante para os lados.'], ['Acelere', 'Segure o pedal e pegue as setas de turbo.'], ['Chegue', 'Três voltas. Fuja do café derramado.']],
      trailer: 'media/trailers/corrida.mp4',
    },
    {
      id: 'stop', name: 'STOP!', status: 'ready', players: [2, 6], minutes: [10, 20],
      cats: ['competicao', 'grupo'], color: '#ff5d3d', color2: '#ffd23f',
      tagline: 'Uma letra, várias categorias e um botão de STOP.',
      description: 'A TV sorteia uma letra e todo mundo preenche as categorias no celular ao mesmo tempo: nome, animal, cidade, comida e o que mais o anfitrião escolher. Quem terminar aperta STOP e trava para todos. Respostas duvidosas vão para votação, e respostas únicas valem o dobro.',
      how: [['Sorteio', 'A letra aparece na TV para todos.'], ['Preencha', 'Uma resposta por categoria, no celular.'], ['STOP', 'Travou! Votação e pontos na TV.']],
    },
    {
      id: 'mimica', name: 'Mímica', status: 'ready', players: [2, 6], minutes: [10, 20],
      cats: ['grupo'], color: '#ff4fd8', color2: '#7c5cff',
      tagline: 'Faça sem falar. A sala adivinha.',
      description: 'O celular de quem está na vez mostra uma palavra secreta. Sem falar nada, a pessoa representa com o corpo enquanto todos tentam adivinhar. A TV marca o tempo; quem joga toca em "acertou" ou "pular". Categorias e dificuldade são escolhidas antes de começar.',
      how: [['Segredo', 'A palavra aparece só no seu celular.'], ['Represente', 'Sem falar, sem apontar objetos.'], ['Acertou?', 'Toque e a próxima palavra aparece.']],
    },
    {
      id: 'desenho', name: 'Desenho Relâmpago', status: 'ready', players: [3, 6], minutes: [10, 15],
      cats: ['criatividade'], color: '#ffc857', color2: '#ff7a9a',
      tagline: 'Todos desenham o mesmo tema. A galeria decide.',
      description: 'Todo mundo recebe o mesmo tema e desenha ao mesmo tempo no celular. Quando o tempo acaba, a TV vira uma galeria com todas as obras. Cada um vota no desenho favorito (menos no próprio), e o voto é secreto.',
      how: [['Tema', 'O mesmo desafio para todos.'], ['Desenhe', 'Cores, pincel e borracha no celular.'], ['Galeria', 'Voto anônimo e ranking na TV.']],
    },
    {
      id: 'bomba', name: 'Desarme a Bomba', status: 'ready', players: [2, 6], minutes: [10, 20],
      cats: ['cooperativo'], color: '#ff3b3b', color2: '#7a0f1f',
      tagline: 'Uma pessoa vê a bomba. As outras têm o manual.',
      description: 'A TV mostra uma bomba com cronômetro e módulos. Só um jogador pode mexer nela; os outros recebem partes diferentes do manual no celular. Ninguém tem todas as informações: a equipe precisa conversar para cortar o fio certo antes do tempo acabar.',
      how: [['Descreva', 'Quem vê a bomba conta o que aparece.'], ['Consulte', 'Cada celular tem uma parte do manual.'], ['Desarme', 'Um erro custa tempo. Três, e tudo explode.']],
    },
    {
      id: 'leilao', name: 'Leilão Maluco', status: 'ready', players: [2, 6], minutes: [15, 25],
      cats: ['competicao'], color: '#e8c15a', color2: '#1f7a57',
      tagline: 'Dê lances em caixas misteriosas. Algumas valem ouro.',
      description: 'Cada jogador começa com um saldo fictício. A TV apresenta itens misteriosos e todos dão lances pelo celular. Alguns itens são raríssimos; outros, completamente inúteis. Eventos surpresa mudam as regras no meio do leilão. Só dinheiro de mentira.',
      how: [['Avalie', 'Dicas e pistas sobre o item misterioso.'], ['Dê lances', 'Em segredo, pelo celular.'], ['Revele', 'Tesouro ou bomba? O ranking muda na hora.']],
    },
    {
      id: 'pesca', name: 'Pesca Maluca', status: 'ready', players: [2, 6], minutes: [5, 10],
      cats: ['competicao'], color: '#3dc9ff', color2: '#1f4fd8',
      tagline: 'Arremesse com um deslize e puxe na hora certa.',
      description: 'Um lago cheio de peixes estranhos na TV. Deslize no celular para arremessar a linha e puxe quando o peixe morder: cedo demais ele foge, tarde demais leva a isca. Peixes raros valem mais, e botas velhas não valem nada.',
      how: [['Arremesse', 'Deslize o dedo: força e direção.'], ['Espere', 'O celular vibra quando morde.'], ['Puxe', 'Na hora certa, o peixe é seu.']],
    },
    {
      id: 'quemsou', name: 'Quem Sou Eu?', status: 'ready', players: [2, 6], minutes: [10, 15],
      cats: ['grupo'], color: '#ffd23f', color2: '#ff4fa0',
      tagline: 'O celular vai na testa. Os outros dão as dicas.',
      description: 'Coloque o celular na testa: ele mostra um personagem, objeto ou animal que todo mundo vê, menos você. Os outros dão dicas e você chuta. Incline o celular para baixo quando acertar e para cima para pular.',
      how: [['Na testa', 'A palavra aparece para os outros.'], ['Dicas', 'Os amigos ajudam sem falar a palavra.'], ['Incline', 'Para baixo: acertou. Para cima: pula.']],
    },
    {
      id: 'cabo', name: 'Cabo de Guerra', status: 'ready', players: [2, 6], minutes: [3, 5],
      cats: ['competicao', 'cooperativo'], color: '#ff4d6d', color2: '#3d8bff',
      tagline: 'Dois times tocando o mais rápido possível.',
      description: 'Os jogadores são divididos em dois times e a corda aparece na TV. Cada toque no celular puxa para o seu lado. Ritmo conta: quem tocar no compasso ganha força extra. O time que trouxer a bandeira para o seu lado vence.',
      how: [['Times', 'A TV divide todo mundo em dois lados.'], ['Toque', 'Cada toque puxa a corda.'], ['Ritmo', 'No compasso do anel, vale por três.']],
    },
    {
      id: 'telefone', name: 'Telefone Maluco', status: 'ready', players: [3, 6], minutes: [10, 20],
      cats: ['criatividade', 'grupo'], color: '#a8e6cf', color2: '#ffaaa5',
      tagline: 'Frase vira desenho, desenho vira frase.',
      description: 'Cada um escreve uma frase. O próximo desenha essa frase sem ver mais nada; o seguinte descreve o desenho; e assim por diante. No fim, a TV mostra cada corrente inteira se desmanchando, do começo ao fim.',
      how: [['Escreva', 'Uma frase qualquer, quanto mais estranha melhor.'], ['Desenhe', 'Você só vê a frase anterior.'], ['Revele', 'A TV mostra a corrente toda.']],
    },
    {
      id: 'investigacao', name: 'Investigação dos Impostores', status: 'soon', players: [4, 8], minutes: [25, 45],
      cats: ['investigacao'], color: '#c8b28a', color2: '#8a1c1c',
      tagline: 'Alguém aqui está mentindo. Descubra quem.',
      description: 'Cinco casos completos, com personagens, linha do tempo e evidências. Cada jogador recebe uma identidade secreta e informações só suas, inclusive mensagens e ligações misteriosas no celular. Os impostores tentam passar despercebidos; os investigadores juntam as pistas para a acusação final.',
      how: [['Identidade', 'Papel e pistas secretas no seu celular.'], ['Investigue', 'Evidências, depoimentos e ligações.'], ['Acuse', 'Votação final e revelação do caso.']],
    },
  ];
  const byId = Object.fromEntries(G.map((g) => [g.id, g]));
  const CAT_NAMES = { criatividade: 'Criatividade', grupo: 'Em grupo', competicao: 'Competição', cooperativo: 'Cooperativo', investigacao: 'Investigação' };
  const rails = [
    { title: 'Populares', ids: ['rabisco', 'batata', 'mente', 'arena', 'corrida'] },
    { title: 'Para jogar em grupo', ids: ['mente', 'batata', 'mimica', 'quemsou', 'telefone', 'stop', 'rabisco'] },
    { title: 'Criatividade', ids: ['rabisco', 'desenho', 'telefone'] },
    { title: 'Competição', ids: ['arena', 'corrida', 'stop', 'pesca', 'cabo', 'leilao', 'batata'] },
    { title: 'Cooperativos e times', ids: ['bomba', 'cabo'] },
    { title: 'Investigação', ids: ['investigacao'] },
  ];
  const players = (g) => (g.players[0] === g.players[1] ? g.players[0] : g.players[0] + '–' + g.players[1]) + ' jogadores';
  const minutes = (g) => g.minutes[0] + '–' + g.minutes[1] + ' min';
  const category = (g) => CAT_NAMES[g.cats[0]];
  return { games: G, byId, rails, players, minutes, category, CAT_NAMES, featured: 'rabisco' };
})();
