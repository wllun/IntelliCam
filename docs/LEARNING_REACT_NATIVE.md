# Learning React Native Through IntelliCam

This guide is for a web developer who knows Laravel, Node.js, HTML, CSS, and
vanilla JavaScript, but is starting React and React Native from zero.

IntelliCam is an **Expo SDK 54** React Native app. It uses React Native Vision
Camera 5 for preview and capture, Expo Router for navigation, and local native
Expo modules for metadata, recoverable deletion, and Portrait processing. Its
working flows include Auto capture, a photographic mode selector, the
IntelliCam gallery, portable photo information, and a forced-update gate.

Use the versioned [Expo SDK 54 documentation](https://docs.expo.dev/versions/v54.0.0/)
when studying or changing this project. SDK 54 uses React Native 0.81 and React
19.1. Avoid copying examples written for a different Expo SDK without checking
whether their APIs match this project.

## The mental model: web development versus React Native

React Native uses JavaScript/TypeScript and React, but it does not render normal
HTML in a browser.

| Web concept | React Native equivalent |
|---|---|
| HTML document | A tree of React components |
| `<div>` | `<View>` |
| `<p>`, `<span>`, headings | `<Text>` |
| `<button>` | Usually `<Pressable>` or `<Button>` |
| `<img>` | `<Image>` or Expo's `<Image>` |
| CSS stylesheet | JavaScript objects, commonly `StyleSheet.create()` |
| `class="..."` | `style={...}` |
| CSS Flexbox | React Native Flexbox; similar, but defaults differ |
| `onclick` | `onPress` |
| Browser URL/router | Expo Router and native navigation stacks |
| Browser APIs | React Native or Expo APIs |
| Local/session storage | AsyncStorage, SecureStore, SQLite, or file storage |
| Laravel/Node route handler | Usually a remote API endpoint called with `fetch` |
| Page refresh | Component state changes cause a re-render |

The most important change in thinking is this:

> You describe the UI for the current state. React re-runs the component
> function when state changes and updates the necessary native views.

For example, IntelliCam does not manually find and edit a DOM element when the
applied mode changes. `setActiveCaptureModeId(...)` changes state, React runs
`CameraScreen()` again, and JSX describes the newly applied mode.

## 1. What you must know

Learn these topics roughly in this order. Do not try to learn all of React
Native before making small changes to IntelliCam.

### 1. JavaScript features used heavily by React

You probably know most of these from Node.js, but make sure they are comfortable:

- `const` and `let`
- arrow functions
- destructuring
- object and array spread
- `map`, conditional expressions, and short-circuit rendering
- modules: `import` and `export`
- promises, `async`, `await`, `try`, `catch`, and `finally`
- closures and callback functions
- immutable updates instead of directly modifying state

Examples in `app/index.tsx` include:

```tsx
const [facing, setFacing] = useState<CameraFacing>('back');
const [activeCaptureModeId, setActiveCaptureModeId] = useState('auto');
CAPTURE_MODES.map((mode) => /* render one mode card or dot */);
```

### 2. TypeScript basics

This is a strict TypeScript project. Learn:

- primitive, array, object, and union types
- interfaces and type aliases
- function parameter and return types
- generics such as `useState<CameraType>()`
- optional values and optional chaining: `cameraRef.current?.resetFocus()`
- nullish coalescing: `cameraPermission?.granted ?? false`
- importing types with `import type`

Study `constants/presets.ts`. Its `Preset` interface defines the required shape
of every preset. This is similar to defining and validating a data contract,
although TypeScript checks it during development rather than at runtime.

### 3. React fundamentals

These are required before React Native will make sense:

- A component is a function that returns JSX.
- Props are inputs passed from a parent component.
- State is data owned by a component that can change.
- A state update causes a re-render.
- Hooks are functions such as `useState`, `useEffect`, and `useRef`.
- JSX embeds JavaScript with `{...}`.
- Lists need stable `key` values.
- Conditional rendering decides which component tree exists.
- Effects synchronize React with systems outside React.
- Cleanup functions prevent subscriptions from leaking.

IntelliCam examples:

- State: `facing`, `cameraReady`, `capturing`, and `activeCaptureModeId`
- Derived values: `hasCameraPermission`, `cameraDevice`, `isAutoMode`, and `preset`
- Effect: subscribe to `AppState` and unsubscribe during cleanup
- Ref: `cameraRef` gives imperative access to Vision Camera focus, zoom, and
  metering controls
- Conditional UI: permission screen, active camera, focus controls, preset
  guidance, settings, or mode selector

Do not interpret `useEffect` as a general "run code" tool. Use it when a
component must synchronize with something external, such as an app lifecycle
event, subscription, timer, or network request.

### 4. Core React Native UI

Learn these first:

- `View`
- `Text`
- `Pressable`
- `Image`
- `ScrollView`
- `FlatList`
- `TextInput`
- `StyleSheet`
- `Alert`
- `AppState`

React Native text must normally be inside `<Text>`. Styles are not full CSS.
There is no CSS cascade, selector system, or media-query workflow identical to
the web.

### 5. Layout and styling

React Native primarily uses Flexbox. Important details:

- The default `flexDirection` is `column`, not the web's `row`.
- `flex: 1` means take the available space.
- Dimensions are unitless density-independent pixels.
- Not every CSS property exists.
- Absolute positioning works but should not be the default for ordinary layouts.
- Arrays merge styles from left to right:
  `style={[styles.shutter, capturing && styles.shutterDisabled]}`.
- Platform and device safe areas matter because of notches and system bars.

`app/index.tsx` is a good example of a full-screen camera overlay where absolute
positioning is appropriate. `useSafeAreaInsets()` keeps controls away from
notches and system UI.

### 6. Expo versus React Native

These terms are related but not interchangeable:

- **React** supplies components, JSX, state, effects, refs, and rendering rules.
- **React Native** renders native mobile UI and supplies APIs such as `View`,
  `Text`, `Pressable`, `StyleSheet`, `Alert`, and `AppState`.
- **Expo** supplies the framework, developer tooling, builds, and device APIs
  such as MediaLibrary, Location, Haptics, and StatusBar. This project uses
  React Native Vision Camera instead of `expo-camera`.
- **Expo Router** turns files inside `app/` into navigable screens.
- **EAS** provides Expo's cloud build and submission services.

Use `npx expo install package-name` for Expo/React Native packages when possible.
It selects a version compatible with the installed Expo SDK.

### 7. Mobile-specific concerns

Web experience transfers well, but mobile adds:

- runtime permissions for camera, photos, location, and other protected data
- app states: active, background, and inactive
- safe areas, status bars, navigation bars, and keyboards
- touch gestures instead of mouse-first interaction
- platform differences among Android, iOS, and web
- limited device resources and performance-sensitive animations
- native configuration that may require rebuilding the app
- accessibility labels, roles, and touch target sizes
- testing on a real device, especially for camera functionality

### 8. Navigation

Expo Router uses file-based routes:

```text
app/
├── _layout.tsx  -> navigation shared by its child routes
├── index.tsx    -> route "/"
└── modal.tsx    -> route "/modal"
```

`_layout.tsx` creates a native navigation stack. `index.tsx` is registered as the
home screen and hides its header. `modal.tsx` is registered with
`presentation: 'modal'`.

This resembles Laravel's route organization only loosely. The route file is
also a React screen component, while `_layout.tsx` controls how screens are
presented and wrapped.

### 9. Native modules, permissions, and builds

Some JavaScript changes update immediately during development. Native
configuration changes often require rebuilding the native app.

In this project:

- `react-native-vision-camera` connects React to CameraX/Camera2 and AVFoundation.
- `expo-media-library` connects to the device photo library.
- `expo-haptics` triggers physical feedback.
- local Expo modules implement portable JPEG metadata, Android system trash,
  and computational Portrait processing.
- `app.json` contains native-facing configuration and permission descriptions.
- `eas.json` contains cloud build profiles.
- `android/` is generated/native Android code; it is not the best place to begin.

### 10. Data flow and application structure

As the app grows, keep these categories separate:

- routes/screens in `app/`
- reusable UI in `components/`
- reusable behavior in `hooks/`
- static configuration and types in `constants/`
- API/data access in a future `services/`, `lib/`, or similar directory
- persistent state in SQLite, AsyncStorage, SecureStore, or a backend

Avoid putting every concern into one large screen. `app/index.tsx` now contains
most camera, gesture, settings, capture, processing, and save orchestration, so
new adaptive-mode work should extract focused services, hooks, and components
instead of making the screen larger.

## 2. What this project can teach you

### Lessons already present in working code

| Topic | Where to study it | What to notice |
|---|---|---|
| Project dependencies and scripts | `package.json` | Expo entry point, exact framework versions, start/build/lint commands |
| Expo/native configuration | `app.json` | app identity, icons, permissions, config plugins, typed routes |
| File-based navigation | `app/_layout.tsx`, `app/modal.tsx` | root layout, stack screens, modal presentation, `Link` |
| Functional components and JSX | `app/index.tsx` | one screen described as a component function |
| State | `app/index.tsx` | multiple `useState` calls controlling the UI |
| Effects and cleanup | `app/index.tsx` | `AppState` subscription lifecycle |
| Refs and native methods | `app/index.tsx` | camera ref, controller, focus, metering, and zoom calls |
| Permissions | `app/index.tsx`, `app.json` | runtime request versus native configuration |
| Async device operations | `capture()` in `app/index.tsx` | capture, save, error handling, and busy state |
| React Native styling | `StyleSheet.create()` in screen/components | Flexbox, overlays, style arrays, opacity |
| Gestures | `app/index.tsx`, `components/capture-mode-carousel.tsx` | pinch, drag, swipe, UI-thread shared values, and controlled JS handoff |
| Animation | camera screen and mode carousel | animated values, timing/spring motion, reduced motion, and enter/exit transitions |
| Safe areas | `app/index.tsx` | controls offset by device insets |
| Rendering lists | preset dot indicator | `PRESETS.map(...)` and `key` |
| TypeScript data models | `constants/presets.ts` | interface, unions, library-derived icon type |
| Path aliases | `tsconfig.json` | `@/` means the project root |
| Platform-specific files | `components/ui/icon-symbol.tsx` and `.ios.tsx` | Metro selects the iOS implementation on iOS |
| Reusable themed components | `components/themed-text.tsx`, `themed-view.tsx` | props, prop spreading, custom hooks, style composition |
| Web-specific behavior | `hooks/use-color-scheme.web.ts` | a web override for static rendering/hydration |

### Follow the capture flow

This is the best complete feature to trace:

```text
app/index.tsx renders
  -> permission hooks return current permission state
  -> missing permission shows "Grant access"
  -> onPress requests camera and media permissions
  -> granted permissions allow Vision Camera's Camera component to mount
  -> onPreviewStarted enables the shutter
  -> shutter onPress calls capture()
  -> photoOutput.capturePhotoToFile() creates a cached JPEG
  -> the save queue crops it to the selected aspect ratio
  -> optional Portrait processing runs
  -> portable EXIF/IntelliCam metadata is embedded
  -> MediaLibrary finds or creates the "IntelliCam" album
  -> photo is saved to that album
  -> the latest-photo thumbnail updates
  -> success haptic runs
  -> errors show Alert.alert()
  -> finally clears the capturing state
```

Read this flow twice: once as JavaScript control flow, then again as state and UI
transitions.

### Follow the preset-selection flow

```text
Mode button sets modeMenuVisible
  -> CaptureModeCarousel initializes draftIndex from the applied mode
  -> Gesture.Pan updates a shared position on the UI thread
  -> animated card transforms create the cover-flow depth
  -> release snaps to the nearest draft mode
  -> one selection haptic runs when the settled draft changes
  -> Apply calls onApply(activeMode.id)
  -> CameraScreen updates activeCaptureModeId and closes the selector
  -> dismissing without Apply preserves the previous active mode
```

This teaches the relationship among gestures, state, rendering, and animations.

### What is only planned, not implemented

Do not assume `ARCHITECTURE.md` describes the current code. It describes a
target architecture.

As of 2026-09-16 on `feature/improvement`:

- Vision Camera preview and Auto JPEG capture are implemented.
- Gallery, photographic mode selection, settings, metadata, force update, and
  the Auto Portrait effect are functional.
- SQLite is planned, but `expo-sqlite` is not currently a dependency.
- Special presets display ISO, shutter speed, white balance, focus, and RAW
  values, but those values do **not** change capture yet.
- Multi-frame special-mode processing and non-destructive editing are planned.
- There is no Laravel/Node API, Supabase integration, cloud photo storage, or AI
  feature in this repository.

Use `PROJECT_STATE.md` as the source of truth for built versus planned work, and
confirm it against `package.json` and the executable code.

### Limits you can learn from

The project also demonstrates that product requirements and available APIs must
be compared carefully. Vision Camera exposes more control than Expo Camera, but
manual ISO, long shutter duration, RAW, and cross-platform capture sequences
still require capability checks and may require native extensions. A TypeScript
object containing `iso: 3200` does not mean the native camera applied ISO 3200.

## 3. How to read through this project

### Should `app.json` be the first file?

No. It is useful early, but it should not be the first file if your goal is to
understand how the app behaves.

`app.json` answers:

- What is the app called?
- Which platforms and native settings are configured?
- Which permission descriptions and config plugins exist?
- Which icons, splash screen, package ID, and Expo project ID are used?

It does **not** answer:

- Which screen opens first?
- What JSX is rendered?
- What state exists?
- What happens when the shutter is pressed?
- How a photo is captured and saved?

### Recommended reading order

#### Pass 1: Understand the product and actual state

1. `README.md`
   - Learn the intended product in a few minutes.
   - Treat the tech-stack section cautiously if it conflicts with installed code.
2. `PROJECT_STATE.md`
   - Separate completed features from placeholders and plans.
3. `package.json`
   - Confirm Expo SDK 54, React Native 0.81, React 19, Expo Router, scripts, and
     actually installed libraries.
4. `app.json`
   - Understand native/app configuration after you know what packages use it.

#### Pass 2: Find the runtime entry and navigation

5. In `package.json`, follow `"main": "expo-router/entry"`.
   - Expo Router, rather than a traditional `App.tsx`, owns the entry process.
6. Read `app/_layout.tsx`.
   - Identify global wrappers, theme selection, the navigation stack, and route
     presentation.
7. Read the filenames under `app/`.
   - `index.tsx` maps to `/`.
   - `gallery.tsx` maps to `/gallery`.
   - `modal.tsx` maps to `/modal`.
8. Read `app/modal.tsx` first as a small screen.
   - It is a gentle example of a component, reusable components, styles, and a
     Router `Link`.

#### Pass 3: Read the main feature

9. Read `constants/presets.ts` and `constants/capture-modes.ts`.
   - Separate guidance/capture intent from presentation artwork and copy.
10. Read `app/index.tsx` in this order:
    1. Imports: group each import by React, React Native, Expo, third party, local.
    2. Constants: understand `ALBUM_NAME`.
    3. Hooks: list every state variable, ref, permission hook, and effect.
    4. Derived values: selected camera, capabilities, zoom ranges, and mode.
    5. Event helpers: focus, zoom, settings, mode selection, and `capture`.
    6. Early return: permission UI.
    7. Main JSX: camera layer, overlays, dots, and controls.
    8. Styles: connect each style name back to its JSX element.

After the camera screen, read `components/capture-mode-carousel.tsx`,
`app/gallery.tsx`, `services/photo-metadata.ts`, and the modules under
`modules/`. These show the boundary between React UI, device APIs, and native
platform work.

#### Pass 4: Study reusable abstractions

11. `components/themed-text.tsx`
12. `components/themed-view.tsx`
13. `hooks/use-theme-color.ts`
14. `constants/theme.ts`
15. `hooks/use-color-scheme.ts` and `hooks/use-color-scheme.web.ts`
16. `components/ui/icon-symbol.tsx` and `icon-symbol.ios.tsx`
17. `components/ui/collapsible.tsx`
18. `components/parallax-scroll-view.tsx`

Some of these are starter-template components and are not used by the current
camera screen. They remain valuable as isolated examples, but do not mistake
them for part of the active capture flow.

#### Pass 5: Read build and future architecture files

19. `tsconfig.json` — strict typing and `@/` import aliases
20. `eas.json` — development, preview APK, and production build profiles
21. `ARCHITECTURE.md` — future direction, after you understand current reality
22. `android/` — only when you need to debug or implement native Android work

Do not begin by reading `node_modules/`, `package-lock.json`, generated `.expo/`
files, or the whole `android/` tree.

## A practical way to read any component

For each `.tsx` file, answer these questions on paper or in notes:

1. What does this component render?
2. What inputs (props) does it receive?
3. What state does it own?
4. What values are derived from props/state?
5. What external system does each effect synchronize with?
6. What can the user do?
7. Which handler responds to each action?
8. Which state changes afterward?
9. What conditional UI appears or disappears?
10. Which code is platform-specific or asynchronous?

For `CameraScreen`, make a state table:

| State | Meaning | What changes it | Visible effect |
|---|---|---|---|
| `facing` | active front/back camera | mount error fallback | remounts camera using `key={facing}` |
| `cameraReady` | preview can capture | camera callbacks | enables/disables shutter |
| `capturing` | photo operation in progress | `capture()` | prevents double capture, dims shutter |
| `activeCaptureModeId` | applied Auto/special mode | Apply in the mode selector | changes camera controls and guidance |
| `cardVisible` | full preset card or pill | tapping/swiping | swaps two conditional views |
| `appActive` | app is foregrounded | `AppState` listener | mounts/unmounts camera preview |

This is more effective than reading every line from top to bottom without a
model.

## Suggested learning plan using this repository

### Stage 1: React fundamentals

Goal: understand why UI changes when state changes.

1. Run the app and keep `app/index.tsx` open.
2. Change static text and colors.
3. Add a small `useState` counter to `app/modal.tsx`.
4. Add a `Pressable` that toggles a piece of text.
5. Render the preset names with `PRESETS.map`.

Learn: components, JSX, props, state, events, conditional rendering, and lists.

### Stage 2: React Native UI

Goal: become comfortable without HTML/CSS.

1. Recreate the permission card as a reusable component.
2. Experiment with `flexDirection`, `alignItems`, and `justifyContent`.
3. Add pressed-state feedback using the function form of `Pressable.style`.
4. Test on narrow and wide screens.
5. Check accessibility labels with a screen reader if available.

Learn: native components, Flexbox, touch interaction, style arrays, safe areas,
and accessibility.

### Stage 3: Hooks and async work

Goal: understand component lifecycle and device operations.

1. Trace the `AppState` effect and cleanup.
2. Log or display the permission states.
3. Explain why `cameraRef` is a ref rather than state.
4. Trace every possible exit from `capture()`.
5. Add a visible success/error status instead of relying only on haptics/alerts.

Learn: effects, cleanup, refs, permissions, promises, errors, and busy states.

### Stage 4: Routing and reusable components

Goal: understand existing routes and extract reusable boundaries without
enlarging the camera screen.

1. Trace navigation from the gallery button to `app/gallery.tsx`.
2. Compare the in-camera settings panel with a routed settings screen.
3. Extract one self-contained camera overlay into a typed component.
4. Pass state and callbacks through explicit props.

Learn: Expo Router, navigation presentation, component boundaries, and typed
props.

### Stage 5: Mobile persistence and feature work

Goal: implement one small roadmap item end to end.

A good first feature is persisting a simple setting such as capture sound,
gridlines, or aspect ratio. Start with a suitable key-value store; learn SQLite
later when relational preset/photo metadata actually needs it.

Then consider:

1. Trace how the gallery queries only the IntelliCam album.
2. Follow pagination and newest-first sorting.
3. Inspect loading, empty, denied-permission, and error states.
4. Add a small persisted preference with validation and migration-safe defaults.

Learn: persistence, data fetching from a device API, list performance, and
screen navigation.

### Stage 6: Advanced camera and native work

Only after the earlier stages:

- evaluate what Vision Camera and the active device actually support
- compare requirements with documented platform support
- learn development builds and config plugins
- learn native Android/iOS project structure
- extend a local Expo native module only when the shared camera API is insufficient
- learn Reanimated worklets and Gesture Handler in more depth
- add SQLite, image processing, or backend synchronization when required

## Small exercises tied to the current code

Do these in separate Git commits so every exercise is easy to undo.

1. Persist the photo-quality preference with a safe default.
2. Add a device test that verifies supported HDR session confirmation and the
   unsupported `Unavailable` state.
3. Extract the permission screen into a component with typed props.
4. Extract one camera settings row into a reusable component.
5. Add a test for an unsupported-camera fallback.
6. Trace why Portrait processing needs a rebuilt native app.
7. Add a visible save-queue status without blocking the shutter unnecessarily.
8. Render a loading state while permissions are unresolved.
9. Add a pure capability-clamping function and unit tests.
10. Compare Android and iOS behavior on real devices.

For each exercise, first predict:

- Which file should own the state?
- Is the value UI state, persistent state, or derived data?
- Does it require runtime permission?
- Does it require an `app.json` change and a new native build?
- What are the loading, success, empty, and error states?

## Common mistakes for a web developer

- Looking for DOM nodes and mutating them instead of changing state.
- Treating a component function as a controller that runs only once.
- Mutating arrays/objects stored in state.
- Using `useEffect` for values that can be calculated during rendering.
- Expecting all CSS properties, selectors, and units to work.
- Forgetting that raw strings must be placed inside `<Text>`.
- Ignoring Android/iOS differences because the web preview works.
- Assuming installing a package is enough when native configuration/rebuild is
  required.
- Requesting permissions only in configuration but not at runtime, or vice versa.
- Forgetting loading, denied, backgrounded, or double-tap states.
- Reading planned architecture as if it were executable code.
- Starting with state-management libraries before understanding local state and
  props.

## Documentation for this exact project version

- [Expo SDK 54 reference](https://docs.expo.dev/versions/v54.0.0/)
- [Expo SDK 54 app configuration](https://docs.expo.dev/versions/v54.0.0/config/app/)
- [Expo SDK 54 Router API](https://docs.expo.dev/versions/v54.0.0/sdk/router/)
- [Expo SDK 54 Camera](https://docs.expo.dev/versions/v54.0.0/sdk/camera/)
- [Expo SDK 54 MediaLibrary](https://docs.expo.dev/versions/v54.0.0/sdk/media-library/)
- [Expo SDK 54 Haptics](https://docs.expo.dev/versions/v54.0.0/sdk/haptics/)
- [React documentation: Learn React](https://react.dev/learn)
- [React Native documentation](https://reactnative.dev/docs/getting-started)

When looking up an Expo API, search the SDK 54 documentation first, then compare
the recommended package version with `package.json`.

## Definition of success

You do not need to memorize React Native. You are ready to work productively on
this project when you can:

- explain how `CameraScreen` re-renders after a state update
- trace permission request, preview, capture, and save flows
- create a component with typed props
- build a layout with `View`, `Text`, `Pressable`, and Flexbox
- add a route and navigate to it
- distinguish props, state, refs, effects, and derived values
- handle loading, denial, success, and errors for an async device API
- identify whether a change is JavaScript-only or needs native configuration
- verify a feature against the Expo SDK 54 API rather than assuming support
- distinguish the current implementation from the planned architecture

At that point, learn new APIs feature by feature while building IntelliCam.
