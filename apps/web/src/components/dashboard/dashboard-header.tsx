"use client"

import Image from "next/image"
import { Bell, Settings, User, Search, Menu } from "lucide-react"
import { motion } from "framer-motion"

interface DashboardHeaderProps {
  session: any
  onSignOut: () => void
}

export function DashboardHeader({ session, onSignOut }: DashboardHeaderProps) {
  return (
    <motion.header 
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="bg-white/80 backdrop-blur-xl shadow-sm border-b border-white/20 sticky top-0 z-50"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo and Title */}
          <motion.div 
            className="flex items-center space-x-4"
            whileHover={{ scale: 1.02 }}
            transition={{ duration: 0.2 }}
          >
            <div className="relative">
              <Image
                src="/logo.png"
                alt="Peerfolio"
                width={40}
                height={40}
                className="rounded-xl shadow-lg"
              />
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white"></div>
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
                Peerfolio
              </h1>
              <p className="text-xs text-gray-500 font-medium">Investment Dashboard</p>
            </div>
          </motion.div>

          {/* Search Bar */}
          <div className="hidden md:flex flex-1 max-w-md mx-8">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search investments, companies..."
                className="w-full pl-10 pr-4 py-2 bg-gray-50/50 border border-gray-200/50 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/30 transition-all duration-200"
              />
            </div>
          </div>

          {/* Navigation and User Menu */}
          <div className="flex items-center space-x-6">
            {/* Navigation Links */}
            <nav className="hidden lg:flex items-center space-x-8">
              <motion.a 
                href="#" 
                className="text-sm font-semibold text-emerald-600 relative"
                whileHover={{ scale: 1.05 }}
              >
                Dashboard
                <motion.div
                  className="absolute -bottom-1 left-0 right-0 h-0.5 bg-emerald-500 rounded-full"
                  layoutId="activeTab"
                />
              </motion.a>
              <motion.a 
                href="#" 
                className="text-sm font-medium text-gray-600 hover:text-emerald-600 transition-colors"
                whileHover={{ scale: 1.05 }}
              >
                Groups
              </motion.a>
              <motion.a 
                href="#" 
                className="text-sm font-medium text-gray-600 hover:text-emerald-600 transition-colors"
                whileHover={{ scale: 1.05 }}
              >
                Analytics
              </motion.a>
            </nav>

            {/* Action Buttons */}
            <div className="flex items-center space-x-3">
              {/* Notification Bell */}
              <motion.button 
                className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100/50 rounded-full transition-colors"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
              >
                <Bell size={20} />
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
              </motion.button>

              {/* User Profile */}
              <div className="flex items-center space-x-3 pl-3 border-l border-gray-200">
                <div className="relative">
                  {session.user?.image && (
                    <motion.img
                      src={session.user.image}
                      alt="Profile"
                      className="h-10 w-10 rounded-full ring-2 ring-emerald-500/20 shadow-lg"
                      whileHover={{ scale: 1.1 }}
                      transition={{ duration: 0.2 }}
                    />
                  )}
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white"></div>
                </div>
                <div className="hidden sm:block">
                  <p className="text-sm font-semibold text-gray-900">
                    {session.user?.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    Premium Member
                  </p>
                </div>
              </div>

              {/* Sign Out Button */}
              <motion.button 
                onClick={onSignOut}
                className="bg-gradient-to-r from-gray-900 to-gray-800 hover:from-gray-800 hover:to-gray-700 text-white px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 shadow-lg hover:shadow-xl"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Sign Out
              </motion.button>
            </div>
          </div>
        </div>
      </div>
    </motion.header>
  )
}
