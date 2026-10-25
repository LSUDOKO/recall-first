# Recall First for Android

A thin WebView wrapper around https://recall-first.vercel.app/app. JavaScript and local storage are on (the trend lives there), the microphone is passed through for "Speak your answer", and the back button walks the WebView history.

Build (no Gradle): `android/build.sh` → `dist/recall-first.apk`. It uses aapt2, javac, d8, zipalign and apksigner from the Android SDK build-tools 36. The APK is signed with a locally generated debug key (`android/debug.keystore`, ignored by git), so Android will show the usual "unknown app" install prompt.

Install: download the APK from the GitHub release (or `dist/`), open it on the phone, or `adb install dist/recall-first.apk`.
