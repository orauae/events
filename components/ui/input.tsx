import * as React from "react"
import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-none bg-white px-3 py-1.5 text-base text-ora-charcoal outline-1 -outline-offset-1 outline-ora-sand file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-ora-charcoal placeholder:text-ora-stone focus:outline-2 focus:-outline-offset-2 focus:outline-ora-gold disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
