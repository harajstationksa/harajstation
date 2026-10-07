import { randomUUID } from "node:crypto";
import { db } from "./db";

/** Renewable, owner-scoped cross-worker lease; a crashed process expires automatically. */
export async function withOperationalLease<T>(
  key: string,
  run: (assertOwned: () => void) => Promise<T>,
): Promise<T | null> {
  const owner = randomUUID(),
    ttl = 180_000;
  const rows = await db.$queryRaw<Array<{ owner: string }>>`
    INSERT INTO "OperationalLease"(key,owner,"expiresAt") VALUES (${key},${owner},NOW() + INTERVAL '180 seconds')
    ON CONFLICT (key) DO UPDATE SET owner=EXCLUDED.owner,"expiresAt"=EXCLUDED."expiresAt"
    WHERE "OperationalLease"."expiresAt" <= NOW() RETURNING owner`;
  if (rows[0]?.owner !== owner) return null;
  let lost = false;
  let pending = Promise.resolve();
  const assertOwned = () => {
    if (lost) throw new Error("OPERATIONAL_LEASE_LOST");
  };
  const timer = setInterval(() => {
    pending = pending
      .then(async () => {
        const changed = await db.operationalLease.updateMany({
          where: { key, owner, expiresAt: { gt: new Date() } },
          data: { expiresAt: new Date(Date.now() + ttl) },
        });
        if (changed.count !== 1) lost = true;
      })
      .catch(() => {
        lost = true;
      });
  }, 30_000);
  timer.unref();
  try {
    const result = await run(assertOwned);
    assertOwned();
    return result;
  } finally {
    clearInterval(timer);
    await pending;
    await db.operationalLease.deleteMany({ where: { key, owner } });
  }
}
