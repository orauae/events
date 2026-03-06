"use client"

/**
 * @fileoverview Campaign Wizard Step 2 - Recipients Selection
 * 
 * Allows users to select campaign recipients through three methods:
 * - By event: Select an event and optionally filter its guests
 * - By filter: Build filters based on guest attributes
 * - By upload: Upload a CSV/Excel file with recipient list
 * 
 * @module components/admin/campaign-wizard/step-recipients
 * @requires react
 * @requires lucide-react
 * @requires papaparse
 * 
 * Requirements: 4 (Multi-Step Campaign Creation Wizard)
 * Requirements: 4.2 - Recipients (select event, filter guests, or upload list)
 */

import { useState, useCallback, useEffect, useRef } from "react"
import {
  Users,
  Calendar,
  Filter,
  Upload,
  ChevronDown,
  Check,
  X,
  AlertCircle,
  Loader2,
  Search,
  Plus,
  Trash2,
  CheckCircle2,
  Table,
  Mail,
} from "lucide-react"
import Papa from "papaparse"
import { useAdminEventsWithGuestCounts } from "@/hooks/use-admin-events"
import { useEventGuests } from "@/hooks/use-event-guests"
import { useGuestTagsByEvent } from "@/hooks/use-guest-tags"
import type { RSVPStatus, CheckInStatus, Event, GuestTag, Guest } from "@/db/schema"

// ============================================================================
// TYPES
// ============================================================================

/**
 * Recipient selection type
 */
export type RecipientSelectionType = "event" | "filter" | "upload" | ""

/**
 * Filter operator types for advanced filtering
 */
export type FilterOperator = 
  | "equals" 
  | "not_equals" 
  | "contains" 
  | "not_contains" 
  | "starts_with" 
  | "ends_with"
  | "is_empty"
  | "is_not_empty"

/**
 * Filter condition for a single attribute
 */
export interface FilterCondition {
  id: string
  field: string
  operator: FilterOperator
  value: string
}

/**
 * Filter group with AND/OR logic
 */
export interface FilterGroup {
  id: string
  logic: "and" | "or"
  conditions: FilterCondition[]
}

/**
 * Parsed recipient from uploaded file
 */
export interface ParsedRecipient {
  email: string
  firstName?: string
  lastName?: string
  company?: string
  jobTitle?: string
  [key: string]: string | undefined
}

/**
 * File parse result
 */
export interface FileParseResult {
  recipients: ParsedRecipient[]
  headers: string[]
  errors: string[]
  warnings: string[]
  totalRows: number
  validRows: number
  invalidRows: number
}

/**
 * Recipient filter configuration
 */
export interface RecipientFilters {
  rsvpStatus?: RSVPStatus[]
  tags?: string[]
  checkInStatus?: CheckInStatus[]
  // Advanced filter groups for guest attributes
  filterGroups?: FilterGroup[]
}

/**
 * Step recipients data structure
 */
export interface StepRecipientsData {
  recipientType: RecipientSelectionType
  eventId: string
  filters: RecipientFilters
  uploadedFile: File | null
  recipientCount: number
  parsedFileData?: FileParseResult | null
}

/**
 * Props for the StepRecipients component
 */
export interface StepRecipientsProps {
  data: StepRecipientsData
  onChange: (updates: Partial<StepRecipientsData>) => void
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Selection type options
 */
const SELECTION_TYPES = [
  {
    value: "event" as const,
    label: "Select by Event",
    description: "Choose an event and optionally filter its guests",
    icon: Calendar,
  },
  {
    value: "filter" as const,
    label: "Build Filter",
    description: "Create custom filters based on guest attributes",
    icon: Filter,
  },
  {
    value: "upload" as const,
    label: "Upload List",
    description: "Upload a CSV or Excel file with recipients",
    icon: Upload,
  },
]

/**
 * RSVP status options for filtering
 */
const RSVP_STATUS_OPTIONS: { value: RSVPStatus; label: string }[] = [
  { value: "Pending", label: "Pending" },
  { value: "Attending", label: "Attending" },
  { value: "NotAttending", label: "Not Attending" },
]

/**
 * Check-in status options for filtering
 */
const CHECK_IN_STATUS_OPTIONS: { value: CheckInStatus; label: string }[] = [
  { value: "NotCheckedIn", label: "Not Checked In" },
  { value: "CheckedIn", label: "Checked In" },
]

/**
 * Accepted file types for upload
 */
const ACCEPTED_FILE_TYPES = ".csv,.xlsx,.xls"
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

/**
 * Guest attribute fields available for filtering
 */
const GUEST_ATTRIBUTE_FIELDS = [
  { value: "firstName", label: "First Name", type: "text" },
  { value: "lastName", label: "Last Name", type: "text" },
  { value: "email", label: "Email", type: "text" },
  { value: "company", label: "Company", type: "text" },
  { value: "jobTitle", label: "Job Title", type: "text" },
  { value: "mobile", label: "Mobile", type: "text" },
] as const

/**
 * Filter operators available for text fields
 */
const FILTER_OPERATORS: { value: FilterOperator; label: string }[] = [
  { value: "equals", label: "Equals" },
  { value: "not_equals", label: "Does not equal" },
  { value: "contains", label: "Contains" },
  { value: "not_contains", label: "Does not contain" },
  { value: "starts_with", label: "Starts with" },
  { value: "ends_with", label: "Ends with" },
  { value: "is_empty", label: "Is empty" },
  { value: "is_not_empty", label: "Is not empty" },
]

/**
 * Operators that don't require a value input
 */
const VALUE_LESS_OPERATORS: FilterOperator[] = ["is_empty", "is_not_empty"]

/**
 * Generate a unique ID for filter conditions/groups
 */
function generateFilterId(): string {
  return `filter_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/**
 * Selection type card component
 */
function SelectionTypeCard({
  type,
  isSelected,
  onClick,
}: {
  type: typeof SELECTION_TYPES[number]
  isSelected: boolean
  onClick: () => void
}) {
  const Icon = type.icon
  
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "16px",
        padding: "20px",
        border: isSelected ? "2px solid #C4A35A" : "1px solid #E8E4DF",
        borderRadius: "12px",
        backgroundColor: isSelected ? "rgba(196, 163, 90, 0.05)" : "#FAFAFA",
        cursor: "pointer",
        transition: "all 0.2s ease",
        textAlign: "left",
        width: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "48px",
          height: "48px",
          borderRadius: "12px",
          backgroundColor: isSelected ? "rgba(196, 163, 90, 0.1)" : "#F5F3F0",
          flexShrink: 0,
        }}
      >
        <Icon
          style={{
            width: "24px",
            height: "24px",
            color: isSelected ? "#C4A35A" : "#6B6B6B",
          }}
        />
      </div>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: "15px",
            fontWeight: 500,
            color: isSelected ? "#C4A35A" : "#2C2C2C",
            marginBottom: "4px",
          }}
        >
          {type.label}
        </div>
        <div style={{ fontSize: "13px", color: "#6B6B6B" }}>
          {type.description}
        </div>
      </div>
      {isSelected && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "24px",
            height: "24px",
            borderRadius: "50%",
            backgroundColor: "#C4A35A",
            flexShrink: 0,
          }}
        >
          <Check style={{ width: "14px", height: "14px", color: "#FAFAFA" }} />
        </div>
      )}
    </button>
  )
}

/**
 * Event selector dropdown component with guest count preview
 * 
 * Requirements: 4.2 - Event selector with guest count preview
 */
function EventSelector({
  events,
  selectedEventId,
  onSelect,
  isLoading,
}: {
  events: Array<Event & { guestCount?: number }>
  selectedEventId: string
  onSelect: (eventId: string) => void
  isLoading: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const dropdownRef = useRef<HTMLDivElement>(null)
  
  const selectedEvent = events.find((e) => e.id === selectedEventId)
  
  const filteredEvents = events.filter((event) =>
    event.name.toLowerCase().includes(searchQuery.toLowerCase())
  )
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])
  
  if (isLoading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "14px 16px",
          border: "1px solid #E8E4DF",
          borderRadius: "8px",
          backgroundColor: "#F5F3F0",
        }}
      >
        <Loader2
          style={{
            width: "18px",
            height: "18px",
            color: "#6B6B6B",
            animation: "spin 1s linear infinite",
          }}
        />
        <span style={{ fontSize: "14px", color: "#6B6B6B" }}>Loading events...</span>
      </div>
    )
  }
  
  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          padding: "14px 16px",
          border: "1px solid #E8E4DF",
          borderRadius: "8px",
          backgroundColor: "#FAFAFA",
          fontSize: "14px",
          color: selectedEvent ? "#2C2C2C" : "#9A9A9A",
          cursor: "pointer",
          transition: "border-color 0.2s ease",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Calendar style={{ width: "18px", height: "18px", color: "#6B6B6B" }} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
            <span>{selectedEvent ? selectedEvent.name : "Select an event..."}</span>
            {selectedEvent && typeof selectedEvent.guestCount === "number" && (
              <span style={{ fontSize: "12px", color: "#6B6B6B" }}>
                {selectedEvent.guestCount.toLocaleString()} {selectedEvent.guestCount === 1 ? "guest" : "guests"}
              </span>
            )}
          </div>
        </div>
        <ChevronDown
          style={{
            width: "18px",
            height: "18px",
            color: "#6B6B6B",
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s ease",
          }}
        />
      </button>
      
      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: "4px",
            backgroundColor: "#FAFAFA",
            border: "1px solid #E8E4DF",
            borderRadius: "8px",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.08)",
            zIndex: 50,
            maxHeight: "300px",
            overflow: "hidden",
          }}
        >
          {/* Search input */}
          <div style={{ padding: "12px", borderBottom: "1px solid #E8E4DF" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 12px",
                backgroundColor: "#F5F3F0",
                borderRadius: "6px",
              }}
            >
              <Search style={{ width: "16px", height: "16px", color: "#9A9A9A" }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search events..."
                style={{
                  flex: 1,
                  border: "none",
                  backgroundColor: "transparent",
                  fontSize: "14px",
                  color: "#2C2C2C",
                  outline: "none",
                }}
              />
            </div>
          </div>
          
          {/* Event list */}
          <div style={{ maxHeight: "220px", overflowY: "auto" }}>
            {filteredEvents.length === 0 ? (
              <div
                style={{
                  padding: "20px",
                  textAlign: "center",
                  color: "#6B6B6B",
                  fontSize: "14px",
                }}
              >
                No events found
              </div>
            ) : (
              filteredEvents.map((event) => (
                <button
                  key={event.id}
                  onClick={() => {
                    onSelect(event.id)
                    setIsOpen(false)
                    setSearchQuery("")
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    padding: "12px 16px",
                    border: "none",
                    backgroundColor:
                      selectedEventId === event.id ? "#F5F3F0" : "transparent",
                    fontSize: "14px",
                    color: "#2C2C2C",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "background-color 0.2s ease",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = "#F5F3F0")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor =
                      selectedEventId === event.id ? "#F5F3F0" : "transparent")
                  }
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, marginBottom: "2px" }}>
                      {event.name}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "#6B6B6B" }}>
                      <span>
                        {new Date(event.startDate).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                      {typeof event.guestCount === "number" && (
                        <>
                          <span style={{ color: "#E8E4DF" }}>•</span>
                          <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <Users style={{ width: "12px", height: "12px" }} />
                            {event.guestCount.toLocaleString()} {event.guestCount === 1 ? "guest" : "guests"}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  {selectedEventId === event.id && (
                    <Check style={{ width: "16px", height: "16px", color: "#5C8A6B", flexShrink: 0 }} />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Multi-select filter chip component
 */
function FilterChips<T extends string>({
  label,
  options,
  selectedValues,
  onChange,
}: {
  label: string
  options: { value: T; label: string }[]
  selectedValues: T[]
  onChange: (values: T[]) => void
}) {
  const toggleValue = (value: T) => {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter((v) => v !== value))
    } else {
      onChange([...selectedValues, value])
    }
  }
  
  return (
    <div>
      <label
        style={{
          display: "block",
          fontSize: "13px",
          fontWeight: 500,
          color: "#2C2C2C",
          marginBottom: "10px",
        }}
      >
        {label}
      </label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
        {options.map((option) => {
          const isSelected = selectedValues.includes(option.value)
          return (
            <button
              key={option.value}
              onClick={() => toggleValue(option.value)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                border: isSelected ? "1px solid #C4A35A" : "1px solid #E8E4DF",
                borderRadius: "9999px",
                backgroundColor: isSelected ? "rgba(196, 163, 90, 0.1)" : "transparent",
                fontSize: "13px",
                color: isSelected ? "#C4A35A" : "#6B6B6B",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              {isSelected && <Check style={{ width: "14px", height: "14px" }} />}
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Tag selector component
 */
function TagSelector({
  tags,
  selectedTagIds,
  onChange,
  isLoading,
}: {
  tags: GuestTag[]
  selectedTagIds: string[]
  onChange: (tagIds: string[]) => void
  isLoading: boolean
}) {
  const toggleTag = (tagId: string) => {
    if (selectedTagIds.includes(tagId)) {
      onChange(selectedTagIds.filter((id) => id !== tagId))
    } else {
      onChange([...selectedTagIds, tagId])
    }
  }
  
  if (isLoading) {
    return (
      <div>
        <label
          style={{
            display: "block",
            fontSize: "13px",
            fontWeight: 500,
            color: "#2C2C2C",
            marginBottom: "10px",
          }}
        >
          Tags
        </label>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            color: "#6B6B6B",
            fontSize: "13px",
          }}
        >
          <Loader2
            style={{
              width: "14px",
              height: "14px",
              animation: "spin 1s linear infinite",
            }}
          />
          Loading tags...
        </div>
      </div>
    )
  }
  
  if (tags.length === 0) {
    return (
      <div>
        <label
          style={{
            display: "block",
            fontSize: "13px",
            fontWeight: 500,
            color: "#2C2C2C",
            marginBottom: "10px",
          }}
        >
          Tags
        </label>
        <div style={{ color: "#9A9A9A", fontSize: "13px" }}>
          No tags available for this event
        </div>
      </div>
    )
  }
  
  return (
    <div>
      <label
        style={{
          display: "block",
          fontSize: "13px",
          fontWeight: 500,
          color: "#2C2C2C",
          marginBottom: "10px",
        }}
      >
        Tags
      </label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
        {tags.map((tag) => {
          const isSelected = selectedTagIds.includes(tag.id)
          return (
            <button
              key={tag.id}
              onClick={() => toggleTag(tag.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                border: isSelected ? `1px solid ${tag.color}` : "1px solid #E8E4DF",
                borderRadius: "9999px",
                backgroundColor: isSelected ? `${tag.color}15` : "transparent",
                fontSize: "13px",
                color: isSelected ? tag.color : "#6B6B6B",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              {isSelected && <Check style={{ width: "14px", height: "14px" }} />}
              {tag.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Filter condition row component for the advanced filter builder
 * 
 * Requirements: 4.2 - Filter builder for guest attributes
 */
function FilterConditionRow({
  condition,
  onUpdate,
  onRemove,
  showRemove,
}: {
  condition: FilterCondition
  onUpdate: (updates: Partial<FilterCondition>) => void
  onRemove: () => void
  showRemove: boolean
}) {
  const requiresValue = !VALUE_LESS_OPERATORS.includes(condition.operator)
  
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "12px",
        backgroundColor: "#FAFAFA",
        borderRadius: "8px",
        border: "1px solid #E8E4DF",
      }}
    >
      {/* Field selector */}
      <select
        value={condition.field}
        onChange={(e) => onUpdate({ field: e.target.value })}
        style={{
          flex: "0 0 140px",
          padding: "8px 12px",
          border: "1px solid #E8E4DF",
          borderRadius: "6px",
          backgroundColor: "#FFFFFF",
          fontSize: "13px",
          color: "#2C2C2C",
          cursor: "pointer",
          outline: "none",
        }}
      >
        {GUEST_ATTRIBUTE_FIELDS.map((field) => (
          <option key={field.value} value={field.value}>
            {field.label}
          </option>
        ))}
      </select>
      
      {/* Operator selector */}
      <select
        value={condition.operator}
        onChange={(e) => onUpdate({ operator: e.target.value as FilterOperator })}
        style={{
          flex: "0 0 150px",
          padding: "8px 12px",
          border: "1px solid #E8E4DF",
          borderRadius: "6px",
          backgroundColor: "#FFFFFF",
          fontSize: "13px",
          color: "#2C2C2C",
          cursor: "pointer",
          outline: "none",
        }}
      >
        {FILTER_OPERATORS.map((op) => (
          <option key={op.value} value={op.value}>
            {op.label}
          </option>
        ))}
      </select>
      
      {/* Value input */}
      {requiresValue && (
        <input
          type="text"
          value={condition.value}
          onChange={(e) => onUpdate({ value: e.target.value })}
          placeholder="Enter value..."
          style={{
            flex: 1,
            padding: "8px 12px",
            border: "1px solid #E8E4DF",
            borderRadius: "6px",
            backgroundColor: "#FFFFFF",
            fontSize: "13px",
            color: "#2C2C2C",
            outline: "none",
          }}
        />
      )}
      
      {/* Remove button */}
      {showRemove && (
        <button
          onClick={onRemove}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "32px",
            height: "32px",
            border: "none",
            borderRadius: "6px",
            backgroundColor: "transparent",
            cursor: "pointer",
            transition: "background-color 0.2s ease",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(184, 92, 92, 0.1)")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
        >
          <Trash2 style={{ width: "16px", height: "16px", color: "#B85C5C" }} />
        </button>
      )}
    </div>
  )
}

/**
 * Filter group component for the advanced filter builder
 * 
 * Requirements: 4.2 - Filter builder for guest attributes
 */
function FilterGroupComponent({
  group,
  onUpdate,
  onRemove,
  showRemove,
}: {
  group: FilterGroup
  onUpdate: (updates: Partial<FilterGroup>) => void
  onRemove: () => void
  showRemove: boolean
}) {
  const addCondition = () => {
    const newCondition: FilterCondition = {
      id: generateFilterId(),
      field: "firstName",
      operator: "contains",
      value: "",
    }
    onUpdate({
      conditions: [...group.conditions, newCondition],
    })
  }
  
  const updateCondition = (conditionId: string, updates: Partial<FilterCondition>) => {
    onUpdate({
      conditions: group.conditions.map((c) =>
        c.id === conditionId ? { ...c, ...updates } : c
      ),
    })
  }
  
  const removeCondition = (conditionId: string) => {
    onUpdate({
      conditions: group.conditions.filter((c) => c.id !== conditionId),
    })
  }
  
  return (
    <div
      style={{
        padding: "16px",
        backgroundColor: "#F5F3F0",
        borderRadius: "10px",
        border: "1px solid #E8E4DF",
      }}
    >
      {/* Group header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "13px", fontWeight: 500, color: "#2C2C2C" }}>
            Match
          </span>
          <div
            style={{
              display: "flex",
              borderRadius: "6px",
              overflow: "hidden",
              border: "1px solid #E8E4DF",
            }}
          >
            <button
              onClick={() => onUpdate({ logic: "and" })}
              style={{
                padding: "6px 14px",
                border: "none",
                backgroundColor: group.logic === "and" ? "#C4A35A" : "#FFFFFF",
                color: group.logic === "and" ? "#FFFFFF" : "#6B6B6B",
                fontSize: "12px",
                fontWeight: 500,
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              ALL
            </button>
            <button
              onClick={() => onUpdate({ logic: "or" })}
              style={{
                padding: "6px 14px",
                border: "none",
                borderLeft: "1px solid #E8E4DF",
                backgroundColor: group.logic === "or" ? "#C4A35A" : "#FFFFFF",
                color: group.logic === "or" ? "#FFFFFF" : "#6B6B6B",
                fontSize: "12px",
                fontWeight: 500,
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              ANY
            </button>
          </div>
          <span style={{ fontSize: "13px", color: "#6B6B6B" }}>
            of the following conditions
          </span>
        </div>
        
        {showRemove && (
          <button
            onClick={onRemove}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 12px",
              border: "none",
              borderRadius: "6px",
              backgroundColor: "transparent",
              color: "#B85C5C",
              fontSize: "12px",
              cursor: "pointer",
              transition: "background-color 0.2s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(184, 92, 92, 0.1)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            <Trash2 style={{ width: "14px", height: "14px" }} />
            Remove Group
          </button>
        )}
      </div>
      
      {/* Conditions */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {group.conditions.map((condition, index) => (
          <div key={condition.id}>
            {index > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "4px 0",
                }}
              >
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 500,
                    color: "#C4A35A",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {group.logic === "and" ? "AND" : "OR"}
                </span>
                <div
                  style={{
                    flex: 1,
                    height: "1px",
                    backgroundColor: "#E8E4DF",
                  }}
                />
              </div>
            )}
            <FilterConditionRow
              condition={condition}
              onUpdate={(updates) => updateCondition(condition.id, updates)}
              onRemove={() => removeCondition(condition.id)}
              showRemove={group.conditions.length > 1}
            />
          </div>
        ))}
      </div>
      
      {/* Add condition button */}
      <button
        onClick={addCondition}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          marginTop: "12px",
          padding: "8px 14px",
          border: "1px dashed #C4A35A",
          borderRadius: "6px",
          backgroundColor: "transparent",
          color: "#C4A35A",
          fontSize: "13px",
          fontWeight: 500,
          cursor: "pointer",
          transition: "all 0.2s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "rgba(196, 163, 90, 0.1)"
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent"
        }}
      >
        <Plus style={{ width: "14px", height: "14px" }} />
        Add Condition
      </button>
    </div>
  )
}

/**
 * Advanced filter builder component
 * 
 * Allows building complex filters with multiple groups and conditions
 * for filtering guests by their attributes.
 * 
 * Requirements: 4.2 - Filter builder for guest attributes
 */
function AdvancedFilterBuilder({
  filterGroups,
  onChange,
}: {
  filterGroups: FilterGroup[]
  onChange: (groups: FilterGroup[]) => void
}) {
  const addGroup = () => {
    const newGroup: FilterGroup = {
      id: generateFilterId(),
      logic: "and",
      conditions: [
        {
          id: generateFilterId(),
          field: "firstName",
          operator: "contains",
          value: "",
        },
      ],
    }
    onChange([...filterGroups, newGroup])
  }
  
  const updateGroup = (groupId: string, updates: Partial<FilterGroup>) => {
    onChange(
      filterGroups.map((g) => (g.id === groupId ? { ...g, ...updates } : g))
    )
  }
  
  const removeGroup = (groupId: string) => {
    onChange(filterGroups.filter((g) => g.id !== groupId))
  }
  
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "16px",
        }}
      >
        <div>
          <label
            style={{
              display: "block",
              fontSize: "13px",
              fontWeight: 500,
              color: "#2C2C2C",
              marginBottom: "4px",
            }}
          >
            Guest Attribute Filters
          </label>
          <p style={{ fontSize: "12px", color: "#6B6B6B", margin: 0 }}>
            Filter recipients by their profile attributes
          </p>
        </div>
      </div>
      
      {filterGroups.length === 0 ? (
        <div
          style={{
            padding: "24px",
            backgroundColor: "#F5F3F0",
            borderRadius: "10px",
            border: "1px dashed #E8E4DF",
            textAlign: "center",
          }}
        >
          <Filter
            style={{
              width: "32px",
              height: "32px",
              color: "#9A9A9A",
              marginBottom: "12px",
            }}
          />
          <p
            style={{
              fontSize: "14px",
              color: "#6B6B6B",
              marginBottom: "16px",
            }}
          >
            No attribute filters configured. Add a filter group to narrow down recipients.
          </p>
          <button
            onClick={addGroup}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 18px",
              border: "none",
              borderRadius: "8px",
              backgroundColor: "#C4A35A",
              color: "#FFFFFF",
              fontSize: "14px",
              fontWeight: 500,
              cursor: "pointer",
              transition: "background-color 0.2s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#B8956B")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#C4A35A")}
          >
            <Plus style={{ width: "16px", height: "16px" }} />
            Add Filter Group
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {filterGroups.map((group, index) => (
            <div key={group.id}>
              {index > 0 && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "8px 0",
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      height: "1px",
                      backgroundColor: "#E8E4DF",
                    }}
                  />
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#C4A35A",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    AND
                  </span>
                  <div
                    style={{
                      flex: 1,
                      height: "1px",
                      backgroundColor: "#E8E4DF",
                    }}
                  />
                </div>
              )}
              <FilterGroupComponent
                group={group}
                onUpdate={(updates) => updateGroup(group.id, updates)}
                onRemove={() => removeGroup(group.id)}
                showRemove={filterGroups.length > 0}
              />
            </div>
          ))}
          
          <button
            onClick={addGroup}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              padding: "12px",
              border: "1px dashed #C4A35A",
              borderRadius: "8px",
              backgroundColor: "transparent",
              color: "#C4A35A",
              fontSize: "14px",
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "rgba(196, 163, 90, 0.1)"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent"
            }}
          >
            <Plus style={{ width: "16px", height: "16px" }} />
            Add Another Filter Group
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Parse CSV file and extract recipients
 * 
 * @param file - The CSV file to parse
 * @returns Promise with parsed file result
 */
async function parseCSVFile(file: File): Promise<FileParseResult> {
  return new Promise((resolve) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = results.meta.fields || []
        const errors: string[] = []
        const warnings: string[] = []
        const recipients: ParsedRecipient[] = []
        
        // Find email column (case-insensitive)
        const emailColumnIndex = headers.findIndex(
          (h) => h.toLowerCase() === "email" || h.toLowerCase() === "e-mail"
        )
        const emailColumn = emailColumnIndex >= 0 ? headers[emailColumnIndex] : null
        
        if (!emailColumn) {
          errors.push("No 'email' column found in the file. Please ensure your file has an 'email' column.")
          resolve({
            recipients: [],
            headers,
            errors,
            warnings,
            totalRows: results.data.length,
            validRows: 0,
            invalidRows: results.data.length,
          })
          return
        }
        
        // Find other common columns (case-insensitive)
        const findColumn = (names: string[]): string | null => {
          const found = headers.find((h) =>
            names.some((n) => h.toLowerCase() === n.toLowerCase())
          )
          return found || null
        }
        
        const firstNameColumn = findColumn(["firstName", "first_name", "first name", "firstname"])
        const lastNameColumn = findColumn(["lastName", "last_name", "last name", "lastname"])
        const companyColumn = findColumn(["company", "organization", "org"])
        const jobTitleColumn = findColumn(["jobTitle", "job_title", "job title", "jobtitle", "title", "position"])
        
        // Process each row
        let invalidCount = 0
        ;(results.data as Record<string, string>[]).forEach((row, index) => {
          const email = row[emailColumn]?.trim()
          
          // Validate email
          if (!email) {
            warnings.push(`Row ${index + 2}: Empty email address, skipped`)
            invalidCount++
            return
          }
          
          // Basic email validation
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
          if (!emailRegex.test(email)) {
            warnings.push(`Row ${index + 2}: Invalid email format "${email}", skipped`)
            invalidCount++
            return
          }
          
          const recipient: ParsedRecipient = {
            email,
            firstName: firstNameColumn ? row[firstNameColumn]?.trim() : undefined,
            lastName: lastNameColumn ? row[lastNameColumn]?.trim() : undefined,
            company: companyColumn ? row[companyColumn]?.trim() : undefined,
            jobTitle: jobTitleColumn ? row[jobTitleColumn]?.trim() : undefined,
          }
          
          // Add all other columns as custom fields
          headers.forEach((header) => {
            if (
              header !== emailColumn &&
              header !== firstNameColumn &&
              header !== lastNameColumn &&
              header !== companyColumn &&
              header !== jobTitleColumn
            ) {
              recipient[header] = row[header]?.trim()
            }
          })
          
          recipients.push(recipient)
        })
        
        // Check for duplicate emails
        const emailSet = new Set<string>()
        const duplicates: string[] = []
        recipients.forEach((r) => {
          const lowerEmail = r.email.toLowerCase()
          if (emailSet.has(lowerEmail)) {
            duplicates.push(r.email)
          } else {
            emailSet.add(lowerEmail)
          }
        })
        
        if (duplicates.length > 0) {
          warnings.push(`Found ${duplicates.length} duplicate email(s) in the file`)
        }
        
        resolve({
          recipients,
          headers,
          errors,
          warnings,
          totalRows: results.data.length,
          validRows: recipients.length,
          invalidRows: invalidCount,
        })
      },
      error: (error) => {
        resolve({
          recipients: [],
          headers: [],
          errors: [`Failed to parse file: ${error.message}`],
          warnings: [],
          totalRows: 0,
          validRows: 0,
          invalidRows: 0,
        })
      },
    })
  })
}

/**
 * File parse result preview component
 * 
 * Shows a preview of the parsed file data with statistics and sample rows
 */
function FileParsePreview({
  parseResult,
  file,
  onRemove,
}: {
  parseResult: FileParseResult
  file: File
  onRemove: () => void
}) {
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
  
  const hasErrors = parseResult.errors.length > 0
  const hasWarnings = parseResult.warnings.length > 0
  const previewRecipients = parseResult.recipients.slice(0, 5)
  
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* File info header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px",
          border: hasErrors ? "1px solid #B85C5C" : "1px solid #5C8A6B",
          borderRadius: "12px",
          backgroundColor: hasErrors ? "rgba(184, 92, 92, 0.05)" : "rgba(92, 138, 107, 0.05)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "44px",
              height: "44px",
              borderRadius: "10px",
              backgroundColor: hasErrors ? "rgba(184, 92, 92, 0.1)" : "rgba(92, 138, 107, 0.1)",
            }}
          >
            {hasErrors ? (
              <AlertCircle style={{ width: "22px", height: "22px", color: "#B85C5C" }} />
            ) : (
              <CheckCircle2 style={{ width: "22px", height: "22px", color: "#5C8A6B" }} />
            )}
          </div>
          <div>
            <div style={{ fontSize: "14px", fontWeight: 500, color: "#2C2C2C" }}>
              {file.name}
            </div>
            <div style={{ fontSize: "12px", color: "#6B6B6B" }}>
              {formatFileSize(file.size)} • {parseResult.totalRows} rows
            </div>
          </div>
        </div>
        <button
          onClick={onRemove}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "32px",
            height: "32px",
            border: "none",
            borderRadius: "8px",
            backgroundColor: "transparent",
            cursor: "pointer",
            transition: "background-color 0.2s ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#E8E4DF")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
        >
          <X style={{ width: "18px", height: "18px", color: "#6B6B6B" }} />
        </button>
      </div>
      
      {/* Errors */}
      {hasErrors && (
        <div
          style={{
            padding: "12px 16px",
            backgroundColor: "rgba(184, 92, 92, 0.1)",
            borderRadius: "8px",
            border: "1px solid rgba(184, 92, 92, 0.2)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "8px",
            }}
          >
            <AlertCircle style={{ width: "16px", height: "16px", color: "#B85C5C" }} />
            <span style={{ fontSize: "13px", fontWeight: 500, color: "#B85C5C" }}>
              Errors ({parseResult.errors.length})
            </span>
          </div>
          <ul style={{ margin: 0, paddingLeft: "24px" }}>
            {parseResult.errors.map((error, index) => (
              <li key={index} style={{ fontSize: "12px", color: "#B85C5C", marginBottom: "4px" }}>
                {error}
              </li>
            ))}
          </ul>
        </div>
      )}
      
      {/* Warnings */}
      {hasWarnings && !hasErrors && (
        <div
          style={{
            padding: "12px 16px",
            backgroundColor: "rgba(196, 163, 90, 0.1)",
            borderRadius: "8px",
            border: "1px solid rgba(196, 163, 90, 0.2)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "8px",
            }}
          >
            <AlertCircle style={{ width: "16px", height: "16px", color: "#C4A35A" }} />
            <span style={{ fontSize: "13px", fontWeight: 500, color: "#C4A35A" }}>
              Warnings ({parseResult.warnings.length})
            </span>
          </div>
          <ul style={{ margin: 0, paddingLeft: "24px", maxHeight: "100px", overflowY: "auto" }}>
            {parseResult.warnings.slice(0, 10).map((warning, index) => (
              <li key={index} style={{ fontSize: "12px", color: "#C4A35A", marginBottom: "4px" }}>
                {warning}
              </li>
            ))}
            {parseResult.warnings.length > 10 && (
              <li style={{ fontSize: "12px", color: "#C4A35A", fontStyle: "italic" }}>
                ...and {parseResult.warnings.length - 10} more warnings
              </li>
            )}
          </ul>
        </div>
      )}
      
      {/* Statistics */}
      {!hasErrors && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "12px",
          }}
        >
          <div
            style={{
              padding: "16px",
              backgroundColor: "#FAFAFA",
              borderRadius: "8px",
              border: "1px solid #E8E4DF",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "24px", fontWeight: 600, color: "#5C8A6B" }}>
              {parseResult.validRows.toLocaleString()}
            </div>
            <div style={{ fontSize: "12px", color: "#6B6B6B", marginTop: "4px" }}>
              Valid Recipients
            </div>
          </div>
          <div
            style={{
              padding: "16px",
              backgroundColor: "#FAFAFA",
              borderRadius: "8px",
              border: "1px solid #E8E4DF",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "24px", fontWeight: 600, color: "#2C2C2C" }}>
              {parseResult.headers.length}
            </div>
            <div style={{ fontSize: "12px", color: "#6B6B6B", marginTop: "4px" }}>
              Columns Found
            </div>
          </div>
          <div
            style={{
              padding: "16px",
              backgroundColor: "#FAFAFA",
              borderRadius: "8px",
              border: "1px solid #E8E4DF",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: "24px",
                fontWeight: 600,
                color: parseResult.invalidRows > 0 ? "#C4A35A" : "#5C8A6B",
              }}
            >
              {parseResult.invalidRows}
            </div>
            <div style={{ fontSize: "12px", color: "#6B6B6B", marginTop: "4px" }}>
              Skipped Rows
            </div>
          </div>
        </div>
      )}
      
      {/* Preview table */}
      {!hasErrors && previewRecipients.length > 0 && (
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "12px",
            }}
          >
            <Table style={{ width: "16px", height: "16px", color: "#6B6B6B" }} />
            <span style={{ fontSize: "13px", fontWeight: 500, color: "#2C2C2C" }}>
              Preview (first {previewRecipients.length} recipients)
            </span>
          </div>
          <div
            style={{
              border: "1px solid #E8E4DF",
              borderRadius: "8px",
              overflow: "hidden",
            }}
          >
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "13px",
                }}
              >
                <thead>
                  <tr style={{ backgroundColor: "#F5F3F0" }}>
                    <th
                      style={{
                        padding: "10px 12px",
                        textAlign: "left",
                        fontWeight: 500,
                        color: "#2C2C2C",
                        borderBottom: "1px solid #E8E4DF",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <Mail style={{ width: "14px", height: "14px" }} />
                        Email
                      </div>
                    </th>
                    {previewRecipients[0]?.firstName !== undefined && (
                      <th
                        style={{
                          padding: "10px 12px",
                          textAlign: "left",
                          fontWeight: 500,
                          color: "#2C2C2C",
                          borderBottom: "1px solid #E8E4DF",
                          whiteSpace: "nowrap",
                        }}
                      >
                        First Name
                      </th>
                    )}
                    {previewRecipients[0]?.lastName !== undefined && (
                      <th
                        style={{
                          padding: "10px 12px",
                          textAlign: "left",
                          fontWeight: 500,
                          color: "#2C2C2C",
                          borderBottom: "1px solid #E8E4DF",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Last Name
                      </th>
                    )}
                    {previewRecipients[0]?.company !== undefined && (
                      <th
                        style={{
                          padding: "10px 12px",
                          textAlign: "left",
                          fontWeight: 500,
                          color: "#2C2C2C",
                          borderBottom: "1px solid #E8E4DF",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Company
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {previewRecipients.map((recipient, index) => (
                    <tr
                      key={index}
                      style={{
                        backgroundColor: index % 2 === 0 ? "#FFFFFF" : "#FAFAFA",
                      }}
                    >
                      <td
                        style={{
                          padding: "10px 12px",
                          color: "#2C2C2C",
                          borderBottom:
                            index < previewRecipients.length - 1
                              ? "1px solid #E8E4DF"
                              : "none",
                        }}
                      >
                        {recipient.email}
                      </td>
                      {recipient.firstName !== undefined && (
                        <td
                          style={{
                            padding: "10px 12px",
                            color: "#6B6B6B",
                            borderBottom:
                              index < previewRecipients.length - 1
                                ? "1px solid #E8E4DF"
                                : "none",
                          }}
                        >
                          {recipient.firstName || "—"}
                        </td>
                      )}
                      {recipient.lastName !== undefined && (
                        <td
                          style={{
                            padding: "10px 12px",
                            color: "#6B6B6B",
                            borderBottom:
                              index < previewRecipients.length - 1
                                ? "1px solid #E8E4DF"
                                : "none",
                          }}
                        >
                          {recipient.lastName || "—"}
                        </td>
                      )}
                      {recipient.company !== undefined && (
                        <td
                          style={{
                            padding: "10px 12px",
                            color: "#6B6B6B",
                            borderBottom:
                              index < previewRecipients.length - 1
                                ? "1px solid #E8E4DF"
                                : "none",
                          }}
                        >
                          {recipient.company || "—"}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parseResult.validRows > 5 && (
              <div
                style={{
                  padding: "10px 12px",
                  backgroundColor: "#F5F3F0",
                  borderTop: "1px solid #E8E4DF",
                  textAlign: "center",
                  fontSize: "12px",
                  color: "#6B6B6B",
                }}
              >
                ...and {(parseResult.validRows - 5).toLocaleString()} more recipients
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Detected columns info */}
      {!hasErrors && (
        <div
          style={{
            padding: "12px 16px",
            backgroundColor: "rgba(92, 138, 107, 0.05)",
            borderRadius: "8px",
            border: "1px solid rgba(92, 138, 107, 0.2)",
          }}
        >
          <div style={{ fontSize: "12px", color: "#5C8A6B" }}>
            <strong>Detected columns:</strong> {parseResult.headers.join(", ")}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * File upload component with parsing support
 * 
 * Requirements: 4.2 - File upload for custom recipient list
 */
function FileUploader({
  file,
  parseResult,
  isParsing,
  onFileSelect,
  onFileRemove,
  error,
}: {
  file: File | null
  parseResult: FileParseResult | null
  isParsing: boolean
  onFileSelect: (file: File) => void
  onFileRemove: () => void
  error: string | null
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])
  
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])
  
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      
      const droppedFile = e.dataTransfer.files[0]
      if (droppedFile) {
        onFileSelect(droppedFile)
      }
    },
    [onFileSelect]
  )
  
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0]
      if (selectedFile) {
        onFileSelect(selectedFile)
      }
    },
    [onFileSelect]
  )
  
  // Show parsing state
  if (isParsing && file) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 20px",
          border: "1px solid #E8E4DF",
          borderRadius: "12px",
          backgroundColor: "#FAFAFA",
        }}
      >
        <Loader2
          style={{
            width: "32px",
            height: "32px",
            color: "#C4A35A",
            animation: "spin 1s linear infinite",
            marginBottom: "16px",
          }}
        />
        <div style={{ fontSize: "15px", fontWeight: 500, color: "#2C2C2C", marginBottom: "6px" }}>
          Processing {file.name}...
        </div>
        <div style={{ fontSize: "13px", color: "#6B6B6B" }}>
          Parsing and validating recipients
        </div>
      </div>
    )
  }
  
  // Show parsed result
  if (file && parseResult) {
    return (
      <FileParsePreview
        parseResult={parseResult}
        file={file}
        onRemove={onFileRemove}
      />
    )
  }
  
  // Show upload dropzone
  return (
    <div>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 20px",
          border: `2px dashed ${isDragging ? "#C4A35A" : "#E8E4DF"}`,
          borderRadius: "12px",
          backgroundColor: isDragging ? "rgba(196, 163, 90, 0.05)" : "#FAFAFA",
          cursor: "pointer",
          transition: "all 0.2s ease",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "56px",
            height: "56px",
            borderRadius: "14px",
            backgroundColor: "#F5F3F0",
            marginBottom: "16px",
          }}
        >
          <Upload style={{ width: "28px", height: "28px", color: "#6B6B6B" }} />
        </div>
        <div
          style={{
            fontSize: "15px",
            fontWeight: 500,
            color: "#2C2C2C",
            marginBottom: "6px",
          }}
        >
          Drop your file here or click to browse
        </div>
        <div style={{ fontSize: "13px", color: "#6B6B6B", marginBottom: "12px" }}>
          Supports CSV files up to 10MB
        </div>
        <div
          style={{
            fontSize: "12px",
            color: "#9A9A9A",
            padding: "8px 12px",
            backgroundColor: "#F5F3F0",
            borderRadius: "6px",
          }}
        >
          Required column: <strong>email</strong> • Optional: firstName, lastName, company, jobTitle
        </div>
      </div>
      
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_FILE_TYPES}
        onChange={handleFileChange}
        style={{ display: "none" }}
      />
      
      {error && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginTop: "12px",
            padding: "12px 16px",
            backgroundColor: "rgba(184, 92, 92, 0.1)",
            borderRadius: "8px",
          }}
        >
          <AlertCircle style={{ width: "16px", height: "16px", color: "#B85C5C" }} />
          <span style={{ fontSize: "13px", color: "#B85C5C" }}>{error}</span>
        </div>
      )}
    </div>
  )
}

/**
 * Recipient count summary component
 */
function RecipientCountSummary({
  count,
  isLoading,
  selectionType,
}: {
  count: number
  isLoading: boolean
  selectionType: RecipientSelectionType
}) {
  if (!selectionType) return null
  
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "16px 20px",
        backgroundColor: count > 0 ? "rgba(92, 138, 107, 0.1)" : "#F5F3F0",
        borderRadius: "12px",
        marginTop: "24px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <Users
          style={{
            width: "20px",
            height: "20px",
            color: count > 0 ? "#5C8A6B" : "#6B6B6B",
          }}
        />
        <span
          style={{
            fontSize: "14px",
            fontWeight: 500,
            color: count > 0 ? "#5C8A6B" : "#6B6B6B",
          }}
        >
          Total Recipients
        </span>
      </div>
      <div
        style={{
          fontSize: "20px",
          fontWeight: 600,
          color: count > 0 ? "#5C8A6B" : "#6B6B6B",
        }}
      >
        {isLoading ? (
          <Loader2
            style={{
              width: "20px",
              height: "20px",
              animation: "spin 1s linear infinite",
            }}
          />
        ) : (
          count.toLocaleString()
        )}
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Step Recipients Component
 * 
 * Allows users to select campaign recipients through three methods:
 * - By event: Select an event and optionally filter its guests
 * - By filter: Build filters based on guest attributes
 * - By upload: Upload a CSV/Excel file with recipient list
 * 
 * @param props - Component props
 * @returns Step recipients component
 * 
 * Requirements: 4 (Multi-Step Campaign Creation Wizard)
 * Requirements: 4.2 - Recipients (select event, filter guests, or upload list)
 */
export function StepRecipients({ data, onChange }: StepRecipientsProps) {
  const [fileError, setFileError] = useState<string | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  
  // Fetch events with guest counts for the event selector
  // Requirements: 4.2 - Event selector with guest count preview
  const { data: eventsResponse, isLoading: isLoadingEvents } = useAdminEventsWithGuestCounts()
  const events = eventsResponse?.data ?? []
  
  // Fetch event guests when an event is selected
  const { data: eventGuests = [], isLoading: isLoadingGuests } = useEventGuests(
    data.eventId || ""
  )
  
  // Fetch tags for the selected event
  const { data: tags = [], isLoading: isLoadingTags } = useGuestTagsByEvent(
    data.eventId || ""
  )
  
  /**
   * Apply a single filter condition to a guest
   * 
   * @param guest - The guest object to check
   * @param condition - The filter condition to apply
   * @returns Whether the guest matches the condition
   */
  const applyFilterCondition = useCallback(
    (guest: Guest, condition: FilterCondition): boolean => {
      const fieldValue = guest[condition.field as keyof Guest]
      const stringValue = fieldValue != null ? String(fieldValue).toLowerCase() : ""
      const conditionValue = condition.value.toLowerCase()
      
      switch (condition.operator) {
        case "equals":
          return stringValue === conditionValue
        case "not_equals":
          return stringValue !== conditionValue
        case "contains":
          return stringValue.includes(conditionValue)
        case "not_contains":
          return !stringValue.includes(conditionValue)
        case "starts_with":
          return stringValue.startsWith(conditionValue)
        case "ends_with":
          return stringValue.endsWith(conditionValue)
        case "is_empty":
          return stringValue === ""
        case "is_not_empty":
          return stringValue !== ""
        default:
          return true
      }
    },
    []
  )
  
  /**
   * Apply a filter group (with AND/OR logic) to a guest
   * 
   * @param guest - The guest object to check
   * @param group - The filter group to apply
   * @returns Whether the guest matches the group conditions
   */
  const applyFilterGroup = useCallback(
    (guest: Guest, group: FilterGroup): boolean => {
      if (group.conditions.length === 0) return true
      
      if (group.logic === "and") {
        return group.conditions.every((condition) =>
          applyFilterCondition(guest, condition)
        )
      } else {
        return group.conditions.some((condition) =>
          applyFilterCondition(guest, condition)
        )
      }
    },
    [applyFilterCondition]
  )
  
  /**
   * Calculate recipient count based on selection type and filters
   * 
   * Requirements: 4.2 - Filter builder for guest attributes
   */
  const calculateRecipientCount = useCallback(() => {
    if ((data.recipientType === "event" || data.recipientType === "filter") && data.eventId) {
      let filteredGuests = eventGuests
      
      // Apply RSVP status filter
      if (data.filters.rsvpStatus && data.filters.rsvpStatus.length > 0) {
        filteredGuests = filteredGuests.filter((eg) =>
          data.filters.rsvpStatus!.includes(eg.rsvpStatus)
        )
      }
      
      // Apply check-in status filter
      if (data.filters.checkInStatus && data.filters.checkInStatus.length > 0) {
        filteredGuests = filteredGuests.filter((eg) =>
          data.filters.checkInStatus!.includes(eg.checkInStatus)
        )
      }
      
      // Apply tag filter
      // Note: Tag filtering would require additional data from the API
      // For now, we'll skip tag filtering in the count calculation
      
      // Apply advanced filter groups for guest attributes
      // Requirements: 4.2 - Filter builder for guest attributes
      if (data.filters.filterGroups && data.filters.filterGroups.length > 0) {
        filteredGuests = filteredGuests.filter((eg) => {
          // All filter groups must match (AND logic between groups)
          return data.filters.filterGroups!.every((group) =>
            applyFilterGroup(eg.guest, group)
          )
        })
      }
      
      return filteredGuests.length
    }
    
    if (data.recipientType === "upload" && data.parsedFileData) {
      // Return the valid rows count from parsed file data
      return data.parsedFileData.validRows
    }
    
    if (data.recipientType === "upload" && data.uploadedFile) {
      // File is uploaded but not yet parsed
      return 0
    }
    
    return 0
  }, [data, eventGuests, applyFilterGroup])
  
  // Update recipient count when filters change
  useEffect(() => {
    const count = calculateRecipientCount()
    if (count !== data.recipientCount) {
      onChange({ recipientCount: count })
    }
  }, [calculateRecipientCount, data.recipientCount, onChange])
  
  /**
   * Handle selection type change
   */
  const handleSelectionTypeChange = useCallback(
    (type: RecipientSelectionType) => {
      onChange({
        recipientType: type,
        // Reset filters when changing selection type
        filters: {},
        uploadedFile: null,
        parsedFileData: null,
        recipientCount: 0,
      })
      setFileError(null)
      setIsParsing(false)
    },
    [onChange]
  )
  
  /**
   * Handle event selection
   */
  const handleEventSelect = useCallback(
    (eventId: string) => {
      onChange({
        eventId,
        filters: {},
        recipientCount: 0,
      })
    },
    [onChange]
  )
  
  /**
   * Handle filter changes
   */
  const handleFilterChange = useCallback(
    (filterKey: keyof RecipientFilters, values: string[]) => {
      onChange({
        filters: {
          ...data.filters,
          [filterKey]: values,
        },
      })
    },
    [data.filters, onChange]
  )
  
  /**
   * Handle file selection and parsing
   * 
   * Requirements: 4.2 - File upload for custom recipient list
   */
  const handleFileSelect = useCallback(
    async (file: File) => {
      setFileError(null)
      
      // Validate file type - only CSV is supported for now
      const validTypes = ["text/csv"]
      const isCSV = validTypes.includes(file.type) || file.name.match(/\.csv$/i)
      
      if (!isCSV) {
        setFileError("Please upload a CSV file. Excel files (.xlsx, .xls) are not yet supported.")
        return
      }
      
      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        setFileError("File size must be less than 10MB")
        return
      }
      
      // Set file and start parsing
      onChange({ uploadedFile: file, parsedFileData: null, recipientCount: 0 })
      setIsParsing(true)
      
      try {
        const parseResult = await parseCSVFile(file)
        
        // Update with parsed data
        onChange({
          uploadedFile: file,
          parsedFileData: parseResult,
          recipientCount: parseResult.validRows,
        })
        
        // Set error if parsing failed
        if (parseResult.errors.length > 0) {
          setFileError(parseResult.errors[0])
        }
      } catch (err) {
        setFileError("Failed to parse file. Please check the file format.")
        onChange({ uploadedFile: null, parsedFileData: null, recipientCount: 0 })
      } finally {
        setIsParsing(false)
      }
    },
    [onChange]
  )
  
  /**
   * Handle file removal
   */
  const handleFileRemove = useCallback(() => {
    onChange({ uploadedFile: null, parsedFileData: null, recipientCount: 0 })
    setFileError(null)
    setIsParsing(false)
  }, [onChange])
  
  return (
    <div style={{ maxWidth: "800px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "32px" }}>
        <h2
          style={{
            fontSize: "24px",
            fontWeight: 300,
            letterSpacing: "0.02em",
            color: "#2C2C2C",
            marginBottom: "8px",
          }}
        >
          Select Recipients
        </h2>
        <p style={{ color: "#6B6B6B", fontSize: "14px" }}>
          Choose who will receive this campaign
        </p>
      </div>
      
      {/* Selection Type Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "16px",
          marginBottom: "32px",
        }}
      >
        {SELECTION_TYPES.map((type) => (
          <SelectionTypeCard
            key={type.value}
            type={type}
            isSelected={data.recipientType === type.value}
            onClick={() => handleSelectionTypeChange(type.value)}
          />
        ))}
      </div>
      
      {/* Selection Type Content */}
      {data.recipientType === "event" && (
        <div
          style={{
            padding: "24px",
            backgroundColor: "#F5F3F0",
            borderRadius: "12px",
          }}
        >
          <div style={{ marginBottom: "24px" }}>
            <label
              style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 500,
                color: "#2C2C2C",
                marginBottom: "10px",
              }}
            >
              Select Event <span style={{ color: "#B85C5C" }}>*</span>
            </label>
            <EventSelector
              events={events}
              selectedEventId={data.eventId}
              onSelect={handleEventSelect}
              isLoading={isLoadingEvents}
            />
          </div>
          
          {data.eventId && (
            <>
              <div
                style={{
                  height: "1px",
                  backgroundColor: "#E8E4DF",
                  margin: "24px 0",
                }}
              />
              
              <div style={{ marginBottom: "20px" }}>
                <h3
                  style={{
                    fontSize: "15px",
                    fontWeight: 500,
                    color: "#2C2C2C",
                    marginBottom: "16px",
                  }}
                >
                  Filter Recipients (Optional)
                </h3>
                
                <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                  <FilterChips
                    label="RSVP Status"
                    options={RSVP_STATUS_OPTIONS}
                    selectedValues={(data.filters.rsvpStatus as RSVPStatus[]) || []}
                    onChange={(values) => handleFilterChange("rsvpStatus", values)}
                  />
                  
                  <FilterChips
                    label="Check-in Status"
                    options={CHECK_IN_STATUS_OPTIONS}
                    selectedValues={(data.filters.checkInStatus as CheckInStatus[]) || []}
                    onChange={(values) => handleFilterChange("checkInStatus", values)}
                  />
                  
                  <TagSelector
                    tags={tags}
                    selectedTagIds={(data.filters.tags as string[]) || []}
                    onChange={(tagIds) => handleFilterChange("tags", tagIds)}
                    isLoading={isLoadingTags}
                  />
                  
                  {/* Divider between basic and advanced filters */}
                  <div
                    style={{
                      height: "1px",
                      backgroundColor: "#E8E4DF",
                      margin: "8px 0",
                    }}
                  />
                  
                  {/* Advanced filter builder for guest attributes */}
                  <AdvancedFilterBuilder
                    filterGroups={data.filters.filterGroups || []}
                    onChange={(groups) =>
                      onChange({
                        filters: {
                          ...data.filters,
                          filterGroups: groups,
                        },
                      })
                    }
                  />
                </div>
              </div>
            </>
          )}
        </div>
      )}
      
      {data.recipientType === "filter" && (
        <div
          style={{
            padding: "24px",
            backgroundColor: "#F5F3F0",
            borderRadius: "12px",
          }}
        >
          <div style={{ marginBottom: "24px" }}>
            <label
              style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 500,
                color: "#2C2C2C",
                marginBottom: "10px",
              }}
            >
              Select Event <span style={{ color: "#B85C5C" }}>*</span>
            </label>
            <EventSelector
              events={events}
              selectedEventId={data.eventId}
              onSelect={handleEventSelect}
              isLoading={isLoadingEvents}
            />
          </div>
          
          {data.eventId && (
            <>
              <div
                style={{
                  height: "1px",
                  backgroundColor: "#E8E4DF",
                  margin: "24px 0",
                }}
              />
              
              <div>
                <h3
                  style={{
                    fontSize: "15px",
                    fontWeight: 500,
                    color: "#2C2C2C",
                    marginBottom: "16px",
                  }}
                >
                  Build Your Filter
                </h3>
                
                <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                  {/* Basic status filters */}
                  <FilterChips
                    label="RSVP Status"
                    options={RSVP_STATUS_OPTIONS}
                    selectedValues={(data.filters.rsvpStatus as RSVPStatus[]) || []}
                    onChange={(values) => handleFilterChange("rsvpStatus", values)}
                  />
                  
                  <FilterChips
                    label="Check-in Status"
                    options={CHECK_IN_STATUS_OPTIONS}
                    selectedValues={(data.filters.checkInStatus as CheckInStatus[]) || []}
                    onChange={(values) => handleFilterChange("checkInStatus", values)}
                  />
                  
                  <TagSelector
                    tags={tags}
                    selectedTagIds={(data.filters.tags as string[]) || []}
                    onChange={(tagIds) => handleFilterChange("tags", tagIds)}
                    isLoading={isLoadingTags}
                  />
                  
                  {/* Divider between basic and advanced filters */}
                  <div
                    style={{
                      height: "1px",
                      backgroundColor: "#E8E4DF",
                      margin: "8px 0",
                    }}
                  />
                  
                  {/* Advanced filter builder for guest attributes */}
                  <AdvancedFilterBuilder
                    filterGroups={data.filters.filterGroups || []}
                    onChange={(groups) =>
                      onChange({
                        filters: {
                          ...data.filters,
                          filterGroups: groups,
                        },
                      })
                    }
                  />
                </div>
              </div>
            </>
          )}
        </div>
      )}
      
      {data.recipientType === "upload" && (
        <div
          style={{
            padding: "24px",
            backgroundColor: "#F5F3F0",
            borderRadius: "12px",
          }}
        >
          <FileUploader
            file={data.uploadedFile}
            parseResult={data.parsedFileData || null}
            isParsing={isParsing}
            onFileSelect={handleFileSelect}
            onFileRemove={handleFileRemove}
            error={fileError}
          />
        </div>
      )}
      
      {/* Recipient Count Summary */}
      <RecipientCountSummary
        count={data.recipientCount}
        isLoading={(isLoadingGuests && data.recipientType === "event") || isParsing}
        selectionType={data.recipientType}
      />
      
      {/* CSS for spinner animation */}
      <style jsx global>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  )
}

export default StepRecipients
