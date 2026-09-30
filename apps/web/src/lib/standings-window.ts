/**
 * Which standings rows to show. A small league shows everyone. Only a league
 * well past `collapseOver` folds, and then it keeps the top `preview` plus your
 * own row, so you can always find yourself.
 */
export function visibleStandings<T extends { isYou: boolean }>(
  rows: T[],
  { expanded, collapseOver = 12, preview = 10 }: { expanded: boolean; collapseOver?: number; preview?: number },
): { rows: T[]; hidden: number } {
  if (expanded || rows.length <= collapseOver) return { rows, hidden: 0 }
  const top = rows.slice(0, preview)
  const you = rows.find((r) => r.isYou)
  const shown = you && !top.includes(you) ? [...top, you] : top
  return { rows: shown, hidden: rows.length - shown.length }
}
