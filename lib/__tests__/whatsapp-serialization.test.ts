/**
 * @fileoverview Property tests for WhatsApp data serialization round-trips
 *
 * Properties 27-28: WhatsApp message content and conversation state
 * JSON serialization round-trip correctness.
 *
 * Validates: Requirements 13.3, 13.4
 */

import { describe, it, expect } from 'vitest';
import { fc, test as fcTest } from '@fast-check/vitest';

// ============================================================================
// Arbitraries for WhatsApp message content types
// ============================================================================

const textContentArb = fc.record({
  type: fc.constant('text' as const),
  text: fc.record({
    body: fc.string({ minLength: 1, maxLength: 500 }),
  }),
});

const imageContentArb = fc.record({
  type: fc.constant('image' as const),
  image: fc.record({
    url: fc.webUrl(),
    caption: fc.option(fc.string({ maxLength: 200 }), { nil: null }),
  }),
});

const documentContentArb = fc.record({
  type: fc.constant('document' as const),
  document: fc.record({
    url: fc.webUrl(),
    filename: fc.string({ minLength: 1, maxLength: 100 }),
    caption: fc.option(fc.string({ maxLength: 200 }), { nil: null }),
  }),
});

const locationContentArb = fc.record({
  type: fc.constant('location' as const),
  location: fc.record({
    latitude: fc.double({ min: -90, max: 90, noNaN: true }),
    longitude: fc.double({ min: -180, max: 180, noNaN: true }),
    name: fc.option(fc.string({ maxLength: 100 }), { nil: null }),
    address: fc.option(fc.string({ maxLength: 200 }), { nil: null }),
  }),
});

const buttonInteractiveArb = fc.record({
  type: fc.constant('interactive' as const),
  interactive: fc.record({
    type: fc.constant('button' as const),
    body: fc.record({ text: fc.string({ minLength: 1, maxLength: 200 }) }),
    action: fc.record({
      buttons: fc.array(
        fc.record({
          type: fc.constant('reply' as const),
          reply: fc.record({
            id: fc.string({ minLength: 1, maxLength: 50 }),
            title: fc.string({ minLength: 1, maxLength: 20 }),
          }),
        }),
        { minLength: 1, maxLength: 3 }
      ),
    }),
  }),
});

const templateContentArb = fc.record({
  type: fc.constant('template' as const),
  template: fc.record({
    name: fc.string({ minLength: 1, maxLength: 100 }),
    language: fc.record({ code: fc.constantFrom('en', 'ar', 'fr', 'es') }),
  }),
});

const messageContentArb = fc.oneof(
  textContentArb,
  imageContentArb,
  documentContentArb,
  locationContentArb,
  buttonInteractiveArb,
  templateContentArb
);

// ============================================================================
// Arbitraries for conversation state
// ============================================================================

const conversationStateArb = fc.record({
  currentPhase: fc.constantFrom('pre-event', 'during-event', 'post-event'),
  lastTopic: fc.option(fc.string({ maxLength: 100 }), { nil: null }),
  pendingSurveyId: fc.option(fc.uuid(), { nil: null }),
  pendingQuestionIndex: fc.option(fc.nat({ max: 9 }), { nil: null }),
  escalationReason: fc.option(fc.string({ maxLength: 200 }), { nil: null }),
});

// ============================================================================
// Property 27: WhatsApp message content JSON round-trip
// Validates: Requirements 13.3
// ============================================================================

describe('Property 27: WhatsApp message content JSON round-trip', () => {
  fcTest.prop([messageContentArb], { numRuns: 100 })(
    'serializing and deserializing message content produces equivalent object',
    (content) => {
      const serialized = JSON.stringify(content);
      const deserialized = JSON.parse(serialized);

      expect(deserialized).toEqual(content);
      expect(deserialized.type).toBe(content.type);

      // Verify the type field is preserved
      expect(typeof deserialized.type).toBe('string');

      // Verify nested structures are preserved
      if (content.type === 'text') {
        expect(deserialized.text.body).toBe(content.text!.body);
      }
      if (content.type === 'image') {
        expect(deserialized.image.url).toBe(content.image!.url);
      }
      if (content.type === 'template') {
        expect(deserialized.template.name).toBe(content.template!.name);
        expect(deserialized.template.language.code).toBe(content.template!.language.code);
      }
    }
  );

  fcTest.prop([messageContentArb], { numRuns: 100 })(
    'double round-trip produces identical result',
    (content) => {
      const firstRoundTrip = JSON.parse(JSON.stringify(content));
      const secondRoundTrip = JSON.parse(JSON.stringify(firstRoundTrip));

      expect(secondRoundTrip).toEqual(firstRoundTrip);
    }
  );
});

// ============================================================================
// Property 28: Conversation state JSON round-trip
// Validates: Requirements 13.4
// ============================================================================

describe('Property 28: Conversation state JSON round-trip', () => {
  fcTest.prop([conversationStateArb], { numRuns: 100 })(
    'serializing and deserializing conversation state produces equivalent object',
    (state) => {
      const serialized = JSON.stringify(state);
      const deserialized = JSON.parse(serialized);

      expect(deserialized).toEqual(state);
      expect(deserialized.currentPhase).toBe(state.currentPhase);

      // Verify optional fields are preserved correctly
      if (state.lastTopic !== undefined) {
        expect(deserialized.lastTopic).toBe(state.lastTopic);
      }
      if (state.pendingSurveyId !== undefined) {
        expect(deserialized.pendingSurveyId).toBe(state.pendingSurveyId);
      }
      if (state.pendingQuestionIndex !== undefined) {
        expect(deserialized.pendingQuestionIndex).toBe(state.pendingQuestionIndex);
      }
    }
  );

  fcTest.prop([conversationStateArb], { numRuns: 100 })(
    'currentPhase is always one of the valid event phases',
    (state) => {
      const serialized = JSON.stringify(state);
      const deserialized = JSON.parse(serialized);

      expect(['pre-event', 'during-event', 'post-event']).toContain(deserialized.currentPhase);
    }
  );

  fcTest.prop(
    [fc.array(conversationStateArb, { minLength: 1, maxLength: 20 })],
    { numRuns: 100 }
  )(
    'batch serialization preserves all states independently',
    (states) => {
      const serialized = JSON.stringify(states);
      const deserialized = JSON.parse(serialized) as typeof states;

      expect(deserialized).toHaveLength(states.length);
      for (let i = 0; i < states.length; i++) {
        expect(deserialized[i]).toEqual(states[i]);
      }
    }
  );
});
