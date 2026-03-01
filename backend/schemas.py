"""
PantryPal SK — API Schemas (Pydantic Models)

Request and response models for the FastAPI endpoints.
These mirror the TypeScript types defined in mobile/api/types.ts.
"""

from datetime import date
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
    # Field renamed to `observed_on` to avoid clashing with the `date` type;
    # the JSON key remains "date" via the alias.
    observed_on: date = Field(
        ...,
        alias="date",
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
    date_from: date | None = Field(
        default=None,
        description="Filter prices observed on or after this date",
    )
    date_to: date | None = Field(
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
    observed_on: date
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
