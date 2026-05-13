from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import Apartment, Commute, TargetLocation
from ..schemas import ApartmentCreate, ApartmentUpdate
from .geocoder import geocode_address
from .google_routes import GoogleRoutesError
from .otp import OTPError
from .routing import calculate_both_commutes_to_target
from .scoring import commute_score


def _upsert_commute(db: Session, apartment: Apartment, direction: str, data: dict) -> None:
    commute = next((item for item in apartment.commutes if item.direction == direction), None)
    if commute is None:
        commute = Commute(apartment_id=apartment.id, direction=direction)
        db.add(commute)
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
        latitude=settings.bloomberg_lat,
        longitude=settings.bloomberg_lon,
    )
    db.add(target)
    db.commit()
    db.refresh(target)
    return target


async def create_apartment(db: Session, payload: ApartmentCreate, user_id: str) -> Apartment:
    existing = db.query(Apartment).filter(Apartment.user_id == user_id, Apartment.address == payload.address).first()
    if existing:
        for key, value in payload.model_dump().items():
            if value is not None:
                setattr(existing, key, value)
        return await recalculate_apartment(db, existing)

    apartment = Apartment(**payload.model_dump(), user_id=user_id)
    db.add(apartment)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ValueError("An apartment with this address already exists.") from exc
    db.refresh(apartment)

    try:
        lat, lon = await geocode_address(db, apartment.address)
        apartment.latitude = lat
        apartment.longitude = lon
        target = _current_target(db, user_id)
        commute_data = await calculate_both_commutes_to_target(lat, lon, target.latitude, target.longitude)
        for direction, data in commute_data.items():
            _upsert_commute(db, apartment, direction, data)
    except Exception as exc:
        message = str(exc)
        if isinstance(exc, OTPError | GoogleRoutesError):
            message = f"Commute pending: {message}"
        for direction in ("morning", "evening"):
            _upsert_commute(db, apartment, direction, {"raw_error": message})

    apartment.commute_score = commute_score(apartment)
    db.commit()
    db.refresh(apartment)
    return apartment


async def recalculate_apartment(db: Session, apartment: Apartment) -> Apartment:
    lat, lon = apartment.latitude, apartment.longitude
    if lat is None or lon is None:
        lat, lon = await geocode_address(db, apartment.address)
        apartment.latitude = lat
        apartment.longitude = lon
    target = _current_target(db, apartment.user_id)
    commute_data = await calculate_both_commutes_to_target(lat, lon, target.latitude, target.longitude)
    for direction, data in commute_data.items():
        _upsert_commute(db, apartment, direction, data)
    apartment.commute_score = commute_score(apartment)
    db.commit()
    db.refresh(apartment)
    return apartment


def update_apartment(db: Session, apartment: Apartment, payload: ApartmentUpdate) -> Apartment:
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(apartment, key, value)
    apartment.commute_score = commute_score(apartment)
    db.commit()
    db.refresh(apartment)
    return apartment
