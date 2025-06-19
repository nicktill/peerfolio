"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@web/components/ui/card"
import { Button } from "@web/components/ui/button"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@web/components/ui/chart"
import { PlaidLink } from "./plaid-link"
import { TrendingUp, TrendingDown, DollarSign, PieChart, Building2, Eye, EyeOff, RefreshCw, X, Play } from "lucide-react"
import {
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Cell,
  AreaChart,
  Area,
  Pie,
} from "recharts"
import { getStockLogoWithFallback } from "@web/lib/stock-logos"
import { 
  getConnectedAccounts, 
  addConnectedAccount, 
  removeConnectedAccount, 
  type ConnectedAccount 
} from "@web/lib/account-storage"

// Demo data for portfolio performance - expanded with more data points
const portfolioData = [
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
const connectedAccounts = [
  {
    id: "1",
    name: "Robinhood",
    type: "Investment",
    balance: 28500,
    percentage: 44.4,
    logo: "https://logo.clearbit.com/robinhood.com",
    lastSync: "2 minutes ago",
    holdings: [
      { symbol: "AAPL", name: "Apple Inc.", value: 8500, shares: 45 },
      { symbol: "TSLA", name: "Tesla Inc.", value: 6200, shares: 25 },
      { symbol: "NVDA", name: "NVIDIA Corp.", value: 4800, shares: 12 },
      { symbol: "SPY", name: "SPDR S&P 500 ETF", value: 9000, shares: 20 },
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
      { symbol: "VTI", name: "Vanguard Total Stock Market ETF", value: 12400, shares: 50 },
      { symbol: "AMZN", name: "Amazon.com Inc.", value: 6000, shares: 35 },
      { symbol: "GOOGL", name: "Alphabet Inc.", value: 4000, shares: 25 },
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
      { symbol: "FXNAX", name: "Fidelity U.S. Bond Index Fund", value: 8000, shares: 800 },
      { symbol: "FSKAX", name: "Fidelity Total Market Index Fund", value: 5300, shares: 350 },
    ],
  },
]

// Asset allocation data
const assetAllocation = [
  { name: "Stocks", value: 42800, percentage: 66.7, color: "#10B981" },
  { name: "ETFs", value: 14400, percentage: 22.4, color: "#3B82F6" },
  { name: "Bonds", value: 7000, percentage: 10.9, color: "#8B5CF6" },
]

const chartConfig = {
  value: {
    label: "Portfolio Value",
    color: "hsl(var(--chart-1))",
  },
}

interface PortfolioDashboardProps {
  hasConnectedAccounts: boolean
  onConnectAccount: (publicToken: string, metadata: any) => void
  plaidData?: any
  isConnecting?: boolean
  onRemoveAccount?: (accountId: string) => void
  onExitDashboard?: () => void
  onDemoConnect?: () => void
  hasExitedDashboard?: boolean
}

export function PortfolioDashboard({ 
  hasConnectedAccounts, 
  onConnectAccount, 
  plaidData, 
  isConnecting = false,
  onRemoveAccount,
  onExitDashboard,
  onDemoConnect,
  hasExitedDashboard = false
}: PortfolioDashboardProps) {
  const router = useRouter()
  const [balanceVisible, setBalanceVisible] = useState(true)
  const [selectedTimeframe, setSelectedTimeframe] = useState("1Y")
  const [isDemoMode, setIsDemoMode] = useState(false)
  const [connectedPlaidAccounts, setConnectedPlaidAccounts] = useState<ConnectedAccount[]>([])

  // Load connected accounts from localStorage on mount and when hasConnectedAccounts changes
  useEffect(() => {
    const stored = getConnectedAccounts()
    setConnectedPlaidAccounts(stored)
    
    // Check if user just connected an account and should see connected accounts view
    if (typeof window !== 'undefined') {
      const justConnected = localStorage.getItem('lastConnectedAccount') === 'true'
      if (justConnected && stored.length > 0) {
        // Clear the flag and ensure user sees connected accounts (not demo mode)
        localStorage.removeItem('lastConnectedAccount')
        setIsDemoMode(false) // Ensure we're not in demo mode
      } else if (stored.length > 0 && !hasExitedDashboard) {
        // If user has connected accounts but hasn't explicitly chosen demo mode,
        // prefer showing real data over demo mode
        setIsDemoMode(false)
      }
    }
  }, [hasConnectedAccounts, hasExitedDashboard]) // Add hasExitedDashboard dependency

  // Show dashboard if user has connected accounts OR is in demo mode, BUT NOT if they've explicitly exited
  const showDashboard = !hasExitedDashboard && (hasConnectedAccounts || isDemoMode || connectedPlaidAccounts.length > 0)

  // Calculate today's change from chart data
  const calculateTodaysChange = (chartData: any[]) => {
    if (chartData.length < 2) return { value: 0, percentage: 0 }
    
    const today = chartData[chartData.length - 1]?.value || 0
    const yesterday = chartData[chartData.length - 2]?.value || 0
    
    const changeValue = today - yesterday
    const changePercentage = yesterday > 0 ? (changeValue / yesterday) * 100 : 0
    
    return { value: changeValue, percentage: changePercentage }
  }

  // Utility functions (local versions to avoid import issues)
  const getAccountTypeIcon = (type: string, subtype?: string) => {
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

  const formatAccountName = (fullName: string) => {
    if (fullName.includes(' - ')) {
      return fullName.split(' - ')[1]
    }
    return fullName
  }

  const getInstitutionDisplayName = (fullName: string) => {
    if (fullName.includes(' - ')) {
      return fullName.split(' - ')[0]
    }
    return fullName
  }
  // Get institution logo based on institution name or ID
  const getInstitutionLogo = (institutionName: string, institutionId?: string) => {
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

  // Transform Plaid data into our dashboard format
  const getAccountsData = () => {
    if (!isDemoMode && connectedPlaidAccounts.length > 0) {
      // Use multiple connected accounts from localStorage
      const allAccounts: any[] = []
      
      connectedPlaidAccounts.forEach((plaidAccount) => {
        plaidAccount.accountsData.accounts?.forEach((account: any) => {
          const balance = account.balances?.current || account.balances?.available || 0
          allAccounts.push({
            id: `${plaidAccount.institutionName}-${account.account_id}`,
            name: `${plaidAccount.institutionName} - ${account.name}`,
            type: account.subtype || account.type || 'Investment',
            balance: balance,
            percentage: 0, // Will be calculated later
            logo: getInstitutionLogo(plaidAccount.institutionName),
            lastSync: new Date(plaidAccount.connectedAt).toLocaleString(),
            institutionName: plaidAccount.institutionName,
            connectedAt: plaidAccount.connectedAt,
            accountId: plaidAccount.id
          })
        })
      })
      
      return allAccounts
    } else if (plaidData && hasConnectedAccounts && !isDemoMode) {
      // Use single Plaid data (legacy support)
      const institutionName = plaidData.item?.institution_name || plaidData.institution?.name || 'Connected Bank'
      
      return plaidData.accounts?.map((account: any, index: number) => {
        const balance = account.balances?.current || account.balances?.available || 0
        return {
          id: account.account_id,
          name: `${institutionName} - ${account.name}`,
          type: account.subtype || account.type || 'Investment',
          balance: balance,
          percentage: 0, // We'll calculate this after we have all balances
          logo: getInstitutionLogo(institutionName, plaidData.item?.institution_id),
          lastSync: "Just now",
          holdings: account.holdings || [], // Will be populated if we have investment holdings
        }
      }) || []
    } else {
      // Use demo data
      return connectedAccounts
    }
  }

  // Function to remove a connected account
  const handleRemoveAccount = (accountId: string) => {
    removeConnectedAccount(accountId)
    setConnectedPlaidAccounts(getConnectedAccounts())
    
    // Notify parent component if provided
    if (onRemoveAccount) {
      onRemoveAccount(accountId)
    }
  }

  const accountsData = getAccountsData()
  const totalBalance = accountsData.reduce((sum: number, account: any) => sum + account.balance, 0)
  
  // Update percentages now that we have total balance
  const accountsWithPercentages = accountsData.map((account: any) => ({
    ...account,
    percentage: totalBalance > 0 ? ((account.balance / totalBalance) * 100) : 0
  }))  // Get portfolio chart data - use current balance for real data
  const getPortfolioData = () => {
    let baseData = portfolioData
    
    if (plaidData && hasConnectedAccounts && !isDemoMode && totalBalance > 0) {
      // For real data, append current value to the end of the demo data
      const currentValue = totalBalance
      baseData = [
        ...portfolioData,
        { 
          date: new Date().toISOString().slice(0, 7), 
          value: currentValue, 
          month: new Date().toLocaleDateString('en-US', { month: 'short' })
        }
      ]
    }

    // Generate appropriate short-term data for 1D and 1W
    const generateShortTermData = (timeframe: string) => {
      const currentValue = baseData[baseData.length - 1]?.value || totalBalance || 50000
      const baseVariation = currentValue * 0.02 // 2% variation range
      
      if (timeframe === "1D") {
        // Generate hourly data points for 1 day (24 hours)
        const hourlyData = []
        for (let i = 23; i >= 0; i--) {
          const hour = new Date()
          hour.setHours(hour.getHours() - i)
          const variation = (Math.random() - 0.5) * baseVariation
          hourlyData.push({
            date: hour.toISOString(),
            value: Math.round(currentValue + variation),
            month: hour.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
          })
        }
        return hourlyData
      }
      
      if (timeframe === "1W") {
        // Generate daily data points for 1 week (7 days)
        const dailyData = []
        for (let i = 6; i >= 0; i--) {
          const day = new Date()
          day.setDate(day.getDate() - i)
          const variation = (Math.random() - 0.5) * baseVariation * 2
          dailyData.push({
            date: day.toISOString().slice(0, 10),
            value: Math.round(currentValue + variation),
            month: day.toLocaleDateString('en-US', { weekday: 'short' })
          })
        }
        return dailyData
      }
      
      return baseData
    }

    // Filter data based on selected timeframe
    const filterData = (timeframe: string) => {
      switch (timeframe) {
        case "1D":
          return generateShortTermData("1D")
        case "1W":
          return generateShortTermData("1W")
        case "1M":
          // Show last 2 data points for 1 month view
          return baseData.slice(-2)
        case "3M":
          // Show last 4 data points for 3 months
          return baseData.slice(-4)
        case "6M":
          // Show last 7 data points for 6 months
          return baseData.slice(-7)
        case "1Y":
          // Show last 13 data points for 1 year
          return baseData.slice(-13)
        case "ALL":
        default:
          return baseData
      }
    }

    return filterData(selectedTimeframe)
  }  // Get top holdings - use stocks if available, otherwise show top accounts
  const getTopHoldings = () => {
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
      return [
        { symbol: "AAPL", name: "Apple Inc.", value: 8500, change: 2.4, ...getStockLogoWithFallback("AAPL"), isStock: true },
        { symbol: "SPY", name: "SPDR S&P 500 ETF", value: 9000, change: 1.8, ...getStockLogoWithFallback("SPY"), isStock: true },
        { symbol: "VTI", name: "Vanguard Total Stock Market", value: 12400, change: 1.2, ...getStockLogoWithFallback("VTI"), isStock: true },
        { symbol: "TSLA", name: "Tesla Inc.", value: 6200, change: -0.8, ...getStockLogoWithFallback("TSLA"), isStock: true },
        { symbol: "AMZN", name: "Amazon.com Inc.", value: 6000, change: 3.1, ...getStockLogoWithFallback("AMZN"), isStock: true },
      ]
    }
  }

  // Get better icons for account types (legacy function - using utility now)
  const getAccountTypeIconLegacy = (type: string, subtype: string) => {
    const accountType = (subtype || type || '').toLowerCase()
    if (accountType.includes('credit')) return "💳"
    if (accountType.includes('saving')) return "💰"
    if (accountType.includes('checking')) return "🏦"
    if (accountType.includes('investment') || accountType.includes('brokerage')) return "📈"
    if (accountType.includes('401k') || accountType.includes('retirement')) return "🏛️"
    if (accountType.includes('hsa')) return "🏥"
    if (accountType.includes('cash management')) return "💵"
    if (accountType.includes('depository')) return "🏛️"
    return "💼"
  }

  // Get stock icons based on symbol
  const getStockIcon = (symbol: string) => {
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

  const topHoldings = getTopHoldings()

  const chartData = getPortfolioData()
  const totalGain = totalBalance - chartData[0].value
  const totalGainPercentage = chartData[0].value > 0 ? (totalGain / chartData[0].value) * 100 : 0
  
  // Calculate today's change from chart data
  const todaysChange = calculateTodaysChange(chartData)

  const formatCurrency = (value: number) => {
    if (!balanceVisible) return "••••••"
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  const formatPercentage = (value: number) => {
    if (!balanceVisible) return "••••"
    return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`
  }

  if (!showDashboard) {
    return (
      <div className="space-y-8">
        {/* Hero Section */}
        <div className="text-center py-16 px-6 bg-gradient-to-br from-emerald-50 via-white to-blue-50 rounded-3xl border border-gray-100">
          <div className="max-w-2xl mx-auto">
            <div className="mb-8">
              <div className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                <PieChart className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Your Portfolio Dashboard Awaits</h2>
              <p className="text-lg text-gray-600 leading-relaxed">
                Connect your investment accounts to see your complete portfolio in one beautiful, secure dashboard.
                Track performance, analyze allocations, and compare with friends.
              </p>
            </div>            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 opacity-60">
              {[
                { name: "Robinhood", logo: "https://logo.clearbit.com/robinhood.com" },
                { name: "Fidelity", logo: "https://logo.clearbit.com/fidelity.com" },
                { name: "Charles Schwab", logo: "https://logo.clearbit.com/schwab.com" },
                { name: "E*TRADE", logo: "https://logo.clearbit.com/etrade.com" }
              ].map((broker) => (
                <div key={broker.name} className="bg-white rounded-lg p-4 text-center shadow-sm border border-gray-100">
                  <div className="w-8 h-8 rounded mx-auto mb-2 flex items-center justify-center overflow-hidden">
                    <img 
                      src={broker.logo} 
                      alt={`${broker.name} logo`}
                      className="w-6 h-6 object-contain"
                      onError={(e) => {
                        // Fallback to colored initials if logo fails
                        const target = e.target as HTMLImageElement;
                        const parent = target.parentElement;
                        if (parent) {
                          parent.innerHTML = `<div class="w-6 h-6 rounded bg-gray-300 flex items-center justify-center text-xs font-bold text-gray-600">${broker.name.charAt(0)}</div>`;
                        }
                      }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 font-medium">{broker.name}</span>
                </div>
              ))}
            </div>            <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
              <Button
                onClick={() => {
                  setIsDemoMode(true)
                  // Call the parent handler to clear exit flag
                  if (onDemoConnect) {
                    onDemoConnect()
                  }
                }}
                size="lg"
                className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-medium px-6 py-3 shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 rounded-lg flex items-center"
              >
                <PieChart className="w-4 h-4 mr-2" />
                View Demo Portfolio
              </Button>
              
              {(() => {
                // Check if there are existing accounts in localStorage
                const existingAccounts = getConnectedAccounts()
                
                if (existingAccounts.length > 0) {
                  // If accounts exist, show button that takes user to dashboard
                  return (
                    <Button
                      onClick={() => {
                        // Clear exit flag and show dashboard with existing accounts
                        if (onDemoConnect) {
                          onDemoConnect()
                        }
                      }}
                      size="lg"
                      className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-medium px-6 py-3 shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 rounded-lg flex items-center"
                    >
                      <Building2 className="w-4 h-4 mr-2" />
                      View Connected Accounts
                    </Button>
                  )
                } else {
                  // If no accounts exist, show Plaid link
                  return (
                    <PlaidLink
                      onSuccess={onConnectAccount}
                      size="lg"
                      className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-medium px-6 py-3 shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 rounded-lg flex items-center"
                    >
                      <Building2 className="w-4 h-4 mr-2" />
                      Connect Real Account
                    </PlaidLink>
                  )
                }
              })()}
            </div>

            {isConnecting && (
              <div className="mt-6 text-center">
                <div className="inline-flex items-center px-4 py-2 bg-emerald-50 rounded-full text-emerald-600 text-sm font-medium">
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Connecting your account...
                </div>
              </div>
            )}

            <div className="mt-4 text-center">
              <p className="text-sm text-gray-500 mb-2">
                <span className="font-medium text-blue-600">Demo:</span> See how the dashboard works with sample data
              </p>
              <p className="text-sm text-gray-500">
                <span className="font-medium text-emerald-600">Real Account:</span> Connect your actual investment accounts
              </p>
            </div>

            <div className="mt-6 flex items-center justify-center space-x-6 text-sm text-gray-500">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span>Bank-level security</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span>Read-only access</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                <span>Encrypted data</span>
              </div>
            </div>
          </div>
        </div>

        {/* Preview Cards */}
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-emerald-600/5"></div>
            <CardHeader className="relative">
              <CardTitle className="flex items-center gap-2 text-emerald-700">
                <TrendingUp className="w-5 h-5" />
                Portfolio Growth
              </CardTitle>
              <CardDescription>Track your investment performance over time</CardDescription>
            </CardHeader>
            <CardContent className="relative">
              <div className="h-32 bg-gradient-to-r from-emerald-100 to-emerald-200 rounded-lg flex items-center justify-center">
                <span className="text-emerald-600 font-medium">Beautiful charts await</span>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-blue-600/5"></div>
            <CardHeader className="relative">
              <CardTitle className="flex items-center gap-2 text-blue-700">
                <PieChart className="w-5 h-5" />
                Asset Allocation
              </CardTitle>
              <CardDescription>Visualize your investment distribution</CardDescription>
            </CardHeader>
            <CardContent className="relative">
              <div className="h-32 bg-gradient-to-r from-blue-100 to-blue-200 rounded-lg flex items-center justify-center">
                <span className="text-blue-600 font-medium">Interactive breakdowns</span>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-purple-600/5"></div>
            <CardHeader className="relative">
              <CardTitle className="flex items-center gap-2 text-purple-700">
                <Building2 className="w-5 h-5" />
                Account Overview
              </CardTitle>
              <CardDescription>All your accounts in one place</CardDescription>
            </CardHeader>
            <CardContent className="relative">
              <div className="h-32 bg-gradient-to-r from-purple-100 to-purple-200 rounded-lg flex items-center justify-center">
                <span className="text-purple-600 font-medium">Unified dashboard</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-8">
      {/* Portfolio Overview Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-gray-900">Portfolio Dashboard</h1>
            {isDemoMode && (
              <span className="bg-blue-100 text-blue-800 text-sm font-medium px-3 py-1 rounded-full">
                Demo Mode
              </span>
            )}
            {hasConnectedAccounts && !isDemoMode && (
              <span className="bg-green-100 text-green-800 text-sm font-medium px-3 py-1 rounded-full">
                Connected ({connectedPlaidAccounts.length} account{connectedPlaidAccounts.length !== 1 ? 's' : ''})
              </span>
            )}
          </div>
          <p className="text-gray-600 mt-1">
            {isDemoMode ? "Explore with sample portfolio data" :
             hasConnectedAccounts ? "Real data from your connected accounts" :
             "Connect your accounts to see real portfolio data"}
          </p>
        </div>
        
        {/* Navigation and Controls */}
        <div className="flex items-center gap-3">
          {/* Navigation Buttons */}
          {(hasConnectedAccounts || connectedPlaidAccounts.length > 0 || isDemoMode) && (
            <div className="flex items-center gap-2">
              <Button
                variant={isDemoMode ? "default" : "outline"}
                onClick={() => setIsDemoMode(true)}
                className="flex items-center gap-2 min-w-[120px] justify-center"
                size="sm"
              >
                <PieChart className="w-4 h-4" />
                View Demo
              </Button>
              {(hasConnectedAccounts || connectedPlaidAccounts.length > 0) && (
                <Button
                  variant={!isDemoMode ? "default" : "outline"}
                  onClick={() => {
                    // Only show connected accounts view if there are actually accounts
                    if (connectedPlaidAccounts.length > 0) {
                      setIsDemoMode(false)
                    } else {
                      // If no accounts exist, exit to landing screen to let user connect
                      if (onExitDashboard) {
                        onExitDashboard()
                      }
                    }
                  }}
                  className="flex items-center gap-2 min-w-[180px] justify-center"
                  size="sm"
                >
                  <Building2 className="w-4 h-4" />
                  {connectedPlaidAccounts.length > 0 ? "View Connected Accounts" : "Connect Real Account"}
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={() => {
                  // Reset demo mode
                  setIsDemoMode(false)
                  // Clear connected accounts from localStorage to reset dashboard state
                  if (typeof window !== 'undefined') {
                    localStorage.removeItem('connectedAccounts')
                  }
                  // Reset local state
                  setConnectedPlaidAccounts([])
                  // Call the exit function if provided to reset parent state
                  if (onExitDashboard) {
                    onExitDashboard()
                  }
                  // This will cause showDashboard to be false and show the landing screen
                }}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900 min-w-[120px] justify-center"
                size="sm"
              >
                <X className="w-4 h-4" />
                Exit Dashboard
              </Button>
            </div>
          )}
          
          {/* Additional Controls */}
          <div className="flex items-center gap-2 border-l border-gray-200 pl-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBalanceVisible(!balanceVisible)}
              className="flex items-center gap-2"
            >
              {balanceVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {balanceVisible ? "Hide" : "Show"}
            </Button>
            <PlaidLink onSuccess={onConnectAccount} variant="outline" size="sm">
              Add Account
            </PlaidLink>
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-6 md:grid-cols-4">
        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-emerald-600/10"></div>
          <CardHeader className="relative pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Total Portfolio Value
            </CardTitle>
          </CardHeader>
          <CardContent className="relative">
            <div className="text-3xl font-bold text-gray-900 mb-1">{formatCurrency(totalBalance)}</div>
            <div className={`flex items-center gap-1 text-sm ${totalGain >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {totalGain >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              <span>{formatPercentage(totalGainPercentage)} all time</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Today's Change</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold mb-1 ${todaysChange.value >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {formatCurrency(todaysChange.value)}
            </div>
            <div className={`flex items-center gap-1 text-sm ${todaysChange.value >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {todaysChange.value >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              <span>{formatPercentage(todaysChange.percentage)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Connected Accounts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 mb-1">{accountsWithPercentages.length}</div>
            <div className="text-sm text-gray-600">
              Across {new Set(accountsWithPercentages.map((a: any) => a.institutionName || a.name.split(' - ')[0])).size} {new Set(accountsWithPercentages.map((a: any) => a.institutionName || a.name.split(' - ')[0])).size === 1 ? 'institution' : 'institutions'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Last Updated</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 mb-1">2m ago</div>
            <div className="flex items-center gap-1 text-sm text-gray-600">
              <RefreshCw className="w-4 h-4" />
              <span>Auto-sync enabled</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Portfolio Performance Chart with Top Holdings */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Portfolio Performance</CardTitle>
                <CardDescription>Your investment growth over time</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {["1D", "1W", "1M", "3M", "6M", "1Y", "ALL"].map((timeframe) => (
                  <Button
                    key={timeframe}
                    variant={selectedTimeframe === timeframe ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedTimeframe(timeframe)}
                    className="h-8 px-3"
                  >
                    {timeframe}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[400px]">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" />
                <XAxis dataKey="month" className="text-gray-600" axisLine={false} tickLine={false} />
                <YAxis
                  className="text-gray-600"
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => [formatCurrency(value as number), "Portfolio Value"]}
                      labelFormatter={(label) => `${label} 2024`}
                    />
                  }
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#10B981"
                  strokeWidth={3}
                  fill="url(#colorValue)"
                  dot={{ fill: "#10B981", strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6, stroke: "#10B981", strokeWidth: 2, fill: "#fff" }}
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>        {/* Top Holdings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {/* Dynamic title based on content type */}
              {!isDemoMode && (plaidData || connectedPlaidAccounts.length > 0) && topHoldings.length > 0 && !topHoldings[0].isStock ? (
                <>
                  Top Accounts
                  <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2 py-1 rounded-full">
                    By Balance
                  </span>
                </>
              ) : (
                <>
                  Top Holdings
                  {isDemoMode && (
                    <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2 py-1 rounded-full">
                      Demo
                    </span>
                  )}
                  {!isDemoMode && (plaidData || connectedPlaidAccounts.length > 0) && (
                    <span className="bg-green-100 text-green-800 text-xs font-medium px-2 py-1 rounded-full">
                      Live
                    </span>
                  )}
                </>
              )}
            </CardTitle>
            <CardDescription>
              {!isDemoMode && (plaidData || connectedPlaidAccounts.length > 0) && topHoldings.length > 0 && !topHoldings[0].isStock
                ? "Your largest accounts by balance"
                : isDemoMode
                  ? "Sample investment positions"
                  : "Your largest investment positions"
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {topHoldings.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  📊
                </div>
                <p className="text-sm">No holdings or accounts to display</p>
              </div>
            ) : (              <div className="space-y-3">
                {topHoldings.map((holding: any, index: number) => (
                  <div
                    key={`${holding.symbol}-${index}`}
                    className="flex items-center justify-between p-4 rounded-xl hover:bg-gradient-to-r hover:from-gray-50 hover:to-gray-50/50 transition-all duration-200 border border-gray-100 hover:border-gray-200 hover:shadow-sm group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center border border-gray-200 group-hover:border-gray-300 transition-all duration-200 overflow-hidden relative">
                        {holding.isStock ? (
                          <img 
                            src={holding.logo || holding.primary}
                            alt={`${holding.symbol} logo`}
                            className="w-8 h-8 object-contain"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              if (holding.fallbackLogo && target.src !== holding.fallbackLogo) {
                                target.src = holding.fallbackLogo;
                              } else if (holding.defaultLogo && target.src !== holding.defaultLogo) {
                                target.src = holding.defaultLogo;
                              } else {
                                // Final fallback - create a text-based logo
                                const parent = target.parentElement;
                                if (parent) {
                                  parent.innerHTML = `<div class="w-8 h-8 rounded bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white text-sm font-bold">${holding.symbol.charAt(0)}</div>`;
                                }
                              }
                            }}
                          />
                        ) : (
                          <div className="relative">
                            <img 
                              src={holding.logo}
                              alt={`${holding.institutionName} logo`}
                              className="w-8 h-8 object-contain"
                              onError={(e) => {
                                // Fallback for institution logos
                                const target = e.target as HTMLImageElement;
                                const parent = target.parentElement;
                                if (parent) {
                                  parent.innerHTML = `<div class="w-8 h-8 rounded bg-gradient-to-br from-gray-500 to-gray-600 flex items-center justify-center text-white text-sm font-bold">${holding.institutionName?.charAt(0) || 'A'}</div>`;
                                }
                              }}
                            />
                            {/* Account Type Badge */}
                            {holding.accountTypeInfo && (
                              <div className={`absolute -bottom-1 -right-1 w-5 h-5 ${holding.accountTypeInfo.bgColor} rounded-full flex items-center justify-center border border-white shadow-sm`}>
                                <span className="text-xs">{holding.accountTypeInfo.icon}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900 text-base">{holding.symbol}</div>
                        <div className="text-sm text-gray-600 truncate max-w-[140px]">
                          {holding.isStock ? holding.name : (
                            <div className="flex flex-col">
                              <span>{holding.name}</span>
                              {holding.institutionName && (
                                <span className="text-xs text-gray-500">from {holding.institutionName}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-gray-900 text-base">{formatCurrency(holding.value)}</div>
                      {holding.isStock && (
                        <div className={`text-sm font-medium flex items-center gap-1 ${
                          holding.change >= 0 ? "text-emerald-600" : "text-red-600"
                        }`}>
                          {holding.change >= 0 ? (
                            <TrendingUp className="w-3 h-3" />
                          ) : (
                            <TrendingDown className="w-3 h-3" />
                          )}
                          {holding.change >= 0 ? "+" : ""}
                          {holding.change}%
                        </div>
                      )}
                      {!holding.isStock && (
                        <div className="text-sm text-gray-500 font-medium">
                          {((holding.value / totalBalance) * 100).toFixed(1)}% of total
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <div className="pt-3 border-t border-gray-200">
                  <Button variant="ghost" size="sm" className="w-full text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
                    {!isDemoMode && (plaidData || connectedPlaidAccounts.length > 0) && topHoldings.length > 0 && !topHoldings[0].isStock
                      ? "View All Accounts"
                      : "View All Holdings"
                    }
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Asset Allocation and Connected Accounts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Asset Allocation */}
        <Card>
          <CardHeader>
            <CardTitle>Asset Allocation</CardTitle>
            <CardDescription>How your investments are distributed</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPieChart>
                    <Pie
                      data={assetAllocation}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {assetAllocation.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <ChartTooltip
                      content={<ChartTooltipContent formatter={(value) => [formatCurrency(value as number), ""]} />}
                    />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-3">
                {assetAllocation.map((item, index) => (
                  <div key={item.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="font-medium text-gray-900">{item.name}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-gray-900">{formatCurrency(item.value)}</div>
                      <div className="text-sm text-gray-600">{item.percentage}%</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Connected Accounts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Connected Accounts</span>
              <span className="text-sm font-normal text-gray-500">
                {accountsWithPercentages.length} {accountsWithPercentages.length === 1 ? 'account' : 'accounts'}
              </span>
            </CardTitle>
            <CardDescription>Your linked investment accounts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {accountsWithPercentages.map((account: any) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between p-4 border border-gray-100 rounded-xl hover:border-gray-200 hover:bg-gradient-to-r hover:from-gray-50 hover:to-gray-50/50 transition-all duration-200 hover:shadow-sm group"
                >
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      {/* Institution Logo */}
                      <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center overflow-hidden border border-gray-200 group-hover:border-gray-300 transition-all duration-200 shadow-sm">
                        <img
                          src={account.logo || "/placeholder.svg"}
                          alt={getInstitutionDisplayName(account.name)}
                          className="w-8 h-8 object-contain"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement
                            const parent = target.parentElement
                            if (parent) {
                              const institutionName = getInstitutionDisplayName(account.name)
                              parent.innerHTML = `<div class="w-8 h-8 rounded bg-gradient-to-br from-gray-500 to-gray-600 flex items-center justify-center text-white text-sm font-bold">${institutionName.charAt(0)}</div>`
                            }
                          }}
                        />
                      </div>
                      
                      {/* Account Type Badge */}
                      {(() => {
                        const accountTypeInfo = getAccountTypeIcon(account.type, account.subtype)
                        return (
                          <div className={`absolute -bottom-1 -right-1 w-6 h-6 ${accountTypeInfo.bgColor} rounded-full flex items-center justify-center border-2 border-white shadow-sm`}>
                            <span className="text-xs">{accountTypeInfo.icon}</span>
                          </div>
                        )
                      })()}
                    </div>
                    
                    <div>
                      <div className="font-semibold text-gray-900 text-base">{formatAccountName(account.name)}</div>
                      <div className="text-sm text-gray-600 flex items-center gap-2">
                        <span className="font-medium text-gray-800">{getInstitutionDisplayName(account.name)}</span>
                        <span className="text-gray-400">•</span>
                        <span className="capitalize text-gray-600">{account.type}</span>
                        <span className="text-gray-400">•</span>
                        <span className="text-emerald-600 font-medium">{account.lastSync}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="font-bold text-gray-900 text-base">{formatCurrency(account.balance)}</div>
                      <div className="text-sm text-gray-500 font-medium">{account.percentage.toFixed(1)}% of total</div>
                    </div>
                    {account.accountId && !isDemoMode && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveAccount(account.accountId)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500 hover:bg-red-50 p-2"
                        title="Remove account"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              
              {/* Add Account Button */}
              <div className="pt-2">
                <PlaidLink
                  onSuccess={onConnectAccount}
                  variant="outline"
                  className="w-full border-dashed border-2 border-gray-300 hover:border-gray-400 text-gray-600 hover:text-gray-700 bg-transparent hover:bg-gray-50"
                >
                  Add Another Account
                </PlaidLink>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Debug Section - Show Real Plaid Data (for testing) */}
      {plaidData && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-green-600">🔗 Real Plaid Data Connected!</CardTitle>
            <CardDescription>This is actual data from your connected account(s)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-gray-50 p-4 rounded-lg">
              <pre className="text-xs overflow-auto max-h-40">
                {JSON.stringify(plaidData, null, 2)}
              </pre>
            </div>
            <div className="mt-4 text-sm text-gray-600">
              <p><strong>Accounts found:</strong> {plaidData.accounts?.length || 0}</p>
              <p><strong>Institution:</strong> {plaidData.institution?.name || 'Unknown'}</p>
              {plaidData.accounts?.map((account: any, index: number) => (
                <p key={index}>
                  <strong>{account.name}:</strong> {account.balances.current ? `$${account.balances.current}` : 'N/A'} 
                  ({account.type})
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
