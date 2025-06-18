import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AuthProvider from "@web/components/auth-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Peerfolio - Track Your Investments with Friends",
  description: "Peerfolio lets you compare portfolios, stay accountable, and grow wealth together. The social investment platform built for your generation.",
  keywords: ["investing", "portfolio", "social investing", "finance", "wealth building", "investment tracking"],
  authors: [{ name: "Peerfolio Team" }],
  creator: "Peerfolio",
  publisher: "Peerfolio",
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    title: "Peerfolio - Track Your Investments with Friends",
    description: "Compare portfolios, stay accountable, and grow wealth together. The social investment platform built for your generation.",
    siteName: "Peerfolio",
    images: [
      {
        url: "/preview.png",
        width: 1200,
        height: 630,
        alt: "Peerfolio - Social Investment Tracking Platform",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Peerfolio - Track Your Investments with Friends",
    description: "Compare portfolios, stay accountable, and grow wealth together. The social investment platform built for your generation.",
    images: ["/preview.png"],
    creator: "@peerfolio",
    site: "@peerfolio",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.png" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
