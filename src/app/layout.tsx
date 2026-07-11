import type { Metadata } from "next";
import { Cairo, IBM_Plex_Sans_Arabic } from "next/font/google";
import { getLang } from "@/lib/i18n";
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

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "حراج ستيشن — سوقك السعودي الأول للمزادات والإعلانات",
    template: "%s | حراج ستيشن",
  },
  description:
    "حراج ستيشن — منصة سعودية موثوقة للإعلانات المبوبة والمزادات المباشرة. بيع واشترِ السيارات والعقارات والإلكترونيات وأكثر بأمان وشفافية.",
  keywords: ["حراج", "مزادات", "سوق", "السعودية", "إعلانات مبوبة", "حراج ستيشن"],
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
        <LangProvider lang={lang}>
          <NativeFormMessages />
          {children}
        </LangProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
