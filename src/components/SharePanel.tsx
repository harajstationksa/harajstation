import { headers } from "next/headers";
import { Share2 } from "lucide-react";
import QRCode from "qrcode";
import { ShareButtons } from "./ShareButtons";

/**
 * Server side of the share feature: resolves the absolute URL from the
 * request headers and pre-renders the QR code as a data URL — the client
 * component only handles clicks.
 */
export async function SharePanel({ path, title }: { path: string; title: string }) {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const url = `${proto}://${host}${path}`;

  const qrDataUrl = await QRCode.toDataURL(url, {
    width: 320,
    margin: 1,
    color: { dark: "#171717", light: "#ffffff" },
  });

  return (
    <div className="card p-4 space-y-3">
      <p className="text-sm font-bold flex items-center gap-2">
        <Share2 className="size-4.5 text-primary-500" />
        شارك الإعلان
      </p>
      <ShareButtons url={url} title={title} qrDataUrl={qrDataUrl} />
    </div>
  );
}
