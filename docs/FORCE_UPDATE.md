# IntelliCam forced application updates

IntelliCam build 1 is the update-capable baseline. Android and iOS read their
own entry from the public [`app-update.json`](../app-update.json) policy when the
app starts and when it returns to the foreground. Web and Expo Go are excluded.
Enforcement is disabled by default.

Older builds without this feature cannot be blocked remotely. Users must first
install this baseline before a later release can be enforced.

## Policy location

The production default is:

```text
https://raw.githubusercontent.com/wllun/IntelliCam/main/app-update.json
```

That URL must be publicly readable. If the repository is private, host the same
JSON on a public HTTPS endpoint and set `EXPO_PUBLIC_APP_UPDATE_CONFIG_URL` when
building the app. This variable is public configuration, not a secret.

## Releasing an update

1. Increase `expo.version` and the native build number. Local/prebuild Android
   builds use `android.versionCode` in `app.json`; iOS uses `ios.buildNumber`.
   This repository configures EAS with `appVersionSource: "remote"` and enables
   `autoIncrement` for production, so use the actual build number reported by
   EAS and the store—not an assumed value from `app.json`—in the hosted policy.
2. Build and fully publish the new APK/store release.
3. Verify the `updateUrl` opens the correct public download or store page.
4. Update `latestVersionCode` for that platform in `app-update.json` and push it
   to `main`. Keep `forceUpdateEnabled` false while verifying availability.
5. To require the release, set `minimumVersionCode` to the available build and
   set `forceUpdateEnabled` to true.

Example after Android build 2 is publicly available:

```json
{
  "android": {
    "latestVersionCode": 2,
    "minimumVersionCode": 2,
    "forceUpdateEnabled": true,
    "updateUrl": "https://github.com/wllun/IntelliCam/releases/latest",
    "message": "Update IntelliCam to continue using the app."
  }
}
```

Keep the untouched `ios` object beside it in the real policy file.

For Play Store distribution, replace the Android URL with:

```text
https://play.google.com/store/apps/details?id=com.wltechfreelance.IntelliCam
```

For direct APK distribution, use a trusted HTTPS release/download page. The new
APK must use the same Android package and signing certificate so it can update
the existing installation.

## Emergency rollback

Set `forceUpdateEnabled` to false for the affected platform and push the policy.
Devices cache the last valid policy for offline launches. A cached forced policy
expires after 72 hours and then fails open, preventing a network outage from
permanently locking the user out.

## Verification checklist

- Test with enforcement disabled, enabled, malformed, missing, and offline.
- Confirm build N is blocked only when `minimumVersionCode` is greater than N.
- Confirm the update link works before raising the minimum.
- Install the new APK with `adb install -r` and confirm gallery photos remain.
- Return from the update page and press **I updated — check again**.
- Test Play-installed and sideloaded upgrade paths separately.
