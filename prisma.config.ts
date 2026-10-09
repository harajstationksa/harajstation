import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

// Prisma's config-file loader intentionally skips dotenv; load the local
// development .env explicitly so CLI commands behave like they did before.
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  schema: "./prisma/schema.prisma",
  migrations: {
    path: "./prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
});
