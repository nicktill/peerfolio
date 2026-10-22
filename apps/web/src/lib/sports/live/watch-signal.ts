/**
 * Worker side of the watch signal (see watch.ts): remembers the last mark and reports when it changes. The first answer only sets
 * the baseline, and a failed poll (null) never counts as a change, so an outage leaves the worker on its normal slot schedule. Pure.
 */
export const WATCH_POLL_MS = 30_000

export class WatchSignal {
  private last: string | null = null
  private readonly poll: () => Promise<string | null>
  constructor(poll: () => Promise<string | null>) {
    this.poll = poll
  }

  /** True when someone opened sports since the previous poll. */
  async changed(): Promise<boolean> {
    const mark = await this.poll().catch(() => null)
    if (mark == null) return false
    const before = this.last
    this.last = mark
    return before != null && before !== mark
  }
}
