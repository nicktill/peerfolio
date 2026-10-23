"use client"

import { useEffect, useState } from "react"
import {
  BookOpen, ChevronDown, ChevronLeft, ChevronRight, Copy, Download, Ellipsis, EllipsisVertical, FilePlus2, House, Layers,
  Lock, Menu, RotateCw, Search, Share, SquarePlus, Star, X,
} from "lucide-react"
import { Phone, Pulse, Shot, Step, HomeScreen } from "@web/components/install/phone"
import { AddToDockSheet, AppWindow, ChromeWindow, MacScene, SafariFileMenu, SafariWindow } from "@web/components/install/mac"

const HOST = "peerfolio.org"

type Platform = "ios" | "android" | "computer"
type Browser = "safari" | "chrome-ios" | "chrome" | "samsung" | "firefox" | "chrome-mac" | "safari-mac"

const BROWSERS: Record<Platform, { id: Browser; label: string }[]> = {
  ios: [{ id: "safari", label: "Safari" }, { id: "chrome-ios", label: "Chrome" }],
  android: [{ id: "chrome", label: "Chrome" }, { id: "samsung", label: "Samsung Internet" }, { id: "firefox", label: "Firefox" }],
  computer: [{ id: "chrome-mac", label: "Chrome or Edge" }, { id: "safari-mac", label: "Safari (Mac)" }],
}

/* ---------- shared pieces ---------- */

function Icon({ n }: { n?: boolean }) {
  return <span className={n ? "ig-appicon ig-appicon-lg" : "ig-appicon"} />
}

/** Apple's share sheet, as Safari and Chrome on iPhone both show it. */
function ShareSheet() {
  return (
    <>
      <Shot kind="bottom" dim />
      <div className="ig-sheet">
        <div className="ig-sheet-head">
          <Icon />
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

function IosAddDialog({ toggle, top }: { toggle?: boolean; top?: boolean }) {
  return (
    <>
      <Shot kind={top ? "top" : "bottom"} dim />
      <div className="ig-dialog">
        <div className="ig-dialog-bar">
          <span className="ig-glass ig-chip">Cancel</span>
          <b>Add to Home Screen</b>
          <span className="ig-chip ig-chip-go ig-target">Add<Pulse /></span>
        </div>
        <div className="ig-dialog-card"><Icon /><span className="ig-field">Peerfolio</span></div>
        <div className="ig-dialog-url">{HOST}</div>
        {toggle && (
          <>
            <div className="ig-toggle-row"><span>Open as Web App</span><span className="ig-toggle" /></div>
            <p>Keep this on so it opens full-screen like an app.</p>
          </>
        )}
      </div>
    </>
  )
}

function AndroidAddDialog({ title, action }: { title: string; action: string }) {
  return (
    <>
      <Shot kind={title === "Install app?" ? "top" : "top"} dim />
      <div className="ig-modal">
        <div className="ig-modal-head">
          <Icon n />
          <span><b>{title}</b><i>Peerfolio · {HOST}</i></span>
        </div>
        <div className="ig-modal-actions"><span>Cancel</span><span className="ig-target ig-modal-go">{action}<Pulse /></span></div>
      </div>
    </>
  )
}

/* ---------- bars ---------- */

function SafariBar({ target }: { target?: boolean }) {
  return (
    <div className="ig-bar-b ig-safari">
      <span className="ig-glass ig-round"><ChevronLeft aria-hidden size={14} /></span>
      <span className="ig-glass ig-capsule"><Lock aria-hidden size={9} />{HOST}<RotateCw aria-hidden size={10} className="ig-capsule-r" /></span>
      <span className="ig-glass ig-round ig-target"><Ellipsis aria-hidden size={14} />{target && <Pulse />}</span>
    </div>
  )
}

function SamsungBar({ target }: { target?: boolean }) {
  return (
    <div className="ig-bar-b ig-samsung">
      <ChevronLeft aria-hidden size={16} /><ChevronRight aria-hidden size={16} /><House aria-hidden size={15} /><Star aria-hidden size={15} /><Layers aria-hidden size={15} />
      <span className="ig-target ig-menu-btn"><Menu aria-hidden size={16} />{target && <Pulse />}</span>
    </div>
  )
}

function TopBar({ kind, target }: { kind: "chrome-ios" | "chrome" | "firefox"; target?: boolean }) {
  return (
    <div className="ig-bar-t">
      <span className="ig-bar-url">
        <Lock aria-hidden size={9} />{HOST}
        {kind === "chrome-ios" && (
          <span className="ig-target ig-inbar">
            <Share aria-hidden size={12} />{target && <Pulse />}
          </span>
        )}
      </span>
      {kind !== "chrome-ios" && <span className="ig-tabs" aria-hidden>1</span>}
      {kind !== "chrome-ios" && (
        <span className="ig-target ig-dots"><EllipsisVertical aria-hidden size={15} />{target && <Pulse />}</span>
      )}
    </div>
  )
}

/* ---------- the five flows ---------- */

type StepDef = { title: string; body: string; phone: React.ReactNode; android?: boolean; mac?: boolean }

function flow(browser: Browser): StepDef[] {
  switch (browser) {
    case "safari":
      return [
        { title: "Open in Safari", body: "Go to peerfolio.org, then tap the ⋯ next to the address bar.", phone: <><div className="ig-top" /><Shot kind="bottom" /><SafariBar target /></> },
        {
          title: "Tap Share", body: "On older iOS, tap the Share icon in the bottom bar instead.",
          phone: (
            <>
              <div className="ig-top" /><Shot kind="bottom" dim />
              <div className="ig-popover">
                <div className="ig-hit"><span>Share</span><Share aria-hidden size={12} /><Pulse /></div>
                <div><span>New Tab</span><FilePlus2 aria-hidden size={12} /></div>
                <div><span>Add Bookmark</span><BookOpen aria-hidden size={12} /></div>
                <div><span>Find on Page</span><Search aria-hidden size={12} /></div>
              </div>
              <SafariBar />
            </>
          ),
        },
        { title: "Add to Home Screen", body: "Scroll the share sheet, or tap View More, if you don't see it.", phone: <><div className="ig-top" /><ShareSheet /></> },
        { title: "Tap Add", body: "Leave Open as Web App on. Then open Peerfolio from your home screen.", phone: <><div className="ig-top" /><IosAddDialog toggle /></> },
      ]
    case "chrome-ios":
      return [
        { title: "Open in Chrome", body: "Go to peerfolio.org, then tap Share, to the right of the address bar.", phone: <><TopBar kind="chrome-ios" target /><Shot kind="top" /></> },
        { title: "Find Add to Home Screen", body: "Scroll the share sheet down until you see it.", phone: <><div className="ig-top" /><ShareSheet /></> },
        { title: "Tap Add", body: "Confirm the name, then tap Add in the top corner.", phone: <><div className="ig-top" /><IosAddDialog /></> },
        { title: "Open it from your home screen", body: "Use the new Peerfolio icon, not Chrome, for the full-screen app.", phone: <><div className="ig-top" /><Shot kind="standalone" /></> },
      ]
    case "chrome":
      return [
        { android: true, title: "Open in Chrome", body: "Go to peerfolio.org and sign in.", phone: <><TopBar kind="chrome" /><Shot kind="top" /></> },
        { android: true, title: "Tap the menu", body: "The three dots at the top right.", phone: <><TopBar kind="chrome" target /><Shot kind="top" /></> },
        {
          android: true, title: "Install app", body: "Some phones say Add to Home screen instead.",
          phone: (
            <>
              <TopBar kind="chrome" /><Shot kind="top" dim />
              <div className="ig-menu">
                <div className="ig-menu-icons"><Download aria-hidden size={13} /><Star aria-hidden size={13} /><RotateCw aria-hidden size={13} /></div>
                <div>New tab</div><div>New Incognito tab</div><div>History</div>
                <div className="ig-hit"><span>Install app</span><Pulse /></div>
                <div>Settings</div>
              </div>
            </>
          ),
        },
        { android: true, title: "Tap Install", body: "Confirm, then find Peerfolio with your other apps.", phone: <><TopBar kind="chrome" /><AndroidAddDialog title="Install app?" action="Install" /></> },
      ]
    case "samsung":
      return [
        { android: true, title: "Open in Samsung Internet", body: "Go to peerfolio.org, then tap the menu at the bottom right.", phone: <><div className="ig-top" /><Shot kind="bottom" /><SamsungBar target /></> },
        {
          android: true, title: "Tap Add page to", body: "Then choose Home screen.",
          phone: (
            <>
              <div className="ig-top" /><Shot kind="bottom" dim />
              <div className="ig-popover ig-popover-wide">
                <div className="ig-hit"><span>Add page to</span><ChevronDown aria-hidden size={12} /><Pulse /></div>
                <div className="ig-sub-row"><span>Bookmarks</span></div>
                <div className="ig-sub-row"><span>Quick access</span></div>
                <div className="ig-sub-row ig-sub-hit"><span>Home screen</span></div>
                <div><span>Share</span><Share aria-hidden size={12} /></div>
                <div><span>Find in page</span><Search aria-hidden size={12} /></div>
              </div>
              <SamsungBar />
            </>
          ),
        },
        {
          android: true, title: "Tap Add", body: "Leave the name as Peerfolio.",
          phone: (
            <>
              <div className="ig-top" /><Shot kind="bottom" dim />
              <div className="ig-modal ig-modal-mid">
                <b>Add to Home screen</b>
                <div className="ig-dialog-card"><Icon /><span className="ig-field">Peerfolio</span></div>
                <div className="ig-modal-actions"><span>Cancel</span><span className="ig-target ig-modal-go">Add<Pulse /></span></div>
              </div>
              <SamsungBar />
            </>
          ),
        },
        { android: true, title: "Open it from your home screen", body: "Use the new Peerfolio icon.", phone: <><div className="ig-top" /><Shot kind="standalone" /></> },
      ]
    case "chrome-mac":
      return [
        { mac: true, title: "Open in Chrome", body: "Go to peerfolio.org, then click the install icon at the right end of the address bar.", phone: <MacScene><ChromeWindow target /></MacScene> },
        { mac: true, title: "Click Install", body: "Edge works the same way, with Install in its address bar too.", phone: <MacScene><ChromeWindow bubble /></MacScene> },
        { mac: true, title: "Open it from your Dock", body: "Peerfolio now has its own window and icon, in the Dock and Launchpad.", phone: <MacScene app="Peerfolio" dock><AppWindow /></MacScene> },
      ]
    case "safari-mac":
      return [
        { mac: true, title: "Open in Safari", body: "Go to peerfolio.org. This needs macOS Sonoma or newer.", phone: <MacScene app="Safari"><SafariWindow /></MacScene> },
        { mac: true, title: "File, then Add to Dock", body: "Choose Add to Dock… from the File menu.", phone: <MacScene app="Safari" menu={<SafariFileMenu />}><SafariWindow dim /></MacScene> },
        { mac: true, title: "Click Add", body: "Peerfolio appears in your Dock and opens in its own window.", phone: <MacScene app="Safari" dock><SafariWindow dim><AddToDockSheet /></SafariWindow></MacScene> },
      ]
    case "firefox":
      return [
        { android: true, title: "Open in Firefox", body: "Go to peerfolio.org and sign in.", phone: <><TopBar kind="firefox" /><Shot kind="top" /></> },
        { android: true, title: "Tap the menu", body: "The three dots next to the address bar.", phone: <><TopBar kind="firefox" target /><Shot kind="top" /></> },
        {
          android: true, title: "Tap Install", body: "Some versions say Add to Home screen instead.",
          phone: (
            <>
              <TopBar kind="firefox" /><Shot kind="top" dim />
              <div className="ig-menu">
                <div>New tab</div><div>New private tab</div><div>History</div>
                <div className="ig-hit"><span>Install</span><Pulse /></div>
                <div>Settings</div>
              </div>
            </>
          ),
        },
        { android: true, title: "Tap Add", body: "Then find Peerfolio with your other apps.", phone: <><TopBar kind="firefox" /><AndroidAddDialog title="Add to Home screen" action="Add" /></> },
      ]
  }
}

/* ---------- the switcher ---------- */

export function InstallGuide() {
  const [platform, setPlatform] = useState<Platform>("ios")
  const [browser, setBrowser] = useState<Browser>("safari")
  // Wait for device detection so the page never flashes the wrong platform first.
  const [ready, setReady] = useState(false)

  // Start on the visitor's own phone and browser; everyone else sees the iPhone + Safari flow.
  useEffect(() => {
    const ua = navigator.userAgent
    if (/Macintosh|Windows NT|Linux x86_64|CrOS/.test(ua) && !/Android/i.test(ua)) {
      setPlatform("computer")
      setBrowser(/Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua) ? "safari-mac" : "chrome-mac")
    } else if (/Android/i.test(ua)) {
      setPlatform("android")
      setBrowser(/SamsungBrowser/i.test(ua) ? "samsung" : /Firefox/i.test(ua) ? "firefox" : "chrome")
    } else if (/CriOS/.test(ua)) {
      setBrowser("chrome-ios")
    }
    setReady(true)
  }, [])

  function pickPlatform(p: Platform) {
    setPlatform(p)
    setBrowser(BROWSERS[p][0].id)
  }

  const steps = flow(browser)
  return (
    <section aria-label="Install steps" style={{ opacity: ready ? 1 : 0, transition: "opacity 240ms ease" }}>
      <div className="ig-switch">
        <div className="ig-seg" role="tablist" aria-label="Phone">
          {(["ios", "android", "computer"] as const).map((p) => (
            <button key={p} type="button" role="tab" aria-selected={platform === p} onClick={() => pickPlatform(p)}>
              {p === "ios" ? "iPhone" : p === "android" ? "Android" : "Computer"}
            </button>
          ))}
        </div>
        <div className="ig-seg ig-seg-sm" role="tablist" aria-label="Browser">
          {BROWSERS[platform].map((b) => (
            <button key={b.id} type="button" role="tab" aria-selected={browser === b.id} onClick={() => setBrowser(b.id)}>
              {b.label}
            </button>
          ))}
        </div>
      </div>

      <div className={platform === "computer" ? "ig-row ig-row-3" : "ig-row"} key={browser}>
        {steps.map((s, i) => (
          <Step key={s.title} n={i + 1} title={s.title} body={s.body}>
            {s.mac ? s.phone : <Phone android={s.android}>{s.phone}</Phone>}
          </Step>
        ))}
      </div>

      {platform !== "computer" ? (
        <section className="ig-done" aria-labelledby="done">
          <div>
            <h2 id="done">Then it looks like this</h2>
            <p className="ig-sub">
              The Peerfolio icon sits with your other apps. Tap it and it opens full-screen, straight into your dashboard, with no browser bars.
            </p>
          </div>
          <div className="ig-pair">
            <Phone android={platform === "android"}><HomeScreen /></Phone>
            <Phone android={platform === "android"}><Shot kind="standalone" /></Phone>
          </div>
        </section>
      ) : null}
    </section>
  )
}
