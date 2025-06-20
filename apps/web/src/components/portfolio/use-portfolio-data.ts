"use client"

import { useState, useEffect } from "react"
import { portfolioData, connectedAccounts, assetAllocation } from "./demo-data"
import { getBalanceSummary, calculateTodaysChange, getTopHoldings, getInstitutionLogo } from "./portfolio-utils"
import { getConnectedAccounts, type ConnectedAccount } from "@web/lib/account-storage"

export const usePortfolioData = (isDemoMode: boolean, hasConnectedAccounts: boolean, plaidData: any) => {
  const [connectedPlaidAccounts, setConnectedPlaidAccounts] = useState<ConnectedAccount[]>([])
  const [selectedTimeframe, setSelectedTimeframe] = useState("1Y")

  // Load connected accounts from localStorage
  useEffect(() => {
    const stored = getConnectedAccounts()
    setConnectedPlaidAccounts(stored)
  }, [hasConnectedAccounts])

  // Generate realistic portfolio history based on current balance
  const generatePortfolioHistory = (currentBalance: number, isRealData = false) => {
    if (isRealData && currentBalance > 0) {
      // For real data, create a more realistic growth pattern
      const months = 24 // 2 years of data
      const data = []
      const startValue = currentBalance * 0.7 // Assume 30% growth over 2 years
      const volatility = 0.15 // 15% volatility

      for (let i = 0; i < months; i++) {
        const date = new Date()
        date.setMonth(date.getMonth() - (months - i - 1))

        // Create a general upward trend with realistic volatility
        const trendGrowth = (i / months) * (currentBalance - startValue)
        const randomVariation = (Math.random() - 0.5) * currentBalance * volatility
        const monthlyValue = Math.max(startValue + trendGrowth + randomVariation, startValue * 0.5)

        data.push({
          date: date.toISOString().slice(0, 7),
          value: Math.round(monthlyValue),
          month: date.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
        })
      }

      // Ensure the last value matches current balance
      data[data.length - 1].value = currentBalance
      return data
    }

    // Use demo data for demo mode
    return portfolioData
  }

  // Transform Plaid data into our dashboard format
  const getAccountsData = () => {
    if (!isDemoMode && connectedPlaidAccounts.length > 0) {
      // Use multiple connected accounts from localStorage
      const allAccounts: any[] = []

      connectedPlaidAccounts.forEach((plaidAccount) => {
        plaidAccount.accountsData.accounts?.forEach((account: any) => {
          const balance = account.balances?.current || account.balances?.available || 0
          allAccounts.push({
            id: `${plaidAccount.institutionName}-${account.account_id}-${plaidAccount.id}-${Date.now()}`,
            name: `${plaidAccount.institutionName} - ${account.name}`,
            type: account.subtype || account.type || "Investment",
            subtype: account.subtype,
            balance: balance,
            percentage: 0, // Will be calculated later
            logo: getInstitutionLogo(plaidAccount.institutionName),
            lastSync: new Date(plaidAccount.connectedAt).toLocaleString(),
            institutionName: plaidAccount.institutionName,
            connectedAt: plaidAccount.connectedAt,
            accountId: plaidAccount.id,
            plaidAccountId: account.account_id,
            mask: account.mask,
            officialName: account.official_name,
          })
        })
      })

      return allAccounts
    } else if (plaidData && hasConnectedAccounts && !isDemoMode) {
      // Use single Plaid data (legacy support)
      const institutionName = plaidData.item?.institution_name || plaidData.institution?.name || "Connected Bank"

      return (
        plaidData.accounts?.map((account: any, index: number) => {
          const balance = account.balances?.current || account.balances?.available || 0
          return {
            id: `${account.account_id}-${institutionName}-${index}`,
            name: `${institutionName} - ${account.name}`,
            type: account.subtype || account.type || "Investment",
            subtype: account.subtype,
            balance: balance,
            percentage: 0, // We'll calculate this after we have all balances
            logo: getInstitutionLogo(institutionName, plaidData.item?.institution_id),
            lastSync: "Just now",
            holdings: account.holdings || [], // Will be populated if we have investment holdings
            mask: account.mask,
            officialName: account.official_name,
            plaidAccountId: account.account_id,
          }
        }) || []
      )
    } else {
      // Use demo data
      return connectedAccounts
    }
  }

  // Get asset allocation based on real data or demo
  const getAssetAllocationData = () => {
    if (!isDemoMode && (connectedPlaidAccounts.length > 0 || (plaidData && hasConnectedAccounts))) {
      // For real Plaid data, create allocation based on actual account types
      const accounts = getAccountsData()
      const totalBalance = accounts.reduce((sum, acc) => sum + Math.abs(acc.balance), 0)

      if (totalBalance === 0) return assetAllocation // Fallback to demo data

      // Group accounts by type
      const typeGroups: { [key: string]: { value: number; accounts: any[] } } = {}

      accounts.forEach((account) => {
        const type = account.subtype || account.type || "Other"
        const key = type.toLowerCase()

        if (!typeGroups[key]) {
          typeGroups[key] = { value: 0, accounts: [] }
        }
        typeGroups[key].value += Math.abs(account.balance)
        typeGroups[key].accounts.push(account)
      })

      // Convert to asset allocation format
      const colors = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316"]
      let colorIndex = 0

      return Object.entries(typeGroups)
        .map(([type, data]) => {
          const percentage = (data.value / totalBalance) * 100
          const displayName = type.charAt(0).toUpperCase() + type.slice(1).replace("_", " ")

          return {
            name: displayName,
            value: data.value,
            percentage: percentage,
            color: colors[colorIndex++ % colors.length],
            accounts: data.accounts,
          }
        })
        .sort((a, b) => b.value - a.value)
    }

    // Use demo data for demo mode
    return assetAllocation
  }

  // Get portfolio chart data - use current balance for real data
  const getPortfolioData = (totalBalance: number) => {
    const isRealData = !isDemoMode && (connectedPlaidAccounts.length > 0 || (plaidData && hasConnectedAccounts))
    const baseData = generatePortfolioHistory(totalBalance, isRealData)

    // Generate appropriate short-term data for 1D and 1W
    const generateShortTermData = (timeframe: string) => {
      const currentValue = totalBalance || baseData[baseData.length - 1]?.value || 50000
      const baseVariation = currentValue * (isRealData ? 0.015 : 0.02) // Less volatility for real data

      if (timeframe === "1D") {
        // Generate hourly data points for 1 day (24 hours)
        const hourlyData = []
        for (let i = 23; i >= 0; i--) {
          const hour = new Date()
          hour.setHours(hour.getHours() - i)
          const variation = (Math.random() - 0.5) * baseVariation
          hourlyData.push({
            date: hour.toISOString(),
            value: Math.round(currentValue + variation),
            month: hour.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
          })
        }
        return hourlyData
      }

      if (timeframe === "1W") {
        // Generate daily data points for 1 week (7 days)
        const dailyData = []
        for (let i = 6; i >= 0; i--) {
          const day = new Date()
          day.setDate(day.getDate() - i)
          const variation = (Math.random() - 0.5) * baseVariation * 2
          dailyData.push({
            date: day.toISOString().slice(0, 10),
            value: Math.round(currentValue + variation),
            month: day.toLocaleDateString("en-US", { weekday: "short" }),
          })
        }
        return dailyData
      }

      return baseData
    }

    // Filter data based on selected timeframe
    const filterData = (timeframe: string) => {
      switch (timeframe) {
        case "1D":
          return generateShortTermData("1D")
        case "1W":
          return generateShortTermData("1W")
        case "1M":
          return baseData.slice(-2)
        case "3M":
          return baseData.slice(-4)
        case "6M":
          return baseData.slice(-7)
        case "1Y":
          return baseData.slice(-13)
        case "ALL":
        default:
          return baseData
      }
    }

    return filterData(selectedTimeframe)
  }

  const accountsData = getAccountsData()
  const balanceSummary = getBalanceSummary(accountsData)
  const totalBalance = balanceSummary.portfolioValue // Use net portfolio value for display
  const totalAssetsOnly = balanceSummary.portfolioAssetsValue // Use assets only for percentage calculations

  // Update percentages and add portfolio inclusion flag
  const accountsWithPercentages = accountsData.map((account: any) => {
    const isIncludedInPortfolio = account.type
      ? account.type.toLowerCase().includes("investment") ||
        account.type.toLowerCase().includes("saving") ||
        account.type.toLowerCase().includes("checking") ||
        account.type.toLowerCase().includes("401k") ||
        account.type.toLowerCase().includes("retirement") ||
        account.type.toLowerCase().includes("hsa") ||
        account.type.toLowerCase().includes("cash management") ||
        account.type.toLowerCase().includes("money market") ||
        account.type.toLowerCase().includes("cd") ||
        account.type.toLowerCase().includes("certificate")
      : true

    const percentage = isIncludedInPortfolio && totalAssetsOnly > 0 ? (account.balance / totalAssetsOnly) * 100 : 0 // Use assets only for percentages

    return {
      ...account,
      percentage,
      isIncludedInPortfolio,
      isLiability:
        !isIncludedInPortfolio &&
        (account.type.toLowerCase().includes("credit") ||
          account.type.toLowerCase().includes("loan") ||
          account.type.toLowerCase().includes("mortgage")),
    }
  })

  const chartData = getPortfolioData(totalBalance)
  const totalGain = totalBalance - chartData[0].value
  const totalGainPercentage = chartData[0].value > 0 ? (totalGain / chartData[0].value) * 100 : 0
  const todaysChange = calculateTodaysChange(chartData)
  const topHoldings = getTopHoldings(isDemoMode, plaidData, connectedPlaidAccounts, accountsWithPercentages)
  const assetAllocationData = getAssetAllocationData()

  return {
    accountsWithPercentages,
    balanceSummary,
    totalBalance,
    chartData,
    totalGain,
    totalGainPercentage,
    todaysChange,
    topHoldings,
    assetAllocation: assetAllocationData,
    selectedTimeframe,
    setSelectedTimeframe,
    connectedPlaidAccounts,
    setConnectedPlaidAccounts,
  }
}
