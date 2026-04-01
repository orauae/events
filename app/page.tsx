"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { signIn } from "@/lib/auth-client"
import { toast } from "sonner"

export default function HomePage() {
  const router = useRouter()
  const [hasUsers, setHasUsers] = useState<boolean | null>(null)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/setup/check")
      .then((r) => r.json())
      .then((data) => setHasUsers(data.hasUsers))
      .catch(() => setHasUsers(false))
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    try {
      const result = await signIn.email({ email, password })
      if (result.error) {
        setError("Invalid email or password.")
        setIsLoading(false)
        return
      }
      toast.success("Signed in")
      try {
        const res = await fetch("/api/me")
        if (res.ok) {
          const data = await res.json()
          router.push(data.role === "Admin" ? "/admin" : "/events")
        } else {
          router.push("/events")
        }
      } catch {
        router.push("/events")
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.")
      setIsLoading(false)
    }
  }

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Setup failed.")
        setIsLoading(false)
        return
      }
      const signInResult = await signIn.email({ email, password })
      if (signInResult.error) {
        toast.success("Account created. Please sign in.")
        setHasUsers(true)
        setName("")
        setPassword("")
        setIsLoading(false)
        return
      }
      toast.success("Welcome to ORA Events")
      router.push("/admin")
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed.")
      setIsLoading(false)
    }
  }

  const isSetup = hasUsers === false

  // Loading state
  if (hasUsers === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA]">
        <img src="/ora-logo-greyer.png" alt="ORA" width={120} height={120} style={{ opacity: 0.5 }} />
      </div>
    )
  }

  return (
    <div className="min-h-screen w-full flex bg-[#FAFAFA]">
      {/* Left Column - Form */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center px-6 py-12 min-h-screen">
        <div className="w-full max-w-[400px]">
          {/* Logo */}
          <div className="mb-10">
            <img src="/ora-logo-greyer.png" alt="ORA" width={100} height={100} />
          </div>

          {/* Heading */}
          <h1 className="text-3xl font-light text-[#2C2C2C] mb-2 tracking-tight">
            {isSetup ? "Get Started" : "Sign In"}
          </h1>
          <p className="text-sm text-[#9A9A9A] mb-8">
            {isSetup
              ? "Create your admin account to set up ORA Events."
              : "Sign in to manage your events and guests."}
          </p>

          {/* Error */}
          {error && (
            <div
              role="alert"
              aria-live="polite"
              className="mb-5 px-4 py-3 rounded-lg text-sm"
              style={{ backgroundColor: "rgba(184, 92, 92, 0.1)", color: "#B85C5C" }}
            >
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={isSetup ? handleSetup : handleLogin} className="space-y-5">
            {isSetup && (
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-[#4A4A4A] mb-2">
                  Full Name
                </label>
                <input
                  type="text"
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  placeholder="Your name"
                  required
                  disabled={isLoading}
                  className="w-full px-4 py-3 text-sm border border-[#E8E4DF] rounded-lg bg-white text-[#2C2C2C] outline-none focus:border-[#B8956B] transition-colors"
                />
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-[#4A4A4A] mb-2">
                Email
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="Enter your email"
                required
                disabled={isLoading}
                className="w-full px-4 py-3 text-sm border border-[#E8E4DF] rounded-lg bg-white text-[#2C2C2C] outline-none focus:border-[#B8956B] transition-colors"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-[#4A4A4A] mb-2">
                Password
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={isSetup ? "new-password" : "current-password"}
                placeholder="••••••••"
                required
                minLength={isSetup ? 8 : undefined}
                disabled={isLoading}
                className="w-full px-4 py-3 text-sm border border-[#E8E4DF] rounded-lg bg-white text-[#2C2C2C] outline-none focus:border-[#B8956B] transition-colors"
              />
              {isSetup && (
                <p className="mt-1.5 text-xs text-[#9A9A9A]">Must be at least 8 characters</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              aria-busy={isLoading}
              className="w-full py-3.5 text-sm font-medium text-white rounded-lg flex items-center justify-center gap-2 transition-colors"
              style={{ backgroundColor: isLoading ? "#6B6B6B" : "#2C2C2C", cursor: isLoading ? "not-allowed" : "pointer" }}
            >
              {isLoading && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="animate-spin">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="32" strokeDashoffset="12" />
                </svg>
              )}
              {isLoading
                ? isSetup ? "Creating account..." : "Signing in..."
                : isSetup ? "Create Admin Account" : "Sign In"
              }
            </button>
          </form>

          {/* Footer */}
          <p className="text-center mt-10 text-xs text-[#BCBCBC] tracking-widest uppercase">
            ORA · UAE
          </p>
        </div>
      </div>

      {/* Right Column - Image (hidden on mobile) */}
      <div className="hidden lg:block lg:w-1/2 relative">
        <img
          src="/uploads/ora-event.jpg"
          alt="ORA Events"
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-black/30" />
        {/* Bottom text */}
        <div className="absolute bottom-12 left-12 right-12 text-white">
          <h2 className="text-4xl font-light tracking-tight mb-3">
            Crafting Memorable Experiences
          </h2>
          <p className="text-sm text-white/80 leading-relaxed">
            Manage your events, guests, and campaigns — all in one place.
          </p>
        </div>
      </div>
    </div>
  )
}
