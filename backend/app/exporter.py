"""Excel export — flat-table snapshot of the user's apartments and scores."""

from __future__ import annotations

from io import BytesIO

import pandas as pd
from sqlalchemy.orm import Session

from .models import Apartment


def _commute_map(apartment: Apartment) -> dict:
    return {commute.direction: commute for commute in apartment.commutes}


def build_excel(db: Session, user_id: str) -> BytesIO:
    rows = []
    apartments = (
        db.query(Apartment)
        .filter(Apartment.user_id == user_id)
        .order_by(Apartment.overall_score.desc().nullslast(), Apartment.created_at.desc())
        .all()
    )
    for apartment in apartments:
        commutes = _commute_map(apartment)
        morning = commutes.get("morning")
        evening = commutes.get("evening")
        morning_minutes = morning.total_minutes if morning else None
        evening_minutes = evening.total_minutes if evening else None
        round_trip = (
            morning_minutes + evening_minutes
            if morning_minutes is not None and evening_minutes is not None
            else None
        )
        rows.append(
            {
                "Address": apartment.address,
                "Neighborhood": apartment.neighborhood_name,
                "Price": float(apartment.price) if apartment.price is not None else None,
                "Beds": float(apartment.beds) if apartment.beds is not None else None,
                "Baths": float(apartment.baths) if apartment.baths is not None else None,
                "Sqft": apartment.sqft,
                "Building gym": apartment.building_has_gym,
                "Pet friendly": apartment.pet_friendly,
                "Overall": float(apartment.overall_score) if apartment.overall_score is not None else None,
                "Commute": float(apartment.commute_score) if apartment.commute_score is not None else None,
                "Walkability": float(apartment.walkability_score) if apartment.walkability_score is not None else None,
                "Grocery": float(apartment.grocery_score) if apartment.grocery_score is not None else None,
                "Gym": float(apartment.gym_score) if apartment.gym_score is not None else None,
                "Nightlife": float(apartment.nightlife_score) if apartment.nightlife_score is not None else None,
                "Quietness": float(apartment.quietness_score) if apartment.quietness_score is not None else None,
                "Lifestyle": float(apartment.lifestyle_score) if apartment.lifestyle_score is not None else None,
                "Friction": float(apartment.daily_friction_score) if apartment.daily_friction_score is not None else None,
                "Morning commute": morning_minutes,
                "Evening commute": evening_minutes,
                "Round trip": round_trip,
                "Morning transfers": morning.transfers if morning else None,
                "Evening transfers": evening.transfers if evening else None,
                "Walking AM": morning.walking_minutes if morning else None,
                "Walking PM": evening.walking_minutes if evening else None,
                "Lines AM": morning.lines if morning else None,
                "Lines PM": evening.lines if evening else None,
                "Listing URL": apartment.listing_url,
                "Source": apartment.source,
                "Favorite": apartment.favorite,
                "Notes": apartment.notes,
                "Vibe": apartment.vibe,
                "Created": apartment.created_at,
                "Updated": apartment.updated_at,
            }
        )

    output = BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df = pd.DataFrame(rows)
        df.to_excel(writer, index=False, sheet_name="Apartments")
        worksheet = writer.sheets["Apartments"]
        for column_cells in worksheet.columns:
            max_length = max(len(str(cell.value or "")) for cell in column_cells)
            worksheet.column_dimensions[column_cells[0].column_letter].width = min(max(max_length + 2, 12), 48)
    output.seek(0)
    return output
