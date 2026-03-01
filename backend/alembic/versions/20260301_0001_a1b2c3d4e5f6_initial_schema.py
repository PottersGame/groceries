"""Initial schema — stores, products, prices_crowdsourced, prices_flyer_promo

Revision ID: a1b2c3d4e5f6
Revises:
Create Date: 2026-03-01 20:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- stores ---
    op.create_table(
        "stores",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("ico", sa.String(length=8), nullable=False),
        sa.Column("chain_name", sa.String(length=100), nullable=False),
        sa.Column("branch_label", sa.String(length=200), nullable=True),
        sa.Column("flyer_enabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("ico"),
        sa.CheckConstraint("LENGTH(ico) = 8", name="ck_stores_ico_format"),
    )
    op.create_index("ix_stores_ico", "stores", ["ico"])

    # --- unit_type enum (used by products) ---
    unit_type = sa.Enum("piece", "kg", "litre", "gram", "ml", name="unit_type")

    # --- products ---
    op.create_table(
        "products",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("normalized_name", sa.String(length=500), nullable=False),
        sa.Column("display_name", sa.String(length=500), nullable=False),
        sa.Column("category", sa.String(length=100), nullable=True),
        sa.Column("unit", unit_type, nullable=False, server_default="piece"),
        sa.Column("barcode", sa.String(length=20), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("normalized_name"),
    )
    op.create_index("ix_products_normalized_name", "products", ["normalized_name"])
    op.create_index("ix_products_category", "products", ["category"])
    op.create_index("ix_products_barcode", "products", ["barcode"])

    # --- prices_crowdsourced ---
    op.create_table(
        "prices_crowdsourced",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "store_id",
            sa.Integer(),
            sa.ForeignKey("stores.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "product_id",
            sa.Integer(),
            sa.ForeignKey("products.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("price_eur", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("observed_on", sa.Date(), nullable=False),
        sa.Column(
            "ingested_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("price_eur > 0", name="ck_prices_crowdsourced_positive"),
    )
    op.create_index("ix_prices_crowdsourced_store_id", "prices_crowdsourced", ["store_id"])
    op.create_index("ix_prices_crowdsourced_product_id", "prices_crowdsourced", ["product_id"])
    op.create_index("ix_prices_crowdsourced_observed_on", "prices_crowdsourced", ["observed_on"])
    op.create_index(
        "ix_prices_crowdsourced_store_product_date",
        "prices_crowdsourced",
        ["store_id", "product_id", "observed_on"],
    )

    # --- prices_flyer_promo ---
    op.create_table(
        "prices_flyer_promo",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "store_id",
            sa.Integer(),
            sa.ForeignKey("stores.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "product_id",
            sa.Integer(),
            sa.ForeignKey("products.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("promo_price_eur", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("regular_price_eur", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("valid_from", sa.Date(), nullable=False),
        sa.Column("valid_to", sa.Date(), nullable=False),
        sa.Column("source_pdf_url", sa.Text(), nullable=True),
        sa.Column("source_pdf_hash", sa.String(length=64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("promo_price_eur > 0", name="ck_prices_flyer_positive"),
        sa.CheckConstraint("valid_to >= valid_from", name="ck_prices_flyer_date_range"),
        sa.UniqueConstraint(
            "store_id", "product_id", "valid_from",
            name="uq_prices_flyer_store_product_start",
        ),
    )
    op.create_index("ix_prices_flyer_promo_store_id", "prices_flyer_promo", ["store_id"])
    op.create_index("ix_prices_flyer_promo_product_id", "prices_flyer_promo", ["product_id"])
    op.create_index("ix_prices_flyer_promo_valid_from", "prices_flyer_promo", ["valid_from"])
    op.create_index("ix_prices_flyer_promo_valid_to", "prices_flyer_promo", ["valid_to"])
    op.create_index(
        "ix_prices_flyer_validity",
        "prices_flyer_promo",
        ["valid_from", "valid_to"],
    )


def downgrade() -> None:
    op.drop_table("prices_flyer_promo")
    op.drop_table("prices_crowdsourced")
    op.drop_table("products")
    op.drop_table("stores")
    sa.Enum(name="unit_type").drop(op.get_bind())
