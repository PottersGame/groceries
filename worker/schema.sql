-- PantryPal SK — Cloudflare D1 Schema
--
-- Promotions table for storing sale items extracted from supermarket flyer PDFs.
-- Populated by a CRON-triggered Worker that uses Gemini vision AI.
--
-- MIGRATION NOTE: If upgrading from the previous schema (with columns store_ico,
-- product_name_normalized, start_date, end_date), you must drop and recreate the
-- table since the column layout has changed entirely:
--
--   DROP TABLE IF EXISTS promotions;
--
-- Then re-run this script. Only do this if you can discard existing data.
-- For production environments with data to preserve, create a new table, migrate
-- rows with transformed column values, then swap:
--
--   CREATE TABLE promotions_new (...);
--   INSERT INTO promotions_new (store, product_name, sale_price, category)
--     SELECT store_ico, product_name_normalized, sale_price, 'uncategorized'
--     FROM promotions;
--   DROP TABLE promotions;
--   ALTER TABLE promotions_new RENAME TO promotions;

DROP TABLE IF EXISTS promotions;

CREATE TABLE promotions (
    id          INTEGER   PRIMARY KEY,
    store       TEXT      NOT NULL,
    product_name TEXT     NOT NULL,
    sale_price  REAL      NOT NULL,
    category    TEXT      NOT NULL,
    scraped_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_promotions_store ON promotions (store);
CREATE INDEX IF NOT EXISTS idx_promotions_category ON promotions (category);
