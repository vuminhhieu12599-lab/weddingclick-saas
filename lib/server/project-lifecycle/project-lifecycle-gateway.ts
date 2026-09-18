import type {
  MarkPaidResult,
  ReassignStaffInput,
  ReassignStaffResult,
  TransitionStatusInput,
  TransitionStatusResult,
} from "./project-lifecycle-types";

/**
 * Narrow seam (Task 025 Phase 2, mirrors ProjectEventsGateway/
 * WeddingDetailsGateway) that decouples the three lifecycle use cases from
 * the real @supabase/supabase-js client shape.
 *
 * Every method maps directly onto exactly one of the three trusted RPCs
 * (transition_project_status / mark_project_paid / reassign_project_staff,
 * migration 0024) — there is deliberately no generic `projects.update()`,
 * no generic `rpc()` passthrough, no payment-status setter beyond
 * `markPaid`, and no status setter beyond the trusted `transitionStatus`
 * action. The DB RPCs remain the sole authority for the transition graph,
 * the payment precondition, and the assignee active-profile invariant —
 * this interface exposes business intent only, never a read-before-write
 * precheck.
 */
export interface ProjectLifecycleGateway<TClient> {
  transitionStatus(
    client: TClient,
    projectId: string,
    input: TransitionStatusInput,
  ): Promise<TransitionStatusResult>;
  markPaid(client: TClient, projectId: string): Promise<MarkPaidResult>;
  reassignStaff(
    client: TClient,
    projectId: string,
    input: ReassignStaffInput,
  ): Promise<ReassignStaffResult>;
}
