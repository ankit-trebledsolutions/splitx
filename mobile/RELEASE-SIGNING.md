# Release signing (Android)

Release APKs used to be signed with the stock React Native **debug keystore**. Its key is public, so anyone could build an APK that installs over Splix as an "update", inherits its data and session, and passes the App Links and Google Sign-In checks (audit O-1, `SECURITY-AUDIT-2026-11-05.md`).

From now on a release build is signed with **Splix's own private key**. `mobile/plugins/withReleaseSigning.js` adds the signing setup to `android/app/build.gradle` at every `expo prebuild`, so `--clean` keeps it. The key and its passwords are read when the build runs and are never in the repository. Without them, `assembleRelease` stops at the start and points here.

Debug builds (the dev client, `expo run:android`, `assembleDebug`) are unchanged and still use the debug key.

The commands below are for PowerShell on the build PC. `keytool` comes with the JDK that Gradle already uses.

## 1. Create the key (once)

Keep it **outside** the repository:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\splix-keys"
keytool -genkeypair -v -storetype PKCS12 -keystore "$env:USERPROFILE\splix-keys\splix-release.jks" -alias splix -keyalg RSA -keysize 4096 -validity 10000
```

keytool asks for a password (use a long random one from your password manager) and for a name and organisation (anything; it is shown to nobody). With PKCS12 the key password is the same as the keystore password.

## 2. Back it up (before the first build)

The key **cannot be replaced**. If it is lost, no installed copy of Splix can ever be updated again: everyone has to uninstall. If it leaks, the problem above comes back.

- Keep two copies of `splix-release.jks` off this PC, for example as a file attachment in your password manager and on an encrypted USB drive.
- Store the password in the password manager, in a separate entry from the file.
- Never email it, commit it, upload it to the VPS or put it in a chat. `mobile/.gitignore` ignores `*.jks`, `*.keystore` and `credentials.json` as a safety net.

## 3. Tell Gradle where it is (each build PC)

Create or edit `C:\Users\<you>\.gradle\gradle.properties`. This file is outside the repository and every Gradle build on the PC reads it:

```properties
SPLIX_RELEASE_STORE_FILE=C:/Users/<you>/splix-keys/splix-release.jks
SPLIX_RELEASE_STORE_PASSWORD=<the password>
SPLIX_RELEASE_KEY_ALIAS=splix
SPLIX_RELEASE_KEY_PASSWORD=<the same password>
```

Use forward slashes in the path. Environment variables of the same names also work, for CI for example.

## 4. Build and check

```powershell
cd mobile
$env:CI=1; npx expo prebuild --platform android --clean --no-install
cd android
./gradlew :app:signingReport     # "Variant: release" must show "Config: splixRelease"
./gradlew assembleRelease
```

The APK is at `mobile/android/app/build/outputs/apk/release/app-release.apk`. Bump `android.versionCode` in `app.json` as usual for a new build.

For a throwaway release build that never leaves this PC (an emulator test before the key exists), `./gradlew assembleRelease -PSPLIX_ALLOW_DEBUG_SIGNED_RELEASE=true` signs with the debug key and prints a warning. Never hand that APK to anyone.

## 5. Read the key's fingerprints

```powershell
keytool -list -v -keystore "$env:USERPROFILE\splix-keys\splix-release.jks" -alias splix
```

Note the `SHA1:` and `SHA256:` lines. `./gradlew :app:signingReport` prints the same values.

## 6. Invite links: `ANDROID_CERT_SHA256` on the server

Android opens `https://<host>/join/<code>` links straight in the app only if `/.well-known/assetlinks.json` lists the fingerprint the app is signed with.

1. On the VPS, in `backend/.env`, set the new key's **SHA-256** and nothing else:
   ```
   ANDROID_CERT_SHA256=AB:CD:...:EF
   ```
   Do not leave the debug key's fingerprint (`FA:C6:17:45:…:3B:9C`) in the list. If it stays, any debug-signed APK can claim Splix's links.
2. Recreate the API container so it reads the file again (`restart` does not):
   ```bash
   docker compose up -d --force-recreate api
   ```
3. Check that `https://srv2035255.hstgr.cloud/.well-known/assetlinks.json` shows the new fingerprint. Android checks it again when the new APK is installed.

## 7. Google Sign-In: add the new SHA-1

Google only accepts sign-ins from an Android app whose package and certificate SHA-1 it knows.

1. Open the Firebase console, project **splix-e3191**, then Project settings, Your apps, Android app `com.splity.app`.
2. Click **Add fingerprint**, paste the new **SHA-1**, and save. Add the **SHA-256** the same way.
3. Download `google-services.json` again and replace `mobile/google-services.json` with it. Commit that file; it is meant to be in git.
4. Keep the debug key's SHA-1 (`5E:8F:16:06:…:F6:25`) only while dev-client builds still need Google Sign-In. It does not let anyone install over the release app. Remove it once nobody signs in with Google on a debug build.

If the Android OAuth client was made in Google Cloud Console instead of Firebase, add the SHA-1 there: APIs & Services, Credentials, the Android client for `com.splity.app`.

## 8. Testers uninstall once

The new APK has a different signature, so Android will not install it over an older Splix ("App not installed" or "package conflicts"). This includes the in-app Update button. For this one build, each tester:

1. uninstalls Splix;
2. installs the new APK;
3. signs in again.

Everything on the server is kept. Lost from the phone: the saved sign-in, the app's own settings (theme, tour) and any pending invite. Reminder alarms come back from the server after signing in. Photos already saved to the gallery stay.

If you raise the minimum build in Admin, App Updates, to force this one, say "uninstall the old app first" in the message testers see.

The same applies when switching one phone between a dev client (debug key) and a release APK (this key): uninstall in between.

## Later

- **EAS:** if you build on EAS again, upload this same keystore (`eas credentials -p android`, the profile, Keystore, then upload an existing one). Otherwise EAS signs with a key of its own, and its builds and local builds cannot update each other. On EAS (`EAS_BUILD=true`) the plugin leaves signing to EAS.
- **Play Store:** use this key as the upload key and enrol in Play App Signing. Then add Play's app-signing SHA-256 to `ANDROID_CERT_SHA256` (comma-separated) and its SHA-1 to Firebase.
- **If the key leaks or is lost:** make a new one, repeat steps 3 to 8, and every tester uninstalls once more.
