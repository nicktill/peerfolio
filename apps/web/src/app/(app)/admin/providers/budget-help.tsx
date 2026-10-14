import { HelpCircle } from "lucide-react"
import { Card, CardContent } from "@web/components/ui/card"
import { BUDGET_DEFAULTS, PROVIDER_LIMITS } from "@web/lib/provider-stats-core"

const per = (p: { amount: number; per: "minute" | "hour" }) => `${p.amount.toLocaleString("en-US")}/${p.per === "hour" ? "hr" : "min"}`

/** A short explanation of how the shared request budget works and what the counters mean. */
export function BudgetHelp() {
  return (
    <Card>
      <CardContent className="pt-5">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-medium [&::-webkit-details-marker]:hidden"><HelpCircle aria-hidden className="size-4" />How the budget works</summary>
          <div className="mt-3 space-y-3 text-sm text-muted-foreground">
            <p>Every provider has one token bucket, kept in Postgres and shared by all servers. Each request spends a token before it is sent (failures too). Tokens refill continuously at <em>per minute</em> up to <em>burst</em>, so any 60 seconds hold at most burst + per minute requests. The cap is set below what each provider allows, for headroom.</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[26rem] text-left">
                <thead className="text-xs uppercase tracking-wide"><tr><th className="py-1 pr-3 font-medium">Provider</th><th className="py-1 pr-3 font-medium">Our refill</th><th className="py-1 pr-3 font-medium">Burst</th><th className="py-1 pr-3 font-medium">Max in 60s</th><th className="py-1 font-medium">Provider allows</th></tr></thead>
                <tbody>
                  {(Object.keys(BUDGET_DEFAULTS) as (keyof typeof BUDGET_DEFAULTS)[]).map((name) => {
                    const b = BUDGET_DEFAULTS[name]
                    const hourly = PROVIDER_LIMITS[name]?.per === "hour"
                    return (
                      <tr key={name} className="border-t">
                        <td className="py-1.5 pr-3 capitalize text-foreground">{name}</td>
                        <td className="numeric py-1.5 pr-3">{hourly ? `${Math.round(b.perMinute * 60)}/hr` : `${b.perMinute}/min`}</td>
                        <td className="numeric py-1.5 pr-3">{b.burst}</td>
                        <td className="numeric py-1.5 pr-3">{Math.floor(b.burst + b.perMinute)}</td>
                        <td className="numeric py-1.5">{PROVIDER_LIMITS[name] ? per(PROVIDER_LIMITS[name]) : "–"}{name === "tiingo" ? " · 1,000/day" : ""}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <ul className="list-disc space-y-1 pl-5">
              <li><strong className="text-foreground">Denied</strong>: our own limiter refused it. No request was sent; the caller leaves that work for a later run.</li>
              <li><strong className="text-foreground">Rate limited</strong>: the provider answered 429. Every server then pauses that provider for the time it asked.</li>
              <li><strong className="text-foreground">Failed</strong>: the provider answered an error, or the request threw (network error, timeout).</li>
            </ul>
          </div>
        </details>
      </CardContent>
    </Card>
  )
}
