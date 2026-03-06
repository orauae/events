"use client"

import * as React from "react"
import { format } from "date-fns"
import { CalendarIcon, Clock } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"

export interface DateTimePickerProps {
  value: Date | undefined
  onChange: (date: Date | undefined) => void
  placeholder?: string
  disabled?: boolean
  minDate?: Date
  maxDate?: Date
  className?: string
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = "Pick a date and time",
  disabled = false,
  minDate,
  maxDate,
  className,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false)
  
  // Extract time from current value or default to 09:00
  const hours = value ? value.getHours().toString().padStart(2, "0") : "09"
  const minutes = value ? value.getMinutes().toString().padStart(2, "0") : "00"

  const handleDateSelect = (selectedDate: Date | undefined) => {
    if (!selectedDate) {
      onChange(undefined)
      return
    }
    
    // Preserve the time when changing date
    const newDate = new Date(selectedDate)
    if (value) {
      newDate.setHours(value.getHours(), value.getMinutes(), 0, 0)
    } else {
      newDate.setHours(9, 0, 0, 0)
    }
    onChange(newDate)
  }

  const handleTimeChange = (type: "hours" | "minutes", newValue: string) => {
    const numValue = parseInt(newValue, 10)
    if (isNaN(numValue)) return

    const currentDate = value || new Date()
    const newDate = new Date(currentDate)

    if (type === "hours") {
      if (numValue >= 0 && numValue <= 23) {
        newDate.setHours(numValue)
      }
    } else {
      if (numValue >= 0 && numValue <= 59) {
        newDate.setMinutes(numValue)
      }
    }

    onChange(newDate)
  }

  // Validate date is within bounds
  const isDateDisabled = (date: Date) => {
    if (minDate && date < new Date(minDate.setHours(0, 0, 0, 0))) {
      return true
    }
    if (maxDate && date > new Date(maxDate.setHours(23, 59, 59, 999))) {
      return true
    }
    return false
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal",
            !value && "text-ora-graphite/60",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? (
            format(value, "PPP 'at' HH:mm")
          ) : (
            <span>{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={handleDateSelect}
          disabled={isDateDisabled}
          initialFocus
        />
        <div className="border-t border-ora-sand p-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-ora-graphite" />
            <span className="text-sm text-ora-graphite">Time:</span>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={0}
                max={23}
                value={hours}
                onChange={(e) => handleTimeChange("hours", e.target.value)}
                className="w-16 text-center"
                disabled={disabled || !value}
              />
              <span className="text-ora-graphite font-medium">:</span>
              <Input
                type="number"
                min={0}
                max={59}
                value={minutes}
                onChange={(e) => handleTimeChange("minutes", e.target.value)}
                className="w-16 text-center"
                disabled={disabled || !value}
              />
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
