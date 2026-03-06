"use client"

import { useState } from "react"
import { Eye, EyeOff, Shield, TestTube, CheckCircle, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"

/**
 * SMTP Settings form data interface
 */
export interface SMTPFormData {
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

/**
 * Initial form data for creating new SMTP settings
 */
export const initialSMTPFormData: SMTPFormData = {
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
 * Test connection result interface
 */
interface TestConnectionResult {
  success: boolean
  message: string
  error?: string
}

/**
 * Props for SMTPSettingsForm component
 */
interface SMTPSettingsFormProps {
  /** Initial form data (for editing) */
  initialData?: Partial<SMTPFormData>
  /** ID of the SMTP settings being edited (null for new) */
  editingId?: string | null
  /** Callback when form is submitted successfully */
  onSuccess?: () => void
  /** Callback when form is cancelled */
  onCancel?: () => void
  /** Whether the form is displayed in a modal */
  isModal?: boolean
}

/**
 * SMTPSettingsForm - Form component for creating/editing SMTP configurations
 * 
 * Features:
 * - Form fields: host, port, username, password, encryption, from email, from name, reply-to
 * - Test connection button with loading state
 * - Success/error feedback
 * - Password visibility toggle
 * - Rate limit configuration
 * 
 * Requirements: 2 (SMTP Configuration Management)
 */
export function SMTPSettingsForm({
  initialData,
  editingId = null,
  onSuccess,
  onCancel,
  isModal = false,
}: SMTPSettingsFormProps) {
  // Form state
  const [formData, setFormData] = useState<SMTPFormData>({
    ...initialSMTPFormData,
    ...initialData,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  
  // Test connection state
  const [isTesting, setIsTesting] = useState(false)
  const [testEmail, setTestEmail] = useState("")
  const [showTestSection, setShowTestSection] = useState(false)
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null)

  // Handle form input changes
  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }))
  }

  // Handle select changes
  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [name]: value,
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

      toast.success(editingId ? "SMTP settings updated successfully" : "SMTP settings created successfully")
      onSuccess?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save SMTP settings")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle test connection
  const handleTestConnection = async () => {
    if (!testEmail) {
      toast.error("Please enter a test email address")
      return
    }

    // For new configurations, we need to save first before testing
    if (!editingId) {
      setTestResult({
        success: false,
        message: "Please save the configuration first",
        error: "You need to save the SMTP configuration before testing the connection.",
      })
      return
    }

    setIsTesting(true)
    setTestResult(null)

    try {
      const response = await fetch(`/api/admin/smtp/${editingId}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testEmail }),
      })

      const result = await response.json()
      setTestResult(result)
      
      if (result.success) {
        toast.success(result.message)
      } else {
        toast.error(result.error || result.message)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Test failed"
      setTestResult({
        success: false,
        message: "Failed to test connection",
        error: errorMessage,
      })
      toast.error("Failed to test connection")
    } finally {
      setIsTesting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Configuration Name */}
      <div className="space-y-2">
        <Label htmlFor="name">Configuration Name <span className="text-red-500">*</span></Label>
        <Input
          id="name"
          name="name"
          value={formData.name}
          onChange={handleInputChange}
          placeholder="e.g., Primary SMTP, Resend Production"
          required
        />
        <p className="text-xs text-ora-stone">A friendly name to identify this SMTP configuration</p>
      </div>

      {/* Host and Port */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 space-y-2">
          <Label htmlFor="host">SMTP Host <span className="text-red-500">*</span></Label>
          <Input
            id="host"
            name="host"
            value={formData.host}
            onChange={handleInputChange}
            placeholder="smtp.example.com"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="port">Port <span className="text-red-500">*</span></Label>
          <Input
            id="port"
            name="port"
            type="number"
            value={formData.port}
            onChange={handleInputChange}
            placeholder="587"
            required
            min={1}
            max={65535}
          />
        </div>
      </div>

      {/* Username and Password */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="username">Username <span className="text-red-500">*</span></Label>
          <Input
            id="username"
            name="username"
            value={formData.username}
            onChange={handleInputChange}
            placeholder="user@example.com"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">
            Password {!editingId && <span className="text-red-500">*</span>}
          </Label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              value={formData.password}
              onChange={handleInputChange}
              placeholder={editingId ? "Leave blank to keep current" : "••••••••"}
              required={!editingId}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ora-stone hover:text-ora-charcoal transition-colors"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Encryption */}
      <div className="space-y-2">
        <Label htmlFor="encryption">Encryption <span className="text-red-500">*</span></Label>
        <Select
          value={formData.encryption}
          onValueChange={(value) => handleSelectChange("encryption", value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select encryption type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tls">TLS (Recommended)</SelectItem>
            <SelectItem value="ssl">SSL</SelectItem>
            <SelectItem value="none">None</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-ora-stone">TLS is recommended for most SMTP providers</p>
      </div>

      {/* From Email and Name */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="fromEmail">From Email <span className="text-red-500">*</span></Label>
          <Input
            id="fromEmail"
            name="fromEmail"
            type="email"
            value={formData.fromEmail}
            onChange={handleInputChange}
            placeholder="noreply@example.com"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fromName">From Name <span className="text-red-500">*</span></Label>
          <Input
            id="fromName"
            name="fromName"
            value={formData.fromName}
            onChange={handleInputChange}
            placeholder="EventOS"
            required
          />
        </div>
      </div>

      {/* Reply-To Email */}
      <div className="space-y-2">
        <Label htmlFor="replyToEmail">Reply-To Email</Label>
        <Input
          id="replyToEmail"
          name="replyToEmail"
          type="email"
          value={formData.replyToEmail}
          onChange={handleInputChange}
          placeholder="support@example.com (optional)"
        />
        <p className="text-xs text-ora-stone">Optional email address for replies</p>
      </div>

      {/* Rate Limits */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="dailyLimit">Daily Limit</Label>
          <Input
            id="dailyLimit"
            name="dailyLimit"
            type="number"
            value={formData.dailyLimit}
            onChange={handleInputChange}
            placeholder="e.g., 10000 (optional)"
            min={1}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="hourlyLimit">Hourly Limit</Label>
          <Input
            id="hourlyLimit"
            name="hourlyLimit"
            type="number"
            value={formData.hourlyLimit}
            onChange={handleInputChange}
            placeholder="e.g., 500 (optional)"
            min={1}
          />
        </div>
      </div>

      {/* Checkboxes */}
      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            name="isActive"
            checked={formData.isActive}
            onChange={handleInputChange}
            className="w-4 h-4 accent-ora-gold"
          />
          <span className="text-sm text-ora-charcoal">Active</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            name="isDefault"
            checked={formData.isDefault}
            onChange={handleInputChange}
            className="w-4 h-4 accent-ora-gold"
          />
          <span className="text-sm text-ora-charcoal">Set as Default</span>
        </label>
      </div>

      {/* Security Note */}
      <div className="flex items-start gap-3 p-4 bg-ora-cream rounded-lg">
        <Shield className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-ora-graphite">
          Your SMTP password is encrypted using AES-256-GCM before being stored. It is never exposed in API responses.
        </p>
      </div>

      {/* Test Connection Section */}
      <div className="border border-ora-sand rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TestTube className="h-4 w-4 text-ora-graphite" />
            <span className="text-sm font-medium text-ora-charcoal">Test Connection</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowTestSection(!showTestSection)}
          >
            {showTestSection ? "Hide" : "Show"}
          </Button>
        </div>

        {showTestSection && (
          <div className="space-y-4 pt-2">
            {!editingId && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
                <p className="text-sm text-amber-800">
                  Save the configuration first to test the connection.
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="testEmail">Test Email Address</Label>
              <div className="flex gap-2">
                <Input
                  id="testEmail"
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="test@example.com"
                  className="flex-1"
                  disabled={!editingId}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleTestConnection}
                  disabled={isTesting || !testEmail || !editingId}
                  isLoading={isTesting}
                >
                  {isTesting ? "Testing..." : "Send Test"}
                </Button>
              </div>
              <p className="text-xs text-ora-stone">
                A test email will be sent to verify the SMTP configuration
              </p>
            </div>

            {/* Test Result */}
            {testResult && (
              <div
                className={`flex items-start gap-3 p-3 rounded-lg ${
                  testResult.success
                    ? "bg-green-50 border border-green-200"
                    : "bg-red-50 border border-red-200"
                }`}
              >
                {testResult.success ? (
                  <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                )}
                <div className="flex-1">
                  <p
                    className={`text-sm font-medium ${
                      testResult.success ? "text-green-800" : "text-red-800"
                    }`}
                  >
                    {testResult.message}
                  </p>
                  {testResult.error && (
                    <p className="text-xs text-red-600 mt-1">{testResult.error}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Form Actions */}
      <div className={`flex gap-3 ${isModal ? "justify-end pt-4 border-t border-ora-sand" : ""}`}>
        {onCancel && (
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          disabled={isSubmitting}
          isLoading={isSubmitting}
        >
          {editingId ? "Update Provider" : "Create Provider"}
        </Button>
      </div>
    </form>
  )
}

export default SMTPSettingsForm
