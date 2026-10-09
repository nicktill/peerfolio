/** Typed by the owner to confirm the emergency shutdown. Exact, so a stray click can't trigger it. */
export const SHUTDOWN_PHRASE = "DISCONNECT EVERYONE"

export function shutdownConfirmed(given: unknown): boolean {
  return typeof given === "string" && given.trim() === SHUTDOWN_PHRASE
}

/**
 * `PLAID_KILL_SWITCH=true` pauses Plaid whatever the database says. It is the
 * break-glass path: it works even when the admin page can't load.
 */
export function pausedByEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.PLAID_KILL_SWITCH === "true"
}
