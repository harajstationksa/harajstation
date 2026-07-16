import { headers } from "next/headers";
import { createHash } from "node:crypto";
import { db } from "./db";
import { getSession } from "./auth";
import { markDelivered } from "./chat";

export const ONLINE_WINDOW_MS = 5 * 60_000;

// One presence write per visitor per minute is plenty for a 5-minute online
// window — without this, every page view costs a database round trip, which
// under campaign traffic was one of the biggest write amplifiers.
const WRITE_THROTTLE_MS = 60_000;
const lastWrite = new Map<string, number>();

function shouldWrite(key: string): boolean {
  const now = Date.now();
  const prev = lastWrite.get(key) ?? 0;
  if (now - prev < WRITE_THROTTLE_MS) return false;
  if (lastWrite.size > 20_000) {
    // bound memory during traffic spikes: drop entries old enough to rewrite
    for (const [k, t] of lastWrite) {
      if (now - t >= WRITE_THROTTLE_MS) lastWrite.delete(k);
    }
  }
  lastWrite.set(key, now);
  return true;
}

/**
 * Refresh the current visitor's presence row (called from the site layout on
 * every page view, fire-and-forget). Logged-in visitors carry their name so
 * the admin "online now" panel can show who is browsing.
 */
export async function recordPresence(): Promise<void> {
  const [h, session] = await Promise.all([headers(), getSession()]);
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "local";
  const ua = (h.get("user-agent") ?? "").slice(0, 40);
  const key = createHash("sha256").update(`${ip}|${ua}`).digest("hex").slice(0, 32);

  if (!shouldWrite(key)) return;

  await db.presence.upsert({
    where: { key },
    create: {
      key,
      userId: session?.sub ?? null,
      userName: session?.name ?? null,
      lastSeenAt: new Date(),
    },
    update: {
      userId: session?.sub ?? null,
      userName: session?.name ?? null,
      lastSeenAt: new Date(),
    },
  });

  // The visitor is here, so anything waiting for them has reached their device:
  // this is what turns a sender's single tick into a double one. Runs on the
  // same fire-and-forget path as the heartbeat itself.
  if (session?.sub) {
    await markDelivered(session.sub);
  }

  // opportunistic cleanup: drop rows idle for over a day (keeps table tiny)
  if (Math.random() < 0.02) {
    await db.presence.deleteMany({
      where: { lastSeenAt: { lt: new Date(Date.now() - 86_400_000) } },
    });
  }
}

/** Visitors seen within the online window, logged-in users first. */
export async function onlineNow() {
  const since = new Date(Date.now() - ONLINE_WINDOW_MS);
  const rows = await db.presence.findMany({
    where: { lastSeenAt: { gte: since } },
    orderBy: { lastSeenAt: "desc" },
  });
  return {
    total: rows.length,
    members: rows.filter((r) => r.userId),
    guests: rows.filter((r) => !r.userId).length,
  };
}
