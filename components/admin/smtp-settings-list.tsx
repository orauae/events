"use client"

import { useState } from "react"
import {
  Server,
  Star,
  Edit2,
  Trash2,
  TestTube,
  CheckCircle,
  AlertCircle,
  Loader2,
  Plus,
} from "lucide-react"
import { toast } from "sonner"

/**
 * SMTP Settings Interface
 * Represents an SMTP configuration without the encrypted password
 */
export interface SMTPSettingsPublic {
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
 * Props for SMTPSettingsList component
 */
interface SMTPSettingsListProps {
  /** Array of SMTP settings to display */
  settings: SMTPSettingsPublic[]
  /** Whether the list is loading */
  isLoading?: boolean
  /** Callback when edit is clicked */
  onEdit?: (setting: SMTPSettingsPublic) => void
  /** Callback when delete is clicked */
  onDelete?: (id: string) => Promise<void>
  /** Callback when set default is clicked */
  onSetDefault?: (id: string) => Promise<void>
  /** Callback when test connection is clicked */
  onTest?: (id: string) => void
  /** Callback when add new is clicked */
  onAdd?: () => void
  /** Whether to show the add button in empty state */
  showAddButton?: boolean
}

/**
 * SMTPSettingsList - Displays a list of SMTP configurations
 * 
 * Features:
 * - Card-based display of SMTP providers
 * - Actions: Edit, Delete, Set Default, Test Connection
 * - Empty state with add button
 * - Loading skeleton state
 * - Visual indicators for default and inactive providers
 * 
 * Requirements: 2 (SMTP Configuration Management)
 */
export function SMTPSettingsList({
  settings,
  isLoading = false,
  onEdit,
  onDelete,
  onSetDefault,
  onTest,
  onAdd,
  showAddButton = true,
}: SMTPSettingsListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null)

  // Handle delete with loading state
  const handleDelete = async (id: string) => {
    if (!onDelete) return
    
    if (!confirm("Are you sure you want to delete this SMTP configuration?")) {
      return
    }

    setDeletingId(id)
    try {
      await onDelete(id)
      toast.success("SMTP settings deleted")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete SMTP settings")
    } finally {
      setDeletingId(null)
    }
  }

  // Handle set default with loading state
  const handleSetDefault = async (id: string) => {
    if (!onSetDefault) return

    setSettingDefaultId(id)
    try {
      await onSetDefault(id)
      toast.success("Default SMTP provider updated")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to set default")
    } finally {
      setSettingDefaultId(null)
    }
  }

  if (isLoading) {
    return <SMTPSettingsListSkeleton />
  }

  if (settings.length === 0) {
    return <EmptyState onAdd={showAddButton ? onAdd : undefined} />
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {settings.map((setting) => (
        <SMTPSettingCard
          key={setting.id}
          setting={setting}
          isDeleting={deletingId === setting.id}
          isSettingDefault={settingDefaultId === setting.id}
          onEdit={onEdit ? () => onEdit(setting) : undefined}
          onDelete={onDelete ? () => handleDelete(setting.id) : undefined}
          onSetDefault={onSetDefault ? () => handleSetDefault(setting.id) : undefined}
          onTest={onTest ? () => onTest(setting.id) : undefined}
        />
      ))}
    </div>
  )
}

/**
 * SMTP Setting Card Component
 */
function SMTPSettingCard({
  setting,
  isDeleting,
  isSettingDefault,
  onEdit,
  onDelete,
  onSetDefault,
  onTest,
}: {
  setting: SMTPSettingsPublic
  isDeleting?: boolean
  isSettingDefault?: boolean
  onEdit?: () => void
  onDelete?: () => void
  onSetDefault?: () => void
  onTest?: () => void
}) {
  return (
    <div
      style={{
        backgroundColor: "#FFFFFF",
        border: `1px solid ${setting.isDefault ? "#B8956B" : "transparent"}`,
        borderRadius: "12px",
        padding: "24px",
        transition: "all 0.2s ease",
        opacity: isDeleting ? 0.5 : 1,
      }}
      onMouseEnter={(e) => { if (!setting.isDefault) e.currentTarget.style.borderColor = "#B8956B" }}
      onMouseLeave={(e) => { if (!setting.isDefault) e.currentTarget.style.borderColor = "transparent" }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
          <div
            style={{
              padding: "12px",
              borderRadius: "10px",
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
          {onTest && (
            <ActionButton icon={TestTube} label="Test" onClick={onTest} />
          )}
          {onEdit && (
            <ActionButton icon={Edit2} label="Edit" onClick={onEdit} />
          )}
          {onSetDefault && !setting.isDefault && (
            <ActionButton 
              icon={Star} 
              label="Set Default" 
              onClick={onSetDefault}
              isLoading={isSettingDefault}
            />
          )}
          {onDelete && (
            <ActionButton 
              icon={Trash2} 
              label="Delete" 
              onClick={onDelete} 
              variant="danger"
              isLoading={isDeleting}
            />
          )}
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
  isLoading = false,
}: {
  icon: React.ComponentType<{ style?: React.CSSProperties }>
  label: string
  onClick: () => void
  variant?: "default" | "danger"
  isLoading?: boolean
}) {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={label}
      disabled={isLoading}
      style={{
        padding: "8px",
        borderRadius: "8px",
        border: "1px solid #E8E4DF",
        backgroundColor: isHovered ? (variant === "danger" ? "#FEE2E2" : "#F5F3F0") : "transparent",
        cursor: isLoading ? "not-allowed" : "pointer",
        transition: "all 0.2s ease",
        opacity: isLoading ? 0.5 : 1,
      }}
    >
      {isLoading ? (
        <Loader2
          style={{
            width: "16px",
            height: "16px",
            color: "#6B6B6B",
            animation: "spin 1s linear infinite",
          }}
        />
      ) : (
        <Icon
          style={{
            width: "16px",
            height: "16px",
            color: variant === "danger" ? "#B85C5C" : "#6B6B6B",
          }}
        />
      )}
    </button>
  )
}

/**
 * Empty State Component
 */
function EmptyState({ onAdd }: { onAdd?: () => void }) {
  return (
    <div
      style={{
        backgroundColor: "#FFFFFF",
        border: "1px solid transparent",
        borderRadius: "12px",
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
      {onAdd && (
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
      )}
    </div>
  )
}

/**
 * Loading Skeleton Component
 */
function SMTPSettingsListSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            backgroundColor: "#FFFFFF",
            border: "1px solid transparent",
            borderRadius: "12px",
            padding: "24px",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "10px",
                backgroundColor: "#E8E4DF",
                animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
              }}
            />
            <div style={{ flex: 1 }}>
              <div
                style={{
                  width: "200px",
                  height: "20px",
                  borderRadius: "4px",
                  backgroundColor: "#E8E4DF",
                  marginBottom: "8px",
                  animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                }}
              />
              <div
                style={{
                  width: "300px",
                  height: "16px",
                  borderRadius: "4px",
                  backgroundColor: "#E8E4DF",
                  marginBottom: "12px",
                  animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                }}
              />
              <div
                style={{
                  width: "400px",
                  height: "14px",
                  borderRadius: "4px",
                  backgroundColor: "#E8E4DF",
                  animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default SMTPSettingsList
