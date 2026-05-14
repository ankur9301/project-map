"""Backend configuration — environment-driven settings.

Note: as of v2, SQLite is no longer supported. ``DATABASE_URL`` must point at
the Supabase Postgres connection pooler (e.g. ``aws-0-...pooler.supabase.com``).
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # --- Persistence -----------------------------------------------------
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/postgres"

    # --- External routing services --------------------------------------
    otp_base_url: str = "http://localhost:8080/otp"
    nominatim_base_url: str = "https://nominatim.openstreetmap.org"
    nominatim_user_agent: str = "apartment-commute-tracker/1.0"

    # --- Default destination (Bloomberg HQ — change via /target endpoint) -
    bloomberg_address: str = "731 Lexington Ave, New York, NY"
    bloomberg_lat: float = 40.7614205
    bloomberg_lon: float = -73.9675149

    # --- Timing ---------------------------------------------------------
    default_timezone: str = "America/New_York"
    commute_weekday: str = "MONDAY"
    morning_departure_time: str = "07:00:00"
    evening_departure_time: str = "17:30:00"

    # --- Routing & maps -------------------------------------------------
    routing_provider: str = "google"
    google_maps_api_key: str | None = None

    # --- Supabase (auth verification) -----------------------------------
    supabase_url: str | None = None
    supabase_anon_key: str | None = None

    # --- Places API tuning ----------------------------------------------
    places_search_radius_m: int = 1200       # ~15 min walk
    places_cache_ttl_days: int = 30          # bust cache after 30 days

    # --- Scoring weights for overall_score (sum doesn't need to be 1.0;
    #     scorer normalizes). Easy to tune from environment if needed.   -
    weight_commute: float = 0.30
    weight_walkability: float = 0.18
    weight_grocery: float = 0.14
    weight_gym: float = 0.10
    weight_lifestyle: float = 0.14
    weight_friction: float = 0.14            # subtracted (penalty)

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
