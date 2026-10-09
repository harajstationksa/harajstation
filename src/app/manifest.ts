import { headers } from "next/headers";
import type { MetadataRoute } from "next";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const host = (await headers()).get("host")?.split(":")[0];
  if (process.env.ADMIN_HOST && host === process.env.ADMIN_HOST)
    return {
      name: "إدارة حراج ستيشن",
      short_name: "الإدارة",
      id: "/admin",
      start_url: "/admin",
      display: "browser",
      dir: "rtl",
      lang: "ar",
      icons: [{ src: "/icon.png", sizes: "any", type: "image/png" }],
    };
  return {
    name: "حراج ستيشن — سوقك السعودي الأول للمزادات والإعلانات",
    short_name: "حراج ستيشن",
    description:
      "منصة سعودية موثوقة للإعلانات المبوبة والمزادات المباشرة. بيع واشترِ بأمان وشفافية.",
    id: "/",
    start_url: "/",
    display: "standalone",
    dir: "rtl",
    lang: "ar",
    background_color: "#ffffff",
    theme_color: "#171717",
    categories: ["shopping", "marketplace"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "المزادات المباشرة",
        url: "/auctions",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "أضف إعلانك",
        url: "/sell",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
