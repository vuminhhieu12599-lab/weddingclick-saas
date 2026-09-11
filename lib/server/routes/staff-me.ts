import { parseBearerToken } from "../auth/bearer-token";
import { StaffAuthError } from "../auth/staff-auth-error";
import { requireStaff, type StaffAuthGateway } from "../auth/staff-context";

/**
 * Pure, framework-agnostic handler backing GET /api/v2/internal/me
 * (Task 004 worked example).
 *
 * Kept separate from the Next.js Route Handler so it can be unit tested
 * with a fake StaffAuthGateway and no real HTTP/Supabase dependency — see
 * lib/server/routes/__tests__/staff-me.test.ts.
 */
export interface StaffMeSuccessBody {
  userId: string;
  role: string;
  displayName: string;
}

export interface StaffMeErrorBody {
  error: string;
}

export interface StaffMeResult {
  status: 200 | 401 | 403 | 500;
  body: StaffMeSuccessBody | StaffMeErrorBody;
}

export async function handleStaffMeRequest<TClient>(
  authorizationHeader: string | null,
  gateway: StaffAuthGateway<TClient>,
): Promise<StaffMeResult> {
  const token = parseBearerToken(authorizationHeader);

  if (!token) {
    return {
      status: 401,
      body: { error: "Missing or malformed Authorization header" },
    };
  }

  try {
    const staff = await requireStaff(token, gateway);

    return {
      status: 200,
      body: {
        userId: staff.userId,
        role: staff.role,
        displayName: staff.displayName,
      },
    };
  } catch (error) {
    if (error instanceof StaffAuthError) {
      if (error.kind === "UNAUTHENTICATED") {
        return { status: 401, body: { error: error.message } };
      }

      if (error.kind === "FORBIDDEN") {
        return { status: 403, body: { error: error.message } };
      }

      // kind === "INTERNAL": the HTTP mapping always returns the fixed
      // generic message, even though error.message is itself already safe
      // text — never surface internal operational detail on a 500.
      return { status: 500, body: { error: "Internal server error" } };
    }

    // Fixed, static log text only — never error.message or any other
    // property of the caught value, which could carry upstream
    // request/infrastructure detail from a dependency this handler doesn't
    // control.
    console.error("[handleStaffMeRequest] Unexpected error");
    return { status: 500, body: { error: "Internal server error" } };
  }
}
