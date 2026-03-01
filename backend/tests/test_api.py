"""
Integration tests for the FastAPI backend API endpoints.
"""

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.database import get_db
from backend.main import app
from backend.models import Base, Product, Store

# Test database URL (use in-memory SQLite for tests with StaticPool)
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

# Create test engine and session with StaticPool to maintain connection
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,  # Use StaticPool to share connection in memory
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    """Override database dependency for testing."""
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()


# Override the dependency
app.dependency_overrides[get_db] = override_get_db

# Create all tables once
Base.metadata.create_all(bind=engine)

# Create test client
client = TestClient(app)


@pytest.fixture(autouse=True)
def cleanup_database():
    """Clean up database after each test."""
    yield
    # Clear all data but keep tables
    db = TestingSessionLocal()
    try:
        for table in reversed(Base.metadata.sorted_tables):
            db.execute(table.delete())
        db.commit()
    finally:
        db.close()


class TestHealthCheck:
    """Tests for health check endpoint."""

    def test_health_check_success(self):
        """Test that health check returns healthy status."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["app_name"] == "PantryPal SK Backend"
        assert data["database_connected"] is True


class TestPriceIngestion:
    """Tests for price ingestion endpoint."""

    def test_ingest_single_observation(self):
        """Test ingesting a single price observation."""
        payload = {
            "observations": [
                {
                    "ico": "35532773",
                    "normalizedName": "zlaty bazant 0.5l",
                    "price": 0.89,
                    "date": "2024-06-10",
                }
            ]
        }

        response = client.post("/api/v1/prices/ingest", json=payload)
        assert response.status_code == 201
        data = response.json()
        print(f"Response data: {data}")  # Debug output
        assert data["status"] == "ok"
        assert data["accepted"] == 1
        assert data["rejected"] == 0

    def test_ingest_multiple_observations(self):
        """Test ingesting multiple price observations in one request."""
        payload = {
            "observations": [
                {
                    "ico": "35532773",
                    "normalizedName": "milk 1l",
                    "price": 0.79,
                    "date": "2024-06-10",
                },
                {
                    "ico": "35532773",
                    "normalizedName": "bread 500g",
                    "price": 1.19,
                    "date": "2024-06-10",
                },
            ]
        }

        response = client.post("/api/v1/prices/ingest", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert data["status"] == "ok"
        assert data["accepted"] == 2
        assert data["rejected"] == 0

    def test_ingest_invalid_ico(self):
        """Test that invalid IČO is rejected."""
        payload = {
            "observations": [
                {
                    "ico": "12345",  # Invalid: not 8 digits
                    "normalizedName": "milk",
                    "price": 0.79,
                    "date": "2024-06-10",
                }
            ]
        }

        response = client.post("/api/v1/prices/ingest", json=payload)
        assert response.status_code == 422  # Validation error

    def test_ingest_negative_price(self):
        """Test that negative price is rejected."""
        payload = {
            "observations": [
                {
                    "ico": "35532773",
                    "normalizedName": "milk",
                    "price": -0.79,  # Invalid: negative
                    "date": "2024-06-10",
                }
            ]
        }

        response = client.post("/api/v1/prices/ingest", json=payload)
        assert response.status_code == 422  # Validation error

    def test_ingest_invalid_date(self):
        """Test that invalid date format is rejected."""
        payload = {
            "observations": [
                {
                    "ico": "35532773",
                    "normalizedName": "milk",
                    "price": 0.79,
                    "date": "2024-13-45",  # Invalid date
                }
            ]
        }

        response = client.post("/api/v1/prices/ingest", json=payload)
        assert response.status_code == 422  # Validation error

    def test_ingest_empty_observations(self):
        """Test that empty observations array is rejected."""
        payload = {"observations": []}

        response = client.post("/api/v1/prices/ingest", json=payload)
        assert response.status_code == 422  # Validation error


class TestPriceQuery:
    """Tests for price query endpoint."""

    def test_query_all_prices(self):
        """Test querying all prices without filters."""
        # First ingest some data
        payload = {
            "observations": [
                {
                    "ico": "35532773",
                    "normalizedName": "milk",
                    "price": 0.79,
                    "date": "2024-06-10",
                }
            ]
        }
        client.post("/api/v1/prices/ingest", json=payload)

        # Query prices
        response = client.get("/api/v1/prices")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["count"] >= 1

    def test_query_by_product_name(self):
        """Test querying prices by product name."""
        # Ingest data
        payload = {
            "observations": [
                {
                    "ico": "35532773",
                    "normalizedName": "milk 1l",
                    "price": 0.79,
                    "date": "2024-06-10",
                },
                {
                    "ico": "35532773",
                    "normalizedName": "bread 500g",
                    "price": 1.19,
                    "date": "2024-06-10",
                },
            ]
        }
        client.post("/api/v1/prices/ingest", json=payload)

        # Query for milk
        response = client.get("/api/v1/prices?product_name=milk")
        assert response.status_code == 200
        data = response.json()
        assert data["count"] >= 1
        assert all("milk" in r["product_name"].lower() for r in data["results"])

    def test_query_by_ico(self):
        """Test querying prices by store IČO."""
        # Ingest data
        payload = {
            "observations": [
                {
                    "ico": "35532773",
                    "normalizedName": "milk",
                    "price": 0.79,
                    "date": "2024-06-10",
                }
            ]
        }
        client.post("/api/v1/prices/ingest", json=payload)

        # Query by IČO
        response = client.get("/api/v1/prices?ico=35532773")
        assert response.status_code == 200
        data = response.json()
        assert data["count"] >= 1
        assert all(r["store_ico"] == "35532773" for r in data["results"])

    def test_query_with_date_range(self):
        """Test querying prices with date range."""
        today = date.today()
        date_str = today.isoformat()

        # Ingest data
        payload = {
            "observations": [
                {
                    "ico": "35532773",
                    "normalizedName": "milk",
                    "price": 0.79,
                    "date": date_str,
                }
            ]
        }
        client.post("/api/v1/prices/ingest", json=payload)

        # Query with date range
        response = client.get(
            f"/api/v1/prices?date_from={date_str}&date_to={date_str}"
        )
        assert response.status_code == 200
        data = response.json()
        assert data["count"] >= 1

    def test_query_with_limit(self):
        """Test that limit parameter works."""
        # Ingest multiple observations
        payload = {
            "observations": [
                {
                    "ico": "35532773",
                    "normalizedName": f"product_{i}",
                    "price": 0.79 + i * 0.1,
                    "date": "2024-06-10",
                }
                for i in range(10)
            ]
        }
        client.post("/api/v1/prices/ingest", json=payload)

        # Query with limit
        response = client.get("/api/v1/prices?limit=5")
        assert response.status_code == 200
        data = response.json()
        assert data["count"] <= 5


class TestStoreEndpoints:
    """Tests for store management endpoints."""

    def test_list_stores(self):
        """Test listing all stores."""
        # Ingest data to create a store
        payload = {
            "observations": [
                {
                    "ico": "35532773",
                    "normalizedName": "milk",
                    "price": 0.79,
                    "date": "2024-06-10",
                }
            ]
        }
        client.post("/api/v1/prices/ingest", json=payload)

        # List stores
        response = client.get("/api/v1/stores")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["count"] >= 1

    def test_get_store_by_ico(self):
        """Test getting store details by IČO."""
        # Ingest data to create a store
        payload = {
            "observations": [
                {
                    "ico": "35532773",
                    "normalizedName": "milk",
                    "price": 0.79,
                    "date": "2024-06-10",
                }
            ]
        }
        client.post("/api/v1/prices/ingest", json=payload)

        # Get store
        response = client.get("/api/v1/stores/35532773")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["store"]["ico"] == "35532773"

    def test_get_nonexistent_store(self):
        """Test that requesting non-existent store returns 404."""
        response = client.get("/api/v1/stores/99999999")
        assert response.status_code == 404


class TestProductSearch:
    """Tests for product search endpoint."""

    def test_search_products(self):
        """Test searching for products."""
        # Ingest data
        payload = {
            "observations": [
                {
                    "ico": "35532773",
                    "normalizedName": "milk fresh 1l",
                    "price": 0.79,
                    "date": "2024-06-10",
                }
            ]
        }
        client.post("/api/v1/prices/ingest", json=payload)

        # Search
        response = client.get("/api/v1/products/search?q=milk")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["count"] >= 1

    def test_search_with_short_query(self):
        """Test that short query is rejected."""
        response = client.get("/api/v1/products/search?q=a")
        assert response.status_code == 400


class TestStatistics:
    """Tests for statistics endpoint."""

    def test_get_statistics(self):
        """Test getting database statistics."""
        # Ingest some data
        payload = {
            "observations": [
                {
                    "ico": "35532773",
                    "normalizedName": "milk",
                    "price": 0.79,
                    "date": "2024-06-10",
                }
            ]
        }
        client.post("/api/v1/prices/ingest", json=payload)

        # Get stats
        response = client.get("/api/v1/stats")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "statistics" in data
        assert data["statistics"]["stores"] >= 1
        assert data["statistics"]["products"] >= 1
        assert data["statistics"]["price_observations"] >= 1


class TestLatestPricePerStore:
    """Tests that GET /prices returns the latest price per (product, store) pair."""

    def test_returns_latest_price_only(self):
        """Test that only the most recent price per store+product is returned."""
        # Ingest two observations for the same product+store on different dates
        payload_old = {
            "observations": [
                {
                    "ico": "35532773",
                    "normalizedName": "milk 1l",
                    "price": 0.79,
                    "date": "2024-01-01",
                }
            ]
        }
        payload_new = {
            "observations": [
                {
                    "ico": "35532773",
                    "normalizedName": "milk 1l",
                    "price": 0.89,
                    "date": "2024-06-10",
                }
            ]
        }
        client.post("/api/v1/prices/ingest", json=payload_old)
        client.post("/api/v1/prices/ingest", json=payload_new)

        response = client.get("/api/v1/prices?product_name=milk")
        assert response.status_code == 200
        data = response.json()
        # Should return only one result (the latest) per store+product
        milk_results = [r for r in data["results"] if "milk" in r["product_name"].lower()]
        assert len(milk_results) == 1
        # The latest price should be 0.89
        assert float(milk_results[0]["price_eur"]) == 0.89

    def test_known_store_gets_chain_name(self):
        """Test that ingesting with a known IČO populates the chain name correctly."""
        payload = {
            "observations": [
                {
                    "ico": "35532773",  # Lidl
                    "normalizedName": "water 0.5l",
                    "price": 0.29,
                    "date": "2024-06-10",
                }
            ]
        }
        client.post("/api/v1/prices/ingest", json=payload)

        response = client.get("/api/v1/stores/35532773")
        assert response.status_code == 200
        data = response.json()
        assert data["store"]["chain_name"] == "Lidl"

    def test_unknown_store_gets_fallback_name(self):
        """Test that ingesting with an unknown IČO uses the fallback name."""
        payload = {
            "observations": [
                {
                    "ico": "99999999",  # Unknown store
                    "normalizedName": "test product",
                    "price": 1.00,
                    "date": "2024-06-10",
                }
            ]
        }
        client.post("/api/v1/prices/ingest", json=payload)

        response = client.get("/api/v1/stores/99999999")
        assert response.status_code == 200
        data = response.json()
        assert data["store"]["chain_name"] == "Store 99999999"


class TestPromotionsIngestion:
    """Tests for promotions ingestion endpoint."""

    def test_ingest_single_promo(self):
        """Test ingesting a single promotional item."""
        today = date.today()
        payload = {
            "items": [
                {
                    "ico": "35532773",
                    "productName": "mlieko rajo 1l",
                    "salePrice": 0.89,
                    "originalPrice": 1.19,
                    "category": "dairy",
                    "validFrom": today.isoformat(),
                    "validTo": (today + timedelta(days=7)).isoformat(),
                }
            ]
        }

        response = client.post("/api/v1/promotions/ingest", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert data["status"] == "ok"
        assert data["accepted"] == 1
        assert data["rejected"] == 0

    def test_ingest_multiple_promos(self):
        """Test ingesting multiple promotional items."""
        today = date.today()
        payload = {
            "items": [
                {
                    "ico": "35532773",
                    "productName": "mlieko 1l",
                    "salePrice": 0.89,
                    "category": "dairy",
                    "validFrom": today.isoformat(),
                },
                {
                    "ico": "35532773",
                    "productName": "chlieb 500g",
                    "salePrice": 0.99,
                    "category": "bakery",
                    "validFrom": today.isoformat(),
                },
            ]
        }

        response = client.post("/api/v1/promotions/ingest", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert data["accepted"] == 2
        assert data["rejected"] == 0

    def test_ingest_promo_idempotent(self):
        """Test that re-ingesting the same promo updates rather than duplicates."""
        today = date.today()
        payload = {
            "items": [
                {
                    "ico": "35532773",
                    "productName": "maslo 250g",
                    "salePrice": 1.49,
                    "category": "dairy",
                    "validFrom": today.isoformat(),
                }
            ]
        }

        # Ingest twice
        client.post("/api/v1/promotions/ingest", json=payload)
        payload["items"][0]["salePrice"] = 1.29  # Updated price
        response = client.post("/api/v1/promotions/ingest", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert data["accepted"] == 1

    def test_ingest_promo_invalid_ico(self):
        """Test that invalid IČO is rejected."""
        payload = {
            "items": [
                {
                    "ico": "123",
                    "productName": "mlieko",
                    "salePrice": 0.89,
                    "validFrom": "2024-06-10",
                }
            ]
        }

        response = client.post("/api/v1/promotions/ingest", json=payload)
        assert response.status_code == 422

    def test_ingest_promo_empty_items(self):
        """Test that empty items array is rejected."""
        payload = {"items": []}
        response = client.post("/api/v1/promotions/ingest", json=payload)
        assert response.status_code == 422


class TestPromotionsQuery:
    """Tests for promotions query endpoint."""

    def test_query_active_promotions(self):
        """Test querying active promotions."""
        today = date.today()
        payload = {
            "items": [
                {
                    "ico": "35532773",
                    "productName": "mlieko rajo 1l",
                    "salePrice": 0.89,
                    "category": "dairy",
                    "validFrom": today.isoformat(),
                    "validTo": (today + timedelta(days=7)).isoformat(),
                }
            ]
        }
        client.post("/api/v1/promotions/ingest", json=payload)

        response = client.get("/api/v1/promotions")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["count"] >= 1

    def test_query_promotions_by_product(self):
        """Test querying promotions by product name."""
        today = date.today()
        payload = {
            "items": [
                {
                    "ico": "35532773",
                    "productName": "mlieko 1l",
                    "salePrice": 0.89,
                    "category": "dairy",
                    "validFrom": today.isoformat(),
                    "validTo": (today + timedelta(days=7)).isoformat(),
                },
                {
                    "ico": "35532773",
                    "productName": "chlieb celozrnny",
                    "salePrice": 1.29,
                    "category": "bakery",
                    "validFrom": today.isoformat(),
                    "validTo": (today + timedelta(days=7)).isoformat(),
                },
            ]
        }
        client.post("/api/v1/promotions/ingest", json=payload)

        response = client.get("/api/v1/promotions?product_name=mlieko")
        assert response.status_code == 200
        data = response.json()
        assert data["count"] >= 1
        assert all("mlieko" in r["product_name"].lower() for r in data["results"])

    def test_query_promotions_by_ico(self):
        """Test querying promotions filtered by store IČO."""
        today = date.today()
        payload = {
            "items": [
                {
                    "ico": "35532773",
                    "productName": "jogurt biely",
                    "salePrice": 0.49,
                    "category": "dairy",
                    "validFrom": today.isoformat(),
                    "validTo": (today + timedelta(days=7)).isoformat(),
                }
            ]
        }
        client.post("/api/v1/promotions/ingest", json=payload)

        response = client.get("/api/v1/promotions?ico=35532773")
        assert response.status_code == 200
        data = response.json()
        assert data["count"] >= 1
        assert all(r["store_ico"] == "35532773" for r in data["results"])

    def test_query_expired_promotions_excluded(self):
        """Test that expired promotions are excluded by default."""
        past = date.today() - timedelta(days=30)
        payload = {
            "items": [
                {
                    "ico": "35532773",
                    "productName": "stary produkt",
                    "salePrice": 0.49,
                    "category": "pantry",
                    "validFrom": past.isoformat(),
                    "validTo": (past + timedelta(days=7)).isoformat(),
                }
            ]
        }
        client.post("/api/v1/promotions/ingest", json=payload)

        response = client.get("/api/v1/promotions")
        assert response.status_code == 200
        data = response.json()
        # Expired promos should not appear when active_only=true (default)
        expired_results = [
            r for r in data["results"] if "stary produkt" in r["product_name"]
        ]
        assert len(expired_results) == 0

    def test_query_all_promotions_including_expired(self):
        """Test querying all promotions including expired ones."""
        past = date.today() - timedelta(days=30)
        payload = {
            "items": [
                {
                    "ico": "35532773",
                    "productName": "historicky produkt",
                    "salePrice": 0.99,
                    "category": "pantry",
                    "validFrom": past.isoformat(),
                    "validTo": (past + timedelta(days=7)).isoformat(),
                }
            ]
        }
        client.post("/api/v1/promotions/ingest", json=payload)

        response = client.get("/api/v1/promotions?active_only=false")
        assert response.status_code == 200
        data = response.json()
        expired_results = [
            r for r in data["results"] if "historicky produkt" in r["product_name"]
        ]
        assert len(expired_results) >= 1


class TestCategoryNormalization:
    """Tests that product categories are normalised and backfilled consistently."""

    def test_promo_category_lowercased(self):
        """Uppercase category is normalised to lowercase when ingesting a promo."""
        today = date.today()
        payload = {
            "items": [
                {
                    "ico": "35532773",
                    "productName": "jogurt biely 150g",
                    "salePrice": 0.49,
                    "category": "Dairy",    # non-canonical casing
                    "validFrom": today.isoformat(),
                    "validTo": (today + timedelta(days=7)).isoformat(),
                }
            ]
        }
        ingest_resp = client.post("/api/v1/promotions/ingest", json=payload)
        assert ingest_resp.status_code == 201

        response = client.get("/api/v1/promotions?product_name=jogurt biely")
        assert response.status_code == 200
        data = response.json()
        assert data["count"] >= 1
        assert data["results"][0]["category"] == "dairy"

    def test_promo_category_alias_normalised(self):
        """A recognised alias is mapped to the canonical category name."""
        today = date.today()
        payload = {
            "items": [
                {
                    "ico": "35532773",
                    "productName": "mineral water 1l",
                    "salePrice": 0.29,
                    "category": "Soft Drinks",  # alias → beverages
                    "validFrom": today.isoformat(),
                    "validTo": (today + timedelta(days=7)).isoformat(),
                }
            ]
        }
        ingest_resp = client.post("/api/v1/promotions/ingest", json=payload)
        assert ingest_resp.status_code == 201

        response = client.get("/api/v1/promotions?product_name=mineral water")
        assert response.status_code == 200
        data = response.json()
        assert data["count"] >= 1
        assert data["results"][0]["category"] == "beverages"

    def test_promo_unknown_category_stored_as_none(self):
        """An unrecognised category is stored as None rather than verbatim."""
        today = date.today()
        payload = {
            "items": [
                {
                    "ico": "35532773",
                    "productName": "exotic item xyz",
                    "salePrice": 1.99,
                    "category": "completely unknown",
                    "validFrom": today.isoformat(),
                    "validTo": (today + timedelta(days=7)).isoformat(),
                }
            ]
        }
        ingest_resp = client.post("/api/v1/promotions/ingest", json=payload)
        assert ingest_resp.status_code == 201

        response = client.get("/api/v1/promotions?product_name=exotic item")
        assert response.status_code == 200
        data = response.json()
        assert data["count"] >= 1
        assert data["results"][0]["category"] is None

    def test_category_backfilled_from_promo(self):
        """
        A product created without a category (from crowdsourced data) gets its
        category filled in when the same product is later ingested via a promo.
        """
        today = date.today()

        # 1. Create product via crowdsourced ingestion — no category
        crowdsourced_payload = {
            "observations": [
                {
                    "ico": "35532773",
                    "normalizedName": "maslo 250g",
                    "price": 1.89,
                    "date": today.isoformat(),
                }
            ]
        }
        ingest_resp = client.post("/api/v1/prices/ingest", json=crowdsourced_payload)
        assert ingest_resp.status_code == 201

        # Verify product exists but has no category yet
        search = client.get("/api/v1/products/search?q=maslo")
        assert search.status_code == 200
        products = search.json()["products"]
        assert len(products) >= 1
        assert products[0]["category"] is None

        # 2. Ingest a promo for the same product with a canonical category
        promo_payload = {
            "items": [
                {
                    "ico": "36488526",   # different store (Kaufland)
                    "productName": "maslo 250g",
                    "salePrice": 1.49,
                    "category": "dairy",
                    "validFrom": today.isoformat(),
                    "validTo": (today + timedelta(days=7)).isoformat(),
                }
            ]
        }
        promo_resp = client.post("/api/v1/promotions/ingest", json=promo_payload)
        assert promo_resp.status_code == 201

        # 3. Verify category has been backfilled on the shared product record
        search2 = client.get("/api/v1/products/search?q=maslo")
        assert search2.status_code == 200
        products2 = search2.json()["products"]
        assert len(products2) >= 1
        assert products2[0]["category"] == "dairy"

    def test_existing_category_not_overwritten(self):
        """An existing product category is not changed by a second promo ingestion."""
        today = date.today()

        # Ingest first promo — sets category to "meat"
        payload1 = {
            "items": [
                {
                    "ico": "35532773",
                    "productName": "kura cerstve",
                    "salePrice": 2.99,
                    "category": "meat",
                    "validFrom": today.isoformat(),
                    "validTo": (today + timedelta(days=7)).isoformat(),
                }
            ]
        }
        ingest1_resp = client.post("/api/v1/promotions/ingest", json=payload1)
        assert ingest1_resp.status_code == 201

        # Ingest second promo for the same product with a different category
        payload2 = {
            "items": [
                {
                    "ico": "36488526",
                    "productName": "kura cerstve",
                    "salePrice": 2.79,
                    "category": "frozen",  # different — should not overwrite
                    "validFrom": today.isoformat(),
                    "validTo": (today + timedelta(days=7)).isoformat(),
                }
            ]
        }
        ingest2_resp = client.post("/api/v1/promotions/ingest", json=payload2)
        assert ingest2_resp.status_code == 201

        search = client.get("/api/v1/products/search?q=kura cerstve")
        assert search.status_code == 200
        products = search.json()["products"]
        assert len(products) >= 1
        assert products[0]["category"] == "meat"
