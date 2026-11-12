# PROJECT_PROGRESS — TV Drop: Central Gamer

Registro vivo do andamento. Plano completo: [docs/CENTRAL-GAMER-PLANO.md](docs/CENTRAL-GAMER-PLANO.md).

## Situação

| Bloco | Estado |
| --- | --- |
| 0 — Auditoria e planejamento | ✅ Concluído (12/11/2026) |
| 1 — Correção dos controles | ✅ Concluído (12/11/2026) |
| 2 — Central Gamer na TV | ⏭️ Próximo |
| 3 — Infraestrutura multiplayer | Pendente |
| 4 — Rabisco Relâmpago | Pendente (existe versão 2.6 a ampliar) |
| 5 — STOP / Adedonha | Pendente |
| 6 — Mímica | Pendente |
| 7 — Desenho Relâmpago | Pendente |
| 8 — Desarme a Bomba | Pendente |
| 9 — Leilão Maluco | Pendente |
| 9b — Pesca Maluca, Quem Sou Eu?, Cabo de Guerra, Telefone Maluco | Pendente (pedidos em 12/11) |
| 10 — Investigação dos Impostores | Bloqueado até os blocos 4–9 serem validados |
| 11 — Testes e acabamento | Pendente |

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

**Próxima etapa recomendada:** Bloco 2 — Central Gamer na TV.
