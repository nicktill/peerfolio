/** Typed confirmation for disconnecting a brokerage: forgiving of case and stray spaces, never of a different name. */
export function disconnectNameMatches(typed: string, institutionName: string): boolean {
  const norm = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase()
  const expected = norm(institutionName)
  return expected !== "" && norm(typed) === expected
}
