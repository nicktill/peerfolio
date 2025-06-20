"use client"

import React, { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@web/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@web/components/ui/chart"
import { Button } from "@web/components/ui/button"
import { TrendingUp, TrendingDown, Activity } from "lucide-react"
import {
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts"

const chartConfig = {
  value: {
    label: "Portfolio Value",
    color: "hsl(142, 76%, 36%)", // emerald-600 equivalent
  },
}

interface PortfolioChartProps {
  chartData: any[]
  selectedTimeframe: string
  setSelectedTimeframe: (timeframe: string) => void
  formatCurrency: (value: number) => string
  isDemoMode?: boolean
  hasRealData?: boolean
}

export function PortfolioChart({
  chartData,
  selectedTimeframe,
  setSelectedTimeframe,
  formatCurrency,
  isDemoMode = false,
  hasRealData = false
}: PortfolioChartProps) {
  const timeframes = ["1D", "1W", "1M", "3M", "6M", "1Y", "ALL"]
  const [animationKey, setAnimationKey] = useState(0)

  // Calculate trend and performance
  const calculateTrend = () => {
    if (!chartData || chartData.length < 2) return { trend: 'neutral', change: 0, changePercent: 0 }
    
    const firstValue = chartData[0].value
    const lastValue = chartData[chartData.length - 1].value
    const change = lastValue - firstValue
    const changePercent = (change / firstValue) * 100
    
    return {
      trend: change > 0 ? 'up' : change < 0 ? 'down' : 'neutral',
      change,
      changePercent
    }
  }

  const { trend, change, changePercent } = calculateTrend()

  // Trigger re-animation when switching between demo and real data
  useEffect(() => {
    setAnimationKey(prev => prev + 1)
  }, [isDemoMode, hasRealData])

  // Different chart configurations based on data type
  const getChartStyle = () => {
    if (isDemoMode) {
      return {
        strokeWidth: 3,
        showDots: true,
        dotRadius: 4,
        strokeDasharray: "none",
        animationDuration: 2000,
        gradientOpacityTop: 0.9,
        gridOpacity: 'opacity-40'
      }
    } else if (hasRealData) {
      // Use same enhanced design as demo mode but with green colors
      return {
        strokeWidth: 3,
        showDots: true,
        dotRadius: 4,
        strokeDasharray: "none",
        animationDuration: 2000,
        gradientOpacityTop: 0.9,
        gridOpacity: 'opacity-40'
      }
    } else {
      return {
        strokeWidth: 2,
        showDots: false,
        dotRadius: 0,
        strokeDasharray: "5 5",
        animationDuration: 1000,
        gradientOpacityTop: 0.8,
        gridOpacity: 'opacity-30'
      }
    }
  }

  const chartStyle = getChartStyle()

  return (
    <Card className="lg:col-span-2 relative overflow-hidden">
      {/* Animated background for mode changes */}
      <div className={`absolute inset-0 transition-all duration-1000 ${
        isDemoMode 
          ? 'bg-gradient-to-br from-blue-50/30 via-indigo-50/20 to-purple-50/30 dark:from-blue-950/20 dark:via-indigo-950/10 dark:to-purple-950/20'
          : hasRealData 
          ? 'bg-gradient-to-br from-emerald-50/30 via-green-50/20 to-teal-50/30 dark:from-emerald-950/20 dark:via-green-950/10 dark:to-teal-950/20'
          : 'bg-gradient-to-br from-gray-50/30 via-slate-50/20 to-gray-50/30 dark:from-gray-950/20 dark:via-slate-950/10 dark:to-gray-950/20'
      }`} />
      
      <CardHeader className="relative z-10">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-gray-900 dark:text-foreground flex items-center gap-2">
              Portfolio Performance
              {isDemoMode && (
                <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded-full font-medium">
                  Demo Data
                </span>
              )}
              {hasRealData && !isDemoMode && (
                <span className="text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-2 py-1 rounded-full font-medium">
                  Live Data
                </span>
              )}
              {/* Trend Indicator */}
              {chartData && chartData.length > 1 && (
                <div className="flex items-center gap-1 ml-2">
                  {trend === 'up' ? (
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                  ) : trend === 'down' ? (
                    <TrendingDown className="h-4 w-4 text-red-500" />
                  ) : (
                    <Activity className="h-4 w-4 text-gray-500" />
                  )}
                  <span className={`text-sm font-medium ${
                    trend === 'up' ? 'text-emerald-600 dark:text-emerald-400' : 
                    trend === 'down' ? 'text-red-600 dark:text-red-400' : 
                    'text-gray-600 dark:text-gray-400'
                  }`}>
                    {trend === 'up' ? '+' : ''}{change > 0 ? formatCurrency(Math.abs(change)) : change < 0 ? `-${formatCurrency(Math.abs(change))}` : formatCurrency(0)} 
                    ({changePercent >= 0 ? '+' : ''}{changePercent.toFixed(1)}%)
                  </span>
                </div>
              )}
            </CardTitle>
            <CardDescription className="text-gray-600 dark:text-gray-400">
              {isDemoMode 
                ? "Sample portfolio data showing platform capabilities"
                : hasRealData 
                ? "Real-time data from your connected accounts"
                : "Track your investment growth over time"}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {timeframes.map((timeframe) => (
              <Button
                key={timeframe}
                variant={selectedTimeframe === timeframe ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedTimeframe(timeframe)}
                className="h-8 px-3 text-xs transition-all duration-200"
              >
                {timeframe}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="relative z-10">
        <ChartContainer config={chartConfig} className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart 
              data={chartData} 
              key={animationKey} // Force re-render with animation
            >
              <defs>
                {/* Enhanced gradient for demo mode */}
                <linearGradient id="fillValue" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor={isDemoMode ? "#3b82f6" : "#10b981"} // Blue for demo, green for real
                    stopOpacity={chartStyle.gradientOpacityTop}
                  />
                  <stop
                    offset="95%"
                    stopColor={isDemoMode ? "#3b82f6" : "#10b981"}
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
              
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                className="text-xs"
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                className="text-xs"
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
              />
              
              <ChartTooltip
                cursor={{ 
                  stroke: isDemoMode ? "#3b82f6" : hasRealData ? "#10b981" : "#6b7280", 
                  strokeWidth: 1,
                  strokeOpacity: 0.3
                }}
                content={<ChartTooltipContent 
                  formatter={(value) => [formatCurrency(value as number), "Portfolio Value"]}
                  className="bg-white/95 dark:bg-gray-800/95 backdrop-blur-lg border border-gray-200/60 dark:border-gray-700/60 shadow-xl rounded-xl"
                />}
              />
              
              <Area
                type="monotone"
                dataKey="value"
                stroke={isDemoMode ? "#3b82f6" : hasRealData ? "#10b981" : "#6b7280"}
                strokeWidth={chartStyle.strokeWidth}
                strokeDasharray={chartStyle.strokeDasharray}
                fillOpacity={1}
                fill="url(#fillValue)"
                dot={chartStyle.showDots ? {
                  fill: isDemoMode ? "#3b82f6" : hasRealData ? "#10b981" : "#6b7280",
                  stroke: "#ffffff",
                  strokeWidth: 2,
                  r: chartStyle.dotRadius,
                  filter: "url(#dotShadow)",
                } : false}
                activeDot={chartStyle.showDots ? {
                  r: chartStyle.dotRadius + 2,
                  stroke: isDemoMode ? "#3b82f6" : hasRealData ? "#10b981" : "#6b7280",
                  strokeWidth: 3,
                  fill: "#ffffff",
                  filter: "url(#dotShadow)",
                  className: "transition-all duration-200 hover:scale-110"
                } : false}
                animationDuration={chartStyle.animationDuration}
                animationEasing="ease-out"
                connectNulls={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartContainer>
        
        {/* Data source indicator */}
        <div className="mt-4 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${
              isDemoMode 
                ? 'bg-blue-500' 
                : hasRealData 
                ? 'bg-emerald-500 animate-pulse' 
                : 'bg-gray-400'
            }`} />
            <span>
              {isDemoMode 
                ? 'Sample data for demonstration' 
                : hasRealData 
                ? 'Real-time portfolio data' 
                : 'Connect accounts to see live data'}
            </span>
          </div>
          <div className="text-right">
            <span className="font-medium">
              {chartData.length} data points
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
