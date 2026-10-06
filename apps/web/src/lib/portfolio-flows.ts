/** Provider-only logic stays independently testable. Never publish a partial page. */
export type InvestmentFlow = { investment_transaction_id: string; date: string; amount: number; subtype?: string | null; type: string }
export async function investmentFlowPages(fetchPage: (offset: number) => Promise<{ investment_transactions: InvestmentFlow[]; total_investment_transactions: number }>): Promise<InvestmentFlow[]> {
  const out: InvestmentFlow[] = []
  let offset = 0
  for (let page = 0; page < 100; page++) {
    const data = await fetchPage(offset)
    out.push(...data.investment_transactions)
    offset += data.investment_transactions.length
    if (offset >= data.total_investment_transactions) return out
    if (!data.investment_transactions.length) throw new Error("Incomplete Plaid transaction page")
  }
  throw new Error("Plaid transaction history exceeded bounded page limit")
}
export function externalAmount(tx: InvestmentFlow): number | null {
  const external = new Set(["deposit", "withdrawal", "contribution", "distribution", "rollover", "transfer"])
  return external.has(String(tx.subtype ?? "").toLowerCase()) || tx.type.toLowerCase() === "transfer" ? -tx.amount : null
}
