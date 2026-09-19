# Project State

Last updated: 2026-09-19
Branch reviewed: `markdown`

## Where we are

IntelliCam uses Expo SDK 54, Expo Router, and React Native Vision Camera 5.
Camera preview and JPEG capture work end to end. The app prefers the rear
multi-lens camera, can use a dedicated ultrawide camera, and falls back to the
front camera when necessary.

Auto is the reliable launch mode. It provides flash, device-dependent zoom and
lens selection, pinch and ruler zoom, tap-to-focus/metering, AE/AF/AWB lock,
exposure compensation, supported native Photo HDR, maximum native quality,
gridlines, aspect-ratio cropping, a cancellable timer, shutter sound, and
optional photo-location metadata.

Plain Auto capture now keeps the highest supported 4:3 JPEG and maximum JPEG
quality while asking the native backend to minimize capture latency. HDR,
Portrait, and special modes retain maximum-quality prioritization. The unstable
Android zero-shutter-lag mode remains disabled. The shutter haptic is emitted at
the native will-capture callback, so feedback matches the actual sensor event.

Auto mode also provides an optional Portrait effect beside Flash. It detects actual
foreground subject outlines (people, pets, objects), rather than retaining a sharp
rectangle. Android uses ML Kit Subject Segmentation, with a one-time Google Play
services model download, sampled native-blurred background images with transparent
subject outlines, and subject-aware saved photos. The preview no longer uses view
blur, which cannot sample camera TextureView/SurfaceView content in the installed
BlurView version. Detection failures are shown in the existing camera status area
and logged; slow preview samples have a four-second freshness limit. This native
preview change requires rebuilding and reinstalling Android, not just restarting Metro.
Portrait activation now keeps a stable compatible preview surface instead of
switching surface implementations as sampling starts. Snapshot requests check
camera lifecycle readiness, and native-image cleanup failures cannot reject the
preview loop. The reported activation crash still needs device/logcat verification;
no Android device was connected during these checks.
iOS 17+ uses Vision foreground-instance masks for saved photos only; live blur is
not available there with the current camera snapshot API. Tapping a detected subject
selects it; background taps preserve all detected foreground. Soft mask edges protect
subject boundaries. If no clear subject is found or processing fails, IntelliCam
preserves and saves the original photo. Physical-device quality still needs verification.
Beauty uses person segmentation.

The photographic 3D cover-flow selector is implemented for Auto, Star, Light
Trail, Waterfall, Beauty, and Product. Standalone Portrait was removed; Auto's
Portrait toggle remains. Browsing changes a draft
selection; Apply commits it. Star, Light Trail, and Waterfall now run bounded,
cancellable bursts through a native alignment and motion-rejection pipeline.
Accepted frames are cropped to their common aligned area and composited using
star-safe averaging, lighten blending, or temporal averaging respectively.
Capability-resolved per-mode plans preserve manual iOS exposure/focus/white-balance
where supported, with automatic aligned bursts otherwise. Conservative base
plans use four Star frames and eight Light Trail or Waterfall frames; fresh
Android scene measurements can resolve Star to 3-8, Light Trail to 6-12, and
Waterfall to 4-10 frames. Product applies supported center metering/locks and
highlight protection; Beauty applies offline natural skin smoothing.
Unsupported settings remain guidance, not confirmed controls.

Every mode shares one camera screen, shutter, post-processing queue, metadata
pipeline, and save path. New mode strategies must extend this engine rather
than create separate camera screens.

The adaptive engine now shares plain-data capabilities, scene measurements,
and capture-plan types. Native capture preparation lives outside the screen.
New photo metadata consistently records requested, resolved, confirmed applied,
and fallback outcomes, with captured-JPEG clipping and burst-registration
stability diagnostics. See [`ADAPTIVE_CAPTURE_ENGINE.md`](ADAPTIVE_CAPTURE_ENGINE.md).

Related design documents:

- [`diagrams/INTELLICAM_PROJECT_OVERVIEW.drawio`](diagrams/INTELLICAM_PROJECT_OVERVIEW.drawio)
- [`diagrams/INTELLICAM_LOCAL_DATABASE.drawio`](diagrams/INTELLICAM_LOCAL_DATABASE.drawio)
- [`proposals/ADAPTIVE_CAPTURE_PROPOSAL.md`](proposals/ADAPTIVE_CAPTURE_PROPOSAL.md)
- [`proposals/proposal-camera-mode-selection.md`](proposals/proposal-camera-mode-selection.md)
- [`CAMERA_CONTROL_AUDIT.md`](CAMERA_CONTROL_AUDIT.md)

## Completed

- [x] Expo SDK 54 + Expo Router scaffold with TypeScript and the new architecture
- [x] React Native Vision Camera preview and JPEG capture
- [x] Auto as the first-launch and fallback camera mode
- [x] Rear/front switching and device-dependent integrated or dedicated ultrawide selection
- [x] `0.5x`, `1x`, `2x`, and `3x` quick zoom controls, zoom ruler, and pinch-to-zoom
- [x] Tap-to-focus/metering reticle, five-second automatic reset, and icon-only AE/AF/AWB lock
- [x] Vertical exposure control quantized to native device detents with UI-thread dragging and throttled latest-value camera updates
- [x] Flash off/auto/on and shutter sound disabled by default
- [x] Always request maximum native quality and the highest supported 4:3 output; the Photo quality setting was removed
- [x] Minimize plain Auto shutter latency without enabling unstable Android zero-shutter-lag; retain quality prioritization for HDR, Portrait, and special modes
- [x] Gridlines and centered `4:3`, `1:1`, `16:9`, or `Full` output framing
- [x] Off, 3-second, 5-second, 10-second, and 30-second cancellable timer with haptics
- [x] Timer cancellation on shutter retap, backgrounding, screen exit, remount, or camera unavailability
- [x] Honest native Photo HDR: disabled as `Unavailable` on unsupported cameras and recorded only after session confirmation
- [x] AsyncStorage persistence for gridlines, aspect ratio, timer, shutter sound, and HDR preference with validated defaults
- [x] Subject-aware Portrait effect in Auto mode - icon control beside Flash, object/person/pet masks with soft edges, Android sampled live blur, iOS 17+ saved-photo blur, portable applied/not-applied metadata, and original-photo fallback; requires rebuilt native app and initial Android model download
- [x] Executable Star, Light Trail, Waterfall, Beauty, and Product per-mode capture strategies
- [x] Cancellable Star, Light Trail, and Waterfall bursts with native frame alignment, whole-frame motion rejection, common-overlap cropping, and mode-aware compositing
- [x] Multi-frame applied/accepted/rejected details stored in portable JPEG information
- [x] Adaptive multi-frame output resolution: 3072 px on constrained devices, 3584 px on mid-memory devices, and up to 4096 px on capable devices
- [x] Consolidated adaptive types and plan resolution reusing the existing per-mode burst plans
- [x] Extracted native capture preparation, capability adaptation, and capture-metadata assembly from the camera screen
- [x] Captured-reference highlight-clipping and burst-stability measurements with explicit unknown values and reason-coded portable fallback records
- [x] One shared camera and save engine for Auto and every selected special mode
- [x] Photographic 3D cover-flow mode selector with draft selection, Apply, tapping, swiping, snapping, dots, haptics, accessibility actions, and reduced-motion handling
- [x] IntelliCam-only gallery with newest-first ordering, pagination, full-screen viewing, and recoverable deletion
- [x] Latest-photo thumbnail refresh after a successful save
- [x] Brief post-capture review with confirmed save status and durable Retry/Delete recovery when MediaLibrary saving fails
- [x] Capture lifecycle ownership guards for app backgrounding, route exit, and camera/lens changes; invalidated late JPEGs are cleaned instead of entering the save queue
- [x] Portable JPEG information: preserved EXIF, IntelliCam capture settings, optional GPS, and gallery information sheet
- [x] Forced-update gate for native Android/iOS builds with public JSON policy, validation, foreground refresh, and a 72-hour offline cache
- [x] EAS preview profile for an installable standalone Android APK

## Next implementation priorities

- [x] Add capture review and save-failure recovery without discarding the cached source image
- [x] Add shared environment-adaptive special-mode decisions: Android small preview samples and motion sensing, supported native AE/ISO adaptation, stable burst plans and portable measurement/outcome metadata
- [ ] Add full iOS visual sensing (current backend lacks preview snapshots), tune adaptive thresholds on devices, and compare acknowledged settings with each frame's EXIF
- [ ] Replace remaining guidance-only technical values with confirmed camera controls; validate per-mode applied settings on physical devices
- [ ] Physically tune multi-frame registration and rejection thresholds for low-texture, low-light, moving-water, and moving-light scenes; evaluate rotation/perspective alignment after translation alignment is validated
- [ ] Add physical-device validation for exposure, focus lock, tap focus, zoom, HDR, Portrait boundaries, multi-frame modes, selector motion, memory use, and release-build capture latency
- [ ] Add SQLite `photos`, `camera_presets`, `edit_history`, and `capture_sessions` tables when relational features begin; use the proposed [`diagrams/INTELLICAM_LOCAL_DATABASE.drawio`](diagrams/INTELLICAM_LOCAL_DATABASE.drawio) schema as the starting point
- [ ] Add custom presets and non-destructive editing
- [ ] Add on-device smart assistance only after the rule-based adaptive engine is dependable
- [ ] Defer backend, Supabase, cloud AI, accounts, and subscriptions until explicitly approved

## Camera settings

The three-dot camera panel currently contains:

Gridlines, aspect ratio, timer, shutter sound, and the user's HDR preference are
restored from AsyncStorage. Invalid or unreadable stored values fall back to the
defaults below. SQLite is not used for these simple preferences.

Gridlines, Shutter sound, HDR, and Photo location share one icon-only row. Active
settings are highlighted; each button retains an accessible name and state.

- **Gridlines:** rule-of-thirds overlay. Default: off.
- **Shutter sound:** controls the native capture sound. Default: off.
- **HDR:** requests native Photo HDR only when the active camera reports
  support. Unsupported cameras show a disabled `Unavailable` control, and
  photo information records HDR only after the active session confirms it.
- **Photo location:** optionally embeds coordinates in new JPEGs. Default: off;
  permission is requested only after enabling it.
- **Photo quality:** always requests the highest supported 4:3 source and maximum
  JPEG quality. Plain Auto uses native balanced/minimize-latency capture; HDR,
  Portrait, and special modes use quality prioritization. Available native
  enhancements remain enabled. No settings choice.
- **Aspect ratio:** `4:3`, `1:1`, `16:9`, or `Full`. Cropping occurs after the
  full-quality source capture.
- **Timer:** off, 3, 5, 10, or 30 seconds.

Flash, Portrait effect, zoom, focus, exposure lock, and front/rear switching
remain direct camera-surface controls and are session-only. The persisted
settings are listed above.

## Important boundaries

- Expo Go cannot run this app's Vision Camera and local native modules; use a
  development build or standalone APK.
- Special-mode technical chips are guidance, not proof that those settings were
  applied.
- Multi-frame processing currently corrects translation between frames. Large
  rotation, perspective changes, or insufficient scene detail can reject a
  frame; when fewer than two frames remain, the reference JPEG is saved.
- Post-capture clipping/registration diagnostics remain separate from new
  pre-shutter environment estimates. Android provides preview-relative brightness,
  clipping and motion; iOS currently uses native metering/motion-only fallback.
  Low-texture, stale and unavailable measurements remain explicitly unknown.
- SQLite and backend services are planned, not installed.
- Photos remain on-device; the project has no cloud photo storage.
- Automated lifecycle tests cover backgrounding, route blur, and camera identity changes. Physical-device safety case R09 remains Not run and is still required before release.
