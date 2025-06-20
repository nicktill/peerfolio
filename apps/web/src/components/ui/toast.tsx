"use client"

import { CheckCircle } from "lucide-react"
import React from "react"

interface ToastProps {
  show: boolean
  onClose: () => void
  message: string
  emoji?: string // Optional emoji or icon
}

export const Toast = ({ show, onClose, message, emoji }: ToastProps) => {
  if (!show) return null

  return (
    <div className="fixed z-50 animate-fade-in-up transition-all duration-300" style={{ top: '4.5rem', right: '1rem' }}>
      <div className="backdrop-blur-md bg-white/90 dark:bg-gray-900/90 border border-green-200 dark:border-green-900 shadow-2xl rounded-2xl px-5 py-4 flex items-center gap-4 max-w-xs min-w-[240px]">
        <div className="flex-shrink-0 rounded-full bg-green-100 dark:bg-green-900/40 p-2 shadow-inner text-xl flex items-center justify-center w-8 h-8">
          {typeof emoji === 'string' && emoji ? (
            <span aria-hidden="true" className="text-2xl leading-none">{emoji}</span>
          ) : (
            <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
          )}
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-tight">
            {message}
          </p>
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 rounded-full p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-green-400"
          aria-label="Close notification"
        >
          <svg className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600 dark:text-gray-300 dark:hover:text-gray-100 transition-colors" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 8.586l4.95-4.95a1 1 0 111.414 1.415L11.414 10l4.95 4.95a1 1 0 01-1.414 1.415L10 11.414l-4.95 4.95a1 1 0 01-1.415-1.414L8.586 10l-4.95-4.95A1 1 0 115.05 3.636L10 8.586z" />
          </svg>
        </button>
      </div>
      <style jsx global>{`
        @keyframes fade-in-up {
          0% { opacity: 0; transform: translateY(20px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up {
          animation: fade-in-up 0.35s cubic-bezier(0.4,0,0.2,1);
        }
      `}</style>
    </div>
  )
}
