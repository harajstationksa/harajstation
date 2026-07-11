import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
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
