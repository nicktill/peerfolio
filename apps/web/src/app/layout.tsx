import type React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import { Providers } from "@web/components/providers"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXTAUTH_URL ?? "https://www.peerfolio.org"),
  title: {
    default: "Peerfolio",
    template: "%s | Peerfolio",
  },
  description:
    "A calmer, more social way to understand your portfolio, follow thoughtful investors, and compete on returns.",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    title: "Peerfolio",
    description:
      "Compete with friends on investment returns without sharing dollar amounts.",
    siteName: "Peerfolio",
    images: [
      {
        url: "/preview.png",
        width: 1200,
        height: 630,
        alt: "Peerfolio",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Peerfolio",
    description:
      "Compete with friends on investment returns without sharing dollar amounts.",
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
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
