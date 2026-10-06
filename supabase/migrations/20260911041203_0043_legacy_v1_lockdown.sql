-- WeddingClick V2 — Security Migration 0043 (Task 035B)
-- Legacy V1 lockdown: removes every anon/authenticated access path to the
-- retired V1 tables and the V1 wedding-photos Storage bucket.
--
-- Source of truth: docs/SECURITY.md §11.2, docs/API_CONTRACT.md §32,
-- docs/DECISIONS.md "Task 035B — Legacy V1 Exposure Containment" (owner
-- decisions 2026-10-06), docs/LEGACY_AUDIT.md §12/§14.
--
-- PROBLEM: V1 browser code used the public anon key against tables where
-- anon AND authenticated held SELECT/INSERT/UPDATE/DELETE/TRUNCATE/
-- REFERENCES/TRIGGER, `weddings`/`wishes` had RLS disabled, `invitations`
-- carried `ALL ... USING (true)` and `SELECT ... USING (true)` policies,
-- and storage.objects allowed anyone to INSERT into the public
-- `wedding-photos` bucket. Hiding V1 UI cannot fix that: the anon key is
-- public by design, so the database itself must deny access.
--
-- SCOPE — this migration touches ONLY:
--   - public.invitations, public.weddings, public.wishes: REVOKE ALL from
--     anon, authenticated and PUBLIC (and on any sequence they own); ENABLE
--     + FORCE ROW LEVEL SECURITY; drop the two known permissive V1 policies;
--   - storage.objects: drop the one V1 policy "Cho phép mọi người tải ảnh
--     lên" (public INSERT into wedding-photos);
--   - storage.buckets: set wedding-photos to private (public = false).
--
-- It does NOT:
--   - delete, update or move any row of the V1 tables (data retained);
--   - delete any storage object (the wedding-photos objects are retained);
--   - touch any V2 table, function, policy or the `project-media` bucket;
--   - touch storage.objects' table-level RLS/GRANTs (platform-managed);
--   - change service_role or postgres access. Both roles have BYPASSRLS
--     (verified read-only against the linked project on 2026-10-06), so
--     FORCE ROW LEVEL SECURITY does not affect server/administrative access.
--
-- FRESH ENVIRONMENTS: the V1 objects were never created by a repository
-- migration (see 0001). Every statement is guarded by to_regclass / catalog
-- existence checks, so this migration is a no-op where they are absent and
-- is safe to re-run.
--
-- POST-CONDITIONS are asserted at the end: if any anon/authenticated/PUBLIC
-- privilege, any policy on the three V1 tables, any wedding-photos storage
-- policy, or a public wedding-photos bucket remains, the migration raises
-- and nothing is committed (fail closed, no guessed policy names).
--
-- AUTHORING ONLY — not applied. Do not run `supabase db push` / migration
-- up / db reset / remote SQL as part of authoring. The Product Owner applies
-- this migration manually after review.

-- ---------------------------------------------------------------------
-- A. V1 tables — revoke all client-role privileges, force RLS, drop the
--    known permissive policies
-- ---------------------------------------------------------------------
DO $$
DECLARE
  legacy_table text;
  owned_sequence regclass;
BEGIN
  FOREACH legacy_table IN ARRAY ARRAY['invitations', 'weddings', 'wishes'] LOOP
    IF to_regclass(format('public.%I', legacy_table)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated, PUBLIC', legacy_table);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', legacy_table);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', legacy_table);

    FOR owned_sequence IN
      SELECT d.objid::regclass
        FROM pg_depend d
        JOIN pg_class s ON s.oid = d.objid AND s.relkind = 'S'
       WHERE d.refobjid = format('public.%I', legacy_table)::regclass
         AND d.deptype IN ('a', 'i')
    LOOP
      EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM anon, authenticated, PUBLIC', owned_sequence);
    END LOOP;
  END LOOP;

  IF to_regclass('public.invitations') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Cho phép admin sửa thiệp" ON public.invitations;
    DROP POLICY IF EXISTS "Cho phép tất cả mọi người đọc thiệp" ON public.invitations;
  END IF;
END
$$;

-- ---------------------------------------------------------------------
-- B. wedding-photos — no anonymous upload, bucket private, objects kept
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Cho phép mọi người tải ảnh lên" ON storage.objects;
  END IF;

  IF to_regclass('storage.buckets') IS NOT NULL THEN
    UPDATE storage.buckets
       SET public = false
     WHERE id = 'wedding-photos'
       AND public IS DISTINCT FROM false;
  END IF;
END
$$;

-- ---------------------------------------------------------------------
-- C. Post-conditions (fail closed)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  leftover text;
BEGIN
  SELECT string_agg(DISTINCT g.table_name || ':' || g.grantee || ':' || g.privilege_type, ', ')
    INTO leftover
    FROM information_schema.role_table_grants g
   WHERE g.table_schema = 'public'
     AND g.table_name IN ('invitations', 'weddings', 'wishes')
     AND g.grantee IN ('anon', 'authenticated', 'PUBLIC');
  IF leftover IS NOT NULL THEN
    RAISE EXCEPTION '0043: legacy table privileges remain: %', leftover;
  END IF;

  SELECT string_agg(p.tablename || ':' || p.policyname, ', ')
    INTO leftover
    FROM pg_policies p
   WHERE p.schemaname = 'public'
     AND p.tablename IN ('invitations', 'weddings', 'wishes');
  IF leftover IS NOT NULL THEN
    RAISE EXCEPTION '0043: legacy table policies remain: %', leftover;
  END IF;

  SELECT string_agg(c.relname, ', ')
    INTO leftover
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname IN ('invitations', 'weddings', 'wishes')
     AND NOT (c.relrowsecurity AND c.relforcerowsecurity);
  IF leftover IS NOT NULL THEN
    RAISE EXCEPTION '0043: legacy tables without forced RLS: %', leftover;
  END IF;

  IF to_regclass('storage.objects') IS NOT NULL THEN
    SELECT string_agg(p.policyname, ', ')
      INTO leftover
      FROM pg_policies p
     WHERE p.schemaname = 'storage'
       AND p.tablename = 'objects'
       AND (coalesce(p.qual, '') || coalesce(p.with_check, '')) LIKE '%wedding-photos%';
    IF leftover IS NOT NULL THEN
      RAISE EXCEPTION '0043: wedding-photos storage policies remain: %', leftover;
    END IF;
  END IF;

  -- Nested (not `AND`): PL/pgSQL plans a combined expression as one query,
  -- which would fail on a fresh database without storage.buckets.
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'wedding-photos' AND public) THEN
      RAISE EXCEPTION '0043: wedding-photos bucket is still public';
    END IF;
  END IF;
END
$$;
