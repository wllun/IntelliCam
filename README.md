# IntelliCam

Smart camera app built around one reliable Auto camera and five special modes:
Star, Light Trail, Waterfall, Beauty, and Product. Auto includes an optional
subject-aware Portrait effect. Star, Light Trail, and Waterfall capture
environment-adaptive, aligned, motion-screened bursts with mode-aware
compositing; Beauty applies local skin smoothing; Product applies supported
metering, locks, and highlight protection. Displayed preset ISO, shutter,
focus, white-balance, and RAW values remain guidance unless the native session
or saved EXIF confirms them.

The MVP remains local and rule-based. A future premium phase may add on-device
smart assistance; cloud AI or a natural-language assistant remains deferred.

See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for the technical design,
[PROJECT_STATE.md](docs/PROJECT_STATE.md) for what is built versus planned, and
the editable [project overview diagram](docs/diagrams/INTELLICAM_PROJECT_OVERVIEW.drawio).

## Get started

```powershell
npm.cmd install
npx.cmd expo start --dev-client --localhost
```

Open it in a [development build](https://docs.expo.dev/develop/development-builds/introduction/)
on a physical device or an Android emulator. The native Vision Camera backend
is not available in Expo Go.

This project uses [file-based routing](https://docs.expo.dev/router/introduction) — edit files under `app/`.

> Built on Expo SDK 54. Docs: https://docs.expo.dev/versions/v54.0.0/

## Tech stack

- React Native + Expo Router
- React Native Vision Camera 5 for preview, capture, focus, metering, and zoom
- Expo MediaLibrary for the on-device IntelliCam album
- Local Expo native modules for portable JPEG metadata, recoverable Android
  deletion, the computational Portrait/Beauty effects, and aligned multi-frame
  capture
- AsyncStorage for camera preferences and the forced-update policy cache
- SQLite, editing history, backend services, and cloud sync are planned, not
  currently installed; see the editable
  [proposed local database diagram](docs/diagrams/INTELLICAM_LOCAL_DATABASE.drawio)

## Learn more

- [Expo documentation](https://docs.expo.dev/versions/v54.0.0/)
- [Expo Router](https://docs.expo.dev/router/introduction)
