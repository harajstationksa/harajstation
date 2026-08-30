import Script from "next/script";

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

/**
 * Google tag (gtag.js), loaded site-wide from the root layout.
 *
 * Skipped outside production so local browsing does not land in the real
 * property's reports — the tag can only be verified on the live domain anyway.
 * The googletagmanager/google-analytics hosts are allow-listed in the CSP in
 * `next.config.ts`; without that the script is blocked before it runs.
 */
export function GoogleAnalytics() {
  if (process.env.NODE_ENV !== "production" || !GA_ID) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script id="gtag-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');`}
      </Script>
    </>
  );
}
