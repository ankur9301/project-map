from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import Apartment, TargetLocation
from ..schemas import TargetLocationUpdate
from .apartments import recalculate_apartment
from .geocoder import geocode_address


def get_target(db: Session) -> TargetLocation:
    target = db.get(TargetLocation, 1)
    if target:
        return target

    settings = get_settings()
    target = TargetLocation(
        id=1,
        label="Office",
        address=settings.bloomberg_address,
        latitude=settings.bloomberg_lat,
        longitude=settings.bloomberg_lon,
    )
    db.add(target)
    db.commit()
    db.refresh(target)
    return target


async def update_target(db: Session, payload: TargetLocationUpdate, recalculate: bool = True) -> TargetLocation:
    target = get_target(db)
    lat, lon = await geocode_address(db, payload.address)
    target.label = payload.label or "Office"
    target.address = payload.address
    target.latitude = lat
    target.longitude = lon
    db.commit()
    db.refresh(target)

    if recalculate:
        apartments = db.query(Apartment).all()
        for apartment in apartments:
            await recalculate_apartment(db, apartment)
        db.refresh(target)

    return target
