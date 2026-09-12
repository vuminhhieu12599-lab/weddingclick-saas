-- WeddingClick V2 — Foundation Migration 0013
-- invitation_versions table + guard_source_review_version_type().
--
-- Source of truth: docs/PHYSICAL_DATABASE_PLAN.md §2.14 (invitation_versions),
-- §2.13.1 (pointer integrity — migration-boundary context only), [F3], [F4],
-- §15 (RLS Matrix), §16 (Migration Order), [R9], [R10], [R11-D].
--
-- ORDERING NOTE — [R10]: this migration only creates the composite-FK
-- TARGET (UNIQUE (invitation_id, id)) and the immutable version structure
-- that 0013b needs. It does NOT touch project_invitations. Specifically NOT
-- implemented here: project_invitations.current_review_version_id/
-- published_version_id foreign keys, guard_invitation_pointer_types(),
-- guard_invitation_immutable_after_publish(), public_slug freeze,
-- invitation_version_media, guard_project_media_asset_immutability(),
-- review/publish application services, UI/routes, or snapshot resolver
-- code. All of that belongs to
-- 0013b_complete_invitation_pointer_graph_and_media.sql (§16, [F16]) or
-- later feature work — do not collapse this sequence into this migration.
--
-- This migration is purely additive. It does not touch any V1 object.

-- ---------------------------------------------------------------------
-- public.invitation_versions (§2.14)
-- ---------------------------------------------------------------------
-- Stable, fully immutable Review/Published snapshots. A row is created
-- once by trusted staff-triggered server code and never updated or
-- deleted afterward (§13 immutability model below).
CREATE TABLE public.invitation_versions (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- No independent single-column FK on invitation_id — see the composite
  -- FK below ([F3]).
  invitation_id               UUID NOT NULL,

  -- Denormalized copy of the parent invitation's project_id, set once at
  -- INSERT and never updated (row is immutable). Made trustworthy — not
  -- merely convenient — by the composite FK below ([F3], [R11-D]).
  project_id                  UUID NOT NULL,

  version_number              INTEGER NOT NULL
                                CHECK (version_number > 0),

  version_type                TEXT NOT NULL
                                CHECK (
                                  version_type IN ('REVIEW', 'PUBLISHED')
                                ),

  -- Self-referencing. Nullability/co-occurrence with published_at is
  -- governed by the strengthened combined CHECK below ([F4]).
  source_review_version_id    UUID,

  template_version_id         UUID NOT NULL
                                REFERENCES public.template_versions (id) ON DELETE RESTRICT,

  -- Redundant safety copy of template_versions.renderer_key at snapshot
  -- time. Supplied by the trusted snapshot-creation domain service, not
  -- computed or validated against the live template_versions row by the
  -- database (§11 of the task spec / §2.14 of the plan).
  renderer_key_snapshot       TEXT NOT NULL,

  -- Normalized render snapshot. No DB JSON-schema validation, no extracted
  -- columns, no media_refs array — media is normalized separately via
  -- invitation_version_media in 0013b (§R15).
  payload                     JSONB NOT NULL,

  created_by                  UUID REFERENCES public.profiles (id) ON DELETE SET NULL,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- NULL for REVIEW, NOT NULL for PUBLISHED — enforced by the combined
  -- CHECK below ([F4]). No updated_at column: this table is append-only.
  published_at                TIMESTAMPTZ,

  -- ---------------------------------------------------------------------
  -- [F3] — same-parent integrity. ONE composite FK, replacing what would
  -- otherwise be two independent, unrelated FKs (invitation_id ->
  -- project_invitations(id), project_id -> projects(id)). Two independent
  -- FKs would let a row carry invitation_id from Invitation A together with
  -- project_id belonging to a different Project B — this composite FK
  -- structurally forces project_id to be the true parent Project of
  -- invitation_id. Requires project_invitations' UNIQUE (id, project_id)
  -- (added in migration 0012 specifically for this). ON DELETE RESTRICT,
  -- never CASCADE: once an invitation has ANY invitation_versions row —
  -- REVIEW or PUBLISHED — that project_invitations row can no longer be
  -- deleted through normal FK semantics. That tightening is intentional
  -- (§2.14 of the plan). Do NOT add an independent invitation_id FK to
  -- project_invitations(id) or an independent project_id FK to projects(id)
  -- alongside this.
  CONSTRAINT invitation_versions_invitation_project_fkey
    FOREIGN KEY (invitation_id, project_id)
    REFERENCES public.project_invitations (id, project_id)
    ON DELETE RESTRICT,

  -- ---------------------------------------------------------------------
  -- Required uniqueness (§5 of the task spec / §2.14 of the plan). All
  -- three are required — none is dead weight despite the PK already
  -- guaranteeing id's own uniqueness:
  --   - invitation_id/version_number: one logical version number per
  --     invitation.
  --   - invitation_id/id: composite-FK target for this table's own
  --     self-referencing source-review FK below, AND for
  --     project_invitations' pointer FKs completed in 0013b.
  --   - id/project_id: composite-FK target for invitation_version_media
  --     and review_feedback in 0013b/0016.
  CONSTRAINT invitation_versions_invitation_id_version_number_key
    UNIQUE (invitation_id, version_number),

  CONSTRAINT invitation_versions_invitation_id_id_key
    UNIQUE (invitation_id, id),

  CONSTRAINT invitation_versions_id_project_id_key
    UNIQUE (id, project_id),

  -- ---------------------------------------------------------------------
  -- [F4] — strengthened combined REVIEW/PUBLISHED lifecycle CHECK. This
  -- replaces what would otherwise be two separate, weaker checks (e.g. one
  -- that only forbids a REVIEW row from having source_review_version_id,
  -- without ever requiring a PUBLISHED row to have one — which would
  -- incorrectly leave "PUBLISHED with source_review_version_id NULL" as a
  -- valid state). This single CHECK makes every other combination
  -- impossible:
  --   REVIEW    => source_review_version_id IS NULL AND published_at IS NULL
  --   PUBLISHED => source_review_version_id IS NOT NULL AND published_at IS NOT NULL
  CONSTRAINT invitation_versions_lifecycle_check
    CHECK (
      (
        version_type = 'REVIEW'
        AND source_review_version_id IS NULL
        AND published_at IS NULL
      )
      OR
      (
        version_type = 'PUBLISHED'
        AND source_review_version_id IS NOT NULL
        AND published_at IS NOT NULL
      )
    ),

  -- ---------------------------------------------------------------------
  -- Source-review self-reference — [R9]. Composite, self-referencing FK
  -- ensures a PUBLISHED snapshot's source version belongs to the SAME
  -- invitation (structural "same parent" guarantee). It does NOT by itself
  -- guarantee the referenced row is specifically REVIEW-typed — that
  -- literal-value check is the job of guard_source_review_version_type()
  -- below, since a plain FK can only constrain which row is referenced,
  -- not a non-key attribute's value on that row. Normal MATCH SIMPLE
  -- behavior applies: NULL source_review_version_id (every REVIEW row)
  -- bypasses this FK entirely. ON DELETE RESTRICT: invitation_versions
  -- rows are never deleted in normal operation.
  CONSTRAINT invitation_versions_source_review_fkey
    FOREIGN KEY (invitation_id, source_review_version_id)
    REFERENCES public.invitation_versions (invitation_id, id)
    ON DELETE RESTRICT
);

COMMENT ON TABLE public.invitation_versions IS
  'Immutable Review/Published snapshot of one project_invitations variant. Append-only — no UPDATE/DELETE policy or grant for any role. See docs/PHYSICAL_DATABASE_PLAN.md §2.14.';
COMMENT ON COLUMN public.invitation_versions.invitation_id IS
  'Part of the composite FK to project_invitations(id, project_id) ([F3]) — no independent single-column FK exists on this column alone.';
COMMENT ON COLUMN public.invitation_versions.project_id IS
  'Denormalized copy of the parent invitation''s project_id, made trustworthy by the composite FK ([F3], [R11-D]) rather than being an unenforced copy. Set once at INSERT, never updated.';
COMMENT ON COLUMN public.invitation_versions.source_review_version_id IS
  'NULL for REVIEW rows, required for PUBLISHED rows ([F4]). Composite self-FK guarantees same-invitation; guard_source_review_version_type() guarantees the referenced row is specifically version_type = REVIEW.';
COMMENT ON COLUMN public.invitation_versions.renderer_key_snapshot IS
  'Redundant safety copy of template_versions.renderer_key at snapshot time, supplied by the trusted snapshot-creation domain service. Not recomputed or validated against the live template_versions row by the database.';
COMMENT ON COLUMN public.invitation_versions.payload IS
  'Normalized render snapshot. No DB JSON-schema validation. Media references are normalized separately via invitation_version_media (0013b, §R15) — this column deliberately carries no media_refs array.';
COMMENT ON CONSTRAINT invitation_versions_invitation_project_fkey ON public.invitation_versions IS
  '[F3] — single composite FK enforcing that project_id is the true parent Project of invitation_id. Do not add independent invitation_id/project_id FKs alongside this.';
COMMENT ON CONSTRAINT invitation_versions_invitation_id_id_key ON public.invitation_versions IS
  'Composite-FK target for this table''s own source-review self-FK and for project_invitations'' pointer FKs completed in 0013b ([F3]).';
COMMENT ON CONSTRAINT invitation_versions_id_project_id_key ON public.invitation_versions IS
  'Composite-FK target for invitation_version_media and review_feedback, added in 0013b/0016 ([F5], [R11-D]).';
COMMENT ON CONSTRAINT invitation_versions_lifecycle_check ON public.invitation_versions IS
  '[F4] — strengthened combined CHECK: PUBLISHED requires both source_review_version_id and published_at; REVIEW requires both NULL. Replaces two independently weaker checks.';
COMMENT ON CONSTRAINT invitation_versions_source_review_fkey ON public.invitation_versions IS
  '[R9] — composite self-FK guarantees a PUBLISHED row''s source belongs to the same invitation. Does not by itself guarantee the source is REVIEW-typed; see guard_source_review_version_type().';

-- ---------------------------------------------------------------------
-- guard_source_review_version_type() — BEFORE INSERT trigger ([R9])
-- ---------------------------------------------------------------------
-- The composite self-FK above already structurally guarantees that
-- source_review_version_id, when present, resolves to an existing row on
-- the SAME invitation. This trigger adds the one guarantee a FK cannot
-- express: that the referenced row's literal version_type is specifically
-- 'REVIEW', never 'PUBLISHED'. Attached to INSERT only — rows are
-- immutable and no normal UPDATE path exists on this table.
CREATE FUNCTION public.guard_source_review_version_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_source_type text;
BEGIN
  SELECT version_type INTO v_source_type
  FROM public.invitation_versions
  WHERE id = NEW.source_review_version_id
    AND invitation_id = NEW.invitation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source_review_version_id % not found for invitation %', NEW.source_review_version_id, NEW.invitation_id;
  END IF;

  IF v_source_type <> 'REVIEW' THEN
    RAISE EXCEPTION 'source_review_version_id % must reference a REVIEW version, found %', NEW.source_review_version_id, v_source_type;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_source_review_version_type() IS
  'BEFORE INSERT trigger-only helper ([R9]): raises unless source_review_version_id, when present, references an existing same-invitation row with version_type = REVIEW. Not a business RPC — no direct EXECUTE grant to any role.';

-- Trigger-only: no external EXECUTE grant to any role. Trigger firing does
-- not require it (Postgres invokes trigger functions internally).
REVOKE ALL ON FUNCTION public.guard_source_review_version_type() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_source_review_version_type() FROM anon;
REVOKE ALL ON FUNCTION public.guard_source_review_version_type() FROM authenticated;
REVOKE ALL ON FUNCTION public.guard_source_review_version_type() FROM service_role;

CREATE TRIGGER invitation_versions_guard_source_review_type
  BEFORE INSERT ON public.invitation_versions
  FOR EACH ROW
  WHEN (NEW.source_review_version_id IS NOT NULL)
  EXECUTE FUNCTION public.guard_source_review_version_type();

-- ---------------------------------------------------------------------
-- Explicit Data API privileges — invitation_versions
-- ---------------------------------------------------------------------
-- Append-only / immutable table: no UPDATE or DELETE grant for any role,
-- and (below) no UPDATE/DELETE policy either. Rows are created once by
-- trusted server code and never touched again (§13 of the task spec).
REVOKE ALL ON TABLE public.invitation_versions FROM PUBLIC;
REVOKE ALL ON TABLE public.invitation_versions FROM anon;
REVOKE ALL ON TABLE public.invitation_versions FROM authenticated;
REVOKE ALL ON TABLE public.invitation_versions FROM service_role;

-- authenticated represents both STAFF and ADMIN sessions; RLS further
-- restricts every operation to is_staff() (§15 RLS Matrix: "R/C (INSERT
-- via authenticated session, §1.4); no U/D"). Creating a review/publish
-- snapshot is a normal staff-triggered business action under RLS, per
-- §1.4 — not a service_role-driven mutation.
GRANT SELECT, INSERT ON TABLE public.invitation_versions TO authenticated;

-- service_role: SELECT only. Per §15 RLS Matrix, anonymous public-route
-- published-payload rendering and Customer REVIEW payload rendering are
-- server-only trusted paths (independent token/route validation, then a
-- service_role read) — never a service_role write. Normal staff snapshot
-- creation remains the authenticated-session + RLS path only (§1.4).
GRANT SELECT ON TABLE public.invitation_versions TO service_role;

ALTER TABLE public.invitation_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitation_versions FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- RLS policies (§2.14, §15) — staff/admin only. No UPDATE policy, no
-- DELETE policy for any role. No anon policy. No customer/guest-token
-- policy — those flows are server-only (above).
-- ---------------------------------------------------------------------
CREATE POLICY invitation_versions_select_staff
  ON public.invitation_versions
  FOR SELECT
  TO authenticated
  USING (public.is_staff());

CREATE POLICY invitation_versions_insert_staff
  ON public.invitation_versions
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff());
