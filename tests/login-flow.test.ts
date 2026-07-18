/**
 * Integration: the real login + OTP route handlers against the local dev DB.
 * Email is forced off by tests/setup.ts, so the 2FA mail branch is skipped
 * and codes are planted directly — no network, no mail.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashSync } from "bcryptjs";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { LOCK_AFTER, hashOtp } from "@/lib/login-guard";
import { POST as loginPost } from "@/app/api/auth/login/route";
import { POST as otpPost } from "@/app/api/auth/login/otp/route";

const EMAIL = `vitest-${Date.now()}@test.local`;
const PASSWORD = "Correct#Pass9";
let userId = "";

// unique IP per request so the per-IP guard never masks the per-account logic
let ipCounter = 1;
function login(identifier: string, password: string) {
  return loginPost(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-real-ip": `10.9.${Math.floor(ipCounter / 250)}.${ipCounter++ % 250}`,
      },
      body: JSON.stringify({ identifier, password }),
    })
  );
}

function verifyOtp(challenge: string, code: string) {
  return otpPost(
    new Request("http://localhost/api/auth/login/otp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-real-ip": `10.9.${Math.floor(ipCounter / 250)}.${ipCounter++ % 250}`,
      },
      body: JSON.stringify({ challenge, code }),
    })
  );
}

beforeAll(async () => {
  const u = await db.user.create({
    data: {
      name: "Vitest User",
      email: EMAIL,
      passwordHash: hashSync(PASSWORD, 10),
      city: "الرياض",
      emailVerifiedAt: new Date(),
    },
  });
  userId = u.id;
});

afterAll(async () => {
  await db.user.deleteMany({ where: { email: EMAIL } });
  await db.$disconnect();
});

describe("brute-force lockout", () => {
  it("escalates from generic error to teasing to a lock, then rejects even the right password", async () => {
    for (let n = 1; n < LOCK_AFTER; n++) {
      const res = await login(EMAIL, "totally-wrong");
      const data = await res.json();
      expect(res.status).toBe(401);
      expect(data.suggestReset).toBe(n >= 3);
    }

    const lockRes = await login(EMAIL, "totally-wrong");
    expect(lockRes.status).toBe(423);
    expect((await lockRes.json()).locked).toBe(true);

    // the whole point of the lock: the right password is refused too
    const rightWhileLocked = await login(EMAIL, PASSWORD);
    expect(rightWhileLocked.status).toBe(423);
  });

  it("unlocks after expiry and a successful login clears the counters", async () => {
    await db.user.update({
      where: { id: userId },
      data: { lockUntil: new Date(Date.now() - 1000) },
    });

    const res = await login(EMAIL, PASSWORD);
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("samel_session=");

    const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(u.failedLogins).toBe(0);
    expect(u.lockUntil).toBeNull();
  });

  it("answers identically for accounts that do not exist (no enumeration)", async () => {
    const ghost = `no-such-${Date.now()}@test.local`;
    let last = { suggestReset: false };
    for (let n = 1; n <= 3; n++) {
      const res = await login(ghost, "x");
      expect(res.status).toBe(401);
      last = await res.json();
    }
    expect(last.suggestReset).toBe(true); // same escalation as real accounts
  });
});

describe("email 2FA", () => {
  it("without SMTP configured the 2FA branch is skipped — password still logs in", async () => {
    await db.user.update({ where: { id: userId }, data: { twoFactorEmail: true } });
    const res = await login(EMAIL, PASSWORD);
    expect(res.status).toBe(200); // documented fallback: no mail server → no code gate
  });

  it("verifies a planted code once and only once, counting wrong attempts", async () => {
    const challenge = randomBytes(32).toString("hex");
    await db.loginOtp.create({
      data: {
        userId,
        challenge,
        codeHash: hashOtp("123456", challenge),
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    });

    const wrong = await verifyOtp(challenge, "000000");
    expect(wrong.status).toBe(401);
    expect((await wrong.json()).error).toContain("4"); // 4 attempts left

    const right = await verifyOtp(challenge, "123456");
    expect(right.status).toBe(200);
    expect(right.headers.get("set-cookie")).toContain("samel_session=");

    const replay = await verifyOtp(challenge, "123456");
    expect(replay.status).toBe(400);
    expect((await replay.json()).restart).toBe(true);
  });

  it("burns the challenge after too many wrong codes", async () => {
    const challenge = randomBytes(32).toString("hex");
    await db.loginOtp.create({
      data: {
        userId,
        challenge,
        codeHash: hashOtp("123456", challenge),
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    });

    for (let i = 0; i < 5; i++) await verifyOtp(challenge, "999999");
    // even the correct code is dead now
    const res = await verifyOtp(challenge, "123456");
    expect(res.status).toBe(400);
    expect((await res.json()).restart).toBe(true);
  });
});
