const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const fraction = (value) => Number.isFinite(value) && value >= 0 && value <= 1;

export function unavailableLiveScene(reason = 'measurements-unavailable') {
  return { sampledAt: 0, source: 'unavailable', meanLuma: null, highlightFraction: null,
    texture: null, subjectMotion: null, lightMotion: null, lightSpeed: null,
    displacement: null, gyroRms: null, gyroSamples: 0,
    meteredExposureSeconds: null, meteredISO: null, reason };
}

/** Pure deterministic policy: called once at shutter, never changes mid-burst. */
export function resolveEnvironmentCapture(mode, base, scene, ranges = {}, now = Date.now()) {
  const fresh = scene && Number.isFinite(scene.sampledAt)
    && now - scene.sampledAt >= 0 && now - scene.sampledAt <= 1800;
  const measured = fresh ? { ...scene } : unavailableLiveScene('scene-stale-or-unavailable');
  const visual = measured.source === 'preview-snapshot' && fraction(measured.meanLuma)
    && fraction(measured.highlightFraction);
  const gyroValid = measured.gyroSamples >= 3 && Number.isFinite(measured.gyroRms)
    && measured.gyroRms >= 0;
  const visualMotion = visual && fraction(measured.displacement) && measured.texture >= 0.035;
  const shaky = (gyroValid && measured.gyroRms > 0.08)
    || (visualMotion && measured.displacement > 0.02);
  // Never infer a tripod from a blank/dark scene or from missing sensor values.
  const steady = gyroValid && measured.gyroRms < 0.018
    && (!visualMotion || measured.displacement < 0.012);
  const moving = visual && fraction(measured.subjectMotion) && measured.subjectMotion > 0.12;
  const clipped = visual && measured.highlightFraction > 0.025;
  const dark = visual && measured.meanLuma < 0.24;
  const reasons = [visual ? 'preview-relative-brightness' : measured.reason || 'visual-analysis-unavailable'];
  reasons.push(shaky ? 'phone-moving' : steady ? 'phone-steady' : 'stability-unknown');
  if (moving) reasons.push('scene-movement');
  if (clipped) reasons.push('highlight-protection');
  const decision = {
    version: 1, scene: measured, reasons,
    exposureSeconds: base.exposureSeconds, iso: base.iso,
    exposureCompensation: mode === 'star' ? 1 : mode === 'light-trail' ? -1 : -0.7,
    frameCount: base.frameCount,
    frameIntervalMs: mode === 'light-trail' ? 500 : mode === 'waterfall' ? 180 : 0,
    maxBurstMs: mode === 'star' ? 18000 : mode === 'light-trail' ? 16000 : 10000,
    focusStrategy: base.lockFocusAtInfinity ? 'infinity' : 'automatic',
    whiteBalanceStrategy: 'automatic-locked',
  };
  const manual = Number.isFinite(base.exposureSeconds) && Number.isFinite(base.iso);
  if (visual) {
    if (mode === 'star') {
      decision.exposureCompensation = clipped ? 0 : dark ? 1 : 0.3;
      decision.frameCount = base.frameCount > 1 ? shaky || moving ? 3 : dark && steady ? 8 : dark ? 4 : 3 : 1;
      decision.focusStrategy = base.lockFocusAtInfinity && dark && !moving ? 'infinity' : 'automatic';
      if (manual) {
        decision.exposureSeconds = dark ? steady ? 15 : 2 : 0.5;
        decision.iso = dark ? 800 : 100;
      }
    } else if (mode === 'light-trail') {
      // Centroid movement is only a coarse guide, not vehicle tracking/optical flow.
      const speed = Number.isFinite(measured.lightSpeed) && measured.lightSpeed > 0.005
        ? measured.lightSpeed : null;
      const fast = (speed !== null && speed > 0.12)
        || (fraction(measured.lightMotion) && measured.lightMotion > 0.5);
      decision.frameIntervalMs = fast ? 120 : speed !== null ? 300 : 500;
      decision.frameCount = base.frameCount > 1 ? shaky ? 6 : fast ? 12 : 8 : 1;
      decision.exposureCompensation = clipped ? -1.5 : dark ? -0.5 : -1;
      if (manual) {
        decision.exposureSeconds = speed === null ? 4 : clamp(0.4 / speed, 1, 6);
        decision.iso = clipped || !dark ? 50 : 100;
        if (clipped) decision.exposureSeconds = Math.min(decision.exposureSeconds, 2);
      }
    } else if (mode === 'waterfall') {
      decision.frameIntervalMs = moving ? 100 : 180;
      decision.frameCount = base.frameCount > 1 ? shaky ? 4 : moving && steady ? 10 : 8 : 1;
      decision.exposureCompensation = clipped ? -1.2 : dark ? 0 : -0.4;
      if (manual) {
        decision.exposureSeconds = clipped || measured.meanLuma > 0.6 ? 0.25 : dark ? 1 : 0.5;
        decision.iso = dark ? 100 : 50;
      }
    }
  }
  // Preview brightness is auto-exposed, not an absolute light meter. Where the
  // backend exposes real AE duration/ISO, preserve that metered exposure product
  // (with mode-specific highlight/night bias) rather than guessing ambient lux.
  const metered = Number.isFinite(measured.meteredExposureSeconds) && measured.meteredExposureSeconds > 0
    && Number.isFinite(measured.meteredISO) && measured.meteredISO > 0;
  if (manual && metered) {
    const product = measured.meteredExposureSeconds * measured.meteredISO;
    const targetISO = mode === 'star' ? product > 8 ? 800 : 100 : 50;
    const bias = mode === 'star' ? clipped ? 0 : 0.7 : clipped ? -1 : -0.4;
    decision.iso = targetISO;
    decision.exposureSeconds = Math.min(product * 2 ** bias / targetISO,
      mode === 'star' ? 15 : mode === 'light-trail' ? 6 : 1);
    reasons.push('camera-metered-exposure-product');
  }
  const exposureProduct = decision.exposureSeconds * decision.iso;
  if (manual && shaky) {
    decision.exposureSeconds = Math.min(decision.exposureSeconds, 0.25);
    // Preserve the selected exposure product where ISO limits allow it.
    decision.iso = exposureProduct / decision.exposureSeconds;
  } else if (manual && !steady && (visual || gyroValid)) {
    decision.exposureSeconds = Math.min(decision.exposureSeconds, mode === 'star' ? 2 : 1);
    decision.iso = exposureProduct / decision.exposureSeconds;
  }
  if (manual) {
    const validRange = (range) => range && Number.isFinite(range.min) && Number.isFinite(range.max)
      && range.min > 0 && range.max >= range.min;
    if (!validRange(ranges.exposure) || !validRange(ranges.iso)) {
      delete decision.exposureSeconds;
      delete decision.iso;
      reasons.push('manual-ranges-unavailable');
    } else {
      const target = decision.exposureSeconds;
      decision.exposureSeconds = clamp(target, ranges.exposure.min, ranges.exposure.max);
      const neededISO = decision.iso * target / decision.exposureSeconds;
      decision.iso = clamp(Math.round(neededISO), ranges.iso.min, ranges.iso.max);
      if (neededISO < ranges.iso.min) {
        decision.exposureSeconds = clamp(decision.exposureSeconds * neededISO / decision.iso,
          ranges.exposure.min, ranges.exposure.max);
      }
      if (neededISO < ranges.iso.min || neededISO > ranges.iso.max) reasons.push('hardware-iso-limit');
      if (target !== decision.exposureSeconds) reasons.push('hardware-shutter-limit');
    }
  }
  return decision;
}
