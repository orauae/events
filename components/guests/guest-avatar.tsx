"use client"

/**
 * @fileoverview Guest Avatar Component
 * 
 * Displays a guest's photo if available, otherwise shows initials.
 * Used in guest lists, detail views, and check-in interfaces.
 * 
 * @module components/guests/guest-avatar
 * 
 * Requirements: 8.4
 */

import { User } from "lucide-react"
import { useGuestPhoto } from "@/hooks/use-guest-photo"
import { cn } from "@/lib/utils"

/**
 * Props for the GuestAvatar component
 */
interface GuestAvatarProps {
  /** The guest's ID for fetching photo */
  guestId: string
  /** Guest's first name for initials fallback */
  firstName: string
  /** Guest's last name for initials fallback */
  lastName: string
  /** Size variant */
  size?: "sm" | "md" | "lg" | "xl"
  /** Additional CSS classes */
  className?: string
  /** Pre-loaded photo URL (skips fetch if provided) */
  photoUrl?: string | null
}

/**
 * Size configurations for the avatar
 */
const sizeConfig = {
  sm: {
    container: "h-9 w-9",
    text: "text-sm",
    icon: "h-4 w-4",
  },
  md: {
    container: "h-12 w-12",
    text: "text-base",
    icon: "h-5 w-5",
  },
  lg: {
    container: "h-16 w-16",
    text: "text-lg",
    icon: "h-6 w-6",
  },
  xl: {
    container: "h-24 w-24",
    text: "text-2xl",
    icon: "h-10 w-10",
  },
}

/**
 * GuestAvatar - Displays guest photo or initials
 * 
 * Shows the guest's uploaded photo if available, otherwise displays
 * their initials in a colored circle. Supports multiple sizes.
 * 
 * @param props - Component props
 * @returns React component
 * 
 * Requirements: 8.4
 */
export function GuestAvatar({
  guestId,
  firstName,
  lastName,
  size = "md",
  className,
  photoUrl: preloadedPhotoUrl,
}: GuestAvatarProps) {
  // Only fetch if no preloaded URL is provided
  const { data: photo, isLoading } = useGuestPhoto(guestId)
  
  const config = sizeConfig[size]
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
  
  // Use preloaded URL if provided, otherwise use fetched photo
  const photoUrl = preloadedPhotoUrl !== undefined ? preloadedPhotoUrl : photo?.publicUrl

  // Show photo if available
  if (photoUrl) {
    return (
      <div
        className={cn(
          "rounded-full overflow-hidden bg-ora-cream flex-shrink-0",
          config.container,
          className
        )}
      >
        <img
          src={photoUrl}
          alt={`${firstName} ${lastName}`}
          className="w-full h-full object-cover"
        />
      </div>
    )
  }

  // Show loading state briefly
  if (isLoading && preloadedPhotoUrl === undefined) {
    return (
      <div
        className={cn(
          "rounded-full bg-ora-sand animate-pulse flex-shrink-0",
          config.container,
          className
        )}
      />
    )
  }

  // Show initials fallback
  return (
    <div
      className={cn(
        "rounded-full bg-ora-cream flex items-center justify-center text-ora-charcoal font-medium flex-shrink-0",
        config.container,
        config.text,
        className
      )}
    >
      {initials || <User className={config.icon} />}
    </div>
  )
}

export default GuestAvatar
