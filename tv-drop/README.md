# TV Drop

App para **Android TV / Google TV** (feito pensando na Philips 4K Google TV) e para **celular Android**. O mesmo APK funciona nos dois aparelhos: na TV ele é o receptor; no celular, o transmissor e o controle remoto.

- **Transmitir do celular sem copiar**: o celular serve o vídeo e a TV toca direto dele, em **qualidade original** (são os bytes do arquivo, sem recompressão), com avançar e voltar.
- **Conecta sozinho**: na mesma rede, o app do celular acha a TV. Se não achar, digite o **código de 8 letras** que aparece na tela da TV.
- **Compartilhar → TV Drop**: na galeria ou em qualquer app, compartilhe um vídeo com o TV Drop e ele começa a tocar na TV.
- **Links de vídeo**: `.mp4`, `.m3u8` (HLS) e outros links diretos.
- **APKs**: envie um `.apk` do celular e a TV abre a tela de instalação.
- **Controle**: pausar, barra de tempo, avançar, voltar, parar e volume.
- Também funciona **sem o app no celular**, pelo navegador, no endereço que a TV mostra.

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

# Abre o app
adb shell am start -n com.pereiranord.tvdrop/.MainActivity
```

- `REQUEST_INSTALL_PACKAGES` permite que o TV Drop instale os APKs que você mandar. A TV **sempre pede confirmação** na tela antes de instalar.
- `SYSTEM_ALERT_WINDOW` deixa os vídeos e as telas de instalação abrirem sozinhos mesmo com o TV Drop em segundo plano. Sem ela, deixe o TV Drop aberto na TV enquanto envia.

## 2. Instalar no celular

Baixe o mesmo `TV-Drop.apk` no celular e abra. O Android vai pedir para permitir a instalação de apps dessa origem.

## 3. Usar

1. Abra o **TV Drop** na TV. Ela mostra um **código** (ex.: `1G58-28FG`) e um endereço `http://…:8080`.
2. Abra o **TV Drop** no celular, no mesmo Wi-Fi. Ele encontra a TV e conecta. Se não encontrar, digite o código.
3. Toque em **Transmitir vídeo do celular** e escolha o vídeo. Ou, na galeria, **Compartilhar → TV Drop**.

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

- Links do YouTube, Netflix e afins **não** funcionam: eles não entregam o arquivo de vídeo direto. Use links diretos (`.mp4`, `.mkv`, `.webm`, `.m3u8`).
- Não é espelhamento de tela: transmite arquivos de vídeo e áudio. Para espelhar a tela, use o Chromecast embutido da TV.
- Os formatos são os que a TV consegue tocar (MP4/H.264/H.265, MKV, WebM etc.).
- Qualquer pessoa no seu Wi-Fi consegue abrir a página. Instalar um APK ainda exige confirmação na TV.
- Os arquivos ficam no armazenamento do app. Apague os que não usar mais, pela página ou desinstalando o app.

## Compilar

Sem Gradle: só o JDK 17+ e o Android SDK (`build-tools;35.0.0` e `platforms;android-34`).

```bash
ANDROID_HOME=~/Android/Sdk ./tv-drop/build.sh   # gera tv-drop/build/TV-Drop.apk
```

Cada push em `tv-drop/` dispara o workflow `.github/workflows/tv-drop.yml`, que compila e publica o APK em **Releases**.

`keystore/tvdrop.jks` (senha `tvdrop123`) é a chave que assina o APK. Ela fica no repositório para que cada versão nova instale por cima da anterior. Por estar pública, ela não protege contra alguém que assine outro APK com o mesmo nome. Para uso pessoal tudo bem. Se for distribuir o app, troque por uma chave privada guardada nos *secrets* do GitHub.
