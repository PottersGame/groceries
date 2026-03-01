# PantryPal SK — Backend API

FastAPI backend for the PantryPal SK grocery price tracking and comparison app.

## Features

- **Anonymous Price Ingestion** — Accept price observations from eKasa receipt scans with zero personal data collection
- **Price Query API** — Search and filter crowdsourced prices by product, store, and date range
- **Store Management** — Track Slovak retailers by their 8-digit IČO tax number
- **Product Catalog** — Normalized product names for cross-source matching
- **Health Monitoring** — Built-in health check and statistics endpoints
- **Database Migrations** — Alembic-powered schema versioning
- **Docker Support** — Complete containerized development environment

## Tech Stack

- **FastAPI** 0.115+ — Modern async web framework
- **SQLAlchemy** 2.0+ — ORM with type hints
- **PostgreSQL** — Primary database (Supabase-compatible)
- **Pydantic** 2.0+ — Data validation and settings management
- **Alembic** — Database migration tool
- **Uvicorn** — ASGI server
- **Docker** + Docker Compose — Containerization

## Quick Start

### 1. Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Configure Environment

Copy the example environment file and update with your database credentials:

```bash
cp .env.example .env
```

Edit `.env`:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/pantrypal_sk
DEBUG=true
CORS_ORIGINS=*
```

### 3. Initialize Database

Create the database tables:

```bash
# Using Alembic (recommended for production)
alembic upgrade head

# Or using SQLAlchemy directly (for development)
python -c "from backend.database import init_db; init_db()"
```

### 4. Run the Server

```bash
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at:
- **API Docs (Swagger)**: http://localhost:8000/docs
- **API Docs (ReDoc)**: http://localhost:8000/redoc
- **Health Check**: http://localhost:8000/health

## Docker Quick Start

Run the entire stack (PostgreSQL + Backend) with Docker Compose:

```bash
cd backend
docker-compose up -d
```

This will:
1. Start a PostgreSQL 16 container on port 5432
2. Start the FastAPI backend on port 8000
3. Automatically create the database schema

Access the API at http://localhost:8000

## API Endpoints

### System Endpoints

#### `GET /health`

Health check endpoint — returns application status and database connectivity.

**Response:**
```json
{
  "status": "healthy",
  "app_name": "PantryPal SK Backend",
  "app_version": "1.0.0",
  "database_connected": true
}
```

#### `GET /api/v1/stats`

Get database statistics.

**Response:**
```json
{
  "status": "ok",
  "statistics": {
    "stores": 42,
    "products": 1523,
    "price_observations": 8945
  }
}
```

### Price Endpoints

#### `POST /api/v1/prices/ingest`

Anonymous price ingestion endpoint. Accepts batched price observations from eKasa receipt scans.

**Request Body:**
```json
{
  "observations": [
    {
      "ico": "35532773",
      "normalizedName": "zlaty bazant 0.5l",
      "price": 0.89,
      "date": "2024-06-10"
    },
    {
      "ico": "35532773",
      "normalizedName": "rye bread 500g",
      "price": 1.19,
      "date": "2024-06-10"
    }
  ]
}
```

**Response (201 Created):**
```json
{
  "status": "ok",
  "accepted": 2,
  "rejected": 0,
  "errors": null
}
```

**Privacy Guarantee:** No user ID, device ID, receipt number, or any personal identifier is ever stored.

#### `GET /api/v1/prices`

Query crowdsourced prices with optional filters.

**Query Parameters:**
- `product_name` (optional) — Search by normalized product name (partial match)
- `ico` (optional) — Filter by store IČO
- `date_from` (optional) — Filter prices observed on or after this date (YYYY-MM-DD)
- `date_to` (optional) — Filter prices observed on or before this date (YYYY-MM-DD)
- `limit` (optional, default: 100) — Maximum number of results (1-1000)

**Example:**
```bash
GET /api/v1/prices?product_name=milk&ico=35532773&limit=50
```

**Response:**
```json
{
  "status": "ok",
  "count": 3,
  "results": [
    {
      "product_id": 42,
      "product_name": "milk fresh 1l",
      "store_ico": "35532773",
      "store_chain": "Lidl",
      "price_eur": "0.79",
      "observed_on": "2024-06-10",
      "ingested_at": "2024-06-10T14:23:45+00:00"
    }
  ]
}
```

### Store Endpoints

#### `GET /api/v1/stores`

List all registered stores.

**Query Parameters:**
- `limit` (optional, default: 100) — Maximum number of results

**Response:**
```json
{
  "status": "ok",
  "count": 2,
  "stores": [
    {
      "id": 1,
      "ico": "35532773",
      "chain_name": "Lidl",
      "branch_label": null,
      "flyer_enabled": true,
      "created_at": "2024-06-01T10:00:00+00:00"
    }
  ]
}
```

#### `GET /api/v1/stores/{ico}`

Get details for a specific store by IČO.

**Response:**
```json
{
  "status": "ok",
  "store": {
    "id": 1,
    "ico": "35532773",
    "chain_name": "Lidl",
    "branch_label": null,
    "flyer_enabled": true,
    "created_at": "2024-06-01T10:00:00+00:00",
    "price_observation_count": 1234
  }
}
```

### Product Endpoints

#### `GET /api/v1/products/search`

Search for products by name.

**Query Parameters:**
- `q` (required) — Search query (minimum 2 characters)
- `limit` (optional, default: 50) — Maximum number of results

**Example:**
```bash
GET /api/v1/products/search?q=milk&limit=10
```

**Response:**
```json
{
  "status": "ok",
  "query": "milk",
  "normalized_query": "milk",
  "count": 2,
  "products": [
    {
      "id": 42,
      "normalized_name": "milk fresh 1l",
      "display_name": "Milk Fresh 1L",
      "category": "dairy",
      "unit": "litre",
      "barcode": null
    }
  ]
}
```

## Database Schema

The backend uses four main tables:

### `stores`
Slovak retailers identified by their 8-digit IČO tax number.

| Column | Type | Description |
|--------|------|-------------|
| `id` | BigInteger | Primary key |
| `ico` | String(8) | Slovak company registration number (unique) |
| `chain_name` | String(100) | Human-readable chain name (e.g., "Lidl") |
| `branch_label` | String(200) | Optional branch/city disambiguator |
| `flyer_enabled` | Boolean | Whether flyer PDF parsing is enabled |
| `created_at` | DateTime | Creation timestamp |

### `products`
Normalized product catalog shared across all price sources.

| Column | Type | Description |
|--------|------|-------------|
| `id` | BigInteger | Primary key |
| `normalized_name` | String(500) | Normalized name for deduplication (unique) |
| `display_name` | String(500) | Human-readable display name |
| `category` | String(100) | Broad category (e.g., "dairy", "beverages") |
| `unit` | Enum | Unit of measure (piece, kg, litre, gram, ml) |
| `barcode` | String(20) | Optional EAN-8/EAN-13 barcode |
| `created_at` | DateTime | Creation timestamp |
| `updated_at` | DateTime | Last update timestamp |

### `prices_crowdsourced`
Anonymous price observations from eKasa receipt scans.

| Column | Type | Description |
|--------|------|-------------|
| `id` | BigInteger | Primary key |
| `store_id` | BigInteger | Foreign key to stores |
| `product_id` | BigInteger | Foreign key to products |
| `price_eur` | Numeric(10,2) | Price in EUR |
| `observed_on` | Date | Purchase date (no time for privacy) |
| `ingested_at` | DateTime | Server ingestion timestamp |

**Privacy:** No user ID, device ID, or receipt number is stored.

### `prices_flyer_promo`
Promotional prices extracted from weekly PDF flyers.

| Column | Type | Description |
|--------|------|-------------|
| `id` | BigInteger | Primary key |
| `store_id` | BigInteger | Foreign key to stores |
| `product_id` | BigInteger | Foreign key to products |
| `promo_price_eur` | Numeric(10,2) | Promotional price |
| `regular_price_eur` | Numeric(10,2) | Regular price (nullable) |
| `valid_from` | Date | Promotion start date |
| `valid_to` | Date | Promotion end date |
| `source_pdf_url` | Text | Source PDF URL (nullable) |
| `source_pdf_hash` | String(64) | SHA-256 hash for idempotency |
| `created_at` | DateTime | Creation timestamp |

## Product Name Normalization

The backend automatically normalizes product names for deduplication and matching:

1. **Lowercase** — "MILK" → "milk"
2. **Strip diacritics** — "Zlatý Bažant" → "Zlaty Bazant"
3. **Remove special chars** — "Milk (3.5%)" → "Milk 3 5"
4. **Collapse whitespace** — "Whole   Milk" → "Whole Milk"

This ensures "Zlatý Bažant 0.5L" and "zlaty bazant 0.5l" map to the same product.

## Testing

Run the test suite:

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=backend --cov-report=html

# Run specific test file
pytest tests/test_api.py

# Run with verbose output
pytest -v
```

## Database Migrations

### Create a New Migration

After modifying `models.py`, generate a migration:

```bash
alembic revision --autogenerate -m "Add new column to products"
```

### Apply Migrations

```bash
# Upgrade to latest version
alembic upgrade head

# Downgrade one version
alembic downgrade -1

# Show current version
alembic current

# Show migration history
alembic history
```

## Production Deployment

### Environment Variables

Required environment variables for production:

```env
# Database (use PostgreSQL connection string)
DATABASE_URL=postgresql://user:password@host:5432/dbname

# Server
HOST=0.0.0.0
PORT=8000
RELOAD=false

# CORS (restrict to your mobile app domain)
CORS_ORIGINS=https://pantrypal.sk

# Application
DEBUG=false
```

### Supabase Integration

This backend is designed to work with Supabase PostgreSQL:

1. Create a new Supabase project
2. Get your database connection string from Settings → Database
3. Set `DATABASE_URL` to the connection string
4. Run migrations: `alembic upgrade head`

### Docker Production Build

```bash
# Build production image
docker build -t pantrypal-backend .

# Run container
docker run -d \
  -p 8000:8000 \
  -e DATABASE_URL=postgresql://... \
  -e DEBUG=false \
  pantrypal-backend
```

## Architecture Notes

### Privacy-First Design

- **Zero Personal Data:** No user IDs, device fingerprints, or receipt numbers are ever stored
- **Date-Only Timestamps:** Purchase times are stripped to prevent temporal fingerprinting
- **Anonymous Ingestion:** The API accepts only product, store, price, and date

### Slovak Market Specifics

- **IČO Validation:** Store identifiers use Slovakia's 8-digit company registration system
- **Diacritic Handling:** Full support for Slovak characters (á, č, ď, é, ž, etc.)
- **eKasa Integration:** Designed for Slovakia's electronic receipt system

### Scalability Considerations

- **Connection Pooling:** SQLAlchemy configured with pre-ping and connection reuse
- **Batch Processing:** Ingestion endpoint accepts multiple observations per request
- **Indexed Queries:** Composite indexes on frequently-queried columns
- **CORS Support:** Configurable for mobile app integration

## License

GNU General Public License v3.0 — See LICENSE file

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes and add tests
4. Run the test suite: `pytest`
5. Commit your changes: `git commit -m "Add my feature"`
6. Push to the branch: `git push origin feature/my-feature`
7. Open a Pull Request

## Support

For issues, questions, or contributions, please open an issue on GitHub.
