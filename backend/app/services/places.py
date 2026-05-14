"""Google Places API (New) nearby-search wrapper with a Postgres-backed cache.

Used by the scoring pipeline to count and rank nearby gyms, grocery stores,
cafés, restaurants, parks, and subway stations.  Each apartment triggers one
``nearby_summary`` call which fans out to six Places categories and persists
the normalized results in ``places_cache``.

Design notes
------------
* The Places API (New) lives at ``places.googleapis.com/v1/places:searchNearby``
  and is billed per category, so we batch through a single call per category
  rather than one ``includedTypes`` request with many types — that keeps
  cache buckets per-category rather than global.
* We bucket coordinates to ~110 m precision (3 decimal places) so two
  apartments on the same block reuse the same cache row.
* Cache TTL is configurable via ``PLACES_CACHE_TTL_DAYS`` (default 30).
"""

from __future__ import annotations

import asyncio
import math
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Iterable

import httpx
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import PlacesCache


class PlacesError(RuntimeError):
    """Raised when the Places API call fails. Non-fatal — scoring degrades gracefully."""


# Category → Places API "includedTypes" mapping.  The Places API (New) uses
# table-A primary types; see https://developers.google.com/maps/documentation/places/web-service/place-types
CATEGORY_TYPES: dict[str, list[str]] = {
    "gym": ["gym", "fitness_center"],
    "grocery_store": ["grocery_store", "supermarket"],
    "cafe": ["cafe", "coffee_shop"],
    "restaurant": ["restaurant"],
    "park": ["park"],
    "subway_station": ["subway_station", "transit_station"],
}

# Brand bonus list — when these names appear in nearby groceries we bump the
# grocery_score.  Pure heuristic, transparent.
GROCERY_BRAND_BONUS = {
    "trader joe's": 2.0,
    "whole foods": 2.0,
    "whole foods market": 2.0,
    "target": 1.0,
    "wegmans": 1.5,
    "fairway": 1.0,
    "h mart": 1.0,
    "h-mart": 1.0,
}


@dataclass(frozen=True)
class PlaceHit:
    name: str
    distance_m: float
    rating: float | None
    user_rating_count: int | None
    place_id: str
    types: tuple[str, ...]
    lat: float
    lon: float

    def as_dict(self) -> dict:
        return {
            "name": self.name,
            "distance_m": round(self.distance_m, 1),
            "rating": self.rating,
            "user_rating_count": self.user_rating_count,
            "place_id": self.place_id,
            "types": list(self.types),
            "lat": self.lat,
            "lon": self.lon,
        }


# --------------------------------------------------------------------------- #
# Coordinate helpers
# --------------------------------------------------------------------------- #
def _bucket(value: float, precision: int = 3) -> float:
    return round(value, precision)


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in meters."""
    r = 6_371_000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


# --------------------------------------------------------------------------- #
# Cache layer
# --------------------------------------------------------------------------- #
def _cached(db: Session, lat: float, lon: float, category: str, radius_m: int) -> list[dict] | None:
    settings = get_settings()
    cutoff = datetime.now(timezone.utc) - timedelta(days=settings.places_cache_ttl_days)
    row = (
        db.query(PlacesCache)
        .filter(
            PlacesCache.lat_bucket == _bucket(lat),
            PlacesCache.lon_bucket == _bucket(lon),
            PlacesCache.category == category,
            PlacesCache.radius_m == radius_m,
        )
        .first()
    )
    if not row:
        return None
    # `created_at` may be naive in tests; treat as UTC.
    created = row.created_at if row.created_at.tzinfo else row.created_at.replace(tzinfo=timezone.utc)
    if created < cutoff:
        db.delete(row)
        db.commit()
        return None
    return row.payload


def _write_cache(db: Session, lat: float, lon: float, category: str, radius_m: int, payload: list[dict]) -> None:
    row = PlacesCache(
        lat_bucket=_bucket(lat),
        lon_bucket=_bucket(lon),
        category=category,
        radius_m=radius_m,
        payload=payload,
    )
    db.add(row)
    try:
        db.commit()
    except Exception:
        db.rollback()  # concurrent write — ignore, next read will use the existing row


# --------------------------------------------------------------------------- #
# Places API call
# --------------------------------------------------------------------------- #
async def _places_nearby(
    client: httpx.AsyncClient,
    lat: float,
    lon: float,
    category: str,
    radius_m: int,
) -> list[PlaceHit]:
    settings = get_settings()
    if not settings.google_maps_api_key:
        raise PlacesError("GOOGLE_MAPS_API_KEY is missing from backend/.env.")

    body = {
        "includedTypes": CATEGORY_TYPES[category],
        "maxResultCount": 15,
        "rankPreference": "DISTANCE",
        "locationRestriction": {
            "circle": {
                "center": {"latitude": lat, "longitude": lon},
                "radius": float(radius_m),
            }
        },
    }
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": settings.google_maps_api_key,
        "X-Goog-FieldMask": ",".join(
            [
                "places.id",
                "places.displayName",
                "places.location",
                "places.rating",
                "places.userRatingCount",
                "places.types",
            ]
        ),
    }
    try:
        response = await client.post(
            "https://places.googleapis.com/v1/places:searchNearby",
            json=body,
            headers=headers,
            timeout=20,
        )
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code in {403, 404}:
            return await _legacy_places_nearby(client, lat, lon, category, radius_m)
        raise PlacesError(_compact_places_error(category, exc.response.status_code, exc.response.text)) from exc
    except httpx.HTTPError as exc:
        raise PlacesError(f"Places API request failed ({category}): {exc}") from exc

    payload = response.json() or {}
    results = payload.get("places") or []
    hits: list[PlaceHit] = []
    for place in results:
        location = place.get("location") or {}
        plat = location.get("latitude")
        plon = location.get("longitude")
        if plat is None or plon is None:
            continue
        hits.append(
            PlaceHit(
                name=(place.get("displayName") or {}).get("text") or "Unnamed place",
                distance_m=_haversine_m(lat, lon, plat, plon),
                rating=place.get("rating"),
                user_rating_count=place.get("userRatingCount"),
                place_id=place.get("id") or "",
                types=tuple(place.get("types") or ()),
                lat=plat,
                lon=plon,
            )
        )
    hits.sort(key=lambda h: h.distance_m)
    return hits


async def _legacy_places_nearby(
    client: httpx.AsyncClient,
    lat: float,
    lon: float,
    category: str,
    radius_m: int,
) -> list[PlaceHit]:
    """Fallback for projects where Places API (New) SearchNearby is blocked.

    This uses the older Nearby Search endpoint. It is still free to keep behind
    the same cache layer, and it gives enough name/rating/location data for the
    transparent scoring heuristics.
    """
    settings = get_settings()
    legacy_types = {
        "gym": ["gym"],
        "grocery_store": ["grocery_or_supermarket", "supermarket"],
        "cafe": ["cafe"],
        "restaurant": ["restaurant"],
        "park": ["park"],
        "subway_station": ["subway_station", "transit_station"],
    }.get(category, [category])

    hits: list[PlaceHit] = []
    last_error = ""
    for legacy_type in legacy_types:
        params = {
            "location": f"{lat},{lon}",
            "radius": radius_m,
            "type": legacy_type,
            "key": settings.google_maps_api_key,
        }
        try:
            response = await client.get(
                "https://maps.googleapis.com/maps/api/place/nearbysearch/json",
                params=params,
                timeout=20,
            )
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            last_error = _compact_places_error(category, exc.response.status_code, exc.response.text)
            continue
        except httpx.HTTPError as exc:
            last_error = f"Legacy Places request failed ({category}): {exc}"
            continue

        payload = response.json() or {}
        status = payload.get("status")
        if status not in {"OK", "ZERO_RESULTS"}:
            last_error = f"Legacy Places failed ({category}): {status} {payload.get('error_message') or ''}".strip()
            continue
        for place in payload.get("results") or []:
            location = (place.get("geometry") or {}).get("location") or {}
            plat = location.get("lat")
            plon = location.get("lng")
            if plat is None or plon is None:
                continue
            hits.append(
                PlaceHit(
                    name=place.get("name") or "Unnamed place",
                    distance_m=_haversine_m(lat, lon, plat, plon),
                    rating=place.get("rating"),
                    user_rating_count=place.get("user_ratings_total"),
                    place_id=place.get("place_id") or "",
                    types=tuple(place.get("types") or ()),
                    lat=plat,
                    lon=plon,
                )
            )
        if hits:
            break

    if last_error and not hits:
        raise PlacesError(last_error)
    deduped = {hit.place_id or f"{hit.name}:{hit.lat}:{hit.lon}": hit for hit in hits}
    ordered = sorted(deduped.values(), key=lambda h: h.distance_m)
    return ordered[:15]


def _compact_places_error(category: str, status_code: int, text: str) -> str:
    """Turn Google's long JSON error into a dashboard-sized diagnostic."""
    try:
        payload = httpx.Response(status_code, text=text).json()
        error = payload.get("error") or {}
        message = error.get("message") or text
        status = error.get("status") or status_code
        return f"Places {category}: {status} - {message[:180]}"
    except Exception:
        return f"Places {category}: HTTP {status_code} - {text[:180]}"


async def _fetch_or_cache_category(
    db: Session,
    client: httpx.AsyncClient,
    lat: float,
    lon: float,
    category: str,
    radius_m: int,
) -> list[dict]:
    cached = _cached(db, lat, lon, category, radius_m)
    if cached is not None:
        return cached
    hits = await _places_nearby(client, lat, lon, category, radius_m)
    payload = [hit.as_dict() for hit in hits]
    _write_cache(db, lat, lon, category, radius_m, payload)
    return payload


# --------------------------------------------------------------------------- #
# Public API
# --------------------------------------------------------------------------- #
async def nearby_summary(
    db: Session,
    lat: float,
    lon: float,
    categories: Iterable[str] | None = None,
) -> dict[str, list[dict]]:
    """Fetch normalized nearby places for each category, with cache.

    Returns a dict ``{category: [hit, hit, ...]}``. Each hit is the dict from
    :py:meth:`PlaceHit.as_dict`. Failures for individual categories degrade
    gracefully (empty list) so partial scoring is still possible.
    """
    settings = get_settings()
    radius = settings.places_search_radius_m
    cats = list(categories) if categories else list(CATEGORY_TYPES)

    summary: dict[str, list[dict]] = {category: [] for category in cats}
    errors: list[dict] = []

    async with httpx.AsyncClient() as client:
        tasks = [
            _fetch_or_cache_category(db, client, lat, lon, category, radius)
            for category in cats
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    for category, result in zip(cats, results, strict=True):
        if isinstance(result, Exception):
            errors.append({"category": category, "error": str(result)})
            summary[category] = []
        else:
            summary[category] = result

    if errors:
        summary["__errors__"] = errors
    return summary


def grocery_brand_bonus(hits: list[dict]) -> float:
    """Walk the grocery hits and return a cumulative brand bonus (0-3.0)."""
    bonus = 0.0
    for hit in hits:
        name = (hit.get("name") or "").lower()
        for needle, weight in GROCERY_BRAND_BONUS.items():
            if needle in name:
                bonus += weight
                break  # one brand per hit
    return min(bonus, 3.0)
