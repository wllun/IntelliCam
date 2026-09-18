1. Copy the latest code to the short build folder
    `robocopy "C:\Users\behwl\OneDrive\Documents\ReactNative\IntelliCam" "C:\ICBuild" /MIR /XD .git node_modules "C:\Users\behwl\OneDrive\Documents\ReactNative\IntelliCam\android" "C:\Users\behwl\OneDrive\Documents\ReactNative\IntelliCam\ios" .expo dist web-build`
    [Company Laptop Cmd] : `robocopy "C:\Users\User\Desktop\React App\IntelliCam" "C:\ICBuild" /MIR /XD .git node_modules "C:\Users\User\Desktop\React App\IntelliCam\android" "C:\Users\User\Desktop\React App\IntelliCam\ios" .expo dist web-build`

    Exclude only the app-root generated `android` and `ios` folders. Do not use `/XD android ios` without full paths: that also excludes `modules\media-trash\android` and the native folders of other local modules. The release APK then cannot move photos to the recycle bin even after a successful rebuild.

    After copying, verify both `C:\ICBuild\modules\media-trash\android\src\main\java\expo\modules\mediatrash\MediaTrashModule.kt` and `C:\ICBuild\modules\portrait-effect\android\src\main\java\expo\modules\portraiteffect\PortraitEffectModule.kt` exist. If either is missing, stop before prebuild and correct the copy step. Portrait preview needs `expo-file-system` installed by the `npm.cmd install` step below. It renders native-blurred background pixels rather than using `expo-blur` or MaskedView to blur the camera view.

    Portrait now detects subject outlines (people, pets, objects), not a rectangular sharp area. A native rebuild and reinstall is required; restarting Metro alone is insufficient. On first use, Android needs internet and Google Play services to download ML Kit's subject-segmentation model. Detection runs on-device after that download. Tapping a detected subject selects it; tapping background preserves all detected foreground. If no subject is detected, the preview stays clear and the original photo is saved. Android samples blurred background images with transparent foreground so the subject remains on the live camera. Preview errors show a status message and are logged; saved-photo processing remains independent. iOS 17+ applies subject-aware blur to saved photos only (the current camera library has no iOS preview snapshot support). iOS 16 and earlier cannot enable this object-aware effect.

    Model requirements: [ML Kit Subject Segmentation for Android](https://developers.google.com/ml-kit/vision/subject-segmentation/android). The API is currently beta; a Google Play-enabled phone is required for its model installation.

2. Update the generated project
    cd C:\ICBuild
    npm.cmd install
    npx.cmd expo prebuild --clean --platform android --no-install

3. Build the physical-device APK
    cd C:\ICBuild\android
    .\gradlew.bat app:assembleRelease -PreactNativeArchitectures=arm64-v8a "-Dorg.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m"

4. Wait until `BUILD SUCCESSFUL`

5. Connect and update the app
    adb devices
    adb -d install -r "C:\ICBuild\android\app\build\outputs\apk\release\app-release.apk"

-------------------------------------------------------------------------------------------------------

1. Local development APK (Best for coding and debugging. It contains the Expo development launcher and requires Metro)
    a. Build, install, start Metro, and open the app
    npx.cmd expo run:android --device

    b. After the first installation, JavaScript-only development requires only:
    adb -d reverse tcp:8081 tcp:8081
    npx.cmd expo start --dev-client --localhost

    c. Use -e instead of -d for an AVD
    adb -e reverse tcp:8081 tcp:8081
    npx.cmd expo start --dev-client --localhost

    e. Rebuild after installing or removing native packages.
    expo run:android

2. Manually built debug APK (development build requiring Metro, but building and installing are separate operations)
    a. ARM64 and x86_64 APK -> generate android\app\build\outputs\apk\debug\app-debug.apk
    npm.cmd run android:apk

    b. install in physical device
    adb -d install -r ".\android\app\build\outputs\apk\debug\app-debug.apk"

    c. install in AVD
    adb -e install -r ".\android\app\build\outputs\apk\debug\app-debug.apk"

    d. install in specific device
    adb -d reverse tcp:8081 tcp:8081
    npx.cmd expo start --dev-client --localhost
    
3. Direct Gradle development installation (Builds and installs the debug APK without Expo selecting or starting an emulator.)
    a. Physical device
    cd android
    .\gradlew.bat app:installDebug -PreactNativeArchitectures=arm64-v8a
    cd ..

    b. AVD
    cd android
    .\gradlew.bat app:installDebug -PreactNativeArchitectures=x86_64
    cd ..

    c. start Metro
    npx.cmd expo start --dev-client --localhost

4. EAS development-client APK
    a. Built in Expo’s cloud. It contains the development launcher and requires Metro.
    npx.cmd eas-cli build --platform android --profile development
    adb -d install -r ".\path\to\development-build.apk"

    b. connect Metro
    adb -d reverse tcp:8081 tcp:8081
    npx.cmd expo start --dev-client --localhost

5. EAS preview APK (recommended standalone APK for testers)⭐⭐⭐
It opens IntelliCam directly and does not require Metro or the Development Servers screen.
    a. build
        npx.cmd eas-cli build --platform android --profile preview

    b. Install using one of these methods:
        -Scan the EAS installation QR code.
        -Download and open the APK directly on the phone.
        -Download it to the computer and run:

    c. install
        adb -d install -r ".\path\to\preview.apk"

6. Local standalone release APK (without Metro, but Android release signing must be configured correctly.)
    a. build
        cd android
        .\gradlew.bat assembleRelease
        cd ..

    b. install
        adb -d install -r ".\android\app\build\outputs\apk\release\app-release.apk"

    c. A debug APK and release APK may have different signatures. If Android reports INSTALL_FAILED_UPDATE_INCOMPATIBLE, uninstall the existing version first—this erases its app data:
        adb -d uninstall com.wltechfreelance.IntelliCam
        adb -d install ".\android\app\build\outputs\apk\release\app-release.apk"

7. Google Play installation
    a. A production Play Store build normally generates an AAB, not an APK (An AAB cannot be installed with adb install. Upload it to Google Play, then install IntelliCam through an internal, closed, open, or production Play Store track.)
        npx.cmd eas-cli build --platform android --profile production
    
    b. Coding & Debugging
    npx.cmd expo run:android --device

    c. Reinstall an existing debug APK
    adb -d install -r ".\android\app\build\outputs\apk\debug\app-debug.apk"

    d. Standalone APK without Metro
    npx.cmd eas-cli build --platform android --profile preview

    e. Public Play Store release
    npx.cmd eas-cli build --platform android --profile production
