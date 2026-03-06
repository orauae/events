# EventOS Admin User Guide

This guide covers the Admin Email Campaign Management features in EventOS.

## Table of Contents

- [Getting Started](#getting-started)
- [Admin Dashboard](#admin-dashboard)
- [Campaign Management](#campaign-management)
- [Email Template Library](#email-template-library)
- [SMTP Configuration](#smtp-configuration)
- [Webhook Setup](#webhook-setup)
- [Guest Import](#guest-import)
- [A/B Testing](#ab-testing)
- [Troubleshooting](#troubleshooting)

## Getting Started

### Accessing the Admin Dashboard

1. Log in with an admin account
2. Navigate to `/admin` or click "Admin" in the navigation
3. You'll see the admin dashboard with campaign statistics

### Admin Roles

Only users with the `admin` role can access the admin section. Regular event managers can view campaigns for their assigned events but cannot access admin settings.

## Admin Dashboard

The admin dashboard (`/admin`) provides an overview of:

- Total campaigns and their statuses
- Recent campaign performance
- System health indicators
- Quick actions for common tasks

## Campaign Management

### Creating a Campaign

1. Navigate to **Admin → Campaigns**
2. Click **New Campaign**
3. Follow the 5-step wizard:

#### Step 1: Campaign Details

- **Name**: A descriptive name for the campaign
- **Type**: Select from Invitation, Reminder, Last Chance, Event Day, Thank You, Feedback, or Custom
- **Description**: Optional notes about the campaign

#### Step 2: Recipients

Choose how to select recipients:

- **By Event**: Select an event to send to all its guests
- **By Filter**: Build filters based on RSVP status, tags, etc.
- **By Upload**: Upload a CSV file with email addresses

The recipient count updates in real-time as you make selections.

#### Step 3: Email Design

- **Select Template**: Choose from the template library or start from scratch
- **Subject Line**: Enter the email subject (supports template strings)
- **Email Builder**: Use the drag-and-drop editor to design your email

**Available Blocks:**
- Text, Image, Button, Divider, Spacer
- Columns (1-4 column layouts)
- Header, Footer, Social Links
- Video Placeholder

**Template Strings:**
Click the variable picker to insert dynamic content:
- `{firstName}`, `{lastName}`, `{email}`
- `{eventName}`, `{eventDate}`, `{eventLocation}`
- `{rsvpLink}`, `{badgeLink}`, `{unsubscribeLink}`

#### Step 4: Schedule

- **Send Now**: Send immediately after confirmation
- **Schedule for Later**: Pick a date, time, and timezone
- **Save as Draft**: Save without sending

For scheduled campaigns, you'll receive reminders 24 hours and 1 hour before send time.

#### Step 5: Review

Review all campaign settings before sending:
- Campaign details summary
- Recipient count and preview
- Email preview with sample data
- Confirm and send

### Managing Campaigns

#### Campaign List

The campaign list (`/admin/campaigns`) shows:

| Column | Description |
|--------|-------------|
| Name | Campaign name with type badge |
| Status | Draft, Scheduled, Sending, Sent, Paused, Cancelled |
| Recipients | Total recipient count |
| Sent Date | When the campaign was sent |
| Open Rate | Percentage of opens |
| Click Rate | Percentage of clicks |
| Actions | Edit, View Report, Duplicate, Delete |

#### Filtering and Sorting

- Filter by status, type, date range, or event
- Sort by name, date, status, or performance metrics
- Use bulk actions to delete or duplicate multiple campaigns

#### Campaign Actions

- **Pause**: Stop a sending campaign (can resume later)
- **Resume**: Continue a paused campaign
- **Cancel**: Permanently stop a campaign
- **Duplicate**: Create a copy of a campaign

### Campaign Reports

View detailed analytics at `/admin/campaigns/[id]/report`:

#### Delivery Metrics
- **Sent**: Total emails sent
- **Delivered**: Successfully delivered
- **Bounced**: Hard and soft bounces
- **Delivery Rate**: Percentage delivered

#### Engagement Metrics
- **Opens**: Total opens
- **Unique Opens**: Unique recipients who opened
- **Open Rate**: Percentage of unique opens
- **Clicks**: Total link clicks
- **Unique Clicks**: Unique recipients who clicked
- **CTR**: Click-through rate

#### Link Performance
Table showing clicks per link with:
- Link URL and label
- Total clicks
- Unique clicks
- CTR

#### Timeline Chart
Visual chart showing opens and clicks over time.

#### Export Options
- **CSV**: Download raw data
- **PDF**: Download formatted report

## Email Template Library

### Managing Templates

Navigate to **Admin → Templates** to manage reusable email templates.

#### Creating a Template

1. Click **New Template**
2. Enter template details:
   - Name
   - Category (Invitation, Reminder, etc.)
   - Subject line
3. Design the email using the builder
4. Save the template

#### Template Categories

- **Invitation**: Event invitations
- **Reminder**: RSVP reminders
- **Last Chance**: Final reminder before event
- **Event Day**: Day-of-event communications
- **Thank You**: Post-event thank you
- **Feedback**: Feedback request
- **Custom**: Other templates

#### Default Templates

Mark a template as "default" for its category. When creating a campaign, the default template is pre-selected.

#### Import/Export

- **Import**: Upload HTML files to create templates
- **Export**: Download templates as HTML or JSON

## SMTP Configuration

### Adding an SMTP Provider

1. Navigate to **Admin → Settings → SMTP**
2. Click **Add Configuration**
3. Enter provider details:

| Field | Description |
|-------|-------------|
| Name | Friendly name (e.g., "SendGrid Production") |
| Host | SMTP server (e.g., smtp.sendgrid.net) |
| Port | Usually 587 (TLS) or 465 (SSL) |
| Username | SMTP username |
| Password | SMTP password (encrypted at rest) |
| Encryption | TLS, SSL, or None |
| From Email | Sender email address |
| From Name | Sender display name |
| Reply-To | Reply-to address (optional) |

4. Click **Test Connection** to verify
5. Click **Save**

### Rate Limiting

Configure rate limits to avoid provider throttling:

- **Hourly Limit**: Maximum emails per hour
- **Daily Limit**: Maximum emails per day
- **Batch Size**: Emails sent per batch

### Multiple Providers

You can configure multiple SMTP providers:
- Set one as **default** for all campaigns
- System handles failover automatically
- Useful for load distribution at scale

### Common SMTP Providers

#### SendGrid
```
Host: smtp.sendgrid.net
Port: 587
Username: apikey
Password: Your API key
Encryption: TLS
```

#### Mailgun
```
Host: smtp.mailgun.org
Port: 587
Username: Your SMTP username
Password: Your SMTP password
Encryption: TLS
```

#### Amazon SES
```
Host: email-smtp.{region}.amazonaws.com
Port: 587
Username: Your SMTP username
Password: Your SMTP password
Encryption: TLS
```

## Webhook Setup

### Resend Webhooks

Configure webhooks to receive delivery events:

1. Get your webhook URL: `https://yourdomain.com/api/webhooks/resend`

2. In Resend Dashboard:
   - Go to Webhooks
   - Add your webhook URL
   - Select events:
     - `email.delivered`
     - `email.bounced`
     - `email.complained`
     - `email.opened`
     - `email.clicked`
   - Copy the signing secret

3. Add to `.env`:
   ```
   RESEND_WEBHOOK_SECRET=whsec_...
   ```

### Webhook Events

| Event | Action |
|-------|--------|
| `email.delivered` | Update status to Delivered |
| `email.bounced` | Record bounce, mark undeliverable if hard bounce |
| `email.complained` | Auto-unsubscribe recipient |
| `email.opened` | Record open event |
| `email.clicked` | Record click event |

### Bounce Handling

The system automatically handles bounces:

- **Hard Bounces**: Invalid email addresses are marked as undeliverable
- **Soft Bounces**: After 3 soft bounces, the address is marked undeliverable
- **Complaints**: Recipients who mark as spam are auto-unsubscribed

## Guest Import

### Full-Page Import Wizard

Import guests at `/guests/import`:

#### Step 1: Upload File

- Drag and drop or click to upload
- Supports CSV and Excel files
- Maximum 100,000 rows per file

#### Step 2: Column Mapping

Map file columns to guest fields:
- First Name, Last Name, Email (required)
- Company, Job Title, Phone
- Custom fields

#### Step 3: Validation Preview

Review validation results:
- Valid rows ready for import
- Rows with errors (invalid email, missing required fields)
- Rows with warnings (duplicates, etc.)

#### Step 4: Import Options

Configure import behavior:
- **Duplicate Handling**: Skip, update, or create new
- **Event Assignment**: Optionally assign to an event

#### Step 5: Progress

Watch real-time import progress:
- Progress bar with percentage
- Estimated time remaining
- Success and error counts

After completion:
- Download error report for failed rows
- View imported guests

## A/B Testing

### Creating an A/B Test

1. In the campaign wizard, enable **A/B Testing**
2. Configure test settings:
   - **Test Type**: Subject, Sender, Content, or Send Time
   - **Variants**: Create 2-4 variants
   - **Test Audience**: 10-50% of recipients
   - **Winner Metric**: Open rate, click rate, or conversions
   - **Test Duration**: How long to run the test

### How It Works

1. Test variants are sent to the test audience
2. System tracks metrics for each variant
3. After the test period, the winner is selected
4. Winning variant is sent to remaining recipients

### Viewing Results

The campaign report shows:
- Metrics for each variant
- Statistical significance
- Winner selection rationale

## Troubleshooting

### Campaign Not Sending

1. Check campaign status (should be "Sending")
2. Verify SMTP configuration is active
3. Check rate limits haven't been exceeded
4. Review error logs in campaign report

### High Bounce Rate

1. Check bounce types in report
2. Clean your email list
3. Verify sender domain authentication (SPF, DKIM)
4. Review email content for spam triggers

### Webhooks Not Working

1. Verify webhook URL is accessible
2. Check webhook secret is correct
3. Review webhook logs in provider dashboard
4. Test with a sample event

### Import Failing

1. Check file format (CSV or Excel)
2. Verify required columns exist
3. Check for encoding issues (use UTF-8)
4. Review error report for specific issues

### Template Strings Not Replacing

1. Verify correct syntax: `{firstName}` not `{{firstName}}`
2. Check recipient data has the field populated
3. Preview email with sample data before sending

## Support

For additional help:
- Check the [README](../README.md) for technical documentation
- Review the [API Reference](../README.md#api-reference)
- Contact your system administrator
