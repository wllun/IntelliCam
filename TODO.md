# IntelliCam Production TODO

Last reviewed: 2026-09-19

Goal: release IntelliCam as a free, local-first camera app. Subscription plans,
payments, accounts, cloud AI, cloud backup, and cross-device synchronization are
not required for production and remain out of scope.

## P0 — Public-release blockers

### Capture reliability and data safety

- [x] Implement capture review and save-failure recovery.
- [x] Preserve the cached source image whenever MediaLibrary saving or metadata embedding fails.
- [x] Provide Retry and Delete actions after a failed save.
- [ ] Confirm that backgrounding, changing camera, and leaving the screen cannot save a stale capture or crash the app.
- [ ] Run repeated-capture and low-storage tests without losing an original photo.

### Expo dependency health

- [ ] Run `npx.cmd expo install --check`.
- [ ] Align `expo` with the SDK 54 expected patch version (`~54.0.37` at the last review).
- [ ] Align `expo-constants` with the SDK 54 expected patch version (`~18.0.14` at the last review).
- [ ] Run `npx.cmd expo-doctor` until all checks pass.
- [ ] Run `npm.cmd run check` on the final release revision.

### Physical Android validation

- [ ] Complete every applicable case in `docs/Test.md` on at least one modern Android device.
- [ ] Test another Android device without manual ISO/shutter controls to confirm safe fallbacks.
- [ ] Verify Auto, Portrait, Star, Light Trail, Waterfall, Beauty, and Product captures.
- [ ] Verify tap focus, focus/exposure lock, exposure detents, HDR, flash, all aspect ratios, timers, lens switching, pinch zoom, and the zoom ruler.
- [ ] Measure tap-to-shutter, shutter-to-JPEG, shot-to-shot, processing, and gallery-save latency in a release build.
- [ ] Stress multi-frame processing for memory pressure, heat, cancellation, backgrounding, and repeated bursts.
- [ ] Confirm there are no crashes, frozen previews, lost originals, or incorrect applied-setting claims.

### Android production build

- [ ] Generate a clean production Android App Bundle using the EAS `production` profile.
- [ ] Configure and verify the production signing key; do not distribute a debug-signed release APK.
- [ ] Inspect the merged release manifest and remove unnecessary permissions, especially audio, video, overlay, and legacy storage permissions if they are not required.
- [ ] Confirm package ID `com.wltechfreelance.IntelliCam`, version name, and version code.
- [ ] Install an internal-test build and verify upgrades preserve existing gallery photos and preferences.
- [ ] Verify the release build starts without Metro, Expo Go, or a development server.

### iOS release readiness

- [ ] Add and confirm the permanent iOS bundle identifier in `app.json`.
- [ ] Decide whether to support iPad; test the complete interface on iPad or set `supportsTablet` to `false`.
- [ ] Build the native iOS modules with Xcode/EAS and resolve all compile or signing failures.
- [ ] Test every supported capture mode on physical iPhones, including an older supported model.
- [ ] Verify iOS permission prompts, photo saving, metadata, orientation, backgrounding, and low-memory behavior.
- [ ] Upload a signed build to TestFlight and complete an external-style beta pass before App Store submission.

### Privacy and store compliance

- [ ] Publish a public HTTPS privacy policy.
- [ ] Explain camera, photo-library, optional location, motion-sensor, and update-policy usage accurately.
- [ ] Complete Google Play Data safety declarations.
- [ ] Complete Apple App Privacy declarations.
- [ ] Confirm optional photo location is off by default and coordinates are embedded only after explicit permission.
- [ ] Prepare support contact information and a support URL.
- [ ] Prepare store descriptions, screenshots, category, content rating, and reviewer notes.
- [ ] Confirm all permission descriptions match the actual behavior of the production build.

## P1 — Release quality

### Assets and presentation

- [ ] Finalize the production app icon and export store-ready assets.
- [ ] Add an Android adaptive icon with foreground and background assets.
- [ ] Verify splash screens, dark mode, status bars, safe areas, and display cutouts on representative devices.
- [ ] Check accessibility labels, focus order, contrast, reduced motion, and TalkBack/VoiceOver behavior.
- [ ] Capture final phone and tablet screenshots only for device classes that the app officially supports.

### Force-update safety

- [ ] Verify the public `app-update.json` URL is reachable from release builds.
- [ ] Replace update links with the final Google Play and App Store URLs after listings exist.
- [ ] Test disabled, enabled, malformed, unavailable, stale-cache, and offline policies.
- [ ] Keep `forceUpdateEnabled` off until the replacement build is publicly available.
- [ ] Document and test the emergency rollback procedure.

### Diagnostics and monitoring

- [ ] Add production crash reporting with privacy-appropriate data collection.
- [ ] Record app version, build number, OS, device model, and active camera context with recoverable camera failures.
- [ ] Monitor startup crashes, capture failures, save failures, and out-of-memory events during beta.
- [ ] Define acceptable crash-free-session, capture-success, and save-success targets before public rollout.

## P2 — Store rollout

- [ ] Commit all release changes and create a clean, reproducible release revision.
- [ ] Tag the approved release revision.
- [ ] Upload Android to Google Play internal testing.
- [ ] Complete internal testing, then promote to closed testing.
- [ ] Upload iOS to TestFlight and complete beta verification.
- [ ] Fix all blocking beta issues and repeat the physical-device checklist.
- [ ] Roll out production gradually rather than releasing to every user immediately.
- [ ] Monitor the initial rollout before increasing availability.
- [ ] Update `app-update.json` only after each store build is verified as downloadable.

## Production acceptance criteria

- [ ] `npm.cmd run check` passes on the exact release revision.
- [ ] `npx.cmd expo-doctor` reports all checks passed.
- [ ] Android production AAB builds, installs through the Play test track, and runs without development tooling.
- [ ] iOS production archive builds, installs through TestFlight, and runs without development tooling.
- [ ] Required physical-device cases in `docs/Test.md` are recorded as passed.
- [ ] No known blocker can crash capture, freeze preview, or lose a captured original.
- [ ] Privacy policy, store declarations, permissions, signing, versioning, metadata, and update links are verified.
- [ ] The release comes from a clean commit and has a rollback plan.
