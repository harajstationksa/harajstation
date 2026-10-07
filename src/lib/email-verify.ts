import { randomBytes } from "node:crypto";
import { db } from "./db";
import { emailConfigured, sendVerificationEmail } from "./email";
import { hashOneTimeToken } from "./tokens";

const TOKEN_TTL_HOURS = 48;

/**
 * Issue (or re-issue) an email-verification token and mail it.
 * No-op when email isn't configured or the address is already verified —
 * registration never blocks on this.
 */
export async function issueEmailVerification(userId: string, email: string) {
  if (!emailConfigured()) return false;
  // one active token per user
  await db.emailVerificationToken.deleteMany({
    where: { userId, usedAt: null },
  });
  const token = randomBytes(32).toString("hex");
  await db.emailVerificationToken.create({
    data: {
      userId,
      token: hashOneTimeToken(token),
      expiresAt: new Date(Date.now() + TOKEN_TTL_HOURS * 3_600_000),
    },
  });
  const sent = await sendVerificationEmail(email, `/verify-email/${token}`);
  if (!sent) {
    await db.emailVerificationToken.deleteMany({
      where: { userId, token: hashOneTimeToken(token) },
    });
  }
  return sent;
}
