"use client"
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card"
import { TrendingUp, TrendingDown, DollarSign, RefreshCw, Eye, EyeOff } from "lucide-react"
import { Button } from "@web/components/ui/button"
import { useState } from "react"

interface PortfolioMetricsProps {
  isDemoMode?: boolean
  hasRealData?: boolean
  totalBalance: number
  totalGain: number
  totalGainPercentage: number
  todaysChange: { value: number; percentage: number }
  accountsCount: number
  balanceSummary: {
    totalAssets: number
    totalLiabilities: number
    netWorth: number
  }
  formatCurrency: (value: number) => string
  formatPercentage: (value: number) => string
  selectedTimeframe: string
  chartData: any[]
}

export function PortfolioMetrics({
  isDemoMode,
  hasRealData,
  totalBalance,
  totalGain,
  totalGainPercentage,
  todaysChange,
  accountsCount,
  balanceSummary,
  formatCurrency,
  formatPercentage,
  selectedTimeframe,
  chartData,
}: PortfolioMetricsProps) {
  const [showAssetsOnly, setShowAssetsOnly] = useState(false)

  // Calculate period-specific changes based on selected timeframe
  const getPeriodChange = () => {
    if (!chartData || chartData.length < 2) {
      return { value: 0, percentage: 0, label: "Today's Change" }
    }

    const currentValue = chartData[chartData.length - 1]?.value || totalBalance
    const previousValue = chartData[0]?.value || totalBalance
    const change = currentValue - previousValue
    const changePercentage = previousValue !== 0 ? (change / Math.abs(previousValue)) * 100 : 0

    const labels = {
      "1D": "Today's Change",
      "1W": "Week's Change",
      "1M": "Month's Change",
      "3M": "3 Month Change",
      "6M": "6 Month Change",
      "1Y": "Year's Change",
      ALL: "All Time Change",
    }

    return {
      value: change,
      percentage: changePercentage,
      label: labels[selectedTimeframe as keyof typeof labels] || "Period Change",
    }
  }

  const periodChange = getPeriodChange()

  // Calculate all-time performance from chart data
  const getAllTimeChange = () => {
    if (!chartData || chartData.length < 2) {
      return { value: totalGain, percentage: totalGainPercentage }
    }

    const currentValue = showAssetsOnly ? balanceSummary.totalAssets : totalBalance
    const startValue = chartData[0]?.value || totalBalance
    const allTimeGain = currentValue - startValue
    const allTimePercentage = startValue !== 0 ? (allTimeGain / Math.abs(startValue)) * 100 : 0

    return {
      value: allTimeGain,
      percentage: allTimePercentage,
    }
  }

  const allTimeChange = getAllTimeChange()
  const displayBalance = showAssetsOnly ? balanceSummary.totalAssets : totalBalance

  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Card
        className={`relative overflow-hidden ${
          displayBalance >= 0
            ? "bg-gradient-to-br from-emerald-500/5 to-emerald-600/10"
            : "bg-gradient-to-br from-red-500/5 to-red-600/10"
        }`}
      >
        <div
          className={`absolute inset-0 ${
            displayBalance >= 0
              ? "bg-gradient-to-br from-emerald-500/5 to-emerald-600/10"
              : "bg-gradient-to-br from-red-500/5 to-red-600/10"
          }`}
        ></div>
        <CardHeader className="relative pb-2">
          <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400 flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            {showAssetsOnly ? "Total Assets" : "Net Portfolio Value"}
            {balanceSummary.totalLiabilities > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAssetsOnly(!showAssetsOnly)}
                className="h-6 px-2 text-xs"
              >
                {showAssetsOnly ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="relative py-3">
          <div
            className={`text-2xl font-bold mb-1 ${
              displayBalance >= 0 ? "text-gray-900 dark:text-foreground" : "text-red-700 dark:text-red-400"
            }`}
          >
            {formatCurrency(displayBalance)}
          </div>
          <div
            className={`flex items-center gap-1 text-sm ${allTimeChange.value >= 0 ? "text-emerald-600" : "text-red-600"}`}
          >
            {allTimeChange.value >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            <span>{formatPercentage(allTimeChange.percentage)} all time</span>
          </div>
          {balanceSummary.totalLiabilities > 0 && !showAssetsOnly && (
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Assets: {formatCurrency(balanceSummary.totalAssets)} • Liabilities:{" "}
              {formatCurrency(balanceSummary.totalLiabilities)}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">Today's Change</CardTitle>
        </CardHeader>
        <CardContent className="py-3">
          <div className={`text-2xl font-bold mb-1 ${todaysChange.value >= 0 ? "text-emerald-600" : "text-red-600"}`}>
            {formatCurrency(todaysChange.value)}
          </div>
          <div
            className={`flex items-center gap-1 text-sm ${todaysChange.value >= 0 ? "text-emerald-600" : "text-red-600"}`}
          >
            {todaysChange.value >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            <span>{formatPercentage(todaysChange.percentage)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">Connected Accounts</CardTitle>
        </CardHeader>
        <CardContent className="py-3">
          <div className="text-2xl font-bold text-gray-900 dark:text-foreground mb-1">{accountsCount}</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {accountsCount === 1 ? "account" : "accounts"} synced
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">Last Updated</CardTitle>
        </CardHeader>
        <CardContent className="py-3">
          <div className="text-2xl font-bold text-gray-900 dark:text-foreground mb-1">2m ago</div>
          <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
            <RefreshCw className="w-4 h-4" />
            <span>Auto-sync enabled</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
