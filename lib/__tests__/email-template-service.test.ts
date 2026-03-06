import { describe, it, expect } from 'vitest';
import {
  EmailTemplateService,
  TEMPLATE_VARIABLES,
  TemplateContext,
} from '../services/email-template-service';

describe('EmailTemplateService', () => {
  // Standard context for testing
  const validContext: TemplateContext = {
    firstName: 'John',
    lastName: 'Doe',
    eventName: 'Tech Conference 2026',
    rsvpLink: 'https://example.com/rsvp/abc123',
    badgeLink: 'https://example.com/badge/abc123',
    eventLocation: 'San Francisco, CA',
    eventDate: 'March 15, 2026',
  };

  describe('render', () => {
    it('should substitute all supported variables', () => {
      const template = `
        Hello {firstName} {lastName},
        
        You are invited to {eventName} at {eventLocation} on {eventDate}.
        
        Please RSVP here: {rsvpLink}
        Download your badge: {badgeLink}
      `;

      const result = EmailTemplateService.render(template, validContext);

      expect(result.success).toBe(true);
      expect(result.unsubstitutedVariables).toHaveLength(0);
      expect(result.content).toContain('Hello John Doe');
      expect(result.content).toContain('Tech Conference 2026');
      expect(result.content).toContain('San Francisco, CA');
      expect(result.content).toContain('March 15, 2026');
      expect(result.content).toContain('https://example.com/rsvp/abc123');
      expect(result.content).toContain('https://example.com/badge/abc123');
    });

    it('should handle template with no variables', () => {
      const template = 'This is a plain text email with no variables.';

      const result = EmailTemplateService.render(template, validContext);

      expect(result.success).toBe(true);
      expect(result.content).toBe(template);
      expect(result.unsubstitutedVariables).toHaveLength(0);
    });

    it('should handle repeated variables', () => {
      const template = 'Hi {firstName}! Yes, {firstName}, this is for you!';

      const result = EmailTemplateService.render(template, validContext);

      expect(result.success).toBe(true);
      expect(result.content).toBe('Hi John! Yes, John, this is for you!');
    });

    it('should report unsupported variables', () => {
      const template = 'Hello {firstName}, your order {orderId} is ready.';

      const result = EmailTemplateService.render(template, validContext);

      expect(result.success).toBe(false);
      expect(result.unsubstitutedVariables).toContain('orderId');
      expect(result.content).toContain('John');
      expect(result.content).toContain('{orderId}'); // Unsupported variable kept as-is
    });

    it('should handle empty string values in context', () => {
      const contextWithEmpty: TemplateContext = {
        ...validContext,
        firstName: '',
      };

      const template = 'Hello {firstName} {lastName}';
      const result = EmailTemplateService.render(template, contextWithEmpty);

      expect(result.success).toBe(true);
      expect(result.content).toBe('Hello  Doe');
    });

    it('should handle special characters in context values', () => {
      const contextWithSpecial: TemplateContext = {
        ...validContext,
        firstName: 'John & Jane',
        eventName: 'Tech <Conference> 2026',
      };

      const template = 'Hello {firstName}, welcome to {eventName}';
      const result = EmailTemplateService.render(template, contextWithSpecial);

      expect(result.success).toBe(true);
      expect(result.content).toBe('Hello John & Jane, welcome to Tech <Conference> 2026');
    });
  });

  describe('extractVariables', () => {
    it('should extract all variables from template', () => {
      const template = 'Hello {firstName} {lastName}, event: {eventName}';

      const variables = EmailTemplateService.extractVariables(template);

      expect(variables).toContain('firstName');
      expect(variables).toContain('lastName');
      expect(variables).toContain('eventName');
      expect(variables).toHaveLength(3);
    });

    it('should return unique variables only', () => {
      const template = '{firstName} {firstName} {lastName}';

      const variables = EmailTemplateService.extractVariables(template);

      expect(variables).toHaveLength(2);
      expect(variables.filter((v) => v === 'firstName')).toHaveLength(1);
    });

    it('should return empty array for template with no variables', () => {
      const template = 'Plain text without variables';

      const variables = EmailTemplateService.extractVariables(template);

      expect(variables).toHaveLength(0);
    });

    it('should extract unsupported variables too', () => {
      const template = '{firstName} {customVar} {anotherCustom}';

      const variables = EmailTemplateService.extractVariables(template);

      expect(variables).toContain('firstName');
      expect(variables).toContain('customVar');
      expect(variables).toContain('anotherCustom');
    });
  });

  describe('validateTemplate', () => {
    it('should validate template with only supported variables', () => {
      const template = 'Hello {firstName} {lastName}, event at {eventLocation}';

      const result = EmailTemplateService.validateTemplate(template);

      expect(result.isValid).toBe(true);
      expect(result.unsupportedVariables).toHaveLength(0);
    });

    it('should detect unsupported variables', () => {
      const template = 'Hello {firstName}, your {customField} is {status}';

      const result = EmailTemplateService.validateTemplate(template);

      expect(result.isValid).toBe(false);
      expect(result.unsupportedVariables).toContain('customField');
      expect(result.unsupportedVariables).toContain('status');
      expect(result.unsupportedVariables).not.toContain('firstName');
    });

    it('should validate template with no variables', () => {
      const template = 'Plain text email';

      const result = EmailTemplateService.validateTemplate(template);

      expect(result.isValid).toBe(true);
      expect(result.unsupportedVariables).toHaveLength(0);
    });
  });

  describe('getSupportedVariables', () => {
    it('should return all supported variables', () => {
      const variables = EmailTemplateService.getSupportedVariables();

      expect(variables).toContain('firstName');
      expect(variables).toContain('lastName');
      expect(variables).toContain('eventName');
      expect(variables).toContain('rsvpLink');
      expect(variables).toContain('badgeLink');
      expect(variables).toContain('eventLocation');
      expect(variables).toContain('eventDate');
      expect(variables).toHaveLength(7);
    });

    it('should match TEMPLATE_VARIABLES constant', () => {
      const variables = EmailTemplateService.getSupportedVariables();
      expect(variables).toEqual(TEMPLATE_VARIABLES);
    });
  });

  describe('createContext', () => {
    it('should create context from guest and event data', () => {
      const guest = { firstName: 'Alice', lastName: 'Smith' };
      const event = {
        name: 'Annual Gala',
        location: 'New York, NY',
        startDate: new Date('2026-06-15'),
      };
      const qrToken = 'token123';
      const baseUrl = 'https://events.example.com';

      const context = EmailTemplateService.createContext(guest, event, qrToken, baseUrl);

      expect(context.firstName).toBe('Alice');
      expect(context.lastName).toBe('Smith');
      expect(context.eventName).toBe('Annual Gala');
      expect(context.eventLocation).toBe('New York, NY');
      expect(context.rsvpLink).toBe('https://events.example.com/rsvp/token123');
      expect(context.badgeLink).toBe('https://events.example.com/badge/token123');
      expect(context.eventDate).toContain('2026');
      expect(context.eventDate).toContain('June');
      expect(context.eventDate).toContain('15');
    });

    it('should format date in readable format', () => {
      const guest = { firstName: 'Bob', lastName: 'Jones' };
      const event = {
        name: 'Test Event',
        location: 'Test Location',
        startDate: new Date('2026-12-25'),
      };

      const context = EmailTemplateService.createContext(
        guest,
        event,
        'token',
        'https://example.com'
      );

      // Should include day of week, month name, day number, and year
      expect(context.eventDate).toContain('December');
      expect(context.eventDate).toContain('25');
      expect(context.eventDate).toContain('2026');
    });
  });
});
