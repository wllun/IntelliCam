# Project State

Last updated: 2026-07-14

## Where we are

Camera preview and JPEG capture work end-to-end (back camera only). Preset engine and storage are next.

## Tasks

- [x] Expo + Expo Router project scaffolded (SDK 54, TypeScript, new architecture enabled)
- [x] `react-native-vision-camera` (v5) wired: permission request → back-camera preview → shutter → JPEG saved to an "IntelliCam" MediaLibrary album
- [x] EAS Build configured (`eas.json`, `preview` profile builds an installable APK via `eas build -p android --profile preview`)
- [ ] Preset engine + `camera_presets` table
- [ ] Seed the five launch modes (Star, Light Trail, Waterfall, Portrait, Product)
- [ ] Local SQLite setup for `photos` + `camera_presets`
- [ ] Preset picker UI wired to the camera screen (select a preset → apply its settings before capture)
- [ ] Local SQLite for `user_settings`, `edit_history`, `capture_sessions`
- [ ] Editing UI / non-destructive edit history
- [ ] Long exposure / frame stacking capture flow
- [ ] Scene detection, AI assistant, cloud AI (Phase 2/3 — not MVP)
- [ ] Backend / Supabase (premium accounts, subscriptions — not MVP)
