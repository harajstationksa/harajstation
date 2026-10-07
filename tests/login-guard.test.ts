import { describe, expect, it } from "vitest";
import {
  FAIL_WINDOW_MS,
  LOCK_AFTER,
  LOCK_MINUTES,
  ghostFailure,
  ghostLock,
  hashOtp,
  lockNowError,
  lockedError,
  teaseFor,
} from "@/lib/login-guard";

describe("teaseFor", () => {
  it("stays generic for the first two failures", () => {
    for (const n of [1, 2]) {
      const v = teaseFor(n);
      expect(v.error).toBe("بيانات الدخول غير صحيحة");
      expect(v.suggestReset).toBe(false);
    }
  });

  it("escalates to playful messages with a reset suggestion from the third", () => {
    const seen = new Set<string>();
    for (let n = 3; n <= 7; n++) {
      const v = teaseFor(n);
      expect(v.suggestReset).toBe(true);
      expect(v.error).not.toBe("بيانات الدخول غير صحيحة");
      seen.add(v.error);
    }
    // each step has its own line — nothing repeats
    expect(seen.size).toBe(5);
  });

  it("falls back to the last tease for counts past the table", () => {
    expect(teaseFor(9).error).toBe(teaseFor(7).error);
  });
});

describe("lock messages", () => {
  it("counts remaining minutes, never below one", () => {
    expect(lockedError(new Date(Date.now() + 14.5 * 60_000))).toContain("15");
    expect(lockedError(new Date(Date.now() + 1_000))).toContain("1");
  });

  it("announces the lock duration when it engages", () => {
    expect(lockNowError()).toContain(String(LOCK_MINUTES));
  });
});

describe("ghost accounts (unknown identifiers)", () => {
  it("escalates exactly like real accounts and locks at the same threshold", async () => {
    const key = `ghost-${Date.now()}`;
    for (let n = 1; n < LOCK_AFTER; n++) {
      const v = await ghostFailure(key);
      expect(v.lockedUntil).toBeNull();
      expect(v.error).toBe(teaseFor(n).error);
    }
    const locked = await ghostFailure(key);
    expect(locked.lockedUntil).not.toBeNull();
    expect(await ghostLock(key)).not.toBeNull();
  });

  it("keeps unknown keys unlocked by default", async () => {
    expect(await ghostLock(`never-seen-${Date.now()}`)).toBeNull();
  });

  it("uses a sane failure window", () => {
    expect(FAIL_WINDOW_MS).toBeGreaterThanOrEqual(10 * 60_000);
  });
});

describe("hashOtp", () => {
  it("is deterministic and salted by the challenge", () => {
    expect(hashOtp("123456", "chal-a")).toBe(hashOtp("123456", "chal-a"));
    expect(hashOtp("123456", "chal-a")).not.toBe(hashOtp("123456", "chal-b"));
    expect(hashOtp("123456", "chal-a")).not.toBe(hashOtp("654321", "chal-a"));
  });
});
