"use client";

import { useState } from "react"
import { TrendingUp, Users, Link2, BarChart3, CheckCircle, Sparkles, Award, Star, ArrowRight, Globe, Shield, Zap } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { signIn } from "next-auth/react"
import { BrokerageMarquee } from "./brokerage-marquee"
import { AnimatedGridPattern } from "./magicui/animated-grid-pattern"
import { DotPattern } from "./magicui/dot-pattern"
import { MorphingText } from "./magicui/morphing-text"
import { NumberTicker } from "./magicui/number-ticker"
import { AnimatedShinyText } from "./magicui/animated-shiny-text"
import { cn } from "@web/lib/utils"

// Toast component for success notifications
interface ToastProps {
  show: boolean
  onClose: () => void
  message: string
}

const Toast = ({ show, onClose, message }: ToastProps) => {
  if (!show) return null

  return (
    <div className="fixed top-20 right-4 z-40 animate-in slide-in-from-right-2 duration-200">
      <div className="bg-white border border-green-200 shadow-lg rounded-lg px-4 py-3 flex items-center gap-3 max-w-xs">
        <div className="flex-shrink-0">
          <CheckCircle className="w-4 h-4 text-green-600" />
        </div>
        <div className="flex-1">
          <p className="text-xs font-medium text-gray-900 leading-tight">{message}</p>
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <span className="sr-only">Close</span>
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// Simple inline components with more professional styling
interface ButtonProps {
  children: React.ReactNode
  variant?: "default" | "secondary" | "ghost" | "dark"
  size?: "default" | "lg"
  className?: string
  [key: string]: any
}

const Button = ({ children, variant = "default", size = "default", className = "", ...props }: ButtonProps) => {
  const baseClasses =
    "inline-flex items-center justify-center font-medium transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 transform hover:scale-[1.02] active:scale-[0.98]"
  const variants = {
    default: "bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg hover:shadow-xl focus:ring-emerald-500 rounded-full",
    dark: "bg-gray-900 hover:bg-gray-800 text-white shadow-lg hover:shadow-xl focus:ring-gray-500 rounded-full",
    secondary:
      "bg-white hover:bg-gray-50 text-gray-900 border border-gray-200 hover:border-gray-300 shadow-sm hover:shadow-md focus:ring-gray-500 rounded-full",
    ghost: "text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-full",
  }
  const sizes = {
    default: "px-6 py-3 text-sm",
    lg: "px-8 py-4 text-base",
  }

  return (
    <button className={`${baseClasses} ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
      {children}
    </button>
  )
}

const Input = ({ className = "", ...props }: any) => (
  <input
    className={`flex h-12 w-full rounded-full border border-gray-200 bg-white px-4 py-3 text-base placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all duration-200 ${className}`}
    {...props}
  />
)

const Card = ({ children, className = "", ...props }: any) => (
  <div
    className={`rounded-2xl border border-gray-100 bg-white shadow-sm hover:shadow-lg hover:border-gray-200 transition-all duration-300 cursor-pointer transform hover:scale-[1.02] hover:-translate-y-1 ${className}`}
    {...props}
  >
    {children}
  </div>
)

const Badge = ({ children, className = "", ...props }: any) => (
  <div className={`inline-flex items-center rounded-full px-4 py-2 text-xs font-medium ${className}`} {...props}>
    {children}
  </div>
)

export default function PeerfolioLanding() {
  const [heroEmail, setHeroEmail] = useState("")
  const [showToast, setShowToast] = useState(false)
  const [toastMessage, setToastMessage] = useState("")

  const handleHeroEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    
    if (!heroEmail.trim()) {
      setToastMessage("Please enter your email address to join the waitlist!")
      setShowToast(true)
      // Auto hide toast after 5 seconds
      setTimeout(() => setShowToast(false), 5000)
      return
    }
    
    if (!emailRegex.test(heroEmail)) {
      setToastMessage("Please enter a valid email address!")
      setShowToast(true)
      // Auto hide toast after 5 seconds
      setTimeout(() => setShowToast(false), 5000)
      return
    }
    
    // Success - simulate adding to waitlist
    setToastMessage(`Thanks for joining our waitlist! We'll send you early access and updates soon! 🚀`)
    setShowToast(true)
    setHeroEmail("") // Clear the input
    // Auto hide toast after 5 seconds
    setTimeout(() => setShowToast(false), 5000)
  }

  return (
    <div className="relative min-h-screen bg-white transition-colors duration-300">
      {/* Clean Global Background with Single Rotated Animated Grid */}
      <div className="fixed inset-0 z-0">
        {/* Base gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-gray-50 via-white to-emerald-50/20" />
        
        {/* Single subtle rotated animated grid background */}
        <div className="absolute -inset-[10%] w-[120%] h-[120%] transform rotate-12 origin-center">
          <AnimatedGridPattern
            numSquares={80}
            maxOpacity={0.18}
            duration={6}
            repeatDelay={0.5}
            className={cn(
              "absolute inset-0 h-full w-full text-emerald-500/70",
              "[mask-image:radial-gradient(2000px_circle_at_center,white,transparent)]"
            )}
          />
        </div>
        
        {/* Additional floating elements for depth */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gradient-to-r from-emerald-200/10 to-teal-200/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-gradient-to-r from-blue-200/10 to-purple-200/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
      </div>
      
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-gray-100/50 bg-white/80 backdrop-blur-md relative">
        <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />
        <div className="container flex h-16 items-center justify-between px-6 max-w-6xl mx-auto">
          <div 
            className="flex items-center space-x-3 group cursor-pointer"
            onClick={() => window.location.reload()}
          >
            <div className="relative">
              <Image
                src="/logo.png"
                alt="Peerfolio Logo"
                width={36}
                height={36}
                className="rounded-lg transition-transform duration-300 group-hover:scale-110"
              />
              <div className="absolute inset-0 rounded-lg bg-emerald-500/20 blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </div>
            <span className="text-xl font-semibold text-gray-900 group-hover:text-emerald-600 transition-colors duration-300">Peerfolio</span>
          </div>

          <div className="flex items-center space-x-4">
            <Button 
              variant="ghost" 
              className="hidden md:inline-flex hover:bg-emerald-50 hover:text-emerald-600"
              onClick={() => signIn('google')}
            >
              Sign in
            </Button>
            <Button 
              variant="dark"
              onClick={() => signIn('google')}
              className="bg-gradient-to-r from-gray-900 to-gray-800 hover:from-gray-800 hover:to-gray-700"
            >
              Get Started
              <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform duration-300" />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 relative z-10">
        {/* Hero Section */}
        <section className="relative py-24 md:py-32 bg-gradient-to-b from-transparent via-white/30 to-white/60 overflow-hidden">
          {/* Static floating elements for visual interest */}
          <div className="absolute top-20 left-10 w-20 h-20 bg-emerald-400/10 rounded-full blur-xl" />
          <div className="absolute top-40 right-20 w-16 h-16 bg-blue-400/10 rounded-full blur-xl" />
          <div className="absolute bottom-20 left-1/4 w-24 h-24 bg-purple-400/10 rounded-full blur-xl" />
          
          <div className="container relative px-6 max-w-6xl mx-auto">
            <div className="mx-auto max-w-4xl text-center">
              <Badge className="mb-8 bg-gradient-to-r from-emerald-50 via-emerald-100 to-teal-50 text-emerald-700 border border-emerald-200/60 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 px-4 py-2">
                <Star className="w-3 h-3 mr-2 text-yellow-500" />
                Trusted by 2,847+ investors
              </Badge>

            <h1 className="mb-8 font-bold tracking-tight animate__animated animate__fadeInUp">
            <div className="text-5xl sm:text-6xl md:text-7xl text-gray-900 leading-none">
                Track your{" "}
                <span className="inline-block min-w-[280px] sm:min-w-[350px] md:min-w-[420px] text-left align-baseline">
                <MorphingText 
                    texts={["investments", "budgeting", "retirement", "allocations",  "dividends", "brokerages", "finances"]} 
                    className="inline-block align-baseline text-5xl sm:text-6xl md:text-7xl"
                    animationType="typewriter"
                />
                </span>
            </div>
            <div className="mt-2 text-5xl sm:text-6xl md:text-7xl leading-none">
                <span className="bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 bg-clip-text text-transparent">
                with friends
                </span>
            </div>
            </h1>

              <p className="mx-auto mb-12 max-w-2xl text-xl text-gray-600 leading-relaxed animate__animated animate__fadeInUp animate__delay-1s">
                Peerfolio lets you compare portfolios, stay accountable, and grow wealth together. The social investment
                platform built for your generation.
              </p>

              <div className="mx-auto max-w-lg animate__animated animate__fadeInUp animate__delay-2s">
                <form onSubmit={handleHeroEmailSubmit} className="flex gap-3 p-2 bg-white/90 backdrop-blur-sm rounded-full shadow-xl border border-gray-100/50 hover:shadow-2xl transition-all duration-300 group">
                  <Input
                    type="email"
                    placeholder="Enter your email"
                    value={heroEmail}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setHeroEmail(e.target.value)}
                    className="flex-1 border-0 bg-transparent focus:ring-0 shadow-none group-hover:bg-white/50 transition-colors duration-300"
                    required
                  />
                  <Button 
                    type="submit"
                    className="bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 hover:from-emerald-600 hover:via-emerald-700 hover:to-teal-700 text-white hover:text-white font-medium"
                  >
                    Join Waitlist
                    <Sparkles className="w-4 h-4 ml-2" />
                  </Button>
                </form>
                <p className="mt-4 text-sm text-gray-500">Free forever • No credit card required</p>
              </div>
            </div>

            {/* Hero Visual - Portfolio Dashboard */}
            <div className="mx-auto max-w-6xl mt-20 animate__animated animate__fadeInUp animate__delay-3s">
              <div className="relative group">
                {/* Enhanced animated grid pattern for hero dashboard */}
                <div className="absolute inset-0 rounded-3xl overflow-hidden">
                  <AnimatedGridPattern
                    numSquares={25}
                    maxOpacity={0.15}
                    duration={4}
                    repeatDelay={0.5}
                    className={cn(
                      "absolute inset-0 h-full w-full text-emerald-400/80",
                      "[mask-image:radial-gradient(600px_circle_at_center,white,transparent)]"
                    )}
                  />
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-100/30 to-blue-100/30 rounded-3xl blur-3xl group-hover:blur-2xl transition-all duration-700" />
                <div className="relative bg-white/95 rounded-3xl p-8 shadow-2xl border border-gray-100 backdrop-blur-sm group-hover:shadow-3xl transition-all duration-500">
                  {/* Dashboard Header */}
                  <div className="flex items-center justify-between mb-8 pb-6 border-b border-gray-100">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">Portfolio Performance</h3>
                      <p className="text-sm text-gray-500 flex items-center gap-2">
                        <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                        Stanford CS Group • <NumberTicker value={24} /> members online
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-bold text-gray-900 mb-1">
                        +<NumberTicker value={12.4} decimalPlaces={1} />%
                      </div>
                      <AnimatedShinyText className="text-sm text-emerald-600 font-medium">
                        ↗ Outperforming S&P 500
                      </AnimatedShinyText>
                    </div>
                  </div>

                  <div className="grid gap-6 md:grid-cols-3">
                    <Card className="bg-gradient-to-r from-emerald-50 to-emerald-100 border-emerald-200 hover:from-emerald-100 hover:to-emerald-200 transition-all duration-500">
                      <div className="p-6">
                        <div className="flex items-center justify-between mb-4">
                          <div className="h-12 w-12 rounded-xl bg-emerald-500 flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-110 transition-all duration-300">
                            <TrendingUp className="h-6 w-6 text-white" />
                          </div>
                          <Badge className="bg-emerald-500 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-300 px-4 py-2 text-xs font-semibold tracking-wide rounded-full">
                            <span className="mr-1.5 text-sm">🏆</span>
                            <span className="text-white drop-shadow-sm">Top 10%</span>
                          </Badge>
                        </div>
                        <div className="space-y-2">
                          <div className="text-sm text-emerald-700 font-semibold">Your Rank</div>
                          <div className="text-3xl font-bold text-gray-900">
                            #<NumberTicker value={3} /> of <NumberTicker value={24} />
                          </div>
                          <div className="text-xs text-gray-600">
                            Portfolio Value: $<NumberTicker value={18920} className="font-semibold" />
                          </div>
                        </div>
                      </div>
                    </Card>

                    <Card className="bg-gradient-to-r from-blue-50 to-blue-100 border-blue-200 ring-2 ring-blue-200 hover:ring-blue-300 hover:from-blue-100 hover:to-blue-200 transition-all duration-500">
                      <div className="p-6">
                        <div className="flex items-center justify-between mb-4">
                          <div className="h-12 w-12 rounded-xl bg-blue-500 flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-110 transition-all duration-300">
                            <BarChart3 className="h-6 w-6 text-white" />
                          </div>
                          <Badge className="bg-blue-500 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-300 px-4 py-2 text-xs font-semibold tracking-wide rounded-full">
                            <span className="mr-1.5 text-sm">📈</span>
                            <span className="text-white drop-shadow-sm">+8.7%</span>
                          </Badge>
                        </div>
                        <div className="space-y-2">
                          <div className="text-sm text-blue-700 font-semibold">30-Day Return</div>
                          <div className="text-3xl font-bold text-gray-900">
                            $<NumberTicker value={1520} />
                          </div>
                          <div className="text-xs text-gray-600">
                            vs $<NumberTicker value={890} /> group average
                          </div>
                        </div>
                      </div>
                    </Card>

                    <Card className="bg-gradient-to-r from-purple-50 to-purple-100 border-purple-200 hover:from-purple-100 hover:to-purple-200 transition-all duration-500">
                      <div className="p-6">
                        <div className="flex items-center justify-between mb-4">
                          <div className="h-12 w-12 rounded-xl bg-purple-500 flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-110 transition-all duration-300">
                            <Users className="h-6 w-6 text-white" />
                          </div>
                          <Badge className="bg-purple-500 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-300 px-4 py-2 text-xs font-semibold tracking-wide rounded-full">
                            <span className="mr-1.5 text-sm">🔥</span>
                            <span className="text-white drop-shadow-sm">Active</span>
                          </Badge>
                        </div>
                        <div className="space-y-2">
                          <div className="text-sm text-purple-700 font-semibold">Group Activity</div>
                          <div className="text-3xl font-bold text-gray-900">
                            <NumberTicker value={47} /> trades
                          </div>
                          <div className="text-xs text-gray-600">this week</div>
                        </div>
                      </div>
                    </Card>
                  </div>

                  {/* Additional insights */}
                  <div className="mt-6 pt-6 border-t border-gray-100">
                    <div className="flex items-center justify-between text-sm text-gray-600">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                        Live data • Updated <NumberTicker value={2} /> mins ago
                      </span>
                      <span className="flex items-center gap-2">
                        🎯 Goal: Beat market by <NumberTicker value={5} />%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Brokerage Partners Marquee */}
        <div className="animate__animated animate__fadeInUp">
          <BrokerageMarquee />
        </div>

        {/* Features Section */}
        <section className="py-24 md:py-32 bg-gradient-to-b from-white/80 to-gray-50/80 backdrop-blur-sm relative overflow-hidden">
          {/* Subtle background pattern for features */}
          <div className="absolute inset-0 opacity-20">
            <DotPattern
              className={cn(
                "absolute inset-0 h-full w-full opacity-[0.15] text-blue-400/60",
                "[mask-image:radial-gradient(1200px_circle_at_center,white,transparent)]"
              )}
              width={40}
              height={40}
            />
          </div>
          
          <div className="container px-6 max-w-6xl mx-auto relative">
            <div className="mx-auto max-w-4xl text-center mb-20">
              <h2 className="mb-6 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl animate__animated animate__fadeInUp">
                Investing, but make it{" "}
                <span className="bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 bg-clip-text text-transparent">
                  social
                </span>
              </h2>
              <p className="text-xl text-gray-600 leading-relaxed animate__animated animate__fadeInUp animate__delay-1s">
                Connect your accounts, compare with friends, and grow your wealth together in a secure environment.
              </p>
            </div>

            <div className="grid gap-8 md:grid-cols-3 lg:gap-12">
              <div className="group text-center animate__animated animate__fadeIn animate__delay-1s">
                <div className="relative mb-8">
                  {/* Gradient background glow */}
                  <div className="absolute inset-0 bg-gradient-to-r from-emerald-400/20 to-teal-400/20 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-300"></div>
                  {/* Icon container */}
                  <div className="relative mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-xl mx-auto group-hover:shadow-2xl group-hover:scale-105 transition-all duration-300">
                    <Link2 className="h-10 w-10 text-white" />
                  </div>
                </div>
                <h3 className="mb-4 text-xl font-bold text-gray-900 group-hover:text-emerald-600 transition-colors duration-300">Connect all your accounts</h3>
                <p className="text-gray-600 leading-relaxed mb-6 max-w-sm mx-auto">
                  Securely link your brokerage accounts through Plaid. Support for Robinhood, Fidelity, Charles Schwab,
                  and 12,000+ institutions.
                </p>
                <div className="flex items-center justify-center gap-6 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                    <AnimatedShinyText className="text-emerald-600 font-medium">
                      Bank-level security
                    </AnimatedShinyText>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <span className="font-medium text-emerald-600">Real-time sync</span>
                  </div>
                </div>
              </div>

              <div className="group text-center animate__animated animate__fadeIn animate__delay-2s">
                <div className="relative mb-8">
                  {/* Gradient background glow */}
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-400/20 to-purple-400/20 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-300"></div>
                  {/* Icon container */}
                  <div className="relative mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-xl mx-auto group-hover:shadow-2xl group-hover:scale-105 transition-all duration-300">
                    <Users className="h-10 w-10 text-white" />
                  </div>
                </div>
                <h3 className="mb-4 text-xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors duration-300">Group investing</h3>
                <p className="text-gray-600 leading-relaxed mb-6 max-w-sm mx-auto">
                  Create groups with friends or join curated communities. Compare performance side-by-side and stay
                  motivated with friendly competition.
                </p>
                <div className="flex items-center justify-center gap-6 text-sm text-gray-500">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <span className="font-medium">University groups</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                    <span className="font-medium">Anonymous rankings</span>
                  </div>
                </div>
              </div>

              <div className="group text-center animate__animated animate__fadeIn animate__delay-3s">
                <div className="relative mb-8">
                  {/* Gradient background glow */}
                  <div className="absolute inset-0 bg-gradient-to-r from-purple-400/20 to-pink-400/20 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-300"></div>
                  {/* Icon container */}
                  <div className="relative mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-purple-500 to-purple-600 shadow-xl mx-auto group-hover:shadow-2xl group-hover:scale-105 transition-all duration-300">
                    <BarChart3 className="h-10 w-10 text-white" />
                  </div>
                </div>
                <h3 className="mb-4 text-xl font-bold text-gray-900 group-hover:text-purple-600 transition-colors duration-300">Portfolio growth insights</h3>
                <p className="text-gray-600 leading-relaxed mb-6 max-w-sm mx-auto">
                  See how your gains compare over time with beautiful charts and insights. Track your progress and learn
                  from top performers.
                </p>
                <div className="flex items-center justify-center gap-6 text-sm text-gray-500">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                    <span className="font-medium">Performance analytics</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-pink-500 rounded-full"></div>
                    <span className="font-medium">Growth tracking</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA Section */}
        <section className="py-24 md:py-32 bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900 relative overflow-hidden">
          {/* Enhanced background elements for CTA */}
          <div className="absolute inset-0 w-full h-full">
            {/* Rotated grid pattern covering full section */}
            <div className="absolute -inset-[20%] w-[140%] h-[140%] transform -skew-y-12 origin-center">
              <AnimatedGridPattern
                numSquares={40}
                maxOpacity={0.35}
                duration={3}
                repeatDelay={1}
                className={cn(
                  "absolute inset-0 h-full w-full text-emerald-400",
                  "[mask-image:radial-gradient(1400px_circle_at_center,white,transparent)]"
                )}
              />
            </div>
          </div>
          <div className="container relative px-6 max-w-4xl mx-auto text-center">
            <h2 className="mb-6 text-4xl font-bold tracking-tight text-white sm:text-5xl animate__animated animate__fadeIn">
              Ready to invest{" "}
              <span className="bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-500 bg-clip-text text-transparent">
                with friends?
              </span>
            </h2>
            <p className="mb-12 text-xl text-gray-300 leading-relaxed max-w-2xl mx-auto animate__animated animate__fadeIn animate__delay-1s">
              Join thousands of young investors who are already building wealth together on Peerfolio.
            </p>

            <div className="flex items-center justify-center space-x-8 mb-12 text-sm text-gray-400 animate__animated animate__fadeIn animate__delay-2s">
              <div className="flex items-center space-x-2">
                <CheckCircle className="h-5 w-5 text-emerald-400" />
                <span>Bank-level security</span>
              </div>
              <div className="flex items-center space-x-2">
                <CheckCircle className="h-5 w-5 text-emerald-400" />
                <span>Always free</span>
              </div>
              <div className="flex items-center space-x-2">
                <CheckCircle className="h-5 w-5 text-emerald-400" />
                <span>No ads, ever</span>
              </div>
            </div>

            <div className="animate__animated animate__fadeIn animate__delay-3s">
              <Link href="/waitlist">
                <Button size="lg" className="bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 hover:from-emerald-600 hover:via-emerald-700 hover:to-teal-700 text-white hover:text-white font-semibold shadow-xl">
                  <Sparkles className="w-5 h-5 mr-2" />
                  Join the Waitlist
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Simple Footer */}
      <footer className="border-t border-gray-100/50 bg-white/90 backdrop-blur-sm py-12 relative z-10 animate__animated animate__fadeIn">
        <div className="container px-6 max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between">
            <div className="flex items-center space-x-3 mb-4 md:mb-0">
              <Image
                src="/logo.png"
                alt="Peerfolio Logo"
                width={32}
                height={32}
                className="rounded-lg"
              />
              <span className="text-xl font-semibold text-gray-900">Peerfolio</span>
            </div>

            <div className="flex items-center space-x-8 text-sm text-gray-600">
              <a href="#" className="hover:text-gray-900 transition-colors">
                Privacy
              </a>
              <a href="#" className="hover:text-gray-900 transition-colors">
                Terms
              </a>
              <a href="#" className="hover:text-gray-900 transition-colors">
                Contact
              </a>
              <span>© 2025 Peerfolio</span>
            </div>
          </div>
        </div>
      </footer>

      {/* Toast Notification */}
      <Toast
        show={showToast}
        onClose={() => setShowToast(false)}
        message={toastMessage}
      />
    </div>
  )
}
