# Architecture

## Overview

```
React Native App (Expo Router)
        |
Local SQLite (presets, photo metadata, edit history)
        |
Camera Controller
        |
Native Camera API (iOS AVFoundation / Android CameraX)
        |
Image Processing Engine
        |
AI Layer (Premium, Phase 3)
        |
Laravel/Node API
        |
Supabase PostgreSQL (users, subscriptions, AI usage)
```

User picks a desired result (e.g. "Star Photography"); the app maps it to camera settings, guides capture, and processes the output. No manual settings knowledge required.

## Frontend — React Native

Chosen for cross-platform reach, fast MVP iteration, and a large ecosystem.

- Navigation: React Navigation / Expo Router
- State: Zustand or Redux Toolkit
- Animation: React Native Reanimated + Gesture Handler
- Graphics: React Native SVG

## Camera layer

React Native alone can't drive manual ISO/shutter/RAW — that needs native APIs.

| Platform | API | Capabilities |
|---|---|---|
| Android | CameraX / Camera2 | Manual ISO/shutter, RAW, focus, exposure, multi-frame capture, sensor info |
| iOS | AVFoundation / Core Image | RAW, manual exposure, focus, white balance, burst capture |

**MVP bridge:** `react-native-vision-camera` for preview, capture, and frame processing. Features it can't reach require a custom native module.

## Preset engine (no AI)

Pure lookup: user selects an effect → engine returns a settings object (ISO, shutter, focus, white balance, RAW flag, on-screen instructions). No inference, no ML — a table.

Example — Star Photography → `{ iso: 3200, shutter: "15s", focus: "infinity", wb: 4000, raw: true }`.

Supported modes at launch: Star Photography, Light Trail, Waterfall, Portrait, Product Photography — each with its own requirements (long exposure, frame stacking, face detection, stable-camera detection, etc.) noted in the preset engine, not hardcoded per-mode UI.

## Image processing

Runs after capture: RAW conversion, HDR merge, frame stacking, noise reduction, color correction.

- iOS: Core Image, Metal Performance Shaders
- Android: OpenCV, GPU
- Cross-platform: OpenCV; TensorFlow Lite reserved for future AI features

## Storage

Hybrid — local-first, cloud optional.

**Files** (on-device): `/DCIM/SmartCamera/IMG_0001.RAW`, `.JPG`, `_EDITED.JPG`. The database never stores photo blobs, only paths.

**Local SQLite** — app data:

| Table | Purpose |
|---|---|
| `photos` | filename, file_path, capture_mode, created_at |
| `camera_presets` | name, category, settings_json |
| `user_settings` | theme, default_mode, save_raw, save_jpeg |
| `edit_history` | non-destructive edit params per photo (brightness, contrast, temperature, filter) — original RAW is never modified |
| `capture_sessions` | mode, total_frames, duration — for long-exposure / stacking sequences |

MVP has no cloud photo storage (cost, privacy, offline support, speed). Cloud storage (Supabase Storage / S3 / Azure Blob) is a future option for backup, sync, and sharing — not required for MVP.

## Backend (premium only)

Only exists for account, subscription, sync, and cloud-AI features — the app works fully offline without it.

- API: Laravel or Node.js
- DB: Supabase PostgreSQL (free tier, built-in auth, storage, easy mobile SDK)

| Table | Purpose |
|---|---|
| `users` | account info |
| `subscriptions` | plan, start/expire dates |
| `user_presets` | custom presets synced across devices |
| `ai_usage` | request_type, created_at — AI feature usage tracking |

## AI layer (Premium, Phase 2/3)

- **Scene detection**: classify preview frames (night/sky/stars/water/people/lighting) via TensorFlow Lite / Core ML / ML Kit, on-device.
- **Photography assistant**: natural-language request ("cinematic night photo") → LLM + photography rules → recommended mode/settings/suggestion.
- **Image enhancement**: AI noise reduction, HDR, sky enhancement, color grading, style transfer via Core ML / TF Lite / cloud AI API.

None of this is required for MVP; don't wire it in ahead of Phase 2/3 work.

## Roadmap

1. **MVP** — camera preview, effect presets, manual settings control, RAW, long exposure, frame stacking, local SQLite, basic editor.
2. **Smart Assistance** — scene detection, lighting analysis, stability detection, better recommendations.
3. **AI Premium** — AI coach, natural-language commands, AI editing/style transfer, cloud AI, subscriptions.
