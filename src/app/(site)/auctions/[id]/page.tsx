import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Eye, FileText, Lock, MapPin, ScrollText } from "lucide-react";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getT } from "@/lib/i18n";
import { recordListingView } from "@/lib/views";
import { auctionLd, breadcrumbLd, pageMeta } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { formatSAR, parseImages, timeAgo } from "@/lib/utils";
import { BidPanel, type AuctionState } from "@/components/BidPanel";
import { Comments } from "@/components/Comments";
import { Gallery } from "@/components/Gallery";
import { SellerCard } from "@/components/SellerCard";
import { SharePanel } from "@/components/SharePanel";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const auction = await db.auction.findUnique({
    where: { id },
    include: {
      listing: { select: { title: true, description: true, images: true, city: true } },
      bids: { orderBy: { amount: "desc" }, take: 1, select: { amount: true } },
    },
  });
  if (!auction) return {};

  const current = auction.bids[0]?.amount ?? auction.startPrice;
  const live = auction.status === "LIVE";
  return pageMeta({
    title: `مزاد: ${auction.listing.title}`,
    description:
      `${live ? "المزاد مفتوح الآن" : "انتهى المزاد"} — ${formatSAR(current)} · ` +
      `${auction.listing.city}. ${auction.listing.description.slice(0, 120)}`,
    path: `/auctions/${id}`,
    images: parseImages(auction.listing.images).slice(0, 1),
  });
}

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
            anonymous: true,
            createdAt: true,
            bidderId: true,
            bidder: { select: { name: true } },
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
        select: { maxAmount: true, anonymous: true },
      })
    : null;

  const ended = auction.status === "ENDED";
  // the seller sees real names of bidders who chose to bid openly;
  // everyone else (including other bidders) only ever sees masked names
  const revealTo = (bid: { anonymous: boolean }) => isSeller && !bid.anonymous;
  const myLastBid = session
    ? auction.bids.find((b) => b.bidderId === session.sub)
    : null;

  const initial: AuctionState = {
    status: auction.status,
    endsAt: auction.endsAt.toISOString(),
    listingId: listing.id,
    currentBid: top?.amount ?? auction.startPrice,
    minNext: top ? top.amount + auction.minIncrement : auction.startPrice,
    minIncrement: auction.minIncrement,
    bidCount: auction._count.bids,
    buyNowPrice: auction.buyNowPrice,
    isTopBidder: !!session && top?.bidderId === session.sub,
    isSeller,
    myProxyMax: myProxy?.maxAmount ?? null,
    myAnonymous: myLastBid?.anonymous ?? myProxy?.anonymous ?? null,
    winnerMasked: ended && top ? top.maskedName : null,
    winnerAnonymous: ended && top ? top.anonymous : false,
    winnerName: ended && top && revealTo(top) ? top.bidder.name : null,
    winnerProfileId: ended && top && revealTo(top) ? top.bidderId : null,
    winnerChatId: ended && isSeller ? auction.winnerId : null,
    bids: auction.bids.map((b) => ({
      id: b.id,
      amount: b.amount,
      name: revealTo(b) ? b.bidder.name : b.maskedName,
      profileId: revealTo(b) ? b.bidderId : null,
      at: b.createdAt.toISOString(),
      mine: !!session && b.bidderId === session.sub,
    })),
  };

  return (
    <div className="container-page py-6 pb-12">
      <JsonLd
        data={[
          auctionLd({
            title: listing.title,
            description: listing.description,
            images: parseImages(listing.images),
            currentPrice: top?.amount ?? auction.startPrice,
            endsAt: auction.endsAt,
            status: auction.status,
            condition: listing.condition,
            city: listing.city,
            path: `/auctions/${auction.id}`,
          }),
          breadcrumbLd([
            { name: "الرئيسية", path: "/" },
            { name: "المزادات", path: "/auctions" },
            { name: listing.title, path: `/auctions/${auction.id}` },
          ]),
        ]}
      />
      {/* breadcrumb */}
      <nav className="flex items-center gap-1 text-sm text-neutral-500 mb-4 flex-wrap">
        <Link href="/" className="hover:text-primary-600">{t.categoryPage.home}</Link>
        <ChevronLeft className="size-3.5 ltr:rotate-180 shrink-0" />
        <Link href="/auctions" className="hover:text-primary-600">{t.nav.auctions}</Link>
        <ChevronLeft className="size-3.5 ltr:rotate-180 shrink-0" />
        <span className="text-neutral-800 line-clamp-1">{listing.title}</span>
      </nav>

      <div className="mb-5 space-y-2.5">
        <h1 className="font-display font-bold text-xl sm:text-3xl text-neutral-900 leading-snug">
          {listing.title}
        </h1>
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="badge bg-neutral-100 text-neutral-600">
            <MapPin className="size-3.5" />
            {listing.city}
          </span>
          <span className="badge bg-neutral-100 text-neutral-600">
            <Eye className="size-3.5" />
            {listing.views.toLocaleString("en-US")} {t.detail.views}
          </span>
          <span className="badge bg-neutral-100 text-neutral-600" suppressHydrationWarning>
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
          {t.pub.wonTitle}{" "}
          <Link href="/dashboard/verifications" className="underline">
            {t.pub.verificationsPage}
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
            contactNote={t.pub.auctionContactNote}
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
