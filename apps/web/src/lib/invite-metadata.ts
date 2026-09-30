import type { Metadata } from "next"

export type InviteKind = "league" | "fantasy"

export function inviteCopy(kind: InviteKind) {
  return kind === "fantasy"
    ? { title: "You've been invited to a fantasy league", description: "Build a portfolio with play money and compete with friends on Peerfolio. Open your invitation to join the league." }
    : { title: "You've been invited to a league", description: "Join your friends on Peerfolio and compare investment returns. Your balances stay private. Open your invitation to join the league." }
}

/** Public, generic copy: crawlers never need league, member, or portfolio data. */
export function inviteMetadata(kind: InviteKind, code: string): Metadata {
  const { title, description } = inviteCopy(kind)
  const path = `${kind === "fantasy" ? "/fantasy" : ""}/join/${encodeURIComponent(code.trim().toUpperCase())}`
  const image = { url: `/invite-preview/${kind}`, width: 1200, height: 630, alt: `${title} on Peerfolio` }
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: { type: "website", locale: "en_US", siteName: "Peerfolio", title, description, url: path, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  }
}
