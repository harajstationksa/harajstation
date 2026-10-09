import { headers } from "next/headers";
import Script from "next/script";

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;
const GA_ENABLED = process.env.NEXT_PUBLIC_GA_ENABLED === "true";

/**
 * Google tag (gtag.js), loaded site-wide from the root layout.
 *
 * Skipped outside production so local browsing does not land in the real
 * property's reports — the tag can only be verified on the live domain anyway.
 * The googletagmanager/google-analytics hosts are allow-listed in the CSP in
 * `next.config.ts`; without that the script is blocked before it runs.
 */
export async function GoogleAnalytics() {
  if (process.env.NODE_ENV !== "production" || !GA_ENABLED || !GA_ID) return null;

  const h = await headers();
  if (/^\/(admin|api|dashboard|login|register|reset|forgot)/.test(h.get("x-pathname") ?? ""))
    return null;
  const nonce = h.get("x-nonce") ?? undefined;
  return (
    <>
      <Script
        nonce={nonce}
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script nonce={nonce} id="gtag-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');`}
      </Script>
    </>
  );
}
