from dataclasses import dataclass

import httpx
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import get_settings


security = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class CurrentUser:
    id: str
    email: str | None = None


def _supabase_auth_url() -> str:
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_anon_key:
        raise HTTPException(status_code=500, detail="Supabase auth is not configured on the backend.")
    base_url = settings.supabase_url.rstrip("/")
    if base_url.endswith("/rest/v1"):
        base_url = base_url.removesuffix("/rest/v1")
    return f"{base_url}/auth/v1/user"


async def get_current_user(credentials: HTTPAuthorizationCredentials | None = Depends(security)) -> CurrentUser:
    settings = get_settings()
    if credentials is None:
        raise HTTPException(status_code=401, detail="Sign in required.")

    try:
        async with httpx.AsyncClient(timeout=12) as client:
            response = await client.get(
                _supabase_auth_url(),
                headers={
                    "apikey": settings.supabase_anon_key or "",
                    "Authorization": f"Bearer {credentials.credentials}",
                },
            )
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired login token.") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Could not verify Supabase token: {exc}") from exc

    payload = response.json()
    user_id = payload.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid Supabase user payload.")
    return CurrentUser(id=user_id, email=payload.get("email"))
