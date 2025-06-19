// Stock logo utilities
export const getStockLogo = (ticker: string) => {
  if (!ticker || ticker === 'N/A') return '/logo.png' // fallback
  
  // Using Financial Modeling Prep API (free tier)
  return `https://financialmodelingprep.com/image-stock/${ticker.toUpperCase()}.png`
}

// Fallback to company domain-based logos if needed
export const getClearbitLogo = (ticker: string) => {
  const domains: Record<string, string> = {
    'AAPL': 'apple.com',
    'GOOGL': 'google.com',
    'GOOG': 'google.com', 
    'TSLA': 'tesla.com',
    'AMZN': 'amazon.com',
    'MSFT': 'microsoft.com',
    'META': 'meta.com',
    'NVDA': 'nvidia.com',
    'NFLX': 'netflix.com',
    'SPY': 'spdr.com',
    'VTI': 'vanguard.com',
    'QQQ': 'invesco.com',
    'VOO': 'vanguard.com',
    'VT': 'vanguard.com',
    'ARKK': 'ark-invest.com',
  }
  
  const domain = domains[ticker.toUpperCase()]
  return domain ? `https://logo.clearbit.com/${domain}` : '/logo.png'
}

// Get stock logo with fallback
export const getStockLogoWithFallback = (ticker: string) => {
  const primaryLogo = getStockLogo(ticker)
  const fallbackLogo = getClearbitLogo(ticker)
  
  return {
    primary: primaryLogo,
    fallback: fallbackLogo,
    default: '/logo.png'
  }
}
