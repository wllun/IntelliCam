# Project State

Last updated: 2026-07-16

## Where we are

Camera preview + JPEG capture work end-to-end (back camera only). "Focus card" preset UI is built — swipe to switch presets, card shows settings + tip — but it's display-only; presets don't affect capture yet.

## Tasks

- [x] Expo + Expo Router project scaffolded (SDK 54, TypeScript, new architecture enabled)
- [x] `react-native-vision-camera` (v5) wired: permission request → back-camera preview → shutter → JPEG saved to an "IntelliCam" MediaLibrary album
- [x] EAS Build configured (`eas.json`, `preview` profile builds an installable APK via `eas build -p android --profile preview`)
- [x] Preset data (`constants/presets.ts`) — five launch modes (Star, Light Trail, Waterfall, Portrait, Product) as plain data
- [x] "Focus card" preset UI on camera screen — swipe left/right to switch, floating card shows ISO/shutter/WB/RAW chips + shooting tip, dot indicator, preset-tinted shutter (UI only, no capture effect)
- [ ] Wire presets into actual capture (apply ISO/shutter/focus/RAW to the camera before shooting)
- [ ] Move presets to SQLite `camera_presets` table (enables custom/user presets)
- [ ] Local SQLite `photos` table (capture metadata)
- [ ] Local SQLite for `user_settings`, `edit_history`, `capture_sessions`
- [ ] Editing UI / non-destructive edit history
- [ ] Long exposure / frame stacking capture flow
- [ ] Scene detection, AI assistant, cloud AI (Phase 2/3 — not MVP)
- [ ] Backend / Supabase (premium accounts, subscriptions — not MVP)
