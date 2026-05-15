# Access-request gating + GitHub Pages deploy — setup

This walks through:

1. Running the Supabase migration that adds the access-request system
2. Wiring backend env vars for admin invites
3. Standing up `ankur9301.github.io` with the GitHub Actions deploy

Run the steps in order. Most failures are env-var or "I forgot to flip the Supabase auth setting".

---

## 1. Supabase — run migration `0003_access_requests.sql`

Open the Supabase Dashboard for your project, go to **SQL Editor → New query**,
paste the contents of `backend/db/migrations/0003_access_requests.sql`, and run it.

The migration:

- Creates `public.access_requests` (the table strangers POST to)
- Creates `public.profiles` (per-user, gated by `is_approved`)
- Adds a trigger that auto-creates a profile row for every new `auth.users` row
- Replaces the RLS policies on `apartments` and `target_location` so they
  require **`is_approved = true`** as well as ownership

If you already have rows in `apartments` for yourself, you'll be locked out
until you flip your own profile to approved. Run this once after the migration:

```sql
update public.profiles set is_approved = true, approved_at = now()
 where email = 'ankurgyawali1250@gmail.com';
```

## 2. Supabase — flip three dashboard settings

The SQL alone is not enough. In the dashboard:

- **Authentication → Providers → Email**
  - Enable email provider: ON
  - Confirm email: ON
  - **Allow new users to sign up: OFF**  ← this is the kill switch
- **Authentication → URL Configuration**
  - Site URL: `https://ankur9301.github.io`
  - Additional redirect URLs: `http://localhost:5173, https://ankur9301.github.io`
- **Settings → API** — copy the `service_role` secret. You'll paste it into
  `backend/.env` as `SUPABASE_SERVICE_ROLE_KEY`. Never put this in the frontend.

With "Allow new users to sign up" OFF, `supabase.auth.signUp()` from the anon
key will fail. The only way an `auth.users` row appears is via the backend's
admin invite call.

## 3. Backend env

Add to `backend/.env`:

```
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service-role key from step 2>
ADMIN_API_SECRET=<paste output of `python -c "import secrets; print(secrets.token_urlsafe(48))"`>
FRONTEND_SITE_URL=https://ankur9301.github.io
```

Restart the FastAPI server. New endpoints are live:

- `POST /access-requests` — public, no auth, accepts `{email, full_name?, reason?}`
- `GET  /admin/access-requests?status=pending` — requires `X-Admin-Secret` header
- `POST /admin/access-requests/{id}/review` — body `{action: "approve"|"reject", notes?}`

## 4. Approving someone (your day-to-day workflow)

You'll do this from a terminal until/unless you build a UI for it.

```bash
# List pending requests
curl -H "X-Admin-Secret: $ADMIN_API_SECRET" \
     "https://your-backend/admin/access-requests?status=pending"

# Approve request id=7 (sends them an invite email)
curl -X POST \
     -H "X-Admin-Secret: $ADMIN_API_SECRET" \
     -H "Content-Type: application/json" \
     -d '{"action":"approve","notes":"friend of friend"}' \
     "https://your-backend/admin/access-requests/7/review"

# Reject
curl -X POST \
     -H "X-Admin-Secret: $ADMIN_API_SECRET" \
     -H "Content-Type: application/json" \
     -d '{"action":"reject"}' \
     "https://your-backend/admin/access-requests/7/review"
```

The approve call does three things atomically-enough:

1. Calls Supabase `/auth/v1/invite` with the email → user gets an invite email
2. Sets `access_requests.status = 'approved'`
3. Sets `profiles.is_approved = true` for the newly created `auth.users.id`

When they click the invite email, they're walked through setting a password,
land on `https://ankur9301.github.io`, sign in, and immediately have data
access (RLS now lets them through).

---

## 5. GitHub Pages — one-time setup

You said the old `ankur9301.github.io` repo has already been renamed away. Good.

Create a fresh empty repo at https://github.com/new:

- Owner: `ankur9301`
- Repository name: **`ankur9301.github.io`** (must match exactly)
- Visibility: Public (required for free GH Pages)
- Don't initialize with README — the workflow will populate `main`

Then in **that** repo: **Settings → Pages → Source: Deploy from a branch →
Branch: `main` / root**. Save. (GH may auto-enable this once content lands.)

## 6. Create the deploy token

The workflow lives in `project_map` but pushes to `ankur9301.github.io`. It
needs a Personal Access Token to do that cross-repo push.

1. https://github.com/settings/tokens → **Generate new token (classic)**
2. Name: `project_map-gh-pages-deploy`
3. Expiration: 1 year is fine
4. Scope: **`repo`** (full control of private repositories) — needed even
   though the target repo is public, because the action authenticates as you
5. Generate, copy the token (`ghp_…`)

## 7. Add repository secrets to `project_map`

In **`project_map` → Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|---|---|
| `GH_PAGES_TOKEN` | The `ghp_…` token from step 6 |
| `VITE_SUPABASE_URL` | `https://<project>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | The anon key (safe in browser) |
| `VITE_API_BASE_URL` | Wherever your backend is reachable, e.g. `https://api.yourdomain.com` (if you don't have backend hosting yet, leave the secret unset — the frontend will fall back to localhost which only works in dev) |

## 8. Push and watch the action run

```bash
cd D:\project_map
git add -A
git commit -m "Access-request gating + GH Pages deploy"
git push origin main
```

Go to **`project_map` → Actions** and watch the "Deploy frontend to
ankur9301.github.io" workflow. First run takes ~90 seconds. Once it's green,
visit https://ankur9301.github.io — should be live within a minute (GH Pages
CDN can lag for the first deploy).

---

## Yes, Vite works on GitHub Pages

Vite builds to a static `dist/` folder. GH Pages serves static files. That's
the whole story. The two things to remember:

- **`base` in `vite.config.js`** must match where the site is served. For a
  user page (`<username>.github.io`), that's `'/'`. For a project page
  (`<username>.github.io/<repo>`), it would be `'/<repo>/'`.
- **SPA routing** — GH Pages doesn't know React Router exists. If someone
  reloads `/compare`, GH Pages 404s. The fix: copy `index.html` to `404.html`
  in the build output. GH Pages serves `404.html` for any unknown path; the
  SPA then routes. This is wired up automatically by the `spa404Plugin` in
  `vite.config.js`.

If you ever want a custom domain (e.g. `commuterank.com`):

1. Add a `CNAME` file to `frontend/public/` containing just the domain
2. In `ankur9301.github.io` repo → Settings → Pages → Custom domain, paste the same
3. Set the DNS `CNAME` to `ankur9301.github.io`
4. Update `frontend_site_url` in backend config and Supabase redirect URLs

That's it.
