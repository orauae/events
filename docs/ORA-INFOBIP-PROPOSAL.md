# ORA Platform x Infobip Integration

## Transforming ORA from Event Management to Enterprise Communication & Customer Experience

**Prepared by:** ORA Development Team
**Date:** February 2026
**Audience:** Management

---

## What Is This About?

ORA currently manages our events — invitations, guest RSVPs, check-ins, and email campaigns. It works well, but it only communicates through **email**.

By connecting ORA to **Infobip** — a global communication platform used by Uber, WhatsApp, Toyota, and major enterprises worldwide — we unlock the ability to reach our clients through **SMS, WhatsApp, voice calls, live chat, and more**, all from the same ORA platform.

This document outlines what becomes possible and how it elevates ORA Developers' operations across the business.

---

## Part 1: What Changes for Our Events

### Today vs. Tomorrow

| What We Do Today | What Becomes Possible |
|---|---|
| Invitations go out by email only | Invitations via Email + WhatsApp + SMS — guest chooses their preference |
| We have no way to know if a guest saw the invite | WhatsApp shows blue ticks (read receipts), SMS confirms delivery |
| RSVP requires opening email and clicking a link | Guest can tap "Attending" or "Decline" directly inside WhatsApp |
| Guest feedback is not collected | Surveys sent via WhatsApp after the event — guests answer in the chat itself |
| Check-in is QR code only — anyone with a screenshot can enter | VIP and VVIP check-in with a one-time code sent to their personal phone |
| All guests experience the same process | Different experiences for Normal, VIP, and VVIP guests |
| No real-time communication during events | SMS or WhatsApp blasts to all attendees during the event |

---

## Part 2: Guest Tier System — Normal, VIP, VVIP

Not every guest is the same. A property expo visitor and a royal dignitary should not receive the same check-in experience. Here is how we differentiate:

### Who Falls Into Each Tier

| Tier | Who Are They | Examples |
|---|---|---|
| **Normal** | General invitees | Property expo visitors, media, vendors, general public |
| **VIP** | Important clients & partners | High-net-worth buyers, broker partners, investors, senior executives |
| **VVIP** | Dignitaries & royals | Royal family members, governors, ambassadors, government officials |

---

### Use Case: Property Launch Event — "ORA Waterfront Residences"

#### Invitation Phase

**Normal Guest** receives:
> An email with event details, date, location, and an RSVP link.

**VIP Client** receives:
> A WhatsApp message with a beautiful property brochure, a 30-second video walkthrough, and a button to confirm attendance — plus an email as backup.

**VVIP Dignitary** receives:
> A personal WhatsApp message from the CEO's office, followed by a courtesy call from their assigned relationship manager. A physical invitation is also couriered.

#### RSVP Phase

**Normal Guest:**
> Clicks the link in the email, fills in details on the website.

**VIP Client:**
> Taps "Confirm Attendance" directly in WhatsApp. A follow-up WhatsApp asks about dietary preferences and parking needs — the guest answers question by question inside the chat.

**VVIP Dignitary:**
> Relationship manager confirms on their behalf via the ORA system. The system automatically creates a protocol checklist for the events team.

#### Event Day

**Normal Guest:**
> Receives an SMS reminder 2 hours before. Arrives, shows QR code, scans in.

**VIP Client:**
> Receives a WhatsApp message with parking location and entrance instructions. At the gate, gives their name. A one-time code (OTP) is sent to their phone. They read the code to the staff → identity confirmed → checked in. Their assigned host is notified instantly: *"Mr. Ahmed has arrived."*

**VVIP Dignitary:**
> Arrives at the dedicated entrance. Staff initiates verification on the ORA tablet. A one-time code is sent to the dignitary's phone. Upon verification:
> - The protocol officer's phone buzzes: *"H.E. has arrived at Gate A"*
> - The CEO receives a WhatsApp: *"H.E. [Name] is in the building"*
> - Security team is notified via SMS
> - The dignitary is escorted directly to the private viewing area

**Why OTP matters for VIP/VVIP:** A QR code can be screenshotted and shared. An OTP is sent to the guest's personal phone in real time — only **they** can provide it. This eliminates impersonation and ensures proper protocol for high-profile guests.

#### After the Event

**Normal Guest:**
> Receives an email thank you, followed by a WhatsApp survey the next day:
> *"How was your experience at ORA Waterfront launch? Rate 1-5"*
> The guest replies directly in WhatsApp — no forms, no links.

**VIP Client:**
> Receives a WhatsApp message with unit availability and pricing PDF. Their relationship manager is automatically assigned in the system for follow-up. A reminder pops up for the RM to call within 48 hours.

**VVIP Dignitary:**
> Receives a personal WhatsApp thank you from the CEO's office. The relationship manager calls within 24 hours. If the dignitary expressed interest in a unit, a private viewing is scheduled.

---

### Use Case: Annual Investor Gala

| Phase | What Happens |
|---|---|
| **4 weeks before** | All investors receive a WhatsApp save-the-date with the event teaser video |
| **2 weeks before** | VIP/VVIP investors get a personal call from their RM confirming attendance |
| **1 week before** | Dietary and seating preference survey sent via WhatsApp (interactive form inside the chat) |
| **Event day morning** | SMS to all confirmed guests with timing, dress code, parking |
| **Event day -2 hours** | WhatsApp to VVIPs with their dedicated entrance and assigned greeter name |
| **During event** | Real-time SMS to all guests: "Keynote starting in 10 minutes in the Grand Hall" |
| **Check-in** | Normal: QR scan. VIP/VVIP: OTP verification + staff notification |
| **Next day** | WhatsApp satisfaction survey + Email with investment summary PDF |
| **1 week later** | Follow-up WhatsApp from RM to VIP clients who attended |

---

### Use Case: Exclusive VVIP Private Viewing

A private property viewing for 15 select individuals including royal family members.

| Step | What ORA Does |
|---|---|
| Guest list uploaded | System tags each guest as VVIP and assigns a liaison officer |
| Invitation sent | Each guest gets a personal WhatsApp from the CEO, no mass message feel |
| RSVP confirmed | Liaison officer notified, protocol checklist auto-generated |
| Day-of arrival | OTP sent to guest's phone → verified at entrance → liaison alerted → security updated |
| During viewing | Liaison available via dedicated WhatsApp support line for any needs |
| Post-viewing | CEO WhatsApp thank you → RM follow-up call within 24h |

---

## Part 3: Beyond Events — What Else ORA Can Do

Once connected to Infobip, ORA is no longer just an event app. Here's what opens up across the business:

### Property Sales & Marketing

| Scenario | How It Works |
|---|---|
| New project announcement | WhatsApp broadcast to investor database with brochure and price list |
| Open house registration | SMS campaign with registration link, WhatsApp reminder before the visit |
| Payment reminders | Automated SMS: *"Dear Mr. Ahmed, your installment of AED 150,000 is due on March 1"* |
| Booking confirmation | WhatsApp message with booking details, payment receipt PDF attached |
| Price list requests | Chatbot on WhatsApp: Client asks *"Send me the price list for ORA Marina"* → bot sends it instantly |

### Customer Service & Support

| Scenario | How It Works |
|---|---|
| Buyer has a question | Sends WhatsApp to ORA → automatically routed to the right team |
| VIP client inquiry | Detected as VIP → routed to priority queue → faster response time |
| Maintenance request | Resident sends WhatsApp photo of issue → ticket created → assigned to facilities |
| After-hours inquiry | Chatbot responds: *"Our team is available Sun-Thu 9AM-6PM. We'll get back to you first thing."* |
| Satisfaction check | After each support interaction, automatic WhatsApp: *"How would you rate our support today? 1-5"* |
| Complaint escalation | If rating is 1 or 2, automatically escalated to supervisor with full conversation history |

### Handover & After-Sales

| Scenario | How It Works |
|---|---|
| Handover scheduling | WhatsApp flow: *"Choose your preferred handover date"* → client selects from available slots |
| Document signing | OTP sent via SMS for identity verification before signing |
| Key collection | SMS notification: *"Your keys are ready for collection"* + OTP for verification at handover |
| Snag list follow-up | WhatsApp update: *"3 of your 5 reported items have been resolved"* |
| Post-handover survey | WhatsApp survey: *"Rate your handover experience"* |

### Community & Resident Management

| Scenario | How It Works |
|---|---|
| Building maintenance notice | SMS to all residents: *"Water shutdown in Tower A on Tuesday 10AM-2PM"* |
| Community event invitation | WhatsApp with event details + RSVP button |
| Emergency notification | Voice call broadcast: Automated message to all residents about emergency |
| Resident feedback | Quarterly WhatsApp survey on community satisfaction |
| Visitor management | SMS OTP to resident: *"Visitor Mr. X is at the gate. Reply YES to allow entry"* |

### Investor Relations

| Scenario | How It Works |
|---|---|
| Quarterly update | WhatsApp message to investors with project progress + photos |
| New investment opportunity | Personalized WhatsApp based on investor profile and past interests |
| Dividend notification | SMS: *"Your Q4 dividend of AED 25,000 has been processed"* |
| Investor event | Full enhanced event flow (invitation → RSVP → check-in → follow-up) |

---

## Part 4: Surveys & Feedback — Built Into the Conversation

No more ignored survey emails. With WhatsApp Flows, surveys happen **inside the conversation**:

| Survey Type | How It Feels to the Guest |
|---|---|
| **Event feedback** | Guest gets a WhatsApp: *"How was ORA Waterfront launch?"* → Taps a rating → selects what they liked → done in 30 seconds |
| **Property interest** | *"Which type of unit interests you?"* → Guest selects 2BR / 3BR → *"Budget range?"* → selects range → Lead captured |
| **Customer satisfaction** | After support interaction: *"Rate your experience 1-5"* → Guest taps 4 → *"Any comments?"* → Types feedback → Logged |
| **Net Promoter Score** | *"How likely are you to recommend ORA to a friend? 0-10"* → Guest taps → Automatically categorized |

WhatsApp surveys get **40-60% response rates** compared to **5-10% for email surveys**.

---

## Part 5: Why Infobip Specifically?

| Factor | Detail |
|---|---|
| **Global leader** | 10,000+ enterprise customers globally, including banks, airlines, and real estate |
| **Channel coverage** | SMS, WhatsApp, Viber, RCS, Voice, Email, Live Chat — all from one platform |
| **UAE presence** | Local data center, UAE phone number support, Arabic language support |
| **WhatsApp Business Partner** | Official Meta partner — required for business WhatsApp messaging |
| **Contact center included** | Full helpdesk with queues, routing, and chatbots — no separate vendor needed |
| **Security** | Enterprise-grade security, 2FA/OTP built-in, GDPR compliant |
| **Scalable** | Handles millions of messages — no volume limits that would constrain us |
| **Single vendor** | Replaces the need for separate SMS provider, survey tool, helpdesk, and chatbot platform |

---

## Part 6: What We're Really Proposing

**Today:** ORA is an event management tool that sends emails.

**Proposed:** ORA becomes ORA Developers' **central communication and customer experience platform** — handling events, client engagement, customer service, surveys, and secure interactions across every channel our clients use.

| Capability | Replaces / Eliminates |
|---|---|
| SMS & WhatsApp campaigns | Need for separate SMS vendor |
| Conversations inbox | Need for separate helpdesk tool |
| WhatsApp surveys | Need for separate survey platform |
| Chatbot | Need for FAQ page updates and repetitive manual responses |
| OTP verification | Manual identity checks at events |
| People data platform | Disconnected spreadsheets of client preferences |

**One platform. Every channel. Every client tier. Every touchpoint.**

---

## Part 7: Suggested Rollout

| Phase | What | Timeline |
|---|---|---|
| **Phase 1** | SMS campaigns + OTP check-in for VIP/VVIP + Guest tier system | 3 weeks |
| **Phase 2** | WhatsApp campaigns + WhatsApp RSVP + Delivery tracking | 3 weeks |
| **Phase 3** | Customer service inbox + Support queues + Chatbot | 3 weeks |
| **Phase 4** | Surveys + Resident communications + Investor relations features | 3 weeks |

Each phase is independent and delivers immediate value.

---

## Summary

This integration transforms ORA from a **single-purpose event app** into the **communication backbone of ORA Developers** — the system through which every client, investor, resident, and VIP interacts with the company.

The guest who receives a beautifully designed WhatsApp invitation, confirms with one tap, checks in with a secure code, provides feedback inside a chat, and gets followed up by their relationship manager — all through one seamless platform — that is the experience we can deliver.

---

*Ready to proceed upon approval. The development team can begin Phase 1 immediately.*
