"use client";

import { useEffect, useState } from "react";

import { fetchStaffMe } from "../../../../lib/admin/admin-api-client";
import { supabase } from "../../../../lib/supabase";
import type { StaffMeSuccessBody } from "../../../../lib/server/routes/staff-me";

export type StaffSessionState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "error"; message: string }
  | { status: "ready"; staff: StaffMeSuccessBody };

/**
 * Client-side staff auth guard for the V2 Admin shell.
 *
 * Mirrors the existing V1 admin page's pattern (browser Supabase Auth
 * session check -> redirect to /login) — there is no cookie/session-based
 * server auth helper in this repository yet, so the guard runs client-side
 * and every actual data read still goes through the trusted server boundary
 * (`requireStaff` inside each `/api/v2/internal/**` handler), which is the
 * real authorization enforcement point.
 */
export function useStaffSession(): StaffSessionState {
  const [state, setState] = useState<StaffSessionState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;

      if (!data.session) {
        setState({ status: "unauthenticated" });
        return;
      }

      try {
        const staff = await fetchStaffMe();
        if (!cancelled) {
          setState({ status: "ready", staff });
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            status: "error",
            message: err instanceof Error ? err.message : "Không xác định được nhân sự hiện tại",
          });
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
