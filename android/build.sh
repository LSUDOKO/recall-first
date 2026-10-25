#!/usr/bin/env bash
# Builds dist/recall-first.apk without Gradle, using the Android SDK build-tools directly.
# Needs: ANDROID_HOME (or ~/Android/Sdk) with build-tools 36 and platforms/android-36, a JDK, zip.
set -euo pipefail
cd "$(dirname "$0")/.."
SDK="${ANDROID_HOME:-$HOME/Android/Sdk}"; BT="$SDK/build-tools/36.0.0"; AJ="$SDK/platforms/android-36/android.jar"; A=android
rm -rf $A/build; mkdir -p $A/build/gen $A/build/obj $A/build/res dist
$BT/aapt2 compile --dir $A/res -o $A/build/res/res.zip
$BT/aapt2 link -o $A/build/unsigned.apk -I "$AJ" --manifest $A/AndroidManifest.xml --java $A/build/gen --min-sdk-version 24 --target-sdk-version 36 $A/build/res/res.zip
javac --release 11 -nowarn -cp "$AJ" -d $A/build/obj $A/build/gen/app/recallfirst/R.java $A/src/app/recallfirst/MainActivity.java
$BT/d8 --release --min-api 24 --lib "$AJ" --output $A/build $(find $A/build/obj -name '*.class')
(cd $A/build && zip -q unsigned.apk classes.dex)
$BT/zipalign -f -p 4 $A/build/unsigned.apk $A/build/aligned.apk
KS=$A/debug.keystore   # local only, never committed; a fresh one is generated if missing
[ -f "$KS" ] || keytool -genkeypair -keystore "$KS" -storepass android -keypass android -alias recallfirst -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Recall First, O=Recall First" >/dev/null 2>&1
$BT/apksigner sign --ks "$KS" --ks-pass pass:android --key-pass pass:android --ks-key-alias recallfirst --out dist/recall-first.apk $A/build/aligned.apk 2>/dev/null
$BT/apksigner verify dist/recall-first.apk 2>/dev/null && echo "built dist/recall-first.apk"
