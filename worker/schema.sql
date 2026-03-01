-- PantryPal SK — Cloudflare D1 Schema
--
-- Promotions table for storing sale items extracted from supermarket flyer PDFs.
-- Populated by a CRON-triggered Worker that uses Gemini vision AI.
--
-- The UNIQUE constraint on (store_ico, product_name_normalized, start_date)
-- enables idempotent UPSERT operations so re-running the ingestion pipeline
-- does not create duplicate rows.
--
-- MIGRATION NOTE: This schema replaces the previous layout (store, product_name,
-- sale_price, category). If upgrading an existing database you must either:
--   a) Drop and recreate (discards existing data):
--        DROP TABLE IF EXISTS promotions;
--      Then re-run this script.
--   b) Migrate data in-place (preserves data — adapt as needed):
--        CREATE TABLE promotions_new (...);
--        INSERT INTO promotions_new (store_ico, product_name_normalized, ...)
--          SELECT store, product_name, ... FROM promotions;
--        DROP TABLE promotions;
--        ALTER TABLE promotions_new RENAME TO promotions;

DROP TABLE IF EXISTS promotions;

CREATE TABLE promotions (
    id                      INTEGER   PRIMARY KEY,
    store_ico               TEXT      NOT NULL,
    product_name_normalized TEXT      NOT NULL,
    start_date              TEXT      NOT NULL,
    end_date                TEXT,
    sale_price              REAL      NOT NULL,
    category                TEXT      NOT NULL,
    scraped_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (store_ico, product_name_normalized, start_date)
);

CREATE INDEX IF NOT EXISTS idx_promotions_store_ico ON promotions (store_ico);
CREATE INDEX IF NOT EXISTS idx_promotions_category  ON promotions (category);
