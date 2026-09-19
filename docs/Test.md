# IntelliCam Adaptive Capture Tests

Star, Light Trail and Waterfall • 19 September 2026

## Verification status

The decision logic and Android native module have passed automated checks. Camera behavior, preview smoothness and final image quality still require physical-device testing. No physical-device result below is marked as passed.

| Check | Recorded result | Scope |
| --- | --- | --- |
| JavaScript tests | Passed — 98 tests | Existing suite including adaptive decisions, scene sampling, mode execution, Portrait preview lifecycle, gallery ordering, and metadata safety |
| Lint and TypeScript | Passed | `npm.cmd run check` implementation verification |
| Android native module | Passed | Compilation and 5 native unit tests |
| Android camera behavior | Not run | No connected device during implementation verification |
| iOS native compilation | Not run | Requires macOS and Xcode |
| iOS camera behavior | Not run | Requires a rebuilt client and physical iPhone |

These JavaScript, lint, and TypeScript results were rerun on 19 September 2026
with `npm.cmd run check`. The Android native-unit and compile entries retain
their previous recorded status; this documentation update did not run a full
APK build or physical-device test.

## Test setup

- Rebuild and install the development app containing the native changes. A JavaScript reload alone is insufficient.
- Record the device model, OS, app revision, active camera and supported controls. Include an Android camera without manual ISO or shutter control.
- Prepare a tripod, a dark textured scene, a moving light, flowing water and a bright reflective subject. Use safe indoor alternatives where necessary.
- Save the resulting JPEG, IntelliCam metadata and relevant logs for each test. Record Pass, Fail or Blocked with evidence.

## Automated checks to repeat

From the project root:

```powershell
npm.cmd run check
```

From the `android` directory:

```powershell
.\gradlew.bat :multi-frame-processor:testDebugUnitTest -PreactNativeArchitectures=arm64-v8a --console=plain
```

Policy tests cover scene freshness, invalid measurements, hardware limits, deterministic decisions and conservative fallbacks. Native tests cover preview analysis and frame blending. They do not establish real camera performance.

<!-- PAGEBREAK -->

## Mode adaptation tests

All cases in this section are Not run. Numerical expectations apply to controlled policy inputs; a real scene must first produce the corresponding measurements. Hardware capabilities can select a different supported capture path.

### S01 Dark steady Star scene

Place the phone on a tripod, select Star and capture a dark textured scene without moving subjects. Repeat while gently moving the phone.

Expected: a dark, steady, quiet automatic scene can request 8 frames. Shaky or moving conditions reduce the automatic count to 3. Supported manual capture stays within the reported shutter and ISO ranges. Infinity focus is requested only for the qualifying dark, quiet scene and supported hardware.

### S02 Bright or unknown Star scene

Capture a brighter scene, then a completely dark or low-texture scene. Inspect the measurements and fallback reasons.

Expected: the bright automatic case requests 3 frames. Unknown analysis retains a conservative plan; unavailable motion is not reported as a steady phone. Saving remains possible.

### L01 Moving lights

On a tripod, move a small light slowly across a dark textured background, then repeat faster. Compare requested counts and gaps.

Expected: a fast-light automatic case can request 12 frames and a 120 ms nominal gap. A known slower case uses a longer gap. Actual start-to-start spacing includes camera capture time and must be recorded separately.

### L02 Clipped highlights

Capture moving lights with bright reflective areas, then repeat with lower light intensity.

Expected: clipping protection reduces requested exposure compensation. Manual targets are capability-bounded. When metered shutter duration is too short for a useful manual trail, a supported automatic burst is selected with an explicit reason.

### W01 Flowing water

Capture textured flowing water on a tripod, then repeat handheld with deliberate shake.

Expected: steady movement can request 10 automatic frames and a 100 ms nominal gap. Shake reduces the automatic count to 4. Inspect water smoothing and sharpness of stationary surroundings.

### W02 Bright water

Capture water in bright light and again in a darker environment. Compare clipping, exposure decisions and saved detail.

Expected: highlights influence compensation and supported shutter targets. Unsupported manual settings remain unapplied. Maximum capture resolution and JPEG quality remain unchanged.

<!-- PAGEBREAK -->

## Safety and integration tests

All cases in this section are Not run. Controlled failures may need a debug build or test harness; mark the case Blocked if the failure cannot be safely induced.

| ID | Procedure | Acceptance criteria |
| --- | --- | --- |
| R01 | Capture a blank wall and near-total darkness. | Ambiguous or low-texture motion remains unknown; capture succeeds without fabricated measurements. |
| R02 | Change lens, zoom, mode or framing immediately before capture. | Measurements from the old context are discarded. Fresh analysis or a conservative fallback is used. |
| R03 | Set a timer, change the scene during the countdown, then capture. | The decision uses the scene after the timer, not an earlier saved photo or obsolete sample. |
| R04 | Disable or fail the analysis module or motion sensor in a harness. | Capture remains usable; unavailable fields and fallback reasons are explicit. |
| R05 | Capture on hardware without manual shutter or ISO. | Supported automatic metering and compensation are used. Metadata does not claim manual values were applied. |
| R06 | Inspect a burst through logs and frame EXIF where available. | The resolved plan stays fixed. Supported locks are requested; failed locks are recorded. Unavailable confirmation stays unknown. |
| R07 | Simulate slow frame capture until the scheduling budget is reached. | Additional frames stop after at least two complete. Actual count and budget truncation are recorded; an in-flight exposure is not forcibly interrupted. |
| R08 | Force composition failure or insufficient accepted frames. | The original reference photo is preserved, saved and identified as the fallback. |
| R09 | Background the app or switch camera during preparation and capture. | No stale camera request, crash or permanently frozen preview. Capture cancels or recovers safely. |
| R10 | Take repeated bursts, then return to Auto, Beauty and Product. | Analysis files are cleaned up, locks are restored and existing single-photo behavior remains usable. |
| R11 | On a physical device, take 50 Auto photos and 10 special-mode bursts while reducing free storage until MediaLibrary rejects a save. Restart IntelliCam, free space and use Retry. | Every accepted capture exists either in the IntelliCam album or durable pending recovery. The failed photo survives restart, Retry saves it once, and no earlier original is overwritten or lost. |

## Platform boundaries

Android visual analysis uses a small preview sample. Mean brightness is relative to the camera's automatic exposure; clipping is a JPEG near-clipping estimate, not proof of RAW saturation. Gyroscope readings estimate angular shake, not complete phone stability.

The installed iOS backend does not provide preview snapshots. Its visual brightness, clipping and movement fields must remain unknown; native metering and motion readings may still support adaptation. Full iOS visual analysis is not a passing criterion for this implementation, and must not be advertised as implemented.

<!-- PAGEBREAK -->

## Performance and image quality tests

### P01 Preview and zoom

In each special mode, move the camera continuously between two recognizable subjects while pinching and sliding the zoom ruler. Repeat for 60 seconds and compare with Auto on the same device.

Acceptance: the preview tracks the current subject during adjustment and after release, without sustained freezing or crashes. Record visible stalls, analysis activity and resource usage if profiling is available. Automated checks do not establish a performance improvement percentage.

### Q01 Quality and duration

Take five captures of each mode on a tripod and handheld. Record shutter-to-save duration, dimensions, file size, EXIF, actual frame count and processing result. Compare against the same camera and framing before adaptation where a baseline build is available.

Acceptance: the configured maximum resolution and JPEG quality are preserved. Inspect noise, highlight detail, registration artifacts, stationary-edge sharpness and the intended mode effect at full size. Do not treat file size alone as proof of quality. Star, Light Trail and Waterfall scheduling budgets are respectively 18, 16 and 10 seconds; a running hardware capture or processing can exceed them.

### M01 Metadata accuracy

For successful, unsupported-control and fallback captures, compare the saved record with logs and EXIF where available.

- `environmentCapture` includes timestamped measurements, requested and resolved decisions, and reasons.
- Actual captured count, duration, nominal gap and measured start-to-start intervals reflect the run.
- Requested ISO, shutter, focus and white balance are distinguished from acknowledged operations and native reported values.
- Android exposure bias identifies native-index units; iOS identifies EV units. Missing native getters remain unknown.
- A shutter-time controller snapshot is not presented as proof of identical sensor settings in every frame.

## Result record

For each case, complete: test ID; device and OS; app revision/build; camera capabilities; scene and stability; requested versus resolved settings; measured outcome; Pass/Fail/Blocked; JPEG/metadata/log evidence; issue reference and retest date.

Current device status: S01–S02, L01–L02, W01–W02, R01–R11, P01, Q01 and M01 are all Not run. Automated recovery stress coverage passes 250 captures with 62 simulated low-storage save failures, but it does not replace physical R11.

## Release acceptance

Repeat automated checks on the release revision. Complete device cases on representative Android hardware, including a camera without manual controls. Compile and validate iOS separately before claiming iOS support. Resolve crashes, frozen preview, lost originals and inaccurate applied-setting claims before release. Record remaining quality and timing limitations explicitly.

## Implementation references

See `docs/ADAPTIVE_CAPTURE_ENGINE.md`, `tests/environment-capture.test.mjs`, `tests/live-capture-scene.test.mjs` and the Android native test reports under `modules/multi-frame-processor/android/build/test-results/testDebugUnitTest`.
