"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@web/components/ui/card"
import { Button } from "@web/components/ui/button"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@web/components/ui/chart"
import { PlaidLink } from "./plaid-link"
import { TrendingUp, TrendingDown, DollarSign, PieChart, Building2, Eye, EyeOff, RefreshCw } from "lucide-react"
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
}

export function PortfolioDashboard({ 
  hasConnectedAccounts, 
  onConnectAccount, 
  plaidData, 
  isConnecting = false 
}: PortfolioDashboardProps) {
  const [balanceVisible, setBalanceVisible] = useState(true)
  const [selectedTimeframe, setSelectedTimeframe] = useState("1Y")
  const [isDemoMode, setIsDemoMode] = useState(false)
  // Show dashboard if user has connected accounts OR is in demo mode
  const showDashboard = hasConnectedAccounts || isDemoMode
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
    if (plaidData && hasConnectedAccounts && !isDemoMode) {
      // Use real Plaid data
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

    // Filter data based on selected timeframe
    const now = new Date()
    const filterData = (months: number) => {
      if (months === 0) return baseData // ALL
      
      // Get the last N data points instead of filtering by date for better chart display
      if (months === 1) return baseData.slice(-2) // Last 2 points for 1M
      if (months === 3) return baseData.slice(-4) // Last 4 points for 3M
      if (months === 6) return baseData.slice(-7) // Last 7 points for 6M
      if (months === 12) return baseData.slice(-13) // Last 13 points for 1Y
      
      return baseData
    }

    switch (selectedTimeframe) {
      case "1M":
        return filterData(1)
      case "3M":
        return filterData(3)
      case "6M":
        return filterData(6)
      case "1Y":
        return filterData(12)
      case "ALL":
      default:
        return baseData
    }
  }// Get top holdings - use stocks if available, otherwise show top accounts
  const getTopHoldings = () => {
    if (plaidData && hasConnectedAccounts && !isDemoMode) {
      // Check if we have actual stock holdings with real values
      const validHoldings = plaidData.holdings?.filter((holding: any) => 
        (holding.market_value || 0) > 0
      ) || []
      
      if (validHoldings.length > 0) {
        // Use real stock holdings with actual values
        return validHoldings
          .slice(0, 5)
          .map((holding: any) => {
            const security = plaidData.securities?.find((s: any) => s.security_id === holding.security_id)
            return {
              symbol: security?.ticker_symbol || 'STOCK',
              name: security?.name || 'Investment Position',
              value: holding.market_value || 0,
              change: 0, // Would need historical data for real change
              logo: getStockIcon(security?.ticker_symbol || 'STOCK'),
              isStock: true
            }
          })
      } else {
        // No valid stock holdings, show top accounts by balance
        return accountsWithPercentages
          .filter((account: any) => account.balance > 0)
          .sort((a: any, b: any) => b.balance - a.balance)
          .slice(0, 5)
          .map((account: any) => ({
            symbol: account.type?.toUpperCase().substring(0, 4) || 'ACCT',
            name: account.name.split(' - ')[1] || account.name, // Just the account name part
            value: account.balance,
            change: 0,
            logo: getAccountTypeIcon(account.type, account.subtype),
            isStock: false
          }))
      }
    } else {      // Demo data
      return [
        { symbol: "AAPL", name: "Apple Inc.", value: 8500, change: 2.4, logo: getStockIcon("AAPL"), isStock: true },
        { symbol: "SPY", name: "SPDR S&P 500 ETF", value: 9000, change: 1.8, logo: getStockIcon("SPY"), isStock: true },
        { symbol: "VTI", name: "Vanguard Total Stock Market", value: 12400, change: 1.2, logo: getStockIcon("VTI"), isStock: true },
        { symbol: "TSLA", name: "Tesla Inc.", value: 6200, change: -0.8, logo: getStockIcon("TSLA"), isStock: true },
        { symbol: "AMZN", name: "Amazon.com Inc.", value: 6000, change: 3.1, logo: getStockIcon("AMZN"), isStock: true },
      ]
    }
  }

  // Get better icons for account types
  const getAccountTypeIcon = (type: string, subtype: string) => {
    const accountType = (subtype || type || '').toLowerCase()
    if (accountType.includes('credit')) return "💳"
    if (accountType.includes('saving')) return "💰"
    if (accountType.includes('checking')) return "🏦"
    if (accountType.includes('investment') || accountType.includes('brokerage')) return "�"
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
                onClick={() => setIsDemoMode(true)}
                size="lg"
                className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-medium px-6 py-3 shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 rounded-lg flex items-center"
              >
                <PieChart className="w-4 h-4 mr-2" />
                View Demo Portfolio
              </Button>
              
              <PlaidLink
                onSuccess={onConnectAccount}
                size="lg"
                className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-medium px-6 py-3 shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 rounded-lg flex items-center"
              >
                <Building2 className="w-4 h-4 mr-2" />
                Connect Real Account
              </PlaidLink>
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
            )}            {hasConnectedAccounts && !isDemoMode && (
              <span className="bg-green-100 text-green-800 text-sm font-medium px-3 py-1 rounded-full">
                {plaidData ? "Live Data" : "Connected"}
              </span>
            )}
          </div>          <p className="text-gray-600 mt-1">
            {isDemoMode 
              ? "Viewing sample portfolio data for demonstration"
              : hasConnectedAccounts && plaidData
                ? `Connected accounts: ${accountsWithPercentages.length} • Total: ${formatCurrency(totalBalance)}`
                : "Track your investments across all accounts"
            }
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isDemoMode && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDemoMode(false)}
              className="text-blue-600 border-blue-200 hover:bg-blue-50"
            >
              Exit Demo
            </Button>
          )}
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
            <div className="text-2xl font-bold text-emerald-600 mb-1">{formatCurrency(1240)}</div>
            <div className="flex items-center gap-1 text-sm text-emerald-600">
              <TrendingUp className="w-4 h-4" />
              <span>{formatPercentage(1.94)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Connected Accounts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 mb-1">{connectedAccounts.length}</div>
            <div className="text-sm text-gray-600">
              Across {new Set(accountsWithPercentages.map((a: any) => a.type)).size} account types
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
                {["1M", "3M", "6M", "1Y", "ALL"].map((timeframe) => (
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
        <Card>          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Top Holdings
              {plaidData && hasConnectedAccounts && !isDemoMode && topHoldings.length > 0 && !topHoldings[0].isStock && (
                <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2 py-1 rounded-full">
                  Accounts
                </span>
              )}
            </CardTitle>
            <CardDescription>
              {plaidData && hasConnectedAccounts && !isDemoMode && topHoldings.length > 0 && !topHoldings[0].isStock
                ? "Your largest accounts by balance"
                : "Your largest positions"
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
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl flex items-center justify-center text-xl border border-blue-100 group-hover:from-blue-100 group-hover:to-indigo-100 transition-all duration-200">
                        {holding.logo}
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900 text-base">{holding.symbol}</div>
                        <div className="text-sm text-gray-600 truncate max-w-[140px]">{holding.name}</div>
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
                    {plaidData && hasConnectedAccounts && !isDemoMode && topHoldings.length > 0 && !topHoldings[0].isStock
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
            <CardTitle>Connected Accounts</CardTitle>
            <CardDescription>Your linked investment accounts</CardDescription>
          </CardHeader>
          <CardContent>            <div className="space-y-3">
              {accountsWithPercentages.map((account: any) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between p-4 border border-gray-100 rounded-xl hover:border-gray-200 hover:bg-gradient-to-r hover:from-gray-50 hover:to-gray-50/50 transition-all duration-200 hover:shadow-sm group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl flex items-center justify-center overflow-hidden border border-gray-200 group-hover:from-gray-100 group-hover:to-gray-150 transition-all duration-200">
                      <img
                        src={account.logo || "/placeholder.svg"}
                        alt={account.name}
                        className="w-8 h-8 object-contain"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement
                          const parent = target.parentElement
                          if (parent) {
                            const accountType = getAccountTypeIcon(account.type, account.subtype || account.type)
                            parent.innerHTML = `<div class="w-8 h-8 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-lg flex items-center justify-center text-white text-lg shadow-sm">${accountType}</div>`
                          }
                        }}
                      />
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900 text-base">{account.name}</div>
                      <div className="text-sm text-gray-600 flex items-center gap-2">
                        <span className="capitalize">{account.type}</span>
                        <span className="text-gray-400">•</span>
                        <span className="text-emerald-600 font-medium">{account.lastSync}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-gray-900 text-base">{formatCurrency(account.balance)}</div>
                    <div className="text-sm text-gray-500 font-medium">{account.percentage.toFixed(1)}% of total</div>
                  </div>
                </div>
              ))}
            </div></CardContent>
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
