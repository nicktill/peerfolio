import { applyWsMessage, type WsBook } from "./sources.ts"

/**
 * Optional Polymarket market-channel WebSocket for the worker. Keeps a per-token top of book fresh between polls.
 * The REST poll stays the source of truth: a token with no young socket book simply falls back to REST, so a dead
 * or flapping socket costs freshness headroom, never correctness.
 *
 * Protocol (verified on a live game): connect, send {"assets_ids":[...],"type":"market"}, send "PING" every 10s,
 * receive book / price_change / best_bid_ask events.
 */
export const WS_URL = "wss://ws-subscriptions-clob.polymarket.com/ws/market"
const PING_MS = 10_000

export class MarketSocket {
  readonly books = new Map<string, WsBook>()
  private socket: WebSocket | null = null
  private ping: ReturnType<typeof setInterval> | null = null
  private retry: ReturnType<typeof setTimeout> | null = null
  private subscribed = new Set<string>()
  private wanted = new Set<string>()
  private attempts = 0
  private closed = false
  private readonly log: (msg: string) => void
  private readonly url: string

  constructor(log: (msg: string) => void = () => {}, url: string = WS_URL) {
    this.log = log
    this.url = url
  }

  /** Declares the tokens to stream. A changed set reconnects (cheap, and avoids relying on undocumented incremental subscribe). */
  want(tokens: string[]): void {
    const next = new Set(tokens)
    const same = next.size === this.wanted.size && [...next].every((t) => this.wanted.has(t))
    this.wanted = next
    for (const t of [...this.books.keys()]) if (!next.has(t)) this.books.delete(t)
    if (this.closed || same) return
    if (next.size === 0) return this.disconnect()
    if (!this.socket) this.connect()
    else if (this.socket.readyState === WebSocket.OPEN) this.subscribe()
  }

  private subscribe(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return
    // A new token set replaces the subscription by reconnecting; an identical one is a no-op.
    const same = this.wanted.size === this.subscribed.size && [...this.wanted].every((t) => this.subscribed.has(t))
    if (same) return
    if (this.subscribed.size > 0) {
      this.socket.close()
      return
    }
    this.socket.send(JSON.stringify({ assets_ids: [...this.wanted], type: "market" }))
    this.subscribed = new Set(this.wanted)
  }

  private connect(): void {
    if (this.closed || this.socket) return
    const ws = new WebSocket(this.url)
    this.socket = ws
    ws.onopen = () => {
      this.attempts = 0
      this.subscribed = new Set()
      this.subscribe()
      this.ping = setInterval(() => {
        try {
          ws.send("PING")
        } catch {
          /* closed: onclose handles it */
        }
      }, PING_MS)
    }
    ws.onmessage = (event) => {
      const text = typeof event.data === "string" ? event.data : ""
      if (!text || text === "PONG") return
      try {
        applyWsMessage(this.books, JSON.parse(text))
      } catch {
        /* non-JSON frame */
      }
    }
    ws.onerror = () => this.log("polymarket ws error")
    ws.onclose = () => {
      if (this.ping) clearInterval(this.ping)
      this.ping = null
      this.socket = null
      this.subscribed = new Set()
      if (this.closed || this.wanted.size === 0) return
      const delay = Math.min(30_000, 1000 * 2 ** Math.min(this.attempts++, 5)) + Math.random() * 500
      this.retry = setTimeout(() => this.connect(), delay)
    }
  }

  private disconnect(): void {
    if (this.retry) clearTimeout(this.retry)
    this.retry = null
    this.socket?.close()
  }

  close(): void {
    this.closed = true
    this.disconnect()
  }
}
