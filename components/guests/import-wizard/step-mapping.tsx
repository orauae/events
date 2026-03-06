"use client"

/**
 * @fileoverview Step Mapping Component - Column mapping step for import wizard
 * 
 * Allows users to map file columns to guest fields.
 * Supports auto-detection of common column names.
 * 
 * @module components/guests/import-wizard/step-mapping
 * @requires react
 * 
 * Requirements: 8 (Full-Page Guest Import Wizard)
 */

import { useEffect, useMemo } from "react"
import { Check, AlertCircle, ArrowRight } from "lucide-react"
import type { ColumnMapping, FileParseResult } from "@/lib/services/import-parser"

// ============================================================================
// TYPES
// ============================================================================

export interface StepMappingProps {
  parseResult: FileParseResult | null
  mapping: ColumnMapping
  onMappingChange: (mapping: ColumnMapping) => void
  autoDetectedMapping: ColumnMapping | null
}

// ============================================================================
// CONSTANTS
// ============================================================================

const GUEST_FIELDS = [
  { key: "firstName", label: "First Name", required: true, description: "Guest's first name" },
  { key: "lastName", label: "Last Name", required: true, description: "Guest's last name" },
  { key: "email", label: "Email", required: true, description: "Email address for invitations" },
  { key: "mobile", label: "Mobile", required: false, description: "Phone number (optional)" },
  { key: "company", label: "Company", required: false, description: "Organization/company name" },
  { key: "jobTitle", label: "Job Title", required: false, description: "Position or role" },
  { key: "photoUrl", label: "Photo URL", required: false, description: "URL to guest's photo" },
] as const

// ============================================================================
// COMPONENT
// ============================================================================

export function StepMapping({
  parseResult,
  mapping,
  onMappingChange,
  autoDetectedMapping,
}: StepMappingProps) {
  // Apply auto-detected mapping on mount if mapping is empty
  useEffect(() => {
    if (autoDetectedMapping && !mapping.firstName && !mapping.lastName && !mapping.email) {
      onMappingChange(autoDetectedMapping)
    }
  }, [autoDetectedMapping, mapping, onMappingChange])

  const headers = useMemo(() => parseResult?.headers || [], [parseResult])

  const handleFieldChange = (field: keyof ColumnMapping, value: string) => {
    onMappingChange({
      ...mapping,
      [field]: value || undefined,
    })
  }

  const getMappedCount = () => {
    return Object.values(mapping).filter(Boolean).length
  }

  const getRequiredMappedCount = () => {
    return GUEST_FIELDS.filter(f => f.required && mapping[f.key as keyof ColumnMapping]).length
  }

  const requiredCount = GUEST_FIELDS.filter(f => f.required).length
  const allRequiredMapped = getRequiredMappedCount() === requiredCount

  // Get sample values for a column
  const getSampleValues = (columnName: string): string[] => {
    if (!parseResult?.rows || !columnName) return []
    const normalizedColumn = columnName.toLowerCase()
    return parseResult.rows
      .slice(0, 3)
      .map(row => row[normalizedColumn] || "")
      .filter(Boolean)
  }

  if (!parseResult) {
    return (
      <div style={{ textAlign: "center", padding: "48px" }}>
        <p style={{ color: "#6B6B6B" }}>No file data available. Please go back and upload a file.</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: "32px" }}>
        <h2 style={{ fontSize: "24px", fontWeight: 300, color: "#2C2C2C", marginBottom: "8px" }}>
          Map Your Columns
        </h2>
        <p style={{ fontSize: "14px", color: "#6B6B6B" }}>
          Match your file columns to guest fields. We&apos;ve auto-detected some mappings for you.
        </p>
      </div>

      {/* Status Banner */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          marginBottom: "24px",
          backgroundColor: allRequiredMapped ? "rgba(92, 138, 107, 0.1)" : "rgba(196, 163, 90, 0.1)",
          borderRadius: "8px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {allRequiredMapped ? (
            <Check style={{ width: "16px", height: "16px", color: "#5C8A6B" }} />
          ) : (
            <AlertCircle style={{ width: "16px", height: "16px", color: "#C4A35A" }} />
          )}
          <span style={{ fontSize: "14px", color: allRequiredMapped ? "#5C8A6B" : "#C4A35A" }}>
            {allRequiredMapped
              ? `All required fields mapped (${getMappedCount()} total)`
              : `${getRequiredMappedCount()} of ${requiredCount} required fields mapped`}
          </span>
        </div>
        <span style={{ fontSize: "12px", color: "#6B6B6B" }}>
          {parseResult.totalRows.toLocaleString()} rows found
        </span>
      </div>

      {/* Mapping Table */}
      <div
        style={{
          border: "1px solid #E8E4DF",
          borderRadius: "8px",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 40px 1fr 1fr",
            gap: "16px",
            padding: "12px 16px",
            backgroundColor: "#F5F3F0",
            borderBottom: "1px solid #E8E4DF",
            fontSize: "12px",
            fontWeight: 500,
            color: "#6B6B6B",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          <div>Guest Field</div>
          <div></div>
          <div>File Column</div>
          <div>Sample Values</div>
        </div>

        {/* Rows */}
        {GUEST_FIELDS.map((field) => {
          const currentValue = mapping[field.key as keyof ColumnMapping] || ""
          const sampleValues = getSampleValues(currentValue)
          const isMapped = Boolean(currentValue)

          return (
            <div
              key={field.key}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 40px 1fr 1fr",
                gap: "16px",
                padding: "16px",
                borderBottom: "1px solid #E8E4DF",
                alignItems: "center",
              }}
            >
              {/* Field Name */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "14px", fontWeight: 500, color: "#2C2C2C" }}>
                  {field.label}
                </span>
                {field.required && (
                  <span
                    style={{
                      fontSize: "10px",
                      padding: "2px 6px",
                      backgroundColor: "rgba(184, 92, 92, 0.1)",
                      color: "#B85C5C",
                      borderRadius: "4px",
                      fontWeight: 500,
                    }}
                  >
                    Required
                  </span>
                )}
              </div>

              {/* Arrow */}
              <div style={{ display: "flex", justifyContent: "center" }}>
                <ArrowRight
                  style={{
                    width: "16px",
                    height: "16px",
                    color: isMapped ? "#5C8A6B" : "#E8E4DF",
                  }}
                />
              </div>

              {/* Column Selector */}
              <div>
                <select
                  value={currentValue}
                  onChange={(e) => handleFieldChange(field.key as keyof ColumnMapping, e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: `1px solid ${isMapped ? "#5C8A6B" : "#E8E4DF"}`,
                    borderRadius: "6px",
                    backgroundColor: isMapped ? "rgba(92, 138, 107, 0.05)" : "#FAFAFA",
                    fontSize: "14px",
                    color: "#2C2C2C",
                    cursor: "pointer",
                  }}
                >
                  <option value="">-- Select column --</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </div>

              {/* Sample Values */}
              <div>
                {sampleValues.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    {sampleValues.map((value, idx) => (
                      <span
                        key={idx}
                        style={{
                          fontSize: "12px",
                          color: "#6B6B6B",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: "150px",
                        }}
                      >
                        {value}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span style={{ fontSize: "12px", color: "#9A9A9A", fontStyle: "italic" }}>
                    No preview
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Help Text */}
      <p style={{ fontSize: "12px", color: "#9A9A9A", marginTop: "16px", textAlign: "center" }}>
        Tip: Column names like &quot;first_name&quot;, &quot;firstname&quot;, or &quot;First Name&quot; are automatically detected.
      </p>
    </div>
  )
}

export default StepMapping
