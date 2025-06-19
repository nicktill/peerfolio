import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AuthProvider from "@web/components/auth-provider";
import { ThemeProvider } from "@web/components/theme-provider"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NODE_ENV === 'production' 
      ? 'https://peerfolio.com' // Replace with your actual domain
      : 'http://localhost:3000'
  ),
  title: {
    default: "Peerfolio",
    template: "%s | Peerfolio"
  },
  description: "The social investment platform built for your generation. Compare portfolios, stay accountable, and grow wealth together.",
  keywords: ["investment", "portfolio", "social", "finance", "trading", "stocks"],
  authors: [{ name: "Peerfolio Team" }],
  creator: "Peerfolio",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    title: "Peerfolio",
    description: "The social investment platform built for your generation. Compare portfolios, stay accountable, and grow wealth together.",
    siteName: "Peerfolio",
    images: [
      {
        url: "/preview.png",
        width: 1200,
        height: 630,
        alt: "Peerfolio - Social Investment Platform"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "Peerfolio",
    description: "The social investment platform built for your generation. Compare portfolios, stay accountable, and grow wealth together.",
    images: ["/preview.png"],
    creator: "@peerfolio" // Replace with your actual Twitter handle
  },
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/favicon.png"
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.png" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
