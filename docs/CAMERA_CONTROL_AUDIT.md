# Camera Control Audit

Last reviewed: 2026-09-12

This table separates what is verified in the implementation from what still
requires testing on a physical camera. No USB device was connected during this
review.

| Control | Status | Current behavior and findings | Device verification |
| --- | --- | --- | --- |
| Exposure control | Partially good | Provides a `-2` to `+2` display range in `0.2` steps and maps it to the camera's supported native exposure range. Dragging currently sends state changes from the UI runtime to React on every frame, and Android rounds the result to hardware exposure indexes. Several displayed steps can therefore produce the same native value. See [exposure constants](../app/index.tsx#L63) and [native exposure mapping](../app/index.tsx#L130). | Pending physical-device comparison at minimum, zero, and maximum exposure. |
| HDR | Needs correction | Real HDR is requested only when the camera reports `supportsPhotoHDR`. When native HDR is unavailable, the control can still highlight even though it mainly selects maximum JPEG quality. `enableVirtualDeviceFusion` can improve multi-camera captures on iOS, but the current Android implementation does not use that capture option as HDR. See [HDR capability and output configuration](../app/index.tsx#L408) and [HDR constraint](../app/index.tsx#L730). | Pending. Confirm that the selected session reports `isPhotoHDREnabled` and compare a backlit photo with HDR off/on. |
| 0.5x zoom | Approximate, hardware-dependent | The 0.5x option is shown only when an integrated or dedicated ultrawide camera is available. It maps the displayed value to the closest supported camera zoom and switches camera devices when a separate ultrawide lens is required. A previous Galaxy S22 check reported a native minimum of `0.6x`, so the displayed `0.5x` used that closest available hardware value. See [zoom mapping](../app/index.tsx#L95) and [ruler minimum selection](../app/index.tsx#L654). | Previously confirmed to reach the S22 camera's `0.6x` native minimum without freezing; framing should still be visually compared with Samsung Camera. |
| Focus lock | Implemented, needs physical verification | After a focus point is selected, the lock action requests locked AF/AE/AWB metering with no automatic reset. Unlocking resets the camera to automatic behavior. On Android, the app intentionally relies on CameraX's metering locking action because the library reports the individual locking capability flags as unsupported. See [lock-mode selection](../app/index.tsx#L716) and [focus-lock action](../app/index.tsx#L1081). | Pending near/far-subject test while moving the phone after locking. |
| Touch gesture to zoom | Implemented | Two-finger pinch zoom and one-finger horizontal ruler dragging update shared values continuously. Native zoom requests are quantized, serialized, and limited to the latest requested value to reduce camera pressure. Gestures are intentionally available only in Auto mode. See [pinch gesture](../app/index.tsx#L919) and [ruler gesture](../app/index.tsx#L954). | A previous S22 check confirmed that the preview remained live at 2x and above after disabling Android zero-shutter-lag capture mode. Pinch responsiveness still needs a hands-on check. |
| Tap-to-focus | Implemented, needs physical verification | Tapping the preview converts the view coordinates to a camera metering point and requests supported AF/AE/AWB modes with `snappy` responsiveness. It returns to continuous automatic metering after five seconds unless locked. The reticle appears when the request begins, but it does not visually distinguish confirmed autofocus success from an unresolved focus attempt. See [tap-to-focus action](../app/index.tsx#L1001). | Pending close-subject, distant-subject, low-light, and edge-of-frame tests. |
| Capture mode selection swipe | Implemented, needs physical verification | The capture-mode selector handles horizontal drag and flick gestures, moves continuously with the finger, applies resistance beyond the first and last modes, and snaps to the nearest mode on release. Tapping another mode also selects it, while the mode is committed only after pressing Apply. See [mode swipe gesture](../components/capture-mode-carousel.tsx#L309) and [gesture-enabled carousel](../components/capture-mode-carousel.tsx#L392). | Pending slow-drag, fast-flick, direction-reversal, edge-resistance, and Apply/cancel tests on a physical device. |
| Capture quality and speed | Implemented, needs measurement | Maximum is the default and requests the highest supported 4:3 resolution, maximum JPEG quality, native quality prioritization, supported low-light boost, and Apple fusion/distortion correction. Standard uses UHD 4:3, balanced prioritization, and lower JPEG quality. Capture settings are prewarmed, and crop/save work is queued after the shutter is re-enabled. The blocking portion still waits for `capturePhotoToFile` to write the source JPEG, and Maximum/HDR are expected to be slower. See [photo-output configuration](../app/index.tsx#L421), [native enhancement configuration](../app/index.tsx#L647), [settings preparation](../app/index.tsx#L780), and [capture path](../app/index.tsx#L1258). | Compare Standard and Maximum for detail, noise, shutter latency, and shot-to-shot time on physical devices. Use a release build because development builds are not representative performance measurements. |

## Recommended follow-up order

1. Correct the HDR fallback so the UI never labels a non-HDR capture as HDR.
2. Quantize and throttle exposure updates according to the device's native
   exposure indexes.
3. Verify 0.5x framing, pinch zoom, tap focus, focus lock, and capture-mode
   swiping on the physical Galaxy S22.
4. Add visible focus-result feedback if the camera API exposes a reliable
   success signal.
5. Measure shutter response and shot-to-shot delay in a release build, separating
   normal, HDR, and flash captures before changing the Android quality mode.
