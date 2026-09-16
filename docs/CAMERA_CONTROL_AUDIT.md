# Camera Control Audit

Last reviewed: 2026-09-16 (`feature/improvement`)

This table separates what is verified in the implementation from what still
requires testing on a physical camera. No USB device was connected during this
review.

| Control | Status | Current behavior and findings | Device verification |
| --- | --- | --- | --- |
| Exposure control | Implemented, needs physical verification | Android exposes one displayed detent per native compensation index; iOS uses the reported EV range with precise 0.1 EV detents and exact endpoints. Dragging stays on the UI runtime, React display updates are coalesced to 32 ms, and latest-value native camera updates are limited to 48 ms. Duplicate Android index requests are eliminated. See [`app/index.tsx`](../app/index.tsx) and [`utils/exposure-control.mjs`](../utils/exposure-control.mjs). | Compare every reachable detent at minimum, zero, and maximum on representative Android and iOS devices. |
| HDR | Implemented, needs physical verification | HDR is disabled and labelled `Unavailable` when the selected camera does not report `supportsPhotoHDR`. An enabled request is recorded as applied only after the active session reports `isPhotoHDREnabled`; quality and fusion enhancements are never counted as HDR. See [`app/index.tsx`](../app/index.tsx). | Compare a backlit scene with HDR off/on on a supported physical device and confirm the saved info matches the session result. |
| 0.5x zoom | Approximate, hardware-dependent | The 0.5x option is shown only when an integrated or dedicated ultrawide camera is available. It maps the displayed value to the closest supported camera zoom and switches devices when a separate ultrawide lens is required. A Galaxy S22 previously reported a native minimum of `0.6x`, so the displayed `0.5x` used that closest hardware value. | Previously reached the S22 camera's `0.6x` minimum without freezing; framing still needs comparison with Samsung Camera. |
| Focus lock | Implemented, needs physical verification | After a focus point is selected, the lock action requests locked AF/AE/AWB metering with no automatic reset. Unlocking resets automatic behavior. Android intentionally relies on CameraX's metering lock action because individual capability flags may report unsupported. | Pending near/far-subject testing while moving the phone after locking. |
| Touch gesture to zoom | Implemented | Two-finger pinch and one-finger ruler dragging share the same zoom state. Native requests are quantized, serialized, and limited to the latest target to reduce camera pressure. Gestures are intentionally limited to Auto mode. | A Galaxy S22 check confirmed a live preview at 2x and above after disabling Android zero-shutter-lag. Pinch responsiveness still needs hands-on testing. |
| Tap-to-focus | Implemented, needs physical verification | A preview tap converts view coordinates into a camera metering point and requests supported AF/AE/AWB modes. Automatic metering resumes after five seconds unless locked. The reticle does not distinguish confirmed autofocus success from an unresolved attempt. | Pending close, distant, low-light, and edge-of-frame tests. |
| Portrait effect | Implemented, needs physical verification | Auto mode can process the final JPEG with ML Kit on Android or Vision/Core Image on iOS. A failed segmentation keeps the original. The effect is post-capture and is not a hardware depth-map Portrait mode. | Test hair, glasses, hands, multiple people, cluttered backgrounds, front camera, and low light. |
| Capture mode selector | Implemented, needs physical verification | The selector uses bundled photographic cards, cover-flow perspective, UI-thread dragging and snapping, a separate draft selection, Apply, reduced-motion handling, and accessibility increment/decrement actions. | Pending slow drag, fast flick, reversal, interrupted drag, edge resistance, dismiss/reopen, Android Back, and TalkBack checks. |
| Capture quality and speed | Implemented, needs measurement | Maximum is the default and requests the highest supported 4:3 resolution, maximum JPEG quality, native quality prioritization, supported low-light boost, and Apple fusion/distortion correction. Standard uses UHD 4:3, balanced prioritization, and lower JPEG quality. Capture settings are prewarmed and crop/save work is queued after the shutter is re-enabled. | Compare Standard and Maximum detail, noise, shutter latency, and shot-to-shot time in a release build. |

## Recommended follow-up order

1. Verify exposure detents, 0.5x framing, pinch zoom, tap focus, focus lock,
   HDR, and capture-mode
   swiping on the physical Galaxy S22.
2. Add visible focus-result feedback if the camera API exposes a reliable
   success signal.
3. Test Portrait segmentation boundaries and original-photo fallback.
4. Measure shutter response and shot-to-shot delay in a release build,
   separating Standard, Maximum, HDR, flash, and Portrait captures.
