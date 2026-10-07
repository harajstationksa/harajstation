import { afterEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
const state = vi.hoisted(() => ({
  claims: {
    sub: "signed-google-sub",
    email: "TEST@example.invalid",
    email_verified: true,
    nonce: "expected-nonce",
    name: "Google user",
    picture: "https://lh3.googleusercontent.com/avatar",
  } as Record<string, unknown>,
  verify: vi.fn(),
}));
vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => ({ remote: true })),
  jwtVerify: async (...args: unknown[]) => {
    state.verify(...args);
    return { payload: state.claims };
  },
}));
import {
  consentUrl,
  fetchProfile,
  newVerifier,
  newState,
  oauthCookieOptions,
} from "@/lib/google-oauth";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  state.verify.mockClear();
});
it("Authorization binds PKCE S256 and nonce to random HttpOnly cookies", () => {
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client");
  const verifier = newVerifier(),
    nonce = newState();
  const url = new URL(consentUrl("state", verifier, nonce));
  expect(url.searchParams.get("code_challenge")).toBe(
    createHash("sha256").update(verifier).digest("base64url"),
  );
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(url.searchParams.get("nonce")).toBe(nonce);
  expect(verifier.length).toBeGreaterThanOrEqual(43);
  expect(nonce).toHaveLength(64);
  expect(oauthCookieOptions.httpOnly).toBe(true);
});
it("Token exchange sends verifier and verifies issuer/audience/algorithm/nonce", async () => {
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "not-real");
  const fetcher = vi.fn(async (...args: [string, RequestInit?]) => {
    expect(args[0]).toBe("https://oauth2.googleapis.com/token");
    return Response.json({ id_token: "signed-token" });
  });
  vi.stubGlobal("fetch", fetcher);
  const user = await fetchProfile("code", "pkce-verifier", "expected-nonce");
  expect(user?.email).toBe("test@example.invalid");
  const options = fetcher.mock.calls[0]?.[1] as unknown as RequestInit;
  expect(options.signal).toBeInstanceOf(AbortSignal);
  expect(String(options.body)).toContain("code_verifier=pkce-verifier");
  expect(state.verify.mock.calls[0]?.[2]).toMatchObject({
    audience: "test-client",
    algorithms: ["RS256"],
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    maxTokenAge: "10m",
  });
  expect(await fetchProfile("code", "verifier", "wrong-nonce")).toBeNull();
});
it("Untrusted avatar URLs and wrong authorized party are refused", async () => {
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client");
  vi.stubGlobal("fetch", async () => Response.json({ id_token: "signed" }));
  state.claims.picture = "https://attacker.invalid/avatar";
  expect((await fetchProfile("code", "v", "expected-nonce"))?.picture).toBeUndefined();
  state.claims.azp = "other-client";
  expect(await fetchProfile("code", "v", "expected-nonce")).toBeNull();
  delete state.claims.azp;
});
it("A failed or incomplete provider response fails closed", async () => {
  vi.stubGlobal("fetch", async () => {
    throw Error("timeout");
  });
  expect(await fetchProfile("code", "v", "expected-nonce")).toBeNull();
  vi.stubGlobal("fetch", async () => Response.json({ access_token: "not-an-id-token" }));
  expect(await fetchProfile("code", "v", "expected-nonce")).toBeNull();
});
