import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { HeroBackdrop } from "@web/components/landing/hero-backdrop"
import { loadPublicRecap } from "@web/lib/fantasy-season-view"
import { formatSigned } from "@web/lib/fantasy-season"

type Props = { params: Promise<{ token: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params
  const found = await loadPublicRecap(token)
  if (!found) return { title: "Recap not found", robots: { index: false, follow: false } }
  const title = `${found.league.name}: ${found.recap.headline}`
  const description = "A weekly fantasy recap on Peerfolio. Percentages only, never balances."
  const image = { url: `/recap/${encodeURIComponent(token)}/image`, width: 1200, height: 630, alt: title }
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: { type: "website", siteName: "Peerfolio", title, description, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  }
}

/** Public, read-only round recap. Holding the link is the permission; it shows names and percentages only. */
export default async function PublicRecapPage({ params }: Props) {
  const { token } = await params
  const found = await loadPublicRecap(token)
  if (!found) notFound()
  const { recap, league, seasonNumber } = found

  return (
    <main className="relative isolate mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-10">
      <HeroBackdrop />
      <Link href="/" className="mb-8 flex items-center gap-2 self-start">
        <span className="grid size-7 place-items-center rounded-lg bg-white shadow-sm ring-1 ring-border">
          <Image src="/logo.png" alt="" width={20} height={20} />
        </span>
        <span className="text-[15px] font-semibold tracking-tight">Peerfolio</span>
      </Link>

      <div className="rounded-3xl border bg-card/80 p-6 shadow-xl backdrop-blur">
        <span className="text-4xl" aria-hidden>{league.emoji}</span>
        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.09em] text-muted-foreground">
          {league.name} / Season {seasonNumber} / Round {recap.roundNumber}
        </p>
        <h1 className="font-display mt-2 text-3xl font-normal tracking-tight">{recap.headline}</h1>

        <ol className="mt-5 divide-y divide-border">
          {recap.table.slice(0, 6).map((p) => (
            <li key={p.userId} className="flex items-center gap-3 py-2.5 text-sm">
              <span className="w-5 font-mono text-xs text-muted-foreground">{p.rank}</span>
              <span className="flex-1 font-medium">{p.name}</span>
              <span className={`numeric font-semibold ${p.percent > 0 ? "text-gain-ink" : p.percent < 0 ? "text-loss-ink" : "text-muted-foreground"}`}>{formatSigned(p.percent)}</span>
            </li>
          ))}
        </ol>

        {recap.bestDecision ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Best {recap.mode === "draft" ? "pick" : "trade"}: <b className="font-medium text-foreground">{recap.bestDecision.name}</b> on {recap.bestDecision.ticker}{" "}
            <span className="numeric text-gain-ink">{formatSigned(recap.bestDecision.percent)}</span>
          </p>
        ) : null}
      </div>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Race your friends on investing. <Link href="/" className="font-medium text-foreground underline underline-offset-4">See Peerfolio</Link>
      </p>
    </main>
  )
}
