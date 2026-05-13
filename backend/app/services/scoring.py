from ..models import Apartment


def commute_score(apartment: Apartment) -> float | None:
    commutes = {commute.direction: commute for commute in apartment.commutes}
    morning = commutes.get("morning")
    evening = commutes.get("evening")
    if not morning or not evening or morning.total_minutes is None or evening.total_minutes is None:
        return None

    round_trip = morning.total_minutes + evening.total_minutes
    avg_transfers = ((morning.transfers or 0) + (evening.transfers or 0)) / 2
    walk_penalty = ((morning.walking_minutes or 0) + (evening.walking_minutes or 0)) / 10
    price_penalty = min((apartment.price or 0) / 1000, 8)

    score = 100 - (round_trip * 0.55) - (avg_transfers * 8) - walk_penalty - price_penalty
    return round(max(0, min(100, score)), 1)
