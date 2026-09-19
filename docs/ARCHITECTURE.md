# Architecture

Last updated: 2026-09-19

Editable overview: [`diagrams/INTELLICAM_PROJECT_OVERVIEW.drawio`](diagrams/INTELLICAM_PROJECT_OVERVIEW.drawio)

## Current system

```text
Expo Router application
        |
React camera screen and shared capture/save pipeline
        |
React Native Vision Camera 5 + Nitro image loading
        |
Android CameraX / Camera2 and iOS AVFoundation
        |
Local native processing modules
        |
Expo MediaLibrary IntelliCam album + portable JPEG metadata
```

IntelliCam is local-first. Auto mode provides reliable everyday capture. Star,
Light Trail, and Waterfall extend the same camera engine with aligned,
motion-screened bursts and mode-aware compositing. Auto's optional Portrait
effect and Beauty apply local native processing. Product requests supported
center metering, locks, and highlight protection. Displayed preset ISO,
shutter, white-balance, focus, and RAW values are not treated as applied unless
the native camera session or saved EXIF confirms them. No mode opens a separate
camera implementation.

## Application layer

- Navigation: Expo Router and React Navigation
- UI state: React state, refs, effects, and memoized values
- Motion and gestures: React Native Reanimated, Gesture Handler, and Worklets
- Images: `expo-image`, `expo-image-manipulator`, and Nitro Image
- Lifecycle storage: AsyncStorage for the forced-update policy cache and simple
  camera preferences

No global state library or SQLite database is currently installed. Add those
only when their corresponding roadmap features require them.

## Application update gate

Android and iOS native builds read `app-update.json` from a public HTTPS URL and
compare its per-platform minimum with `expo-application`'s immutable native
build version. A required update replaces the Expo Router stack with a
non-dismissible update screen. The policy is refreshed at startup and when the
app returns to the foreground. A recent forced policy is cached in AsyncStorage
for up to 72 hours; invalid, unavailable, or stale policies fail open. Expo Go
and web skip the check. See [`FORCE_UPDATE.md`](FORCE_UPDATE.md).

## Camera layer

React Native Vision Camera 5 owns preview, photo output, camera selection,
focus/metering, exposure compensation, zoom, and supported native HDR session
configuration. The app prefers a multi-lens rear virtual camera, can switch to
a dedicated ultrawide camera, and falls back to the front camera when needed.

The camera screen currently provides:

- automatic JPEG capture with Standard and Maximum quality choices
- front/rear switching and device-dependent ultrawide selection
- quick zoom values, a zoom ruler, and pinch-to-zoom
- tap-to-focus and metering with a visible reticle
- AE/AF/AWB locking and automatic metering reset
- exposure dragging quantized to the device's native detents with throttled
  latest-value controller updates
- flash, grid, timer, aspect-ratio crop, shutter sound, and location metadata
- supported device-native Photo HDR configuration

Capabilities differ by device. Features must use reported camera capabilities
and must not infer support from the phone model name.

## Capture modes

`constants/presets.ts` currently stores five static guidance definitions:

- Star
- Light Trail
- Waterfall
- Beauty
- Product

`constants/capture-modes.ts` adds Auto and the bundled photographic artwork used
by the 3D cover-flow selector. Browsing changes only a draft selection; pressing
Apply commits the active mode.

Without a fresh usable scene measurement, the conservative automatic plans use
four Star frames and eight Light Trail or Waterfall frames. Fresh Android scene
measurements can resolve Star to 3-8 frames, Light Trail to 6-12, and Waterfall
to 4-10; supported native manual paths may instead use a single capture. The
user can cancel a burst from the shutter, and lifecycle/session checks prevent
further frames after the camera becomes unavailable. Beauty and Product use
single captures with their processing/preparation strategies. All displayed
preset ISO, shutter, white-balance, focus, and RAW values remain guidance until
a resolved plan and the native backend confirm the actual settings. See
[`proposals/ADAPTIVE_CAPTURE_PROPOSAL.md`](proposals/ADAPTIVE_CAPTURE_PROPOSAL.md).

## Image processing and native modules

Capture preparation is owned by `hooks/use-capture-preparation.ts` and
`services/capture-preparation.ts`. Shared engine types live in
`types/adaptive-capture.ts`; the resolver wraps the existing mode strategies
rather than duplicating them. `services/capture-metadata.ts` consistently stores
requested, resolved, confirmed applied, and reason-coded fallback settings.
Captured-reference JPEG highlight clipping and normalized burst-registration
stability are measured on-device; absent measurements remain unknown. These
are not live pre-shutter measurements. See
[`ADAPTIVE_CAPTURE_ENGINE.md`](ADAPTIVE_CAPTURE_ENGINE.md).

The shared post-capture pipeline crops the source JPEG to the selected aspect
ratio, embeds portable IntelliCam metadata, saves it into the IntelliCam album,
and refreshes the latest-photo thumbnail.

Local Expo modules currently provide:

| Module | Purpose |
| --- | --- |
| `photo-metadata` | Copies camera EXIF and embeds IntelliCam capture information and optional GPS coordinates into the final JPEG |
| `portrait-effect` | Uses ML Kit on Android and Vision/Core Image on iOS for subject-aware Portrait blur and Beauty processing |
| `multi-frame-processor` | Aligns burst JPEGs by translation, rejects frames with excessive residual motion or displacement, crops to the common overlap, and composites Star, Light Trail, and Waterfall results |
| `media-trash` | Uses Android's recoverable system trash flow instead of permanent deletion |

If Portrait processing cannot identify a clear foreground subject or fails, the original
capture is saved. Android uses grayscale correlation for translation alignment;
iOS uses Vision translational registration. Star rejects locally changed pixels
before averaging, Light Trail uses lighten compositing, and Waterfall uses
temporal averaging. When alignment leaves fewer than two usable frames, the
reference JPEG is saved and the app reports that multi-frame processing was not
applied. Rotation/perspective registration, exposure-bracketed HDR merging,
RAW processing, and advanced noise reduction remain future work.

## Storage

Current storage is local and file-based:

- Photos are stored through Expo MediaLibrary in the `IntelliCam` album.
- Camera EXIF and IntelliCam capture settings travel inside the JPEG where the
  platform permits it.
- The gallery queries only that album and displays newest photos first.
- Gridlines, aspect ratio, timer, shutter sound, and HDR preference are stored
  as a validated AsyncStorage value with safe defaults.
- There is no cloud photo storage and no local SQLite database yet.

Planned SQLite tables:

| Table | Purpose |
| --- | --- |
| `photos` | Local file reference, capture mode, and searchable metadata |
| `camera_presets` | Built-in and future custom preset definitions |
| `edit_history` | Non-destructive adjustment history; never image blobs |
| `capture_sessions` | Multi-frame plan, frame count, duration, and result |

SQLite must store paths and structured metadata only, never photo blobs.
The proposed columns, keys, relationships, and indexes are maintained in the
editable [`diagrams/INTELLICAM_LOCAL_DATABASE.drawio`](diagrams/INTELLICAM_LOCAL_DATABASE.drawio)
ERD. It is a design artifact, not evidence that `expo-sqlite` is installed.

## Backend and premium phases

The MVP has no application backend, account system, Supabase integration, or
cloud AI. The app remains usable offline. A future managed subscription layer,
optional account/sync services, and cloud AI require separate approval and
must not be introduced as part of core camera work.

## Roadmap

1. **Capture reliability** — physical-device validation of the honest HDR
   state, remaining photo-quality persistence, and failure recovery.
2. **Adaptive capture** — extend the consolidated types/plans/outcome records
   with live scene sensing and measurement-driven decisions; confirm remaining
   manual controls against the session/EXIF.
3. **Computational modes** — physically tune the first aligned Star, Light
   Trail, and Waterfall pipeline; add rotation/perspective registration where
   justified; then implement HDR bracketing.
4. **Local organization and editing** — SQLite metadata, custom presets, and
   non-destructive editing.
5. **Smart assistance and premium** — on-device recommendations first; cloud
   AI, accounts, subscriptions, and synchronization only when explicitly
   approved.
