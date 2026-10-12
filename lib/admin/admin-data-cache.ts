/**
 * LAUNCH-P0-03: browser-memory request sharing and short-lived read reuse for
 * the V2 Admin UI. Two independent mechanisms share one invalidation
 * "generation":
 *
 * 1. In-flight GET sharing (`shareInFlightGet`) — concurrent identical GETs
 *    (same access token + same path) share one network request. Not a cache:
 *    an entry lives only until its response settles.
 * 2. Query reuse (`loadAdminQuery`) — a `useAdminQuery` result stored under an
 *    explicit query key, partitioned by the signed-in Staff user, reused for
 *    at most `ttlMs`. Only call sites that opt in with a key are reused.
 *
 * Correctness rules:
 * - Any write (`beginAdminWrite`/`endAdminWrite`, called by the API client
 *   around every POST/PUT/PATCH/DELETE) clears both maps and bumps the
 *   generation, so a GET started after a write never joins a read that began
 *   before it, and a read that started before a write never stores its result.
 * - A different Staff user (or sign-out) clears everything
 *   (`setAdminDataScope`). Keys from different users never collide because
 *   every stored key is prefixed with the user id.
 * - Nothing here is authorization. Every request still carries the caller's
 *   own access token and is authorized server-side (requireStaff + RLS).
 * - Memory only: nothing is written to browser storage, and a page reload
 *   starts empty. Write responses (including one-time access-link tokens)
 *   are never stored.
 * - Each consumer receives its own deep copy, so one component mutating its
 *   data can never change what another component or a later reuse sees.
 */

/** How long a stored query result may be reused without a network request. */
export const ADMIN_QUERY_TTL_MS = 30_000;

let generation = 0;
let scope: string | null = null;
let writesInFlight = 0;

const inFlightGets = new Map<string, Promise<unknown>>();
const pendingQueries = new Map<string, { promise: Promise<unknown>; generation: number }>();
const storedQueries = new Map<string, { value: unknown; expiresAt: number }>();

function clearAll(): void {
  generation += 1;
  inFlightGets.clear();
  pendingQueries.clear();
  storedQueries.clear();
}

function copy<T>(value: T): T {
  return structuredClone(value);
}

/** Drops every shared or stored read. Used on any write, sign-out and user change. */
export function invalidateAdminData(): void {
  clearAll();
}

/**
 * The signed-in Staff user whose reads may be reused (Supabase Auth user id
 * from the local session — a partition key only, never an authorization
 * input). Changing it, including to null on sign-out, drops all reuse.
 */
export function setAdminDataScope(userId: string | null): void {
  if (userId === scope) {
    return;
  }
  scope = userId;
  clearAll();
}

export function getAdminDataScope(): string | null {
  return scope;
}

/** Called by the API client immediately before sending a write. */
export function beginAdminWrite(): void {
  writesInFlight += 1;
  clearAll();
}

/** Called by the API client once a write has settled (success or failure). */
export function endAdminWrite(): void {
  writesInFlight = Math.max(0, writesInFlight - 1);
  clearAll();
}

/**
 * Shares one in-flight GET between concurrent identical callers. `key` must
 * include the access token and the full path (query string included).
 */
export async function shareInFlightGet<T>(key: string, send: () => Promise<T>): Promise<T> {
  let shared = inFlightGets.get(key);
  if (!shared) {
    const started: Promise<unknown> = send().finally(() => {
      if (inFlightGets.get(key) === started) {
        inFlightGets.delete(key);
      }
    });
    shared = started;
    inFlightGets.set(key, shared);
  }
  return copy((await shared) as T);
}

function scopedKey(queryKey: string): string | null {
  return scope === null ? null : `${scope}\n${queryKey}`;
}

/**
 * A still-valid stored result for `queryKey` of the current user, as a fresh
 * copy, or `undefined`. Synchronous so a revisited screen can render it on
 * its very first paint.
 */
export function readAdminQuery<T>(queryKey: string, now: number = Date.now()): T | undefined {
  const key = scopedKey(queryKey);
  if (key === null) {
    return undefined;
  }
  const entry = storedQueries.get(key);
  if (!entry) {
    return undefined;
  }
  if (entry.expiresAt <= now) {
    storedQueries.delete(key);
    return undefined;
  }
  return copy(entry.value as T);
}

export interface LoadAdminQueryOptions {
  /** Skip any stored or pending result and always start a new request (explicit "Thử lại"/reload). */
  force?: boolean;
  ttlMs?: number;
  now?: () => number;
}

/**
 * Resolves `queryKey` for the current user: a still-valid stored result, else
 * a request already pending for the same key, else a new `fetcher()` call
 * whose result is stored only if no write or user change happened while it
 * was in flight. Without a signed-in scope it simply calls `fetcher()`.
 */
export async function loadAdminQuery<T>(
  queryKey: string,
  fetcher: () => Promise<T>,
  options: LoadAdminQueryOptions = {},
): Promise<T> {
  const now = options.now ?? Date.now;
  const key = scopedKey(queryKey);
  if (key === null) {
    return fetcher();
  }

  if (!options.force) {
    const stored = readAdminQuery<T>(queryKey, now());
    if (stored !== undefined) {
      return stored;
    }
    const pending = pendingQueries.get(key);
    if (pending && pending.generation === generation) {
      return copy((await pending.promise) as T);
    }
  }

  const ttlMs = options.ttlMs ?? ADMIN_QUERY_TTL_MS;
  const entry: { promise: Promise<unknown>; generation: number } = { promise: Promise.resolve(), generation };
  entry.promise = fetcher().then(
    (value) => {
      // Stored only if this is still the newest request for the key and no
      // write or user change happened while it was in flight.
      if (pendingQueries.get(key) === entry && entry.generation === generation && writesInFlight === 0) {
        storedQueries.set(key, { value: copy(value), expiresAt: now() + ttlMs });
      }
      if (pendingQueries.get(key) === entry) {
        pendingQueries.delete(key);
      }
      return value;
    },
    (error: unknown) => {
      if (pendingQueries.get(key) === entry) {
        pendingQueries.delete(key);
      }
      throw error;
    },
  );
  pendingQueries.set(key, entry);
  return copy((await entry.promise) as T);
}

/**
 * Starts loading `queryKey` so a screen about to mount finds the result
 * pending or stored. Never throws: a failure is reported by the screen's own
 * load (which joins this request while it is pending, or retries after).
 */
export function prefetchAdminQuery<T>(queryKey: string, fetcher: () => Promise<T>): void {
  if (scopedKey(queryKey) === null) {
    return;
  }
  loadAdminQuery(queryKey, fetcher).catch(() => undefined);
}

/** Test-only: resets all module state. */
export function resetAdminDataCacheForTests(): void {
  scope = null;
  writesInFlight = 0;
  clearAll();
}
