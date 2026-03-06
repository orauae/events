/**
 * @fileoverview Button Component - Primary interactive element
 * 
 * A fully-rounded button component following the ORA design system.
 * Supports multiple variants, sizes, loading states, and can render
 * as different elements using the asChild pattern.
 * 
 * ## Design System
 * - All buttons are fully rounded (rounded-full)
 * - Thin borders for outline/secondary variants
 * - Thin icon strokes (stroke-1)
 * - Smooth transitions (200ms)
 * 
 * ## Variants
 * - `default`: Gold background, white text (primary actions)
 * - `secondary`: Cream background with sand border
 * - `outline`: Transparent with stone border
 * - `ghost`: No background, subtle hover
 * - `danger`: Red background for destructive actions
 * - `link`: Text link style with underline on hover
 * 
 * ## Sizes
 * - `default`: h-10, px-6 (standard)
 * - `sm`: h-9, px-5 (compact)
 * - `lg`: h-12, px-8 (prominent)
 * - `icon`: h-10, w-10 (square icon button)
 * 
 * @module components/ui/button
 * @requires @radix-ui/react-slot - Polymorphic component support
 * @requires class-variance-authority - Variant management
 * 
 * @example
 * ```tsx
 * // Primary button
 * <Button>Save Changes</Button>
 * 
 * // Outline button with icon
 * <Button variant="outline">
 *   <Plus className="h-4 w-4" />
 *   Add Item
 * </Button>
 * 
 * // Loading state
 * <Button isLoading>Saving...</Button>
 * 
 * // As a link
 * <Button asChild>
 *   <Link href="/dashboard">Go to Dashboard</Link>
 * </Button>
 * ```
 */

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Button variant styles using class-variance-authority.
 * Defines all visual variants and sizes for the button component.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all duration-200 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ora-charcoal focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:stroke-1",
  {
    variants: {
      variant: {
        default: "bg-ora-gold text-white hover:bg-ora-charcoal",
        secondary: "bg-ora-cream text-ora-charcoal border border-ora-sand hover:bg-ora-sand",
        outline: "bg-transparent text-ora-charcoal border border-ora-stone hover:bg-ora-charcoal hover:text-white",
        ghost: "bg-transparent text-ora-graphite hover:text-ora-charcoal hover:bg-ora-cream",
        danger: "bg-red-600 text-white hover:bg-red-700",
        link: "text-ora-gold underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-6 py-2.5",
        sm: "h-9 px-5",
        lg: "h-12 px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

/**
 * Props for the Button component.
 * Extends native button attributes with variant and loading support.
 */
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** 
   * When true, the button renders its child as the root element.
   * Useful for rendering as Link or other components.
   */
  asChild?: boolean
  /** 
   * When true, shows a loading spinner and disables the button.
   */
  isLoading?: boolean
}

/**
 * Button component - Primary interactive element.
 * 
 * A polymorphic button that can render as different elements while
 * maintaining consistent styling. Supports loading states, multiple
 * variants, and sizes.
 * 
 * @param props - Button props including variant, size, and loading state
 * @param ref - Forwarded ref to the button element
 * 
 * @example
 * ```tsx
 * // Standard usage
 * <Button onClick={handleClick}>Click Me</Button>
 * 
 * // With loading state
 * <Button isLoading={isSaving}>
 *   {isSaving ? 'Saving...' : 'Save'}
 * </Button>
 * 
 * // As a Next.js Link
 * <Button asChild variant="outline">
 *   <Link href="/settings">Settings</Link>
 * </Button>
 * ```
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, isLoading = false, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {children}
      </Comp>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
