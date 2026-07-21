#!/usr/bin/env node
/**
 * One-shot, idempotent: makes admin@harajstation.com THE admin-portal account
 * and strips the ADMIN role from every other user (they become normal users —
 * the portal is the only place staff accounts mean anything now).
 *
 * The account is created passwordless (passwordEnabled=false): first portal
 * login happens with an emailed one-time code, then a password can be enabled
 * from the portal's account page.
 *
 * Run on the server:  cd /var/www/harajstation && node deploy/seed-admin.js
 */
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const { PrismaClient } = require(
  path.join(__dirname, "..", "node_modules", "@prisma/client")
);
const { hashSync } = require(
  path.join(__dirname, "..", "node_modules", "bcryptjs")
);

const ADMIN_EMAIL = "admin@harajstation.com";

const db = new PrismaClient();

(async () => {
  const existing = await db.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (existing) {
    if (existing.role !== "ADMIN") {
      await db.user.update({
        where: { id: existing.id },
        data: { role: "ADMIN" },
      });
      console.log(`↑ promoted existing ${ADMIN_EMAIL} to ADMIN`);
    } else {
      console.log(`= ${ADMIN_EMAIL} already ADMIN — nothing to do`);
    }
  } else {
    await db.user.create({
      data: {
        name: "إدارة حراج ستيشن",
        email: ADMIN_EMAIL,
        city: "الرياض",
        // unguessable placeholder — login is by emailed code until a password
        // is enabled from the portal's account page
        passwordHash: hashSync(randomBytes(32).toString("hex"), 12),
        passwordEnabled: false,
        emailVerifiedAt: new Date(),
        role: "ADMIN",
        credibility: 100,
        avatarColor: "#DB7759",
      },
    });
    console.log(`+ created ${ADMIN_EMAIL} (ADMIN, passwordless first login)`);
  }

  const demoted = await db.user.updateMany({
    where: { role: "ADMIN", email: { not: ADMIN_EMAIL } },
    data: { role: "USER" },
  });
  if (demoted.count > 0) {
    console.log(`- demoted ${demoted.count} other ADMIN account(s) to USER`);
  }

  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
