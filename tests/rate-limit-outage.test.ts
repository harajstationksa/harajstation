import { expect, it, vi } from "vitest";
vi.mock("@/lib/redis", () => ({
  redis: () => ({
    eval: async () => {
      throw new Error("TEST_OUTAGE");
    },
  }),
}));
import { isRateLimited } from "@/lib/rate-limit";
it("Redis outage retains a conservative local limit", async () => {
  const key = `outage-${Date.now()}`;
  const results = await Promise.all(Array.from({ length: 10 }, () => isRateLimited(key, 6, 60000)));
  expect(results.filter((v) => !v)).toHaveLength(3);
});
