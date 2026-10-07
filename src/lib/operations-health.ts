import { db } from "./db";
import { redis } from "./redis";
export async function operationsHealth() {
  const threshold = new Date(Date.now() - 5 * 60000);
  const [checks, failedJobs, oldest, ping] = await Promise.all([
    db.operationalCheck.findMany({ orderBy: { key: "asc" } }),
    db.backgroundJob.count({ where: { status: "FAILED" } }),
    db.backgroundJob.findFirst({
      where: { status: { in: ["PENDING", "RUNNING"] } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
    redis()
      ?.ping()
      .catch(() => "FAILED") ?? Promise.resolve("NOT_CONFIGURED"),
  ]);
  const required = [
    "auctions",
    "campaigns",
    "transactions",
    "proMemberships",
    "priceNudges",
    "featuredListings",
    "backgroundJobs",
  ];
  const staleJobs = required.filter(
    (key) =>
      !checks.some(
        (c) =>
          c.key === key &&
          c.lastSuccessAt &&
          c.lastSuccessAt > threshold &&
          (!c.lastFailureAt || c.lastSuccessAt > c.lastFailureAt),
      ),
  );
  const queueDelayed = !!oldest && oldest.createdAt.getTime() < Date.now() - 15 * 60000;
  const recentErrors = checks.some(
    (c) =>
      c.key === "serverRequests" &&
      c.lastFailureAt &&
      c.lastFailureAt > new Date(Date.now() - 15 * 60000),
  );
  const lastError = checks
    .filter((c) => c.key.startsWith("serverRoute:"))
    .sort((a, b) => (b.lastFailureAt?.getTime() ?? 0) - (a.lastFailureAt?.getTime() ?? 0))[0];
  return {
    ok: !recentErrors && !staleJobs.length && !failedJobs && !queueDelayed && ping === "PONG",
    recentErrors,
    staleJobs,
    failedJobs,
    queueDelayed,
    redis: ping === "PONG",
    checks,
    lastError: lastError
      ? {
          route: lastError.key.slice(12),
          at: lastError.lastFailureAt?.toISOString(),
        }
      : null,
  };
}

export function monitorFresh(checkedAt: string) {
  const age = Date.now() - new Date(checkedAt).getTime();
  return age >= 0 && age < 180000;
}
