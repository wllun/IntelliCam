export function isCaptureLifecycleCurrent(expected, current) {
  return expected.sessionId === current.sessionId
    && expected.cameraDeviceId !== undefined
    && expected.cameraDeviceId === current.cameraDeviceId
    && current.appActive
    && current.screenFocused
    && current.cameraReady;
}
