/** Match directional cues and ties to the precision shown to the reader. */
export function visibleReturn(value: number, digits = 2): number {
  const rounded = Number(Math.abs(value).toFixed(digits))
  return rounded === 0 ? 0 : Math.sign(value) * rounded
}

/** Indexed returns use a shared baseline and at least one percentage point of range. */
export function indexedDomain(points: number[]): { lo: number; hi: number } {
  const finite = points.filter(Number.isFinite)
  const min = Math.min(100, ...finite)
  const max = Math.max(100, ...finite)
  const center = (min + max) / 2
  const span = Math.max(1, max - min) * 1.2
  return { lo: center - span / 2, hi: center + span / 2 }
}

/** Competition ranks: members with the same displayed return share a rank. */
export function rankReturns<T extends { percent: number }>(members: T[]): (T & { rank: number })[] {
  const sorted = [...members].sort((a, b) => visibleReturn(b.percent) - visibleReturn(a.percent))
  let rank = 1
  return sorted.map((member, i) => {
    if (i > 0 && visibleReturn(member.percent) !== visibleReturn(sorted[i - 1]!.percent)) rank = i + 1
    return { ...member, rank }
  })
}
