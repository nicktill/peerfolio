/** The shareable link for a sports league invite code. */
export function sportsInviteLink(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, "")}/join/sports/${encodeURIComponent(code.trim().toUpperCase())}`
}
