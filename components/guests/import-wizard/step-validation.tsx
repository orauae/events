"use client"

/**
 * @fileoverview Step Validation Component - Data validation step for import wizard
 * 
 * Shows validation results with valid/invalid row counts and error details.
 * Displays a preview of the data to be imported.
 * 
 * @module components/guests/import-wizard/step-validation
 * @requires react
 * 
 * Requirements: 8 (Full-Page Guest Import Wizard)
 */

import { useState } from "react"
import { CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronUp, Phone } from "lucide-react"
import type { ValidationResult } from "@/lib/services/import-parser"

// ============================================================================
// TYPES
// ============================================================================

export interface StepValidationProps {
  validationResult: ValidationResult | null
  isValidating: boolean
}

// ============================================================================
// COMPONENT
// ============================================================================

export function StepValidation({ validationResult, isValidating }: StepValidationProps) {
  const [showErrors, setShowErrors] = useState(true)
  const [showWarnings, setShowWarnings] = useState(false)
  const [showPhoneWarnings, setShowPhoneWarnings] = useState(false)
  const [showPreview, setShowPreview] = useState(true)

  if (isValidating) {
    return (
      <div style={{ textAlign: "center", padding: "48px" }}>
        <div
          style={{
            width: "48px",
            height: "48px",
            margin: "0 auto 16px",
            border: "3px solid #E8E4DF",
            borderTopColor: "#C4A35A",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
          }}
        />
        <p style={{ fontSize: "16px", color: "#2C2C2C", marginBottom: "8px" }}>
          Validating your data...
        </p>
        <p style={{ fontSize: "14px", color: "#6B6B6B" }}>
          This may take a moment for large files
        </p>
        <style jsx>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    )
  }

  if (!validationResult) {
    return (
      <div style={{ textAlign: "center", padding: "48px" }}>
        <p style={{ color: "#6B6B6B" }}>No validation data available.</p>
      </div>
    )
  }

  const { totalRows, validRows, invalidRows, errors, warnings, preview, phoneWarnings } = validationResult
  const hasErrors = errors.length > 0
  const hasWarnings = warnings.length > 0
  const hasPhoneWarnings = (phoneWarnings?.length ?? 0) > 0

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: "32px" }}>
        <h2 style={{ fontSize: "24px", fontWeight: 300, color: "#2C2C2C", marginBottom: "8px" }}>
          Validation Results
        </h2>
        <p style={{ fontSize: "14px", color: "#6B6B6B" }}>
          Review the validation results before proceeding with the import
        </p>
      </div>

      {/* Summary Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        {/* Total Rows */}
        <div
          style={{
            padding: "20px",
            backgroundColor: "#F5F3F0",
            borderRadius: "8px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "32px", fontWeight: 300, color: "#2C2C2C", marginBottom: "4px" }}>
            {totalRows.toLocaleString()}
          </div>
          <div style={{ fontSize: "14px", color: "#6B6B6B" }}>Total Rows</div>
        </div>

        {/* Valid Rows */}
        <div
          style={{
            padding: "20px",
            backgroundColor: "rgba(92, 138, 107, 0.1)",
            borderRadius: "8px",
            textAlign: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginBottom: "4px" }}>
            <CheckCircle2 style={{ width: "24px", height: "24px", color: "#5C8A6B" }} />
            <span style={{ fontSize: "32px", fontWeight: 300, color: "#5C8A6B" }}>
              {validRows.toLocaleString()}
            </span>
          </div>
          <div style={{ fontSize: "14px", color: "#5C8A6B" }}>Valid Rows</div>
        </div>

        {/* Invalid Rows */}
        <div
          style={{
            padding: "20px",
            backgroundColor: invalidRows > 0 ? "rgba(184, 92, 92, 0.1)" : "rgba(92, 138, 107, 0.1)",
            borderRadius: "8px",
            textAlign: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginBottom: "4px" }}>
            {invalidRows > 0 ? (
              <XCircle style={{ width: "24px", height: "24px", color: "#B85C5C" }} />
            ) : (
              <CheckCircle2 style={{ width: "24px", height: "24px", color: "#5C8A6B" }} />
            )}
            <span style={{ fontSize: "32px", fontWeight: 300, color: invalidRows > 0 ? "#B85C5C" : "#5C8A6B" }}>
              {invalidRows.toLocaleString()}
            </span>
          </div>
          <div style={{ fontSize: "14px", color: invalidRows > 0 ? "#B85C5C" : "#5C8A6B" }}>
            Invalid Rows
          </div>
        </div>
      </div>

      {/* Errors Section */}
      {hasErrors && (
        <div
          style={{
            marginBottom: "16px",
            border: "1px solid rgba(184, 92, 92, 0.3)",
            borderRadius: "8px",
            overflow: "hidden",
          }}
        >
          <button
            onClick={() => setShowErrors(!showErrors)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 16px",
              backgroundColor: "rgba(184, 92, 92, 0.1)",
              border: "none",
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <XCircle style={{ width: "16px", height: "16px", color: "#B85C5C" }} />
              <span style={{ fontSize: "14px", fontWeight: 500, color: "#B85C5C" }}>
                {errors.length} Error{errors.length !== 1 ? "s" : ""}
              </span>
            </div>
            {showErrors ? (
              <ChevronUp style={{ width: "16px", height: "16px", color: "#B85C5C" }} />
            ) : (
              <ChevronDown style={{ width: "16px", height: "16px", color: "#B85C5C" }} />
            )}
          </button>
          {showErrors && (
            <div style={{ maxHeight: "200px", overflowY: "auto", padding: "12px 16px" }}>
              {errors.slice(0, 50).map((error, idx) => (
                <div
                  key={idx}
                  style={{
                    fontSize: "13px",
                    color: "#6B6B6B",
                    padding: "4px 0",
                    borderBottom: idx < errors.length - 1 ? "1px solid #E8E4DF" : "none",
                  }}
                >
                  <span style={{ color: "#B85C5C", fontWeight: 500 }}>Row {error.row}</span>
                  {error.column && <span> • {error.column}</span>}
                  {error.value && <span style={{ color: "#9A9A9A" }}> ({error.value})</span>}
                  : {error.error}
                </div>
              ))}
              {errors.length > 50 && (
                <div style={{ fontSize: "12px", color: "#9A9A9A", marginTop: "8px", fontStyle: "italic" }}>
                  ... and {errors.length - 50} more errors
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Warnings Section */}
      {hasWarnings && (
        <div
          style={{
            marginBottom: "16px",
            border: "1px solid rgba(196, 163, 90, 0.3)",
            borderRadius: "8px",
            overflow: "hidden",
          }}
        >
          <button
            onClick={() => setShowWarnings(!showWarnings)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 16px",
              backgroundColor: "rgba(196, 163, 90, 0.1)",
              border: "none",
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <AlertTriangle style={{ width: "16px", height: "16px", color: "#C4A35A" }} />
              <span style={{ fontSize: "14px", fontWeight: 500, color: "#C4A35A" }}>
                {warnings.length} Warning{warnings.length !== 1 ? "s" : ""}
              </span>
            </div>
            {showWarnings ? (
              <ChevronUp style={{ width: "16px", height: "16px", color: "#C4A35A" }} />
            ) : (
              <ChevronDown style={{ width: "16px", height: "16px", color: "#C4A35A" }} />
            )}
          </button>
          {showWarnings && (
            <div style={{ maxHeight: "200px", overflowY: "auto", padding: "12px 16px" }}>
              {warnings.slice(0, 50).map((warning, idx) => (
                <div
                  key={idx}
                  style={{
                    fontSize: "13px",
                    color: "#6B6B6B",
                    padding: "4px 0",
                    borderBottom: idx < warnings.length - 1 ? "1px solid #E8E4DF" : "none",
                  }}
                >
                  <span style={{ color: "#C4A35A", fontWeight: 500 }}>Row {warning.row}</span>
                  {warning.column && <span> • {warning.column}</span>}
                  : {warning.error}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Phone Number Warnings Section */}
      {hasPhoneWarnings && (
        <div
          style={{
            marginBottom: "16px",
            border: "1px solid rgba(92, 122, 138, 0.3)",
            borderRadius: "8px",
            overflow: "hidden",
          }}
        >
          <button
            onClick={() => setShowPhoneWarnings(!showPhoneWarnings)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 16px",
              backgroundColor: "rgba(92, 122, 138, 0.1)",
              border: "none",
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Phone style={{ width: "16px", height: "16px", color: "#5C7A8A" }} />
              <span style={{ fontSize: "14px", fontWeight: 500, color: "#5C7A8A" }}>
                {phoneWarnings!.length} Invalid Phone Number{phoneWarnings!.length !== 1 ? "s" : ""} — records will be imported without phone
              </span>
            </div>
            {showPhoneWarnings ? (
              <ChevronUp style={{ width: "16px", height: "16px", color: "#5C7A8A" }} />
            ) : (
              <ChevronDown style={{ width: "16px", height: "16px", color: "#5C7A8A" }} />
            )}
          </button>
          {showPhoneWarnings && (
            <div style={{ padding: "12px 16px" }}>
              <div
                style={{
                  padding: "10px 12px",
                  backgroundColor: "rgba(92, 122, 138, 0.06)",
                  borderRadius: "6px",
                  marginBottom: "12px",
                  fontSize: "13px",
                  color: "#4A4A4A",
                  lineHeight: 1.5,
                }}
              >
                <strong>Note:</strong> These rows will still be imported, but the phone number field will be left blank.
                Valid phone numbers must include a country code (e.g. <code style={{ backgroundColor: "#E8E4DF", padding: "1px 4px", borderRadius: "3px" }}>966501234567</code> or <code style={{ backgroundColor: "#E8E4DF", padding: "1px 4px", borderRadius: "3px" }}>+966501234567</code>).
                <br />
                <span style={{ fontSize: "12px", color: "#6B6B6B" }}>
                  💡 Excel tip: To preserve the <code style={{ backgroundColor: "#E8E4DF", padding: "1px 4px", borderRadius: "3px" }}>+</code> sign, prefix the number with an apostrophe in Excel (e.g. <code style={{ backgroundColor: "#E8E4DF", padding: "1px 4px", borderRadius: "3px" }}>&apos;+966501234567</code>). We handle both formats automatically.
                </span>
              </div>
              <div style={{ maxHeight: "200px", overflowY: "auto" }}>
                {phoneWarnings!.slice(0, 50).map((pw, idx) => (
                  <div
                    key={idx}
                    style={{
                      fontSize: "13px",
                      color: "#6B6B6B",
                      padding: "4px 0",
                      borderBottom: idx < phoneWarnings!.length - 1 ? "1px solid #E8E4DF" : "none",
                    }}
                  >
                    <span style={{ color: "#5C7A8A", fontWeight: 500 }}>Row {pw.row}</span>
                    <span style={{ color: "#9A9A9A" }}> ({pw.original})</span>
                    : {pw.reason}
                  </div>
                ))}
                {phoneWarnings!.length > 50 && (
                  <div style={{ fontSize: "12px", color: "#9A9A9A", marginTop: "8px", fontStyle: "italic" }}>
                    ... and {phoneWarnings!.length - 50} more invalid phone numbers
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Preview Section */}
      <div
        style={{
          border: "1px solid #E8E4DF",
          borderRadius: "8px",
          overflow: "hidden",
        }}
      >
        <button
          onClick={() => setShowPreview(!showPreview)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            backgroundColor: "#F5F3F0",
            border: "none",
            cursor: "pointer",
          }}
        >
          <span style={{ fontSize: "14px", fontWeight: 500, color: "#2C2C2C" }}>
            Data Preview (first {Math.min(preview.length, 10)} rows)
          </span>
          {showPreview ? (
            <ChevronUp style={{ width: "16px", height: "16px", color: "#6B6B6B" }} />
          ) : (
            <ChevronDown style={{ width: "16px", height: "16px", color: "#6B6B6B" }} />
          )}
        </button>
        {showPreview && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ backgroundColor: "#FAFAFA" }}>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 500, color: "#6B6B6B", borderBottom: "1px solid #E8E4DF" }}>
                    Row
                  </th>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 500, color: "#6B6B6B", borderBottom: "1px solid #E8E4DF" }}>
                    Status
                  </th>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 500, color: "#6B6B6B", borderBottom: "1px solid #E8E4DF" }}>
                    First Name
                  </th>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 500, color: "#6B6B6B", borderBottom: "1px solid #E8E4DF" }}>
                    Last Name
                  </th>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 500, color: "#6B6B6B", borderBottom: "1px solid #E8E4DF" }}>
                    Email
                  </th>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 500, color: "#6B6B6B", borderBottom: "1px solid #E8E4DF" }}>
                    Mobile
                  </th>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 500, color: "#6B6B6B", borderBottom: "1px solid #E8E4DF" }}>
                    Company
                  </th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 10).map((row) => (
                  <tr
                    key={row.rowNumber}
                    style={{
                      backgroundColor: row.isValid ? "transparent" : "rgba(184, 92, 92, 0.05)",
                    }}
                  >
                    <td style={{ padding: "8px 12px", borderBottom: "1px solid #E8E4DF", color: "#6B6B6B" }}>
                      {row.rowNumber}
                    </td>
                    <td style={{ padding: "8px 12px", borderBottom: "1px solid #E8E4DF" }}>
                      {row.isValid ? (
                        <CheckCircle2 style={{ width: "14px", height: "14px", color: "#5C8A6B" }} />
                      ) : (
                        <XCircle style={{ width: "14px", height: "14px", color: "#B85C5C" }} />
                      )}
                    </td>
                    <td style={{ padding: "8px 12px", borderBottom: "1px solid #E8E4DF", color: "#2C2C2C" }}>
                      {row.data.firstName || "-"}
                    </td>
                    <td style={{ padding: "8px 12px", borderBottom: "1px solid #E8E4DF", color: "#2C2C2C" }}>
                      {row.data.lastName || "-"}
                    </td>
                    <td style={{ padding: "8px 12px", borderBottom: "1px solid #E8E4DF", color: "#2C2C2C" }}>
                      {row.data.email || "-"}
                    </td>
                    <td style={{ padding: "8px 12px", borderBottom: "1px solid #E8E4DF", color: row.data.mobile ? "#2C2C2C" : "#9A9A9A" }}>
                      {row.data.mobile || "-"}
                    </td>
                    <td style={{ padding: "8px 12px", borderBottom: "1px solid #E8E4DF", color: "#2C2C2C" }}>
                      {row.data.company || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info Message */}
      {invalidRows > 0 && (
        <p style={{ fontSize: "13px", color: "#6B6B6B", marginTop: "16px", textAlign: "center" }}>
          Invalid rows will be skipped during import. You can download an error report after the import completes.
        </p>
      )}
    </div>
  )
}

export default StepValidation
