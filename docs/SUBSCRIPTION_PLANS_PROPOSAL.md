# IntelliCam Subscription Plans Proposal

Status: Proposed  
Created: 2026-09-11  
Target: Smart Assistance and AI Premium phases

## Recommendation

Launch with one paid entitlement, **IntelliCam Pro**, offered through monthly
and annual billing. Do not introduce separate Plus, Pro, and Premium feature
tiers at launch. One entitlement is easier for users to understand and simpler
to operate while IntelliCam's premium feature set is still developing.

The annual option should be visually highlighted as **Best value**.

## Product boundary

IntelliCam's documented MVP remains free. Features already identified as core
MVP functionality must not be moved behind the subscription:

- Normal, Star, Light Trail, Waterfall, Portrait, and Product capture modes
- Manual camera controls, focus, exposure, zoom, HDR, timer, and aspect ratio
- Offline rule-based adaptive capture
- RAW capture where supported by the device
- Long exposure and frame stacking
- Local gallery and on-device photo storage
- Basic editing and non-destructive edit history
- No advertisements or watermarks

The subscription monetizes the later Smart Assistance, cloud, synchronization,
and AI Premium capabilities described in [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Proposed plans

| Plan | Launch price | Billing and access |
| --- | ---: | --- |
| **IntelliCam Free** | RM0 | Core MVP camera, capture, gallery, and editing features |
| **IntelliCam Pro Monthly** | **RM12.90/month** | All Pro features and 100 cloud-AI credits per billing month |
| **IntelliCam Pro Annual** | **RM89.90/year** | All Pro features, 100 cloud-AI credits per billing month, and a 7-day trial |

The annual plan is equivalent to approximately RM7.49 per month and costs
about 42% less than paying monthly for one year.

Storefronts should use Apple and Google regional pricing rather than applying a
fixed currency conversion in the app. The displayed price must always come
from the store product returned for the user's account and region.

## IntelliCam Pro entitlement

An active IntelliCam Pro subscription unlocks:

- AI scene detection
- Automatic lighting, subject, and camera-stability analysis
- Intelligent capture-mode recommendations
- Natural-language photography assistant
- AI noise reduction
- AI HDR, sky enhancement, and colour grading
- AI editing and style transfer
- Creation and management of custom presets
- Synchronization of custom presets, settings, and edit history
- Cross-device account access
- Future features explicitly identified as IntelliCam Pro features

Cloud photo backup is not included at launch. The current architecture defines
cloud photo storage only as a future option, while IntelliCam remains a
local-first camera application.

## AI credit policy

Credits apply only to operations that create cloud-processing costs. On-device
analysis and features should not consume credits.

| Operation | Proposed cost |
| --- | ---: |
| Photography-assistant request | 1 credit |
| Cloud AI photo enhancement | 5 credits |
| On-device scene detection | Unlimited; no credits |
| On-device lighting and stability analysis | Unlimited; no credits |

Both monthly and annual subscribers receive **100 credits each billing month**.
Unused credits do not roll over during the initial launch phase. Before running
a cloud operation, the app must show its credit cost and the user's remaining
balance.

If usage data shows a need for additional capacity, add an optional
**100-credit pack for RM9.90**. Credit packs should not be offered before actual
cloud-processing costs are measured.

Do not advertise unlimited cloud AI while usage has an ongoing variable cost.

## Trial and purchase rules

- Offer one 7-day trial with the annual plan only.
- Do not offer a weekly subscription.
- Do not offer lifetime Pro access because AI and synchronization have ongoing
  infrastructure costs.
- Explain the renewal price and trial end date before purchase.
- Allow purchases to be restored on supported devices.
- Let Apple App Store and Google Play manage billing and cancellation.
- Verify store purchases before granting the Pro entitlement.
- Preserve access until the paid billing period ends after cancellation.
- Provide a clear signed-out and expired-subscription state.
- Never remove access to locally created photos when a subscription expires.

## Paywall presentation

Do not show a paywall immediately when the app opens. A user should first be
able to complete a successful free camera experience and understand
IntelliCam's value.

The paywall should contain:

1. A concise outcome-oriented Pro headline.
2. Three to five meaningful Pro benefits.
3. Monthly and annual purchase choices.
4. Annual highlighted as **Best value**.
5. Clear trial duration, renewal price, and billing frequency.
6. Restore purchases, privacy policy, and subscription terms links.
7. A visible close action that returns to the free experience.

Do not use countdown timers, fake discounts, or block access to the documented
free MVP.

## Recommended release sequence

### Phase 1: Free MVP

- Complete the documented core capture pipeline.
- Keep subscriptions and account creation disabled.
- Measure capture-mode usage and retention without a paywall.

### Phase 2: Smart Assistance preview

- Implement reliable scene, lighting, and stability analysis.
- Allow a limited preview or guided demonstration of Pro value.
- Keep purchase controls hidden until the premium features are dependable.

### Phase 3: IntelliCam Pro launch

- Add App Store and Google Play subscription products.
- Add accounts, server-side entitlement verification, and subscription status.
- Launch monthly and annual plans.
- Enable the annual trial.
- Add AI usage accounting and credit visibility.

### Phase 4: Optimization

- Measure trial start, trial conversion, refund, renewal, and cancellation
  rates.
- Compare monthly and annual retention.
- Test pricing by storefront region without changing existing subscriber terms.
- Introduce credit packs only if real usage requires them.

## Backend and entitlement requirements

The existing `subscriptions` and `ai_usage` concepts should be expanded before
implementation.

Suggested subscription fields:

- `user_id`
- `provider` (`apple` or `google`)
- `product_id`
- `entitlement` (`intellicam_pro`)
- `status`
- `original_transaction_id` or purchase token
- `current_period_start`
- `current_period_end`
- `will_renew`
- `last_verified_at`

Suggested AI usage fields:

- `user_id`
- `feature`
- `credits_used`
- `request_id`
- `created_at`

The client must not grant Pro access based only on locally stored state. Store
transactions should be validated and converted into one authoritative
`intellicam_pro` entitlement.

## Pricing rationale

The proposed pricing positions IntelliCam below a complete professional editing
suite while remaining close to regional mobile subscription expectations.

- Adobe currently lists Lightroom in Malaysia at RM34.52 per month on an annual
  commitment and includes a 7-day trial.
- RevenueCat's 2026 subscription benchmarks report an IN/SEA Google Play median
  of approximately US$3.12 monthly and US$14.64 annually.
- RevenueCat reports stronger medium-term retention for monthly subscriptions
  than weekly subscriptions, supporting the decision not to offer weekly
  billing.

Pricing is a launch hypothesis and should be validated using conversion,
retention, refund, AI cost, and regional purchasing data.

## Success metrics

Track at minimum:

- Paywall view-to-purchase conversion
- Annual versus monthly selection
- Trial start and trial-to-paid conversion
- First and subsequent renewal rates
- Refund and cancellation rates
- Pro feature adoption
- AI credits used per subscriber
- Cloud-processing cost per subscriber
- Free-to-paid conversion by region and platform

## Approval decisions

Before implementation begins, approve or revise:

1. One paid IntelliCam Pro entitlement rather than multiple paid tiers.
2. RM12.90 monthly and RM89.90 annual launch pricing.
3. A 7-day annual-plan trial.
4. 100 cloud-AI credits per billing month.
5. No weekly, lifetime, or cloud-photo-backup offer at launch.

## Sources

- [IntelliCam architecture and roadmap](ARCHITECTURE.md)
- [IntelliCam current project state](PROJECT_STATE.md)
- [Adobe Lightroom Malaysia plans](https://www.adobe.com/my_ms/products/photoshop-lightroom/plans.html)
- [RevenueCat State of Subscription Apps 2026 — Utilities](https://www.revenuecat.com/state-of-subscription-apps-2026-utilities)

