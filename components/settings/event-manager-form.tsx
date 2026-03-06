"use client"

import { useState, useEffect } from "react"
import { 
  Shield, 
  Mail, 
  User,
  Lock,
  Check,
  X,
} from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  Button,
  Input,
  Label,
} from "@/components/ui"
import { 
  useCreateEventManager, 
  useUpdateEventManager,
  useUpdatePermissions,
} from "@/hooks/use-event-managers"
import type { EventManagerWithStats } from "@/lib/services/event-manager-service"

/**
 * Permission configuration with labels and descriptions
 */
const PERMISSIONS = [
  {
    key: "canCreateEvents" as const,
    label: "Create Events",
    description: "Can create new events",
  },
  {
    key: "canUploadExcel" as const,
    label: "Upload Excel",
    description: "Can import guests via Excel",
  },
  {
    key: "canSendCampaigns" as const,
    label: "Send Campaigns",
    description: "Can send email campaigns",
  },
  {
    key: "canManageAutomations" as const,
    label: "Manage Automations",
    description: "Can create and edit automations",
  },
  {
    key: "canDeleteGuests" as const,
    label: "Delete Guests",
    description: "Can remove guests from events",
  },
]

interface PermissionsEditorProps {
  permissions: Record<string, boolean>
  onChange: (permissions: Record<string, boolean>) => void
  disabled?: boolean
}

/**
 * Permissions editor component with toggle switches
 * Requirements: 2.2, 2.3
 */
export function PermissionsEditor({ permissions, onChange, disabled }: PermissionsEditorProps) {
  const togglePermission = (key: string) => {
    onChange({
      ...permissions,
      [key]: !permissions[key],
    })
  }

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium text-ora-charcoal">Permissions</Label>
      <div className="space-y-2">
        {PERMISSIONS.map((perm) => (
          <div
            key={perm.key}
            className="flex items-center justify-between rounded-lg border border-ora-sand p-3 hover:bg-ora-cream/50 transition-colors"
          >
            <div>
              <div className="text-sm font-medium text-ora-charcoal">{perm.label}</div>
              <div className="text-xs text-ora-graphite">{perm.description}</div>
            </div>
            <button
              type="button"
              onClick={() => togglePermission(perm.key)}
              disabled={disabled}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ora-gold focus:ring-offset-2 ${
                permissions[perm.key] ? "bg-ora-gold" : "bg-ora-stone"
              } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  permissions[perm.key] ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

interface EventManagerFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  manager?: EventManagerWithStats | null
}

/**
 * Event manager create/edit form dialog
 * Requirements: 3.2, 3.4, 2.2, 2.3
 */
export function EventManagerFormDialog({
  open,
  onOpenChange,
  manager,
}: EventManagerFormDialogProps) {
  const isEditing = !!manager
  
  // Form state
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [permissions, setPermissions] = useState<Record<string, boolean>>({
    canCreateEvents: false,
    canUploadExcel: true,
    canSendCampaigns: true,
    canManageAutomations: false,
    canDeleteGuests: false,
  })
  
  // Validation state
  const [errors, setErrors] = useState<Record<string, string>>({})
  
  // Mutations
  const createMutation = useCreateEventManager()
  const updateMutation = useUpdateEventManager()
  const updatePermissionsMutation = useUpdatePermissions()
  
  const isLoading = createMutation.isPending || updateMutation.isPending || updatePermissionsMutation.isPending

  // Reset form when dialog opens/closes or manager changes
  useEffect(() => {
    if (open) {
      if (manager) {
        setName(manager.name)
        setEmail(manager.email)
        setPassword("")
        setPermissions({
          canCreateEvents: manager.permissions?.canCreateEvents ?? false,
          canUploadExcel: manager.permissions?.canUploadExcel ?? true,
          canSendCampaigns: manager.permissions?.canSendCampaigns ?? true,
          canManageAutomations: manager.permissions?.canManageAutomations ?? false,
          canDeleteGuests: manager.permissions?.canDeleteGuests ?? false,
        })
      } else {
        setName("")
        setEmail("")
        setPassword("")
        setPermissions({
          canCreateEvents: false,
          canUploadExcel: true,
          canSendCampaigns: true,
          canManageAutomations: false,
          canDeleteGuests: false,
        })
      }
      setErrors({})
    }
  }, [open, manager])

  // Validate form
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    
    if (!name.trim()) {
      newErrors.name = "Name is required"
    }
    
    if (!email.trim()) {
      newErrors.email = "Email is required"
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = "Invalid email address"
    }
    
    if (!isEditing && !password) {
      newErrors.password = "Password is required"
    } else if (!isEditing && password.length < 8) {
      newErrors.password = "Password must be at least 8 characters"
    }
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validate()) return
    
    try {
      if (isEditing && manager) {
        // Update profile
        await updateMutation.mutateAsync({
          id: manager.id,
          input: { name, email },
        })
        
        // Update permissions if changed
        if (manager.role !== "Admin") {
          await updatePermissionsMutation.mutateAsync({
            id: manager.id,
            permissions: {
              canCreateEvents: permissions.canCreateEvents,
              canUploadExcel: permissions.canUploadExcel,
              canSendCampaigns: permissions.canSendCampaigns,
              canManageAutomations: permissions.canManageAutomations,
              canDeleteGuests: permissions.canDeleteGuests,
            },
          })
        }
      } else {
        // Create new manager
        await createMutation.mutateAsync({
          name,
          email,
          password,
          permissions: {
            canCreateEvents: permissions.canCreateEvents ?? false,
            canUploadExcel: permissions.canUploadExcel ?? true,
            canSendCampaigns: permissions.canSendCampaigns ?? true,
            canManageAutomations: permissions.canManageAutomations ?? false,
            canDeleteGuests: permissions.canDeleteGuests ?? false,
          },
        })
      }
      
      onOpenChange(false)
    } catch (error) {
      // Error is handled by the mutation hooks with toast
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>
            {isEditing ? "Edit Event Manager" : "Add Event Manager"}
          </SheetTitle>
          <SheetDescription>
            {isEditing 
              ? "Update the event manager's profile and permissions."
              : "Create a new event manager account with specific permissions."
            }
          </SheetDescription>
        </SheetHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name field */}
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ora-graphite" />
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
                className="pl-10"
                disabled={isLoading}
              />
            </div>
            {errors.name && (
              <p className="text-xs text-red-600">{errors.name}</p>
            )}
          </div>
          
          {/* Email field */}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ora-graphite" />
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@example.com"
                className="pl-10"
                disabled={isLoading}
              />
            </div>
            {errors.email && (
              <p className="text-xs text-red-600">{errors.email}</p>
            )}
          </div>
          
          {/* Password field (only for create) */}
          {!isEditing && (
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ora-graphite" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-10"
                  disabled={isLoading}
                />
              </div>
              {errors.password && (
                <p className="text-xs text-red-600">{errors.password}</p>
              )}
              <p className="text-xs text-ora-graphite">
                Must be at least 8 characters
              </p>
            </div>
          )}
          
          {/* Permissions editor (not for Admin users) */}
          {(!isEditing || manager?.role !== "Admin") && (
            <PermissionsEditor
              permissions={permissions}
              onChange={setPermissions}
              disabled={isLoading}
            />
          )}
          
          {/* Admin notice */}
          {isEditing && manager?.role === "Admin" && (
            <div className="rounded-lg bg-ora-cream p-3 text-sm text-ora-graphite">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-ora-gold" />
                <span>Admin users have full access to all features.</span>
              </div>
            </div>
          )}
          
          <SheetFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" isLoading={isLoading}>
              {isEditing ? "Save Changes" : "Create Manager"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
