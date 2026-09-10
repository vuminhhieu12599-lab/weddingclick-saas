# WeddingClick V2 — Security Specification

**Status:** Mandatory release requirements  
**Last updated:** 2026-09-10

## 1. Security Objective

WeddingClick handles customer wedding information, guest names, RSVP data, private management links, and internal operational information.

Security must be enforced at trusted boundaries, not by UI conventions.

The security model must prevent:

- anonymous modification of internal data;
- one customer accessing another Project;
- one guest being resolved as another guest;
- predictable customer management links;
- staff privilege escalation;
- service-role exposure;
- accidental publication of draft data;
- unrestricted Storage upload/delete.

---

## 2. Trust Zones

### Zone A — Anonymous Public

May only access explicitly public published invitation content and approved public actions such as RSVP submission through a validated server endpoint.

### Zone B — Guest Token

Anonymous browser possessing a valid guest-specific capability token.

May only:

- resolve personalization for one guest/Project;
- submit/update permitted RSVP for that guest.

### Zone C — Customer Capability Token

Customer possessing an active Project-scoped token.

Token purpose determines capability:

- Intake;
- Review;
- Portal.

Customer token never grants Staff/Admin authority.

### Zone D — Staff

Authenticated Supabase user with active `STAFF` profile.

May perform approved internal Project operations according to application policy.

### Zone E — Admin

Authenticated Supabase user with active `ADMIN` profile.

May perform privileged internal administration.

---

## 3. Authentication

Use Supabase Auth for Admin/Staff identities.

V1 should not provide public staff sign-up.

Staff account creation/activation should be an Admin-controlled workflow.

Authentication alone is not enough; every sensitive action must authorize role/capability.

---

## 4. Authorization

Do not trust:

- client-hidden buttons;
- route names;
- Project ID in URL;
- customer-supplied role;
- customer-supplied owner/staff ID;
- client-supplied package entitlement;
- client-supplied prices.

Authorization must be enforced through server logic and/or RLS appropriate to the operation.

---

## 5. RLS Baseline

Every V2 table must receive an explicit RLS review.

Do not leave a new sensitive table accidentally public.

Forbidden pattern for internal data:

```sql
CREATE POLICY ...
FOR ALL
TO public
USING (true)
WITH CHECK (true);
```

V1 audit found patterns equivalent to overly broad public access. V2 must not reproduce them.

Where mutations go through trusted server logic, prefer minimal table grants/policies rather than opening browser writes broadly.

---

## 6. Service Role

Supabase `service_role` is server-only.

Never:

- put it in client-side environment variables;
- expose it through `NEXT_PUBLIC_*`;
- send it to browser code;
- log it;
- place it in docs;
- commit it.

If server code uses service role, server logic becomes responsible for complete authorization and validation before mutation.

---

## 7. Customer Access Tokens

Customer link tokens are credentials.

Generate with cryptographically secure randomness.

Preferred storage:

- store token hash, not raw token;
- optionally store a non-sensitive hint for staff identification;
- raw token appears only in the delivered URL.

Every token record must be scoped to:

- one Project;
- one purpose;
- active/revoked state;
- optional expiration.

On use:

1. validate token shape;
2. hash/resolve token;
3. ensure active;
4. ensure not revoked/expired;
5. enforce purpose;
6. enforce Project capability.

Provide staff/admin ability to revoke and regenerate.

Do not derive token from Project code, couple name, phone, date, or sequential IDs.

---

## 8. Review Link Security

Review links must show only the Project/review version intended for the link.

Approval must be associated with the reviewed version.

A Review token should not automatically provide Customer Portal capability unless explicitly designed as a combined capability and documented.

Review link must never grant draft editing or staff controls.

---

## 9. Portal Security

Portal link may expose:

- Project display summary;
- public invitation link(s);
- RSVP aggregate/list for that Project;
- Guest Tool only if entitlement exists.

Portal link must not expose:

- other Projects;
- internal staff data;
- internal notes/activity not intended for customer;
- admin package configuration;
- unrestricted database endpoints;
- raw security tokens for unrelated guests/customers.

---

## 10. Guest Token Security

Guest personalization token must be opaque and unpredictable.

Display name is never identity proof.

Guest resolution must ensure:

- token belongs to active guest;
- guest belongs to the expected Project/invitation;
- requested invitation variant is permitted;
- disabled/revoked guest no longer resolves as valid.

Guest A must never see Guest B personalization or RSVP state.

This is a release-blocking security requirement.

---

## 11. RSVP Security

RSVP submission must use a trusted server endpoint/use case.

Validate:

- target invitation/Project state;
- guest token when present;
- Project/guest relationship;
- attendance value;
- party size bounds;
- guest name/message length;
- request body shape.

For personalized guests, only update the RSVP linked to that resolved guest.

For non-personalized invitations, do not grant table-wide read/write simply to allow form submission.

Consider basic abuse controls/rate limiting when production traffic begins.

Never return sensitive internal database errors directly to guests.

---

## 12. Input Safety

Treat all customer/guest text as untrusted.

React escaping should remain intact; do not introduce unsafe HTML rendering for customer-entered text without a reviewed sanitization strategy.

Be especially careful with:

- invitation messages;
- guest display names;
- RSVP messages;
- customer feedback;
- custom event titles;
- URLs.

Do not use `dangerouslySetInnerHTML` for untrusted content without explicit security review.

---

## 13. URL Validation

External URLs such as maps/media references must be validated appropriately.

Do not allow arbitrary `javascript:` or unsafe schemes into clickable links.

Where only HTTPS links are appropriate, enforce it.

---

## 14. Storage Security

V2 must remove anonymous unrestricted upload/delete.

Preferred direction:

- Project media bucket private or tightly controlled;
- staff/server-authorized writes;
- public invitation reads through a controlled signed-URL/server rendering strategy;
- non-guessable object paths.

If a public-read bucket is retained, public means read-only; anonymous write/delete remains forbidden.

Storage policies must be versioned/documented with database migrations or infrastructure documentation.

---

## 15. Media Upload Validation

Validate uploads for:

- approved MIME/type;
- file-size limit;
- image/audio expectations;
- project association;
- authorized uploader.

Do not trust extension alone.

Where image compression occurs in browser, server/storage constraints must still protect the backend.

---

## 16. Published Media Integrity

Do not delete or replace storage objects required by an active published invitation without an explicit republish-safe strategy.

A draft media change must not silently break currently published output.

---

## 17. Secrets and Environment Variables

Secrets belong only in approved local/deployment environment configuration.

Repository rules:

- `.env*` secrets must remain ignored;
- no credentials in documentation;
- no database password/API secrets in commits;
- no screenshots/log files containing secrets committed.

Before commit, inspect diff for accidental secrets.

---

## 18. Logs and Privacy

Logs should contain enough context to debug but avoid unnecessary customer personal data.

Never log:

- raw customer portal token;
- raw review/intake token;
- raw guest token;
- service-role key;
- authentication session token;
- passwords.

Where token debugging is needed, use safe internal IDs or non-sensitive token hints.

---

## 19. Admin/Staff Route Protection

Internal routes must verify authenticated user and active authorized profile.

Do not rely only on client-side redirects after page load.

Sensitive server actions/routes must authorize independently even if the page itself is protected.

---

## 20. Project Isolation

Every Project-scoped action must verify Project relationship.

Examples:

- customer portal token -> Project;
- guest token -> Project;
- RSVP -> Project;
- media -> Project;
- review version -> Project;
- staff operation -> authorized Project scope/role.

Never trust `project_id` from request body without comparing it to authenticated/token-resolved scope.

---

## 21. Publish Authorization

Publish is privileged.

At minimum:

- authenticated authorized Staff/Admin;
- Project state validated;
- invitation validation passes;
- target review/approval/payment workflow rules checked according to product policy;
- published snapshot created/selected safely.

Customer Review link itself does not publish.

---

## 22. Database Constraints as Security/Integrity Support

Use constraints to make invalid states harder to create.

Examples:

- unique Project/variant;
- unique guest token hash;
- unique access token hash;
- unique personalized guest RSVP current row;
- foreign keys between Project-owned records;
- non-negative money/party size checks.

Application authorization remains required; constraints are not a replacement.

---

## 23. Security Testing Before Launch

Must test at least:

1. anonymous user cannot create/update/delete internal Projects;
2. anonymous user cannot list customers;
3. anonymous user cannot list all guests/RSVP data;
4. invalid/revoked customer token fails;
5. portal token for Project A cannot access Project B;
6. Guest A token cannot resolve Guest B;
7. invalid guest token does not reveal guest data;
8. non-entitled Project cannot use Guest Tool;
9. Staff cannot perform Admin-only action if roles are differentiated;
10. published invitation remains public as intended without exposing draft/internal data;
11. Storage anonymous upload/delete fails;
12. service-role secret never appears in client bundle;
13. draft edits do not change published snapshot;
14. API returns safe errors without secrets.

---

## 24. Security Stop Conditions

Claude must stop before implementing if a task proposes:

- disabling RLS “temporarily” in production paths;
- public unrestricted table write access;
- exposing service role to browser;
- using predictable tokens;
- putting raw access tokens into logs;
- bypassing Project ownership/capability checks;
- mutating published snapshots in place;
- destructive schema changes without approved migration plan.
