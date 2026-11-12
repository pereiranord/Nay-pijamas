# PROJECT_PROGRESS — TV Drop: Central Gamer

Registro vivo do andamento. Plano completo: [docs/CENTRAL-GAMER-PLANO.md](docs/CENTRAL-GAMER-PLANO.md).

## Situação

| Bloco | Estado |
| --- | --- |
| 0 — Auditoria e planejamento | ✅ Concluído (12/11/2026) |
| 1 — Correção dos controles | ✅ Concluído (12/11/2026) |
| 2 — Central Gamer na TV | ✅ Concluído (12/11/2026) |
| 3 — Infraestrutura multiplayer | ⏭️ Próximo |
| 4 — Rabisco Relâmpago | Pendente (existe versão 2.6 a ampliar) |
| 5 — STOP / Adedonha | Pendente |
| 6 — Mímica | Pendente |
| 7 — Desenho Relâmpago | Pendente |
| 8 — Desarme a Bomba | Pendente |
| 9 — Leilão Maluco | Pendente |
| 9b — Pesca Maluca, Quem Sou Eu?, Cabo de Guerra, Telefone Maluco | Pendente (pedidos em 12/11) |
| 10 — Investigação dos Impostores | Bloqueado até os blocos 4–9 serem validados |
| 11 — Testes e acabamento | Pendente |

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

**Próxima etapa recomendada:** Bloco 3 — Infraestrutura multiplayer (sessões, reconexão, ações sem duplicar, configurações de partida com presets).
