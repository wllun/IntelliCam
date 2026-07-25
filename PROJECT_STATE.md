# Project State

Last updated: 2026-07-25

## Where we are

Camera preview and JPEG capture work end-to-end using Expo Camera. The app
prefers the back camera and falls back to the front camera when necessary.
The "Focus card" preset UI is built; swipe to switch presets and view settings
and tips—but presets do not affect capture yet.

## Tasks

- [x] Expo + Expo Router project scaffolded (SDK 54, TypeScript, new architecture enabled)
- [x] Expo Camera wired: permission request -> camera preview -> silent shutter by default -> JPEG saved to an "IntelliCam" MediaLibrary album
- [x] EAS Build configured (`eas.json`, `preview` profile builds an installable APK via `eas build -p android --profile preview`)
- [x] Preset data (`constants/presets.ts`) - five launch modes (Star, Light Trail, Waterfall, Portrait, Product) as plain data
- [x] "Focus card" preset UI on camera screen - swipe left/right to switch, floating card shows ISO/shutter/WB/RAW chips + shooting tip, dot indicator, preset-tinted shutter (UI only, no capture effect)
- [x] Camera control UI - IntelliCam gallery button left of the shutter, capture-mode button right of the shutter, and three-dot settings button at the top-right (UI only)
- [ ] Open the IntelliCam MediaLibrary album from the gallery button
- [ ] Open a capture-mode selector from the mode button
- [ ] Open the camera settings panel from the three-dot button
- [ ] Add and persist zoom, flash, capture-sound, and aspect-ratio settings
- [ ] Wire presets into actual capture (apply ISO/shutter/focus/RAW to the camera before shooting)
- [ ] Move presets to SQLite `camera_presets` table (enables custom/user presets)
- [ ] Local SQLite `photos` table (capture metadata)
- [ ] Local SQLite for `user_settings`, `edit_history`, `capture_sessions`
- [ ] Editing UI / non-destructive edit history
- [ ] Long exposure / frame stacking capture flow
- [ ] Scene detection, AI assistant, cloud AI (Phase 2/3 - not MVP)
- [ ] Backend / Supabase (premium accounts, subscriptions - not MVP)

## Planned camera settings

Add a camera settings panel and persist these choices in the future
`user_settings` table:

- **Zoom:** adjustable from `0` to `1`, where `0` is no zoom and `1` is the
  camera's maximum zoom. Default: `0`.
- **Flash:** `off`, `on`, or `auto`. Default: `off`.
- **Capture sound:** on or off. Default: `off`. Silent capture is already
  applied through `takePictureAsync({ shutterSound: false })`.
- **Aspect ratio:** `4:3`, `1:1`, or `16:9`. Default: `4:3`. In portrait
  orientation, the `4:3` camera ratio appears as 3:4 on screen.

These settings must update the active `CameraView` and remain selected after
the app restarts.
