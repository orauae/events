/**
 * @fileoverview Guests List Page - Central guest database management
 * 
 * This page provides a comprehensive view of the guest database including:
 * - Paginated guest list with search functionality
 * - Guest details (name, email, company, etc.)
 * - Add new guest capability
 * - Guest avatars with photo support
 * 
 * Guests are central contacts that can be invited to multiple events.
 * 
 * @module app/(dashboard)/guests/page
 * @route /guests
 * @access Protected - Requires authentication
 * 
 * @example
 * ```
 * // URL: /guests
 * // Displays paginated list of all guests in the database
 * // URL: /guests?q=john
 * // Searches guests for "john"
 * ```
 */

"use client"

import { useState } from "react"
import Link from "next/link"
import { Plus, Search, Users, Building2, Mail, Phone, ChevronLeft, ChevronRight } from "lucide-react"
import { useGuestsPaginated } from "@/hooks/use-guests"
import { PageHeader, DataTable } from "@/components/layout"
import { Button, Input } from "@/components/ui"
import { GuestTableSkeleton } from "@/components/skeletons"
import { GuestAvatar } from "@/components/guests/guest-avatar"
import { CreateGuestSheet } from "@/components/guests"
import type { Guest } from "@/db/schema"

const PAGE_SIZE = 20

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export default function GuestsPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [isAddGuestOpen, setIsAddGuestOpen] = useState(false)
  
  const { data: paginatedData, isLoading, error } = useGuestsPaginated(debouncedQuery, currentPage, PAGE_SIZE)
  
  const guests = paginatedData?.data ?? []
  const total = paginatedData?.total ?? 0
  const totalPages = paginatedData?.totalPages ?? 1

  // Simple debounce for search
  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    // Reset to first page when searching
    setCurrentPage(1)
    // Debounce the API call
    const timeoutId = setTimeout(() => {
      setDebouncedQuery(value)
    }, 300)
    return () => clearTimeout(timeoutId)
  }

  const handlePrevPage = () => {
    setCurrentPage((prev) => Math.max(1, prev - 1))
  }

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(totalPages, prev + 1))
  }

  const columns = [
    {
      key: "name",
      header: "Name",
      cell: (guest: Guest) => (
        <div className="flex items-center gap-3">
          <GuestAvatar guestId={guest.id} firstName={guest.firstName} lastName={guest.lastName} size="sm" />
          <div>
            <div className="font-medium text-ora-charcoal">
              {guest.firstName} {guest.lastName}
            </div>
            {guest.jobTitle && (
              <div className="text-xs text-ora-graphite">{guest.jobTitle}</div>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "email",
      header: "Email",
      cell: (guest: Guest) => (
        <div className="flex items-center gap-2 text-ora-graphite">
          <Mail className="h-4 w-4" />
          <span>{guest.email}</span>
        </div>
      ),
    },
    {
      key: "company",
      header: "Company",
      cell: (guest: Guest) => (
        guest.company ? (
          <div className="flex items-center gap-2 text-ora-graphite">
            <Building2 className="h-4 w-4" />
            <span>{guest.company}</span>
          </div>
        ) : (
          <span className="text-ora-stone">—</span>
        )
      ),
    },
    {
      key: "mobile",
      header: "Mobile",
      cell: (guest: Guest) => (
        guest.mobile ? (
          <div className="flex items-center gap-2 text-ora-graphite">
            <Phone className="h-4 w-4" />
            <span>{guest.mobile}</span>
          </div>
        ) : (
          <span className="text-ora-stone">—</span>
        )
      ),
    },
    {
      key: "createdAt",
      header: "Added",
      cell: (guest: Guest) => (
        <span className="text-ora-graphite">{formatDate(guest.createdAt)}</span>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Guest Database"
        description="Manage your contacts and import guests"
      >
        <Link href="/guests/import">
          <Button variant="outline">
            <Plus className="h-4 w-4" />
            Import CSV
          </Button>
        </Link>
        <Button onClick={() => setIsAddGuestOpen(true)}>
          <Plus className="h-4 w-4" />
          Add Guest
        </Button>
      </PageHeader>

      <CreateGuestSheet
        isOpen={isAddGuestOpen}
        onClose={() => setIsAddGuestOpen(false)}
      />

      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ora-graphite" />
          <Input
            placeholder="Search by name, email, or company..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {isLoading && <GuestTableSkeleton rows={8} />}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          Failed to load guests. Please try again.
        </div>
      )}

      {!isLoading && guests.length === 0 && !debouncedQuery && (
        <div className="rounded-lg border border-ora-sand bg-ora-white p-12 text-center">
          <Users className="mx-auto h-12 w-12 text-ora-stone mb-4" />
          <h3 className="text-lg font-medium text-ora-charcoal mb-2">
            No guests yet
          </h3>
          <p className="text-sm text-ora-graphite mb-4">
            Add your first guest or import from a CSV file
          </p>
          <div className="flex justify-center gap-3">
            <Link href="/guests/import">
              <Button variant="outline">
                <Plus className="h-4 w-4" />
                Import CSV
              </Button>
            </Link>
            <Button onClick={() => setIsAddGuestOpen(true)}>
              <Plus className="h-4 w-4" />
              Add Guest
            </Button>
          </div>
        </div>
      )}

      {!isLoading && guests.length === 0 && debouncedQuery && (
        <div className="rounded-lg border border-ora-sand bg-ora-white p-12 text-center">
          <Search className="mx-auto h-12 w-12 text-ora-stone mb-4" />
          <h3 className="text-lg font-medium text-ora-charcoal mb-2">
            No results found
          </h3>
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrevPage}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <span className="text-sm text-ora-graphite px-2">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNextPage}
                  disabled={currentPage === totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
          <DataTable
            columns={columns}
            data={guests}
            keyExtractor={(guest) => guest.id}
            emptyMessage="No guests found"
          />
          {/* Bottom Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrevPage}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <span className="text-sm text-ora-graphite px-2">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNextPage}
                disabled={currentPage === totalPages}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
