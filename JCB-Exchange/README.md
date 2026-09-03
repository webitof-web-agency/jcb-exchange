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
