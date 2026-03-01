"""
PantryPal SK — FastAPI Backend Application

Main application entry point with all API endpoints.
"""

from datetime import datetime
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from .config import settings
from .database import engine, get_db
from .models import PriceCrowdsourced, Product, Store
from .schemas import (
    HealthCheckResponse,
    IngestionErrorResponse,
    IngestionPayload,
    IngestionSuccessResponse,
    PriceEntry,
    PriceQueryParams,
    PriceQueryResponse,
)
from .utils import normalize_product_name

# Initialize FastAPI app
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Backend API for PantryPal SK — grocery price tracking and comparison",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Health Check Endpoint
# ---------------------------------------------------------------------------


@app.get("/health", response_model=HealthCheckResponse, tags=["System"])
def health_check(db: Session = Depends(get_db)) -> HealthCheckResponse:
    """
    Health check endpoint.

    Returns the application status and database connectivity.
    """
    database_connected = False

    try:
        # Simple query to verify database connection
        db.execute(select(1))
        database_connected = True
    except Exception:
        pass

    return HealthCheckResponse(
        status="healthy" if database_connected else "degraded",
        app_name=settings.app_name,
        app_version=settings.app_version,
        database_connected=database_connected,
    )


# ---------------------------------------------------------------------------
# Price Ingestion Endpoint
# ---------------------------------------------------------------------------


@app.post(
    f"{settings.api_prefix}/prices/ingest",
    response_model=IngestionSuccessResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Prices"],
)
def ingest_prices(
    payload: IngestionPayload,
    db: Session = Depends(get_db),
) -> IngestionSuccessResponse | IngestionErrorResponse:
    """
    Anonymous price ingestion endpoint.

    Accepts a batch of price observations from eKasa receipt scans.
    Creates or updates stores, products, and price records.

    Privacy guarantee: no user ID, device ID, or receipt number is stored.
    """
    accepted = 0
    rejected = 0
    errors: dict[int, str] = {}

    for idx, obs in enumerate(payload.observations):
        try:
            # 1. Get or create the store
            store = db.query(Store).filter(Store.ico == obs.ico).first()
            if not store:
                # Create new store with minimal information
                # The chain_name can be populated later from external data sources
                store = Store(
                    ico=obs.ico,
                    chain_name=f"Store {obs.ico}",  # Placeholder name
                    flyer_enabled=False,
                )
                db.add(store)
                db.flush()  # Get the store ID

            # 2. Normalize the product name
            normalized = normalize_product_name(obs.normalizedName)

            # 3. Get or create the product
            product = (
                db.query(Product).filter(Product.normalized_name == normalized).first()
            )
            if not product:
                product = Product(
                    normalized_name=normalized,
                    display_name=obs.normalizedName,  # Keep original as display name
                    category=None,  # Can be inferred later via ML or manual tagging
                )
                db.add(product)
                db.flush()  # Get the product ID

            # 4. Create the price observation
            price_record = PriceCrowdsourced(
                store_id=store.id,
                product_id=product.id,
                price_eur=obs.price,
                observed_on=obs.date,
            )
            db.add(price_record)

            accepted += 1

        except ValueError as e:
            # Validation error for this specific observation
            errors[idx] = str(e)
            rejected += 1
        except SQLAlchemyError as e:
            # Database error for this observation
            errors[idx] = f"Database error: {str(e)}"
            rejected += 1
            db.rollback()
        except Exception as e:
            # Unexpected error
            errors[idx] = f"Unexpected error: {str(e)}"
            rejected += 1
            db.rollback()

    # Commit all accepted observations
    if accepted > 0:
        try:
            db.commit()
        except SQLAlchemyError as e:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to commit transactions: {str(e)}",
            )

    return IngestionSuccessResponse(
        status="ok",
        accepted=accepted,
        rejected=rejected,
        errors=errors if errors else None,
    )


# ---------------------------------------------------------------------------
# Price Query Endpoint
# ---------------------------------------------------------------------------


@app.get(
    f"{settings.api_prefix}/prices",
    response_model=PriceQueryResponse,
    tags=["Prices"],
)
def query_prices(
    product_name: str | None = None,
    ico: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    limit: int = 100,
    db: Session = Depends(get_db),
) -> PriceQueryResponse:
    """
    Query crowdsourced prices.

    Returns price observations matching the given filters.
    Useful for price comparison, trend analysis, and shopping list optimization.
    """
    # Build the query
    query = (
        db.query(
            PriceCrowdsourced,
            Product.normalized_name,
            Product.display_name,
            Store.ico,
            Store.chain_name,
        )
        .join(Product, PriceCrowdsourced.product_id == Product.id)
        .join(Store, PriceCrowdsourced.store_id == Store.id)
    )

    # Apply filters
    if product_name:
        normalized = normalize_product_name(product_name)
        query = query.filter(Product.normalized_name.contains(normalized))

    if ico:
        query = query.filter(Store.ico == ico)

    if date_from:
        query = query.filter(PriceCrowdsourced.observed_on >= date_from)

    if date_to:
        query = query.filter(PriceCrowdsourced.observed_on <= date_to)

    # Order by most recent first
    query = query.order_by(PriceCrowdsourced.observed_on.desc())

    # Apply limit
    query = query.limit(limit)

    # Execute query
    results = query.all()

    # Transform to response format
    price_entries = [
        PriceEntry(
            product_id=price.product_id,
            product_name=display_name,
            store_ico=store_ico,
            store_chain=chain_name,
            price_eur=price.price_eur,
            observed_on=price.observed_on,
            ingested_at=price.ingested_at.isoformat(),
        )
        for price, normalized_name, display_name, store_ico, chain_name in results
    ]

    return PriceQueryResponse(
        status="ok",
        count=len(price_entries),
        results=price_entries,
    )


# ---------------------------------------------------------------------------
# Store Management Endpoints
# ---------------------------------------------------------------------------


@app.get(
    f"{settings.api_prefix}/stores",
    tags=["Stores"],
)
def list_stores(
    limit: int = 100,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    List all registered stores.

    Returns stores with their IČO, chain name, and observation counts.
    """
    stores = db.query(Store).limit(limit).all()

    store_list = [
        {
            "id": store.id,
            "ico": store.ico,
            "chain_name": store.chain_name,
            "branch_label": store.branch_label,
            "flyer_enabled": store.flyer_enabled,
            "created_at": store.created_at.isoformat(),
        }
        for store in stores
    ]

    return {
        "status": "ok",
        "count": len(store_list),
        "stores": store_list,
    }


@app.get(
    f"{settings.api_prefix}/stores/{{ico}}",
    tags=["Stores"],
)
def get_store(
    ico: str,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    Get details for a specific store by IČO.

    Returns store information and statistics.
    """
    store = db.query(Store).filter(Store.ico == ico).first()

    if not store:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Store with IČO {ico} not found",
        )

    # Get price observation count
    price_count = (
        db.query(func.count(PriceCrowdsourced.id))
        .filter(PriceCrowdsourced.store_id == store.id)
        .scalar()
    )

    return {
        "status": "ok",
        "store": {
            "id": store.id,
            "ico": store.ico,
            "chain_name": store.chain_name,
            "branch_label": store.branch_label,
            "flyer_enabled": store.flyer_enabled,
            "created_at": store.created_at.isoformat(),
            "price_observation_count": price_count,
        },
    }


# ---------------------------------------------------------------------------
# Product Search Endpoint
# ---------------------------------------------------------------------------


@app.get(
    f"{settings.api_prefix}/products/search",
    tags=["Products"],
)
def search_products(
    q: str,
    limit: int = 50,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    Search for products by name.

    Returns products matching the search query with their latest prices.
    """
    if not q or len(q.strip()) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Query must be at least 2 characters long",
        )

    normalized = normalize_product_name(q)

    # Search for products
    products = (
        db.query(Product)
        .filter(Product.normalized_name.contains(normalized))
        .limit(limit)
        .all()
    )

    product_list = [
        {
            "id": product.id,
            "normalized_name": product.normalized_name,
            "display_name": product.display_name,
            "category": product.category,
            "unit": product.unit.value,
            "barcode": product.barcode,
        }
        for product in products
    ]

    return {
        "status": "ok",
        "query": q,
        "normalized_query": normalized,
        "count": len(product_list),
        "products": product_list,
    }


# ---------------------------------------------------------------------------
# Statistics Endpoint
# ---------------------------------------------------------------------------


@app.get(
    f"{settings.api_prefix}/stats",
    tags=["System"],
)
def get_statistics(db: Session = Depends(get_db)) -> dict[str, Any]:
    """
    Get database statistics.

    Returns counts of stores, products, and price observations.
    """
    try:
        store_count = db.query(func.count(Store.id)).scalar()
        product_count = db.query(func.count(Product.id)).scalar()
        price_count = db.query(func.count(PriceCrowdsourced.id)).scalar()

        return {
            "status": "ok",
            "statistics": {
                "stores": store_count,
                "products": product_count,
                "price_observations": price_count,
            },
        }
    except SQLAlchemyError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {str(e)}",
        )


# ---------------------------------------------------------------------------
# Application Lifecycle
# ---------------------------------------------------------------------------


@app.on_event("startup")
async def startup_event():
    """Initialize the application on startup."""
    print(f"🚀 Starting {settings.app_name} v{settings.app_version}")
    print(f"📍 API prefix: {settings.api_prefix}")
    print(f"🔍 Debug mode: {settings.debug}")
    print(f"🌐 CORS origins: {settings.cors_origins}")


@app.on_event("shutdown")
async def shutdown_event():
    """Clean up resources on shutdown."""
    print(f"👋 Shutting down {settings.app_name}")
    engine.dispose()
