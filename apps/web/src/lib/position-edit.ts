/** Keep imported precision when opening the editor; currency formatting is display-only. */
export function averageCostInput(position: { costBasis: number | null; quantity: number } | null): string {
  return position?.costBasis != null && position.quantity > 0
    ? String(position.costBasis / position.quantity)
    : ""
}

/** Omission asks the server to preserve the stored average, including during quantity edits. */
export function averageCostUpdate(value: string, initial?: string): number | null | undefined {
  if (initial !== undefined && value.trim() === initial.trim()) return undefined
  return value.trim() ? Number(value) : null
}
