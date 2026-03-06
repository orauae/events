"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  Server,
  Plus,
  CheckCircle,
  AlertCircle,
  Trash2,
  Edit2,
  Star,
  TestTube,
  ChevronLeft,
  Loader2,
  Eye,
  EyeOff,
  Shield,
} from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { ORAAccentLine } from "@/components/ui/ora-brand"
import { toast } from "sonner"

/**
 * SMTP Settings Interface
 * Represents an SMTP configuration without the encrypted password
 */
interface SMTPSettingsPublic {
  id: string
  name: string
  host: string
  port: number
  username: string
  encryption: "tls" | "ssl" | "none"
  fromEmail: string
  fromName: string
  replyToEmail: string | null
  isDefault: boolean
  isActive: boolean
  dailyLimit: number | null
  hourlyLimit: number | null
  hasPassword: boolean
  createdAt: string
  updatedAt: string
}

/**
 * Form data for creating/editing SMTP settings
 */
interface SMTPFormData {
  name: string
  host: string
  port: number
  username: string
  password: string
  encryption: "tls" | "ssl" | "none"
  fromEmail: string
  fromName: string
  replyToEmail: string
  isDefault: boolean
  isActive: boolean
  dailyLimit: string
  hourlyLimit: string
}

const initialFormData: SMTPFormData = {
  name: "",
  host: "",
  port: 587,
  username: "",
  password: "",
  encryption: "tls",
  fromEmail: "",
  fromName: "",
  replyToEmail: "",
  isDefault: false,
  isActive: true,
  dailyLimit: "",
  hourlyLimit: "",
}

/**
 * SMTP Settings Page - Admin SMTP Configuration Management
 * 
 * Provides interface for managing SMTP server configurations including:
 * - List all SMTP configurations
 * - Create new configurations
 * - Edit existing configurations
 * - Test SMTP connections
 * - Set default provider
 * - Delete configurations
 * 
 * Requirements: 2 (SMTP Configuration Management)
 */
export default function SMTPSettingsPage() {
  const [settings, setSettings] = useState<SMTPSettingsPublic[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<SMTPFormData>(initialFormData)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  
  // Test connection state
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testEmail, setTestEmail] = useState("")
  const [showTestModal, setShowTestModal] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  // Fetch SMTP settings
  const fetchSettings = async () => {
    try {
      setIsLoading(true)
      const response = await fetch("/api/admin/smtp")
      if (!response.ok) {
        throw new Error("Failed to fetch SMTP settings")
      }
      const data = await response.json()
      setSettings(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load SMTP settings")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchSettings()
  }, [])

  // Handle form input changes
  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target
    const checked = (e.target as HTMLInputElement).checked
    
    setFormData(prev => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }))
  }

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const payload = {
        name: formData.name,
        host: formData.host,
        port: Number(formData.port),
        username: formData.username,
        password: formData.password,
        encryption: formData.encryption,
        fromEmail: formData.fromEmail,
        fromName: formData.fromName,
        replyToEmail: formData.replyToEmail || null,
        isDefault: formData.isDefault,
        isActive: formData.isActive,
        dailyLimit: formData.dailyLimit ? Number(formData.dailyLimit) : null,
        hourlyLimit: formData.hourlyLimit ? Number(formData.hourlyLimit) : null,
      }

      const url = editingId 
        ? `/api/admin/smtp/${editingId}`
        : "/api/admin/smtp"
      
      const method = editingId ? "PUT" : "POST"

      // For updates, only include password if it was changed
      if (editingId && !formData.password) {
        delete (payload as Record<string, unknown>).password
      }

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || "Failed to save SMTP settings")
      }

      toast.success(editingId ? "SMTP settings updated" : "SMTP settings created")
      setShowForm(false)
      setEditingId(null)
      setFormData(initialFormData)
      fetchSettings()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save SMTP settings")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle edit
  const handleEdit = (setting: SMTPSettingsPublic) => {
    setEditingId(setting.id)
    setFormData({
      name: setting.name,
      host: setting.host,
      port: setting.port,
      username: setting.username,
      password: "", // Don't populate password for security
      encryption: setting.encryption,
      fromEmail: setting.fromEmail,
      fromName: setting.fromName,
      replyToEmail: setting.replyToEmail || "",
      isDefault: setting.isDefault,
      isActive: setting.isActive,
      dailyLimit: setting.dailyLimit?.toString() || "",
      hourlyLimit: setting.hourlyLimit?.toString() || "",
    })
    setShowForm(true)
  }

  // Handle delete
  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this SMTP configuration?")) {
      return
    }

    try {
      const response = await fetch(`/api/admin/smtp/${id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || "Failed to delete SMTP settings")
      }

      toast.success("SMTP settings deleted")
      fetchSettings()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete SMTP settings")
    }
  }

  // Handle set default
  const handleSetDefault = async (id: string) => {
    try {
      const response = await fetch(`/api/admin/smtp/${id}/set-default`, {
        method: "POST",
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || "Failed to set default")
      }

      toast.success("Default SMTP provider updated")
      fetchSettings()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to set default")
    }
  }

  // Handle test connection
  const handleTestConnection = async () => {
    if (!testingId || !testEmail) return

    try {
      const response = await fetch(`/api/admin/smtp/${testingId}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testEmail }),
      })

      const result = await response.json()
      setTestResult(result)
      
      if (result.success) {
        toast.success(result.message)
      } else {
        toast.error(result.message)
      }
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : "Test failed",
      })
      toast.error("Failed to test connection")
    }
  }

  // Open test modal
  const openTestModal = (id: string) => {
    setTestingId(id)
    setTestEmail("")
    setTestResult(null)
    setShowTestModal(true)
  }

  if (isLoading) {
    return <SMTPSettingsSkeleton />
  }

  if (error) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "64px 0" }}>
        <AlertCircle style={{ width: "48px", height: "48px", color: "#B85C5C", marginBottom: "16px" }} />
        <h2 style={{ fontSize: "18px", fontWeight: 300, color: "#2C2C2C", marginBottom: "8px" }}>Error Loading Settings</h2>
        <p style={{ color: "#6B6B6B" }}>{error}</p>
      </div>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <Link
            href="/admin/settings"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "13px",
              color: "#6B6B6B",
              textDecoration: "none",
              marginBottom: "16px",
            }}
          >
            <ChevronLeft style={{ width: "16px", height: "16px" }} />
            Back to Settings
          </Link>
          <ORAAccentLine className="mb-4" />
          <h1 style={{ fontSize: "28px", fontWeight: 300, letterSpacing: "0.02em", color: "#2C2C2C", marginBottom: "8px" }}>
            SMTP Settings
          </h1>
          <p style={{ color: "#6B6B6B", fontSize: "14px" }}>
            Configure email delivery providers for sending campaigns
          </p>
        </div>
        <button
          onClick={() => {
            setEditingId(null)
            setFormData(initialFormData)
            setShowForm(true)
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "12px 24px",
            backgroundColor: "#2C2C2C",
            color: "#FAFAFA",
            fontSize: "14px",
            fontWeight: 500,
            letterSpacing: "0.02em",
            borderRadius: "9999px",
            border: "none",
            cursor: "pointer",
            transition: "all 0.2s ease",
          }}
        >
          <Plus style={{ width: "16px", height: "16px" }} />
          Add SMTP Provider
        </button>
      </div>

      {/* SMTP Settings List */}
      {settings.length === 0 ? (
        <EmptyState onAdd={() => setShowForm(true)} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {settings.map((setting) => (
            <SMTPSettingCard
              key={setting.id}
              setting={setting}
              onEdit={() => handleEdit(setting)}
              onDelete={() => handleDelete(setting.id)}
              onSetDefault={() => handleSetDefault(setting.id)}
              onTest={() => openTestModal(setting.id)}
            />
          ))}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <FormModal
          formData={formData}
          editingId={editingId}
          isSubmitting={isSubmitting}
          showPassword={showPassword}
          onInputChange={handleInputChange}
          onSubmit={handleSubmit}
          onClose={() => {
            setShowForm(false)
            setEditingId(null)
            setFormData(initialFormData)
          }}
          onTogglePassword={() => setShowPassword(!showPassword)}
        />
      )}

      {/* Test Connection Modal */}
      {showTestModal && (
        <TestModal
          testEmail={testEmail}
          testResult={testResult}
          onEmailChange={setTestEmail}
          onTest={handleTestConnection}
          onClose={() => {
            setShowTestModal(false)
            setTestingId(null)
            setTestEmail("")
            setTestResult(null)
          }}
        />
      )}
    </div>
  )
}


/**
 * SMTP Setting Card Component
 */
function SMTPSettingCard({
  setting,
  onEdit,
  onDelete,
  onSetDefault,
  onTest,
}: {
  setting: SMTPSettingsPublic
  onEdit: () => void
  onDelete: () => void
  onSetDefault: () => void
  onTest: () => void
}) {
  return (
    <div
      style={{
        backgroundColor: "#FFFFFF",
        border: `1px solid ${setting.isDefault ? "#B8956B" : "transparent"}`,
        
        padding: "24px",
        transition: "all 0.2s ease",
      }}
      onMouseEnter={(e) => { if (!setting.isDefault) e.currentTarget.style.borderColor = "#B8956B" }}
      onMouseLeave={(e) => { if (!setting.isDefault) e.currentTarget.style.borderColor = "transparent" }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
          <div
            style={{
              padding: "12px",
              
              backgroundColor: setting.isActive ? "#F5F3F0" : "#FEE2E2",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Server
              style={{
                width: "24px",
                height: "24px",
                color: setting.isActive ? "#5C7A8A" : "#B85C5C",
              }}
            />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "4px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 500, color: "#2C2C2C" }}>
                {setting.name}
              </h3>
              {setting.isDefault && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: "2px 8px",
                    fontSize: "11px",
                    fontWeight: 500,
                    borderRadius: "9999px",
                    backgroundColor: "rgba(184, 149, 107, 0.1)",
                    color: "#B8956B",
                  }}
                >
                  <Star style={{ width: "10px", height: "10px" }} />
                  Default
                </span>
              )}
              {!setting.isActive && (
                <span
                  style={{
                    padding: "2px 8px",
                    fontSize: "11px",
                    fontWeight: 500,
                    borderRadius: "9999px",
                    backgroundColor: "rgba(184, 92, 92, 0.1)",
                    color: "#B85C5C",
                  }}
                >
                  Inactive
                </span>
              )}
            </div>
            <p style={{ fontSize: "13px", color: "#6B6B6B", marginBottom: "12px" }}>
              {setting.host}:{setting.port} • {setting.encryption.toUpperCase()}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", fontSize: "12px", color: "#9A9A9A" }}>
              <span>From: {setting.fromName} &lt;{setting.fromEmail}&gt;</span>
              {setting.replyToEmail && <span>Reply-To: {setting.replyToEmail}</span>}
              {setting.dailyLimit && <span>Daily Limit: {setting.dailyLimit.toLocaleString()}</span>}
              {setting.hourlyLimit && <span>Hourly Limit: {setting.hourlyLimit.toLocaleString()}</span>}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <ActionButton icon={TestTube} label="Test" onClick={onTest} />
          <ActionButton icon={Edit2} label="Edit" onClick={onEdit} />
          {!setting.isDefault && (
            <ActionButton icon={Star} label="Set Default" onClick={onSetDefault} />
          )}
          <ActionButton icon={Trash2} label="Delete" onClick={onDelete} variant="danger" />
        </div>
      </div>
    </div>
  )
}

/**
 * Action Button Component
 */
function ActionButton({
  icon: Icon,
  label,
  onClick,
  variant = "default",
}: {
  icon: React.ComponentType<{ style?: React.CSSProperties }>
  label: string
  onClick: () => void
  variant?: "default" | "danger"
}) {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={label}
      style={{
        padding: "8px",
        
        border: "1px solid #E8E4DF",
        backgroundColor: isHovered ? (variant === "danger" ? "#FEE2E2" : "#F5F3F0") : "transparent",
        cursor: "pointer",
        transition: "all 0.2s ease",
      }}
    >
      <Icon
        style={{
          width: "16px",
          height: "16px",
          color: variant === "danger" ? "#B85C5C" : "#6B6B6B",
        }}
      />
    </button>
  )
}

/**
 * Empty State Component
 */
function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div
      style={{
        backgroundColor: "#FFFFFF",
        border: "1px solid transparent",
        
        padding: "64px 24px",
        textAlign: "center",
      }}
    >
      <Server style={{ width: "48px", height: "48px", color: "#D4CFC8", margin: "0 auto 16px" }} />
      <h3 style={{ fontSize: "18px", fontWeight: 300, color: "#2C2C2C", marginBottom: "8px" }}>
        No SMTP Providers Configured
      </h3>
      <p style={{ fontSize: "14px", color: "#6B6B6B", marginBottom: "24px", maxWidth: "400px", margin: "0 auto 24px" }}>
        Add an SMTP provider to start sending email campaigns. You can configure multiple providers and set one as default.
      </p>
      <button
        onClick={onAdd}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          padding: "12px 24px",
          backgroundColor: "#2C2C2C",
          color: "#FAFAFA",
          fontSize: "14px",
          fontWeight: 500,
          borderRadius: "9999px",
          border: "none",
          cursor: "pointer",
        }}
      >
        <Plus style={{ width: "16px", height: "16px" }} />
        Add SMTP Provider
      </button>
    </div>
  )
}


/**
 * Form Modal Component
 */
function FormModal({
  formData,
  editingId,
  isSubmitting,
  showPassword,
  onInputChange,
  onSubmit,
  onClose,
  onTogglePassword,
}: {
  formData: SMTPFormData
  editingId: string | null
  isSubmitting: boolean
  showPassword: boolean
  onInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void
  onSubmit: (e: React.FormEvent) => void
  onClose: () => void
  onTogglePassword: () => void
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: "24px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        style={{
          backgroundColor: "#FFFFFF",
          
          width: "100%",
          maxWidth: "600px",
          maxHeight: "90vh",
          overflow: "auto",
        }}
      >
        <div style={{ padding: "24px", borderBottom: "1px solid #E8E4DF" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 300, color: "#2C2C2C" }}>
            {editingId ? "Edit SMTP Provider" : "Add SMTP Provider"}
          </h2>
          <p style={{ fontSize: "13px", color: "#6B6B6B", marginTop: "4px" }}>
            Configure your email delivery settings
          </p>
        </div>

        <form onSubmit={onSubmit} style={{ padding: "24px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* Name */}
            <FormField label="Configuration Name" required>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={onInputChange}
                placeholder="e.g., Primary SMTP, Resend Production"
                required
                style={inputStyle}
              />
            </FormField>

            {/* Host and Port */}
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "16px" }}>
              <FormField label="SMTP Host" required>
                <input
                  type="text"
                  name="host"
                  value={formData.host}
                  onChange={onInputChange}
                  placeholder="smtp.example.com"
                  required
                  style={inputStyle}
                />
              </FormField>
              <FormField label="Port" required>
                <input
                  type="number"
                  name="port"
                  value={formData.port}
                  onChange={onInputChange}
                  placeholder="587"
                  required
                  min={1}
                  max={65535}
                  style={inputStyle}
                />
              </FormField>
            </div>

            {/* Username and Password */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <FormField label="Username" required>
                <input
                  type="text"
                  name="username"
                  value={formData.username}
                  onChange={onInputChange}
                  placeholder="user@example.com"
                  required
                  style={inputStyle}
                />
              </FormField>
              <FormField label="Password" required={!editingId}>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    value={formData.password}
                    onChange={onInputChange}
                    placeholder={editingId ? "Leave blank to keep current" : "••••••••"}
                    required={!editingId}
                    style={{ ...inputStyle, paddingRight: "40px" }}
                  />
                  <button
                    type="button"
                    onClick={onTogglePassword}
                    style={{
                      position: "absolute",
                      right: "12px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: "4px",
                    }}
                  >
                    {showPassword ? (
                      <EyeOff style={{ width: "16px", height: "16px", color: "#6B6B6B" }} />
                    ) : (
                      <Eye style={{ width: "16px", height: "16px", color: "#6B6B6B" }} />
                    )}
                  </button>
                </div>
              </FormField>
            </div>

            {/* Encryption */}
            <FormField label="Encryption" required>
              <select
                name="encryption"
                value={formData.encryption}
                onChange={onInputChange}
                required
                style={inputStyle}
              >
                <option value="tls">TLS (Recommended)</option>
                <option value="ssl">SSL</option>
                <option value="none">None</option>
              </select>
            </FormField>

            {/* From Email and Name */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <FormField label="From Email" required>
                <input
                  type="email"
                  name="fromEmail"
                  value={formData.fromEmail}
                  onChange={onInputChange}
                  placeholder="noreply@example.com"
                  required
                  style={inputStyle}
                />
              </FormField>
              <FormField label="From Name" required>
                <input
                  type="text"
                  name="fromName"
                  value={formData.fromName}
                  onChange={onInputChange}
                  placeholder="EventOS"
                  required
                  style={inputStyle}
                />
              </FormField>
            </div>

            {/* Reply-To Email */}
            <FormField label="Reply-To Email">
              <input
                type="email"
                name="replyToEmail"
                value={formData.replyToEmail}
                onChange={onInputChange}
                placeholder="support@example.com (optional)"
                style={inputStyle}
              />
            </FormField>

            {/* Rate Limits */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <FormField label="Daily Limit">
                <input
                  type="number"
                  name="dailyLimit"
                  value={formData.dailyLimit}
                  onChange={onInputChange}
                  placeholder="e.g., 10000 (optional)"
                  min={1}
                  style={inputStyle}
                />
              </FormField>
              <FormField label="Hourly Limit">
                <input
                  type="number"
                  name="hourlyLimit"
                  value={formData.hourlyLimit}
                  onChange={onInputChange}
                  placeholder="e.g., 500 (optional)"
                  min={1}
                  style={inputStyle}
                />
              </FormField>
            </div>

            {/* Checkboxes */}
            <div style={{ display: "flex", gap: "24px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  name="isActive"
                  checked={formData.isActive}
                  onChange={onInputChange}
                  style={{ width: "16px", height: "16px", accentColor: "#B8956B" }}
                />
                <span style={{ fontSize: "14px", color: "#2C2C2C" }}>Active</span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  name="isDefault"
                  checked={formData.isDefault}
                  onChange={onInputChange}
                  style={{ width: "16px", height: "16px", accentColor: "#B8956B" }}
                />
                <span style={{ fontSize: "14px", color: "#2C2C2C" }}>Set as Default</span>
              </label>
            </div>

            {/* Security Note */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "12px",
                padding: "12px 16px",
                backgroundColor: "#F5F3F0",
                
              }}
            >
              <Shield style={{ width: "16px", height: "16px", color: "#5C8A6B", flexShrink: 0, marginTop: "2px" }} />
              <p style={{ fontSize: "12px", color: "#6B6B6B" }}>
                Your SMTP password is encrypted using AES-256-GCM before being stored. It is never exposed in API responses.
              </p>
            </div>
          </div>

          {/* Form Actions */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px", paddingTop: "24px", borderTop: "1px solid #E8E4DF" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: 500,
                color: "#6B6B6B",
                backgroundColor: "transparent",
                border: "1px solid #E8E4DF",
                borderRadius: "9999px",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: 500,
                color: "#FAFAFA",
                backgroundColor: isSubmitting ? "#9A9A9A" : "#2C2C2C",
                border: "none",
                borderRadius: "9999px",
                cursor: isSubmitting ? "not-allowed" : "pointer",
              }}
            >
              {isSubmitting && <Loader2 style={{ width: "16px", height: "16px", animation: "spin 1s linear infinite" }} />}
              {editingId ? "Update" : "Create"} Provider
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}


/**
 * Test Connection Modal Component
 */
function TestModal({
  testEmail,
  testResult,
  onEmailChange,
  onTest,
  onClose,
}: {
  testEmail: string
  testResult: { success: boolean; message: string } | null
  onEmailChange: (email: string) => void
  onTest: () => void
  onClose: () => void
}) {
  const [isTesting, setIsTesting] = useState(false)

  const handleTest = async () => {
    setIsTesting(true)
    await onTest()
    setIsTesting(false)
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: "24px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        style={{
          backgroundColor: "#FFFFFF",
          
          width: "100%",
          maxWidth: "400px",
          padding: "24px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
          <div
            style={{
              padding: "10px",
              
              backgroundColor: "#F5F3F0",
            }}
          >
            <TestTube style={{ width: "20px", height: "20px", color: "#5C7A8A" }} />
          </div>
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: 500, color: "#2C2C2C" }}>Test Connection</h3>
            <p style={{ fontSize: "12px", color: "#6B6B6B" }}>Send a test email to verify settings</p>
          </div>
        </div>

        <FormField label="Test Email Address" required>
          <input
            type="email"
            value={testEmail}
            onChange={(e) => onEmailChange(e.target.value)}
            placeholder="your@email.com"
            required
            style={inputStyle}
          />
        </FormField>

        {testResult && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "12px",
              padding: "12px 16px",
              backgroundColor: testResult.success ? "rgba(92, 138, 107, 0.1)" : "rgba(184, 92, 92, 0.1)",
              
              marginTop: "16px",
            }}
          >
            {testResult.success ? (
              <CheckCircle style={{ width: "16px", height: "16px", color: "#5C8A6B", flexShrink: 0, marginTop: "2px" }} />
            ) : (
              <AlertCircle style={{ width: "16px", height: "16px", color: "#B85C5C", flexShrink: 0, marginTop: "2px" }} />
            )}
            <p style={{ fontSize: "13px", color: testResult.success ? "#5C8A6B" : "#B85C5C" }}>
              {testResult.message}
            </p>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "10px 20px",
              fontSize: "14px",
              fontWeight: 500,
              color: "#6B6B6B",
              backgroundColor: "transparent",
              border: "1px solid #E8E4DF",
              borderRadius: "9999px",
              cursor: "pointer",
            }}
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleTest}
            disabled={!testEmail || isTesting}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 20px",
              fontSize: "14px",
              fontWeight: 500,
              color: "#FAFAFA",
              backgroundColor: !testEmail || isTesting ? "#9A9A9A" : "#2C2C2C",
              border: "none",
              borderRadius: "9999px",
              cursor: !testEmail || isTesting ? "not-allowed" : "pointer",
            }}
          >
            {isTesting && <Loader2 style={{ width: "16px", height: "16px", animation: "spin 1s linear infinite" }} />}
            Send Test Email
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Form Field Component
 */
function FormField({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "#2C2C2C", marginBottom: "6px" }}>
        {label}
        {required && <span style={{ color: "#B85C5C", marginLeft: "4px" }}>*</span>}
      </label>
      {children}
    </div>
  )
}

/**
 * Input style constant
 */
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  fontSize: "14px",
  border: "1px solid #E8E4DF",
  
  backgroundColor: "#FFFFFF",
  color: "#2C2C2C",
  outline: "none",
  transition: "border-color 0.2s ease",
}

/**
 * Loading Skeleton Component
 */
function SMTPSettingsSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
      {/* Header skeleton */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <Skeleton className="h-4 w-32 mb-4" />
          <Skeleton className="h-1 w-12 mb-4" />
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-40" />
      </div>

      {/* Cards skeleton */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {[1, 2].map((i) => (
          <div
            key={i}
            style={{
              backgroundColor: "#FFFFFF",
              border: "1px solid transparent",
              
              padding: "24px",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
              <Skeleton className="h-12 w-12 rounded-lg" />
              <div style={{ flex: 1 }}>
                <Skeleton className="h-5 w-40 mb-2" />
                <Skeleton className="h-4 w-56 mb-3" />
                <Skeleton className="h-3 w-80" />
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <Skeleton className="h-8 w-8 rounded-lg" />
                <Skeleton className="h-8 w-8 rounded-lg" />
                <Skeleton className="h-8 w-8 rounded-lg" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
