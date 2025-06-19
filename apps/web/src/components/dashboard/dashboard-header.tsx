"use client"

import Image from "next/image"
import { Bell, Settings, User } from "lucide-react"

interface DashboardHeaderProps {
  session: any
  onSignOut: () => void
}

export function DashboardHeader({ session, onSignOut }: DashboardHeaderProps) {
  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo and Title */}
          <div className="flex items-center space-x-3">
            <Image
              src="/logo.png"
              alt="Peerfolio"
              width={32}
              height={32}
              className="rounded-lg"
            />
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Peerfolio</h1>
              <p className="text-xs text-gray-500">Investment Dashboard</p>
            </div>
          </div>

          {/* Navigation and User Menu */}
          <div className="flex items-center space-x-4">
            {/* Navigation Links */}
            <nav className="hidden md:flex items-center space-x-6">
              <a href="#" className="text-sm font-medium text-gray-700 hover:text-emerald-600 transition-colors">
                Dashboard
              </a>
              <a href="#" className="text-sm font-medium text-gray-500 hover:text-emerald-600 transition-colors">
                Groups
              </a>
              <a href="#" className="text-sm font-medium text-gray-500 hover:text-emerald-600 transition-colors">
                Analytics
              </a>
            </nav>

            {/* Notification Bell */}
            <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
              <Bell size={18} />
            </button>

            {/* User Profile */}
            <div className="flex items-center space-x-3">
              {session.user?.image && (
                <img
                  src={session.user.image}
                  alt="Profile"
                  className="h-8 w-8 rounded-full ring-2 ring-gray-200"
                />
              )}
              <div className="hidden sm:block">
                <p className="text-sm font-medium text-gray-700">
                  {session.user?.name}
                </p>
                <p className="text-xs text-gray-500">
                  {session.user?.email}
                </p>
              </div>
            </div>

            {/* Settings Menu */}
            <div className="relative">
              <button 
                onClick={onSignOut}
                className="bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-full text-sm font-medium transition-colors flex items-center space-x-2"
              >
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
