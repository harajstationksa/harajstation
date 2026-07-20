import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { ImageResponse } from "next/og";
import QRCode from "qrcode";
import sharp from "sharp";
import { db } from "@/lib/db";
import { formatSAR, parseImages } from "@/lib/utils";
import { rateLimitGuard } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * The OG renderer shapes Arabic letters correctly but lays *words* out
 * left-to-right, which reverses the reading order of every multi-word line.
 * Same issue solved in opengraph-image.tsx: hand-reverse — render each word
 * as its own span inside a row-reverse flex row, so the first logical word
 * lands rightmost. Latin tokens (prices, SM-refs) keep their internal LTR.
 *
 * `flexWrap: "wrap"` is deliberately NOT used here: combined with
 * row-reverse, the renderer packs overflow words into line 2 but then
 * mirrors word order only on line 1 — line 2 comes out backwards. Lines
 * must be pre-split in JS (see wrapRtl below) and each rendered as its own
 * single, non-wrapping RtlRow — that combination is verified correct.
 */
function RtlRow({
  text,
  gap = 10,
  style,
}: {
  text: string;
  gap?: number;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row-reverse",
        flexWrap: "nowrap",
        justifyContent: "flex-start",
        gap,
        ...style,
      }}
    >
      {text.split(/\s+/).map((w, i) => (
        <span key={i}>{w}</span>
      ))}
    </div>
  );
}

/**
 * Break `text` into up to `maxLines` lines of roughly `charsPerLine`
 * characters, splitting only on word boundaries. The overall string is
 * first hard-capped to `charsPerLine * maxLines` (with an ellipsis) so the
 * greedy per-line packing below can never itself need to truncate.
 */
function wrapRtl(text: string, charsPerLine: number, maxLines: number): string[] {
  const capped =
    text.length > charsPerLine * maxLines
      ? `${text.slice(0, charsPerLine * maxLines)}…`
      : text;

  const words = capped.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && next.length > charsPerLine) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Ready-to-forward share card (1080×1080) for WhatsApp status & groups —
 * where most Saudi resale actually happens. Product photo, price, city and a
 * QR code that brings the group straight to the listing.
 *
 * The photo goes through sharp first: uploads are WebP (and placeholders are
 * SVG), neither of which the OG renderer accepts — re-encoded to JPEG and
 * inlined as a data URL.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const limited = await rateLimitGuard(req, "share-card", 10, 60_000);
  if (limited) return limited;

  const { id } = await ctx.params;
  const listing = await db.listing.findUnique({
    where: { id },
    select: {
      title: true,
      price: true,
      city: true,
      ref: true,
      images: true,
      status: true,
    },
  });
  if (!listing || listing.status !== "ACTIVE") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Behind nginx the app binds 127.0.0.1:3000, so req.url's host is the
  // internal address — the QR would point at localhost. Resolve the public
  // origin from the proxy's forwarded headers, same as SharePanel does.
  const h = await headers();
  const host =
    h.get("x-forwarded-host") ?? h.get("host") ?? new URL(req.url).host;
  const proto =
    h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const listingUrl = `${proto}://${host}/listings/${id}`;

  // ── product photo → JPEG data URL ──
  let photo: string | null = null;
  try {
    const src = parseImages(listing.images)[0];
    if (src) {
      let raw: Buffer;
      if (src.startsWith("http")) {
        raw = Buffer.from(await (await fetch(src)).arrayBuffer());
      } else if (src.startsWith("/")) {
        raw = await readFile(join(process.cwd(), "public", src));
      } else {
        raw = Buffer.from("");
      }
      if (raw.length > 0) {
        const jpeg = await sharp(raw)
          .resize(1080, 760, { fit: "cover" })
          .flatten({ background: "#f5f5f4" })
          .jpeg({ quality: 82 })
          .toBuffer();
        photo = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
      }
    }
  } catch {
    // photo is decoration — the card still works without it
  }

  const [tajawal, qr] = await Promise.all([
    readFile(join(process.cwd(), "src/app/_fonts/Tajawal-Bold.ttf")),
    QRCode.toDataURL(listingUrl, { width: 240, margin: 1 }),
  ]);

  const priceText =
    listing.price != null ? formatSAR(listing.price) : "على السوم";
  // pre-split into lines ourselves — see wrapRtl's doc comment for why
  const titleLines = wrapRtl(listing.title, 34, 2);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#1a1614",
          color: "#fff",
          fontFamily: "Tajawal",
        }}
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt=""
            width={1080}
            height={760}
            style={{ width: 1080, height: 760, objectFit: "cover" }}
          />
        ) : (
          <div
            style={{
              width: 1080,
              height: 760,
              display: "flex",
              // the renderer lays sibling spans LTR even for Arabic — reverse
              // by hand, same trick as opengraph-image.tsx
              flexDirection: "row-reverse",
              gap: 24,
              alignItems: "center",
              justifyContent: "center",
              background: "linear-gradient(135deg, #2d2320 0%, #7c3f24 100%)",
              fontSize: 90,
              color: "#f97316",
            }}
          >
            <span>حراج</span>
            <span>ستيشن</span>
          </div>
        )}

        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "28px 44px",
            gap: 32,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              flex: 1,
              minWidth: 0,
            }}
          >
            <RtlRow
              text={priceText}
              gap={14}
              style={{ fontSize: 64, color: "#f97316" }}
            />
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                marginTop: 6,
                maxWidth: 760,
              }}
            >
              {titleLines.map((line, i) => (
                <RtlRow key={i} text={line} style={{ fontSize: 38, color: "#fff" }} />
              ))}
            </div>
            <RtlRow
              text={`${listing.city} · حراج ستيشن${listing.ref ? ` · ${listing.ref}` : ""}`}
              gap={8}
              style={{ fontSize: 26, color: "#c9beb8", marginTop: 10 }}
            />
          </div>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qr}
            alt=""
            width={200}
            height={200}
            style={{
              width: 200,
              height: 200,
              borderRadius: 16,
              background: "#fff",
            }}
          />
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1080,
      fonts: [{ name: "Tajawal", data: tajawal, weight: 700, style: "normal" }],
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=300",
        "Content-Disposition": `inline; filename="haraj-${listing.ref ?? id}.png"`,
      },
    }
  );
}
