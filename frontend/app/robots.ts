import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();

  return {
    host: siteUrl.toString(),
    rules: [
      {
        allow: ["/", "/privacy", "/terms"],
        disallow: ["/admin/", "/api/", "/auth/", "/docs", "/logos/", "/m/", "/openapi.json", "/r/"],
        userAgent: "*",
      },
    ],
    sitemap: new URL("/sitemap.xml", siteUrl).toString(),
  };
}
