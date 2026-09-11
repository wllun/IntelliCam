# Adaptive Capture Engine Proposal

Status: Proposed  
Created: 2026-07-27  
Target: IntelliCam MVP and later computational-photography phases

## Purpose

IntelliCam capture modes must not rely on one fixed ISO, shutter speed, white
balance, or focus value. The correct settings vary with ambient brightness,
subject movement, camera stability, available lenses, sensor capabilities, and
device-specific limits.

The values currently stored in `constants/presets.ts` are UI examples. They
must not be presented as settings that were applied until the camera backend
can measure the scene and control those properties.

This proposal defines an adaptive capture engine in which every mode describes
its photographic intent, limits, priorities, and fallback behaviour. Runtime
scene analysis and device capabilities determine the final capture plan.

## Goals

- Adapt every capture mode to the current environment.
- Generate settings that remain inside the active device's supported limits.
- Clearly separate suggested settings from settings actually applied.
- Prefer computational multi-frame capture when a single exposure is unsafe or
  unsupported.
- Work offline for all MVP capture decisions.
- Provide honest fallbacks on devices with limited camera capabilities.
- Keep mode rules data-driven rather than hardcoded into individual screens.

## Non-goals

- AI scene classification during the first implementation.
- Cloud processing or cloud photo storage.
- Fixed professional-camera settings applied indiscriminately to every phone.
- Claiming RAW, manual exposure, HDR, or focus control when the active backend
  did not apply it.
- Replacing the device's automatic camera pipeline in Normal mode.

## Core principle

A capture mode is a strategy, not a fixed settings object.

Instead of defining:

```ts
{
  iso: 3200,
  shutter: '15s',
  whiteBalance: 4000,
}
```

Define constraints and intent:

```ts
{
  id: 'star',
  strategy: 'star',
  exposure: {
    minSeconds: 4,
    maxSeconds: 20,
    preferLongestWhenStable: true,
  },
  sensitivity: {
    minIso: 400,
    maxIso: 6400,
    preferLowerNoise: true,
  },
  whiteBalance: {
    minKelvin: 3200,
    maxKelvin: 4500,
  },
  focus: {
    strategy: 'distant-detail',
  },
  stability: {
    tripodPreferred: true,
    allowHandheldStacking: true,
  },
  capture: {
    preferredFormat: 'raw',
    minimumFrames: 4,
    maximumFrames: 20,
  },
}
```

The adaptive engine converts these rules into an executable capture plan.

## Runtime capture pipeline

### 1. Discover device capabilities

Build a normalized `CameraCapabilities` object when the active camera or lens
changes:

- Available front, rear, wide, ultrawide, and telephoto lenses
- Minimum and maximum ISO
- Minimum and maximum exposure duration
- Manual exposure support
- Focus modes and minimum focus distance
- RAW capture support
- Flash and torch availability
- Optical and electronic stabilization
- Supported picture formats and resolutions
- Burst and multi-frame capture performance
- Frame-rate limits

Capability information must come from the real camera backend. Never infer a
capability only from the phone model name.

### 2. Analyze the live scene

Produce a continuously updated `SceneMeasurement`:

- Overall luminance and exposure value
- Shadow and highlight distribution
- Highlight-clipping risk
- Approximate color temperature
- Camera movement and stability
- Subject movement
- Face presence and face location
- Focus confidence and approximate focus distance
- Available processing and memory budget

The first implementation can use rules, histograms, camera metadata, motion
sensors, and face detection. AI classification is optional and belongs to a
later phase.

### 3. Resolve the mode strategy

The selected mode combines:

- Device capabilities
- Current scene measurement
- User settings
- Mode-specific constraints
- Quality and capture-time limits

The resolver returns a `CapturePlan`, not a loose set of recommendations.

### 4. Guide the user

Before capture, show only guidance relevant to the resolved plan:

- Hold still
- Use a tripod
- Scene is too bright
- Move closer
- Add more light
- Reduce subject movement
- Clean the lens

Guidance should update when the scene changes.

### 5. Lock and capture

Immediately before capture:

- Revalidate scene conditions.
- Lock exposure, focus, and white balance where supported.
- Confirm that the selected lens and camera are still active.
- Execute either a single-frame or multi-frame capture plan.
- Record the actual settings returned by the camera.

### 6. Process and save

Depending on the plan:

- Merge HDR brackets.
- Stack low-light frames.
- Composite light trails.
- Smooth moving water.
- Reduce noise.
- Apply lens and color corrections.
- Save the output to the IntelliCam album.
- Store actual capture metadata locally.

## Proposed data contracts

```ts
interface CameraCapabilities {
  cameraId: string;
  lenses: Array<'ultrawide' | 'wide' | 'telephoto' | 'front'>;
  isoRange?: { min: number; max: number };
  exposureSecondsRange?: { min: number; max: number };
  supportsManualExposure: boolean;
  supportsManualFocus: boolean;
  supportsRaw: boolean;
  supportsFlash: boolean;
  supportsBurst: boolean;
  supportsOpticalStabilization: boolean;
}

interface SceneMeasurement {
  measuredAt: number;
  luminance: number;
  highlightClipping: number;
  shadowClipping: number;
  estimatedKelvin?: number;
  cameraStability: 'unstable' | 'handheld-stable' | 'tripod';
  subjectMotion: 'still' | 'slow' | 'fast';
  faceCount: number;
  focusConfidence?: number;
}

interface CapturePlan {
  modeId: string;
  strategy: 'automatic' | 'single-frame' | 'stack' | 'hdr-bracket' | 'composite';
  requestedSettings: RequestedCameraSettings;
  supportedSettings: RequestedCameraSettings;
  unsupportedSettings: string[];
  frameCount: number;
  estimatedDurationMs: number;
  guidance: string[];
  fallbackReason?: string;
}

interface CaptureResultMetadata {
  modeId: string;
  plan: CapturePlan;
  actualIso?: number;
  actualExposureSeconds?: number;
  actualWhiteBalanceKelvin?: number;
  actualFocusDistance?: number;
  frameCount: number;
  outputUri: string;
  createdAt: number;
}
```

`requestedSettings`, `supportedSettings`, and actual metadata must remain
separate. This prevents the UI from claiming that a recommendation was applied
when the backend ignored it.

## Mode strategies

### Normal

Priority: balanced, immediate, automatic capture.

- Use the device's automatic exposure, focus, and white balance.
- Respect user-selected flash, zoom, timer, gridlines, and aspect ratio.
- Use native HDR only if the backend reports that it is available and enabled.
- Prefer one-frame capture with minimal delay.
- Do not override the device pipeline with preset ISO or shutter values.

Fallback: Normal mode itself is the baseline fallback for every device.

### Star

Priority: collect faint light while limiting star movement and noise.

Inputs:

- Ambient darkness
- Camera stability
- Lens focal length
- Exposure-duration limit
- RAW and burst support

Rules:

- Stable tripod: prefer a longer exposure and the lowest ISO that reaches the
  target brightness.
- Handheld: use shorter frames and stack them instead of one long exposure.
- Bright urban sky: shorten exposure and lower ISO to avoid washing out the
  sky.
- Dark rural sky: increase exposure first, then ISO within the device's usable
  range.
- Focus on distant high-contrast detail or use a calibrated infinity strategy.
- Use RAW when genuinely supported; otherwise stack processed frames.

Fallback:

- No manual exposure: capture an automatic low-light burst and stack it.
- Excessive movement: block capture or warn that a stable surface is required.

### Light Trail

Priority: accumulate moving lights without clipping bright highlights.

Inputs:

- Ambient light
- Highlight intensity
- Camera stability
- Motion direction and speed

Rules:

- Reduce ISO before extending exposure.
- Use one long exposure only when manual control and stability allow it.
- Prefer multiple shorter frames when headlights would clip or the phone cannot
  sustain a long exposure.
- Composite frames using a lighten/max blend while preserving the background.
- Stop early when highlights approach the clipping threshold.

Fallback:

- No long-exposure control: capture a timed sequence of automatic frames and
  composite detected bright trails.

### Waterfall

Priority: smooth water motion while retaining texture and highlight detail.

Inputs:

- Scene brightness
- Water motion
- Camera stability
- Highlight clipping around white water

Rules:

- Dim and stable: use a slower single exposure where supported.
- Bright daylight: use several shorter exposures and average or align/merge
  them.
- Protect highlights in foam and reflections.
- Reject frames with large camera movement.
- Adapt smoothing strength to detected water motion and requested result.

Fallback:

- No manual exposure: use burst capture plus alignment and temporal averaging.

### Portrait

Priority: sharp face, natural skin tone, and useful subject separation.

Inputs:

- Face and eye position
- Subject motion
- Ambient and back lighting
- Focus confidence
- Lens availability

Rules:

- Focus and meter on the primary face or nearest visible eye.
- Maintain a safe minimum shutter speed for subject movement.
- Raise ISO only after protecting the shutter-speed floor.
- Detect back lighting and use fill flash only when it improves the face.
- Prefer an appropriate portrait lens when available.
- Preserve skin highlights and use stable white balance across frames.
- Computational background blur requires a depth or segmentation pipeline and
  must not be implied before it is implemented.

Fallback:

- No face detection: use center-weighted autofocus and provide positioning
  guidance.

### Product

Priority: accurate color, fine detail, and controlled reflections.

Inputs:

- Subject edges and size
- Camera stability
- Highlight clipping
- Color temperature
- Focus confidence

Rules:

- Prefer low ISO when the phone is stable.
- Lock focus and white balance after the composition stabilizes.
- Protect reflective and white-product highlights.
- Recommend additional light when exposure would otherwise require excessive
  ISO.
- Use focus stacking only after alignment and merging are implemented.
- Maintain consistent settings across repeated catalog shots.

Fallback:

- Unstable handheld capture: use a faster shutter and raise ISO within the
  acceptable range.

## Camera backend requirements

The current `expo-camera` backend supports the existing preview and basic
capture flow, including controls such as flash, zoom, camera direction, and
Android preview ratio. It does not expose the complete manual-control surface
needed by the adaptive engine.

The final engine needs a backend abstraction:

```ts
interface CameraController {
  getCapabilities(): Promise<CameraCapabilities>;
  applyPlan(plan: CapturePlan): Promise<AppliedCapturePlan>;
  lockForCapture(): Promise<void>;
  captureFrame(): Promise<CapturedFrame>;
  captureSequence(plan: CapturePlan): Promise<CapturedFrame[]>;
  cancelCapture(): Promise<void>;
}
```

Proposed implementations:

- `ExpoCameraController`: current basic automatic capture and early fallback.
- `AndroidCameraController`: CameraX/Camera2 implementation for manual exposure,
  RAW, metadata, and multi-frame capture.
- `IOSCameraController`: AVFoundation implementation for equivalent iOS
  capabilities.

UI components must depend on the controller interface rather than importing a
specific camera library for advanced capture decisions.

## User-interface requirements

The camera screen must distinguish:

- **Suggested:** what the adaptive strategy recommends.
- **Applied:** what the backend accepted.
- **Automatic:** what remains controlled by the device.
- **Unavailable:** what the active device cannot support.
- **Computational fallback:** what IntelliCam will approximate with multiple
  frames.

Do not display fixed ISO, shutter, white balance, or RAW chips as applied
settings until the active `CapturePlan` confirms them.

The mode card should prioritize plain-language outcomes and guidance. Technical
settings can appear in an expandable detail view for users who want them.

## Storage requirements

Add capture metadata to the planned local `photos` and `capture_sessions`
tables:

- Selected mode
- Capture strategy
- Requested settings
- Applied settings
- Actual camera metadata
- Unsupported capabilities
- Frame count
- Capture duration
- Processing operations
- Output file path

Never store large image blobs in SQLite.

## Implementation phases

### Phase 1: Honest preset model

- Replace fixed values with strategy definitions, ranges, and priorities.
- Add TypeScript contracts for capabilities, measurements, and capture plans.
- Mark all existing technical chips as suggestions.
- Add unit tests for rule resolution.
- Keep actual capture on Expo Camera automatic mode.

### Phase 2: Capability and measurement layer

- Introduce `CameraController`.
- Implement `ExpoCameraController`.
- Add device-motion stability measurement.
- Add luminance, histogram, and clipping measurements where available.
- Add runtime guidance.
- Store the resolved plan with each photo.

### Phase 3: Multi-frame computational capture

- Implement timed sequences and cancellation.
- Add frame alignment.
- Add basic stacking, averaging, HDR brackets, and light-trail compositing.
- Implement Waterfall and Light Trail computational fallbacks.
- Add processing progress and failure recovery.

### Phase 4: Native manual controls

- Implement Android CameraX/Camera2 controller.
- Implement iOS AVFoundation controller.
- Apply supported ISO, exposure duration, focus, white balance, and RAW options.
- Read actual capture metadata.
- Expand the capability test matrix across real devices.

### Phase 5: Advanced assistance

- Add face and eye metering for Portrait.
- Add subject and water-motion analysis.
- Add optional on-device scene classification.
- Add focus stacking and computational portrait separation.
- Tune mode rules using real capture results.

## Testing strategy

### Unit tests

- Capability clamping
- Exposure and ISO trade-offs
- Stability-dependent plan selection
- Highlight-protection rules
- Fallback selection
- Unsupported-setting reporting

### Scenario tests

Test each mode across:

- Bright daylight
- Indoor daylight
- Indoor low light
- Night city lighting
- Dark rural sky
- Stable tripod
- Stable handheld
- Significant camera movement
- Still and moving subjects

### Device tests

At minimum:

- Android device with one rear camera
- Android device with ultrawide and telephoto lenses
- Lower-performance Android device
- Recent iPhone with multiple lenses
- Older supported iPhone

Validate requested, applied, and actual values separately.

## Acceptance criteria

The adaptive capture foundation is complete when:

- No capture mode depends exclusively on one fixed settings object.
- Every plan is clamped to reported device capabilities.
- The UI never labels an unsupported recommendation as applied.
- Normal mode continues working on devices without manual controls.
- Every advanced mode has a documented automatic or computational fallback.
- Capture results store the selected plan and available actual metadata.
- Rule-resolution tests cover the major lighting and stability scenarios.
- A user receives actionable guidance when the requested result is not
  currently achievable.

## Open decisions

- Whether to adopt VisionCamera before building custom native controllers.
- Which histogram or frame-analysis API to use with the initial backend.
- Whether RAW processing belongs in native platform code or a cross-platform
  processing module.
- Minimum supported device performance for multi-frame modes.
- Maximum acceptable capture and processing duration per mode.
- Whether HDR should prefer native platform HDR or IntelliCam's own bracket
  merge when both are available.

## Recommended next implementation task

Start with Phase 1:

1. Define the TypeScript contracts in a camera-domain folder.
2. Convert the five current presets into strategy definitions.
3. Build a pure `resolveCapturePlan` function.
4. Add rule-resolution tests using simulated scene and capability inputs.
5. Update the UI to label unresolved values as suggestions.

This provides an honest, testable foundation without prematurely committing to
a native camera backend.
