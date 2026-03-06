/**
 * @fileoverview WhatsApp Analytics Service - Engagement metrics and reporting
 *
 * Provides aggregated analytics for WhatsApp messaging including message counts,
 * AI resolution rates, broadcast engagement, token/queue metrics, survey response
 * rates, topic categorization, and tier-based breakdowns.
 *
 * @module lib/services/whatsapp-analytics-service
 * @requires drizzle-orm - Database ORM
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7
 */

import { db } from '@/db';
import {
  whatsappMessages,
  whatsappConversations,
  whatsappBroadcasts,
  whatsappBroadcastResponses,
  whatsappTokenQueues,
  eventGuests,
} from '@/db/schema';
import { eq, and, sql, count } from 'drizzle-orm';

// ============================================================================
// TYPES
// ============================================================================

export interface MessageCountMetrics {
  totalSent: number;
  totalReceived: number;
}

export interface AIResolutionMetrics {
  totalConversations: number;
  aiResolvedConversations: number;
  humanEscalatedConversations: number;
  resolutionRate: number; // 0-1
}

export interface BroadcastEngagementMetrics {
  totalBroadcasts: number;
  totalRecipients: number;
  totalDelivered: number;
  totalRead: number;
  totalResponded: number;
  deliveryRate: number;
  readRate: number;
  responseRate: number;
}

export interface TokenQueueMetrics {
  totalTokensIssued: number;
  totalServed: number;
  completionRate: number;
  avgWaitTimeMinutes: number;
}

export interface TopicBreakdown {
  topic: string;
  count: number;
}

export interface TierMetrics {
  tier: string;
  messagesSent: number;
  messagesReceived: number;
  conversations: number;
}

export interface WhatsAppAnalytics {
  messageCounts: MessageCountMetrics;
  aiResolution: AIResolutionMetrics;
  broadcastEngagement: BroadcastEngagementMetrics;
  tokenQueue: TokenQueueMetrics;
  topTopics: TopicBreakdown[];
  tierBreakdown: TierMetrics[];
}

// ============================================================================
// SERVICE
// ============================================================================

/**
 * WhatsAppAnalyticsService - Aggregated WhatsApp engagement analytics.
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7
 */
export const WhatsAppAnalyticsService = {
  /**
   * Get message count metrics for an event.
   * Requirements: 12.1
   */
  async getMessageCounts(eventId: string): Promise<MessageCountMetrics> {
    const results = await db
      .select({
        direction: whatsappMessages.direction,
        count: count(),
      })
      .from(whatsappMessages)
      .innerJoin(
        whatsappConversations,
        eq(whatsappMessages.conversationId, whatsappConversations.id)
      )
      .where(eq(whatsappConversations.eventId, eventId))
      .groupBy(whatsappMessages.direction);

    let totalSent = 0;
    let totalReceived = 0;
    for (const row of results) {
      if (row.direction === 'outbound') totalSent = row.count;
      if (row.direction === 'inbound') totalReceived = row.count;
    }

    return { totalSent, totalReceived };
  },

  /**
   * Get AI resolution rate metrics for an event.
   * Resolution rate = conversations that stayed ai_managed / total conversations.
   * Requirements: 12.2
   */
  async getAIResolutionMetrics(eventId: string): Promise<AIResolutionMetrics> {
    const conversations = await db
      .select({
        escalationStatus: whatsappConversations.escalationStatus,
        count: count(),
      })
      .from(whatsappConversations)
      .where(eq(whatsappConversations.eventId, eventId))
      .groupBy(whatsappConversations.escalationStatus);

    let aiResolved = 0;
    let humanEscalated = 0;
    for (const row of conversations) {
      if (row.escalationStatus === 'ai_managed') aiResolved = row.count;
      if (row.escalationStatus === 'human_managed') humanEscalated = row.count;
    }

    const total = aiResolved + humanEscalated;
    const resolutionRate = total > 0 ? aiResolved / total : 0;

    return {
      totalConversations: total,
      aiResolvedConversations: aiResolved,
      humanEscalatedConversations: humanEscalated,
      resolutionRate,
    };
  },

  /**
   * Get broadcast engagement metrics for an event.
   * Requirements: 12.3
   */
  async getBroadcastEngagement(eventId: string): Promise<BroadcastEngagementMetrics> {
    const broadcasts = await db
      .select({
        totalRecipients: sql<number>`COALESCE(SUM(${whatsappBroadcasts.totalRecipients}), 0)`.as('total_recipients'),
        totalDelivered: sql<number>`COALESCE(SUM(${whatsappBroadcasts.deliveredCount}), 0)`.as('total_delivered'),
        totalRead: sql<number>`COALESCE(SUM(${whatsappBroadcasts.readCount}), 0)`.as('total_read'),
        totalResponded: sql<number>`COALESCE(SUM(${whatsappBroadcasts.respondedCount}), 0)`.as('total_responded'),
        totalSent: sql<number>`COALESCE(SUM(${whatsappBroadcasts.sentCount}), 0)`.as('total_sent'),
        broadcastCount: count(),
      })
      .from(whatsappBroadcasts)
      .where(eq(whatsappBroadcasts.eventId, eventId));

    const row = broadcasts[0];
    const totalRecipients = Number(row?.totalRecipients ?? 0);
    const totalDelivered = Number(row?.totalDelivered ?? 0);
    const totalRead = Number(row?.totalRead ?? 0);
    const totalResponded = Number(row?.totalResponded ?? 0);
    const totalBroadcasts = Number(row?.broadcastCount ?? 0);

    return {
      totalBroadcasts,
      totalRecipients,
      totalDelivered,
      totalRead,
      totalResponded,
      deliveryRate: totalRecipients > 0 ? totalDelivered / totalRecipients : 0,
      readRate: totalRecipients > 0 ? totalRead / totalRecipients : 0,
      responseRate: totalRecipients > 0 ? totalResponded / totalRecipients : 0,
    };
  },

  /**
   * Get token/queue metrics for an event.
   * Requirements: 12.4
   */
  async getTokenQueueMetrics(eventId: string): Promise<TokenQueueMetrics> {
    const tokens = await db
      .select({
        status: whatsappTokenQueues.status,
        count: count(),
      })
      .from(whatsappTokenQueues)
      .where(eq(whatsappTokenQueues.eventId, eventId))
      .groupBy(whatsappTokenQueues.status);

    let totalIssued = 0;
    let totalServed = 0;
    for (const row of tokens) {
      totalIssued += row.count;
      if (row.status === 'served') totalServed = row.count;
    }

    // Calculate average wait time from served tokens
    const avgWaitResult = await db
      .select({
        avgWait: sql<number>`COALESCE(AVG(EXTRACT(EPOCH FROM (${whatsappTokenQueues.servedAt} - ${whatsappTokenQueues.assignedAt})) / 60), 0)`.as('avg_wait'),
      })
      .from(whatsappTokenQueues)
      .where(
        and(
          eq(whatsappTokenQueues.eventId, eventId),
          eq(whatsappTokenQueues.status, 'served')
        )
      );

    const avgWaitTimeMinutes = Number(avgWaitResult[0]?.avgWait ?? 0);

    return {
      totalTokensIssued: totalIssued,
      totalServed,
      completionRate: totalIssued > 0 ? totalServed / totalIssued : 0,
      avgWaitTimeMinutes: Math.round(avgWaitTimeMinutes * 100) / 100,
    };
  },

  /**
   * Get top question topics from AI-classified messages.
   * Requirements: 12.6
   */
  async getTopTopics(eventId: string, limit: number = 10): Promise<TopicBreakdown[]> {
    const topics = await db
      .select({
        topic: whatsappMessages.topicCategory,
        count: count(),
      })
      .from(whatsappMessages)
      .innerJoin(
        whatsappConversations,
        eq(whatsappMessages.conversationId, whatsappConversations.id)
      )
      .where(
        and(
          eq(whatsappConversations.eventId, eventId),
          sql`${whatsappMessages.topicCategory} IS NOT NULL`
        )
      )
      .groupBy(whatsappMessages.topicCategory)
      .orderBy(sql`count(*) DESC`)
      .limit(limit);

    return topics.map((row) => ({
      topic: row.topic as string,
      count: row.count,
    }));
  },

  /**
   * Get metrics broken down by guest tier.
   * Requirements: 12.7
   */
  async getTierBreakdown(eventId: string): Promise<TierMetrics[]> {
    const tiers = await db
      .select({
        tier: eventGuests.tier,
        direction: whatsappMessages.direction,
        count: count(),
      })
      .from(whatsappMessages)
      .innerJoin(
        whatsappConversations,
        eq(whatsappMessages.conversationId, whatsappConversations.id)
      )
      .innerJoin(
        eventGuests,
        eq(whatsappConversations.eventGuestId, eventGuests.id)
      )
      .where(eq(whatsappConversations.eventId, eventId))
      .groupBy(eventGuests.tier, whatsappMessages.direction);

    // Also get conversation counts per tier
    const convCounts = await db
      .select({
        tier: eventGuests.tier,
        count: count(),
      })
      .from(whatsappConversations)
      .innerJoin(
        eventGuests,
        eq(whatsappConversations.eventGuestId, eventGuests.id)
      )
      .where(eq(whatsappConversations.eventId, eventId))
      .groupBy(eventGuests.tier);

    const tierMap = new Map<string, TierMetrics>();

    for (const tier of ['Regular', 'VIP', 'VVIP']) {
      tierMap.set(tier, { tier, messagesSent: 0, messagesReceived: 0, conversations: 0 });
    }

    for (const row of tiers) {
      const metrics = tierMap.get(row.tier) || { tier: row.tier, messagesSent: 0, messagesReceived: 0, conversations: 0 };
      if (row.direction === 'outbound') metrics.messagesSent = row.count;
      if (row.direction === 'inbound') metrics.messagesReceived = row.count;
      tierMap.set(row.tier, metrics);
    }

    for (const row of convCounts) {
      const metrics = tierMap.get(row.tier);
      if (metrics) metrics.conversations = row.count;
    }

    return Array.from(tierMap.values());
  },

  /**
   * Get survey response rate for a specific broadcast.
   * Requirements: 12.5
   */
  async getSurveyResponseRate(broadcastId: string): Promise<{ responseRate: number; totalResponses: number }> {
    const broadcast = await db.query.whatsappBroadcasts.findFirst({
      where: eq(whatsappBroadcasts.id, broadcastId),
    });

    if (!broadcast) {
      return { responseRate: 0, totalResponses: 0 };
    }

    const [responseCount] = await db
      .select({ count: count() })
      .from(whatsappBroadcastResponses)
      .where(eq(whatsappBroadcastResponses.broadcastId, broadcastId));

    const totalResponses = responseCount?.count ?? 0;
    const totalRecipients = broadcast.totalRecipients;

    return {
      responseRate: totalRecipients > 0 ? totalResponses / totalRecipients : 0,
      totalResponses,
    };
  },

  /**
   * Get full analytics dashboard data for an event.
   * Requirements: 12.1, 12.2, 12.3, 12.4, 12.6, 12.7
   */
  async getFullAnalytics(eventId: string): Promise<WhatsAppAnalytics> {
    const [messageCounts, aiResolution, broadcastEngagement, tokenQueue, topTopics, tierBreakdown] =
      await Promise.all([
        this.getMessageCounts(eventId),
        this.getAIResolutionMetrics(eventId),
        this.getBroadcastEngagement(eventId),
        this.getTokenQueueMetrics(eventId),
        this.getTopTopics(eventId),
        this.getTierBreakdown(eventId),
      ]);

    return {
      messageCounts,
      aiResolution,
      broadcastEngagement,
      tokenQueue,
      topTopics,
      tierBreakdown,
    };
  },

  /**
   * Export survey responses for a broadcast as an array of objects.
   * Requirements: 12.5
   */
  async exportSurveyResponses(broadcastId: string): Promise<Array<{
    guestName: string;
    guestEmail: string;
    tier: string;
    questionIndex: number;
    response: string;
    respondedAt: Date;
  }>> {
    const responses = await db
      .select({
        firstName: sql<string>`g.first_name`,
        lastName: sql<string>`g.last_name`,
        email: sql<string>`g.email`,
        tier: eventGuests.tier,
        questionIndex: whatsappBroadcastResponses.questionIndex,
        response: whatsappBroadcastResponses.response,
        respondedAt: whatsappBroadcastResponses.createdAt,
      })
      .from(whatsappBroadcastResponses)
      .innerJoin(eventGuests, eq(whatsappBroadcastResponses.eventGuestId, eventGuests.id))
      .innerJoin(sql`guests g`, sql`g.id = ${eventGuests.guestId}`)
      .where(eq(whatsappBroadcastResponses.broadcastId, broadcastId))
      .orderBy(sql`g.last_name`, sql`g.first_name`, whatsappBroadcastResponses.questionIndex);

    return responses.map((r) => ({
      guestName: `${r.firstName} ${r.lastName}`.trim(),
      guestEmail: r.email,
      tier: r.tier,
      questionIndex: r.questionIndex,
      response: r.response,
      respondedAt: r.respondedAt,
    }));
  },
};
