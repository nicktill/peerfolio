"use client"

import React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@web/components/ui/card"
import { TrendingUp, TrendingDown } from "lucide-react"

interface TopHoldingsProps {
  topHoldings: any[]
  formatCurrency: (value: number) => string
  formatPercentage: (value: number) => string
  getStockIcon: (symbol: string) => string
  isDemoMode?: boolean
  hasRealData?: boolean
}

export function TopHoldings({
  topHoldings,
  formatCurrency,
  formatPercentage,
  getStockIcon,
  isDemoMode,
  hasRealData
}: TopHoldingsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 dark:text-foreground">
          <TrendingUp className="w-5 h-5 text-emerald-500" />
          Top Holdings
        </CardTitle>
        <CardDescription className="dark:text-gray-400">
          Your largest investment positions
        </CardDescription>
      </CardHeader>
      <CardContent>
        {topHoldings.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            No holdings to display
          </div>
        ) : (
          <div className="space-y-3">
            {topHoldings.map((holding, index) => (
              <div
                key={holding.symbol || holding.id || index}
                className="group flex items-center justify-between p-3 bg-gradient-to-r from-white/80 to-gray-50/50 dark:from-gray-800/50 dark:to-gray-900/30 rounded-xl border border-gray-200/50 dark:border-gray-700/40 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md dark:hover:shadow-gray-900/20 transition-all duration-300 hover:scale-[1.01]"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="relative flex-shrink-0">
                    <div className="w-10 h-10 bg-gradient-to-br from-white to-gray-100 dark:from-gray-700 dark:to-gray-800 rounded-lg flex items-center justify-center overflow-hidden border border-gray-200/70 dark:border-gray-600/50 group-hover:border-gray-300 dark:group-hover:border-gray-500 transition-all duration-300 shadow-sm">
                      {holding.isStock ? (
                        <img
                          src={holding.logo}
                          alt={holding.name}
                          className="w-6 h-6 object-contain"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement
                            if (holding.fallbackLogo && target.src !== holding.fallbackLogo) {
                              target.src = holding.fallbackLogo
                            } else if (holding.defaultLogo && target.src !== holding.defaultLogo) {
                              target.src = holding.defaultLogo
                            } else {
                              // Create a fallback icon with the first letter
                              const parent = target.parentElement
                              if (parent) {
                                parent.innerHTML = `<div class="w-6 h-6 rounded bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">${holding.symbol?.charAt(0) || '?'}</div>`
                              }
                            }
                          }}
                        />
                      ) : (
                        <img
                          src={holding.logo}
                          alt={holding.institutionName || holding.name}
                          className="w-6 h-6 object-contain"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement
                            const parent = target.parentElement
                            if (parent) {
                              const icon = holding.accountTypeInfo?.icon || '📊'
                              const bgColor = holding.accountTypeInfo?.bgColor || 'bg-gray-100'
                              parent.innerHTML = `<div class="w-6 h-6 rounded ${bgColor} flex items-center justify-center text-xs">${icon}</div>`
                            }
                          }}
                        />
                      )}
                    </div>
                    {/* Only show emoji icon for non-stock holdings (accounts) */}
                    {!holding.isStock && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center text-xs border border-gray-200 dark:border-gray-600">
                        {holding.accountTypeInfo?.icon}
                      </div>
                    )}
                  </div>
                  
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm mb-0.5 truncate">
                      {holding.isStock ? holding.symbol : holding.name}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-300 truncate">
                      {holding.isStock ? holding.name : `${holding.institutionName} • ${holding.accountType}`}
                    </div>
                  </div>
                </div>
                
                <div className="text-right flex-shrink-0 ml-3">
                  <div className="font-bold text-gray-900 dark:text-gray-100 text-sm mb-0.5">
                    {formatCurrency(holding.value)}
                  </div>
                  {holding.change !== undefined && (
                    <div className={`flex items-center justify-end gap-1 text-xs ${
                      holding.change >= 0 ? "text-emerald-600" : "text-red-600"
                    }`}>
                      {holding.change >= 0 ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : (
                        <TrendingDown className="w-3 h-3" />
                      )}
                      <span>{formatPercentage(holding.change)}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}