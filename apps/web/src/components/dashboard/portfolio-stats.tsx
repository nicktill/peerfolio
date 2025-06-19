"use client"

import { TrendingUp, TrendingDown, DollarSign, Percent } from "lucide-react"

interface PortfolioStatsProps {
  totalValue: number
  performanceData: Array<{ date: string; value: number }>
}

export function PortfolioStats({ totalValue, performanceData }: PortfolioStatsProps) {
  // Calculate performance metrics
  const previousValue = performanceData[performanceData.length - 2]?.value || 0
  const currentValue = performanceData[performanceData.length - 1]?.value || totalValue
  const dayChange = currentValue - previousValue
  const dayChangePercent = previousValue > 0 ? ((dayChange / previousValue) * 100) : 0
  
  const firstValue = performanceData[0]?.value || 0
  const totalChange = currentValue - firstValue
  const totalChangePercent = firstValue > 0 ? ((totalChange / firstValue) * 100) : 0

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const formatPercent = (percent: number) => {
    const sign = percent >= 0 ? '+' : ''
    return `${sign}${percent.toFixed(2)}%`
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      {/* Total Portfolio Value */}
      <div className="bg-gray-50 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-gray-600">Total Value</p>
          <DollarSign className="w-4 h-4 text-gray-400" />
        </div>
        <p className="text-2xl font-bold text-gray-900">
          {formatCurrency(totalValue)}
        </p>
      </div>

      {/* Daily Change */}
      <div className="bg-gray-50 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-gray-600">Today</p>
          {dayChange >= 0 ? (
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          ) : (
            <TrendingDown className="w-4 h-4 text-red-500" />
          )}
        </div>
        <div className="space-y-1">
          <p className={`text-lg font-semibold ${dayChange >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {formatCurrency(Math.abs(dayChange))}
          </p>
          <p className={`text-sm ${dayChange >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {formatPercent(dayChangePercent)}
          </p>
        </div>
      </div>

      {/* Total Return */}
      <div className="bg-gray-50 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-gray-600">Total Return</p>
          {totalChange >= 0 ? (
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          ) : (
            <TrendingDown className="w-4 h-4 text-red-500" />
          )}
        </div>
        <div className="space-y-1">
          <p className={`text-lg font-semibold ${totalChange >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {formatCurrency(Math.abs(totalChange))}
          </p>
          <p className={`text-sm ${totalChange >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {formatPercent(totalChangePercent)}
          </p>
        </div>
      </div>

      {/* Performance Score */}
      <div className="bg-gray-50 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-gray-600">Performance</p>
          <Percent className="w-4 h-4 text-gray-400" />
        </div>
        <div className="space-y-1">
          <p className="text-lg font-semibold text-blue-600">
            {totalChangePercent >= 15 ? 'Excellent' : totalChangePercent >= 8 ? 'Good' : 'Fair'}
          </p>
          <p className="text-sm text-gray-500">
            vs Market
          </p>
        </div>
      </div>
    </div>
  )
}
