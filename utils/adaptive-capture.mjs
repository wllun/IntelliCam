import { getMultiFrameCapturePlan } from './multi-frame-capture.mjs';

export function emptySceneMeasurements() {
  return {
    sampledAt: null,
    phase: 'unavailable',
    highlightClipping: { fraction: null, sampleCount: 0, threshold: 250, source: 'unavailable' },
    stability: {
      status: 'unknown', displacementFraction: null, residualMotionFraction: null,
      rejectedFrameFraction: null, registeredFrameCount: 0, source: 'unavailable',
    },
  };
}

export function resolveCapturePlan(capabilities, requested, scene = emptySceneMeasurements()) {
  const modePlan = getMultiFrameCapturePlan(requested.modeId);
  const fallbacks = [];
  const fallback = (setting, value, resolved, reason) => {
    fallbacks.push({ setting, requested: value, resolved, reason });
  };
  const hdr = requested.hdr && capabilities.photoHDR;
  const flashMode = capabilities.flash ? requested.flashMode : 'off';
  const portraitEffect = requested.portraitEffect
    && requested.modeId === 'auto' && capabilities.processing.portrait;
  const processing = modePlan && capabilities.processing.multiFrame ? modePlan.mode : 'single';
  if (requested.hdr && !hdr) fallback('hdr', true, false, 'camera-hdr-unavailable');
  if (requested.flashMode !== flashMode) {
    fallback('flashMode', requested.flashMode, flashMode, 'camera-flash-unavailable');
  }
  if (requested.portraitEffect && !portraitEffect) {
    fallback('portraitEffect', true, false,
      requested.modeId !== 'auto' ? 'portrait-toggle-auto-only' : 'portrait-module-unavailable');
  }
  if (modePlan && processing === 'single') {
    fallback('processing', modePlan.mode, 'single', 'multi-frame-module-unavailable');
  }
  return {
    version: 1,
    capabilities,
    requested: { ...requested },
    resolved: {
      ...requested, hdr, flashMode, portraitEffect, processing,
      frameCount: processing === 'single' ? 1 : modePlan.frameCount,
      jpegQuality: requested.photoQuality === 'maximum' ? 100 : 92,
    },
    applied: { hdr: false, frameCount: 0, processing: 'single', portraitEffect: false, native: null },
    fallbacks,
    scene,
  };
}

export function measureCapturedScene(measurement, alignments = [], sampledAt = new Date().toISOString()) {
  const scene = emptySceneMeasurements();
  if (!measurement || !Number.isFinite(measurement.width) || measurement.width <= 0
      || !Number.isFinite(measurement.height) || measurement.height <= 0) return scene;
  const fraction = measurement.highlightClippingFraction;
  if (Number.isFinite(fraction) && fraction >= 0 && fraction <= 1
      && Number.isFinite(measurement.highlightSampleCount) && measurement.highlightSampleCount > 0) {
    scene.highlightClipping = {
      fraction, sampleCount: measurement.highlightSampleCount,
      threshold: measurement.highlightThreshold, source: 'captured-jpeg',
    };
    scene.sampledAt = sampledAt;
    scene.phase = 'captured-reference';
  }
  const frames = alignments.filter((frame) => frame.index > 0);
  if (!frames.length) return scene;
  // Offsets are reference-pixel translations; residual motion also contains subject motion.
  const valid = frames.filter((frame) => Number.isFinite(frame.offsetX)
    && Number.isFinite(frame.offsetY) && Number.isFinite(frame.motionScore)
    && frame.motionScore >= 0 && frame.motionScore <= 1);
  if (valid.length !== frames.length) return scene;
  const registered = valid.filter((frame) => frame.registrationSucceeded !== false);
  const displacement = registered.length ? Math.max(...registered.map((frame) => Math.hypot(
    frame.offsetX / measurement.width, frame.offsetY / measurement.height,
  ))) : null;
  const motion = registered.length
    ? registered.reduce((sum, frame) => sum + frame.motionScore, 0) / registered.length : null;
  const rejected = valid.filter((frame) => !frame.accepted).length / valid.length;
  scene.stability = {
    status: displacement === null ? 'unknown' : rejected >= 0.5 || displacement > 0.035 ? 'unstable'
      : displacement > 0.008 ? 'moving' : 'steady',
    displacementFraction: displacement,
    residualMotionFraction: motion,
    rejectedFrameFraction: rejected,
    registeredFrameCount: registered.length,
    source: 'frame-registration',
  };
  scene.sampledAt = sampledAt;
  scene.phase = 'processed-burst';
  return scene;
}

export function finalizeCapturePlan(plan, outcome) {
  const fallbacks = [...plan.fallbacks];
  if (plan.resolved.hdr && !outcome.hdrConfirmed) {
    fallbacks.push({ setting: 'hdr', requested: true, resolved: false, reason: 'hdr-session-not-confirmed' });
  }
  if (plan.resolved.processing !== 'single' && !outcome.multiFrameApplied) {
    fallbacks.push({ setting: 'processing', requested: plan.resolved.processing,
      resolved: 'single', reason: outcome.multiFrameFailureReason ?? 'alignment-rejected' });
  }
  if (outcome.multiFrameApplied && outcome.acceptedFrameCount < plan.resolved.frameCount) {
    fallbacks.push({ setting: 'frameCount', requested: plan.resolved.frameCount,
      resolved: outcome.acceptedFrameCount, reason: 'frames-rejected' });
  }
  if (plan.resolved.portraitEffect && !outcome.portraitApplied) {
    fallbacks.push({ setting: 'portraitEffect', requested: true,
      resolved: false, reason: outcome.portraitFailureReason ?? 'portrait-not-applied' });
  }
  return {
    ...plan,
    applied: {
      ...plan.applied,
      hdr: plan.resolved.hdr && outcome.hdrConfirmed,
      frameCount: outcome.acceptedFrameCount,
      processing: outcome.multiFrameApplied ? plan.resolved.processing : 'single',
      portraitEffect: plan.resolved.portraitEffect && outcome.portraitApplied,
    },
    fallbacks,
    scene: outcome.scene ?? plan.scene,
  };
}
