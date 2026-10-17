import { DEFAULT_RESOLVE, type ResolveConfig } from "./settlement.ts"

export const resolveConfigForTest = (): ResolveConfig => ({ ...DEFAULT_RESOLVE, minSources: 2 })
