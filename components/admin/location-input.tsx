"use client"

import { useState } from "react"
import { MapPin } from "lucide-react"
import { LocationPickerModal, type LocationResult } from "./location-picker-modal"

interface LocationInputProps {
  value: string
  latitude?: string
  longitude?: string
  onChange: (result: LocationResult) => void
  error?: string
  placeholder?: string
}

export function LocationInput({
  value,
  latitude,
  longitude,
  onChange,
  error,
  placeholder = "Select event location",
}: LocationInputProps) {
  const [open, setOpen] = useState(false)

  const initialCoords =
    latitude && longitude
      ? { lat: parseFloat(latitude), lng: parseFloat(longitude) }
      : undefined

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex h-10 w-full items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm transition-colors outline-none focus:outline-2 focus:-outline-offset-2 focus:outline-ora-gold ${
          error ? "border-red-300" : "border-ora-sand"
        } ${value ? "text-ora-charcoal" : "text-ora-stone"}`}
      >
        <MapPin className="h-4 w-4 stroke-1 shrink-0 text-ora-gold" />
        <span className="truncate text-left flex-1">
          {value || placeholder}
        </span>
      </button>

      {latitude && longitude && (
        <p className="text-[11px] text-ora-graphite mt-1">
          📍 {parseFloat(latitude).toFixed(4)}, {parseFloat(longitude).toFixed(4)}
        </p>
      )}

      <LocationPickerModal
        open={open}
        onOpenChange={setOpen}
        onSelect={onChange}
        initialLocation={value}
        initialCoords={initialCoords}
      />
    </>
  )
}
