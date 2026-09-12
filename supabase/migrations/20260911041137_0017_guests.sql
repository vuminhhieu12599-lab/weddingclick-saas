-- WeddingClick V2 — Task 017
-- guests table.
--
-- Source of truth: docs/PHYSICAL_DATABASE_PLAN.md §2.19 (guests, [R11-B],
-- [R14], [G1]), §11 (I. Personalized Guest Token Model), §15 (RLS Matrix),
-- §16 (Migration Order, 0017_guests.sql), §1.2 (updated_at convention).
-- Also docs/DATABASE.md §20 (guests, suggested fields — no conflict with
-- the frozen physical plan; less detailed only).
--
-- ENTITLEMENT NOTE: PERSONALIZED_GUEST entitlement gating of guest creation
-- (docs/DATABASE.md §20 "guest creation requires personalized guest
-- entitlement") is intentionally NOT enforced by a DB trigger here. The
-- frozen physical plan's migration checklist for 0017_guests.sql
-- (§16) lists exactly two mechanisms — the composite invitation_variant FK
-- and guard_guest_project_immutability() — and nothing else. Entitlement
-- itself is derived elsewhere as "at least one non-revoked project_addons
-- row for the relevant service_addon_id" (§2.6, §M) and is read by
-- trusted server/domain-service code, not re-derived by a guests-table
-- trigger. This migration does not invent one.
--
-- TOKEN ROTATION NOTE: unlike project_access_links (migration 0014, which
-- freezes token_hash/token_hint as identity columns and requires rotation
-- to create a new row), guests' rotation model is explicitly an in-place
-- UPDATE of token_hash/token_hint only (§2.19 "Rotation vs. revocation").
-- No identity-immutability trigger is added for those two columns. Only
-- project_id is DB-guarded immutable ([G1]).
--
-- REVOCATION NOTE: the frozen plan does not specify a monotonic-revocation
-- guard for guests (unlike project_access_links' Task-014 hardening).
-- revoked_at is a plain nullable timestamp — NULL = active, non-NULL =
-- revoked — with no additional DB-enforced monotonicity here.
--
-- NOT implemented here: rsvps, RSVP triggers/indexes, RSVP API, guest UI,
-- portal UI, personalized guest import/CSV, token-generation/resolver
-- routes. See Task 018.
--
-- This migration is purely additive. It does not touch any V1 object.

-- ---------------------------------------------------------------------
-- public.guests (§2.19)
-- ---------------------------------------------------------------------
-- Personalized guest records. display_name is single free-form TEXT, never
-- decomposed into honorific/legal-name fields (CLAUDE.md §10).
CREATE TABLE public.guests (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  project_id         UUID NOT NULL
                       REFERENCES public.projects (id) ON DELETE CASCADE,

  display_name       TEXT NOT NULL
                       CHECK (char_length(display_name) BETWEEN 1 AND 200),

  invitation_variant TEXT
                       CHECK (invitation_variant IN ('COMMON', 'GROOM', 'BRIDE')),

  group_name         TEXT,
  phone              TEXT,
  note               TEXT,

  created_by         UUID REFERENCES public.profiles (id) ON DELETE SET NULL,

  -- SHA-256 digest (32 bytes) of the raw >=32-random-byte guest bearer
  -- token. Raw token is never stored, never logged, and never referenced
  -- in this migration.
  token_hash         BYTEA NOT NULL
                       CHECK (octet_length(token_hash) = 32),

  -- Non-sensitive fragment for staff display only. Mutable together with
  -- token_hash as part of the defined rotation operation (§2.19) — no
  -- identity-immutability guard on these two columns for this table.
  token_hint         TEXT,

  -- NULL = active/resolvable. Sole source of truth for active/revoked
  -- state — no paired is_active boolean.
  revoked_at         TIMESTAMPTZ,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- [R11-B] Composite FK: when invitation_variant is non-null, guarantees
  -- it identifies a real project_invitations row belonging to the SAME
  -- project. Nullable column means MATCH SIMPLE bypasses the check when
  -- invitation_variant IS NULL. RESTRICT (not SET NULL) for the same
  -- structural reason given throughout this plan (§11): a composite
  -- SET NULL would null project_id too, conflicting with project_id's own
  -- separate NOT NULL/CASCADE FK to projects above.
  CONSTRAINT guests_project_id_invitation_variant_fk
    FOREIGN KEY (project_id, invitation_variant)
    REFERENCES public.project_invitations (project_id, variant)
    ON DELETE RESTRICT,

  CONSTRAINT guests_token_hash_key UNIQUE (token_hash)
);

COMMENT ON TABLE public.guests IS
  'Personalized guest records. display_name is single free-form TEXT, never decomposed into honorific/legal-name fields. See docs/PHYSICAL_DATABASE_PLAN.md §2.19.';
COMMENT ON COLUMN public.guests.project_id IS
  'Immutable after INSERT ([G1]) — see guard_guest_project_immutability() below. Moving a Guest to another Project is not a supported operation.';
COMMENT ON COLUMN public.guests.invitation_variant IS
  'Nullable. When set, must identify a real project_invitations row for the same project — see guests_project_id_invitation_variant_fk ([R11-B]).';
COMMENT ON COLUMN public.guests.token_hash IS
  'SHA-256 digest (32 bytes) of the raw guest bearer token. Raw token is never stored. Mutable in place together with token_hint as the defined rotation operation (§2.19) — not identity-frozen like project_access_links.';
COMMENT ON COLUMN public.guests.token_hint IS
  'Non-sensitive fragment for staff display only. Never the raw token.';
COMMENT ON COLUMN public.guests.revoked_at IS
  'NULL = active/resolvable. Sole source of truth for active/revoked state — no paired boolean.';
COMMENT ON CONSTRAINT guests_project_id_invitation_variant_fk ON public.guests IS
  '[R11-B] — composite FK guaranteeing invitation_variant, when present, resolves to a project_invitations row belonging to THIS SAME project. MATCH SIMPLE: NULL invitation_variant bypasses this FK.';

-- Staff "list guests for this project" (§2.19). UNIQUE(token_hash)
-- (declared as a table CONSTRAINT above) already provides its own unique
-- index; the PK already covers id. No other index is added.
CREATE INDEX guests_project_id_idx
  ON public.guests (project_id);

-- ---------------------------------------------------------------------
-- Explicit Data API privileges
-- ---------------------------------------------------------------------
REVOKE ALL ON TABLE public.guests FROM PUBLIC;
REVOKE ALL ON TABLE public.guests FROM anon;
REVOKE ALL ON TABLE public.guests FROM authenticated;
REVOKE ALL ON TABLE public.guests FROM service_role;

-- authenticated represents STAFF/ADMIN sessions; RLS further restricts
-- every operation to is_staff() (§15 RLS Matrix: STAFF/ADMIN R/C/U/D, not
-- scoped by assigned_staff_id — CLAUDE.md §12/§13, all active staff manage
-- all Project guests). UPDATE is further restricted at the column level by
-- guard_guest_project_immutability() below, not by this grant.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.guests TO authenticated;

-- service_role: SELECT, INSERT, UPDATE, DELETE. Per §1.6/§2.19/§15, guest
-- bearer-token resolution (SELECT by token_hash) and the entitlement-gated
-- Customer PORTAL Guest Tool (docs/PRODUCT.md §13: add/import/edit/
-- delete-or-revoke a guest) are both server-only, trusted-code flows with
-- no Supabase Auth session to key RLS off — served by service_role after
-- independent token/project/entitlement validation, never a direct client
-- grant. INSERT/UPDATE/DELETE are required (not just SELECT/UPDATE as in
-- migration 0014's project_access_links) because, unlike access-link
-- issuance, Guest Tool create/edit/delete is itself a customer-token-
-- driven operation, not staff-authenticated-session-only. These are table
-- object privileges only — service_role has no RLS policy and continues
-- to bypass RLS entirely (§1.6); authorization for each operation is
-- enforced by the trusted server code's own validation before it queries,
-- not by anything declared in this migration.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.guests TO service_role;

ALTER TABLE public.guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guests FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- guard_guest_project_immutability() — [G1]
-- ---------------------------------------------------------------------
-- Closes the gap where rsvps.guard_rsvp_guest_same_project() (Task 018)
-- only validates the guest/project relationship at RSVP-write time, not
-- for the remaining lifetime of the guest row: project_id cannot be
-- changed by any normal application UPDATE, full stop. display_name,
-- group_name, phone, note, invitation_variant, token_hash/token_hint
-- (rotation), and revoked_at all remain mutable — this guard touches only
-- project_id.
CREATE FUNCTION public.guard_guest_project_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.project_id IS DISTINCT FROM OLD.project_id THEN
    RAISE EXCEPTION 'guests.project_id is immutable after INSERT (id=%)', OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger-only: no external EXECUTE grant to any role.
REVOKE ALL ON FUNCTION public.guard_guest_project_immutability() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_guest_project_immutability() FROM anon;
REVOKE ALL ON FUNCTION public.guard_guest_project_immutability() FROM authenticated;
REVOKE ALL ON FUNCTION public.guard_guest_project_immutability() FROM service_role;

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------
CREATE TRIGGER guests_guard_project_immutability
  BEFORE UPDATE ON public.guests
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_guest_project_immutability();

-- Shared updated_at maintenance trigger (migration 0001, §1.2 convention —
-- every V2 table with an updated_at column attaches this).
CREATE TRIGGER guests_set_updated_at
  BEFORE UPDATE ON public.guests
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- RLS policies (§2.19, §15) — staff/admin only. No anon policy. No
-- guest-token or Customer PORTAL policy — both are server-only, trusted-
-- code flows once implemented (Task 018), never RLS-scoped (§1.6).
-- ---------------------------------------------------------------------
CREATE POLICY guests_select_staff
  ON public.guests
  FOR SELECT
  TO authenticated
  USING (public.is_staff());

CREATE POLICY guests_insert_staff
  ON public.guests
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff());

CREATE POLICY guests_update_staff
  ON public.guests
  FOR UPDATE
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

CREATE POLICY guests_delete_staff
  ON public.guests
  FOR DELETE
  TO authenticated
  USING (public.is_staff());
