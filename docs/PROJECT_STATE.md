# Project State

Last updated: 2026-09-16
Branch reviewed: `feature/improvement`

## Where we are

IntelliCam uses Expo SDK 54, Expo Router, and React Native Vision Camera 5.
Camera preview and JPEG capture work end to end. The app prefers the rear
multi-lens camera, can use a dedicated ultrawide camera, and falls back to the
front camera when necessary.

Auto is the reliable launch mode. It provides flash, device-dependent zoom and
lens selection, pinch and ruler zoom, tap-to-focus/metering, AE/AF/AWB lock,
exposure compensation, supported native Photo HDR, Standard/Maximum quality,
gridlines, aspect-ratio cropping, a cancellable timer, shutter sound, and
optional photo-location metadata.

Auto also has a functional Portrait effect beside Flash. The post-capture
pipeline uses ML Kit on Android or Vision/Core Image on iOS to keep a detected
person sharp and blur the background. If processing fails or no clear person is
found, IntelliCam saves the original capture.

The photographic 3D cover-flow selector is implemented for Auto, Star, Light
Trail, Waterfall, Portrait, Beauty (`美顔`), and Product. Browsing changes a draft
selection; Apply commits it. Star, Light Trail, and Waterfall now run bounded,
cancellable bursts through a native alignment and motion-rejection pipeline.
Accepted frames are cropped to their common aligned area and composited using
star-safe averaging, lighten blending, or temporal averaging respectively.
Their displayed ISO, shutter, focus, white-balance, and RAW values remain
guidance rather than confirmed camera controls. Portrait, Beauty, and Product
remain guidance-only modes; Auto's separate Portrait toggle is functional.

Every mode shares one camera screen, shutter, post-processing queue, metadata
pipeline, and save path. New mode strategies must extend this engine rather
than create separate camera screens.

Related design documents:

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
- [x] Standard and Maximum capture-quality choices with the highest supported 4:3 Maximum output
- [x] Gridlines and centered `4:3`, `1:1`, `16:9`, or `Full` output framing
- [x] Off, 3-second, 5-second, 10-second, and 30-second cancellable timer with haptics
- [x] Timer cancellation on shutter retap, backgrounding, screen exit, remount, or camera unavailability
- [x] Honest native Photo HDR: disabled as `Unavailable` on unsupported cameras and recorded only after session confirmation
- [x] AsyncStorage persistence for gridlines, aspect ratio, timer, shutter sound, and HDR preference with validated defaults
- [x] Functional Auto Portrait effect with native Android/iOS person segmentation and safe original fallback
- [x] Cancellable Star, Light Trail, and Waterfall bursts with native frame alignment, whole-frame motion rejection, common-overlap cropping, and mode-aware compositing
- [x] Multi-frame applied/accepted/rejected details stored in portable JPEG information
- [x] One shared camera and save engine for Auto and every selected special mode
- [x] Photographic 3D cover-flow mode selector with draft selection, Apply, tapping, swiping, snapping, dots, haptics, accessibility actions, and reduced-motion handling
- [x] IntelliCam-only gallery with newest-first ordering, pagination, full-screen viewing, and recoverable deletion
- [x] Latest-photo thumbnail refresh after a successful save
- [x] Portable JPEG information: preserved EXIF, IntelliCam capture settings, optional GPS, and gallery information sheet
- [x] Forced-update gate for native Android/iOS builds with public JSON policy, validation, foreground refresh, and a 72-hour offline cache
- [x] EAS preview profile for an installable standalone Android APK

## Next implementation priorities

- [ ] Persist the photo-quality preference
- [ ] Add capture review and save-failure recovery without discarding the cached source image
- [ ] Implement the adaptive capture foundation: shared capability types, scene measurements, resolved capture plans, and requested/applied/actual metadata
- [ ] Connect Portrait, Beauty, and Product modes to executable capture strategies and replace the remaining guidance-only technical values with confirmed controls
- [ ] Physically tune multi-frame registration and rejection thresholds for low-texture, low-light, moving-water, and moving-light scenes; evaluate rotation/perspective alignment after translation alignment is validated
- [ ] Add physical-device validation for exposure, focus lock, tap focus, zoom, HDR, Portrait boundaries, multi-frame modes, selector motion, memory use, and release-build capture latency
- [ ] Add SQLite `photos`, `camera_presets`, `edit_history`, and `capture_sessions` tables when relational features begin
- [ ] Add custom presets and non-destructive editing
- [ ] Add on-device smart assistance only after the rule-based adaptive engine is dependable
- [ ] Defer backend, Supabase, cloud AI, accounts, and subscriptions until explicitly approved

## Camera settings

The three-dot camera panel currently contains:

Gridlines, aspect ratio, timer, shutter sound, and the user's HDR preference are
restored from AsyncStorage. Invalid or unreadable stored values fall back to the
defaults below. SQLite is not used for these simple preferences.

- **Gridlines:** rule-of-thirds overlay. Default: off.
- **Shutter sound:** controls the native capture sound. Default: off.
- **HDR:** requests native Photo HDR only when the active camera reports
  support. Unsupported cameras show a disabled `Unavailable` control, and
  photo information records HDR only after the active session confirms it.
- **Photo location:** optionally embeds coordinates in new JPEGs. Default: off;
  permission is requested only after enabling it.
- **Photo quality:** Standard uses balanced capture and a smaller JPEG; Maximum
  requests the highest supported 4:3 resolution, quality prioritization, and
  available native enhancements. Default: Maximum.
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
- SQLite and backend services are planned, not installed.
- Photos remain on-device; the project has no cloud photo storage.
