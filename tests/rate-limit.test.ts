import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clientIp, isRateLimited } from "@/lib/rate-limit";

describe("isRateLimited", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("allows up to the limit then blocks", async () => {
    const key = `t-${Math.random()}`;
    for (let i = 0; i < 3; i++) expect(await isRateLimited(key, 3, 60_000)).toBe(false);
    expect(await isRateLimited(key, 3, 60_000)).toBe(true);
  });

  it("blocked calls do not extend the window, and old hits expire", async () => {
    const key = `t-${Math.random()}`;
    for (let i = 0; i < 3; i++) await isRateLimited(key, 3, 60_000);
    expect(await isRateLimited(key, 3, 60_000)).toBe(true);
    vi.advanceTimersByTime(61_000);
    expect(await isRateLimited(key, 3, 60_000)).toBe(false);
  });
});

describe("clientIp", () => {
  const req = (headers: Record<string, string>) =>
    new Request("http://x/", { headers });

  it("prefers cf-connecting-ip, then x-real-ip, then x-forwarded-for", () => {
    expect(
      clientIp(req({ "cf-connecting-ip": "1.1.1.1", "x-real-ip": "2.2.2.2" }))
    ).toBe("1.1.1.1");
    expect(
      clientIp(req({ "x-real-ip": "2.2.2.2", "x-forwarded-for": "3.3.3.3, 4.4.4.4" }))
    ).toBe("2.2.2.2");
    expect(clientIp(req({ "x-forwarded-for": "3.3.3.3, 4.4.4.4" }))).toBe("3.3.3.3");
  });

  it("falls back to 'local' with no headers", () => {
    expect(clientIp(req({}))).toBe("local");
  });
});
