/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();
async function count(sql) {
  return Number((await db.$queryRawUnsafe(sql))[0].n);
}
async function run() {
  const data = {
    duplicateDirectConversations: await count(
      'SELECT COUNT(*)::int n FROM (SELECT LEAST("buyerId","sellerId"),GREATEST("buyerId","sellerId") FROM "Conversation" WHERE "listingId" IS NULL GROUP BY 1,2 HAVING COUNT(*)>1) d',
    ),
    orphanReviews: await count(
      'SELECT COUNT(*)::int n FROM "Review" r LEFT JOIN "Transaction" t ON t.id=r."transactionId" WHERE t.id IS NULL',
    ),
    legacyChatBodies: await count(
      "SELECT COUNT(*)::int n FROM \"Message\" WHERE body<>'' AND body NOT LIKE 'enc:v3:%'",
    ),
    publicChatImages: await count(
      'SELECT COUNT(*)::int n FROM "Message" WHERE "imageUrl" IS NOT NULL AND "imageUrl" NOT LIKE \'private:%\'',
    ),
    closedAuctionProxies: await count(
      'SELECT COUNT(*)::int n FROM "ProxyBid" p JOIN "Auction" a ON a.id=p."auctionId" WHERE a.status<>\'LIVE\'',
    ),
    invalidUserRoles: await count(
      "SELECT COUNT(*)::int n FROM \"User\" WHERE role NOT IN ('USER','ADMIN','MODERATOR','SUPPORT','ACCOUNTANT')",
    ),
    invalidListingStates: await count(
      "SELECT COUNT(*)::int n FROM \"Listing\" WHERE status NOT IN ('ACTIVE','SOLD','EXPIRED','REMOVED','PENDING')",
    ),
  };
  console.log(JSON.stringify(data));
  if (process.argv.includes("--assert") && Object.values(data).some(Boolean)) process.exitCode = 1;
}
run()
  .catch(() => {
    console.error("Audit data verification failed");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
