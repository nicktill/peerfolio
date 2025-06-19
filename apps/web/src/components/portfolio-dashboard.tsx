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

// Demo data for portfolio performance
const portfolioData = [
  { date: "2024-01", value: 45000, month: "Jan" },
  { date: "2024-02", value: 47200, month: "Feb" },
  { date: "2024-03", value: 44800, month: "Mar" },
  { date: "2024-04", value: 49100, month: "Apr" },
  { date: "2024-05", value: 52300, month: "May" },
  { date: "2024-06", value: 51800, month: "Jun" },
  { date: "2024-07", value: 54600, month: "Jul" },
  { date: "2024-08", value: 53200, month: "Aug" },
  { date: "2024-09", value: 56800, month: "Sep" },
  { date: "2024-10", value: 59200, month: "Oct" },
  { date: "2024-11", value: 61500, month: "Nov" },
  { date: "2024-12", value: 64200, month: "Dec" },
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
}

export function PortfolioDashboard({ hasConnectedAccounts, onConnectAccount }: PortfolioDashboardProps) {
  const [balanceVisible, setBalanceVisible] = useState(true)
  const [selectedTimeframe, setSelectedTimeframe] = useState("1Y")

  const totalBalance = connectedAccounts.reduce((sum, account) => sum + account.balance, 0)
  const totalGain = totalBalance - portfolioData[0].value
  const totalGainPercentage = (totalGain / portfolioData[0].value) * 100

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

  if (!hasConnectedAccounts) {
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
            </div>

            <PlaidLink
              onSuccess={onConnectAccount}
              size="lg"
              className="bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 hover:from-emerald-600 hover:via-emerald-700 hover:to-teal-700 text-white font-semibold px-8 py-4 text-lg shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-300 rounded-full"
            >
              <Building2 className="w-5 h-5 mr-2" />
              Connect Your First Account
            </PlaidLink>

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
          <h1 className="text-3xl font-bold text-gray-900">Portfolio Dashboard</h1>
          <p className="text-gray-600 mt-1">Track your investments across all accounts</p>
        </div>
        <div className="flex items-center gap-3">
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
              Across {new Set(connectedAccounts.map((a) => a.type)).size} account types
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
              <AreaChart data={portfolioData}>
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
        </Card>

        {/* Top Holdings */}
        <Card>
          <CardHeader>
            <CardTitle>Top Holdings</CardTitle>
            <CardDescription>Your largest positions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { symbol: "AAPL", name: "Apple Inc.", value: 8500, change: 2.4, logo: "🍎" },
                { symbol: "SPY", name: "SPDR S&P 500 ETF", value: 9000, change: 1.8, logo: "📈" },
                { symbol: "VTI", name: "Vanguard Total Stock Market", value: 12400, change: 1.2, logo: "🏛️" },
                { symbol: "TSLA", name: "Tesla Inc.", value: 6200, change: -0.8, logo: "🚗" },
                { symbol: "AMZN", name: "Amazon.com Inc.", value: 6000, change: 3.1, logo: "📦" },
              ].map((holding, index) => (
                <div
                  key={holding.symbol}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-lg">
                      {holding.logo}
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900 text-sm">{holding.symbol}</div>
                      <div className="text-xs text-gray-600 truncate max-w-[120px]">{holding.name}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-gray-900 text-sm">{formatCurrency(holding.value)}</div>
                    <div className={`text-xs ${holding.change >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {holding.change >= 0 ? "+" : ""}
                      {holding.change}%
                    </div>
                  </div>
                </div>
              ))}
              <div className="pt-2 border-t border-gray-100">
                <Button variant="ghost" size="sm" className="w-full text-gray-600 hover:text-gray-900">
                  View All Holdings
                </Button>
              </div>
            </div>
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
          <CardContent>
            <div className="space-y-4">
              {connectedAccounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between p-4 border border-gray-100 rounded-lg hover:border-gray-200 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden">
                      <img
                        src={account.logo || "/placeholder.svg"}
                        alt={account.name}
                        className="w-8 h-8 object-contain"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement
                          target.style.display = "none"
                          target.nextElementSibling?.classList.remove("hidden")
                        }}
                      />
                      <Building2 className="w-6 h-6 text-gray-400 hidden" />
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">{account.name}</div>
                      <div className="text-sm text-gray-600">
                        {account.type} • {account.lastSync}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-gray-900">{formatCurrency(account.balance)}</div>
                    <div className="text-sm text-gray-600">{account.percentage}% of total</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
