from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import Apartment, TargetLocation
from ..schemas import TargetLocationUpdate
from .apartments import recalculate_apartment
from .geocoder import geocode_address


def get_target(db: Session, user_id: str) -> TargetLocation:
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


async def update_target(db: Session, payload: TargetLocationUpdate, user_id: str, recalculate: bool = True) -> TargetLocation:
    target = get_target(db, user_id)
    lat, lon = await geocode_address(db, payload.address)
    target.label = payload.label or "Office"
    target.address = payload.address
    target.commute_mode = payload.commute_mode
    target.latitude = lat
    target.longitude = lon
    db.commit()
    db.refresh(target)

    if recalculate:
        apartments = db.query(Apartment).filter(Apartment.user_id == user_id).all()
        for apartment in apartments:
            await recalculate_apartment(db, apartment)
        db.refresh(target)

    return target
