"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@web/components/ui/card"
import { Building2 } from "lucide-react"

interface ConnectedInstitutionsProps {
  connectedPlaidAccounts: any[]
  isDemoMode: boolean
  hasRealData: boolean
}

export function ConnectedInstitutions({ connectedPlaidAccounts, isDemoMode, hasRealData }: ConnectedInstitutionsProps) {
  // Demo institutions for showcase - restored to 3 as requested
  const demoInstitutions = [
    {
      name: "Fidelity",
      logo: "https://logo.clearbit.com/fidelity.com",
      displayName: "Fidelity",
    },
    {
      name: "Charles Schwab",
      logo: "https://logo.clearbit.com/schwab.com",
      displayName: "Schwab",
    },
    {
      name: "Robinhood",
      logo: "https://logo.clearbit.com/robinhood.com",
      displayName: "Robinhood",
    },
  ]

  // Get unique institutions from connected accounts
  const getConnectedInstitutions = () => {
    if (isDemoMode) {
      return demoInstitutions
    }

    if (!hasRealData || connectedPlaidAccounts.length === 0) {
      return []
    }

    // Extract unique institutions from connected accounts
    const institutionMap = new Map()

    connectedPlaidAccounts.forEach((account) => {
      const institutionName = account.institutionName || "Unknown Bank"
      if (!institutionMap.has(institutionName)) {
        institutionMap.set(institutionName, {
          name: institutionName,
          logo: getInstitutionLogo(institutionName),
          displayName: getDisplayName(institutionName),
          accountCount: 1,
        })
      } else {
        const existing = institutionMap.get(institutionName)
        existing.accountCount += 1
      }
    })

    return Array.from(institutionMap.values())
  }

  // Get institution logo with fallbacks
  const getInstitutionLogo = (institutionName: string) => {
    const name = institutionName.toLowerCase()

    if (name.includes("chase") || name.includes("jpmorgan")) return "https://logo.clearbit.com/chase.com"
    if (name.includes("bank of america") || name.includes("bofa")) return "https://logo.clearbit.com/bankofamerica.com"
    if (name.includes("wells fargo")) return "https://logo.clearbit.com/wellsfargo.com"
    if (name.includes("citibank") || name.includes("citi")) return "https://logo.clearbit.com/citibank.com"
    if (name.includes("capital one")) return "https://logo.clearbit.com/capitalone.com"
    if (name.includes("american express") || name.includes("amex"))
      return "https://logo.clearbit.com/americanexpress.com"
    if (name.includes("discover")) return "https://logo.clearbit.com/discover.com"
    if (name.includes("schwab")) return "https://logo.clearbit.com/schwab.com"
    if (name.includes("fidelity")) return "https://logo.clearbit.com/fidelity.com"
    if (name.includes("vanguard")) return "https://logo.clearbit.com/vanguard.com"
    if (name.includes("td ameritrade")) return "https://logo.clearbit.com/tdameritrade.com"
    if (name.includes("etrade") || name.includes("e*trade")) return "https://logo.clearbit.com/etrade.com"
    if (name.includes("robinhood")) return "https://logo.clearbit.com/robinhood.com"
    if (name.includes("ally")) return "https://logo.clearbit.com/ally.com"
    if (name.includes("usaa")) return "https://logo.clearbit.com/usaa.com"
    if (name.includes("navy federal")) return "https://logo.clearbit.com/navyfederal.org"
    if (name.includes("pnc")) return "https://logo.clearbit.com/pnc.com"
    if (name.includes("regions")) return "https://logo.clearbit.com/regions.com"
    if (name.includes("suntrust") || name.includes("truist")) return "https://logo.clearbit.com/truist.com"
    if (name.includes("first platypus") || name.includes("plaid")) return "https://logo.clearbit.com/plaid.com"

    return "https://logo.clearbit.com/bank.com"
  }

  // Get display name for institution
  const getDisplayName = (institutionName: string) => {
    const name = institutionName.toLowerCase()

    if (name.includes("bank of america")) return "Bank of America"
    if (name.includes("wells fargo")) return "Wells Fargo"
    if (name.includes("jpmorgan") || name.includes("chase")) return "Chase"
    if (name.includes("capital one")) return "Capital One"
    if (name.includes("american express")) return "Amex"
    if (name.includes("charles schwab")) return "Schwab"
    if (name.includes("td ameritrade")) return "TD Ameritrade"
    if (name.includes("navy federal")) return "Navy Federal"
    if (name.includes("first platypus")) return "Plaid Demo"

    return institutionName
  }

  const institutions = getConnectedInstitutions()
  const maxDisplayCount = isDemoMode ? 3 : 4 // Show all 3 for demo, limit others to 4
  const displayInstitutions = institutions.slice(0, maxDisplayCount)
  const remainingCount = Math.max(0, institutions.length - maxDisplayCount)

  return (
    <Card className="overflow-hidden border-blue-200/50 dark:border-blue-800/50 bg-gradient-to-br from-blue-50/30 to-indigo-50/20 dark:from-blue-950/20 dark:to-indigo-950/10">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-blue-700 dark:text-blue-300 text-sm font-medium">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            Connected Institutions
          </div>
          <span className="text-xs font-normal text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 px-2 py-1 rounded-full border border-gray-200 dark:border-gray-700">
            {institutions.length} {institutions.length === 1 ? "institution" : "institutions"}
          </span>
        </CardTitle>
        <CardDescription className="text-gray-600 dark:text-gray-300 text-xs">
          {isDemoMode ? "Sample financial institutions" : "Your linked financial providers"}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {institutions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-4 text-center">
            <div className="w-8 h-8 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-2">
              <Building2 className="w-4 h-4 text-gray-400 dark:text-gray-500" />
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-xs">No institutions connected</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {/* Compact Institution Display */}
            {displayInstitutions.map((institution, index) => (
              <div key={`${institution.name}-${index}`} className="flex items-center gap-3 group">
                {/* Institution Logo */}
                <div className="relative flex-shrink-0">
                  <div className="w-8 h-8 bg-gradient-to-br from-white to-gray-50 dark:from-gray-700 dark:to-gray-800 rounded-lg flex items-center justify-center overflow-hidden border border-gray-200/70 dark:border-gray-600/50 shadow-sm">
                    <img
                      src={institution.logo || "/placeholder.svg"}
                      alt={institution.displayName}
                      className="w-6 h-6 object-contain"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement
                        const parent = target.parentElement
                        if (parent) {
                          parent.innerHTML = `<div class="w-6 h-6 rounded bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">${institution.displayName.charAt(0)}</div>`
                        }
                      }}
                    />
                  </div>

                  {/* Connected indicator */}
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full flex items-center justify-center border border-white dark:border-gray-800">
                    <div className="w-1 h-1 bg-white rounded-full"></div>
                  </div>
                </div>

                {/* Institution Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-gray-900 dark:text-gray-100 text-sm truncate">
                      {institution.displayName}
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full font-medium">
                        Connected
                      </span>
                      {!isDemoMode && institution.accountCount && (
                        <span className="text-gray-500 dark:text-gray-400">
                          {institution.accountCount} {institution.accountCount === 1 ? "account" : "accounts"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Show "and X more" if there are additional institutions */}
            {remainingCount > 0 && (
              <div className="text-center pt-2 border-t border-blue-200/30 dark:border-blue-800/30">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  and {remainingCount} more {remainingCount === 1 ? "institution" : "institutions"}
                </span>
              </div>
            )}

            {/* Summary footer for demo mode */}
            {/* {isDemoMode && (
              <div className="pt-2 border-t border-blue-200/30 dark:border-blue-800/30">
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                  Sample data showing platform capabilities
                </p>
              </div>
            )} */}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
