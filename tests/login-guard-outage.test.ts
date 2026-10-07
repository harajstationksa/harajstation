import { expect, it, vi } from "vitest";
vi.mock("@/lib/redis", () => ({
  redis: () => ({
    pttl: async () => {
      throw Error("Redis outage");
    },
    incr: async () => {
      throw Error("Redis outage");
    },
  }),
}));
import { ghostFailure, ghostLock } from "@/lib/login-guard";
it("Unknown account protections fail closed when shared Redis state is unavailable", async () => {
  expect((await ghostLock("unavailable"))?.getTime()).toBeGreaterThan(Date.now());
  expect((await ghostFailure("unavailable")).lockedUntil?.getTime()).toBeGreaterThan(Date.now());
});
