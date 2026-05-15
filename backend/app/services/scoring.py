"""Transparent heuristic scoring for the apartment decision-intelligence platform.

Each function below returns ``(score, breakdown)``:
* ``score`` is on a 0–10 scale (overall_score is 0–100).
* ``breakdown`` is a JSON-serializable dict explaining the inputs and weights
  that produced the score. The dashboard surfaces this so users can audit and
  trust the numbers — no AI black box.

Tune the weights via ``backend/.env`` (see ``Settings.weight_*``).
"""

from __future__ import annotations

from typing import Any

from ..config import get_settings
from ..models import Apartment
from .places import grocery_brand_bonus


ScoreResult = tuple[float | None, dict[str, Any]]


# =============================================================================
# Generic helpers
# =============================================================================
def _clamp(value: float, low: float = 0.0, high: float = 10.0) -> float:
    return round(max(low, min(high, value)), 1)


def _normalize_mode(mode: str | None) -> str:
    mode = (mode or "transit").strip().lower()
    return mode if mode in {"transit", "car", "cycling", "walking"} else "transit"


def _commute_lookup(apartment: Apartment, mode: str = "transit") -> tuple[Any, Any]:
    selected = _normalize_mode(mode)

    def find(direction: str) -> Any:
        return (
            next((commute for commute in apartment.commutes if commute.direction == direction and commute.mode == selected), None)
            or next((commute for commute in apartment.commutes if commute.direction == direction and commute.mode == "transit"), None)
            or next((commute for commute in apartment.commutes if commute.direction == direction), None)
        )

    return find("morning"), find("evening")


def _nearest_minutes_walk(distance_m: float | None, avg_walk_speed_mps: float = 1.3) -> float | None:
    """Convert a distance to minutes assuming a leisurely walking pace (~3 mph)."""
    if distance_m is None:
        return None
    return distance_m / avg_walk_speed_mps / 60


# =============================================================================
# Commute score (0-10)
#   shorter round trip = better; fewer transfers = better; less walking = better
# =============================================================================
def commute_score(apartment: Apartment, mode: str = "transit") -> ScoreResult:
    morning, evening = _commute_lookup(apartment, mode)
    if not morning or not evening or morning.total_minutes is None or evening.total_minutes is None:
        return None, {"reason": "commute data pending", "mode": _normalize_mode(mode)}

    round_trip = morning.total_minutes + evening.total_minutes
    avg_transfers = ((morning.transfers or 0) + (evening.transfers or 0)) / 2
    walk_min = (morning.walking_minutes or 0) + (evening.walking_minutes or 0)

    # Round-trip curve: 0 -> 10, 60 -> 8, 90 -> 6, 120 -> 4, 150+ -> 2
    if round_trip <= 60:
        base = 10.0
    elif round_trip <= 90:
        base = 8.0 - (round_trip - 60) / 15  # 60→8, 90→6
    elif round_trip <= 120:
        base = 6.0 - (round_trip - 90) / 15  # 90→6, 120→4
    elif round_trip <= 180:
        base = 4.0 - (round_trip - 120) / 30  # 120→4, 180→2
    else:
        base = 1.5

    transfer_penalty = avg_transfers * 0.8   # each transfer ≈ -0.8
    walk_penalty = max(0, (walk_min - 20)) * 0.05  # only penalize beyond 20 min total walking

    score = _clamp(base - transfer_penalty - walk_penalty)
    return score, {
        "round_trip_minutes": round_trip,
        "mode": _normalize_mode(mode),
        "avg_transfers": round(avg_transfers, 1),
        "total_walking_minutes": walk_min,
        "base_from_round_trip": round(base, 1),
        "transfer_penalty": round(transfer_penalty, 2),
        "walk_penalty": round(walk_penalty, 2),
    }


# =============================================================================
# Gym score (0-10)
#   in-building gym = 10; else use nearest gym walk distance
# =============================================================================
def gym_score(apartment: Apartment, gym_hits: list[dict]) -> ScoreResult:
    if apartment.building_has_gym:
        return 10.0, {"source": "in-building gym"}

    if not gym_hits:
        return _clamp(2.0), {"source": "no gyms within search radius"}

    nearest = gym_hits[0]
    dist = nearest.get("distance_m")
    walk_minutes = _nearest_minutes_walk(dist)
    if walk_minutes is None:
        return _clamp(3.0), {"source": "gym data malformed"}

    # 3 min walk = 9.5, 6 min = 8, 10 min = 6, 15 min = 4, 20+ min = 2
    if walk_minutes <= 3:
        score = 9.5
    elif walk_minutes <= 6:
        score = 9.5 - (walk_minutes - 3) / 2
    elif walk_minutes <= 10:
        score = 8.0 - (walk_minutes - 6) / 2
    elif walk_minutes <= 15:
        score = 6.0 - (walk_minutes - 10) / 2.5
    else:
        score = max(2.0, 4.0 - (walk_minutes - 15) / 5)

    rating = nearest.get("rating")
    # Tiny rating tilt: high-rated gym (>= 4.5) gets +0.3, low-rated (< 3.5) loses 0.3.
    if rating is not None:
        if rating >= 4.5:
            score += 0.3
        elif rating < 3.5:
            score -= 0.3

    return _clamp(score), {
        "source": "nearest gym",
        "name": nearest.get("name"),
        "walking_minutes": round(walk_minutes, 1),
        "distance_m": dist,
        "rating": rating,
        "count_in_radius": len(gym_hits),
    }


# =============================================================================
# Grocery score (0-10)
#   nearest grocery walking time + count density + brand bonus (TJ/WF/Target)
# =============================================================================
def grocery_score(grocery_hits: list[dict]) -> ScoreResult:
    if not grocery_hits:
        return _clamp(2.0), {"source": "no grocery stores within search radius"}

    nearest = grocery_hits[0]
    walk_minutes = _nearest_minutes_walk(nearest.get("distance_m"))
    if walk_minutes is None:
        return _clamp(3.0), {"source": "grocery data malformed"}

    # Distance baseline
    if walk_minutes <= 3:
        base = 9.0
    elif walk_minutes <= 7:
        base = 9.0 - (walk_minutes - 3) / 2  # 3→9, 7→7
    elif walk_minutes <= 12:
        base = 7.0 - (walk_minutes - 7) / 2.5  # 7→7, 12→5
    else:
        base = max(2.0, 5.0 - (walk_minutes - 12) / 5)

    density_bonus = min(1.0, max(0, len(grocery_hits) - 1) * 0.15)
    brand_bonus = grocery_brand_bonus(grocery_hits)

    score = base + density_bonus + brand_bonus * 0.6
    return _clamp(score), {
        "nearest_name": nearest.get("name"),
        "walking_minutes": round(walk_minutes, 1),
        "count_in_radius": len(grocery_hits),
        "base_from_walking": round(base, 1),
        "density_bonus": round(density_bonus, 2),
        "brand_bonus_raw": brand_bonus,
    }


# =============================================================================
# Walkability score (0-10)
#   POI density + restaurant/cafe access + subway access
# =============================================================================
def walkability_score(poi: dict[str, list[dict]]) -> ScoreResult:
    cafes = poi.get("cafe") or []
    restaurants = poi.get("restaurant") or []
    parks = poi.get("park") or []
    subways = poi.get("subway_station") or []
    groceries = poi.get("grocery_store") or []

    # POI density (each capped so one massive density doesn't dominate)
    poi_density = (
        min(len(restaurants), 15) * 0.18
        + min(len(cafes), 12) * 0.20
        + min(len(groceries), 8) * 0.20
        + min(len(parks), 6) * 0.20
    )  # max ~ 2.7 + 2.4 + 1.6 + 1.2 = 7.9

    # Subway access (nearest)
    subway_score = 0.0
    nearest_subway_min = None
    if subways:
        nearest_subway_min = _nearest_minutes_walk(subways[0].get("distance_m"))
        if nearest_subway_min is not None:
            if nearest_subway_min <= 3:
                subway_score = 2.2
            elif nearest_subway_min <= 6:
                subway_score = 2.2 - (nearest_subway_min - 3) * 0.3
            elif nearest_subway_min <= 12:
                subway_score = 1.3 - (nearest_subway_min - 6) * 0.15
            else:
                subway_score = max(0.0, 0.4 - (nearest_subway_min - 12) * 0.04)

    score = poi_density + subway_score
    return _clamp(score), {
        "poi_density_subscore": round(poi_density, 2),
        "subway_subscore": round(subway_score, 2),
        "nearest_subway_minutes": round(nearest_subway_min, 1) if nearest_subway_min is not None else None,
        "restaurants_count": len(restaurants),
        "cafes_count": len(cafes),
        "parks_count": len(parks),
        "groceries_count": len(groceries),
    }


# =============================================================================
# Nightlife score (0-10)
#   density of restaurants + bars + cafes within walking radius
# =============================================================================
def nightlife_score(poi: dict[str, list[dict]]) -> ScoreResult:
    restaurants = poi.get("restaurant") or []
    cafes = poi.get("cafe") or []

    # Use rating to weight — high-rated restaurants imply nightlife scene
    well_rated_restaurants = [r for r in restaurants if (r.get("rating") or 0) >= 4.2]
    well_rated_cafes = [c for c in cafes if (c.get("rating") or 0) >= 4.2]

    score = (
        min(len(restaurants), 20) * 0.20
        + min(len(well_rated_restaurants), 10) * 0.25
        + min(len(cafes), 15) * 0.10
        + min(len(well_rated_cafes), 8) * 0.15
    )  # cap roughly 4 + 2.5 + 1.5 + 1.2 = 9.2

    return _clamp(score), {
        "restaurants_count": len(restaurants),
        "well_rated_restaurants_count": len(well_rated_restaurants),
        "cafes_count": len(cafes),
        "well_rated_cafes_count": len(well_rated_cafes),
    }


# =============================================================================
# Quietness score (0-10)
#   inverse-ish of nightlife — too many bars/restaurants reduces quiet feel,
#   but parks raise it.  Pure heuristic; users with different lifestyles
#   weight this differently.
# =============================================================================
def quietness_score(poi: dict[str, list[dict]]) -> ScoreResult:
    restaurants = poi.get("restaurant") or []
    cafes = poi.get("cafe") or []
    parks = poi.get("park") or []

    bustle_penalty = min(len(restaurants), 25) * 0.18 + min(len(cafes), 15) * 0.12
    park_bonus = min(len(parks), 5) * 0.6

    score = 9.0 - bustle_penalty + park_bonus
    return _clamp(score), {
        "bustle_penalty": round(bustle_penalty, 2),
        "park_bonus": round(park_bonus, 2),
        "restaurants_count": len(restaurants),
        "cafes_count": len(cafes),
        "parks_count": len(parks),
    }


# =============================================================================
# Lifestyle score (0-10)
#   Blend of walkability, nightlife/quietness balance, and grocery convenience.
#   This is a "vibes" composite that surfaces how livable the area feels.
# =============================================================================
def lifestyle_score(walkability: float | None, nightlife: float | None, grocery: float | None) -> ScoreResult:
    parts = [(walkability, 0.45), (nightlife, 0.25), (grocery, 0.30)]
    total_weight = sum(weight for value, weight in parts if value is not None)
    if total_weight == 0:
        return None, {"reason": "no signals available"}
    weighted = sum((value or 0) * weight for value, weight in parts if value is not None)
    score = weighted / total_weight
    return _clamp(score), {
        "weights": {"walkability": 0.45, "nightlife": 0.25, "grocery": 0.30},
        "inputs": {"walkability": walkability, "nightlife": nightlife, "grocery": grocery},
    }


# =============================================================================
# Daily friction score (0-10) — HIGHER = MORE FRICTION (penalty interpretation)
#   Captures the everyday "ugh" — long commute, lots of transfers, weak transit,
#   no gym access, distant groceries.  This score is subtracted (weighted) in
#   overall_score, so a low value here is good.
# =============================================================================
def daily_friction_score(
    apartment: Apartment,
    commute_sub: float | None,
    grocery_sub: float | None,
    gym_sub: float | None,
    walkability_sub: float | None,
    mode: str = "transit",
) -> ScoreResult:
    # If a subscore is None (data missing), treat it neutrally at 5/10.
    cs = commute_sub if commute_sub is not None else 5.0
    gs = grocery_sub if grocery_sub is not None else 5.0
    ys = gym_sub if gym_sub is not None else 5.0
    ws = walkability_sub if walkability_sub is not None else 5.0

    # Each "10 - sub" contributes proportional friction.
    morning, evening = _commute_lookup(apartment, mode)
    total_walk = ((morning.walking_minutes if morning else 0) or 0) + ((evening.walking_minutes if evening else 0) or 0)
    avg_transfers = (((morning.transfers if morning else 0) or 0) + ((evening.transfers if evening else 0) or 0)) / 2

    friction = (
        (10 - cs) * 0.45
        + (10 - ws) * 0.20
        + (10 - gs) * 0.15
        + (10 - ys) * 0.10
        + min(avg_transfers, 4) * 0.4   # transfers add direct friction
        + max(0, total_walk - 30) * 0.05
    )

    return _clamp(friction), {
        "inverse_components": {
            "commute": round(10 - cs, 1),
            "walkability": round(10 - ws, 1),
            "grocery": round(10 - gs, 1),
            "gym": round(10 - ys, 1),
        },
        "mode": _normalize_mode(mode),
        "transfer_term": round(min(avg_transfers, 4) * 0.4, 2),
        "extra_walk_term": round(max(0, total_walk - 30) * 0.05, 2),
        "avg_transfers": round(avg_transfers, 1),
        "total_walking_minutes": total_walk,
    }


# =============================================================================
# Overall score (0-100) — weighted blend.
# =============================================================================
def overall_score(
    commute: float | None,
    walkability: float | None,
    grocery: float | None,
    gym: float | None,
    lifestyle: float | None,
    friction: float | None,
) -> ScoreResult:
    settings = get_settings()
    components = {
        "commute":     (commute,     settings.weight_commute),
        "walkability": (walkability, settings.weight_walkability),
        "grocery":     (grocery,     settings.weight_grocery),
        "gym":         (gym,         settings.weight_gym),
        "lifestyle":   (lifestyle,   settings.weight_lifestyle),
    }

    # Renormalize over only the components we actually have data for.
    available = [(name, value, weight) for name, (value, weight) in components.items() if value is not None]
    if not available:
        return None, {"reason": "no scoring inputs available"}

    total_weight = sum(weight for _, _, weight in available)
    weighted_positive = sum(value * weight for _, value, weight in available) / total_weight
    # Positive subscores are 0-10; scale to 0-100.
    positive_100 = weighted_positive * 10

    # Apply friction as a soft penalty (friction is 0-10 where 10 = worst).
    friction_penalty_100 = (friction or 0) * settings.weight_friction * 10
    final = positive_100 - friction_penalty_100

    return round(max(0.0, min(100.0, final)), 1), {
        "weights": {
            "commute": settings.weight_commute,
            "walkability": settings.weight_walkability,
            "grocery": settings.weight_grocery,
            "gym": settings.weight_gym,
            "lifestyle": settings.weight_lifestyle,
            "friction_penalty": settings.weight_friction,
        },
        "used_components": {name: value for name, value, _ in available},
        "positive_blend_0_100": round(positive_100, 1),
        "friction_penalty_0_100": round(friction_penalty_100, 1),
    }


# =============================================================================
# Convenience: run the whole battery in dependency order.
# =============================================================================
def score_apartment(apartment: Apartment, poi: dict[str, list[dict]], mode: str = "transit") -> dict[str, Any]:
    """Run every scorer in dependency order. Persists nothing — pure function.

    Returns ``{ "scores": {name: value}, "breakdown": {name: dict} }``.
    """
    breakdowns: dict[str, dict] = {}
    scores: dict[str, float | None] = {}

    commute_val, commute_br = commute_score(apartment, mode)
    scores["commute"] = commute_val
    breakdowns["commute"] = commute_br

    gym_val, gym_br = gym_score(apartment, poi.get("gym") or [])
    scores["gym"] = gym_val
    breakdowns["gym"] = gym_br

    grocery_val, grocery_br = grocery_score(poi.get("grocery_store") or [])
    scores["grocery"] = grocery_val
    breakdowns["grocery"] = grocery_br

    walk_val, walk_br = walkability_score(poi)
    scores["walkability"] = walk_val
    breakdowns["walkability"] = walk_br

    night_val, night_br = nightlife_score(poi)
    scores["nightlife"] = night_val
    breakdowns["nightlife"] = night_br

    quiet_val, quiet_br = quietness_score(poi)
    scores["quietness"] = quiet_val
    breakdowns["quietness"] = quiet_br

    lifestyle_val, lifestyle_br = lifestyle_score(walk_val, night_val, grocery_val)
    scores["lifestyle"] = lifestyle_val
    breakdowns["lifestyle"] = lifestyle_br

    friction_val, friction_br = daily_friction_score(apartment, commute_val, grocery_val, gym_val, walk_val, mode)
    scores["daily_friction"] = friction_val
    breakdowns["daily_friction"] = friction_br

    overall_val, overall_br = overall_score(commute_val, walk_val, grocery_val, gym_val, lifestyle_val, friction_val)
    scores["overall"] = overall_val
    breakdowns["overall"] = overall_br

    return {"scores": scores, "breakdown": breakdowns}
