/**
 * @fileoverview UI Component Library - ORA Design System
 * 
 * This module exports all UI primitive components used throughout the
 * ORA Events application. Components follow the ORA design system with:
 * - Fully rounded buttons and inputs
 * - Thin borders and icon strokes
 * - Consistent color palette (ora-gold, ora-charcoal, etc.)
 * - Accessible by default (Radix UI primitives)
 * 
 * ## Component Categories
 * 
 * ### Interactive
 * - Button: Primary interactive element with variants
 * - Checkbox: Boolean input with label support
 * - Switch: Toggle switch for on/off states
 * - Select: Dropdown selection component
 * - Input: Text input field
 * 
 * ### Layout
 * - Card: Container with header, content, footer
 * - Dialog: Modal dialog overlay
 * - Sheet: Slide-out panel (drawer)
 * - Tabs: Tabbed content navigation
 * 
 * ### Display
 * - Badge: Status and category indicators
 * - Skeleton: Loading placeholder
 * - Calendar: Date picker calendar
 * - DateTimePicker: Combined date and time selection
 * 
 * ### Feedback
 * - Toaster: Toast notification container (Sonner)
 * 
 * @module components/ui
 * @see {@link https://ui.shadcn.com} - Based on shadcn/ui patterns
 * @see {@link https://www.radix-ui.com} - Built on Radix UI primitives
 * 
 * @example
 * ```tsx
 * import { Button, Card, CardContent, Input, Label } from '@/components/ui';
 * 
 * function LoginForm() {
 *   return (
 *     <Card>
 *       <CardContent>
 *         <Label htmlFor="email">Email</Label>
 *         <Input id="email" type="email" />
 *         <Button>Sign In</Button>
 *       </CardContent>
 *     </Card>
 *   );
 * }
 * ```
 */

// ============================================================================
// INTERACTIVE COMPONENTS
// ============================================================================

export { Button, buttonVariants, type ButtonProps } from "./button"
export { Badge, badgeVariants, type BadgeProps } from "./badge"
export { Checkbox } from "./checkbox"
// ============================================================================
// LAYOUT COMPONENTS
// ============================================================================

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "./dialog"
export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
} from "./sheet"
export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
} from "./card"

// ============================================================================
// FORM COMPONENTS
// ============================================================================

export { Input } from "./input"
export { Label } from "./label"
export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
} from "./select"
export { Switch } from "./switch"
export { Textarea } from "./textarea"

// ============================================================================
// DISPLAY COMPONENTS
// ============================================================================

export { Skeleton } from "./skeleton"
export { Tabs, TabsList, TabsTrigger, TabsContent } from "./tabs"
export { Calendar, type CalendarProps } from "./calendar"
export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor } from "./popover"
export { DateTimePicker, type DateTimePickerProps } from "./date-time-picker"
export { Progress, type ProgressProps } from "./progress"

// ============================================================================
// FEEDBACK COMPONENTS
// ============================================================================

export { Toaster } from "./sonner"
