"use client"

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { motion } from "framer-motion"
import { TrendingUp, TrendingDown, AlertCircle, CheckCircle2 } from "lucide-react"

interface AssetAllocationProps {
  data: Array<{
    name: string
    value: number
    amount: number
    color: string
  }>
}

export function AssetAllocation({ data }: AssetAllocationProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <motion.div 
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white/95 backdrop-blur-xl p-4 border border-gray-200/50 rounded-xl shadow-2xl"
        >
          <div className="flex items-center space-x-2 mb-2">
            <div 
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: data.color }}
            ></div>
            <p className="font-semibold text-gray-900">{data.name}</p>
          </div>
          <p className="text-lg font-bold text-gray-900">{formatCurrency(data.amount)}</p>
          <p className="text-sm text-gray-600">{data.value}% of portfolio</p>
        </motion.div>
      )
    }
    return null
  }

  // Calculate total for center display
  const totalAmount = data.reduce((sum, item) => sum + item.amount, 0)

  return (
    <div className="space-y-6">
      {/* Enhanced Pie Chart with Center Value */}
      <div className="relative h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={70}
              outerRadius={120}
              paddingAngle={3}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        
        {/* Center Value Display */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <p className="text-xs font-medium text-gray-500 mb-1">Total Value</p>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalAmount)}</p>
          </div>
        </div>
      </div>

      {/* Enhanced Legend with Performance Indicators */}
      <div className="space-y-3">
        {data.map((item, index) => {
          // Mock performance data for each asset class
          const performance = ((Math.random() * 20) - 10).toFixed(1)
          const isPositive = parseFloat(performance) >= 0
          
          return (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="flex items-center justify-between p-3 bg-gray-50/50 rounded-xl hover:bg-gray-50 transition-colors group"
            >
              <div className="flex items-center space-x-3">
                <motion.div 
                  className="w-4 h-4 rounded-full shadow-sm"
                  style={{ backgroundColor: item.color }}
                  whileHover={{ scale: 1.2 }}
                  transition={{ duration: 0.2 }}
                ></motion.div>
                <div>
                  <span className="text-sm font-semibold text-gray-900">{item.name}</span>
                  <div className="flex items-center space-x-2 mt-1">
                    {isPositive ? (
                      <TrendingUp size={12} className="text-emerald-500" />
                    ) : (
                      <TrendingDown size={12} className="text-red-500" />
                    )}
                    <span className={`text-xs font-medium ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                      {isPositive ? '+' : ''}{performance}%
                    </span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-gray-900">{formatCurrency(item.amount)}</p>
                <p className="text-xs text-gray-500">{item.value}%</p>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Enhanced Portfolio Health Insights */}
      <motion.div 
        className="pt-6 border-t border-gray-200"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.5 }}
      >
        <h4 className="text-lg font-semibold text-gray-900 mb-4">Portfolio Health Score</h4>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-xl border border-emerald-200/30">
            <div className="flex items-center space-x-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <div>
                <p className="text-sm font-semibold text-emerald-900">Diversification</p>
                <p className="text-xs text-emerald-700">Well balanced across asset classes</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-emerald-900">Good</p>
              <div className="flex space-x-0.5 mt-1">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                ))}
                <div className="w-2 h-2 bg-emerald-200 rounded-full"></div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-blue-50 rounded-xl border border-blue-200/30">
            <div className="flex items-center space-x-3">
              <AlertCircle className="w-5 h-5 text-blue-600" />
              <div>
                <p className="text-sm font-semibold text-blue-900">Risk Level</p>
                <p className="text-xs text-blue-700">Moderate risk tolerance</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-blue-900">Moderate</p>
              <div className="flex space-x-0.5 mt-1">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="w-2 h-2 bg-blue-500 rounded-full"></div>
                ))}
                {[4, 5].map((i) => (
                  <div key={i} className="w-2 h-2 bg-blue-200 rounded-full"></div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-purple-50 rounded-xl border border-purple-200/30">
            <div className="flex items-center space-x-3">
              <TrendingUp className="w-5 h-5 text-purple-600" />
              <div>
                <p className="text-sm font-semibold text-purple-900">Rebalancing</p>
                <p className="text-xs text-purple-700">Portfolio is well balanced</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-purple-900">Not Needed</p>
              <p className="text-xs text-purple-600">Next check: 3 months</p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
