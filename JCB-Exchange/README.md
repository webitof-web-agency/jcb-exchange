# Service Portal Mobile

This app is a thin React Native CLI shell around the existing `frontend-next` app.

## What it does

- Loads the Next.js customer panel in a full-screen `WebView`
- Handles Android hardware back navigation
- Shows loading and error states
- Requests FCM permissions on Android 13+
- Generates an FCM token on app start and syncs it to the web session when a customer auth token is available

## Development

From the repo root:

```powershell
npm run dev:backend
npm run dev:web
npm run dev:mobile
```

Then run Android:

```powershell
npm run android:mobile
```

## Device URL

The dev URL is resolved automatically from the Metro/packager host, so it works across:

- Android emulator: `http://10.0.2.2:3000`
- Android physical device on the same Wi-Fi: your laptop LAN IP
- iOS simulator: `http://localhost:3000`
- Physical device with `adb reverse`: `http://localhost:3000`

If you move networks, the app should follow the new host automatically as long as Metro and the web app are started from the same machine.

## Release APK

```powershell
cd service-portal-mobile
npm run android:release
```

The APK will be in:

`android/app/build/outputs/apk/release`

## Firebase

- `android/app/google-services.json` is already placed for the Android build
- The web session posts the FCM token to `POST /api/users/fcm-token`
- The request uses the web app auth token from `localStorage` (`rto_customer_token`)

## iPhone IPA through GitHub Actions

The repository includes a manual GitHub Actions workflow at
`.github/workflows/build-ios-ipa.yml`. It runs on a macOS runner, installs the
React Native 0.87 iOS dependencies, archives the app with manual signing, and
uploads the generated IPA as an artifact.

Run it from GitHub Actions → **Build iOS IPA** → **Run workflow**. The form
provides version, build number, IPA output, export method, web URL, and API URL
inputs.

Add these repository secrets before running the workflow:

- `IOS_CERTIFICATE_BASE64`: base64 of the Apple Distribution `.p12` file
- `IOS_CERTIFICATE_PASSWORD`: password for that `.p12` file
- `IOS_PROVISIONING_PROFILE_BASE64`: base64 of the matching `.mobileprovision`
- `IOS_TEAM_ID`: Apple Developer Team ID
- `FIREBASE_IOS_PLIST_BASE64`: base64 of the Firebase iOS
  `GoogleService-Info.plist` for bundle ID `com.webitof.jcbexchange`

On macOS, base64 values can be created with:

```bash
base64 -i certificate.p12 | pbcopy
base64 -i JCBExchange.mobileprovision | pbcopy
base64 -i GoogleService-Info.plist | pbcopy
```

The certificate must be an Apple Distribution certificate. The provisioning
profile must match both the bundle ID `com.webitof.jcbexchange` and the
selected export method. The Firebase plist is injected only during the build
and is not committed to the repository.
