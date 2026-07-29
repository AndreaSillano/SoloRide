# Android release signing (AAB / APK)

Google Play rejects bundles signed with the **debug** keystore. SoloRide release builds must use the upload keystore in `credentials/android/`.

## Files (do not commit)

| File | Role |
|------|------|
| `credentials/android/soloride-release.keystore` | Upload / release keystore (PKCS12) |
| `credentials/android/keystore.properties` | Passwords + alias used by Gradle |

These paths are gitignored. **Back them up offline** — if you lose the keystore, you cannot update the same Play app (unless Play App Signing allows an upload-key reset).

## Generate a new keystore (only if you need a new one)

```bash
export JAVA_HOME="/opt/homebrew/opt/openjdk@17"
export PATH="$JAVA_HOME/bin:$PATH"

mkdir -p credentials/android

keytool -genkeypair -v \
  -storetype PKCS12 \
  -keystore credentials/android/soloride-release.keystore \
  -alias soloride \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -dname "CN=SoloRide, OU=Mobile, O=SoloRide, L=Unknown, ST=Unknown, C=IT"
```

Then create `credentials/android/keystore.properties`:

```properties
storeFile=../credentials/android/soloride-release.keystore
storePassword=YOUR_STORE_PASSWORD
keyAlias=soloride
keyPassword=YOUR_KEY_PASSWORD
```

`storeFile` is relative to the `android/` project root.

## Environment (JDK + SDK)

```bash
export JAVA_HOME="/opt/homebrew/opt/openjdk@17"
export ANDROID_HOME="/opt/homebrew/share/android-commandlinetools"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
```

(Or `source ~/.zshrc` if already configured.)

## Build a release AAB (Play Console)

```bash
cd android
./gradlew bundleRelease
```

Output:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

## Build a release APK (sideload / testing)

```bash
cd android
./gradlew assembleRelease
```

Output:

```text
android/app/build/outputs/apk/release/app-release.apk
```

## Verify the AAB is **not** debug-signed

```bash
# jarsigner (JDK)
jarsigner -verify -verbose -certs \
  android/app/build/outputs/bundle/release/app-release.aab \
  | head -40

# Fingerprint of the upload key
keytool -list -v \
  -keystore credentials/android/soloride-release.keystore \
  -alias soloride
```

The signer CN should be `SoloRide` (or your release DN), **not** `Android Debug`.

## Show certificate fingerprints (Play Console / Firebase)

```bash
keytool -list -v \
  -keystore credentials/android/soloride-release.keystore \
  -alias soloride
```

Use **SHA-1** / **SHA-256** where Play or Google APIs ask for the upload certificate.

## Expo prebuild note

`/android` is generated (CNG) and gitignored. After `npx expo prebuild --platform android --clean`, re-apply the `signingConfigs.release` block in `android/app/build.gradle` (see current file) or re-run whatever patch you use. The keystore under `credentials/android/` survives prebuild.

## Play Console checklist

1. Upload `app-release.aab` from `bundleRelease`.
2. Prefer **Play App Signing** (Google holds the app signing key; you keep the upload keystore).
3. Keep a backup of `soloride-release.keystore` + `keystore.properties`.
