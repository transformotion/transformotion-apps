"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { useAuthStore } from "@/stores/auth/use-auth-store"
import { Wordmark } from "@/components/brand/wordmark"
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  HelpCircle,
} from "lucide-react"
import { Spinner } from "@/components/ui/spinner"

// Social provider icons (inline SVG for consistent styling)
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

function MicrosoftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.4 11.4H2V2h9.4v9.4z" fill="#F35325"/>
      <path d="M22 11.4h-9.4V2H22v9.4z" fill="#81BC06"/>
      <path d="M11.4 22H2v-9.4h9.4V22z" fill="#05A6F0"/>
      <path d="M22 22h-9.4v-9.4H22V22z" fill="#FFBA08"/>
    </svg>
  )
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="#1877F2">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  )
}

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
    </svg>
  )
}

// Components
function SocialButton({ 
  provider, 
  icon: Icon, 
  disabled = false,
  onClick 
}: { 
  provider: string
  icon: React.ComponentType<{ className?: string }>
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center justify-center gap-3 w-full h-12 rounded-xl border transition-all",
        "font-medium text-sm",
        disabled
          ? "bg-surface2/50 border-border/50 text-muted-foreground cursor-not-allowed opacity-50"
          : "bg-card border-border hover:border-primary/30 hover:bg-surface2 text-foreground"
      )}
    >
      <Icon className="size-5" />
      <span>Continue with {provider}</span>
      {disabled && <span className="text-xs text-muted-foreground">(Coming soon)</span>}
    </button>
  )
}

function Divider() {
  return (
    <div className="flex items-center gap-4 my-6">
      <div className="flex-1 h-px bg-border" />
      <span className="text-xs text-muted-foreground">or continue with email</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  )
}

function EmailForm({
  onSubmit,
  isLoading,
  error,
  onForgotPassword,
  onForgotProvider
}: {
  onSubmit: (email: string, password: string) => void
  isLoading: boolean
  error?: string | null
  onForgotPassword: () => void
  onForgotProvider: () => void
}) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(email, password)
  }
  
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Email */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">
          Email address
        </label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            className={cn(
              "w-full h-12 pl-11 pr-4 bg-card border border-border rounded-xl",
              "text-foreground placeholder:text-muted-foreground",
              "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary",
              "transition-all"
            )}
          />
        </div>
      </div>
      
      {/* Password */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-sm font-medium text-foreground">
            Password
          </label>
          <button
            type="button"
            onClick={onForgotPassword}
            className="text-xs text-primary hover:text-primary/80 transition-colors"
          >
            Forgot password?
          </button>
        </div>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
          <input
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            required
            className={cn(
              "w-full h-12 pl-11 pr-12 bg-card border border-border rounded-xl",
              "text-foreground placeholder:text-muted-foreground",
              "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary",
              "transition-all"
            )}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-surface2 rounded-lg transition-colors"
          >
            {showPassword ? (
              <EyeOff className="size-5 text-muted-foreground" />
            ) : (
              <Eye className="size-5 text-muted-foreground" />
            )}
          </button>
        </div>
      </div>
      
      {/* Auth error */}
      {error && (
        <p className="text-sm text-red-400 text-center -mb-1">{error}</p>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={isLoading}
        className={cn(
          "w-full h-12 rounded-xl font-medium transition-all flex items-center justify-center gap-2",
          "bg-primary text-primary-foreground shadow-lg shadow-primary/25",
          "hover:bg-primary/90 active:scale-[0.98]",
          "disabled:opacity-70 disabled:cursor-not-allowed disabled:active:scale-100"
        )}
      >
        {isLoading ? (
          <Spinner className="size-5" />
        ) : (
          <>
            Sign in
            <ArrowRight className="size-4" />
          </>
        )}
      </button>
      
      {/* Forgot provider link */}
      <button
        type="button"
        onClick={onForgotProvider}
        className="w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <HelpCircle className="size-4" />
        Forgot how you signed in?
      </button>
    </form>
  )
}

function ForgotProviderModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const [email, setEmail] = useState("")
  const [submitted, setSubmitted] = useState(false)
  
  if (!isOpen) return null
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
  }
  
  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md p-6 bg-card border border-border rounded-2xl shadow-2xl z-50">
        <h3 className="text-lg font-semibold text-foreground mb-2">
          Forgot how you signed in?
        </h3>
        
        {submitted ? (
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              We&apos;ve sent a hint to <span className="text-foreground font-medium">{email}</span> about which sign-in method you used.
            </p>
            <button
              onClick={() => {
                onClose()
                setSubmitted(false)
                setEmail("")
              }}
              className="mt-4 w-full h-10 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <p className="text-sm text-muted-foreground mb-4">
              Enter your email and we&apos;ll send you a hint about which provider you used to sign in.
            </p>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className={cn(
                "w-full h-11 px-4 bg-surface2 border border-border rounded-lg mb-4",
                "text-foreground placeholder:text-muted-foreground",
                "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              )}
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 h-10 bg-surface2 text-foreground rounded-lg font-medium hover:bg-surface2/80 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 h-10 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
              >
                Send hint
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  )
}

function Footer({ onCreateAccount }: { onCreateAccount: () => void }) {
  return (
    <div className="text-center mt-8">
      <p className="text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <button
          onClick={onCreateAccount}
          className="text-primary hover:text-primary/80 font-medium transition-colors"
        >
          Create one
        </button>
      </p>
    </div>
  )
}

// Main Sign In Component
export function SignIn({ onSignIn }: { onSignIn?: () => void }) {
  const [forgotProviderOpen, setForgotProviderOpen] = useState(false)
  const [showCreateAccount, setShowCreateAccount] = useState(false)
  const { signIn, isLoading, error, clearError } = useAuthStore()

  const handleEmailSignIn = async (email: string, password: string) => {
    clearError()
    try {
      await signIn(email, password)
      onSignIn?.()
    } catch {
      // error is already set in the store — displayed via the error prop below
    }
  }

  const handleSocialSignIn = (provider: string) => {
    // Social login not yet implemented — placeholder
    console.log('Social sign-in:', provider)
  }
  
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header decorative gradient */}
      <div className="absolute top-0 left-0 right-0 h-64 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
      
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md sm:max-w-lg lg:max-w-xl">
          {/* Logo */}
          <div className="text-center mb-6 sm:mb-8">
            <div className="flex justify-center mb-4 sm:mb-6">
              <Wordmark size="lg" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-1">
              Welcome back
            </h1>
            <p className="text-muted-foreground">
              Sign in to access your dashboard
            </p>
          </div>
          
          {/* Card */}
          <div className="bg-card border border-border rounded-2xl p-5 sm:p-6 shadow-xl shadow-black/5">
            {/* Social providers - 2x2 grid on desktop */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <SocialButton
                provider="Google"
                icon={GoogleIcon}
                onClick={() => handleSocialSignIn("Google")}
              />
              <SocialButton
                provider="Microsoft"
                icon={MicrosoftIcon}
                onClick={() => handleSocialSignIn("Microsoft")}
              />
              <SocialButton
                provider="Facebook"
                icon={FacebookIcon}
                onClick={() => handleSocialSignIn("Facebook")}
              />
              <SocialButton
                provider="Apple"
                icon={AppleIcon}
                disabled
                onClick={() => {}}
              />
            </div>
            
            <Divider />
            
            {/* Email form */}
            <EmailForm
              onSubmit={handleEmailSignIn}
              isLoading={isLoading}
              error={error}
              onForgotPassword={() => {}}
              onForgotProvider={() => setForgotProviderOpen(true)}
            />
          </div>
          
          <Footer onCreateAccount={() => setShowCreateAccount(true)} />
        </div>
      </main>
      
      {/* Tagline footer */}
      <footer className="py-6 text-center">
        <p className="text-xs text-muted-foreground">
          Putting your business transformation into motion
        </p>
      </footer>
      
      <ForgotProviderModal
        isOpen={forgotProviderOpen}
        onClose={() => setForgotProviderOpen(false)}
      />
    </div>
  )
}
