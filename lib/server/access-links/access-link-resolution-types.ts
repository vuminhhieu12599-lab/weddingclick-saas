import type { AccessLinkType } from "../../domain";

/**
 * Token-resolution input/output shapes (Task 026 Phase 2, docs/DECISIONS.md
 * D4/D5). `rawToken` is transport-agnostic — the caller may have extracted
 * it from a header, query parameter, or path segment (D5); that choice is
 * outside this phase. `expectedProjectId` is optional: when omitted, project
 * binding is skipped (step F of the resolution order never rejects).
 */
export interface ResolveAccessLinkInput {
  rawToken: string;
  expectedLinkType: AccessLinkType;
  expectedProjectId?: string;
}

/**
 * Narrow validated context returned on success. Deliberately excludes
 * token_hash/token_hint/raw token, and excludes expiresAt/revokedAt (used
 * only internally during evaluation) — later tasks needing more must extend
 * this type explicitly, never widen it implicitly.
 */
export interface ResolvedAccessLinkContext {
  accessLinkId: string;
  projectId: string;
  linkType: AccessLinkType;
}
