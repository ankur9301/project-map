# Deploy the FastAPI backend to Render (free tier)

About 20 minutes start to finish. Costs $0/month. The trade-off is a ~30s
cold start after 15 minutes of inactivity — fine for a personal tool.

## Before you start

Have these things ready:

- A Render account (https://render.com — sign up with the same GitHub you
  use for project_map, which makes the connect step easier)
- Your Supabase service-role key (Dashboard → Settings → API → service_role)
- Your Google Maps API key
- Your Supabase Postgres connection string (Dashboard → Settings → Database →
  Connection string → URI tab → switch to **Connection pooling** with
  Transaction mode; copy the URL ending in `pooler.supabase.com:6543/postgres`)
- An admin secret string: `python -c "import secrets; print(secrets.token_urlsafe(48))"`

## 1. Connect the repo via Blueprint

The repo now has a `render.yaml` at the root. That's a "Blueprint" — Render
will read it and create the service for you.

1. Sign in to Render
2. Click **New** (top right) → **Blueprint**
3. Connect your GitHub account if you haven't, then pick **`ankur9301/project_map`**
4. Render reads `render.yaml`, shows you the service it's about to create
   (`project-map-backend`, Docker, free plan)
5. Click **Apply**

Render now clones the repo, builds the Docker image, and tries to start it.
The first build takes 5–8 minutes.

## 2. Fill in the secret env vars

The Blueprint declares which env vars are needed but doesn't supply the secret
ones (anything marked `sync: false` in `render.yaml`). After clicking Apply,
Render will land you on a page asking for each one:

| Variable | What to paste |
|---|---|
| `DATABASE_URL` | `postgresql+psycopg://postgres.<ref>:<password>@aws-0-us-east-1.pooler.supabase.com:6543/postgres` |
| `GOOGLE_MAPS_API_KEY` | Your Google key with Routes, Places (New), and Geocoding enabled |
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | Anon key from Supabase Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key from same page — keep this secret |
| `ADMIN_API_SECRET` | Random string you generated above |

Click **Save and Deploy**. Render rebuilds with the env vars in place.

## 3. Wait for green

Watch the **Logs** tab. You're looking for the uvicorn startup banner ending
with `Application startup complete.`. If you see import errors, the most
likely cause is `email-validator` missing — it's now in `requirements.txt`,
so a fresh build should be fine.

Health check: Render hits `/health` automatically (configured in
`render.yaml`). When the dot turns green next to your service name, you're up.

## 4. Note the public URL

Top of the service page: something like
`https://project-map-backend.onrender.com`. Copy it.

Test it from your terminal:

```bash
curl https://project-map-backend.onrender.com/health
# -> {"status":"ok","version":"2.0.0"}
```

## 5. Wire it to the deployed frontend

Two places:

**GitHub Actions secrets** — `project_map` repo → Settings → Secrets and
variables → Actions:

- Add or update `VITE_API_BASE_URL` = `https://project-map-backend.onrender.com`

**Backend CORS** — already allows `https://ankur9301.github.io`. No change
needed unless you add a custom domain later.

Trigger a frontend redeploy (either push a commit, or go to Actions → "Deploy
frontend to ankur9301.github.io" → Run workflow). Once it finishes, the
deployed site can talk to your Render backend.

## 6. End-to-end test

1. Open `https://ankur9301.github.io` in an incognito window
2. Click **Request access**, submit a test request with a throwaway email
3. From your terminal, list pending requests:

   ```bash
   curl -H "X-Admin-Secret: <your ADMIN_API_SECRET>" \
        https://project-map-backend.onrender.com/admin/access-requests?status=pending
   ```

4. Approve it:

   ```bash
   curl -X POST \
        -H "X-Admin-Secret: <your ADMIN_API_SECRET>" \
        -H "Content-Type: application/json" \
        -d '{"action":"approve"}' \
        https://project-map-backend.onrender.com/admin/access-requests/1/review
   ```

5. Check the throwaway email — Supabase invite link should be there
6. Click the link, set a password, you should land back on the site signed in
   with full access

## Troubleshooting

**Build fails on `psycopg[binary]`** — Render's free tier sometimes runs out
of memory while compiling. Already mitigated by `psycopg[binary]` (prebuilt
wheel). If it still happens, retry the build.

**`/admin/access-requests/X/review` returns 500 "Supabase service-role key not
configured"** — `SUPABASE_SERVICE_ROLE_KEY` env var didn't get set. Go to
Render → service → Environment → check the value.

**Frontend says "Failed to fetch"** — Two suspects: CORS (does Render's URL
appear in `main.py` `allow_origins`? Yes, `ankur9301.github.io` is there —
but the *frontend* loads from there and calls the *backend*, so the origin
that matters is `ankur9301.github.io`) or the service is sleeping (cold-start
~30s; first request after that wakes it up).

**Cold starts are annoying** — Upgrade to Render's $7/mo Starter plan, or
move to Fly.io (~$2–5/mo, no sleep). Or set up a cron job (e.g.
cron-job.org) pinging `/health` every 10 minutes to keep it warm — works but
feels gross.

---

## Mental model recap

You now have three deployed pieces talking to each other:

```
  Browser                ankur9301.github.io          (static, GH Pages)
     |
     |  REST calls
     v
  FastAPI backend        project-map-backend.onrender.com  (Docker on Render)
     |
     |  - holds Google API key
     |  - holds Supabase service-role key
     |  - SQL via SQLAlchemy
     v
  Supabase Postgres + Auth      <project>.supabase.co
```

- The frontend talks to Supabase directly for **auth** (sign-in, session,
  access_requests insert via RLS).
- The frontend talks to the **backend** for everything that requires Google
  API calls or scoring.
- The backend talks to **Supabase Postgres** for data and to the **Supabase
  Auth admin API** for invites.
- The browser never sees the Google key or the service-role key.

That's the whole architecture.
