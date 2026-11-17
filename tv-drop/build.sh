#!/usr/bin/env bash
# Builds the two APKs of TV Drop (same app, same package name, same signature):
#   build/TV-Drop.apk          - for the TV (installed with adb)
#   build/TV-Drop-Celular.apk  - for phones (no accessibility service, no notification listener: Play Protect allows it)
# and build/SHA256SUMS.txt + build/SIGNING.txt (what was signed, with which certificate).
#
# Needs: JDK 17+, Gradle 8.13+, Android SDK with "platforms;android-35" and "build-tools;35.0.0" (ANDROID_HOME).
#
# Signing (see docs/ASSINATURA.md):
#   - Gradle signs with the original key (keystore/tvdrop.jks). That key was published by mistake, so it no longer
#     proves who made an APK.
#   - When TVDROP_SIGNING_KEY (path of the new keystore, kept out of git) and TVDROP_SIGNING_PASS are set, both
#     APKs are signed again with APK Signature Scheme v3 key rotation: Android 9+ devices move to the new key and
#     stop accepting updates signed only with the old one; installed copies update normally (same identity line).
#     Android 8.x devices still check the old key's v2 signature (the platform has no rotation before Android 9).
set -euo pipefail
cd "$(dirname "$0")"
gradle --no-daemon -q testTvReleaseUnitTest assembleTvRelease assembleCelularRelease
mkdir -p build
cp build/outputs/apk/tv/release/tv-drop-tv-release.apk build/TV-Drop.apk
cp build/outputs/apk/celular/release/tv-drop-celular-release.apk build/TV-Drop-Celular.apk

BT="${ANDROID_HOME:?ANDROID_HOME}/build-tools/$(ls "$ANDROID_HOME/build-tools" | sort -V | tail -1)"
OLD_KS="${KEYSTORE:-keystore/tvdrop.jks}" OLD_PASS="${KS_PASS:-tvdrop123}"
if [ -n "${TVDROP_SIGNING_KEY:-}" ]; then
  : "${TVDROP_SIGNING_PASS:?TVDROP_SIGNING_PASS}"
  NEW_ALIAS="${TVDROP_SIGNING_ALIAS:-tvdrop2}"
  # proof that the old key hands over to the new one; the old key may not be used to roll an update back
  "$BT/apksigner" rotate --out build/lineage.bin \
    --old-signer --ks "$OLD_KS" --ks-key-alias tvdrop --ks-pass "pass:$OLD_PASS" --key-pass "pass:$OLD_PASS" --set-rollback false \
    --new-signer --ks "$TVDROP_SIGNING_KEY" --ks-key-alias "$NEW_ALIAS" --ks-pass env:TVDROP_SIGNING_PASS --key-pass env:TVDROP_SIGNING_PASS
  for apk in build/TV-Drop.apk build/TV-Drop-Celular.apk; do
    "$BT/apksigner" sign --alignment-preserved true --v1-signing-enabled false --v2-signing-enabled true --v3-signing-enabled true \
      --rotation-min-sdk-version 28 --lineage build/lineage.bin \
      --ks "$OLD_KS" --ks-key-alias tvdrop --ks-pass "pass:$OLD_PASS" --key-pass "pass:$OLD_PASS" \
      --next-signer --ks "$TVDROP_SIGNING_KEY" --ks-key-alias "$NEW_ALIAS" --ks-pass env:TVDROP_SIGNING_PASS --key-pass env:TVDROP_SIGNING_PASS \
      "$apk"
  done
  SIGNED_WITH="nova chave (rotação v3 a partir da chave original)"
else
  SIGNED_WITH="chave original (keystore/tvdrop.jks) — a chave nova ainda não foi configurada"
fi

for apk in build/TV-Drop.apk build/TV-Drop-Celular.apk; do "$BT/apksigner" verify --min-sdk-version 26 "$apk"; done
(cd build && sha256sum TV-Drop.apk TV-Drop-Celular.apk > SHA256SUMS.txt)
{
  echo "Assinado com: $SIGNED_WITH"
  for apk in TV-Drop.apk TV-Drop-Celular.apk; do
    echo; echo "$apk"
    "$BT/apksigner" verify --print-certs --verbose "build/$apk" | grep -E "Verified using v[23]|Signer #[0-9]+ certificate (DN|SHA-256)|Number of signers" | sed 's/^/  /'
    if [ -n "${TVDROP_SIGNING_KEY:-}" ]; then "$BT/apksigner" lineage --in "build/$apk" --print-certs | grep -E "certificate (DN|SHA-256)" | sed 's/^/  linhagem: /'; fi
  done
} > build/SIGNING.txt
cat build/SIGNING.txt
echo "Pronto: build/TV-Drop.apk ($(du -h build/TV-Drop.apk | cut -f1)), build/TV-Drop-Celular.apk ($(du -h build/TV-Drop-Celular.apk | cut -f1))"
