# IntelliCam Android Commands

Use these steps to run IntelliCam on an Android emulator or physical device.

## Physical device: install and debug

Enable **Developer options** and **USB debugging** on the phone, connect it by
USB, and accept the authorization prompt. Confirm that Android Debug Bridge can
see it:

```powershell
adb devices -l
```

The phone must be listed as `device`. If it shows `unauthorized`, unlock the
phone and accept the USB debugging prompt.

For the first debug installation, after native dependency changes, or when a
standalone preview APK is currently installed, run:

```powershell
npm.cmd run android -- --device
```

Select the physical phone when Expo displays the device list. This command
builds the native debug APK, installs it, starts Metro, and opens IntelliCam.
The first build may download Gradle and can take several minutes.

### Later debug sessions

Once the matching debug APK is installed, normal USB debugging only needs:

```powershell
adb -d reverse tcp:8081 tcp:8081
npx.cmd expo start --dev-client --localhost
```

Keep the Metro window open. At its command prompt:

- Press `a` to open IntelliCam on Android.
- Press `j` to launch Hermes React Native DevTools.
- Press `r` to reload after the debugger attaches, allowing startup
  breakpoints to trigger.

Breakpoints must be placed on executable code. If a breakpoint on an import,
type, or constant declaration does not pause, place it inside `CameraScreen`,
an event handler, or another function that runs after the debugger attaches.

> An EAS `preview` APK is a standalone build. It can run without Metro but
> cannot be used for local Metro/Hermes source-breakpoint debugging. Install
> the native debug build with `npm.cmd run android -- --device` before
> debugging.

## Emulator quick start

Run these commands in order from the IntelliCam project folder:

```powershell
emulator -avd IntelliCam_API_36
adb devices
adb install -r ".\android\app\build\outputs\apk\debug\app-debug.apk"
npx.cmd expo start --dev-client --localhost
```

Wait for the Android home screen after the first command. Before continuing
past `adb devices`, confirm that it shows `emulator-5554 device`.

## 1. Start the virtual device

Open PowerShell in the IntelliCam project folder and run:

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
debug build before starting Metro.

If IntelliCam is not installed on the emulator yet, install the existing debug
APK:

```powershell
adb install -r ".\android\app\build\outputs\apk\debug\app-debug.apk"
```

## 4. Start IntelliCam through localhost

```powershell
npx.cmd expo start --dev-client --localhost
```

Keep this PowerShell window open while testing the app.

If Expo starts but does not open IntelliCam automatically, press:

```text
a
```

## First native build or native dependency changes

Run this after adding or changing a native dependency:

```powershell
npm.cmd run android
```

This builds the native Android app, installs it on the running emulator, and
starts Metro. The first build can take several minutes; later builds are
usually faster.

After the native build succeeds, use this command for normal development:

```powershell
npx.cmd expo start --dev-client --localhost
```

Use the installed IntelliCam debug app for testing so its native build matches
the dependencies in this project.

## Build an APK and install it by QR code

This project has an EAS `preview` profile configured to generate an Android
APK. Run this command from the IntelliCam project folder:

```powershell
npx.cmd eas-cli build --platform android --profile preview
```

Sign in to your Expo account if requested. EAS uploads the project and builds
the APK in the cloud. When the build finishes:

1. Open the build link displayed in PowerShell.
2. Select **Install** to display the installation QR code.
3. Scan the QR code with the Android phone.
4. Download and install the APK.

This preview APK runs independently, so Metro does not need to remain open.

## Build and install a debug APK manually by USB

Enable **Developer options** and **USB debugging** on the phone, connect it by
USB, and accept the debugging prompt. Confirm the phone is detected:

```powershell
adb devices
```

The phone must be listed as `device`. If it shows `unauthorized`, unlock the
phone and accept the USB debugging prompt.

Build an ARM64 debug APK for a modern Android phone from the IntelliCam project
folder:

```powershell
cd android
.\gradlew.bat assembleDebug -PreactNativeArchitectures=arm64-v8a
cd ..
```

The generated APK is located at:

```text
.\android\app\build\outputs\apk\debug\app-debug.apk
```

Install or update the APK on the connected physical device:

```powershell
adb -d install -r ".\android\app\build\outputs\apk\debug\app-debug.apk"
```

Connect the device to Metro over USB and start the development server:

```powershell
adb -d reverse tcp:8081 tcp:8081
npx.cmd expo start --dev-client --localhost
```

Open IntelliCam on the phone. Keep the Metro PowerShell window running while
testing.

### Recommended one-command workflow

With the phone connected and USB debugging enabled, this command lets you
select the phone, builds IntelliCam, installs it, and starts Metro:

```powershell
npm.cmd run android -- --device
```

This local workflow does not use the EAS cloud-build quota.

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

If DevTools reports that no compatible Hermes app is connected:

1. Confirm IntelliCam is open in the foreground.
2. Confirm the installed app is the local debug build, not an EAS preview APK.
3. Run `adb -d reverse tcp:8081 tcp:8081`.
4. Restart Metro, press `a`, wait for bundling to finish, then press `j`.
