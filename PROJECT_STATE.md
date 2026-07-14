# Project State

Last updated: 2026-07-14

## Where we are

Fresh Expo Router skeleton (`create-expo-app` default) — no camera, preset, or storage code written yet. Currently just the default tab navigation (`app/(tabs)`, `app/modal.tsx`).

## Done

- ✓ Expo + Expo Router project scaffolded (SDK 54, TypeScript, new architecture enabled)
- ✓ Default tab navigation from `create-expo-app`

## Not started

- Camera preview / capture (`react-native-vision-camera` not yet installed)
- Preset engine + `camera_presets` table
- Local SQLite (photos, user_settings, edit_history, capture_sessions)
- Editing UI / non-destructive edit history
- Long exposure / frame stacking capture flow
- Scene detection, AI assistant, cloud AI (Phase 2/3 — not MVP)
- Backend / Supabase (premium accounts, subscriptions — not MVP)

## Next up

1. Install and wire `react-native-vision-camera`; get a basic preview + JPEG capture working.
2. Define the `camera_presets` schema and seed the five launch modes (Star, Light Trail, Waterfall, Portrait, Product).
3. Local SQLite setup for `photos` + `camera_presets`.
