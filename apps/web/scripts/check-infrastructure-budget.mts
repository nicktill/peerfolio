import { readInfrastructureBudget } from "../src/lib/infrastructure-budget-reader.ts"

const report = await readInfrastructureBudget(process.env)
for (const metric of report.metrics) {
  const details = metric.snapshot ? ` ${metric.snapshot.used.toFixed(2)}/${metric.snapshot.limit} ${metric.snapshot.unit}; ${metric.percent?.toFixed(1)}%; source=${metric.snapshot.source}` : ""
  // Provider error bodies and credentials are deliberately never logged.
  console.log(`${metric.name}: ${metric.status}.${details} ${metric.message}`)
  if (metric.forecast != null) console.log(`  Period-end estimate: ${metric.forecast.toFixed(2)}; remaining runway: ${metric.runwayDays?.toFixed(1) ?? "unknown"} days (period-average pace).`)
}
if (report.failed) {
  console.error("Infrastructure budget check needs attention. Open Admin > Infrastructure; unknown readings fail closed.")
  process.exitCode = 1
}
