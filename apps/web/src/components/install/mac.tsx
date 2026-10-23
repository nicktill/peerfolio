import Image from "next/image"
import type React from "react"
import { ChevronLeft, ChevronRight, Lock, MonitorDown, Plus, RotateCw, Share, Star, PanelLeft, Copy } from "lucide-react"
import { Pulse } from "@web/components/install/phone"

const HOST = "peerfolio.org"

/**
 * A Mac desktop at 520x372, drawn at that size and scaled down by CSS so type and borders stay crisp. The wallpaper,
 * menu bar, window and Dock are all in place; `children` are the window, the open menu or the sheet on top.
 */
export function MacScene({ app = "Chrome", menu, children, dock }: { app?: string; menu?: React.ReactNode; children: React.ReactNode; dock?: boolean }) {
  return (
    <div className="mac" aria-hidden>
      <div className="mac-in">
        <div className="mac-bar">
          <b></b><b>{app}</b>
          {["File", "Edit", "View", "History", "Window", "Help"].map((m) => <span key={m} className={menu && m === "File" ? "mac-open" : undefined}>{m}</span>)}
          <i>Fri 9:41</i>
        </div>
        {menu}
        {children}
        <div className={dock ? "mac-dock" : "mac-dock mac-dock-quiet"}>
          {["#8aa4c8", "#c9a36b", "#7fae95", "#b88aa8"].map((c) => <span key={c} style={{ background: c }} />)}
          {dock ? (
            <span className="mac-dock-pf">
              <Image src="/icons/icon-192.png" alt="" width={34} height={34} />
              <Pulse />
            </span>
          ) : null}
          {["#8d8fb8", "#c78a80"].map((c) => <span key={c} style={{ background: c }} />)}
        </div>
      </div>
    </div>
  )
}

function Lights() {
  return <span className="mac-lights"><i /><i /><i /></span>
}

export function DesktopShot({ app }: { app?: boolean }) {
  return (
    <div className={app ? "mac-shot mac-shot-app" : "mac-shot"}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="ig-img-light" src="/install/desktop-light.jpg" alt="" width={1200} height={720} decoding="async" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="ig-img-dark" src="/install/desktop-dark.jpg" alt="" width={1200} height={720} decoding="async" />
    </div>
  )
}

/** Chrome (and Edge, which looks the same): tab strip over an address bar; the install icon sits at the right of the address. */
export function ChromeWindow({ target, bubble }: { target?: boolean; bubble?: boolean }) {
  return (
    <div className="mac-win">
      <div className="mac-tabs">
        <Lights />
        <span className="mac-tab"><Image src="/icons/icon-192.png" alt="" width={12} height={12} />Peerfolio</span>
        <Plus aria-hidden size={12} />
      </div>
      <div className="mac-addr">
        <ChevronLeft aria-hidden size={13} /><ChevronRight aria-hidden size={13} /><RotateCw aria-hidden size={11} />
        <span className="mac-url">
          <Lock aria-hidden size={9} />{HOST}
          <span className="mac-inst"><span className={target ? "mac-t" : undefined}><MonitorDown aria-hidden size={13} />{target ? <Pulse /> : null}</span><Star aria-hidden size={12} /></span>
        </span>
        <span className="mac-avatar" />
      </div>
      <DesktopShot />
      {bubble ? (
        <div className="mac-pop">
          <b>Install app?</b>
          <div className="mac-pop-row"><Image src="/icons/icon-192.png" alt="" width={26} height={26} /><span><em>Peerfolio</em><small>{HOST}</small></span></div>
          <div className="mac-pop-act"><span>Cancel</span><span className="mac-btn">Install<Pulse /></span></div>
        </div>
      ) : null}
    </div>
  )
}

/** Safari on Mac: one toolbar row with the address centred. */
export function SafariWindow({ dim, children }: { dim?: boolean; children?: React.ReactNode }) {
  return (
    <div className="mac-win">
      <div className="mac-safari">
        <Lights />
        <PanelLeft aria-hidden size={13} /><ChevronLeft aria-hidden size={13} /><ChevronRight aria-hidden size={13} />
        <span className="mac-url mac-url-c"><Lock aria-hidden size={9} />{HOST}</span>
        <Share aria-hidden size={12} /><Copy aria-hidden size={12} /><Plus aria-hidden size={12} />
      </div>
      <DesktopShot />
      {dim ? <span className="mac-dim" /> : null}
      {children}
    </div>
  )
}

/** The File menu with Add to Dock highlighted. */
export function SafariFileMenu() {
  return (
    <div className="mac-menu">
      <div>New Window<kbd>⌘N</kbd></div>
      <div>New Tab<kbd>⌘T</kbd></div>
      <div>Open File…<kbd>⌘O</kbd></div>
      <div>Close Window<kbd>⌘W</kbd></div>
      <div className="mac-sep" />
      <div>Share<kbd>▸</kbd></div>
      <div className="mac-hit">Add to Dock…<Pulse /></div>
      <div>Print…<kbd>⌘P</kbd></div>
    </div>
  )
}

export function AddToDockSheet() {
  return (
    <div className="mac-sheet">
      <Image src="/icons/icon-192.png" alt="" width={44} height={44} />
      <b>Add to Dock</b>
      <div className="mac-field">Peerfolio</div>
      <small>{HOST}</small>
      <div className="mac-pop-act"><span>Cancel</span><span className="mac-btn">Add<Pulse /></span></div>
    </div>
  )
}

/** The installed app: its own window, no browser bars, only a title bar. */
export function AppWindow() {
  return (
    <div className="mac-win mac-win-app">
      <div className="mac-titlebar"><Lights /><span>Peerfolio</span></div>
      <DesktopShot app />
    </div>
  )
}
