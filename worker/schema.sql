-- PantryPal SK — Cloudflare D1 Schema
--
-- Promotions table for storing sale items extracted from supermarket flyer PDFs.
-- Populated by a CRON-triggered Worker that uses Gemini vision AI.

CREATE TABLE IF NOT EXISTS promotions (
    id                       INTEGER PRIMARY KEY AUTOINCREMENT,
    store_ico                TEXT    NOT NULL,                       -- 8-digit Slovak IČO
    product_name_normalized  TEXT    NOT NULL,                       -- lower-case, diacritic-stripped
    sale_price               REAL    NOT NULL,                       -- promotional price in EUR
    start_date               TEXT    NOT NULL,                       -- ISO-8601 date (YYYY-MM-DD)
    end_date                 TEXT    NOT NULL,                       -- ISO-8601 date (YYYY-MM-DD)

    CONSTRAINT ck_promotions_ico        CHECK (length(store_ico) = 8),
    CONSTRAINT ck_promotions_price      CHECK (sale_price > 0),
    CONSTRAINT ck_promotions_date_range CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_promotions_store_ico ON promotions (store_ico);
CREATE INDEX IF NOT EXISTS idx_promotions_dates     ON promotions (start_date, end_date);
