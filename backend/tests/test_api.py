"""
Integration tests for the FastAPI backend API endpoints.
"""

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.database import get_db
from backend.main import app
from backend.models import Base, Product, Store

# Test database URL (use in-memory SQLite for tests)
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

# Create test engine and session
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
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

# Create test client
client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_database():
    """Create tables before each test and drop after."""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


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
