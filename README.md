# IntelliCam

Smart camera app built around a reliable Auto camera and guided photography
modes for Star, Light Trail, Waterfall, Portrait, Beauty, and Product shots.
Auto capture and the optional computational Portrait effect are functional.
Star, Light Trail, and Waterfall capture aligned, motion-screened bursts with
mode-aware compositing. Their displayed ISO, shutter, focus, and RAW values are
still guidance until the native camera session can confirm those controls.
Portrait, Beauty, and Product remain guided modes.

MVP is rule-based presets. Premium adds AI scene detection and a natural-language photography assistant.

See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for the technical design and
[PROJECT_STATE.md](docs/PROJECT_STATE.md) for what is built versus planned.

## Get started

```bash
npm install
npx expo start
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
  deletion, the computational Portrait effect, and aligned multi-frame capture
- AsyncStorage for camera preferences and the forced-update policy cache
- SQLite, editing history, backend services, and cloud sync are planned, not
  currently installed

## Learn more

- [Expo documentation](https://docs.expo.dev/versions/v54.0.0/)
- [Expo Router](https://docs.expo.dev/router/introduction)
