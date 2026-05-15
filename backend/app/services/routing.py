from ..config import get_settings
from .google_routes import GoogleRoutesError
from .google_routes import calculate_both_commutes as calculate_google_commutes
from .google_routes import calculate_both_commutes_to_target as calculate_google_commutes_to_target
from .otp import OTPError
from .otp import calculate_both_commutes as calculate_otp_commutes
from .otp import calculate_both_commutes_to_target as calculate_otp_commutes_to_target


RoutingError = OTPError | GoogleRoutesError


async def calculate_both_commutes(home_lat: float, home_lon: float) -> dict[str, dict]:
    provider = get_settings().routing_provider.strip().lower()
    if provider == "google":
        return await calculate_google_commutes(home_lat, home_lon)
    if provider == "otp":
        return await calculate_otp_commutes(home_lat, home_lon)
    raise RuntimeError("ROUTING_PROVIDER must be either 'otp' or 'google'.")


async def calculate_both_commutes_to_target(
    home_lat: float,
    home_lon: float,
    target_lat: float,
    target_lon: float,
    mode: str = "transit",
) -> dict[str, dict]:
    provider = get_settings().routing_provider.strip().lower()
    if provider == "google":
        return await calculate_google_commutes_to_target(home_lat, home_lon, target_lat, target_lon, mode)
    if provider == "otp":
        if mode != "transit":
            raise RuntimeError("OTP routing only supports transit mode in this app. Use Google routing for car, cycling, or walking.")
        return await calculate_otp_commutes_to_target(home_lat, home_lon, target_lat, target_lon)
    raise RuntimeError("ROUTING_PROVIDER must be either 'otp' or 'google'.")
