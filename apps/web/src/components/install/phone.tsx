import Image from "next/image"
import type React from "react"

/** A phone frame with a status bar and home indicator. The screen is a flex column so a browser bar sits above or below the page. */
export function Phone({ children, android }: { children: React.ReactNode; android?: boolean }) {
  return (
    <div className={android ? "ig-phone ig-android" : "ig-phone"} aria-hidden>
      <span className="ig-btn ig-btn-a" />
      <span className="ig-btn ig-btn-b" />
      <span className="ig-btn ig-btn-c" />
      <div className="ig-screen">
        <div className="ig-status">
          <span className="ig-time">9:41</span>
          <span className="ig-sys">
            <svg width="16" height="10" viewBox="0 0 16 10" fill="currentColor"><rect x="0" y="6" width="3" height="4" rx="0.8" /><rect x="4.3" y="4" width="3" height="6" rx="0.8" /><rect x="8.6" y="2" width="3" height="8" rx="0.8" /><rect x="12.9" y="0" width="3" height="10" rx="0.8" /></svg>
            <svg width="14" height="10" viewBox="0 0 14 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M1 3.6a8.5 8.5 0 0 1 12 0" /><path d="M3.2 6a5.4 5.4 0 0 1 7.6 0" /><circle cx="7" cy="8.4" r="0.9" fill="currentColor" stroke="none" /></svg>
            <svg width="24" height="11" viewBox="0 0 24 11" fill="none"><rect x="0.5" y="0.5" width="20" height="10" rx="3" stroke="currentColor" opacity="0.45" /><rect x="2" y="2" width="15" height="7" rx="1.6" fill="currentColor" /><path d="M22 3.8v3.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.5" /></svg>
          </span>
        </div>
        <div className="ig-island" />
        {children}
        <span className="ig-homebar" />
      </div>
    </div>
  )
}

/** The tap target ring. Transform and opacity only, and still under reduced motion. */
export function Pulse() {
  return <span className="ig-pulse" aria-hidden />
}

export function Step({ n, title, body, children }: { n: number; title: string; body: string; children: React.ReactNode }) {
  return (
    <figure className="ig-step">
      {children}
      <figcaption>
        <span className="ig-n">{n}</span>
        <span className="ig-t">{title}</span>
        <span className="ig-b">{body}</span>
      </figcaption>
    </figure>
  )
}

const SPARK = "M0 30 L12 26 L24 28 L36 20 L48 22 L60 13 L72 16 L84 8 L96 10 L108 3"

/** A miniature of the signed-in app, drawn with the real tokens so the mockups look like the product. */
export function AppScreen({ dim }: { dim?: boolean; top?: boolean }) {
  return (
    <div className="ig-app">
      <div className="ig-app-head">
        <Image src="/logo.png" alt="" width={14} height={14} className="pf-logo" />
        <span>Peerfolio</span>
      </div>
      <div className="ig-app-body">
        <span className="ig-eyebrow">This year</span>
        <span className="ig-big">+12.4%</span>
        <svg viewBox="0 0 108 34" className="ig-spark" preserveAspectRatio="none">
          <path d={SPARK} fill="none" stroke="var(--pf-accent)" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
        <div className="ig-rows">
          <div><span>Weekend League</span><b>#2</b></div>
          <div><span>Fantasy stocks</span><b className="ig-gain">+3.1%</b></div>
          <div><span>Sports picks</span><b>#1</b></div>
        </div>
      </div>
      {dim && <span className="ig-dim" />}
    </div>
  )
}

const FILLER = ["#8aa4c8", "#c9a36b", "#7fae95", "#b88aa8", "#8d8fb8", "#c78a80", "#7ba7b3", "#a8b07a", "#9c8f7e", "#6f86a3", "#b99c6f"]

export function HomeScreen() {
  const cells = [...FILLER.slice(0, 5), "peerfolio", ...FILLER.slice(5)]
  return (
    <div className="ig-home">
      <span className="ig-clock">Friday, October 23</span>
      <div className="ig-grid">
        {cells.map((c, i) =>
          c === "peerfolio" ? (
            <span key={i} className="ig-cell ig-cell-pf">
              <Image src="/icons/icon-192.png" alt="" width={40} height={40} className="ig-pficon" />
              <i>Peerfolio</i>
              <Pulse />
            </span>
          ) : (
            <span key={i} className="ig-cell"><span className="ig-fake" style={{ background: c }} /><i /></span>
          ),
        )}
      </div>
    </div>
  )
}
