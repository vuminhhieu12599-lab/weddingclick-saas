import { ApiError } from "../errors/api-error";
import { submitPublicRsvp, type SubmitPublicRsvpDependencies } from "../public-rsvp/submit-public-rsvp";

/**
 * Framework-agnostic handler for POST /api/v2/public/rsvp (Task 033A).
 * Mirrors lib/server/routes/customer-review.ts: no-store on every response,
 * fixed generic messages, never raw DB detail, and nothing about the request
 * (slug, name, message) is logged. 201 is returned only after the 0040 RPC
 * confirmed the persisted row.
 */
export interface PublicRsvpApiResult {
  status: 201 | 400 | 404 | 500;
  body: { data: { recorded: true } } | { error: string };
  headers: Record<string, string>;
}

const NO_STORE_HEADERS: Readonly<Record<string, string>> = { "Cache-Control": "no-store" };

function result(status: PublicRsvpApiResult["status"], body: PublicRsvpApiResult["body"]): PublicRsvpApiResult {
  return { status, body, headers: { ...NO_STORE_HEADERS } };
}

export async function handleSubmitPublicRsvpRequest(
  readBody: () => Promise<unknown>,
  deps: SubmitPublicRsvpDependencies,
): Promise<PublicRsvpApiResult> {
  let body: unknown;
  try {
    body = await readBody();
  } catch {
    return result(400, { error: "Invalid RSVP request" });
  }
  try {
    await submitPublicRsvp(body, deps);
    return result(201, { data: { recorded: true } });
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.kind === "BAD_REQUEST") return result(400, { error: "Invalid RSVP request" });
      if (error.kind === "NOT_FOUND") return result(404, { error: "Invitation not found" });
    }
    console.error("[handleSubmitPublicRsvpRequest] Unexpected error");
    return result(500, { error: "Internal server error" });
  }
}
