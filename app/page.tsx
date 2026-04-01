"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { signIn } from "@/lib/auth-client"
import { toast } from "sonner"
import Image from "next/image"

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
      // Auto sign-in after setup
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

  if (hasUsers === null) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#FAFAFA" }}>
        <div style={{ textAlign: "center" }}>
          <Image src="/ora-logo-greyer.png" alt="ORA" width={120} height={120} style={{ margin: "0 auto", opacity: 0.5 }} />
        </div>
      </div>
    )
  }

  const isSetup = !hasUsers

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#FAFAFA", padding: "24px" }}>
      <div style={{ width: "100%", maxWidth: "400px" }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <Image src="/ora-logo-greyer.png" alt="ORA" width={160} height={160} style={{ margin: "0 auto" }} priority />
          <p style={{ fontSize: "13px", color: "#9A9A9A", marginTop: "12px", letterSpacing: "0.15em", textTransform: "uppercase" }}>
            Event Management
          </p>
        </div>

        {/* Card */}
        <div style={{ backgroundColor: "white", borderRadius: "16px", padding: "32px", border: "1px solid #E8E4DF" }}>
          {isSetup && (
            <p style={{ fontSize: "14px", color: "#B8956B", marginBottom: "20px", textAlign: "center" }}>
              Create your admin account to get started
            </p>
          )}

          {error && (
            <div role="alert" aria-live="polite" style={{ marginBottom: "16px", padding: "12px 16px", backgroundColor: "rgba(184, 92, 92, 0.1)", borderRadius: "8px", fontSize: "14px", color: "#B85C5C" }}>
              {error}
            </div>
          )}

          <form onSubmit={isSetup ? handleSetup : handleLogin}>
            {isSetup && (
              <div style={{ marginBottom: "16px" }}>
                <label htmlFor="name" style={{ display: "block", fontSize: "14px", fontWeight: 500, color: "#4A4A4A", marginBottom: "8px" }}>
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
                  style={{ width: "100%", padding: "12px 16px", fontSize: "14px", border: "1px solid #E8E4DF", borderRadius: "8px", backgroundColor: "white", color: "#2C2C2C", outline: "none", boxSizing: "border-box" }}
                />
              </div>
            )}

            <div style={{ marginBottom: "16px" }}>
              <label htmlFor="email" style={{ display: "block", fontSize: "14px", fontWeight: 500, color: "#4A4A4A", marginBottom: "8px" }}>
                Email address
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="you@example.com"
                required
                disabled={isLoading}
                style={{ width: "100%", padding: "12px 16px", fontSize: "14px", border: "1px solid #E8E4DF", borderRadius: "8px", backgroundColor: "white", color: "#2C2C2C", outline: "none", boxSizing: "border-box" }}
              />
            </div>

            <div style={{ marginBottom: "24px" }}>
              <label htmlFor="password" style={{ display: "block", fontSize: "14px", fontWeight: 500, color: "#4A4A4A", marginBottom: "8px" }}>
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
                style={{ width: "100%", padding: "12px 16px", fontSize: "14px", border: "1px solid #E8E4DF", borderRadius: "8px", backgroundColor: "white", color: "#2C2C2C", outline: "none", boxSizing: "border-box" }}
              />
              {isSetup && (
                <p style={{ marginTop: "4px", fontSize: "12px", color: "#9A9A9A" }}>Must be at least 8 characters</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              aria-busy={isLoading}
              style={{
                width: "100%",
                padding: "14px 24px",
                fontSize: "14px",
                fontWeight: 500,
                color: "white",
                backgroundColor: isLoading ? "#6B6B6B" : "#2C2C2C",
                border: "none",
                borderRadius: "8px",
                cursor: isLoading ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
            >
              {isLoading && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ animation: "spin 1s linear infinite" }}>
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="32" strokeDashoffset="12" />
                </svg>
              )}
              {isLoading
                ? isSetup ? "Creating account..." : "Signing in..."
                : isSetup ? "Create Admin Account" : "Sign In"
              }
            </button>
          </form>
        </div>

        <p style={{ textAlign: "center", marginTop: "24px", fontSize: "12px", color: "#BCBCBC", letterSpacing: "0.1em" }}>
          ORA · UAE
        </p>
      </div>
    </div>
  )
}
