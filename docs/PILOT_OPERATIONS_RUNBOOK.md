# WeddingClick V2 — Pilot Operations & Recovery Runbook

**Status:** Pilot Ready runbook  
**Recorded:** 2026-10-07  
**Scope:** one closely-supported, no-charge Production pilot using Elegant Editorial v1.

This runbook is operational guidance only. It does not change runtime code, schema, migrations or frozen contracts. Canonical product/security decisions remain in `docs/DECISIONS.md`.

## 1. Canonical pilot environment

- Git branch and Vercel Production Branch: `weddingclick-v2`.
- Frozen runtime baseline entering the Pilot Ready docs checkpoint: `69915dec1ae294554e969e605669e923a77d105b`.
- DEV/STAGING Supabase: `rggmsdnjnfmnzxdaxcra`.
- Production Supabase: `bsaljltsgxismrgvjnov` (`WeddingClick Production`, Singapore), separate from DEV/STAGING.
- Production host: Vercel project `weddingclick-saas`.
- Temporary Production origin: `https://weddingclick-saas.vercel.app`.
- The owner has deferred `weddingclick.online`; attach a replacement custom domain only after the owner buys/chooses it.
- Pilot cost posture: Supabase Free + Vercel Hobby. Upgrade only on owner request or demonstrated quota/reliability need.
- Temporary accepted debt: Preview and Production share one KV/Upstash REST store but use different `RATE_LIMIT_IP_HMAC_SECRET` values. Do not weaken the frozen credential-pair selection logic and never mix an URL from one pair with a token from another.

Never put Supabase service-role keys, anon keys, KV tokens, HMAC secrets, raw Review/Portal/guest tokens or customer secrets into docs, screenshots, commit messages or chat reports.

## 2. Start-of-day / before-customer checks

Before creating or publishing a real pilot Project:

1. Confirm the current Vercel Production deployment is `READY` and sourced from the intended `weddingclick-v2` commit.
2. Confirm Production Supabase is healthy and migration history still ends at 0044. Do not replay or modify applied migrations.
3. Confirm the staff ADMIN account can log in and the application profile is active.
4. Check recent Vercel Production runtime errors. Investigate any new repeated 5xx/error cluster before customer work.
5. Use the Production origin in a private/incognito window to verify at least one already-published smoke invitation still opens.
6. If rate-limit-backed customer mutations are returning 503, treat that as an infrastructure incident; do not bypass rate limiting in code or by editing Production data directly.

## 3. Normal staff workflow

For a new pilot:

1. Create Customer + Project from V2 Admin.
2. Enter required wedding data and select Elegant Editorial v1.
3. Create the required Review variants.
4. Issue a REVIEW link; customer approves the current Review versions.
5. Move `APPROVED → AWAITING_PAYMENT`; mark `PAID` only after the intended payment/business decision; then move to `READY_TO_PUBLISH`.
6. Publish each required variant explicitly.
7. After publication, issue the private PORTAL link if the customer needs it.
8. For `PERSONALIZED_GUEST`, create guests in Portal, choose the correct side, then issue each personalized link.
9. Never derive authorization from a public slug, guest name or Project id. Review, Portal and guest links are capabilities.

For the no-charge learning pilot, a payment step may be operationally simulated only on clearly-labelled internal smoke fixtures. Do not mark a real customer's Project paid unless that matches the owner's business decision.

## 4. Post-publish correction / republish

Do not edit a live PUBLISHED snapshot in place.

1. Edit draft/canonical data.
2. In **Duyệt**, choose the explicit post-publish correction action for the affected variant.
3. Create a new Review and obtain customer approval again.
4. Reuse the frozen lifecycle: `APPROVED → AWAITING_PAYMENT → READY_TO_PUBLISH`. If payment is already `PAID`, do not clear or charge it again.
5. Explicitly republish the affected variant.
6. Verify the public slug is unchanged and the corrected content is live.
7. Portal links, guest links and RSVP history must remain intact.

The previous published version stays live until the republish succeeds.

## 5. Access-link recovery

### REVIEW / PORTAL / INTAKE capability suspected leaked or sent to the wrong person

Use the staff **Liên kết truy cập** inventory for that Project and revoke the specific link. Then issue a new link if needed. Do not try to recover the raw old token; raw capability tokens are intentionally not stored.

### Personalized guest link suspected leaked

In the customer's Portal Guest Tool:

- **Tạo lại link** rotates the guest token and invalidates the old link.
- **Thu hồi** disables that guest/link while preserving an already-recorded RSVP.

Do not alter token hashes directly in SQL.

## 6. Deployment incident

Symptoms include a bad Production build, unexpected 5xx after a deploy, or behavior that differs from the last known-good runtime.

1. Stop new customer mutations/publishing while impact is unknown.
2. Identify the exact Production deployment and Git SHA.
3. Inspect Vercel build/runtime errors.
4. If the new commit is the cause, redeploy/promote the last known-good reviewed commit rather than patching Production ad hoc.
5. Never force-push `weddingclick-v2`, never `git reset --hard`, and never use `git clean` as recovery.
6. Once healthy, run the focused smoke in §10 before resuming customer work.

A docs-only deployment may still create a new Vercel deployment; verify it is READY even when runtime source files did not change.

## 7. Database / migration incident

1. Stop schema changes and destructive data operations.
2. Compare repository migration history, DEV/STAGING history and Production history.
3. Never edit an already-applied migration file.
4. Never replay 0001–0044 onto the existing Production database.
5. Use a new forward migration only after review when a schema change is actually required.
6. Do not run destructive cleanup SQL to make histories "look equal."
7. For accidental data damage, first identify the affected rows and the recovery options available for the active Supabase plan. Do not assume point-in-time recovery exists on the current Free plan.
8. If a safe restore path is not established, stop and escalate rather than improvising against real customer data.

## 8. Auth / staff-access recovery

Supabase Auth is the identity provider; `public.profiles` is the application authorization record.

- For normal staff access problems, fix/recover the Auth user first, then verify the matching profile is active with the intended `ADMIN` or `STAFF` role.
- The one-off initial ADMIN bootstrap procedure is documented in `docs/PHYSICAL_DATABASE_PLAN.md` §18 P.1. Do not create duplicate ADMIN rows or bypass the profile model.
- Never expose password/reset links or server credentials in reports.

## 9. Rate-limit infrastructure incident

Frozen Task 035A behavior is intentional:

- customer token **page reads** may fail open when the rate-limit backend is unavailable;
- protected **mutations** fail closed with 503;
- 429 responses remain generic;
- analytics stays off.

Do not "fix" an outage by disabling the limiter or adding an unreviewed in-memory Production fallback. For the lean-free pilot, Preview and Production share one KV store; different HMAC secrets are mandatory. Move Production to a dedicated store before commercial/high-volume use.

## 10. Focused Production smoke

After infrastructure, deployment, auth, migration or domain changes, run the smallest relevant subset; before declaring a release/pilot gate, run the full sequence:

1. Staff login.
2. Create labelled smoke Customer + Project.
3. Required wedding data + Elegant Editorial v1.
4. Create required Review variants and customer approvals.
5. Lifecycle/payment → publish.
6. Open every public variant in incognito.
7. Submit one generic RSVP.
8. Issue/open Portal; confirm published invitations + RSVP.
9. Add one personalized guest, issue/open the guest link, submit personalized RSVP, confirm guest binding/status in Portal.
10. Check recent Vercel runtime errors.
11. For a new canonical domain or social-share configuration, rerun Facebook Sharing Debugger and Zalo share-debug.

Smoke fixtures must be clearly labelled. Do not clean them with destructive SQL just to keep Production visually empty.

## 11. Social-share / domain notes

The current Production origin is the Vercel domain. When the owner provides the replacement custom domain:

1. Attach it to the Vercel Production environment.
2. Configure registrar DNS exactly as Vercel requires and wait for SSL/verification.
3. Decide the canonical redirect direction.
4. Verify public invitation, Portal and personalized guest routes on the new origin.
5. Rerun Facebook and Zalo crawler/share validation.

A Project without a configured `SOCIAL_SHARE_COVER` intentionally has no authoritative `og:image`. Crawlers may infer a page image; that inferred image is not a stable product guarantee.

## 12. Pilot go/no-go

Pause the pilot and investigate if any of these occur:

- Production deployment is not READY or points to an unexpected runtime commit.
- Production migration history diverges from the reviewed repository history.
- staff authorization behaves differently from the profile role model.
- public invitation resolves a REVIEW/draft instead of the current PUBLISHED snapshot.
- Review/Portal/guest capability crosses Project or guest boundaries.
- RSVP binds to the wrong Project/guest.
- customer mutations unexpectedly bypass the fail-closed rate-limit contract.
- repeated Production runtime errors appear during customer use.

The Pilot Ready gate is deliberately narrower than full Production Ready. It permits one closely-supported Elegant Editorial pilot with the accepted lean-free infrastructure debts; it is not a claim of commercial-scale readiness.
