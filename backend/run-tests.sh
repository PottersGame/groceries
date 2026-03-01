#!/usr/bin/env bash
# Run backend tests

set -e

cd "$(dirname "$0")"

echo "🧪 Running PantryPal SK Backend Tests..."
echo ""

# Activate virtual environment if it exists
if [ -d "venv" ]; then
    source venv/bin/activate
fi

# Run tests with coverage
python -m pytest tests/ -v --cov=backend --cov-report=term-missing --cov-report=html

echo ""
echo "✅ Test run complete"
echo "📊 Coverage report generated in htmlcov/index.html"
