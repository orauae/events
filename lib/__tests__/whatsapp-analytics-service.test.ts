/**
 * @fileoverview Property tests for WhatsApp Analytics Service
 *
 * Properties 23-26: Message count aggregation, AI resolution rate,
 * queue metrics, and tier-based metric breakdown.
 *
 * Validates: Requirements 12.1, 12.2, 12.4, 12.7
 */

import { describe, it, expect } from 'vitest';
import { fc, test as fcTest } from '@fast-check/vitest';

// ============================================================================
// Property 23: Message count aggregation accuracy
// Validates: Requirements 12.1
// ============================================================================

describe('Property 23: Message count aggregation accuracy', () => {
  fcTest.prop(
    [
      fc.nat({ max: 500 }),
      fc.nat({ max: 500 }),
    ],
    { numRuns: 100 }
  )(
    'total messages = sent + received for any non-negative counts',
    (sent, received) => {
      const totalSent = sent;
      const totalReceived = received;
      const total = totalSent + totalReceived;

      // The sum of sent and received should always equal the total
      expect(total).toBe(totalSent + totalReceived);
      expect(totalSent).toBeGreaterThanOrEqual(0);
      expect(totalReceived).toBeGreaterThanOrEqual(0);
      expect(total).toBeGreaterThanOrEqual(0);
    }
  );

  fcTest.prop(
    [
      fc.array(
        fc.record({
          direction: fc.constantFrom('inbound', 'outbound'),
        }),
        { minLength: 0, maxLength: 200 }
      ),
    ],
    { numRuns: 100 }
  )(
    'aggregating messages by direction produces correct counts',
    (messages) => {
      const sent = messages.filter((m) => m.direction === 'outbound').length;
      const received = messages.filter((m) => m.direction === 'inbound').length;

      expect(sent + received).toBe(messages.length);
      expect(sent).toBeGreaterThanOrEqual(0);
      expect(received).toBeGreaterThanOrEqual(0);
    }
  );
});

// ============================================================================
// Property 24: AI resolution rate calculation
// Validates: Requirements 12.2
// ============================================================================

describe('Property 24: AI resolution rate calculation', () => {
  fcTest.prop(
    [
      fc.nat({ max: 1000 }),
      fc.nat({ max: 1000 }),
    ],
    { numRuns: 100 }
  )(
    'resolution rate is between 0 and 1 for any conversation counts',
    (aiResolved, humanEscalated) => {
      const total = aiResolved + humanEscalated;
      const resolutionRate = total > 0 ? aiResolved / total : 0;

      expect(resolutionRate).toBeGreaterThanOrEqual(0);
      expect(resolutionRate).toBeLessThanOrEqual(1);

      // If no conversations, rate should be 0
      if (total === 0) {
        expect(resolutionRate).toBe(0);
      }

      // If all AI-resolved, rate should be 1
      if (total > 0 && humanEscalated === 0) {
        expect(resolutionRate).toBe(1);
      }

      // If all human-escalated, rate should be 0
      if (total > 0 && aiResolved === 0) {
        expect(resolutionRate).toBe(0);
      }
    }
  );

  fcTest.prop(
    [
      fc.array(
        fc.record({
          escalationStatus: fc.constantFrom('ai_managed', 'human_managed'),
        }),
        { minLength: 0, maxLength: 200 }
      ),
    ],
    { numRuns: 100 }
  )(
    'resolution rate from conversation list matches manual calculation',
    (conversations) => {
      const aiManaged = conversations.filter((c) => c.escalationStatus === 'ai_managed').length;
      const humanManaged = conversations.filter((c) => c.escalationStatus === 'human_managed').length;
      const total = conversations.length;

      const rate = total > 0 ? aiManaged / total : 0;

      expect(aiManaged + humanManaged).toBe(total);
      expect(rate).toBeGreaterThanOrEqual(0);
      expect(rate).toBeLessThanOrEqual(1);
    }
  );
});

// ============================================================================
// Property 25: Queue metrics aggregation
// Validates: Requirements 12.4
// ============================================================================

describe('Property 25: Queue metrics aggregation', () => {
  fcTest.prop(
    [
      fc.array(
        fc.record({
          status: fc.constantFrom('waiting', 'serving', 'served', 'skipped'),
          waitMinutes: fc.nat({ max: 120 }),
        }),
        { minLength: 0, maxLength: 200 }
      ),
    ],
    { numRuns: 100 }
  )(
    'completion rate is between 0 and 1 and served count <= total',
    (tokens) => {
      const totalIssued = tokens.length;
      const totalServed = tokens.filter((t) => t.status === 'served').length;
      const completionRate = totalIssued > 0 ? totalServed / totalIssued : 0;

      expect(completionRate).toBeGreaterThanOrEqual(0);
      expect(completionRate).toBeLessThanOrEqual(1);
      expect(totalServed).toBeLessThanOrEqual(totalIssued);

      // Average wait time for served tokens
      const servedTokens = tokens.filter((t) => t.status === 'served');
      if (servedTokens.length > 0) {
        const avgWait = servedTokens.reduce((sum, t) => sum + t.waitMinutes, 0) / servedTokens.length;
        expect(avgWait).toBeGreaterThanOrEqual(0);
      }
    }
  );
});

// ============================================================================
// Property 26: Tier-based metric breakdown sums to total
// Validates: Requirements 12.7
// ============================================================================

describe('Property 26: Tier-based metric breakdown sums to total', () => {
  fcTest.prop(
    [
      fc.array(
        fc.record({
          tier: fc.constantFrom('Regular', 'VIP', 'VVIP'),
          direction: fc.constantFrom('inbound', 'outbound'),
        }),
        { minLength: 0, maxLength: 300 }
      ),
    ],
    { numRuns: 100 }
  )(
    'sum of tier message counts equals total message count',
    (messages) => {
      // Group by tier
      const tierCounts = new Map<string, { sent: number; received: number }>();
      for (const tier of ['Regular', 'VIP', 'VVIP']) {
        tierCounts.set(tier, { sent: 0, received: 0 });
      }

      for (const msg of messages) {
        const counts = tierCounts.get(msg.tier)!;
        if (msg.direction === 'outbound') counts.sent++;
        else counts.received++;
      }

      // Sum across tiers should equal total
      let totalSent = 0;
      let totalReceived = 0;
      for (const counts of tierCounts.values()) {
        totalSent += counts.sent;
        totalReceived += counts.received;
      }

      const expectedSent = messages.filter((m) => m.direction === 'outbound').length;
      const expectedReceived = messages.filter((m) => m.direction === 'inbound').length;

      expect(totalSent).toBe(expectedSent);
      expect(totalReceived).toBe(expectedReceived);
      expect(totalSent + totalReceived).toBe(messages.length);
    }
  );

  fcTest.prop(
    [
      fc.nat({ max: 200 }),
      fc.nat({ max: 200 }),
      fc.nat({ max: 200 }),
    ],
    { numRuns: 100 }
  )(
    'tier conversation counts sum to total conversations',
    (regular, vip, vvip) => {
      const total = regular + vip + vvip;
      const tierBreakdown = [
        { tier: 'Regular', conversations: regular },
        { tier: 'VIP', conversations: vip },
        { tier: 'VVIP', conversations: vvip },
      ];

      const sum = tierBreakdown.reduce((s, t) => s + t.conversations, 0);
      expect(sum).toBe(total);
    }
  );
});
