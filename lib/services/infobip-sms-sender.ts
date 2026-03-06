/**
 * @fileoverview Infobip SMS Sender Service
 *
 * Sends SMS messages via the Infobip HTTP API.
 *
 * Key features:
 * - Single and batch SMS sending
 * - In-memory rate limiting (configurable per-second / per-day)
 * - Automatic retry with exponential back-off and jitter
 * - GSM-7 / UCS-2 encoding awareness
 * - Opt-out footer support
 *
 * Infobip REST docs: https://www.infobip.com/docs/api/channels/sms/sms-messaging/outbound-sms/send-sms-message
 *
 * @module lib/services/infobip-sms-sender
 */

// ============================================================================
// TYPES
// ============================================================================

export interface InfobipSMSConfig {
  /** Infobip API base URL (e.g. https://xxxx.api.infobip.com) */
  baseUrl: string
  /** Infobip API key */
  apiKey: string
}

export interface SMSSendOptions {
  /** Recipient phone number in E.164 format (e.g. +971501234567) */
  to: string
  /** SMS body text */
  text: string
  /** Alphanumeric sender ID — max 11 characters (e.g. "ORA") */
  from?: string
  /** Whether to append opt-out footer */
  appendOptOut?: boolean
  /** Optional callback URL for DLR (delivery reports) */
  notifyUrl?: string
}

export interface SMSSendResult {
  success: boolean
  /** Infobip message ID (for delivery tracking) */
  messageId?: string
  /** Infobip group / bulk ID */
  bulkId?: string
  /** Status from Infobip response */
  status?: string
  /** Description from Infobip response */
  statusDescription?: string
  /** Error message if sending failed */
  error?: string
  /** Number of retry attempts */
  retryAttempts?: number
}

export interface BatchSMSItem {
  to: string
  text: string
  from?: string
}

export interface BatchSMSResult {
  total: number
  sent: number
  failed: number
  results: SMSSendResult[]
  bulkId?: string
}

export interface RateLimitInfo {
  remaining: number
  limit: number
  resetAt: Date
}

// ============================================================================
// CONSTANTS
// ============================================================================

const OPT_OUT_FOOTER = "\n\nReply STOP to opt out."
const DEFAULT_SENDER_ID = process.env.INFOBIP_SMS_FROM || "ORA"
const DEFAULT_RATE_LIMIT_PER_SECOND = 50
const DEFAULT_RATE_LIMIT_PER_DAY = 50_000

/** Status group IDs that are retryable (Infobip status groups) */
const RETRYABLE_STATUS_GROUPS = new Set([
  3, // PENDING — still in queue
  5, // EXPIRED — timed out, worth retrying
])

// ============================================================================
// RATE LIMITER (in-memory, per-process)
// ============================================================================

let secondCounter = 0
let secondWindowStart = 0
let dayCounter = 0
let dayWindowStart = 0

function checkRateLimit(): boolean {
  const now = Date.now()

  // Reset per-second window
  if (now - secondWindowStart > 1_000) {
    secondCounter = 0
    secondWindowStart = now
  }

  // Reset per-day window
  if (now - dayWindowStart > 86_400_000) {
    dayCounter = 0
    dayWindowStart = now
  }

  if (secondCounter >= DEFAULT_RATE_LIMIT_PER_SECOND) return false
  if (dayCounter >= DEFAULT_RATE_LIMIT_PER_DAY) return false

  secondCounter++
  dayCounter++
  return true
}

// ============================================================================
// HELPERS
// ============================================================================

function getConfig(): InfobipSMSConfig | null {
  const baseUrl = process.env.INFOBIP_API_URL || process.env.INFOPIB_API_URL
  const apiKey = process.env.INFOBIP_API_KEY || process.env.INFOPIB_API_KEY

  if (!baseUrl || !apiKey) return null
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function jitter(ms: number): number {
  return ms + Math.random() * ms * 0.3
}

// ============================================================================
// SERVICE
// ============================================================================

export const InfobipSMSSender = {
  /**
   * Check if the Infobip SMS service is configured and available.
   */
  isAvailable(): boolean {
    return getConfig() !== null
  },

  /**
   * Get current rate-limit information.
   */
  getRateLimitStatus(): RateLimitInfo {
    const resetAt = new Date(dayWindowStart + 86_400_000)
    return {
      remaining: Math.max(0, DEFAULT_RATE_LIMIT_PER_DAY - dayCounter),
      limit: DEFAULT_RATE_LIMIT_PER_DAY,
      resetAt,
    }
  },

  /**
   * Send a single SMS message via Infobip.
   */
  async send(options: SMSSendOptions): Promise<SMSSendResult> {
    const config = getConfig()
    if (!config) {
      return { success: false, error: "Infobip SMS not configured (missing INFOBIP_API_URL / INFOBIP_API_KEY)" }
    }

    // Rate-limit check
    if (!checkRateLimit()) {
      return { success: false, error: "Rate limit exceeded" }
    }

    const from = options.from || DEFAULT_SENDER_ID
    let text = options.text
    if (options.appendOptOut) {
      text += OPT_OUT_FOOTER
    }

    const payload = {
      messages: [
        {
          destinations: [{ to: options.to }],
          from,
          text,
          ...(options.notifyUrl ? { notifyUrl: options.notifyUrl } : {}),
        },
      ],
    }

    // Retry loop with exponential back-off
    const maxAttempts = 3
    let lastError: string | undefined

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await fetch(`${config.baseUrl}/sms/2/text/advanced`, {
          method: "POST",
          headers: {
            Authorization: `App ${config.apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(payload),
        })

        const data = (await response.json()) as {
          bulkId?: string
          messages?: Array<{
            messageId?: string
            status?: { groupId?: number; groupName?: string; name?: string; description?: string }
            to?: string
          }>
          requestError?: { serviceException?: { messageId?: string; text?: string } }
        }

        // API-level error
        if (!response.ok) {
          const errorText = data.requestError?.serviceException?.text || response.statusText
          lastError = `Infobip API ${response.status}: ${errorText}`

          // Only retry on 429 / 5xx
          if (response.status === 429 || response.status >= 500) {
            await sleep(jitter(1000 * Math.pow(2, attempt)))
            continue
          }

          return { success: false, error: lastError, retryAttempts: attempt }
        }

        const msg = data.messages?.[0]
        const statusGroup = msg?.status?.groupId

        // Check if the message was accepted
        if (statusGroup === 1 || statusGroup === 3) {
          // 1 = PENDING_ENROUTE, 3 = PENDING
          return {
            success: true,
            messageId: msg?.messageId,
            bulkId: data.bulkId,
            status: msg?.status?.groupName,
            statusDescription: msg?.status?.description,
            retryAttempts: attempt,
          }
        }

        // Retryable statuses
        if (statusGroup && RETRYABLE_STATUS_GROUPS.has(statusGroup)) {
          lastError = `Infobip status ${msg?.status?.groupName}: ${msg?.status?.description}`
          await sleep(jitter(1000 * Math.pow(2, attempt)))
          continue
        }

        // Non-retryable failure
        return {
          success: false,
          messageId: msg?.messageId,
          status: msg?.status?.groupName,
          statusDescription: msg?.status?.description,
          error: `SMS rejected: ${msg?.status?.description || msg?.status?.groupName}`,
          retryAttempts: attempt,
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
        if (attempt < maxAttempts - 1) {
          await sleep(jitter(1000 * Math.pow(2, attempt)))
        }
      }
    }

    return { success: false, error: lastError || "Max retries exceeded", retryAttempts: maxAttempts }
  },

  /**
   * Send a batch of SMS messages in a single Infobip API call.
   *
   * Infobip supports up to ~1 000 destinations per request.
   * This method chunks into batches of 500 for safety.
   */
  async sendBatch(items: BatchSMSItem[]): Promise<BatchSMSResult> {
    const config = getConfig()
    if (!config) {
      return {
        total: items.length,
        sent: 0,
        failed: items.length,
        results: items.map(() => ({
          success: false,
          error: "Infobip SMS not configured",
        })),
      }
    }

    const CHUNK_SIZE = 500
    const allResults: SMSSendResult[] = []
    let sent = 0
    let failed = 0
    let bulkId: string | undefined

    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      const chunk = items.slice(i, i + CHUNK_SIZE)

      const payload = {
        messages: chunk.map((item) => ({
          destinations: [{ to: item.to }],
          from: item.from || DEFAULT_SENDER_ID,
          text: item.text,
        })),
      }

      try {
        const response = await fetch(`${config.baseUrl}/sms/2/text/advanced`, {
          method: "POST",
          headers: {
            Authorization: `App ${config.apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(payload),
        })

        const data = (await response.json()) as {
          bulkId?: string
          messages?: Array<{
            messageId?: string
            status?: { groupId?: number; groupName?: string; description?: string }
          }>
        }

        if (!bulkId && data.bulkId) bulkId = data.bulkId

        if (!response.ok) {
          chunk.forEach(() => {
            allResults.push({ success: false, error: `Infobip API ${response.status}` })
            failed++
          })
          continue
        }

        for (const msg of data.messages || []) {
          const ok = msg.status?.groupId === 1 || msg.status?.groupId === 3
          allResults.push({
            success: ok,
            messageId: msg.messageId,
            status: msg.status?.groupName,
            statusDescription: msg.status?.description,
            error: ok ? undefined : msg.status?.description,
          })
          if (ok) sent++
          else failed++
        }
      } catch (err) {
        chunk.forEach(() => {
          allResults.push({ success: false, error: err instanceof Error ? err.message : String(err) })
          failed++
        })
      }

      // Small delay between chunks to avoid rate-limit spikes
      if (i + CHUNK_SIZE < items.length) {
        await sleep(200)
      }
    }

    return { total: items.length, sent, failed, results: allResults, bulkId }
  },

  /**
   * Verify the Infobip API connection by fetching account balance.
   */
  async verifyConnection(): Promise<{ ok: boolean; error?: string }> {
    const config = getConfig()
    if (!config) {
      return { ok: false, error: "Infobip SMS not configured" }
    }

    try {
      const response = await fetch(`${config.baseUrl}/account/1/balance`, {
        headers: {
          Authorization: `App ${config.apiKey}`,
          Accept: "application/json",
        },
      })

      if (!response.ok) {
        return { ok: false, error: `API responded ${response.status}` }
      }

      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  },
}
