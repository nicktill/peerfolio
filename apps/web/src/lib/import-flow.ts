/** Keep account routing stable even if the user removes every row from a group. */
export function hasMultipleImportAccounts(rows: readonly { account: string | null }[]): boolean {
  return new Set(rows.map((row) => row.account ?? "")).size > 1
}

/** Updating the same symbol twice in one destination would silently lose a holding. */
export function duplicateImportDestination(labels: readonly string[], destinations: Record<string, string>): boolean {
  const selected = labels.map((label) => destinations[label] ?? "new").filter((id) => id !== "new")
  return new Set(selected).size !== selected.length
}
