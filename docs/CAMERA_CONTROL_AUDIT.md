# Camera Control Audit

Last reviewed: 2026-09-16 (`feature/improvement`)

This table separates what is verified in the implementation from what still
requires testing on a physical camera. No USB device was connected during this
review.

| Control | Status | Current behavior and findings | Device verification |
| --- | --- | --- | --- |
| Exposure control | Partially good | Provides a `-2` to `+2` display range in `0.2` steps and maps it to the camera's supported native exposure range. Dragging currently sends state changes from the UI runtime to React on every frame, and Android rounds the result to hardware exposure indexes. Several displayed steps can therefore produce the same native value. See [`app/index.tsx`](../app/index.tsx). | Pending physical-device comparison at minimum, zero, and maximum exposure. |
| HDR | Needs correction | Real HDR is requested only when the camera reports `supportsPhotoHDR`. When native HDR is unavailable, the control can still highlight and the session callback can mark it applied even though only quality/fusion enhancements were requested. Fusion is not equivalent to HDR. See [`app/index.tsx`](../app/index.tsx). | Disable or mark the control unavailable when unsupported. Confirm `isPhotoHDREnabled` and compare a backlit scene with HDR off/on. |
| 0.5x zoom | Approximate, hardware-dependent | The 0.5x option is shown only when an integrated or dedicated ultrawide camera is available. It maps the displayed value to the closest supported camera zoom and switches devices when a separate ultrawide lens is required. A Galaxy S22 previously reported a native minimum of `0.6x`, so the displayed `0.5x` used that closest hardware value. | Previously reached the S22 camera's `0.6x` minimum without freezing; framing still needs comparison with Samsung Camera. |
| Focus lock | Implemented, needs physical verification | After a focus point is selected, the lock action requests locked AF/AE/AWB metering with no automatic reset. Unlocking resets automatic behavior. Android intentionally relies on CameraX's metering lock action because individual capability flags may report unsupported. | Pending near/far-subject testing while moving the phone after locking. |
| Touch gesture to zoom | Implemented | Two-finger pinch and one-finger ruler dragging share the same zoom state. Native requests are quantized, serialized, and limited to the latest target to reduce camera pressure. Gestures are intentionally limited to Auto mode. | A Galaxy S22 check confirmed a live preview at 2x and above after disabling Android zero-shutter-lag. Pinch responsiveness still needs hands-on testing. |
| Tap-to-focus | Implemented, needs physical verification | A preview tap converts view coordinates into a camera metering point and requests supported AF/AE/AWB modes. Automatic metering resumes after five seconds unless locked. The reticle does not distinguish confirmed autofocus success from an unresolved attempt. | Pending close, distant, low-light, and edge-of-frame tests. |
| Portrait effect | Implemented, needs physical verification | Auto mode can process the final JPEG with ML Kit on Android or Vision/Core Image on iOS. A failed segmentation keeps the original. The effect is post-capture and is not a hardware depth-map Portrait mode. | Test hair, glasses, hands, multiple people, cluttered backgrounds, front camera, and low light. |
| Capture mode selector | Implemented, needs physical verification | The selector uses bundled photographic cards, cover-flow perspective, UI-thread dragging and snapping, a separate draft selection, Apply, reduced-motion handling, and accessibility increment/decrement actions. | Pending slow drag, fast flick, reversal, interrupted drag, edge resistance, dismiss/reopen, Android Back, and TalkBack checks. |
| Capture quality and speed | Implemented, needs measurement | Maximum is the default and requests the highest supported 4:3 resolution, maximum JPEG quality, native quality prioritization, supported low-light boost, and Apple fusion/distortion correction. Standard uses UHD 4:3, balanced prioritization, and lower JPEG quality. Capture settings are prewarmed and crop/save work is queued after the shutter is re-enabled. | Compare Standard and Maximum detail, noise, shutter latency, and shot-to-shot time in a release build. |

## Recommended follow-up order

1. Correct the HDR fallback so the UI never labels a non-HDR capture as HDR.
2. Quantize and throttle exposure updates according to the device's native
   exposure indexes.
3. Verify 0.5x framing, pinch zoom, tap focus, focus lock, and capture-mode
   swiping on the physical Galaxy S22.
4. Add visible focus-result feedback if the camera API exposes a reliable
   success signal.
5. Test Portrait segmentation boundaries and original-photo fallback.
6. Measure shutter response and shot-to-shot delay in a release build,
   separating Standard, Maximum, HDR, flash, and Portrait captures.
