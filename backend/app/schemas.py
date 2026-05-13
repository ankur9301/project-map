from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class ApartmentBase(BaseModel):
    address: str = Field(..., min_length=5, max_length=500)
    price: float | None = Field(default=None, ge=0)
    features: str | None = None
    bed: float | None = Field(default=None, ge=0)
    bath: float | None = Field(default=None, ge=0)
    vibe: str | None = None
    notes: str | None = None
    agent_name: str | None = None
    agent_phone: str | None = None
    agent_broker: str | None = None
    listing_url: str | None = None
    source: str | None = None
    favorite: bool = False


class ApartmentCreate(ApartmentBase):
    pass


class ApartmentUpdate(BaseModel):
    price: float | None = Field(default=None, ge=0)
    features: str | None = None
    bed: float | None = Field(default=None, ge=0)
    bath: float | None = Field(default=None, ge=0)
    vibe: str | None = None
    notes: str | None = None
    agent_name: str | None = None
    agent_phone: str | None = None
    agent_broker: str | None = None
    listing_url: str | None = None
    source: str | None = None
    favorite: bool | None = None


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


class ApartmentRead(ApartmentBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    latitude: float | None = None
    longitude: float | None = None
    commute_score: float | None = None
    created_at: datetime
    updated_at: datetime
    commutes: list[CommuteRead] = []


class ApartmentList(BaseModel):
    items: list[ApartmentRead]
    total: int


class TargetLocationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    label: str
    address: str
    latitude: float
    longitude: float


class TargetLocationUpdate(BaseModel):
    label: str | None = Field(default="Office", max_length=200)
    address: str = Field(..., min_length=5, max_length=500)
