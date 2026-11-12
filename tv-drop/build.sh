#!/usr/bin/env bash
# Builds build/TV-Drop.apk with Gradle.
# Needs: JDK 17+, Gradle 8.13+, Android SDK with "platforms;android-35" and "build-tools;35.0.0"
# (ANDROID_HOME pointing to it).
set -euo pipefail
cd "$(dirname "$0")"
gradle --no-daemon -q testReleaseUnitTest assembleRelease
mkdir -p build
cp build/outputs/apk/release/tv-drop-release.apk build/TV-Drop.apk
echo "Pronto: build/TV-Drop.apk ($(du -h build/TV-Drop.apk | cut -f1))"
