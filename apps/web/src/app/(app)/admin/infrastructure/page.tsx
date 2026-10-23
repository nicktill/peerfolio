"use client"

import { useApi } from "@web/lib/use-api"
import type { BudgetReport } from "@web/lib/infrastructure-budget"

const number = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 2 })
export default function InfrastructurePage() {
  const { data, error, loading, refetch } = useApi<BudgetReport>("/api/admin/infrastructure")
  return <div className="space-y-6">
    <div className="flex items-center justify-between gap-4"><h1 className="font-display text-2xl">Infrastructure budgets</h1><button className="rounded-lg border px-3 py-2 text-sm" disabled={loading} onClick={() => void refetch()}>Refresh</button></div>
    <p className="text-sm text-muted-foreground">Monthly budget readings for the configured scope. Watch at 60%, warning at 75%, critical at 90%. Forecasts use the period average and can change after traffic or scheduling changes.</p>
    {error ? <p role="alert" className="text-loss-ink">Readings unavailable: {error}. Budget safety is unknown.</p> : null}
    {loading && !data ? <p role="status">Loading budget readings…</p> : null}
    {data ? <>
      <p role={data.failed ? "alert" : "status"} className="rounded-xl border p-4">{data.failed ? "Attention required: a budget is at risk or monitoring is incomplete." : "All configured readings are current and within budget."}</p>
      {data.metrics.map(metric => <section key={metric.name} className="space-y-2 rounded-xl border p-4">
        <h2 className="font-medium">{metric.name} · {metric.status}</h2><p className="text-sm">{metric.message}</p>
        {metric.snapshot ? <>
          <p className="numeric text-lg">{number(metric.snapshot.used)} / {number(metric.snapshot.limit)} {metric.snapshot.unit} ({number(metric.percent ?? 0)}%)</p>
          <p className="break-all text-xs text-muted-foreground">Scope: {metric.snapshot.scope}. Source: {metric.snapshot.source === "console" ? "Verified console snapshot" : "Neon project counter estimate; may lag billing"}.</p>
          <p className="text-xs text-muted-foreground">Observed {new Date(metric.snapshot.observedAt).toLocaleString()}; period ends {new Date(metric.snapshot.periodEnd).toLocaleString()}.</p>
          {metric.forecast != null ? <p className="text-sm">Period-end estimate: {number(metric.forecast)} {metric.snapshot.unit}. Remaining runway at the observed average: {metric.runwayDays == null ? "no consumption observed" : `${number(metric.runwayDays)} days`}.</p> : <p className="text-sm">Forecast available after the first day of the period.</p>}
        </> : <p className="text-sm text-muted-foreground">No reliable usage number available. Configure or refresh monitoring; this is not zero usage.</p>}
      </section>)}
      <p className="text-xs text-muted-foreground">Checked {new Date(data.checkedAt).toLocaleString()}. Server readings cache for five minutes. These monitors do not block picks or change refresh rates.</p>
    </> : null}
  </div>
}
