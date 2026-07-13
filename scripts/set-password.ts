/**
 * Reset one account's password from the command line, so a real password never
 * has to be pasted anywhere it could be logged.
 *
 *   EMAIL=admin@samel.sa NEW_PASSWORD='...' npx tsx --env-file=.env scripts/set-password.ts
 *
 * Needed at least once before go-live: `prisma/seed.ts` creates demo accounts
 * with published passwords (admin@samel.sa / admin123), and the seeded database
 * is the same one production talks to.
 */
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const db = new PrismaClient();

async function main() {
  const email = process.env.EMAIL?.trim().toLowerCase();
  const password = process.env.NEW_PASSWORD;

  if (!email || !password) {
    console.error("usage: EMAIL=you@example.com NEW_PASSWORD='...' npx tsx --env-file=.env scripts/set-password.ts");
    process.exit(1);
  }
  if (password.length < 10) {
    console.error("refusing: use at least 10 characters for an admin account");
    process.exit(1);
  }

  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`no account with the email ${email}`);
    process.exit(1);
  }

  await db.user.update({
    where: { email },
    data: { passwordHash: await hash(password, 12) },
  });

  console.log(`password updated for ${email} (${user.role})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
