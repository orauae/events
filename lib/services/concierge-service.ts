/**
 * @fileoverview Concierge Service - AI conversation engine using Claude via Azure AI
 *
 * Generates context-aware responses for event guests using Claude AI.
 * Builds rich prompts with event details, guest profile, tier, knowledge base,
 * agenda, conversation history, and event phase. Implements confidence scoring,
 * escalation threshold checks, tier-aware tone adjustment, and phase-aware
 * response focus.
 *
 * @module lib/services/concierge-service
 * @requires @anthropic-ai/sdk - Anthropic SDK for Claude API (Azure endpoint)
 * @requires drizzle-orm - Database ORM
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 5.4
 */

import Anthropic from '@anthropic-ai/sdk';
import { db } from '@/db';
import {
  whatsappConversations,
  whatsappMessages,
  eventAgendas,
  eventKnowledgeBase,
  whatsappTokenQueues,
  events,
  guests,
  eventGuests,
  type Event,
  type Guest,
  type EventGuest,
  type WhatsAppConversation,
  type WhatsAppMessage,
  type EventAgenda,
  type EventKnowledgeBase,
} from '@/db/schema';
import { eq, desc, and } from 'drizzle-orm';
import type { WhatsAppMessageContent } from './whatsapp-message-service';

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_ESCALATION_THRESHOLD = 0.5;
const MAX_RECENT_MESSAGES = 20;
const MAX_TOKENS = 1024;

// ============================================================================
// TYPES
// ============================================================================

/**
 * Full context needed for AI response generation.
 * Built by loadContext from conversation, event, guest, and related data.
 *
 * Requirements: 4.1
 */
export interface ConciergeContext {
  event: Event;
  guest: Guest;
  eventGuest: EventGuest;
  conversation: WhatsAppConversation;
  recentMessages: WhatsAppMessage[];
  knowledgeBase: EventKnowledgeBase[];
  agenda: EventAgenda[];
  eventPhase: 'pre-event' | 'during-event' | 'post-event';
  tokenNumber?: number;
}

/**
 * AI-generated response with confidence scoring and escalation flag.
 *
 * Requirements: 4.7
 */
export interface ConciergeResponse {
  content: WhatsAppMessageContent;
  confidence: number;
  shouldEscalate: boolean;
  topicCategory?: string;
}

// ============================================================================
// ANTHROPIC CLIENT (lazy init, Azure endpoint)
// ============================================================================

let _anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!_anthropicClient) {
    _anthropicClient = new Anthropic({
      baseURL: process.env.AZURE_AI_ENDPOINT,
      apiKey: process.env.AZURE_AI_API_KEY,
    });
  }
  return _anthropicClient;
}

// ============================================================================
// PROMPT BUILDING
// ============================================================================

/**
 * Returns tier-aware tone instructions for the system prompt.
 * VIP/VVIP guests receive a more formal and personalized tone.
 *
 * Requirements: 5.4
 */
function getTierToneInstructions(tier: string): string {
  switch (tier) {
    case 'VVIP':
      return `The guest is a VVIP — our most distinguished attendee. Use a highly formal, respectful, and personalized tone. Address them with utmost courtesy. Proactively offer premium services, dedicated collection points, and priority access. Make them feel exceptionally valued.`;
    case 'VIP':
      return `The guest is a VIP. Use a formal and personalized tone. Be attentive and courteous. Mention any VIP-specific perks such as priority lanes, reserved seating, or dedicated collection points when relevant.`;
    default:
      return `The guest is a regular attendee. Use a warm, friendly, and helpful tone. Be approachable and clear in your responses.`;
  }
}

/**
 * Returns phase-aware focus instructions for the system prompt.
 *
 * Requirements: 4.3, 4.4, 4.5
 */
function getPhaseFocusInstructions(phase: 'pre-event' | 'during-event' | 'post-event'): string {
  switch (phase) {
    case 'pre-event':
      return `The event has not started yet. Focus your responses on:
- Event logistics and preparation information
- RSVP confirmation and attendance details
- Venue directions and how to get there
- What to expect and what to bring
- Schedule overview and key sessions to look forward to`;

    case 'during-event':
      return `The event is currently happening. Focus your responses on:
- Real-time agenda: what's happening now and what's coming up next
- Navigation within the venue and directions to specific areas
- Booth information and queue status
- Immediate assistance and problem-solving
- Current session details, speakers, and locations`;

    case 'post-event':
      return `The event has ended. Focus your responses on:
- Thank-you messages and appreciation for attending
- Feedback collection and survey participation
- Event recap and highlights
- Follow-up information and next steps
- Contact information for any remaining questions`;
  }
}

/**
 * Formats conversation history for the prompt.
 */
function formatConversationHistory(messages: WhatsAppMessage[]): string {
  if (messages.length === 0) {
    return 'No previous messages in this conversation.';
  }

  return messages
    .map((msg) => {
      const role = msg.direction === 'inbound' ? 'Guest' : 'Concierge';
      const content = msg.content as Record<string, unknown>;
      let text = '';

      if (content.type === 'text' && content.text) {
        text = (content.text as { body?: string }).body || JSON.stringify(content.text);
      } else if (content.type === 'location' && content.location) {
        const loc = content.location as { latitude?: number; longitude?: number; name?: string };
        text = `[Location shared: ${loc.name || `${loc.latitude}, ${loc.longitude}`}]`;
      } else {
        text = `[${content.type} message]`;
      }

      return `${role}: ${text}`;
    })
    .join('\n');
}

/**
 * Formats knowledge base entries for the prompt.
 */
function formatKnowledgeBase(entries: EventKnowledgeBase[]): string {
  if (entries.length === 0) {
    return 'No knowledge base entries available.';
  }

  return entries
    .map((entry) => `[${entry.category.toUpperCase()}] Q: ${entry.question}\nA: ${entry.answer}`)
    .join('\n\n');
}

/**
 * Formats agenda items for the prompt.
 */
function formatAgenda(items: EventAgenda[]): string {
  if (items.length === 0) {
    return 'No agenda items available.';
  }

  return items
    .map((item) => {
      const start = new Date(item.startTime).toLocaleString();
      const end = new Date(item.endTime).toLocaleString();
      let entry = `- ${item.title} (${start} – ${end})`;
      if (item.speakerName) entry += `\n  Speaker: ${item.speakerName}`;
      if (item.hallLocation) entry += `\n  Location: ${item.hallLocation}`;
      if (item.description) entry += `\n  ${item.description}`;
      return entry;
    })
    .join('\n');
}

/**
 * Builds the full system prompt for Claude.
 *
 * Requirements: 4.1, 4.3, 4.4, 4.5, 4.8, 5.4
 */
function buildSystemPrompt(context: ConciergeContext): string {
  const { event, guest, eventGuest, eventPhase, knowledgeBase, agenda, recentMessages, tokenNumber } = context;

  const tierInstructions = getTierToneInstructions(eventGuest.tier);
  const phaseInstructions = getPhaseFocusInstructions(eventPhase);
  const kbText = formatKnowledgeBase(knowledgeBase);
  const agendaText = formatAgenda(agenda);
  const historyText = formatConversationHistory(recentMessages);

  const tokenInfo = tokenNumber != null
    ? `The guest has been assigned token number #${tokenNumber}.`
    : 'The guest has not been assigned a token number.';

  return `You are an AI event concierge assistant for "${event.name}". Your role is to help event guests with any questions or needs related to the event. Be accurate, helpful, and concise.

## Event Details
- Name: ${event.name}
- Type: ${event.type}
- Description: ${event.description}
- Location: ${event.location}
- Start: ${new Date(event.startDate).toLocaleString()}
- End: ${new Date(event.endDate).toLocaleString()}
${event.latitude && event.longitude ? `- Coordinates: ${event.latitude}, ${event.longitude}` : ''}

## Guest Profile
- Name: ${guest.firstName} ${guest.lastName}
- Email: ${guest.email}
${guest.company ? `- Company: ${guest.company}` : ''}
${guest.jobTitle ? `- Job Title: ${guest.jobTitle}` : ''}
- Tier: ${eventGuest.tier}
- RSVP Status: ${eventGuest.rsvpStatus}
- Check-in Status: ${eventGuest.checkInStatus}
${tokenInfo}

## Tone & Style
${tierInstructions}

## Current Event Phase: ${eventPhase}
${phaseInstructions}

## Event Knowledge Base
${kbText}

## Event Agenda
${agendaText}

## Conversation History
${historyText}

## Response Instructions
1. Answer the guest's question using the event knowledge base and agenda when relevant.
2. Maintain conversation continuity by referencing previous messages when contextually appropriate.
3. If the guest shares a location, provide navigation directions to the event venue.
4. If you cannot confidently answer a question, indicate low confidence.
5. Keep responses concise and suitable for WhatsApp (short paragraphs, no markdown).

## Response Format
You MUST respond with a valid JSON object in this exact format:
{
  "response": "Your response text to the guest",
  "confidence": 0.95,
  "topicCategory": "category_name"
}

- "response": The text message to send to the guest.
- "confidence": A number between 0 and 1 indicating how confident you are in your answer. Use 1.0 for factual answers from the knowledge base, 0.7-0.9 for reasonable inferences, and below 0.5 if you're unsure.
- "topicCategory": A short category label for the question topic (e.g., "agenda", "navigation", "wifi", "parking", "general", "feedback", "registration", "food_beverage").`;
}


// ============================================================================
// AI RESPONSE PARSING
// ============================================================================

interface ParsedAIResponse {
  response: string;
  confidence: number;
  topicCategory?: string;
}

/**
 * Parses Claude's response to extract the structured JSON output.
 * Falls back to treating the entire response as text with default confidence.
 */
function parseAIResponse(rawText: string): ParsedAIResponse {
  // Try to extract JSON from the response
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        response: typeof parsed.response === 'string' ? parsed.response : rawText,
        confidence: typeof parsed.confidence === 'number'
          ? Math.max(0, Math.min(1, parsed.confidence))
          : 0.7,
        topicCategory: typeof parsed.topicCategory === 'string' ? parsed.topicCategory : undefined,
      };
    } catch {
      // JSON parse failed, fall through
    }
  }

  // Fallback: use raw text as response with default confidence
  return {
    response: rawText.trim(),
    confidence: 0.7,
    topicCategory: undefined,
  };
}

// ============================================================================
// NAVIGATION
// ============================================================================

/**
 * Calculates bearing between two coordinates.
 */
function calculateBearing(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): number {
  const fromLatRad = (fromLat * Math.PI) / 180;
  const toLatRad = (toLat * Math.PI) / 180;
  const dLng = ((toLng - fromLng) * Math.PI) / 180;

  const y = Math.sin(dLng) * Math.cos(toLatRad);
  const x =
    Math.cos(fromLatRad) * Math.sin(toLatRad) -
    Math.sin(fromLatRad) * Math.cos(toLatRad) * Math.cos(dLng);

  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (bearing + 360) % 360;
}

/**
 * Calculates distance between two coordinates using the Haversine formula.
 * Returns distance in kilometers.
 */
function calculateDistance(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((toLat - fromLat) * Math.PI) / 180;
  const dLng = ((toLng - fromLng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((fromLat * Math.PI) / 180) *
      Math.cos((toLat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Converts a bearing angle to a cardinal direction string.
 */
function bearingToDirection(bearing: number): string {
  const directions = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
  const index = Math.round(bearing / 45) % 8;
  return directions[index];
}

// ============================================================================
// SERVICE
// ============================================================================

/**
 * ConciergeService - AI conversation engine using Claude via Azure AI.
 *
 * Generates context-aware responses for event guests. Builds rich prompts
 * with event details, guest profile, tier, knowledge base, agenda,
 * conversation history, and event phase.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 5.4
 */
export const ConciergeService = {
  /**
   * Generates an AI response for a guest message using Claude via Azure AI.
   *
   * Builds a system prompt with full context, sends the guest's message to Claude,
   * parses the response, and checks the confidence against the escalation threshold.
   *
   * @param message - The inbound guest message
   * @param context - Full concierge context (event, guest, KB, agenda, etc.)
   * @returns AI-generated response with confidence and escalation flag
   *
   * Requirements: 4.1, 4.7, 4.8, 5.4
   */
  async generateResponse(
    message: WhatsAppMessage,
    context: ConciergeContext
  ): Promise<ConciergeResponse> {
    const systemPrompt = buildSystemPrompt(context);

    // Extract the guest's message text
    const messageContent = message.content as Record<string, unknown>;
    let userText = '';

    if (messageContent.type === 'text' && messageContent.text) {
      userText = (messageContent.text as { body?: string }).body || '';
    } else if (messageContent.type === 'location' && messageContent.location) {
      const loc = messageContent.location as {
        latitude?: number;
        longitude?: number;
        name?: string;
        address?: string;
      };
      userText = `I'm sharing my location: ${loc.name || loc.address || `${loc.latitude}, ${loc.longitude}`}`;

      // If event has coordinates, generate navigation directions
      if (loc.latitude && loc.longitude && context.event.latitude && context.event.longitude) {
        const directions = await ConciergeService.generateNavigationDirections(
          loc.latitude,
          loc.longitude,
          parseFloat(context.event.latitude),
          parseFloat(context.event.longitude)
        );
        userText += `\n\n[Navigation context: ${directions}]`;
      }
    } else {
      userText = `[${messageContent.type} message received]`;
    }

    const model = process.env.AZURE_DEPLOYMENT_NAME || DEFAULT_MODEL;

    const client = getAnthropicClient();
    const response = await client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [
        {
          role: 'user' as const,
          content: userText,
        },
      ],
    });

    // Extract text from Claude's response
    const rawText =
      (response.content[0]?.type === 'text' ? response.content[0].text : '') || '';

    const parsed = parseAIResponse(rawText);

    // Check escalation threshold
    const escalationThreshold = parseFloat(
      process.env.CONCIERGE_ESCALATION_THRESHOLD || String(DEFAULT_ESCALATION_THRESHOLD)
    );
    const shouldEscalate = parsed.confidence < escalationThreshold;

    return {
      content: {
        type: 'text',
        text: { body: parsed.response },
      },
      confidence: parsed.confidence,
      shouldEscalate,
      topicCategory: parsed.topicCategory,
    };
  },

  /**
   * Builds the full context needed for AI response generation.
   *
   * Loads the conversation, event, guest, event guest, recent messages (last 20),
   * knowledge base entries, agenda items, event phase, and token number.
   *
   * @param conversationId - The conversation ID to build context for
   * @returns Full ConciergeContext
   * @throws {Error} If conversation or related records are not found
   *
   * Requirements: 4.1
   */
  async buildContext(conversationId: string): Promise<ConciergeContext> {
    // Load conversation
    const conversation = await db.query.whatsappConversations.findFirst({
      where: eq(whatsappConversations.id, conversationId),
    });

    if (!conversation) {
      throw new Error(`Conversation "${conversationId}" not found`);
    }

    // Load event
    const event = await db.query.events.findFirst({
      where: eq(events.id, conversation.eventId),
    });

    if (!event) {
      throw new Error(`Event "${conversation.eventId}" not found`);
    }

    // Load event guest
    const eventGuest = await db.query.eventGuests.findFirst({
      where: eq(eventGuests.id, conversation.eventGuestId),
    });

    if (!eventGuest) {
      throw new Error(`EventGuest "${conversation.eventGuestId}" not found`);
    }

    // Load guest
    const guest = await db.query.guests.findFirst({
      where: eq(guests.id, eventGuest.guestId),
    });

    if (!guest) {
      throw new Error(`Guest "${eventGuest.guestId}" not found`);
    }

    // Load recent messages (last 20, ordered chronologically)
    const recentMessages = await db
      .select()
      .from(whatsappMessages)
      .where(eq(whatsappMessages.conversationId, conversationId))
      .orderBy(desc(whatsappMessages.createdAt))
      .limit(MAX_RECENT_MESSAGES);

    // Reverse to chronological order (oldest first)
    recentMessages.reverse();

    // Load knowledge base
    const knowledgeBaseEntries = await db
      .select()
      .from(eventKnowledgeBase)
      .where(eq(eventKnowledgeBase.eventId, conversation.eventId));

    // Load agenda
    const agendaItems = await db
      .select()
      .from(eventAgendas)
      .where(eq(eventAgendas.eventId, conversation.eventId))
      .orderBy(eventAgendas.startTime);

    // Determine event phase
    const eventPhase = await ConciergeService.determineEventPhase(event);

    // Load token number (if assigned)
    const tokenRecord = await db.query.whatsappTokenQueues.findFirst({
      where: and(
        eq(whatsappTokenQueues.eventId, conversation.eventId),
        eq(whatsappTokenQueues.eventGuestId, conversation.eventGuestId),
      ),
    });

    return {
      event,
      guest,
      eventGuest,
      conversation,
      recentMessages,
      knowledgeBase: knowledgeBaseEntries,
      agenda: agendaItems,
      eventPhase,
      tokenNumber: tokenRecord?.tokenNumber,
    };
  },

  /**
   * Determines the current event phase based on event start/end dates.
   *
   * - pre-event: current time is before event start
   * - during-event: current time is between event start and end
   * - post-event: current time is after event end
   *
   * @param event - The event record
   * @returns The current event phase
   *
   * Requirements: 4.3, 4.4, 4.5
   */
  async determineEventPhase(
    event: Event
  ): Promise<'pre-event' | 'during-event' | 'post-event'> {
    const now = new Date();
    const startDate = new Date(event.startDate);
    const endDate = new Date(event.endDate);

    if (now < startDate) {
      return 'pre-event';
    }

    if (now > endDate) {
      return 'post-event';
    }

    return 'during-event';
  },

  /**
   * Generates human-readable navigation directions between two coordinates.
   *
   * Calculates bearing and distance using the Haversine formula, then
   * produces a text description with cardinal direction and distance.
   *
   * @param fromLat - Origin latitude
   * @param fromLng - Origin longitude
   * @param toLat - Destination latitude
   * @param toLng - Destination longitude
   * @returns Human-readable navigation directions
   *
   * Requirements: 4.6
   */
  async generateNavigationDirections(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number
  ): Promise<string> {
    const distance = calculateDistance(fromLat, fromLng, toLat, toLng);
    const bearing = calculateBearing(fromLat, fromLng, toLat, toLng);
    const direction = bearingToDirection(bearing);

    // Format distance
    let distanceText: string;
    if (distance < 1) {
      distanceText = `${Math.round(distance * 1000)} meters`;
    } else {
      distanceText = `${distance.toFixed(1)} km`;
    }

    return `The venue is approximately ${distanceText} to the ${direction} of your current location. Head ${direction} for about ${distanceText} to reach the event venue.`;
  },
};
