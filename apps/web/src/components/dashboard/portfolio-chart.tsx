"use client"

import { useState } from "react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart, ReferenceLine } from 'recharts'
import { motion } from "framer-motion"
import { TrendingUp, TrendingDown, Calendar, BarChart3 } from "lucide-react"

interface PortfolioChartProps {
  data: Array<{ date: string; value: number }>
}

export function PortfolioChart({ data }: PortfolioChartProps) {
  const [timeRange, setTimeRange] = useState('6M')
  const [chartType, setChartType] = useState<'line' | 'area'>('area')

  // Enhanced data with additional metrics
  const enhancedData = data.map((item, index) => {
    const prevValue = index > 0 ? data[index - 1].value : item.value
    const gain = item.value - prevValue
    const gainPercent = prevValue > 0 ? ((gain / prevValue) * 100) : 0
    
    return {
      ...item,
      gain,
      gainPercent,
      volume: Math.floor(Math.random() * 1000000) + 500000, // Mock volume data
    }
  })

  const currentValue = enhancedData[enhancedData.length - 1]?.value || 0
  const firstValue = enhancedData[0]?.value || 0
  const totalGain = currentValue - firstValue
  const totalGainPercent = firstValue > 0 ? ((totalGain / firstValue) * 100) : 0
  const isGaining = totalGain >= 0

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString + '-01')
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <motion.div 
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white/95 backdrop-blur-xl p-4 border border-gray-200/50 rounded-xl shadow-2xl"
        >
          <p className="text-sm font-medium text-gray-600 mb-2">{formatDate(label)}</p>
          <div className="space-y-1">
            <p className="text-lg font-bold text-gray-900">
              {formatCurrency(payload[0].value)}
            </p>
            <div className="flex items-center space-x-2">
              {data.gainPercent >= 0 ? (
                <TrendingUp className="w-3 h-3 text-emerald-500" />
              ) : (
                <TrendingDown className="w-3 h-3 text-red-500" />
              )}
              <span className={`text-xs font-medium ${data.gainPercent >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {data.gainPercent >= 0 ? '+' : ''}{data.gainPercent.toFixed(2)}%
              </span>
            </div>
          </div>
        </motion.div>
      )
    }
    return null
  }

  const timeRanges = [
    { label: '1D', value: '1D' },
    { label: '1W', value: '1W' },
    { label: '1M', value: '1M' },
    { label: '3M', value: '3M' },
    { label: '6M', value: '6M' },
    { label: '1Y', value: '1Y' },
    { label: 'ALL', value: 'ALL' },
  ]

  return (
    <div className="space-y-6">
      {/* Chart Header with Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${isGaining ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
            <span className="text-sm font-medium text-gray-600">Portfolio Value</span>
          </div>
          <div className="flex items-center space-x-2">
            {isGaining ? (
              <TrendingUp className="w-4 h-4 text-emerald-500" />
            ) : (
              <TrendingDown className="w-4 h-4 text-red-500" />
            )}
            <span className={`text-sm font-bold ${isGaining ? 'text-emerald-600' : 'text-red-600'}`}>
              {totalGainPercent >= 0 ? '+' : ''}{totalGainPercent.toFixed(2)}% ({formatCurrency(Math.abs(totalGain))})
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {/* Chart Type Toggle */}
          <div className="flex items-center bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setChartType('area')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                chartType === 'area'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Area
            </button>
            <button
              onClick={() => setChartType('line')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                chartType === 'line'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Line
            </button>
          </div>

          {/* Time Range Selector */}
          <div className="flex items-center bg-gray-100 rounded-lg p-1">
            {timeRanges.map((range) => (
              <button
                key={range.value}
                onClick={() => setTimeRange(range.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  timeRange === range.value
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Enhanced Chart */}
      <motion.div 
        className="h-96 w-full relative"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        {/* Background Gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/30 to-blue-50/30 rounded-xl"></div>
        
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'area' ? (
            <AreaChart
              data={enhancedData}
              margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
            >
              <defs>
                <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                dataKey="date" 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: '#6B7280' }}
                tickFormatter={formatDate}
              />
              <YAxis 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: '#6B7280' }}
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#10B981"
                strokeWidth={3}
                fill="url(#portfolioGradient)"
                dot={{ fill: '#10B981', strokeWidth: 2, r: 0 }}
                activeDot={{ r: 6, fill: '#10B981', stroke: '#fff', strokeWidth: 2 }}
              />
              {/* Reference line for break-even */}
              <ReferenceLine y={firstValue} stroke="#6B7280" strokeDasharray="2 2" opacity={0.5} />
            </AreaChart>
          ) : (
            <LineChart
              data={enhancedData}
              margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                dataKey="date" 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: '#6B7280' }}
                tickFormatter={formatDate}
              />
              <YAxis 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: '#6B7280' }}
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#10B981"
                strokeWidth={3}
                dot={{ fill: '#10B981', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, fill: '#10B981', stroke: '#fff', strokeWidth: 2 }}
              />
              <ReferenceLine y={firstValue} stroke="#6B7280" strokeDasharray="2 2" opacity={0.5} />
            </LineChart>
          )}
        </ResponsiveContainer>
      </motion.div>

      {/* Chart Insights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div 
          className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-xl p-4 border border-emerald-200/30"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-emerald-700">Best Month</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-lg font-bold text-emerald-900">+12.4%</p>
          <p className="text-xs text-emerald-600">March 2024</p>
        </motion.div>

        <motion.div 
          className="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-xl p-4 border border-blue-200/30"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-blue-700">Volatility</span>
            <BarChart3 className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-lg font-bold text-blue-900">Low</p>
          <p className="text-xs text-blue-600">8.2% std dev</p>
        </motion.div>

        <motion.div 
          className="bg-gradient-to-br from-purple-50 to-purple-100/50 rounded-xl p-4 border border-purple-200/30"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-purple-700">Sharpe Ratio</span>
            <Calendar className="w-4 h-4 text-purple-600" />
          </div>
          <p className="text-lg font-bold text-purple-900">1.84</p>
          <p className="text-xs text-purple-600">Above average</p>
        </motion.div>
      </div>
    </div>
  )
}
