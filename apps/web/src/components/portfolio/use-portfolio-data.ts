"use client"

import { useState, useEffect } from "react"
import { portfolioData, connectedAccounts, assetAllocation } from "./demo-data"
import { 
  getBalanceSummary, 
  calculateTodaysChange, 
  getTopHoldings,
  getInstitutionLogo
} from "./portfolio-utils"
import { 
  getConnectedAccounts, 
  type ConnectedAccount 
} from "@web/lib/account-storage"

export const usePortfolioData = (
  isDemoMode: boolean,
  hasConnectedAccounts: boolean,
  plaidData: any
) => {
  const [connectedPlaidAccounts, setConnectedPlaidAccounts] = useState<ConnectedAccount[]>([])
  const [selectedTimeframe, setSelectedTimeframe] = useState("1Y")

  // Load connected accounts from localStorage
  useEffect(() => {
    const stored = getConnectedAccounts()
    setConnectedPlaidAccounts(stored)
  }, [hasConnectedAccounts])

  // Transform Plaid data into our dashboard format
  const getAccountsData = () => {
    if (!isDemoMode && connectedPlaidAccounts.length > 0) {
      // Use multiple connected accounts from localStorage
      const allAccounts: any[] = []
      
      connectedPlaidAccounts.forEach((plaidAccount) => {
        plaidAccount.accountsData.accounts?.forEach((account: any) => {
          const balance = account.balances?.current || account.balances?.available || 0
          allAccounts.push({
            id: `${plaidAccount.institutionName}-${account.account_id}`,
            name: `${plaidAccount.institutionName} - ${account.name}`,
            type: account.subtype || account.type || 'Investment',
            balance: balance,
            percentage: 0, // Will be calculated later
            logo: getInstitutionLogo(plaidAccount.institutionName),
            lastSync: new Date(plaidAccount.connectedAt).toLocaleString(),
            institutionName: plaidAccount.institutionName,
            connectedAt: plaidAccount.connectedAt,
            accountId: plaidAccount.id
          })
        })
      })
      
      return allAccounts
    } else if (plaidData && hasConnectedAccounts && !isDemoMode) {
      // Use single Plaid data (legacy support)
      const institutionName = plaidData.item?.institution_name || plaidData.institution?.name || 'Connected Bank'
      
      return plaidData.accounts?.map((account: any, index: number) => {
        const balance = account.balances?.current || account.balances?.available || 0
        return {
          id: account.account_id,
          name: `${institutionName} - ${account.name}`,
          type: account.subtype || account.type || 'Investment',
          balance: balance,
          percentage: 0, // We'll calculate this after we have all balances
          logo: getInstitutionLogo(institutionName, plaidData.item?.institution_id),
          lastSync: "Just now",
          holdings: account.holdings || [], // Will be populated if we have investment holdings
        }
      }) || []
    } else {
      // Use demo data
      return connectedAccounts
    }
  }

  // Get portfolio chart data - use current balance for real data
  const getPortfolioData = (totalBalance: number) => {
    let baseData = portfolioData
    
    if (plaidData && hasConnectedAccounts && !isDemoMode && totalBalance > 0) {
      // For real data, append current value to the end of the demo data
      const currentValue = totalBalance
      baseData = [
        ...portfolioData,
        { 
          date: new Date().toISOString().slice(0, 7), 
          value: currentValue, 
          month: new Date().toLocaleDateString('en-US', { month: 'short' })
        }
      ]
    }

    // Generate appropriate short-term data for 1D and 1W
    const generateShortTermData = (timeframe: string) => {
      const currentValue = baseData[baseData.length - 1]?.value || totalBalance || 50000
      const baseVariation = currentValue * 0.02 // 2% variation range
      
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
            month: hour.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
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
            month: day.toLocaleDateString('en-US', { weekday: 'short' })
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
          // Show last 2 data points for 1 month view
          return baseData.slice(-2)
        case "3M":
          // Show last 4 data points for 3 months
          return baseData.slice(-4)
        case "6M":
          // Show last 7 data points for 6 months
          return baseData.slice(-7)
        case "1Y":
          // Show last 13 data points for 1 year
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
    const isIncludedInPortfolio = account.type ? account.type.toLowerCase().includes('investment') || 
                                                 account.type.toLowerCase().includes('saving') ||
                                                 account.type.toLowerCase().includes('checking') ||
                                                 account.type.toLowerCase().includes('401k') ||
                                                 account.type.toLowerCase().includes('retirement') ||
                                                 account.type.toLowerCase().includes('hsa') ||
                                                 account.type.toLowerCase().includes('cash management') ||
                                                 account.type.toLowerCase().includes('money market') ||
                                                 account.type.toLowerCase().includes('cd') ||
                                                 account.type.toLowerCase().includes('certificate') : true
    
    const percentage = isIncludedInPortfolio && totalAssetsOnly > 0 ? 
      ((account.balance / totalAssetsOnly) * 100) : 0  // Use assets only for percentages
    
    return {
      ...account,
      percentage,
      isIncludedInPortfolio,
      isLiability: !isIncludedInPortfolio && (
        account.type.toLowerCase().includes('credit') ||
        account.type.toLowerCase().includes('loan') ||
        account.type.toLowerCase().includes('mortgage')
      )
    }
  })

  const chartData = getPortfolioData(totalBalance)
  const totalGain = totalBalance - chartData[0].value
  const totalGainPercentage = chartData[0].value > 0 ? (totalGain / chartData[0].value) * 100 : 0
  const todaysChange = calculateTodaysChange(chartData)
  const topHoldings = getTopHoldings(isDemoMode, plaidData, connectedPlaidAccounts, accountsWithPercentages)

  return {
    accountsWithPercentages,
    balanceSummary,
    totalBalance,
    chartData,
    totalGain,
    totalGainPercentage,
    todaysChange,
    topHoldings,
    assetAllocation,
    selectedTimeframe,
    setSelectedTimeframe,
    connectedPlaidAccounts,
    setConnectedPlaidAccounts
  }
}
