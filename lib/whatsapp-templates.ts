/**
 * Local WhatsApp message templates.
 *
 * WhatsApp supports text formatting (*bold*, _italic_, ~strikethrough~, ```mono```).
 * Images cannot be inline — they go as a header attachment.
 * Templates provide a starting body that users can edit freely.
 */

export interface WhatsAppTemplate {
  id: string
  name: string
  description: string
  category: "invitation" | "reminder" | "thankyou" | "feedback" | "info" | "lastchance"
  body: string
  /** Whether this template typically includes a header image */
  hasImage: boolean
}

export const WHATSAPP_TEMPLATES: WhatsAppTemplate[] = [
  {
    id: "wa-invitation-formal",
    name: "Formal Invitation",
    category: "invitation",
    description: "Elegant event invitation with full details",
    hasImage: true,
    body: `✨ *You're Invited* ✨

Dear {{1}},

We are delighted to invite you to *{{2}}*.

📅 *Date:* {{3}}
📍 *Venue:* {{4}}

This promises to be an exceptional gathering and your presence would truly make it special.

Please confirm your attendance at your earliest convenience.

_We look forward to welcoming you!_`,
  },
  {
    id: "wa-invitation-casual",
    name: "Casual Invitation",
    category: "invitation",
    description: "Friendly, relaxed event invitation",
    hasImage: true,
    body: `Hey {{1}}! 👋

You're invited to *{{2}}*!

📅 {{3}}
📍 {{4}}

It's going to be a great time — would love to see you there!

Let us know if you can make it. 🎉`,
  },
  {
    id: "wa-invitation-corporate",
    name: "Corporate Invitation",
    category: "invitation",
    description: "Professional business event invitation",
    hasImage: true,
    body: `Dear {{1}},

You are cordially invited to attend *{{2}}*.

*Event Details:*
📅 Date: {{3}}
📍 Location: {{4}}

This event will feature industry leaders and networking opportunities relevant to your field.

Kindly RSVP to confirm your participation.

Best regards,
_The Events Team_`,
  },
  {
    id: "wa-reminder-gentle",
    name: "Gentle Reminder",
    category: "reminder",
    description: "Friendly reminder about upcoming event",
    hasImage: false,
    body: `Hi {{1}}! 😊

Just a friendly reminder that *{{2}}* is coming up soon!

📅 {{3}}
📍 {{4}}

We're excited to see you there. Don't forget to check in when you arrive!

_See you soon!_`,
  },
  {
    id: "wa-reminder-urgent",
    name: "Urgent Reminder",
    category: "reminder",
    description: "Time-sensitive event reminder",
    hasImage: false,
    body: `⏰ *Reminder: {{2}}*

Hi {{1}},

This is a reminder that the event is *tomorrow*!

📅 {{3}}
📍 {{4}}

Please make sure to:
• Bring your confirmation/QR code
• Arrive 15 minutes early for check-in
• Check the venue directions in advance

_We look forward to seeing you!_`,
  },
  {
    id: "wa-lastchance",
    name: "Last Chance RSVP",
    category: "lastchance",
    description: "Final call to register or confirm attendance",
    hasImage: false,
    body: `🔔 *Last Chance to Register!*

Hi {{1}},

Spots for *{{2}}* are filling up fast!

📅 {{3}}
📍 {{4}}

This is your final opportunity to secure your place. Don't miss out on this incredible event.

_Register now before it's too late!_`,
  },
  {
    id: "wa-thankyou",
    name: "Thank You",
    category: "thankyou",
    description: "Post-event thank you message",
    hasImage: true,
    body: `🙏 *Thank You, {{1}}!*

Thank you for attending *{{2}}*. We hope you had a wonderful experience!

Your presence made the event truly special. We'd love to hear your thoughts — your feedback helps us create even better events.

_Until next time!_ ✨`,
  },
  {
    id: "wa-feedback",
    name: "Feedback Request",
    category: "feedback",
    description: "Request for event feedback and rating",
    hasImage: false,
    body: `Hi {{1}},

We hope you enjoyed *{{2}}*! 🎉

We'd love to hear your feedback. It only takes a minute and helps us improve future events.

*How would you rate your experience?*
⭐ Reply with a number from 1-5

Your honest feedback is greatly appreciated!

_Thank you for your time._`,
  },
  {
    id: "wa-eventday-info",
    name: "Event Day Info",
    category: "info",
    description: "Day-of logistics and important information",
    hasImage: true,
    body: `📋 *Event Day Information*

Hi {{1}},

*{{2}}* is today! Here's everything you need to know:

📅 {{3}}
📍 {{4}}

*Important Details:*
• Check-in opens 30 minutes before the event
• Bring your QR code or confirmation email
• Parking is available on-site
• Smart casual dress code

*Need help?* Reply to this message and our team will assist you.

_See you there!_ 🎉`,
  },
]

/**
 * Get templates filtered by category
 */
export function getTemplatesByCategory(category: string): WhatsAppTemplate[] {
  return WHATSAPP_TEMPLATES.filter((t) => t.category === category)
}

/**
 * Get a template by ID
 */
export function getTemplateById(id: string): WhatsAppTemplate | undefined {
  return WHATSAPP_TEMPLATES.find((t) => t.id === id)
}
