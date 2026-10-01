-- WeddingClick V2 — Feature Migration 0032 (RSVP completion batch)
-- rsvps.attendance gains MAYBE ("Sẽ cố gắng tham dự"); MAYBE takes the
-- ATTENDING party-size range. guest_display_name_snapshot is re-documented as
-- the typed response name.
--
-- FROZEN CONTRACT (docs/DECISIONS.md "RSVP completion (Product Owner
-- amendment, 2026-10-01)", docs/PHYSICAL_DATABASE_PLAN.md §2.20):
--   - attendance ∈ {ATTENDING, MAYBE, NOT_ATTENDING};
--   - party_size: ATTENDING 1–20, MAYBE 1–20, NOT_ATTENDING exactly 0;
--   - every NEW submission carries a typed response name (required, trimmed,
--     non-blank) stored in the existing guest_display_name_snapshot column.
--     It is display data only and NEVER guest identity, which comes solely
--     from guest_id (secure guest link). No new column is added.
--
-- Backward compatible: every existing row (ATTENDING / NOT_ATTENDING with its
-- party size; guest_display_name_snapshot as stored, including NULL on
-- personalized rows) satisfies the widened CHECKs and keeps its meaning. The
-- column stays nullable so old rows stay readable; the new requirement is
-- enforced at the submission/server boundary.
--
-- The 0018 inline attendance CHECK is auto-named rsvps_attendance_check
-- (<table>_<column>_check); both CHECKs are dropped by exact name without
-- IF EXISTS, so a mismatch fails loudly inside this migration's transaction.
--
-- AUTHORING ONLY — not applied. Do not run `supabase db push` / migration
-- up / db reset / remote SQL / apply migration.

ALTER TABLE public.rsvps
  DROP CONSTRAINT rsvps_attendance_check;

ALTER TABLE public.rsvps
  DROP CONSTRAINT rsvps_attendance_party_size_check;

ALTER TABLE public.rsvps
  ADD CONSTRAINT rsvps_attendance_check
    CHECK (attendance IN ('ATTENDING', 'MAYBE', 'NOT_ATTENDING'));

ALTER TABLE public.rsvps
  ADD CONSTRAINT rsvps_attendance_party_size_check
    CHECK (
      (attendance IN ('ATTENDING', 'MAYBE') AND party_size BETWEEN 1 AND 20)
      OR (attendance = 'NOT_ATTENDING' AND party_size = 0)
    );

COMMENT ON CONSTRAINT rsvps_attendance_party_size_check ON public.rsvps IS
  '[R12] + 0032 — ATTENDING and MAYBE require party_size BETWEEN 1 AND 20; NOT_ATTENDING requires party_size = 0. Both directions strict.';
COMMENT ON COLUMN public.rsvps.party_size IS
  '[R12] + 0032 — Combined with attendance via rsvps_attendance_party_size_check: ATTENDING / MAYBE require 1-20; NOT_ATTENDING requires exactly 0.';
COMMENT ON COLUMN public.rsvps.guest_display_name_snapshot IS
  '0032: the responder''s display name captured at submission — for every new RSVP (personalized or not) the typed response name (required, trimmed, non-blank; display data only, NEVER identity, which comes only from guest_id). Rows written before 0032 keep their stored value (personalized rows: a copy of guests.display_name, or NULL).';
