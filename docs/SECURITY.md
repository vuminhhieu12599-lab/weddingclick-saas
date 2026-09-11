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

### 5.1 Centralized authorization helper functions (Task 001)

Role checks inside RLS policies must not repeat ad-hoc `EXISTS (SELECT ... FROM profiles ...)` subqueries per policy. Three centralized `SECURITY DEFINER` functions are the single source of truth, each with `SET search_path = ''` (empty — every reference inside the function body is fully schema-qualified, e.g. `public.profiles`, `auth.uid()`) and owned by a role with `BYPASSRLS`, which is also what makes it safe for every table's RLS policies — including `profiles`' own — to call these functions directly without risking recursion. See `docs/PHYSICAL_DATABASE_PLAN.md` §1.3 for the full hardening detail:

- `current_user_role()` — resolves the calling `auth.uid()`'s role from `profiles`, or `NULL` if no active profile exists.
- `is_staff()` — true for any active `ADMIN` or `STAFF` profile.
- `is_admin()` — true only for an active `ADMIN` profile.

Every RLS policy that needs a role check calls one of these, never a client-supplied claim. See `docs/PHYSICAL_DATABASE_PLAN.md` §1.5 for the full planned signatures.

### 5.2 Customer/guest tokens are not RLS-scoped

Supabase RLS is keyed to `auth.uid()` / the Auth JWT and has no native relationship to the application-level bearer tokens used for customer access links and guest links. Consequently, `anon` and any `authenticated` session without an active `profiles` row receive **no RLS grants at all** on V2 tables — every INTAKE/REVIEW/PORTAL/guest-token flow is served exclusively by trusted Next.js server code that validates the token server-side and then queries using `service_role` (which bypasses RLS). RLS on V2 tables is real defense-in-depth for the STAFF/ADMIN (`authenticated`) path; it is not the mechanism that scopes customer or guest access. See `docs/PHYSICAL_DATABASE_PLAN.md` §1.6 and §M for the full matrix.

### 5.3 Staff mutations still go through RLS, not `service_role` — normal case

Normal internal staff/admin mutations (Projects, Customers, wedding data, media metadata, guests, tasks, catalog admin) are performed by trusted server code using **the staff member's own authenticated Supabase session** — never the anon key called directly from a client component (V1's flaw), and never `service_role` as a blanket substitute for RLS. `service_role` is reserved for customer/guest token flows (§5.2), narrowly-scoped exceptional admin procedures (e.g. hard-delete, initial admin bootstrap), and the specific internal `SECURITY DEFINER` functions that require `BYPASSRLS` to avoid `profiles` RLS recursion. This keeps RLS as real, live enforcement for staff operations rather than decorative defense-in-depth. See `docs/PHYSICAL_DATABASE_PLAN.md` §1.4.

### 5.4 Activity log write trust

`activity_logs` has no table-level `INSERT` policy for any role, including authenticated staff — an ordinary staff session must not be able to manufacture an arbitrary audit row by issuing a raw `INSERT`. Nor is it enough to hide that behind a generic logging RPC: a directly-callable `log_activity(...)` would still let any authenticated session log an event that never actually happened, even though the actor field itself is set correctly. The internal `log_activity(...)` helper is therefore **not granted `EXECUTE` to any externally-reachable role at all** — it is callable only from within other trusted `SECURITY DEFINER` business-action functions (publish, mark-paid, approve, etc.), which call it as a verified side effect of the real mutation they perform, using `auth.uid()` for the actor. See `docs/PHYSICAL_DATABASE_PLAN.md` §2.22/§L.

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

**Basic abuse controls/rate limiting on public RSVP submission and customer-token verification endpoints are a mandatory pre-production requirement, not an optional consideration.** Implementation may be deferred during Week 1–4 development, but production readiness (`docs/ROADMAP.md` "Production Ready Definition") fails if this has not been addressed before commercial launch. No schema table is required for it in the Task 001/002 physical plan — this is an application/middleware-level control, tracked here as a release gate.

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
