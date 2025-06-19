"use client"

import { TrendingUp, TrendingDown, DollarSign, Percent, Target, Award } from "lucide-react"
import { motion } from "framer-motion"

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

  const stats = [
    {
      label: "Total Portfolio Value",
      value: formatCurrency(totalValue),
      icon: DollarSign,
      gradient: "from-emerald-500 to-emerald-600",
      bg: "from-emerald-50 to-emerald-100/50",
      border: "border-emerald-200/30",
      iconColor: "text-emerald-600",
      valueColor: "text-emerald-900",
      change: null,
      delay: 0
    },
    {
      label: "Today's Change",
      value: formatCurrency(Math.abs(dayChange)),
      icon: dayChange >= 0 ? TrendingUp : TrendingDown,
      gradient: dayChange >= 0 ? "from-emerald-500 to-emerald-600" : "from-red-500 to-red-600",
      bg: dayChange >= 0 ? "from-emerald-50 to-emerald-100/50" : "from-red-50 to-red-100/50",
      border: dayChange >= 0 ? "border-emerald-200/30" : "border-red-200/30",
      iconColor: dayChange >= 0 ? "text-emerald-600" : "text-red-600",
      valueColor: dayChange >= 0 ? "text-emerald-900" : "text-red-900",
      change: formatPercent(dayChangePercent),
      changeColor: dayChange >= 0 ? "text-emerald-600" : "text-red-600",
      delay: 0.1
    },
    {
      label: "Total Return",
      value: formatCurrency(Math.abs(totalChange)),
      icon: totalChange >= 0 ? TrendingUp : TrendingDown,
      gradient: totalChange >= 0 ? "from-blue-500 to-blue-600" : "from-red-500 to-red-600",
      bg: totalChange >= 0 ? "from-blue-50 to-blue-100/50" : "from-red-50 to-red-100/50",
      border: totalChange >= 0 ? "border-blue-200/30" : "border-red-200/30",
      iconColor: totalChange >= 0 ? "text-blue-600" : "text-red-600",
      valueColor: totalChange >= 0 ? "text-blue-900" : "text-red-900",
      change: formatPercent(totalChangePercent),
      changeColor: totalChange >= 0 ? "text-blue-600" : "text-red-600",
      delay: 0.2
    },
    {
      label: "Performance Grade",
      value: totalChangePercent >= 15 ? 'A+' : totalChangePercent >= 10 ? 'A' : totalChangePercent >= 5 ? 'B+' : 'B',
      icon: Award,
      gradient: "from-purple-500 to-purple-600",
      bg: "from-purple-50 to-purple-100/50",
      border: "border-purple-200/30",
      iconColor: "text-purple-600",
      valueColor: "text-purple-900",
      change: "vs S&P 500",
      changeColor: "text-purple-600",
      delay: 0.3
    }
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {stats.map((stat, index) => {
        const Icon = stat.icon
        return (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: stat.delay }}
            className={`relative bg-gradient-to-br ${stat.bg} rounded-2xl p-6 border ${stat.border} group hover:shadow-lg transition-all duration-300`}
          >
            {/* Background Pattern */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/50 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            
            {/* Content */}
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <div className={`p-2.5 bg-gradient-to-br ${stat.gradient} rounded-xl shadow-lg`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 ml-3">
                  <p className="text-sm font-medium text-gray-600">{stat.label}</p>
                </div>
              </div>
              
              <div className="space-y-2">
                <motion.p 
                  className={`text-2xl font-bold ${stat.valueColor}`}
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: 0.3, delay: stat.delay + 0.2 }}
                >
                  {stat.value}
                </motion.p>
                
                {stat.change && (
                  <div className="flex items-center space-x-2">
                    <span className={`text-sm font-semibold ${stat.changeColor}`}>
                      {stat.change}
                    </span>
                    {stat.label !== "Performance Grade" && (
                      <span className="text-xs text-gray-500">from yesterday</span>
                    )}
                  </div>
                )}
              </div>

              {/* Progress bar for performance grade */}
              {stat.label === "Performance Grade" && (
                <div className="mt-3">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <motion.div 
                      className="bg-gradient-to-r from-purple-500 to-purple-600 h-2 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(Math.max(totalChangePercent, 0), 25) * 4}%` }}
                      transition={{ duration: 1, delay: stat.delay + 0.5 }}
                    ></motion.div>
                  </div>
                </div>
              )}
            </div>

            {/* Hover glow effect */}
            <div className={`absolute inset-0 bg-gradient-to-br ${stat.gradient} rounded-2xl opacity-0 group-hover:opacity-5 transition-opacity duration-300`}></div>
          </motion.div>
        )
      })}
    </div>
  )
}
