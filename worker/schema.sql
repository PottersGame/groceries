-- PantryPal SK — Cloudflare D1 Schema
--
-- Promotions table for storing sale items extracted from supermarket flyer PDFs.
-- Populated by a CRON-triggered Worker that uses Gemini vision AI.

CREATE TABLE IF NOT EXISTS promotions (
    id          INTEGER   PRIMARY KEY,
    store       TEXT      NOT NULL,
    product_name TEXT     NOT NULL,
    sale_price  REAL      NOT NULL,
    category    TEXT      NOT NULL,
    scraped_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_promotions_store ON promotions (store);
CREATE INDEX IF NOT EXISTS idx_promotions_category ON promotions (category);
