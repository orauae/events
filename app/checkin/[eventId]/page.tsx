/**
 * @fileoverview Check-in Page - Event guest check-in interface
 * 
 * This page provides a dedicated check-in interface for event staff including:
 * - QR code scanning via device camera
 * - Manual guest search by name/email
 * - Real-time check-in status updates
 * - Guest photo display
 * - Duplicate check-in warnings
 * 
 * Designed for on-site event use with mobile-friendly layout.
 * 
 * @module app/checkin/[eventId]/page
 * @route /checkin/:eventId
 * @access Protected - Requires authentication and event access
 * 
 * @param {string} eventId - Event ID from URL params
 * 
 * @example
 * ```
 * // URL: /checkin/clx1234567890
 * // Opens check-in interface for the specified event
 * ```
 */

"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useParams } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Camera,
  Search,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  User,
  Building2,
  Mail,
  Clock,
  QrCode,
  Loader2,
  RefreshCw,
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
  Input,
  Skeleton,
} from "@/components/ui"
import { GuestAvatar } from "@/components/guests"

// Types
interface Event {
  id: string
  name: string
}

interface GuestInfo {
  id: string
  firstName: string
  lastName: string
  email: string
  company: string | null
}

interface CheckInResponse {
  success: boolean
  alreadyCheckedIn: boolean
  message: string
  checkInTime?: string
  previousCheckInTime?: string
  guest: GuestInfo
  event: Event
}

interface LookupGuest {
  eventGuestId: string
  qrToken: string
  checkInStatus: string
  checkInTime: string | null
  rsvpStatus: string
  guest: GuestInfo
}

interface LookupResponse {
  event: Event
  guests: LookupGuest[]
  totalMatches: number
}

// Fetch event details
async function fetchEvent(eventId: string): Promise<Event> {
  const response = await fetch(`/api/events/${eventId}`)
  if (!response.ok) {
    throw new Error("Event not found")
  }
  const data = await response.json()
  return { id: data.id, name: data.name }
}

// Check in by QR token
async function checkInGuest(qrToken: string): Promise<CheckInResponse> {
  const response = await fetch("/api/checkin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ qrToken }),
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || "Check-in failed")
  }
  return response.json()
}

// Manual lookup
async function lookupGuests(eventId: string, query: string): Promise<LookupResponse> {
  const response = await fetch(`/api/checkin/lookup?eventId=${eventId}&query=${encodeURIComponent(query)}`)
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || "Lookup failed")
  }
  return response.json()
}

function formatTime(date: string) {
  return new Date(date).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  })
}

// QR Scanner Component using html5-qrcode
function QRScanner({ 
  onScan, 
  isScanning,
  onToggle 
}: { 
  onScan: (token: string) => void
  isScanning: boolean
  onToggle: () => void
}) {
  const scannerRef = useRef<HTMLDivElement>(null)
  const html5QrCodeRef = useRef<any>(null)

  useEffect(() => {
    let mounted = true

    const initScanner = async () => {
      if (!isScanning || !scannerRef.current) return

      try {
        const { Html5Qrcode } = await import("html5-qrcode")
        
        if (!mounted) return

        const html5QrCode = new Html5Qrcode("qr-reader")
        html5QrCodeRef.current = html5QrCode

        await html5QrCode.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
          },
          (decodedText) => {
            onScan(decodedText)
          },
          () => {
            // QR code not found - ignore
          }
        )
      } catch (err) {
        console.error("Failed to start scanner:", err)
        toast.error("Failed to access camera. Please check permissions.")
      }
    }

    initScanner()

    return () => {
      mounted = false
      if (html5QrCodeRef.current) {
        html5QrCodeRef.current.stop().catch(() => {})
      }
    }
  }, [isScanning, onScan])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-ora-charcoal flex items-center gap-2">
          <Camera className="h-5 w-5 text-ora-gold" />
          QR Scanner
        </h3>
        <Button
          variant={isScanning ? "danger" : "default"}
          size="sm"
          onClick={onToggle}
        >
          {isScanning ? "Stop Scanner" : "Start Scanner"}
        </Button>
      </div>

      {isScanning ? (
        <div className="relative">
          <div 
            id="qr-reader" 
            ref={scannerRef}
            className="w-full rounded-lg overflow-hidden bg-black"
            style={{ minHeight: "300px" }}
          />
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-64 h-64 border-2 border-ora-gold rounded-lg" />
          </div>
        </div>
      ) : (
        <div className="bg-ora-cream rounded-lg p-8 text-center">
          <QrCode className="mx-auto h-16 w-16 text-ora-stone mb-4" />
          <p className="text-ora-graphite">
            Click "Start Scanner" to scan guest QR codes
          </p>
        </div>
      )}
    </div>
  )
}

// Check-in result display
function CheckInResult({ 
  result, 
  onReset 
}: { 
  result: CheckInResponse
  onReset: () => void
}) {
  const isWarning = result.alreadyCheckedIn

  return (
    <Card className={isWarning ? "border-amber-400" : "border-green-400"}>
      <div className={`h-2 ${isWarning ? "bg-amber-400" : "bg-green-500"} rounded-t-lg`} />
      <CardContent className="pt-6">
        <div className="text-center mb-6">
          {isWarning ? (
            <>
              <AlertTriangle className="mx-auto h-16 w-16 text-amber-500 mb-4" />
              <h3 className="text-xl font-semibold text-ora-charcoal">
                Already Checked In
              </h3>
              <p className="text-ora-graphite">
                This guest was previously checked in at{" "}
                <span className="font-medium">
                  {result.previousCheckInTime && formatTime(result.previousCheckInTime)}
                </span>
              </p>
            </>
          ) : (
            <>
              <CheckCircle2 className="mx-auto h-16 w-16 text-green-500 mb-4" />
              <h3 className="text-xl font-semibold text-ora-charcoal">
                Check-In Successful!
              </h3>
              <p className="text-ora-graphite">
                Checked in at{" "}
                <span className="font-medium">
                  {result.checkInTime && formatTime(result.checkInTime)}
                </span>
              </p>
            </>
          )}
        </div>

        <div className="bg-ora-cream rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-4">
            <GuestAvatar
              guestId={result.guest.id}
              firstName={result.guest.firstName}
              lastName={result.guest.lastName}
              size="lg"
            />
            <div>
              <p className="font-semibold text-ora-charcoal text-lg">
                {result.guest.firstName} {result.guest.lastName}
              </p>
              {result.guest.company && (
                <p className="text-ora-graphite flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  {result.guest.company}
                </p>
              )}
              <p className="text-ora-graphite flex items-center gap-2">
                <Mail className="h-4 w-4" />
                {result.guest.email}
              </p>
            </div>
          </div>
        </div>

        <Button 
          className="w-full mt-6" 
          variant="outline"
          onClick={onReset}
        >
          <RefreshCw className="h-4 w-4" />
          Scan Next Guest
        </Button>
      </CardContent>
    </Card>
  )
}

// Manual lookup component
function ManualLookup({ 
  eventId,
  onCheckIn 
}: { 
  eventId: string
  onCheckIn: (qrToken: string) => void
}) {
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const { data, isLoading, error } = useQuery({
    queryKey: ["checkin-lookup", eventId, debouncedQuery],
    queryFn: () => lookupGuests(eventId, debouncedQuery),
    enabled: debouncedQuery.length >= 2,
  })

  return (
    <div className="space-y-4">
      <h3 className="font-medium text-ora-charcoal flex items-center gap-2">
        <Search className="h-5 w-5 text-ora-gold" />
        Manual Lookup
      </h3>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ora-graphite" />
        <Input
          placeholder="Search by name or email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {isLoading && debouncedQuery.length >= 2 && (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {error && (
        <div className="text-center py-4 text-red-600">
          {(error as Error).message}
        </div>
      )}

      {data && data.guests.length === 0 && debouncedQuery.length >= 2 && (
        <div className="text-center py-8 text-ora-graphite">
          <User className="mx-auto h-12 w-12 text-ora-stone mb-2" />
          <p>No guests found matching "{debouncedQuery}"</p>
        </div>
      )}

      {data && data.guests.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-ora-graphite">
            {data.totalMatches} guest{data.totalMatches !== 1 ? "s" : ""} found
          </p>
          {data.guests.map((guest) => (
            <div
              key={guest.eventGuestId}
              className="bg-ora-cream rounded-lg p-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-3 flex-1">
                <GuestAvatar
                  guestId={guest.guest.id}
                  firstName={guest.guest.firstName}
                  lastName={guest.guest.lastName}
                  size="md"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-ora-charcoal">
                      {guest.guest.firstName} {guest.guest.lastName}
                    </p>
                    <Badge
                      variant={
                        guest.checkInStatus === "CheckedIn"
                          ? "success"
                          : guest.rsvpStatus === "Attending"
                          ? "info"
                          : "secondary"
                      }
                    >
                      {guest.checkInStatus === "CheckedIn"
                        ? "Checked In"
                        : guest.rsvpStatus}
                    </Badge>
                  </div>
                  <p className="text-sm text-ora-graphite truncate">{guest.guest.email}</p>
                  {guest.guest.company && (
                    <p className="text-sm text-ora-graphite truncate">{guest.guest.company}</p>
                  )}
                  {guest.checkInStatus === "CheckedIn" && guest.checkInTime && (
                    <p className="text-xs text-ora-graphite flex items-center gap-1 mt-1">
                      <Clock className="h-3 w-3" />
                      Checked in at {formatTime(guest.checkInTime)}
                    </p>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant={guest.checkInStatus === "CheckedIn" ? "outline" : "default"}
                onClick={() => onCheckIn(guest.qrToken)}
              >
                {guest.checkInStatus === "CheckedIn" ? "Re-scan" : "Check In"}
              </Button>
            </div>
          ))}
        </div>
      )}

      {!debouncedQuery && (
        <div className="text-center py-8 text-ora-graphite">
          <Search className="mx-auto h-12 w-12 text-ora-stone mb-2" />
          <p>Enter at least 2 characters to search</p>
        </div>
      )}
    </div>
  )
}

// Loading skeleton
function CheckInSkeleton() {
  return (
    <div className="min-h-screen bg-ora-cream p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <Skeleton className="h-12 w-64" />
        <Card>
          <CardContent className="py-6">
            <Skeleton className="h-64 w-full mb-4" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// Error state
function ErrorState({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-ora-cream flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <div className="h-2 bg-red-500 rounded-t-lg" />
        <CardContent className="py-12 text-center">
          <XCircle className="mx-auto h-16 w-16 text-red-500 mb-4" />
          <h2 className="text-xl font-semibold text-ora-charcoal mb-2">
            Event Not Found
          </h2>
          <p className="text-ora-graphite">{message}</p>
        </CardContent>
      </Card>
    </div>
  )
}

export default function CheckInPage() {
  const params = useParams()
  const eventId = params.eventId as string
  const queryClient = useQueryClient()

  const [isScanning, setIsScanning] = useState(false)
  const [checkInResult, setCheckInResult] = useState<CheckInResponse | null>(null)
  const [activeTab, setActiveTab] = useState<"scanner" | "manual">("scanner")

  // Fetch event details
  const { data: event, isLoading: eventLoading, error: eventError } = useQuery({
    queryKey: ["event", eventId],
    queryFn: () => fetchEvent(eventId),
  })

  // Check-in mutation
  const checkInMutation = useMutation({
    mutationFn: checkInGuest,
    onSuccess: (result) => {
      setCheckInResult(result)
      setIsScanning(false)
      queryClient.invalidateQueries({ queryKey: ["checkin-lookup", eventId] })
      
      if (result.alreadyCheckedIn) {
        toast.warning(`${result.guest.firstName} was already checked in`)
      } else {
        toast.success(`${result.guest.firstName} ${result.guest.lastName} checked in!`)
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Check-in failed")
    },
  })

  // Handle QR scan
  const handleScan = useCallback((token: string) => {
    if (!checkInMutation.isPending) {
      checkInMutation.mutate(token)
    }
  }, [checkInMutation])

  // Reset result to scan next guest
  const handleReset = () => {
    setCheckInResult(null)
    setIsScanning(true)
  }

  // Handle manual check-in
  const handleManualCheckIn = (qrToken: string) => {
    checkInMutation.mutate(qrToken)
  }

  if (eventLoading) {
    return <CheckInSkeleton />
  }

  if (eventError || !event) {
    return <ErrorState message="The event you're looking for doesn't exist." />
  }

  return (
    <div className="min-h-screen bg-ora-cream">
      {/* Header */}
      <div className="bg-ora-white border-b border-ora-sand">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-ora-gold flex items-center justify-center">
              <QrCode className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-ora-charcoal">
                Check-In
              </h1>
              <p className="text-sm text-ora-graphite">{event.name}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-6">
        {/* Show result if we have one */}
        {checkInResult ? (
          <CheckInResult result={checkInResult} onReset={handleReset} />
        ) : (
          <>
            {/* Tab buttons */}
            <div className="flex gap-2">
              <Button
                variant={activeTab === "scanner" ? "default" : "outline"}
                onClick={() => setActiveTab("scanner")}
                className="flex-1"
              >
                <Camera className="h-4 w-4" />
                QR Scanner
              </Button>
              <Button
                variant={activeTab === "manual" ? "default" : "outline"}
                onClick={() => setActiveTab("manual")}
                className="flex-1"
              >
                <Search className="h-4 w-4" />
                Manual Lookup
              </Button>
            </div>

            {/* Loading indicator during check-in */}
            {checkInMutation.isPending && (
              <Card>
                <CardContent className="py-12 text-center">
                  <Loader2 className="mx-auto h-12 w-12 text-ora-gold animate-spin mb-4" />
                  <p className="text-ora-graphite">Processing check-in...</p>
                </CardContent>
              </Card>
            )}

            {/* Scanner tab */}
            {activeTab === "scanner" && !checkInMutation.isPending && (
              <Card>
                <CardContent className="pt-6">
                  <QRScanner
                    onScan={handleScan}
                    isScanning={isScanning}
                    onToggle={() => setIsScanning(!isScanning)}
                  />
                </CardContent>
              </Card>
            )}

            {/* Manual lookup tab */}
            {activeTab === "manual" && !checkInMutation.isPending && (
              <Card>
                <CardContent className="pt-6">
                  <ManualLookup
                    eventId={eventId}
                    onCheckIn={handleManualCheckIn}
                  />
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Instructions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Instructions</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-ora-graphite space-y-2">
            <p>
              <strong>QR Scanner:</strong> Point the camera at the guest's badge QR code to check them in automatically.
            </p>
            <p>
              <strong>Manual Lookup:</strong> Search for guests by name or email if they don't have their badge.
            </p>
            <p className="text-amber-600">
              <AlertTriangle className="inline h-4 w-4 mr-1" />
              If a guest has already been checked in, you'll see a warning with their previous check-in time.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
