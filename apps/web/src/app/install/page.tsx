import type { Metadata } from "next"
import { LandingHeader } from "@web/components/landing/landing-header"
import { SiteFooter } from "@web/components/site-footer"
import { InstallGuide } from "@web/components/install/guide"
import "../landing.css"
import "./install.css"

const TITLE = "Add Peerfolio to your home screen"
const DESCRIPTION = "Opens full-screen like any app. Four taps, nothing to download. Step by step for iPhone and Android."
const SHARE_IMAGE = { url: "/install/share-image", width: 1200, height: 630, alt: "Peerfolio on a phone home screen" }

export const metadata: Metadata = {
  title: "Install the app",
  description: DESCRIPTION,
  alternates: { canonical: "/install" },
  openGraph: { type: "website", url: "/install", title: TITLE, description: DESCRIPTION, siteName: "Peerfolio", images: [SHARE_IMAGE] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [SHARE_IMAGE.url] },
}

export default function InstallPage() {
  return (
    <div className="peerfolio-app pf-landing ig-page min-h-screen overflow-x-clip">
      <LandingHeader />
      <main className="ig-main">
        <div className="ig-intro">
          <p className="pf-label-plain pf-tick">Install</p>
          <h1>Add Peerfolio to your home screen</h1>
          <p className="ig-sub">
            It opens full-screen like any other app, with no App Store and nothing to download. It takes about four taps.
          </p>
        </div>

        <InstallGuide />

        <p className="ig-note">Already installed? Nothing to update: it always loads the latest version.</p>
      </main>
      <SiteFooter />
    </div>
  )
}
