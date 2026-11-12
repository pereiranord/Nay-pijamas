# Protocolos e compatibilidade

## Protocolos usados

| Protocolo | Para quê | Onde |
|---|---|---|
| HTTP/1.1 (servidor próprio) | API do receptor, interface web | TV, porta 8080–8089 |
| WebSocket (RFC 6455) | teclas e touchpad com baixa latência | TV, `/api/v2/ws` |
| HTTP com Range | a TV lê o vídeo direto do celular | celular, porta aleatória |
| mDNS / DNS-SD (`_tvdrop._tcp`) | o celular acha a TV | TV anuncia, celular procura |
| Varredura /24 na porta 8080 | descoberta de reserva (só no app, nunca na web) | celular |
| Android TV Remote v2 (TLS + protobuf, portas 6466/6467) | teclas, Liga/Desliga, texto, links de app | receptor → serviço de controle da própria TV |
| AccessibilityService | touchpad, Voltar/Início, setas (Android 13+), texto | TV |
| Reconhecimento de voz do Android (`RecognizerIntent`) | comandos de voz | celular |
| MediaProjection + H.264 (MediaCodec) sobre TCP 8100 | espelhamento de tela | celular → TV |
| TMDB API v3/v4 (chave do usuário) | busca de filmes e séries, "onde assistir" (BR) | navegador / app → api.themoviedb.org |

O formato das mensagens do Remote v2 segue o `polo.proto` e o `remotemessage.proto` do projeto de código aberto `androidtvremote2` (lidos do pacote publicado, versão 0.3.3).

## Tabela de compatibilidade

Legenda: ✅ testado · 🧪 testado só em simulação (testes JVM com TV falsa e TLS real) · ❓ não testado · 🚫 não disponível.

| Fabricante / sistema | Recurso | Situação | Limitações |
|---|---|---|---|
| **Philips Google TV** (TV do usuário) | Transmitir do celular, envio de arquivo/APK, player (v1.0.4) | ✅ pelo usuário | — |
| | Pareamento PIN/QR, API v2, interface nova | 🧪 | precisa da TV com o 2.0 instalado |
| | Teclas, Liga/Desliga, texto via Remote v2 | 🧪 | depende de o serviço de controle da TV aceitar a conexão vinda dela mesma (127.0.0.1 ou o IP próprio). Confirmar no aparelho |
| | Touchpad, Voltar/Início pela acessibilidade | 🧪 (código), ❓ (aparelho) | exige ativar a acessibilidade por adb; as setas por acessibilidade só no Android 13+ |
| | Lista de apps, ícones, abrir, desinstalar | 🧪 | a desinstalação pede confirmação na TV |
| | Voz | ❓ | só no app Android; na web, a página http da TV não libera o microfone (o campo de comando por texto funciona nos dois) |
| | Fila, playlists, histórico, faixas, velocidade, temporizador | 🧪 | o histórico e "continuar" valem para o player do TV Drop |
| | Espelhamento | 🧪 (protocolo), ❓ (aparelho) | sem som; apps protegidos (FLAG_SECURE/DRM) aparecem pretos; latência depende do Wi-Fi |
| | Controle direto pelo celular | 🧪 (interface e protocolo), ❓ (aparelho) | só no app Android |
| Outras TVs Android TV / Google TV | todos os acima | ❓ | o mesmo receptor deve funcionar; o serviço "Android TV Remote Service" precisa existir |
| Samsung Tizen, LG webOS, Roku, Chromecast sem Google TV | controle | 🚫 por enquanto | a estrutura `TvHost`/`RemoteControl` permite adicionar adaptadores (Tizen: WebSocket 8001/8002; webOS: SSAP 3000/3001; Roku: ECP 8060). Eles só entram quando houver um aparelho para testar |

## O que não é possível (e por quê)

- **Microfone na web:** navegadores só liberam o microfone em páginas seguras (https), e a página da TV é http na rede local. A voz fica no app Android.
- **Microfone físico da TV:** é reservado ao Google Assistente. Um app comum não tem acesso a ele.
- **Descoberta na web:** JavaScript não pode varrer a rede nem usar mDNS. A web conecta pelo QR Code, pelo endereço ou pelo código mostrados na TV.
- **Abrir apps sem o receptor:** sem o TV Drop na TV, só o Remote v2 (links de app) pode abrir apps. Com o receptor, os apps são abertos pelo nome do pacote, com confirmação de que estão instalados.
- **Modo fone de ouvido:** não implementado. Só daria para o áudio do player do TV Drop, e manter som e imagem sincronizados pela rede (buffer, codec, latência variável do Wi-Fi) exige um trabalho próprio de sincronização. Fica para uma etapa experimental.
- **Leitor de QR Code dentro do app:** não incluído. A câmera do celular já abre o link do QR Code da TV e pareia pelo navegador.
- **Controlar a reprodução dentro da Netflix ou do YouTube:** só por teclas de mídia (play/pausa etc.). Não há API para ler o título ou o progresso desses apps.
