import type React from "react"
import type { Metadata } from "next"
import localFont from "next/font/local"
import "./globals.css"
import "./peerfolio-5c.css"
import { Analytics } from "@vercel/analytics/next"
import { Providers } from "@web/components/providers"
import { SITE } from "@web/lib/site"

// Words with character (titles, league names, ranks). Swap the family here and
// every `font-display` in the app follows; the variable name never changes.
// Bundle the existing Latin fonts so builds do not depend on Google Fonts responses.
const display = localFont({
  src: [{ path: "./fonts/bricolage-grotesque-normal-200-800.woff2", weight: "200 800", style: "normal" }],
  variable: "--font-display",
  display: "swap",
})
const appSans = localFont({
  src: [{ path: "./fonts/hanken-grotesk-normal-100-900.woff2", weight: "100 900", style: "normal" }],
  variable: "--font-hanken",
  display: "swap",
})
const appDisplay = localFont({
  src: [
    { path: "./fonts/newsreader-normal-200-800.woff2", weight: "200 800", style: "normal" },
    { path: "./fonts/newsreader-italic-200-800.woff2", weight: "200 800", style: "italic" },
  ],
  variable: "--font-newsreader",
  display: "swap",
})
const appMono = localFont({
  src: [
    { path: "./fonts/ibm-plex-mono-normal-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ibm-plex-mono-normal-500.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-plex-mono",
  display: "swap",
})

export const metadata: Metadata = {
  metadataBase: new URL(SITE.baseUrl),
  title: {
    default: SITE.title,
    template: `%s | ${SITE.name}`,
  },
  description: SITE.description,
  keywords: [...SITE.keywords],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    title: SITE.shareTitle,
    description: SITE.description,
    siteName: SITE.name,
    images: [
      {
        url: "/share-preview.png",
        width: 1200,
        height: 630,
        alt: SITE.name,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE.shareTitle,
    description: SITE.description,
    images: ["/share-preview.png"],
  },
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.png" />
      </head>
      <body className={`${display.variable} ${appSans.variable} ${appDisplay.variable} ${appMono.variable}`}>
        <Providers>{children}</Providers>
        <Analytics />
      </body>
    </html>
  )
}
