/**
 * Unlayer Merge Tags Configuration
 * 
 * Defines the template variables available in the email editor.
 * These merge tags are replaced with actual values when sending emails.
 */

export interface MergeTag {
  name: string;
  value: string;
  sample?: string;
}

export interface MergeTagGroup {
  name: string;
  mergeTags: Record<string, MergeTag>;
}

export type MergeTagConfig = MergeTag | MergeTagGroup;

/**
 * Check if a merge tag config is a group (has nested mergeTags)
 */
export function isMergeTagGroup(config: MergeTagConfig): config is MergeTagGroup {
  return 'mergeTags' in config;
}

/**
 * Required merge tag keys that must be present in the configuration
 */
export const REQUIRED_MERGE_TAG_KEYS = [
  'firstName',
  'lastName',
  'email',
  'companyName',
  'jobTitle',
  'eventName',
  'eventDate',
  'eventLocation',
  'rsvpLink',
  'badgeLink',
  'unsubscribeLink',
] as const;

export type RequiredMergeTagKey = typeof REQUIRED_MERGE_TAG_KEYS[number];

/**
 * ORA Merge Tags Configuration for Unlayer Editor
 * 
 * Includes all required merge tags organized into logical groups:
 * - Guest Information: firstName, lastName, email, companyName, jobTitle
 * - Event Information: eventName, eventDate, eventLocation
 * - Links: rsvpLink, badgeLink, unsubscribeLink
 */
export const ORA_MERGE_TAGS: Record<string, MergeTagConfig> = {
  first_name: {
    name: 'First Name',
    value: '{firstName}',
    sample: 'John',
  },
  last_name: {
    name: 'Last Name',
    value: '{lastName}',
    sample: 'Doe',
  },
  email: {
    name: 'Email',
    value: '{email}',
    sample: 'john.doe@example.com',
  },
  company_name: {
    name: 'Company Name',
    value: '{companyName}',
    sample: 'Acme Corp',
  },
  job_title: {
    name: 'Job Title',
    value: '{jobTitle}',
    sample: 'Software Engineer',
  },
  event_info: {
    name: 'Event Information',
    mergeTags: {
      event_name: {
        name: 'Event Name',
        value: '{eventName}',
        sample: 'Annual Conference 2026',
      },
      event_date: {
        name: 'Event Date',
        value: '{eventDate}',
        sample: 'Saturday, March 15, 2026',
      },
      event_location: {
        name: 'Event Location',
        value: '{eventLocation}',
        sample: 'Grand Ballroom, NYC',
      },
    },
  },
  links: {
    name: 'Links',
    mergeTags: {
      rsvp_link: {
        name: 'RSVP Link',
        value: '{rsvpLink}',
        sample: 'https://example.com/rsvp/abc123',
      },
      badge_link: {
        name: 'Badge Link',
        value: '{badgeLink}',
        sample: 'https://example.com/badge/abc123',
      },
      unsubscribe_link: {
        name: 'Unsubscribe Link',
        value: '{unsubscribeLink}',
        sample: 'https://example.com/unsubscribe/abc123',
      },
    },
  },
};

/**
 * Extract all merge tag values from the configuration (flattened)
 */
export function getAllMergeTagValues(): Map<RequiredMergeTagKey, MergeTag> {
  const result = new Map<RequiredMergeTagKey, MergeTag>();
  
  for (const config of Object.values(ORA_MERGE_TAGS)) {
    if (isMergeTagGroup(config)) {
      for (const tag of Object.values(config.mergeTags)) {
        const key = extractKeyFromValue(tag.value);
        if (key && isRequiredKey(key)) {
          result.set(key, tag);
        }
      }
    } else {
      const key = extractKeyFromValue(config.value);
      if (key && isRequiredKey(key)) {
        result.set(key, config);
      }
    }
  }
  
  return result;
}

/**
 * Extract the key name from a merge tag value (e.g., '{firstName}' -> 'firstName')
 */
function extractKeyFromValue(value: string): string | null {
  const match = value.match(/^\{(\w+)\}$/);
  return match ? match[1] : null;
}

/**
 * Type guard to check if a key is a required merge tag key
 */
function isRequiredKey(key: string): key is RequiredMergeTagKey {
  return REQUIRED_MERGE_TAG_KEYS.includes(key as RequiredMergeTagKey);
}

/**
 * Validate that all required merge tags are present in the configuration
 */
export function validateMergeTagCompleteness(): { 
  valid: boolean; 
  missingKeys: string[];
  presentKeys: string[];
} {
  const allTags = getAllMergeTagValues();
  const presentKeys: string[] = [];
  const missingKeys: string[] = [];
  
  for (const key of REQUIRED_MERGE_TAG_KEYS) {
    if (allTags.has(key)) {
      presentKeys.push(key);
    } else {
      missingKeys.push(key);
    }
  }
  
  return {
    valid: missingKeys.length === 0,
    missingKeys,
    presentKeys,
  };
}
