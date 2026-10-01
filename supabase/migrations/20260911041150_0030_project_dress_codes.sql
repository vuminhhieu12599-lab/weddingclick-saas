-- WeddingClick V2 — Feature Migration 0030 (Invitation Rendering Foundation,
-- Dress Code checkpoint)
-- project_dress_codes + project_dress_code_swatches: a Project's optional
-- Dress Code (plain-text description + ordered colour swatches).
--
-- FROZEN CONTRACT (docs/DECISIONS.md RF7 "Dress Code (Product Owner
-- amendment, 2026-10-01)", docs/PHYSICAL_DATABASE_PLAN.md §2.9b):
--   - optional: at most one Dress Code per Project (project_id is the PK);
--   - description: optional plain text (no HTML), non-blank when present,
--     at most 1000 characters;
--   - swatches: zero, one or many per Dress Code, no fixed count; each is an
--     explicit canonical colour `#rrggbb` (lowercase hex only, so no CSS
--     keyword, function, url(), var() or gradient can ever be stored);
--   - staff-authoritative order: sort_order ASC, then id ASC;
--   - never inferred from theme/palette settings or CSS.
--
-- Purely additive: two new tables only. Nothing existing is touched. Access
-- mirrors project_media (0007) / project_timeline_items (0029): staff-only
-- RLS, no anon access, no service_role business path.
--
-- AUTHORING ONLY — not applied. Do not run `supabase db push` / migration
-- up / db reset / remote SQL / apply migration.

CREATE TABLE public.project_dress_codes (
  project_id   UUID PRIMARY KEY REFERENCES public.projects (id) ON DELETE CASCADE,
  description  TEXT CHECK (
                 description IS NULL
                 OR (btrim(description) <> '' AND char_length(description) <= 1000)
               ),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.project_dress_codes IS
  'Optional Dress Code of a Project (one row at most): plain-text description; swatches live in project_dress_code_swatches. See docs/PHYSICAL_DATABASE_PLAN.md §2.9b.';

CREATE TABLE public.project_dress_code_swatches (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES public.project_dress_codes (project_id) ON DELETE CASCADE,
  color        TEXT NOT NULL CHECK (color ~ '^#[0-9a-f]{6}$'),
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.project_dress_code_swatches IS
  'Ordered Dress Code colour swatches (sort_order, then id); belongs to the Project''s project_dress_codes row. See docs/PHYSICAL_DATABASE_PLAN.md §2.9b.';
COMMENT ON COLUMN public.project_dress_code_swatches.color IS
  'Canonical lowercase hex colour #rrggbb only. Never a CSS keyword, function, url(), var() or gradient.';

CREATE INDEX project_dress_code_swatches_project_sort_idx
  ON public.project_dress_code_swatches (project_id, sort_order, id);

-- ---------------------------------------------------------------------
-- Explicit Data API privileges (mirrors project_media, 0007)
-- ---------------------------------------------------------------------

REVOKE ALL ON TABLE public.project_dress_codes FROM PUBLIC;
REVOKE ALL ON TABLE public.project_dress_codes FROM anon;
REVOKE ALL ON TABLE public.project_dress_codes FROM authenticated;
REVOKE ALL ON TABLE public.project_dress_codes FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_dress_codes TO authenticated;

REVOKE ALL ON TABLE public.project_dress_code_swatches FROM PUBLIC;
REVOKE ALL ON TABLE public.project_dress_code_swatches FROM anon;
REVOKE ALL ON TABLE public.project_dress_code_swatches FROM authenticated;
REVOKE ALL ON TABLE public.project_dress_code_swatches FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_dress_code_swatches TO authenticated;

ALTER TABLE public.project_dress_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_dress_codes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.project_dress_code_swatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_dress_code_swatches FORCE ROW LEVEL SECURITY;

-- updated_at triggers — reuse the shared set_updated_at() function (0001).
CREATE TRIGGER project_dress_codes_set_updated_at
  BEFORE UPDATE ON public.project_dress_codes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER project_dress_code_swatches_set_updated_at
  BEFORE UPDATE ON public.project_dress_code_swatches
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- RLS policies — normal STAFF/ADMIN access only. No anon policy.
-- ---------------------------------------------------------------------

CREATE POLICY project_dress_codes_select_staff
  ON public.project_dress_codes FOR SELECT TO authenticated
  USING (public.is_staff());

CREATE POLICY project_dress_codes_insert_staff
  ON public.project_dress_codes FOR INSERT TO authenticated
  WITH CHECK (public.is_staff());

CREATE POLICY project_dress_codes_update_staff
  ON public.project_dress_codes FOR UPDATE TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

CREATE POLICY project_dress_codes_delete_staff
  ON public.project_dress_codes FOR DELETE TO authenticated
  USING (public.is_staff());

CREATE POLICY project_dress_code_swatches_select_staff
  ON public.project_dress_code_swatches FOR SELECT TO authenticated
  USING (public.is_staff());

CREATE POLICY project_dress_code_swatches_insert_staff
  ON public.project_dress_code_swatches FOR INSERT TO authenticated
  WITH CHECK (public.is_staff());

CREATE POLICY project_dress_code_swatches_update_staff
  ON public.project_dress_code_swatches FOR UPDATE TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

CREATE POLICY project_dress_code_swatches_delete_staff
  ON public.project_dress_code_swatches FOR DELETE TO authenticated
  USING (public.is_staff());
