# Project State

Last updated: 2026-09-13

## Where we are

Camera preview and JPEG capture work end-to-end using React Native Vision Camera 5. The app
prefers the back camera and falls back to the front camera when necessary.
Auto camera mode is the reliable launch default and provides working flash, zoom, front/rear camera switching,
tap-to-focus/metering, AE/AF/AWB lock, exposure compensation, device-native
Photo HDR, maximum-quality native capture, gridlines, aspect-ratio selection, and a capture timer. Smart Preset mode provides the
"Focus card" UI; swipe to switch presets and view settings and tips—but
presets do not affect capture yet.

Auto and every special mode share the same camera screen, preview, shutter, capture,
processing, and save pipeline. Future mode strategies must extend this shared capture
engine rather than introduce separate camera screens.

The implementation proposal for adapting each mode to the current environment
and device capabilities is documented in
[`ADAPTIVE_CAPTURE_PROPOSAL.md`](ADAPTIVE_CAPTURE_PROPOSAL.md).

The approved redesign plan for the photographic 3D camera-mode selector is
documented in
[`proposal-camera-mode-selection.md`](proposal-camera-mode-selection.md). The
reference is specifically the middle **SWIPE MOODS** screen; implementation is
pending explicit approval.

## Tasks

- [x] Expo + Expo Router project scaffolded (SDK 54, TypeScript, new architecture enabled)
- [x] Vision Camera wired: permission request -> camera preview -> silent shutter by default -> JPEG saved directly to an "IntelliCam" MediaLibrary album without a save confirmation
- [x] EAS Build configured (`eas.json`, `preview` profile builds an installable APK via `eas build -p android --profile preview`)
- [x] Fail-safe forced-update gate for Android/iOS native builds — reads a public per-platform JSON policy at startup/foreground, validates native build numbers and HTTPS/Android market links, caches a forced policy for at most 72 hours, and is disabled by default
- [x] Preset data (`constants/presets.ts`) - six special modes (Star, Light Trail, Waterfall, Portrait, 美顔, Product) as plain data
- [x] "Focus card" preset UI on camera screen - swipe left/right to switch, floating card shows ISO/shutter/WB/RAW chips + shooting tip, dot indicator, preset-tinted shutter (UI only, no capture effect)
- [x] Camera control UI - IntelliCam gallery button left of the shutter, capture-mode button right of the shutter, and three-dot settings button at the top-right (UI only)
- [x] Auto camera capture mode - the first-launch default for reliable automatic photo capture with flash off/auto/on, zoom controls, front/rear camera switching, gridlines, aspect ratio, and timer
- [x] Single shared camera engine - Auto and every selected special mode use the same camera screen, preview, shutter, capture function, processing queue, and save pipeline; mode-specific strategies will plug into this engine
- [x] Native-quality capture pass - Maximum quality is the default, selects the highest supported 4:3 photo resolution, requests native quality prioritization, enables supported low-light boost and Apple fusion/distortion correction, and preserves JPEG quality through aspect-ratio cropping
- [x] Centered capture-mode swiper - right-side Mode button opens a snapping horizontal selector with one prominent active card, visible previous/next cards, tap/arrow alternatives, dots, guidance, and Apply for Auto, Star, Light Trail, Waterfall, Portrait, 美顔, and Product; drag and snap calculations remain UI-thread worklet-safe, and selection updates the camera UI only
- [ ] Replace the current abstract centered swiper with the approved photographic 3D cover-flow design in `proposal-camera-mode-selection.md` after explicit approval
- [x] IntelliCam-only gallery - grid, pull-to-refresh, pagination, full-screen preview, and recoverable deletion through iOS Recently Deleted or the Android 11+ system recycle bin
- [x] Portable photo information - preserve camera EXIF through aspect-ratio cropping, embed IntelliCam capture settings in each JPEG, optionally embed GPS coordinates, and show available details from the full-screen gallery three-dot menu
- [x] Open a capture-mode selector from the mode button
- [x] Open the camera settings panel from the three-dot button
- [x] Camera settings panel contains Photo quality, Gridlines, Aspect Ratio, Timer, Shutter sound, and HDR; zoom, flash, and camera-facing remain camera-surface controls instead of three-dot settings
- [x] Gridlines overlay and 3-second/10-second capture countdown
- [x] Cancellable capture timer - tapping the shutter again cancels; backgrounding, leaving the camera screen, camera remounts, and mount failures invalidate pending capture; countdown includes animated text and per-second haptics
- [x] Aspect-ratio selection (`4:3`, `1:1`, `16:9`) applied as a centered crop to the captured JPEG
- [x] Upgrade camera zoom controls: add `0.5x`, keep `1x`, `2x`, and `3x`, and support hand-controlled pinch gestures to zoom smoothly in and out
- [x] Replace exposure +/- buttons with a vertical drag control and use an icon-only focus/exposure lock button
- [x] Connect tap focus/metering, AE/AF/AWB lock, and EV compensation to the native camera session with per-device capability/range checks
- [x] Enable device-native multi-frame Photo HDR when the active camera supports it; keep the setting disabled on unsupported cameras
- [ ] Persist photo quality, gridlines, aspect ratio, timer, shutter sound, and HDR choices
- [ ] Wire presets into actual capture (apply ISO/shutter/focus/RAW to the camera before shooting)
- [ ] Implement the adaptive capture engine defined in `ADAPTIVE_CAPTURE_PROPOSAL.md`; fixed preset values remain UI suggestions until a resolved capture plan is applied
- [ ] Move presets to SQLite `camera_presets` table (enables custom/user presets)
- [ ] Local SQLite `photos` table (capture metadata)
- [ ] Local SQLite for `user_settings`, `edit_history`, `capture_sessions`
- [ ] Editing UI / non-destructive edit history
- [ ] Long exposure / frame stacking capture flow
- [ ] Scene detection, AI assistant, cloud AI (Phase 2/3 - not MVP)
- [ ] Backend / Supabase (premium accounts, subscriptions - not MVP)

## Camera settings

The three-dot camera settings panel contains:

- **Gridlines:** rule-of-thirds overlay. Default: off.
- **Photo quality:** `Maximum` selects the highest supported 4:3 capture
  resolution, maximum JPEG quality, native quality prioritization, and available
  device processing enhancements. `Standard` uses UHD 4:3, balanced capture,
  and a smaller JPEG for faster shots. Default: `Maximum`.
- **Aspect ratio:** `4:3`, `1:1`, or `16:9`. Default: `4:3`. In portrait
  orientation, the `4:3` camera ratio appears as 3:4 on screen.
- **Timer:** off, 3 seconds, or 10 seconds. Default: off. During a
  countdown, tap the shutter again to cancel. Pending timer captures are also
  cancelled if the app is backgrounded, the camera screen closes, or the
  camera becomes unavailable.
- **Shutter sound:** plays the native camera shutter sound when enabled.
  Default: off.
- **HDR:** requests the active device's native multi-frame Photo HDR pipeline.
  The switch is selectable only when the camera reports Photo HDR support, and
  shows **Active** only after the negotiated camera-session configuration confirms
  that HDR was applied. Unsupported cameras show a disabled setting.
- **Photo location:** optionally embeds GPS coordinates in newly captured JPEGs.
  Default: off. Permission is requested only when the setting is turned on. The
  location and IntelliCam capture settings travel with the original JPEG, but an
  editor, social app, screenshot, or privacy export may remove metadata.

Flash, zoom, and front/rear switching remain direct controls on the camera
surface. Photo-size selection is no longer exposed in the settings panel.

### Zoom interaction

- Provides quick lens/zoom buttons for `0.5x`, `1x`, `2x`, and `3x`.
- Supports two-finger pinch gestures directly on the camera preview for smooth
  zooming in and out.
- Keeps the displayed zoom value synchronized when the user switches between
  quick buttons and pinch gestures.
- Clamps the requested zoom to the limits supported by the active device camera.
- Treats `0.5x` as device-dependent: it is enabled only when an ultrawide
  camera/lens is available.
- Uses Vision Camera's device zoom factors for the `2x` and `3x` quick presets;
  the active virtual camera may switch physical lenses at supported thresholds.

These choices, including photo quality, are currently session-only. Persist them in the future
`user_settings` table so they remain selected after the app restarts.
