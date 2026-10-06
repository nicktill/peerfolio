/** Skipped/deferred work is not an outage; explicit failure is. */
export function priceJobHealthy(
  live: { error?: string; claimed?: number; refreshed?: number },
  closes: { failed?: boolean },
  metadata: { error?: string; reason?: string },
  orders: { error?: string; pending?: number },
): boolean {
  return !live.error && !(Number(live.claimed ?? 0) > 0 && live.refreshed === 0)
    && !closes.failed && !metadata.error && metadata.reason !== "provider_error" && !orders.error
}
