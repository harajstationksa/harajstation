import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard",
          "/admin",
          "/api",
          "/login",
          "/register",
          "/forgot",
          "/reset",
          "/verify-email",
          // filtered views already carry noindex; keeping the crawler out of the
          // sort/price permutations spends its budget on real listings instead
          "/*?*sort=",
          "/*?*min=",
          "/*?*max=",
          "/*?*condition=",
        ],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
