"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Calendar, Users, Mail, Zap, CheckCircle } from "lucide-react"
import { ORADivider, ORAFooter } from "@/components/ui/ora-brand"

const roles = [
  {
    id: 'organizer',
    title: 'Event Organizer',
    description: 'Create and manage events, track RSVPs, and engage with your guests seamlessly',
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
      </svg>
    ),
    href: '/events',
    features: ['Event Creation', 'Guest Management', 'Email Campaigns', 'Analytics'],
  },
  {
    id: 'manager',
    title: 'Event Manager',
    description: 'Handle check-ins, manage on-site operations, and coordinate event logistics',
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
      </svg>
    ),
    href: '/events',
    features: ['QR Check-in', 'Badge Printing', 'Real-time Updates', 'Guest Search'],
  },
  {
    id: 'guest',
    title: 'Guest',
    description: 'Browse events, RSVP to invitations, and access your event tickets',
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    ),
    href: '/events/browse',
    features: ['Event Discovery', 'Easy RSVP', 'Digital Tickets', 'Event Updates'],
  },
]

const features = [
  {
    icon: Calendar,
    title: "Event Management",
    description: "Create and manage events with ease. Track RSVPs, check-ins, and guest engagement.",
  },
  {
    icon: Users,
    title: "Guest Database",
    description: "Centralized contact management with tagging, segmentation, and detailed profiles.",
  },
  {
    icon: Mail,
    title: "Email Campaigns",
    description: "Design beautiful invitations and reminders with our visual email builder.",
  },
  {
    icon: Zap,
    title: "Automations",
    description: "Set up workflows that trigger based on RSVPs, check-ins, and guest actions.",
  },
]

const benefits = [
  "Streamlined guest check-in with QR codes",
  "Real-time analytics and reporting",
  "Customizable email templates",
  "Role-based access control",
  "Badge generation for attendees",
  "Multi-event management",
]

export default function HomePage() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div style={{ minHeight: '100vh', width: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#FAFAFA' }}>
      {/* Header */}
      <header className="glass-effect" style={{ 
        position: 'fixed', 
        top: 0, 
        left: 0, 
        right: 0, 
        zIndex: 50, 
        borderBottom: '1px solid #E8E4DF'
      }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
            <div style={{ width: '24px', height: '24px', backgroundColor: '#B8956B' }} />
            <span style={{ fontSize: '18px', fontWeight: 300, letterSpacing: '0.15em', color: '#2C2C2C' }}>EventOS</span>
          </Link>
          <nav style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            <Link href="/events/browse" style={{ fontSize: '14px', color: '#6B6B6B', textDecoration: 'none' }}>
              Browse Events
            </Link>
            <Link href="/about" style={{ fontSize: '14px', color: '#6B6B6B', textDecoration: 'none' }}>
              About
            </Link>
            <Link
              href="/login"
              style={{
                padding: '10px 24px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#2C2C2C',
                border: '1px solid #D4CFC8',
                borderRadius: '9999px',
                textDecoration: 'none',
              }}
            >
              Sign In
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section style={{ position: 'relative', paddingTop: '160px', paddingBottom: '80px', width: '100%' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', textAlign: 'center', padding: '0 24px' }}>
          <div style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(16px)', transition: 'all 1s' }}>
            <p style={{ color: '#B8956B', textTransform: 'uppercase', letterSpacing: '0.3em', fontSize: '12px', marginBottom: '24px' }}>
              Welcome to
            </p>
            <h1 style={{ fontSize: '72px', fontWeight: 300, letterSpacing: '0.1em', color: '#2C2C2C', marginBottom: '24px' }}>
              EventOS
            </h1>
            <div style={{ width: '64px', height: '2px', backgroundColor: '#B8956B', margin: '0 auto 24px' }} />
            <p style={{ fontSize: '20px', color: '#6B6B6B', fontWeight: 300, letterSpacing: '0.02em', maxWidth: '600px', margin: '0 auto', lineHeight: 1.7 }}>
              A premium event management platform for creating memorable experiences. 
              From invitations to check-in, we&apos;ve got you covered.
            </p>
          </div>

          {/* CTA Buttons */}
          <div style={{ marginTop: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', flexWrap: 'wrap', opacity: mounted ? 1 : 0, transition: 'all 1s 0.3s' }}>
            <Link
              href="/login"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '14px 32px',
                backgroundColor: '#2C2C2C',
                color: '#FAFAFA',
                fontSize: '14px',
                fontWeight: 500,
                letterSpacing: '0.02em',
                borderRadius: '9999px',
                textDecoration: 'none',
              }}
            >
              Sign In to Your Account
            </Link>
            <a
              href="#roles"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '14px 32px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#2C2C2C',
                letterSpacing: '0.02em',
                textDecoration: 'none'
              }}
            >
              Explore Portals ↓
            </a>
          </div>
        </div>
      </section>

      {/* Divider */}
      <ORADivider className="max-w-xl mx-auto" />

      {/* Role Selection Section */}
      <section id="roles" style={{ padding: '80px 24px', width: '100%' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '64px' }}>
            <p style={{ color: '#B8956B', textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: '12px', marginBottom: '16px' }}>
              Access Your Portal
            </p>
            <h2 style={{ fontSize: '36px', fontWeight: 300, letterSpacing: '0.02em', color: '#2C2C2C', marginBottom: '16px' }}>
              Choose Your Role
            </h2>
            <p style={{ color: '#9A9A9A', maxWidth: '500px', margin: '0 auto' }}>
              Select your portal to access role-specific features and dashboards
            </p>
          </div>

          {/* Role Cards Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
            {roles.map((role) => (
              <Link
                key={role.id}
                href={role.href}
                className="card-luxury"
                style={{
                  display: 'block',
                  backgroundColor: 'white',
                  border: '1px solid #E8E4DF',
                  borderRadius: '16px',
                  padding: '32px',
                  textDecoration: 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '24px' }}>
                  <div style={{ 
                    flexShrink: 0, 
                    width: '56px', 
                    height: '56px', 
                    borderRadius: '12px', 
                    backgroundColor: '#F5F3F0', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    color: '#B8956B' 
                  }}>
                    {role.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: '20px', fontWeight: 300, letterSpacing: '0.02em', color: '#2C2C2C', marginBottom: '8px' }}>
                      {role.title}
                    </h3>
                    <p style={{ fontSize: '14px', color: '#9A9A9A', marginBottom: '16px', lineHeight: 1.6 }}>
                      {role.description}
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {role.features.map((feature) => (
                        <span
                          key={feature}
                          style={{
                            fontSize: '12px',
                            padding: '4px 12px',
                            backgroundColor: '#F5F3F0',
                            color: '#6B6B6B',
                            borderRadius: '9999px'
                          }}
                        >
                          {feature}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>


      {/* Features Section */}
      <section style={{ padding: '80px 24px', backgroundColor: '#F5F3F0', width: '100%' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '64px' }}>
            <p style={{ color: '#B8956B', textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: '12px', marginBottom: '16px' }}>
              Why EventOS
            </p>
            <h2 style={{ fontSize: '36px', fontWeight: 300, letterSpacing: '0.02em', color: '#2C2C2C' }}>
              Everything You Need for Successful Events
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '32px' }}>
            {features.map((feature) => (
              <div key={feature.title} style={{ textAlign: 'center' }}>
                <div style={{ 
                  width: '48px', 
                  height: '48px', 
                  borderRadius: '50%', 
                  backgroundColor: 'rgba(184, 149, 107, 0.1)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  color: '#B8956B', 
                  margin: '0 auto 16px' 
                }}>
                  <feature.icon className="w-6 h-6 stroke-1" />
                </div>
                <h3 style={{ fontSize: '18px', fontWeight: 300, letterSpacing: '0.02em', color: '#2C2C2C', marginBottom: '8px' }}>
                  {feature.title}
                </h3>
                <p style={{ fontSize: '14px', color: '#9A9A9A', lineHeight: 1.6 }}>
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section style={{ padding: '80px 24px', width: '100%' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ display: 'grid', gap: '48px', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))' }}>
            <div>
              <p style={{ color: '#B8956B', textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: '12px', marginBottom: '16px' }}>
                Built for Excellence
              </p>
              <h2 style={{ fontSize: '36px', fontWeight: 300, letterSpacing: '0.02em', color: '#2C2C2C', marginBottom: '16px' }}>
                Modern Event Management
              </h2>
              <p style={{ color: '#9A9A9A', marginBottom: '32px', lineHeight: 1.7 }}>
                Whether you&apos;re organizing conferences, corporate events, or private gatherings, 
                EventOS provides the tools you need to create memorable experiences.
              </p>
              <Link
                href="/signup"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '14px 32px',
                  backgroundColor: '#2C2C2C',
                  color: '#FAFAFA',
                  fontSize: '14px',
                  fontWeight: 500,
                  letterSpacing: '0.02em',
                  borderRadius: '9999px',
                  textDecoration: 'none',
                }}
              >
                Start Managing Events
              </Link>
            </div>
            <div style={{ display: 'grid', gap: '16px' }}>
              {benefits.map((benefit) => (
                <div key={benefit} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <CheckCircle className="w-5 h-5 stroke-1 text-ora-gold flex-shrink-0" />
                  <span style={{ color: '#2C2C2C' }}>{benefit}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section style={{ padding: '80px 24px', width: '100%' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', textAlign: 'center' }}>
          <p style={{ color: '#B8956B', textTransform: 'uppercase', letterSpacing: '0.3em', fontSize: '12px', marginBottom: '24px' }}>
            ORA · UAE
          </p>
          <h2 style={{ fontSize: '32px', fontWeight: 300, letterSpacing: '0.02em', color: '#2C2C2C', marginBottom: '16px' }}>
            Ready to Transform Your Events?
          </h2>
          <p style={{ color: '#9A9A9A', maxWidth: '500px', margin: '0 auto 32px' }}>
            Join event organizers who trust EventOS to deliver exceptional guest experiences
          </p>
          <Link
            href="/signup"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '14px 32px',
              backgroundColor: '#2C2C2C',
              color: '#FAFAFA',
              fontSize: '14px',
              fontWeight: 500,
              letterSpacing: '0.02em',
              borderRadius: '9999px',
              textDecoration: 'none',
            }}
          >
            Get Started Free
          </Link>
        </div>
      </section>

      {/* Footer */}
      <div style={{ marginTop: 'auto', maxWidth: '1200px', margin: '0 auto', width: '100%', padding: '0 24px' }}>
        <ORAFooter />
      </div>
    </div>
  )
}
