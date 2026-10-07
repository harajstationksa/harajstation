import { expect, it, vi } from "vitest";
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "admin.example.invalid" }),
}));
it("AD-07: admin metadata assets work while public and private routes keep their guards", async () => {
  vi.stubEnv("ADMIN_HOST", "admin.example.invalid");
  try {
    const { proxy } = await import("@/proxy");
    const { NextRequest } = await import("next/server");
    for (const path of ["/icon.png", "/manifest.webmanifest"]) {
      const response = await proxy(
        new NextRequest(`https://admin.example.invalid${path}`, {
          headers: { host: "admin.example.invalid" },
        }),
      );
      expect(response.status).toBe(200);
    }
    const publicPage = await proxy(
      new NextRequest("https://admin.example.invalid/listings/demo", {
        headers: { host: "admin.example.invalid" },
      }),
    );
    expect(publicPage.status).toBe(404);
    const adminOnPublic = await proxy(
      new NextRequest("https://public.example.invalid/admin", {
        headers: { host: "public.example.invalid" },
      }),
    );
    expect(adminOnPublic.status).toBe(404);
    const { default: manifest } = await import("@/app/manifest");
    const result = await manifest();
    expect(result.start_url).toBe("/admin");
    expect(result.shortcuts).toBeUndefined();
  } finally {
    vi.unstubAllEnvs();
  }
});
