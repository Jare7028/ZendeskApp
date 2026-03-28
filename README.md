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
- Cron ingestion lives at `/api/cron/zendesk-sync` and requires `Authorization: Bearer $CRON_SECRET` or `?secret=$CRON_SECRET`.
- Manual admin-triggered runs post to `/api/admin/zendesk-sync`.
- Durable sync state is stored in `app.zendesk_sync_runs`, `app.zendesk_backfills`, and the watermark/status columns on `app.zendesk_connections`.
- Ticket payloads are stored in `app.tickets.raw_payload`, channel type is stored in `app.tickets.channel`, and agent records land in `app.zendesk_agents`.
- Cron runs process up to three active connections per invocation and backfills advance in small cursor chunks so long histories can resume safely.

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
