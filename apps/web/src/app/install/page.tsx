import type { Metadata } from "next"
import { LandingHeader } from "@web/components/landing/landing-header"
import { SiteFooter } from "@web/components/site-footer"
import { Phone, AppScreen, HomeScreen, Step, Pulse } from "@web/components/install/phone"
import {
  BookOpen, ChevronLeft, ChevronRight, Copy, Download, EllipsisVertical, Lock, Plus, Share, SquarePlus, Star, X,
} from "lucide-react"
import "../landing.css"
import "./install.css"

export const metadata: Metadata = {
  title: "Install the app",
  description: "Add Peerfolio to your phone's home screen. It opens full-screen like any other app, in about four taps.",
  alternates: { canonical: "/install" },
}

const URL_TEXT = "peerfolio.org"

function UrlPill({ chrome }: { chrome?: boolean }) {
  return (
    <span className={chrome ? "ig-url ig-url-chrome" : "ig-url"}>
      <Lock aria-hidden size={9} />
      {URL_TEXT}
    </span>
  )
}

/** Safari on iPhone: address bar and toolbar sit at the bottom. */
function SafariBar({ target }: { target?: boolean }) {
  return (
    <div className="ig-safari">
      <div className="ig-safari-url"><span>aA</span><UrlPill /><span aria-hidden>↻</span></div>
      <div className="ig-safari-tools">
        <ChevronLeft aria-hidden size={15} />
        <ChevronRight aria-hidden size={15} />
        <span className="ig-target"><Share aria-hidden size={15} />{target && <Pulse />}</span>
        <BookOpen aria-hidden size={15} />
        <Copy aria-hidden size={15} />
      </div>
    </div>
  )
}

/** Chrome on Android: address bar on top with the tab count and menu. */
function ChromeBar({ target }: { target?: boolean }) {
  return (
    <div className="ig-chrome">
      <div className="ig-chrome-row">
        <UrlPill chrome />
        <span className="ig-tabs" aria-hidden>1</span>
        <span className="ig-target"><EllipsisVertical aria-hidden size={15} />{target && <Pulse />}</span>
      </div>
    </div>
  )
}

function IosShare() {
  return (
    <>
      <AppScreen dim />
      <div className="ig-sheet">
        <div className="ig-sheet-head">
          <span className="ig-sheet-icon" />
          <span><b>Peerfolio</b><i>{URL_TEXT}</i></span>
          <X aria-hidden size={14} />
        </div>
        <div className="ig-list">
          <div><span>Copy</span><Copy aria-hidden size={13} /></div>
          <div><span>Add to Bookmarks</span><BookOpen aria-hidden size={13} /></div>
          <div className="ig-hit"><span>Add to Home Screen</span><SquarePlus aria-hidden size={13} /><Pulse /></div>
          <div><span>Print</span><span aria-hidden>⎙</span></div>
        </div>
      </div>
    </>
  )
}

function IosAdd() {
  return (
    <>
      <AppScreen dim />
      <div className="ig-dialog">
        <div className="ig-dialog-bar">
          <span>Cancel</span>
          <b>Add to Home Screen</b>
          <span className="ig-hit-text">Add<Pulse /></span>
        </div>
        <div className="ig-dialog-card">
          <span className="ig-appicon" />
          <span className="ig-field">Peerfolio</span>
        </div>
        <div className="ig-dialog-url">{URL_TEXT}</div>
        <p>An icon will be added to your Home Screen so you can quickly access this website.</p>
      </div>
    </>
  )
}

function AndroidMenu() {
  return (
    <>
      <AppScreen dim />
      <div className="ig-menu">
        <div className="ig-menu-icons"><ChevronRight aria-hidden size={14} /><Star aria-hidden size={14} /><Download aria-hidden size={14} /><span aria-hidden>↻</span></div>
        <div>New tab</div>
        <div>History</div>
        <div className="ig-hit"><span>Add to Home screen</span><Pulse /></div>
        <div>Settings</div>
      </div>
    </>
  )
}

function AndroidInstall() {
  return (
    <>
      <AppScreen dim />
      <div className="ig-modal">
        <b>Add to Home screen</b>
        <div className="ig-dialog-card" style={{ marginTop: 8 }}>
          <span className="ig-appicon" />
          <span className="ig-field">Peerfolio</span>
        </div>
        <div className="ig-modal-actions"><span>Cancel</span><span className="ig-hit-text">Add<Pulse /></span></div>
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
            <Step n={1} title="Open in Safari" body="Go to peerfolio.org and sign in.">
              <Phone><AppScreen /><SafariBar /></Phone>
            </Step>
            <Step n={2} title="Tap Share" body="The square with an arrow, in the bottom bar.">
              <Phone><AppScreen /><SafariBar target /></Phone>
            </Step>
            <Step n={3} title="Add to Home Screen" body="Scroll the share sheet if you don't see it.">
              <Phone><IosShare /></Phone>
            </Step>
            <Step n={4} title="Tap Add" body="Then open Peerfolio from your home screen.">
              <Phone><IosAdd /></Phone>
            </Step>
          </div>
        </section>

        <section aria-labelledby="android">
          <div className="ig-head"><h2 id="android">Android</h2><span>Use Chrome</span></div>
          <div className="ig-row">
            <Step n={1} title="Open in Chrome" body="Go to peerfolio.org and sign in.">
              <Phone android><ChromeBar /><AppScreen top /></Phone>
            </Step>
            <Step n={2} title="Tap the menu" body="The three dots at the top right.">
              <Phone android><ChromeBar target /><AppScreen top /></Phone>
            </Step>
            <Step n={3} title="Add to Home screen" body="Some phones say Install app instead.">
              <Phone android><ChromeBar /><AndroidMenu /></Phone>
            </Step>
            <Step n={4} title="Tap Add" body="Confirm, then find Peerfolio on your home screen.">
              <Phone android><ChromeBar /><AndroidInstall /></Phone>
            </Step>
          </div>
        </section>

        <section className="ig-done" aria-labelledby="done">
          <div>
            <h2 id="done">Then it looks like this</h2>
            <p className="ig-sub">The Peerfolio icon sits with your other apps and opens straight into your dashboard, full-screen.</p>
          </div>
          <Phone><HomeScreen /></Phone>
        </section>

        <p className="ig-note">
          <Plus aria-hidden size={14} /> Already on the home screen? Nothing to update: it always loads the latest version.
        </p>
      </main>
      <SiteFooter />
    </div>
  )
}
