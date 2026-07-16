/**
 * In-process TTL cache for hot page data — same single-instance philosophy as
 * rate-limit.ts and the settings cache: no Redis needed until the app runs on
 * more than one server.
 *
 * Why not unstable_cache: it JSON-serializes values, so Prisma Date fields
 * come back as strings and break countdowns/formatting. This cache returns
 * values by reference, so query results survive intact.
 *
 * Semantics:
 *   • fresh hit  → returned instantly, no DB work
 *   • stale hit  → returned instantly, ONE refresh runs in the background
 *     (stale-while-revalidate; concurrent misses share the in-flight promise,
 *     so a traffic spike costs one query per key per TTL, not thousands)
 *   • cold miss  → callers await the single shared fetch
 *   • refresh error → stale value survives, error surfaces only on cold miss
 */

type Entry = {
  at: number; // when value was stored (0 = never resolved yet)
  value: unknown;
  inflight: Promise<unknown> | null;
};

const store = new Map<string, Entry>();

export async function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>
): Promise<T> {
  const entry = store.get(key);
  const now = Date.now();

  if (entry && entry.at > 0 && now - entry.at < ttlMs) {
    return entry.value as T;
  }

  if (entry?.inflight) {
    // a refresh is already running — serve stale if we have it, else share it
    return entry.at > 0 ? (entry.value as T) : (entry.inflight as Promise<T>);
  }

  const e: Entry = entry ?? { at: 0, value: undefined, inflight: null };
  e.inflight = fn().then(
    (v) => {
      e.at = Date.now();
      e.value = v;
      e.inflight = null;
      return v;
    },
    (err) => {
      e.inflight = null;
      throw err;
    }
  );
  store.set(key, e);

  if (e.at > 0) {
    // stale-while-revalidate: hand back the old value, swallow refresh errors
    (e.inflight as Promise<T>).catch(() => {});
    return e.value as T;
  }
  return e.inflight as Promise<T>;
}

/** Drop entries (all, or those whose key starts with `prefix`) — for admin writes. */
export function invalidatePageCache(prefix?: string) {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
