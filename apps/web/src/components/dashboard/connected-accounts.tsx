"use client"

import { Building2, TrendingUp, MoreVertical, Eye, Settings, RefreshCw } from "lucide-react"
import { motion } from "framer-motion"

interface Account {
  id: string
  name: string
  balance: number
  type: string
  institution?: string
}

interface ConnectedAccountsProps {
  accounts: Account[]
}

export function ConnectedAccounts({ accounts }: ConnectedAccountsProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const totalValue = accounts.reduce((sum, account) => sum + account.balance, 0)

  const getInstitutionData = (institution: string, index: number) => {
    const institutionMap: { [key: string]: { color: string; bgColor: string; logo: string } } = {
      'Fidelity': { color: 'text-green-600', bgColor: 'bg-green-100', logo: '🏦' },
      'Charles Schwab': { color: 'text-blue-600', bgColor: 'bg-blue-100', logo: '💼' },
      'TD Ameritrade': { color: 'text-red-600', bgColor: 'bg-red-100', logo: '📈' },
      'E*TRADE': { color: 'text-purple-600', bgColor: 'bg-purple-100', logo: '💹' },
      'Robinhood': { color: 'text-emerald-600', bgColor: 'bg-emerald-100', logo: '🏹' },
      'Vanguard': { color: 'text-indigo-600', bgColor: 'bg-indigo-100', logo: '🛡️' },
    }

    return institutionMap[institution] || {
      color: ['text-blue-600', 'text-emerald-600', 'text-purple-600', 'text-orange-600'][index % 4],
      bgColor: ['bg-blue-100', 'bg-emerald-100', 'bg-purple-100', 'bg-orange-100'][index % 4],
      logo: '🏛️'
    }
  }

  return (
    <div className="space-y-4">
      {accounts.map((account, index) => {
        const percentage = totalValue > 0 ? ((account.balance / totalValue) * 100) : 0
        const institutionData = getInstitutionData(account.institution || account.name, index)
        const performancePercent = ((Math.random() * 20) - 5).toFixed(1) // Mock performance data
        const isPositive = parseFloat(performancePercent) >= 0
        
        return (
          <motion.div
            key={account.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
            className="group relative bg-gradient-to-br from-white to-gray-50/50 rounded-2xl p-6 border border-gray-200/50 hover:border-gray-300/50 hover:shadow-lg transition-all duration-300"
          >
            {/* Background gradient on hover */}
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/0 to-blue-50/0 group-hover:from-emerald-50/30 group-hover:to-blue-50/30 rounded-2xl transition-all duration-300"></div>
            
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-4">
                  <motion.div 
                    className={`w-12 h-12 ${institutionData.bgColor} rounded-2xl flex items-center justify-center text-xl shadow-sm group-hover:shadow-md transition-shadow duration-300`}
                    whileHover={{ scale: 1.1 }}
                    transition={{ duration: 0.2 }}
                  >
                    {institutionData.logo}
                  </motion.div>
                  <div>
                    <h3 className="font-semibold text-gray-900 text-lg group-hover:text-gray-800 transition-colors">
                      {account.name}
                    </h3>
                    <div className="flex items-center space-x-2">
                      <p className="text-sm text-gray-500">{account.institution || 'Investment Account'}</p>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                        Active
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="text-right">
                  <motion.p 
                    className="text-2xl font-bold text-gray-900 mb-1"
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.3, delay: index * 0.1 + 0.2 }}
                  >
                    {formatCurrency(account.balance)}
                  </motion.p>
                  <div className="flex items-center justify-end space-x-2">
                    <span className="text-sm font-medium text-gray-600">{percentage.toFixed(1)}% of total</span>
                  </div>
                </div>
              </div>

              {/* Enhanced Progress bar */}
              <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-medium text-gray-500">Account Weight</span>
                  <span className="text-xs font-medium text-gray-700">{percentage.toFixed(1)}%</span>
                </div>
                <div className="relative w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                  <motion.div 
                    className="absolute top-0 left-0 h-full bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-full shadow-sm"
                    initial={{ width: 0 }}
                    animate={{ width: `${percentage}%` }}
                    transition={{ duration: 1, delay: index * 0.1 + 0.5, ease: "easeOut" }}
                  />
                  <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-white/20 to-transparent rounded-full"></div>
                </div>
              </div>

              {/* Enhanced Account details */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                <div className="flex items-center space-x-6">
                  <div className="flex items-center space-x-2">
                    {isPositive ? (
                      <TrendingUp size={14} className="text-emerald-500" />
                    ) : (
                      <TrendingUp size={14} className="text-red-500 rotate-180" />
                    )}
                    <span className={`text-sm font-semibold ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                      {isPositive ? '+' : ''}{performancePercent}%
                    </span>
                    <span className="text-xs text-gray-500">30d</span>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <RefreshCw size={14} className="text-gray-400" />
                    <span className="text-xs text-gray-500">2 min ago</span>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <motion.button 
                    className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Eye size={16} />
                  </motion.button>
                  <motion.button 
                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Settings size={16} />
                  </motion.button>
                  <motion.button 
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <MoreVertical size={16} />
                  </motion.button>
                </div>
              </div>
            </div>
          </motion.div>
        )
      })}

      {accounts.length === 0 && (
        <motion.div 
          className="text-center py-12"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Building2 size={32} className="text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No accounts connected</h3>
          <p className="text-gray-500">Connect your first investment account to get started</p>
        </motion.div>
      )}
    </div>
  )
}
