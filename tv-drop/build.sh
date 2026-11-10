#!/usr/bin/env bash
# Builds TV-Drop.apk with the plain Android SDK tools (no Gradle):
#   aapt2 -> javac -> d8 -> zipalign -> apksigner
# Needs: JDK 17+, Android SDK with "build-tools;35.0.0" and "platforms;android-34".
set -euo pipefail
cd "$(dirname "$0")"

SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Android/Sdk}}"
BT="$SDK/build-tools/35.0.0"
JAR="$SDK/platforms/android-34/android.jar"
VERSION_CODE="${VERSION_CODE:-1}"
VERSION_NAME="${VERSION_NAME:-1.0}"
KEYSTORE="${KEYSTORE:-keystore/tvdrop.jks}"
KS_PASS="${KS_PASS:-tvdrop123}"
OUT="${OUT:-build/TV-Drop.apk}"

[ -x "$BT/aapt2" ] || { echo "build-tools 35.0.0 não encontrado em $SDK"; exit 1; }
[ -f "$JAR" ] || { echo "platforms;android-34 não encontrado em $SDK"; exit 1; }

rm -rf build && mkdir -p build/res build/gen build/classes build/dex

if [ ! -f "$KEYSTORE" ]; then
  mkdir -p "$(dirname "$KEYSTORE")"
  keytool -genkeypair -keystore "$KEYSTORE" -storepass "$KS_PASS" -keypass "$KS_PASS" \
    -alias tvdrop -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=TV Drop" >/dev/null
  echo "Nova chave criada em $KEYSTORE (guarde-a: as atualizações precisam dela)"
fi

"$BT/aapt2" compile --dir res -o build/res/res.zip
"$BT/aapt2" link -o build/unsigned.apk -I "$JAR" \
  --manifest AndroidManifest.xml -A assets build/res/res.zip \
  --java build/gen --min-sdk-version 26 --target-sdk-version 34 \
  --version-code "$VERSION_CODE" --version-name "$VERSION_NAME"

javac --release 8 -Xlint:-options -encoding UTF-8 -nowarn \
  -classpath "$JAR" -d build/classes \
  $(find src build/gen -name '*.java')

(cd build/classes && jar cf ../classes.jar .)
"$BT/d8" --release --min-api 26 --lib "$JAR" --output build/dex build/classes.jar
(cd build/dex && zip -q -j ../unsigned.apk classes.dex)

"$BT/zipalign" -f -p 4 build/unsigned.apk build/aligned.apk
"$BT/apksigner" sign --ks "$KEYSTORE" --ks-pass "pass:$KS_PASS" --ks-key-alias tvdrop \
  --out "$OUT" build/aligned.apk
"$BT/apksigner" verify "$OUT"
echo "Pronto: $OUT ($(du -h "$OUT" | cut -f1))"
