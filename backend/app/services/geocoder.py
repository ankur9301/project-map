import httpx
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import GeocodeCache


class GeocodingError(RuntimeError):
    pass


def normalize_address(address: str) -> str:
    return " ".join(address.strip().lower().split())


def _address_candidates(address: str) -> list[str]:
    candidates = [address]
    without_hash_unit = address
    if "#" in without_hash_unit:
        before_hash, after_hash = without_hash_unit.split("#", 1)
        remainder = after_hash.split(",", 1)
        if len(remainder) == 2:
            without_hash_unit = f"{before_hash.strip()}, {remainder[1].strip()}"
        else:
            without_hash_unit = before_hash.strip()
        candidates.append(without_hash_unit)

    cleaned = (
        without_hash_unit.replace(" Apt ", " ")
        .replace(" apt ", " ")
        .replace(" Apartment ", " ")
        .replace(" apartment ", " ")
        .replace(" Unit ", " ")
        .replace(" unit ", " ")
    )
    candidates.append(cleaned)

    unique: list[str] = []
    for candidate in candidates:
        normalized = " ".join(candidate.replace(",,", ",").split()).strip(" ,")
        if normalized and normalized not in unique:
            unique.append(normalized)
    return unique


async def _geocode_with_google(address: str) -> tuple[float, float, str | None] | None:
    settings = get_settings()
    if not settings.google_maps_api_key:
        return None

    async with httpx.AsyncClient(timeout=20) as client:
        for candidate in _address_candidates(address):
            response = await client.get(
                "https://maps.googleapis.com/maps/api/geocode/json",
                params={
                    "address": candidate,
                    "components": "country:US",
                    "region": "us",
                    "key": settings.google_maps_api_key,
                },
            )
            response.raise_for_status()
            payload = response.json()
            status = payload.get("status")
            if status == "OK" and payload.get("results"):
                result = payload["results"][0]
                location = result["geometry"]["location"]
                return float(location["lat"]), float(location["lng"]), result.get("formatted_address")
            if status not in {"ZERO_RESULTS"}:
                message = payload.get("error_message") or status or "Unknown Google geocoding error"
                raise GeocodingError(f"Google geocoding failed: {message}")
    return None


async def _geocode_with_nominatim(address: str) -> tuple[float, float, str | None] | None:
    settings = get_settings()
    params = {"q": address, "format": "jsonv2", "limit": 1, "addressdetails": 1}
    headers = {"User-Agent": settings.nominatim_user_agent}
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(f"{settings.nominatim_base_url}/search", params=params, headers=headers)
        response.raise_for_status()

    results = response.json()
    if not results:
        return None

    result = results[0]
    return float(result["lat"]), float(result["lon"]), result.get("display_name")


async def geocode_address(db: Session, address: str) -> tuple[float, float]:
    settings = get_settings()
    normalized = normalize_address(address)
    cached = db.query(GeocodeCache).filter(GeocodeCache.address == normalized).first()
    if cached:
        return cached.latitude, cached.longitude

    try:
        result = None
        if settings.routing_provider.strip().lower() == "google":
            result = await _geocode_with_google(address)
        if result is None:
            result = await _geocode_with_nominatim(address)
    except httpx.HTTPError as exc:
        raise GeocodingError(f"Geocoding request failed: {exc}") from exc

    if result is None:
        raise GeocodingError("No geocoding result found for this address.")

    lat, lon, display_name = result
    db.add(GeocodeCache(address=normalized, latitude=lat, longitude=lon, display_name=display_name))
    db.commit()
    return lat, lon
