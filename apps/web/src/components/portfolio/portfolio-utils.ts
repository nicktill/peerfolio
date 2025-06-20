import { getStockLogoWithFallback } from "@web/lib/stock-logos"

// Get institution logo based on institution name or ID
export const getInstitutionLogo = (institutionName: string, institutionId?: string) => {
  const name = institutionName.toLowerCase()
  
  // Map common institutions to their logos
  if (name.includes('chase') || name.includes('jpmorgan')) return "https://logo.clearbit.com/chase.com"
  if (name.includes('bank of america') || name.includes('bofa')) return "https://logo.clearbit.com/bankofamerica.com"
  if (name.includes('wells fargo')) return "https://logo.clearbit.com/wellsfargo.com"
  if (name.includes('citibank') || name.includes('citi')) return "https://logo.clearbit.com/citibank.com"
  if (name.includes('capital one')) return "https://logo.clearbit.com/capitalone.com"
  if (name.includes('american express') || name.includes('amex')) return "https://logo.clearbit.com/americanexpress.com"
  if (name.includes('discover')) return "https://logo.clearbit.com/discover.com"
  if (name.includes('schwab')) return "https://logo.clearbit.com/schwab.com"
  if (name.includes('fidelity')) return "https://logo.clearbit.com/fidelity.com"
  if (name.includes('vanguard')) return "https://logo.clearbit.com/vanguard.com"
  if (name.includes('td ameritrade')) return "https://logo.clearbit.com/tdameritrade.com"
  if (name.includes('etrade') || name.includes('e*trade')) return "https://logo.clearbit.com/etrade.com"
  if (name.includes('robinhood')) return "https://logo.clearbit.com/robinhood.com"
  if (name.includes('ally')) return "https://logo.clearbit.com/ally.com"
  if (name.includes('usaa')) return "https://logo.clearbit.com/usaa.com"
  if (name.includes('navy federal')) return "https://logo.clearbit.com/navyfederal.org"
  if (name.includes('pnc')) return "https://logo.clearbit.com/pnc.com"
  if (name.includes('regions')) return "https://logo.clearbit.com/regions.com"
  if (name.includes('suntrust') || name.includes('truist')) return "https://logo.clearbit.com/truist.com"
  if (name.includes('first platypus') || name.includes('plaid')) return "https://logo.clearbit.com/plaid.com"
  
  // Default fallback
  return "https://logo.clearbit.com/bank.com"
}

// Get account type icon and styling
export const getAccountTypeIcon = (type: string, subtype?: string) => {
  const accountType = (subtype || type || '').toLowerCase()
  
  if (accountType.includes('credit')) return { icon: "💳", color: "from-red-500 to-red-600", bgColor: "bg-red-50" }
  if (accountType.includes('saving')) return { icon: "💰", color: "from-green-500 to-green-600", bgColor: "bg-green-50" }
  if (accountType.includes('checking')) return { icon: "🏦", color: "from-blue-500 to-blue-600", bgColor: "bg-blue-50" }
  if (accountType.includes('investment') || accountType.includes('brokerage')) return { icon: "📈", color: "from-purple-500 to-purple-600", bgColor: "bg-purple-50" }
  if (accountType.includes('401k') || accountType.includes('retirement')) return { icon: "🏛️", color: "from-orange-500 to-orange-600", bgColor: "bg-orange-50" }
  if (accountType.includes('hsa')) return { icon: "🏥", color: "from-teal-500 to-teal-600", bgColor: "bg-teal-50" }
  if (accountType.includes('cash management') || accountType.includes('money market')) return { icon: "💵", color: "from-emerald-500 to-emerald-600", bgColor: "bg-emerald-50" }
  if (accountType.includes('cd') || accountType.includes('certificate')) return { icon: "🏆", color: "from-yellow-500 to-yellow-600", bgColor: "bg-yellow-50" }
  if (accountType.includes('loan') || accountType.includes('mortgage')) return { icon: "🏠", color: "from-indigo-500 to-indigo-600", bgColor: "bg-indigo-50" }
  
  return { icon: "💼", color: "from-gray-500 to-gray-600", bgColor: "bg-gray-50" }
}

// Format account name (remove institution prefix)
export const formatAccountName = (fullName: string) => {
  if (fullName.includes(' - ')) {
    return fullName.split(' - ')[1]
  }
  return fullName
}

// Get institution display name (remove account suffix)
export const getInstitutionDisplayName = (fullName: string) => {
  if (fullName.includes(' - ')) {
    return fullName.split(' - ')[0]
  }
  return fullName
}

// Get stock icons based on symbol
export const getStockIcon = (symbol: string) => {
  const sym = symbol.toUpperCase()
  if (sym.includes('AAPL')) return "🍎"
  if (sym.includes('TSLA')) return "🚗"
  if (sym.includes('NVDA')) return "🖥️"
  if (sym.includes('GOOGL') || sym.includes('GOOG')) return "🔍"
  if (sym.includes('AMZN')) return "📦"
  if (sym.includes('MSFT')) return "🖼️"
  if (sym.includes('META') || sym.includes('FB')) return "📘"
  if (sym.includes('SPY') || sym.includes('VOO') || sym.includes('VTI')) return "📊"
  if (sym.includes('QQQ')) return "🚀"
  if (sym.includes('BTC') || sym.includes('BITCOIN')) return "₿"
  if (sym.includes('ETH') || sym.includes('ETHEREUM')) return "Ξ"
  return "📈"
}

// Function to determine if an account should be included in portfolio value
export const shouldIncludeInPortfolio = (accountType: string) => {
  const type = accountType.toLowerCase()
  
  // Assets - include in portfolio value
  if (type.includes('saving')) return true
  if (type.includes('checking')) return true
  if (type.includes('investment') || type.includes('brokerage')) return true
  if (type.includes('401k') || type.includes('retirement')) return true
  if (type.includes('hsa')) return true
  if (type.includes('cash management') || type.includes('money market')) return true
  if (type.includes('cd') || type.includes('certificate')) return true
  
  // Liabilities - exclude from portfolio value
  if (type.includes('credit')) return false
  if (type.includes('loan')) return false
  if (type.includes('mortgage')) return false
  
  // Default to include for unknown types (conservative approach)
  return true
}

// Function to get portfolio vs total balances
export const getBalanceSummary = (accounts: any[]) => {
  let portfolioAssetsValue = 0  // Just assets included in portfolio
  let totalAssets = 0
  let totalLiabilities = 0
  
  accounts.forEach(account => {
    const balance = Math.abs(account.balance) // Use absolute value for calculations
    
    if (shouldIncludeInPortfolio(account.type)) {
      portfolioAssetsValue += account.balance // Keep original sign for portfolio assets
      totalAssets += balance
    } else {
      totalLiabilities += balance
    }
  })
  
  return {
    portfolioAssetsValue,  // Assets only (for percentage calculations)
    portfolioValue: totalAssets - totalLiabilities,  // Net portfolio value (for display)
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities
  }
}

// Calculate today's change from chart data
export const calculateTodaysChange = (chartData: any[]) => {
  if (chartData.length < 2) return { value: 0, percentage: 0 }
  
  const today = chartData[chartData.length - 1]?.value || 0
  const yesterday = chartData[chartData.length - 2]?.value || 0
  
  const changeValue = today - yesterday
  const changePercentage = yesterday > 0 ? (changeValue / yesterday) * 100 : 0
  
  return { value: changeValue, percentage: changePercentage }
}

// Get top holdings - use stocks if available, otherwise show top accounts
export const getTopHoldings = (isDemoMode: boolean, plaidData: any, connectedPlaidAccounts: any[], accountsWithPercentages: any[]) => {
  if (!isDemoMode && (plaidData || connectedPlaidAccounts.length > 0)) {
    // For real connected accounts, check if we have actual investment holdings
    const validHoldings = plaidData?.holdings?.filter((holding: any) => 
      (holding.market_value || 0) > 0
    ) || []
    
    if (validHoldings.length > 0) {
      // Use real stock holdings with actual values (only if we have real holdings)
      return validHoldings
        .slice(0, 5)
        .map((holding: any) => {
          const security = plaidData.securities?.find((s: any) => s.security_id === holding.security_id)
          const ticker = security?.ticker_symbol || 'STOCK'
          const logoUrls = getStockLogoWithFallback(ticker)
          
          return {
            symbol: ticker,
            name: security?.name || 'Investment Position',
            value: holding.market_value || 0,
            change: 0, // Would need historical data for real change
            logo: logoUrls.primary,
            fallbackLogo: logoUrls.fallback,
            defaultLogo: logoUrls.default,
            isStock: true
          }
        })
    } else {
      // No valid stock holdings, show top accounts by balance
      return accountsWithPercentages
        .filter((account: any) => account.balance > 0)
        .sort((a: any, b: any) => b.balance - a.balance)
        .slice(0, 5)
        .map((account: any) => {
          const accountTypeInfo = getAccountTypeIcon(account.type, account.subtype)
          const institutionName = getInstitutionDisplayName(account.name)
          const accountName = formatAccountName(account.name)
          
          return {
            symbol: account.type?.replace(/\s+/g, '').substring(0, 4).toUpperCase() || 'ACCT',
            name: accountName,
            value: account.balance,
            change: 0,
            logo: account.logo,
            isStock: false,
            institutionName: institutionName,
            accountType: account.type,
            accountTypeInfo: accountTypeInfo
          }
        })
    }
  } else {
    // Demo data with real stock logos
    const stocks = [
      { symbol: "AAPL", name: "Apple Inc.", value: 8500, change: 2.4 },
      { symbol: "SPY", name: "SPDR S&P 500 ETF", value: 9000, change: 1.8 },
      { symbol: "VTI", name: "Vanguard Total Stock Market", value: 12400, change: 1.2 },
      { symbol: "TSLA", name: "Tesla Inc.", value: 6200, change: -0.8 },
      { symbol: "AMZN", name: "Amazon.com Inc.", value: 6000, change: 3.1 },
    ]
    
    return stocks.map(stock => {
      const logoUrls = getStockLogoWithFallback(stock.symbol)
      return {
        ...stock,
        logo: logoUrls.primary,
        fallbackLogo: logoUrls.fallback,
        defaultLogo: logoUrls.default,
        isStock: true
      }
    })
  }
}
