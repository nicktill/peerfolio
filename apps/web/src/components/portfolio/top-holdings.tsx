"use client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@web/components/ui/card"
import { TrendingUp, TrendingDown, Building2, Zap, Database } from "lucide-react"

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
  hasRealData,
}: TopHoldingsProps) {
  return (
    <Card className="relative overflow-hidden">
      {/* Animated background based on mode */}
      <div
        className={`absolute inset-0 transition-all duration-700 ${
          isDemoMode
            ? "bg-gradient-to-br from-blue-50/30 via-indigo-50/20 to-purple-50/30 dark:from-blue-950/20 dark:via-indigo-950/10 dark:to-purple-950/20"
            : hasRealData
              ? "bg-gradient-to-br from-emerald-50/30 via-green-50/20 to-teal-50/30 dark:from-emerald-950/20 dark:via-green-950/10 dark:to-teal-950/20"
              : "bg-gradient-to-br from-gray-50/30 via-slate-50/20 to-gray-50/30 dark:from-gray-950/20 dark:via-slate-950/10 dark:to-gray-950/20"
        } opacity-0 hover:opacity-100`}
      />

      <CardHeader className="relative z-10">
        <CardTitle className="flex items-center gap-2 dark:text-foreground">
          <div className="flex items-center gap-2">
            {isDemoMode ? (
              <Zap className="w-5 h-5 text-blue-500" />
            ) : hasRealData ? (
              <Database className="w-5 h-5 text-emerald-500" />
            ) : (
              <TrendingUp className="w-5 h-5 text-gray-500" />
            )}
            <span>Top Holdings</span>
            {isDemoMode && (
              <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded-full font-medium border border-blue-200 dark:border-blue-800">
                Demo Stocks
              </span>
            )}
            {hasRealData && !isDemoMode && (
              <span className="text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-2 py-1 rounded-full font-medium border border-emerald-200 dark:border-emerald-800">
                {topHoldings.some((h) => h.isStock) ? "Real Holdings" : "Account Balances"}
              </span>
            )}
          </div>
        </CardTitle>
        <CardDescription className="dark:text-gray-400">
          {isDemoMode
            ? "Sample investment positions with realistic stock data"
            : hasRealData
              ? topHoldings.some((h) => h.isStock)
                ? "Your actual investment holdings from connected accounts"
                : "Your account balances from connected Plaid accounts"
              : "Your largest investment positions"}
        </CardDescription>
      </CardHeader>
      <CardContent className="relative z-10">
        {topHoldings.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <Building2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No holdings to display</p>
            <p className="text-sm">Connect an investment account to see your positions</p>
          </div>
        ) : (
          <div className="space-y-3">
            {topHoldings.map((holding, index) => (
              <div
                key={`${holding.symbol || holding.id || holding.name || "holding"}-${index}-${holding.value || 0}`}
                className={`group flex items-center justify-between p-4 rounded-xl border transition-all duration-300 hover:scale-[1.01] cursor-pointer ${
                  isDemoMode
                    ? "bg-gradient-to-r from-blue-50/80 to-indigo-50/50 dark:from-blue-950/30 dark:to-indigo-950/20 border-blue-200/50 dark:border-blue-800/40 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-lg hover:shadow-blue-500/10"
                    : hasRealData
                      ? "bg-gradient-to-r from-emerald-50/80 to-green-50/50 dark:from-emerald-950/30 dark:to-green-950/20 border-emerald-200/50 dark:border-emerald-800/40 hover:border-emerald-300 dark:hover:border-emerald-600 hover:shadow-lg hover:shadow-emerald-500/10"
                      : "bg-gradient-to-r from-white/80 to-gray-50/50 dark:from-gray-800/50 dark:to-gray-900/30 border-gray-200/50 dark:border-gray-700/40 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md dark:hover:shadow-gray-900/20"
                }`}
              >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="relative flex-shrink-0">
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden border-2 transition-all duration-300 shadow-sm group-hover:shadow-md ${
                        isDemoMode
                          ? "bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/50 dark:to-indigo-900/50 border-blue-200/70 dark:border-blue-700/50 group-hover:border-blue-300 dark:group-hover:border-blue-500"
                          : hasRealData
                            ? "bg-gradient-to-br from-emerald-100 to-green-100 dark:from-emerald-900/50 dark:to-green-900/50 border-emerald-200/70 dark:border-emerald-700/50 group-hover:border-emerald-300 dark:group-hover:border-emerald-500"
                            : "bg-gradient-to-br from-white to-gray-100 dark:from-gray-700 dark:to-gray-800 border-gray-200/70 dark:border-gray-600/50 group-hover:border-gray-300 dark:group-hover:border-gray-500"
                      }`}
                    >
                      {holding.isStock ? (
                        <img
                          src={holding.logo || "/placeholder.svg"}
                          alt={holding.name}
                          className="w-7 h-7 object-contain group-hover:scale-110 transition-transform duration-300"
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
                                const bgColor = isDemoMode
                                  ? "from-blue-500 to-indigo-600"
                                  : hasRealData
                                    ? "from-emerald-500 to-green-600"
                                    : "from-gray-500 to-gray-600"
                                parent.innerHTML = `<div class="w-7 h-7 rounded bg-gradient-to-br ${bgColor} flex items-center justify-center text-white text-sm font-bold shadow-inner">${holding.symbol?.charAt(0) || "?"}</div>`
                              }
                            }
                          }}
                        />
                      ) : (
                        <img
                          src={holding.logo || "/placeholder.svg"}
                          alt={holding.institutionName || holding.name}
                          className="w-7 h-7 object-contain group-hover:scale-110 transition-transform duration-300"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement
                            const parent = target.parentElement
                            if (parent) {
                              const icon = holding.accountTypeInfo?.icon || "🏦"
                              const bgColor = isDemoMode
                                ? "bg-blue-100 dark:bg-blue-900/50"
                                : hasRealData
                                  ? "bg-emerald-100 dark:bg-emerald-900/50"
                                  : "bg-gray-100 dark:bg-gray-700"
                              parent.innerHTML = `<div class="w-7 h-7 rounded ${bgColor} flex items-center justify-center text-sm">${icon}</div>`
                            }
                          }}
                        />
                      )}
                    </div>

                    {/* Enhanced badge for account types */}
                    {!holding.isStock && holding.accountTypeInfo && (
                      <div
                        className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs border-2 border-white dark:border-gray-800 shadow-md transition-transform duration-300 group-hover:scale-110 ${
                          isDemoMode
                            ? "bg-blue-500 text-white"
                            : hasRealData
                              ? "bg-emerald-500 text-white"
                              : holding.accountTypeInfo.bgColor
                        }`}
                      >
                        {holding.accountTypeInfo.icon}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="font-bold text-gray-900 dark:text-gray-100 text-base truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors duration-300">
                        {holding.isStock ? holding.symbol : holding.name}
                      </div>
                      {holding.isStock && isDemoMode && (
                        <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full font-medium border border-blue-200 dark:border-blue-800">
                          Demo
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-300 truncate">
                      {holding.isStock ? holding.name : `${holding.institutionName} • ${holding.accountType}`}
                    </div>
                  </div>
                </div>

                <div className="text-right flex-shrink-0 ml-3">
                  <div className="font-bold text-gray-900 dark:text-gray-100 text-sm mb-0.5">
                    {formatCurrency(holding.value)}
                  </div>
                  {holding.change !== undefined && (
                    <div
                      className={`flex items-center justify-end gap-1 text-xs ${
                        holding.change >= 0 ? "text-emerald-600" : "text-red-600"
                      }`}
                    >
                      {holding.change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
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
