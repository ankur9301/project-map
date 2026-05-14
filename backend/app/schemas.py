"""Pydantic v2 schemas for the v2 decision-intelligence API."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


# --------------------------------------------------------------------------- #
# Commutes
# --------------------------------------------------------------------------- #
class CommuteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    direction: str
    total_minutes: int | None = None
    total_distance_km: float | None = None
    transfers: int | None = None
    walking_minutes: int | None = None
    lines: str | None = None
    estimated_arrival: str | None = None
    route_summary: str | None = None
    raw_error: str | None = None


# --------------------------------------------------------------------------- #
# Apartments
# --------------------------------------------------------------------------- #
class ApartmentBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    address: str = Field(..., min_length=5, max_length=500)
    listing_url: str | None = None
    image_url: str | None = None
    source: str | None = None

    price: float | None = Field(default=None, ge=0)
    beds: float | None = Field(default=None, ge=0, validation_alias=AliasChoices("beds", "bed"))
    baths: float | None = Field(default=None, ge=0, validation_alias=AliasChoices("baths", "bath"))
    sqft: int | None = Field(default=None, ge=0)

    building_has_gym: bool = False
    pet_friendly: bool = False

    neighborhood_name: str | None = None

    vibe: str | None = None
    notes: str | None = None
    favorite: bool = False

    agent_name: str | None = None
    agent_phone: str | None = None
    agent_broker: str | None = None


class ApartmentCreate(ApartmentBase):
    """Payload accepted by POST /apartments — extension and dashboard."""


class ApartmentUpdate(BaseModel):
    """PATCH /apartments/{id} — every field optional."""

    listing_url: str | None = None
    image_url: str | None = None
    source: str | None = None

    price: float | None = Field(default=None, ge=0)
    beds: float | None = Field(default=None, ge=0)
    baths: float | None = Field(default=None, ge=0)
    sqft: int | None = Field(default=None, ge=0)

    building_has_gym: bool | None = None
    pet_friendly: bool | None = None
    neighborhood_name: str | None = None

    vibe: str | None = None
    notes: str | None = None
    favorite: bool | None = None

    agent_name: str | None = None
    agent_phone: str | None = None
    agent_broker: str | None = None


class ApartmentRead(ApartmentBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: UUID

    latitude: float | None = None
    longitude: float | None = None

    commute_minutes_morning: int | None = None
    commute_minutes_evening: int | None = None

    # Scores (0-10 except overall_score which is 0-100)
    commute_score: float | None = None
    grocery_score: float | None = None
    gym_score: float | None = None
    nightlife_score: float | None = None
    quietness_score: float | None = None
    walkability_score: float | None = None
    lifestyle_score: float | None = None
    daily_friction_score: float | None = None
    overall_score: float | None = None

    score_breakdown: dict[str, Any] = Field(default_factory=dict)
    poi_snapshot: dict[str, Any] = Field(default_factory=dict)

    created_at: datetime
    updated_at: datetime
    commutes: list[CommuteRead] = []


class ApartmentList(BaseModel):
    items: list[ApartmentRead]
    total: int


class ScoreBreakdownRead(BaseModel):
    """Detailed score audit for /apartments/{id}/scores."""

    apartment_id: int
    overall_score: float | None = None
    components: dict[str, Any]
    poi_snapshot: dict[str, Any]


# --------------------------------------------------------------------------- #
# Target location
# --------------------------------------------------------------------------- #
class TargetLocationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    label: str
    address: str
    latitude: float
    longitude: float


class TargetLocationUpdate(BaseModel):
    label: str | None = Field(default="Office", max_length=200)
    address: str = Field(..., min_length=5, max_length=500)
