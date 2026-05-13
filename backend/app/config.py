from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "sqlite:///./apartments.db"
    otp_base_url: str = "http://localhost:8080/otp"
    nominatim_base_url: str = "https://nominatim.openstreetmap.org"
    nominatim_user_agent: str = "apartment-commute-tracker/1.0"
    bloomberg_address: str = "731 Lexington Ave, New York, NY"
    bloomberg_lat: float = 40.7614205
    bloomberg_lon: float = -73.9675149
    default_timezone: str = "America/New_York"
    commute_weekday: str = "MONDAY"
    morning_departure_time: str = "07:00:00"
    evening_departure_time: str = "17:30:00"
    routing_provider: str = "otp"
    google_maps_api_key: str | None = None

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


@lru_cache
def get_settings() -> Settings:
    return Settings()
