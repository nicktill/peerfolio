type Status = { status: string; errorCode?: string | null }

export function connectionNotice({ status, errorCode }: Status): { message: string; tone: "info" | "success" | "error"; removeRequired: boolean } {
  if (errorCode === "UNSUPPORTED_CURRENCY") return { message: "Peerfolio supports USD investment accounts only. Remove this connection and connect a USD account.", tone: "error", removeRequired: true }
  if (errorCode === "UNSUPPORTED_INVESTMENT_POSITION") return { message: "Peerfolio does not support short investment positions yet. Remove this connection before testing another account.", tone: "error", removeRequired: true }
  if (status === "disconnected") return { message: "Access was revoked. Remove this connection, then connect again to resume updates.", tone: "error", removeRequired: true }
  if (status === "needs_reauth") return { message: "Your brokerage needs you to sign in again before it can update.", tone: "error", removeRequired: false }
  if (status !== "active") return { message: "Account connected. Data is still syncing; try refreshing shortly.", tone: "info", removeRequired: false }
  return { message: "Account connected.", tone: "success", removeRequired: false }
}

/** Permission revocation is terminal until the user creates a new connection. */
export function itemWebhookState(currentStatus: string, code: string | undefined, errorCode?: string | null): { status: "error" | "needs_reauth" | "disconnected"; errorCode: string | null } | null {
  if (currentStatus === "disconnected") return null
  if (code === "USER_PERMISSION_REVOKED" || code === "USER_ACCOUNT_REVOKED") return { status: "disconnected", errorCode: code }
  if (code === "PENDING_EXPIRATION" || code === "PENDING_DISCONNECT") return { status: "needs_reauth", errorCode: code }
  if (code === "ERROR") return { status: errorCode && ["ITEM_LOGIN_REQUIRED", "PENDING_EXPIRATION", "PENDING_DISCONNECT"].includes(errorCode) ? "needs_reauth" : "error", errorCode: errorCode ?? null }
  return null
}
