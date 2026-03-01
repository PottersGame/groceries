"""
PantryPal SK — API Schemas (Pydantic Models)

Request and response models for the FastAPI endpoints.
These mirror the TypeScript types defined in mobile/api/types.ts.
"""

from datetime import date as DateType
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator


# ---------------------------------------------------------------------------
# Price Ingestion Endpoint
# ---------------------------------------------------------------------------


class PriceObservation(BaseModel):
    """
    One line-item from a scanned eKasa receipt, stripped of all personal data.

    Corresponds to the TypeScript `PriceObservation` interface.
    """

    model_config = ConfigDict(populate_by_name=True)

    ico: str = Field(
        ...,
        pattern=r"^[0-9]{8}$",
        description="8-digit Slovak IČO (company registration number)",
        examples=["35532773"],
    )
    normalizedName: str = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Normalized product name (lowercase, no diacritics)",
        examples=["zlaty bazant 0.5l"],
    )
    price: float = Field(
        ...,
        gt=0,
        description="Price paid in EUR (must be positive)",
        examples=[0.89],
    )
    date: DateType = Field(
        ...,
        description="ISO-8601 purchase date (YYYY-MM-DD)",
        examples=["2024-06-10"],
    )

    @field_validator("normalizedName")
    @classmethod
    def validate_normalized_name(cls, v: str) -> str:
        """Ensure normalized name is not just whitespace."""
        if not v.strip():
            raise ValueError("normalizedName must not be empty or whitespace-only")
        return v.strip()


class IngestionPayload(BaseModel):
    """
    Request body for POST /api/v1/prices/ingest.

    Corresponds to the TypeScript `IngestionPayload` interface.
    """

    observations: list[PriceObservation] = Field(
        ...,
        min_length=1,
        description="Array of anonymised price observations (at least one required)",
    )


class IngestionSuccessResponse(BaseModel):
    """
    Successful response from POST /api/v1/prices/ingest.

    Corresponds to the TypeScript `IngestionSuccessResponse` interface.
    """

    status: str = Field(default="ok", description="Always 'ok' on success")
    accepted: int = Field(..., description="Number of observations accepted")
    rejected: int = Field(..., description="Number of observations rejected")
    errors: dict[int, str] | None = Field(
        default=None,
        description="Per-observation validation errors (index → error message)",
    )


class IngestionErrorResponse(BaseModel):
    """
    Error response when the request itself is malformed.

    Corresponds to the TypeScript `IngestionErrorResponse` interface.
    """

    status: str = Field(default="error", description="Always 'error' on failure")
    code: str = Field(..., description="Machine-readable error code")
    message: str = Field(..., description="Human-readable error description")


# ---------------------------------------------------------------------------
# Price Query Endpoint
# ---------------------------------------------------------------------------


class PriceQueryParams(BaseModel):
    """Query parameters for GET /api/v1/prices."""

    product_name: str | None = Field(
        default=None,
        description="Search by normalized product name (partial match)",
    )
    ico: str | None = Field(
        default=None,
        pattern=r"^[0-9]{8}$",
        description="Filter by store IČO",
    )
    date_from: DateType | None = Field(
        default=None,
        description="Filter prices observed on or after this date",
    )
    date_to: DateType | None = Field(
        default=None,
        description="Filter prices observed on or before this date",
    )
    limit: int = Field(
        default=100,
        ge=1,
        le=1000,
        description="Maximum number of results to return",
    )


class PriceEntry(BaseModel):
    """A single price observation with store and product details."""

    product_id: int
    product_name: str
    store_ico: str
    store_chain: str
    price_eur: Decimal
    observed_on: DateType
    ingested_at: str  # ISO-8601 timestamp

    class Config:
        from_attributes = True  # Allow ORM model → Pydantic conversion


class PriceQueryResponse(BaseModel):
    """Response from GET /api/v1/prices."""

    status: str = Field(default="ok")
    count: int = Field(..., description="Number of results returned")
    results: list[PriceEntry]


# ---------------------------------------------------------------------------
# Health Check Endpoint
# ---------------------------------------------------------------------------


class HealthCheckResponse(BaseModel):
    """Response from GET /health."""

    status: str = Field(default="healthy")
    app_name: str
    app_version: str
    database_connected: bool


# ---------------------------------------------------------------------------
# Promotions Ingestion Endpoint
# ---------------------------------------------------------------------------


class PromoItem(BaseModel):
    """
    One promotional item extracted from a supermarket flyer.

    Submitted by the Cloudflare Worker after Gemini AI extraction.
    """

    model_config = ConfigDict(populate_by_name=True)

    ico: str = Field(
        ...,
        pattern=r"^[0-9]{8}$",
        description="8-digit Slovak IČO of the store",
        examples=["35532773"],
    )
    productName: str = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Normalized product name (lowercase, no diacritics)",
        examples=["mlieko rajo 1l"],
    )
    salePrice: float = Field(
        ...,
        gt=0,
        description="Promotional sale price in EUR",
        examples=[0.89],
    )
    originalPrice: float | None = Field(
        default=None,
        gt=0,
        description="Original (non-discounted) price in EUR, if available",
        examples=[1.19],
    )
    category: str | None = Field(
        default=None,
        max_length=100,
        description="Product category (e.g. dairy, meat, bakery)",
        examples=["dairy"],
    )
    validFrom: DateType = Field(
        ...,
        description="Start date of the promotion (ISO-8601)",
        examples=["2024-06-10"],
    )
    validTo: DateType | None = Field(
        default=None,
        description="End date of the promotion (ISO-8601), null if unknown",
        examples=["2024-06-16"],
    )
    sourcePdfHash: str | None = Field(
        default=None,
        max_length=64,
        description="SHA-256 hex digest of the source PDF for idempotency",
    )


class PromotionsIngestionPayload(BaseModel):
    """Request body for POST /api/v1/promotions/ingest."""

    items: list[PromoItem] = Field(
        ...,
        min_length=1,
        description="Array of promotional items extracted from flyer(s)",
    )


class PromotionsIngestionResponse(BaseModel):
    """Response from POST /api/v1/promotions/ingest."""

    status: str = Field(default="ok")
    accepted: int = Field(..., description="Number of promo items accepted")
    rejected: int = Field(..., description="Number of promo items rejected")
    errors: dict[int, str] | None = Field(default=None)


class PromoEntry(BaseModel):
    """A single promotional price entry with store and product details."""

    product_name: str
    store_ico: str
    store_chain: str
    promo_price_eur: Decimal
    regular_price_eur: Decimal | None
    valid_from: DateType
    valid_to: DateType
    category: str | None

    class Config:
        from_attributes = True


class PromotionsQueryResponse(BaseModel):
    """Response from GET /api/v1/promotions."""

    status: str = Field(default="ok")
    count: int = Field(..., description="Number of results returned")
    results: list[PromoEntry]
