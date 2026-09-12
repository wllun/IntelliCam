# IntelliCam Subscription Plans Proposal

Status: Proposed  
Created: 2026-09-11  
Target: Smart Assistance and AI Premium phases
Account model: No required IntelliCam login

## Recommendation

Launch with one paid entitlement, **IntelliCam Pro**, offered through monthly
and annual billing. The initial subscription should use anonymous App Store and
Google Play purchases, with no required IntelliCam account and no subscription
database maintained by IntelliCam.

Use RevenueCat anonymous customer IDs as the recommended entitlement layer.
RevenueCat and the app stores keep the transaction records, while IntelliCam
does not operate its own customer or subscription database. This is not
literally database-free: it is **free from a database maintained by
IntelliCam**.

Do not introduce separate Plus, Pro, and Premium feature tiers at launch. One
entitlement is easier for users to understand and simpler to operate while
IntelliCam's premium feature set is still developing.

The annual option should be visually highlighted as **Best value**.

## Product boundary

IntelliCam's documented MVP remains free. Features already identified as core
MVP functionality must not be moved behind the subscription:

- Auto, Star, Light Trail, Waterfall, Portrait, 美顔, and Product capture modes
- Manual camera controls, focus, exposure, zoom, HDR, timer, and aspect ratio
- Offline rule-based adaptive capture
- RAW capture where supported by the device
- Long exposure and frame stacking
- Local gallery and on-device photo storage
- Basic editing and non-destructive edit history
- No advertisements or watermarks

The first subscription monetizes continuing on-device Smart Assistance and
premium feature updates described in [`ARCHITECTURE.md`](ARCHITECTURE.md).
Cloud AI, synchronization, and cross-platform identity are deferred until the
project intentionally adds backend infrastructure.

## No-login purchase model

The user does not create or sign in to an IntelliCam account. Their Apple
Account or Google Account is the payment identity used by the system purchase
sheet.

```text
User
  -> Apple App Store or Google Play purchase sheet
  -> Store creates and renews the subscription
  -> RevenueCat receives and validates the store transaction
  -> IntelliCam reads the anonymous intellicam_pro entitlement
  -> Pro features unlock
  -> The store pays net proceeds to the developer
```

IntelliCam must provide **Restore purchases**. A restored purchase belongs to
the original Apple or Google store account, not to an IntelliCam profile.

Consequences of this model:

- No email, password, social login, or IntelliCam account is required.
- No customer or subscription database is maintained by IntelliCam.
- Purchases can be restored after reinstalling through the original store
  account.
- A purchase cannot move between iOS and Android without a shared IntelliCam
  identity.
- Changing the device's store account may change the available entitlement.
- Cloud usage quotas and cross-device application data cannot be securely
  associated with an anonymous person.

## Proposed plans

| Plan | Launch price | Billing and access |
| --- | ---: | --- |
| **IntelliCam Free** | RM0 | Core MVP camera, capture, gallery, and editing features |
| **IntelliCam Pro Monthly** | **RM8.90/month** | All offline Pro features and continuing premium updates |
| **IntelliCam Pro Annual** | **RM59.90/year** | The same Pro entitlement with a 7-day trial |

The annual plan is equivalent to approximately RM4.99 per month and costs
about 44% less than paying monthly for one year. The lower price reflects that
the initial Pro plan does not include cloud processing or storage.

Storefronts should use Apple and Google regional pricing rather than applying a
fixed currency conversion in the app. The displayed price must always come
from the store product returned for the user's account and region.

## IntelliCam Pro entitlement

An active IntelliCam Pro subscription unlocks:

- AI scene detection
- Automatic lighting, subject, and camera-stability analysis
- Intelligent capture-mode recommendations
- On-device noise reduction and computational processing
- Advanced on-device editing tools
- Creation and management of custom presets
- New premium capture modes and preset packs released over time
- Continuing on-device analysis and model improvements
- Future features explicitly identified as IntelliCam Pro features

The subscription must deliver recurring value through meaningful updates such
as new premium modes, presets, editor capabilities, and improved on-device
models. If IntelliCam cannot commit to continuing value, a one-time Pro unlock
is more appropriate than a subscription.

Cloud photo backup, cloud AI, and cross-device synchronization are not included
at launch. The current architecture defines cloud photo storage only as a
future option, while IntelliCam remains a local-first camera application.

## Deferred cloud capabilities

The following previously proposed capabilities are not part of the anonymous,
no-self-managed-database launch:

- Cloud AI credits or credit packs
- A cloud natural-language photography assistant
- Cloud AI photo enhancement
- Cloud photo backup
- Synced presets, settings, and editing history
- Cross-platform subscription sharing
- Secure per-person cloud usage limits

Cloud AI requires a server proxy because a private AI provider key cannot be
safely embedded in a mobile application. Usage credits additionally require
authoritative server-side tracking; a local counter could be reset by
reinstalling or modifying the app.

If those capabilities are introduced later, IntelliCam can add an optional
account or an anonymous managed backend, then reconsider the original
RM12.90/month and RM89.90/year pricing. That later decision is a separate
cloud-product proposal.

Do not sell consumable AI credit packs under the anonymous launch model.

## Trial and purchase rules

- Offer one 7-day trial with the annual plan only.
- Do not offer a weekly subscription.
- Do not offer lifetime Pro access at launch while the recurring-value model is
  being validated.
- Explain the renewal price and trial end date before purchase.
- Allow purchases to be restored on supported devices.
- Let Apple App Store and Google Play manage billing and cancellation.
- Verify store purchases before granting the Pro entitlement.
- Preserve access until the paid billing period ends after cancellation.
- Provide clear unavailable, pending, expired, and grace-period states.
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
- Integrate RevenueCat using anonymous App User IDs.
- Configure restore behaviour to transfer purchases to a new anonymous ID so
  reinstalling users can restore through the same store account.
- Read one authoritative `intellicam_pro` entitlement in the app.
- Launch monthly and annual plans.
- Enable the annual trial.
- Keep Pro features on-device and local-first.

### Phase 4: Optimization

- Measure trial start, trial conversion, refund, renewal, and cancellation
  rates.
- Compare monthly and annual retention.
- Test pricing by storefront region without changing existing subscriber terms.
- Decide separately whether cloud features justify adding accounts or managed
  usage storage.

## Entitlement implementation

### Recommended: managed anonymous entitlement

Use Apple App Store and Google Play Billing for payment, with RevenueCat as the
managed subscription and entitlement service:

- Configure RevenueCat without a custom App User ID so it creates an anonymous
  identifier.
- Create one entitlement named `intellicam_pro`.
- Attach the monthly and annual store products to that entitlement.
- Check entitlement status when the app opens and returns to the foreground.
- Listen for purchase changes while the app is active.
- Provide purchase, restore, manage-subscription, and retry actions.
- Cache only enough state for a graceful offline interface; treat the verified
  store entitlement as the authority.
- Use the store-provided localized price and billing period on the paywall.

This approach has no login and no database operated by IntelliCam, but
RevenueCat remains an external managed service that stores entitlement data.

### Literal zero-backend alternative

It is technically possible to integrate StoreKit and Google Play Billing
directly:

- On iOS, inspect verified StoreKit `Transaction.currentEntitlements`.
- On Android, query active purchases through Google Play Billing and
  acknowledge completed initial purchases.

This removes RevenueCat, but requires more platform-specific implementation.
Google recommends secure backend verification for fraud prevention, purchase
token uniqueness, refunds, and reliable lifecycle processing. The direct
client-only Android design therefore carries more fraud and entitlement-sync
risk and is not the recommended commercial launch architecture.

## Store and policy requirements

- Apple requires In-App Purchase when an app unlocks digital features or
  subscriptions.
- Google Play-distributed apps generally must use Google Play Billing for paid
  in-app digital functionality.
- Subscription terms, price, billing frequency, renewal, and trial details must
  be clear before purchase.
- A subscription must provide sustained or recurring value.
- The subscription should work across the user's devices within the same store
  ecosystem through purchase restoration.
- Store fees, taxes, refunds, and payout timing are managed under the
  developer's Apple and Google agreements.

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
- Restore-purchase success rate
- Entitlement-check failure rate
- Free-to-paid conversion by region and platform

## Approval decisions

Before implementation begins, approve or revise:

1. One paid IntelliCam Pro entitlement rather than multiple paid tiers.
2. No required IntelliCam login and no IntelliCam-managed subscription
   database.
3. Anonymous RevenueCat entitlement management rather than a client-only
   billing implementation.
4. RM8.90 monthly and RM59.90 annual offline-Pro launch pricing.
5. A 7-day annual-plan trial.
6. No weekly, cloud-credit, synchronization, or cloud-photo-backup offer at
   launch.

## Sources

- [IntelliCam architecture and roadmap](ARCHITECTURE.md)
- [IntelliCam current project state](PROJECT_STATE.md)
- [Adobe Lightroom Malaysia plans](https://www.adobe.com/my_ms/products/photoshop-lightroom/plans.html)
- [RevenueCat State of Subscription Apps 2026 — Utilities](https://www.revenuecat.com/state-of-subscription-apps-2026-utilities)
- [RevenueCat — Identifying customers and anonymous App User IDs](https://www.revenuecat.com/docs/customers/identifying-customers)
- [RevenueCat — Restore behaviour](https://www.revenuecat.com/docs/projects/restore-behavior)
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Apple StoreKit current entitlements](https://developer.apple.com/documentation/storekit/transaction/currententitlements)
- [Google Play Payments policy](https://support.google.com/googleplay/android-developer/answer/9858738?hl=en)
- [Google Play subscription lifecycle](https://developer.android.com/google/play/billing/lifecycle/subscriptions)
- [Google Play Billing security guidance](https://developer.android.com/google/play/billing/security)

