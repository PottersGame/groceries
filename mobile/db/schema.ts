/**
 * PantryPal SK — Mobile expo-sqlite Schema
 *
 * Two local databases:
 *   - LocalPantry   : Items identified from scanned eKasa receipts
 *   - ShoppingList  : User-curated list of items to buy, with price hints
 *
 * Executed once on first launch (or after a schema version bump) using
 * expo-sqlite's `execAsync` / migration helpers.
 */

import * as SQLite from "expo-sqlite";

// ---------------------------------------------------------------------------
// Database version — bump when schema changes require a migration
// ---------------------------------------------------------------------------

export const SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// SQL statements
// ---------------------------------------------------------------------------

/**
 * LocalPantry table.
 *
 * Stores every distinct item the user has purchased, as parsed from their
 * eKasa receipt scans.  No receipt numbers or personal data are kept here.
 */
export const CREATE_LOCAL_PANTRY = `
  CREATE TABLE IF NOT EXISTS local_pantry (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Normalised name used for deduplication (lower-case, no diacritics)
    normalized_name   TEXT    NOT NULL,

    -- Human-readable name as it appeared on the receipt
    display_name      TEXT    NOT NULL,

    -- Broad category label assigned by the local classifier (e.g. "dairy")
    category          TEXT,

    -- Quantity currently in the pantry (user can adjust manually)
    quantity          REAL    NOT NULL DEFAULT 1,

    -- Unit of measure: "piece" | "kg" | "litre" | "gram" | "ml"
    unit              TEXT    NOT NULL DEFAULT 'piece',

    -- Last known purchase price in EUR (for personal reference only)
    last_price_eur    REAL,

    -- ISO-8601 date string of the most recent purchase (YYYY-MM-DD)
    last_purchased_on TEXT,

    -- IČO of the store where the item was last purchased
    last_store_ico    TEXT,

    -- ISO-8601 timestamp of the row's creation
    created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

    -- ISO-8601 timestamp of the last update
    updated_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

    CONSTRAINT uq_pantry_name UNIQUE (normalized_name),
    CONSTRAINT ck_pantry_quantity CHECK (quantity >= 0),
    CONSTRAINT ck_pantry_price   CHECK (last_price_eur IS NULL OR last_price_eur > 0)
  );
` as const;

/**
 * ShoppingList table.
 *
 * User-curated list of items to buy.  Each row may optionally reference a
 * pantry item and carry the best-known price hint fetched from the backend
 * for routing / cost estimation.
 */
export const CREATE_SHOPPING_LIST = `
  CREATE TABLE IF NOT EXISTS shopping_list (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Display label shown to the user
    item_name           TEXT    NOT NULL,

    -- Normalised name used to match against the backend price catalogue
    normalized_name     TEXT    NOT NULL,

    -- How many units the user wants to buy
    quantity            REAL    NOT NULL DEFAULT 1,

    -- Unit of measure: "piece" | "kg" | "litre" | "gram" | "ml"
    unit                TEXT    NOT NULL DEFAULT 'piece',

    -- Whether the item has been ticked off during a shopping trip
    is_checked          INTEGER NOT NULL DEFAULT 0,  -- 0 = false, 1 = true

    -- FK to local_pantry(id) — nullable; set when item originates from pantry
    pantry_item_id      INTEGER REFERENCES local_pantry (id) ON DELETE SET NULL,

    -- Best known price hint fetched from the backend (EUR), for cost estimate
    price_hint_eur      REAL,

    -- IČO of the store offering the best price hint
    price_hint_store_ico TEXT,

    -- ISO-8601 timestamp when the price hint was last refreshed from backend
    price_hint_fetched_at TEXT,

    -- ISO-8601 timestamp of row creation
    created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

    -- ISO-8601 timestamp of last update
    updated_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

    CONSTRAINT ck_shopping_quantity CHECK (quantity > 0),
    CONSTRAINT ck_shopping_checked  CHECK (is_checked IN (0, 1)),
    CONSTRAINT ck_shopping_price    CHECK (price_hint_eur IS NULL OR price_hint_eur > 0)
  );
` as const;

/**
 * Trigger: keep `local_pantry.updated_at` current on every UPDATE.
 * SQLite has no native `ON UPDATE` column option, so a trigger is required.
 */
export const TRIGGER_PANTRY_UPDATED_AT = `
  CREATE TRIGGER IF NOT EXISTS trg_pantry_updated_at
  AFTER UPDATE ON local_pantry
  FOR EACH ROW
  BEGIN
    UPDATE local_pantry
       SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id = NEW.id;
  END;
` as const;

/**
 * Trigger: keep `shopping_list.updated_at` current on every UPDATE.
 */
export const TRIGGER_SHOPPING_UPDATED_AT = `
  CREATE TRIGGER IF NOT EXISTS trg_shopping_updated_at
  AFTER UPDATE ON shopping_list
  FOR EACH ROW
  BEGIN
    UPDATE shopping_list
       SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id = NEW.id;
  END;
` as const;

/** Index: speed up pantry lookups by normalised name. */
export const IDX_PANTRY_NORMALIZED_NAME = `
  CREATE INDEX IF NOT EXISTS idx_pantry_normalized_name
    ON local_pantry (normalized_name);
` as const;

/** Index: speed up shopping list queries for unchecked items. */
export const IDX_SHOPPING_UNCHECKED = `
  CREATE INDEX IF NOT EXISTS idx_shopping_unchecked
    ON shopping_list (is_checked)
    WHERE is_checked = 0;
` as const;

/** Index: speed up shopping list lookup by normalised name for price matching. */
export const IDX_SHOPPING_NORMALIZED_NAME = `
  CREATE INDEX IF NOT EXISTS idx_shopping_normalized_name
    ON shopping_list (normalized_name);
` as const;

/** Schema version table — used by future migration logic. */
export const CREATE_SCHEMA_VERSION = `
  CREATE TABLE IF NOT EXISTS schema_version (
    version   INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
` as const;

// ---------------------------------------------------------------------------
// Initialisation helper
// ---------------------------------------------------------------------------

/**
 * Opens (or creates) the local SQLite database and applies the initial schema.
 *
 * Safe to call on every app start — all statements use `IF NOT EXISTS` guards.
 *
 * @param dbName - SQLite file name (default: `pantrypal.db`)
 * @returns The open {@link SQLite.SQLiteDatabase} instance.
 */
export async function initLocalDatabase(
  dbName = "pantrypal.db"
): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(dbName);

  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    ${CREATE_SCHEMA_VERSION}
    ${CREATE_LOCAL_PANTRY}
    ${CREATE_SHOPPING_LIST}
    ${TRIGGER_PANTRY_UPDATED_AT}
    ${TRIGGER_SHOPPING_UPDATED_AT}
    ${IDX_PANTRY_NORMALIZED_NAME}
    ${IDX_SHOPPING_UNCHECKED}
    ${IDX_SHOPPING_NORMALIZED_NAME}

    INSERT OR IGNORE INTO schema_version (version) VALUES (${SCHEMA_VERSION});
  `);

  return db;
}
