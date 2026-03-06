/**
 * Default Unlayer Email Templates
 * 
 * Pre-built email templates in Unlayer design JSON format with ORA brand styling.
 * These templates can be loaded directly into the Unlayer email editor.
 */

import type { UnlayerDesignJson } from '@/components/unlayer-email-builder';

// ORA Brand Colors
const ORA_COLORS = {
  gold: '#B8956B',
  charcoal: '#2C2C2C',
  cream: '#F5F3F0',
  graphite: '#6B6B6B',
  stone: '#9A9A9A',
  sand: '#E8E4DF',
  white: '#FAFAFA',
};

/**
 * Unlayer template definition
 */
export interface UnlayerTemplate {
  id: string;
  name: string;
  description: string;
  thumbnail: string;
  campaignType: string;
  design: UnlayerDesignJson;
}

/**
 * Creates a text content block for Unlayer
 */
function createTextContent(
  id: string,
  text: string,
  options: {
    fontSize?: string;
    textAlign?: 'left' | 'center' | 'right';
    color?: string;
    fontWeight?: string;
    padding?: string;
  } = {}
): unknown {
  const {
    fontSize = '16px',
    textAlign = 'left',
    color = ORA_COLORS.charcoal,
    fontWeight = 'normal',
    padding = '10px',
  } = options;

  return {
    id,
    type: 'text',
    values: {
      containerPadding: padding,
      anchor: '',
      fontSize,
      textAlign,
      lineHeight: '150%',
      linkStyle: {
        inherit: true,
        linkColor: ORA_COLORS.gold,
        linkHoverColor: '#A6845F',
        linkUnderline: true,
        linkHoverUnderline: true,
      },
      _meta: {
        htmlID: id,
        htmlClassNames: 'u_content_text',
      },
      selectable: true,
      draggable: true,
      duplicatable: true,
      deletable: true,
      hideable: true,
      text: `<p style="color: ${color}; font-weight: ${fontWeight};">${text}</p>`,
    },
  };
}

/**
 * Creates a button content block for Unlayer
 */
function createButtonContent(
  id: string,
  text: string,
  href: string,
  options: {
    backgroundColor?: string;
    textColor?: string;
    borderRadius?: string;
    padding?: string;
  } = {}
): unknown {
  const {
    backgroundColor = ORA_COLORS.gold,
    textColor = '#FFFFFF',
    borderRadius = '24px',
    padding = '12px 24px',
  } = options;

  return {
    id,
    type: 'button',
    values: {
      containerPadding: '10px',
      anchor: '',
      href: {
        name: 'web',
        values: {
          href,
          target: '_blank',
        },
      },
      buttonColors: {
        color: textColor,
        backgroundColor,
        hoverColor: textColor,
        hoverBackgroundColor: '#A6845F',
      },
      size: {
        autoWidth: true,
        width: '100%',
      },
      textAlign: 'center',
      lineHeight: '120%',
      padding,
      border: {},
      borderRadius,
      _meta: {
        htmlID: id,
        htmlClassNames: 'u_content_button',
      },
      selectable: true,
      draggable: true,
      duplicatable: true,
      deletable: true,
      hideable: true,
      text: `<span style="font-size: 16px; line-height: 120%;">${text}</span>`,
    },
  };
}

/**
 * Creates a divider content block for Unlayer
 */
function createDividerContent(id: string): unknown {
  return {
    id,
    type: 'divider',
    values: {
      containerPadding: '10px 10px 20px',
      anchor: '',
      border: {
        borderTopWidth: '1px',
        borderTopStyle: 'solid',
        borderTopColor: ORA_COLORS.sand,
      },
      textAlign: 'center',
      width: '100%',
      _meta: {
        htmlID: id,
        htmlClassNames: 'u_content_divider',
      },
      selectable: true,
      draggable: true,
      duplicatable: true,
      deletable: true,
      hideable: true,
    },
  };
}

/**
 * Creates a single-column row for Unlayer
 */
function createRow(id: string, contents: unknown[], backgroundColor = ''): unknown {
  return {
    id,
    cells: [1],
    columns: [
      {
        id: `${id}_col`,
        contents,
        values: {
          backgroundColor: '',
          padding: '0px',
          border: {},
          borderRadius: '0px',
          _meta: {
            htmlID: `${id}_col`,
            htmlClassNames: 'u_column',
          },
        },
      },
    ],
    values: {
      displayCondition: null,
      columns: false,
      backgroundColor,
      columnsBackgroundColor: '',
      backgroundImage: {
        url: '',
        fullWidth: true,
        repeat: 'no-repeat',
        size: 'custom',
        position: 'center',
      },
      padding: '0px',
      anchor: '',
      hideDesktop: false,
      _meta: {
        htmlID: id,
        htmlClassNames: 'u_row',
      },
      selectable: true,
      draggable: true,
      duplicatable: true,
      deletable: true,
      hideable: true,
    },
  };
}

/**
 * Creates the base body values for all templates
 */
function createBodyValues(): Record<string, unknown> {
  return {
    backgroundColor: ORA_COLORS.cream,
    backgroundImage: {
      url: '',
      fullWidth: true,
      repeat: 'no-repeat',
      center: true,
      cover: false,
    },
    contentWidth: '600px',
    contentAlign: 'center',
    fontFamily: {
      label: 'Poppins',
      value: "'Poppins', sans-serif",
      url: 'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap',
    },
    preheaderText: '',
    linkStyle: {
      body: true,
      linkColor: ORA_COLORS.gold,
      linkHoverColor: '#A6845F',
      linkUnderline: true,
      linkHoverUnderline: true,
    },
    _meta: {
      htmlID: 'u_body',
      htmlClassNames: 'u_body',
    },
  };
}

/**
 * Event Invitation Template
 */
export const INVITATION_TEMPLATE: UnlayerTemplate = {
  id: 'invitation',
  name: 'Event Invitation',
  description: 'Professional invitation with event details and RSVP button',
  thumbnail: '/templates/invitation.png',
  campaignType: 'Invitation',
  design: {
    counters: {
      u_column: 6,
      u_row: 6,
      u_content_text: 5,
      u_content_image: 0,
      u_content_button: 1,
      u_content_divider: 1,
      u_content_html: 0,
      u_content_social: 0,
    },
    body: {
      id: 'u_body',
      rows: [
        createRow('row_1', [
          createTextContent('text_1', "You're Invited! 🎉", {
            fontSize: '32px',
            textAlign: 'center',
            fontWeight: 'bold',
          }),
        ], ORA_COLORS.white),
        createRow('row_2', [
          createTextContent('text_2', 'Dear {firstName},<br/><br/>We are delighted to invite you to <strong>{eventName}</strong>. This is an event you won\'t want to miss!'),
        ], ORA_COLORS.white),
        createRow('row_3', [
          createDividerContent('divider_1'),
        ], ORA_COLORS.white),
        createRow('row_4', [
          createTextContent('text_3', '<strong>📅 Date:</strong> {eventDate}<br/><strong>📍 Location:</strong> {eventLocation}'),
        ], ORA_COLORS.white),
        createRow('row_5', [
          createButtonContent('button_1', 'RSVP Now', '{rsvpLink}'),
        ], ORA_COLORS.white),
        createRow('row_6', [
          createTextContent('text_4', 'We look forward to seeing you there!', {
            fontSize: '14px',
            textAlign: 'center',
            color: ORA_COLORS.graphite,
          }),
        ], ORA_COLORS.white),
      ],
      headers: [],
      footers: [],
      values: createBodyValues(),
    },
    schemaVersion: 16,
  },
};

/**
 * Event Reminder Template
 */
export const REMINDER_TEMPLATE: UnlayerTemplate = {
  id: 'reminder',
  name: 'Event Reminder',
  description: 'Friendly reminder for upcoming event',
  thumbnail: '/templates/reminder.png',
  campaignType: 'Reminder',
  design: {
    counters: {
      u_column: 7,
      u_row: 7,
      u_content_text: 6,
      u_content_image: 0,
      u_content_button: 1,
      u_content_divider: 1,
      u_content_html: 0,
      u_content_social: 0,
    },
    body: {
      id: 'u_body',
      rows: [
        createRow('row_1', [
          createTextContent('text_1', "Don't Forget! ⏰", {
            fontSize: '28px',
            textAlign: 'center',
            fontWeight: 'bold',
          }),
        ], ORA_COLORS.white),
        createRow('row_2', [
          createTextContent('text_2', 'Hi {firstName},<br/><br/>Just a friendly reminder that <strong>{eventName}</strong> is coming up soon!'),
        ], ORA_COLORS.white),
        createRow('row_3', [
          createDividerContent('divider_1'),
        ], ORA_COLORS.white),
        createRow('row_4', [
          createTextContent('text_3', '<strong>📅 When:</strong> {eventDate}<br/><strong>📍 Where:</strong> {eventLocation}'),
        ], ORA_COLORS.white),
        createRow('row_5', [
          createTextContent('text_4', "Haven't confirmed your attendance yet? There's still time!"),
        ], ORA_COLORS.white),
        createRow('row_6', [
          createButtonContent('button_1', 'Confirm Attendance', '{rsvpLink}'),
        ], ORA_COLORS.white),
        createRow('row_7', [
          createTextContent('text_5', 'See you soon!', {
            fontSize: '14px',
            textAlign: 'center',
            color: ORA_COLORS.graphite,
          }),
        ], ORA_COLORS.white),
      ],
      headers: [],
      footers: [],
      values: createBodyValues(),
    },
    schemaVersion: 16,
  },
};

/**
 * Thank You Template
 */
export const THANK_YOU_TEMPLATE: UnlayerTemplate = {
  id: 'thank-you',
  name: 'Thank You',
  description: 'Post-event thank you message',
  thumbnail: '/templates/thank-you.png',
  campaignType: 'ThankYou',
  design: {
    counters: {
      u_column: 6,
      u_row: 6,
      u_content_text: 5,
      u_content_image: 0,
      u_content_button: 0,
      u_content_divider: 1,
      u_content_html: 0,
      u_content_social: 0,
    },
    body: {
      id: 'u_body',
      rows: [
        createRow('row_1', [
          createTextContent('text_1', 'Thank You! 🙏', {
            fontSize: '28px',
            textAlign: 'center',
            fontWeight: 'bold',
          }),
        ], ORA_COLORS.white),
        createRow('row_2', [
          createTextContent('text_2', 'Dear {firstName},<br/><br/>Thank you for attending <strong>{eventName}</strong>! We hope you had a wonderful time.'),
        ], ORA_COLORS.white),
        createRow('row_3', [
          createTextContent('text_3', 'Your presence made the event truly special. We appreciate you taking the time to join us.'),
        ], ORA_COLORS.white),
        createRow('row_4', [
          createDividerContent('divider_1'),
        ], ORA_COLORS.white),
        createRow('row_5', [
          createTextContent('text_4', "We'd love to hear your thoughts! Your feedback helps us improve future events."),
        ], ORA_COLORS.white),
        createRow('row_6', [
          createTextContent('text_5', 'Until next time! 💫', {
            fontSize: '14px',
            textAlign: 'center',
            color: ORA_COLORS.graphite,
          }),
        ], ORA_COLORS.white),
      ],
      headers: [],
      footers: [],
      values: createBodyValues(),
    },
    schemaVersion: 16,
  },
};

/**
 * Last Chance Template
 */
export const LAST_CHANCE_TEMPLATE: UnlayerTemplate = {
  id: 'last-chance',
  name: 'Last Chance',
  description: 'Urgent reminder for final RSVP deadline',
  thumbnail: '/templates/last-chance.png',
  campaignType: 'LastChance',
  design: {
    counters: {
      u_column: 6,
      u_row: 6,
      u_content_text: 4,
      u_content_image: 0,
      u_content_button: 1,
      u_content_divider: 1,
      u_content_html: 0,
      u_content_social: 0,
    },
    body: {
      id: 'u_body',
      rows: [
        createRow('row_1', [
          createTextContent('text_1', 'Last Chance to RSVP! ⚡', {
            fontSize: '28px',
            textAlign: 'center',
            fontWeight: 'bold',
            color: ORA_COLORS.gold,
          }),
        ], ORA_COLORS.white),
        createRow('row_2', [
          createTextContent('text_2', "Hi {firstName},<br/><br/>This is your <strong>final reminder</strong> to RSVP for <strong>{eventName}</strong>. Don't miss out!"),
        ], ORA_COLORS.white),
        createRow('row_3', [
          createDividerContent('divider_1'),
        ], ORA_COLORS.white),
        createRow('row_4', [
          createTextContent('text_3', '<strong>📅 Date:</strong> {eventDate}<br/><strong>📍 Location:</strong> {eventLocation}'),
        ], ORA_COLORS.white),
        createRow('row_5', [
          createButtonContent('button_1', "RSVP Before It's Too Late", '{rsvpLink}', {
            backgroundColor: '#C44536',
          }),
        ], ORA_COLORS.white),
        createRow('row_6', [
          createTextContent('text_4', 'We hope to see you there!', {
            fontSize: '14px',
            textAlign: 'center',
            color: ORA_COLORS.graphite,
          }),
        ], ORA_COLORS.white),
      ],
      headers: [],
      footers: [],
      values: createBodyValues(),
    },
    schemaVersion: 16,
  },
};

/**
 * Event Day Info Template
 */
export const EVENT_DAY_TEMPLATE: UnlayerTemplate = {
  id: 'event-day',
  name: 'Event Day Info',
  description: 'Day-of information with badge link',
  thumbnail: '/templates/event-day.png',
  campaignType: 'EventDayInfo',
  design: {
    counters: {
      u_column: 7,
      u_row: 7,
      u_content_text: 5,
      u_content_image: 0,
      u_content_button: 1,
      u_content_divider: 1,
      u_content_html: 0,
      u_content_social: 0,
    },
    body: {
      id: 'u_body',
      rows: [
        createRow('row_1', [
          createTextContent('text_1', "Today's the Day! 🎊", {
            fontSize: '28px',
            textAlign: 'center',
            fontWeight: 'bold',
          }),
        ], ORA_COLORS.white),
        createRow('row_2', [
          createTextContent('text_2', "Hi {firstName},<br/><br/>We're excited to see you at <strong>{eventName}</strong> today!"),
        ], ORA_COLORS.white),
        createRow('row_3', [
          createDividerContent('divider_1'),
        ], ORA_COLORS.white),
        createRow('row_4', [
          createTextContent('text_3', '<h3>📍 Event Details</h3><strong>Location:</strong> {eventLocation}<br/><strong>Date:</strong> {eventDate}'),
        ], ORA_COLORS.white),
        createRow('row_5', [
          createTextContent('text_4', '<h3>🎫 Your Digital Badge</h3>Download your badge below for quick check-in at the event:'),
        ], ORA_COLORS.white),
        createRow('row_6', [
          createButtonContent('button_1', 'Download Your Badge', '{badgeLink}'),
        ], ORA_COLORS.white),
        createRow('row_7', [
          createTextContent('text_5', 'See you soon! 👋', {
            fontSize: '14px',
            textAlign: 'center',
            color: ORA_COLORS.graphite,
          }),
        ], ORA_COLORS.white),
      ],
      headers: [],
      footers: [],
      values: createBodyValues(),
    },
    schemaVersion: 16,
  },
};

/**
 * Feedback Request Template
 */
export const FEEDBACK_TEMPLATE: UnlayerTemplate = {
  id: 'feedback',
  name: 'Feedback Request',
  description: 'Request for event feedback',
  thumbnail: '/templates/feedback.png',
  campaignType: 'Feedback',
  design: {
    counters: {
      u_column: 7,
      u_row: 7,
      u_content_text: 5,
      u_content_image: 0,
      u_content_button: 1,
      u_content_divider: 0,
      u_content_html: 0,
      u_content_social: 0,
    },
    body: {
      id: 'u_body',
      rows: [
        createRow('row_1', [
          createTextContent('text_1', "We'd Love Your Feedback! 📝", {
            fontSize: '28px',
            textAlign: 'center',
            fontWeight: 'bold',
          }),
        ], ORA_COLORS.white),
        createRow('row_2', [
          createTextContent('text_2', 'Hi {firstName},<br/><br/>Thank you again for attending <strong>{eventName}</strong>! We hope you enjoyed the experience.'),
        ], ORA_COLORS.white),
        createRow('row_3', [
          createTextContent('text_3', 'Your feedback is incredibly valuable to us. It helps us understand what worked well and what we can improve for future events.'),
        ], ORA_COLORS.white),
        createRow('row_4', [
          createTextContent('text_4', 'The survey takes only 2-3 minutes to complete.'),
        ], ORA_COLORS.white),
        createRow('row_5', [
          createButtonContent('button_1', 'Share Your Feedback', '{rsvpLink}'),
        ], ORA_COLORS.white),
        createRow('row_6', [
          createTextContent('text_5', 'Thank you for helping us improve! 🌟', {
            fontSize: '14px',
            textAlign: 'center',
            color: ORA_COLORS.graphite,
          }),
        ], ORA_COLORS.white),
      ],
      headers: [],
      footers: [],
      values: createBodyValues(),
    },
    schemaVersion: 16,
  },
};

/**
 * Project Launch Template
 */
export const PROJECT_LAUNCH_TEMPLATE: UnlayerTemplate = {
  id: 'project-launch',
  name: 'Project Launch',
  description: 'Announce a new project or product launch with impact',
  thumbnail: '/templates/project-launch.png',
  campaignType: 'Announcement',
  design: {
    counters: {
      u_column: 8,
      u_row: 8,
      u_content_text: 7,
      u_content_image: 0,
      u_content_button: 1,
      u_content_divider: 2,
      u_content_html: 0,
      u_content_social: 0,
    },
    body: {
      id: 'u_body',
      rows: [
        createRow('row_1', [
          createTextContent('text_1', '🚀 Exciting News!', {
            fontSize: '36px',
            textAlign: 'center',
            fontWeight: 'bold',
            color: ORA_COLORS.gold,
          }),
        ], ORA_COLORS.charcoal),
        createRow('row_2', [
          createTextContent('text_2', 'We\'re Launching Something Big', {
            fontSize: '24px',
            textAlign: 'center',
            fontWeight: 'bold',
            color: ORA_COLORS.white,
            padding: '5px 10px',
          }),
        ], ORA_COLORS.charcoal),
        createRow('row_3', [
          createDividerContent('divider_1'),
        ], ORA_COLORS.white),
        createRow('row_4', [
          createTextContent('text_3', 'Dear {firstName},<br/><br/>We are thrilled to announce the launch of our newest project! After months of hard work and dedication, we\'re ready to share something truly special with you.'),
        ], ORA_COLORS.white),
        createRow('row_5', [
          createTextContent('text_4', '<strong>What\'s New?</strong><br/><br/>• Innovative features designed with you in mind<br/>• Enhanced user experience<br/>• Cutting-edge technology<br/>• Seamless integration'),
        ], ORA_COLORS.white),
        createRow('row_6', [
          createDividerContent('divider_2'),
        ], ORA_COLORS.white),
        createRow('row_7', [
          createTextContent('text_5', 'Join us at <strong>{eventName}</strong> for the official unveiling!<br/><br/><strong>📅 Date:</strong> {eventDate}<br/><strong>📍 Location:</strong> {eventLocation}'),
        ], ORA_COLORS.white),
        createRow('row_8', [
          createButtonContent('button_1', 'Reserve Your Spot', '{rsvpLink}'),
        ], ORA_COLORS.white),
        createRow('row_9', [
          createTextContent('text_6', 'Be among the first to experience the future!', {
            fontSize: '14px',
            textAlign: 'center',
            color: ORA_COLORS.graphite,
          }),
        ], ORA_COLORS.white),
      ],
      headers: [],
      footers: [],
      values: createBodyValues(),
    },
    schemaVersion: 16,
  },
};

/**
 * Open House Template
 */
export const OPEN_HOUSE_TEMPLATE: UnlayerTemplate = {
  id: 'open-house',
  name: 'Open House',
  description: 'Invite guests to an open house event with property details',
  thumbnail: '/templates/open-house.png',
  campaignType: 'OpenHouse',
  design: {
    counters: {
      u_column: 9,
      u_row: 9,
      u_content_text: 8,
      u_content_image: 0,
      u_content_button: 1,
      u_content_divider: 2,
      u_content_html: 0,
      u_content_social: 0,
    },
    body: {
      id: 'u_body',
      rows: [
        createRow('row_1', [
          createTextContent('text_1', '🏡 You\'re Invited!', {
            fontSize: '32px',
            textAlign: 'center',
            fontWeight: 'bold',
          }),
        ], ORA_COLORS.white),
        createRow('row_2', [
          createTextContent('text_2', 'Join Us for an Exclusive Open House', {
            fontSize: '18px',
            textAlign: 'center',
            color: ORA_COLORS.gold,
            fontWeight: 'bold',
          }),
        ], ORA_COLORS.white),
        createRow('row_3', [
          createDividerContent('divider_1'),
        ], ORA_COLORS.white),
        createRow('row_4', [
          createTextContent('text_3', 'Dear {firstName},<br/><br/>We would be delighted to have you at our upcoming open house event. This is a wonderful opportunity to explore and experience what we have to offer in person.'),
        ], ORA_COLORS.white),
        createRow('row_5', [
          createTextContent('text_4', '<strong>🗓️ Event Details</strong><br/><br/><strong>Event:</strong> {eventName}<br/><strong>Date:</strong> {eventDate}<br/><strong>Location:</strong> {eventLocation}'),
        ], ORA_COLORS.cream),
        createRow('row_6', [
          createTextContent('text_5', '<strong>✨ What to Expect</strong><br/><br/>• Guided tours of the property<br/>• Refreshments and light bites<br/>• Meet our expert team<br/>• Exclusive first-look access<br/>• Special offers for attendees'),
        ], ORA_COLORS.white),
        createRow('row_7', [
          createDividerContent('divider_2'),
        ], ORA_COLORS.white),
        createRow('row_8', [
          createTextContent('text_6', 'Space is limited! Please RSVP to secure your spot.'),
        ], ORA_COLORS.white),
        createRow('row_9', [
          createButtonContent('button_1', 'RSVP Now', '{rsvpLink}'),
        ], ORA_COLORS.white),
        createRow('row_10', [
          createTextContent('text_7', 'We look forward to welcoming you! 🌟', {
            fontSize: '14px',
            textAlign: 'center',
            color: ORA_COLORS.graphite,
          }),
        ], ORA_COLORS.white),
      ],
      headers: [],
      footers: [],
      values: createBodyValues(),
    },
    schemaVersion: 16,
  },
};

/**
 * Blank Template
 */
export const BLANK_TEMPLATE: UnlayerTemplate = {
  id: 'blank',
  name: 'Blank Canvas',
  description: 'Start from scratch with a blank template',
  thumbnail: '/templates/blank.png',
  campaignType: 'Custom',
  design: {
    counters: {
      u_column: 1,
      u_row: 1,
      u_content_text: 1,
      u_content_image: 0,
      u_content_button: 0,
      u_content_divider: 0,
      u_content_html: 0,
      u_content_social: 0,
    },
    body: {
      id: 'u_body',
      rows: [
        createRow('row_1', [
          createTextContent('text_1', 'Start designing your email here...', {
            fontSize: '16px',
            textAlign: 'center',
            color: ORA_COLORS.stone,
          }),
        ], ORA_COLORS.white),
      ],
      headers: [],
      footers: [],
      values: createBodyValues(),
    },
    schemaVersion: 16,
  },
};

/**
 * All available Unlayer templates
 */
export const UNLAYER_TEMPLATES: UnlayerTemplate[] = [
  BLANK_TEMPLATE,
  INVITATION_TEMPLATE,
  REMINDER_TEMPLATE,
  PROJECT_LAUNCH_TEMPLATE,
  OPEN_HOUSE_TEMPLATE,
  THANK_YOU_TEMPLATE,
  LAST_CHANCE_TEMPLATE,
  EVENT_DAY_TEMPLATE,
  FEEDBACK_TEMPLATE,
];

/**
 * Get an Unlayer template by ID
 */
export function getUnlayerTemplateById(id: string): UnlayerTemplate | undefined {
  return UNLAYER_TEMPLATES.find(t => t.id === id);
}

/**
 * Get an Unlayer template by campaign type
 */
export function getUnlayerTemplateByType(campaignType: string): UnlayerTemplate | undefined {
  return UNLAYER_TEMPLATES.find(t => t.campaignType === campaignType);
}

/**
 * Create a blank Unlayer design with ORA brand styling
 */
export function createBlankUnlayerTemplate(): UnlayerDesignJson {
  return {
    counters: {
      u_column: 1,
      u_row: 1,
      u_content_text: 0,
      u_content_image: 0,
      u_content_button: 0,
      u_content_divider: 0,
      u_content_html: 0,
      u_content_social: 0,
    },
    body: {
      id: 'u_body',
      rows: [],
      headers: [],
      footers: [],
      values: createBodyValues(),
    },
    schemaVersion: 16,
  };
}
