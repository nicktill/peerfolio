// Local storage utilities for managing multiple Plaid accounts
export interface ConnectedAccount {
  id: string
  accessToken: string
  institutionName: string
  accountsData: any
  connectedAt: string
  metadata?: any
}

const STORAGE_KEY = 'peerfolio_connected_accounts'

export const getConnectedAccounts = (): ConnectedAccount[] => {
  if (typeof window === 'undefined') return []
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch (error) {
    console.error('Error reading connected accounts from localStorage:', error)
    return []
  }
}

export const addConnectedAccount = (account: ConnectedAccount): void => {
  if (typeof window === 'undefined') return
  
  try {
    const existing = getConnectedAccounts()
    const updated = [...existing, account]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  } catch (error) {
    console.error('Error saving connected account to localStorage:', error)
  }
}

export const removeConnectedAccount = (accountId: string): void => {
  if (typeof window === 'undefined') return
  
  try {
    const existing = getConnectedAccounts()
    const updated = existing.filter(account => account.id !== accountId)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  } catch (error) {
    console.error('Error removing connected account from localStorage:', error)
  }
}

export const clearAllConnectedAccounts = (): void => {
  if (typeof window === 'undefined') return
  
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (error) {
    console.error('Error clearing connected accounts from localStorage:', error)
  }
}

export const updateConnectedAccount = (accountId: string, updates: Partial<ConnectedAccount>): void => {
  if (typeof window === 'undefined') return
  
  try {
    const existing = getConnectedAccounts()
    const updated = existing.map(account => 
      account.id === accountId ? { ...account, ...updates } : account
    )
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  } catch (error) {
    console.error('Error updating connected account in localStorage:', error)
  }
}
