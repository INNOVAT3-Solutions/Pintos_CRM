# Pintos CRM

The team CRM for Pinto's Pressure Washing. GoHighLevel (GHL) is the master database: everything created or edited here is written to the Pintos GHL sub-account, and GHL changes flow back in.

The visual design comes from the prototype in `../Pressure washer CRM system/Pintos CRM.dc.html`.

## Run it on your Mac

Double-click **`Start Pintos CRM.command`**, or:

```bash
npm install
npm run dev      # http://localhost:3100
```

On first visit you create the owner (admin) account. Admins add everyone else in **Settings → Staff logins**.

## Settings (`../.env`, linked as `.env.local`)

| Variable | What it is |
|---|---|
| `GHL_PRIVATE_TOKEN` | GHL Private Integration token for the Pintos sub-account. Server-only. |
| `GHL_LOCATION_ID` | The sub-account's Location ID. |
| `GOOGLE_MAPS_API_KEY` | Browser key for the Measure screen (restricted by website in Google Cloud). |
| `SESSION_SECRET` | Signs login sessions. Changing it signs everyone out. |
| `DATABASE_URL` | Postgres connection string. Leave empty locally (an embedded database in `.data/` is used); required on Vercel. |

**Settings → GoHighLevel connection** shows, live, which parts of GHL the token can reach and which permissions are missing.

## How it's built

- **Next.js 15 (App Router) + TypeScript + Tailwind 4.** Design tokens in `src/app/globals.css`.
- **GHL client:** `src/lib/ghl/client.ts`, server-only, retries on rate limits. Connection checks in `src/lib/ghl/status.ts`.
- **Database:** Drizzle ORM. Schema in `src/lib/db/schema.ts`; migrations in `drizzle/` run automatically at startup. After changing the schema: `npx drizzle-kit generate --name <change>`.
- **GHL sync:** `src/lib/sync` keeps a local mirror of contacts, deals, pipelines, custom fields and users. GHL is the master: every CRM write goes to GHL first and the record GHL returns is saved locally. Screens re-sync when the mirror is over a minute old. GHL's search lags a few seconds, so a sync never replaces a record with an older copy, and recently-written records are only removed once GHL confirms they're gone.
- **Edits send only what changed:** the customer form sends only fields the person edited (compared with what the form loaded), so it never overwrites something changed in GHL meanwhile.
- **Activity log:** GHL records every API change as "the integration", so the CRM logs which staff member made each change (shown on the customer profile).
- **Measure:** `src/lib/measure`. Areas are recomputed on the server from the outline (same spherical formulas as Google Maps) — never trusted from the browser. Outlines stay in the CRM's `measurements` table; numbers go to the customer's GHL Property record (`src/lib/ghl/properties.ts`), linked via the Contact ↔ Property association. Google Solar roof measuring runs in the browser with the restricted Maps key.
- **Estimates & plans:** `src/lib/estimates`. The price list (Settings → Services & prices) is the master — GHL's products hold placeholder prices. `pricing.ts` is shared by the builder, the customer page and the server; the server always recomputes. Plan bills are the yearly total split evenly across billing dates, billed as often as the most frequent service. The homeowner's page is `/e/<token>` (public, secret link). On acceptance the CRM writes an accepted GHL estimate, moves the deal to Accepted, fills the contact's plan fields, tags `customer:membership`, and creates the recurring bill as a **draft** (nothing is sent or charged until it's started).
- **Jobs & calendar:** `src/lib/jobs`, `src/lib/ghl/calendars.ts`. Accepting an estimate creates a job for the sold work and, with a plan, its first plan visit; completing a plan visit queues the next one from the plan's calendar. Scheduling books a GHL appointment (deal → Scheduled); completing marks it "showed" (deal → Completed) and sets the contact's Last Service Date. The Calendar screen reads appointments live from all GHL calendars. Inactive GHL calendars can't take bookings.
- **Texting:** `src/lib/ghl/conversations.ts` sends SMS/email through GHL and reads the contact's message history; templates in `src/lib/messages/templates.ts`. Do-Not-Disturb contacts can't be texted.
- **Financials:** `src/lib/financials`. Work completed = completed jobs (CRM); Collected = succeeded live GHL payments; Expenses are entered in the CRM; unpaid GHL invoices and plan revenue are listed. The chart has a table view with every value.
- **Login:** email + password (bcrypt), signed session cookie (`src/lib/auth`). Every page and API route requires sign-in (`src/middleware.ts`).

## Build phases

1. ✅ App foundation: login, layout, GHL connection, Settings
2. ✅ Customers + Pipeline (two-way with GHL contacts and the Customer Lifecycle pipeline)
3. ✅ Measure → GHL Properties object (per-surface areas) and the contact's Square Footage / Stories
4. ✅ Estimates + maintenance plans (custom per-service frequencies; customer page; GHL estimate, deal, plan fields, draft recurring bill)
5. ✅ Calendar, Jobs, Team (jobs in the CRM; their schedule is a real GHL appointment)
6. ✅ Texting (GHL Conversations), Financials (completed work, GHL payments/invoices, expenses), Dashboard
7. Deploy to Vercel and turn on GHL webhooks
