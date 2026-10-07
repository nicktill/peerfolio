/** Investment equity may be negative when margin liabilities exceed assets. */
export function accountBalance(value: number, category: string): number {
  return category === "investment" ? value : Math.abs(value)
}
