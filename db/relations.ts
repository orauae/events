import { relations } from 'drizzle-orm';
import {
  events,
  guests,
  eventGuests,
  campaigns,
  campaignMessages,
  badges,
  emailAssets,
  emailAttachments,
  user,
  session,
  account,
  automations,
  automationNodes,
  automationEdges,
  automationExecutions,
  executionSteps,
  guestTags,
  eventGuestTags,
  eventManagerPermissions,
  eventAssignments,
  guestPhotos,
  smtpSettings,
  campaignLinks,
  linkClicks,
  emailOpens,
  bounces,
  unsubscribes,
  emailTemplates,
  importJobs,
  campaignSchedules,
  whatsappChannels,
  whatsappConversations,
  whatsappMessages,
  whatsappBroadcasts,
  whatsappBroadcastResponses,
  whatsappTokenQueues,
  eventAgendas,
  eventKnowledgeBase,
  whatsappTemplates,
  whatsappTemplateFavorites,
} from './schema';

export const eventsRelations = relations(events, ({ one, many }) => ({
  eventGuests: many(eventGuests),
  campaigns: many(campaigns),
  automations: many(automations),
  guestTags: many(guestTags),
  assignment: one(eventAssignments, { fields: [events.id], references: [eventAssignments.eventId] }),
  whatsappChannel: one(whatsappChannels, { fields: [events.id], references: [whatsappChannels.eventId] }),
  eventAgendas: many(eventAgendas),
  eventKnowledgeBase: many(eventKnowledgeBase),
  whatsappBroadcasts: many(whatsappBroadcasts),
  whatsappTokenQueues: many(whatsappTokenQueues),
}));

export const guestsRelations = relations(guests, ({ one, many }) => ({
  eventGuests: many(eventGuests),
  photo: one(guestPhotos, { fields: [guests.id], references: [guestPhotos.guestId] }),
}));

export const eventGuestsRelations = relations(eventGuests, ({ one, many }) => ({
  event: one(events, { fields: [eventGuests.eventId], references: [events.id] }),
  guest: one(guests, { fields: [eventGuests.guestId], references: [guests.id] }),
  badge: one(badges, { fields: [eventGuests.id], references: [badges.eventGuestId] }),
  tags: many(eventGuestTags),
  automationExecutions: many(automationExecutions),
  whatsappConversations: many(whatsappConversations),
  whatsappTokenQueues: many(whatsappTokenQueues),
  whatsappBroadcastResponses: many(whatsappBroadcastResponses),
}));

export const campaignsRelations = relations(campaigns, ({ one, many }) => ({
  event: one(events, { fields: [campaigns.eventId], references: [events.id] }),
  messages: many(campaignMessages),
  links: many(campaignLinks),
  assets: many(emailAssets),
  schedule: one(campaignSchedules, { fields: [campaigns.id], references: [campaignSchedules.campaignId] }),
  unsubscribes: many(unsubscribes),
}));

export const campaignMessagesRelations = relations(campaignMessages, ({ one, many }) => ({
  campaign: one(campaigns, { fields: [campaignMessages.campaignId], references: [campaigns.id] }),
  opens: many(emailOpens),
  clicks: many(linkClicks),
  bounces: many(bounces),
}));

export const badgesRelations = relations(badges, ({ one }) => ({
  eventGuest: one(eventGuests, { fields: [badges.eventGuestId], references: [eventGuests.id] }),
}));

export const emailAssetsRelations = relations(emailAssets, ({ one }) => ({
  campaign: one(campaigns, { fields: [emailAssets.campaignId], references: [campaigns.id] }),
}));

export const emailAttachmentsRelations = relations(emailAttachments, ({ one }) => ({
  campaign: one(campaigns, { fields: [emailAttachments.campaignId], references: [campaigns.id] }),
}));

// Better Auth Relations
export const userRelations = relations(user, ({ one, many }) => ({
  sessions: many(session),
  accounts: many(account),
  permissions: one(eventManagerPermissions, { fields: [user.id], references: [eventManagerPermissions.userId] }),
  assignedEvents: many(eventAssignments),
  whatsappTemplateFavorites: many(whatsappTemplateFavorites),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

// Automation Relations
export const automationsRelations = relations(automations, ({ one, many }) => ({
  event: one(events, { fields: [automations.eventId], references: [events.id] }),
  nodes: many(automationNodes),
  edges: many(automationEdges),
  executions: many(automationExecutions),
}));

export const automationNodesRelations = relations(automationNodes, ({ one }) => ({
  automation: one(automations, { fields: [automationNodes.automationId], references: [automations.id] }),
}));

export const automationEdgesRelations = relations(automationEdges, ({ one }) => ({
  automation: one(automations, { fields: [automationEdges.automationId], references: [automations.id] }),
}));

export const automationExecutionsRelations = relations(automationExecutions, ({ one, many }) => ({
  automation: one(automations, { fields: [automationExecutions.automationId], references: [automations.id] }),
  eventGuest: one(eventGuests, { fields: [automationExecutions.eventGuestId], references: [eventGuests.id] }),
  steps: many(executionSteps),
}));

export const executionStepsRelations = relations(executionSteps, ({ one }) => ({
  execution: one(automationExecutions, { fields: [executionSteps.executionId], references: [automationExecutions.id] }),
}));

// Guest Tags Relations
export const guestTagsRelations = relations(guestTags, ({ one, many }) => ({
  event: one(events, { fields: [guestTags.eventId], references: [events.id] }),
  eventGuestTags: many(eventGuestTags),
}));

export const eventGuestTagsRelations = relations(eventGuestTags, ({ one }) => ({
  eventGuest: one(eventGuests, { fields: [eventGuestTags.eventGuestId], references: [eventGuests.id] }),
  tag: one(guestTags, { fields: [eventGuestTags.tagId], references: [guestTags.id] }),
}));

// Event Manager Roles & Permissions Relations
export const eventManagerPermissionsRelations = relations(eventManagerPermissions, ({ one }) => ({
  user: one(user, { fields: [eventManagerPermissions.userId], references: [user.id] }),
}));

export const eventAssignmentsRelations = relations(eventAssignments, ({ one }) => ({
  event: one(events, { fields: [eventAssignments.eventId], references: [events.id] }),
  assignedUser: one(user, { fields: [eventAssignments.assignedUserId], references: [user.id] }),
}));

export const guestPhotosRelations = relations(guestPhotos, ({ one }) => ({
  guest: one(guests, { fields: [guestPhotos.guestId], references: [guests.id] }),
}));

// Admin Email Campaign Management Relations

export const campaignLinksRelations = relations(campaignLinks, ({ one, many }) => ({
  campaign: one(campaigns, { fields: [campaignLinks.campaignId], references: [campaigns.id] }),
  clicks: many(linkClicks),
}));

export const linkClicksRelations = relations(linkClicks, ({ one }) => ({
  link: one(campaignLinks, { fields: [linkClicks.linkId], references: [campaignLinks.id] }),
  campaignMessage: one(campaignMessages, { fields: [linkClicks.campaignMessageId], references: [campaignMessages.id] }),
}));

export const emailOpensRelations = relations(emailOpens, ({ one }) => ({
  campaignMessage: one(campaignMessages, { fields: [emailOpens.campaignMessageId], references: [campaignMessages.id] }),
}));

export const bouncesRelations = relations(bounces, ({ one }) => ({
  campaignMessage: one(campaignMessages, { fields: [bounces.campaignMessageId], references: [campaignMessages.id] }),
}));

export const unsubscribesRelations = relations(unsubscribes, ({ one }) => ({
  campaign: one(campaigns, { fields: [unsubscribes.campaignId], references: [campaigns.id] }),
}));

export const importJobsRelations = relations(importJobs, ({ one }) => ({
  event: one(events, { fields: [importJobs.eventId], references: [events.id] }),
  user: one(user, { fields: [importJobs.userId], references: [user.id] }),
}));

export const campaignSchedulesRelations = relations(campaignSchedules, ({ one }) => ({
  campaign: one(campaigns, { fields: [campaignSchedules.campaignId], references: [campaigns.id] }),
}));


// WhatsApp AI Concierge Relations

export const whatsappChannelsRelations = relations(whatsappChannels, ({ one, many }) => ({
  event: one(events, { fields: [whatsappChannels.eventId], references: [events.id] }),
  conversations: many(whatsappConversations),
  messages: many(whatsappMessages),
  broadcasts: many(whatsappBroadcasts),
}));

export const whatsappConversationsRelations = relations(whatsappConversations, ({ one, many }) => ({
  channel: one(whatsappChannels, { fields: [whatsappConversations.channelId], references: [whatsappChannels.id] }),
  event: one(events, { fields: [whatsappConversations.eventId], references: [events.id] }),
  eventGuest: one(eventGuests, { fields: [whatsappConversations.eventGuestId], references: [eventGuests.id] }),
  messages: many(whatsappMessages),
}));

export const whatsappMessagesRelations = relations(whatsappMessages, ({ one }) => ({
  conversation: one(whatsappConversations, { fields: [whatsappMessages.conversationId], references: [whatsappConversations.id] }),
  channel: one(whatsappChannels, { fields: [whatsappMessages.channelId], references: [whatsappChannels.id] }),
  broadcast: one(whatsappBroadcasts, { fields: [whatsappMessages.broadcastId], references: [whatsappBroadcasts.id] }),
}));

export const whatsappBroadcastsRelations = relations(whatsappBroadcasts, ({ one, many }) => ({
  event: one(events, { fields: [whatsappBroadcasts.eventId], references: [events.id] }),
  channel: one(whatsappChannels, { fields: [whatsappBroadcasts.channelId], references: [whatsappChannels.id] }),
  responses: many(whatsappBroadcastResponses),
  messages: many(whatsappMessages),
}));

export const whatsappBroadcastResponsesRelations = relations(whatsappBroadcastResponses, ({ one }) => ({
  broadcast: one(whatsappBroadcasts, { fields: [whatsappBroadcastResponses.broadcastId], references: [whatsappBroadcasts.id] }),
  eventGuest: one(eventGuests, { fields: [whatsappBroadcastResponses.eventGuestId], references: [eventGuests.id] }),
}));

export const whatsappTokenQueuesRelations = relations(whatsappTokenQueues, ({ one }) => ({
  event: one(events, { fields: [whatsappTokenQueues.eventId], references: [events.id] }),
  eventGuest: one(eventGuests, { fields: [whatsappTokenQueues.eventGuestId], references: [eventGuests.id] }),
}));

export const eventAgendasRelations = relations(eventAgendas, ({ one }) => ({
  event: one(events, { fields: [eventAgendas.eventId], references: [events.id] }),
}));

export const eventKnowledgeBaseRelations = relations(eventKnowledgeBase, ({ one }) => ({
  event: one(events, { fields: [eventKnowledgeBase.eventId], references: [events.id] }),
}));

// WhatsApp Template Management Relations

export const whatsappTemplatesRelations = relations(whatsappTemplates, ({ many }) => ({
  favorites: many(whatsappTemplateFavorites),
}));

export const whatsappTemplateFavoritesRelations = relations(whatsappTemplateFavorites, ({ one }) => ({
  template: one(whatsappTemplates, { fields: [whatsappTemplateFavorites.templateId], references: [whatsappTemplates.id] }),
  user: one(user, { fields: [whatsappTemplateFavorites.userId], references: [user.id] }),
}));
