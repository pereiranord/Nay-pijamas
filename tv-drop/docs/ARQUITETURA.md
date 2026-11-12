# Arquitetura do TV Drop 2.0

Um único APK roda nos dois aparelhos: na **TV** ele é o receptor; no **celular**, o controle e o transmissor. A interface do controle é uma só, em HTML/JS, servida pela TV. O navegador a abre direto, e o app do celular a abre numa WebView.

```
┌──────────────── Celular ────────────────┐          ┌─────────────────────── TV (receptor) ───────────────────────┐
│ PhoneActivity  (descoberta, PIN, envio) │  HTTP    │ ServerService ─ HttpServer ── rotas 1.0 (/api/*)             │
│ RemoteActivity (WebView da interface)   │ ───────► │                    │       └─ ApiV2 (/api/v2/*, WebSocket)  │
│   └ ponte nativa: voz, transmitir       │  WS      │                    ▼                                        │
│ StreamServer (arquivo do celular c/ Range)│ ◄─────── │ TvHost ── AndroidTvHost: arquivos, player, apps, volume     │
└─────────────────────────────────────────┘ (a TV lê │              └ AndroidRemote: escolhe o caminho de cada tecla│
┌──────────── Navegador (web) ────────────┐  o vídeo)│                   ├ AtvRemote → serviço de controle da TV    │
│ index.html + app.js + app.css           │ ───────► │                   │   (Android TV Remote v2, 127.0.0.1:6466) │
└─────────────────────────────────────────┘          │                   ├ TvDropAccessibility (touchpad, Voltar...)│
                                                     │                   └ AudioManager (mídia, volume)             │
                                                     │ PlayerActivity (ExoPlayer + FFmpeg)  MainActivity (PIN, QR)   │
                                                     └──────────────────────────────────────────────────────────────┘
```

## Módulos

| Arquivo | Papel | Depende de Android? |
|---|---|---|
| `HttpServer` | servidor HTTP próprio; rotas 1.0 sem mudança de comportamento; autenticação; arquivos web | não (usa `TvHost`) |
| `ApiV2` | rotas `/api/v2`, WebSocket, diagnóstico | não |
| `Http` | leitura de requisição, respostas JSON, WebSocket (RFC 6455) | não |
| `Pairing` | PIN de 6 dígitos (2 min, uso único, 5 tentativas), tokens (só o hash é salvo), aparelhos | não |
| `Keys` | catálogo de teclas: código Android, ação de acessibilidade, se é tecla de mídia | não |
| `AppCatalog` | apps de streaming conhecidos e seus pacotes | não |
| `Library` | fila (avança sozinha), playlists, histórico com retomada e favoritos | não |
| `SleepTimer` | temporizador que roda na TV | não |
| `MirrorProtocol`, `MirrorServer`, `MirrorActivity` | espelhamento: protocolo, servidor TCP 8100 (só pareados), decodificador H.264 de baixa latência | protocolo não; resto sim |
| `MirrorService` | celular: MediaProjection → H.264 → TV | sim |
| `atv/Proto`, `atv/AtvCert`, `atv/AtvRemote` | cliente do protocolo de controle do Google TV (pareamento + sessão) | não |
| `TvHost` | interface: tudo que o servidor pede à TV | — |
| `AndroidTvHost`, `AndroidRemote`, `TvDropAccessibility` | implementações reais na TV | sim |
| `PhoneActivity`, `RemoteActivity`, `PhoneCast`, `StreamServer`, `StreamService`, `Discovery` | lado do celular | sim |
| `assets/web/` | interface compartilhada (web + app) e a página clássica 1.0 | — |
| `assets/web/assistant.js` | assistente: frase → intenção (sem efeitos). O `app.js` confere a compatibilidade, executa e mostra o resultado | — |

Tudo que não depende de Android tem testes JVM (`tv-drop/test`). O assistente tem testes em Node (`test/assistant.test.js`).

## Controle direto pelo celular (alternativa)

Se o serviço de controle da TV não aceitar a conexão vinda do próprio receptor, o app Android pareia **ele mesmo** com a TV (outro certificado, mesmo protocolo). A interface usa esse caminho para as teclas e o texto que o receptor não consegue enviar (`window.TVDropNative.atv`). Na web isso não existe, porque o navegador não abre conexões TLS diretas.

## Como um comando chega à TV

`AndroidRemote` escolhe, por tecla, o melhor caminho disponível **agora** e informa em `/api/v2/capabilities`:

1. **Protocolo do controle do Google TV** (depois de parear uma vez): todas as teclas, Liga/Desliga, digitação no campo de texto, links de apps. O receptor conecta ao serviço de controle da **própria TV** (`127.0.0.1`, ou o IP da TV), então a interface web também ganha o controle completo.
2. **Acessibilidade do TV Drop** (ativada uma vez pelo adb): touchpad (cursor + toque simulado), Voltar, Início, setas no Android 13+, digitação no campo selecionado.
3. **AudioManager**: teclas de mídia e volume, sem nenhuma permissão.

Se nenhum caminho consegue, a API responde `409` com o motivo. Nenhum comando é dado como feito sem ter sido enviado.

## Segurança

- **Pareamento:** PIN de 6 dígitos mostrado na TV, ou o QR Code, que leva o mesmo PIN temporário (nunca um token). O PIN expira em 2 minutos, vale uma vez só e muda depois de 5 erros.
- **Token:** 256 bits aleatórios por aparelho, enviado em `X-TVDrop-Token`, `Authorization: Bearer` ou `?token=` (para imagens e o WebSocket). A TV guarda só o SHA-256.
- **Rede:** o servidor recusa endereços que não sejam da rede local (privados, link-local, loopback, CGNAT).
- **Apps antigos:** a opção "apps antigos (1.0) sem pareamento" vem desligada. Quando ligada, abre só as rotas 1.0, nunca as v2.
- **Links:** só `http`, `https` e `market`. A instalação e a desinstalação de APK sempre pedem confirmação na tela da TV.
- **Voz:** o reconhecimento é do Android (celular), e o texto vai para a TV. Nenhum áudio é gravado ou guardado pelo TV Drop.
- **Controle do Google TV:** certificado de cliente próprio (RSA 2048, guardado no armazenamento privado do app). O certificado da TV é fixado depois do pareamento; se mudar, o app exige parear de novo.
