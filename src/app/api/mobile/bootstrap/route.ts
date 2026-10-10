import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { CITIES, CONDITIONS, TRUST_LEVELS, AUCTION_DURATIONS } from "@/lib/constants";
import { CATEGORY_CONFIG, GOAL_RULES, GOAL_TYPE } from "@/lib/category-fields";
import { getCampaignDayOptions, getSettingInt } from "@/lib/settings";

/**
 * One call at app start: everything static-ish the mobile client needs to
 * render forms and filters without hardcoding the catalogue server-side.
 */
export async function GET() {
  const [categories, plans, packages, campaignDays, campaignRate, featureCost] = await Promise.all([
    db.category.findMany({
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        slug: true,
        nameAr: true,
        nameEn: true,
        icon: true,
        parentId: true,
      },
    }),
    db.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.pointPackage.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    getCampaignDayOptions(),
    getSettingInt("CAMPAIGN_POINTS_PER_DAY", 50),
    getSettingInt("FEATURE_POINT_COST", 100),
  ]);

  return NextResponse.json(
    {
      categories,
      categoryConfig: CATEGORY_CONFIG,
      goalRules: GOAL_RULES,
      goalType: GOAL_TYPE,
      cities: CITIES,
      conditions: CONDITIONS,
      trustLevels: TRUST_LEVELS,
      auctionDurations: AUCTION_DURATIONS,
      plans: plans.map((p) => ({
        key: p.key,
        name: p.name,
        price: p.price,
        period: p.period,
        features: JSON.parse(p.features || "[]") as string[],
        maxListings: p.maxListings,
        maxAuctions: p.maxAuctions,
        maxStores: p.maxStores,
        dailyPoints: p.dailyPoints,
        highlight: p.highlight,
      })),
      pointPackages: packages.map((p) => ({
        id: p.id,
        points: p.points,
        bonus: p.bonus,
        price: p.price,
      })),
      campaign: { dayOptions: campaignDays, pointsPerDay: campaignRate },
      featurePointCost: featureCost,
      app: appRelease(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Store release gate for the native app. MOBILE_MIN_VERSION blocks older
 * installs (API contract changed); MOBILE_LATEST_VERSION only suggests an
 * update. Versions are plain "1.2.3" strings.
 */
function appRelease() {
  const version = (raw: string | undefined) =>
    raw && /^\d+(\.\d+){0,2}$/.test(raw.trim()) ? raw.trim() : null;
  return {
    minVersion: version(process.env.MOBILE_MIN_VERSION),
    latestVersion: version(process.env.MOBILE_LATEST_VERSION),
    androidStoreUrl:
      process.env.MOBILE_ANDROID_STORE_URL ??
      "https://play.google.com/store/apps/details?id=com.harajstation.haraj_station",
    iosStoreUrl: process.env.MOBILE_IOS_STORE_URL ?? null,
  };
}
