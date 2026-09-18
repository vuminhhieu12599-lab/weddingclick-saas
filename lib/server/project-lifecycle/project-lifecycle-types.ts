import type { PaymentStatus, ProjectStatus } from "../../domain";

/**
 * Project Lifecycle / Payment / Assignment domain shapes (Task 025 Phase 2).
 *
 * Reuses the canonical `ProjectStatus`/`PaymentStatus` unions
 * (lib/domain/project-status.ts, lib/domain/payment-status.ts) — no
 * duplicated 12-status union anywhere in this module. Mirrors the exact
 * `RETURNING`/`RETURNS TABLE` column sets of transition_project_status /
 * mark_project_paid / reassign_project_staff
 * (supabase/migrations/20260911041144_0024_project_lifecycle_payment_assignment.sql)
 * — no invented fields.
 */

export interface TransitionStatusInput {
  targetStatus: ProjectStatus;
  reason: string | null;
}

export interface TransitionStatusResult {
  id: string;
  status: ProjectStatus;
  completedAt: string | null;
  archivedAt: string | null;
  updatedAt: string;
}

export interface MarkPaidResult {
  id: string;
  status: ProjectStatus;
  paymentStatus: PaymentStatus;
  paidAt: string;
  updatedAt: string;
}

export interface ReassignStaffInput {
  assignedStaffId: string | null;
}

export interface ReassignStaffResult {
  id: string;
  assignedStaffId: string | null;
  updatedAt: string;
}
