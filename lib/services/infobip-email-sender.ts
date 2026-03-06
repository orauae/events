/**
 * @fileoverview Infobip Email Sender Service
 *
 * Sends emails via the Infobip HTTP API (v3 — multipart/form-data).
 *
 * Endpoint: POST {baseUrl}/email/3/send
 * Auth: App {apiKey}
 * Content-Type: multipart/form-data
 *
 * @see https://www.infobip.com/docs/email/email-over-api/send-email-over-http-api
 * @module lib/services/infobip-email-sender
 */

export interface InfobipEmailSendOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
  headers?: Record<string, string>;
}

export interface InfobipEmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

function getConfig() {
  const baseUrl = process.env.INFOBIP_API_URL;
  const apiKey = process.env.INFOBIP_API_KEY;
  const fromEmail = process.env.INFOBIP_EMAIL_FROM;

  if (!baseUrl || !apiKey || !fromEmail) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, ''), apiKey, fromEmail };
}

export const InfobipEmailSender = {
  /**
   * Check if Infobip email is configured.
   */
  isAvailable(): boolean {
    return getConfig() !== null;
  },

  /**
   * Send a single email via Infobip HTTP API v3.
   */
  async send(options: InfobipEmailSendOptions): Promise<InfobipEmailSendResult> {
    const config = getConfig();
    if (!config) {
      return { success: false, error: 'Infobip email not configured (missing INFOBIP_API_URL, INFOBIP_API_KEY, or INFOBIP_EMAIL_FROM)' };
    }

    const from = options.from || config.fromEmail;

    // Infobip v3 uses multipart/form-data
    const formData = new FormData();
    formData.append('from', from);
    formData.append('to', options.to);
    formData.append('subject', options.subject);
    formData.append('html', options.html);

    try {
      const response = await fetch(`${config.baseUrl}/email/3/send`, {
        method: 'POST',
        headers: {
          Authorization: `App ${config.apiKey}`,
          Accept: 'application/json',
        },
        body: formData,
      });

      const data = (await response.json()) as {
        bulkId?: string;
        messages?: Array<{
          messageId?: string;
          status?: { groupId?: number; groupName?: string; name?: string; description?: string };
          to?: string;
        }>;
        requestError?: { serviceException?: { messageId?: string; text?: string } };
      };

      if (!response.ok) {
        const errorText = data.requestError?.serviceException?.text || response.statusText;
        return { success: false, error: `Infobip API ${response.status}: ${errorText}` };
      }

      const msg = data.messages?.[0];
      const statusGroup = msg?.status?.groupId;

      // groupId 1 = PENDING (accepted), 3 = DELIVERED
      if (statusGroup === 1 || statusGroup === 3) {
        return { success: true, messageId: msg?.messageId };
      }

      // groupId 4 = REJECTED, 5 = EXPIRED
      return {
        success: false,
        messageId: msg?.messageId,
        error: msg?.status?.description || msg?.status?.name || 'Unknown Infobip error',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};
