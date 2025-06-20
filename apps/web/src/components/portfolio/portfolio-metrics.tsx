"use client"

import React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@web/components/ui/card"
import { TrendingUp, TrendingDown, DollarSign, RefreshCw } from "lucide-react"

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
  formatPercentage
}: PortfolioMetricsProps) {
  return (
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
        <CardContent>
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