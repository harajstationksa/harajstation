#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require("@prisma/client");

const db = new PrismaClient();

async function scalar(sql) {
  const rows = await db.$queryRawUnsafe(sql);
  return Number(rows[0].n);
}

async function main() {
  const result = {
    duplicateReferralPayments: await scalar(
      'SELECT COUNT(*)::int AS n FROM (SELECT "paymentId" FROM "ReferralEarning" WHERE "paymentId" IS NOT NULL GROUP BY "paymentId" HAVING COUNT(*) > 1) x'
    ),
    duplicateActiveCampaigns: await scalar(
      'SELECT COUNT(*)::int AS n FROM (SELECT "listingId" FROM "Campaign" WHERE status = \'ACTIVE\' GROUP BY "listingId" HAVING COUNT(*) > 1) x'
    ),
    pendingInvoicePlaceholders: await scalar(
      'SELECT COUNT(*)::int AS n FROM "Payment" WHERE "invoiceId" = \'pending\''
    ),
    publicChatImages: await scalar(
      'SELECT COUNT(*)::int AS n FROM "Message" WHERE "imageUrl" IS NOT NULL AND "imageUrl" NOT LIKE \'private:%\''
    ),
    legacyChatBodies: await scalar(
      'SELECT COUNT(*)::int AS n FROM "Message" WHERE body LIKE \'enc:v1:%\''
    ),
  };
  console.log(JSON.stringify(result));
  if (result.duplicateReferralPayments || result.duplicateActiveCampaigns) {
    process.exitCode = 2;
  }
}

main().finally(() => db.$disconnect());
