/**
 * Feature flag `sportsEnabled`. Off unless NEXT_PUBLIC_SPORTS_ENABLED is "1".
 * Read from one NEXT_PUBLIC variable so the same value is visible to the
 * server routes and the client UI (Next inlines it at build time).
 */
export const sportsEnabled = (): boolean => process.env.NEXT_PUBLIC_SPORTS_ENABLED === "1"
