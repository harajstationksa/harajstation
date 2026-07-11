import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Eye, FileText, Lock, MapPin, ScrollText } from "lucide-react";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getT } from "@/lib/i18n";
import { recordListingView } from "@/lib/views";
import { finalizeExpiredAuctions } from "@/lib/auction";
import { parseImages, timeAgo } from "@/lib/utils";
import { BidPanel, type AuctionState } from "@/components/BidPanel";
import { Comments } from "@/components/Comments";
import { Gallery } from "@/components/Gallery";
import { SellerCard } from "@/components/SellerCard";
import { SharePanel } from "@/components/SharePanel";

export const dynamic = "force-dynamic";

export default async function AuctionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ spc?: string }>;
}) {
  const { lang, t } = await getT();
  const { id } = await params;
  const { spc } = await searchParams;
  await finalizeExpiredAuctions();

  const [session, auction] = await Promise.all([
    getSession(),
    db.auction.findUnique({
      where: { id },
      include: {
        listing: { include: { seller: true, category: true } },
        bids: {
          orderBy: { amount: "desc" },
          take: 20,
          select: {
            id: true,
            amount: true,
            maskedName: true,
            createdAt: true,
            bidderId: true,
          },
        },
        _count: { select: { bids: true } },
      },
    }),
  ]);
  if (!auction) notFound();

  // arrived through a sponsored placement → credit the campaign's click counter
  if (spc) {
    await db.campaign.updateMany({
      where: { id: spc, listingId: auction.listingId, status: "ACTIVE" },
      data: { clicks: { increment: 1 } },
    });
  }

  recordListingView(auction.listingId).catch(() => {});

  const listing = auction.listing;
  const top = auction.bids[0];
  const isWinner = !!session && auction.winnerId === session.sub;
  const isSeller = !!session && listing.sellerId === session.sub;

  const myProxy = session
    ? await db.proxyBid.findUnique({
        where: {
          auctionId_bidderId: { auctionId: auction.id, bidderId: session.sub },
        },
        select: { maxAmount: true },
      })
    : null;

  const initial: AuctionState = {
    status: auction.status,
    endsAt: auction.endsAt.toISOString(),
    currentBid: top?.amount ?? auction.startPrice,
    minNext: top ? top.amount + auction.minIncrement : auction.startPrice,
    minIncrement: auction.minIncrement,
    bidCount: auction._count.bids,
    buyNowPrice: auction.buyNowPrice,
    isTopBidder: !!session && top?.bidderId === session.sub,
    isSeller,
    myProxyMax: myProxy?.maxAmount ?? null,
    winnerMasked: auction.status === "ENDED" && top ? top.maskedName : null,
    bids: auction.bids.map((b) => ({
      id: b.id,
      amount: b.amount,
      name: b.maskedName,
      at: b.createdAt.toISOString(),
      mine: !!session && b.bidderId === session.sub,
    })),
  };

  return (
    <div className="container-page py-6 pb-12">
      {/* breadcrumb */}
      <nav className="flex items-center gap-1 text-sm text-neutral-500 mb-4">
        <Link href="/" className="hover:text-primary-600">{t.categoryPage.home}</Link>
        <ChevronLeft className="size-3.5 ltr:rotate-180" />
        <Link href="/auctions" className="hover:text-primary-600">{t.nav.auctions}</Link>
        <ChevronLeft className="size-3.5 ltr:rotate-180" />
        <span className="text-neutral-800 line-clamp-1">{listing.title}</span>
      </nav>

      <div className="mb-5">
        <h1 className="font-display font-bold text-2xl sm:text-3xl text-neutral-900">
          {listing.title}
        </h1>
        <div className="flex items-center gap-4 mt-2 text-sm text-neutral-500">
          <span className="flex items-center gap-1">
            <MapPin className="size-4" />
            {listing.city}
          </span>
          <span className="flex items-center gap-1">
            <Eye className="size-4" />
            {listing.views.toLocaleString("en-US")} {t.detail.views}
          </span>
          <span suppressHydrationWarning>
            {t.detail.published} {timeAgo(listing.createdAt, lang)}
          </span>
          {listing.ref && (
            <span className="badge bg-neutral-900 text-white font-mono text-[10px]" dir="ltr">
              {listing.ref}
            </span>
          )}
        </div>
      </div>

      {isWinner && (
        <div className="mb-5 rounded-xl bg-green-50 border border-green-200 p-4 text-green-800 text-sm font-semibold">
          مبروك! فزت بهذا المزاد — تم كشف بيانات التواصل مع البائع أدناه، وبانتظار
          تأكيد الاستلام في{" "}
          <Link href="/dashboard/verifications" className="underline">
            صفحة التحققات
          </Link>
          .
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        {/* main column */}
        <div className="lg:col-span-3 space-y-6">
          <Gallery images={parseImages(listing.images)} title={listing.title} />

          <div className="card p-5 max-lg:hidden space-y-4">
            <h2 className="font-bold flex items-center gap-2">
              <FileText className="size-5 text-primary-500" />
              {t.detail.productDetails}
            </h2>
            <p className="text-neutral-700 leading-relaxed whitespace-pre-line">
              {listing.description}
            </p>
            {auction.terms && (
              <div className="rounded-lg bg-neutral-50 border border-neutral-100 p-3">
                <p className="font-semibold text-sm flex items-center gap-1.5 mb-1">
                  <ScrollText className="size-4 text-neutral-500" />
                  {t.detail.auctionTerms}
                </p>
                <p className="text-sm text-neutral-600">{auction.terms}</p>
              </div>
            )}
          </div>
        </div>

        {/* bid column */}
        <div className="lg:col-span-2 lg:sticky lg:top-20 space-y-6">
          <BidPanel auctionId={auction.id} initial={initial} loggedIn={!!session} />

          <p className="flex items-start gap-2 rounded-lg bg-neutral-50 border border-neutral-100 px-3 py-2.5 text-xs text-neutral-500 leading-relaxed">
            <Lock className="size-4 shrink-0 mt-0.5 text-neutral-400" />
            {t.detail.privacyNote}
          </p>

          <SellerCard
            seller={listing.seller}
            showContact={isWinner}
            phone={listing.seller.phone}
            whatsapp={listing.seller.phone}
            contactNote="حفاظاً على عدالة المزاد، تُكشف بيانات التواصل للفائز فقط بعد انتهاء المزاد."
          />

          <SharePanel path={`/auctions/${auction.id}`} title={listing.title} />
        </div>

        {/* description (mobile position: after bid panel) */}
        <div className="card p-5 lg:hidden space-y-4">
          <h2 className="font-bold flex items-center gap-2">
            <FileText className="size-5 text-primary-500" />
            {t.detail.productDetails}
          </h2>
          <p className="text-neutral-700 leading-relaxed whitespace-pre-line">
            {listing.description}
          </p>
          {auction.terms && (
            <div className="rounded-lg bg-neutral-50 border border-neutral-100 p-3">
              <p className="font-semibold text-sm mb-1">{t.detail.auctionTerms}</p>
              <p className="text-sm text-neutral-600">{auction.terms}</p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 max-w-3xl">
        <Comments
          listingId={listing.id}
          sellerId={listing.sellerId}
          loggedIn={!!session}
        />
      </div>
    </div>
  );
}
