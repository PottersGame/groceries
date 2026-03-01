"""
Tests for product name normalization utilities.
"""

import pytest

from backend.utils import extract_quantity_hint, normalize_product_name


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
