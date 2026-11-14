# PROJECT_PROGRESS — TV Drop: Central Gamer

Registro vivo do andamento. Plano completo: [docs/CENTRAL-GAMER-PLANO.md](docs/CENTRAL-GAMER-PLANO.md).

## Situação

| Bloco | Estado |
| --- | --- |
| 0 — Auditoria e planejamento | ✅ Concluído (12/11/2026) |
| 1 — Correção dos controles | ✅ Concluído (12/11/2026) |
| 2 — Central Gamer na TV | ✅ Concluído (12/11/2026) |
| 3 — Infraestrutura multiplayer | ✅ Concluído (12/11/2026) |
| 4 — Rabisco Relâmpago | ✅ Concluído (12/11/2026) |
| 5 — STOP / Adedonha | ✅ Concluído (12/11/2026) |
| 6 — Mímica | ✅ Concluído (12/11/2026) |
| 7 — Desenho Relâmpago | ✅ Concluído (12/11/2026) |
| 8 — Desarme a Bomba | ✅ Concluído (12/11/2026) |
| 9 — Leilão Maluco | ✅ Concluído (12/11/2026) |
| 9b — Pesca Maluca, Quem Sou Eu?, Cabo de Guerra, Telefone Maluco | ✅ Concluído (12/11/2026) |
| 10 — Investigação dos Impostores | ⏭️ Próximo (depois de os jogos 4–9b serem jogados na TV de verdade) |
| 11 — Testes e acabamento | Pendente |

## Blocos 4 a 9b — os jogos (12/11/2026)

Tudo aqui roda dentro da Central Gamer, usa a sala e as configurações do Bloco 3 e tem controle no celular em pé e deitado. O único jogo ainda "Em breve" é a Investigação dos Impostores (Bloco 10).

**O celular do anfitrião faz tudo** (pedido em 12/11): com a TV no catálogo, o celular do anfitrião já lista os jogos; tocar em um abre a sala de espera na TV. Dali ele troca de jogo, configura, inicia, **encerra a partida** (aba no topo da tela durante o jogo) e **remove jogador** (toque no nome). A TV continua aceitando o controle remoto para as mesmas coisas; os outros celulares só acompanham. `tools/qa/check-host-phone.js` cobre o fluxo (14 verificações).

**Peças comuns novas**
- `gamer/words.js`: banco de palavras por categoria: 2.768 escritas à mão (animais, objetos, objetos domésticos, profissões, comidas, filmes e séries, personagens, lugares, esportes, ações, expressões populares, difícil, muito difícil, celebridades, desenhos animados, situações engraçadas) e a categoria "Coisas absurdas", que combina quem + fazendo o quê (3.700 combinações). Total 6.468. Mais 115 temas para o Desenho Relâmpago.
- `J.fresh()` (em `jogos-core.js`): sorteio sem repetir o que saiu nas últimas partidas (lembrado na TV, por jogo).
- `gamer/sketch.js`: prancheta de desenho única (10 cores, **borracha**, 4 espessuras, desfazer, limpar; ferramentas embaixo com o celular em pé e ao lado com ele deitado).
- Configurações do tipo lista (categorias): escolhidas na TV em uma grade (OK liga/desliga) e no celular do anfitrião por toques; "Tudo misturado" liga todas.
- Resultados com título próprio para jogos de time e cooperativos.

| Jogo | O que tem | Configurações |
| --- | --- | --- |
| **Rabisco Relâmpago** (ampliado) | 14 categorias + Tudo misturado, 3 palavras novas por vez com a categoria, categoria como dica na TV, expressões longas aceitam palpite aproximado, borracha | tempo, vezes de cada um, categorias |
| **STOP!** | roleta de letra (sem repetir na partida), campos no celular, botão STOP só com tudo preenchido, conferência por categoria com "não vale" (maioria dos outros anula), letra errada e vazio anulados sozinhos | rodadas, tempo, pontos (única/repetida), categorias (16, mínimo 3) |
| **Mímica** | palavra secreta só no celular de quem faz, Acertou (escolhe quem acertou: os dois pontuam) e Pular (3), categoria como dica na TV, histórico da vez | tempo, vezes, dificuldade, categorias (11) |
| **Desenho Relâmpago** | mesmo tema para todos, desenhos borrados na TV enquanto desenham, galeria numerada sem nomes, voto secreto (não vale o próprio), nomes só depois | tempo, número de temas |
| **Desarme a Bomba** | cooperativo: técnico vê os módulos no celular; os outros recebem pedaços diferentes do manual; 5 módulos (fios, símbolos, senha, sequência de cores, botão), número de série e pilhas entram nas regras; erro custa 20 s, 3 erros explodem; TV com relógio, erros e módulos | dificuldade (3/4/5 módulos), tempo |
| **Leilão Maluco** | 72 itens (tesouros, comuns, tranqueiras, amaldiçoados), 2 pistas + avaliação, lance secreto, empate vai para quem tem menos dinheiro, eventos: relâmpago, item misterioso, oferta falsa, oportunidade (paga metade), item raríssimo; lista de compras no celular | caixas, dinheiro inicial, tempo do lance |
| **Telefone Maluco** | frase → desenho → descrição…, cada um só vê o passo anterior, revelação da corrente inteira na TV, voto na melhor parte | tempo de desenho, tamanho da corrente |
| **Quem Sou Eu?** | celular na testa: inclinar para baixo acerta, para cima pula (sensor de movimento); os amigos veem a mesma palavra no celular deles, com os mesmos botões, e a tela de quem adivinha aceita toque — funciona sem sensor; a TV nunca mostra a palavra | tempo, vezes, categorias (9) |
| **Cabo de Guerra** | dois times sorteados, força = média do time (2 contra 3 é justo), toque no compasso do anel vale por três, limite por toque por segundo na TV | rodadas para vencer, tempo máximo |
| **Pesca Maluca** | arremesso por deslize (força e direção), peixes comuns perto e raros longe, baú, bota velha e tubarão ladrão; a puxada é julgada pelo tempo medido no próprio celular desde a mordida | tempo de pescaria |

**Lógica da bomba verificável** (`gamer/bomb-logic.js`, `test/bomb-logic.test.js`): 4.500 bombas geradas no teste; em todas a solução de cada módulo sai só do que o manual diz, o caminho certo desarma sem erro, um movimento errado conta um erro e o módulo continua resolvível, ações repetidas ou inválidas não punem, o manual é distribuído inteiro e, com 2 ou mais especialistas, ninguém fica com um módulo completo.

**Arquivos criados:** `assets/web/jogo-{stop,mimica,desenho,bomba,leilao,telefone,quemsou,cabo,pesca}.js`, `assets/web/gamer/{words,sketch,bomb-logic}.js`, `test/bomb-logic.test.js`, `tools/qa/check-host-phone.js`, `tools/qa/play/` (um roteiro de partida completa por jogo).
**Arquivos modificados:** `jogo-rabisco.js` (reescrito sobre as peças novas), `gamer-tv.js/css/html`, `jogos-pad.js/css`, `jogos.html`, `jogos-core.js`, `gamer/catalog.js` (14 jogos disponíveis), workflow (teste da bomba no CI).

**Testes executados**
- Partida completa de cada um dos 14 jogos com celulares simulados (páginas reais, toques reais), sem erros de página: `tools/qa/play/play.js`.
- Bomba: 7 testes sobre 4.500 bombas. Sala: 10 testes. JUnit: 102.
- Anfitrião pelo celular (14 verificações), sala/configurações (18), navegação por controle remoto e layouts do celular.

**Não validado aqui**
- Nada disto foi jogado em TV e celulares de verdade: tudo em Chromium, com jogadores simulados.
- Sensor de movimento do Quem Sou Eu?: simulado. Navegadores costumam bloquear o sensor em páginas `http://` (o caso da TV); por isso os botões e o toque na tela existem e foram testados.
- Emojis dos itens do Leilão dependem da fonte de emojis da TV.

**Pendências**
- Trailers dos 9 jogos novos (o catálogo mostra a arte em movimento para eles; os 5 antigos continuam com trailer real).
- Itens do Leilão usam emojis em vez de ilustrações próprias.
- A sala continua com no máximo 6 jogando (o catálogo foi corrigido para dizer isso).

## Bloco 3 — Infraestrutura multiplayer

**Implementado**
- **Conexão do celular** (`gamer/room-client.js`), a mesma para todos os jogos:
  - reconecta sozinha (1 s, 2 s, 4 s… até 8 s; na hora quando a tela volta ou a rede volta), com o aviso "Sem conexão com a TV. Reconectando…";
  - **ações confiáveis** (respostas, votos, desenhos, ações da sala) levam um número e ficam guardadas até a TV confirmar (`ack`): o que foi enviado durante uma queda do Wi-Fi chega **uma vez, na ordem**, depois de reconectar;
  - **ações contínuas** (joystick, direção) não entram na fila: só a última importa;
  - batimento a cada 3 s respondido pelo servidor (`pong`): detecta conexão morta em até 9 s e mede o atraso;
  - se a página da TV reiniciar, o celular se apresenta de novo e volta com o mesmo nome e personagem.
- **Sala na TV** (`gamer/room-host.js`): registro dos jogadores (vaga, cor, personagem), cada ação aplicada **uma única vez** por sessão do celular (repetidas são descartadas), confirmação agrupada (40 ms), limite de 40 ações contínuas/s por jogador, remoção de quem ficou fora por 15 s fora de partida, estatísticas (repetidas, limitadas, aplicadas).
- **A TV é a autoridade**: cada partida tem um número (`mid`); ações de jogo só valem com o número da partida atual, na tela de jogo e de jogador ativo. Ações de uma partida já encerrada são ignoradas.
- **Servidor** (`GameHub.java`): responde o batimento sem incomodar a TV e limita cada celular a 60 mensagens/s (rajada de 120), para um celular com defeito não travar a sala.
- **Configurações da partida** por jogo, com **Rápido / Normal / Longo / Personalizado**:
  - na TV, painel "Partida" na sala de espera (OK troca o valor; mudar um valor vira Personalizado); no celular do anfitrião, os mesmos botões; os outros celulares veem as configurações sem poder mudar;
  - TV e celulares sempre iguais (a TV decide e avisa todos); só o anfitrião muda, e só na sala de espera; **travadas depois de iniciar**; a tela Prepare-se mostra o resumo; a última escolha fica guardada na TV por jogo.
  - Quem Mente?: perguntas (3/5/8), tempo para mentir, tempo para votar. Rabisco: tempo para desenhar, rodadas. Batata-Bomba: pavio (curto/normal/longo). Arena Neon: vitórias para ganhar, zona que fecha. Corrida de Sofá: voltas, tempo extra após o primeiro chegar.

**Arquivos criados:** `assets/web/gamer/room-client.js`, `assets/web/gamer/room-host.js`, `test/gamer-room.test.js`, `tools/qa/check-room.js`.
**Arquivos modificados:** `gamer-tv.js/html/css`, `jogos-pad.js/css`, `jogos.html`, os 5 jogos (`jogo-*.js`, valores vindos das configurações), `GameHub.java`, `GameHubTest.java`, `AtvRemoteTest.java` (teste instável em máquina ocupada), `tools/qa/check-central.js`, workflow (testes da sala no CI).

**Testes executados**
- 10 testes da sala com relógio virtual e jogadores simulados: entrada, confirmação, queda do Wi-Fi com reenvio, repetidas, recarregar a página, limite de ações contínuas, remoção, TV reiniciando, código errado, atraso.
- JUnit: 102 testes (novo: batimento e limite de mensagens no servidor): verdes.
- Navegador, TV + 6 celulares (`check-room.js`, 18 verificações): configurações sincronizadas e travadas, guest sem permissão, controle remoto escolhendo Longo, jogo usando os valores (3 perguntas, 35 s), queda do Wi-Fi no meio da partida com a mentira chegando uma vez, número repetido reconhecido, ação de partida antiga ignorada, 7º celular recusado.
- Regressão: partidas completas dos 5 jogos dentro da Central, navegação por controle remoto (`check-central.js`), layouts do celular (`check-phone-layouts.js`) e gravador de trailers: sem erros.

**Não validado aqui:** queda real de Wi-Fi na TV e celulares físicos (simulada no navegador e nos testes).

**Problemas conhecidos:** o controle de cada jogo no celular ainda é o da 2.6 (refeito nos blocos 4+).

## Bloco 2 — Central Gamer na TV

**Implementado**
- **Sistema visual** (`gamer/tokens.css`): paleta da referência (grafite + âmbar), Archivo e JetBrains Mono embutidas (funciona sem internet), vidro com desfoque e alternativa sólida, molas, botões, chips, foco por controle remoto. Detecção automática de TV fraca: desliga desfoque e animações pesadas.
- **Capas originais** (`gamer/covers.js`): 15 cenas desenhadas em código, nítidas em qualquer resolução, com o título do jogo; versão sem título para os fundos.
- **Catálogo** (`gamer/catalog.js`): 15 jogos com nome, descrição, como funciona, jogadores, duração, categorias e situação (5 disponíveis, 10 "Em breve" claramente marcados).
- **Central na TV** (`gamer-tv.html/js/css`):
  - **Catálogo**: destaque com título, descrição, chips e botões JOGAR AGORA / VER DETALHES; o fundo mostra o trailer do jogo focado (ou a arte, com movimento lento, para os que ainda não têm trailer); 6 trilhos (Populares, Em grupo, Criatividade, Competição, Cooperativos e times, Investigação); cartões com capa, nome, jogadores, duração e selo; foco com zoom, brilho e borda; rolagem horizontal e vertical suave. Nenhuma informação de conexão no catálogo (só "N jogadores na sala" quando há gente conectada).
  - **Detalhes**: trailer de fundo, descrição completa, jogadores, duração, categoria, situação, os 3 passos de como funciona, Jogar/Voltar. Jogos "Em breve" não iniciam e explicam por quê.
  - **Sala de espera** (só aqui aparecem QR Code e código): código numérico de 4 dígitos, endereço, 6 vagas com avatar, nome, estado (Conectado/Reconectando…), anfitrião, **remover jogador** com confirmação, Iniciar partida (avisa quantos faltam) e Trocar de jogo.
  - **Prepare-se** com a arte do jogo, contagem, partida, **resultado** com Jogar de novo / Voltar ao catálogo. A sala continua aberta ao voltar ao catálogo, para emendar outro jogo.
  - Controle remoto em tudo: setas, OK e Voltar (Voltar no catálogo pergunta antes de sair; na partida pergunta antes de encerrar).
- **Trailers reais** (`media/trailers/*.mp4`, `tools/trailers/`): partidas jogadas por jogadores simulados, com a TV e o celular de um jogador lado a lado (desenhando, resolvendo o desafio da bomba, escrevendo a mentira, pilotando, dirigindo). 15 s, H.264 720p, 135–590 KB cada.
- **Celular**: código numérico, tela "A TV está escolhendo o jogo" enquanto a TV está no catálogo, aviso de remoção pelo anfitrião, fonte da marca.
- **Servidor**: arquivos em subpastas (com bloqueio de `..`), vídeo por partes (Range), cache de mídia, código de sala numérico, remoção de jogador (`!kick`). A TV abre a Central em vez da tela antiga; o endereço antigo `jogos-tv.html` redireciona.
- **TV (Android)**: cartão "Central Gamer" na tela inicial.

**Arquivos criados:** `assets/web/gamer/` (tokens, fontes, catálogo, capas), `assets/web/gamer-tv.html/js/css`, `assets/web/media/trailers/` (5 vídeos), `tools/trailers/` (gravador + palco), `tools/qa/check-central.js`, `test/.../WebAssetTest.java`.
**Arquivos modificados:** `HttpServer.java`, `Http.java`, `GameHub.java`, `ApiV2.java`, `MainActivity.java`, `jogos-pad.js/css`, `jogos.html`, `jogos-tv.html` (redireciona), testes `GameHubTest`, `FakeHost`. **Removido:** `jogos-tv.js` (substituído por `gamer-tv.js`; os 5 jogos foram preservados).

**Testes executados**
- 101 testes JUnit (5 novos: subpastas, bloqueio de `..`, Range 206/416, Central aberta pela TV, remover jogador; código numérico) e 27 do assistente: verdes.
- Navegação completa só com as teclas do controle remoto (catálogo → trilhos → detalhes → sala → remover jogador → iniciar → prepare-se → partida → encerrar → catálogo → jogo "Em breve" → pergunta de saída), com 3 celulares: sem erros.
- Partidas completas, até o pódio, dos 5 jogos dentro da Central: Arena Neon, Batata-Bomba, Quem Mente?, Rabisco Relâmpago e Corrida de Sofá, sem erros.
- Trailer tocando no fundo do catálogo (vídeo carregado, avançando, troca ao mudar o foco).
- Bloco 1 (layouts do celular) continua válido: nenhum arquivo do controle foi alterado.

**Não validado aqui:** desempenho e decodificação de vídeo na WebView da TV real (testado em Chromium 1920×1080). O QR Code só aparece na TV de verdade (o servidor de teste não gera a imagem).

**Problemas conhecidos:** o controle de cada jogo no celular ainda é o da 2.6 (será refeito no padrão novo junto com cada jogo, blocos 4+). Os 10 jogos "Em breve" não têm trailer ainda: o fundo usa a arte com movimento, sem botão de play falso.

## Bloco 1 — Correção dos controles

**Implementado**
- O layout escolhe a disposição pela **forma** da tela (orientação + altura), não só pela largura. Celular deitado nunca mais cai no layout de computador; a barra lateral de computador e as duas colunas só aparecem em telas largas **e** altas (tablet, computador).
- **Celular deitado:** a barra de navegação vira um trilho fino à esquerda; o controle ocupa a tela inteira, com o direcional (ou a área de deslizar/touchpad) e Voltar/Início/Menu sempre visíveis à esquerda, e o resto (estado, modos, teclas, volume, mídia, painéis) rolando sozinho à direita.
- **A coluna da direita se adapta ao próprio espaço** (*container queries*): em celulares deitados pequenos as teclas se reorganizam em grade, os roqueiros ficam lado a lado e os modos empilham.
- **Celular pequeno em pé (320–360 px):** tamanhos fluidos com `clamp()` (nunca menores que 44 px), seletor de modo sem estourar, título com prioridade sobre o chip de conexão, rótulos da barra inferior ajustados.
- **Celular em pé e baixo:** espaçamentos menores para o direcional caber acima da barra inferior.
- Áreas seguras (entalhe) nos quatro lados.
- Botões pequenos de listas e ajustes passaram a ter pelo menos 40 px de altura.
- A opção "botões grandes" continua funcionando sem quebrar nenhum layout.
- **App Android:** o zoom de texto do sistema fica limitado a 115% na WebView (acompanha a fonte do celular sem quebrar as teclas).
- Controles dos jogos: as telas rolam em vez de cortar quando faltar espaço; o layout próprio de cada jogo, em pé e deitado, será feito nos blocos dos jogos.

**Arquivos modificados:** `assets/web/app.js` (estrutura do Controle em duas regiões, `data-view` na página), `assets/web/app.css`, `assets/web/jogos-pad.css`, `src/.../RemoteActivity.java`, `index.html` (versão de arquivo único regenerada).
**Arquivos criados:** `tools/qa/check-phone-layouts.js` (verificador automático de layouts).

**Testes executados**
- Verificador automático: 11 telas (320×568, 360×740, 390×844, 412×915, 430×932, 568×320, 740×360, 844×390, 932×430, tablet em pé e deitado) × botões normais/grandes × 11 estados (3 modos do controle, painéis Mais e Números, Início, Transmitir, Apps, Biblioteca, Dispositivos, Ajustes) = **242 combinações sem problema**. Critérios: página sem zoom para fora, sem rolagem horizontal, nenhum controle cortado na borda, nenhum botão menor que 40 px, direcional inteiro na tela (acima da barra inferior), Voltar/Início/Menu visíveis quando deitado.
- Regressão: 96 testes JUnit e 27 do assistente verdes; partidas de Arena Neon e Rabisco Relâmpago com 3 celulares simulados sem erros.

**Não validado aqui:** WebView real do Android e Safari do iPhone (testes em Chromium com emulação de toque e tamanhos reais). Validar no aparelho.

**Problemas pendentes:** nenhum conhecido no Controle. Os controles dos jogos atuais em paisagem serão refeitos junto com cada jogo (blocos 4 em diante).

## Bloco 0 — Auditoria e planejamento

**Feito**
- Leitura da arquitetura completa (Android, servidor, protocolos, interfaces web, testes, CI).
- Referência visual analisada (kit "Jelly Motion": paleta, tipografia, vidro, molas).
- Diagnóstico do problema de dimensionamento com medição automática em 6 tamanhos de tela.
- Plano da Central Gamer, da infraestrutura compartilhada e da ordem de blocos.

**Arquivos criados:** `docs/CENTRAL-GAMER-PLANO.md`, `PROJECT_PROGRESS.md`.
**Arquivos modificados:** nenhum.

**Testes executados**
- Suíte atual: 96 testes JUnit + 27 Node verdes (CI do `tv-app`, execução 2).
- Auditoria de responsividade (Playwright, TV simulada):

| Tela | Resultado |
| --- | --- |
| 412×839 em pé | OK |
| 320×568 em pé | Elementos cortados à direita |
| 863×360 deitado | Layout de computador em 2 colunas; direcional fora da tela |
| 814×380 deitado | Idem |
| 658×320 deitado | Direcional totalmente fora da tela |

**Bugs encontrados**
1. Pontos de quebra só por largura: celular deitado cai no layout de computador (`app.css`, `.remote-grid` ≥ 760 px e `.nav` ≥ 900 px).
2. Cabeçalho, chips, volume e seletor de modo empilhados acima do direcional: em paisagem o controle principal fica abaixo da dobra.
3. Larguras fixas estouram abaixo de ~360 px (fileira de 4 teclas, roqueiros, seletor de modo).
4. Navegação inferior ocupa ~20% da altura em paisagem.
5. Zoom de texto do sistema na WebView agrava os estouros.

**Pendências / decisões**
- Imagens realistas do jogo de investigação: usar o gerador de imagens conectado (consome créditos da conta). Confirmar no Bloco 10.
- `tv-app` está privado: links de download diretos (curl) só funcionam com o repositório público ou pelo espelho em `Nay-pijamas`.

**Próxima etapa recomendada:** jogar os jogos novos na TV e nos celulares de verdade e anotar o que incomodar; gravar os trailers dos 9 jogos novos; depois, Bloco 10 — Investigação dos Impostores (confirmar antes o uso do gerador de imagens, que consome créditos).
