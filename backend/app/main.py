"""FastAPI surface for the v2 apartment decision-intelligence platform."""

from __future__ import annotations

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .admin import public_router as access_router, router as admin_router
from .auth import CurrentUser, get_current_user
from .database import get_db
from .exporter import build_excel
from .models import Apartment
from .schemas import (
    ApartmentCreate,
    ApartmentList,
    ApartmentRead,
    ApartmentUpdate,
    ScoreBreakdownRead,
    TargetLocationRead,
    TargetLocationUpdate,
)
from .services.apartments import create_apartment, recalculate_apartment, update_apartment
from .services.targets import get_target, update_target


app = FastAPI(title="project_map · decision intelligence API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://ankur9301.github.io",
        "https://project-map-red.vercel.app"
    ],
    allow_origin_regex=r"^(chrome-extension://.*|https://.*\.vercel\.app)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(access_router)
app.include_router(admin_router)


# --------------------------------------------------------------------------- #
# Health
# --------------------------------------------------------------------------- #
@app.get("/health")
def health() -> dict:
    return {"status": "ok", "version": "2.0.0"}


# --------------------------------------------------------------------------- #
# Apartments
# --------------------------------------------------------------------------- #
@app.get("/apartments", response_model=ApartmentList)
def list_apartments(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
    search: str | None = Query(default=None),
    favorite: bool | None = Query(default=None),
    sort: str = Query(default="overall_score"),
) -> ApartmentList:
    query = db.query(Apartment).filter(Apartment.user_id == user.id)
    if search:
        like = f"%{search}%"
        query = query.filter(
            or_(
                Apartment.address.ilike(like),
                Apartment.neighborhood_name.ilike(like),
                Apartment.notes.ilike(like),
                Apartment.vibe.ilike(like),
            )
        )
    if favorite is not None:
        query = query.filter(Apartment.favorite == favorite)

    sort_column = {
        "overall_score": Apartment.overall_score,
        "commute_score": Apartment.commute_score,
        "price": Apartment.price,
        "commute_minutes_morning": Apartment.commute_minutes_morning,
        "created_at": Apartment.created_at,
    }.get(sort, Apartment.overall_score)

    items = query.order_by(
        Apartment.favorite.desc(),
        sort_column.desc().nullslast(),
        Apartment.created_at.desc(),
    ).all()
    return ApartmentList(items=items, total=len(items))


@app.post("/apartments", response_model=ApartmentRead, status_code=201)
async def add_apartment(
    payload: ApartmentCreate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> Apartment:
    try:
        return await create_apartment(db, payload, user.id)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.patch("/apartments/{apartment_id}", response_model=ApartmentRead)
def patch_apartment(
    apartment_id: int,
    payload: ApartmentUpdate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> Apartment:
    apartment = db.query(Apartment).filter(Apartment.id == apartment_id, Apartment.user_id == user.id).first()
    if not apartment:
        raise HTTPException(status_code=404, detail="Apartment not found.")
    return update_apartment(db, apartment, payload)


@app.post("/apartments/{apartment_id}/recalculate", response_model=ApartmentRead)
async def recalculate(
    apartment_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> Apartment:
    apartment = db.query(Apartment).filter(Apartment.id == apartment_id, Apartment.user_id == user.id).first()
    if not apartment:
        raise HTTPException(status_code=404, detail="Apartment not found.")
    try:
        return await recalculate_apartment(db, apartment)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/apartments/{apartment_id}/scores", response_model=ScoreBreakdownRead)
def apartment_scores(
    apartment_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> ScoreBreakdownRead:
    apartment = db.query(Apartment).filter(Apartment.id == apartment_id, Apartment.user_id == user.id).first()
    if not apartment:
        raise HTTPException(status_code=404, detail="Apartment not found.")

    components = {
        "commute":        {"score": apartment.commute_score,        "breakdown": apartment.score_breakdown.get("commute", {})},
        "gym":            {"score": apartment.gym_score,            "breakdown": apartment.score_breakdown.get("gym", {})},
        "grocery":        {"score": apartment.grocery_score,        "breakdown": apartment.score_breakdown.get("grocery", {})},
        "walkability":    {"score": apartment.walkability_score,    "breakdown": apartment.score_breakdown.get("walkability", {})},
        "nightlife":      {"score": apartment.nightlife_score,      "breakdown": apartment.score_breakdown.get("nightlife", {})},
        "quietness":      {"score": apartment.quietness_score,      "breakdown": apartment.score_breakdown.get("quietness", {})},
        "lifestyle":      {"score": apartment.lifestyle_score,      "breakdown": apartment.score_breakdown.get("lifestyle", {})},
        "daily_friction": {"score": apartment.daily_friction_score, "breakdown": apartment.score_breakdown.get("daily_friction", {})},
        "overall_meta":   apartment.score_breakdown.get("overall", {}),
        "pipeline_errors": apartment.score_breakdown.get("pipeline_errors", []),
    }
    return ScoreBreakdownRead(
        apartment_id=apartment.id,
        overall_score=float(apartment.overall_score) if apartment.overall_score is not None else None,
        components=components,
        poi_snapshot=apartment.poi_snapshot or {},
    )


@app.delete("/apartments/{apartment_id}")
def delete_apartment(
    apartment_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    apartment = db.query(Apartment).filter(Apartment.id == apartment_id, Apartment.user_id == user.id).first()
    if not apartment:
        raise HTTPException(status_code=404, detail="Apartment not found.")
    db.delete(apartment)
    db.commit()
    return {"status": "deleted"}


# --------------------------------------------------------------------------- #
# Target location (per user)
# --------------------------------------------------------------------------- #
@app.get("/target", response_model=TargetLocationRead)
def read_target(db: Session = Depends(get_db), user: CurrentUser = Depends(get_current_user)) -> TargetLocationRead:
    return get_target(db, user.id)


@app.put("/target", response_model=TargetLocationRead)
async def save_target(
    payload: TargetLocationUpdate,
    recalculate: bool = Query(default=True),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> TargetLocationRead:
    try:
        return await update_target(db, payload, user.id, recalculate=recalculate)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


# --------------------------------------------------------------------------- #
# Export
# --------------------------------------------------------------------------- #
@app.get("/export")
def export_apartments(db: Session = Depends(get_db), user: CurrentUser = Depends(get_current_user)) -> StreamingResponse:
    output = build_excel(db, user.id)
    headers = {"Content-Disposition": 'attachment; filename="apartment_commutes.xlsx"'}
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers,
    )
