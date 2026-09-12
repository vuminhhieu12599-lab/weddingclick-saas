/**
 * Error raised by the V2 Admin UI's API client when a call to the trusted
 * V2 internal API boundary (`/api/v2/internal/**`) fails. Carries only the
 * HTTP status and the server's own safe error message — server route
 * handlers never return raw Supabase/Postgres detail (docs/SECURITY.md), so
 * this message is always safe to render directly to staff.
 */
export class AdminApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
  }
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof AdminApiError && error.status === 401;
}
