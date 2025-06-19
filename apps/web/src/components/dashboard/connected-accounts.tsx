"use client"

import { Building2, TrendingUp, MoreVertical } from "lucide-react"

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

  const getInstitutionIcon = (institution: string) => {
    // In a real app, you'd have actual logos
    const colors = [
      'bg-blue-100 text-blue-600',
      'bg-emerald-100 text-emerald-600',
      'bg-purple-100 text-purple-600',
      'bg-orange-100 text-orange-600',
    ]
    const colorIndex = institution?.charCodeAt(0) % colors.length || 0
    return colors[colorIndex]
  }

  return (
    <div className="space-y-4">
      {accounts.map((account, index) => {
        const percentage = totalValue > 0 ? ((account.balance / totalValue) * 100) : 0
        
        return (
          <div key={account.id} className="p-4 border border-gray-200 rounded-xl hover:border-gray-300 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getInstitutionIcon(account.institution || account.name)}`}>
                  <Building2 size={20} />
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">{account.name}</h3>
                  <p className="text-sm text-gray-500">{account.institution || 'Investment Account'}</p>
                </div>
              </div>
              
              <div className="text-right">
                <p className="font-semibold text-gray-900">{formatCurrency(account.balance)}</p>
                <p className="text-sm text-gray-500">{percentage.toFixed(1)}% of total</p>
              </div>
            </div>

            {/* Progress bar showing percentage of total */}
            <div className="mt-3">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${percentage}%` }}
                ></div>
              </div>
            </div>

            {/* Account actions */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
              <div className="flex items-center space-x-4 text-sm text-gray-600">
                <span className="flex items-center space-x-1">
                  <TrendingUp size={14} className="text-emerald-500" />
                  <span>+{((Math.random() * 10) + 5).toFixed(1)}%</span>
                </span>
                <span>Last sync: 2 min ago</span>
              </div>
              
              <button className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
                <MoreVertical size={16} />
              </button>
            </div>
          </div>
        )
      })}

      {accounts.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <Building2 size={48} className="mx-auto mb-4 text-gray-300" />
          <p>No accounts connected yet</p>
        </div>
      )}
    </div>
  )
}
