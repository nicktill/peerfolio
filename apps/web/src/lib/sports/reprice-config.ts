/** Thresholds of the pregame exchange repricer. A plain constant with no imports, so pure modules on either side can share it. */

export const REPRICE = {
  /** Freshest read we accept: our fetch of the book must be this young. */
  maxAgeMs: 60_000,
  /** Widest best-bid/best-ask gap (probability points) we price from. */
  maxSpread: 0.03,
  /** Least size (shares) resting at BOTH best levels of BOTH outcome books; a thin top of book is cheap to move. */
  minTopSize: 200,
  /**
   * Soccer three-way legs (home / draw / away YES books). Favourite and underdog legs of MLS games often rest only 25-100 shares
   * at the touch while the draw leg is deep, so 200 per leg hid Winner for most of a slate. 50 shares per leg still needs a
   * real resting order on both sides of every leg, and the three legs together must show `minTopSizeThreeWayTotal`, so one
   * thin leg can only pass when the rest of the triple is deep. Spread, read age, book timestamp, sum-to-1, cross-source
   * disagreement and price range gates are unchanged, and the pricing margin is applied downstream and not touched.
   */
  minTopSizeThreeWay: 50,
  minTopSizeThreeWayTotal: 200,
  /** Fair probabilities outside [minFair, 1 - minFair] are never repriced (a stale longshot price is the costliest): the market freezes. */
  minFair: 0.15,
  /** A book's own timestamp older than this is a stuck feed even if we just fetched it. */
  maxBookTsAgeMs: 10 * 60_000,
  /** Polymarket and Kalshi further apart than this: skip (hold the current line). */
  disagree: 0.05,
  /** Move the line only when the fair probability drifted at least this far from the last priced basis. */
  minMove: 0.015,
  /** At most one line write per market in this interval. */
  minIntervalMs: 30_000,
  /** One reprice may not move fair probability more than this; a bigger jump freezes the market instead. */
  maxStep: 0.04,
  /** Total range of fair probability over the last hour above this freezes the market. */
  hourRange: 0.15,
  hourMs: 3_600_000,
  /** First exchange contact: the published (consensus) basis and the exchange may differ by this much ONLY when Polymarket and Kalshi agree; otherwise `maxStep` applies. */
  firstContactMax: 0.12,
  /** A market the exchange manages freezes if no good exchange read arrives for this long. */
  staleFreezeMs: 10 * 60_000,
  /** Re-stamp `exchange_ok_at` at most this often when nothing moved. */
  confirmEveryMs: 2 * 60_000,
  /** Only games starting within this window are repriced at the fast cadence (keeps a serverless DB able to sleep). */
  windowMs: 3 * 3_600_000,
  /**
   * Pass cadence inside the window, and outside it (further-out games still get a slower pass while the worker is up). The far pass
   * runs on the shared quarter-hour slot (live/slots.ts) so it shares an awake period with the publish and settle routes; it must stay
   * well under `workerDeadMs`, since every worker cycle writes the heartbeat the guard checks.
   */
  passMs: 30_000,
  farPassMs: 15 * 60_000,
  /** The publish/guard cron stops trusting an exchange-managed market, and freezes it inside `windowMs` of the start, when the worker heartbeat is older than this. */
  workerDeadMs: 20 * 60_000,
} as const
