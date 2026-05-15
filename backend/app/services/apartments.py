"""Apartment create / update / recalculate pipeline.

The pipeline:
    1. Persist the listing data with the requesting user_id.
    2. Geocode the address (cached).
    3. In parallel: compute commute (Routes API) and nearby places (Places API).
    4. Run the full scoring battery — see ``scoring.score_apartment``.
    5. Persist every score column + the JSONB breakdown + poi_snapshot.

All commute/places failures degrade gracefully — scoring runs on whatever
inputs are available, and ``score_breakdown`` records what was missing.
"""

from __future__ import annotations

import asyncio
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import Apartment, Commute, TargetLocation
from ..schemas import ApartmentCreate, ApartmentUpdate
from .geocoder import GeocodingError, geocode_address
from .google_routes import GoogleRoutesError
from .otp import OTPError
from .places import PlacesError, nearby_summary
from .routing import calculate_both_commutes_to_target
from .scoring import score_apartment


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _normalize_mode(mode: str | None) -> str:
    mode = (mode or "transit").strip().lower()
    return mode if mode in {"transit", "car", "cycling", "walking"} else "transit"


def _upsert_commute(db: Session, apartment: Apartment, direction: str, mode: str, data: dict) -> None:
    mode = _normalize_mode(mode)
    commute = next((item for item in apartment.commutes if item.direction == direction and item.mode == mode), None)
    if commute is None:
        commute = Commute(apartment_id=apartment.id, direction=direction, mode=mode)
        db.add(commute)
        apartment.commutes.append(commute)
    commute.mode = mode
    for key, value in data.items():
        setattr(commute, key, value)


def _current_target(db: Session, user_id: str) -> TargetLocation:
    target = db.query(TargetLocation).filter(TargetLocation.user_id == user_id).first()
    if target:
        return target
    settings = get_settings()
    target = TargetLocation(
        user_id=user_id,
        label="Office",
        address=settings.bloomberg_address,
        commute_mode="transit",
        latitude=settings.bloomberg_lat,
        longitude=settings.bloomberg_lon,
    )
    db.add(target)
    db.commit()
    db.refresh(target)
    return target


def _selected_commute(apartment: Apartment, direction: str, mode: str) -> Commute | None:
    mode = _normalize_mode(mode)
    return (
        next((c for c in apartment.commutes if c.direction == direction and c.mode == mode), None)
        or next((c for c in apartment.commutes if c.direction == direction and c.mode == "transit"), None)
        or next((c for c in apartment.commutes if c.direction == direction), None)
    )


def _apply_scores(apartment: Apartment, scoring_result: dict[str, Any], poi: dict[str, list[dict]], mode: str) -> None:
    scores = scoring_result["scores"]
    apartment.commute_score = scores.get("commute")
    apartment.gym_score = scores.get("gym")
    apartment.grocery_score = scores.get("grocery")
    apartment.walkability_score = scores.get("walkability")
    apartment.nightlife_score = scores.get("nightlife")
    apartment.quietness_score = scores.get("quietness")
    apartment.lifestyle_score = scores.get("lifestyle")
    apartment.daily_friction_score = scores.get("daily_friction")
    apartment.overall_score = scores.get("overall")
    apartment.score_breakdown = scoring_result["breakdown"]
    apartment.poi_snapshot = {
        category: {"count": len(items), "nearest": items[0] if items else None}
        for category, items in poi.items()
        if not category.startswith("__")
    }
    if poi.get("__errors__"):
        apartment.poi_snapshot["__errors__"] = poi["__errors__"]

    # Denormalized commute minutes for fast sort/filter
    morning = _selected_commute(apartment, "morning", mode)
    evening = _selected_commute(apartment, "evening", mode)
    apartment.commute_minutes_morning = morning.total_minutes if morning else None
    apartment.commute_minutes_evening = evening.total_minutes if evening else None


async def _fetch_pipeline_inputs(
    db: Session,
    apartment: Apartment,
    target: TargetLocation,
) -> tuple[dict[str, dict] | None, dict[str, list[dict]] | None, list[str]]:
    """Run commute + places fetches in parallel. Each can independently fail.

    Returns ``(commute_data | None, poi_summary | None, error_messages)``.
    """
    assert apartment.latitude is not None and apartment.longitude is not None

    async def _commute() -> dict[str, dict]:
        return await calculate_both_commutes_to_target(
            apartment.latitude,
            apartment.longitude,
            target.latitude,
            target.longitude,
            target.commute_mode,
        )

    async def _places() -> dict[str, list[dict]]:
        return await nearby_summary(db, apartment.latitude, apartment.longitude)

    commute_task = asyncio.create_task(_commute())
    places_task = asyncio.create_task(_places())
    commute_data: dict[str, dict] | None = None
    places: dict[str, list[dict]] | None = None
    errors: list[str] = []

    try:
        commute_data = await commute_task
    except (OTPError, GoogleRoutesError) as exc:
        errors.append(f"commute: {exc}")
    except Exception as exc:  # noqa: BLE001
        errors.append(f"commute (unexpected): {exc}")

    try:
        places = await places_task
    except PlacesError as exc:
        errors.append(f"places: {exc}")
    except Exception as exc:  # noqa: BLE001
        errors.append(f"places (unexpected): {exc}")

    return commute_data, places, errors


# --------------------------------------------------------------------------- #
# Public service surface
# --------------------------------------------------------------------------- #
async def create_apartment(db: Session, payload: ApartmentCreate, user_id: str) -> Apartment:
    """Create or update-by-address. Idempotent on (user_id, address)."""
    existing = (
        db.query(Apartment).filter(Apartment.user_id == user_id, Apartment.address == payload.address).first()
    )
    if existing:
        for key, value in payload.model_dump().items():
            if value is not None:
                setattr(existing, key, value)
        db.commit()
        db.refresh(existing)
        return await recalculate_apartment(db, existing)

    apartment = Apartment(**payload.model_dump(), user_id=user_id)
    db.add(apartment)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ValueError("An apartment with this address already exists.") from exc
    db.refresh(apartment)

    return await recalculate_apartment(db, apartment)


async def recalculate_apartment(db: Session, apartment: Apartment) -> Apartment:
    """Re-run the full pipeline: geocode (if needed) → commute + places → scores."""
    if apartment.latitude is None or apartment.longitude is None:
        try:
            lat, lon = await geocode_address(db, apartment.address)
            apartment.latitude = lat
            apartment.longitude = lon
        except GeocodingError as exc:
            apartment.score_breakdown = {"error": f"geocoding failed: {exc}"}
            db.commit()
            db.refresh(apartment)
            return apartment

    target = _current_target(db, apartment.user_id)
    commute_data, poi, errors = await _fetch_pipeline_inputs(db, apartment, target)

    if commute_data is None:
        # Record the failure on commute rows but keep going — places + lifestyle scores
        # can still be computed.
        message = next((err for err in errors if err.startswith("commute")), "commute calculation failed")
        for direction in ("morning", "evening"):
            _upsert_commute(
                db,
                apartment,
                direction,
                target.commute_mode,
                {
                    "total_minutes": None,
                    "total_distance_km": None,
                    "transfers": None,
                    "walking_minutes": None,
                    "lines": None,
                    "estimated_arrival": None,
                    "route_summary": None,
                    "raw_error": message,
                },
            )
    else:
        for direction, data in commute_data.items():
            _upsert_commute(db, apartment, direction, target.commute_mode, data)

    poi = poi or {}
    scoring_result = score_apartment(apartment, poi, target.commute_mode)
    if poi.get("__errors__"):
        errors.extend([f"places {item.get('category')}: {item.get('error')}" for item in poi["__errors__"]])
    if errors:
        scoring_result["breakdown"]["pipeline_errors"] = errors
    _apply_scores(apartment, scoring_result, poi, target.commute_mode)

    db.commit()
    db.refresh(apartment)
    return apartment


def update_apartment(db: Session, apartment: Apartment, payload: ApartmentUpdate) -> Apartment:
    """Patch fields on an apartment. Rescores against existing POI snapshot."""
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(apartment, key, value)

    # Re-run scoring against cached poi_snapshot so toggling e.g. building_has_gym
    # immediately updates gym_score without a full network re-fetch.
    poi = _reconstruct_poi_from_snapshot(apartment.poi_snapshot)
    target = _current_target(db, apartment.user_id)
    scoring_result = score_apartment(apartment, poi, target.commute_mode)
    _apply_scores(apartment, scoring_result, poi, target.commute_mode)

    db.commit()
    db.refresh(apartment)
    return apartment


def _reconstruct_poi_from_snapshot(snapshot: dict[str, Any] | None) -> dict[str, list[dict]]:
    """The poi_snapshot stores ``{category: {count, nearest}}``. Rescoring only
    looks at the nearest hit + the count, so we synthesize a thin list per
    category — enough for ``scoring.*`` to recompute without a network call.
    """
    if not snapshot:
        return {}
    out: dict[str, list[dict]] = {}
    for category, entry in snapshot.items():
        nearest = entry.get("nearest") if isinstance(entry, dict) else None
        count = entry.get("count", 0) if isinstance(entry, dict) else 0
        if nearest:
            # Fill list with the nearest hit + ``count - 1`` distance-padded clones so
            # density-based scorers still see the right count.
            padding = max(0, count - 1)
            out[category] = [nearest] + [{**nearest, "name": "(cached)"} for _ in range(padding)]
        else:
            out[category] = []
    return out
