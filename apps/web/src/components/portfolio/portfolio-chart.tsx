"use client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@web/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@web/components/ui/chart"
import { Button } from "@web/components/ui/button"
import { TrendingUp, TrendingDown, Activity, Info } from "lucide-react"
import { XAxis, YAxis, CartesianGrid, ResponsiveContainer, AreaChart, Area } from "recharts"
import { useState, useEffect } from "react"

const chartConfig = {
  value: {
    label: "Portfolio Value",
    color: "hsl(142, 76%, 36%)", // emerald-600 equivalent
  },
}

interface PortfolioChartProps {
  chartData: any[]
  chartKey: number
  selectedTimeframe: string
  setSelectedTimeframe: (timeframe: string) => void
  formatCurrency: (value: number) => string
  isDemoMode?: boolean
  hasRealData?: boolean
  useAssetsOnlyForChart?: boolean
  balanceVisible: boolean
}

export function PortfolioChart({
  chartData,
  chartKey,
  selectedTimeframe,
  setSelectedTimeframe,
  formatCurrency,
  isDemoMode = false,
  hasRealData = false,
  useAssetsOnlyForChart = false,
  balanceVisible,
}: PortfolioChartProps) {
  const timeframes = ["1D", "1W", "1M", "3M", "6M", "1Y", "ALL"]
  const [animationKey, setAnimationKey] = useState(0)

  // Calculate trend and performance
  const calculateTrend = () => {
    if (!chartData || chartData.length < 2) return { trend: "neutral", change: 0, changePercent: 0 }

    const firstValue = chartData[0].value
    const lastValue = chartData[chartData.length - 1].value
    const change = lastValue - firstValue
    const changePercent = (change / firstValue) * 100

    return {
      trend: change > 0 ? "up" : change < 0 ? "down" : "neutral",
      change,
      changePercent,
    }
  }

  const { trend, change, changePercent } = calculateTrend()

  // Calculate dynamic Y-axis domain based on data range
  const calculateYAxisDomain = () => {
    if (!chartData || chartData.length === 0) return ["auto", "auto"]

    const values = chartData.map((d) => d.value)
    const minValue = Math.min(...values)
    const maxValue = Math.max(...values)
    const range = maxValue - minValue

    // If range is very small (flat data), add padding to show variation
    if (range < maxValue * 0.01) {
      const padding = maxValue * 0.02 // 2% padding
      return [Math.max(0, minValue - padding), maxValue + padding]
    }

    // For normal ranges, add 5% padding on each side
    const padding = range * 0.05
    return [Math.max(0, minValue - padding), maxValue + padding]
  }

  const yAxisDomain = calculateYAxisDomain()

  // Get timeframe label for display
  const getTimeframeLabel = () => {
    const labels = {
      "1D": "1 day",
      "1W": "1 week",
      "1M": "1 month",
      "3M": "3 months",
      "6M": "6 months",
      "1Y": "1 year",
      ALL: "all time",
    }
    return labels[selectedTimeframe as keyof typeof labels] || "period"
  }

  // Enhanced chart styling based on data type
  const getChartStyle = () => {
    if (isDemoMode) {
      return {
        strokeWidth: 3,
        showDots: true,
        dotRadius: 4,
        strokeDasharray: "none",
        animationDuration: 1500,
        gradientOpacityTop: 0.8,
        gridOpacity: "opacity-30",
      }
    } else if (hasRealData) {
      return {
        strokeWidth: 3,
        showDots: true,
        dotRadius: 4,
        strokeDasharray: "none",
        animationDuration: 1500,
        gradientOpacityTop: 0.9,
        gridOpacity: "opacity-40",
      }
    } else {
      return {
        strokeWidth: 2,
        showDots: false,
        dotRadius: 0,
        strokeDasharray: "5 5",
        animationDuration: 1000,
        gradientOpacityTop: 0.6,
        gridOpacity: "opacity-20",
      }
    }
  }

  const chartStyle = getChartStyle()

  useEffect(() => {
    // Force animation on component mount
    const timer = setTimeout(() => {
      setAnimationKey((prev) => prev + 1)
    }, 100)

    return () => clearTimeout(timer)
  }, [])

  // Add this useEffect to handle animation triggers
  useEffect(() => {
    setAnimationKey((prev) => prev + 1)
  }, [selectedTimeframe, isDemoMode, hasRealData])

  return (
    <Card className="lg:col-span-2 relative overflow-hidden">
      {/* Animated background for mode changes */}
      <div
        className={`absolute inset-0 transition-all duration-1000 ${
          isDemoMode
            ? "bg-gradient-to-br from-blue-50/30 via-indigo-50/20 to-purple-50/30 dark:from-blue-950/20 dark:via-indigo-950/10 dark:to-purple-950/20"
            : hasRealData
              ? "bg-gradient-to-br from-emerald-50/30 via-green-50/20 to-teal-50/30 dark:from-emerald-950/20 dark:via-green-950/10 dark:to-teal-950/20"
              : "bg-gradient-to-br from-gray-50/30 via-slate-50/20 to-gray-50/30 dark:from-gray-950/20 dark:via-slate-950/10 dark:to-gray-950/20"
        }`}
      />

      <CardHeader className="relative z-10 pb-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-start justify-between gap-4">
          <div className="flex-1 min-w-0 w-full sm:w-auto">
            {/* Title Row */}
            <div className="flex items-center gap-3 mb-2">
              <CardTitle className="text-gray-900 dark:text-foreground text-xl font-semibold">
                {useAssetsOnlyForChart ? "Asset Performance" : "Portfolio Performance"}
              </CardTitle>

              {/* Data Source Badge */}
              {isDemoMode && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                  Demo Data
                </span>
              )}
              {hasRealData && !isDemoMode && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
                  Sandbox Data
                </span>
              )}
            </div>

            {/* Performance Indicator Row */}
            {chartData && chartData.length > 1 && (
              <div className="flex items-center gap-2 mb-2">
                {trend === "up" ? (
                  <TrendingUp className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                ) : trend === "down" ? (
                  <TrendingDown className="h-4 w-4 text-red-500 flex-shrink-0" />
                ) : (
                  <Activity className="h-4 w-4 text-gray-500 flex-shrink-0" />
                )}
                <span
                  className={`text-sm font-semibold ${
                    trend === "up"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : trend === "down"
                        ? "text-red-600 dark:text-red-400"
                        : "text-gray-600 dark:text-gray-400"
                  }`}
                >
                  {trend === "up" ? "+" : ""}
                  {change > 0
                    ? formatCurrency(Math.abs(change))
                    : change < 0
                      ? `-${formatCurrency(Math.abs(change))}`
                      : formatCurrency(0)}
                  <span className="ml-1">
                    ({changePercent >= 0 ? "+" : ""}
                    {changePercent.toFixed(1)}%) {getTimeframeLabel()}
                  </span>
                </span>
              </div>
            )}

            {/* Description and Notice Row */}
            <div className="space-y-1">
              <CardDescription className="text-gray-600 dark:text-gray-400 text-sm">
                {isDemoMode
                  ? "Sample portfolio data showing platform capabilities"
                  : hasRealData
                    ? useAssetsOnlyForChart
                      ? "Asset growth from your connected Plaid sandbox accounts"
                      : "Portfolio value based on your connected Plaid sandbox accounts"
                    : "Track your investment growth over time"}
              </CardDescription>

              {useAssetsOnlyForChart && (
                <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/30">
                  <Info className="h-3 w-3 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                  <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                    Liabilities excluded from chart
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Timeframe Buttons */}
          <div className="flex items-center gap-1 flex-wrap sm:flex-nowrap w-full sm:w-auto justify-start sm:justify-end">
            {timeframes.map((timeframe) => (
              <Button
                key={timeframe}
                variant={selectedTimeframe === timeframe ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedTimeframe(timeframe)}
                className="h-8 px-2 sm:px-3 text-xs transition-all duration-200 flex-1 sm:flex-none min-w-0"
              >
                {timeframe}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="relative z-10 pt-0 px-2 sm:px-6">
        <ChartContainer config={chartConfig} className="h-[300px] sm:h-[400px] w-full -mx-2 px-2 sm:mx-0 sm:px-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} key={animationKey}>
              <defs>
                {/* Enhanced gradient for different modes */}
                <linearGradient id="fillValue" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor={isDemoMode ? "#3b82f6" : hasRealData ? "#10b981" : "#6b7280"}
                    stopOpacity={chartStyle.gradientOpacityTop}
                  />
                  <stop
                    offset="95%"
                    stopColor={isDemoMode ? "#3b82f6" : hasRealData ? "#10b981" : "#6b7280"}
                    stopOpacity={0.1}
                  />
                </linearGradient>

                {/* Drop shadow filter for dots */}
                <filter id="dotShadow" x="-50%" y="-50%" width="200%" height="200%">
                  <feDropShadow
                    dx="0"
                    dy="2"
                    stdDeviation="3"
                    floodColor={isDemoMode ? "#3b82f6" : hasRealData ? "#10b981" : "#6b7280"}
                    floodOpacity="0.3"
                  />
                </filter>
              </defs>

              <CartesianGrid
                strokeDasharray="3 3"
                className={`transition-opacity duration-500 ${chartStyle.gridOpacity}`}
                stroke={isDemoMode ? "#3b82f6" : hasRealData ? "#10b981" : "#6b7280"}
                strokeOpacity={0.2}
              />

              <XAxis dataKey="month" tickLine={false} axisLine={false} className="text-xs" />
              <YAxis
                tickLine={false}
                axisLine={false}
                className="text-xs"
                domain={yAxisDomain}
                tickFormatter={
                  balanceVisible
                    ? (value) => {
                        if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`
                        if (value >= 1000) return `$${(value / 1000).toFixed(0)}k`
                        return `$${value.toFixed(0)}`
                      }
                    : () => ""
                }
                ticks={balanceVisible ? undefined : []}
              />

              {/* Update the ChartTooltip content to respect balance visibility */}
              <ChartTooltip
                cursor={{
                  stroke: isDemoMode ? "#3b82f6" : hasRealData ? "#10b981" : "#6b7280",
                  strokeWidth: 1,
                  strokeOpacity: 0.3,
                }}
                content={
                  <ChartTooltipContent
                    formatter={(value) =>
                      balanceVisible
                        ? [formatCurrency(value as number), useAssetsOnlyForChart ? "Asset Value" : "Portfolio Value"]
                        : [null, useAssetsOnlyForChart ? "Asset Value" : "Portfolio Value"]
                    }
                    className="bg-white/95 dark:bg-gray-800/95 backdrop-blur-lg border border-gray-200/60 dark:border-gray-700/60 shadow-xl rounded-xl"
                  />
                }
              />

              <Area
                type="monotone"
                dataKey="value"
                stroke={isDemoMode ? "#3b82f6" : hasRealData ? "#10b981" : "#6b7280"}
                strokeWidth={chartStyle.strokeWidth}
                strokeDasharray={chartStyle.strokeDasharray}
                fillOpacity={1}
                fill="url(#fillValue)"
                dot={
                  balanceVisible && chartStyle.showDots
                    ? {
                        fill: isDemoMode ? "#3b82f6" : hasRealData ? "#10b981" : "#6b7280",
                        stroke: "#ffffff",
                        strokeWidth: 2,
                        r: chartStyle.dotRadius,
                        filter: "url(#dotShadow)",
                      }
                    : false
                }
                activeDot={
                  balanceVisible && chartStyle.showDots
                    ? {
                        r: chartStyle.dotRadius + 2,
                        stroke: isDemoMode ? "#3b82f6" : hasRealData ? "#10b981" : "#6b7280",
                        strokeWidth: 3,
                        fill: "#ffffff",
                        filter: "url(#dotShadow)",
                        className: "transition-all duration-200 hover:scale-110",
                      }
                    : false
                }
                animationDuration={chartStyle.animationDuration}
                animationEasing="ease-out"
                connectNulls={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartContainer>

        {/* Data source indicator */}
        <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                isDemoMode ? "bg-blue-500" : hasRealData ? "bg-emerald-500 animate-pulse" : "bg-gray-400"
              }`}
            />
            <span>
              {isDemoMode
                ? "Sample data for demonstration"
                : hasRealData
                  ? useAssetsOnlyForChart
                    ? "Asset data from Plaid sandbox (liabilities excluded)"
                    : "Based on Plaid sandbox account data"
                  : "Connect accounts to see live data"}
            </span>
          </div>
          <div className="text-right">
            <span className="font-medium">
              {chartData.length} data points • {selectedTimeframe}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
