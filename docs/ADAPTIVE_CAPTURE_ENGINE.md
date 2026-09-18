# Consolidated adaptive capture engine

Last updated: 2026-09-16

This extends the existing mode plans, rather than restarting the proposal's
Phase 1. The merged per-mode resolvers select supported manual iOS captures
or automatic bursts: Star uses four frames, Light Trail and Waterfall use eight.
Every automatic burst uses the alignment/motion-rejection processor, rather
than compositing first and passing only a flattened result into alignment.
Auto, Beauty, and Product retain single captures with their existing processing
or native preparation. Native photo quality is always Maximum.

## Ownership

- `types/adaptive-capture.ts` defines plain-data capabilities, mode strategies,
  scene measurements, requested settings, resolved settings, confirmed outcomes,
  fallback reasons, and the versioned capture-plan record.
- `utils/adaptive-capture.mjs` wraps `getMultiFrameCapturePlan`, resolves
  capability fallbacks, normalizes measurements, and finalizes outcomes without
  changing the original plan. The camera reconciles the resolved strategy and
  frame count with the executable per-mode plan after native preparation.
- `services/capture-preparation.ts` adapts Vision Camera capabilities and builds
  output/capture configuration with capability-gated enhancements.
- `hooks/use-capture-preparation.ts` owns photo-output creation, constraints,
  supported shutter-setting prewarming, and native enhancement preparation.
- `services/capture-metadata.ts` creates and completes the portable capture
  record. `app/index.tsx` retains screen state, lifecycle cancellation, timer,
  burst orchestration, progress, and the save queue.

## Measurement boundaries

Highlight clipping is an on-device, downsampled captured-JPEG measurement:
the fraction of sampled pixels with any RGB channel at least 250/255. It is a
near-clipping diagnostic, not proof of RAW sensor saturation. The reference
frame is measured, not the cropped or composited output. Measurement failure
never prevents saving; missing data remains explicitly unknown.

Burst stability uses registration translations normalized by the reference
dimensions. Maximum displacement above 0.8% indicates movement; above 3.5%,
or rejection of at least half the candidate frames, indicates instability.
These are initial diagnostic thresholds requiring physical-device tuning.
Residual differences are recorded separately because they also contain
subject motion, changing lighting, water, and light trails. Failed registration
is not a successful zero-displacement measurement. A single photo cannot
measure relative camera motion and therefore reports unknown stability.

These measurements are captured-image diagnostics, not live pre-shutter
sensors. Resolution starts with unknown scene data. This consolidation does
not feed a stale previous shot into the next capture, silently change exposure,
or pretend that the remaining preset ISO/shutter/RAW guidance is applied.
Live, timestamped scene sensing and measurement-driven exposure decisions
remain the next adaptive milestone.

## Portable outcome record

Each new JPEG's IntelliCam metadata contains `capturePlan.version = 1`:

- `requested`: original user choices, including an unsupported HDR request.
- `resolved`: executable settings and bounded frame count after capabilities
  and installed processing modules are checked.
- `applied`: confirmed HDR session state, frames used in the saved result,
  successful multi-frame/Portrait processing, and a native controller snapshot
  at the shutter. That snapshot records reported zoom, exposure bias (with
  Android native-index versus iOS EV units), metering modes, low-light boost,
  and distortion correction; unavailable getters remain null.
- `fallbacks`: setting, requested/resolved values, and stable reason codes for
  unavailable capability/module, unconfirmed HDR, rejected alignment, or
  processing failure. Partially rejected bursts also record the planned versus
  used frame count.
- `scene`: measurement phase, source, timestamp, clipping, and registration
  stability details.

Legacy top-level metadata fields remain for existing gallery compatibility.
The gallery information sheet shows plan outcomes and fallbacks. Photo-quality
targets, selected zoom/exposure, enhancement requests, preset guidance, and
flash configuration are not mislabeled as independently confirmed sensor
values. The controller snapshot describes shutter-time state, not a guarantee
of identical settings in every burst frame. Actual camera exposure remains in
EXIF when available.

## Validation

`npm.cmd run check` includes plan reuse, request preservation, processor
fallbacks, honest HDR outcomes, measurement normalization, invalid/unknown data,
and native/metadata integration checks. Native changes require rebuilding the
installed development client/APK. Android compilation is verified; iOS needs
macOS/Xcode compilation and physical-device validation.
