/**
 * The assistant streams one JSON object per line. Chunks can end anywhere, so the
 * unfinished tail of the buffer is carried to the next read. Blank and malformed
 * lines are skipped rather than failing the turn.
 */
export function parseStreamChunk<T = { type: string }>(buffer: string, chunk: string): { events: T[]; rest: string } {
  const lines = (buffer + chunk).split("\n")
  const rest = lines.pop() ?? ""
  const events: T[] = []
  for (const line of lines) {
    if (!line.trim()) continue
    try {
      const parsed: unknown = JSON.parse(line)
      if (parsed && typeof parsed === "object" && typeof (parsed as { type?: unknown }).type === "string") events.push(parsed as T)
    } catch {
      continue
    }
  }
  return { events, rest }
}
