import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { access_token } = await request.json()

    if (!access_token) {
      return NextResponse.json({ error: "Access token is required" }, { status: 400 })
    }

    console.log("Fetching account data...")

    // Get basic account information
    const accountsResponse = await fetch("https://sandbox.plaid.com/accounts/get", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: process.env.PLAID_CLIENT_ID,
        secret: process.env.PLAID_SECRET,
        access_token,
      }),
    })

    const accountsData = await accountsResponse.json()

    if (!accountsResponse.ok) {
      console.error("Accounts API error:", accountsData)
      throw new Error(accountsData.error_message || "Failed to fetch accounts")
    }

    // Get investment holdings (if any investment accounts exist)
    let holdingsData = { holdings: [], securities: [] }
    const investmentAccounts = accountsData.accounts?.filter((account: any) => account.type === "investment")

    if (investmentAccounts && investmentAccounts.length > 0) {
      try {
        const holdingsResponse = await fetch("https://sandbox.plaid.com/investments/holdings/get", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            client_id: process.env.PLAID_CLIENT_ID,
            secret: process.env.PLAID_SECRET,
            access_token,
          }),
        })

        if (holdingsResponse.ok) {
          holdingsData = await holdingsResponse.json()
        }
      } catch (holdingsError) {
        console.warn("Could not fetch holdings:", holdingsError)
      }
    }

    // Get recent transactions
    let transactionsData = { transactions: [] }
    try {
      const endDate = new Date().toISOString().split("T")[0]
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]

      const transactionsResponse = await fetch("https://sandbox.plaid.com/transactions/get", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: process.env.PLAID_CLIENT_ID,
          secret: process.env.PLAID_SECRET,
          access_token,
          start_date: startDate,
          end_date: endDate,
          count: 50,
        }),
      })

      if (transactionsResponse.ok) {
        transactionsData = await transactionsResponse.json()
      }
    } catch (transactionsError) {
      console.warn("Could not fetch transactions:", transactionsError)
    }

    console.log("✅ Successfully fetched account data!")
    console.log(`Found ${accountsData.accounts?.length || 0} accounts`)
    console.log(`Found ${holdingsData.holdings?.length || 0} holdings`)
    console.log(`Found ${transactionsData.transactions?.length || 0} transactions`)

    return NextResponse.json({
      accounts: accountsData.accounts || [],
      holdings: holdingsData.holdings || [],
      securities: holdingsData.securities || [],
      transactions: transactionsData.transactions || [],
      item: accountsData.item,
    })
  } catch (error) {
    console.error("Error fetching account data:", error)
    return NextResponse.json(
      { error: "Failed to fetch account data", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    )
  }
}
