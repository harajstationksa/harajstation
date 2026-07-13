/**
 * Promote an existing account to ADMIN (or SUPPORT).
 *
 *   EMAIL=you@example.com npx tsx --env-file=.env scripts/make-admin.ts
 *   EMAIL=you@example.com ROLE=SUPPORT npx tsx --env-file=.env scripts/make-admin.ts
 *
 * Register through the site first, then run this on the account you created.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const ROLES = ["ADMIN", "SUPPORT", "USER"];

async function main() {
  const email = process.env.EMAIL?.trim().toLowerCase();
  const role = (process.env.ROLE ?? "ADMIN").toUpperCase();

  if (!email) {
    console.error("usage: EMAIL=you@example.com npx tsx --env-file=.env scripts/make-admin.ts");
    process.exit(1);
  }
  if (!ROLES.includes(role)) {
    console.error(`ROLE must be one of: ${ROLES.join(", ")}`);
    process.exit(1);
  }

  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`no account with the email ${email} — register on the site first`);
    process.exit(1);
  }

  await db.user.update({ where: { email }, data: { role } });
  console.log(`${email} is now ${role}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
