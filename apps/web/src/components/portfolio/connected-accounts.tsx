"use client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@web/components/ui/card"
import { Button } from "@web/components/ui/button"
import { PlaidLink } from "../plaid-link"
import { X } from "lucide-react"

interface ConnectedAccountsProps {
  accountsWithPercentages: any[]
  balanceSummary: {
    totalAssets: number
    totalLiabilities: number
    netWorth: number
  }
  formatCurrency: (value: number) => string
  getInstitutionDisplayName: (name: string) => string
  formatAccountName: (name: string) => string
  getAccountTypeIcon: (type: string, subtype?: string) => { icon: string; color: string; bgColor: string }
  handleRemoveAccount: (accountId: string) => void
  onConnectAccount: (publicToken: string, metadata: any) => void
  isDemoMode: boolean
  hasRealData?: boolean
}

export function ConnectedAccounts({
  accountsWithPercentages,
  balanceSummary,
  formatCurrency,
  getInstitutionDisplayName,
  formatAccountName,
  getAccountTypeIcon,
  handleRemoveAccount,
  onConnectAccount,
  isDemoMode,
}: ConnectedAccountsProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-gradient-to-br from-blue-50/50 to-indigo-50/50 dark:from-blue-950/20 dark:to-indigo-950/20 border-b border-gray-100 dark:border-gray-800 pb-4">
        <CardTitle className="flex items-center justify-between text-gray-900 dark:text-foreground">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            <span>Connected Accounts</span>
          </div>
          <span className="text-sm font-normal text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 px-3 py-1 rounded-full border border-gray-200 dark:border-gray-700">
            {accountsWithPercentages.length} {accountsWithPercentages.length === 1 ? "account" : "accounts"}
          </span>
        </CardTitle>
        <CardDescription className="text-gray-600 dark:text-gray-300">Your linked financial accounts</CardDescription>
      </CardHeader>
      <CardContent className="p-4">
        {/* Balance Summary */}
        {balanceSummary.totalLiabilities > 0 && (
          <div className="mb-4 p-4 bg-gradient-to-br from-gray-50 to-gray-100/50 dark:from-gray-800/50 dark:to-gray-900/30 rounded-xl border border-gray-200/50 dark:border-gray-700/50 shadow-sm">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="space-y-1">
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Total Assets
                </div>
                <div className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(balanceSummary.totalAssets)}
                </div>
              </div>
              <div className="space-y-1 border-x border-gray-200 dark:border-gray-700">
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Total Liabilities
                </div>
                <div className="text-base font-bold text-red-500 dark:text-red-400">
                  {formatCurrency(balanceSummary.totalLiabilities)}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Net Worth
                </div>
                <div className="text-base font-bold text-gray-900 dark:text-gray-100">
                  {formatCurrency(balanceSummary.netWorth)}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {accountsWithPercentages.map((account: any) => (
            <div
              key={`${account.id || account.plaidAccountId || account.name}-${account.balance}-${Date.now()}`}
              className="group relative p-4 bg-white dark:bg-gray-800/30 border border-gray-200/60 dark:border-gray-700/50 rounded-xl hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md dark:hover:shadow-gray-900/20 transition-all duration-300 hover:scale-[1.01]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    {/* Institution Logo */}
                    <div className="w-12 h-12 bg-gradient-to-br from-white to-gray-50 dark:from-gray-700 dark:to-gray-800 rounded-xl flex items-center justify-center overflow-hidden border-2 border-gray-200/70 dark:border-gray-600/50 group-hover:border-gray-300 dark:group-hover:border-gray-500 transition-all duration-300 shadow-sm">
                      <img
                        src={account.logo || "/placeholder.svg"}
                        alt={getInstitutionDisplayName(account.name)}
                        className="w-8 h-8 object-contain"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement
                          const parent = target.parentElement
                          if (parent) {
                            const institutionName = getInstitutionDisplayName(account.name)
                            parent.innerHTML = `<div class="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold shadow-inner">${institutionName.charAt(0)}</div>`
                          }
                        }}
                      />
                    </div>

                    {/* Account Type Badge */}
                    {(() => {
                      const accountTypeInfo = getAccountTypeIcon(account.type, account.subtype)
                      return (
                        <div
                          className={`absolute -bottom-1 -right-1 w-6 h-6 ${accountTypeInfo.bgColor} dark:bg-opacity-90 rounded-full flex items-center justify-center border-2 border-white dark:border-gray-800 shadow-md transition-transform duration-300 group-hover:scale-110`}
                        >
                          <span className="text-xs">{accountTypeInfo.icon}</span>
                        </div>
                      )
                    })()}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-gray-900 dark:text-gray-100 text-base mb-1 truncate">
                      {formatAccountName(account.name)}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-gray-700/50 px-2 py-0.5 rounded text-xs">
                        {getInstitutionDisplayName(account.name)}
                      </span>
                      <span className="text-gray-400 dark:text-gray-500">•</span>
                      <span className="capitalize text-gray-600 dark:text-gray-300 font-medium text-xs">
                        {account.type}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right min-w-[120px]">
                    <div className="font-bold text-gray-900 dark:text-gray-100 text-lg mb-1">
                      {formatCurrency(account.balance)}
                    </div>
                    <div className="flex justify-end">
                      {account.isIncludedInPortfolio ? (
                        <span className="inline-flex items-center text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded-full text-xs font-medium border border-blue-200 dark:border-blue-800">
                          {account.percentage.toFixed(1)}% of portfolio
                        </span>
                      ) : account.isLiability ? (
                        <span className="inline-flex items-center text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-2 py-1 rounded-full text-xs font-medium border border-red-200 dark:border-red-800">
                          Liability
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700/50 px-2 py-1 rounded-full text-xs font-medium border border-gray-200 dark:border-gray-600">
                          Not in portfolio
                        </span>
                      )}
                    </div>
                  </div>
                  {account.accountId && !isDemoMode && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveAccount(account.accountId)}
                      className="opacity-0 group-hover:opacity-100 transition-all duration-300 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded-lg hover:scale-110 flex-shrink-0"
                      title="Remove account"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Add Account Button */}
          <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
            <PlaidLink
              onSuccess={onConnectAccount}
              variant="outline"
              className="w-full h-12 border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 bg-transparent hover:bg-blue-50/50 dark:hover:bg-blue-900/20 transition-all duration-300 rounded-xl group flex items-center justify-center gap-2 font-medium hover:scale-[1.01]"
            >
              Add Another Account
            </PlaidLink>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
