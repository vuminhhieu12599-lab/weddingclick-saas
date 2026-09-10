# WeddingClick V2 — Testing & QA Specification

**Status:** Mandatory quality baseline  
**Last updated:** 2026-09-10

## 1. Quality Objective

Wedding invitations are high-sensitivity personal products. A “small” software error can become a serious customer-facing mistake.

Testing must prioritize:

- correct people/family information;
- correct wedding event semantics;
- correct date/time;
- correct guest personalization;
- security/isolation;
- reliable RSVP;
- stable published output;
- mobile presentation.

---

## 2. Test Layers

Target V2 test stack should include:

### Static checks

- ESLint;
- TypeScript typecheck;
- Next.js production build.

### Unit tests

For deterministic domain logic such as:

- variant resolver;
- date formatting/calendar logic;
- Project status eligibility;
- package entitlement;
- RSVP normalization/validation;
- InvitationViewModel building;
- token helper behavior that can be safely unit-tested.

### Integration tests

For:

- data/service boundaries;
- RLS/server authorization scenarios;
- publish/version flow;
- RSVP persistence;
- access-link resolution.

### E2E tests

Critical user journeys should eventually use Playwright or another approved browser E2E tool.

Suggested initial E2E priority:

1. Staff creates/manages Project.
2. Customer intake flow.
3. Review/approval flow.
4. Publish then public invitation.
5. Personalized guest + RSVP.
6. Customer Portal RSVP view.
7. Unauthorized access negative paths.

The exact testing dependency setup is an implementation task and must be approved before installation.

---

## 3. Required Package Scripts Target

V2 should eventually support scripts similar to:

```text
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e   # when E2E is installed
```

Current repository may not yet include all scripts. Foundation work should establish an approved baseline.

---

## 4. Canonical Test Projects

Maintain reusable synthetic test fixtures.

### Project A — Common Basic

- common package;
- normal Vietnamese names;
- one main event;
- no personalized add-on.

### Project B — Separate Variants

- groom + bride invitations;
- distinct Vu Quy/Thành Hôn events;
- both families populated.

### Project C — Personalized Guests

- separate or common package;
- personalized add-on;
- multiple guest formats;
- RSVP variations.

### Project D — Minimal Optional Data

- no music;
- no story;
- no gift/bank info;
- limited gallery.

### Project E — Stress Content

- long Vietnamese couple names;
- long parent names;
- long venue;
- long guest display name;
- many gallery images.

All fixtures are fictional.

---

## 5. Variant Test Matrix

For every active template:

| Scenario | COMMON | GROOM | BRIDE |
|---|---:|---:|---:|
| Correct couple ordering | Required | Required | Required |
| Correct family priority | Required | Required | Required |
| Correct ceremony wording | Required | Required | Required |
| Valid date/time display | Required | Required | Required |
| Mobile layout | Required | Required | Required |
| RSVP available as configured | Required | Required | Required |
| Personalized guest display | Required | Required | Required |

Expected critical wording:

- GROOM -> `Lễ Thành Hôn` where applicable.
- BRIDE -> `Lễ Vu Quy` where applicable.

---

## 6. Date/Time QA

Test:

- weekday derived correctly;
- month length correct;
- leap year where relevant;
- countdown matches canonical event time;
- event time not midnight unless actual event is midnight;
- locale formatting correct;
- timezone behavior correct;
- date changes propagate consistently across all UI derived from the event.

Never approve a template with manually hard-coded weekday/calendar behavior.

---

## 7. Guest Personalization QA

Required values:

```text
Anh Hiếu và gia đình
Chú B và người thương
Em và sự cô đơn
Các anh chị em phòng Marketing và gia đình
```

Test:

- line wrapping;
- capitalization behavior;
- Vietnamese glyphs;
- token resolution;
- no personalization without valid token;
- disabled/revoked guest behavior;
- Guest A cannot become Guest B by changing visible name/query string.

---

## 8. RSVP QA

### Non-personalized

Test:

- guest enters name;
- attending yes;
- attending no;
- party size validation;
- optional message;
- actual save success;
- actual database/server failure shows failure, not success.

### Personalized

Test:

- guest token resolves correct guest;
- RSVP linked to correct guest;
- resubmission updates current RSVP;
- guest cannot update another guest;
- invalid/revoked token fails safely.

### Customer Portal statistics

Verify calculations separately:

- response count;
- yes count;
- no count;
- unanswered personalized count;
- total expected attendee headcount.

---

## 9. Draft/Review/Publish QA

Critical scenario:

1. Create Draft A.
2. Create Review version A.
3. Customer approves A.
4. Publish A.
5. Verify public invitation = A.
6. Modify Project draft to B.
7. Verify public invitation still = A.
8. Create/publish B explicitly.
9. Verify public invitation now = B.

If step 7 fails, release is blocked.

---

## 10. Template Version QA

Scenario:

1. Publish invitation using renderer `template-x.v1`.
2. Introduce `template-x.v2`.
3. Verify old published invitation still renders v1 behavior.
4. New Project may choose/use v2.
5. Existing Project changes only through explicit upgrade/republish.

---

## 11. Intake Form QA

Test:

- valid submission;
- required-field errors;
- mobile usability;
- second submission/change;
- pending submission does not silently overwrite canonical data;
- staff applies accepted changes;
- rejected/ignored change leaves canonical data unchanged.

---

## 12. Access Link QA

For each token type `INTAKE`, `REVIEW`, `PORTAL`:

- valid token works only for intended Project;
- invalid token fails;
- revoked token fails;
- expired token fails when expiration configured;
- regenerated link invalidates old token when intended;
- token does not grant other capability types automatically;
- Project code alone cannot substitute for token.

---

## 13. Security Negative Tests

Before launch verify:

- anonymous Project CRUD denied;
- anonymous customer list denied;
- anonymous guest-list enumeration denied;
- anonymous RSVP-list enumeration denied;
- anonymous Storage upload/delete denied;
- customer Portal A cannot access Project B;
- Review token cannot access internal admin;
- Guest token cannot access Customer Portal;
- non-entitled Project cannot create personalized guests;
- Staff cannot perform Admin-only action if role restrictions apply;
- service-role credential absent from browser bundle.

---

## 14. Media QA

Test:

- supported image upload;
- unsupported type rejected;
- oversized file behavior;
- gallery ordering;
- cover selection;
- audio behavior;
- deleted draft media removed safely;
- published version media remains available;
- missing/broken media fails gracefully;
- template change reuses Project media.

---

## 15. Font Certification

For each production font/preset test:

- Vietnamese glyph set from `TYPOGRAPHY_AND_MOTION.md`;
- uppercase text;
- long names;
- small screen clipping;
- loading/fallback;
- required weights;
- license record exists.

Font with missing/broken Vietnamese glyphs is a blocker.

---

## 16. Motion Certification

For each active template/preset test:

- opening;
- repeated scrolling;
- RSVP interaction;
- music interaction;
- reduced motion;
- mobile smoothness;
- no overlay/tap interception bugs;
- no critical runtime/console errors.

---

## 17. Responsive QA

Minimum viewport checks:

- 360 px mobile;
- 390 px mobile;
- 430 px mobile;
- representative tablet;
- representative desktop.

Customer-facing surfaces are mobile-first.

Test both short and long content.

---

## 18. Browser QA

Before commercial launch, manually verify current representative versions of at least:

- Chrome desktop;
- Chrome/Chromium Android where available;
- Safari iPhone/iOS through real device or credible browser/device testing;
- Safari/macOS or another WebKit verification path where practical.

Public wedding invitations must not be approved based only on Cursor/desktop Chrome.

---

## 19. Performance QA

Check practical behavior for:

- initial invitation load;
- gallery load;
- font load;
- motion smoothness;
- oversized media impact;
- mobile scrolling;
- music initialization.

Avoid shipping unnecessary code/fonts/assets for inactive templates.

Production performance threshold may be formalized later after baseline measurement.

---

## 20. Console and Network QA

Before certifying a flow/template:

- no critical uncaught exceptions;
- no repeated failed network requests;
- no false 200/success UI for failed mutations;
- no secrets in responses/log output;
- no obvious hydration/runtime warnings affecting UX.

---

## 21. Release Blocking Bugs

Release blockers include:

- wrong bride/groom;
- wrong Vu Quy/Thành Hôn;
- wrong date/weekday/time;
- wrong guest personalization;
- unauthorized data access;
- false RSVP success;
- published content mutates from draft;
- broken primary invitation link;
- customer portal cross-Project data leak;
- exposed secret;
- destructive data loss;
- broken Vietnamese font glyphs;
- unusable primary mobile flow.

---

## 22. Bug Fix Regression Rule

Every bug fix must include:

1. reproduction conditions;
2. root cause summary;
3. regression test when reasonably automatable;
4. verification that neighboring flows remain valid.

Do not repeatedly fix the same category of bug only manually if a deterministic automated test can prevent recurrence.
