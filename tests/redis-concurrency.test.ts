import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { redis } from "@/lib/redis";
import { isRateLimited } from "@/lib/rate-limit";
it.skipIf(!process.env.TEST_REDIS_URL)(
  "Redis atomically enforces the limit across concurrent requests",
  async () => {
    process.env.REDIS_URL = process.env.TEST_REDIS_URL;
    const r = redis()!;
    if (r.status !== "ready")
      await new Promise<void>((resolve, reject) => {
        r.once("ready", resolve);
        r.once("error", reject);
      });
    const key = `audit-concurrency:${randomUUID()}`;
    try {
      const results = await Promise.all(
        Array.from({ length: 100 }, () => isRateLimited(key, 10, 60000)),
      );
      expect(results.filter((v) => !v)).toHaveLength(10);
    } finally {
      await r.del(`rl:${key}`);
      r.disconnect();
      delete process.env.REDIS_URL;
    }
  },
);
