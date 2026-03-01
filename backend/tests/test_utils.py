"""
Tests for product name normalization utilities.
"""

import pytest

from backend.utils import extract_quantity_hint, lookup_chain_name, normalize_category, normalize_product_name


class TestNormalizeProductName:
    """Tests for normalize_product_name function."""

    def test_basic_normalization(self):
        """Test basic lowercase and whitespace normalization."""
        assert normalize_product_name("MILK") == "milk"
        assert normalize_product_name("  Bread  ") == "bread"
        assert normalize_product_name("Whole   Milk") == "whole milk"

    def test_diacritic_removal(self):
        """Test Slovak diacritic removal."""
        assert normalize_product_name("Zlatý Bažant") == "zlaty bazant"
        assert normalize_product_name("Čerstvé mlieko") == "cerstve mlieko"
        assert normalize_product_name("Ražný chlieb") == "razny chlieb"

    def test_special_characters(self):
        """Test removal of special characters."""
        assert normalize_product_name("Milk (3.5%)") == "milk 3 5"
        assert normalize_product_name("Bread - whole wheat") == "bread whole wheat"
        assert normalize_product_name("Coffee, ground") == "coffee ground"

    def test_empty_input(self):
        """Test handling of empty input."""
        assert normalize_product_name("") == ""
        assert normalize_product_name("   ") == ""

    def test_real_world_examples(self):
        """Test with real product names."""
        assert normalize_product_name("Zlatý Bažant 0.5L") == "zlaty bazant 0 5l"
        assert normalize_product_name("Rajo Mlieko 3,5%") == "rajo mlieko 3 5"
        assert normalize_product_name("Kofola Original 2L") == "kofola original 2l"


class TestExtractQuantityHint:
    """Tests for extract_quantity_hint function."""

    def test_extract_gram_quantity(self):
        """Test extraction of gram quantities."""
        base, qty, unit = extract_quantity_hint("Bread 500g")
        assert base == "Bread"
        assert qty == 500.0
        assert unit == "g"

    def test_extract_kilogram_quantity(self):
        """Test extraction of kilogram quantities."""
        base, qty, unit = extract_quantity_hint("Apples 1.5kg")
        assert base == "Apples"
        assert qty == 1.5
        assert unit == "kg"

    def test_extract_liter_quantity(self):
        """Test extraction of liter quantities."""
        base, qty, unit = extract_quantity_hint("Milk 1L")
        assert base == "Milk"
        assert qty == 1.0
        assert unit == "l"

    def test_extract_milliliter_quantity(self):
        """Test extraction of milliliter quantities."""
        base, qty, unit = extract_quantity_hint("Juice 250ml")
        assert base == "Juice"
        assert qty == 250.0
        assert unit == "ml"

    def test_quantity_with_space(self):
        """Test extraction when there's a space before unit."""
        base, qty, unit = extract_quantity_hint("Water 0.5 L")
        assert base == "Water"
        assert qty == 0.5
        assert unit == "l"

    def test_no_quantity(self):
        """Test when no quantity is present."""
        base, qty, unit = extract_quantity_hint("Bread")
        assert base == "Bread"
        assert qty is None
        assert unit is None

    def test_comma_decimal_separator(self):
        """Test extraction with comma as decimal separator."""
        base, qty, unit = extract_quantity_hint("Milk 1,5L")
        assert base == "Milk"
        assert qty == 1.5
        assert unit == "l"


class TestLookupChainName:
    """Tests for lookup_chain_name function."""

    def test_known_ico_lidl(self):
        """Test that Lidl IČO returns 'Lidl'."""
        assert lookup_chain_name("35532773") == "Lidl"

    def test_known_ico_tesco(self):
        """Test that Tesco IČO returns 'Tesco'."""
        assert lookup_chain_name("31322571") == "Tesco"

    def test_known_ico_kaufland(self):
        """Test that Kaufland IČO returns 'Kaufland'."""
        assert lookup_chain_name("36488526") == "Kaufland"

    def test_unknown_ico_fallback(self):
        """Test that unknown IČO returns 'Store XXXXXXXX'."""
        assert lookup_chain_name("99999999") == "Store 99999999"

    def test_unknown_ico_different(self):
        """Test fallback with another unknown IČO."""
        assert lookup_chain_name("12345678") == "Store 12345678"


class TestNormalizeCategory:
    """Tests for normalize_category function."""

    def test_canonical_category_passthrough(self):
        """Canonical category values are returned unchanged."""
        assert normalize_category("dairy") == "dairy"
        assert normalize_category("bakery") == "bakery"
        assert normalize_category("pantry") == "pantry"
        assert normalize_category("produce") == "produce"

    def test_uppercase_category(self):
        """Uppercase input is lowercased to match the canonical form."""
        assert normalize_category("Dairy") == "dairy"
        assert normalize_category("MEAT") == "meat"
        assert normalize_category("Bakery") == "bakery"

    def test_diacritic_category(self):
        """Slovak diacritics are stripped before matching."""
        assert normalize_category("Mäso") == "meat"      # mäso → maso alias
        assert normalize_category("mrazené") == "frozen"  # mrazené → mrazene alias

    def test_category_alias(self):
        """Known aliases map to their canonical category."""
        assert normalize_category("Milk Products") == "dairy"
        assert normalize_category("Frozen Foods") == "frozen"
        assert normalize_category("Alcoholic Beverages") == "alcohol"
        assert normalize_category("Cold Cuts") == "deli"

    def test_unknown_category_returns_none(self):
        """Unrecognised category strings return None."""
        assert normalize_category("unknown stuff") is None
        assert normalize_category("random") is None

    def test_none_input(self):
        """None input returns None."""
        assert normalize_category(None) is None

    def test_empty_string(self):
        """Empty or whitespace-only input returns None."""
        assert normalize_category("") is None
        assert normalize_category("   ") is None
