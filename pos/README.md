# Luvia POS — v1 foundation

B2B travel-agency operations workspace, mounted at `/pos` and `/api/pos/v1`.

## Requirements
- Node.js 18+
- PostgreSQL 14+
- Existing LiteAPI credentials (server-side only)

## First launch on Render

Configure these environment variables on the Render web service:
- `DATABASE_URL`: the **Internal Database URL** of the Render PostgreSQL database (same region/project where possible).
- `POS_JWT_SECRET`: a randomly generated secret of at least 32 characters. Keep it private.
- `POS_TOKEN_TTL`: optional, defaults to `12h`.
- `SAND_API_KEY` and `PROD_API_KEY`: optional until live LiteAPI searches are needed.

After creating the PostgreSQL database, execute `pos/schema.sql` once against it (Render PostgreSQL → Connect → psql, or an authenticated SQL client). Then redeploy/restart the web service. Check `/api/pos/v1/health`; it should return `database: connected` and `schema: ready`.

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
Run `psql "$DATABASE_URL" -f pos/schema.sql` once. The schema is additive and safe to re-run.

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
