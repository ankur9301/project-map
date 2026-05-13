from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
import httpx

from ..config import get_settings


class OTPError(RuntimeError):
    pass


def _next_monday_at(time_text: str) -> datetime:
    settings = get_settings()
    now = datetime.now(ZoneInfo(settings.default_timezone))
    days_until_monday = (0 - now.weekday()) % 7
    target = now + timedelta(days=days_until_monday)
    hour, minute, second = [int(part) for part in time_text.split(":")]
    return target.replace(hour=hour, minute=minute, second=second, microsecond=0)


def _format_lines(legs: list[dict]) -> tuple[str, str]:
    transit_lines: list[str] = []
    summaries: list[str] = []
    for leg in legs:
        mode = leg.get("mode", "WALK")
        route = leg.get("routeShortName") or leg.get("route") or ""
        headsign = leg.get("headsign") or leg.get("to", {}).get("name") or ""
        duration = round((leg.get("duration") or 0) / 60)
        if mode != "WALK" and route:
            transit_lines.append(str(route))
        label = f"{mode} {route}".strip()
        if headsign:
            label = f"{label} toward {headsign}".strip()
        summaries.append(f"{label} ({duration} min)")
    return ", ".join(dict.fromkeys(transit_lines)), " -> ".join(summaries)


async def plan_commute(
    from_lat: float,
    from_lon: float,
    to_lat: float,
    to_lon: float,
    depart_at: datetime,
) -> dict:
    settings = get_settings()
    params = {
        "fromPlace": f"{from_lat},{from_lon}",
        "toPlace": f"{to_lat},{to_lon}",
        "date": depart_at.strftime("%m-%d-%Y"),
        "time": depart_at.strftime("%I:%M%p"),
        "mode": "TRANSIT,WALK",
        "arriveBy": "false",
        "numItineraries": 1,
        "locale": "en",
    }

    try:
        async with httpx.AsyncClient(timeout=45) as client:
            response = await client.get(f"{settings.otp_base_url}/routers/default/plan", params=params)
            response.raise_for_status()
    except httpx.HTTPError as exc:
        raise OTPError(f"OTP request failed. Is the local OTP server running? {exc}") from exc

    payload = response.json()
    itineraries = payload.get("plan", {}).get("itineraries", [])
    if not itineraries:
        error = payload.get("error", {}).get("msg", "OTP returned no route.")
        raise OTPError(error)

    itinerary = itineraries[0]
    legs = itinerary.get("legs", [])
    lines, summary = _format_lines(legs)
    transit_legs = [leg for leg in legs if leg.get("mode") != "WALK"]
    arrival = datetime.fromtimestamp(itinerary["endTime"] / 1000, ZoneInfo(settings.default_timezone))
    return {
        "total_minutes": round((itinerary.get("duration") or 0) / 60),
        "total_distance_km": round(sum((leg.get("distance") or 0) for leg in legs) / 1000, 2),
        "transfers": max(0, len(transit_legs) - 1),
        "walking_minutes": round(sum((leg.get("duration") or 0) for leg in legs if leg.get("mode") == "WALK") / 60),
        "lines": lines or "Walk only",
        "estimated_arrival": arrival.isoformat(),
        "route_summary": summary,
        "raw_error": None,
    }


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
) -> dict[str, dict]:
    settings = get_settings()
    morning_at = _next_monday_at(settings.morning_departure_time)
    evening_at = _next_monday_at(settings.evening_departure_time)
    morning = await plan_commute(home_lat, home_lon, target_lat, target_lon, morning_at)
    evening = await plan_commute(target_lat, target_lon, home_lat, home_lon, evening_at)
    return {"morning": morning, "evening": evening}
