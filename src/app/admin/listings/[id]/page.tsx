import { AdminPageHeader } from "@/components/AdminPageHeader";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { hasStaffPermission } from "@/lib/staff-permissions";
import { publicAsset, publicUrl } from "@/lib/admin";
import { formatSAR, parseImages } from "@/lib/utils";
import { AdminReviewForm } from "@/components/AdminReviewForm";
import { LISTING_STATUS } from "@/lib/constants";
import {
  RISK_LABELS,
  REASON_LABELS,
  REVIEW_GUIDANCE,
  REVIEW_REQUEST_TEMPLATES,
  classifyListing,
  parseReviewReasons,
  parseReviewSignals,
  type RiskLevel,
} from "@/lib/smart-review";

export const dynamic = "force-dynamic";

const RISK_STYLE: Record<RiskLevel, string> = {
  NORMAL: "bg-green-50 text-green-700",
  SENSITIVE: "bg-amber-50 text-amber-800",
  REGULATED: "bg-orange-50 text-orange-800",
  PROHIBITED: "bg-red-50 text-red-800",
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireStaff(["ADMIN", "MODERATOR", "SUPPORT"], "listings.view");
  const { id } = await params;
  const listing = await db.listing.findUnique({
    where: { id },
    include: {
      seller: { select: { id: true, name: true } },
      category: { include: { parent: true } },
      auction: true,
    },
  });
  if (!listing) notFound();
  const l = listing;
  const reasons = parseReviewReasons(l.riskReasons);
  const signals = parseReviewSignals(l.riskSignals);
  let attributes: Record<string, string> = {};
  try {
    attributes = JSON.parse(l.attributes);
  } catch {}
  const currentRisk = classifyListing({
    title: l.title,
    description: l.description,
    categorySlug: l.category.slug,
    categoryName: l.category.nameAr,
    parentSlug: l.category.parent?.slug,
    attributes,
  });
  const decisionRisk = currentRisk.level === "PROHIBITED" ? "PROHIBITED" : l.riskLevel;
  const [history, similar, reviewer] = await Promise.all([
    db.auditLog.findMany({
      where: { detail: { contains: `listing=${id}` } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    reasons.includes("DUPLICATE")
      ? db.listing.findMany({
          where: {
            id: { not: id },
            sellerId: l.sellerId,
            categoryId: l.categoryId,
            status: { in: ["ACTIVE", "PENDING", "AWAITING_INFO"] },
          },
          select: { id: true, ref: true, title: true, status: true },
          orderBy: { createdAt: "desc" },
          take: 5,
        })
      : Promise.resolve([]),
    l.reviewedBy
      ? db.user.findUnique({ where: { id: l.reviewedBy }, select: { name: true } })
      : Promise.resolve(null),
  ]);
  const suggestions = Object.entries(REVIEW_REQUEST_TEMPLATES)
    .filter(([key]) => key === "GENERAL" || reasons.some((reason) => reason === key))
    .map(([key, value]) => ({
      label: key === "GENERAL" ? "رسالة عامة" : REASON_LABELS[key as keyof typeof REASON_LABELS],
      text: value,
    }));
  const isExistingCandidate = l.status === "ACTIVE" && l.riskLevel !== "NORMAL" && !l.reviewedAt;
  const isPending = ["PENDING", "AWAITING_INFO"].includes(l.status);
  const canAct = hasStaffPermission(actor, "listings.manage");

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <AdminPageHeader section="listing">مراجعة الإعلان {l.ref ?? ""}</AdminPageHeader>
        <div className="flex gap-2">
          <Link href="/admin/listings" className="btn-secondary">
            كل الإعلانات
          </Link>
          {l.status === "ACTIVE" && (
            <a
              href={publicUrl(l.auction ? `/auctions/${l.auction.id}` : `/listings/${id}`)}
              className="btn-secondary"
              target="_blank"
              rel="noopener noreferrer"
            >
              عرض المنشور
            </a>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] gap-4 items-start">
        <div className="space-y-4">
          <div className="card p-5 space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <h2 className="font-bold text-lg">{l.title}</h2>
              <span className="badge bg-neutral-100 text-neutral-700">
                {LISTING_STATUS[l.status as keyof typeof LISTING_STATUS] ?? l.status}
              </span>
            </div>
            <div className="text-sm text-neutral-600 flex flex-wrap gap-x-5 gap-y-1">
              <span>البائع: {l.seller.name}</span>
              <span>
                القسم: {l.category.parent?.nameAr ? `${l.category.parent.nameAr} / ` : ""}
                {l.category.nameAr}
              </span>
              <span>المدينة: {l.city}</span>
              <span>
                السعر:{" "}
                {l.price != null
                  ? formatSAR(l.price)
                  : l.auction
                    ? formatSAR(l.auction.startPrice)
                    : "غير محدد"}
              </span>
            </div>
            {l.auction && (
              <p className="text-xs text-neutral-500">
                المزاد: {l.auction.status} · ينتهي: {l.auction.endsAt.toLocaleString("ar-SA")}
              </p>
            )}
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{l.description}</p>
            {Object.keys(attributes).length > 0 && (
              <div className="grid sm:grid-cols-2 gap-2 text-xs border-t pt-3">
                {Object.entries(attributes)
                  .slice(0, 20)
                  .map(([key, value]) => (
                    <p key={key}>
                      <span className="text-neutral-500">{key}:</span> {value}
                    </p>
                  ))}
              </div>
            )}
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {parseImages(l.images).map((src, index) => (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                key={index}
                src={publicAsset(src)}
                alt={`صورة الإعلان ${index + 1}`}
                className="w-full rounded-xl border border-neutral-100 object-cover"
              />
            ))}
          </div>
        </div>

        <aside className="card p-5 space-y-4 text-sm">
          <h2 className="font-bold">مؤشرات المراجعة</h2>
          <span className={`badge ${RISK_STYLE[l.riskLevel as RiskLevel] ?? RISK_STYLE.NORMAL}`}>
            {RISK_LABELS[l.riskLevel as RiskLevel] ?? l.riskLevel}
          </span>
          {currentRisk.level === "PROHIBITED" && l.riskLevel !== "PROHIBITED" && (
            <p className="text-xs text-red-700">
              الفحص الحالي وجد إشارة محظورة جديدة؛ قرار الإبقاء يحتاج مديرًا.
            </p>
          )}
          {reasons.length > 0 ? (
            <ul className="space-y-2">
              {reasons.map((reason) => (
                <li key={reason}>
                  <strong>{REASON_LABELS[reason]}</strong>
                  <p className="text-xs text-neutral-600 mt-0.5">{REVIEW_GUIDANCE[reason]}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-neutral-500">لا توجد إشارة خاصة محفوظة.</p>
          )}
          {signals.length > 0 && (
            <div className="border-t pt-3">
              <p className="font-semibold mb-1">المؤشرات</p>
              <div className="flex flex-wrap gap-1">
                {signals.map((signal) => (
                  <span key={signal} className="badge bg-neutral-100 text-neutral-600">
                    {signal}
                  </span>
                ))}
              </div>
            </div>
          )}
          {l.requestMessage && (
            <p className="rounded-lg bg-amber-50 p-3 text-amber-900">
              المطلوب من البائع: {l.requestMessage}
            </p>
          )}
          {l.reviewedAt && (
            <p className="text-xs text-neutral-500">
              آخر قرار: {l.reviewedAt.toLocaleString("ar-SA")} · {reviewer?.name ?? l.reviewedBy}
            </p>
          )}
        </aside>
      </div>

      {similar.length > 0 && (
        <section className="card p-4 space-y-2 text-sm">
          <h2 className="font-bold">إعلانات أخرى من نفس البائع والقسم</h2>
          {similar.map((item) => (
            <Link
              key={item.id}
              href={`/admin/listings/${item.id}`}
              className="block text-primary-700 hover:underline"
            >
              {item.ref ?? "—"} · {item.title} · {item.status}
            </Link>
          ))}
        </section>
      )}

      {canAct && isPending && (
        <section className="space-y-3">
          <h2 className="font-bold">قرار المراجعة</h2>
          <div className="grid md:grid-cols-3 gap-3">
            <AdminReviewForm
              mode="pending"
              decision="approve"
              listingId={id}
              riskLevel={decisionRisk}
              isAdmin={actor.role === "ADMIN"}
              disabled={l.status !== "PENDING"}
            />
            <AdminReviewForm
              mode="pending"
              decision="request_info"
              listingId={id}
              riskLevel={l.riskLevel}
              isAdmin={actor.role === "ADMIN"}
              suggestions={suggestions}
            />
            <AdminReviewForm
              mode="pending"
              decision="reject"
              listingId={id}
              riskLevel={l.riskLevel}
              isAdmin={actor.role === "ADMIN"}
            />
          </div>
        </section>
      )}

      {canAct && isExistingCandidate && (
        <section className="space-y-3">
          <h2 className="font-bold">إعلان منشور يحتاج مراجعة</h2>
          <p className="text-xs text-neutral-600">
            ظهوره الحالي لم يتغير تلقائيًا. اختر قرارًا بعد فحص الإعلان.
          </p>
          <div className="grid md:grid-cols-3 gap-3">
            <AdminReviewForm
              mode="existing"
              decision="mark_reviewed"
              listingId={id}
              riskLevel={decisionRisk}
              isAdmin={actor.role === "ADMIN"}
            />
            <AdminReviewForm
              mode="existing"
              decision="hold"
              listingId={id}
              riskLevel={l.riskLevel}
              isAdmin={actor.role === "ADMIN"}
            />
            <AdminReviewForm
              mode="existing"
              decision="reject"
              listingId={id}
              riskLevel={l.riskLevel}
              isAdmin={actor.role === "ADMIN"}
            />
          </div>
        </section>
      )}

      {history.length > 0 && (
        <section className="card p-4 text-xs space-y-2">
          <h2 className="font-bold text-sm">سجل القرارات</h2>
          {history.map((entry) => (
            <p key={entry.id} className="border-t pt-2 break-words">
              <strong>{entry.action}</strong> · {entry.createdAt.toLocaleString("ar-SA")} ·{" "}
              {entry.actorId}
              <br />
              <span className="text-neutral-600">{entry.detail}</span>
            </p>
          ))}
        </section>
      )}
    </div>
  );
}
