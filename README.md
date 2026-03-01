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
    ekasa.ts         — eKasa receipt fetching & QR code UID extraction
    ingest.ts        — Receipt-to-observations conversion & backend send
    prices.ts        — Store listing, price queries, product search & promotions

backend/
  main.py            — FastAPI REST API with 13 endpoints
  models.py          — SQLAlchemy PostgreSQL schema
                       (stores, products, prices_crowdsourced, prices_flyer_promo)
  schemas.py         — Pydantic validation models for API requests/responses
  utils.py           — Product name normalization & utilities
  database.py        — Database connection & session management
  config.py          — Environment-based configuration
  tests/             — Comprehensive test suite (30 tests)
  docker-compose.yml — Complete dev environment with PostgreSQL
  README.md          — Full API documentation (600+ lines)

worker/
  schema.sql         — Cloudflare D1 schema for the Promotions table
  wrangler.toml      — CRON trigger & D1 binding configuration
  src/
    index.ts         — Cloudflare Worker: Gemini vision AI flyer ingestion pipeline
```

---

## Step 1 — Backend FastAPI Application

A production-ready REST API built with FastAPI and SQLAlchemy:

### Core Features
- **13 API endpoints** for price ingestion, promotions, queries, store management, and product search
- **Privacy-first design** — zero personal data collection
- **Promotions pipeline** — ingest and query flyer deals from the Cloudflare Worker
- **Slovak market support** — IČO validation, diacritic handling
- **PostgreSQL database** with 4 main tables (stores, products, prices_crowdsourced, prices_flyer_promo)
- **Comprehensive testing** — 48 tests with 100% pass rate
- **Docker support** — complete dev environment with docker-compose
- **Alembic migrations** — versioned database schema management
- **Extensive documentation** — 600+ lines in backend/README.md

### Quick Start
```bash
cd backend
docker-compose up -d
# API available at http://localhost:8000
# Docs at http://localhost:8000/docs
```

See [`backend/README.md`](backend/README.md) for full documentation.

### Database Schema (`backend/models.py`)

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
- Alembic migration in `backend/alembic/versions/` manages schema versioning.

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

## Step 4 — Cloudflare Worker: Flyer Ingestion (`worker/`)

A CRON-triggered Cloudflare Worker that automates the flyer PDF → sale data pipeline:

1. **Fetches** supermarket flyer PDFs from configured URLs
2. **Sends** each PDF to Google's **Gemini 2.0 Flash-Lite** vision model
3. **Extracts** structured JSON sale items via a strict system prompt
4. **Persists** results to a **Cloudflare D1** database
5. **Forwards** extracted promotions to the backend API for central availability

| File | Description |
|---|---|
| `schema.sql` | D1 `promotions` table with CHECK constraints and indexes |
| `wrangler.toml` | CRON schedule (`0 4 * * *`) and D1 binding |
| `src/index.ts` | Worker entry point: `scheduled()` handler + `extractSalesWithGemini()` |

### Setup

```bash
cd worker
npm install
wrangler d1 create pantrypal-sk-db          # create the D1 database
# Update wrangler.toml with the returned database_id
npm run d1:init                              # apply schema.sql
wrangler secret put GEMINI_API_KEY           # set your Google AI Studio key
wrangler secret put BACKEND_API_URL          # set your backend URL (e.g. https://api.pantrypal.sk)
wrangler deploy                              # deploy the worker
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile Frontend | React Native (Expo) + TypeScript |
| Local Mobile Storage | expo-sqlite |
| Mobile Scanner | react-native-vision-camera + Slovak eKasa API |
| Backend API | Python (FastAPI) |
| Backend DB | PostgreSQL via Supabase |
| Data Pipeline | Cloudflare Worker + Gemini 2.0 Flash-Lite vision AI |
| Edge Database | Cloudflare D1 (SQLite) |
