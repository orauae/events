import {
  Zap,
  UserCheck,
  Calendar,
  Mail,
  UserPlus,
  Tag,
  GitBranch,
  User,
  Clock,
  Send,
  Bell,
  Tags,
  Globe,
  Timer,
  CalendarClock,
  MessageSquare,
  Bot,
  Phone,
  Shield,
  Crown,
  type LucideIcon,
} from 'lucide-react';

// Node subtype definitions with icons and labels
export interface NodeSubtype {
  type: 'trigger' | 'condition' | 'action';
  subType: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

export const NODE_SUBTYPES: NodeSubtype[] = [
  // Trigger nodes
  {
    type: 'trigger',
    subType: 'guest_rsvp_received',
    label: 'Guest RSVP Received',
    description: 'Triggers when a guest responds to an invitation',
    icon: UserCheck,
  },
  {
    type: 'trigger',
    subType: 'guest_checked_in',
    label: 'Guest Checked In',
    description: 'Triggers when a guest checks in at the event',
    icon: Zap,
  },
  {
    type: 'trigger',
    subType: 'event_date_approaching',
    label: 'Event Date Approaching',
    description: 'Triggers a set number of days before the event',
    icon: Calendar,
  },
  {
    type: 'trigger',
    subType: 'campaign_sent',
    label: 'Campaign Sent',
    description: 'Triggers when a campaign is sent',
    icon: Mail,
  },
  {
    type: 'trigger',
    subType: 'guest_added_to_event',
    label: 'Guest Added to Event',
    description: 'Triggers when a new guest is added',
    icon: UserPlus,
  },
  {
    type: 'trigger',
    subType: 'guest_tag_changed',
    label: 'Guest Tag Changed',
    description: 'Triggers when a guest tag is added or removed',
    icon: Tag,
  },
  {
    type: 'trigger',
    subType: 'scheduled',
    label: 'Scheduled',
    description: 'Triggers on a cron schedule',
    icon: CalendarClock,
  },
  {
    type: 'trigger',
    subType: 'whatsapp_message_received',
    label: 'WhatsApp Message Received',
    description: 'Triggers when a guest sends a WhatsApp message',
    icon: MessageSquare,
  },
  {
    type: 'trigger',
    subType: 'concierge_escalated',
    label: 'Concierge Escalated',
    description: 'Triggers when AI concierge escalates to human',
    icon: Bot,
  },

  // Condition nodes
  {
    type: 'condition',
    subType: 'check_rsvp_status',
    label: 'Check RSVP Status',
    description: 'Branch based on guest RSVP status',
    icon: GitBranch,
  },
  {
    type: 'condition',
    subType: 'check_guest_tag',
    label: 'Check Guest Tag',
    description: 'Branch based on whether guest has a tag',
    icon: Tags,
  },
  {
    type: 'condition',
    subType: 'check_guest_field',
    label: 'Check Guest Field',
    description: 'Branch based on guest field value',
    icon: User,
  },
  {
    type: 'condition',
    subType: 'check_time_window',
    label: 'Check Time Window',
    description: 'Branch based on current time',
    icon: Clock,
  },
  {
    type: 'condition',
    subType: 'whatsapp_opted_in',
    label: 'WhatsApp Opted In',
    description: 'Branch based on WhatsApp conversation status',
    icon: Phone,
  },
  {
    type: 'condition',
    subType: 'check_guest_tier',
    label: 'Check Guest Tier',
    description: 'Branch based on guest tier (VIP, Premium, Standard)',
    icon: Crown,
  },

  // Action nodes
  {
    type: 'action',
    subType: 'send_email',
    label: 'Send Email',
    description: 'Send a custom email to the guest',
    icon: Mail,
  },
  {
    type: 'action',
    subType: 'send_campaign',
    label: 'Send Campaign',
    description: 'Send an existing campaign to the guest',
    icon: Send,
  },
  {
    type: 'action',
    subType: 'add_guest_tag',
    label: 'Add Guest Tag',
    description: 'Add a tag to the guest',
    icon: Tag,
  },
  {
    type: 'action',
    subType: 'remove_guest_tag',
    label: 'Remove Guest Tag',
    description: 'Remove a tag from the guest',
    icon: Tags,
  },
  {
    type: 'action',
    subType: 'update_guest_field',
    label: 'Update Guest Field',
    description: 'Update a guest field value',
    icon: User,
  },
  {
    type: 'action',
    subType: 'wait_delay',
    label: 'Wait / Delay',
    description: 'Wait for a specified duration',
    icon: Timer,
  },
  {
    type: 'action',
    subType: 'send_webhook',
    label: 'Send Webhook',
    description: 'Send data to an external URL',
    icon: Globe,
  },
  {
    type: 'action',
    subType: 'send_whatsapp_message',
    label: 'Send WhatsApp Message',
    description: 'Send a WhatsApp message to the guest',
    icon: MessageSquare,
  },
  {
    type: 'action',
    subType: 'start_concierge',
    label: 'Start AI Concierge',
    description: 'Start an AI concierge conversation with the guest',
    icon: Bot,
  },
];

// Helper to get subtype info
export function getNodeSubtype(subType: string): NodeSubtype | undefined {
  return NODE_SUBTYPES.find((n) => n.subType === subType);
}

// Get subtypes by node type
export function getSubtypesByType(type: 'trigger' | 'condition' | 'action'): NodeSubtype[] {
  return NODE_SUBTYPES.filter((n) => n.type === type);
}
