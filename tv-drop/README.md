# TV Drop 2.2

Central multimídia e controle remoto para **Android TV / Google TV** (feito pensando na Philips 4K Google TV), com app para **celular Android** e versão **web**. O mesmo APK funciona nos dois aparelhos: na TV ele é o receptor; no celular, o controle e o transmissor.

**Transmitir**
- **Do celular sem copiar**: a TV toca o vídeo direto do celular, em **qualidade original**, com avançar e voltar. O próprio app decodifica áudio DTS, TrueHD e AC3.
- **Enviar para a TV**: links de vídeo (`.mp4`, `.m3u8`), links do YouTube (abrem no app do YouTube) e páginas da internet.
- **Arquivos**: vídeos, músicas, fotos, documentos e APKs, vários de uma vez, com progresso, cancelamento e categorias.
- **Espelhar a tela** do celular (app Android): apresentações, fotos e jogos, com vídeo H.264 decodificado pelo hardware da TV.
- **Compartilhar → TV Drop** com qualquer arquivo: tocar agora, adicionar à fila ou copiar para a TV.

**Biblioteca**
- **Fila de reprodução** na TV (continua com o celular desligado), com arrastar e soltar, repetição e **playlists**.
- **Histórico** com "continuar de onde parou" e favoritos (pode ser desligado). Áudio, legenda e velocidade pelo celular.

**Controlar**
- **Controle remoto**: direcional circular (segure para repetir), modo deslizante (segure para continuar), **touchpad** com cursor e botões de clique e rolagem, volume e canal em botões de dois lados, mídia, Liga/Desliga, fonte (entrada), assistente do Google, teclado numérico, botões coloridos, guia, legendas e apps recentes.
- **Barra de estado**: o app aberto na TV, o volume atual com um controle deslizante e por qual caminho o controle está funcionando.
- **Teclado** com "digitar ao vivo", **voz** (app Android) e comandos digitados. No computador, atalhos de teclado (setas, Enter, Esc, espaço, +/−, números).
- **Apps**: lista dos apps instalados na TV com os ícones reais, abrir, favoritos organizáveis, loja e desinstalação.
- **Dispositivos**: pareamento seguro (PIN/QR), aparelhos autorizados, "Encontrar minha TV", diagnóstico de conexão. No app: TVs salvas com apelido, favorita e status online/offline.
- **Inteligência**: temporizador na TV (pausar, silenciar, encerrar ou desligar), **Meus Atalhos** (sequências de comandos), assistente por voz ou texto ("volume em 20", "desligue em 30 minutos", "abrir YouTube") e busca de filmes e séries com "onde assistir" (TMDB, com chave gratuita sua).

Documentação: [arquitetura](docs/ARQUITETURA.md) · [API](docs/API.md) · [protocolos e compatibilidade](docs/COMPATIBILIDADE.md) · [próximas etapas](docs/PROXIMAS-ETAPAS.md).

## 1. Instalar na TV pelo ADB

Baixe o `TV-Drop.apk` na página **Releases** deste repositório e, no computador (mesmo Wi-Fi da TV):

```bash
# Só na primeira vez, se a TV usa "Depuração sem fio" (Android 11+):
# na TV: Opções do desenvolvedor → Depuração sem fio → Parear dispositivo com código
adb pair IP_DA_TV:PORTA_DE_PAREAMENTO

adb connect IP_DA_TV:PORTA          # ex.: adb connect 192.168.18.31:36241
adb install -r TV-Drop.apk

# Libera as permissões de uma vez (recomendado):
adb shell appops set com.pereiranord.tvdrop REQUEST_INSTALL_PACKAGES allow
adb shell appops set com.pereiranord.tvdrop SYSTEM_ALERT_WINDOW allow

# Touchpad, Voltar/Início e digitação (acessibilidade do TV Drop), opcional:
adb shell settings put secure enabled_accessibility_services com.pereiranord.tvdrop/.TvDropAccessibility
adb shell settings put secure accessibility_enabled 1

# Abre o app
adb shell am start -n com.pereiranord.tvdrop/.MainActivity
```

- `REQUEST_INSTALL_PACKAGES` permite que o TV Drop instale os APKs que você mandar. A TV **sempre pede confirmação** na tela antes de instalar.
- `SYSTEM_ALERT_WINDOW` deixa os vídeos e as telas de instalação abrirem sozinhos mesmo com o TV Drop em segundo plano. Sem ela, deixe o TV Drop aberto na TV enquanto envia.

## 2. Instalar no celular

Baixe o mesmo `TV-Drop.apk` no celular e abra. O Android vai pedir para permitir a instalação de apps dessa origem.

## 3. Conectar e usar

1. Abra o **TV Drop** na TV. Ela mostra um **QR Code**, um **PIN de 6 números** (muda a cada 2 minutos), o endereço `http://…:8080` e o código de endereço (ex.: `1G58-28FG`).
2. **No app do celular**: ele encontra a TV sozinho (ou use o código de endereço) e pede o PIN **só na primeira vez**.
   **No navegador**: aponte a câmera para o QR Code, ou abra o endereço e digite o PIN.
3. No app, **Controle remoto, apps e mais** abre a nova interface. **Transmitir vídeo do celular** e **Compartilhar → TV Drop** continuam funcionando como antes.
4. Para o controle completo (todas as teclas, Liga/Desliga e teclado), abra **Dispositivos → Parear controle** e digite o código que a TV mostrar. É o mesmo pareamento do app oficial "Google TV", feito uma vez só.

A página antiga continua em `http://IP_DA_TV:8080/classic.html`.

### Versão web em um arquivo só (`index.html`)

O `index.html` na raiz do branch `main` (e anexado a cada Release) é a mesma interface em um arquivo só. Ele é gerado por `python3 tv-drop/tools/build_web.py index.html` a partir de `tv-drop/assets/web`.

- **Aberto pela própria TV** (`http://IP_DA_TV:8080`): funciona direto.
- **Aberto como arquivo no computador ou num endereço `http` da rede local**: pede o código de 8 letras ou o endereço da TV e conecta. A TV permite essas chamadas (CORS), mas tudo continua exigindo o pareamento.
- **Aberto numa página `https`** (por exemplo, GitHub Pages): o navegador não deixa uma página https falar com a TV (http), então ele leva você até a página da própria TV.

O celular precisa ficar ligado e no Wi-Fi enquanto o vídeo toca, mas a tela pode apagar: uma notificação mantém a transmissão e tem o botão **Parar**.

O código guarda o endereço da TV na rede. Ele resolve quando a busca automática falha (roteador que bloqueia a descoberta, Wi-Fi 2.4 e 5 GHz separados no mesmo roteador). Ele **não** conecta celular e TV em redes diferentes (4G, outra casa), porque aí seria preciso um servidor na internet no meio.

### Controle remoto da TV, no player

| Botão | Ação |
| --- | --- |
| OK / Play-Pause | pausar / continuar |
| ◀ / ▶ | voltar / avançar 10 s |
| ▲ / ▼ | avançar / voltar 1 min |
| Voltar | sair do vídeo |

## Limites

- O player do TV Drop toca links diretos (`.mp4`, `.mkv`, `.webm`, `.m3u8`). Links do YouTube e de páginas abrem no app do YouTube ou no navegador da TV. Conteúdo protegido (DRM) não é extraído nem reproduzido pelo TV Drop.
- Não é espelhamento de tela: transmite arquivos de vídeo e áudio. Para espelhar a tela, use o Chromecast embutido da TV.
- Vídeo: os formatos que o chip da TV decodifica (H.264, H.265/HEVC, VP9, AV1 em TVs novas). Áudio: praticamente todos, porque o app decodifica DTS, TrueHD e AC3 sozinho.
- Só aparelhos pareados (PIN ou QR) controlam a TV. A TV mostra a lista e permite remover qualquer um.
- Apps do TV Drop 1.0 no celular precisam ser atualizados, ou então ligue na TV "Apps antigos (1.0) sem pareamento".
- Voz: só no app Android. Navegadores não liberam o microfone na página http da TV.
- Os arquivos ficam no armazenamento do app. Apague os que não usar mais, pela página ou desinstalando o app.

## Compilar e testar

Com JDK 17+, Gradle 8.13+ e o Android SDK (`platforms;android-35`, `build-tools;35.0.0`):

```bash
ANDROID_HOME=~/Android/Sdk ./tv-drop/build.sh   # roda os testes e gera tv-drop/build/TV-Drop.apk
```

Testes (sem aparelho): rotas 1.0 (regressão), API v2, pareamento, biblioteca, temporizador, espelhamento e o protocolo do controle do Google TV contra uma TV falsa com TLS real (JUnit), além do assistente (Node).

```bash
cd tv-drop && gradle testReleaseUnitTest && node test/assistant.test.js
```

**Rodar a interface web localmente** com uma TV simulada (o PIN fica no arquivo indicado):

```bash
cd tv-drop && TVDROP_DEV=600 TVDROP_DEV_INFO=/tmp/tvdrop.info gradle testReleaseUnitTest --tests '*DevServer*'
# abra http://127.0.0.1:18080 e use o PIN de /tmp/tvdrop.info
```

O player usa o **ExoPlayer (Media3)**. O vídeo vai pelo decodificador de hardware da TV, em qualidade total e com HDR. O áudio que a TV não decodifica (DTS, DTS-HD, Dolby TrueHD, AC3/E-AC3) é decodificado no próprio app pela extensão FFmpeg do Jellyfin (`org.jellyfin.media3:media3-ffmpeg-decoder`).

Cada push em `tv-drop/` dispara o workflow `.github/workflows/tv-drop.yml`, que compila e publica o APK em **Releases**.

`keystore/tvdrop.jks` (senha `tvdrop123`) é a chave que assina o APK. Ela fica no repositório para que cada versão nova instale por cima da anterior. Por estar pública, ela não protege contra alguém que assine outro APK com o mesmo nome. Para uso pessoal tudo bem. Se for distribuir o app, troque por uma chave privada guardada nos *secrets* do GitHub.
