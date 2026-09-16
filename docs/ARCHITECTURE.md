# Architecture

Last updated: 2026-09-16

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

IntelliCam is local-first. Auto mode provides reliable everyday capture. The
mode selector offers Star, Light Trail, Waterfall, Portrait, Beauty, and Product
guidance, but those preset values do not yet control capture. Every mode uses
the same camera screen and will extend the same capture engine rather than open
a separate camera implementation.

## Application layer

- Navigation: Expo Router and React Navigation
- UI state: React state, refs, effects, and memoized values
- Motion and gestures: React Native Reanimated, Gesture Handler, and Worklets
- Images: `expo-image`, `expo-image-manipulator`, and Nitro Image
- Lifecycle cache: AsyncStorage for the forced-update policy

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
- exposure-compensation dragging
- flash, grid, timer, aspect-ratio crop, shutter sound, and location metadata
- supported device-native Photo HDR configuration

Capabilities differ by device. Features must use reported camera capabilities
and must not infer support from the phone model name.

## Capture modes

`constants/presets.ts` currently stores six static guidance definitions:

- Star
- Light Trail
- Waterfall
- Portrait
- Beauty (`美顔` in the current UI)
- Product

`constants/capture-modes.ts` adds Auto and the bundled photographic artwork used
by the 3D cover-flow selector. Browsing changes only a draft selection; pressing
Apply commits the active mode.

At present, special-mode ISO, shutter, white-balance, focus, and RAW values are
guidance only. They must not be described as applied until a resolved capture
plan and the native backend confirm the actual settings. See
[`proposals/ADAPTIVE_CAPTURE_PROPOSAL.md`](proposals/ADAPTIVE_CAPTURE_PROPOSAL.md).

## Image processing and native modules

The shared post-capture pipeline crops the source JPEG to the selected aspect
ratio, embeds portable IntelliCam metadata, saves it into the IntelliCam album,
and refreshes the latest-photo thumbnail.

Local Expo modules currently provide:

| Module | Purpose |
| --- | --- |
| `photo-metadata` | Copies camera EXIF and embeds IntelliCam capture information and optional GPS coordinates into the final JPEG |
| `portrait-effect` | Uses ML Kit on Android and Vision/Core Image on iOS to keep a detected person sharp and blur the background |
| `media-trash` | Uses Android's recoverable system trash flow instead of permanent deletion |

If Portrait processing cannot identify a clear person or fails, the original
capture is saved. Multi-frame alignment, motion rejection, HDR merging, light
trail compositing, water smoothing, RAW processing, and advanced noise
reduction remain future work.

## Storage

Current storage is local and file-based:

- Photos are stored through Expo MediaLibrary in the `IntelliCam` album.
- Camera EXIF and IntelliCam capture settings travel inside the JPEG where the
  platform permits it.
- The gallery queries only that album and displays newest photos first.
- There is no cloud photo storage and no local SQLite database yet.

Planned SQLite tables:

| Table | Purpose |
| --- | --- |
| `photos` | Local file reference, capture mode, and searchable metadata |
| `camera_presets` | Built-in and future custom preset definitions |
| `user_settings` | Persistent camera and application preferences |
| `edit_history` | Non-destructive adjustment history; never image blobs |
| `capture_sessions` | Multi-frame plan, frame count, duration, and result |

SQLite must store paths and structured metadata only, never photo blobs.

## Backend and premium phases

The MVP has no application backend, account system, Supabase integration, or
cloud AI. The app remains usable offline. A future managed subscription layer,
optional account/sync services, and cloud AI require separate approval and
must not be introduced as part of core camera work.

## Roadmap

1. **Capture reliability** — persistent camera settings, physical-device
   validation of the honest HDR state, and failure recovery.
2. **Adaptive capture** — normalized capabilities, scene measurements,
   executable mode plans, and accurate applied metadata.
3. **Computational modes** — aligned multi-frame stacking, motion rejection,
   light-trail compositing, water smoothing, and HDR bracketing.
4. **Local organization and editing** — SQLite metadata, custom presets, and
   non-destructive editing.
5. **Smart assistance and premium** — on-device recommendations first; cloud
   AI, accounts, subscriptions, and synchronization only when explicitly
   approved.
