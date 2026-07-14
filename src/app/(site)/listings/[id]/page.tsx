import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, Eye, FileText, MapPin, Star } from "lucide-react";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { cardInclude } from "@/lib/types";
import { getT } from "@/lib/i18n";
import { configForMain } from "@/lib/category-fields";
import { recordListingView } from "@/lib/views";
import { breadcrumbLd, pageMeta, productLd } from "@/lib/seo";
import { formatSAR, parseImages, timeAgo } from "@/lib/utils";
import { AuctionCard } from "@/components/AuctionCard";
import { ChatButton } from "@/components/ChatButton";
import { JsonLd } from "@/components/JsonLd";
import { Comments } from "@/components/Comments";
import { FavoriteButton } from "@/components/FavoriteButton";
import { Gallery } from "@/components/Gallery";
import { ListingCard } from "@/components/ListingCard";
import { ReportButton } from "@/components/ReportButton";
import { SaveSearchButton } from "@/components/SaveSearchButton";
import { SectionHeader } from "@/components/SectionHeader";
import { SellerCard } from "@/components/SellerCard";
import { SharePanel } from "@/components/SharePanel";
import { SpecList } from "@/components/SpecList";

export const dynamic = "force-dynamic";

/** OG/Twitter cards so shared listing links unfurl with image + price. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const listing = await db.listing.findUnique({
    where: { id },
    select: { title: true, description: true, images: true, price: true, city: true, status: true },
  });
  if (!listing) return {};
  const images = parseImages(listing.images);
  const desc =
    `${listing.price != null ? `${formatSAR(listing.price)} · ` : ""}${listing.city} — ` +
    listing.description.slice(0, 160);
  return pageMeta({
    title: listing.title,
    description: desc,
    path: `/listings/${id}`,
    images: images.slice(0, 1),
  });
}

export default async function ListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ spc?: string }>;
}) {
  const { lang, t } = await getT();
  const { id } = await params;
  const { spc } = await searchParams;
  const [session, listing] = await Promise.all([
    getSession(),
    db.listing.findUnique({
      where: { id },
      include: { seller: true, category: { include: { parent: true } }, auction: true },
    }),
  ]);
  if (!listing) notFound();

  // auction listings live on their own page
  if (listing.type === "AUCTION" && listing.auction) {
    redirect(`/auctions/${listing.auction.id}${spc ? `?spc=${spc}` : ""}`);
  }

  // arrived through a sponsored placement → credit the campaign's click counter
  if (spc) {
    await db.campaign.updateMany({
      where: { id: spc, listingId: id, status: "ACTIVE" },
      data: { clicks: { increment: 1 } },
    });
  }

  // dedup by visitor — reloads from the same IP don't inflate the count
  recordListingView(id).catch(() => {});

  const [fav, similar] = await Promise.all([
    session
      ? db.favorite.findUnique({
          where: { userId_listingId: { userId: session.sub, listingId: id } },
        })
      : null,
    db.listing.findMany({
      where: {
        status: "ACTIVE",
        categoryId: listing.categoryId,
        id: { not: id },
      },
      include: cardInclude,
      take: 4,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const cat = listing.category;

  // Product schema so Google can show price/condition/availability in results.
  // Availability follows the real status — claiming InStock for something
  // already sold is the kind of mismatch that gets rich results revoked.
  // stored as a JSON string; the brand (when the category has one) is worth
  // handing to Google as a real Brand rather than burying it in the description
  const attrs: Record<string, string> = (() => {
    try {
      const p = JSON.parse(listing.attributes);
      return p && typeof p === "object" ? p : {};
    } catch {
      return {};
    }
  })();
  const jsonLd = [
    productLd({
      id: listing.id,
      ref: listing.ref,
      title: listing.title,
      description: listing.description,
      images: parseImages(listing.images),
      price: listing.price,
      condition: listing.condition,
      status: listing.status,
      city: listing.city,
      sellerName: listing.seller.name,
      brand: attrs.brand ?? null,
      path: `/listings/${listing.id}`,
    }),
    breadcrumbLd([
      { name: "الرئيسية", path: "/" },
      { name: "الفئات", path: "/categories" },
      ...(cat.parent
        ? [{ name: cat.parent.nameAr, path: `/category/${cat.parent.slug}` }]
        : []),
      { name: cat.nameAr, path: `/category/${cat.slug}` },
      { name: listing.title, path: `/listings/${listing.id}` },
    ]),
  ];

  return (
    <div className="container-page py-6 pb-12">
      <JsonLd data={jsonLd} />
      {/* breadcrumb */}
      <nav className="flex items-center gap-1 text-sm text-neutral-500 mb-4 flex-wrap">
        <Link href="/" className="hover:text-primary-600">{t.categoryPage.home}</Link>
        <ChevronLeft className="size-3.5 ltr:rotate-180" />
        {cat.parent && (
          <>
            <Link href={`/category/${cat.parent.slug}`} className="hover:text-primary-600">
              {lang === "en" ? cat.parent.nameEn : cat.parent.nameAr}
            </Link>
            <ChevronLeft className="size-3.5 ltr:rotate-180" />
          </>
        )}
        <Link href={`/category/${cat.slug}`} className="hover:text-primary-600">
          {lang === "en" ? cat.nameEn : cat.nameAr}
        </Link>
        <ChevronLeft className="size-3.5 ltr:rotate-180" />
        <span className="text-neutral-800 line-clamp-1">{listing.title}</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        <div className="lg:col-span-3 space-y-6">
          <Gallery images={parseImages(listing.images)} title={listing.title} />

          <div className="max-lg:hidden">
            <SpecList attributes={listing.attributes} mainSlug={cat.parent?.slug ?? cat.slug} />
          </div>

          <div className="card p-5 space-y-3 max-lg:hidden">
            <h2 className="font-bold flex items-center gap-2">
              <FileText className="size-5 text-primary-500" />
              {t.detail.description}
            </h2>
            <p className="text-neutral-700 leading-relaxed whitespace-pre-line">
              {listing.description}
            </p>
          </div>
        </div>

        <div className="lg:col-span-2 lg:sticky lg:top-20 space-y-4">
          <div className="card p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <h1 className="font-display font-bold text-xl sm:text-2xl text-neutral-900">
                {listing.title}
              </h1>
              {listing.isFeatured && (
                <span className="badge bg-primary-500 text-white shrink-0">
                  <Star className="size-3 fill-current" />
                  {t.card.featured}
                </span>
              )}
            </div>

            <p className="font-display font-extrabold text-3xl text-primary-600">
              {listing.price != null ? formatSAR(listing.price) : t.card.negotiable}
            </p>

            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="badge bg-neutral-100 text-neutral-600">
                {t.card.conditions[listing.condition] ?? listing.condition}
              </span>
              <span className="badge bg-neutral-100 text-neutral-600">
                <MapPin className="size-3.5" />
                {listing.city}
                {listing.neighborhood ? ` · ${listing.neighborhood}` : ""}
              </span>
              <span className="badge bg-neutral-100 text-neutral-600">
                <Eye className="size-3.5" />
                {listing.views.toLocaleString("en-US")}
              </span>
              <span className="badge bg-neutral-100 text-neutral-600" suppressHydrationWarning>
                {timeAgo(listing.createdAt, lang)}
              </span>
              {configForMain(cat.parent?.slug ?? cat.slug).showDelivery && (
                <span className="badge bg-blue-50 text-blue-700">
                  {t.detail.delivery[listing.deliveryMethod] ?? listing.deliveryMethod}
                </span>
              )}
              {listing.ref && (
                <span className="badge bg-neutral-900 text-white font-mono text-[10px]" dir="ltr">
                  {listing.ref}
                </span>
              )}
            </div>

            <div className="flex gap-2 items-center flex-wrap">
              {session?.sub !== listing.sellerId && (
                <ChatButton listingId={listing.id} />
              )}
              <FavoriteButton
                listingId={listing.id}
                initialFav={!!fav}
                loggedIn={!!session}
              />
              <ReportButton targetType="LISTING" targetId={listing.id} />
            </div>

            {/* saved-search alert scoped to this listing's category + city */}
            <SaveSearchButton category={cat.slug} city={listing.city} />
          </div>

          <SellerCard
            seller={listing.seller}
            showContact={listing.showPhone}
            phone={listing.phone}
            whatsapp={listing.whatsapp}
            contactNote="فضّل البائع إخفاء بيانات التواصل المباشر."
          />

          <SharePanel path={`/listings/${listing.id}`} title={listing.title} />

          <div className="card p-4 text-xs text-neutral-600 leading-relaxed space-y-1.5">
            <p className="font-bold text-neutral-800">{t.detail.safetyTitle}</p>
            <ul className="space-y-1 ps-4 list-disc marker:text-primary-500">
              {t.detail.safety.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
            <p className="text-neutral-400 pt-1">{t.detail.safetyFooter}</p>
          </div>
        </div>

        <div className="lg:hidden space-y-6">
          <SpecList attributes={listing.attributes} mainSlug={cat.parent?.slug ?? cat.slug} />
          <div className="card p-5 space-y-3">
            <h2 className="font-bold flex items-center gap-2">
              <FileText className="size-5 text-primary-500" />
              {t.detail.description}
            </h2>
            <p className="text-neutral-700 leading-relaxed whitespace-pre-line">
              {listing.description}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-8 max-w-3xl">
        <Comments
          listingId={listing.id}
          sellerId={listing.sellerId}
          loggedIn={!!session}
        />
      </div>

      {similar.length > 0 && (
        <section className="mt-12">
          <SectionHeader title={t.detail.similar} href={`/category/${cat.slug}`} />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {similar.map((l) =>
              l.type === "AUCTION" ? (
                <AuctionCard key={l.id} listing={l} />
              ) : (
                <ListingCard key={l.id} listing={l} />
              )
            )}
          </div>
        </section>
      )}
    </div>
  );
}
