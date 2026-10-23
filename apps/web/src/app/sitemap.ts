import type { MetadataRoute } from "next"
import { SITE } from "@web/lib/site"

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/market-news", "/install", "/terms", "/privacy"].map((path) => ({ url: `${SITE.baseUrl}${path}` }))
}
