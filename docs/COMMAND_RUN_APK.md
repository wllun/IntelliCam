# IntelliCam Android Physical Device Commands

Use these steps to build, install, run, and debug IntelliCam on a physical
Android device.

## Prepare the device

Enable **Developer options** and **USB debugging** on the phone, connect it by
USB, and accept the authorization prompt. Confirm that Android Debug Bridge can
see it:

```powershell
adb devices -l
```

The phone must be listed as `device`. If it shows `unauthorized`, unlock the
phone and accept the USB debugging prompt.

## Recommended development workflow

For the first debug installation, after native dependency changes, or when a
standalone preview APK is installed, run:

```powershell
npm.cmd run android -- --device
```

Select the physical phone when Expo displays the device list. This command
builds the native debug APK, installs it, starts Metro, and opens IntelliCam.
The first build may download Gradle and can take several minutes.

This local workflow does not use the EAS cloud-build quota.

## Later debug sessions

Once the matching debug APK is installed, connect the device to Metro over USB:

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
> the native debug build before debugging.

## Build and install a debug APK manually by USB

Build one debug APK containing both the physical-device ARM64 libraries and the
AVD x86_64 libraries:

```powershell
npm.cmd run android:apk
```

The generated APK is located at:

```text
.\android\app\build\outputs\apk\debug\app-debug.apk
```

Install or update it on the connected phone:

```powershell
adb -d install -r ".\android\app\build\outputs\apk\debug\app-debug.apk"
```

The same APK can also be installed on the project's x86_64 AVD. Do not rebuild
this shared output with an ARM64-only `reactNativeArchitectures` override.

Then connect it to Metro:

```powershell
adb -d reverse tcp:8081 tcp:8081
npx.cmd expo start --dev-client --localhost
```

Open IntelliCam on the phone and keep the Metro window running.

## Build a standalone preview APK

The EAS `preview` profile generates an Android APK:

```powershell
npx.cmd eas-cli build --platform android --profile preview
```

Sign in to Expo if requested. When the cloud build finishes:

1. Open the build link displayed in PowerShell.
2. Select **Install** to display the installation QR code.
3. Scan the QR code with the Android phone.
4. Download and install the APK.

The preview APK runs independently, so Metro does not need to remain open.

## Common fixes

If the device is not detected:

```powershell
adb kill-server
adb start-server
adb devices -l
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
