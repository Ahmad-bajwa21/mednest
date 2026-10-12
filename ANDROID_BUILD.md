# Building the MedNest Android app

Verified working setup on this machine (macOS, 2026-10-10).

## Toolchain
- **JDK 17** at `~/mednest-jdk17` (Temurin 17.0.20.1).
- **Android SDK** at `~/Library/Android/sdk` — has platform `android-35`, `build-tools;35.0.0`,
  `platform-tools`, and `ndk;27.1.12297006` (the version RN 0.76 expects).
- `android/local.properties` points Gradle at the SDK:
  ```
  sdk.dir=/Users/apple/Library/Android/sdk
  ```

## Build a debug APK
```bash
cd "Health App"
export JAVA_HOME="$HOME/mednest-jdk17"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$JAVA_HOME/bin:$PATH"

# (re)generate the native project if app.json / plugins changed:
npx expo prebuild --platform android

cd android
./gradlew :app:assembleDebug
# APK -> android/app/build/outputs/apk/debug/app-debug.apk
```

## Run on a device / emulator
```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
adb devices                 # or start an emulator: emulator -list-avds; emulator -avd <name>
cd "Health App" && JAVA_HOME="$HOME/mednest-jdk17" npx expo run:android
```

## Notes
- First Gradle build downloads the Gradle distribution + AGP dependencies (hundreds of MB) and
  compiles the native modules; it is slow. Subsequent builds are fast.
- `react-native-google-mobile-ads` uses Google's **test** App ID (in `app.json`). Replace with a
  real AdMob App ID before release.
- The on-device model, OCR and exact-alarm modules are still stubs (`src/native/`). Wire the real
  implementations and call `registerNative()` at startup — see `DECISIONS.md` and the plan.
- Tests + typecheck (no device needed):
  ```bash
  npx tsc --noEmit && npx jest
  ```
