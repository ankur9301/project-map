from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import httpx

from ..config import get_settings


class GoogleRoutesError(RuntimeError):
    pass


def _next_monday_at(time_text: str) -> datetime:
    settings = get_settings()
    now = datetime.now(ZoneInfo(settings.default_timezone))
    days_until_monday = (0 - now.weekday()) % 7
    target = now + timedelta(days=days_until_monday)
    hour, minute, second = [int(part) for part in time_text.split(":")]
    return target.replace(hour=hour, minute=minute, second=second, microsecond=0)


def _seconds(value: str | None) -> int:
    if not value:
        return 0
    if value.endswith("s"):
        value = value[:-1]
    try:
        return round(float(value))
    except ValueError:
        return 0


def _line_name(transit_details: dict) -> str | None:
    line = transit_details.get("transitLine") or {}
    vehicle = line.get("vehicle") or {}
    return (
        line.get("nameShort")
        or line.get("name")
        or line.get("shortName")
        or vehicle.get("name", {}).get("text")
        or vehicle.get("type")
    )


def _step_instruction(step: dict) -> str:
    instruction = (step.get("navigationInstruction") or {}).get("instructions")
    mode = step.get("travelMode", "WALK")
    duration = round(_seconds(step.get("staticDuration") or step.get("duration")) / 60)
    transit_details = step.get("transitDetails") or {}

    if mode == "TRANSIT":
        line_name = _line_name(transit_details) or "Transit"
        headsign = transit_details.get("headsign")
        if headsign:
            return f"{line_name} toward {headsign} ({duration} min)"
        return f"{line_name} ({duration} min)"

    if instruction:
        return f"{instruction} ({duration} min)"
    return f"{mode.title()} ({duration} min)"


def _google_travel_mode(mode: str) -> str:
    return {
        "transit": "TRANSIT",
        "car": "DRIVE",
        "cycling": "BICYCLE",
        "walking": "WALK",
    }.get((mode or "transit").strip().lower(), "TRANSIT")


def _extract_route(route: dict, depart_at: datetime) -> dict:
    legs = route.get("legs") or []
    steps = [step for leg in legs for step in (leg.get("steps") or [])]
    transit_steps = [step for step in steps if step.get("travelMode") == "TRANSIT"]
    walk_seconds = sum(
        _seconds(step.get("staticDuration") or step.get("duration"))
        for step in steps
        if step.get("travelMode") == "WALK"
    )
    line_names = [_line_name(step.get("transitDetails") or {}) for step in transit_steps]
    line_names = [name for name in line_names if name]
    total_seconds = _seconds(route.get("duration"))
    arrival = depart_at + timedelta(seconds=total_seconds)

    return {
        "total_minutes": round(total_seconds / 60),
        "total_distance_km": round((route.get("distanceMeters") or 0) / 1000, 2),
        "transfers": max(0, len(transit_steps) - 1),
        "walking_minutes": round(walk_seconds / 60),
        "lines": ", ".join(dict.fromkeys(line_names)) or "Walk only",
        "estimated_arrival": arrival.isoformat(),
        "route_summary": " -> ".join(_step_instruction(step) for step in steps),
        "raw_error": None,
    }


def _label_options(options: list[dict], travel_mode: str) -> str:
    if not options:
        return ""

    fastest_index = min(
        range(len(options)),
        key=lambda index: (
            options[index]["total_minutes"] or 9999,
            options[index]["transfers"] or 0,
            options[index]["walking_minutes"] or 0,
        ),
    )
    option = options[fastest_index]
    summary = option["route_summary"] or option["lines"] or "Route"
    if travel_mode != "TRANSIT":
        mode_label = {
            "DRIVE": "Car",
            "BICYCLE": "Cycling",
            "WALK": "Walking",
        }.get(travel_mode, travel_mode.title())
        return (
            f"Fastest: {option['total_minutes']} min, "
            f"{round(option['total_distance_km'] * 0.621371, 1)} mi, "
            f"{mode_label}. {summary}"
        )
    return (
        f"Fastest: {option['total_minutes']} min, "
        f"{option['transfers']} transfer(s), {option['walking_minutes']} min walk, "
        f"{option['lines']}. {summary}"
    )


async def plan_commute(
    from_lat: float,
    from_lon: float,
    to_lat: float,
    to_lon: float,
    depart_at: datetime,
    mode: str = "transit",
) -> dict:
    settings = get_settings()
    if not settings.google_maps_api_key:
        raise GoogleRoutesError("GOOGLE_MAPS_API_KEY is missing from backend/.env.")

    travel_mode = _google_travel_mode(mode)
    body = {
        "origin": {"location": {"latLng": {"latitude": from_lat, "longitude": from_lon}}},
        "destination": {"location": {"latLng": {"latitude": to_lat, "longitude": to_lon}}},
        "travelMode": travel_mode,
        "computeAlternativeRoutes": travel_mode in {"TRANSIT", "DRIVE"},
        "languageCode": "en-US",
        "units": "IMPERIAL",
    }
    if travel_mode in {"TRANSIT", "DRIVE"}:
        body["departureTime"] = depart_at.astimezone(UTC).isoformat().replace("+00:00", "Z")
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": settings.google_maps_api_key,
        "X-Goog-FieldMask": ",".join(
            [
                "routes.duration",
                "routes.distanceMeters",
                "routes.legs.steps.travelMode",
                "routes.legs.steps.staticDuration",
                "routes.legs.steps.distanceMeters",
                "routes.legs.steps.navigationInstruction",
                "routes.legs.steps.transitDetails",
            ]
        ),
    }

    try:
        async with httpx.AsyncClient(timeout=45) as client:
            response = await client.post(
                "https://routes.googleapis.com/directions/v2:computeRoutes",
                json=body,
                headers=headers,
            )
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text[:500]
        raise GoogleRoutesError(f"Google Routes request failed: {exc.response.status_code} {detail}") from exc
    except httpx.HTTPError as exc:
        raise GoogleRoutesError(f"Google Routes request failed: {exc}") from exc

    routes = response.json().get("routes") or []
    if not routes:
        raise GoogleRoutesError(f"Google Routes returned no {mode or 'transit'} route for this trip.")

    options = [_extract_route(route, depart_at) for route in routes[:3]]
    options.sort(
        key=lambda option: (
            option["total_minutes"] or 9999,
            option["transfers"] or 0,
            option["walking_minutes"] or 0,
        )
    )
    best = options[0]
    best["route_summary"] = _label_options(options, travel_mode)
    best["lines"] = best["lines"] if travel_mode == "TRANSIT" else travel_mode.title()
    if travel_mode != "TRANSIT":
        best["transfers"] = 0
        best["walking_minutes"] = best["total_minutes"] if travel_mode == "WALK" else 0
    return best


async def calculate_both_commutes(home_lat: float, home_lon: float) -> dict[str, dict]:
    settings = get_settings()
    morning_at = _next_monday_at(settings.morning_departure_time)
    evening_at = _next_monday_at(settings.evening_departure_time)
    morning = await plan_commute(home_lat, home_lon, settings.bloomberg_lat, settings.bloomberg_lon, morning_at)
    evening = await plan_commute(settings.bloomberg_lat, settings.bloomberg_lon, home_lat, home_lon, evening_at)
    return {"morning": morning, "evening": evening}


async def calculate_both_commutes_to_target(
    home_lat: float,
    home_lon: float,
    target_lat: float,
    target_lon: float,
    mode: str = "transit",
) -> dict[str, dict]:
    settings = get_settings()
    morning_at = _next_monday_at(settings.morning_departure_time)
    evening_at = _next_monday_at(settings.evening_departure_time)
    morning = await plan_commute(home_lat, home_lon, target_lat, target_lon, morning_at, mode)
    evening = await plan_commute(target_lat, target_lon, home_lat, home_lon, evening_at, mode)
    return {"morning": morning, "evening": evening}
