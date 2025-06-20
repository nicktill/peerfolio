"use client"

import React, { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@web/components/ui/card"
import { Button } from "@web/components/ui/button"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@web/components/ui/chart"
import { PlaidLink } from "./plaid-link"
import { TrendingUp, TrendingDown, DollarSign, PieChart, Building2, Eye, EyeOff, RefreshCw, X, Play, Plus, AlertTriangle } from "lucide-react"
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
  balanceVisible?: boolean
  setBalanceVisible?: (visible: boolean) => void
}

export function PortfolioDashboard({ 
  hasConnectedAccounts, 
  onConnectAccount, 
  plaidData, 
  isConnecting = false,
  onRemoveAccount,
  onExitDashboard,
  onDemoConnect,
  hasExitedDashboard = false,
  balanceVisible: externalBalanceVisible,
  setBalanceVisible: externalSetBalanceVisible
}: PortfolioDashboardProps) {
  const router = useRouter()
  const [localBalanceVisible, setLocalBalanceVisible] = useState(true)
  const [selectedTimeframe, setSelectedTimeframe] = useState("1Y")
  const [isDemoMode, setIsDemoMode] = useState(false)
  const [connectedPlaidAccounts, setConnectedPlaidAccounts] = useState<ConnectedAccount[]>([])

  // Use external balance visibility state if provided, otherwise use local state
  const balanceVisible = externalBalanceVisible !== undefined ? externalBalanceVisible : localBalanceVisible
  const setBalanceVisible = externalSetBalanceVisible || setLocalBalanceVisible

  // Custom CSS animations
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const style = document.createElement('style')
      style.textContent = `
        @keyframes expandWidth {
          from { width: 0%; }
          to { width: var(--final-width, 100%); }
        }
        
        @keyframes slideToPosition {
          from { left: 0%; }
          to { left: var(--final-position, 100%); }
        }
        
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        
        @keyframes shimmer-slow {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        
        @keyframes float-1 {
          0%, 100% { transform: translateY(0px) translateX(-50%); }
          50% { transform: translateY(-10px) translateX(-50%); }
        }
        
        @keyframes float-2 {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        
        @keyframes float-3 {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
        }
        
        .animate-shimmer {
          animation: shimmer 2s infinite;
        }
        
        .animate-shimmer-slow {
          animation: shimmer-slow 3s infinite;
        }
        
        .animate-float-1 {
          animation: float-1 2s ease-in-out infinite;
        }
        
        .animate-float-2 {
          animation: float-2 2.5s ease-in-out infinite;
        }
        
        .animate-float-3 {
          animation: float-3 3s ease-in-out infinite;
        }
        
        .animation-delay-150 {
          animation-delay: 150ms;
        }
        
        .animation-delay-300 {
          animation-delay: 300ms;
        }
        
        .animation-delay-600 {
          animation-delay: 600ms;
        }
      `
      document.head.appendChild(style)
      
      return () => {
        document.head.removeChild(style)
      }
    }
  }, [])

  // Dark mode toggle logic - default to light mode for dashboard
  const [isDark, setIsDark] = useState(false)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Only use dark mode if explicitly set in localStorage, ignore system preference for dashboard
      const darkPref = localStorage.getItem('theme') === 'dark'
      setIsDark(darkPref)
      document.documentElement.classList.toggle('dark', darkPref)
      
      // Set light mode as default if no theme preference is stored
      if (!localStorage.getItem('theme')) {
        localStorage.setItem('theme', 'light')
      }
    }
  }, [])
  const toggleDarkMode = () => {
    setIsDark((prev) => {
      const next = !prev
      if (typeof window !== 'undefined') {
        document.documentElement.classList.toggle('dark', next)
        localStorage.setItem('theme', next ? 'dark' : 'light')
      }
      return next
    })
  }

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

  // Function to determine if an account should be included in portfolio value
  const shouldIncludeInPortfolio = (accountType: string) => {
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
  const getBalanceSummary = (accounts: any[]) => {
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

  const accountsData = getAccountsData()
  const balanceSummary = getBalanceSummary(accountsData)
  const totalBalance = balanceSummary.portfolioValue // Use net portfolio value for display
  const totalAssetsOnly = balanceSummary.portfolioAssetsValue // Use assets only for percentage calculations
  
  // Update percentages and add portfolio inclusion flag
  const accountsWithPercentages = accountsData.map((account: any) => {
    const isIncludedInPortfolio = shouldIncludeInPortfolio(account.type)
    const percentage = isIncludedInPortfolio && totalAssetsOnly > 0 ? 
      ((account.balance / totalAssetsOnly) * 100) : 0  // Use assets only for percentages
    
    return {
      ...account,
      percentage,
      isIncludedInPortfolio,
      isLiability: !isIncludedInPortfolio && (
        account.type.toLowerCase().includes('credit') ||
        account.type.toLowerCase().includes('loan') ||
        account.type.toLowerCase().includes('mortgage')
      )
    }
  })  // Get portfolio chart data - use current balance for real data
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
        {/* MVP Beta Testing Banner */}
        <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 dark:from-blue-950/40 dark:via-indigo-950/30 dark:to-purple-950/40 border border-blue-200 dark:border-blue-800/50 rounded-xl p-5 backdrop-blur-sm shadow-lg dark:shadow-blue-900/10 hover:shadow-xl transition-all duration-300">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/50 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zm-2 5a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-2 flex items-center gap-2">
                🚀 Welcome to Peerfolio MVP
                <span className="bg-blue-100/80 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium px-2 py-1 rounded-full">
                  Beta Testing
                </span>
              </h3>
              <div className="space-y-2 text-sm text-blue-700 dark:text-blue-300">
                <p>
                  <strong>Demo Mode:</strong> Explore with sample portfolio data to see all features in action
                </p>
                <p>
                  <strong>Connect Account:</strong> Use Plaid's sandbox environment (mock data) while we await production approval
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Hero Section */}
        <div className="text-center py-16 px-6 bg-gradient-to-br from-emerald-50 via-white to-blue-50 dark:from-gray-900/80 dark:via-gray-800/90 dark:to-gray-900/80 rounded-3xl border border-gray-100 dark:border-gray-700/60 backdrop-blur-sm shadow-xl dark:shadow-gray-900/20">
          <div className="max-w-2xl mx-auto">
            <div className="mb-8">
              <div className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                <PieChart className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-foreground mb-4">Your Portfolio Dashboard Awaits</h2>
              <p className="text-lg text-gray-600 dark:text-gray-300 leading-relaxed">
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
                <div key={broker.name} className="flex flex-col items-center space-y-2">
                  <div className="flex items-center justify-center">
                    <img 
                      src={broker.logo} 
                      alt={`${broker.name} logo`}
                      className="w-6 h-6 object-contain"
                      onError={(e) => {
                        // Fallback to colored initials if logo fails
                        const target = e.target as HTMLImageElement;
                        const parent = target.parentElement;
                        if (parent) {
                          parent.innerHTML = `<div class="w-6 h-6 rounded bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-xs font-bold text-gray-600 dark:text-gray-300">${broker.name.charAt(0)}</div>`;
                        }
                      }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{broker.name}</span>
                </div>
              ))}
            </div>            <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
              <Button
                onClick={() => {
                  // Ensure clean demo mode state
                  setIsDemoMode(true)
                  // Clear any exit flags to ensure user can see the demo
                  if (typeof window !== 'undefined') {
                    localStorage.removeItem('hasExitedDashboard')
                  }
                  // Call demo connect handler if provided
                  if (onDemoConnect) onDemoConnect()
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
                        // Clear exit flag and ensure real account mode
                        if (typeof window !== 'undefined') {
                          localStorage.removeItem('hasExitedDashboard')
                        }
                        setIsDemoMode(false)
                        // Call demo connect handler to trigger parent state update
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
                <div className="inline-flex items-center px-4 py-2 bg-emerald-50 dark:bg-emerald-900/30 rounded-full text-emerald-600 dark:text-emerald-400 text-sm font-medium">
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Connecting your account...
                </div>
              </div>
            )}

            <div className="mt-4 text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                <span className="font-medium text-blue-600 dark:text-blue-400">Demo:</span> See how the dashboard works with sample data
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                <span className="font-medium text-emerald-600 dark:text-emerald-400">Real Account:</span> Connect your actual investment accounts
              </p>
            </div>

            <div className="mt-6 flex items-center justify-center space-x-6 text-sm text-gray-500 dark:text-gray-400">
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
          <Card className="relative overflow-hidden border border-gray-200 dark:border-gray-700/50 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm shadow-lg dark:shadow-gray-900/20 hover:shadow-xl dark:hover:shadow-gray-900/30 transition-all duration-300">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-emerald-600/5 dark:from-emerald-500/10 dark:to-emerald-600/10"></div>
            <CardHeader className="relative">
              <CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                <TrendingUp className="w-5 h-5" />
                Portfolio Growth
              </CardTitle>
              <CardDescription className="text-gray-600 dark:text-gray-400">Track your investment performance over time</CardDescription>
            </CardHeader>
            <CardContent className="relative">
              <div className="h-32 bg-gradient-to-r from-emerald-100 to-emerald-200 dark:from-emerald-900/30 dark:to-emerald-800/30 rounded-lg flex items-center justify-center shadow-inner">
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">Beautiful charts await</span>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border border-gray-200 dark:border-gray-700/50 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm shadow-lg dark:shadow-gray-900/20 hover:shadow-xl dark:hover:shadow-gray-900/30 transition-all duration-300">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-blue-600/5 dark:from-blue-500/10 dark:to-blue-600/10"></div>
            <CardHeader className="relative">
              <CardTitle className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
                <PieChart className="w-5 h-5" />
                Asset Allocation
              </CardTitle>
              <CardDescription className="text-gray-600 dark:text-gray-400">Visualize your investment distribution</CardDescription>
            </CardHeader>
            <CardContent className="relative">
              <div className="h-32 bg-gradient-to-r from-blue-100 to-blue-200 dark:from-blue-900/30 dark:to-blue-800/30 rounded-lg flex items-center justify-center shadow-inner">
                <span className="text-blue-600 dark:text-blue-400 font-medium">Interactive breakdowns</span>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border border-gray-200 dark:border-gray-700/50 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm shadow-lg dark:shadow-gray-900/20 hover:shadow-xl dark:hover:shadow-gray-900/30 transition-all duration-300">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-purple-600/5 dark:from-purple-500/10 dark:to-purple-600/10"></div>
            <CardHeader className="relative">
              <CardTitle className="flex items-center gap-2 text-purple-700 dark:text-purple-400">
                <Building2 className="w-5 h-5" />
                Account Overview
              </CardTitle>
              <CardDescription className="text-gray-600 dark:text-gray-400">All your accounts in one place</CardDescription>
            </CardHeader>
            <CardContent className="relative">
              <div className="h-32 bg-gradient-to-r from-purple-100 to-purple-200 dark:from-purple-900/30 dark:to-purple-800/30 rounded-lg flex items-center justify-center shadow-inner">
                <span className="text-purple-600 dark:text-purple-400 font-medium">Unified dashboard</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-8 dark:text-foreground text-gray-900 transition-colors duration-300">
      {/* Demo Mode Banner */}
      {isDemoMode && (
        <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-blue-50 dark:from-blue-950/40 dark:via-indigo-950/30 dark:to-blue-950/40 border border-blue-200 dark:border-blue-800/50 rounded-xl p-5 backdrop-blur-sm shadow-lg dark:shadow-blue-900/10 hover:shadow-xl transition-all duration-300">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/50 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zm-2 5a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-2 flex items-center gap-2">
                🎯 Demo Mode Active
                <span className="bg-blue-100/80 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium px-2 py-1 rounded-full">
                  Sample Data
                </span>
              </h3>
              <p className="text-sm text-blue-700 dark:text-blue-300 leading-relaxed">
                This is mock demo data shown to demonstrate Peerfolio's features and interface. 
                The sample portfolio data illustrates how your real investment accounts would appear once connected.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Plaid Sandbox Mode Banner */}
      {hasConnectedAccounts && !isDemoMode && (
        <div className="bg-gradient-to-r from-yellow-50 via-amber-50 to-orange-50 dark:from-yellow-950/40 dark:via-amber-950/30 dark:to-orange-950/40 border border-yellow-200 dark:border-yellow-800/50 rounded-xl p-5 backdrop-blur-sm shadow-lg dark:shadow-yellow-900/10 hover:shadow-xl transition-all duration-300">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 bg-yellow-100 dark:bg-yellow-900/50 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
              </div>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-yellow-800 dark:text-yellow-200 mb-2 flex items-center gap-2">
                🚧 MVP Phase - Plaid Sandbox Connection Active
                <span className="bg-yellow-100/80 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 text-xs font-medium px-2 py-1 rounded-full">
                  Sandbox Data
                </span>
              </h3>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 leading-relaxed">
                Peerfolio is currently in its MVP phase using Plaid's sandbox environment with mock data. 
                We're awaiting approval to connect with real financial institutions. 
                The platform demonstrates full functionality with sample data until we go live with real accounts.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Portfolio Overview Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-foreground">Portfolio Dashboard</h1>
            {isDemoMode && (
              <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 text-sm font-medium px-3 py-1 rounded-full">
                Demo Mode
              </span>
            )}
            {hasConnectedAccounts && !isDemoMode && (
              <span className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 text-sm font-medium px-3 py-1 rounded-full">
                Connected ({connectedPlaidAccounts.length} account{connectedPlaidAccounts.length !== 1 ? 's' : ''})
              </span>
            )}
          </div>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            {isDemoMode ? "Explore with sample portfolio data" :
             hasConnectedAccounts ? "Real data from your connected accounts" :
             "Connect your accounts to see real portfolio data"}
          </p>
        </div>
        
        {/* Navigation and Controls */}
        <div className="flex items-center gap-3">
          {/* Navigation Buttons - First Section */}
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
          
          {/* Hide and Add Account buttons - Second Section */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBalanceVisible(!balanceVisible)}
              className="flex items-center gap-2"
            >
              {balanceVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              Hide
            </Button>
            
            <PlaidLink 
              onSuccess={onConnectAccount} 
              variant="outline" 
              size="sm"
              className="flex items-center gap-2"
            >
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
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400 flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Net Portfolio Value
            </CardTitle>
          </CardHeader>
          <CardContent className="relative">
            <div className="text-3xl font-bold text-gray-900 dark:text-foreground mb-1">{formatCurrency(totalBalance)}</div>
            <div className={`flex items-center gap-1 text-sm ${totalGain >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {totalGain >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              <span>{formatPercentage(totalGainPercentage)} all time</span>
            </div>
            {balanceSummary.totalLiabilities > 0 && (
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 space-y-0.5">
                <div>Assets: {formatCurrency(balanceSummary.totalAssets)} • Liabilities: {formatCurrency(balanceSummary.totalLiabilities)}</div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">Today's Change</CardTitle>
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
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">Connected Accounts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-foreground mb-1">{accountsWithPercentages.length}</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {(() => {
                const portfolioAccounts = accountsWithPercentages.filter((a: any) => a.isIncludedInPortfolio).length
                const liabilityAccounts = accountsWithPercentages.filter((a: any) => a.isLiability).length
                const institutionCount = new Set(accountsWithPercentages.map((a: any) => a.institutionName || a.name.split(' - ')[0])).size
                
                return (
                  <div className="space-y-1">
                    <div>Across {institutionCount} {institutionCount === 1 ? 'institution' : 'institutions'}</div>
                    {liabilityAccounts > 0 && (
                      <div className="text-xs">
                        {portfolioAccounts} assets • {liabilityAccounts} liabilities
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">Last Updated</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-foreground mb-1">2m ago</div>
            <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
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
                <CardTitle className="dark:text-foreground">Portfolio Performance</CardTitle>
                <CardDescription className="dark:text-gray-400">Your investment growth over time</CardDescription>
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
            <CardTitle className="flex items-center gap-2 dark:text-foreground">
              {/* Dynamic title based on content type */}
              {!isDemoMode && (plaidData || connectedPlaidAccounts.length > 0) && topHoldings.length > 0 && !topHoldings[0].isStock ? (
                <>
                  Top Accounts
                  <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 text-xs font-medium px-2 py-1 rounded-full">
                    By Balance
                  </span>
                </>
              ) : (
                <>
                  Top Holdings
                  {isDemoMode && (
                    <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 text-xs font-medium px-2 py-1 rounded-full">
                      Demo
                    </span>
                  )}
                  {!isDemoMode && (plaidData || connectedPlaidAccounts.length > 0) && (
                    <span className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 text-xs font-medium px-2 py-1 rounded-full">
                      Live
                    </span>
                  )}
                </>
              )}
            </CardTitle>
            <CardDescription className="dark:text-gray-400">
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
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-3">
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
                              <div className={`absolute -bottom-1 -right-1 w-5 h-5 ${holding.accountTypeInfo.bgColor} rounded-full flex items-center justify-center border border-white shadow-md`}>
                                <span className="text-xs">{holding.accountTypeInfo.icon}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900 dark:text-foreground text-base">{holding.symbol}</div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 truncate max-w-[140px]">
                          {holding.isStock ? holding.name : (
                            <div className="flex flex-col">
                              <span>{holding.name}</span>
                              {holding.institutionName && (
                                <span className="text-xs text-gray-500 dark:text-gray-500">from {holding.institutionName}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-gray-900 dark:text-foreground text-base">{formatCurrency(holding.value)}</div>
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
        <Card className="overflow-hidden relative group">
          {/* Subtle animated background */}
          <div className="absolute inset-0 bg-gradient-to-br from-violet-50/40 via-blue-50/20 to-emerald-50/30 dark:from-violet-950/20 dark:via-blue-950/10 dark:to-emerald-950/15 transition-all duration-700 group-hover:from-violet-50/60 group-hover:via-blue-50/30 group-hover:to-emerald-50/40 dark:group-hover:from-violet-950/30 dark:group-hover:via-blue-950/20 dark:group-hover:to-emerald-950/25"></div>
          
          <CardHeader className="relative bg-gradient-to-r from-white/80 via-white/60 to-white/40 dark:from-gray-900/80 dark:via-gray-900/60 dark:to-gray-900/40 backdrop-blur-sm border-b border-violet-100/60 dark:border-violet-800/30">
            <CardTitle className="flex items-center gap-3 text-gray-900 dark:text-foreground">
              <div className="relative">
                <PieChart className="w-5 h-5 text-violet-600 dark:text-violet-400 transition-transform duration-300 group-hover:scale-110" />
                <div className="absolute -inset-1 bg-violet-500/20 rounded-full blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              </div>
              <span className="font-semibold">Asset Allocation</span>
              <div className="flex items-center gap-1 ml-auto">
                <div className="w-2 h-2 bg-violet-400 rounded-full animate-pulse"></div>
                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse animation-delay-300"></div>
                <div className="w-1 h-1 bg-emerald-400 rounded-full animate-pulse animation-delay-500"></div>
              </div>
            </CardTitle>
            <CardDescription className="text-gray-600 dark:text-gray-300">
              Professional breakdown of your investment portfolio
            </CardDescription>
          </CardHeader>
          
          <CardContent className="relative p-6">
            <div className="space-y-8">
              {/* Enhanced Pie Chart */}
              <div className="relative h-[320px] flex items-center justify-center group/chart">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPieChart>
                    <defs>
                      {/* Professional gradient definitions */}
                      {assetAllocation.map((entry, index) => (
                        <linearGradient key={`gradient-${index}`} id={`gradient-${index}`} x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor={entry.color} stopOpacity={1} />
                          <stop offset="100%" stopColor={entry.color} stopOpacity={0.8} />
                        </linearGradient>
                      ))}
                      {/* Subtle shadow filter */}
                      <filter id="drop-shadow" x="-50%" y="-50%" width="200%" height="200%">
                        <feDropShadow dx="0" dy="4" stdDeviation="8" floodOpacity="0.1"/>
                      </filter>
                    </defs>
                    <Pie
                      data={assetAllocation}
                      cx="50%"
                      cy="50%"
                      innerRadius={65}
                      outerRadius={110}
                      paddingAngle={3}
                      dataKey="value"
                      stroke="rgba(255,255,255,0.9)"
                      strokeWidth={2}
                      filter="url(#drop-shadow)"
                      className="transition-all duration-500"
                    >
                      {assetAllocation.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={`url(#gradient-${index})`}
                          className="hover:opacity-90 transition-all duration-300 cursor-pointer hover:scale-105 origin-center"
                        />
                      ))}
                    </Pie>
                    <ChartTooltip
                      content={<ChartTooltipContent 
                        formatter={(value, name) => [
                          `${formatCurrency(value as number)} (${((value as number / assetAllocation.reduce((sum, item) => sum + item.value, 0)) * 100).toFixed(1)}%)`, 
                          name
                        ]} 
                        className="bg-white/95 dark:bg-gray-800/95 backdrop-blur-lg border border-gray-200/60 dark:border-gray-700/60 shadow-xl rounded-xl"
                      />}
                    />
                  </RechartsPieChart>
                </ResponsiveContainer>
                
                {/* Enhanced Center Display */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center bg-white/95 dark:bg-gray-900/95 backdrop-blur-lg rounded-full w-28 h-28 flex flex-col items-center justify-center border-2 border-white/80 dark:border-gray-700/80 shadow-xl group-hover/chart:scale-105 transition-all duration-500">
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-violet-600 dark:text-violet-400 uppercase tracking-wider">Total Value</div>
                      <div className="text-sm font-bold text-gray-900 dark:text-gray-100 leading-tight">
                        {formatCurrency(assetAllocation.reduce((sum, item) => sum + item.value, 0))}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                        {assetAllocation.length} classes
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Floating indicators on hover */}
                <div className="absolute top-6 right-6 opacity-0 group-hover/chart:opacity-100 transition-all duration-500">
                  <div className="flex items-center gap-2 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm px-3 py-2 rounded-full border border-gray-200/50 dark:border-gray-700/50 shadow-lg">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Live Data</span>
                  </div>
                </div>
              </div>
              
              {/* Professional Asset List */}
              <div className="space-y-4">
                {assetAllocation.map((item, index) => {
                  const percentage = (item.value / assetAllocation.reduce((sum, asset) => sum + asset.value, 0)) * 100;
                  return (
                    <div 
                      key={item.name} 
                      className="group/item relative p-5 bg-gradient-to-r from-white/80 via-white/60 to-white/40 dark:from-gray-800/60 dark:via-gray-800/40 dark:to-gray-800/20 backdrop-blur-sm rounded-xl border border-gray-200/60 dark:border-gray-700/40 hover:border-violet-300/60 dark:hover:border-violet-600/50 hover:shadow-lg dark:hover:shadow-gray-900/20 transition-all duration-300 hover:scale-[1.02] cursor-pointer overflow-hidden"
                    >
                      {/* Subtle hover background */}
                      <div className="absolute inset-0 bg-gradient-to-r from-violet-50/50 to-blue-50/30 dark:from-violet-950/30 dark:to-blue-950/20 opacity-0 group-hover/item:opacity-100 transition-opacity duration-500"></div>
                      
                      <div className="relative flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          {/* Enhanced color indicator */}
                          <div className="relative">
                            <div 
                              className="w-5 h-5 rounded-lg shadow-md border-2 border-white/80 dark:border-gray-700/80 group-hover/item:scale-110 transition-transform duration-300"
                              style={{ backgroundColor: item.color }}
                            />
                            <div 
                              className="absolute inset-0 rounded-lg opacity-0 group-hover/item:opacity-40 transition-opacity duration-300"
                              style={{ 
                                backgroundColor: item.color,
                                filter: 'blur(8px)',
                                transform: 'scale(1.5)'
                              }}
                            />
                          </div>
                          
                          {/* Asset info */}
                          <div className="space-y-1">
                            <div className="flex items-center gap-3">
                              <span className="font-semibold text-gray-900 dark:text-gray-100 text-lg group-hover/item:text-violet-700 dark:group-hover/item:text-violet-300 transition-colors duration-300">
                                {item.name}
                              </span>
                              <span 
                                className="px-2.5 py-1 rounded-full text-xs font-semibold text-white shadow-sm group-hover/item:shadow-md transition-shadow duration-300"
                                style={{ backgroundColor: item.color }}
                              >
                                {percentage.toFixed(1)}%
                              </span>
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                              Portfolio allocation • Investment category
                            </div>
                          </div>
                        </div>
                        
                        {/* Value display with progress bar */}
                        <div className="text-right space-y-3 min-w-[160px]">
                          <div className="space-y-1">
                            <div className="font-bold text-gray-900 dark:text-gray-100 text-lg group-hover/item:text-violet-700 dark:group-hover/item:text-violet-300 transition-colors duration-300">
                              {formatCurrency(item.value)}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                              Asset Value
                            </div>
                          </div>
                          
                          {/* Professional progress bar */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                              <span>Allocation</span>
                              <span className="font-semibold">{percentage.toFixed(1)}%</span>
                            </div>
                            <div className="relative w-full h-2 bg-gray-200/80 dark:bg-gray-700/80 rounded-full overflow-hidden">
                              <div 
                                className="absolute top-0 left-0 h-full rounded-full transition-all duration-1000 ease-out"
                                style={{ 
                                  width: `${percentage}%`,
                                  background: `linear-gradient(90deg, ${item.color}, ${item.color}cc)`,
                                  boxShadow: `0 0 8px ${item.color}40`
                                }}
                              />
                              {/* Subtle shimmer effect */}
                              <div 
                                className="absolute top-0 left-0 h-full w-6 bg-gradient-to-r from-transparent via-white/30 to-transparent rounded-full opacity-0 group-hover/item:opacity-100 group-hover/item:animate-pulse transition-opacity duration-300"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {/* Enhanced Summary Stats */}
              <div className="grid grid-cols-3 gap-6 pt-6 border-t border-gradient-to-r from-transparent via-gray-200/50 to-transparent dark:via-gray-700/50">
                {[
                  {
                    label: "Asset Classes",
                    value: assetAllocation.length,
                    color: "blue",
                    icon: "🎯"
                  },
                  {
                    label: "Largest Holding", 
                    value: `${Math.max(...assetAllocation.map(item => item.percentage)).toFixed(0)}%`,
                    color: "emerald",
                    icon: "📊"
                  },
                  {
                    label: "Diversification",
                    value: (() => {
                      const maxPercentage = Math.max(...assetAllocation.map(item => item.percentage));
                      if (maxPercentage < 50) return "High";
                      if (maxPercentage < 70) return "Good";
                      return "Moderate";
                    })(),
                    color: "violet",
                    icon: "⚖️"
                  }
                ].map((stat, index) => (
                  <div key={stat.label} className={`group/stat text-center p-4 rounded-xl bg-gradient-to-br from-${stat.color}-50/50 to-${stat.color}-100/30 dark:from-${stat.color}-950/30 dark:to-${stat.color}-900/20 border border-${stat.color}-200/40 dark:border-${stat.color}-800/40 hover:border-${stat.color}-300/60 dark:hover:border-${stat.color}-600/50 transition-all duration-300 hover:scale-105 cursor-pointer`}>
                    <div className="space-y-2">
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-lg">{stat.icon}</span>
                        <div className={`text-sm font-semibold text-${stat.color}-600 dark:text-${stat.color}-400 uppercase tracking-wide`}>
                          {stat.label}
                        </div>
                      </div>
                      <div className={`text-2xl font-bold text-${stat.color}-800 dark:text-${stat.color}-300 group-hover/stat:scale-110 transition-transform duration-300`}>
                        {stat.value}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Connected Accounts */}
        <Card className="overflow-hidden">
          <CardHeader className="bg-gradient-to-br from-blue-50/50 to-indigo-50/50 dark:from-blue-950/20 dark:to-indigo-950/20 border-b border-gray-100 dark:border-gray-800 pb-4">
            <CardTitle className="flex items-center justify-between text-gray-900 dark:text-foreground">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span>Connected Accounts</span>
              </div>
              <span className="text-sm font-normal text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 px-3 py-1 rounded-full border border-gray-200 dark:border-gray-700">
                {accountsWithPercentages.length} {accountsWithPercentages.length === 1 ? 'account' : 'accounts'}
              </span>
            </CardTitle>
            <CardDescription className="text-gray-600 dark:text-gray-300">Your linked financial accounts</CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            {/* Balance Summary */}
            {balanceSummary.totalLiabilities > 0 && (
              <div className="mb-4 p-4 bg-gradient-to-br from-gray-50 to-gray-100/50 dark:from-gray-800/50 dark:to-gray-900/30 rounded-xl border border-gray-200/50 dark:border-gray-700/50 shadow-sm">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Total Assets</div>
                    <div className="text-base font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(balanceSummary.totalAssets)}</div>
                  </div>
                  <div className="space-y-1 border-x border-gray-200 dark:border-gray-700">
                    <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Total Liabilities</div>
                    <div className="text-base font-bold text-red-500 dark:text-red-400">{formatCurrency(balanceSummary.totalLiabilities)}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Net Worth</div>
                    <div className="text-base font-bold text-gray-900 dark:text-gray-100">{formatCurrency(balanceSummary.netWorth)}</div>
                  </div>
                </div>
              </div>
            )}
            
            <div className="space-y-3">
              {accountsWithPercentages.map((account: any) => (
                <div
                  key={account.id}
                  className="group relative p-4 bg-white dark:bg-gray-800/30 border border-gray-200/60 dark:border-gray-700/50 rounded-xl hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md dark:hover:shadow-gray-900/20 transition-all duration-300 hover:scale-[1.01]"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        {/* Institution Logo */}
                        <div className="w-12 h-12 bg-gradient-to-br from-white to-gray-50 dark:from-gray-700 dark:to-gray-800 rounded-xl flex items-center justify-center overflow-hidden border-2 border-gray-200/70 dark:border-gray-600/50 group-hover:border-gray-300 dark:group-hover:border-gray-500 transition-all duration-300 shadow-sm">
                          <img
                            src={account.logo || "/placeholder.svg"}
                            alt={getInstitutionDisplayName(account.name)}
                            className="w-8 h-8 object-contain"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement
                              const parent = target.parentElement
                              if (parent) {
                                const institutionName = getInstitutionDisplayName(account.name)
                                parent.innerHTML = `<div class="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold shadow-inner">${institutionName.charAt(0)}</div>`
                              }
                            }}
                          />
                        </div>
                        
                        {/* Account Type Badge */}
                        {(() => {
                          const accountTypeInfo = getAccountTypeIcon(account.type, account.subtype)
                          return (
                            <div className={`absolute -bottom-1 -right-1 w-6 h-6 ${accountTypeInfo.bgColor} dark:bg-opacity-90 rounded-full flex items-center justify-center border-2 border-white dark:border-gray-800 shadow-md transition-transform duration-300 group-hover:scale-110`}>
                              <span className="text-xs">{accountTypeInfo.icon}</span>
                            </div>
                          )
                        })()}
                      </div>
                      
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-gray-900 dark:text-gray-100 text-base mb-1 truncate">{formatAccountName(account.name)}</div>
                        <div className="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-gray-700/50 px-2 py-0.5 rounded text-xs">{getInstitutionDisplayName(account.name)}</span>
                          <span className="text-gray-400 dark:text-gray-500">•</span>
                          <span className="capitalize text-gray-600 dark:text-gray-300 font-medium text-xs">{account.type}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div className="text-right min-w-[120px]">
                        <div className="font-bold text-gray-900 dark:text-gray-100 text-lg mb-1">{formatCurrency(account.balance)}</div>
                        <div className="flex justify-end">
                          {account.isIncludedInPortfolio ? (
                            <span className="inline-flex items-center text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded-full text-xs font-medium border border-blue-200 dark:border-blue-800">
                              {account.percentage.toFixed(1)}% of portfolio
                            </span>
                          ) : account.isLiability ? (
                            <span className="inline-flex items-center text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-2 py-1 rounded-full text-xs font-medium border border-red-200 dark:border-red-800">
                              Liability
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700/50 px-2 py-1 rounded-full text-xs font-medium border border-gray-200 dark:border-gray-600">
                              Not in portfolio
                            </span>
                          )}
                        </div>
                      </div>
                      {account.accountId && !isDemoMode && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveAccount(account.accountId)}
                          className="opacity-0 group-hover:opacity-100 transition-all duration-300 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded-lg hover:scale-110 flex-shrink-0"
                          title="Remove account"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              
              {/* Add Account Button */}
              <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                <PlaidLink
                  onSuccess={onConnectAccount}
                  variant="outline"
                  className="w-full h-12 border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 bg-transparent hover:bg-blue-50/50 dark:hover:bg-blue-900/20 transition-all duration-300 rounded-xl group flex items-center justify-center gap-2 font-medium hover:scale-[1.01]"
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
