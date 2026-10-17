/**
 * Structured one-line JSON logs for the live layer and the pick path, in the style of the cron summaries
 * (`{"job": ..., "at": ...}` through console.info/warn/error). Never pass secrets or whole upstream payloads:
 * free text is clipped to 300 characters.
 */
export type Level = "info" | "warn" | "error"
export type Fields = Record<string, unknown>
export type Sink = (level: Level, line: string) => void

export const CLIP = 300

/** Truncates any value's printed form to a short sample (for error messages and raw upstream snippets). */
export function clip(value: unknown, max = CLIP): string {
  const s = typeof value === "string" ? value : value instanceof Error ? value.message : JSON.stringify(value) ?? String(value)
  return s.length > max ? `${s.slice(0, max)}...(+${s.length - max})` : s
}

const consoleSink: Sink = (level, line) => {
  if (level === "error") console.error(line)
  else if (level === "warn") console.warn(line)
  else console.info(line)
}

/** `ev` is the event name, e.g. "live.cycle". Fields are merged after `at`, `level` and `ev`. */
export function logLine(level: Level, ev: string, fields: Fields = {}, now: Date = new Date()): string {
  return JSON.stringify({ at: now.toISOString(), level, ev, ...fields })
}

export function emit(level: Level, ev: string, fields: Fields = {}, sink: Sink = consoleSink, now: Date = new Date()): void {
  sink(level, logLine(level, ev, fields, now))
}
