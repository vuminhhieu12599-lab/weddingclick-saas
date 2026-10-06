import { getActivityActorDisplayName } from "../../presentation/activity-actor-labels";
import type { StaffContext } from "../auth/staff-context";
import { ApiError } from "../errors/api-error";
import { isValidTimestamptz } from "../validation/timestamptz";
import { isValidUuid } from "../validation/uuid";
import type { ProjectActivityGateway } from "./project-activity-gateway";
import type { ActivityCursor, ProjectActivityPage } from "./project-activity-types";

/**
 * Staff Project Activity history (Task 034B): read-only, Project-scoped,
 * newest first, bounded pages with a keyset cursor. The cursor is only a
 * continuation position, never a credential — every page is still scoped
 * by the route Project under staff RLS.
 */
export const ACTIVITY_PAGE_SIZE = 30;

const CURSOR_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;

export function encodeActivityCursor(cursor: ActivityCursor): string {
  return Buffer.from(`${cursor.createdAt}|${cursor.id}`, "utf8").toString("base64url");
}

export function decodeActivityCursor(raw: string): ActivityCursor {
  const invalid = () => new ApiError("BAD_REQUEST", "cursor is invalid");
  if (!CURSOR_PATTERN.test(raw)) throw invalid();
  const parts = Buffer.from(raw, "base64url").toString("utf8").split("|");
  if (parts.length !== 2) throw invalid();
  const [createdAt, id] = parts;
  if (!isValidTimestamptz(createdAt) || !isValidUuid(id)) throw invalid();
  return { createdAt, id: id.toLowerCase() };
}

export async function listProjectActivity<TClient>(
  rawProjectId: string,
  rawCursor: string | null,
  staff: StaffContext<TClient>,
  gateway: ProjectActivityGateway<TClient>,
): Promise<ProjectActivityPage> {
  if (!isValidUuid(rawProjectId)) {
    throw new ApiError("BAD_REQUEST", "Project id must be a valid UUID");
  }
  const projectId = rawProjectId.toLowerCase();
  const before = rawCursor === null ? null : decodeActivityCursor(rawCursor);
  if (!(await gateway.projectExists(staff.supabase, projectId))) {
    throw new ApiError("NOT_FOUND", "Project not found");
  }

  // One extra row tells whether older history exists, without a count query.
  const rows = await gateway.listProjectActivity(staff.supabase, projectId, { before, limit: ACTIVITY_PAGE_SIZE + 1 });
  const page = rows.slice(0, ACTIVITY_PAGE_SIZE);
  const last = page[page.length - 1];
  return {
    items: page.map((row) => ({
      id: row.id,
      actionType: row.actionType,
      summary: row.summary,
      actorType: row.actorType,
      actorDisplayName: getActivityActorDisplayName(row.actorType, row.staffDisplayName),
      createdAt: row.createdAt,
    })),
    nextCursor: rows.length > ACTIVITY_PAGE_SIZE && last ? encodeActivityCursor(last) : null,
  };
}
