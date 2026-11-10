# TV Drop

App para **Android TV / Google TV** (feito pensando na Philips 4K Google TV) que transforma a TV num receptor:

- **Vídeos**: envie um arquivo de vídeo do celular ou do computador e ele toca na TV.
- **Links de vídeo**: cole um link `.mp4`, `.m3u8` (HLS) ou de outra transmissão direta e ele toca na TV.
- **APKs**: envie um `.apk` e a TV abre a tela de instalação.
- **Controle remoto pelo celular**: pausar, avançar, voltar, parar e mudar o volume.

Não precisa instalar nada no celular: basta abrir o navegador no endereço que aparece na TV.

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

## 2. Usar

1. Abra o **TV Drop** na TV. Aparece um endereço tipo `http://192.168.18.31:8080`.
2. No celular ou no computador, no mesmo Wi-Fi, abra esse endereço no navegador.
3. Envie arquivos, cole links ou use o controle.

O app continua recebendo em segundo plano e volta a funcionar sozinho quando a TV liga.

### Controle remoto da TV, no player

| Botão | Ação |
| --- | --- |
| OK / Play-Pause | pausar / continuar |
| ◀ / ▶ | voltar / avançar 10 s |
| ▲ / ▼ | avançar / voltar 1 min |
| Voltar | sair do vídeo |

## Limites

- Links do YouTube, Netflix e afins **não** funcionam: eles não entregam o arquivo de vídeo direto. Use links diretos (`.mp4`, `.mkv`, `.webm`, `.m3u8`).
- Não é espelhamento de tela. Para espelhar o celular, use o Chromecast embutido da TV.
- Qualquer pessoa no seu Wi-Fi consegue abrir a página. Instalar um APK ainda exige confirmação na TV.
- Os arquivos ficam no armazenamento do app. Apague os que não usar mais, pela página ou desinstalando o app.

## Compilar

Sem Gradle: só o JDK 17+ e o Android SDK (`build-tools;34.0.0` e `platforms;android-34`).

```bash
ANDROID_HOME=~/Android/Sdk ./tv-drop/build.sh   # gera tv-drop/build/TV-Drop.apk
```

Cada push em `tv-drop/` dispara o workflow `.github/workflows/tv-drop.yml`, que compila e publica o APK em **Releases**.

`keystore/tvdrop.jks` (senha `tvdrop123`) é a chave que assina o APK. Ela fica no repositório para que cada versão nova instale por cima da anterior. Por estar pública, ela não protege contra alguém que assine outro APK com o mesmo nome. Para uso pessoal tudo bem. Se for distribuir o app, troque por uma chave privada guardada nos *secrets* do GitHub.
