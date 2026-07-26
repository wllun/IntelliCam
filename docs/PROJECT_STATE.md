# Project State

Last updated: 2026-07-25

## Where we are

Camera preview and JPEG capture work end-to-end using Expo Camera. The app
prefers the back camera and falls back to the front camera when necessary.
Normal camera mode provides working flash, zoom, front/rear camera switching,
and device-supported photo-size selection. Smart Preset mode provides the
"Focus card" UI; swipe to switch presets and view settings and tips—but
presets do not affect capture yet.

## Tasks

- [x] Expo + Expo Router project scaffolded (SDK 54, TypeScript, new architecture enabled)
- [x] Expo Camera wired: permission request -> camera preview -> silent shutter by default -> JPEG saved directly to an "IntelliCam" MediaLibrary album without a save confirmation
- [x] EAS Build configured (`eas.json`, `preview` profile builds an installable APK via `eas build -p android --profile preview`)
- [x] Preset data (`constants/presets.ts`) - five launch modes (Star, Light Trail, Waterfall, Portrait, Product) as plain data
- [x] "Focus card" preset UI on camera screen - swipe left/right to switch, floating card shows ISO/shutter/WB/RAW chips + shooting tip, dot indicator, preset-tinted shutter (UI only, no capture effect)
- [x] Camera control UI - IntelliCam gallery button left of the shutter, capture-mode button right of the shutter, and three-dot settings button at the top-right (UI only)
- [x] Normal camera capture mode - automatic photo capture with flash off/auto/on, zoom controls, front/rear camera switching, and device-supported photo sizes
- [x] Capture-mode selector - switch between Normal camera and Smart Presets
- [x] IntelliCam-only gallery - grid, pull-to-refresh, pagination, and full-screen preview for photos in the named MediaLibrary album
- [x] Open a capture-mode selector from the mode button
- [x] Open the camera settings panel from the three-dot button
- [x] Camera settings panel contains Gridlines, Aspect Ratio, Timer, and HDR; zoom, flash, camera-facing, and photo-size remain camera-surface controls instead of three-dot settings
- [x] Gridlines overlay and 3-second/10-second capture countdown
- [x] Aspect-ratio selection (`4:3`, `1:1`, `16:9`) passed to Expo Camera
- [ ] Upgrade camera zoom controls: add `0.5x`, keep `1x`, `2x`, and `3x`, and support hand-controlled pinch gestures to zoom smoothly in and out
- [ ] Implement real HDR multi-frame capture and merge (current HDR selection is UI only)
- [ ] Persist gridlines, aspect ratio, timer, and HDR choices
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
- **Timer:** off, 3 seconds, or 10 seconds. Default: off.
- **HDR:** selectable in the UI, but not applied to capture until the
  multi-frame processing engine is implemented.

Flash, zoom, and front/rear switching remain direct controls on the camera
surface. Photo-size selection is no longer exposed in the settings panel.

### Planned zoom interaction

- Provide quick lens/zoom buttons for `0.5x`, `1x`, `2x`, and `3x`.
- Support two-finger pinch gestures directly on the camera preview for smooth
  zooming in and out.
- Keep the displayed zoom value synchronized when the user switches between
  quick buttons and pinch gestures.
- Clamp the requested zoom to the limits supported by the active device camera.
- Treat `0.5x` as device-dependent: show or enable it only when an ultrawide
  camera/lens is available.

These choices are currently session-only. Persist them in the future
`user_settings` table so they remain selected after the app restarts.
