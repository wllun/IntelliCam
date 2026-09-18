const PLANS = Object.freeze({
  star: Object.freeze({ mode: 'star', frameCount: 6 }),
  'light-trail': Object.freeze({ mode: 'light-trail', frameCount: 8 }),
  waterfall: Object.freeze({ mode: 'waterfall', frameCount: 6 }),
});

export function getMultiFrameCapturePlan(captureModeId) {
  return Object.hasOwn(PLANS, captureModeId) ? PLANS[captureModeId] : undefined;
}

export function isMultiFrameCaptureMode(captureModeId) {
  return getMultiFrameCapturePlan(captureModeId) !== undefined;
}
