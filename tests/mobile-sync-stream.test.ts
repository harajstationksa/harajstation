import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: { id: "actor" } as { id: string } | null,
  public: vi.fn(),
  account: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => mocks.user }));
vi.mock("@/app/api/mobile/_lib/sync-versions", () => ({
  publicVersions: mocks.public,
  accountVersion: mocks.account,
}));
import { GET } from "@/app/api/mobile/sync/route";

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.user = { id: "actor" };
  mocks.public.mockResolvedValue({ catalogue: "c1", market: "m1" });
  mocks.account.mockResolvedValue("a1");
});
afterEach(() => vi.useRealTimers());

describe("mobile revision stream", () => {
  it("scopes personal revisions to the session and closes promptly on abort", async () => {
    const abort = new AbortController();
    const response = await GET(
      new Request("https://harajstation.com/api/mobile/sync?userId=victim", {
        signal: abort.signal,
      }),
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    const reader = response.body!.getReader();
    const frame = new TextDecoder().decode((await reader.read()).value);
    expect(frame).toContain('"market":"m1"');
    expect(frame).not.toContain("actor");
    expect(mocks.account).toHaveBeenCalledWith("actor");
    abort.abort();
    expect((await reader.read()).done).toBe(true);
    await vi.advanceTimersByTimeAsync(10000);
    expect(mocks.public).toHaveBeenCalledTimes(1);
  });

  it("guests receive only public hashes and never query private tables", async () => {
    mocks.user = null;
    const response = await GET(new Request("https://harajstation.com/api/mobile/sync"));
    const reader = response.body!.getReader();
    const frame = new TextDecoder().decode((await reader.read()).value);
    expect(frame).toContain('"account":"guest"');
    expect(mocks.account).not.toHaveBeenCalled();
    await reader.cancel();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("delivers changed revisions without creating parallel queries", async () => {
    const response = await GET(new Request("https://harajstation.com/api/mobile/sync"));
    const reader = response.body!.getReader();
    await reader.read();
    mocks.public.mockResolvedValue({ catalogue: "c2", market: "m2" });
    await vi.advanceTimersByTimeAsync(3000);
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('"market":"m2"');
    expect(mocks.public).toHaveBeenCalledTimes(2);
    await reader.cancel();
  });

  it("public scope never resolves the session or personal state", async () => {
    const response = await GET(
      new Request("https://harajstation.com/api/mobile/sync?scope=public"),
    );
    const reader = response.body!.getReader();
    const frame = new TextDecoder().decode((await reader.read()).value);
    expect(frame).toContain('"account":"guest"');
    expect(mocks.account).not.toHaveBeenCalled();
    await reader.cancel();
  });

  it("closes on a database failure without leaking its error", async () => {
    mocks.public.mockRejectedValue(new Error("secret database URL"));
    const response = await GET(new Request("https://harajstation.com/api/mobile/sync"));
    expect((await response.body!.getReader().read()).done).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
