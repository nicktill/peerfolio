/**
 * About 200 of the largest, most-traded US stocks: the pool "biggest movers today" is ranked from.
 * A hand-kept list, not an index's official membership (that is licensed data), so the assistant
 * calls it "large caps" and never "the S&P 500". A symbol the provider doesn't know is simply skipped.
 */
export const LARGE_CAPS = [
  "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "GOOG", "META", "TSLA", "AVGO", "BRK.B", "JPM", "LLY", "V", "UNH", "XOM",
  "MA", "COST", "HD", "PG", "JNJ", "ORCL", "WMT", "NFLX", "BAC", "ABBV", "CRM", "CVX", "KO", "AMD", "MRK",
  "PEP", "TMO", "ADBE", "LIN", "WFC", "ACN", "MCD", "CSCO", "ABT", "DIS", "GE", "IBM", "PM", "TXN", "QCOM",
  "CAT", "VZ", "INTU", "AMGN", "ISRG", "DHR", "NOW", "UBER", "AMAT", "GS", "RTX", "SPGI", "CMCSA", "T", "NEE",
  "PFE", "AXP", "BKNG", "LOW", "HON", "UNP", "MS", "PGR", "BLK", "ETN", "COP", "TJX", "SYK", "BSX", "LMT",
  "VRTX", "C", "ADP", "PANW", "MU", "SCHW", "MDT", "ADI", "DE", "GILD", "BMY", "CB", "MMC", "LRCX",
  "KLAC", "SBUX", "ANET", "INTC", "PLD", "AMT", "UPS", "MO", "SO", "NKE", "TMUS", "ELV", "CI", "DUK", "ICE",
  "SHW", "MDLZ", "CME", "CL", "ZTS", "WM", "APH", "CDNS", "SNPS", "MCK", "REGN", "PYPL", "TT", "MAR", "ORLY",
  "CMG", "ABNB", "CRWD", "WDAY", "FTNT", "ROP", "ECL", "EMR", "ITW", "NOC", "GD", "FDX", "CSX", "NSC", "AON",
  "USB", "PNC", "TFC", "COF", "MET", "PRU", "AIG", "TRV", "ALL", "F", "GM", "DAL", "UAL", "LUV", "AAL",
  "PLTR", "COIN", "SHOP", "SNOW", "DDOG", "NET", "MRVL", "ON", "SMCI", "ARM", "DELL", "HPQ", "WDC", "STX",
  "SLB", "EOG", "OXY", "PSX", "MPC", "VLO", "HAL", "FCX", "NEM", "DOW", "DD", "TGT", "DG", "DLTR",
  "LULU", "ROST", "YUM", "DPZ", "EL", "KMB", "GIS", "KHC", "HSY", "CVS", "HUM", "BIIB", "MRNA", "EA",
  "TTWO", "SPOT", "ROKU", "PINS", "SNAP", "RBLX", "DASH", "LYFT", "RIVN", "LCID", "NIO", "BA",
] as const
