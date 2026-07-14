import type { Metadata } from "next";
import { Cairo, IBM_Plex_Sans_Arabic } from "next/font/google";
import { getLang } from "@/lib/i18n";
import { BRAND, organizationLd, SITE, websiteLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { LangProvider } from "@/components/LangProvider";
import { NativeFormMessages } from "@/components/NativeFormMessages";
import { PwaRegister } from "@/components/PwaRegister";
import "./globals.css";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  variable: "--font-cairo",
});

const ibmArabic = IBM_Plex_Sans_Arabic({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["arabic", "latin"],
  variable: "--font-ibm-arabic",
});

const DESCRIPTION =
  "حراج ستيشن — منصة سعودية موثوقة للإعلانات المبوبة والمزادات المباشرة. بيع واشترِ السيارات والعقارات والإلكترونيات وأكثر بأمان وشفافية.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: "حراج ستيشن — سوقك السعودي الأول للمزادات والإعلانات",
    template: "%s | حراج ستيشن",
  },
  description: DESCRIPTION,
  keywords: ["حراج", "مزادات", "سوق", "السعودية", "إعلانات مبوبة", "حراج ستيشن"],
  applicationName: BRAND,
  // tells Google it may show a full-size image and an unclipped snippet rather
  // than the conservative default
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    siteName: BRAND,
    locale: "ar_SA",
    title: "حراج ستيشن — سوقك السعودي الأول للمزادات والإعلانات",
    description: DESCRIPTION,
    url: SITE,
  },
  twitter: {
    card: "summary_large_image",
    title: "حراج ستيشن — سوقك السعودي الأول للمزادات والإعلانات",
    description: DESCRIPTION,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const lang = await getLang();

  return (
    <html
      lang={lang}
      dir={lang === "ar" ? "rtl" : "ltr"}
      className={`${cairo.variable} ${ibmArabic.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-neutral-50">
        {/* who the site is, and the search box Google can show inside a result */}
        <JsonLd data={[organizationLd(), websiteLd()]} />
        <LangProvider lang={lang}>
          <NativeFormMessages />
          {children}
        </LangProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
