/**
 * Pre-built Automation Templates
 * Requirements: 5.1, 5.4, 5.5, 5.6
 * 
 * These templates provide ready-to-use automation workflows that event managers
 * can import and customize for their events.
 */

import type { AutomationNodeInput, AutomationEdgeInput } from './services/automation-service';

export type TemplateCategory = 'engagement' | 'reminder' | 'follow-up' | 'vip';

export interface AutomationTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  nodes: AutomationNodeInput[];
  edges: AutomationEdgeInput[];
}

/**
 * Welcome Series Template
 * Requirements: 5.5
 * 
 * Sends a welcome email when guests RSVP, followed by event details after 2 days.
 */
const welcomeSeriesTemplate: AutomationTemplate = {
  id: 'welcome-series',
  name: 'Welcome Series',
  description: 'Send a welcome email when guests RSVP, followed by event details after 2 days',
  category: 'engagement',
  nodes: [
    {
      type: 'trigger',
      subType: 'guest_rsvp_received',
      label: 'Guest RSVPs',
      position: { x: 250, y: 50 },
      config: { rsvpStatuses: ['Attending'] },
    },
    {
      type: 'action',
      subType: 'send_email',
      label: 'Send Welcome Email',
      position: { x: 250, y: 150 },
      config: { subject: 'Welcome! Your RSVP is confirmed', content: '' },
    },
    {
      type: 'action',
      subType: 'wait_delay',
      label: 'Wait 2 Days',
      position: { x: 250, y: 250 },
      config: { duration: 2, unit: 'days' },
    },
    {
      type: 'action',
      subType: 'send_email',
      label: 'Send Event Details',
      position: { x: 250, y: 350 },
      config: { subject: 'Everything you need to know about {eventName}', content: '' },
    },
  ],
  edges: [
    { sourceNodeId: '0', targetNodeId: '1' },
    { sourceNodeId: '1', targetNodeId: '2' },
    { sourceNodeId: '2', targetNodeId: '3' },
  ],
};


/**
 * RSVP Reminder Sequence Template
 * Requirements: 5.6
 * 
 * Reminds guests who haven't responded as the event approaches.
 */
const rsvpReminderSequenceTemplate: AutomationTemplate = {
  id: 'rsvp-reminder-sequence',
  name: 'RSVP Reminder Sequence',
  description: "Remind guests who haven't responded as the event approaches",
  category: 'reminder',
  nodes: [
    {
      type: 'trigger',
      subType: 'event_date_approaching',
      label: '7 Days Before Event',
      position: { x: 250, y: 50 },
      config: { daysBefore: 7 },
    },
    {
      type: 'condition',
      subType: 'check_rsvp_status',
      label: 'RSVP Pending?',
      position: { x: 250, y: 150 },
      config: { statuses: ['Pending'] },
    },
    {
      type: 'action',
      subType: 'send_email',
      label: 'Send First Reminder',
      position: { x: 100, y: 250 },
      config: { subject: "We'd love to see you at {eventName}", content: '' },
    },
    {
      type: 'action',
      subType: 'wait_delay',
      label: 'Wait 3 Days',
      position: { x: 100, y: 350 },
      config: { duration: 3, unit: 'days' },
    },
    {
      type: 'action',
      subType: 'send_email',
      label: 'Send Final Reminder',
      position: { x: 100, y: 450 },
      config: { subject: 'Last chance to RSVP for {eventName}', content: '' },
    },
  ],
  edges: [
    { sourceNodeId: '0', targetNodeId: '1' },
    { sourceNodeId: '1', targetNodeId: '2', sourceHandle: 'true' },
    { sourceNodeId: '2', targetNodeId: '3' },
    { sourceNodeId: '3', targetNodeId: '4' },
  ],
};

/**
 * No-Show Follow-up Template
 * Requirements: 5.1
 * 
 * Follows up with guests who confirmed but didn't check in.
 */
const noShowFollowUpTemplate: AutomationTemplate = {
  id: 'no-show-follow-up',
  name: 'No-Show Follow-up',
  description: "Follow up with guests who confirmed but didn't check in",
  category: 'follow-up',
  nodes: [
    {
      type: 'trigger',
      subType: 'event_date_approaching',
      label: '1 Day After Event',
      position: { x: 250, y: 50 },
      config: { daysBefore: -1 },
    },
    {
      type: 'condition',
      subType: 'check_rsvp_status',
      label: 'Was Attending?',
      position: { x: 250, y: 150 },
      config: { statuses: ['Attending'] },
    },
    {
      type: 'action',
      subType: 'send_email',
      label: 'Send Sorry We Missed You',
      position: { x: 100, y: 250 },
      config: { subject: 'We missed you at {eventName}', content: '' },
    },
  ],
  edges: [
    { sourceNodeId: '0', targetNodeId: '1' },
    { sourceNodeId: '1', targetNodeId: '2', sourceHandle: 'true' },
  ],
};


/**
 * VIP Guest Treatment Template
 * Requirements: 5.1
 * 
 * Special handling for VIP-tagged guests with personalized welcome.
 */
const vipGuestTreatmentTemplate: AutomationTemplate = {
  id: 'vip-guest-treatment',
  name: 'VIP Guest Treatment',
  description: 'Special handling for VIP-tagged guests',
  category: 'vip',
  nodes: [
    {
      type: 'trigger',
      subType: 'guest_rsvp_received',
      label: 'Guest RSVPs',
      position: { x: 250, y: 50 },
      config: { rsvpStatuses: ['Attending'] },
    },
    {
      type: 'condition',
      subType: 'check_guest_tag',
      label: 'Is VIP?',
      position: { x: 250, y: 150 },
      config: { tagId: 'vip', hasTag: true },
    },
    {
      type: 'action',
      subType: 'send_email',
      label: 'Send VIP Welcome',
      position: { x: 100, y: 250 },
      config: { subject: 'VIP Access Confirmed for {eventName}', content: '' },
    },
    {
      type: 'action',
      subType: 'send_email',
      label: 'Send Standard Welcome',
      position: { x: 400, y: 250 },
      config: { subject: 'Welcome to {eventName}', content: '' },
    },
  ],
  edges: [
    { sourceNodeId: '0', targetNodeId: '1' },
    { sourceNodeId: '1', targetNodeId: '2', sourceHandle: 'true' },
    { sourceNodeId: '1', targetNodeId: '3', sourceHandle: 'false' },
  ],
};

/**
 * Post-Event Thank You Template
 * Requirements: 5.1
 * 
 * Thanks attendees after the event.
 */
const postEventThankYouTemplate: AutomationTemplate = {
  id: 'post-event-thank-you',
  name: 'Post-Event Thank You',
  description: 'Thank attendees after the event',
  category: 'follow-up',
  nodes: [
    {
      type: 'trigger',
      subType: 'event_date_approaching',
      label: '1 Day After Event',
      position: { x: 250, y: 50 },
      config: { daysBefore: -1 },
    },
    {
      type: 'action',
      subType: 'send_email',
      label: 'Send Thank You',
      position: { x: 250, y: 150 },
      config: { subject: 'Thank you for attending {eventName}!', content: '' },
    },
  ],
  edges: [
    { sourceNodeId: '0', targetNodeId: '1' },
  ],
};

/**
 * Feedback Collection Template
 * Requirements: 5.1
 * 
 * Requests feedback from attendees who checked in.
 */
const feedbackCollectionTemplate: AutomationTemplate = {
  id: 'feedback-collection',
  name: 'Feedback Collection',
  description: 'Request feedback from attendees who checked in',
  category: 'follow-up',
  nodes: [
    {
      type: 'trigger',
      subType: 'guest_checked_in',
      label: 'Guest Checks In',
      position: { x: 250, y: 50 },
      config: {},
    },
    {
      type: 'action',
      subType: 'wait_delay',
      label: 'Wait Until After Event',
      position: { x: 250, y: 150 },
      config: { duration: 1, unit: 'days' },
    },
    {
      type: 'action',
      subType: 'send_email',
      label: 'Send Feedback Request',
      position: { x: 250, y: 250 },
      config: { subject: "How was {eventName}? We'd love your feedback", content: '' },
    },
  ],
  edges: [
    { sourceNodeId: '0', targetNodeId: '1' },
    { sourceNodeId: '1', targetNodeId: '2' },
  ],
};

/**
 * All available automation templates
 * Requirements: 5.1
 */
export const automationTemplates: AutomationTemplate[] = [
  welcomeSeriesTemplate,
  rsvpReminderSequenceTemplate,
  noShowFollowUpTemplate,
  vipGuestTreatmentTemplate,
  postEventThankYouTemplate,
  feedbackCollectionTemplate,
];

export default automationTemplates;
