// Demo data for portfolio performance - expanded with more data points
export const portfolioData = [
  // 2 years ago
  { date: "2023-01", value: 38000, month: "Jan '23" },
  { date: "2023-02", value: 39200, month: "Feb '23" },
  { date: "2023-03", value: 37800, month: "Mar '23" },
  { date: "2023-04", value: 40100, month: "Apr '23" },
  { date: "2023-05", value: 41300, month: "May '23" },
  { date: "2023-06", value: 40800, month: "Jun '23" },
  { date: "2023-07", value: 42600, month: "Jul '23" },
  { date: "2023-08", value: 41200, month: "Aug '23" },
  { date: "2023-09", value: 43800, month: "Sep '23" },
  { date: "2023-10", value: 44200, month: "Oct '23" },
  { date: "2023-11", value: 45500, month: "Nov '23" },
  { date: "2023-12", value: 46200, month: "Dec '23" },
  // Last year (2024)
  { date: "2024-01", value: 45000, month: "Jan '24" },
  { date: "2024-02", value: 47200, month: "Feb '24" },
  { date: "2024-03", value: 44800, month: "Mar '24" },
  { date: "2024-04", value: 49100, month: "Apr '24" },
  { date: "2024-05", value: 52300, month: "May '24" },
  { date: "2024-06", value: 51800, month: "Jun '24" },
  { date: "2024-07", value: 54600, month: "Jul '24" },
  { date: "2024-08", value: 53200, month: "Aug '24" },
  { date: "2024-09", value: 56800, month: "Sep '24" },
  { date: "2024-10", value: 59200, month: "Oct '24" },
  { date: "2024-11", value: 61500, month: "Nov '24" },
  { date: "2024-12", value: 64200, month: "Dec '24" },
  // This year (2025)
  { date: "2025-01", value: 63800, month: "Jan" },
  { date: "2025-02", value: 65200, month: "Feb" },
  { date: "2025-03", value: 67100, month: "Mar" },
  { date: "2025-04", value: 66800, month: "Apr" },
  { date: "2025-05", value: 69200, month: "May" },
  { date: "2025-06", value: 72500, month: "Jun" },
]

// Demo connected accounts
export const connectedAccounts = [
  {
    id: "1",
    name: "Robinhood",
    type: "Investment",
    balance: 28500,
    percentage: 44.4,
    logo: "https://logo.clearbit.com/robinhood.com",
    lastSync: "2 minutes ago",
    holdings: [
      { symbol: "AAPL", name: "Apple Inc.", value: 8500, shares: 45, change: 2.4 },
      { symbol: "TSLA", name: "Tesla Inc.", value: 6200, shares: 25, change: -5.2 },
      { symbol: "NVDA", name: "NVIDIA Corp.", value: 4800, shares: 12, change: 8.7 },
      { symbol: "SPY", name: "SPDR S&P 500 ETF", value: 9000, shares: 20, change: 1.8 },
    ],
  },
  {
    id: "2",
    name: "Fidelity",
    type: "Investment",
    balance: 22400,
    percentage: 34.9,
    logo: "https://logo.clearbit.com/fidelity.com",
    lastSync: "5 minutes ago",
    holdings: [
      { symbol: "VTI", name: "Vanguard Total Stock Market ETF", value: 12400, shares: 50, change: 3.2 },
      { symbol: "AMZN", name: "Amazon.com Inc.", value: 6000, shares: 35, change: -1.9 },
      { symbol: "GOOGL", name: "Alphabet Inc.", value: 4000, shares: 25, change: 4.6 },
    ],
  },
  {
    id: "3",
    name: "Charles Schwab",
    type: "401(k)",
    balance: 13300,
    percentage: 20.7,
    logo: "https://logo.clearbit.com/schwab.com",
    lastSync: "1 hour ago",
    holdings: [
      { symbol: "VTIAX", name: "Vanguard Total International Stock Index Fund", value: 6650, shares: 150 },
      { symbol: "VTSAX", name: "Vanguard Total Stock Market Index Fund", value: 6650, shares: 60 },
    ],
  },
]

// Demo asset allocation data
export const assetAllocation = [
  { name: "US Stocks", value: 32100, percentage: 50.0, color: "#3b82f6" },
  { name: "International Stocks", value: 12840, percentage: 20.0, color: "#10b981" },
  { name: "Bonds", value: 9630, percentage: 15.0, color: "#f59e0b" },
  { name: "Real Estate", value: 6420, percentage: 10.0, color: "#ef4444" },
  { name: "Cash", value: 3210, percentage: 5.0, color: "#6b7280" },
]
