"use client"

/**
 * @fileoverview Step Upload Component - File upload step for import wizard
 * 
 * Handles CSV and Excel file upload with drag-and-drop support.
 * Validates file type and size before proceeding.
 * 
 * @module components/guests/import-wizard/step-upload
 * @requires react
 * 
 * Requirements: 8 (Full-Page Guest Import Wizard)
 */

import { useCallback, useState } from "react"
import { Upload, FileText, FileSpreadsheet, AlertCircle, X } from "lucide-react"

// ============================================================================
// TYPES
// ============================================================================

export interface StepUploadProps {
  file: File | null
  onFileSelect: (file: File | null) => void
}

// ============================================================================
// CONSTANTS
// ============================================================================

const ACCEPTED_FILE_TYPES = [
  ".csv",
  ".xlsx",
  ".xls",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]

const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB

// ============================================================================
// COMPONENT
// ============================================================================

export function StepUpload({ file, onFileSelect }: StepUploadProps) {
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const validateFile = useCallback((file: File): string | null => {
    // Check file type
    const ext = file.name.toLowerCase().split(".").pop()
    const isValidType = ext === "csv" || ext === "xlsx" || ext === "xls"
    if (!isValidType) {
      return "Please upload a CSV or Excel file (.csv, .xlsx, .xls)"
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return `File size exceeds maximum limit of ${MAX_FILE_SIZE / 1024 / 1024}MB`
    }

    return null
  }, [])

  const handleFile = useCallback((file: File) => {
    const validationError = validateFile(file)
    if (validationError) {
      setError(validationError)
      return
    }
    setError(null)
    onFileSelect(file)
  }, [validateFile, onFileSelect])

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0])
    }
  }, [handleFile])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0])
    }
  }, [handleFile])

  const handleRemoveFile = useCallback(() => {
    onFileSelect(null)
    setError(null)
  }, [onFileSelect])

  const getFileIcon = (fileName: string) => {
    const ext = fileName.toLowerCase().split(".").pop()
    if (ext === "xlsx" || ext === "xls") {
      return <FileSpreadsheet className="h-12 w-12 text-green-600" />
    }
    return <FileText className="h-12 w-12 text-ora-gold" />
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  return (
    <div style={{ maxWidth: "640px", margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: "32px" }}>
        <h2 style={{ fontSize: "24px", fontWeight: 300, color: "#2C2C2C", marginBottom: "8px" }}>
          Upload Your File
        </h2>
        <p style={{ fontSize: "14px", color: "#6B6B6B" }}>
          Select a CSV or Excel file containing your guest list
        </p>
      </div>

      {/* Upload Area */}
      <div
        className={`relative rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          dragActive
            ? "border-ora-gold bg-ora-gold/5"
            : file
            ? "border-green-500 bg-green-50"
            : "border-ora-sand hover:border-ora-stone"
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        style={{ minHeight: "200px", display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        {!file && (
          <input
            type="file"
            accept={ACCEPTED_FILE_TYPES.join(",")}
            onChange={handleFileChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        )}
        
        {file ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
            {getFileIcon(file.name)}
            <div>
              <p style={{ fontSize: "16px", fontWeight: 500, color: "#2C2C2C", marginBottom: "4px" }}>
                {file.name}
              </p>
              <p style={{ fontSize: "14px", color: "#6B6B6B" }}>
                {formatFileSize(file.size)}
              </p>
            </div>
            <button
              onClick={handleRemoveFile}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 16px",
                border: "1px solid #E8E4DF",
                borderRadius: "6px",
                backgroundColor: "transparent",
                fontSize: "14px",
                color: "#6B6B6B",
                cursor: "pointer",
              }}
            >
              <X style={{ width: "14px", height: "14px" }} />
              Remove file
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <Upload style={{ width: "48px", height: "48px", color: "#9A9A9A", marginBottom: "16px" }} />
            <p style={{ fontSize: "16px", fontWeight: 500, color: "#2C2C2C", marginBottom: "4px" }}>
              Drop your file here
            </p>
            <p style={{ fontSize: "14px", color: "#6B6B6B", marginBottom: "8px" }}>
              or click to browse
            </p>
            <p style={{ fontSize: "12px", color: "#9A9A9A" }}>
              Supports CSV, XLSX, XLS (max 100MB)
            </p>
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "12px 16px",
            marginTop: "16px",
            backgroundColor: "rgba(184, 92, 92, 0.1)",
            borderRadius: "8px",
            color: "#B85C5C",
          }}
        >
          <AlertCircle style={{ width: "16px", height: "16px", flexShrink: 0 }} />
          <span style={{ fontSize: "14px" }}>{error}</span>
        </div>
      )}

      {/* Format Guide */}
      <div
        style={{
          marginTop: "32px",
          padding: "20px",
          backgroundColor: "#F5F3F0",
          borderRadius: "8px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
          <AlertCircle style={{ width: "16px", height: "16px", color: "#C4A35A" }} />
          <h3 style={{ fontSize: "14px", fontWeight: 500, color: "#2C2C2C" }}>
            File Format Guide
          </h3>
        </div>
        <p style={{ fontSize: "13px", color: "#6B6B6B", marginBottom: "12px" }}>
          Your file should include a header row with column names. Common column names will be auto-detected:
        </p>
        <div
          style={{
            padding: "12px",
            backgroundColor: "#FAFAFA",
            borderRadius: "6px",
            fontFamily: "monospace",
            fontSize: "12px",
            color: "#2C2C2C",
            overflowX: "auto",
          }}
        >
          <div>firstName, lastName, email, mobile, company, jobTitle</div>
          <div style={{ color: "#6B6B6B", marginTop: "4px" }}>
            John, Doe, john@example.com, 966501234567, Acme Inc, Engineer
          </div>
        </div>
        <p style={{ fontSize: "12px", color: "#9A9A9A", marginTop: "12px" }}>
          <strong>Required:</strong> firstName, lastName, email &nbsp;|&nbsp;
          <strong>Optional:</strong> mobile, company, jobTitle
        </p>
      </div>

      {/* Phone Number Guide */}
      <div
        style={{
          marginTop: "16px",
          padding: "16px 20px",
          backgroundColor: "rgba(92, 122, 138, 0.08)",
          borderRadius: "8px",
          border: "1px solid rgba(92, 122, 138, 0.15)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
          <span style={{ fontSize: "15px" }}>📱</span>
          <h3 style={{ fontSize: "14px", fontWeight: 500, color: "#2C2C2C" }}>
            Phone Number Format
          </h3>
        </div>
        <p style={{ fontSize: "13px", color: "#4A4A4A", lineHeight: 1.6, marginBottom: "8px" }}>
          Phone numbers are validated for WhatsApp &amp; SMS delivery. Numbers must include the <strong>country code</strong> (without spaces or dashes).
        </p>
        <div
          style={{
            padding: "10px 12px",
            backgroundColor: "#FAFAFA",
            borderRadius: "6px",
            fontFamily: "monospace",
            fontSize: "12px",
            color: "#2C2C2C",
            marginBottom: "10px",
          }}
        >
          <div style={{ marginBottom: "2px" }}>
            <span style={{ color: "#5C8A6B" }}>✓</span> 966501234567 &nbsp;&nbsp;
            <span style={{ color: "#5C8A6B" }}>✓</span> +966501234567 &nbsp;&nbsp;
            <span style={{ color: "#5C8A6B" }}>✓</span> &apos;+966501234567
          </div>
          <div>
            <span style={{ color: "#B85C5C" }}>✗</span> 0501234567 <span style={{ color: "#9A9A9A" }}>(missing country code)</span> &nbsp;&nbsp;
            <span style={{ color: "#B85C5C" }}>✗</span> 12345 <span style={{ color: "#9A9A9A" }}>(too short)</span>
          </div>
        </div>
        <p style={{ fontSize: "12px", color: "#6B6B6B", lineHeight: 1.5 }}>
          <strong>Excel tip:</strong> Excel may strip the leading <code style={{ backgroundColor: "#E8E4DF", padding: "1px 4px", borderRadius: "3px", fontSize: "11px" }}>+</code> from phone numbers.
          To preserve it, prefix the cell with an apostrophe (<code style={{ backgroundColor: "#E8E4DF", padding: "1px 4px", borderRadius: "3px", fontSize: "11px" }}>&apos;+966501234567</code>) or a backtick (<code style={{ backgroundColor: "#E8E4DF", padding: "1px 4px", borderRadius: "3px", fontSize: "11px" }}>`+966501234567</code>).
          We automatically handle both formats — you can also omit the <code style={{ backgroundColor: "#E8E4DF", padding: "1px 4px", borderRadius: "3px", fontSize: "11px" }}>+</code> entirely and just use the digits with country code.
        </p>
        <p style={{ fontSize: "12px", color: "#9A9A9A", marginTop: "6px" }}>
          Invalid phone numbers will be skipped (the guest record is still imported, but without a phone number).
        </p>
      </div>
    </div>
  )
}

export default StepUpload
