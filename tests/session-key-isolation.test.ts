import { afterAll, expect, it, vi } from "vitest";
import { SignJWT, jwtVerify } from "jose";
const state = vi.hoisted(() => ({ cookies: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      state.cookies.has(name) ? { value: state.cookies.get(name)! } : undefined,
  }),
}));
import { db } from "@/lib/db";
import {
  getSession,
  getAdminSession,
  signSessionToken,
  signAdminToken,
  adminCookieOptions,
} from "@/lib/auth";
const id = "oct-session-" + Date.now();
afterAll(async () => {
  vi.unstubAllEnvs();
  await db.user.deleteMany({ where: { id } });
});
it("Independent session keys enforce issuer and audience across site/admin cookies", async () => {
  const site = "site-test-secret-independent-32-characters";
  const admin = "admin-test-secret-independent-32-characters";
  vi.stubEnv("AUTH_SECRET", site);
  vi.stubEnv("ADMIN_AUTH_SECRET", admin);
  await db.user.create({
    data: {
      id,
      name: "Session audit",
      email: id + "@example.invalid",
      passwordHash: "test",
      city: "الرياض",
      role: "ADMIN",
    },
  });
  const input = { sub: id, role: "ADMIN", name: "Session audit" };
  const siteToken = await signSessionToken(input),
    adminToken = await signAdminToken(input);
  const options = { issuer: "harajstation", algorithms: ["HS256"] };
  expect(
    (await jwtVerify(siteToken, new TextEncoder().encode(site), { ...options, audience: "site" }))
      .payload.iss,
  ).toBe("harajstation");
  await expect(
    jwtVerify(adminToken, new TextEncoder().encode(site), { ...options, audience: "admin" }),
  ).rejects.toThrow();
  state.cookies.set("samel_session", adminToken);
  state.cookies.set("samel_admin", siteToken);
  expect(await getSession()).toBeNull();
  expect(await getAdminSession()).toBeNull();
  state.cookies.set("samel_session", siteToken);
  state.cookies.set("samel_admin", adminToken);
  expect((await getSession())?.sub).toBe(id);
  expect((await getAdminSession())?.sub).toBe(id);
  const forgedIssuer = await new SignJWT({ ...input, ver: 0 })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("attacker")
    .setAudience("site")
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(site));
  state.cookies.set("samel_session", forgedIssuer);
  expect(await getSession()).toBeNull();
  expect(adminCookieOptions.sameSite).toBe("strict");
});
