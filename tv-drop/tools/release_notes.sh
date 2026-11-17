#!/usr/bin/env bash
# Release notes of one version: what to install where, the SHA-256 of each file and the signing certificate.
#   tools/release_notes.sh <version> <build dir> > RELEASE_NOTES.md
set -euo pipefail
VERSION="$1" DIR="$2"
cat <<EOF
TV Drop $VERSION: central multimídia, controle remoto e jogos para Android TV / Google TV.

| Arquivo | Onde instalar |
| --- | --- |
| \`TV-Drop-Celular.apk\` | **Celular**: baixe e abra. Funciona com o Google Play Protect ligado (não desative). |
| \`TV-Drop.apk\` | **TV**, pelo ADB (abaixo). Traz o touchpad e o "o que está tocando", que o Play Protect só aceita fora de downloads da internet. |
| \`index.html\` | Interface web em um arquivo só (opcional). |

Instalar na TV:
\`\`\`
adb connect IP_DA_TV:PORTA
adb install -r TV-Drop.apk
\`\`\`

Os dois APKs são o mesmo app (pacote \`com.pereiranord.tvdrop\`), com a mesma assinatura: o do celular só não traz as partes que apenas a TV usa. Detalhes: docs/PLAY-PROTECT.md.

### Conferir o download
\`sha256sum TV-Drop-Celular.apk\` deve dar exatamente o valor abaixo (também em \`SHA256SUMS.txt\`):
\`\`\`
$(cat "$DIR/SHA256SUMS.txt")
\`\`\`

### Assinatura
\`\`\`
$(cat "$DIR/SIGNING.txt")
\`\`\`
Certificados do TV Drop (SHA-256) e como conferir com \`apksigner verify --print-certs\`: docs/ASSINATURA.md.
EOF
