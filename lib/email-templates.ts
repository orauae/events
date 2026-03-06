import { nanoid } from 'nanoid';
import type { EmailBuilderState, Block, TextBlock, ImageBlock, ButtonBlock, DividerBlock, SpacerBlock, ColumnsBlock } from './types/email-builder';
import { DEFAULT_GLOBAL_STYLES, DEFAULT_TEXT_STYLES, DEFAULT_BUTTON_STYLES, DEFAULT_DIVIDER_STYLES } from './types/email-builder';

// Pre-built email templates
export interface EmailTemplate {
  id: string;
  name: string;
  description: string;
  thumbnail: string;
  campaignType: string;
  state: EmailBuilderState;
}

// Helper to create blocks with unique IDs
function createBlocks(blocks: Array<Omit<TextBlock, 'id'> | Omit<ImageBlock, 'id'> | Omit<ButtonBlock, 'id'> | Omit<DividerBlock, 'id'> | Omit<SpacerBlock, 'id'> | Omit<ColumnsBlock, 'id'>>): Block[] {
  return blocks.map(block => ({
    ...block,
    id: nanoid(),
  })) as Block[];
}

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: 'invitation',
    name: 'Event Invitation',
    description: 'Professional invitation with event details and RSVP button',
    thumbnail: '/templates/invitation.png',
    campaignType: 'Invitation',
    state: {
      blocks: createBlocks([
        {
          type: 'text',
          content: '<h1 style="margin: 0;">You\'re Invited! 🎉</h1>',
          styles: { ...DEFAULT_TEXT_STYLES, fontSize: 32, textAlign: 'center', fontWeight: 'bold' },
        },
        {
          type: 'spacer',
          height: 20,
        },
        {
          type: 'text',
          content: '<p>Dear {firstName},</p><p>We are delighted to invite you to <strong>{eventName}</strong>. This is an event you won\'t want to miss!</p>',
          styles: { ...DEFAULT_TEXT_STYLES, fontSize: 16 },
        },
        {
          type: 'divider',
          styles: { ...DEFAULT_DIVIDER_STYLES },
        },
        {
          type: 'text',
          content: '<p><strong>📅 Date:</strong> {eventDate}</p><p><strong>📍 Location:</strong> {eventLocation}</p>',
          styles: { ...DEFAULT_TEXT_STYLES, fontSize: 16 },
        },
        {
          type: 'spacer',
          height: 30,
        },
        {
          type: 'button',
          text: 'RSVP Now',
          url: '{rsvpLink}',
          styles: { ...DEFAULT_BUTTON_STYLES },
        },
        {
          type: 'spacer',
          height: 30,
        },
        {
          type: 'text',
          content: '<p style="text-align: center;">We look forward to seeing you there!</p>',
          styles: { ...DEFAULT_TEXT_STYLES, fontSize: 14, textAlign: 'center', color: '#4A4A4A' },
        },
      ]),
      globalStyles: { ...DEFAULT_GLOBAL_STYLES },
      metadata: { lastSaved: null, version: 1 },
    },
  },
  {
    id: 'reminder',
    name: 'Event Reminder',
    description: 'Friendly reminder for upcoming event',
    thumbnail: '/templates/reminder.png',
    campaignType: 'Reminder',
    state: {
      blocks: createBlocks([
        {
          type: 'text',
          content: '<h1 style="margin: 0;">Don\'t Forget! ⏰</h1>',
          styles: { ...DEFAULT_TEXT_STYLES, fontSize: 28, textAlign: 'center', fontWeight: 'bold' },
        },
        {
          type: 'spacer',
          height: 20,
        },
        {
          type: 'text',
          content: '<p>Hi {firstName},</p><p>Just a friendly reminder that <strong>{eventName}</strong> is coming up soon!</p>',
          styles: { ...DEFAULT_TEXT_STYLES, fontSize: 16 },
        },
        {
          type: 'divider',
          styles: { ...DEFAULT_DIVIDER_STYLES },
        },
        {
          type: 'text',
          content: '<p><strong>📅 When:</strong> {eventDate}</p><p><strong>📍 Where:</strong> {eventLocation}</p>',
          styles: { ...DEFAULT_TEXT_STYLES, fontSize: 16 },
        },
        {
          type: 'spacer',
          height: 20,
        },
        {
          type: 'text',
          content: '<p>Haven\'t confirmed your attendance yet? There\'s still time!</p>',
          styles: { ...DEFAULT_TEXT_STYLES, fontSize: 16 },
        },
        {
          type: 'spacer',
          height: 20,
        },
        {
          type: 'button',
          text: 'Confirm Attendance',
          url: '{rsvpLink}',
          styles: { ...DEFAULT_BUTTON_STYLES },
        },
        {
          type: 'spacer',
          height: 30,
        },
        {
          type: 'text',
          content: '<p style="text-align: center;">See you soon!</p>',
          styles: { ...DEFAULT_TEXT_STYLES, fontSize: 14, textAlign: 'center', color: '#4A4A4A' },
        },
      ]),
      globalStyles: { ...DEFAULT_GLOBAL_STYLES },
      metadata: { lastSaved: null, version: 1 },
    },
  },
  {
    id: 'last-chance',
    name: 'Last Chance',
    description: 'Urgent reminder for final RSVP deadline',
    thumbnail: '/templates/last-chance.png',
    campaignType: 'LastChance',
    state: {
      blocks: createBlocks([
        {
          type: 'text',
          content: '<h1 style="margin: 0; color: #B8956B;">Last Chance to RSVP! ⚡</h1>',
          styles: { ...DEFAULT_TEXT_STYLES, fontSize: 28, textAlign: 'center', fontWeight: 'bold' },
        },
        {
          type: 'spacer',
          height: 20,
        },
        {
          type: 'text',
          content: '<p>Hi {firstName},</p><p>This is your <strong>final reminder</strong> to RSVP for <strong>{eventName}</strong>. Don\'t miss out!</p>',
          styles: { ...DEFAULT_TEXT_STYLES, fontSize: 16 },
        },
        {
          type: 'divider',
          styles: { ...DEFAULT_DIVIDER_STYLES },
        },
        {
          type: 'text',
          content: '<p><strong>📅 Date:</strong> {eventDate}</p><p><strong>📍 Location:</strong> {eventLocation}</p>',
          styles: { ...DEFAULT_TEXT_STYLES, fontSize: 16 },
        },
        {
          type: 'spacer',
          height: 30,
        },
        {
          type: 'button',
          text: 'RSVP Before It\'s Too Late',
          url: '{rsvpLink}',
          styles: { ...DEFAULT_BUTTON_STYLES, backgroundColor: '#C44536' },
        },
        {
          type: 'spacer',
          height: 30,
        },
        {
          type: 'text',
          content: '<p style="text-align: center;">We hope to see you there!</p>',
          styles: { ...DEFAULT_TEXT_STYLES, fontSize: 14, textAlign: 'center', color: '#4A4A4A' },
        },
      ]),
      globalStyles: { ...DEFAULT_GLOBAL_STYLES },
      metadata: { lastSaved: null, version: 1 },
    },
  },
  {
    id: 'event-day',
    name: 'Event Day Info',
    description: 'Day-of information with badge link',
    thumbnail: '/templates/event-day.png',
    campaignType: 'EventDayInfo',
    state: {
      blocks: createBlocks([
        {
          type: 'text',
          content: '<h1 style="margin: 0;">Today\'s the Day! 🎊</h1>',
          styles: { ...DEFAULT_TEXT_STYLES, fontSize: 28, textAlign: 'center', fontWeight: 'bold' },
        },
        {
          type: 'spacer',
          height: 20,
        },
        {
          type: 'text',
          content: '<p>Hi {firstName},</p><p>We\'re excited to see you at <strong>{eventName}</strong> today!</p>',
          styles: { ...DEFAULT_TEXT_STYLES, fontSize: 16 },
        },
        {
          type: 'divider',
          styles: { ...DEFAULT_DIVIDER_STYLES },
        },
        {
          type: 'text',
          content: '<h3>📍 Event Details</h3><p><strong>Location:</strong> {eventLocation}</p><p><strong>Date:</strong> {eventDate}</p>',
          styles: { ...DEFAULT_TEXT_STYLES, fontSize: 16 },
        },
        {
          type: 'spacer',
          height: 20,
        },
        {
          type: 'text',
          content: '<h3>🎫 Your Digital Badge</h3><p>Download your badge below for quick check-in at the event:</p>',
          styles: { ...DEFAULT_TEXT_STYLES, fontSize: 16 },
        },
        {
          type: 'spacer',
          height: 10,
        },
        {
          type: 'button',
          text: 'Download Your Badge',
          url: '{badgeLink}',
          styles: { ...DEFAULT_BUTTON_STYLES },
        },
        {
          type: 'spacer',
          height: 30,
        },
        {
          type: 'text',
          content: '<p style="text-align: center;">See you soon! 👋</p>',
          styles: { ...DEFAULT_TEXT_STYLES, fontSize: 14, textAlign: 'center', color: '#4A4A4A' },
        },
      ]),
      globalStyles: { ...DEFAULT_GLOBAL_STYLES },
      metadata: { lastSaved: null, version: 1 },
    },
  },
  {
    id: 'thank-you',
    name: 'Thank You',
    description: 'Post-event thank you message',
    thumbnail: '/templates/thank-you.png',
    campaignType: 'ThankYou',
    state: {
      blocks: createBlocks([
        {
          type: 'text',
          content: '<h1 style="margin: 0;">Thank You! 🙏</h1>',
          styles: { ...DEFAULT_TEXT_STYLES, fontSize: 28, textAlign: 'center', fontWeight: 'bold' },
        },
        {
          type: 'spacer',
          height: 20,
        },
        {
          type: 'text',
          content: '<p>Dear {firstName},</p><p>Thank you for attending <strong>{eventName}</strong>! We hope you had a wonderful time.</p>',
          styles: { ...DEFAULT_TEXT_STYLES, fontSize: 16 },
        },
        {
          type: 'spacer',
          height: 20,
        },
        {
          type: 'text',
          content: '<p>Your presence made the event truly special. We appreciate you taking the time to join us.</p>',
          styles: { ...DEFAULT_TEXT_STYLES, fontSize: 16 },
        },
        {
          type: 'divider',
          styles: { ...DEFAULT_DIVIDER_STYLES },
        },
        {
          type: 'text',
          content: '<p>We\'d love to hear your thoughts! Your feedback helps us improve future events.</p>',
          styles: { ...DEFAULT_TEXT_STYLES, fontSize: 16 },
        },
        {
          type: 'spacer',
          height: 30,
        },
        {
          type: 'text',
          content: '<p style="text-align: center;">Until next time! 💫</p>',
          styles: { ...DEFAULT_TEXT_STYLES, fontSize: 14, textAlign: 'center', color: '#4A4A4A' },
        },
      ]),
      globalStyles: { ...DEFAULT_GLOBAL_STYLES },
      metadata: { lastSaved: null, version: 1 },
    },
  },
  {
    id: 'feedback',
    name: 'Feedback Request',
    description: 'Request for event feedback',
    thumbnail: '/templates/feedback.png',
    campaignType: 'Feedback',
    state: {
      blocks: createBlocks([
        {
          type: 'text',
          content: '<h1 style="margin: 0;">We\'d Love Your Feedback! 📝</h1>',
          styles: { ...DEFAULT_TEXT_STYLES, fontSize: 28, textAlign: 'center', fontWeight: 'bold' },
        },
        {
          type: 'spacer',
          height: 20,
        },
        {
          type: 'text',
          content: '<p>Hi {firstName},</p><p>Thank you again for attending <strong>{eventName}</strong>! We hope you enjoyed the experience.</p>',
          styles: { ...DEFAULT_TEXT_STYLES, fontSize: 16 },
        },
        {
          type: 'spacer',
          height: 20,
        },
        {
          type: 'text',
          content: '<p>Your feedback is incredibly valuable to us. It helps us understand what worked well and what we can improve for future events.</p>',
          styles: { ...DEFAULT_TEXT_STYLES, fontSize: 16 },
        },
        {
          type: 'spacer',
          height: 20,
        },
        {
          type: 'text',
          content: '<p>The survey takes only 2-3 minutes to complete.</p>',
          styles: { ...DEFAULT_TEXT_STYLES, fontSize: 16 },
        },
        {
          type: 'spacer',
          height: 20,
        },
        {
          type: 'button',
          text: 'Share Your Feedback',
          url: '{rsvpLink}',
          styles: { ...DEFAULT_BUTTON_STYLES },
        },
        {
          type: 'spacer',
          height: 30,
        },
        {
          type: 'text',
          content: '<p style="text-align: center;">Thank you for helping us improve! 🌟</p>',
          styles: { ...DEFAULT_TEXT_STYLES, fontSize: 14, textAlign: 'center', color: '#4A4A4A' },
        },
      ]),
      globalStyles: { ...DEFAULT_GLOBAL_STYLES },
      metadata: { lastSaved: null, version: 1 },
    },
  },
];

// Get template by ID
export function getTemplateById(id: string): EmailTemplate | undefined {
  return EMAIL_TEMPLATES.find(t => t.id === id);
}

// Get template by campaign type
export function getTemplateByType(campaignType: string): EmailTemplate | undefined {
  return EMAIL_TEMPLATES.find(t => t.campaignType === campaignType);
}

// Create a blank template
export function createBlankTemplate(): EmailBuilderState {
  return {
    blocks: [],
    globalStyles: { ...DEFAULT_GLOBAL_STYLES },
    metadata: { lastSaved: null, version: 1 },
  };
}
