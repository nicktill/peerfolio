import { type NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import crypto from "crypto"

export async function POST(request: NextRequest) {
  try {
    // Check required environment variables
    if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET) {
      console.error("Missing Plaid credentials")
      return NextResponse.json(        { error: "Plaid configuration error - missing credentials" },
        { status: 500 }
      )
    }    // Get user session for unique user ID
    const session = await getServerSession()
    // Create a non-sensitive user ID by hashing the email
    const userId = session?.user?.email 
      ? `user_${crypto.createHash('sha256').update(session.user.email).digest('hex').substring(0, 16)}`
      : `demo_user_${Date.now()}`

    const requestBody: any = {
      client_id: process.env.PLAID_CLIENT_ID,
      secret: process.env.PLAID_SECRET,
      client_name: "Peerfolio",
      country_codes: ["US"],
      language: "en",
      user: {
        client_user_id: userId,
      },
      products: ["investments", "transactions"],
    }

    // Only add redirect_uri if it's set
    if (process.env.PLAID_REDIRECT_URI) {
      requestBody.redirect_uri = process.env.PLAID_REDIRECT_URI
    }

    console.log("Creating Plaid link token for user:", userId)

    const response = await fetch("https://sandbox.plaid.com/link/token/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error("Plaid API Error:", {
        status: response.status,
        statusText: response.statusText,
        error: data
      })
      return NextResponse.json(
        { error: data.error_message || data.error_code || "Failed to create link token" },
        { status: 400 }
      )
    }

    console.log("✅ Plaid link token created successfully")
    return NextResponse.json({ link_token: data.link_token })
  } catch (error) {
    console.error("Error creating link token:", error)
    return NextResponse.json(
      { error: "Failed to create link token", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    )
  }
}
