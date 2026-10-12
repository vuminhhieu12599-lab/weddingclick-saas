-- WeddingClick V2 — Feature Migration 0049 (LAUNCH-P0-02)
-- Human-friendly public URLs for SEPARATE (GROOM / BRIDE) invitations.
--
-- Source of truth: docs/DECISIONS.md "LAUNCH-P0-02 — Human-Friendly Public
-- Invitation URLs"; docs/API_CONTRACT.md §38.
--
-- AUTHORING ONLY — not applied. The Product Owner applies it manually after
-- review (DEV first, then Production).
--
-- PURPOSE (one): a persistent, globally unique, write-once public ALIAS per
-- published GROOM/BRIDE invitation, e.g.
--   GROOM  /i/minh-anh&thu-ha
--   BRIDE  /i/thu-ha&minh-anh
-- resolving to that invitation's CURRENT PUBLISHED version.
--
-- What it adds:
--   1. public.invitation_public_aliases — one row per invitation (PK
--      invitation_id), alias UNIQUE across all Projects, composite FK to
--      project_invitations(id, project_id). Write-once: no UPDATE/DELETE
--      grant, and a trigger rejects UPDATE and DELETE for every role.
--   2. assign_invitation_public_alias(project, variant, alias) — the ONLY
--      write path. SECURITY DEFINER, empty search_path, EXECUTE for
--      authenticated only, self-authorizing (active staff). Requires a
--      SEPARATE-package Project, a GROOM/BRIDE invitation, and a valid
--      current PUBLISHED pointer. Never overwrites: an invitation that
--      already has an alias, or an alias owned by another invitation, is a
--      stable conflict code. No numeric suffix is ever generated here.
--   3. resolve_public_invitation_alias(alias) — read-only, service_role
--      only. Returns the invitation's canonical public_slug ONLY while it
--      has a valid PUBLISHED pointer (else NULL; pointer fault PI001). The
--      public page then renders through the unchanged 0039 pipeline, so
--      RSVP (0040), share cover (0041) and guest links (0042) keep binding
--      through the canonical slug.
--
-- Unchanged: project_invitations.public_slug (0012 generation, 0013b
-- freeze), every published Snapshot, every earlier function, RLS policy
-- and grant. COMMON invitations get no alias (CHECK + RPC guard). No
-- activity type is added: the frozen Activity Union (API_CONTRACT §6) has
-- none for this, so the row's own created_by/created_at is the record.
--
-- Error contract (SQLSTATE, mapped by lib/server/invitation-alias):
--   PA001 caller is not active staff
--   PA002 alias malformed (shape/length)
--   PA003 Project not found
--   PA004 not eligible: not a SEPARATE package or variant not GROOM/BRIDE
--   PA005 invitation of that variant not found
--   PA006 invitation not currently published
--   PA007 invitation already has an alias (frozen; never replaced)
--   PA008 alias already used by another invitation
--   PA009 alias rows are immutable (UPDATE/DELETE attempted)
--   PI001 published pointer integrity fault (existing code, as 0039)
--
-- Purely additive. Forward-only. A post-condition block verifies grants,
-- RLS and function properties.

-- ===========================================================================
-- 1. Table
-- ===========================================================================
CREATE TABLE public.invitation_public_aliases (
  invitation_id  uuid PRIMARY KEY,
  project_id     uuid NOT NULL,
  alias          text NOT NULL,
  created_by     uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),

  -- Global uniqueness across every Project and invitation.
  CONSTRAINT invitation_public_aliases_alias_key UNIQUE (alias),

  -- Two lowercase ASCII name slugs joined by one literal '&'. Disjoint from
  -- the 0012 canonical slug shape (which never contains '&').
  CONSTRAINT invitation_public_aliases_alias_shape CHECK (
    char_length(alias) <= 100
    AND alias ~ '^[a-z0-9]+(-[a-z0-9]+)*&[a-z0-9]+(-[a-z0-9]+)*$'
  ),

  -- Same-Project binding: the alias can only point at an invitation of the
  -- Project recorded on the row (0012 UNIQUE (id, project_id) target).
  CONSTRAINT invitation_public_aliases_invitation_fk
    FOREIGN KEY (invitation_id, project_id)
    REFERENCES public.project_invitations (id, project_id)
    ON DELETE RESTRICT
);

CREATE INDEX invitation_public_aliases_project_id_idx
  ON public.invitation_public_aliases (project_id);

COMMENT ON TABLE public.invitation_public_aliases IS
  'LAUNCH-P0-02 (0049): write-once human-friendly public alias of one published GROOM/BRIDE invitation (e.g. minh-anh&thu-ha). Routing identifier only, never authorization. Resolves to the invitation''s CURRENT PUBLISHED version via resolve_public_invitation_alias(). Written only by assign_invitation_public_alias(); UPDATE/DELETE rejected by trigger.';
COMMENT ON COLUMN public.invitation_public_aliases.alias IS
  'Globally unique. Two lowercase ASCII name slugs joined by a literal &. Frozen once assigned: renaming the couple or republishing never changes it.';

-- ===========================================================================
-- 2. Immutability guard (backstop for privileged roles; no role has
--    UPDATE/DELETE grants)
-- ===========================================================================
CREATE FUNCTION public.guard_invitation_public_alias_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Invitation public aliases are immutable'
    USING ERRCODE = 'PA009';
END;
$$;

COMMENT ON FUNCTION public.guard_invitation_public_alias_immutable() IS
  'Trigger-only helper (0049): rejects every UPDATE and DELETE on invitation_public_aliases. Not a business RPC — no direct EXECUTE grant to any role.';

REVOKE ALL ON FUNCTION public.guard_invitation_public_alias_immutable() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_invitation_public_alias_immutable() FROM anon;
REVOKE ALL ON FUNCTION public.guard_invitation_public_alias_immutable() FROM authenticated;
REVOKE ALL ON FUNCTION public.guard_invitation_public_alias_immutable() FROM service_role;

CREATE TRIGGER invitation_public_aliases_guard_immutable
  BEFORE UPDATE OR DELETE ON public.invitation_public_aliases
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_invitation_public_alias_immutable();

-- ===========================================================================
-- 3. Privileges + RLS
-- ===========================================================================
REVOKE ALL ON TABLE public.invitation_public_aliases FROM PUBLIC;
REVOKE ALL ON TABLE public.invitation_public_aliases FROM anon;
REVOKE ALL ON TABLE public.invitation_public_aliases FROM authenticated;
REVOKE ALL ON TABLE public.invitation_public_aliases FROM service_role;

-- Staff read (Xuất bản tab) through RLS; no direct write for anyone.
GRANT SELECT ON TABLE public.invitation_public_aliases TO authenticated;
-- Customer Portal link display (server-only, after PORTAL token resolution).
GRANT SELECT ON TABLE public.invitation_public_aliases TO service_role;

ALTER TABLE public.invitation_public_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitation_public_aliases FORCE ROW LEVEL SECURITY;

CREATE POLICY invitation_public_aliases_select_staff
  ON public.invitation_public_aliases
  FOR SELECT
  TO authenticated
  USING (public.is_staff());

-- ===========================================================================
-- 4. assign_invitation_public_alias — the only write path
-- ===========================================================================
CREATE FUNCTION public.assign_invitation_public_alias(
  p_project_id uuid,
  p_variant text,
  p_alias text
)
RETURNS TABLE (
  invitation_id uuid,
  project_id uuid,
  variant text,
  alias text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_package_code  text;
  v_invitation_id uuid;
  v_published_id  uuid;
  v_version       public.invitation_versions%ROWTYPE;
  v_constraint    text;
  v_row           public.invitation_public_aliases%ROWTYPE;
BEGIN
  -- A. Self-authorization (same pattern as 0038).
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'PA001';
  END IF;

  PERFORM 1
  FROM public.profiles AS p
  WHERE p.id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND OR public.is_staff() IS NOT TRUE THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'PA001';
  END IF;

  -- B. Alias shape (mirrors the table CHECK; checked first for a stable code).
  IF p_alias IS NULL
     OR char_length(p_alias) > 100
     OR p_alias !~ '^[a-z0-9]+(-[a-z0-9]+)*&[a-z0-9]+(-[a-z0-9]+)*$'
  THEN
    RAISE EXCEPTION 'Alias is malformed'
      USING ERRCODE = 'PA002';
  END IF;

  -- C. Project (key-share lock: it cannot disappear underneath us).
  SELECT p.package_code_snapshot INTO v_package_code
  FROM public.projects AS p
  WHERE p.id = p_project_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found'
      USING ERRCODE = 'PA003';
  END IF;

  -- D. SEPARATE only (lib/domain/invitation-variant-policy.ts). COMMON
  -- invitations are deliberately unchanged by this migration.
  IF v_package_code IS DISTINCT FROM 'SEPARATE'
     OR p_variant IS NULL
     OR p_variant NOT IN ('GROOM', 'BRIDE')
  THEN
    RAISE EXCEPTION 'Only SEPARATE GROOM/BRIDE invitations get a public alias'
      USING ERRCODE = 'PA004';
  END IF;

  -- E. The invitation, locked so concurrent assignments serialize.
  SELECT pi.id, pi.published_version_id
    INTO v_invitation_id, v_published_id
  FROM public.project_invitations AS pi
  WHERE pi.project_id = p_project_id
    AND pi.variant = p_variant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found'
      USING ERRCODE = 'PA005';
  END IF;

  -- F. Must be currently published (never REVIEW or draft).
  IF v_published_id IS NULL THEN
    RAISE EXCEPTION 'Invitation is not published'
      USING ERRCODE = 'PA006';
  END IF;

  SELECT iv.* INTO v_version
  FROM public.invitation_versions AS iv
  WHERE iv.id = v_published_id;

  IF NOT FOUND
     OR v_version.version_type IS DISTINCT FROM 'PUBLISHED'
     OR v_version.invitation_id IS DISTINCT FROM v_invitation_id
     OR v_version.project_id IS DISTINCT FROM p_project_id
  THEN
    RAISE EXCEPTION 'Published version pointer integrity fault'
      USING ERRCODE = 'PI001';
  END IF;

  -- G. Write-once: an existing alias is frozen, never replaced.
  PERFORM 1
  FROM public.invitation_public_aliases AS a
  WHERE a.invitation_id = v_invitation_id;

  IF FOUND THEN
    RAISE EXCEPTION 'Invitation already has a public alias'
      USING ERRCODE = 'PA007';
  END IF;

  -- H. Insert; a taken alias is a conflict, never overwritten or suffixed.
  BEGIN
    INSERT INTO public.invitation_public_aliases AS a (invitation_id, project_id, alias, created_by)
    VALUES (v_invitation_id, p_project_id, p_alias, auth.uid())
    RETURNING a.* INTO v_row;
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint = 'invitation_public_aliases_alias_key' THEN
        RAISE EXCEPTION 'Alias is already used by another invitation'
          USING ERRCODE = 'PA008';
      END IF;
      RAISE EXCEPTION 'Invitation already has a public alias'
        USING ERRCODE = 'PA007';
  END;

  RETURN QUERY SELECT v_row.invitation_id, v_row.project_id, p_variant, v_row.alias, v_row.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_invitation_public_alias(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_invitation_public_alias(uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.assign_invitation_public_alias(uuid, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.assign_invitation_public_alias(uuid, text, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.assign_invitation_public_alias(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.assign_invitation_public_alias(uuid, text, text) IS
  'LAUNCH-P0-02 (0049): the only write path for invitation_public_aliases. Active staff only (PA001). Requires a well-formed alias (PA002), an existing SEPARATE-package Project with a GROOM/BRIDE invitation (PA003-PA005) whose published_version_id is a valid PUBLISHED row (PA006, PI001). Write-once: an existing alias for the invitation (PA007) or an alias owned by another invitation (PA008) is a conflict; nothing is overwritten and no suffix is generated. Writes no Snapshot, pointer, slug, guest, RSVP or activity row.';

-- ===========================================================================
-- 5. resolve_public_invitation_alias — public read (service_role only)
-- ===========================================================================
CREATE FUNCTION public.resolve_public_invitation_alias(
  p_alias text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invitation_id uuid;
  v_project_id    uuid;
  v_public_slug   text;
  v_published_id  uuid;
  v_version       public.invitation_versions%ROWTYPE;
BEGIN
  IF p_alias IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT pi.id, pi.project_id, pi.public_slug, pi.published_version_id
    INTO v_invitation_id, v_project_id, v_public_slug, v_published_id
  FROM public.invitation_public_aliases AS a
  JOIN public.project_invitations AS pi
    ON pi.id = a.invitation_id
   AND pi.project_id = a.project_id
  WHERE a.alias = p_alias;

  -- Unknown alias or (defensively) no publication: fail closed.
  IF NOT FOUND OR v_published_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT iv.* INTO v_version
  FROM public.invitation_versions AS iv
  WHERE iv.id = v_published_id;

  IF NOT FOUND
     OR v_version.version_type IS DISTINCT FROM 'PUBLISHED'
     OR v_version.invitation_id IS DISTINCT FROM v_invitation_id
     OR v_version.project_id IS DISTINCT FROM v_project_id
  THEN
    RAISE EXCEPTION 'Published version pointer integrity fault'
      USING ERRCODE = 'PI001';
  END IF;

  RETURN v_public_slug;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_public_invitation_alias(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_public_invitation_alias(text) FROM anon;
REVOKE ALL ON FUNCTION public.resolve_public_invitation_alias(text) FROM authenticated;
REVOKE ALL ON FUNCTION public.resolve_public_invitation_alias(text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.resolve_public_invitation_alias(text) TO service_role;

COMMENT ON FUNCTION public.resolve_public_invitation_alias(text) IS
  'LAUNCH-P0-02 (0049): read-only, service_role-exclusive. Alias -> the bound invitation''s canonical public_slug, only while its published_version_id is a valid PUBLISHED row of the same invitation and Project (else NULL; pointer fault PI001). The caller then renders through get_public_invitation (0039). Never a REVIEW or draft fallback, never another invitation.';

-- ===========================================================================
-- 6. Post-conditions
-- ===========================================================================
DO $$
DECLARE
  v_assign  regprocedure := 'public.assign_invitation_public_alias(uuid, text, text)'::regprocedure;
  v_resolve regprocedure := 'public.resolve_public_invitation_alias(text)'::regprocedure;
  v_fn      regprocedure;
BEGIN
  IF NOT (SELECT c.relrowsecurity AND c.relforcerowsecurity FROM pg_class AS c WHERE c.oid = 'public.invitation_public_aliases'::regclass) THEN
    RAISE EXCEPTION '0049: invitation_public_aliases must have forced RLS';
  END IF;
  IF has_table_privilege('anon', 'public.invitation_public_aliases', 'SELECT, INSERT, UPDATE, DELETE')
     OR has_table_privilege('authenticated', 'public.invitation_public_aliases', 'INSERT, UPDATE, DELETE')
     OR has_table_privilege('service_role', 'public.invitation_public_aliases', 'INSERT, UPDATE, DELETE')
  THEN
    RAISE EXCEPTION '0049: invitation_public_aliases must not be directly writable';
  END IF;
  FOREACH v_fn IN ARRAY ARRAY[v_assign, v_resolve] LOOP
    IF NOT (SELECT p.prosecdef FROM pg_proc AS p WHERE p.oid = v_fn) THEN
      RAISE EXCEPTION '0049: % must be SECURITY DEFINER', v_fn;
    END IF;
    IF NOT coalesce((SELECT 'search_path=""' = ANY (p.proconfig) FROM pg_proc AS p WHERE p.oid = v_fn), false) THEN
      RAISE EXCEPTION '0049: % must have an empty search_path', v_fn;
    END IF;
    IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '0049: % must not be executable by anon', v_fn;
    END IF;
  END LOOP;
  IF NOT has_function_privilege('authenticated', v_assign, 'EXECUTE')
     OR has_function_privilege('service_role', v_assign, 'EXECUTE')
     OR has_function_privilege('authenticated', v_resolve, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_resolve, 'EXECUTE')
  THEN
    RAISE EXCEPTION '0049: function EXECUTE grants are not as designed';
  END IF;
END;
$$;
