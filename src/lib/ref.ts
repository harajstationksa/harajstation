import type { Prisma } from "@prisma/client";
import { db } from "./db";

/** Atomic counter; pass the publishing transaction so the counter rolls back on failure. */
export async function generateListingRef(client: Prisma.TransactionClient = db): Promise<string> {
  await client.setting.upsert({
    where: { key: "LISTING_SEQ" },
    create: { key: "LISTING_SEQ", value: "100000" },
    update: {},
  });
  for (let attempt = 0; attempt < 20; attempt++) {
    const rows = await client.$queryRaw<Array<{ value: string }>>`
      UPDATE "Setting" SET value=(GREATEST(CASE WHEN value ~ '^[0-9]+$' THEN value::bigint ELSE 100000 END,100000)+1)::text
      WHERE key='LISTING_SEQ' RETURNING value`;
    const ref = `SM-${rows[0].value}`;
    if (!(await client.listing.findUnique({ where: { ref }, select: { id: true } }))) return ref;
  }
  throw new Error("LISTING_REFERENCE_EXHAUSTED");
}
