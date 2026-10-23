import type { Metadata } from "next"
import { LandingHeader } from "@web/components/landing/landing-header"
import { SiteFooter } from "@web/components/site-footer"
import { Phone, Shot, HomeScreen, Step, Pulse } from "@web/components/install/phone"
import {
  BookOpen, ChevronLeft, Copy, Download, EllipsisVertical, Ellipsis, FilePlus2, Lock, RotateCw, Search, Share, SquarePlus, Star, X,
} from "lucide-react"
import "../landing.css"
import "./install.css"

export const metadata: Metadata = {
  title: "Install the app",
  description: "Add Peerfolio to your phone's home screen. It opens full-screen like any other app, in four taps.",
  alternates: { canonical: "/install" },
}

const HOST = "peerfolio.org"

/* ---------- iPhone: Safari (iOS 26 layout: back, address capsule and ⋯ along the bottom) ---------- */

function SafariBar({ target }: { target?: boolean }) {
  return (
    <div className="ig-safari">
      <span className="ig-glass ig-round"><ChevronLeft aria-hidden size={14} /></span>
      <span className="ig-glass ig-capsule"><Lock aria-hidden size={9} />{HOST}<RotateCw aria-hidden size={10} className="ig-capsule-r" /></span>
      <span className="ig-glass ig-round ig-target"><Ellipsis aria-hidden size={14} />{target && <Pulse />}</span>
    </div>
  )
}

function SafariMenu() {
  return (
    <>
      <Shot kind="browser" dim />
      <div className="ig-popover">
        <div className="ig-hit"><span>Share</span><Share aria-hidden size={12} /><Pulse /></div>
        <div><span>New Tab</span><FilePlus2 aria-hidden size={12} /></div>
        <div><span>Add Bookmark</span><BookOpen aria-hidden size={12} /></div>
        <div><span>Find on Page</span><Search aria-hidden size={12} /></div>
      </div>
    </>
  )
}

function SafariShare() {
  return (
    <>
      <Shot kind="browser" dim />
      <div className="ig-sheet">
        <div className="ig-sheet-head">
          <span className="ig-sheet-icon" />
          <span><b>Peerfolio</b><i>{HOST}</i></span>
          <span className="ig-x"><X aria-hidden size={11} /></span>
        </div>
        <div className="ig-airdrop" aria-hidden><span /><span /><span /><span /></div>
        <div className="ig-list">
          <div><span>Copy</span><Copy aria-hidden size={12} /></div>
          <div><span>Add to Bookmarks</span><BookOpen aria-hidden size={12} /></div>
          <div className="ig-hit"><span>Add to Home Screen</span><SquarePlus aria-hidden size={12} /><Pulse /></div>
        </div>
      </div>
    </>
  )
}

function SafariAdd() {
  return (
    <>
      <Shot kind="browser" dim />
      <div className="ig-dialog">
        <div className="ig-dialog-bar">
          <span className="ig-glass ig-chip">Cancel</span>
          <b>Add to Home Screen</b>
          <span className="ig-chip ig-chip-go ig-target">Add<Pulse /></span>
        </div>
        <div className="ig-dialog-card">
          <span className="ig-appicon" />
          <span className="ig-field">Peerfolio</span>
        </div>
        <div className="ig-dialog-url">{HOST}</div>
        <div className="ig-toggle-row">
          <span>Open as Web App</span>
          <span className="ig-toggle" />
        </div>
        <p>Keep this on so it opens full-screen like an app.</p>
      </div>
    </>
  )
}

/* ---------- Android: Chrome (address bar on top, ⋮ menu) ---------- */

function ChromeBar({ target }: { target?: boolean }) {
  return (
    <div className="ig-chrome">
      <span className="ig-chrome-url"><Lock aria-hidden size={9} />{HOST}</span>
      <span className="ig-tabs" aria-hidden>1</span>
      <span className="ig-target ig-dots"><EllipsisVertical aria-hidden size={15} />{target && <Pulse />}</span>
    </div>
  )
}

function ChromeMenu() {
  return (
    <>
      <Shot kind="browser" dim />
      <div className="ig-menu">
        <div className="ig-menu-icons"><Download aria-hidden size={13} /><Star aria-hidden size={13} /><RotateCw aria-hidden size={13} /></div>
        <div>New tab</div>
        <div>New Incognito tab</div>
        <div>History</div>
        <div className="ig-hit"><span>Install app</span><Pulse /></div>
        <div>Settings</div>
      </div>
    </>
  )
}

function ChromeInstall() {
  return (
    <>
      <Shot kind="browser" dim />
      <div className="ig-modal">
        <div className="ig-modal-head">
          <span className="ig-appicon" />
          <span><b>Install app?</b><i>Peerfolio · {HOST}</i></span>
        </div>
        <div className="ig-modal-actions"><span>Cancel</span><span className="ig-target ig-modal-go">Install<Pulse /></span></div>
      </div>
    </>
  )
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

        <section aria-labelledby="ios">
          <div className="ig-head"><h2 id="ios">iPhone</h2><span>Use Safari</span></div>
          <div className="ig-row">
            <Step n={1} title="Open in Safari" body="Go to peerfolio.org, then tap the ⋯ next to the address bar.">
              <Phone><div className="ig-top" /><Shot kind="browser" /><SafariBar target /></Phone>
            </Step>
            <Step n={2} title="Tap Share" body="On older iOS, tap the Share icon in the bottom bar instead.">
              <Phone><div className="ig-top" /><SafariMenu /><SafariBar /></Phone>
            </Step>
            <Step n={3} title="Add to Home Screen" body="Scroll down the share sheet, or tap View More, if you don't see it.">
              <Phone><div className="ig-top" /><SafariShare /></Phone>
            </Step>
            <Step n={4} title="Tap Add" body="Leave Open as Web App on. Then open Peerfolio from your home screen.">
              <Phone><div className="ig-top" /><SafariAdd /></Phone>
            </Step>
          </div>
          <p className="ig-aside">Chrome on iPhone can't install Peerfolio as an app. Open it in Safari for this.</p>
        </section>

        <section aria-labelledby="android">
          <div className="ig-head"><h2 id="android">Android</h2><span>Use Chrome</span></div>
          <div className="ig-row">
            <Step n={1} title="Open in Chrome" body="Go to peerfolio.org and sign in.">
              <Phone android><ChromeBar /><Shot kind="browser" /></Phone>
            </Step>
            <Step n={2} title="Tap the menu" body="The three dots at the top right.">
              <Phone android><ChromeBar target /><Shot kind="browser" /></Phone>
            </Step>
            <Step n={3} title="Install app" body="Some phones say Add to Home screen instead.">
              <Phone android><ChromeBar /><ChromeMenu /></Phone>
            </Step>
            <Step n={4} title="Tap Install" body="Confirm, then find Peerfolio with your other apps.">
              <Phone android><ChromeBar /><ChromeInstall /></Phone>
            </Step>
          </div>
        </section>

        <section className="ig-done" aria-labelledby="done">
          <div>
            <h2 id="done">Then it looks like this</h2>
            <p className="ig-sub">
              The Peerfolio icon sits with your other apps. Tap it and it opens full-screen, straight into your dashboard, with no browser bars.
            </p>
          </div>
          <div className="ig-pair">
            <Phone><HomeScreen /></Phone>
            <Phone><Shot kind="standalone" /></Phone>
          </div>
        </section>

        <p className="ig-note">Already installed? Nothing to update: it always loads the latest version.</p>
      </main>
      <SiteFooter />
    </div>
  )
}
