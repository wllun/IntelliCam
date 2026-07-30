1. Copy the latest code to the short build folder
    robocopy "C:\Users\behwl\OneDrive\Documents\ReactNative\IntelliCam" "C:\ICBuild" /MIR /XD .git node_modules android ios .expo dist web-build

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