-- ============================================================
-- DESHAN TEXTILE POS v4 — Supabase Database Schema
-- Run this entire script in your Supabase SQL Editor
-- Project: https://supabase.com → SQL Editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── STAFF ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('manager','cashier')),
  pin_hash   TEXT NOT NULL,
  active     BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── CATEGORIES ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name  TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#B8860B'
);

-- ── PRODUCTS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         TEXT NOT NULL,
  sku          TEXT UNIQUE,
  barcode      TEXT UNIQUE,
  price        NUMERIC(12,2) NOT NULL DEFAULT 0,
  cost_price   NUMERIC(12,2) DEFAULT 0,
  stock        NUMERIC(12,2) DEFAULT 0,
  min_stock    NUMERIC(12,2) DEFAULT 10,
  unit         TEXT DEFAULT 'per meter',
  emoji        TEXT DEFAULT '🧵',
  category_id  UUID REFERENCES categories(id) ON DELETE SET NULL,
  active       BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── CUSTOMERS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name           TEXT NOT NULL,
  phone          TEXT UNIQUE,
  email          TEXT,
  address        TEXT,
  loyalty_points INTEGER DEFAULT 0,
  total_spent    NUMERIC(15,2) DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── SUPPLIERS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suppliers (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL,
  phone      TEXT,
  email      TEXT,
  address    TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── BILLS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bills (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bill_number      TEXT UNIQUE NOT NULL,
  sale_type        TEXT DEFAULT 'retail' CHECK (sale_type IN ('retail','wholesale')),
  customer_id      UUID REFERENCES customers(id) ON DELETE SET NULL,
  cashier_id       UUID REFERENCES staff(id) ON DELETE SET NULL,
  cashier_name     TEXT,
  subtotal         NUMERIC(12,2) DEFAULT 0,
  discount_percent NUMERIC(5,2)  DEFAULT 0,
  discount_amount  NUMERIC(12,2) DEFAULT 0,
  tax_amount       NUMERIC(12,2) DEFAULT 0,
  total            NUMERIC(12,2) DEFAULT 0,
  payment_method   TEXT DEFAULT 'cash',
  status           TEXT DEFAULT 'completed',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── BILL ITEMS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bill_items (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bill_id      UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  product_id   UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  unit_price   NUMERIC(12,2) NOT NULL,
  quantity     NUMERIC(12,2) NOT NULL,
  total        NUMERIC(12,2) NOT NULL
);

-- ── RETURNS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS returns (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_number        TEXT UNIQUE NOT NULL,
  original_bill_number TEXT,
  sale_type            TEXT DEFAULT 'retail',
  reason               TEXT,
  refund_method        TEXT DEFAULT 'cash',
  total                NUMERIC(12,2) DEFAULT 0,
  processed_by         UUID REFERENCES staff(id) ON DELETE SET NULL,
  cashier_name         TEXT,
  date                 DATE DEFAULT CURRENT_DATE,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ── RETURN ITEMS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS return_items (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_id    UUID NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  product_id   UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  unit_price   NUMERIC(12,2) NOT NULL,
  quantity     NUMERIC(12,2) NOT NULL,
  total        NUMERIC(12,2) NOT NULL
);

-- ── EXPENSES ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category    TEXT NOT NULL,
  description TEXT,
  amount      NUMERIC(12,2) NOT NULL,
  date        DATE DEFAULT CURRENT_DATE,
  created_by  UUID REFERENCES staff(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── STOCK MOVEMENTS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_movements (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id    UUID REFERENCES products(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('sale','return','adjustment','purchase')),
  quantity      NUMERIC(12,2) NOT NULL,
  reference_id  UUID,
  created_by    UUID REFERENCES staff(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── INDEXES ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bills_created_at   ON bills(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bills_bill_number  ON bills(bill_number);
CREATE INDEX IF NOT EXISTS idx_bill_items_bill_id ON bill_items(bill_id);
CREATE INDEX IF NOT EXISTS idx_products_barcode   ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_sku       ON products(sku);
CREATE INDEX IF NOT EXISTS idx_customers_phone    ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_expenses_date      ON expenses(date DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);

-- ── ROW-LEVEL SECURITY (RLS) ─────────────────────────────────
-- Enable RLS on all tables (uses anon key — no auth required for local use)
ALTER TABLE staff            ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories       ENABLE ROW LEVEL SECURITY;
ALTER TABLE products         ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills            ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE returns          ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses         ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements  ENABLE ROW LEVEL SECURITY;

-- Allow full access from anon key (POS uses PIN auth, not Supabase auth)
CREATE POLICY "Allow all for anon" ON staff            FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON categories       FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON products         FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON customers        FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON suppliers        FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON bills            FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON bill_items       FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON returns          FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON return_items     FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON expenses         FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON stock_movements  FOR ALL TO anon USING (true) WITH CHECK (true);

-- ── SEED DEFAULT DATA ────────────────────────────────────────
INSERT INTO staff (name, role, pin_hash, active) VALUES
  ('Manager', 'manager', '1234', true),
  ('Cashier 1', 'cashier', '0000', true)
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, color) VALUES
  ('Fabrics', '#B8860B'),
  ('Accessories', '#5F9EA0'),
  ('Threads', '#8B4513'),
  ('Lace & Trim', '#9370DB'),
  ('Buttons & Zip', '#2E8B57')
ON CONFLICT DO NOTHING;

-- ── DONE ─────────────────────────────────────────────────────
-- Your Supabase database is ready!
-- Next: copy .env.example to .env and add your Supabase URL + anon key.
