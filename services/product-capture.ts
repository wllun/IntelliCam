export type ProductCaptureStrategy =
  | 'locked-detail-capture'
  | 'automatic-detail-capture';

export interface ProductCaptureCapabilities {
  supportsFocusLock: boolean;
  supportsExposureLock: boolean;
  supportsWhiteBalanceLock: boolean;
}

export interface ProductCapturePlan {
  strategy: ProductCaptureStrategy;
  frameCount: 1;
  exposureCompensation: number;
  lockFocus: boolean;
  lockExposure: boolean;
  lockWhiteBalance: boolean;
  exposureSeconds?: never;
  iso?: never;
  whiteBalanceKelvin?: never;
  guidance: string;
  fallbackReason?: string;
}

const PRODUCT_HIGHLIGHT_PROTECTION_EV = -0.4;

/** Resolve a product-photo plan from the metering locks the camera exposes. */
export function resolveProductCapturePlan(
  capabilities: ProductCaptureCapabilities,
): ProductCapturePlan {
  const hasEssentialLocks = capabilities.supportsFocusLock
    && capabilities.supportsExposureLock;

  if (hasEssentialLocks) {
    return {
      strategy: 'locked-detail-capture',
      frameCount: 1,
      exposureCompensation: PRODUCT_HIGHLIGHT_PROTECTION_EV,
      lockFocus: true,
      lockExposure: true,
      lockWhiteBalance: capabilities.supportsWhiteBalanceLock,
      guidance: 'Place the product in the center and use soft, even light.',
      fallbackReason: capabilities.supportsWhiteBalanceLock
        ? undefined
        : 'White balance locking is unavailable; using the camera automatic color balance.',
    };
  }

  return {
    strategy: 'automatic-detail-capture',
    frameCount: 1,
    exposureCompensation: PRODUCT_HIGHLIGHT_PROTECTION_EV,
    lockFocus: false,
    lockExposure: false,
    lockWhiteBalance: false,
    guidance: 'Hold steady, center the product, and use soft, even light.',
    fallbackReason: 'Focus and exposure locks are unavailable; using center-weighted automatic detail capture.',
  };
}

export function getProductPlanLabel(plan: ProductCapturePlan) {
  return plan.strategy === 'locked-detail-capture'
    ? 'Locked detail'
    : 'Automatic detail';
}
