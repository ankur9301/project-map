from io import BytesIO
import pandas as pd
from sqlalchemy.orm import Session

from .models import Apartment


def _commute_map(apartment: Apartment) -> dict:
    return {commute.direction: commute for commute in apartment.commutes}


def build_excel(db: Session, user_id: str) -> BytesIO:
    rows = []
    apartments = db.query(Apartment).filter(Apartment.user_id == user_id).order_by(Apartment.created_at.desc()).all()
    for apartment in apartments:
        commutes = _commute_map(apartment)
        morning = commutes.get("morning")
        evening = commutes.get("evening")
        morning_minutes = morning.total_minutes if morning else None
        evening_minutes = evening.total_minutes if evening else None
        round_trip = morning_minutes + evening_minutes if morning_minutes is not None and evening_minutes is not None else None
        rows.append(
            {
                "Address": apartment.address,
                "Price": apartment.price,
                "Bed": apartment.bed,
                "Bath": apartment.bath,
                "Features": apartment.features,
                "Vibe/Notes": apartment.vibe,
                "Notes": apartment.notes,
                "Listing Agent": apartment.agent_name,
                "Agent Phone": apartment.agent_phone,
                "Broker/Manager": apartment.agent_broker,
                "Listing URL": apartment.listing_url,
                "Source": apartment.source,
                "Favorite": apartment.favorite,
                "Morning Commute": morning_minutes,
                "Evening Commute": evening_minutes,
                "Morning Distance KM": morning.total_distance_km if morning else None,
                "Evening Distance KM": evening.total_distance_km if evening else None,
                "Round Trip": round_trip,
                "Morning Transfers": morning.transfers if morning else None,
                "Evening Transfers": evening.transfers if evening else None,
                "Walking Minutes AM": morning.walking_minutes if morning else None,
                "Walking Minutes PM": evening.walking_minutes if evening else None,
                "Lines AM": morning.lines if morning else None,
                "Lines PM": evening.lines if evening else None,
                "Commute Score": apartment.commute_score,
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
