"""Admin-only endpoints for approving (or rejecting) access requests.

Strangers POST to /access-requests (via Supabase's anon REST or directly here).
You — the only admin — call /admin/access-requests/{id}/approve from a CLI or
a tiny private dashboard. That call:

    1. Verifies the X-Admin-Secret header matches ADMIN_API_SECRET.
    2. Calls Supabase's admin API to invite the user by email.
    3. Flips the access_requests row to status=approved.
    4. Flips public.profiles.is_approved=true once the invited auth.users row
       exists. (The profile row is auto-created by the on_auth_user_created
       trigger from migration 0003.)

The service-role key is required and stays server-side only.
"""

from __future__ import annotations

from typing import Literal

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, EmailStr, Field

from .config import Settings, get_settings


router = APIRouter(prefix="/admin", tags=["admin"])


# ----------------------------- request bodies ------------------------------- #
class AccessRequestCreate(BaseModel):
    email: EmailStr
    full_name: str | None = Field(default=None, max_length=200)
    reason: str | None = Field(default=None, max_length=1000)


class ReviewAction(BaseModel):
    action: Literal["approve", "reject"]
    notes: str | None = Field(default=None, max_length=1000)


# ----------------------------- helpers ------------------------------------- #
def _require_admin(
    x_admin_secret: str | None = Header(default=None, alias="X-Admin-Secret"),
    settings: Settings = Depends(get_settings),
) -> Settings:
    if not settings.admin_api_secret:
        raise HTTPException(500, "Admin secret not configured on backend.")
    if not x_admin_secret or x_admin_secret != settings.admin_api_secret:
        raise HTTPException(403, "Invalid admin secret.")
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise HTTPException(500, "Supabase service-role key not configured.")
    return settings


def _supabase_base(settings: Settings) -> str:
    return settings.supabase_url.rstrip("/").removesuffix("/rest/v1")


async def _sb_request(
    settings: Settings,
    method: str,
    path: str,
    *,
    json: dict | None = None,
    params: dict | None = None,
) -> httpx.Response:
    """Make a service-role authenticated call to Supabase."""
    headers = {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    url = f"{_supabase_base(settings)}{path}"
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.request(method, url, headers=headers, json=json, params=params)
    return resp


# ----------------------------- public route -------------------------------- #
# Sits outside the /admin router because anyone should be able to call it.
public_router = APIRouter(tags=["access"])


@public_router.post("/access-requests", status_code=201)
async def submit_access_request(
    payload: AccessRequestCreate,
    settings: Settings = Depends(get_settings),
) -> dict:
    """Anyone can POST. Inserts a row in access_requests with status=pending.

    Note: the frontend can also write this row directly through the anon key
    thanks to the RLS policy in migration 0003. This server-side route exists
    so that callers without Supabase JS (or for future hCaptcha integration)
    have a path too.
    """
    if not settings.supabase_url or not settings.supabase_anon_key:
        raise HTTPException(500, "Supabase not configured.")
    body = {
        "email": payload.email.lower(),
        "full_name": payload.full_name,
        "reason": payload.reason,
    }
    headers = {
        "apikey": settings.supabase_anon_key,
        "Authorization": f"Bearer {settings.supabase_anon_key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    url = f"{_supabase_base(settings)}/rest/v1/access_requests"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(url, headers=headers, json=body)
    if resp.status_code == 409:
        # unique-email violation: the user already requested. Treat as success
        # — we don't want to leak whether an address exists.
        return {"status": "received"}
    if resp.status_code >= 400:
        raise HTTPException(502, f"Failed to record request: {resp.text}")
    return {"status": "received"}


# ----------------------------- admin routes -------------------------------- #
@router.get("/access-requests")
async def list_access_requests(
    status: str | None = None,
    settings: Settings = Depends(_require_admin),
) -> list[dict]:
    params = {"select": "*", "order": "created_at.desc", "limit": "200"}
    if status:
        params["status"] = f"eq.{status}"
    resp = await _sb_request(settings, "GET", "/rest/v1/access_requests", params=params)
    if resp.status_code >= 400:
        raise HTTPException(502, resp.text)
    return resp.json()


@router.post("/access-requests/{request_id}/review")
async def review_access_request(
    request_id: int,
    payload: ReviewAction,
    settings: Settings = Depends(_require_admin),
) -> dict:
    # Step 1: fetch the request
    resp = await _sb_request(
        settings, "GET",
        "/rest/v1/access_requests",
        params={"id": f"eq.{request_id}", "select": "*"},
    )
    if resp.status_code >= 400 or not resp.json():
        raise HTTPException(404, "Access request not found.")
    record = resp.json()[0]
    if record["status"] != "pending":
        raise HTTPException(409, f"Request already {record['status']}.")

    if payload.action == "reject":
        update = await _sb_request(
            settings, "PATCH",
            "/rest/v1/access_requests",
            params={"id": f"eq.{request_id}"},
            json={
                "status": "rejected",
                "notes": payload.notes,
                "reviewed_at": "now()",
            },
        )
        if update.status_code >= 400:
            raise HTTPException(502, update.text)
        return {"status": "rejected", "email": record["email"]}

    # ----- approve path -----
    # Step 2: invite the user via Supabase Auth admin API.
    invite_url = f"{_supabase_base(settings)}/auth/v1/invite"
    invite_headers = {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Content-Type": "application/json",
    }
    invite_body = {
        "email": record["email"],
        "data": {"full_name": record.get("full_name")},
        "redirect_to": settings.frontend_site_url,
    }
    async with httpx.AsyncClient(timeout=20) as client:
        invite_resp = await client.post(invite_url, headers=invite_headers, json=invite_body)
    if invite_resp.status_code >= 400:
        raise HTTPException(502, f"Invite failed: {invite_resp.text}")
    invited = invite_resp.json()
    invited_user_id = invited.get("id") or invited.get("user", {}).get("id")

    # Step 3: mark the request approved.
    update = await _sb_request(
        settings, "PATCH",
        "/rest/v1/access_requests",
        params={"id": f"eq.{request_id}"},
        json={
            "status": "approved",
            "notes": payload.notes,
            "reviewed_at": "now()",
            "invited_user_id": invited_user_id,
        },
    )
    if update.status_code >= 400:
        raise HTTPException(502, update.text)

    # Step 4: flip the profile.is_approved flag for the new user.
    if invited_user_id:
        await _sb_request(
            settings, "PATCH",
            "/rest/v1/profiles",
            params={"id": f"eq.{invited_user_id}"},
            json={"is_approved": True, "approved_at": "now()"},
        )

    return {
        "status": "approved",
        "email": record["email"],
        "invited_user_id": invited_user_id,
    }
