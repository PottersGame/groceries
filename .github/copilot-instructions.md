# PantryPal SK — Copilot Instructions

## Project Overview

**PantryPal SK** is a grocery inventory and price comparison app for the Slovak market. It combines on-device eKasa receipt scanning with anonymous crowdsourced price data.

The monorepo has three components:

| Directory | Description |
|---|---|
| `backend/` | Python FastAPI REST API backed by PostgreSQL |
| `mobile/` | React Native (Expo) mobile app with local SQLite storage |
| `worker/` | Cloudflare Worker for automated flyer PDF ingestion via Gemini AI |

---

## Architecture

- **Privacy-first**: zero personal data is ever stored — no user IDs, device IDs, or receipt numbers.
- **Slovak market specifics**: IČO (8-digit tax number) identifies stores; product names are normalised by stripping diacritics and lowercasing.
- **Anonymous ingestion**: price observations contain only `(ico, normalizedName, price_eur, date)`.

---

## Backend (`backend/`)

**Stack**: Python · FastAPI 0.115 · SQLAlchemy 2.0 · PostgreSQL · Pydantic 2 · Alembic · pytest

### Key files

| File | Purpose |
|---|---|
| `main.py` | FastAPI app and all 11 API endpoints |
| `models.py` | SQLAlchemy ORM: `stores`, `products`, `prices_crowdsourced`, `prices_flyer_promo` |
| `schemas.py` | Pydantic request/response models |
| `utils.py` | `normalize_product_name()`, `lookup_chain_name()` |
| `database.py` | Engine, session factory, `get_db()` dependency |
| `config.py` | `Settings` loaded from environment variables |

### Setup & running

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env          # set DATABASE_URL, DEBUG, CORS_ORIGINS
alembic upgrade head          # apply migrations
uvicorn backend.main:app --reload
# API at http://localhost:8000, docs at http://localhost:8000/docs
```

Docker alternative:

```bash
cd backend
docker-compose up -d
```

### Testing

```bash
cd backend
python -m pytest tests/ -v --cov=backend --cov-report=term-missing
# or use the helper script:
./run-tests.sh
```

Tests live in `backend/tests/`. Use `pytest` with `httpx` test client (see `conftest.py`). All new endpoints must have corresponding tests in `test_api.py`.

### Code conventions

- Follow PEP 8; use type hints on all function signatures.
- Pydantic models in `schemas.py`, SQLAlchemy models in `models.py` — keep them separate.
- IČO must always be validated as exactly 8 digits.
- Use `normalize_product_name()` from `utils.py` before storing or comparing product names.
- Never store any user-identifying information.

---

## Mobile (`mobile/`)

**Stack**: React Native · Expo ~52 · TypeScript · expo-sqlite · expo-router

### Key files

| File | Purpose |
|---|---|
| `db/schema.ts` | `initLocalDatabase()` — creates `local_pantry` and `shopping_list` tables |
| `api/types.ts` | TypeScript API contract for the anonymous ingestion endpoint |
| `app/` | Expo Router screens |
| `constants/` | Shared constants |
| `hooks/` | Custom React hooks |

### Setup & running

```bash
cd mobile
npm install
npx expo start          # starts Expo dev server
```

### Testing

```bash
cd mobile
npm test                # runs Node test runner against api/*.test.ts
```

### Code conventions

- All API interactions must go through the types in `api/types.ts`.
- Use `validatePriceObservation()` / `validateIngestionPayload()` before sending data.
- Local data (pantry, shopping list) stays in SQLite on-device and is never sent to the backend.
- All timestamps stored as ISO-8601 strings (SQLite has no native TIMESTAMP type).
- Enable `PRAGMA foreign_keys = ON` and `PRAGMA journal_mode = WAL` on every database open.

---

## Worker (`worker/`)

**Stack**: TypeScript · Cloudflare Workers · Wrangler · Cloudflare D1 (SQLite) · Google Gemini AI

### Key files

| File | Purpose |
|---|---|
| `src/index.ts` | `scheduled()` handler + `extractSalesWithGemini()` |
| `schema.sql` | Cloudflare D1 `promotions` table schema |
| `wrangler.toml` | CRON schedule (`0 4 * * *`) and D1 binding |

### Setup & deploying

```bash
cd worker
npm install
wrangler d1 create pantrypal-sk-db      # create D1 database
# Update wrangler.toml with returned database_id
npm run d1:init                          # apply schema.sql
wrangler secret put GEMINI_API_KEY       # set Google AI Studio key
wrangler deploy
```

Local dev:

```bash
cd worker
npm run dev
```

### Type checking

```bash
cd worker
npm run typecheck
```

### Code conventions

- The `scheduled()` handler is the only entry point; do not add an HTTP `fetch` handler unless intentional.
- `source_pdf_hash` (SHA-256 of the PDF) makes the ingestion pipeline idempotent — always check before inserting.
- Keep Gemini prompts in `extractSalesWithGemini()` focused and structured to return valid JSON.

---

## Cross-cutting concerns

- **No secrets in code**: use environment variables / Wrangler secrets for all credentials.
- **Slovak locale**: product names must be normalised (lowercase, diacritics stripped) before storage or comparison. Use the backend `normalize_product_name()` utility as the reference implementation.
- **Privacy**: the system is designed to collect zero PII. Any change that could introduce personal data collection must be explicitly rejected.
