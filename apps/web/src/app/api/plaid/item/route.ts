import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { access_token } = await request.json()

    // Get item information (institution details, etc.)
    const response = await fetch("https://sandbox.plaid.com/item/get", {
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

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error_message || "Failed to fetch item")
    }

    // Get institution details
    const institutionResponse = await fetch("https://sandbox.plaid.com/institutions/get_by_id", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: process.env.PLAID_CLIENT_ID,
        secret: process.env.PLAID_SECRET,
        institution_id: data.item.institution_id,
        country_codes: ["US"],
      }),
    })

    const institutionData = await institutionResponse.json()

    return NextResponse.json({
      item: data.item,
      institution: institutionData.institution,
    })
  } catch (error) {
    console.error("Error fetching item:", error)
    return NextResponse.json({ error: "Failed to fetch item" }, { status: 500 })
  }
}
