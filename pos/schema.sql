CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Keep POS data isolated from the existing Luvia public schema.
CREATE SCHEMA IF NOT EXISTS pos;
SET search_path TO pos, public;

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  country_code CHAR(2) NOT NULL DEFAULT 'CD',
  default_currency CHAR(3) NOT NULL DEFAULT 'USD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','manager','agent','accountant')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, email)
);
CREATE INDEX IF NOT EXISTS users_org_idx ON users(organization_id);

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  nationality CHAR(2),
  passport_number TEXT,
  passport_expiry DATE,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customers_org_created_idx ON customers(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS customers_org_email_idx ON customers(organization_id, email);

CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('airline','hotel','transport','visa','tour_operator','other')),
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS travel_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id),
  request_type TEXT NOT NULL CHECK (request_type IN ('flight','hotel','package','transfer','visa','other')),
  origin TEXT,
  destination TEXT,
  departure_date DATE,
  return_date DATE,
  adults INTEGER NOT NULL DEFAULT 1 CHECK (adults > 0),
  children INTEGER NOT NULL DEFAULT 0 CHECK (children >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','quoted','confirmed','cancelled','closed')),
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS travel_requests_org_idx ON travel_requests(organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  request_id UUID REFERENCES travel_requests(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  quote_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','rejected','expired','converted')),
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  valid_until DATE,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, quote_number)
);
CREATE TABLE IF NOT EXISTS quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  service_type TEXT NOT NULL DEFAULT 'other',
  supplier_id UUID REFERENCES suppliers(id),
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id),
  quote_id UUID REFERENCES quotes(id),
  order_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','in_progress','completed','cancelled','refunded')),
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance_due NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, order_number)
);
CREATE INDEX IF NOT EXISTS orders_org_idx ON orders(organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES suppliers(id),
  service_type TEXT NOT NULL CHECK (service_type IN ('flight','hotel','transfer','visa','tour','other')),
  provider TEXT NOT NULL DEFAULT 'manual',
  provider_reference TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','on_request','confirmed','ticketed','cancelled','failed')),
  start_date DATE,
  end_date DATE,
  traveler_name TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bookings_org_idx ON bookings(organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  currency CHAR(3) NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('cash','bank_transfer','mobile_money','card','other')),
  reference TEXT,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('pending','received','failed','refunded')),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_by UUID REFERENCES users(id),
  notes TEXT
);
CREATE INDEX IF NOT EXISTS payments_org_idx ON payments(organization_id, received_at DESC);

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id),
  invoice_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('draft','issued','paid','void')),
  currency CHAR(3) NOT NULL,
  total NUMERIC(14,2) NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_date DATE,
  UNIQUE (organization_id, invoice_number)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_org_created_idx ON audit_logs(organization_id, created_at DESC);

-- ============================================================
-- Increment 2 — core sales flow (idempotent, safe to re-run)
-- Order lines with supplier cost, margin per order, source channel,
-- link order lines to bookings, B2C ingestion idempotency.
-- ============================================================
ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS agency_fee NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cost_total NUMERIC(14,2) NOT NULL DEFAULT 0;
-- margin = subtotal + agency_fee - discount - cost_total (taxes are pass-through). NULL when supplier cost is unknown.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS margin NUMERIC(14,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'pos';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS external_ref TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES users(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS due_date DATE;
UPDATE orders SET agent_id = created_by WHERE agent_id IS NULL AND created_by IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS orders_external_ref_uq ON orders(organization_id, source, external_ref) WHERE external_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_agent_idx ON orders(organization_id, agent_id);

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  service_type TEXT NOT NULL DEFAULT 'other' CHECK (service_type IN ('flight','hotel','transfer','visa','tour','other')),
  description TEXT NOT NULL,
  supplier_id UUID REFERENCES suppliers(id),
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  provider TEXT NOT NULL DEFAULT 'manual',
  provider_offer_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items(order_id);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS order_item_id UUID REFERENCES order_items(id) ON DELETE SET NULL;

-- Numérotation lisible et séquentielle par agence : D-2026-00001, DV-2026-00001, F-2026-00001
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS order_seq INTEGER NOT NULL DEFAULT 0;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS quote_seq INTEGER NOT NULL DEFAULT 0;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS invoice_seq INTEGER NOT NULL DEFAULT 0;

-- LuviaPlace OS workspace profile fields (safe to re-run).
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_url TEXT;
