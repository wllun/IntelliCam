# Consolidated adaptive capture engine

Last updated: 2026-09-18

This extends the existing mode plans, rather than restarting the proposal's
Phase 1. The merged per-mode resolvers select supported manual iOS captures
or automatic bursts. Without live measurements Star uses four frames and Light
Trail/Waterfall use eight; environment-adaptive decisions can change these counts.
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
- `hooks/use-live-capture-scene.ts` samples special-mode scenes single-flight,
  pauses periodic work during capture, and refreshes within a bounded shutter-time budget.
- `utils/environment-capture.mjs` makes deterministic, capability-bounded mode
  decisions from those measurements; it never changes capture resolution or JPEG quality.
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

The diagnostics above remain post-capture. Separately, `environmentCapture`
records pre-shutter scene sensing and its decisions. Previous saved photos are
never used as the next capture's live scene.

## Environment-adaptive special modes

Android samples the displayed preview about once per second, resizes only the
analysis image, and analyzes a 96x72 grid natively. Mean luminance and RGB clipping
are preview-relative estimates, not lux, RAW saturation, or semantic recognition.
Small translations register the background while excluding bright light sources;
residual differences estimate scene movement and bright-light centroid displacement
provides a coarse movement-speed guide. Ambiguous registration, low texture, stale
samples, and changed camera/mode/zoom/framing contexts produce unknown motion.
Short 20Hz gyroscope windows provide independent angular-shake estimates.

The policy resolves once after the timer and stays fixed during the burst:

- Star: 3-8 automatic frames depending on darkness, scene motion and stability;
  supported manual focus can use infinity for a dark, quiet scene.
- Light Trail: 6-12 automatic frames with shorter gaps for faster moving lights;
  highlight clipping reduces exposure compensation.
- Waterfall: 4-10 automatic frames and 100-180ms gaps, balancing water smoothing,
  phone movement and highlight protection.
- Supported manual duration/ISO respect reported hardware ranges. Real native AE
  duration/ISO, when available, preserve the metered exposure product with mode
  bias instead of treating an auto-exposed preview as an absolute light meter.
  A metered shutter too short for trails/water smoothing selects a supported burst.
- Scene-metered automatic white balance is locked where supported, rather than
  imposing a fixed Kelvin preset. Native failures remain explicit fallbacks.

iOS currently cannot provide preview snapshots through this installed VisionCamera
backend. It uses native AE duration/ISO and Core Motion where available, but leaves
visual clipping, subject movement and light speed unknown. Full iOS visual analysis
requires a future compatible frame-output integration; it is not claimed here.
Missing/failed analysis or older clients retain conservative plans. Freshness is
limited to 1.8s and a shutter refresh has a 1s budget. Analysis cache files are deleted.
Burst time budgets stop scheduling additional frames after at least two finish;
they do not interrupt an already-running hardware capture.

All policy thresholds are initial heuristics requiring physical-device tuning.
The existing alignment/rejection pipeline and original-reference fallback remain.

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
`environmentCapture` stores timestamped pre-shutter measurements, requested and
resolved decisions, reason codes, actual captured count/duration, budget truncation,
acknowledged manual/metering operations and reported shutter-time sensor values.
Those acknowledgements are not a promise of identical settings in every EXIF frame.
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
