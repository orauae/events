/**
 * @fileoverview Phone number validation utilities using intl-tel-input
 *
 * Sanitizes and validates international phone numbers for WhatsApp/SMS delivery.
 * Handles common Excel export quirks (leading ', `, +).
 *
 * @module lib/utils/phone-validation
 */

// intl-tel-input utils provides libphonenumber-based validation
// without requiring a DOM input element.
import utils from "intl-tel-input/build/js/utils.js"

// ============================================================================
// TYPES
// ============================================================================

export interface PhoneValidationResult {
  /** The sanitized number (E.164 without +), or empty string if invalid */
  sanitized: string
  /** The original raw value from the file */
  original: string
  /** Whether the number passed validation */
  isValid: boolean
  /** Human-readable reason when invalid */
  reason?: string
}

export interface PhoneSummary {
  total: number
  valid: number
  invalid: number
  empty: number
  invalidEntries: { row: number; original: string; reason: string }[]
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Strips common leading characters that spreadsheet programs add when
 * exporting phone numbers:
 *
 * - `'` or `` ` `` – Excel text-prefix escape characters
 * - `+`  – international prefix (we re-add it for validation)
 * - whitespace
 *
 * After stripping, re-adds `+` so libphonenumber receives an E.164 candidate.
 */
export function sanitizePhoneInput(raw: string): string {
  if (!raw) return ""

  let value = raw.trim()

  // Strip leading apostrophe / backtick (Excel text prefix)
  while (value.startsWith("'") || value.startsWith("`")) {
    value = value.slice(1)
  }

  // Strip leading + (we add it back)
  while (value.startsWith("+")) {
    value = value.slice(1)
  }

  // Remove all non-digit characters except leading + we're about to add
  // Keep digits only after our prefix cleanup
  value = value.replace(/[^\d]/g, "")

  if (!value) return ""

  // Re-add + for E.164 format expected by libphonenumber
  return `+${value}`
}

/**
 * Validates a single phone number using intl-tel-input's libphonenumber utils.
 *
 * The number is first sanitised (prefix stripping, digit extraction) then
 * validated. If valid, the sanitised digits (without +) are returned so they
 * can be stored in E.164-like form ready for WhatsApp/SMS APIs.
 */
export function validatePhoneNumber(raw: string): PhoneValidationResult {
  const original = raw?.trim() ?? ""

  if (!original) {
    return { sanitized: "", original, isValid: true, reason: undefined }
  }

  const candidate = sanitizePhoneInput(original)

  if (!candidate || candidate === "+") {
    return {
      sanitized: "",
      original,
      isValid: false,
      reason: "No digits found after cleanup",
    }
  }

  // utils may not be loaded in SSR context – guard
  if (!utils || !utils.isValidNumber) {
    // Fallback: accept numbers that look like valid E.164 (8-15 digits)
    const digits = candidate.replace("+", "")
    if (digits.length >= 7 && digits.length <= 15) {
      return { sanitized: digits, original, isValid: true }
    }
    return {
      sanitized: "",
      original,
      isValid: false,
      reason: `Invalid length (${digits.length} digits)`,
    }
  }

  // intl-tel-input isValidNumber(number, countryIso2)
  // Pass empty string for country to let it auto-detect from the number
  const isValid = utils.isValidNumber(candidate, "")

  if (isValid) {
    // Format to E.164 and strip the +
    let formatted: string
    try {
      formatted = utils.formatNumber(
        candidate,
        "",
        utils.numberFormat.E164
      )
      // Strip the leading +
      formatted = formatted.replace(/^\+/, "")
    } catch {
      formatted = candidate.replace(/^\+/, "")
    }
    return { sanitized: formatted, original, isValid: true }
  }

  // Provide a human-readable reason
  let reason = "Invalid phone number"
  try {
    const errorCode = utils.getValidationError(candidate, "")
    const errorMap: Record<number, string> = {
      0: "Valid", // IS_POSSIBLE – but isValidNumber said no, so structure is wrong
      1: "Invalid country code",
      2: "Too short",
      3: "Too long",
      4: "Valid for local use only (missing country code)",
      5: "Invalid length for this country",
    }
    reason = errorMap[errorCode] ?? "Invalid phone number"
  } catch {
    // keep default reason
  }

  return { sanitized: "", original, isValid: false, reason }
}

/**
 * Batch-validates an array of phone strings.
 * Returns per-row results and an aggregate summary.
 */
export function validatePhoneNumbers(
  phones: { row: number; value: string }[]
): PhoneSummary {
  const summary: PhoneSummary = {
    total: phones.length,
    valid: 0,
    invalid: 0,
    empty: 0,
    invalidEntries: [],
  }

  for (const { row, value } of phones) {
    if (!value.trim()) {
      summary.empty++
      continue
    }

    const result = validatePhoneNumber(value)
    if (result.isValid) {
      summary.valid++
    } else {
      summary.invalid++
      summary.invalidEntries.push({
        row,
        original: result.original,
        reason: result.reason ?? "Invalid phone number",
      })
    }
  }

  return summary
}
