"use client"

import Link from "next/link"
import { ArrowLeft, Calendar, Users, Mail, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-ora-white">
      {/* Header */}
      <header className="border-b border-ora-sand">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <div className="h-8 w-8 bg-ora-gold" />
            <span className="text-xl font-semibold text-ora-charcoal">EventOS</span>
          </Link>
          <nav className="hidden items-center gap-6 md:flex">
            <Link href="/events/browse" className="text-sm font-medium text-ora-graphite hover:text-ora-charcoal">
              Browse Events
            </Link>
            <Link href="/about" className="text-sm font-medium text-ora-charcoal">
              About
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost">Sign In</Button>
            </Link>
            <Link href="/signup">
              <Button>Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Back link */}
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm text-ora-graphite hover:text-ora-charcoal"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>

        {/* Content */}
        <div className="prose prose-lg max-w-none">
          <h1 className="text-4xl font-semibold text-ora-charcoal">About EventOS</h1>
          
          <p className="mt-6 text-lg text-ora-graphite">
            EventOS is an intelligent event engagement and automation platform designed to help 
            organizers create memorable experiences for their guests. From the first invitation 
            to post-event follow-up, we provide the tools you need to manage every aspect of 
            your events.
          </p>

          <h2 className="mt-12 text-2xl font-semibold text-ora-charcoal">Our Mission</h2>
          <p className="mt-4 text-ora-graphite">
            We believe that great events start with great organization. Our mission is to 
            simplify event management so organizers can focus on what matters most: creating 
            meaningful connections and unforgettable experiences.
          </p>

          <h2 className="mt-12 text-2xl font-semibold text-ora-charcoal">What We Offer</h2>
          
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            <div className="border border-ora-sand p-6">
              <Calendar className="h-8 w-8 text-ora-gold" />
              <h3 className="mt-4 text-lg font-semibold text-ora-charcoal">Event Management</h3>
              <p className="mt-2 text-sm text-ora-graphite">
                Create and manage multiple events with detailed tracking of RSVPs, 
                check-ins, and guest engagement metrics.
              </p>
            </div>
            
            <div className="border border-ora-sand p-6">
              <Users className="h-8 w-8 text-ora-gold" />
              <h3 className="mt-4 text-lg font-semibold text-ora-charcoal">Guest Database</h3>
              <p className="mt-2 text-sm text-ora-graphite">
                Maintain a centralized contact database with tagging, segmentation, 
                and detailed guest profiles.
              </p>
            </div>
            
            <div className="border border-ora-sand p-6">
              <Mail className="h-8 w-8 text-ora-gold" />
              <h3 className="mt-4 text-lg font-semibold text-ora-charcoal">Email Campaigns</h3>
              <p className="mt-2 text-sm text-ora-graphite">
                Design beautiful email invitations and reminders with our visual 
                drag-and-drop email builder.
              </p>
            </div>
            
            <div className="border border-ora-sand p-6">
              <Zap className="h-8 w-8 text-ora-gold" />
              <h3 className="mt-4 text-lg font-semibold text-ora-charcoal">Automations</h3>
              <p className="mt-2 text-sm text-ora-graphite">
                Set up powerful workflows that trigger based on RSVPs, check-ins, 
                and other guest actions.
              </p>
            </div>
          </div>

          <div className="mt-12 bg-ora-cream p-8 text-center">
            <h2 className="text-2xl font-semibold text-ora-charcoal">Ready to get started?</h2>
            <p className="mt-2 text-ora-graphite">
              Transform how you manage events with EventOS.
            </p>
            <div className="mt-6">
              <Link href="/events">
                <Button size="lg">Go to Dashboard</Button>
              </Link>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-ora-sand bg-ora-white py-8">
        <div className="mx-auto max-w-7xl px-4 text-center text-sm text-ora-stone sm:px-6 lg:px-8">
          © {new Date().getFullYear()} EventOS. All rights reserved.
        </div>
      </footer>
    </div>
  )
}
