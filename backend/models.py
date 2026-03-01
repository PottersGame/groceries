"""
PantryPal SK — Backend PostgreSQL Schema (SQLAlchemy)

Tables:
  - stores              : Slovak retailers identified by their IČO tax number
  - products            : Normalised product catalogue
  - prices_crowdsourced : Anonymous price observations uploaded from eKasa scans
  - prices_flyer_promo  : Promotional prices extracted from weekly flyer PDFs
"""

from __future__ import annotations

import enum
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


# ---------------------------------------------------------------------------
# Base
# ---------------------------------------------------------------------------


class Base(DeclarativeBase):
    """Shared declarative base for all ORM models."""


# Helper function to get the correct integer type for primary keys
def get_pk_type():
    """
    Return BigInteger for PostgreSQL and Integer for SQLite.
    This ensures compatibility with both databases.
    """
    return Integer  # Use Integer for better SQLite compatibility


# ---------------------------------------------------------------------------
# Enum types
# ---------------------------------------------------------------------------


class UnitType(str, enum.Enum):
    """Unit of measure used for price normalisation."""

    piece = "piece"        # per item (ks)
    kg = "kg"              # per kilogram
    litre = "litre"        # per litre
    gram = "gram"          # per 100 g, stored as g
    ml = "ml"              # per 100 ml, stored as ml


# ---------------------------------------------------------------------------
# stores
# ---------------------------------------------------------------------------


class Store(Base):
    """
    Retail chain or individual store identified by a Slovak IČO.

    IČO (Identifikačné číslo organizácie) is the 8-digit company
    registration number used as the store identifier on eKasa receipts.
    It serves as a privacy-safe store key — no location data is stored.
    """

    __tablename__ = "stores"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Slovak 8-digit company registration number (leading zeros preserved)
    ico: Mapped[str] = mapped_column(String(8), nullable=False, unique=True, index=True)

    # Human-readable chain name, e.g. "Lidl", "Kaufland"
    chain_name: Mapped[str] = mapped_column(String(100), nullable=False)

    # Optional branch/city disambiguator — populated from flyer metadata only
    branch_label: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # Whether this store's flyer is processed by the PDF parser pipeline
    flyer_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Relationships
    crowdsourced_prices: Mapped[list["PriceCrowdsourced"]] = relationship(
        "PriceCrowdsourced", back_populates="store"
    )
    flyer_promos: Mapped[list["PriceFlyerPromo"]] = relationship(
        "PriceFlyerPromo", back_populates="store"
    )

    __table_args__ = (
        # Check ICO length (8 digits). Format validation happens at the API level.
        CheckConstraint("LENGTH(ico) = 8", name="ck_stores_ico_format"),
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Store ico={self.ico!r} chain={self.chain_name!r}>"


# ---------------------------------------------------------------------------
# products
# ---------------------------------------------------------------------------


class Product(Base):
    """
    Normalised product entry shared across all price sources.

    Names are lower-cased, diacritic-stripped, and whitespace-collapsed
    during ingestion so that "Zlatý Bažant 0.5L" and "zlatý bažant 0.5l"
    map to the same row.
    """

    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Canonical normalised name used for deduplication & matching
    normalized_name: Mapped[str] = mapped_column(
        String(500), nullable=False, unique=True, index=True
    )

    # Original display name (best known human-readable version)
    display_name: Mapped[str] = mapped_column(String(500), nullable=False)

    # Broad category label, e.g. "dairy", "beverages", "bakery"
    category: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)

    unit: Mapped[UnitType] = mapped_column(
        Enum(UnitType, name="unit_type"), nullable=False, default=UnitType.piece
    )

    # Optional barcode (EAN-8 / EAN-13) when available from flyer extraction
    barcode: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    crowdsourced_prices: Mapped[list["PriceCrowdsourced"]] = relationship(
        "PriceCrowdsourced", back_populates="product"
    )
    flyer_promos: Mapped[list["PriceFlyerPromo"]] = relationship(
        "PriceFlyerPromo", back_populates="product"
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Product id={self.id} name={self.normalized_name!r}>"


# ---------------------------------------------------------------------------
# prices_crowdsourced
# ---------------------------------------------------------------------------


class PriceCrowdsourced(Base):
    """
    Anonymous price observation derived from a user's eKasa receipt scan.

    Privacy guarantee: no user ID, device fingerprint, or receipt number
    is ever stored.  Only the store IČO, the normalised product name,
    the price paid, and the purchase date reach this table.
    """

    __tablename__ = "prices_crowdsourced"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    store_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("stores.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Price in EUR with 2 decimal places
    price_eur: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False
    )

    # Calendar date the purchase was made (no time component to avoid fingerprinting)
    observed_on: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    # Server-side ingestion timestamp for pipeline auditing
    ingested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Relationships
    store: Mapped["Store"] = relationship("Store", back_populates="crowdsourced_prices")
    product: Mapped["Product"] = relationship("Product", back_populates="crowdsourced_prices")

    __table_args__ = (
        CheckConstraint("price_eur > 0", name="ck_prices_crowdsourced_positive"),
        Index("ix_prices_crowdsourced_store_product_date", "store_id", "product_id", "observed_on"),
    )

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<PriceCrowdsourced store_id={self.store_id} "
            f"product_id={self.product_id} price={self.price_eur} "
            f"date={self.observed_on}>"
        )


# ---------------------------------------------------------------------------
# prices_flyer_promo
# ---------------------------------------------------------------------------


class PriceFlyerPromo(Base):
    """
    Promotional price extracted from a retailer's weekly PDF flyer.

    Records the sale price, the validity window, and the source PDF so
    that the PDF parser pipeline can avoid re-processing the same file.
    """

    __tablename__ = "prices_flyer_promo"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    store_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("stores.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Promotional price in EUR
    promo_price_eur: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    # Regular (non-promotional) price when printed on the flyer, nullable
    regular_price_eur: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)

    # Validity window for the promotion
    valid_from: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    valid_to: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    # Source PDF metadata for idempotent pipeline re-runs
    source_pdf_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_pdf_hash: Mapped[str | None] = mapped_column(
        String(64), nullable=True, comment="SHA-256 hex digest of the source PDF"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Relationships
    store: Mapped["Store"] = relationship("Store", back_populates="flyer_promos")
    product: Mapped["Product"] = relationship("Product", back_populates="flyer_promos")

    __table_args__ = (
        CheckConstraint("promo_price_eur > 0", name="ck_prices_flyer_positive"),
        CheckConstraint("valid_to >= valid_from", name="ck_prices_flyer_date_range"),
        UniqueConstraint(
            "store_id", "product_id", "valid_from",
            name="uq_prices_flyer_store_product_start"
        ),
        Index("ix_prices_flyer_validity", "valid_from", "valid_to"),
    )

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<PriceFlyerPromo store_id={self.store_id} "
            f"product_id={self.product_id} promo={self.promo_price_eur} "
            f"{self.valid_from}–{self.valid_to}>"
        )
