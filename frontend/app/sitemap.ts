import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();
  const lastModified = new Date("2026-08-24T00:00:00.000Z");

  return [
    {
      changeFrequency: "weekly",
      lastModified,
      priority: 1,
      url: new URL("/", siteUrl).toString(),
    },
    {
      changeFrequency: "monthly",
      lastModified,
      priority: 0.3,
      url: new URL("/privacy", siteUrl).toString(),
    },
    {
      changeFrequency: "monthly",
      lastModified,
      priority: 0.3,
      url: new URL("/terms", siteUrl).toString(),
    },
    {
      changeFrequency: "monthly",
      lastModified,
      priority: 0.2,
      url: new URL("/acceptable-use", siteUrl).toString(),
    },
    {
      changeFrequency: "monthly",
      lastModified,
      priority: 0.2,
      url: new URL("/cookies-analytics", siteUrl).toString(),
    },
    {
      changeFrequency: "monthly",
      lastModified,
      priority: 0.2,
      url: new URL("/ai-policy", siteUrl).toString(),
    },
  ];
}
