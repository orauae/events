"use client"

/**
 * @fileoverview Step Header Selection - Select which row contains column headers
 * 
 * Allows users to select the row that contains column headers.
 * Supports skipping rows at the top of the file (e.g., title rows, metadata).
 * 
 * @module components/guests/import-wizard/step-header-selection
 * @requires react
 * 
 * Requirements: 8 (Full-Page Guest Import Wizard)
 */

import { useMemo } from "react"
import { Check, ArrowDown } from "lucide-react"
import type { FileParseResult } from "@/lib/services/import-parser"

// ============================================================================
// TYPES
// ============================================================================

export interface StepHeaderSelectionProps {
  parseResult: FileParseResult | null
  headerRowIndex: number
  onHeaderRowChange: (index: number) => void
}

// ============================================================================
// COMPONENT
// ============================================================================

export function StepHeaderSelection({
  parseResult,
  headerRowIndex,
  onHeaderRowChange,
}: StepHeaderSelectionProps) {
  // Show first 10 rows for selection
  const previewRows = useMemo(() => {
    if (!parseResult?.rawRows) return []
    return parseResult.rawRows.slice(0, Math.min(10, parseResult.rawRows.length))
  }, [parseResult])

  const maxColumns = useMemo(() => {
    return previewRows.reduce((max, row) => Math.max(max, row.length), 0)
  }, [previewRows])

  if (!parseResult || previewRows.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "48px" }}>
        <p style={{ color: "#6B6B6B" }}>No file data available. Please go back and upload a file.</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: "100%", margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: "32px" }}>
        <h2 style={{ fontSize: "24px", fontWeight: 300, color: "#2C2C2C", marginBottom: "8px" }}>
          Select Header Row
        </h2>
        <p style={{ fontSize: "14px", color: "#6B6B6B" }}>
          Click on the row that contains your column headers. Rows above it will be skipped.
        </p>
      </div>

      {/* Info Banner */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "12px 16px",
          marginBottom: "24px",
          backgroundColor: "rgba(196, 163, 90, 0.1)",
          borderRadius: "8px",
        }}
      >
        <ArrowDown style={{ width: "16px", height: "16px", color: "#C4A35A" }} />
        <span style={{ fontSize: "14px", color: "#C4A35A" }}>
          {headerRowIndex === 0 
            ? "Row 1 is selected as headers. Data import will start from row 2."
            : `Row ${headerRowIndex + 1} is selected as headers. ${headerRowIndex} row(s) will be skipped.`
          }
        </span>
      </div>

      {/* Preview Table */}
      <div
        style={{
          border: "1px solid #E8E4DF",
          borderRadius: "8px",
          overflow: "hidden",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "600px" }}>
            <thead>
              <tr style={{ backgroundColor: "#F5F3F0" }}>
                <th
                  style={{
                    padding: "12px 16px",
                    textAlign: "left",
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "#6B6B6B",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    width: "100px",
                    borderBottom: "1px solid #E8E4DF",
                  }}
                >
                  Row
                </th>
                {Array.from({ length: Math.min(maxColumns, 8) }).map((_, i) => (
                  <th
                    key={i}
                    style={{
                      padding: "12px 16px",
                      textAlign: "left",
                      fontSize: "12px",
                      fontWeight: 500,
                      color: "#6B6B6B",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      borderBottom: "1px solid #E8E4DF",
                    }}
                  >
                    Column {String.fromCharCode(65 + i)}
                  </th>
                ))}
                {maxColumns > 8 && (
                  <th
                    style={{
                      padding: "12px 16px",
                      textAlign: "left",
                      fontSize: "12px",
                      fontWeight: 500,
                      color: "#9A9A9A",
                      borderBottom: "1px solid #E8E4DF",
                    }}
                  >
                    +{maxColumns - 8} more
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, rowIndex) => {
                const isSelected = rowIndex === headerRowIndex
                const isSkipped = rowIndex < headerRowIndex
                const isData = rowIndex > headerRowIndex

                return (
                  <tr
                    key={rowIndex}
                    onClick={() => onHeaderRowChange(rowIndex)}
                    style={{
                      cursor: "pointer",
                      backgroundColor: isSelected 
                        ? "rgba(184, 149, 107, 0.15)" 
                        : isSkipped 
                          ? "rgba(154, 154, 154, 0.1)"
                          : isData
                            ? "#FAFAFA"
                            : "transparent",
                      borderBottom: "1px solid #E8E4DF",
                      transition: "background-color 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor = isSkipped 
                          ? "rgba(154, 154, 154, 0.15)"
                          : "rgba(184, 149, 107, 0.08)"
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor = isSkipped 
                          ? "rgba(154, 154, 154, 0.1)"
                          : isData
                            ? "#FAFAFA"
                            : "transparent"
                      }
                    }}
                  >
                    <td
                      style={{
                        padding: "12px 16px",
                        fontSize: "14px",
                        fontWeight: 500,
                        color: isSelected ? "#B8956B" : isSkipped ? "#9A9A9A" : "#2C2C2C",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      {isSelected && (
                        <Check style={{ width: "16px", height: "16px", color: "#B8956B" }} />
                      )}
                      <span>Row {rowIndex + 1}</span>
                      {isSelected && (
                        <span
                          style={{
                            fontSize: "10px",
                            padding: "2px 6px",
                            backgroundColor: "#B8956B",
                            color: "white",
                            borderRadius: "4px",
                            fontWeight: 500,
                          }}
                        >
                          HEADER
                        </span>
                      )}
                      {isSkipped && (
                        <span
                          style={{
                            fontSize: "10px",
                            padding: "2px 6px",
                            backgroundColor: "#9A9A9A",
                            color: "white",
                            borderRadius: "4px",
                            fontWeight: 500,
                          }}
                        >
                          SKIP
                        </span>
                      )}
                    </td>
                    {row.slice(0, 8).map((cell, cellIndex) => (
                      <td
                        key={cellIndex}
                        style={{
                          padding: "12px 16px",
                          fontSize: "13px",
                          color: isSelected ? "#B8956B" : isSkipped ? "#9A9A9A" : "#2C2C2C",
                          fontWeight: isSelected ? 500 : 400,
                          maxWidth: "200px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          textDecoration: isSkipped ? "line-through" : "none",
                        }}
                        title={cell}
                      >
                        {cell || <span style={{ color: "#E8E4DF" }}>—</span>}
                      </td>
                    ))}
                    {maxColumns > 8 && (
                      <td
                        style={{
                          padding: "12px 16px",
                          fontSize: "12px",
                          color: "#9A9A9A",
                          fontStyle: "italic",
                        }}
                      >
                        ...
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: "16px",
          padding: "12px 16px",
          backgroundColor: "#F5F3F0",
          borderRadius: "8px",
          fontSize: "14px",
        }}
      >
        <span style={{ color: "#6B6B6B" }}>
          Total rows in file: <strong style={{ color: "#2C2C2C" }}>{parseResult.rawRows.length}</strong>
        </span>
        <span style={{ color: "#6B6B6B" }}>
          Rows to import: <strong style={{ color: "#5C8A6B" }}>{parseResult.rawRows.length - headerRowIndex - 1}</strong>
        </span>
      </div>

      {/* Help Text */}
      <p style={{ fontSize: "12px", color: "#9A9A9A", marginTop: "16px", textAlign: "center" }}>
        Tip: If your file has a title or description at the top, click on the first row with actual column names.
      </p>
    </div>
  )
}

export default StepHeaderSelection
