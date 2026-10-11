import type React from "react"
import type { Metadata } from "next"
import { Bricolage_Grotesque, Hanken_Grotesk, IBM_Plex_Mono, Newsreader } from "next/font/google"
import "./globals.css"
import "./peerfolio-5c.css"
import { Providers } from "@web/components/providers"
import { SITE } from "@web/lib/site"

// Words with character (titles, league names, ranks). Swap the family here and
// every `font-display` in the app follows; the variable name never changes.
const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
})

const appSans = Hanken_Grotesk({ variable: "--font-hanken", subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" })
const appDisplay = Newsreader({ variable: "--font-newsreader", subsets: ["latin"], style: ["normal", "italic"], display: "swap" })
const appMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"], display: "swap" })

export const metadata: Metadata = {
  metadataBase: new URL(SITE.baseUrl),
  title: {
    default: SITE.title,
    template: `%s | ${SITE.name}`,
  },
  description: SITE.description,
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    title: SITE.title,
    description: SITE.description,
    siteName: SITE.name,
    images: [
      {
        url: "/preview.png",
        width: 1200,
        height: 630,
        alt: SITE.name,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE.title,
    description: SITE.description,
    images: ["/preview.png"],
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
      </body>
    </html>
  )
}
