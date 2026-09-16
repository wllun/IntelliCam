@AGENTS.md

## Project context

IntelliCam is a preset-driven camera app (React Native + Expo Router). Full technical design lives in [ARCHITECTURE.md](docs/ARCHITECTURE.md), current build status in [PROJECT_STATE.md](docs/PROJECT_STATE.md).

- MVP is rule-based presets only — no AI. Don't add AI scene detection, LLM calls, or cloud photo storage unless explicitly asked; those are Phase 2/3.
- Camera preview/capture goes through `react-native-vision-camera`; don't reach for a different camera lib without discussion.
- Photos are saved through Expo MediaLibrary to the on-device `IntelliCam`
  album. Portable capture information is embedded in each JPEG. SQLite is
  planned for relational app data only and must never store image blobs.
- No backend/Supabase work unless the task is explicitly about premium accounts, sync, or subscriptions — MVP is fully offline.
