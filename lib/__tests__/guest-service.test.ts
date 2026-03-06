import { describe, expect, beforeEach, afterEach } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { db, guests } from '@/db';
import { eq } from 'drizzle-orm';
import { GuestService } from '../services/guest-service';

// Helper to generate valid emails that pass Zod validation
const validEmailArb = fc.tuple(
  fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[a-zA-Z0-9]+$/.test(s)),
  fc.string({ minLength: 1, maxLength: 8 }).filter(s => /^[a-zA-Z0-9]+$/.test(s)),
  fc.constantFrom('com', 'org', 'net', 'io')
).map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

// Helper to generate unique emails per test run
let emailCounter = 0;
function uniqueEmail(): string {
  return `test${Date.now()}_${emailCounter++}@example.com`;
}

/**
 * Feature: event-os-mvp, Property 3: Guest Upsert Idempotence
 * 
 * For any guest data with a given email, calling upsert multiple times with
 * the same email should result in exactly one guest record, with the most
 * recent data values.
 * 
 * Validates: Requirements 2.1, 2.3, 2.6
 */
describe('Property 3: Guest Upsert Idempotence', () => {
  beforeEach(async () => {
    // Clean up before each test
    await db.delete(guests);
    emailCounter = 0;
  });

  afterEach(async () => {
    // Clean up after each test
    await db.delete(guests);
  });

  // Arbitrary for valid guest names
  const validNameArb = fc.string({ minLength: 1, maxLength: 30 })
    .filter(s => s.trim().length > 0)
    .map(s => s.trim());

  test.prop([
    validNameArb,
    validNameArb,
    validNameArb,
    validNameArb,
  ], { numRuns: 5 })(
    'upserting a guest multiple times with the same email should result in exactly one record with most recent data',
    async (firstName1, lastName1, firstName2, lastName2) => {
      // Generate a unique email for this test iteration
      const email = uniqueEmail();

      const input1 = { firstName: firstName1, lastName: lastName1, email };
      const input2 = { firstName: firstName2, lastName: lastName2, email };

      // First upsert
      await GuestService.upsertByEmail(input1);

      // Second upsert with same email but different data
      await GuestService.upsertByEmail(input2);

      // Get the guest by email
      const guest = await GuestService.getByEmail(email);

      // Should have exactly one guest record
      expect(guest).not.toBeNull();

      // The guest should have the most recent data (from second upsert)
      expect(guest!.firstName).toBe(firstName2.trim());
      expect(guest!.lastName).toBe(lastName2.trim());

      // Verify only one guest with this email exists
      const allGuests = await db.select().from(guests).where(eq(guests.email, email));
      expect(allGuests.length).toBe(1);
    }
  );

  test.prop([
    validNameArb,
    validNameArb,
  ], { numRuns: 5 })(
    'upserting the same guest data multiple times should be idempotent',
    async (firstName, lastName) => {
      const email = uniqueEmail();
      const guestInput = { firstName, lastName, email };

      // Upsert the same data three times
      await GuestService.upsertByEmail(guestInput);
      await GuestService.upsertByEmail(guestInput);
      await GuestService.upsertByEmail(guestInput);

      // Verify only one guest exists with this email
      const allGuests = await db.select().from(guests).where(eq(guests.email, email));
      expect(allGuests.length).toBe(1);

      // Data should match the input
      expect(allGuests[0].firstName).toBe(firstName.trim());
      expect(allGuests[0].lastName).toBe(lastName.trim());
    }
  );
});

/**
 * Feature: event-os-mvp, Property 4: Guest Search Returns Matches
 * 
 * For any set of guests and a search query, the search results should contain
 * all and only guests whose name, email, or company contains the query string
 * (case-insensitive).
 * 
 * Validates: Requirements 2.4
 */
describe('Property 4: Guest Search Returns Matches', () => {
  beforeEach(async () => {
    // Clean up before each test
    await db.delete(guests);
    emailCounter = 0;
  });

  afterEach(async () => {
    // Clean up after each test
    await db.delete(guests);
  });

  // Arbitrary for search terms (alphabetic only to avoid regex issues)
  const searchTermArb = fc.string({ minLength: 2, maxLength: 10 })
    .filter(s => /^[a-zA-Z]+$/.test(s));

  test.prop([searchTermArb], { numRuns: 5 })(
    'search should return guests whose firstName contains the query (case-insensitive)',
    async (searchTerm) => {
      const matchingEmail = uniqueEmail();
      const nonMatchingEmail = uniqueEmail();

      // Create a guest with the search term in their first name
      const matchingGuest = await GuestService.create({
        firstName: `John${searchTerm}Doe`,
        lastName: 'Smith',
        email: matchingEmail,
      });

      // Create a guest without the search term
      await GuestService.create({
        firstName: 'Jane',
        lastName: 'Doe',
        email: nonMatchingEmail,
      });

      // Search with the term
      const results = await GuestService.search(searchTerm);

      // Should find the matching guest
      const matchingIds = results.map(g => g.id);
      expect(matchingIds).toContain(matchingGuest.id);
    }
  );

  test.prop([searchTermArb], { numRuns: 5 })(
    'search should return guests whose company contains the query (case-insensitive)',
    async (searchTerm) => {
      const matchingEmail = uniqueEmail();
      const nonMatchingEmail = uniqueEmail();

      // Create a guest with the search term in their company
      const matchingGuest = await GuestService.create({
        firstName: 'John',
        lastName: 'Smith',
        email: matchingEmail,
        company: `Acme${searchTerm}Corp`,
      });

      // Create a guest without the search term in company
      await GuestService.create({
        firstName: 'Jane',
        lastName: 'Doe',
        email: nonMatchingEmail,
        company: 'OtherCompany',
      });

      // Search with the term
      const results = await GuestService.search(searchTerm);

      // Should find the matching guest
      const matchingIds = results.map(g => g.id);
      expect(matchingIds).toContain(matchingGuest.id);
    }
  );

  test.prop([
    fc.string({ minLength: 3, maxLength: 8 }).filter(s => /^[a-z]+$/.test(s)),
  ], { numRuns: 5 })(
    'search should be case-insensitive',
    async (searchTerm) => {
      const email = uniqueEmail();

      // Create a guest with lowercase term in first name
      const guest = await GuestService.create({
        firstName: searchTerm.toLowerCase(),
        lastName: 'Test',
        email,
      });

      // Search with uppercase
      const upperResults = await GuestService.search(searchTerm.toUpperCase());
      // Search with lowercase
      const lowerResults = await GuestService.search(searchTerm.toLowerCase());
      // Search with mixed case
      const mixedResults = await GuestService.search(
        searchTerm.charAt(0).toUpperCase() + searchTerm.slice(1).toLowerCase()
      );

      // All searches should find the guest
      expect(upperResults.map(g => g.id)).toContain(guest.id);
      expect(lowerResults.map(g => g.id)).toContain(guest.id);
      expect(mixedResults.map(g => g.id)).toContain(guest.id);
    }
  );
});

/**
 * Feature: event-os-mvp, Property 5: CSV Import Creates Valid Records
 * 
 * For any valid CSV with guest data, importing should create one guest record
 * per row, and the total count of created/updated records should equal the
 * number of valid rows.
 * 
 * Validates: Requirements 2.2, 2.5
 */
describe('Property 5: CSV Import Creates Valid Records', () => {
  beforeEach(async () => {
    // Clean up before each test
    await db.delete(guests);
    emailCounter = 0;
  });

  afterEach(async () => {
    // Clean up after each test
    await db.delete(guests);
  });

  // Arbitrary for valid guest data that can be converted to CSV (no special chars)
  const validGuestDataArb = fc.record({
    firstName: fc.string({ minLength: 1, maxLength: 20 })
      .filter(s => s.trim().length > 0 && /^[a-zA-Z0-9 ]+$/.test(s))
      .map(s => s.trim()),
    lastName: fc.string({ minLength: 1, maxLength: 20 })
      .filter(s => s.trim().length > 0 && /^[a-zA-Z0-9 ]+$/.test(s))
      .map(s => s.trim()),
    company: fc.option(
      fc.string({ minLength: 1, maxLength: 30 })
        .filter(s => s.trim().length > 0 && /^[a-zA-Z0-9 ]+$/.test(s))
        .map(s => s.trim()),
      { nil: undefined }
    ),
  });

  // Helper to generate CSV from guest data array
  function generateCSV(guests: Array<{ firstName: string; lastName: string; email: string; company?: string }>): string {
    const header = 'firstName,lastName,email,company';
    const rows = guests.map(g => `${g.firstName},${g.lastName},${g.email},${g.company || ''}`);
    return [header, ...rows].join('\n');
  }

  test.prop([
    fc.array(validGuestDataArb, { minLength: 1, maxLength: 5 }),
  ], { numRuns: 5 })(
    'importing valid CSV should create one record per valid row',
    async (guestDataArray) => {
      // Generate unique emails for each guest
      const guestsWithEmails = guestDataArray.map((g) => ({
        ...g,
        email: uniqueEmail(),
      }));

      // Generate CSV
      const csv = generateCSV(guestsWithEmails);

      // Import CSV
      const result = await GuestService.importFromCSV(csv);

      // Total created + updated should equal number of rows
      expect(result.created + result.updated).toBe(guestsWithEmails.length);
      expect(result.failed.length).toBe(0);

      // Verify each guest was created
      for (const guestData of guestsWithEmails) {
        const guest = await GuestService.getByEmail(guestData.email);
        expect(guest).not.toBeNull();
        expect(guest!.firstName).toBe(guestData.firstName);
        expect(guest!.lastName).toBe(guestData.lastName);
      }
    }
  );

  test.prop([
    validGuestDataArb,
    validGuestDataArb,
  ], { numRuns: 5 })(
    'importing CSV with duplicate emails should update existing records',
    async (firstData, secondData) => {
      const email = uniqueEmail();

      // First import
      const csv1 = generateCSV([{ ...firstData, email }]);
      const result1 = await GuestService.importFromCSV(csv1);
      expect(result1.created).toBe(1);
      expect(result1.updated).toBe(0);

      // Second import with same email but different data
      const csv2 = generateCSV([{ ...secondData, email }]);
      const result2 = await GuestService.importFromCSV(csv2);
      expect(result2.created).toBe(0);
      expect(result2.updated).toBe(1);

      // Verify only one guest exists with the updated data
      const guest = await GuestService.getByEmail(email);
      expect(guest).not.toBeNull();
      expect(guest!.firstName).toBe(secondData.firstName);
      expect(guest!.lastName).toBe(secondData.lastName);
    }
  );

  test.prop([
    fc.integer({ min: 1, max: 3 }),
  ], { numRuns: 5 })(
    'importing CSV with invalid rows should report failures correctly',
    async (validRowCount) => {
      // Generate valid guests
      const validGuests = Array.from({ length: validRowCount }, () => ({
        firstName: `Valid`,
        lastName: `Guest`,
        email: uniqueEmail(),
      }));

      // Generate CSV with valid rows only, then add an invalid row
      const header = 'firstName,lastName,email,company';
      const validRows = validGuests.map(g => `${g.firstName},${g.lastName},${g.email},`);
      const invalidRow = ',,notanemail,'; // Missing required fields and invalid email
      const csv = [header, ...validRows, invalidRow].join('\n');

      // Import CSV
      const result = await GuestService.importFromCSV(csv);

      // Valid rows should be created
      expect(result.created).toBe(validRowCount);
      // Invalid row should be reported as failed
      expect(result.failed.length).toBeGreaterThanOrEqual(1);
    }
  );
});
