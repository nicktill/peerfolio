"use client"

import { usePlaidLink } from 'react-plaid-link'
import { useEffect, useState } from 'react'

interface PlaidLinkButtonProps {
  onSuccess: (publicToken: string, metadata: any) => void
  isLoading?: boolean
  className?: string
  children: React.ReactNode
}

export function PlaidLinkButton({ 
  onSuccess, 
  isLoading = false, 
  className = "", 
  children 
}: PlaidLinkButtonProps) {
  const [linkToken, setLinkToken] = useState<string | null>(null)

// Create link token - in a real app, this would come from your backend
  useEffect(() => {
    // For demo purposes, we'll simulate a link token
    // In production, you'd call your backend endpoint to create a link token
    const createLinkToken = async () => {
      try {
        // This would be a call to your backend API
        // const response = await fetch('/api/plaid/create-link-token')
        // const data = await response.json()
        // setLinkToken(data.link_token)
        
        // For now, we'll use a demo token (this won't work with real Plaid)
        setLinkToken('demo-link-token')
      } catch (error) {
        console.error('Error creating link token:', error)
      }
    }

    createLinkToken()
  }, [])

  const config = {
    token: linkToken,
    onSuccess: (publicToken: string, metadata: any) => {
      console.log('Plaid Link success:', { publicToken, metadata })
      onSuccess(publicToken, metadata)
    },
    onExit: (err: any, metadata: any) => {
      console.log('Plaid Link exit:', { err, metadata })
    },
    onEvent: (eventName: string, metadata: any) => {
      console.log('Plaid Link event:', { eventName, metadata })
    },
  }

  const { open, ready } = usePlaidLink(config)

  // For demo purposes, we'll handle the click differently
  const handleClick = () => {
    if (process.env.NODE_ENV === 'development') {
      // Simulate the Plaid Link flow for development
      console.log('Demo mode: Simulating Plaid Link...')
      onSuccess('demo-public-token', {
        institution: {
          name: 'Demo Bank',
          institution_id: 'demo_bank'
        },
        accounts: [
          {
            id: 'demo_account_1',
            name: 'Investment Account',
            type: 'investment',
            subtype: 'investment'
          }
        ]
      })
    } else {
      // In production, use the real Plaid Link
      open()
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={isLoading || (!ready && process.env.NODE_ENV !== 'development')}
      className={className}
    >
      {children}
    </button>
  )
}
