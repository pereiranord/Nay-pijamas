# Central Gamer — Bloco 0: auditoria e plano

Relatório técnico do estado atual do TV Drop (2.6) e do plano para transformá-lo em plataforma de jogos multiplayer, preservando tudo o que já existe. Nenhuma alteração destrutiva foi feita neste bloco.

Data: 12/11/2026 · Repositório: `pereiranord/tv-app` (o `tv-drop/` em `pereiranord/Nay-pijamas` fica congelado na 2.6 como espelho histórico).

---

## 1. Tecnologias

| Camada | Tecnologia |
| --- | --- |
| App Android (um APK para TV e celular) | Java, Gradle 8.14, AGP 8.13, compileSdk 35, minSdk 26, targetSdk 34 |
| Player | Media3/ExoPlayer 1.9 + decodificador FFmpeg (Jellyfin) |
| QR Code | zxing core (TV) · Google code scanner (celular) |
| Servidor na TV | HTTP/1.1 + WebSocket (RFC 6455) próprios, em Java puro, portas 8080–8089 (`HttpServer`, `Http`, `ApiV2`) |
| Espelhamento | TCP 8100 (`MirrorServer`), H.264 |
| Controle nativo da TV | Android TV Remote v2 (TLS + protobuf) em Java puro (`atv/`) |
| Interfaces | HTML/CSS/JS sem framework e sem build (`assets/web`), servidas pela TV e embutidas no app do celular (WebView) |
| Testes | JUnit (96 testes, `FakeHost` sem Android) · Node (27 testes do assistente) · Playwright para testes de interface com TV simulada (`DevServer`) |
| CI | GitHub Actions: testes + APK + Release a cada push no `main` |

Ferramentas disponíveis para os próximos blocos: `ffmpeg` e Playwright (gravação de trailers reais), fontes livres Archivo/JetBrains Mono (podem ir embutidas no APK, licença OFL).

## 2. Mapa do que existe

### TV (Android)
- `MainActivity`: tela inicial nativa da TV (QR/PIN de pareamento, aparelhos, arquivos, armazenamento, botão "Abrir jogos").
- `ServerService`: serviço em primeiro plano com o servidor HTTP, descoberta (NSD) e espelhamento.
- `PlayerActivity`, `SlideshowActivity`, `PresentActivity`, `MirrorActivity`: player, fotos, PDF, espelhamento.
- `GameActivity`: WebView em tela cheia que mostra `jogos-tv.html` (os jogos) e repassa as teclas do controle remoto.
- `TvDropAccessibility`, `MediaListener`: serviços opcionais (touchpad, captura de tela, mídia de outros apps).

### Celular (Android)
- `RemoteActivity`: abre direto a interface web (`assets/web/index.html`) numa WebView, com ponte nativa (`window.TVDropNative`) para voz, QR, espelhar, transmitir do celular, atalhos, widget e notificação.
- `PhoneActivity`: "modo clássico" (interface antiga, mantida).
- `StreamService`/`StreamServer`, `MirrorService`: transmitir do celular sem copiar e espelhar a tela.

### Servidor e protocolos
- Rotas 1.0 (`/api/hello`, `/api/status`, `/api/upload`, `/api/play`, `/api/control`, `/api/install`, `/api/delete`…) preservadas.
- Rotas 2.0 em `/api/v2/*` (48 rotas): pareamento, controle, apps, fila, playlists, histórico, temporizador, armazenamento, mídia, legendas, slideshow, PDF, jogos. Documentadas em `docs/API.md`.
- Pareamento: PIN de 6 dígitos ou QR → token (hash guardado). Só rede local.
- **Jogos hoje:** `GameHub` é uma sala com código de 4 letras que só repassa mensagens entre a página da TV (anfitrião, autenticado por chave secreta) e os celulares (convidados, sem pareamento, sem acesso ao resto da TV). WebSocket em `/api/v2/games/ws`. Testado em `GameHubTest`.

### Interfaces web (`assets/web`)
| Arquivo | Papel |
| --- | --- |
| `index.html`, `app.js` (2.182 linhas), `app.css` | App do celular/navegador: Início, Transmitir, Controle, Apps, Biblioteca, Dispositivos, Ajustes |
| `jogos-tv.html/js/css` | Tela de jogos da TV: sala, escolha do jogo, intro, contagem, pódio |
| `jogos.html`, `jogos-pad.js/css` | Controle do jogo no celular: entrar na sala, sala de espera, efeitos (respingo, rachadura, confete, vibração) |
| `jogos-core.js` | Base compartilhada: personagens, sons sintetizados, partículas, utilitários |
| `jogo-*.js` | 5 jogos atuais: Arena Neon, Batata-Bomba, Quem Mente?, Rabisco Relâmpago, Corrida de Sofá |

## 3. Como funciona a conexão TV ↔ celular

1. **Controle e transmissão:** celular pareia por PIN/QR, recebe token, usa as rotas `/api/v2/*` e um WebSocket (`/api/v2/ws`) para teclas e touchpad com baixa latência.
2. **Jogos:** a TV abre a sala (`POST /api/v2/games/open`) e mostra `jogos-tv.html?key=…` na `GameActivity`. Celulares abrem `/jogar?sala=CÓDIGO`, conectam no WebSocket da sala e mandam mensagens; a página da TV recebe tudo, decide o jogo e responde para um jogador (`id|json`) ou todos (`*|json`).
3. **Autoridade:** quem decide pontos, vencedores e validação é a página da TV, que roda no próprio aparelho da TV. Os celulares só enviam intenções (toques, textos, traços) e mostram o que a TV manda. Isso já atende "não confiar nos clientes"; o plano reforça com validação por ação (seção 7).

## 4. Problema de dimensionamento dos controles (diagnóstico)

Testado com Playwright em tamanhos reais (fotos em `audit/` do relatório de testes):

| Aparelho | Resultado |
| --- | --- |
| Pixel 7 em pé (412×839) | OK |
| Celular pequeno em pé (320×568) | **Cortado:** engrenagem, 4ª tecla da fileira de cima, botão "Touchpad" e indicador de volume saem da tela |
| Pixel 7 deitado (863×360) | **Layout de computador:** duas colunas de desktop; só cabem título, volume e modos; o direcional começa abaixo da dobra (y=299 com 360 de altura) |
| iPhone Pro Max deitado (814×380) | Mesmo problema |
| Galaxy S9+ deitado (658×320) | Uma coluna longa: o direcional fica totalmente fora da tela |

**Causas:**
1. Os pontos de quebra olham só a **largura** (`min-width: 760px` vira duas colunas, `900px` vira barra lateral de desktop). Um celular deitado tem largura de tablet e altura minúscula, e cai no layout de computador.
2. A tela do controle empilha cabeçalho, chips, barra de volume e seletor de modo **antes** do direcional: em paisagem nada disso cabe.
3. Larguras fixas (fileira de 4 teclas de 58 px, roqueiros de 76 px, seletor de modo sem quebra) estouram abaixo de ~360 px.
4. A barra de navegação inferior ocupa ~20% da altura em paisagem.
5. No app (WebView) a fonte do sistema ampliada (ex.: 130%) aumenta o texto e piora os estouros.

**Correção planejada (Bloco 1):**
- Pontos de quebra por **orientação e altura** (`orientation`, `max-height`, `pointer: coarse`), nunca só largura.
- Paisagem no celular: cabeçalho compacto numa linha, navegação vira trilho lateral fino, direcional à esquerda e mídia/volume à direita, tudo sem rolagem.
- Retrato pequeno: teclas com tamanho fluido (`clamp()` + unidades de viewport), seletor de modo com rótulos curtos/ícones, chips com rolagem horizontal contida.
- `safe-area-inset-*` nos quatro lados (entalhe em paisagem), `100dvh` com fallback.
- WebView: limitar o zoom de texto do sistema a no máximo 115% só na tela de controle (texto legível sem quebrar o layout).
- O mesmo tratamento para o controle de jogos (`jogos-pad.css`), já que cada jogo vai declarar seu layout em pé e deitado.
- Validação: matriz de 8 aparelhos (320, 360, 390, 412, 430 de largura; em pé e deitado; tablet) com medição automática de estouro, botões menores que 44 px e direcional visível sem rolagem.

## 5. Riscos de compatibilidade

| Risco | Mitigação |
| --- | --- |
| Quebrar transmissão, controle ou pareamento | A Central Gamer é módulo novo: novos arquivos `gamer-*` e `jogos/*`; rotas existentes não mudam; testes JUnit atuais continuam rodando no CI |
| WebView antiga ou fraca na TV (efeito de vidro, vídeo) | `backdrop-filter` com alternativa sólida via `@supports`; vídeos H.264 720p (decodificação por hardware); orçamento de desempenho por tela; detecção de queda de FPS que desliga efeitos |
| Tamanho do APK com trailers e fontes | Trailers de 10–20 s em H.264 ~720p com bitrate controlado (~0,8–1,5 MB cada), fontes só nos pesos usados (woff2) |
| Mudança do código da sala de 4 letras para numérico | Servidor aceita os dois formatos durante a transição; `/jogar?sala=` continua funcionando |
| Jogos atuais (Arena Neon, Batata-Bomba, Quem Mente?, Corrida de Sofá) | Preservados no catálogo, migrados para o novo motor e o novo visual |
| Wi-Fi instável | Reconexão com o mesmo id, estado reenviado pela TV, ações com número de sequência (sem duplicar) |
| Muitas mensagens de desenho | Traços em lote (já existe), limite por mensagem e por segundo no servidor |

## 6. Arquitetura da Central Gamer

```
TV (GameActivity / WebView)                    Celulares (navegador ou app)
┌──────────────────────────────┐               ┌───────────────────────────┐
│ gamer-tv: catálogo, detalhes,│               │ gamer-pad: entrar, perfil, │
│ trailers, sala, configurações│               │ sala, configurações, jogo  │
├──────────────────────────────┤  WebSocket    ├───────────────────────────┤
│ Motor de partida (autoridade)│◄────────────► │ Cliente da sala            │
│  · jogadores, anfitrião      │   GameHub     │  · reconexão, sequência    │
│  · estado, fases, timers     │ (Java, relay  │  · componentes de controle │
│  · validação de ações        │  + sessões)   │    (joystick, desenho,     │
│  · pontuação, ranking        │               │     teclado, votação…)     │
├──────────────────────────────┤               ├───────────────────────────┤
│ Jogos: rabisco, stop, mimica,│               │ Mesmos módulos de jogo     │
│ desenho, bomba, leilao, …    │               │ (parte "pad")              │
└──────────────────────────────┘               └───────────────────────────┘
```

**Navegação na TV:** `MainActivity` ganha um cartão grande "Central Gamer" (Transmitir, Controle e Configurações continuam). A Central abre na `GameActivity`:
1. **Catálogo** (sem nenhuma informação de conexão): banner de destaque com trailer tocando, "JOGAR AGORA" / "VER DETALHES", trilhos por categoria (Populares, Em grupo, Criatividade, Competição, Cooperativos, Investigação), cartões com capa, nome, jogadores, duração, categoria e selo de disponibilidade.
2. **Detalhes:** trailer em destaque, descrição completa, como funciona, jogadores, duração, botão iniciar.
3. **Sala de espera** (só aqui aparecem QR Code e código numérico): jogadores com avatar, nome e estado de conexão, configurações da partida sincronizadas com o celular do anfitrião, remover jogador, iniciar.
4. **Partida** → **Resultado** → volta ao catálogo (a sala continua aberta enquanto houver jogadores, para emendar outro jogo).

**No celular:** o app ganha a aba **Jogos** (Transmitir, Controle, Jogos, Ajustes ficam separados); convidados usam só o navegador (`/jogar`). Entrar → apelido e avatar → sala → controle do jogo.

**Arquivos planejados**

| Novo | Função |
| --- | --- |
| `assets/web/gamer/tokens.css` | Sistema visual: cores, tipografia, espaçamento, vidro, molas, foco |
| `assets/web/gamer/fonts/*.woff2` | Archivo e JetBrains Mono embutidas |
| `assets/web/gamer/ui.js` | Componentes: botões, cartões, modais, toasts, carregamento, erro, foco por controle remoto |
| `assets/web/gamer/room.js` | Cliente da sala (TV e celular): sessões, reconexão, sequência, anfitrião |
| `assets/web/gamer/engine.js` | Motor de partida: fases, cronômetros, configurações/presets, validação, pontuação, ranking |
| `assets/web/gamer/catalog.js` | Metadados dos jogos (categorias, jogadores, duração, disponibilidade, trailer, capa) |
| `assets/web/gamer-tv.html/js/css` | Central na TV (catálogo, detalhes, sala, resultado) |
| `assets/web/gamer-pad.html/js/css` | Celular (entrada, perfil, sala, configurações, controle) |
| `assets/web/jogos/<jogo>.js` | Cada jogo, com as partes `tv` e `pad` |
| `assets/web/jogos/dados/*.json` | Bancos de palavras, categorias, temas, itens do leilão, casos |
| `assets/web/media/trailers/*.mp4`, `capas/*` | Trailers gravados de partidas reais e capas |
| `tools/record_trailers.js` | Gravação automática dos trailers com jogadores simulados (Playwright + ffmpeg) |
| `test/.../GameSessionTest.java` e testes Node dos motores | Testes |

| Alterado (sem quebrar) | Mudança |
| --- | --- |
| `GameHub.java` | Código numérico, anfitrião com permissão de remover jogador, limite de taxa por jogador, sessões |
| `HttpServer.java` / `ApiV2.java` | Servir as páginas novas; `/jogar` continua; rotas atuais intactas |
| `MainActivity.java` | Cartão "Central Gamer" |
| `GameActivity.java` | Abrir a Central; Voltar com a mesma lógica |
| `app.css` / `app.js` | Correção de responsividade (Bloco 1); aba Jogos |
| `RemoteActivity.java` | Limite de zoom de texto na WebView |

| Preservado sem alteração | |
| --- | --- |
| Pareamento, tokens, CORS, rede local | `Pairing`, `Http` |
| Transmissão, player, fila, histórico, legendas, slideshow, PDF, espelhamento, envio de arquivos, descoberta, Remote v2, acessibilidade, widget, notificação | Todas as classes e rotas atuais |

## 7. Infraestrutura multiplayer compartilhada

- **Uma camada para todos os jogos** (`room.js` + `engine.js` + `GameHub`): criação de sala, código numérico de 4 dígitos + QR, entrada, apelido, avatar, desconexão, reconexão, anfitrião, encerramento.
- **Estado oficial na TV.** Os celulares mandam intenções; a TV valida (fase certa? é a vez desse jogador? dentro do tempo? já respondeu?) e só então aplica.
- **Sequência por jogador:** cada ação leva um número; ações repetidas (reenvio após queda) são ignoradas e confirmadas de novo, sem duplicar voto ou resposta.
- **Tempo justo:** prazos medidos pelo relógio da TV na chegada da ação, com tolerância curta; nenhum jogo decide algo importante só por quem tem a rede mais rápida (ex.: no STOP, quem aperta primeiro trava para todos, mas as respostas já digitadas de todos valem).
- **Reconexão:** o celular guarda seu id; ao voltar, a TV reenvia o estado da fase atual só para ele (informação secreta sempre por jogador, nunca em broadcast).
- **Segredos:** mensagens com conteúdo secreto (palavra do desenhista, manual da bomba, papel no jogo de investigação) só vão para o destinatário; a TV nunca as exibe.
- **Configurações por jogo** com presets (Rápido, Normal, Longo, Personalizado), editáveis pela TV ou pelo celular do anfitrião, sincronizadas e bloqueadas depois do início.
- **Ambiente de teste:** jogadores simulados (bots) para testes automáticos e para gravar os trailers.

## 8. Visual (direção de arte)

Base: a referência enviada (kit "Jelly Motion"): fundo grafite `#0C0D0F`, superfícies `#17191D`/`#20242A`, linhas `#252A2A`, texto `#F5F7F8`/`#B8BEC5`/`#969CA3`, acento âmbar `#FFC857`; Archivo para interface e JetBrains Mono para metadados; mola elástica `cubic-bezier(.34,1.56,.64,1)`; barra de vidro com `blur(18px) saturate(1.3)`; trilhos de pôsteres com entrada escalonada de 45 ms; toque com escala 0,90. Somado a Apple TV/visionOS: foco por controle remoto com cartão que cresce e ganha brilho de borda, paralaxe leve, vidro só em barras e painéis sobre imagem (legibilidade primeiro). Cada jogo tem sua cor própria (aplicada no cartão, na sala e nos efeitos) dentro do mesmo sistema.

**Capas:** arte original desenhada em código (SVG/canvas) no estilo de pôster, nítida em 4K e leve. **Trailers:** partidas reais gravadas com jogadores simulados (TV + celular lado a lado), 10–20 s, H.264, tocando no banner e no cartão em foco. Nada de imagem parada com botão de play falso.

**Jogo de investigação (Bloco 10):** imagens realistas exigem geração por IA. Há um serviço de geração de imagens conectado (Cloudinary); usá-lo consome créditos da sua conta, então vou pedir sua confirmação ao chegar nesse bloco.

## 9. Ordem de execução

| Bloco | Conteúdo | Critério de pronto |
| --- | --- | --- |
| 0 | Auditoria e plano | Este documento |
| 1 | Correção dos controles | Matriz de 8 aparelhos sem corte, sem rolagem horizontal, direcional visível sem rolar, botões ≥ 44 px, testes atuais verdes |
| 2 | Central Gamer na TV | Catálogo, detalhes, trailers reais, sala, QR/código numérico, navegação por controle remoto testada |
| 3 | Infraestrutura multiplayer | Sessões, reconexão, sequência, anfitrião, remoção, configurações; teste com 6 jogadores simulados |
| 4 | Rabisco Relâmpago | Banco com milhares de palavras por categoria, modo aleatório, sem repetição recente, borracha, partida completa |
| 5 | STOP / Adedonha | Rodadas, STOP, validação por voto, pontuação configurável |
| 6 | Mímica | Categorias, dificuldade, cronômetro, acertou/pular, histórico |
| 7 | Desenho Relâmpago | Desenho simultâneo, galeria, voto anônimo (sem votar em si) |
| 8 | Desarme a Bomba | Módulos com regras originais e verificáveis, manuais diferentes por jogador, níveis |
| 9 | Leilão Maluco | Saldo, lances, eventos, revelação, ranking |
| 9b | Pesca Maluca · Quem Sou Eu? · Cabo de Guerra · Telefone Maluco | Pedidos em 12/11: arremessar com deslize e puxar na hora certa; celular na testa com dicas dos outros; dois times tocando rápido com a corda na TV; corrente frase → desenho → frase (reaproveita o desenho do Rabisco) que a TV mostra se desmanchando no fim |
| 10 | Investigação dos Impostores | Só depois dos 6 validados: bíblia narrativa, 5 casos, imagens, ligações simuladas |
| 11 | Testes e acabamento | Desempenho na TV, memória, acessibilidade, estabilidade |

Observação sobre originalidade: STOP e Mímica são brincadeiras populares; Desarme a Bomba e Investigação seguem gêneros conhecidos (cooperativo de instruções e dedução social), mas com regras, módulos, textos, personagens e arte criados do zero.
