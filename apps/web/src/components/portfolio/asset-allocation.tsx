"use client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@web/components/ui/card"
import { ChartTooltip, ChartTooltipContent } from "@web/components/ui/chart"
import { ResponsiveContainer, PieChart as RechartsPieChart, Cell, Pie } from "recharts"

interface AssetAllocationProps {
  assetAllocation: any[]
  formatCurrency: (value: number) => string
  isDemoMode?: boolean
  hasRealData?: boolean
}

export function AssetAllocation({ assetAllocation, formatCurrency, isDemoMode, hasRealData }: AssetAllocationProps) {
  const totalValue = assetAllocation.reduce((sum, item) => sum + item.value, 0)

  return (
    <Card className="relative group/chart overflow-hidden">
      <div
        className={`absolute inset-0 transition-all duration-700 ${
          isDemoMode
            ? "bg-gradient-to-br from-violet-50/30 via-blue-50/20 to-indigo-50/30 dark:from-violet-950/20 dark:via-blue-950/10 dark:to-indigo-950/20"
            : hasRealData
              ? "bg-gradient-to-br from-emerald-50/30 via-green-50/20 to-teal-50/30 dark:from-emerald-950/20 dark:via-green-950/10 dark:to-teal-950/20"
              : "bg-gradient-to-br from-gray-50/30 via-slate-50/20 to-gray-50/30 dark:from-gray-950/20 dark:via-slate-950/10 dark:to-gray-950/20"
        } opacity-0 group-hover/chart:opacity-100`}
      />

      <CardHeader
        className={`relative z-10 border-b border-gray-100 dark:border-gray-800 pb-4 ${
          isDemoMode
            ? "bg-gradient-to-br from-violet-50/50 to-blue-50/50 dark:from-violet-950/20 dark:to-blue-950/20"
            : hasRealData
              ? "bg-gradient-to-br from-emerald-50/50 to-green-50/50 dark:from-emerald-950/20 dark:to-green-950/20"
              : "bg-gradient-to-br from-gray-50/50 to-slate-50/50 dark:from-gray-950/20 dark:to-slate-950/20"
        }`}
      >
        <CardTitle className="flex items-center justify-between text-gray-900 dark:text-foreground">
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                isDemoMode ? "bg-violet-500" : hasRealData ? "bg-emerald-500" : "bg-gray-500"
              }`}
            ></div>
            <span>Asset Allocation</span>
            {isDemoMode && (
              <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded-full font-medium">
                Demo
              </span>
            )}
            {hasRealData && !isDemoMode && (
              <span className="text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-2 py-1 rounded-full font-medium">
                Live Data
              </span>
            )}
          </div>
          <span className="text-sm font-normal text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 px-3 py-1 rounded-full border border-gray-200 dark:border-gray-700">
            {assetAllocation.length} {assetAllocation.length === 1 ? "class" : "classes"}
          </span>
        </CardTitle>
        <CardDescription className="text-gray-600 dark:text-gray-300">
          {isDemoMode
            ? "Sample portfolio distribution showing asset diversification"
            : hasRealData
              ? "Your actual account distribution from connected Plaid accounts"
              : "Portfolio distribution by asset type"}
        </CardDescription>
      </CardHeader>

      <CardContent className="relative z-10 p-6">
        <div className="space-y-8">
          {/* Enhanced Pie Chart */}
          <div className="relative h-64 group/chart">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsPieChart>
                <defs>
                  {assetAllocation.map((entry, index) => (
                    <linearGradient key={`gradient-${index}`} id={`gradient-${index}`} x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor={entry.color} stopOpacity={0.9} />
                      <stop offset="100%" stopColor={entry.color} stopOpacity={0.7} />
                    </linearGradient>
                  ))}
                  <filter id="drop-shadow" x="-50%" y="-50%" width="200%" height="200%">
                    <feDropShadow dx="0" dy="4" stdDeviation="8" floodOpacity="0.1" />
                  </filter>
                </defs>
                <Pie
                  data={assetAllocation}
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={110}
                  paddingAngle={3}
                  dataKey="value"
                  stroke="rgba(255,255,255,0.9)"
                  strokeWidth={2}
                  filter="url(#drop-shadow)"
                  className="transition-all duration-500"
                  animationDuration={isDemoMode ? 2000 : hasRealData ? 1500 : 1000}
                >
                  {assetAllocation.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={`url(#gradient-${index})`}
                      className="hover:opacity-90 transition-all duration-300 cursor-pointer hover:scale-105 origin-center"
                    />
                  ))}
                </Pie>
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, name) => [
                        `${formatCurrency(value as number)} (${(((value as number) / totalValue) * 100).toFixed(1)}%)`,
                        name,
                      ]}
                      className="bg-white/95 dark:bg-gray-800/95 backdrop-blur-lg border border-gray-200/60 dark:border-gray-700/60 shadow-xl rounded-xl"
                    />
                  }
                />
              </RechartsPieChart>
            </ResponsiveContainer>

            {/* Enhanced Center Display */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div
                className={`text-center bg-white/95 dark:bg-gray-900/95 backdrop-blur-lg rounded-full w-28 h-28 flex flex-col items-center justify-center border-2 shadow-xl group-hover/chart:scale-105 transition-all duration-500 ${
                  isDemoMode
                    ? "border-blue-200/80 dark:border-blue-700/80"
                    : hasRealData
                      ? "border-emerald-200/80 dark:border-emerald-700/80"
                      : "border-gray-200/80 dark:border-gray-700/80"
                }`}
              >
                <div className="space-y-1">
                  <div
                    className={`text-xs font-semibold uppercase tracking-wider ${
                      isDemoMode
                        ? "text-blue-600 dark:text-blue-400"
                        : hasRealData
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-gray-600 dark:text-gray-400"
                    }`}
                  >
                    Total Value
                  </div>
                  <div className="text-sm font-bold text-gray-900 dark:text-gray-100 leading-tight">
                    {formatCurrency(totalValue)}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                    {assetAllocation.length} {assetAllocation.length === 1 ? "class" : "classes"}
                  </div>
                </div>
              </div>
            </div>

            {/* Floating indicators on hover */}
            <div className="absolute top-6 right-6 opacity-0 group-hover/chart:opacity-100 transition-all duration-500">
              <div className="flex items-center gap-2 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm px-3 py-2 rounded-full border border-gray-200/50 dark:border-gray-700/50 shadow-lg">
                <div
                  className={`w-2 h-2 rounded-full ${
                    isDemoMode
                      ? "bg-blue-500 animate-pulse"
                      : hasRealData
                        ? "bg-emerald-500 animate-pulse"
                        : "bg-gray-500"
                  }`}
                ></div>
                <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                  {isDemoMode ? "Demo Data" : hasRealData ? "Live Data" : "Sample Data"}
                </span>
              </div>
            </div>
          </div>

          {/* Professional Asset List */}
          <div className="space-y-4">
            {assetAllocation.map((item, index) => {
              const percentage = (item.value / totalValue) * 100
              return (
                <div
                  key={`${item.name}-${index}-${item.value}`}
                  className="group/item relative p-5 bg-gradient-to-r from-white/80 via-white/60 to-white/40 dark:from-gray-800/60 dark:via-gray-800/40 dark:to-gray-800/20 backdrop-blur-sm rounded-xl border border-gray-200/60 dark:border-gray-700/40 hover:shadow-lg dark:hover:shadow-gray-900/20 transition-all duration-300 hover:scale-[1.02] cursor-pointer overflow-hidden"
                  style={{
                    borderColor: `${item.color}20`,
                  }}
                >
                  {/* Subtle hover background */}
                  <div
                    className="absolute inset-0 opacity-0 group-hover/item:opacity-100 transition-opacity duration-500"
                    style={{
                      background: `linear-gradient(90deg, ${item.color}05, ${item.color}10, ${item.color}05)`,
                    }}
                  />

                  <div className="relative flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {/* Enhanced color indicator */}
                      <div className="relative">
                        <div
                          className="w-5 h-5 rounded-lg shadow-md border-2 border-white/80 dark:border-gray-700/80 group-hover/item:scale-110 transition-transform duration-300"
                          style={{ backgroundColor: item.color }}
                        />
                        <div
                          className="absolute inset-0 rounded-lg opacity-0 group-hover/item:opacity-40 transition-opacity duration-300"
                          style={{
                            backgroundColor: item.color,
                            filter: "blur(8px)",
                            transform: "scale(1.5)",
                          }}
                        />
                      </div>

                      {/* Asset info */}
                      <div className="space-y-1">
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-gray-900 dark:text-gray-100 text-lg transition-colors duration-300">
                            {item.name}
                          </span>
                          <span
                            className="px-2.5 py-1 rounded-full text-xs font-semibold text-white shadow-sm group-hover/item:shadow-md transition-shadow duration-300"
                            style={{ backgroundColor: item.color }}
                          >
                            {percentage.toFixed(1)}%
                          </span>
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                          {hasRealData && item.accounts
                            ? `${item.accounts.length} account${item.accounts.length !== 1 ? "s" : ""} • ${item.name.toLowerCase()}`
                            : "Portfolio allocation • Investment category"}
                        </div>
                      </div>
                    </div>

                    {/* Value display with progress bar */}
                    <div className="text-right space-y-3 min-w-[160px]">
                      <div className="space-y-1">
                        <div className="font-bold text-gray-900 dark:text-gray-100 text-lg transition-colors duration-300">
                          {formatCurrency(item.value)}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">Asset Value</div>
                      </div>

                      {/* Professional progress bar */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                          <span>Allocation</span>
                          <span className="font-semibold">{percentage.toFixed(1)}%</span>
                        </div>
                        <div className="relative w-full h-2 bg-gray-200/80 dark:bg-gray-700/80 rounded-full overflow-hidden">
                          <div
                            className="absolute top-0 left-0 h-full rounded-full transition-all duration-1000 ease-out"
                            style={{
                              width: `${percentage}%`,
                              background: `linear-gradient(90deg, ${item.color}, ${item.color}cc)`,
                              boxShadow: `0 0 8px ${item.color}40`,
                            }}
                          />
                          {/* Subtle shimmer effect */}
                          <div className="absolute top-0 left-0 h-full w-6 bg-gradient-to-r from-transparent via-white/30 to-transparent rounded-full opacity-0 group-hover/item:opacity-100 group-hover/item:animate-pulse transition-opacity duration-300" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Enhanced Summary Stats */}
          <div className="grid grid-cols-3 gap-6 pt-6 border-t border-gradient-to-r from-transparent via-gray-200/50 to-transparent dark:via-gray-700/50">
            {[
              {
                label: hasRealData ? "Account Types" : "Asset Classes",
                value: assetAllocation.length,
                color: isDemoMode ? "blue" : hasRealData ? "emerald" : "gray",
                icon: "🎯",
              },
              {
                label: "Largest Holding",
                value: `${Math.max(...assetAllocation.map((item) => (item.value / totalValue) * 100)).toFixed(0)}%`,
                color: isDemoMode ? "indigo" : hasRealData ? "green" : "gray",
                icon: "📊",
              },
              {
                label: "Diversification",
                value: (() => {
                  const maxPercentage = Math.max(...assetAllocation.map((item) => (item.value / totalValue) * 100))
                  if (maxPercentage < 50) return "High"
                  if (maxPercentage < 70) return "Good"
                  return "Moderate"
                })(),
                color: isDemoMode ? "purple" : hasRealData ? "teal" : "gray",
                icon: "⚖️",
              },
            ].map((stat, index) => (
              <div
                key={stat.label}
                className={`group/stat text-center p-4 rounded-xl transition-all duration-300 hover:scale-105 cursor-pointer border ${
                  isDemoMode
                    ? `bg-gradient-to-br from-${stat.color}-50/50 to-${stat.color}-100/30 dark:from-${stat.color}-950/30 dark:to-${stat.color}-900/20 border-${stat.color}-200/40 dark:border-${stat.color}-800/40 hover:border-${stat.color}-300/60 dark:hover:border-${stat.color}-600/50`
                    : hasRealData
                      ? `bg-gradient-to-br from-${stat.color}-50/50 to-${stat.color}-100/30 dark:from-${stat.color}-950/30 dark:to-${stat.color}-900/20 border-${stat.color}-200/40 dark:border-${stat.color}-800/40 hover:border-${stat.color}-300/60 dark:hover:border-${stat.color}-600/50`
                      : "bg-gradient-to-br from-gray-50/50 to-gray-100/30 dark:from-gray-950/30 dark:to-gray-900/20 border-gray-200/40 dark:border-gray-800/40 hover:border-gray-300/60 dark:hover:border-gray-600/50"
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-lg">{stat.icon}</span>
                    <div
                      className={`text-sm font-semibold uppercase tracking-wide ${
                        isDemoMode
                          ? `text-${stat.color}-600 dark:text-${stat.color}-400`
                          : hasRealData
                            ? `text-${stat.color}-600 dark:text-${stat.color}-400`
                            : "text-gray-600 dark:text-gray-400"
                      }`}
                    >
                      {stat.label}
                    </div>
                  </div>
                  <div
                    className={`text-2xl font-bold group-hover/stat:scale-110 transition-transform duration-300 ${
                      isDemoMode
                        ? `text-${stat.color}-800 dark:text-${stat.color}-300`
                        : hasRealData
                          ? `text-${stat.color}-800 dark:text-${stat.color}-300`
                          : "text-gray-800 dark:text-gray-300"
                    }`}
                  >
                    {stat.value}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
