from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .auth import CurrentUser, get_current_user
from .config import get_settings
from .database import get_db, init_db
from .exporter import build_excel
from .models import Apartment
from .schemas import ApartmentCreate, ApartmentList, ApartmentRead, ApartmentUpdate, TargetLocationRead, TargetLocationUpdate
from .services.apartments import create_apartment, recalculate_apartment, update_apartment
from .services.targets import get_target, update_target


app = FastAPI(title="NYC/NJ Apartment Commute Tracker", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_origin_regex=r"chrome-extension://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/health")
def health() -> dict:
    database_url = get_settings().database_url
    database = "supabase-postgres" if database_url.startswith("postgres") else "sqlite"
    return {"status": "ok", "database": database}


@app.get("/apartments", response_model=ApartmentList)
def list_apartments(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
    search: str | None = Query(default=None),
    favorite: bool | None = Query(default=None),
) -> ApartmentList:
    query = db.query(Apartment).filter(Apartment.user_id == user.id)
    if search:
        like = f"%{search}%"
        query = query.filter(or_(Apartment.address.ilike(like), Apartment.features.ilike(like), Apartment.vibe.ilike(like)))
    if favorite is not None:
        query = query.filter(Apartment.favorite == favorite)
    items = query.order_by(Apartment.favorite.desc(), Apartment.commute_score.desc().nullslast(), Apartment.created_at.desc()).all()
    return ApartmentList(items=items, total=len(items))


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


@app.delete("/apartments/{apartment_id}", status_code=204)
def delete_apartment(
    apartment_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> None:
    apartment = db.query(Apartment).filter(Apartment.id == apartment_id, Apartment.user_id == user.id).first()
    if not apartment:
        raise HTTPException(status_code=404, detail="Apartment not found.")
    db.delete(apartment)
    db.commit()


@app.get("/export")
def export_apartments(db: Session = Depends(get_db), user: CurrentUser = Depends(get_current_user)) -> StreamingResponse:
    output = build_excel(db, user.id)
    headers = {"Content-Disposition": 'attachment; filename="apartment_commutes.xlsx"'}
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers,
    )
