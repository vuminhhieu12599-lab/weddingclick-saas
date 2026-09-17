-- WeddingClick V2 — Feature Migration 0023 (Task 024, Phase 1)
-- Project Media Storage Foundation: creates the private project-media
-- Supabase Storage bucket and its staff-only object access policies.
--
-- Source of truth: docs/API_CONTRACT.md §3.2 (project media is "one trusted
-- server media use case", not a DB business-action RPC), docs/SECURITY.md
-- §14/§15 (private bucket, staff-authorized writes, MIME/size validation),
-- docs/PHYSICAL_DATABASE_PLAN.md §2.9/§K (project_media metadata model,
-- storage cleanup ordering). Task 024's architecture decisions (bucket
-- name, privacy, MIME/size limits, RLS predicate) are FROZEN and restated
-- here exactly as approved — this migration does not reopen or reinterpret
-- any of them.
--
-- SCOPE — this migration touches ONLY:
--   - one row in storage.buckets (id = 'project-media');
--   - four new storage.objects RLS policies, each scoped by
--     bucket_id = 'project-media' in its own USING/WITH CHECK clause.
--
-- It does NOT touch:
--   - public.project_media (table shape, grants, RLS, triggers — 0007 and
--     0013b are entirely unmodified by this migration);
--   - public.invitation_version_media (0013b, unmodified);
--   - public.activity_logs (0020, unmodified — no audit-trail write of any
--     kind is added by this migration; docs/API_CONTRACT.md §3.2: "No
--     activity type exists for media upload/delete in the frozen union");
--   - any DB business-action RPC (none is authorized for media —
--     API_CONTRACT.md §3.2: media is Next.js server orchestration, not a
--     SQL function — this migration creates no function of any kind);
--   - V1's wedding-photos bucket or its policies — a distinct bucket,
--     untouched by every statement below;
--   - storage.objects' table-level RLS enablement or table-level GRANTs
--     (both are shared, platform-managed state across every bucket in this
--     project; the policies below only add new bucket-scoped policy rows,
--     they do not alter that shared state).
--
-- No elevated bypass-RLS role is referenced anywhere in this migration:
-- ordinary staff media workflows authenticate as `authenticated` (the
-- caller's own Supabase Auth session) only (Task 024 decision #4).
--
-- AUTHORING ONLY — not applied. Do not run `supabase db push` / migration
-- up / db reset / remote SQL / apply this migration as part of authoring.
-- External review happens before preflight/apply.

-- ---------------------------------------------------------------------
-- A/B. Bucket creation — private, 20 MiB hard limit, exact MIME allow-list
-- ---------------------------------------------------------------------
-- Declarative upsert: safe to re-run, and guarantees the bucket's
-- public/limit/mime configuration always matches this migration's frozen
-- values even if the row already exists (e.g. created out-of-band).
-- Unlike migration 0003's ON CONFLICT DO NOTHING (immutable catalog seed
-- rows, never meant to change once inserted), bucket configuration is live
-- infrastructure state this migration must own outright — DO UPDATE keeps
-- it declarative rather than "first write wins".
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'project-media',
  'project-media',
  false,
  20971520, -- 20 MiB (Task 024 frozen decision #14)
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'audio/mpeg',
    'audio/mp4'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  name               = EXCLUDED.name,
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------------------------------------------------------------------
-- C. Storage object policies — staff-only, bucket-scoped
-- ---------------------------------------------------------------------
-- Authorization reuses the existing, frozen public.is_staff() predicate
-- (docs/SECURITY.md §5.1; migration 0002) — no independent role/is_active
-- check is reimplemented here. public.is_staff() is STABLE,
-- SECURITY DEFINER, SET search_path = '', and already
-- GRANT EXECUTE ... TO authenticated only (0002) — safe to call from a
-- storage.objects policy evaluated as the authenticated role, exactly as
-- every public.* table RLS policy in this project already does.
--
-- Every USING/WITH CHECK clause below is scoped to
-- bucket_id = 'project-media' so these policies can never grant access to
-- any other bucket (including V1's wedding-photos, which keeps whatever
-- policies it already has, untouched). No anon-role policy is created —
-- anon therefore has no access to this bucket's objects at all (default
-- deny under RLS), matching Task 024 decision #15 (no public read access
-- yet; signed/public rendering URLs are deferred to a later task).

CREATE POLICY project_media_staff_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'project-media'
    AND public.is_staff()
  );

CREATE POLICY project_media_staff_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'project-media'
    AND public.is_staff()
  );

CREATE POLICY project_media_staff_update
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'project-media'
    AND public.is_staff()
  )
  WITH CHECK (
    bucket_id = 'project-media'
    AND public.is_staff()
  );

CREATE POLICY project_media_staff_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'project-media'
    AND public.is_staff()
  );
