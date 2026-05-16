# CommuteRank Apartment Decision Workspace

CommuteRank is a personal apartment decision intelligence platform. It is not a listing marketplace and not a Zillow clone. The Chrome extension only captures visible listing details; the FastAPI backend owns validation, routing, scoring, ranking, and persistence; the React dashboard is where you compare apartments and make decisions.

## Architecture

```text
Chrome Extension -> FastAPI Backend -> Supabase Postgres -> React Realtime Dashboard
```

- Frontend: React + Vite
- Backend: FastAPI
- Database: Supabase Postgres
- Auth: Supabase Auth
- Routing: Google Maps Routes API
- Nearby places: Google Places API New
- Map: free OpenStreetMap/CARTO tiles through Leaflet
- Export: pandas + openpyxl
- Optional later: OpenTripPlanner with GTFS + OSM

The extension never writes directly to Supabase. It sends apartment data to the backend with the user auth token, and the backend writes rows scoped to that user.

## Daily Startup: Docker Backend + Ngrok + Vercel

Use this section when you want the hosted Vercel website to work with the backend running on your laptop.

Important idea:

- Vercel is public.
- Your Docker backend is local.
- Ngrok is the public HTTPS bridge between them.
- If your laptop sleeps, restarts, or ngrok closes, Vercel cannot reach the backend.

Current frontend:

```text
https://project-map-red.vercel.app
```

Current backend public tunnel:

```text
https://dormant-phillis-dominantly.ngrok-free.dev
```

### 1. Open PowerShell in the Project

```powershell
cd D:\project_map
```

### 2. Start Docker Desktop

Open Docker Desktop and wait until it says the engine is running.

Check:

```powershell
docker ps
```

If Docker is working, this should print a table, even if no containers are running.

### 3. Build the Backend Image

Run this after code changes, dependency changes, or whenever you are unsure:

```powershell
docker build -t project-map-backend ./backend
```

### 4. Start the Backend Container

Stop any old backend container:

```powershell
docker rm -f apartment-backend
```

Start the backend using `backend/.env`:

```powershell
docker run -d --name apartment-backend -p 8000:8000 --env-file backend\.env project-map-backend
```

Check local health:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
```

Expected:

```text
status : ok
```

If it fails, inspect logs:

```powershell
docker logs apartment-backend --tail 100
```

### 5. Start Ngrok

Ngrok must stay running while friends or Vercel use the app.

```powershell
ngrok http --url=dormant-phillis-dominantly.ngrok-free.dev 8000
```

Leave that terminal open.

Check public health in another PowerShell window:

```powershell
Invoke-RestMethod -Headers @{"ngrok-skip-browser-warning"="1"} https://dormant-phillis-dominantly.ngrok-free.dev/health
```

Expected:

```text
status : ok
```

If you see `ERR_NGROK_3200`, ngrok is offline. Start ngrok again.

### 6. Confirm CORS

Run this if the browser says:

```text
No Access-Control-Allow-Origin header is present
```

Check `/target` preflight:

```powershell
curl.exe -i -X OPTIONS "https://dormant-phillis-dominantly.ngrok-free.dev/target" -H "Origin: https://project-map-red.vercel.app" -H "Access-Control-Request-Method: GET" -H "Access-Control-Request-Headers: authorization,content-type,ngrok-skip-browser-warning" -H "ngrok-skip-browser-warning: 1"
```

Check `/apartments` preflight:

```powershell
curl.exe -i -X OPTIONS "https://dormant-phillis-dominantly.ngrok-free.dev/apartments" -H "Origin: https://project-map-red.vercel.app" -H "Access-Control-Request-Method: GET" -H "Access-Control-Request-Headers: authorization,content-type,ngrok-skip-browser-warning" -H "ngrok-skip-browser-warning: 1"
```

Expected headers:

```text
HTTP/1.1 200 OK
Access-Control-Allow-Origin: https://project-map-red.vercel.app
```

If ngrok health works but CORS fails, check `backend/.env` has the Vercel URL in `CORS_ORIGINS`, then restart Docker:

```text
CORS_ORIGINS=https://project-map-red.vercel.app,http://localhost:5173,http://127.0.0.1:5173
```

Restart:

```powershell
docker rm -f apartment-backend
docker run -d --name apartment-backend -p 8000:8000 --env-file backend\.env project-map-backend
```

### 7. Open the Website

Open:

```text
https://project-map-red.vercel.app
```

Hard refresh:

```text
Ctrl + Shift + R
```

Then test:

- Sign in
- Load apartments
- Load target
- Change commute mode
- Click `Save target`
- Click `Recalculate shown`

### 8. Chrome Extension

Use the unpacked extension from:

```text
D:\project_map\chrome-extension
```

If the extension cannot connect:

1. Open the Vercel dashboard tab first.
2. Sign in.
3. Click `Copy extension token` on the website, or click `Connect from website tab` in the extension.
4. Make sure the extension API URL is:

```text
https://dormant-phillis-dominantly.ngrok-free.dev
```

Not:

```text
http://127.0.0.1:8000
```

Use the local URL only when the website itself is running locally.

### Daily Troubleshooting

If Vercel worked yesterday but not today:

1. Check Docker:

```powershell
docker ps --filter name=apartment-backend
```

2. Check local backend:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
```

3. Check ngrok:

```powershell
Invoke-RestMethod -Headers @{"ngrok-skip-browser-warning"="1"} https://dormant-phillis-dominantly.ngrok-free.dev/health
```

4. If ngrok is offline, restart it:

```powershell
ngrok http --url=dormant-phillis-dominantly.ngrok-free.dev 8000
```

5. Hard refresh Vercel:

```text
Ctrl + Shift + R
```

Most “CORS” errors in this setup are actually ngrok being offline.

### Better Long-Term Setup

Ngrok is fine for testing with friends, but it depends on your laptop staying awake.

For a stable app:

- Keep Vercel for the frontend.
- Deploy the Docker backend to Render, Railway, Fly.io, or a VPS.
- Keep Supabase as the database and auth provider.
- Set Vercel `VITE_API_BASE_URL` to the real deployed backend URL.

## Required Environment

Backend: `backend/.env`

```env
DATABASE_URL=postgresql+psycopg://postgres.PROJECT_REF:YOUR_DB_PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=your-anon-key
GOOGLE_MAPS_API_KEY=your-google-key
ROUTING_PROVIDER=google
```

Frontend: `frontend/.env.local`

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Never commit `.env` or `.env.local`. They are ignored by `.gitignore`.

## Google Cloud APIs

Enable these APIs on the Google Cloud key used by the backend:

- Routes API
- Geocoding API
- Places API New

If your key is API-restricted, add all three APIs to the allowed list.

## Supabase Setup

Run this in Supabase SQL Editor for a clean v2 database:

```text
backend/db/migrations/0001_decision_intelligence.sql
```

That migration drops and recreates the app tables. If your database has old v1 tables and you want to repair them instead, use:

```text
backend/db/migrations/0002_repair_existing_v1_to_v2.sql
```

For a fresh project, prefer `0001`.

## Run Locally

Backend:

```powershell
cd D:\project_map\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Check:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
```

Frontend:

```powershell
cd D:\project_map\frontend
bun install
bun run dev
```

Open:

```text
http://localhost:5173
```

Chrome extension:

1. Open `chrome://extensions`
2. Enable Developer Mode
3. Click **Load unpacked**
4. Select `D:\project_map\chrome-extension`
5. Sign in on the dashboard
6. Use **Copy extension token** on the website, or **Connect from website tab** in the extension
7. Open a listing page and click **Capture**, then **Save**

## Scoring System

All scores are transparent heuristics. There is no fake AI score. Each apartment stores both score columns and a JSON `score_breakdown` audit trail. The dashboard's **Nearby & scoring** drawer shows the stored nearby POI counts, nearest places, and score audit details.

Most component scores are `0-10`.

`overall_score` is `0-100`.

`daily_friction_score` is special: higher means more daily inconvenience, so it is used as a penalty in the overall score.

### Commute Score

Inputs:

- Morning commute minutes
- Evening commute minutes
- Round trip minutes
- Transfers
- Walking minutes

Logic:

- Shorter round trip is better.
- Fewer transfers is better.
- Walking is only lightly penalized until it becomes excessive.
- Very long round trips fall sharply.

Approximate curve:

- 60 minutes round trip or less: very strong
- 90 minutes round trip: acceptable
- 120 minutes round trip: weak
- 150+ minutes round trip: poor

Penalties:

- Each average transfer reduces score.
- Walking beyond about 20 total minutes reduces score.

Exact formula from `backend/app/services/scoring.py`:

```text
round_trip = morning_minutes + evening_minutes
avg_transfers = (morning_transfers + evening_transfers) / 2
walk_min = morning_walking_minutes + evening_walking_minutes

if round_trip <= 60:
    base = 10.0
elif round_trip <= 90:
    base = 8.0 - (round_trip - 60) / 15
elif round_trip <= 120:
    base = 6.0 - (round_trip - 90) / 15
elif round_trip <= 180:
    base = 4.0 - (round_trip - 120) / 30
else:
    base = 1.5

transfer_penalty = avg_transfers * 0.8
walk_penalty = max(0, walk_min - 20) * 0.05

commute_score = clamp(base - transfer_penalty - walk_penalty, 0, 10)
```

Example:

```text
Morning: 34 min, 2 transfers, 10 min walk
Evening: 36 min, 1 transfer, 8 min walk

round_trip = 70
avg_transfers = 1.5
walk_min = 18
base = 8.0 - (70 - 60) / 15 = 7.3
transfer_penalty = 1.5 * 0.8 = 1.2
walk_penalty = 0 because 18 <= 20

commute_score = 7.3 - 1.2 = 6.1
```

### Gym Score

Inputs:

- `building_has_gym`
- Nearby gym search from Places API
- Nearest gym distance
- Gym rating when available

Logic:

- In-building gym gives `10`.
- Otherwise, closer gyms score higher.
- A nearby high-rated gym gets a small bonus.
- No nearby gym gets a low score.

Exact behavior:

```text
if building_has_gym:
    gym_score = 10.0
elif no nearby gyms:
    gym_score = 2.0
else:
    convert nearest gym distance to walking minutes
```

Distance curve:

```text
<= 3 min walk: about 9.5
<= 6 min walk: slides from 9.5 to 8.0
<= 10 min walk: slides from 8.0 to 6.0
<= 15 min walk: slides from 6.0 to 4.0
> 15 min walk: slides toward 2.0
```

Rating adjustment:

```text
rating >= 4.5: +0.3
rating < 3.5: -0.3
```

Example:

```text
No building gym
Nearest gym: 480 m away
Walking estimate: 480 / 1.3 / 60 = 6.2 min
Base around 7.9
Rating 4.6 gives +0.3

gym_score = about 8.2
```

### Grocery Score

Inputs:

- Nearby grocery stores
- Nearest grocery walking distance
- Grocery density
- Brand bonus

Logic:

- Very close grocery access scores highest.
- More grocery options nearby add a density bonus.
- Trader Joe's, Whole Foods, Target, Wegmans, Aldi, Lidl, and Costco style stores add a small brand bonus.

Exact behavior:

```text
if no nearby grocery stores:
    grocery_score = 2.0
else:
    base comes from nearest grocery walking minutes
    density_bonus = min(1.0, (grocery_count - 1) * 0.15)
    brand_bonus = capped brand score * 0.6
```

Distance curve:

```text
<= 3 min walk: 9.0
<= 7 min walk: slides from 9.0 to 7.0
<= 12 min walk: slides from 7.0 to 5.0
> 12 min walk: slides toward 2.0
```

Example:

```text
Nearest grocery: 390 m away
Walking estimate: 390 / 1.3 / 60 = 5.0 min
Grocery count: 5
Brand match: Trader Joe's nearby

base = 9.0 - (5.0 - 3) / 2 = 8.0
density_bonus = min(1.0, (5 - 1) * 0.15) = 0.6
brand_bonus = 2.0 * 0.6 = 1.2

grocery_score = clamp(8.0 + 0.6 + 1.2) = 9.8
```

### Walkability Score

Inputs:

- Restaurant density
- Cafe density
- Grocery density
- Park access
- Subway/PATH/transit station access

Logic:

- More useful nearby POIs improve the score.
- Close rail/subway access adds a meaningful bonus.
- Counts are capped so a dense restaurant area does not dominate everything.

Exact formula:

```text
poi_density =
    min(restaurants, 15) * 0.18
  + min(cafes, 12) * 0.20
  + min(groceries, 8) * 0.20
  + min(parks, 6) * 0.20

subway_score:
  <= 3 min walk: 2.2
  <= 6 min walk: 2.2 - (minutes - 3) * 0.3
  <= 12 min walk: 1.3 - (minutes - 6) * 0.15
  > 12 min walk: fades toward 0.0

walkability_score = clamp(poi_density + subway_score, 0, 10)
```

Example:

```text
restaurants = 15
cafes = 10
groceries = 4
parks = 2
nearest subway/transit = 5 min walk

poi_density = 15*0.18 + 10*0.20 + 4*0.20 + 2*0.20
            = 2.7 + 2.0 + 0.8 + 0.4
            = 5.9
subway_score = 2.2 - (5 - 3) * 0.3 = 1.6

walkability_score = 7.5
```

### Nightlife Score

Inputs:

- Restaurant count
- Cafe count
- Ratings where available

Logic:

- More restaurants and cafes increase nightlife score.
- Highly rated places count slightly more.

Exact formula:

```text
nightlife_score =
    min(restaurants, 20) * 0.20
  + min(well_rated_restaurants, 10) * 0.25
  + min(cafes, 15) * 0.10
  + min(well_rated_cafes, 8) * 0.15
```

`well_rated` means Google rating is at least `4.2`.

Example:

```text
restaurants = 18
well_rated_restaurants = 7
cafes = 8
well_rated_cafes = 4

nightlife = 18*0.20 + 7*0.25 + 8*0.10 + 4*0.15
          = 3.6 + 1.75 + 0.8 + 0.6
          = 6.8
```

### Quietness Score

Inputs:

- Restaurant density
- Cafe density
- Park density

Logic:

- More restaurants/cafes reduce quietness.
- Nearby parks improve quietness.
- This is intentionally heuristic because quietness is subjective.

Exact formula:

```text
bustle_penalty = min(restaurants, 25) * 0.18 + min(cafes, 15) * 0.12
park_bonus = min(parks, 5) * 0.6

quietness_score = clamp(9.0 - bustle_penalty + park_bonus, 0, 10)
```

Example:

```text
restaurants = 15
cafes = 10
parks = 2

bustle_penalty = 15*0.18 + 10*0.12 = 3.9
park_bonus = 2*0.6 = 1.2

quietness_score = 9.0 - 3.9 + 1.2 = 6.3
```

### Lifestyle Score

Blend of:

- Walkability: 45%
- Nightlife: 25%
- Grocery: 30%

This estimates how livable the area feels outside the commute.

Exact formula:

```text
lifestyle_score =
    walkability_score * 0.45
  + nightlife_score * 0.25
  + grocery_score * 0.30
```

If one of the inputs is missing, the available weights are renormalized.

Example:

```text
walkability = 7.5
nightlife = 6.8
grocery = 9.8

lifestyle = 7.5*0.45 + 6.8*0.25 + 9.8*0.30
          = 3.4 + 1.7 + 2.9
          = 8.0
```

### Daily Friction Score

Higher is worse.

Inputs:

- Inverse commute score
- Inverse walkability score
- Inverse grocery score
- Inverse gym score
- Transfers
- Excessive walking

This tries to measure the daily “ugh” factor: long commute, weak transit, too many transfers, annoying grocery access, or poor gym access.

Exact formula:

```text
friction =
    (10 - commute_score) * 0.45
  + (10 - walkability_score) * 0.20
  + (10 - grocery_score) * 0.15
  + (10 - gym_score) * 0.10
  + min(avg_transfers, 4) * 0.4
  + max(0, total_walking_minutes - 30) * 0.05
```

Example:

```text
commute = 6.1
walkability = 7.5
grocery = 9.8
gym = 8.2
avg_transfers = 1.5
total_walking_minutes = 18

friction =
  (3.9*0.45) + (2.5*0.20) + (0.2*0.15) + (1.8*0.10)
  + (1.5*0.4) + 0

friction = 1.76 + 0.50 + 0.03 + 0.18 + 0.60 = 3.1
```

### Overall Score

Default positive weights:

- Commute: 30%
- Walkability: 18%
- Grocery: 14%
- Gym: 10%
- Lifestyle: 14%

Penalty:

- Daily friction: 14%

Formula:

```text
positive_blend = weighted average of available positive scores
positive_100 = positive_blend * 10
friction_penalty_100 = daily_friction_score * WEIGHT_FRICTION * 10
overall_score = positive_100 - friction_penalty_100
```

Exact example:

```text
commute = 6.1
walkability = 7.5
grocery = 9.8
gym = 8.2
lifestyle = 8.0
daily_friction = 3.1

positive weighted sum =
    6.1*0.30
  + 7.5*0.18
  + 9.8*0.14
  + 8.2*0.10
  + 8.0*0.14
  = 6.49

Because positive weights sum to 0.86, the app renormalizes:
positive_blend = 6.49 / 0.86 = 7.55
positive_100 = 75.5

friction_penalty = 3.1 * 0.14 * 10 = 4.3

overall_score = 75.5 - 4.3 = 71.2
```

This means a listing can have a strong raw lifestyle profile but still lose points if the commute has many transfers or the daily friction is high.

## Why Refresh Can Feel Slow

On page load the frontend does several things:

1. Supabase restores the browser auth session.
2. The backend verifies the Supabase JWT.
3. The dashboard fetches apartments and their commute rows.
4. The dashboard fetches the target location.
5. Leaflet loads map tiles from the free tile provider.

The backend now caches successful Supabase token verification for 60 seconds, so repeated dashboard requests are faster. The app also shows a small sync indicator while apartment data is loading.

Recalculation is intentionally slower than a normal refresh because it calls Google Routes and Google Places. Use **Recalculate shown** only when you need fresh route/POI scores. Normal refresh should only read stored data from Supabase.

Weights can be overridden in `backend/.env`:

```env
WEIGHT_COMMUTE=0.30
WEIGHT_WALKABILITY=0.18
WEIGHT_GROCERY=0.14
WEIGHT_GYM=0.10
WEIGHT_LIFESTYLE=0.14
WEIGHT_FRICTION=0.14
```

## Dashboard Workflow

- Add manually or capture from the extension.
- Sort cards by overall score, commute, walkability, grocery, gym, price, morning commute, evening commute, or round trip.
- Compare up to three apartments side-by-side.
- Use the map to see spatial tradeoffs.
- Favorite promising options.
- Export to Excel when you want a spreadsheet snapshot.

## Troubleshooting

If the frontend says `Failed to fetch`, check the backend terminal. The frontend is usually fine; the backend likely returned a `500`.

If backend logs mention missing columns like `apartments.image_url`, your Supabase schema is still v1. Run `0001_decision_intelligence.sql`.

If backend logs mention database password authentication failed, fix `DATABASE_URL`. The Supabase anon key is not the database password.

If routes or places fail, confirm your Google key has Routes API, Geocoding API, and Places API New enabled.
