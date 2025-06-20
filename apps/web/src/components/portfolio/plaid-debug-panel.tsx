"use client"

import React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@web/components/ui/card"

interface PlaidDebugPanelProps {
  plaidData: any
}

export function PlaidDebugPanel({ plaidData }: PlaidDebugPanelProps) {
  if (!plaidData) return null

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-green-600">🔗 Real Plaid Data Connected!</CardTitle>
        <CardDescription>This is actual data from your connected account(s)</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="bg-gray-50 p-4 rounded-lg">
          <pre className="text-xs overflow-auto max-h-40">
            {JSON.stringify(plaidData, null, 2)}
          </pre>
        </div>
        <div className="mt-4 text-sm text-gray-600">
          <p><strong>Accounts found:</strong> {plaidData.accounts?.length || 0}</p>
          <p><strong>Institution:</strong> {plaidData.institution?.name || 'Unknown'}</p>
          {plaidData.accounts?.map((account: any, index: number) => (
            <p key={index}>
              <strong>{account.name}:</strong> {account.balances.current ? `$${account.balances.current}` : 'N/A'} 
              ({account.type})
            </p>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
