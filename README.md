# PantryPal SK

Grocery inventory and price comparison app tailored for the Slovak market.

## Architecture Overview

The app combines **local privacy** (eKasa receipt scanning on-device) with
**crowdsourced price data** uploaded anonymously to a central backend.

```
mobile/
  db/
    schema.ts        — expo-sqlite schema for LocalPantry & ShoppingList
  api/
    types.ts         — TypeScript API contract for the Anonymous Ingestion endpoint

backend/
  models.py          — SQLAlchemy PostgreSQL schema
                       (stores, products, prices_crowdsourced, prices_flyer_promo)
```

---

## Step 1 — Backend PostgreSQL Schema (`backend/models.py`)

Four SQLAlchemy ORM models backed by PostgreSQL (Supabase):

| Table | Description |
|---|---|
| `stores` | Slovak retailers identified by their 8-digit **IČO** tax number |
| `products` | Normalised product catalogue shared across all price sources |
| `prices_crowdsourced` | Anonymous price observations uploaded from eKasa receipt scans |
| `prices_flyer_promo` | Promotional prices extracted from weekly PDF flyers (Lidl, Kaufland, …) |

Key design decisions:
- `stores.ico` uses a `CHECK` constraint to enforce the 8-digit IČO format at the DB level.
- `prices_crowdsourced` stores only `(store_id, product_id, price_eur, observed_on)` — **no user ID, device ID, or receipt number** is ever persisted.
- `prices_flyer_promo` records `source_pdf_hash` (SHA-256) to make the PDF parser pipeline idempotent.

---

## Step 2 — Mobile SQLite Schema (`mobile/db/schema.ts`)

Two expo-sqlite tables initialised by `initLocalDatabase()`:

| Table | Description |
|---|---|
| `local_pantry` | Items identified from scanned eKasa receipts; persisted on-device only |
| `shopping_list` | User-curated buy list with optional price hints fetched from the backend |

Schema features:
- `PRAGMA foreign_keys = ON` and `PRAGMA journal_mode = WAL` applied on every open.
- `schema_version` table for future migration support.
- All timestamps stored as ISO-8601 strings (SQLite has no native `TIMESTAMP` type).
- `CHECK` constraints enforce positive quantities and prices.

---

## Step 3 — API Contract (`mobile/api/types.ts`)

TypeScript interfaces for `POST /api/v1/prices/ingest`:

```ts
// One anonymised line-item from an eKasa receipt
interface PriceObservation {
  ico: string;            // 8-digit IČO of the store
  normalizedName: string; // lower-case, diacritic-stripped product name
  price: number;          // price paid in EUR (> 0)
  date: string;           // YYYY-MM-DD purchase date
}

// Request body — one or more observations batched together
interface IngestionPayload {
  observations: PriceObservation[];
}
```

The file also exports:
- `IngestionSuccessResponse` / `IngestionErrorResponse` — response shapes.
- `validatePriceObservation()` — client-side field validation with human-readable error messages.
- `validateIngestionPayload()` — validates a full batch payload before sending.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile Frontend | React Native (Expo) + TypeScript |
| Local Mobile Storage | expo-sqlite |
| Mobile Scanner | react-native-vision-camera + Slovak eKasa API |
| Backend API | Python (FastAPI) |
| Backend DB | PostgreSQL via Supabase |
| Data Pipeline | Python + LLM (Gemini / GPT-4o) for PDF flyer parsing |
