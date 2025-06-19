import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { public_token, metadata } = await request.json()

    console.log("Exchanging public token for access token...")
    console.log("Metadata:", metadata)

    // Exchange public token for access token
    const response = await fetch("https://sandbox.plaid.com/item/public_token/exchange", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: process.env.PLAID_CLIENT_ID,
        secret: process.env.PLAID_SECRET,
        public_token,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error("Token exchange error:", data)
      throw new Error(data.error_message || "Failed to exchange token")
    }

    console.log("✅ Token exchange successful!")
    console.log("Access token received:", data.access_token.substring(0, 20) + "...")
    console.log("Item ID:", data.item_id)

    // In a real app, you'd store this in your database
    // For now, we'll store it in a simple in-memory store or return it

    return NextResponse.json({
      success: true,
      access_token: data.access_token,
      item_id: data.item_id,
      institution: metadata.institution,
    })
  } catch (error) {
    console.error("Error exchanging token:", error)
    return NextResponse.json(
      { error: "Failed to exchange token", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    )
  }
}
