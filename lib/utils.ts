/**
 * @fileoverview Utility functions for the EventOS application
 * 
 * This module provides common utility functions used throughout the application.
 * 
 * @module lib/utils
 * @requires clsx - Conditional class names
 * @requires tailwind-merge - Tailwind class merging
 */

import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Combines class names with Tailwind CSS conflict resolution.
 * 
 * Uses clsx for conditional class names and tailwind-merge to
 * properly handle Tailwind CSS class conflicts (e.g., `p-2 p-4` → `p-4`).
 * 
 * @param inputs - Class values to combine (strings, objects, arrays)
 * @returns Merged class string with conflicts resolved
 * 
 * @example
 * ```typescript
 * // Basic usage
 * cn('px-2 py-1', 'px-4') // → 'py-1 px-4'
 * 
 * // Conditional classes
 * cn('base-class', isActive && 'active-class')
 * 
 * // Object syntax
 * cn('base', { 'text-red-500': hasError, 'text-green-500': isSuccess })
 * ```
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
