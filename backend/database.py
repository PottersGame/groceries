"""
PantryPal SK — Database Connection & Session Management

Provides SQLAlchemy engine, session factory, and dependency injection
for FastAPI endpoints.
"""

from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from .config import settings

# Create SQLAlchemy engine
engine = create_engine(
    settings.database_url,
    echo=settings.debug,
    pool_pre_ping=True,  # Verify connections before using them
    pool_size=5,
    max_overflow=10,
)

# Session factory
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency that provides a database session.

    Yields a SQLAlchemy session and ensures it's closed after the request.

    Example:
        ```python
        @app.post("/api/v1/prices/ingest")
        def ingest_prices(db: Session = Depends(get_db)):
            # Use db session here
            pass
        ```
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """
    Initialize database tables.

    Creates all tables defined in models.py if they don't exist.
    For production, use Alembic migrations instead.
    """
    from .models import Base

    Base.metadata.create_all(bind=engine)
