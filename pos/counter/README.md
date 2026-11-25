# Luvia POS — Counter interface

The agency counter application is served at `/pos/counter/`. The existing customer-facing B2C storefront and the existing agency workspace are left in place.

## Included
- Self-service agency registration (organization + first owner), B2B agent sign-in and browser-only demo mode with fictional travelers, flights and hotels.
- Counter layout with flights and hotels search, customer selection/creation, a combined cart, editable selling prices, taxes, agency fee, discounts, quote creation, full payment or deposit.
- Payment methods: cash, mobile money, card and bank transfer.
- Receipt preview and browser printing.
- LiteAPI search adapters through `/api/pos/v1/integrations/liteapi/flights/search` and `/hotels/search`.
- Responsive design and keyboard shortcuts F1, F2, F4 and Ctrl/Cmd+K.

## Existing backend requirements
For live agency data configure PostgreSQL and POS environment variables as described in `../README.md`; run `pos/schema.sql` once on the Render PostgreSQL database, then configure `DATABASE_URL` and `POS_JWT_SECRET` on the Render web service. Open `/api/pos/v1/health` and confirm `schema: ready`. New agencies can then register from the counter login screen; the first owner is signed in automatically. LiteAPI credentials are only needed for live supplier searches. Configure LiteAPI credentials server-side.

## Explicit limitations
- Self-service registration currently creates an owner immediately without e-mail verification; add verified e-mail and stronger bot protection before opening registration to high-volume public traffic.
- Demo data and cash drawer are local-only and do not persist.
- Live supplier search is not a confirmed booking. Hotel/flight prebook, book, verify and cancellation flows must be implemented and tested against actual LiteAPI sandbox responses before production.
- USD is the base currency. EUR/CDF conversion is not displayed until a verified FX rate source or agency-configured rate is available.
- Global PNR/order search, printer hardware integration, e-mail/WhatsApp delivery and mixed tender are not yet connected.
- Checkout currently records one payment method per payment; split tender requires a dedicated multi-payment checkout workflow.
