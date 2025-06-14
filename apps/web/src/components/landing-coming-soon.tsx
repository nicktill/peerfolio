"use client";

import { TrendingUp, Users, Link2, BarChart3, CheckCircle, Sparkles, Award } from "lucide-react"
import Image from "next/image"
import { BrokerageMarquee } from "./brokerage-marquee"
import { AnimatedGridPattern } from "./magicui/animated-grid-pattern"
import { DotPattern } from "./magicui/dot-pattern"
import { MorphingText } from "./magicui/morphing-text"
import { NumberTicker } from "./magicui/number-ticker"
import { AnimatedShinyText } from "./magicui/animated-shiny-text"
import { Particles } from "./magicui/particles"
import { cn } from "@web/lib/utils"

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
    "inline-flex items-center justify-center font-medium transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2"
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
    className={`rounded-2xl border border-gray-100 bg-white shadow-sm hover:shadow-lg hover:border-gray-200 transition-all duration-300 cursor-pointer ${className}`}
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
  return (
    <div className="flex flex-col min-h-screen relative overflow-x-hidden">
      {/* Subtle Global Background - Main Areas */}
      <div className="fixed inset-0 z-0">
        {/* Base gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-gray-50 via-white to-emerald-50/20" />
        
        {/* Subtle dot pattern for main areas */}
        <DotPattern
          className={cn(
            "absolute inset-0 h-full w-full opacity-[0.015]",
            "[mask-image:radial-gradient(800px_circle_at_center,white,transparent)]"
          )}
          width={24}
          height={24}
        />
        
        {/* Additional subtle dot pattern overlay */}
        <DotPattern
          className={cn(
            "absolute inset-0 h-full w-full opacity-[0.008]",
            "[mask-image:radial-gradient(1000px_circle_at_center,white,transparent)]"
          )}
          width={20}
          height={20}
        />
      </div>
      
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-gray-100/50 bg-white/80 backdrop-blur-md relative">
        <div className="container flex h-16 items-center justify-between px-6 max-w-6xl mx-auto">
          <div className="flex items-center space-x-3">
            <Image
              src="/logo.png"
              alt="Peerfolio Logo"
              width={36}
              height={36}
              className="rounded-lg"
            />
            <span className="text-xl font-semibold text-gray-900">Peerfolio</span>
          </div>

          <div className="flex items-center space-x-4">
            <Button variant="ghost" className="hidden md:inline-flex">
              Sign in
            </Button>
            <Button variant="dark">Get Started</Button>
          </div>
        </div>
      </header>

      <main className="flex-1 relative z-10">
        {/* Hero Section */}
        <section className="relative py-24 md:py-32 bg-gradient-to-b from-transparent via-white/30 to-white/60">
          <div className="container relative px-6 max-w-6xl mx-auto">
            <div className="mx-auto max-w-4xl text-center">
              <Badge className="mb-8 bg-gray-100 text-gray-700 border border-gray-200 animate__animated animate__fadeIn">
                <Award className="w-3 h-3 mr-2" />
                Trusted by 2,847+ investors
              </Badge>

            <h1 className="mb-8 font-bold tracking-tight animate__animated animate__fadeIn">
            <div className="text-5xl sm:text-6xl md:text-7xl text-gray-900 leading-none ml-4 sm:ml-6 md:ml-8">
                Track your{" "}
                <span className="ml-4 inline-block min-w-[280px] sm:min-w-[350px] md:min-w-[420px] text-left">
                <MorphingText 
                    texts={["investments", " budgeting", "retirement", "brokerages", "savings"]} 
                    className="inline-block align-baseline"
                />
                </span>
            </div>
            <div className="mt-2 text-5xl sm:text-6xl md:text-7xl leading-none">
                <span className="bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 bg-clip-text text-transparent">
                with friends
                </span>
            </div>
            </h1>

              <p className="mx-auto mb-12 max-w-2xl text-xl text-gray-600 leading-relaxed animate__animated animate__fadeIn animate__delay-1s">
                Peerfolio lets you compare portfolios, stay accountable, and grow wealth together. The social investment
                platform built for your generation.
              </p>

              <div className="mx-auto max-w-lg animate__animated animate__fadeInUp animate__delay-2s">
                <div className="flex gap-3 p-2 bg-white rounded-full shadow-xl border border-gray-100">
                  <Input
                    type="email"
                    placeholder="Enter your email"
                    className="flex-1 border-0 bg-transparent focus:ring-0 shadow-none"
                  />
                  <Button className="bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 hover:from-emerald-600 hover:via-emerald-700 hover:to-teal-700">Join Waitlist</Button>
                </div>
                <p className="mt-4 text-sm text-gray-500">Free forever • No credit card required</p>
              </div>
            </div>

            {/* Hero Visual - Portfolio Dashboard */}
            <div className="mx-auto max-w-6xl mt-20 animate__animated animate__fadeInUp animate__delay-3s">
              <div className="relative">
                {/* Add animated grid pattern specifically to this section */}
                <div className="absolute inset-0 rounded-3xl overflow-hidden">
                  <AnimatedGridPattern
                    numSquares={20}
                    maxOpacity={0.02}
                    duration={3}
                    repeatDelay={1}
                    className={cn(
                      "absolute inset-0 h-full w-full skew-y-12",
                      "[mask-image:radial-gradient(600px_circle_at_center,white,transparent)]"
                    )}
                  />
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-100/30 to-blue-100/30 rounded-3xl blur-3xl" />
                <div className="relative bg-white/95 rounded-3xl p-8 shadow-2xl border border-gray-100 backdrop-blur-sm">
                  {/* Dashboard Header */}
                  <div className="flex items-center justify-between mb-8 pb-6 border-b border-gray-100">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">Portfolio Performance</h3>
                      <p className="text-sm text-gray-500 flex items-center gap-2">
                        <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                        Stanford CS Group • 24 members online
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
                    <Card className="bg-gradient-to-r from-emerald-50 to-emerald-100 border-emerald-200 animate__animated animate__fadeIn animate__delay-1s">
                      <div className="p-6">
                        <div className="flex items-center justify-between mb-4">
                          <div className="h-12 w-12 rounded-xl bg-emerald-500 flex items-center justify-center shadow-lg">
                            <TrendingUp className="h-6 w-6 text-white" />
                          </div>
                          <Badge className="bg-emerald-500 text-white border-0 shadow-sm">🏆 Top 10%</Badge>
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

                    <Card className="bg-gradient-to-r from-blue-50 to-blue-100 border-blue-200 ring-2 ring-blue-200 animate__animated animate__fadeIn animate__delay-1s">
                      <div className="p-6">
                        <div className="flex items-center justify-between mb-4">
                          <div className="h-12 w-12 rounded-xl bg-blue-500 flex items-center justify-center shadow-lg">
                            <BarChart3 className="h-6 w-6 text-white" />
                          </div>
                          <Badge className="bg-blue-500 text-white border-0 shadow-sm">📈 +8.7%</Badge>
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

                    <Card className="bg-gradient-to-r from-purple-50 to-purple-100 border-purple-200 animate__animated animate__fadeIn animate__delay-1s">
                      <div className="p-6">
                        <div className="flex items-center justify-between mb-4">
                          <div className="h-12 w-12 rounded-xl bg-purple-500 flex items-center justify-center shadow-lg">
                            <Users className="h-6 w-6 text-white" />
                          </div>
                          <Badge className="bg-purple-500 text-white border-0 shadow-sm">🔥 Active</Badge>
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
                        Live data • Updated 2 mins ago
                      </span>
                      <span>🎯 Goal: Beat market by 5%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Brokerage Partners Marquee */}
        <BrokerageMarquee />

        {/* Features Section */}
        <section className="py-24 md:py-32 bg-white/60 backdrop-blur-sm relative">
          <div className="container px-6 max-w-6xl mx-auto">
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

            <div className="grid gap-12 md:grid-cols-3">
              <div className="text-center animate__animated animate__fadeIn animate__delay-1s">
                <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-900 shadow-lg mx-auto">
                  <Link2 className="h-8 w-8 text-white" />
                </div>
                <h3 className="mb-4 text-xl font-semibold text-gray-900">Connect all your accounts</h3>
                <p className="text-gray-600 leading-relaxed mb-6">
                  Securely link your brokerage accounts through Plaid. Support for Robinhood, Fidelity, Charles Schwab,
                  and 12,000+ institutions.
                </p>
                <div className="text-sm text-gray-500">
                  <div className="flex items-center justify-center space-x-4">
                    <AnimatedShinyText className="text-emerald-600">
                      • Bank-level security
                    </AnimatedShinyText>
                    <span>• Real-time sync</span>
                  </div>
                </div>
              </div>

              <div className="text-center animate__animated animate__fadeIn animate__delay-2s">
                <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-900 shadow-lg mx-auto">
                  <Users className="h-8 w-8 text-white" />
                </div>
                <h3 className="mb-4 text-xl font-semibold text-gray-900">Group investing</h3>
                <p className="text-gray-600 leading-relaxed mb-6">
                  Create groups with friends or join curated communities. Compare performance side-by-side and stay
                  motivated with friendly competition.
                </p>
                <div className="text-sm text-gray-500">
                  <div className="flex items-center justify-center space-x-4">
                    <span>• University groups</span>
                    <span>• Anonymous rankings</span>
                  </div>
                </div>
              </div>

              <div className="text-center animate__animated animate__fadeIn animate__delay-3s">
                <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-900 shadow-lg mx-auto">
                  <BarChart3 className="h-8 w-8 text-white" />
                </div>
                <h3 className="mb-4 text-xl font-semibold text-gray-900">Portfolio growth insights</h3>
                <p className="text-gray-600 leading-relaxed mb-6">
                  See how your gains compare over time with beautiful charts and insights. Track your progress and learn
                  from top performers.
                </p>
                <div className="text-sm text-gray-500">
                  <div className="flex items-center justify-center space-x-4">
                    <span>• Performance analytics</span>
                    <span>• Growth tracking</span>
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
            {/* Rotated grid pattern */}
            <div className="absolute inset-0 w-full h-full transform -skew-y-12 origin-top-left scale-110">
              <AnimatedGridPattern
                numSquares={30}
                maxOpacity={0.05}
                duration={3}
                repeatDelay={1}
                className={cn(
                  "absolute inset-0 h-full w-full",
                  "[mask-image:radial-gradient(1000px_circle_at_center,white,transparent)]"
                )}
              />
            </div>
            {/* Subtle white particles */}
            <Particles
              className="absolute inset-0 opacity-10"
              quantity={40}
              ease={100}
              color="#ffffff"
              refresh
            />
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
              <Button size="lg" className="bg-white text-gray-900 hover:bg-gray-100 shadow-xl">
                <Sparkles className="w-5 h-5 mr-2" />
                Join the Waitlist
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* Simple Footer */}
      <footer className="border-t border-gray-100/50 bg-white/90 backdrop-blur-sm py-12 relative z-10">
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
    </div>
  )
}
