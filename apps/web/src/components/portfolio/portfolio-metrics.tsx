"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card"
import { TrendingUp, TrendingDown, Users, Eye, EyeOff } from "lucide-react"
import { Button } from "@web/components/ui/button"
import { useState } from "react"
import { ConnectedInstitutions } from "./connected-institutions"

interface PortfolioMetricsProps {
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
  isDemoMode: boolean
  hasRealData?: boolean
  selectedTimeframe: string
  chartData: any[]
  connectedPlaidAccounts: any[]
}

export function PortfolioMetrics({
  totalBalance,
  totalGain,
  totalGainPercentage,
  todaysChange,
  accountsCount,
  balanceSummary,
  formatCurrency,
  formatPercentage,
  isDemoMode,
  hasRealData = false,
  selectedTimeframe,
  chartData,
  connectedPlaidAccounts,
}: PortfolioMetricsProps) {
  const [showAssetsOnly, setShowAssetsOnly] = useState(false)

  // Calculate percentage using EXACT same logic as the chart component
  const getChartBasedPercentage = () => {
    if (!chartData || chartData.length < 2) {
      return 0
    }

    const firstValue = chartData[0]?.value || 0
    const lastValue = chartData[chartData.length - 1]?.value || 0

    if (firstValue === 0) return 0

    // Use the exact same calculation as the chart
    return ((lastValue - firstValue) / Math.abs(firstValue)) * 100
  }

  // Get the display values based on current view mode
  const getDisplayValues = () => {
    if (showAssetsOnly) {
      // When showing assets only, we need to calculate based on asset growth
      const currentAssets = balanceSummary.totalAssets

      if (!chartData || chartData.length < 2) {
        return {
          value: currentAssets,
          percentage: 0,
          gain: 0,
        }
      }

      // For assets-only view, estimate the starting asset value
      // by using the ratio of current assets to current net worth
      const currentNetWorth = chartData[chartData.length - 1]?.value || 0
      const startingNetWorth = chartData[0]?.value || 0

      // If we have negative net worth, we need to handle this differently
      if (currentNetWorth <= 0) {
        // Estimate starting assets based on current asset/liability ratio
        const assetRatio = currentAssets / (currentAssets + balanceSummary.totalLiabilities)
        const estimatedStartingAssets = Math.abs(startingNetWorth) * assetRatio + balanceSummary.totalLiabilities

        const assetGain = currentAssets - estimatedStartingAssets
        const assetPercentage = estimatedStartingAssets > 0 ? (assetGain / estimatedStartingAssets) * 100 : 0

        return {
          value: currentAssets,
          percentage: assetPercentage,
          gain: assetGain,
        }
      } else {
        // Positive net worth case
        const assetRatio = currentAssets / currentNetWorth
        const estimatedStartingAssets = startingNetWorth * assetRatio

        const assetGain = currentAssets - estimatedStartingAssets
        const assetPercentage = estimatedStartingAssets > 0 ? (assetGain / estimatedStartingAssets) * 100 : 0

        return {
          value: currentAssets,
          percentage: assetPercentage,
          gain: assetGain,
        }
      }
    } else {
      // Net worth view - use chart data directly
      const percentage = getChartBasedPercentage()
      const gain = chartData && chartData.length >= 2 ? chartData[chartData.length - 1]?.value - chartData[0]?.value : 0

      return {
        value: totalBalance,
        percentage: percentage,
        gain: gain,
      }
    }
  }

  const displayValues = getDisplayValues()
  const displayTitle = showAssetsOnly ? "Total Assets" : "Net Portfolio Value"

  // Get dynamic styling based on value and view mode
  const getCardStyling = () => {
    if (showAssetsOnly) {
      // Total Assets view - always green since assets are positive
      return {
        cardClass:
          "overflow-hidden border-emerald-200/50 dark:border-emerald-800/50 bg-gradient-to-br from-emerald-50/30 to-green-50/20 dark:from-emerald-950/20 dark:to-green-950/10",
        titleColor: "text-emerald-700 dark:text-emerald-300",
        dotColor: "bg-emerald-500",
      }
    } else {
      // Net Portfolio Value view - color based on positive/negative
      if (displayValues.value >= 0) {
        return {
          cardClass:
            "overflow-hidden border-emerald-200/50 dark:border-emerald-800/50 bg-gradient-to-br from-emerald-50/30 to-green-50/20 dark:from-emerald-950/20 dark:to-green-950/10",
          titleColor: "text-emerald-700 dark:text-emerald-300",
          dotColor: "bg-emerald-500",
        }
      } else {
        return {
          cardClass:
            "overflow-hidden border-red-200/50 dark:border-red-800/50 bg-gradient-to-br from-red-50/30 to-rose-50/20 dark:from-red-950/20 dark:to-rose-950/10",
          titleColor: "text-red-700 dark:text-red-300",
          dotColor: "bg-red-500",
        }
      }
    }
  }

  const cardStyling = getCardStyling()

  // Get timeframe label
  const getTimeframeLabel = () => {
    switch (selectedTimeframe) {
      case "1D":
        return "1 day"
      case "1W":
        return "1 week"
      case "1M":
        return "1 month"
      case "3M":
        return "3 months"
      case "6M":
        return "6 months"
      case "1Y":
        return "1 year"
      case "ALL":
        return "all time"
      default:
        return "1 year"
    }
  }

  // Count assets and liabilities properly
  const getAccountCounts = () => {
    if (isDemoMode) {
      return { assetCount: 1, liabilityCount: 0 }
    }

    if (!hasRealData || connectedPlaidAccounts.length === 0) {
      return { assetCount: 1, liabilityCount: 0 }
    }

    let assetCount = 0
    let liabilityCount = 0

    connectedPlaidAccounts.forEach((plaidAccount) => {
      plaidAccount.accountsData.accounts?.forEach((account: any) => {
        const accountType = (account.subtype || account.type || "").toLowerCase()

        if (
          accountType.includes("credit") ||
          accountType.includes("loan") ||
          accountType.includes("mortgage") ||
          accountType.includes("student") ||
          accountType.includes("auto") ||
          accountType.includes("personal")
        ) {
          liabilityCount++
        } else {
          assetCount++
        }
      })
    })

    return { assetCount, liabilityCount }
  }

  const { assetCount, liabilityCount } = getAccountCounts()
  const hasLiabilities = balanceSummary.totalLiabilities > 0

  return (
    <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
      {/* Net Portfolio Value / Total Assets Toggle */}
      <Card className={cardStyling.cardClass}>
        <CardHeader className="pb-3">
          <CardTitle className={`flex items-center justify-between ${cardStyling.titleColor} text-sm font-medium`}>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 ${cardStyling.dotColor} rounded-full`}></div>
              {displayTitle}
            </div>
            {hasLiabilities && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAssetsOnly(!showAssetsOnly)}
                className="h-8 w-8 p-0 touch-manipulation"
                title={showAssetsOnly ? "View net worth" : "View only assets"}
              >
                {showAssetsOnly ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 p-4 sm:p-6">
          <div className="space-y-3">
            <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              {formatCurrency(displayValues.value)}
            </div>

            {/* Show percentage gain/loss */}
            <div className="flex items-center gap-2">
              {displayValues.percentage >= 0 ? (
                <TrendingUp className="w-4 h-4 text-emerald-500" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-500" />
              )}
              <span
                className={`text-sm font-medium ${
                  displayValues.percentage >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400"
                }`}
              >
                {formatPercentage(displayValues.percentage)} {getTimeframeLabel()}
              </span>
            </div>

            {/* Liabilities excluded banner */}
            {showAssetsOnly && hasLiabilities && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">
                <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">
                  Liabilities not included in calculation
                </p>
              </div>
            )}

            {/* Assets and Liabilities breakdown */}
            <div
              className={`grid grid-cols-2 gap-2 sm:gap-4 pt-2 border-t ${
                showAssetsOnly || displayValues.value >= 0
                  ? "border-emerald-200/30 dark:border-emerald-800/30"
                  : "border-red-200/30 dark:border-red-800/30"
              }`}
            >
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">Assets</div>
                <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(balanceSummary.totalAssets)}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">Liabilities</div>
                <div className="text-sm font-semibold text-red-600 dark:text-red-400">
                  {formatCurrency(balanceSummary.totalLiabilities)}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Connected Institutions */}
      <ConnectedInstitutions
        isDemoMode={isDemoMode}
        hasRealData={hasRealData}
        connectedPlaidAccounts={connectedPlaidAccounts}
      />

      {/* Connected Accounts */}
      <Card className="overflow-hidden border-purple-200/50 dark:border-purple-800/50 bg-gradient-to-br from-purple-50/30 to-pink-50/20 dark:from-purple-950/20 dark:to-pink-950/10">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-purple-700 dark:text-purple-300 text-sm font-medium">
            <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
            Connected Accounts
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-3">
            <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">{accountsCount}</div>
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <Users className="w-4 h-4" />
              <span>accounts synced</span>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-purple-200/30 dark:border-purple-800/30">
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">Assets</div>
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{assetCount}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">Liabilities</div>
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{liabilityCount}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
