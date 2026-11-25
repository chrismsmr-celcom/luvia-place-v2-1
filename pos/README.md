# Luvia POS — v1 foundation

B2B travel-agency operations workspace, mounted at `/pos` and `/api/pos/v1`.

## Requirements
- Node.js 18+
- PostgreSQL 14+
- Existing LiteAPI credentials (server-side only)

## First launch (Render + Supabase)

The application can run on Render while using Supabase PostgreSQL. Configure these environment variables on the Render web service:
- `DATABASE_URL`: the Supabase PostgreSQL connection string. Keep it server-side; use the direct connection or a supported session pooler URL.
- `POS_JWT_SECRET`: a randomly generated secret of at least 32 characters. Keep it private.
- `POS_TOKEN_TTL`: optional, defaults to `12h`.
- `SAND_API_KEY` and `PROD_API_KEY`: optional until live LiteAPI searches are needed.

In Supabase, open **SQL Editor** and execute `pos/schema.sql`. It creates a dedicated `pos` schema and keeps existing Luvia tables in `public` untouched. The POS connection sets PostgreSQL `search_path` to `pos,public`, so its unqualified queries resolve to the POS tables. Then redeploy/restart the Render web service. Check `/api/pos/v1/health`; it should return `database: connected`, `schema: ready`, and `schemaName: pos`.

The POS counter now has a self-service **Create my agency** flow. It creates one organization and its first owner, then signs that owner in. The public registration endpoint is rate-limited per application instance. Do not expose `POS_JWT_SECRET` or database credentials in frontend code. The legacy protected bootstrap endpoint remains available for controlled provisioning.

## Environment
```env
DATABASE_URL=postgresql://...
POS_JWT_SECRET=replace-with-at-least-32-random-bytes
POS_BOOTSTRAP_SECRET=one-time-long-random-secret
POS_TOKEN_TTL=12h
POS_DEFAULT_CURRENCY=USD
LITEAPI_ENV=sandbox
SAND_API_KEY=...
PROD_API_KEY=...
```

Set `LITEAPI_ENV=production` only after LiteAPI production access has been approved. Flight search also requires the flights product to be enabled for the selected LiteAPI key.

## Database
Run the contents of `pos/schema.sql` in Supabase SQL Editor (or `psql "$DATABASE_URL" -f pos/schema.sql`). The script creates tables inside the dedicated `pos` schema. It does not alter or replace existing tables in `public`. It is safe to re-run.

## First organization
`POST /api/pos/v1/auth/bootstrap` creates the first organization and owner. It requires the `x-bootstrap-secret` header matching `POS_BOOTSTRAP_SECRET`. Disable or rotate that secret after initial provisioning.

## API
- `POST /auth/bootstrap`, `POST /auth/login`, `GET /auth/me`
- `GET/POST /customers`, `GET/PATCH /customers/:id`
- `GET/POST /suppliers`
- `GET/POST /travel-requests`
- `GET/POST /quotes`, `POST /quotes/:id/accept`
- `GET/POST /orders`, `GET /orders/:id`
- `POST /orders/:id/payments`
- `POST /orders/:id/bookings`, `PATCH /bookings/:id`
- `GET /dashboard/summary`
- `POST /integrations/liteapi/hotels/search`
- `POST /integrations/liteapi/flights/search`

All business records are scoped to the authenticated organization. Passwords are hashed with bcrypt. JWT signing secret is mandatory. Never send LiteAPI keys to the browser.

## Current boundary
This first increment provides the agency operating system and supplier search. Search results are not bookings. A hotel/flight is only considered externally confirmed after the provider booking workflow returns a confirmation reference. Provider prebook/book/cancel flows, card processing, accounting exports, staff invitations, and Duffel are subsequent increments.
