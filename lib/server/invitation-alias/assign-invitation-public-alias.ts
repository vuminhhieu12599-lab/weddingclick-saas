import {
  deriveInvitationPublicAlias,
  invitationPublicAliasPath,
  isWellFormedInvitationPublicAlias,
  type PublicAliasVariant,
} from "../../domain";
import type { StaffContext } from "../auth/staff-context";
import { ApiError } from "../errors/api-error";
import { assertStoredReviewSnapshot } from "../invitation-review/assert-stored-review-snapshot";
import { isValidUuid } from "../validation/uuid";
import { InvitationAliasConflictError, InvitationAliasUnderivableError } from "./invitation-alias-rpc-error-codes";
import type {
  AssignInvitationAliasCommand,
  AssignedInvitationAlias,
  InvitationAliasGateway,
  PublishedSnapshotRecord,
} from "./invitation-alias-types";

export interface AssignInvitationAliasDependencies<TClient> {
  aliases: Pick<InvitationAliasGateway<TClient>, "assignAlias" | "getPublishedSnapshot">;
}

const COMMAND_KEYS: ReadonlySet<string> = new Set(["variant", "alias"]);

/**
 * Strict allow-list: `{ variant: "GROOM" | "BRIDE", alias?: string | null }`.
 * COMMON is rejected (unchanged by LAUNCH-P0-02). A supplied alias must
 * already be well-formed — it is never silently rewritten or suffixed.
 */
export function parseAssignInvitationAliasCommand(raw: unknown): AssignInvitationAliasCommand {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ApiError("BAD_REQUEST", "Request body must be a JSON object");
  }
  for (const key of Object.keys(raw)) {
    if (!COMMAND_KEYS.has(key)) {
      throw new ApiError("BAD_REQUEST", `Unexpected field: ${key}`);
    }
  }
  const { variant, alias } = raw as Record<string, unknown>;
  if (variant !== "GROOM" && variant !== "BRIDE") {
    throw new ApiError("BAD_REQUEST", "variant must be GROOM or BRIDE");
  }
  if (alias === undefined || alias === null) {
    return { variant, alias: null };
  }
  if (typeof alias !== "string" || !isWellFormedInvitationPublicAlias(alias)) {
    throw new ApiError("BAD_REQUEST", "alias must be two lowercase name slugs joined by &");
  }
  return { variant, alias };
}

/**
 * The default alias of a stored PUBLISHED Snapshot (never the mutable
 * draft): GROOM → groom&bride, BRIDE → bride&groom; `null` when the names
 * give no usable alias. The Snapshot passes the same integrity gate as
 * every persisted read (throws on a mismatch).
 */
export function deriveAliasFromPublishedSnapshot(variant: PublicAliasVariant, published: PublishedSnapshotRecord): string | null {
  const snapshot = assertStoredReviewSnapshot({
    variant,
    templateVersionId: published.templateVersionId,
    rendererKey: published.rendererKey,
    payload: published.payload,
  });
  return deriveInvitationPublicAlias(variant, { groomName: snapshot.people.groom.name, brideName: snapshot.people.bride.name });
}

async function deriveDefaultAlias<TClient>(
  client: TClient,
  projectId: string,
  variant: PublicAliasVariant,
  deps: AssignInvitationAliasDependencies<TClient>,
): Promise<string> {
  const published = await deps.aliases.getPublishedSnapshot(client, projectId, variant);
  if (published === null) {
    // The RPC re-checks this; answering here avoids deriving from nothing.
    throw new InvitationAliasConflictError("Invitation is not published", "NOT_PUBLISHED", "");
  }
  const alias = deriveAliasFromPublishedSnapshot(variant, published);
  if (alias === null) {
    throw new InvitationAliasUnderivableError();
  }
  return alias;
}

/**
 * LAUNCH-P0-02 — one-time friendly alias of a published SEPARATE
 * invitation. `assign_invitation_public_alias` (0049) is the authority:
 * staff-only, SEPARATE + GROOM/BRIDE, currently PUBLISHED, write-once,
 * globally unique. Conflicts are 409 with a stable reason; nothing is
 * overwritten and no suffix is added. Publication is never touched.
 */
export async function assignInvitationPublicAlias<TClient>(
  rawProjectId: string,
  rawBody: unknown,
  staff: StaffContext<TClient>,
  deps: AssignInvitationAliasDependencies<TClient>,
): Promise<AssignedInvitationAlias> {
  if (!isValidUuid(rawProjectId)) {
    throw new ApiError("BAD_REQUEST", "Project id must be a valid UUID");
  }
  const command = parseAssignInvitationAliasCommand(rawBody);
  const alias = command.alias ?? (await deriveDefaultAlias(staff.supabase, rawProjectId, command.variant, deps));

  const row = await deps.aliases.assignAlias(staff.supabase, { projectId: rawProjectId, variant: command.variant, alias });
  if (row.projectId !== rawProjectId || row.variant !== command.variant || row.alias !== alias) {
    throw new Error("Assigned alias does not match the request");
  }
  return { variant: command.variant, alias: row.alias, publicPath: invitationPublicAliasPath(row.alias) };
}
