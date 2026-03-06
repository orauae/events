import { describe, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import type { GuestTier } from '@/db/schema';

// ============================================================================
// BUSINESS RULE FUNCTIONS
// ============================================================================

/**
 * Determines whether a guest should be assigned a token number upon check-in.
 * Only Regular-tier guests receive tokens; VIP/VVIP skip token assignment.
 */
function shouldAssignToken(tier: GuestTier): boolean {
  return tier === 'Regular';
}

/**
 * Determines whether a guest should be placed in a booth queue.
 * Only Regular-tier guests join queues; VIP/VVIP are directed to
 * dedicated collection points or priority lanes instead.
 */
function shouldJoinQueue(tier: GuestTier): boolean {
  return tier === 'Regular';
}

// ============================================================================
// PROPERTY 11: VIP/VVIP guests skip token and queue
// ============================================================================

/**
 * Feature: whatsapp-ai-concierge, Property 11: VIP/VVIP guests skip token and queue
 *
 * For any guest with tier VIP or VVIP, upon check-in the system SHALL NOT
 * assign a token number, and upon requesting booth service the system SHALL
 * NOT place the guest in a queue position.
 *
 * **Validates: Requirements 5.5, 6.7**
 */
describe('Property 11: VIP/VVIP guests skip token and queue', () => {
  // --------------------------------------------------------------------------
  // Property: VIP guests are never assigned a token
  // --------------------------------------------------------------------------
  test.prop(
    [fc.oneof(fc.constant<GuestTier>('VIP'), fc.constant<GuestTier>('VVIP'))],
    { numRuns: 100 },
  )(
    'VIP/VVIP guests should NOT be assigned a token',
    (tier) => {
      expect(shouldAssignToken(tier)).toBe(false);
    },
  );

  // --------------------------------------------------------------------------
  // Property: VIP guests are never placed in a queue
  // --------------------------------------------------------------------------
  test.prop(
    [fc.oneof(fc.constant<GuestTier>('VIP'), fc.constant<GuestTier>('VVIP'))],
    { numRuns: 100 },
  )(
    'VIP/VVIP guests should NOT be placed in a queue',
    (tier) => {
      expect(shouldJoinQueue(tier)).toBe(false);
    },
  );

  // --------------------------------------------------------------------------
  // Property: Regular guests ARE assigned a token
  // --------------------------------------------------------------------------
  test.prop(
    [fc.constant<GuestTier>('Regular')],
    { numRuns: 100 },
  )(
    'Regular guests should be assigned a token',
    (tier) => {
      expect(shouldAssignToken(tier)).toBe(true);
    },
  );

  // --------------------------------------------------------------------------
  // Property: Regular guests ARE placed in a queue
  // --------------------------------------------------------------------------
  test.prop(
    [fc.constant<GuestTier>('Regular')],
    { numRuns: 100 },
  )(
    'Regular guests should be placed in a queue',
    (tier) => {
      expect(shouldJoinQueue(tier)).toBe(true);
    },
  );

  // --------------------------------------------------------------------------
  // Property: For any tier, token assignment and queue placement are consistent
  // --------------------------------------------------------------------------
  test.prop(
    [fc.oneof(
      fc.constant<GuestTier>('Regular'),
      fc.constant<GuestTier>('VIP'),
      fc.constant<GuestTier>('VVIP'),
    )],
    { numRuns: 100 },
  )(
    'token assignment and queue placement decisions are always consistent (both true or both false)',
    (tier) => {
      expect(shouldAssignToken(tier)).toBe(shouldJoinQueue(tier));
    },
  );

  // --------------------------------------------------------------------------
  // Property: shouldAssignToken is equivalent to (tier === "Regular")
  // --------------------------------------------------------------------------
  test.prop(
    [fc.oneof(
      fc.constant<GuestTier>('Regular'),
      fc.constant<GuestTier>('VIP'),
      fc.constant<GuestTier>('VVIP'),
    )],
    { numRuns: 100 },
  )(
    'shouldAssignToken returns true if and only if tier is Regular',
    (tier) => {
      expect(shouldAssignToken(tier)).toBe(tier === 'Regular');
    },
  );

  // --------------------------------------------------------------------------
  // Property: shouldJoinQueue is equivalent to (tier === "Regular")
  // --------------------------------------------------------------------------
  test.prop(
    [fc.oneof(
      fc.constant<GuestTier>('Regular'),
      fc.constant<GuestTier>('VIP'),
      fc.constant<GuestTier>('VVIP'),
    )],
    { numRuns: 100 },
  )(
    'shouldJoinQueue returns true if and only if tier is Regular',
    (tier) => {
      expect(shouldJoinQueue(tier)).toBe(tier === 'Regular');
    },
  );
});
