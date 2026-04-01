/**
 * @fileoverview RSVP Page - Public guest response page
 * 
 * This page allows guests to respond to event invitations using a unique token.
 * Features include:
 * - Event information display
 * - RSVP status selection (Attending, Not Attending)
 * - Company representation toggle
 * - Mobile number update
 * - Calendar download for confirmed guests
 * - Device tracking for analytics
 * 
 * @module app/rsvp/[token]/page
 * @route /rsvp/:token
 * @access Public - Token-based access
 * 
 * @param {string} token - Unique RSVP token for the guest
 * 
 * @example
 * ```
 * // URL: /rsvp/abc123xyz
 * // Displays RSVP form for guest with token abc123xyz
 * ```
 */

"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Calendar,
  MapPin,
  Clock,
  CheckCircle2,
  XCircle,
  HelpCircle,
  AlertCircle,
  Loader2,
  Building2,
  Phone,
  Download,
  Mail,
} from "lucide-react"
import { toast } from "sonner"
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Badge,
  Skeleton,
  Input,
  Label,
  Switch,
} from "@/components/ui"
import { ORAFooter } from "@/components/ui/ora-brand"

/**
 * RSVP Data structure returned from the API
 * Contains event guest, guest details, and event information
 * 
 * @interface RSVPData
 */
interface RSVPData {
  eventGuest: {
    id: string
    rsvpStatus: string
    qrToken: string
    representingCompany: boolean | null
    companyRepresented: string | null
    updatedMobile: string | null
  }
  guest: {
    id: string
    firstName: string
    lastName: string
    email: string
    mobile: string | null
    company: string | null
  }
  event: {
    id: string
    name: string
    type: string
    description: string
    startDate: string
    endDate: string
    location: string
  }
}

/**
 * RSVP submission data structure
 * Contains the guest's response and optional additional information
 * 
 * @interface RSVPSubmitData
 */
interface RSVPSubmitData {
  status: RSVPStatus
  representingCompany?: boolean
  companyRepresented?: string
  updatedMobile?: string
  // Device tracking
  deviceInfo?: {
    screenWidth: number
    screenHeight: number
    language: string
    platform: string
    timezone: string
    touchSupport: boolean
  }
}

interface RSVPResponse {
  success: boolean
  message: string
  eventGuest: {
    id: string
    rsvpStatus: string
    updatedAt: string
  }
  badge: {
    id: string
    qrToken: string
    generatedAt: string
    qrDataUrl: string | null
  } | null
}

type RSVPStatus = "Attending" | "NotAttending"

// Fetch RSVP data
async function fetchRSVPData(token: string): Promise<RSVPData> {
  const response = await fetch(`/api/rsvp/${token}`)
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || "Failed to load RSVP data")
  }
  return response.json()
}

// Submit RSVP response
async function submitRSVP(token: string, data: RSVPSubmitData): Promise<RSVPResponse> {
  const response = await fetch(`/api/rsvp/${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || "Failed to submit RSVP")
  }
  return response.json()
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

function formatTime(date: string) {
  return new Date(date).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })
}

const statusConfig: Record<RSVPStatus, { icon: typeof CheckCircle2; color: string; label: string }> = {
  Attending: { icon: CheckCircle2, color: "text-green-600", label: "I'll be there!" },
  NotAttending: { icon: XCircle, color: "text-red-600", label: "Can't make it" },
}

// Shared header component for RSVP pages
function RSVPHeader() {
  return (
    <header 
      className="glass-effect" 
      style={{ 
        position: 'fixed', 
        top: 0, 
        left: 0, 
        right: 0, 
        zIndex: 50, 
        borderBottom: '1px solid #E8E4DF'
      }}
    >
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
          <div style={{ width: '24px', height: '24px', backgroundColor: '#B8956B' }} />
          <span style={{ fontSize: '18px', fontWeight: 300, letterSpacing: '0.15em', color: '#2C2C2C' }}>EventOS</span>
        </Link>
        <nav style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <Link href="/events/browse" style={{ fontSize: '14px', color: '#6B6B6B', textDecoration: 'none' }}>
            Browse Events
          </Link>
          <Link
            href="/"
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
  )
}

// Shared page wrapper with header and footer
function RSVPPageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', width: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#FAF9F7' }}>
      <RSVPHeader />
      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', paddingTop: '100px' }}>
        <div style={{ width: '100%', maxWidth: '480px' }}>
          {children}
        </div>
      </main>
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 24px', width: '100%' }}>
        <ORAFooter />
      </div>
    </div>
  )
}

function RSVPSkeleton() {
  return (
    <RSVPPageWrapper>
      <Card>
        <div style={{ height: "8px", backgroundColor: "#B8956B", borderRadius: "8px 8px 0 0" }} />
        <CardHeader className="text-center">
          <Skeleton className="h-8 w-48 mx-auto mb-2" />
          <Skeleton className="h-4 w-32 mx-auto" />
        </CardHeader>
        <CardContent className="space-y-6">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    </RSVPPageWrapper>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <RSVPPageWrapper>
      <Card>
        <div style={{ height: "8px", backgroundColor: "#ef4444", borderRadius: "8px 8px 0 0" }} />
        <CardContent className="py-12 text-center">
          <AlertCircle className="mx-auto h-16 w-16 text-red-500 mb-4" />
          <h2 className="text-xl font-semibold text-ora-charcoal mb-2">
            Invalid RSVP Link
          </h2>
          <p className="text-ora-graphite">{message}</p>
        </CardContent>
      </Card>
    </RSVPPageWrapper>
  )
}

function ConfirmationState({ 
  status, 
  event, 
  guest,
  badge,
}: { 
  status: RSVPStatus
  event: RSVPData["event"]
  guest: RSVPData["guest"]
  badge: RSVPResponse["badge"]
}) {
  const config = statusConfig[status]
  const Icon = config.icon

  return (
    <RSVPPageWrapper>
      <Card>
        <div style={{ height: "8px", backgroundColor: "#B8956B", borderRadius: "8px 8px 0 0" }} />
        <CardContent className="py-12 text-center">
          <Icon className={`mx-auto h-16 w-16 ${config.color} mb-4`} />
          <h2 className="text-2xl font-semibold text-ora-charcoal mb-2">
            {status === "Attending" && "You're all set!"}
            {status === "NotAttending" && "We'll miss you!"}
          </h2>
          <p className="text-ora-graphite mb-6">
            {status === "Attending" && (
              <>Your attendance for <span className="font-medium">{event.name}</span> has been confirmed.</>
            )}
            {status === "NotAttending" && (
              <>We're sorry you can't make it to <span className="font-medium">{event.name}</span>. Hope to see you at a future event!</>
            )}
          </p>
          
          {/* Badge Display for Attending status */}
          {status === "Attending" && badge?.qrDataUrl && (
            <div className="mb-6">
              <div 
                style={{ 
                  background: "linear-gradient(135deg, #FAF9F7 0%, #F5F3F0 100%)", 
                  borderRadius: "16px", 
                  padding: "24px", 
                  border: "1px solid #E8E4DF",
                  maxWidth: "320px",
                  margin: "0 auto"
                }}
              >
                <h3 className="text-lg font-semibold text-ora-charcoal mb-4">Your Event Badge</h3>
                
                {/* Badge Card */}
                <div 
                  style={{ 
                    background: "#FFFFFF", 
                    borderRadius: "12px", 
                    padding: "20px", 
                    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                    textAlign: "left"
                  }}
                >
                  {/* Gold accent */}
                  <div style={{ height: "6px", background: "#B8956B", borderRadius: "3px 3px 0 0", margin: "-20px -20px 16px -20px" }} />
                  
                  {/* Event name */}
                  <p style={{ color: "#6B6B6B", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "4px" }}>
                    {event.name}
                  </p>
                  
                  {/* Guest name */}
                  <h4 style={{ color: "#2C2C2C", fontSize: "20px", fontWeight: 700, marginBottom: "4px" }}>
                    {guest.firstName} {guest.lastName}
                  </h4>
                  
                  {/* Company */}
                  {guest.company && (
                    <p style={{ color: "#6B6B6B", fontSize: "14px", marginBottom: "16px" }}>
                      {guest.company}
                    </p>
                  )}
                  
                  {/* QR Code */}
                  <div style={{ textAlign: "center", padding: "12px", background: "#FAFAFA", borderRadius: "8px" }}>
                    <img 
                      src={badge.qrDataUrl} 
                      alt="Check-in QR Code" 
                      style={{ width: "140px", height: "140px", margin: "0 auto" }} 
                    />
                    <p style={{ color: "#9CA3AF", fontSize: "11px", marginTop: "8px" }}>
                      Show this at check-in
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center justify-center gap-2 mt-4 text-sm text-ora-graphite">
                  <Mail className="h-4 w-4 text-ora-gold" />
                  <span>Badge also sent to <strong>{guest.email}</strong></span>
                </div>
              </div>
              
              <p className="text-sm text-ora-graphite mt-4">
                💡 <strong>Tip:</strong> Take a screenshot of your badge for easy access at the event.
              </p>
            </div>
          )}
          
          <div className="bg-ora-cream rounded-lg p-4 text-left">
            <h3 className="font-medium text-ora-charcoal mb-3">Event Details</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-ora-graphite">
                <Calendar className="h-4 w-4 text-ora-gold" />
                <span>{formatDate(event.startDate)}</span>
              </div>
              <div className="flex items-center gap-2 text-ora-graphite">
                <Clock className="h-4 w-4 text-ora-gold" />
                <span>{formatTime(event.startDate)} - {formatTime(event.endDate)}</span>
              </div>
              <div className="flex items-center gap-2 text-ora-graphite">
                <MapPin className="h-4 w-4 text-ora-gold" />
                <span>{event.location}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </RSVPPageWrapper>
  )
}

export default function RSVPPage() {
  const params = useParams()
  const token = params.token as string
  const queryClient = useQueryClient()
  
  const [submitted, setSubmitted] = useState(false)
  const [submittedStatus, setSubmittedStatus] = useState<RSVPStatus | null>(null)
  const [badgeData, setBadgeData] = useState<RSVPResponse["badge"]>(null)
  
  // Form state for additional RSVP fields
  const [representingCompany, setRepresentingCompany] = useState(false)
  const [companyRepresented, setCompanyRepresented] = useState("")
  const [wantsToUpdateMobile, setWantsToUpdateMobile] = useState(false)
  const [updatedMobile, setUpdatedMobile] = useState("")

  // Fetch RSVP data
  const { data, isLoading, error } = useQuery({
    queryKey: ["rsvp", token],
    queryFn: () => fetchRSVPData(token),
    retry: false,
  })

  // Initialize form state from existing data when loaded
  useState(() => {
    if (data?.eventGuest) {
      if (data.eventGuest.representingCompany) {
        setRepresentingCompany(true)
        setCompanyRepresented(data.eventGuest.companyRepresented || "")
      }
      if (data.eventGuest.updatedMobile) {
        setWantsToUpdateMobile(true)
        setUpdatedMobile(data.eventGuest.updatedMobile)
      }
    }
  })

  // Collect device info for analytics
  const getDeviceInfo = () => {
    if (typeof window === 'undefined') return undefined
    return {
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      language: navigator.language,
      platform: navigator.platform,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      touchSupport: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
    }
  }

  // Submit RSVP mutation
  const submitMutation = useMutation({
    mutationFn: (status: RSVPStatus) => submitRSVP(token, {
      status,
      representingCompany: representingCompany || undefined,
      companyRepresented: representingCompany ? companyRepresented : undefined,
      updatedMobile: wantsToUpdateMobile && updatedMobile ? updatedMobile : undefined,
      deviceInfo: getDeviceInfo(),
    }),
    onSuccess: (response, status) => {
      setSubmitted(true)
      setSubmittedStatus(status)
      setBadgeData(response.badge)
      queryClient.invalidateQueries({ queryKey: ["rsvp", token] })
      
      if (status === "Attending") {
        toast.success("RSVP confirmed! Check your email for your badge.")
      } else {
        toast.success("Thanks for letting us know.")
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to submit RSVP")
    },
  })

  // Loading state
  if (isLoading) {
    return <RSVPSkeleton />
  }

  // Error state (invalid/expired token)
  if (error || !data) {
    return <ErrorState message={(error as Error)?.message || "This RSVP link is invalid or has expired."} />
  }

  // Confirmation state after submission
  if (submitted && submittedStatus) {
    return (
      <ConfirmationState 
        status={submittedStatus} 
        event={data.event} 
        guest={data.guest}
        badge={badgeData}
      />
    )
  }

  const { event, guest, eventGuest } = data
  const currentStatus = eventGuest.rsvpStatus as RSVPStatus | "Pending"

  return (
    <RSVPPageWrapper>
      <Card>
        {/* Gold accent line */}
        <div style={{ height: "8px", backgroundColor: "#B8956B", borderRadius: "8px 8px 0 0" }} />
        
        <CardHeader className="text-center pb-2">
          <Badge variant="secondary" className="mx-auto mb-3">
            {event.type}
          </Badge>
          <CardTitle className="text-2xl">{event.name}</CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Guest greeting */}
          <div className="text-center">
            <p className="text-ora-graphite">
              Hello <span className="font-medium text-ora-charcoal">{guest.firstName}</span>,
            </p>
            <p className="text-ora-graphite">
              You're invited! Please let us know if you can attend.
            </p>
          </div>

          {/* Event details */}
          <div style={{ backgroundColor: "#FAF9F7", borderRadius: "8px", padding: "16px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                  <Calendar className="h-5 w-5 text-ora-gold" style={{ marginTop: "2px" }} />
                  <div>
                    <p style={{ fontWeight: 500, color: "#2C2C2C" }}>
                      {formatDate(event.startDate)}
                    </p>
                    {formatDate(event.startDate) !== formatDate(event.endDate) && (
                      <p style={{ fontSize: "14px", color: "#6B6B6B" }}>
                        to {formatDate(event.endDate)}
                      </p>
                    )}
                  </div>
                </div>
                
                <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                  <Clock className="h-5 w-5 text-ora-gold" style={{ marginTop: "2px" }} />
                  <div>
                    <p style={{ fontWeight: 500, color: "#2C2C2C" }}>
                      {formatTime(event.startDate)} - {formatTime(event.endDate)}
                    </p>
                  </div>
                </div>
                
                <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                  <MapPin className="h-5 w-5 text-ora-gold" style={{ marginTop: "2px" }} />
                  <div>
                    <p style={{ fontWeight: 500, color: "#2C2C2C" }}>{event.location}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Event description */}
            {event.description && (
              <div>
                <h4 style={{ fontWeight: 500, color: "#2C2C2C", marginBottom: "8px" }}>About this event</h4>
                <p style={{ fontSize: "14px", color: "#6B6B6B", whiteSpace: "pre-wrap" }}>
                  {event.description}
                </p>
              </div>
            )}

            {/* Current status indicator */}
            {currentStatus !== "Pending" && (
              <div style={{ backgroundColor: "rgba(232, 228, 223, 0.5)", borderRadius: "8px", padding: "12px", textAlign: "center" }}>
                <p style={{ fontSize: "14px", color: "#6B6B6B" }}>
                  Your current response: <span style={{ fontWeight: 500 }}>{currentStatus === "NotAttending" ? "Not Attending" : currentStatus}</span>
                </p>
              </div>
            )}

            {/* Company representation toggle */}
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", border: "1px solid #E8E4DF", borderRadius: "8px", padding: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Building2 className="h-4 w-4 text-ora-gold" />
                  <Label htmlFor="representing-company" style={{ fontSize: "14px", fontWeight: 500, color: "#2C2C2C", cursor: "pointer" }}>
                    Are you representing a company?
                  </Label>
                </div>
                <Switch
                  id="representing-company"
                  checked={representingCompany}
                  onCheckedChange={setRepresentingCompany}
                />
              </div>
              
              {representingCompany && (
                <div style={{ paddingTop: "8px" }}>
                  <Label htmlFor="company-name" style={{ fontSize: "14px", color: "#6B6B6B" }}>
                    Company name
                  </Label>
                  <Input
                    id="company-name"
                    placeholder="Enter your company name"
                    value={companyRepresented}
                    onChange={(e) => setCompanyRepresented(e.target.value)}
                    style={{ marginTop: "4px" }}
                  />
                </div>
              )}
            </div>

            {/* Contact update section */}
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", border: "1px solid #E8E4DF", borderRadius: "8px", padding: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "#6B6B6B" }}>
                <Phone className="h-4 w-4 text-ora-gold" />
                <span>
                  We have your contact as: <span style={{ fontWeight: 500, color: "#2C2C2C" }}>{guest.mobile || "Not provided"}</span>
                </span>
              </div>
              
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <Label htmlFor="update-mobile" style={{ fontSize: "14px", fontWeight: 500, color: "#2C2C2C", cursor: "pointer" }}>
                  Would you like to update your contact number?
                </Label>
                <Switch
                  id="update-mobile"
                  checked={wantsToUpdateMobile}
                  onCheckedChange={setWantsToUpdateMobile}
                />
              </div>
              
              {wantsToUpdateMobile && (
                <div style={{ paddingTop: "8px" }}>
                  <Label htmlFor="new-mobile" style={{ fontSize: "14px", color: "#6B6B6B" }}>
                    Your preferred contact number
                  </Label>
                  <Input
                    id="new-mobile"
                    type="tel"
                    placeholder="Enter your phone number"
                    value={updatedMobile}
                    onChange={(e) => setUpdatedMobile(e.target.value)}
                    style={{ marginTop: "4px" }}
                  />
                </div>
              )}
            </div>

            {/* RSVP buttons */}
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <Button
                style={{ width: "100%", height: "48px" }}
                variant={currentStatus === "Attending" ? "default" : "outline"}
                onClick={() => submitMutation.mutate("Attending")}
                disabled={submitMutation.isPending}
              >
                {submitMutation.isPending && submitMutation.variables === "Attending" ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 className="h-5 w-5" />
                    Yes, I'll be there!
                  </>
                )}
              </Button>
              
              <Button
                style={{ width: "100%", height: "48px" }}
                variant={currentStatus === "NotAttending" ? "danger" : "outline"}
                onClick={() => submitMutation.mutate("NotAttending")}
                disabled={submitMutation.isPending}
              >
                {submitMutation.isPending && submitMutation.variables === "NotAttending" ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <XCircle className="h-5 w-5" />
                    Sorry, can't make it
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </RSVPPageWrapper>
  );
}
