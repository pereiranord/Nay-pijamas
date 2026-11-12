# API do receptor TV Drop

Base: `http://<IP da TV>:8080` (ou a próxima porta livre até 8089). Respostas em JSON. Erros: `{"ok":false,"error":"<código>","message":"<texto para o usuário>"}`.

**Autenticação:** toda rota `/api/*` exige o token de um aparelho pareado, exceto `GET /api/hello`, `GET /api/v2/info` e `POST /api/v2/pair`. O token vai em `X-TVDrop-Token: <token>`, em `Authorization: Bearer <token>` ou em `?token=<token>`. Sem token: `401 unauthorized`.

## Rotas 1.0 (mantidas)

Usadas pelo app 1.0, pela página clássica (`/classic.html`) e pela interface 2.0.

| Método e rota | Corpo | Resposta |
|---|---|---|
| `GET /api/hello` (aberta) | — | `{app:"tvdrop", name, code, api:2}` |
| `GET /api/status` | — | `ip, port, canInstall, canOverlay, name, code, playing, position, duration, paused, audio, externalPlayer, files[{name,size,kind,modified}], log[]` |
| `POST /api/upload?name=&auto=1&replace=1` | bytes do arquivo | `{ok, message, name}` (nome repetido vira "nome (2).ext", a menos que haja `replace`) |
| `POST /api/play` | URL (texto) ou `?file=` | `{ok, message}` |
| `POST /api/install?file=` | — | a TV pede confirmação |
| `POST /api/delete?file=` | — | `{ok, message}` |
| `POST /api/control?cmd=` | — | `toggle, play, pause, fwd, back, stop, seek&ms=, external, volup, voldown, mute` |

O 2.0 trouxe dois acréscimos compatíveis: o campo `modified` em `files` e o tipo (`kind`) `image`/`audio`/`document`.

## Rotas 2.0

| Método e rota | Corpo (JSON) | Observações |
|---|---|---|
| `GET /api/v2/info` (aberta) | — | `app, api, version, name, model, android, sdk, code, requiresPairing, legacyOpen` |
| `POST /api/v2/pair` (aberta) | `{pin, name}` | `{token, device}`; PIN errado: `403 bad_pin` |
| `GET /api/v2/session` | — | o aparelho dono do token |
| `GET /api/v2/capabilities` | — | `remote.keys[]`, `remote.via{tecla: remote/accessibility/media/system}`, `remote.text`, `remote.pointer`, `remote.power`, `remote.atv{available,paired,connected}`, `remote.accessibility{enabled,dpad,enableCommand}`, `apps`, `player`, `files` |
| `POST /api/v2/remote/key` | `{key}` | teclas em `Keys.java`: `up down left right ok back home menu settings search info guide captions playpause play pause stop next prev ff rew volup voldown mute power del enter space recents`. Indisponível: `409` |
| `POST /api/v2/remote/text` | `{text, replace, submit}` | até 500 caracteres |
| `POST /api/v2/remote/pointer` | `{action, dx, dy}` | `move, tap, longpress, scroll, hide` (precisa da acessibilidade) |
| `POST /api/v2/remote/link` | `{link}` | só `http(s)://` e `market://` |
| `POST /api/v2/remote/pair/start` | — | a TV mostra um código de 6 caracteres |
| `POST /api/v2/remote/pair/finish` | `{code}` | — |
| `POST /api/v2/remote/unpair` | — | — |
| `POST /api/v2/volume` | `{action: up\|down\|mute}` | — |
| `GET /api/v2/apps` | — | `apps[{pkg,label,system}]`, `catalog[{id,name,color,packages,installed}]`. `installed` só vem preenchido se a TV relatar o pacote |
| `GET /api/v2/apps/icon?pkg=` | — | PNG (banner ou ícone) |
| `POST /api/v2/apps/launch` | `{pkg}` | só apps instalados (`404 not_installed`) |
| `POST /api/v2/apps/uninstall` | `{pkg}` | a TV pede confirmação |
| `POST /api/v2/apps/store` | `{pkg}` | abre a página do app na loja da TV |
| `GET /api/v2/devices` | — | aparelhos pareados (`current` marca o seu) |
| `POST /api/v2/devices/rename` | `{id, name}` | — |
| `POST /api/v2/devices/revoke` | `{id}` | — |
| `POST /api/v2/settings` | `{legacyOpen}` | — |
| `POST /api/v2/beep` | — | "Encontrar minha TV" |
| `GET /api/v2/queue` | — | `items[{src,title}]`, `current`, `repeat` (`off/all/one`), `active` |
| `POST /api/v2/queue/add` | `{src, title?, mode?}` | `src`: URL `http(s)/rtsp` ou `inbox:<arquivo>`; `mode`: `end` (padrão), `next`, `now` (toca já) |
| `POST /api/v2/queue/remove` · `/move` · `/clear` · `/play` · `/next` · `/prev` · `/repeat` | `{index}` · `{from,to}` · — · `{index}` · — · — · `{mode}` | a fila avança sozinha quando um item termina |
| `GET /api/v2/playlists` · `POST /api/v2/playlists/save` · `/load` · `/delete` | `{name, play?}` | salvas na TV |
| `GET /api/v2/history` · `POST /api/v2/history/play` · `/favorite` · `/clear` · `/enabled` | `{src, resume?}` · `{src}` · — · `{enabled}` | `resume` = posição para continuar (0 se perto do início ou do fim) |
| `GET /api/v2/player/tracks` · `POST /api/v2/player/track` · `/speed` | `{type: audio\|text, group, track}` (`track:-1` desliga a legenda) · `{speed}` (0,25–3) | só para o player do TV Drop |
| `GET /api/v2/timer` · `POST /api/v2/timer` · `/timer/cancel` | `{minutes, action: pause\|mute\|stop\|power}` | roda na TV; `power` sem o controle pareado vira `stop` |
| `POST /api/v2/mirror/stop` | — | encerra o espelhamento |
| `GET /api/v2/ping` | — | latência |
| `GET /api/v2/speed?bytes=` / `POST /api/v2/speed` | bytes | velocidade TV ↔ aparelho |

## Espelhamento (TCP 8100)

O celular abre TCP na porta 8100 e manda `TVDROP-MIRROR 1 <token>\n`. A TV responde `OK` (aparelho pareado) ou `NO <motivo>`. Depois chegam pacotes `[tipo:1][tamanho:4][ptsUs:8][dados]`: `1` = configuração (largura, altura, SPS/PPS), `2`/`3` = quadro H.264 (3 = quadro-chave), `0` = fim. Veja `MirrorProtocol.java`.

## WebSocket `GET /api/v2/ws?token=`

Mensagens de texto em JSON. Com `id`, a TV responde `{"t":"ack","id","ok","message"?}`; movimentos do cursor não têm resposta.

```json
{"t":"key","k":"up","id":"1"}
{"t":"text","text":"filmes","submit":true}
{"t":"move","dx":12,"dy":-4}      {"t":"tap"}   {"t":"longpress"}   {"t":"scroll","dy":-120}   {"t":"hide"}
{"t":"volume","action":"up"}       {"t":"ping","id":"9"}
```
