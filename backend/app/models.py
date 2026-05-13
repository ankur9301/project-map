from datetime import datetime
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class Apartment(Base):
    __tablename__ = "apartments"
    __table_args__ = (UniqueConstraint("user_id", "address", name="uq_apartment_user_address"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[str] = mapped_column(String(80), nullable=False, default="local", index=True)
    address: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    price: Mapped[float | None] = mapped_column(Float, nullable=True)
    features: Mapped[str | None] = mapped_column(Text, nullable=True)
    bed: Mapped[float | None] = mapped_column(Float, nullable=True)
    bath: Mapped[float | None] = mapped_column(Float, nullable=True)
    vibe: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    agent_name: Mapped[str | None] = mapped_column(String(300), nullable=True)
    agent_phone: Mapped[str | None] = mapped_column(String(80), nullable=True)
    agent_broker: Mapped[str | None] = mapped_column(String(300), nullable=True)
    listing_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str | None] = mapped_column(String(80), nullable=True)
    favorite: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    commute_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    commutes: Mapped[list["Commute"]] = relationship(
        back_populates="apartment",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class Commute(Base):
    __tablename__ = "commutes"
    __table_args__ = (UniqueConstraint("apartment_id", "direction", name="uq_commute_apartment_direction"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    apartment_id: Mapped[int] = mapped_column(ForeignKey("apartments.id"), nullable=False, index=True)
    direction: Mapped[str] = mapped_column(String(20), nullable=False)
    total_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_distance_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    transfers: Mapped[int | None] = mapped_column(Integer, nullable=True)
    walking_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    lines: Mapped[str | None] = mapped_column(Text, nullable=True)
    estimated_arrival: Mapped[str | None] = mapped_column(String(40), nullable=True)
    route_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    apartment: Mapped[Apartment] = relationship(back_populates="commutes")


class GeocodeCache(Base):
    __tablename__ = "geocode_cache"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    address: Mapped[str] = mapped_column(String(500), nullable=False, unique=True, index=True)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    display_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class TargetLocation(Base):
    __tablename__ = "target_location"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[str] = mapped_column(String(80), nullable=False, default="local", unique=True, index=True)
    label: Mapped[str] = mapped_column(String(200), nullable=False, default="Office")
    address: Mapped[str] = mapped_column(String(500), nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
