# Luvia POS — v1 foundation

B2B travel-agency operations workspace, mounted at `/pos` and `/api/pos/v1`.

## Requirements
- Node.js 18+
- PostgreSQL 14+
- Existing LiteAPI credentials (server-side only)

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
