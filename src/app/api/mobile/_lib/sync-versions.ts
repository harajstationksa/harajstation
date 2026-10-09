import { db } from "@/lib/db";
import { invalidatePageCache } from "@/lib/page-cache";

type PublicVersions = { catalogue: string; market: string };

/** One shared public snapshot per worker at most every 15s — the query
 * fingerprints whole tables, so its cost grows with the catalogue and must
 * never scale with the number of connected viewers. */
export const PUBLIC_SNAPSHOT_TTL_MS = 15_000;
/** Personal fingerprints are shared by every open tab/device of one account. */
export const ACCOUNT_SNAPSHOT_TTL_MS = 15_000;
const ACCOUNT_CACHE_MAX = 5_000;
const accountSnapshots = new Map<string, { value: string; expires: number }>();
const accountInFlight = new Map<string, Promise<string>>();

let publicSnapshot: { value: PublicVersions; expires: number } | undefined;
let inFlight: Promise<PublicVersions> | undefined;

/** Shared per worker, so connected phones do not each scan the public tables.
 * Changes to view counters cannot cause a fetch/update feedback loop. Only
 * hashes leave this module; no database rows or private IDs enter SSE frames.
 * Reads observe committed database state, including admin/direct SQL edits.
 */
export async function publicVersions(): Promise<PublicVersions> {
  if (publicSnapshot && publicSnapshot.expires > Date.now()) return publicSnapshot.value;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const rows = await db.$queryRaw<PublicVersions[]>`
      SELECT
        md5(concat(
          (SELECT string_agg(to_jsonb(c)::text, '' ORDER BY c.id) FROM "Category" c),
          (SELECT string_agg(to_jsonb(p)::text, '' ORDER BY p.id) FROM "Plan" p WHERE p."isActive"),
          (SELECT string_agg(to_jsonb(p)::text, '' ORDER BY p.id) FROM "PointPackage" p WHERE p."isActive"),
          (SELECT string_agg(s.key || s.value, '' ORDER BY s.key) FROM "Setting" s
            WHERE s.key IN ('CAMPAIGN_DAY_OPTIONS','CAMPAIGN_POINTS_PER_DAY','FEATURE_POINT_COST','HOME_STATS_VISIBLE','TOPUP_ENABLED','TOPUP_DISABLED_MESSAGE'))
        )) AS catalogue,
        md5(concat(
          (SELECT string_agg((to_jsonb(l) - 'views' - 'updatedAt' - 'searchText')::text ||
              jsonb_build_array(l."featuredUntil" IS NULL OR l."featuredUntil" > CURRENT_TIMESTAMP,
                l."promotedUntil" IS NULL OR l."promotedUntil" > CURRENT_TIMESTAMP)::text, '' ORDER BY l.id)
            FROM "Listing" l JOIN "User" u ON u.id = l."sellerId"
            WHERE l.status = 'ACTIVE' AND NOT u."isBanned"),
          (SELECT string_agg((to_jsonb(b) - 'clicks')::text, '' ORDER BY b.id) FROM "Banner" b WHERE b.status = 'ACTIVE'
            AND (b."startsAt" IS NULL OR b."startsAt" <= CURRENT_TIMESTAMP)
            AND (b."endsAt" IS NULL OR b."endsAt" >= CURRENT_TIMESTAMP)),
          (SELECT string_agg(to_jsonb(a)::text || (a."endsAt" > CURRENT_TIMESTAMP)::text, '' ORDER BY a.id) FROM "Auction" a),
          (SELECT count(*)::text || coalesce(sum(b.amount),0)::text || coalesce(max(b."createdAt")::text,'') FROM "Bid" b),
          (SELECT string_agg((to_jsonb(s) - 'updatedAt')::text, '' ORDER BY s.id) FROM "Store" s),
          (SELECT string_agg(f."sellerId" || f.total::text, '' ORDER BY f."sellerId")
            FROM (SELECT "sellerId",count(*) AS total FROM "Follow" GROUP BY "sellerId") f),
          (SELECT string_agg(f."storeId" || f.total::text, '' ORDER BY f."storeId")
            FROM (SELECT "storeId",count(*) AS total FROM "StoreFollow" GROUP BY "storeId") f),
          (SELECT string_agg(c.id || c.body, '' ORDER BY c.id) FROM "Comment" c WHERE NOT c."isHidden"),
          (SELECT string_agg(jsonb_build_array(u.id,u.name,u."avatarUrl",u."avatarColor",u.city,u."credibility",u."idVerified",u."isPro",u."isBanned")::text, '' ORDER BY u.id) FROM "User" u),
          (SELECT string_agg(jsonb_build_array(c.id,c.status,c."endsAt",c."targetCity",c."endsAt" > CURRENT_TIMESTAMP)::text, '' ORDER BY c.id) FROM "Campaign" c)
        )) AS market
    `;
    const value = rows[0];
    if (!value) throw new Error("Missing sync snapshot");
    if (
      !publicSnapshot ||
      publicSnapshot.value.market !== value.market ||
      publicSnapshot.value.catalogue !== value.catalogue
    ) {
      invalidatePageCache("home:");
    }
    publicSnapshot = { value, expires: Date.now() + PUBLIC_SNAPSHOT_TTL_MS };
    return value;
  })();
  try {
    return await inFlight;
  } finally {
    inFlight = undefined;
  }
}

/** Every personal row is scoped to the authenticated user, never a query ID.
 * One database round trip covers read receipts, offers, balance, follows,
 * campaigns and sale verification. Message bodies/credentials are excluded.
 */
export async function accountVersion(userId: string): Promise<string> {
  const now = Date.now();
  const hit = accountSnapshots.get(userId);
  if (hit && hit.expires > now) return hit.value;
  const pending = accountInFlight.get(userId);
  if (pending) return pending;
  const run = queryAccountVersion(userId).then((value) => {
    if (accountSnapshots.size >= ACCOUNT_CACHE_MAX) {
      for (const [key, entry] of accountSnapshots) {
        if (entry.expires <= Date.now()) accountSnapshots.delete(key);
      }
      if (accountSnapshots.size >= ACCOUNT_CACHE_MAX) accountSnapshots.clear();
    }
    accountSnapshots.set(userId, { value, expires: Date.now() + ACCOUNT_SNAPSHOT_TTL_MS });
    return value;
  });
  accountInFlight.set(userId, run);
  try {
    return await run;
  } finally {
    accountInFlight.delete(userId);
  }
}

async function queryAccountVersion(userId: string): Promise<string> {
  const rows = await db.$queryRaw<Array<{ version: string }>>`
    SELECT md5(concat(
      (SELECT (to_jsonb(u) - 'passwordHash' - 'googleSub' - 'failedLogins' - 'lastFailedAt' - 'lockUntil')::text FROM "User" u WHERE u.id = ${userId}),
      (SELECT string_agg(jsonb_build_array(n.id,n."readAt")::text, '' ORDER BY n.id) FROM "Notification" n WHERE n."userId" = ${userId}),
      (SELECT string_agg(jsonb_build_array(m.id,m."readAt",m."deliveredAt")::text, '' ORDER BY m.id)
        FROM "Message" m JOIN "Conversation" c ON c.id = m."conversationId"
        WHERE c."buyerId" = ${userId} OR c."sellerId" = ${userId}),
      (SELECT string_agg(jsonb_build_array(o.id,o.status,o.amount,o."counterAmount",o."decidedAt")::text, '' ORDER BY o.id)
        FROM "Offer" o JOIN "Listing" l ON l.id = o."listingId"
        WHERE o."buyerId" = ${userId} OR l."sellerId" = ${userId}),
      (SELECT string_agg(f."listingId", '' ORDER BY f."listingId") FROM "Favorite" f WHERE f."userId" = ${userId}),
      (SELECT string_agg(jsonb_build_array(f.id,f."sellerId")::text, '' ORDER BY f.id) FROM "Follow" f WHERE f."followerId" = ${userId}),
      (SELECT string_agg(jsonb_build_array(f.id,f."storeId")::text, '' ORDER BY f.id) FROM "StoreFollow" f WHERE f."userId" = ${userId}),
      (SELECT string_agg(to_jsonb(t)::text, '' ORDER BY t.id) FROM "PointTransaction" t WHERE t."userId" = ${userId}),
      (SELECT string_agg(to_jsonb(t)::text, '' ORDER BY t.id) FROM "Transaction" t WHERE t."buyerId" = ${userId} OR t."sellerId" = ${userId}),
      (SELECT string_agg((to_jsonb(l) - 'views' - 'updatedAt' - 'searchText')::text, '' ORDER BY l.id) FROM "Listing" l WHERE l."sellerId" = ${userId}),
      (SELECT string_agg(to_jsonb(c)::text, '' ORDER BY c.id) FROM "Campaign" c WHERE c."ownerId" = ${userId}),
      (SELECT string_agg(to_jsonb(s)::text, '' ORDER BY s.id) FROM "SavedSearch" s WHERE s."userId" = ${userId}),
      (SELECT string_agg(jsonb_build_array(v.id,v.status)::text, '' ORDER BY v.id) FROM "IdentityVerification" v WHERE v."userId" = ${userId})
    )) AS version
  `;
  return rows[0]?.version ?? "guest";
}
