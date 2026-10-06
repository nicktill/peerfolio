import type { MetadataRoute } from "next"
import { SITE } from "@web/lib/site"

/**
 * Public pages are open. Signed-in screens and the API have nothing to index.
 * Invite links (/join, /fantasy/join, /invite-preview) are deliberately left out:
 * Slack, iMessage and X obey robots.txt when they build link previews, and
 * blocking those would break the cards people see when an invite is shared.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/dashboard", "/settings", "/leagues", "/board", "/news", "/oauth-return", "/dev-login"],
    },
    sitemap: `${SITE.baseUrl}/sitemap.xml`,
  }
}
