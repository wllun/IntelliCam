# IntelliCam Android Virtual Device Commands

Use these steps to build, install, run, and debug IntelliCam on an Android
Virtual Device (AVD).

## Quick start

Run these commands in order from the IntelliCam project folder:

```powershell
emulator -avd IntelliCam_API_36
adb devices
adb install -r ".\android\app\build\outputs\apk\debug\app-debug.apk"
npx.cmd expo start --dev-client --localhost
```

Wait for the Android home screen after starting the emulator. Before
continuing, confirm that `adb devices` shows `emulator-5554 device`.

## 1. Start the virtual device

```powershell
emulator -avd IntelliCam_API_36
```

Wait until the Android home screen appears.

## 2. Confirm that Android is ready

```powershell
adb devices
```

Continue when the result shows:

```text
emulator-5554    device
```

## 3. Install the existing native build

IntelliCam uses the native Expo Camera module, so install its current native
debug build before starting Metro. The shared APK contains both `arm64-v8a`
for physical phones and `x86_64` for this AVD:

```powershell
adb install -r ".\android\app\build\outputs\apk\debug\app-debug.apk"
```

If the APK does not exist or was previously built as ARM64-only, rebuild the
shared artifact before installing it:

```powershell
npm.cmd run android:apk
adb -e install -r ".\android\app\build\outputs\apk\debug\app-debug.apk"
```

## 4. Start IntelliCam through localhost

```powershell
npx.cmd expo start --dev-client --localhost
```

Keep this PowerShell window open while testing. If Expo does not open
IntelliCam automatically, press `a`.

At the Metro command prompt:

- Press `a` to open IntelliCam on Android.
- Press `j` to launch Hermes React Native DevTools.
- Press `r` to reload the app.

## First native build or native dependency changes

After adding or changing a native dependency, start the AVD and run:

```powershell
npm.cmd run android
```

This builds the native Android app, installs it on the running emulator, and
starts Metro. The first build can take several minutes; later builds are
usually faster.

After the native build succeeds, use this for normal development:

```powershell
npx.cmd expo start --dev-client --localhost
```

Use the installed IntelliCam debug app so its native build matches the
dependencies in this project.

## Common fixes

If the emulator is listed as `offline`:

```powershell
adb kill-server
adb start-server
adb devices
```

If Metro has stale cached files:

```powershell
npx.cmd expo start --dev-client --localhost --clear
```

If the APK does not exist yet, create and install a native build:

```powershell
npm.cmd run android
```

If DevTools reports that no compatible Hermes app is connected:

1. Confirm IntelliCam is open in the emulator.
2. Confirm the installed app is the local debug build.
3. Restart Metro, press `a`, wait for bundling to finish, then press `j`.
