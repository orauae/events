"use client"

/**
 * @fileoverview Auth Page Layout - 2-column responsive layout for auth pages
 * 
 * Left column: Welcome message with event image from Unsplash
 * Right column: Auth form content
 * 
 * @module components/auth/auth-page-layout
 */

import Link from "next/link"
import type { ReactNode } from "react"

interface AuthPageLayoutProps {
  children: ReactNode
  title: string
  subtitle: string
}

export function AuthPageLayout({ children, title, subtitle }: AuthPageLayoutProps) {
  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        backgroundColor: "#FAFAFA",
      }}
    >
      {/* Left Column - Image & Welcome (hidden on mobile) */}
      <div
        className="auth-image-column"
        style={{
          flex: 1,
          position: "relative",
          overflow: "hidden",
          display: "none",
        }}
      >
        {/* Background Image */}
        <img
          src="https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1200&q=80"
          alt="Event venue with elegant lighting"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
        
        {/* Gradient Overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.4) 100%)",
          }}
        />

        {/* Content Overlay */}
        <div
          style={{
            position: "relative",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "48px",
            color: "white",
          }}
        >
          {/* Logo */}
          <Link 
            href="/" 
            style={{ 
              textDecoration: "none", 
              display: "inline-flex", 
              alignItems: "center", 
              gap: "12px",
            }}
          >
            <div 
              style={{ 
                width: "32px", 
                height: "32px", 
                backgroundColor: "#B8956B",
                borderRadius: "4px",
              }} 
            />
            <span 
              style={{ 
                fontSize: "28px", 
                fontWeight: 300, 
                letterSpacing: "0.15em", 
                color: "white",
              }}
            >
              EventOS
            </span>
          </Link>

          {/* Welcome Message */}
          <div style={{ maxWidth: "480px" }}>
            <h1 
              style={{ 
                fontSize: "42px", 
                fontWeight: 300, 
                lineHeight: 1.2,
                marginBottom: "16px",
                letterSpacing: "-0.01em",
              }}
            >
              {title}
            </h1>
            <p 
              style={{ 
                fontSize: "18px", 
                opacity: 0.9,
                lineHeight: 1.6,
              }}
            >
              {subtitle}
            </p>
          </div>

          {/* Testimonial or Feature */}
          <div 
            style={{ 
              padding: "24px",
              backgroundColor: "rgba(255,255,255,0.1)",
              backdropFilter: "blur(10px)",
              borderRadius: "12px",
              maxWidth: "400px",
            }}
          >
            <p style={{ fontSize: "15px", lineHeight: 1.6, marginBottom: "12px", fontStyle: "italic" }}>
              &ldquo;EventOS transformed how we manage our corporate events. The guest management 
              and check-in features are incredibly intuitive.&rdquo;
            </p>
            <p style={{ fontSize: "13px", opacity: 0.8 }}>
              — Sarah Chen, Events Director
            </p>
          </div>
        </div>
      </div>

      {/* Right Column - Form */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          minHeight: "100vh",
        }}
      >
        <div style={{ width: "100%", maxWidth: "420px" }}>
          {/* Mobile Logo (shown only on mobile) */}
          <div 
            className="auth-mobile-logo"
            style={{ 
              marginBottom: "32px", 
              textAlign: "center",
              display: "block",
            }}
          >
            <Link 
              href="/" 
              style={{ 
                textDecoration: "none", 
                display: "inline-flex", 
                alignItems: "center", 
                gap: "8px" 
              }}
            >
              <div style={{ width: "24px", height: "24px", backgroundColor: "#B8956B" }} />
              <h1 style={{ fontSize: "24px", fontWeight: 300, letterSpacing: "0.15em", color: "#2C2C2C" }}>
                EventOS
              </h1>
            </Link>
            <p style={{ fontSize: "14px", color: "#9A9A9A", marginTop: "8px" }}>
              Event Management Platform
            </p>
          </div>

          {/* Form Content */}
          {children}

          {/* Back to Home */}
          <div style={{ marginTop: "24px", textAlign: "center" }}>
            <Link href="/" style={{ fontSize: "14px", color: "#9A9A9A", textDecoration: "none" }}>
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>

      {/* Responsive Styles */}
      <style jsx global>{`
        @media (min-width: 1024px) {
          .auth-image-column {
            display: block !important;
          }
          .auth-mobile-logo {
            display: none !important;
          }
        }
      `}</style>
    </div>
  )
}

export default AuthPageLayout
