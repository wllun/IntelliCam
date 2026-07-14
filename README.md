# IntelliCam

Smart effect camera app. Pick a photography effect (Star, Light Trail, Waterfall, Portrait, Product...) and IntelliCam applies the right camera settings and guides you through the shot — no manual ISO/shutter/focus tuning required.

MVP is rule-based presets. Premium adds AI scene detection and a natural-language photography assistant.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the technical design and [PROJECT_STATE.md](PROJECT_STATE.md) for what's built vs. planned.

## Get started

```bash
npm install
npx expo start
```

Opens in a [development build](https://docs.expo.dev/develop/development-builds/introduction/), Android emulator, iOS simulator, or [Expo Go](https://expo.dev/go).

This project uses [file-based routing](https://docs.expo.dev/router/introduction) — edit files under `app/`.

> Built on Expo SDK 54. Docs: https://docs.expo.dev/versions/v54.0.0/

## Tech stack

- React Native + Expo Router
- react-native-vision-camera (camera preview/capture, MVP)
- SQLite (local presets, photo metadata, edit history)
- Laravel/Node API + Supabase Postgres (premium accounts, sync — optional, not MVP)

## Learn more

- [Expo documentation](https://docs.expo.dev/versions/v54.0.0/)
- [Expo Router](https://docs.expo.dev/router/introduction)
