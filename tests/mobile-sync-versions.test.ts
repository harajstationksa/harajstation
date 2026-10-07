import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ raw: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { $queryRaw: mocks.raw } }));
vi.mock("@/lib/page-cache", () => ({ invalidatePageCache: mocks.invalidate }));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

it("shares the committed public snapshot across connected phones", async () => {
  let resolve!: (value: unknown) => void;
  mocks.raw.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const { publicVersions } = await import("@/app/api/mobile/_lib/sync-versions");
  const first = publicVersions();
  const second = publicVersions();
  expect(mocks.raw).toHaveBeenCalledTimes(1);
  resolve([{ catalogue: "c1", market: "m1" }]);
  expect(await first).toEqual(await second);
  await publicVersions();
  expect(mocks.raw).toHaveBeenCalledTimes(1);
});

it("expires snapshots and clears website home caches when committed content changes", async () => {
  mocks.raw
    .mockResolvedValueOnce([{ catalogue: "c1", market: "m1" }])
    .mockResolvedValueOnce([{ catalogue: "c1", market: "m2" }]);
  const { publicVersions } = await import("@/app/api/mobile/_lib/sync-versions");
  await publicVersions();
  await vi.advanceTimersByTimeAsync(2001);
  expect((await publicVersions()).market).toBe("m2");
  expect(mocks.invalidate).toHaveBeenCalledTimes(2);
  expect(mocks.invalidate).toHaveBeenLastCalledWith("home:");
});

it("binds the same authenticated owner into every private query without SQL interpolation", async () => {
  mocks.raw.mockResolvedValue([{ version: "private-hash" }]);
  const { accountVersion } = await import("@/app/api/mobile/_lib/sync-versions");
  const actor = "actor' OR 1=1 --";
  expect(await accountVersion(actor)).toBe("private-hash");
  const [sql, ...boundValues] = mocks.raw.mock.calls[0];
  expect(sql.join("")).not.toContain(actor);
  expect(boundValues.length).toBeGreaterThan(10);
  expect(boundValues.every((value) => value === actor)).toBe(true);
});

it("retries a failed snapshot instead of caching its error", async () => {
  mocks.raw
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce([{ catalogue: "c1", market: "m1" }]);
  const { publicVersions } = await import("@/app/api/mobile/_lib/sync-versions");
  await expect(publicVersions()).rejects.toThrow("offline");
  expect(await publicVersions()).toEqual({ catalogue: "c1", market: "m1" });
});
