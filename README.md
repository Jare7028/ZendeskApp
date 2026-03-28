# Zendesk App Foundation

M1 sets up the production foundation for a Next.js dashboard backed by Supabase auth and row-level security. The repository now contains:

- Next.js App Router scaffold with TypeScript, Tailwind, ESLint config, and a protected signed-in shell
- Supabase browser/server/middleware helpers for session-aware auth flows
- Email/password login, signup, forgot-password, reset-password, and auth callback handling
- RBAC utilities and route guards for `admin`, `manager`, and `viewer`
- A baseline Supabase migration covering users, role assignments, client scoping, connections, and operational data tables
- Zendesk sync orchestration with durable run history, resumable backfill state, and admin-visible status

## Environment

Create `.env.local` with the existing external keys:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
CRON_SECRET=...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
ZENDESK_OAUTH_CLIENT_ID=...
ZENDESK_OAUTH_CLIENT_SECRET=...
ZENDESK_OAUTH_SCOPES=read write
```

No secrets are committed. The app only references environment variable names.

## Local setup

```bash
npm install
npm run typecheck
npm run build
```

Run the app locally with `npm run dev`.

## Zendesk sync

- The sync engine reads existing `app.zendesk_connections` rows and expects server-usable credentials:
  - `credential_type = 'api_token'` with `api_user_email` and `access_token_encrypted` populated
  - or `credential_type = 'oauth_token'` with `access_token_encrypted` populated
- OAuth tokens are currently stored in the existing `*_encrypted` columns as application-managed secrets. This milestone keeps the storage explicit but does not add in-app encryption; database and environment handling must therefore be treated as trusted infrastructure.
- Cron ingestion lives at `/api/cron/zendesk-sync` and requires `Authorization: Bearer $CRON_SECRET` or `?secret=$CRON_SECRET`.
- Manual admin-triggered runs post to `/api/admin/zendesk-sync`.
- Durable sync state is stored in `app.zendesk_sync_runs`, `app.zendesk_backfills`, and the watermark/status columns on `app.zendesk_connections`.
- Ticket payloads are stored in `app.tickets.raw_payload`, channel type is stored in `app.tickets.channel`, and agent records land in `app.zendesk_agents`.
- Cron runs process up to three active connections per invocation and backfills advance in small cursor chunks so long histories can resume safely.
- The `/dashboard` page now recomputes the selected date window server-side into `app.computed_metrics`, then reads daily rollups for cards and charts instead of recomputing analytics inside React components.
- Daily computed metric rows use JSON dimensions for `client`, `agent`, `channel`, and `agent_channel` scopes so the dashboard can filter against persisted rollups.
- `requester_wait_time_minutes` is sourced from Zendesk ticket metric payload field `requester_wait_time_in_minutes.calendar` when that durable value is present.
- Agent utilisation is currently defined as scheduled hours on days with ticket activity divided by total scheduled hours, because the synced model does not yet persist a durable handle-time field suitable for active-work utilisation.
- OAuth connection management lives on `/connections` for admins:
  - choose the app client, optional connection label, and Zendesk subdomain
  - start the Zendesk OAuth flow against `https://{subdomain}.zendesk.com`
  - callback returns to `/auth/callback/zendesk`, exchanges the code, validates `/api/v2/users/me`, and stores tokens plus expiry and validation metadata
  - admins can test, re-authorize, and disconnect existing connections
- OAuth refresh is handled server-side before sync and test requests. If Zendesk omits `expires_in`, the app refreshes when using a stored refresh token so later sync jobs still receive a current bearer token.

## Connecteam connections

- Admin connection management also lives on `/connections` for Connecteam:
  - choose the app client, optional connection label, and paste a Connecteam API key
  - the API key is stored server-side in `app.connecteam_connections.access_token_encrypted`, matching the existing explicit secret-storage pattern already used for connection credentials in this app
  - save/test calls Connecteam `GET /me`, persists durable validation status fields on `app.connecteam_connections`, and stores basic account metadata in `metadata`
  - admins can re-test and disconnect existing Connecteam connections without exposing the API key to the browser
- Server-only Connecteam helpers live in `lib/connecteam/*` and provide:
  - `GET /me`
  - `GET /users/v1/users`
  - `GET /scheduler/v1/schedulers`
  - `GET /scheduler/v1/schedulers/{id}/shifts`
- The Connecteam client uses `X-API-KEY` authentication, supports offset/limit pagination where available, and backs off on `429` or transient `5xx` responses via `Retry-After` when present.
- Connecteam workforce sync uses Scheduler shifts, not Time Clock clock-in data.

## Connecteam scheduled-shift sync

- Admin-triggered Connecteam sync lives on `/admin` and a cron endpoint now exists at `/api/cron/connecteam-sync`.
- The sync engine:
  - loads all Connecteam users for the connection
  - loads all schedulers, then fetches scheduler shifts
  - persists raw user rows in `app.connecteam_users`
  - persists per-user shift assignments in `app.connecteam_shifts`
  - derives per-user scheduled minutes per local work day in `app.connecteam_daily_schedules`
  - mirrors the daily scheduled result into `app.timesheet_data` with `payload.source = 'scheduled_shift'` so later metrics can query scheduled hours without calling Connecteam again
- Incremental sync is driven by durable connection state on `app.connecteam_connections`, including sync status, run timestamps, `users_synced_at`, and `shifts_synced_through`.
- Durable run history is stored in `app.connecteam_sync_runs`.
- Agent identity matching also lives on `/admin`:
  - Zendesk agents are matched to Connecteam users by normalized email within the same client and Connecteam connection
  - auto-matches are stored in `app.agent_mappings`
  - manual overrides are stored in the same table with `match_source = 'manual'` and `manual_override = true`
  - later auto-syncs do not overwrite manual overrides
- Scheduled hours are derived strictly from Scheduler shift `startDate`/`endDate`. Time Clock or punch data is not used anywhere in this milestone.

## Auth flow

- Unauthenticated users are redirected from `/dashboard`, `/connections`, and `/admin` to `/login`.
- Auth pages redirect back to `/dashboard` when a valid session already exists.
- Signup creates the Supabase auth user and the database trigger provisions:
  - `app.users` profile row
  - default `viewer` role assignment
- Password reset emails send users through `/auth/callback`, which exchanges the recovery code for a session and forwards to `/reset-password`.
- The `/admin` page is server-guarded and only available to users whose highest role resolves to `admin`.

## RBAC and RLS summary

The primary migration is [supabase/migrations/20260328153000_init_auth_rbac.sql](/Users/jared/apps/zendesk-app/supabase/migrations/20260328153000_init_auth_rbac.sql).

Core tables:

- `app.users`
- `app.roles`
- `app.user_role_assignments`
- `app.clients`
- `app.viewer_client_assignments`
- `app.zendesk_connections`
- `app.connecteam_connections`
- `app.agent_mappings`
- `app.connecteam_users`
- `app.connecteam_sync_runs`
- `app.connecteam_shifts`
- `app.connecteam_daily_schedules`
- `app.tickets`
- `app.ticket_metrics`
- `app.timesheet_data`
- `app.computed_metrics`

Policy model:

- `admin`: full read/write access across all tables
- `manager`: read access across operational data for all clients
- `viewer`: read access only for clients listed in `app.viewer_client_assignments`

Operational data tables are client-scoped so later milestones can support multiple connections per client and viewer-to-client restrictions.

## First admin bootstrap

The safest bootstrap path is:

1. Sign up through the app or Supabase Auth UI.
2. In the Supabase SQL editor, find the new user ID:

```sql
select id, email from auth.users order by created_at desc;
```

3. Run the one-time bootstrap function:

```sql
select app.bootstrap_first_admin('00000000-0000-0000-0000-000000000000'::uuid);
```

The function fails once any admin assignment already exists, which prevents accidental reuse.

## Project structure

- [app](/Users/jared/apps/zendesk-app/app): routes, auth pages, protected shell
- [components](/Users/jared/apps/zendesk-app/components): shell and UI primitives
- [lib](/Users/jared/apps/zendesk-app/lib): Supabase helpers, auth utilities, config
- [middleware.ts](/Users/jared/apps/zendesk-app/middleware.ts): session refresh and route protection
- [supabase](/Users/jared/apps/zendesk-app/supabase): SQL migrations and schema foundation
