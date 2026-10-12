import { ApiError, type ApiErrorKind } from "../errors/api-error";
import type { InvitationAliasConflictReason } from "./invitation-alias-types";

/**
 * Stable business-error contract for `assign_invitation_public_alias`
 * (migration 0049), keyed by SQLSTATE — never by message text. PI001
 * (pointer integrity fault) and anything unknown stay a generic 500.
 */
export const INVITATION_ALIAS_RPC_ERROR_CODES: Readonly<
  Record<string, { kind: ApiErrorKind; message: string; reason?: InvitationAliasConflictReason }>
> = {
  PA001: { kind: "FORBIDDEN", message: "Active WeddingClick staff role required" },
  PA002: { kind: "BAD_REQUEST", message: "Alias is malformed" },
  PA003: { kind: "NOT_FOUND", message: "Project not found" },
  PA004: { kind: "INVARIANT", message: "Only SEPARATE GROOM/BRIDE invitations get a friendly link" },
  PA005: { kind: "NOT_FOUND", message: "Invitation not found" },
  PA006: { kind: "CONFLICT", message: "Invitation is not published", reason: "NOT_PUBLISHED" },
  PA007: { kind: "CONFLICT", message: "Invitation already has a friendly link", reason: "ALIAS_ALREADY_ASSIGNED" },
  PA008: { kind: "CONFLICT", message: "Alias is already used by another invitation", reason: "ALIAS_TAKEN" },
};

/** A 409 carrying its stable reason and the alias that was attempted. */
export class InvitationAliasConflictError extends ApiError {
  readonly reason: InvitationAliasConflictReason;
  readonly alias: string;

  constructor(message: string, reason: InvitationAliasConflictReason, alias: string) {
    super("CONFLICT", message);
    this.name = "InvitationAliasConflictError";
    this.reason = reason;
    this.alias = alias;
  }
}

/** 422 when no default alias can be derived; Staff must type one. */
export class InvitationAliasUnderivableError extends ApiError {
  readonly reason = "ALIAS_UNDERIVABLE" as const;

  constructor() {
    super("INVARIANT", "A friendly link cannot be derived from the published names; choose one manually");
    this.name = "InvitationAliasUnderivableError";
  }
}

export function mapInvitationAliasRpcError(code: string | undefined, alias: string): never {
  const known = code === undefined ? undefined : INVITATION_ALIAS_RPC_ERROR_CODES[code];
  if (known?.reason !== undefined) {
    throw new InvitationAliasConflictError(known.message, known.reason, alias);
  }
  if (known) {
    throw new ApiError(known.kind, known.message);
  }
  throw new Error("Failed to assign invitation alias");
}
