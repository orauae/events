"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { GoogleMap, useJsApiLoader, Marker } from "@react-google-maps/api"
import { Search, MapPin, Bookmark, Trash2, Loader2 } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  Button,
  Switch,
  Label,
  Input,
} from "@/components/ui"
import { useAddresses, useCreateAddress, useDeleteAddress } from "@/hooks/use-addresses"

const libraries: ("places")[] = ["places"]

// Default center: Dubai, UAE — The Offices 5, One Central
const DEFAULT_CENTER = { lat: 25.2203094, lng: 55.284835 }
const MAP_STYLES = { width: "100%", height: "100%" }

export interface LocationResult {
  location: string
  latitude: string
  longitude: string
  addressId?: string
  placeId?: string
}

interface SelectedPlace extends LocationResult {
  formattedAddress?: string
}

interface LocationPickerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (result: LocationResult) => void
  initialLocation?: string
  initialCoords?: { lat: number; lng: number }
}

export function LocationPickerModal({
  open,
  onOpenChange,
  onSelect,
  initialLocation,
  initialCoords,
}: LocationPickerModalProps) {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
    libraries,
  })

  const [tab, setTab] = useState<"search" | "saved">("search")
  const [searchValue, setSearchValue] = useState("")
  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(null)
  const [markerPos, setMarkerPos] = useState(initialCoords || DEFAULT_CENTER)
  const [saveForLater, setSaveForLater] = useState(false)

  const mapRef = useRef<google.maps.Map | null>(null)
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const { data: addressesData } = useAddresses()
  const createAddress = useCreateAddress()
  const deleteAddress = useDeleteAddress()
  const savedAddresses = addressesData?.data || []

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setSearchValue(initialLocation || "")
      setMarkerPos(initialCoords || DEFAULT_CENTER)
      setSelectedPlace(null)
      setSaveForLater(false)
      setTab("search")
    }
  }, [open, initialLocation, initialCoords])

  // Setup autocomplete using callback ref
  const setupAutocomplete = useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node
      if (!node || !isLoaded || autocompleteRef.current) return

      const autocomplete = new google.maps.places.Autocomplete(node, {
        types: ["establishment", "geocode"],
        componentRestrictions: { country: ["sa", "ae", "qa", "bh", "kw", "om"] },
      })

      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace()
        if (!place.geometry?.location) return

        const lat = place.geometry.location.lat()
        const lng = place.geometry.location.lng()
        const fullAddress = place.formatted_address || ""
        // Use place.name for establishments (e.g. "The Offices 3, One Central")
        // Fall back to first part of formatted address if no distinct name
        let locationName = place.name || ""
        if (!locationName || locationName === fullAddress) {
          locationName = fullAddress.split(",")[0].trim()
        }

        setMarkerPos({ lat, lng })
        // Let Google's autocomplete widget control the input text,
        // just sync our state to the selected place name
        setSearchValue(node.value || fullAddress)
        setSelectedPlace({
          location: locationName,
          formattedAddress: fullAddress !== locationName ? fullAddress : undefined,
          latitude: String(lat),
          longitude: String(lng),
          placeId: place.place_id,
        })

        mapRef.current?.panTo({ lat, lng })
        mapRef.current?.setZoom(16)
      })

      autocompleteRef.current = autocomplete
    },
    [isLoaded]
  )

  // Cleanup autocomplete and pac-container when modal closes
  useEffect(() => {
    if (!open) {
      autocompleteRef.current = null
      document.querySelectorAll(".pac-container").forEach((el) => el.remove())
    }
  }, [open])

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map
  }, [])

  const onMapClick = useCallback((e: google.maps.MapMouseEvent) => {
    if (!e.latLng) return
    const lat = e.latLng.lat()
    const lng = e.latLng.lng()
    setMarkerPos({ lat, lng })

    const geocoder = new google.maps.Geocoder()
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      if (status === "OK" && results?.[0]) {
        // Extract a short, meaningful name from the results
        let shortName = ""
        let fullAddress = results[0].formatted_address

        // First try: find an establishment or point of interest
        for (const result of results) {
          if (
            result.types.includes("establishment") ||
            result.types.includes("point_of_interest") ||
            result.types.includes("premise")
          ) {
            // Use the first address component as the short name
            shortName = result.address_components?.[0]?.long_name || result.formatted_address.split(",")[0]
            fullAddress = result.formatted_address
            break
          }
        }

        // Fallback: use the first component of the first result (street/building name)
        if (!shortName) {
          shortName = results[0].address_components?.[0]?.long_name || results[0].formatted_address.split(",")[0]
        }

        setSearchValue(fullAddress)
        setSelectedPlace({
          location: shortName,
          formattedAddress: fullAddress,
          latitude: String(lat),
          longitude: String(lng),
          placeId: results[0].place_id,
        })
      } else {
        setSelectedPlace({
          location: "",
          latitude: String(lat),
          longitude: String(lng),
        })
      }
    })
  }, [])

  const handleMarkerDragEnd = useCallback((e: google.maps.MapMouseEvent) => {
    if (!e.latLng) return
    onMapClick(e)
  }, [onMapClick])

  const handleSelectSaved = (addr: typeof savedAddresses[0]) => {
    const lat = parseFloat(addr.latitude)
    const lng = parseFloat(addr.longitude)
    setMarkerPos({ lat, lng })
    setSearchValue(addr.formattedAddress)
    setSelectedPlace({
      location: addr.name,
      formattedAddress: addr.formattedAddress,
      latitude: addr.latitude,
      longitude: addr.longitude,
      addressId: addr.id,
      placeId: addr.placeId || undefined,
    })
    setTab("search")
    mapRef.current?.panTo({ lat, lng })
    mapRef.current?.setZoom(16)
  }

  const handleConfirm = async () => {
    if (!selectedPlace) return

    if (saveForLater && selectedPlace.location.trim()) {
      try {
        const result = await createAddress.mutateAsync({
          name: selectedPlace.location.trim(),
          formattedAddress: selectedPlace.formattedAddress || selectedPlace.location,
          latitude: selectedPlace.latitude,
          longitude: selectedPlace.longitude,
          placeId: selectedPlace.placeId || null,
        })
        selectedPlace.addressId = result.data?.id
      } catch {
        // Continue even if save fails
      }
    }

    onSelect({
      location: selectedPlace.location,
      latitude: selectedPlace.latitude,
      longitude: selectedPlace.longitude,
      addressId: selectedPlace.addressId,
      placeId: selectedPlace.placeId,
    })
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" width="70%" className="flex flex-col p-0 gap-0">
        <SheetHeader className="px-6 pt-6 pb-3 shrink-0">
          <SheetTitle>Select Location</SheetTitle>
          <SheetDescription>Search for a place or pick from saved locations</SheetDescription>
        </SheetHeader>

        {/* Tabs */}
        <div className="flex border-b border-ora-sand px-6 shrink-0">
          <button
            onClick={() => setTab("search")}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === "search"
                ? "border-ora-gold text-ora-charcoal"
                : "border-transparent text-ora-graphite hover:text-ora-charcoal"
            }`}
          >
            <Search className="h-3.5 w-3.5 stroke-1" />
            Search
          </button>
          <button
            onClick={() => setTab("saved")}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === "saved"
                ? "border-ora-gold text-ora-charcoal"
                : "border-transparent text-ora-graphite hover:text-ora-charcoal"
            }`}
          >
            <Bookmark className="h-3.5 w-3.5 stroke-1" />
            Saved ({savedAddresses.length})
          </button>
        </div>

        <div className="px-6 py-4 flex flex-col flex-1 min-h-0 gap-4">
          {tab === "search" && (
            <>
              {/* Search input */}
              <div className="relative shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 stroke-1 text-ora-stone" />
                <input
                  ref={setupAutocomplete}
                  type="text"
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  placeholder="Search for a place or address..."
                  className="h-10 w-full pl-10 pr-3 text-sm bg-white border border-ora-sand rounded-md placeholder:text-ora-stone text-ora-charcoal outline-none focus:outline-2 focus:-outline-offset-2 focus:outline-ora-gold transition-colors"
                />
              </div>

              {/* Map */}
              {isLoaded ? (
                <div className="border border-ora-sand overflow-hidden flex-1 min-h-0">
                  <GoogleMap
                    mapContainerStyle={MAP_STYLES}
                    center={markerPos}
                    zoom={13}
                    onLoad={onMapLoad}
                    onClick={onMapClick}
                    options={{
                      streetViewControl: false,
                      mapTypeControl: false,
                      fullscreenControl: false,
                    }}
                  >
                    <Marker
                      position={markerPos}
                      draggable
                      onDragEnd={handleMarkerDragEnd}
                    />
                  </GoogleMap>
                </div>
              ) : (
                <div className="flex-1 min-h-0 border border-ora-sand flex items-center justify-center bg-ora-cream/50">
                  <Loader2 className="h-6 w-6 stroke-1 text-ora-stone animate-spin" />
                </div>
              )}

              {/* Selected place info */}
              {selectedPlace && (
                <div className="bg-ora-cream/50 border border-ora-sand rounded-lg p-4 space-y-3 shrink-0">
                  {/* Location name — single editable field */}
                  <div className="space-y-1.5">
                    <Label htmlFor="location-name" className="text-xs font-medium text-ora-graphite">
                      Location Name
                    </Label>
                    <Input
                      id="location-name"
                      value={selectedPlace.location}
                      onChange={(e) =>
                        setSelectedPlace({ ...selectedPlace, location: e.target.value })
                      }
                      placeholder="e.g. Grand Ballroom, Hilton Dubai"
                      className="h-9 text-sm"
                    />
                  </div>

                  {/* Full address shown as context (read-only) */}
                  {selectedPlace.formattedAddress && (
                    <p className="text-xs text-ora-graphite flex items-start gap-1.5">
                      <MapPin className="h-3 w-3 stroke-1 text-ora-stone shrink-0 mt-0.5" />
                      {selectedPlace.formattedAddress}
                    </p>
                  )}

                  {/* Save toggle — uses the location name directly */}
                  <div className="flex items-center justify-between pt-1 border-t border-ora-sand/60">
                    <Label htmlFor="save-location" className="text-xs text-ora-graphite cursor-pointer">
                      Save for future events
                    </Label>
                    <Switch
                      id="save-location"
                      checked={saveForLater}
                      onCheckedChange={setSaveForLater}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {tab === "saved" && (
            <div className="space-y-1 max-h-[400px] overflow-y-auto">
              {savedAddresses.length === 0 ? (
                <div className="py-12 text-center">
                  <Bookmark className="mx-auto h-10 w-10 stroke-1 text-ora-stone mb-3" />
                  <p className="text-sm text-ora-graphite">No saved locations yet</p>
                  <p className="text-xs text-ora-stone mt-1">Search and save a location to reuse it</p>
                </div>
              ) : (
                savedAddresses.map((addr) => (
                  <div
                    key={addr.id}
                    className="flex items-center gap-3 p-3 hover:bg-ora-cream/50 cursor-pointer transition-colors group rounded-md"
                    onClick={() => handleSelectSaved(addr)}
                  >
                    <MapPin className="h-4 w-4 stroke-1 text-ora-gold shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ora-charcoal truncate">{addr.name}</p>
                      <p className="text-xs text-ora-graphite truncate">{addr.formattedAddress}</p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteAddress.mutate(addr.id)
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-50 rounded transition-all"
                      aria-label="Delete saved location"
                    >
                      <Trash2 className="h-3.5 w-3.5 stroke-1 text-red-500" />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-ora-sand shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedPlace || !selectedPlace.location.trim()}
            isLoading={createAddress.isPending}
          >
            Confirm Location
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
