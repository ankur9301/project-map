"""SQLAlchemy models for the v2 apartment decision-intelligence schema.

Canonical schema lives in `backend/db/migrations/0001_decision_intelligence.sql`.
These models exist purely for the FastAPI runtime to read/write Supabase Postgres;
they do NOT recreate the schema (we no longer call ``Base.metadata.create_all``).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


# --------------------------------------------------------------------------- #
# Apartments
# --------------------------------------------------------------------------- #
class Apartment(Base):
    __tablename__ = "apartments"
    __table_args__ = (
        UniqueConstraint("user_id", "address", name="uq_apartment_user_address"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    user_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False, index=True)

    # Listing identity
    address: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    listing_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Basics
    price: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    beds: Mapped[float | None] = mapped_column(Numeric(3, 1), nullable=True)
    baths: Mapped[float | None] = mapped_column(Numeric(3, 1), nullable=True)
    sqft: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Building amenities
    building_has_gym: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    pet_friendly: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Geo
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    neighborhood_name: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Denormalized commute snapshots
    commute_minutes_morning: Mapped[int | None] = mapped_column(Integer, nullable=True)
    commute_minutes_evening: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Scores (0-10 except overall_score which is 0-100)
    commute_score: Mapped[float | None] = mapped_column(Numeric(4, 1), nullable=True)
    grocery_score: Mapped[float | None] = mapped_column(Numeric(4, 1), nullable=True)
    gym_score: Mapped[float | None] = mapped_column(Numeric(4, 1), nullable=True)
    nightlife_score: Mapped[float | None] = mapped_column(Numeric(4, 1), nullable=True)
    quietness_score: Mapped[float | None] = mapped_column(Numeric(4, 1), nullable=True)
    walkability_score: Mapped[float | None] = mapped_column(Numeric(4, 1), nullable=True)
    lifestyle_score: Mapped[float | None] = mapped_column(Numeric(4, 1), nullable=True)
    daily_friction_score: Mapped[float | None] = mapped_column(Numeric(4, 1), nullable=True)
    overall_score: Mapped[float | None] = mapped_column(Numeric(5, 1), nullable=True)

    # Audit trail JSONB
    score_breakdown: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    poi_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)

    # User-authored
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    vibe: Mapped[str | None] = mapped_column(Text, nullable=True)
    favorite: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Listing agent
    agent_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    agent_phone: Mapped[str | None] = mapped_column(Text, nullable=True)
    agent_broker: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    commutes: Mapped[list["Commute"]] = relationship(
        back_populates="apartment",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


# --------------------------------------------------------------------------- #
# Commutes
# --------------------------------------------------------------------------- #
class Commute(Base):
    __tablename__ = "commutes"
    __table_args__ = (
        UniqueConstraint("apartment_id", "direction", name="uq_commute_apartment_direction"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    apartment_id: Mapped[int] = mapped_column(ForeignKey("apartments.id", ondelete="CASCADE"), nullable=False, index=True)
    direction: Mapped[str] = mapped_column(String(20), nullable=False)
    total_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_distance_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    transfers: Mapped[int | None] = mapped_column(Integer, nullable=True)
    walking_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    lines: Mapped[str | None] = mapped_column(Text, nullable=True)
    estimated_arrival: Mapped[str | None] = mapped_column(Text, nullable=True)
    route_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    apartment: Mapped[Apartment] = relationship(back_populates="commutes")


# --------------------------------------------------------------------------- #
# Geocode cache (app-wide, no user_id)
# --------------------------------------------------------------------------- #
class GeocodeCache(Base):
    __tablename__ = "geocode_cache"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    address: Mapped[str] = mapped_column(Text, nullable=False, unique=True, index=True)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    display_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


# --------------------------------------------------------------------------- #
# Per-user target (office / destination)
# --------------------------------------------------------------------------- #
class TargetLocation(Base):
    __tablename__ = "target_location"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False, unique=True, index=True)
    label: Mapped[str] = mapped_column(Text, nullable=False, default="Office")
    address: Mapped[str] = mapped_column(Text, nullable=False)
    commute_mode: Mapped[str] = mapped_column(Text, nullable=False, default="transit")
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


# --------------------------------------------------------------------------- #
# Places cache (Places API nearby-search results bucketed by lat/lon/category)
# --------------------------------------------------------------------------- #
class PlacesCache(Base):
    __tablename__ = "places_cache"
    __table_args__ = (
        UniqueConstraint("lat_bucket", "lon_bucket", "category", "radius_m", name="uq_places_cache_bucket_category"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    lat_bucket: Mapped[float] = mapped_column(Float, nullable=False)
    lon_bucket: Mapped[float] = mapped_column(Float, nullable=False)
    category: Mapped[str] = mapped_column(Text, nullable=False)
    radius_m: Mapped[int] = mapped_column(Integer, nullable=False)
    payload: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
