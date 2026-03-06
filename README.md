# 🎉 ORA Events

> **Modern Event Management Platform** — A full-stack Next.js application for managing events, guests, email campaigns, and automated workflows.

[![Next.js](https://img.shields.io/badge/Next.js-16.1.2-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle-ORM-green)](https://orm.drizzle.team/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-38B2AC?logo=tailwind-css)](https://tailwindcss.com/)
[![Trigger.dev](https://img.shields.io/badge/Trigger.dev-v4-purple)](https://trigger.dev/)

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Architecture](#-architecture)
- [Project Structure](#-project-structure)
- [Code Organization](#-code-organization)
- [Getting Started](#-getting-started)
- [API Reference](#-api-reference)
- [Database Schema](#-database-schema)
- [Background Jobs](#-background-jobs)
- [Authentication & Authorization](#-authentication--authorization)
- [Email System](#-email-system)
- [Automation Engine](#-automation-engine)
- [Testing](#-testing)
- [Environment Variables](#-environment-variables)
- [Deployment](#-deployment)
- [Contributing](#-contributing)

---

## 🌟 Overview

ORA Events is a comprehensive event management platform designed for organizations to:

- **Create and manage events** with customizable settings and branding
- **Handle guest registrations** with RSVP workflows and QR code check-in
- **Send email campaigns** with drag-and-drop visual editor
- **Automate workflows** based on triggers, conditions, and actions
- **Track analytics** for event performance and engagement metrics

### Key Differentiators

- **Visual Automation Builder**: Drag-and-drop workflow editor with React Flow
- **Real-time Check-in**: QR code scanning with live attendance tracking
- **A/B Testing**: Built-in email campaign testing with automatic winner selection
- **Multi-tenant**: Support for multiple event managers with granular permissions

---

## ✨ Features

### Event Management

| Feature | Description |
|---------|-------------|
| **Event Creation** | Create events with custom branding, dates, locations, and settings |
| **Guest Management** | Import, manage, and track guest lists with CSV/Excel support |
| **Check-in System** | Real-time check-in with QR codes, camera scanning, and status tracking |
| **Analytics Dashboard** | Track RSVPs, attendance rates, and engagement metrics |
| **Event Transfer** | Transfer event ownership between organizers |
| **Badge Generation** | Automatic PDF badge generation for confirmed guests |

### Email Campaigns

| Feature | Description |
|---------|-------------|
| **Visual Email Builder** | Drag-and-drop email editor with Unlayer integration |
| **Template Library** | Reusable email templates for invitations, reminders, thank-you notes |
| **Bulk Sending** | Send campaigns to thousands of recipients via background jobs |
| **Scheduling** | Schedule campaigns for future delivery with timezone support |
| **A/B Testing** | Test subject lines and content with automatic winner selection |
| **Tracking** | Open rates, click tracking, bounce handling, and engagement analytics |
| **SMTP Support** | Configure custom SMTP providers with rate limiting |

### Automation Engine

| Feature | Description |
|---------|-------------|
| **Visual Workflow Builder** | Drag-and-drop automation builder with React Flow |
| **Trigger Types** | RSVP changes, check-in events, scheduled times, event date proximity |
| **Conditions** | Branch workflows based on guest data, tags, RSVP status |
| **Actions** | Send emails, add/remove tags, update guest data, wait periods |
| **Execution Logs** | Detailed execution history with step-by-step debugging |
| **Templates** | Pre-built automation templates for common scenarios |

### Administration

| Feature | Description |
|---------|-------------|
| **Admin Dashboard** | Platform-wide management and analytics |
| **User Management** | Manage event managers with role-based permissions |
| **SMTP Settings** | Configure multiple email delivery providers |
| **Template Management** | Global template library for all users |
| **Audit Logging** | Track all administrative actions |

---

## 🛠 Tech Stack

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 16.1.2 | React framework with App Router |
| React | 19 | UI library with Server Components |
| TypeScript | 5 | Type-safe JavaScript |
| Tailwind CSS | 4 | Utility-first CSS framework |
| Radix UI | Latest | Accessible component primitives |
| React Hook Form | Latest | Form state management |
| TanStack Query | 5 | Data fetching and caching |
| React Flow | 11 | Visual workflow builder |
| Unlayer | 1.7 | Email template editor |

### Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| Hono.js | 4 | Lightweight web framework for API routes |
| Drizzle ORM | 0.45 | Type-safe SQL ORM |
| PostgreSQL | 15+ | Primary database (Neon serverless) |
| Better Auth | 1.4 | Authentication library |
| Trigger.dev | 4.3 | Background job processing |
| Resend | 6 | Email delivery service |
| Nodemailer | 7 | SMTP email sending |
| MJML | 4 | Email template rendering |

### Infrastructure

| Service | Purpose |
|---------|---------|
| Vercel | Deployment and hosting |
| Neon | Serverless PostgreSQL |
| Trigger.dev Cloud | Background job execution |
| Cloudflare R2 | File storage (images, assets) |

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Layer                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Next.js   │  │  React 19   │  │   TanStack Query        │  │
│  │  App Router │  │ Components  │  │   (Data Fetching)       │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                          API Layer                               │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              Hono.js REST API (/api/[[...route]])           ││
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       ││
│  │  │  Events  │ │  Guests  │ │Campaigns │ │Automation│       ││
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘       ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Service Layer                              │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐ │
│  │ EventService │ │ GuestService │ │   CampaignService        │ │
│  └──────────────┘ └──────────────┘ └──────────────────────────┘ │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐ │
│  │ EmailService │ │ AutomationSvc│ │   AnalyticsService       │ │
│  └──────────────┘ └──────────────┘ └──────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Data Layer                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │               Drizzle ORM + PostgreSQL                    │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐  │   │
│  │  │ Events │ │ Guests │ │Campaign│ │  Users │ │  More  │  │   │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘  │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Background Jobs (Trigger.dev)                 │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐ │
│  │ Bulk Email   │ │  Scheduled   │ │   Automation             │ │
│  │   Sender     │ │  Campaigns   │ │   Execution              │ │
│  └──────────────┘ └──────────────┘ └──────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
ora-events/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Authentication pages (login, signup)
│   ├── (dashboard)/              # Protected dashboard routes
│   │   ├── events/               # Event management (CRUD, details)
│   │   ├── guests/               # Guest management (list, import)
│   │   └── settings/             # User settings, event managers
│   ├── admin/                    # Admin panel (platform management)
│   │   ├── campaigns/            # Global campaign management
│   │   ├── events/               # All events administration
│   │   ├── guests/               # Global guest management
│   │   ├── managers/             # Event manager administration
│   │   ├── templates/            # Email template library
│   │   └── settings/             # Platform settings (SMTP)
│   ├── api/                      # API routes
│   │   ├── [[...route]]/         # Hono.js catch-all route
│   │   ├── auth/                 # Better Auth endpoints
│   │   ├── cron/                 # Scheduled job endpoints
│   │   └── webhooks/             # Webhook handlers (Resend)
│   ├── checkin/                  # QR code check-in interface
│   ├── rsvp/                     # Public RSVP pages
│   └── track/                    # Email tracking endpoints
│
├── components/                   # React components
│   ├── admin/                    # Admin-specific components
│   │   ├── campaign-wizard/      # Multi-step campaign creation
│   │   └── ...                   # Admin UI components
│   ├── automation-builder/       # Visual workflow builder
│   │   ├── nodes/                # Custom React Flow nodes
│   │   └── ...                   # Builder components
│   ├── events/                   # Event-related components
│   ├── guests/                   # Guest management components
│   │   └── import-wizard/        # CSV/Excel import wizard
│   ├── settings/                 # Settings components
│   ├── shared/                   # Shared/common components
│   ├── ui/                       # UI primitives (shadcn/ui style)
│   └── unlayer-email-builder/    # Email editor integration
│
├── db/                           # Database layer
│   ├── schema.ts                 # Drizzle schema definitions
│   ├── relations.ts              # Table relationships
│   ├── index.ts                  # Database client
│   ├── seed.ts                   # Database seeding
│   └── migrations/               # SQL migrations
│
├── hooks/                        # Custom React hooks
│   ├── use-events.ts             # Event data hooks
│   ├── use-guests.ts             # Guest data hooks
│   ├── use-campaigns.ts          # Campaign hooks
│   ├── use-automations.ts        # Automation hooks
│   └── ...                       # Additional hooks
│
├── lib/                          # Shared utilities
│   ├── services/                 # Business logic services
│   │   ├── event-service.ts      # Event CRUD operations
│   │   ├── guest-service.ts      # Guest management
│   │   ├── campaign-service.ts   # Campaign operations
│   │   ├── automation-service.ts # Automation management
│   │   ├── workflow-engine.ts    # Automation execution
│   │   └── ...                   # 30+ service modules
│   ├── utils/                    # Utility functions
│   ├── types/                    # TypeScript types
│   ├── config/                   # Configuration
│   └── __tests__/                # Unit and property tests
│
├── trigger/                      # Trigger.dev background jobs
│   ├── bulk-email-send.ts        # Bulk email processing
│   ├── scheduled-automation.ts   # Scheduled automations
│   ├── automation-execution.ts   # Workflow execution
│   └── event-date-checker.ts     # Event date monitoring
│
├── docs/                         # Documentation
│   └── ADMIN_USER_GUIDE.md       # Admin user guide
│
└── scripts/                      # Utility scripts
    ├── test-email.ts             # Email testing
    └── ...                       # Additional scripts
```

---

## 📦 Code Organization

### Service Layer Pattern

All business logic is encapsulated in service classes located in `lib/services/`. Each service:

- Has a single responsibility (e.g., `EventService` handles events only)
- Uses Zod schemas for input validation
- Returns typed results
- Is fully documented with JSDoc

```typescript
/**
 * @fileoverview Event Service - Core event management operations
 * @module lib/services/event-service
 */

export class EventService {
  /**
   * Creates a new event with the provided details.
   * @param input - Event creation data (validated by createEventSchema)
   * @returns The created event record
   * @throws {Error} If validation fails or database error occurs
   */
  static async create(input: CreateEventInput): Promise<Event> {
    // Implementation
  }
}
```

### Component Organization

Components follow a feature-based organization:

- **UI Components** (`components/ui/`): Reusable primitives (Button, Input, Dialog)
- **Feature Components** (`components/events/`, etc.): Feature-specific components
- **Shared Components** (`components/shared/`): Cross-feature components

### Hook Patterns

Custom hooks in `hooks/` follow TanStack Query patterns:

```typescript
/**
 * @fileoverview Event hooks for data fetching and mutations
 * @module hooks/use-events
 */

export function useEvents() {
  return useQuery({
    queryKey: ['events'],
    queryFn: () => api.events.list(),
  });
}

export function useCreateEvent() {
  return useMutation({
    mutationFn: (data: CreateEventInput) => api.events.create(data),
    onSuccess: () => queryClient.invalidateQueries(['events']),
  });
}
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18.17 or later
- **pnpm** (recommended) or npm
- **PostgreSQL** database (or Neon account)
- **Trigger.dev** account for background jobs

### Installation

1. **Clone the repository**

```bash
git clone https://github.com/your-org/ora-events.git
cd ora-events
```

2. **Install dependencies**

```bash
pnpm install
```

3. **Set up environment variables**

```bash
cp .env.example .env.local
```

4. **Configure your `.env.local`** (see [Environment Variables](#-environment-variables))

5. **Run database migrations**

```bash
pnpm db:migrate
```

6. **Seed the database** (optional)

```bash
pnpm db:seed
```

7. **Start the development server**

```bash
pnpm dev
```

8. **Start Trigger.dev** (in a separate terminal)

```bash
pnpm trigger:dev
```

Visit [http://localhost:3000](http://localhost:3000) to see the application.

---

## 📡 API Reference

### Authentication

All authenticated endpoints require a valid session. Use the `/api/auth/*` endpoints for authentication.

### Events API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/events` | List all events for the authenticated user |
| `POST` | `/api/events` | Create a new event |
| `GET` | `/api/events/:id` | Get event details |
| `PUT` | `/api/events/:id` | Update an event |
| `DELETE` | `/api/events/:id` | Delete an event |
| `POST` | `/api/events/:id/transfer` | Transfer event ownership |

### Guests API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/events/:id/guests` | List guests for an event |
| `POST` | `/api/events/:id/guests` | Add a guest to an event |
| `PUT` | `/api/events/:id/guests/:guestId` | Update guest details |
| `DELETE` | `/api/events/:id/guests/:guestId` | Remove a guest |
| `POST` | `/api/events/:id/guests/import` | Bulk import guests |
| `POST` | `/api/events/:id/guests/:guestId/check-in` | Check in a guest |

### Campaigns API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/events/:id/campaigns` | List campaigns for an event |
| `POST` | `/api/events/:id/campaigns` | Create a campaign |
| `GET` | `/api/campaigns/:id` | Get campaign details |
| `PUT` | `/api/campaigns/:id` | Update a campaign |
| `POST` | `/api/campaigns/:id/send` | Send a campaign |
| `POST` | `/api/campaigns/:id/schedule` | Schedule a campaign |
| `GET` | `/api/campaigns/:id/report` | Get campaign analytics |

### Automations API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/events/:id/automations` | List automations for an event |
| `POST` | `/api/events/:id/automations` | Create an automation |
| `GET` | `/api/automations/:id` | Get automation details |
| `PUT` | `/api/automations/:id` | Update an automation |
| `POST` | `/api/automations/:id/activate` | Activate an automation |
| `GET` | `/api/automations/:id/executions` | Get execution history |

### RSVP API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/rsvp/:token` | Get RSVP details by token |
| `POST` | `/api/rsvp/:token` | Submit RSVP response |

---

## 🗄 Database Schema

### Core Entities

```sql
-- Events: Core event entity
events
├── id (text, primary key, CUID)
├── name (text, required)
├── type (enum: Conference, Private, Corporate, Exhibition, ProductLaunch, OpenHouse)
├── description (text)
├── startDate (timestamp)
├── endDate (timestamp)
├── location (text)
└── createdAt, updatedAt (timestamps)

-- Guests: Central contact database
guests
├── id (text, primary key, CUID)
├── firstName, lastName (text, required)
├── email (text, unique, required)
├── mobile, company, jobTitle (text, optional)
└── createdAt, updatedAt (timestamps)

-- EventGuests: Guest participation in events
event_guests
├── id (text, primary key, CUID)
├── eventId (foreign key → events)
├── guestId (foreign key → guests)
├── invitationStatus (enum: Pending, Sent, Delivered, Failed)
├── rsvpStatus (enum: Pending, Attending, Maybe, NotAttending)
├── checkInStatus (enum: NotCheckedIn, CheckedIn)
├── checkInTime (timestamp)
├── qrToken (text, unique)
└── RSVP form fields (representingCompany, companyRepresented, etc.)

-- Campaigns: Email campaigns
campaigns
├── id (text, primary key, CUID)
├── eventId (foreign key → events)
├── name, subject, content (text)
├── designJson (jsonb, email builder state)
├── type (enum: Invitation, Reminder, LastChance, EventDayInfo, ThankYou, Feedback)
├── status (enum: Draft, Scheduled, Queued, Sending, Sent, Paused, Cancelled)
├── Analytics counters (recipientCount, sentCount, deliveredCount, etc.)
└── A/B testing fields (isAbTest, abTestConfig, winningVariant)

-- Automations: Workflow definitions
automations
├── id (text, primary key, CUID)
├── eventId (foreign key → events)
├── name, description (text)
├── status (enum: Draft, Active, Paused)
└── createdAt, updatedAt (timestamps)
```

### Entity Relationships

```
User (1) ─── (N) EventAssignment (N) ─── (1) Event
                                              │
Event (1) ─── (N) EventGuest (N) ─── (1) Guest
  │                   │
  ├── (N) Campaign    ├── (1) Badge
  │       │           └── (N) EventGuestTag
  │       └── (N) CampaignMessage
  │
  ├── (N) Automation
  │       ├── (N) AutomationNode
  │       ├── (N) AutomationEdge
  │       └── (N) AutomationExecution
  │               └── (N) ExecutionStep
  │
  └── (N) GuestTag
```

---

## ⚡ Background Jobs

### Trigger.dev Tasks

| Task | File | Description |
|------|------|-------------|
| `bulk-email-send` | `trigger/bulk-email-send.ts` | Processes bulk email campaigns with batching |
| `scheduled-automation` | `trigger/scheduled-automation.ts` | Executes scheduled automation triggers |
| `automation-execution` | `trigger/automation-execution.ts` | Runs automation workflows with wait support |
| `event-date-checker` | `trigger/event-date-checker.ts` | Monitors event dates for proximity triggers |

### Campaign Sending Logic

```typescript
// Campaigns with < 100 recipients → Immediate send
// Campaigns with ≥ 100 recipients → Queued via Trigger.dev
const IMMEDIATE_SEND_THRESHOLD = 100;
```

### Automation Execution

Automations use Trigger.dev's durable execution for:
- Long-running workflows with wait periods
- Reliable retry on failures
- Step-by-step execution logging
- Real-time status updates

---

## 🔐 Authentication & Authorization

### Authentication (Better Auth)

ORA Events uses **Better Auth** for authentication:

- **Email/Password** authentication
- **Session management** with secure cookies
- **Protected routes** via middleware

### Authorization Model

```
┌─────────────────────────────────────────────────────────────┐
│                        Admin                                 │
│  - Full platform access                                      │
│  - Manage all events, users, settings                        │
│  - Configure SMTP, templates                                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Event Manager                             │
│  - Access assigned events only                               │
│  - Configurable permissions:                                 │
│    • canCreateEvents                                         │
│    • canUploadExcel                                          │
│    • canSendCampaigns                                        │
│    • canManageAutomations                                    │
│    • canDeleteGuests                                         │
└─────────────────────────────────────────────────────────────┘
```

### Middleware Protection

```typescript
// middleware.ts - Protected routes
export const config = {
  matcher: [
    "/events/:path*",
    "/guests/:path*",
    "/settings/:path*",
    "/admin/:path*",
  ],
};
```

---

## 📧 Email System

### Email Delivery Options

1. **Resend API** (default): Cloud email delivery service
2. **Custom SMTP**: Configure your own SMTP server

### Email Builder

The visual email builder uses Unlayer with:
- Drag-and-drop blocks
- Merge tags for personalization
- Mobile-responsive templates
- Image upload to R2

### Tracking Features

- **Open Tracking**: Pixel-based open detection
- **Click Tracking**: Link wrapping with redirect
- **Bounce Handling**: Hard/soft bounce categorization
- **Unsubscribe**: One-click unsubscribe support

---

## 🤖 Automation Engine

### Workflow Components

**Triggers** (Start the workflow):
- `rsvp_submitted`: Guest submits RSVP
- `rsvp_status_changed`: RSVP status changes
- `guest_checked_in`: Guest checks in
- `scheduled`: Cron-based schedule
- `event_date_approaching`: Days before event

**Conditions** (Branch logic):
- `rsvp_status`: Check RSVP status
- `has_tag`: Check if guest has tag
- `guest_field`: Check guest data field

**Actions** (Perform operations):
- `send_email`: Send email to guest
- `add_tag`: Add tag to guest
- `remove_tag`: Remove tag from guest
- `update_guest`: Update guest data
- `wait`: Wait for duration

### Execution Flow

```
Trigger → Condition? → Action → Condition? → Action → ...
              │                     │
              └── (false branch) ───┘
```

---

## 🧪 Testing

### Test Structure

```
lib/__tests__/
├── *-service.test.ts      # Unit tests for services
├── *-property.test.ts     # Property-based tests
├── integration-*.test.ts  # Integration tests
└── e2e-*.test.ts          # End-to-end tests
```

### Running Tests

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test lib/__tests__/event-service.test.ts

# Run with coverage
pnpm test --coverage
```

### Property-Based Testing

Uses `fast-check` for property-based testing:

```typescript
test.prop([fc.string(), fc.integer()])('property test', (str, num) => {
  // Test invariants hold for all inputs
});
```

---

## 🔧 Environment Variables

```bash
# Database
DATABASE_URL="postgresql://..."

# Authentication
BETTER_AUTH_SECRET="your-secret-key"
BETTER_AUTH_URL="http://localhost:3000"

# Email (Resend)
RESEND_API_KEY="re_..."
EMAIL_FROM="events@yourdomain.com"

# Trigger.dev
TRIGGER_SECRET_KEY="tr_..."

# Cloudflare R2 (File Storage)
R2_ACCOUNT_ID="..."
R2_ACCESS_KEY_ID="..."
R2_SECRET_ACCESS_KEY="..."
R2_BUCKET_NAME="..."
R2_PUBLIC_URL="..."

# Encryption (for SMTP passwords)
ENCRYPTION_KEY="32-byte-hex-key"

# Application
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

---

## 📦 Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Import the project in Vercel
3. Configure environment variables
4. Deploy!

### Trigger.dev

```bash
# Deploy background jobs
pnpm trigger:deploy
```

### Database Migrations

```bash
# Generate migration
pnpm drizzle-kit generate

# Apply migrations
pnpm db:migrate
```

---

## 🤝 Contributing

### Code Style

- **TypeScript**: Strict mode enabled
- **ESLint**: Configured with Next.js rules
- **JSDoc**: All public functions documented
- **Naming**: PascalCase for components, camelCase for functions

### JSDoc Standards

All files should include a file-level JSDoc:

```typescript
/**
 * @fileoverview Brief description of the file's purpose
 * 
 * Detailed description if needed.
 * 
 * @module path/to/module
 * @requires dependency-name
 */
```

All exported functions should include JSDoc:

```typescript
/**
 * Brief description of what the function does.
 * 
 * @param paramName - Description of the parameter
 * @returns Description of the return value
 * @throws {ErrorType} When this error occurs
 * @example
 * ```typescript
 * const result = myFunction('input');
 * ```
 */
```

### Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Write tests for new functionality
4. Ensure all tests pass (`pnpm test`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 👥 Authors

- **Joshua** - *Lead Developer*

---

<p align="center">
  Made with ❤️ using Next.js, TypeScript, and lots of ☕
</p>
