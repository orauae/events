/**
 * @fileoverview Admin Guests Page - Platform-wide Guest Management
 * 
 * This page provides administrators with a comprehensive view of all guests
 * across the platform. It includes search, pagination, and the ability to
 * add new guests or import from CSV files.
 * 
 * ## Features
 * - View all guests with pagination
 * - Search by name, email, or company
 * - Add individual guests via sheet dialog
 * - Import guests from CSV files
 * - Display guest photos with avatars
 * 
 * ## Access Control
 * - Requires Admin role
 * - Protected by middleware authentication
 * 
 * @module app/admin/guests/page
 * @requires @/hooks/use-admin-guests - Admin guest data fetching
 * @requires @/components/ui - UI components
 * @requires @/components/guests - Guest-specific components
 */

"use client"

import { useState, useCallback, useMemo } from "react"
import Link from "next/link"
import { Plus, Search, Users, Building2, Mail, Phone, ChevronLeft, ChevronRight, Trash2, X } from "lucide-react"
import { useAdminGuestsPaginated, useBulkDeleteGuests } from "@/hooks/use-admin-guests"
import { Button, Input, Card, Checkbox } from "@/components/ui"
import { GuestTableSkeleton } from "@/components/skeletons"
import { GuestAvatar, CreateGuestSheet } from "@/components/guests"


/** Number of guests to display per page */
const PAGE_SIZE = 20

/**
 * Formats a date for display in the guest table.
 * 
 * @param date - Date to format (Date object or ISO string)
 * @returns Formatted date string (e.g., "Jan 15, 2024")
 */
function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

/**
 * Admin Guests Page - Main page component.
 * 
 * Displays a paginated table of all guests with:
 * - Search functionality with debouncing
 * - Pagination controls
 * - Guest creation sheet
 * - CSV import link
 * - Loading and error states
 * - Empty states for no data and no search results
 * 
 * @returns The admin guests page component
 */
export default function AdminGuestsPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  
  const { data: paginatedData, isLoading, error } = useAdminGuestsPaginated(debouncedQuery, currentPage, PAGE_SIZE)
  const bulkDelete = useBulkDeleteGuests()
  
  const guests = useMemo(() => paginatedData?.data ?? [], [paginatedData?.data])
  const total = paginatedData?.total ?? 0
  const totalPages = paginatedData?.totalPages ?? 1

  // Are all guests on the current page selected?
  const allPageSelected = guests.length > 0 && guests.every((g) => selectedIds.has(g.id))
  const someSelected = selectedIds.size > 0

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    setCurrentPage(1)
    setSelectedIds(new Set()) // Clear selection on search
    const timeoutId = setTimeout(() => {
      setDebouncedQuery(value)
    }, 300)
    return () => clearTimeout(timeoutId)
  }

  const handlePrevPage = () => {
    setCurrentPage((prev) => Math.max(1, prev - 1))
    setSelectedIds(new Set())
  }

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(totalPages, prev + 1))
    setSelectedIds(new Set())
  }

  const toggleSelectAll = useCallback(() => {
    if (allPageSelected) {
      // Deselect all on current page
      setSelectedIds((prev) => {
        const next = new Set(prev)
        guests.forEach((g) => next.delete(g.id))
        return next
      })
    } else {
      // Select all on current page
      setSelectedIds((prev) => {
        const next = new Set(prev)
        guests.forEach((g) => next.add(g.id))
        return next
      })
    }
  }, [allPageSelected, guests])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
    setShowDeleteConfirm(false)
  }, [])

  const handleBulkDelete = useCallback(() => {
    if (selectedIds.size === 0) return
    bulkDelete.mutate([...selectedIds], {
      onSuccess: () => {
        setSelectedIds(new Set())
        setShowDeleteConfirm(false)
      },
    })
  }, [selectedIds, bulkDelete])

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-ora-charcoal">All Guests</h1>
          <p className="text-sm text-ora-graphite mt-1">Manage all guests across the platform</p>
        </div>
        <div className="flex gap-3">
          <Link href="/admin/guests/import">
            <Button variant="outline">
              <Plus className="h-4 w-4 stroke-1" />
              Import CSV
            </Button>
          </Link>
          <Button onClick={() => setIsCreateSheetOpen(true)}>
            <Plus className="h-4 w-4 stroke-1" />
            Add Guest
          </Button>
        </div>
      </div>

      {/* Create Guest Sheet */}
      <CreateGuestSheet
        isOpen={isCreateSheetOpen}
        onClose={() => setIsCreateSheetOpen(false)}
      />

      {/* Search Bar & Bulk Actions */}
      <div className="mb-6 flex items-center gap-4">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 stroke-1 -translate-y-1/2 text-ora-graphite" />
          <Input
            placeholder="Search by name, email, or company..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Bulk action bar */}
        {someSelected && (
          <div className="flex items-center gap-3 ml-auto animate-fade-in">
            <span className="text-sm font-medium text-ora-charcoal">
              {selectedIds.size} selected
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={clearSelection}
            >
              <X className="h-3.5 w-3.5 stroke-1" />
              Clear
            </Button>
            {showDeleteConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-red-600">Confirm delete?</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="bg-red-600 hover:bg-red-700 text-white"
                  onClick={handleBulkDelete}
                  isLoading={bulkDelete.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5 stroke-1" />
                  Delete {selectedIds.size}
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                className="bg-red-600 hover:bg-red-700 text-white"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="h-3.5 w-3.5 stroke-1" />
                Delete
              </Button>
            )}
          </div>
        )}
      </div>

      {isLoading && <GuestTableSkeleton rows={8} />}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          Failed to load guests. Please try again.
        </div>
      )}

      {!isLoading && guests.length === 0 && !debouncedQuery && (
        <div className="rounded-lg border border-ora-sand bg-ora-white p-12 text-center">
          <Users className="mx-auto h-12 w-12 stroke-1 text-ora-stone mb-4" />
          <h3 className="text-lg font-medium text-ora-charcoal mb-2">No guests yet</h3>
          <p className="text-sm text-ora-graphite mb-4">
            Add your first guest or import from a CSV file
          </p>
          <div className="flex justify-center gap-3">
            <Link href="/admin/guests/import">
              <Button variant="outline">
                <Plus className="h-4 w-4 stroke-1" />
                Import CSV
              </Button>
            </Link>
            <Button onClick={() => setIsCreateSheetOpen(true)}>
              <Plus className="h-4 w-4 stroke-1" />
              Add Guest
            </Button>
          </div>
        </div>
      )}

      {!isLoading && guests.length === 0 && debouncedQuery && (
        <div className="rounded-lg border border-ora-sand bg-ora-white p-12 text-center">
          <Search className="mx-auto h-12 w-12 stroke-1 text-ora-stone mb-4" />
          <h3 className="text-lg font-medium text-ora-charcoal mb-2">No results found</h3>
          <p className="text-sm text-ora-graphite">
            No guests match &quot;{debouncedQuery}&quot;. Try a different search term.
          </p>
        </div>
      )}

      {!isLoading && guests.length > 0 && (
        <>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-ora-graphite">
              Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, total)} of {total} guest{total !== 1 ? "s" : ""}
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handlePrevPage} disabled={currentPage === 1}>
                  <ChevronLeft className="h-4 w-4 stroke-1" />
                  Previous
                </Button>
                <span className="text-sm text-ora-graphite px-2">Page {currentPage} of {totalPages}</span>
                <Button variant="outline" size="sm" onClick={handleNextPage} disabled={currentPage === totalPages}>
                  Next
                  <ChevronRight className="h-4 w-4 stroke-1" />
                </Button>
              </div>
            )}
          </div>
          
          <Card className="overflow-hidden">
            <table className="w-full">
              <thead className="bg-ora-cream border-b border-ora-sand">
                <tr>
                  <th className="w-10 px-4 py-3">
                    <Checkbox
                      checked={allPageSelected}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all guests on this page"
                    />
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-ora-charcoal">Name</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-ora-charcoal">Email</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-ora-charcoal">Company</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-ora-charcoal">Mobile</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-ora-charcoal">Added</th>
                </tr>
              </thead>
              <tbody>
                {guests.map((guest) => (
                  <tr
                    key={guest.id}
                    className={`border-b border-ora-sand last:border-0 hover:bg-ora-cream/50 ${selectedIds.has(guest.id) ? 'bg-ora-cream/70' : ''}`}
                  >
                    <td className="w-10 px-4 py-3">
                      <Checkbox
                        checked={selectedIds.has(guest.id)}
                        onCheckedChange={() => toggleSelect(guest.id)}
                        aria-label={`Select ${guest.firstName} ${guest.lastName}`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <GuestAvatar guestId={guest.id} firstName={guest.firstName} lastName={guest.lastName} size="sm" />
                        <div>
                          <div className="font-medium text-ora-charcoal">{guest.firstName} {guest.lastName}</div>
                          {guest.jobTitle && <div className="text-xs text-ora-graphite">{guest.jobTitle}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 text-ora-graphite">
                        <Mail className="h-4 w-4 stroke-1" />
                        <span>{guest.email}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {guest.company ? (
                        <div className="flex items-center gap-2 text-ora-graphite">
                          <Building2 className="h-4 w-4 stroke-1" />
                          <span>{guest.company}</span>
                        </div>
                      ) : (
                        <span className="text-ora-stone">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {guest.mobile ? (
                        <div className="flex items-center gap-2 text-ora-graphite">
                          <Phone className="h-4 w-4 stroke-1" />
                          <span>{guest.mobile}</span>
                        </div>
                      ) : (
                        <span className="text-ora-stone">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ora-graphite">{formatDate(guest.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={handlePrevPage} disabled={currentPage === 1}>
                <ChevronLeft className="h-4 w-4 stroke-1" />
                Previous
              </Button>
              <span className="text-sm text-ora-graphite px-2">Page {currentPage} of {totalPages}</span>
              <Button variant="outline" size="sm" onClick={handleNextPage} disabled={currentPage === totalPages}>
                Next
                <ChevronRight className="h-4 w-4 stroke-1" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
