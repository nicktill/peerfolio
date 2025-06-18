"use client";

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { ArrowLeft, Sparkles, CheckCircle, Star, Mail, User, MessageSquare } from "lucide-react"
import { AnimatedGridPattern } from "@web/components/magicui/animated-grid-pattern"
import { AnimatedShinyText } from "@web/components/magicui/animated-shiny-text"
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

// Button component matching the landing page style
interface ButtonProps {
  children: React.ReactNode
  variant?: "default" | "secondary" | "ghost"
  size?: "default" | "lg"
  className?: string
  disabled?: boolean
  type?: "button" | "submit"
  [key: string]: any
}

const Button = ({ children, variant = "default", size = "default", className = "", disabled = false, ...props }: ButtonProps) => {
  const baseClasses =
    "inline-flex items-center justify-center font-medium transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
  const variants = {
    default: "bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg hover:shadow-xl focus:ring-emerald-500 rounded-full",
    secondary:
      "bg-white hover:bg-gray-50 text-gray-900 border border-gray-200 hover:border-gray-300 shadow-sm hover:shadow-md focus:ring-gray-500 rounded-full",
    ghost: "text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-full",
  }
  const sizes = {
    default: "px-6 py-3 text-sm",
    lg: "px-8 py-4 text-base",
  }

  return (
    <button 
      className={`${baseClasses} ${variants[variant]} ${sizes[size]} ${className}`} 
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  )
}

const Input = ({ className = "", ...props }: any) => (
  <input
    className={`flex h-12 w-full rounded-full border border-gray-200 bg-white px-4 py-3 text-base placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200 ${className}`}
    {...props}
  />
)

const Textarea = ({ className = "", ...props }: any) => (
  <textarea
    className={`flex min-h-[100px] w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-base placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200 resize-none ${className}`}
    {...props}
  />
)

const Badge = ({ children, className = "", ...props }: any) => (
  <div className={`inline-flex items-center rounded-full px-4 py-2 text-xs font-medium ${className}`} {...props}>
    {children}
  </div>
)

export default function WaitlistPage() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    note: ""
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showToast, setShowToast] = useState(false)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Show success toast
    setShowToast(true)
    
    // Reset form
    setFormData({ name: "", email: "", note: "" })
    setIsSubmitting(false)

    // Auto hide toast after 5 seconds
    setTimeout(() => setShowToast(false), 5000)
  }

  return (
    <div className="flex flex-col min-h-screen relative overflow-x-hidden">
      {/* Background matching landing page */}
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-50 via-white to-emerald-50/20" />
        
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
        
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gradient-to-r from-emerald-200/10 to-teal-200/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-gradient-to-r from-blue-200/10 to-purple-200/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-gray-100/50 bg-white/80 backdrop-blur-md relative animate__animated animate__fadeIn animate__faster">
        <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />
        <div className="container flex h-16 items-center justify-between px-6 max-w-6xl mx-auto">
          <div className="flex items-center space-x-3">
            <Link href="/" className="flex items-center space-x-3 group cursor-pointer">
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
            </Link>
          </div>

          <Link href="/">
            <Button variant="ghost" className="hover:bg-emerald-50 hover:text-emerald-600">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 relative z-10">
        <section className="relative py-16 md:py-24 bg-gradient-to-b from-transparent via-white/30 to-white/60 overflow-hidden">
          {/* Floating elements */}
          <div className="absolute top-20 left-10 w-20 h-20 bg-emerald-400/10 rounded-full blur-xl" />
          <div className="absolute top-40 right-20 w-16 h-16 bg-blue-400/10 rounded-full blur-xl" />
          <div className="absolute bottom-20 left-1/4 w-24 h-24 bg-purple-400/10 rounded-full blur-xl" />
          
          <div className="container relative px-6 max-w-2xl mx-auto">
            <div className="text-center mb-12">
              <Badge className="mb-6 bg-white/80 backdrop-blur-sm text-gray-700 border border-gray-200/50 shadow-lg animate__animated animate__fadeIn animate__faster">
                <Star className="w-3 h-3 mr-2 text-yellow-500" />
                Join 2,847+ early investors
              </Badge>

              <h1 className="mb-6 text-4xl md:text-5xl font-bold text-gray-900 leading-tight animate__animated animate__fadeIn animate__faster animate__delay-300ms">
                Join the{" "}
                <span className="bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 bg-clip-text text-transparent">
                  Waitlist
                </span>
              </h1>

              <p className="text-xl text-gray-600 leading-relaxed max-w-xl mx-auto animate__animated animate__fadeIn animate__faster animate__delay-500ms">
                Be the first to know when Peerfolio launches. Get early access and exclusive updates on the future of social investing.
              </p>
            </div>

            {/* Waitlist Form */}
            <div className="relative animate__animated animate__fadeIn animate__faster animate__delay-700ms">
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-100/30 to-blue-100/30 rounded-3xl blur-3xl" />
              <div className="relative bg-white/95 rounded-3xl p-8 shadow-2xl border border-gray-100 backdrop-blur-sm">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-4">
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                      <Input
                        type="text"
                        name="name"
                        placeholder="Your full name"
                        value={formData.name}
                        onChange={handleInputChange}
                        className="pl-12"
                        required
                      />
                    </div>

                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                      <Input
                        type="email"
                        name="email"
                        placeholder="your.email@example.com"
                        value={formData.email}
                        onChange={handleInputChange}
                        className="pl-12"
                        required
                      />
                    </div>

                    <div className="relative">
                      <MessageSquare className="absolute left-4 top-4 text-gray-400 w-5 h-5" />
                      <Textarea
                        name="note"
                        placeholder="Tell us what you're most excited about or what features you'd love to see (optional)"
                        value={formData.note}
                        onChange={handleInputChange}
                        className="pl-12"
                        rows={4}
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    size="lg"
                    className="w-full bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 hover:from-emerald-600 hover:via-emerald-700 hover:to-teal-700"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                        Joining...
                      </>
                    ) : (
                      <>
                        Join Waitlist
                        <Sparkles className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>

                  <p className="text-center text-sm text-gray-500">
                    Free forever • No spam • Early bird perks included
                  </p>
                </form>
              </div>
            </div>

            {/* Benefits Section */}
            <div className="mt-16 grid gap-6 md:grid-cols-3">
              <div className="text-center p-6 rounded-2xl bg-white/60 backdrop-blur-sm border border-gray-100 hover:bg-white/80 transition-all duration-300">
                <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="w-6 h-6 text-emerald-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">Early Access</h3>
                <p className="text-sm text-gray-600">Get exclusive early access before our public launch</p>
              </div>

              <div className="text-center p-6 rounded-2xl bg-white/60 backdrop-blur-sm border border-gray-100 hover:bg-white/80 transition-all duration-300">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Star className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">Premium Features</h3>
                <p className="text-sm text-gray-600">Free access to premium features for the first 6 months</p>
              </div>

              <div className="text-center p-6 rounded-2xl bg-white/60 backdrop-blur-sm border border-gray-100 hover:bg-white/80 transition-all duration-300">
                <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-6 h-6 text-purple-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">Shape the Future</h3>
                <p className="text-sm text-gray-600">Influence product development with your feedback</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Toast Notification */}
      <Toast
        show={showToast}
        onClose={() => setShowToast(false)}
        message="Thanks for joining our waitlist! We'll send you early access and updates soon! 🚀"
      />
    </div>
  )
}
