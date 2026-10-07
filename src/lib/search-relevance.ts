import { Prisma } from "@prisma/client";
import { db } from "./db";
import { buildListingWhere, str, type SP } from "./listing-query";
import { expandQuery } from "./search-smart";

// This whitelist compiles only the public browse filter, never arbitrary SQL identifiers.
const columns: Record<string, Record<string, string>> = {
  listing: {
    status: 'l."status"',
    searchText: 'l."searchText"',
    title: 'l."title"',
    price: 'l."price"',
    city: 'l."city"',
    condition: 'l."condition"',
    type: 'l."type"',
    isFeatured: 'l."isFeatured"',
    featuredUntil: 'l."featuredUntil"',
  },
  seller: { isBanned: 'u."isBanned"', idVerified: 'u."idVerified"' },
  store: { isVerified: 's."isVerified"' },
  category: { slug: 'c."slug"' },
  parent: { slug: 'p."slug"' },
  auction: { startPrice: 'a."startPrice"' },
};
function scalar(column: string, value: unknown): Prisma.Sql {
  const field = Prisma.raw(column);
  if (value === null) return Prisma.sql`${field} IS NULL`;
  if (typeof value !== "object" || value instanceof Date) return Prisma.sql`${field} = ${value}`;
  const filters = value as Record<string, unknown>;
  const result: Prisma.Sql[] = [];
  for (const [op, v] of Object.entries(filters)) {
    if (v === undefined || op === "mode") continue;
    if (op === "contains") {
      const pattern = "%" + String(v) + "%";
      result.push(
        filters.mode === "insensitive"
          ? Prisma.sql`${field} ILIKE ${pattern}`
          : Prisma.sql`${field} LIKE ${pattern}`,
      );
    } else if (op === "gte") result.push(Prisma.sql`${field} >= ${v}`);
    else if (op === "lte") result.push(Prisma.sql`${field} <= ${v}`);
    else if (op === "gt") result.push(Prisma.sql`${field} > ${v}`);
    else throw new Error("Unsupported browse scalar filter");
  }
  return result.length ? Prisma.sql`(${Prisma.join(result, " AND ")})` : Prisma.sql`TRUE`;
}
function compile(filter: Record<string, unknown>, scope = "listing"): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined) continue;
    if (key === "AND" || key === "OR") {
      const rows = Array.isArray(value) ? value : [value];
      parts.push(
        Prisma.sql`(${Prisma.join(
          rows.map((row) => compile(row as Record<string, unknown>, scope)),
          key === "AND" ? " AND " : " OR ",
        )})`,
      );
    } else if (columns[scope]?.[key]) parts.push(scalar(columns[scope][key], value));
    else if (["seller", "store", "category", "parent", "auction"].includes(key))
      parts.push(compile(value as Record<string, unknown>, key));
    else throw new Error("Unsupported browse relation filter");
  }
  return parts.length ? Prisma.sql`(${Prisma.join(parts, " AND ")})` : Prisma.sql`TRUE`;
}

/** Rank the full matching set in PostgreSQL, then fetch only one page of cards. */
export async function relevancePage(sp: SP, page: number, pageSize: number) {
  const groups = expandQuery(str(sp.q) ?? "");
  const title = Prisma.sql`trim(regexp_replace(translate(lower(regexp_replace(l."title", '[ً-ْٰـ]', '', 'g')), 'أإآٱىئؤة٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', 'ااااييوه01234567890123456789'), '\\s+', ' ', 'g'))`;
  const scores = groups.map(
    (group) =>
      Prisma.sql`CASE WHEN ${Prisma.join(
        group.map((term) => Prisma.sql`position(${term} in ${title}) > 0`),
        " OR ",
      )} THEN 5 ELSE 2 END`,
  );
  const score = Prisma.sql`${scores.length ? Prisma.join(scores, " + ") : Prisma.sql`0`} + CASE WHEN l."isPromoted" THEN 4 ELSE 0 END + CASE WHEN l."isFeatured" THEN 3 ELSE 0 END + greatest(0,2-extract(epoch FROM (CURRENT_TIMESTAMP-l."createdAt"))/302400.0)`;
  const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT l.id FROM "Listing" l JOIN "User" u ON u.id=l."sellerId"
    JOIN "Category" c ON c.id=l."categoryId" LEFT JOIN "Category" p ON p.id=c."parentId"
    LEFT JOIN "Store" s ON s.id=l."storeId" LEFT JOIN "Auction" a ON a."listingId"=l.id
    WHERE ${compile(buildListingWhere(sp) as Record<string, unknown>)}
    ORDER BY (${score}) DESC, l."createdAt" DESC, l.id DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
  `);
  return rows.map((row) => row.id);
}
