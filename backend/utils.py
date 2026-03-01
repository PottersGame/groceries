"""
PantryPal SK — Product Name Normalization Utilities

Functions for normalizing product names to enable deduplication and matching
across different data sources (eKasa receipts, flyer PDFs).
"""

import re
import unicodedata


# ---------------------------------------------------------------------------
# Slovak store IČO → chain name lookup
# ---------------------------------------------------------------------------

#: Known Slovak retail chain IČOs and their human-readable names.
#: IČO = Identifikačné číslo organizácie (8-digit company registration number).
#: Add more entries as they become known to replace the "Store XXXXXXXX" fallback.
SLOVAK_STORE_ICO_MAP: dict[str, str] = {
    "35532773": "Lidl",
    "31322571": "Tesco",
    "35744771": "Albert",
    "36488526": "Kaufland",
    "31384943": "Billa",
    "36170151": "Fresh",
    "36487333": "CBA",
    "36290904": "Coop Jednota",
}


def lookup_chain_name(ico: str) -> str:
    """
    Return the human-readable chain name for a Slovak store IČO.

    Falls back to "Store {ico}" when the IČO is not in the lookup table.

    Args:
        ico: 8-digit Slovak IČO string.

    Returns:
        Chain name string, e.g. "Lidl" or "Store 99999999".
    """
    return SLOVAK_STORE_ICO_MAP.get(ico, f"Store {ico}")


def normalize_product_name(name: str) -> str:
    """
    Normalize a product name for deduplication and matching.

    Performs the following transformations:
    1. Convert to lowercase
    2. Strip diacritics (á → a, ž → z, etc.)
    3. Remove non-alphanumeric characters except spaces
    4. Collapse multiple whitespace into single spaces
    5. Strip leading/trailing whitespace

    Args:
        name: The raw product name to normalize.

    Returns:
        Normalized product name suitable for database storage and matching.

    Examples:
        >>> normalize_product_name("Zlatý Bažant 0.5L")
        'zlaty bazant 0 5l'

        >>> normalize_product_name("  Mlieko  RAJO  3,5%  ")
        'mlieko rajo 3 5'

        >>> normalize_product_name("Chlieb krájaný (ražný)")
        'chlieb krajany razny'
    """
    if not name:
        return ""

    # Convert to lowercase
    normalized = name.lower()

    # Strip diacritics using Unicode normalization
    # NFD = Canonical Decomposition (separates base chars from diacritics)
    normalized = unicodedata.normalize("NFD", normalized)
    # Keep only non-combining characters (removes diacritics)
    normalized = "".join(
        char for char in normalized if unicodedata.category(char) != "Mn"
    )

    # Remove non-alphanumeric characters except spaces
    # This handles parentheses, commas, etc.
    normalized = re.sub(r"[^a-z0-9\s]", " ", normalized)

    # Collapse multiple whitespace into single spaces
    normalized = re.sub(r"\s+", " ", normalized)

    # Strip leading/trailing whitespace
    normalized = normalized.strip()

    return normalized


def extract_quantity_hint(name: str) -> tuple[str, float | None, str | None]:
    """
    Attempt to extract quantity information from a product name.

    Looks for patterns like "500g", "1.5l", "0.5 L", etc.

    Args:
        name: The product name to analyze.

    Returns:
        A tuple of (base_name, quantity, unit) where:
        - base_name: product name with quantity removed
        - quantity: numeric quantity (or None if not found)
        - unit: unit of measure (or None if not found)

    Examples:
        >>> extract_quantity_hint("Mlieko 1L")
        ('Mlieko', 1.0, 'l')

        >>> extract_quantity_hint("Chlieb 500g")
        ('Chlieb', 500.0, 'g')

        >>> extract_quantity_hint("Zlatý Bažant")
        ('Zlatý Bažant', None, None)
    """
    # Pattern to match quantities like: 500g, 1.5L, 0.5 l, etc.
    pattern = r"\b(\d+(?:[.,]\d+)?)\s*(g|kg|l|ml)\b"
    match = re.search(pattern, name, re.IGNORECASE)

    if match:
        quantity_str = match.group(1).replace(",", ".")
        quantity = float(quantity_str)
        unit = match.group(2).lower()

        # Remove the quantity portion from the name
        base_name = name[: match.start()] + name[match.end() :]
        base_name = re.sub(r"\s+", " ", base_name).strip()

        return base_name, quantity, unit

    return name, None, None
