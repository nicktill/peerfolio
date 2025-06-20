"use client"

import { useState, useEffect } from "react"
import { portfolioData, connectedAccounts, assetAllocation } from "./demo-data"
import { getBalanceSummary, calculateTodaysChange, getTopHoldings, getInstitutionLogo } from "./portfolio-utils"
import { getConnectedAccounts, type ConnectedAccount } from "@web/lib/account-storage"

export const usePortfolioData = (isDemoMode: boolean, hasConnectedAccounts: boolean, plaidData: any) => {
  const [connectedPlaidAccounts, setConnectedPlaidAccounts] = useState<ConnectedAccount[]>([])
  const [selectedTimeframe, setSelectedTimeframe] = useState("1Y")
  const [chartKey, setChartKey] = useState(0)

  // Load connected accounts from localStorage
  useEffect(() => {
    const stored = getConnectedAccounts()
    setConnectedPlaidAccounts(stored)
  }, [hasConnectedAccounts])

  // Force chart re-animation when switching modes or timeframes
  useEffect(() => {
    setChartKey((prev) => prev + 1)
  }, [isDemoMode, hasConnectedAccounts, selectedTimeframe])

  // Generate realistic portfolio history based on actual account balances
  const generateSandboxPortfolioHistory = (currentValue: number, accounts: any[], useAssetsOnly = false) => {
    const months = 24
    const data = []

    // Calculate realistic starting point based on account types
    const investmentBalance = accounts
      .filter((acc) => acc.category === "investments")
      .reduce((sum, acc) => sum + Math.abs(acc.balance), 0)

    const assetsBalance = accounts
      .filter((acc) => acc.category === "assets")
      .reduce((sum, acc) => sum + Math.abs(acc.balance), 0)

    // For assets-only view, show realistic growth pattern
    const startingValue = useAssetsOnly
      ? currentValue * 0.7 // Assume 30% growth over 2 years for assets
      : currentValue - investmentBalance * 0.3 // Net worth calculation

    for (let i = 0; i < months; i++) {
      const date = new Date()
      date.setMonth(date.getMonth() - (months - i - 1))

      // Progressive growth with realistic volatility
      const progress = i / (months - 1)
      const baseValue = startingValue + (currentValue - startingValue) * progress

      // Add market-like volatility (more for investments, less for cash)
      const investmentRatio = investmentBalance / currentValue
      const volatilityFactor = useAssetsOnly ? investmentRatio * 0.1 : 0.05
      const volatility = (Math.random() - 0.5) * currentValue * volatilityFactor

      const monthValue = Math.max(baseValue + volatility, startingValue * 0.6)

      data.push({
        date: date.toISOString().slice(0, 7),
        value: Math.round(monthValue),
        month: date.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      })
    }

    // Ensure last value matches current value
    data[data.length - 1].value = currentValue
    return data
  }

  // Transform Plaid data into our dashboard format with better categorization
  const getAccountsData = () => {
    if (!isDemoMode && connectedPlaidAccounts.length > 0) {
      const allAccounts: any[] = []

      connectedPlaidAccounts.forEach((plaidAccount) => {
        plaidAccount.accountsData.accounts?.forEach((account: any) => {
          const balance = account.balances?.current || account.balances?.available || 0
          const accountType = account.subtype || account.type || "other"

          allAccounts.push({
            id: `${plaidAccount.institutionName}-${account.account_id}-${plaidAccount.id}-${Date.now()}`,
            name: `${plaidAccount.institutionName} - ${account.name}`,
            type: accountType,
            subtype: account.subtype,
            balance: balance,
            percentage: 0,
            logo: getInstitutionLogo(plaidAccount.institutionName),
            lastSync: new Date(plaidAccount.connectedAt).toLocaleString(),
            institutionName: plaidAccount.institutionName,
            connectedAt: plaidAccount.connectedAt,
            accountId: plaidAccount.id,
            plaidAccountId: account.account_id,
            mask: account.mask,
            officialName: account.official_name,
            category: getAccountCategory(accountType),
          })
        })
      })

      return allAccounts
    } else if (plaidData && hasConnectedAccounts && !isDemoMode) {
      const institutionName = plaidData.item?.institution_name || plaidData.institution?.name || "Connected Bank"

      return (
        plaidData.accounts?.map((account: any, index: number) => {
          const balance = account.balances?.current || account.balances?.available || 0
          const accountType = account.subtype || account.type || "other"

          return {
            id: `${account.account_id}-${institutionName}-${index}`,
            name: `${institutionName} - ${account.name}`,
            type: accountType,
            subtype: account.subtype,
            balance: balance,
            percentage: 0,
            logo: getInstitutionLogo(institutionName, plaidData.item?.institution_id),
            lastSync: "Just now",
            holdings: account.holdings || [],
            mask: account.mask,
            officialName: account.official_name,
            plaidAccountId: account.account_id,
            category: getAccountCategory(accountType),
          }
        }) || []
      )
    } else {
      return connectedAccounts.map((account) => ({
        ...account,
        category: getAccountCategory(account.type),
      }))
    }
  }

  // Categorize accounts for better organization
  const getAccountCategory = (accountType: string) => {
    const type = accountType.toLowerCase()

    if (
      type.includes("credit") ||
      type.includes("loan") ||
      type.includes("mortgage") ||
      type.includes("student") ||
      type.includes("auto") ||
      type.includes("personal")
    ) {
      return "liabilities"
    }

    if (
      type.includes("investment") ||
      type.includes("brokerage") ||
      type.includes("401k") ||
      type.includes("retirement") ||
      type.includes("ira")
    ) {
      return "investments"
    }

    if (
      type.includes("saving") ||
      type.includes("checking") ||
      type.includes("cash") ||
      type.includes("money market")
    ) {
      return "assets"
    }

    if (type.includes("hsa") || type.includes("cd") || type.includes("certificate")) {
      return "other"
    }

    return "other"
  }

  // Get asset allocation based on real data or demo
  const getAssetAllocationData = () => {
    if (!isDemoMode && (connectedPlaidAccounts.length > 0 || (plaidData && hasConnectedAccounts))) {
      const accounts = getAccountsData()
      const totalAssets = accounts
        .filter((acc: any) => acc.category !== "liabilities")
        .reduce((sum: number, acc: any) => sum + Math.abs(acc.balance), 0)

      if (totalAssets === 0) return assetAllocation

      const categoryGroups: { [key: string]: { value: number; accounts: any[] } } = {}

      accounts.forEach((account: any) => {
        if (account.category === "liabilities") return

        const category = account.category
        if (!categoryGroups[category]) {
          categoryGroups[category] = { value: 0, accounts: [] }
        }
        categoryGroups[category].value += Math.abs(account.balance)
        categoryGroups[category].accounts.push(account)
      })

      const colors = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#06b6d4", "#f97316"]
      const categoryNames = {
        investments: "Investment Accounts",
        assets: "Cash & Savings",
        other: "Other Assets",
      }

      let colorIndex = 0

      return Object.entries(categoryGroups)
        .map(([category, data]) => {
          const percentage = (data.value / totalAssets) * 100
          const displayName =
            categoryNames[category as keyof typeof categoryNames] ||
            category.charAt(0).toUpperCase() + category.slice(1)

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

    return assetAllocation
  }

  // Get portfolio chart data
  const getPortfolioData = (netWorth: number, totalAssets: number, accounts: any[]) => {
    const isRealData = !isDemoMode && (connectedPlaidAccounts.length > 0 || (plaidData && hasConnectedAccounts))

    // Use assets for chart if net worth is negative
    const useAssetsOnly = netWorth < 0
    const chartValue = useAssetsOnly ? totalAssets : netWorth

    // Use different data generation for sandbox vs demo
    const baseData = isRealData ? generateSandboxPortfolioHistory(chartValue, accounts, useAssetsOnly) : portfolioData

    const generateShortTermData = (timeframe: string) => {
      const currentValue = chartValue || baseData[baseData.length - 1]?.value || 50000
      const baseVariation = currentValue * (isRealData ? 0.008 : 0.02)

      if (timeframe === "1D") {
        const hourlyData = []
        for (let i = 23; i >= 0; i--) {
          const hour = new Date()
          hour.setHours(hour.getHours() - i)
          const variation = (Math.random() - 0.5) * baseVariation
          hourlyData.push({
            date: hour.toISOString(),
            value: Math.round(Math.max(currentValue + variation, currentValue * 0.95)),
            month: hour.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
          })
        }
        return hourlyData
      }

      if (timeframe === "1W") {
        const dailyData = []
        for (let i = 6; i >= 0; i--) {
          const day = new Date()
          day.setDate(day.getDate() - i)
          const variation = (Math.random() - 0.5) * baseVariation * 2
          dailyData.push({
            date: day.toISOString().slice(0, 10),
            value: Math.round(Math.max(currentValue + variation, currentValue * 0.9)),
            month: day.toLocaleDateString("en-US", { weekday: "short" }),
          })
        }
        return dailyData
      }

      return baseData
    }

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

    return {
      data: filterData(selectedTimeframe),
      useAssetsOnly,
      chartValue,
    }
  }

  const accountsData = getAccountsData()
  const balanceSummary = getBalanceSummary(accountsData)
  const totalBalance = balanceSummary.netWorth
  const totalAssetsOnly = balanceSummary.totalAssets

  const accountsWithPercentages = accountsData.map((account: any) => {
    const isLiability = account.category === "liabilities"
    const isIncludedInPortfolio = !isLiability
    const percentage =
      isIncludedInPortfolio && totalAssetsOnly > 0 ? (Math.abs(account.balance) / totalAssetsOnly) * 100 : 0

    return {
      ...account,
      percentage,
      isIncludedInPortfolio,
      isLiability: isLiability,
      isAsset: !isLiability,
    }
  })

  const portfolioChartData = getPortfolioData(totalBalance, totalAssetsOnly, accountsData)
  const chartData = portfolioChartData.data
  const useAssetsOnlyForChart = portfolioChartData.useAssetsOnly
  const chartDisplayValue = portfolioChartData.chartValue

  const totalGain = chartDisplayValue - chartData[0].value
  const totalGainPercentage = chartData[0].value > 0 ? (totalGain / chartData[0].value) * 100 : 0
  const todaysChange = calculateTodaysChange(chartData)
  const topHoldings = getTopHoldings(isDemoMode, plaidData, connectedPlaidAccounts, accountsWithPercentages)
  const assetAllocationData = getAssetAllocationData()

  return {
    accountsWithPercentages,
    balanceSummary,
    totalBalance,
    chartData,
    chartKey,
    totalGain,
    totalGainPercentage,
    todaysChange,
    topHoldings,
    assetAllocation: assetAllocationData,
    selectedTimeframe,
    setSelectedTimeframe,
    connectedPlaidAccounts,
    setConnectedPlaidAccounts,
    useAssetsOnlyForChart,
    chartDisplayValue,
  }
}
