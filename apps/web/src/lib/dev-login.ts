/**
 * Whether the password-less developer login is allowed in this build.
 *
 * Two independent conditions, both required:
 *  - the build is local development, or a Vercel *preview* deployment
 *    (VERCEL_ENV === "preview"); never a production deployment;
 *  - ENABLE_DEV_LOGIN is explicitly "true", which on Vercel is only set for
 *    the preview branches that point at the demo database.
 *
 * Previews sit behind Vercel's deployment protection, so only team members can
 * reach the page at all. A provider that trusts an email with no password is a
 * full account takeover if it ever ships to production, hence the belt and braces.
 */
export function devLoginAllowed() {
  if (process.env.ENABLE_DEV_LOGIN !== "true") return false
  if (process.env.VERCEL_ENV === "production") return false
  return process.env.NODE_ENV !== "production" || process.env.VERCEL_ENV === "preview"
}
