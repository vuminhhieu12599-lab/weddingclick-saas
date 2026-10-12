"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchStaffMe, SESSION_TIMEOUT_MS } from "../../../../lib/admin/admin-api-client";
import { isUnauthorized } from "../../../../lib/admin/admin-api-error";
import { setAdminDataScope } from "../../../../lib/admin/admin-data-cache";
import { supabase } from "../../../../lib/supabase";
import type { StaffMeSuccessBody } from "../../../../lib/server/routes/staff-me";

export type StaffSessionState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "error"; message: string }
  /** A local session exists; `/me` is still confirming the active Staff profile. */
  | { status: "verifying" }
  | { status: "ready"; staff: StaffMeSuccessBody };

const SESSION_READ_FAILED = "Không đọc được phiên đăng nhập. Vui lòng thử lại.";

/**
 * Client-side staff auth guard for the V2 Admin shell.
 *
 * Mirrors the existing V1 admin page's pattern (browser Supabase Auth
 * session check -> redirect to /login) — there is no cookie/session-based
 * server auth helper in this repository yet, so the guard runs client-side
 * and every actual data read still goes through the trusted server boundary
 * (`requireStaff` inside each `/api/v2/internal/**` handler), which is the
 * real authorization enforcement point.
 *
 * LAUNCH-P0-03: once a local session exists the state is `verifying` and the
 * layout already mounts the page, so the page's own (independently
 * server-authorized) reads run in parallel with `/me` instead of after it.
 * `/me` still decides: 401 → `unauthenticated` (redirect to /login), any
 * other failure → `error` (page unmounted, "Thử lại" available).
 *
 * The session's user id partitions the Admin read reuse
 * (lib/admin/admin-data-cache.ts); sign-out or a different user — also from
 * another browser tab — clears it.
 */
export function useStaffSession(): StaffSessionState & { retry: () => void } {
  const [state, setState] = useState<StaffSessionState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((current) => current + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let verifiedUserId: string | null = null;

    async function load() {
      let userId: string | null;
      try {
        userId = await readSessionUserId();
      } catch {
        if (!cancelled) setState({ status: "error", message: SESSION_READ_FAILED });
        return;
      }
      if (cancelled) return;

      setAdminDataScope(userId);
      if (userId === null) {
        setState({ status: "unauthenticated" });
        return;
      }
      verifiedUserId = userId;
      setState({ status: "verifying" });

      try {
        const staff = await fetchStaffMe();
        if (!cancelled) {
          setState({ status: "ready", staff });
        }
      } catch (err) {
        if (cancelled) return;
        if (isUnauthorized(err)) {
          setAdminDataScope(null);
          setState({ status: "unauthenticated" });
          return;
        }
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Không xác định được nhân sự hiện tại",
        });
      }
    }

    void load();

    // Sign-out or a different user (Supabase broadcasts these across tabs):
    // drop reused reads immediately; a different user is re-verified.
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      const userId = session?.user.id ?? null;
      setAdminDataScope(userId);
      if (cancelled || verifiedUserId === null || userId === verifiedUserId) {
        return;
      }
      verifiedUserId = null;
      if (userId === null) {
        setState({ status: "unauthenticated" });
      } else {
        // Never call other Supabase methods inside this callback (auth-js lock).
        setTimeout(retry, 0);
      }
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [attempt, retry]);

  return { ...state, retry };
}

async function readSessionUserId(): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("session read timed out")), SESSION_TIMEOUT_MS);
  });
  try {
    const { data } = await Promise.race([supabase.auth.getSession(), timeout]);
    return data.session?.user.id ?? null;
  } finally {
    clearTimeout(timer);
  }
}
