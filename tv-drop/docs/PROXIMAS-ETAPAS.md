# Próximas etapas

A **Etapa 1** (base, segurança e núcleo do controle remoto) está entregue na versão 2.0. Cada etapa seguinte gera um APK no Releases para ser testado na TV antes da próxima.

## Etapa 1 — entregue (2.0)

- [x] Testes de regressão das rotas 1.0 (JUnit, rodam no CI antes de publicar)
- [x] Pareamento por PIN e QR Code, tokens por aparelho, lista e remoção de aparelhos, opção para apps 1.0
- [x] API v2 com capacidades, WebSocket e diagnóstico
- [x] Cliente do controle do Google TV (Remote v2): pareamento, teclas, Liga/Desliga, texto, links de app
- [x] Acessibilidade: touchpad, Voltar/Início, setas (Android 13+), texto
- [x] Apps: lista real da TV com ícones, abrir, favoritos, reordenar, loja e desinstalação
- [x] Nova interface (web + app): Início, Transmitir, Controle (direcional, deslizante, touchpad, teclado, voz), Apps, Dispositivos (diagnóstico, encontrar minha TV)
- [x] Tela da TV redesenhada (QR, PIN, aparelhos)

## Etapas 2 a 5 — entregues (2.1), aguardando teste na TV

- [x] Controle direto pelo celular (plano B se a TV recusar a conexão vinda dela mesma)
- [x] Fila no receptor (avança sozinha, arrastar e soltar, repetir), playlists, histórico com "continuar de onde parou" e favoritos
- [x] Painel do player: próximo/anterior, áudio, legenda e velocidade
- [x] Temporizador na TV, Meus Atalhos, assistente por voz ou texto (módulo separado, com testes), busca TMDB
- [x] Espelhamento de tela (app Android → TV), compartilhar qualquer arquivo, TVs salvas (apelido, favorita, online, encontrar)
- [ ] Testar tudo na Philips e preencher a tabela de compatibilidade

## Etapa 2 — validar na Philips e corrigir

1. Instalar o 2.0, parear o celular, parear o controle e conferir cada tecla. Resultado vai para a tabela de compatibilidade.
2. Se o serviço de controle recusar a conexão vinda da própria TV: fazer o **app do celular** falar o Remote v2 direto com a TV (o código `atv/` já é compartilhado), e a web passa pelo celular.
3. Ativar a acessibilidade e testar o touchpad nos apps mais usados.

## Etapa 3 — Biblioteca

- Fila de reprodução no receptor (continua tocando com o celular em outra tela), próximo/anterior, repetir
- Playlists salvas
- Histórico (pode ser desligado) com "reproduzir de novo" e "continuar de onde parou" (só com o progresso conhecido do player do TV Drop)
- Painel do player: legendas, faixa de áudio e velocidade, além de miniatura

## Etapa 4 — Inteligência

- "Meus atalhos": sequências de comandos (Modo filme, Modo descanso...) com verificação de compatibilidade antes de rodar
- Temporizador no receptor: pausar, silenciar, encerrar ou desligar (desligar só via Remote v2)
- Assistente: o interpretador de comandos sai do `app.js` para um módulo próprio, com espaço para IA opcional
- Busca de conteúdo pela API oficial do TMDB ("onde assistir"), que exige uma chave sua

## Etapa 5 — Multimídia avançada

- Espelhamento de tela no app Android (MediaProjection + H.264 + receptor de baixa latência). A alternativa já existente é o Cast embutido da TV
- Leitor de QR Code dentro do app
- Compartilhar do Android: imagens e documentos, com menu "enviar à TV / adicionar à fila / salvar"
- Modo fone de ouvido (experimental, só para o áudio do player do TV Drop)
- Gerenciador de várias TVs (apelidos, favorita, troca rápida)

## Etapa 6 — Outros fabricantes (quando houver aparelho para testar)

Adaptadores Roku (ECP), Samsung Tizen (WebSocket) e LG webOS (SSAP) atrás da mesma interface `RemoteControl`, com descoberta por SSDP.
