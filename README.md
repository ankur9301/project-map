# NYC/NJ Apartment Commute Tracker

A local full-stack apartment hunting app for ranking NYC/NJ listings by real transit commute to Bloomberg at `731 Lexington Ave, New York, NY`.

## What It Does

- Add apartments copied from Zillow, Apartments.com, StreetEasy, or broker emails.
- Geocode addresses with OpenStreetMap Nominatim.
- Calculate Monday morning commute from apartment to Bloomberg at `7:00 AM`.
- Calculate Monday evening commute from Bloomberg to apartment at `5:30 PM`.
- Store total minutes, transfers, walking time, lines used, arrival time, round trip, and commute score.
- Sort, filter, search, favorite, highlight cheapest and best commute.
- Export the full shortlist to Excel with `pandas` and `openpyxl`.
- Run locally with FastAPI, React/Vite, SQLite, Docker, OpenTripPlanner, GTFS, and OpenStreetMap.

## Project Structure

```text
backend/
  app/
    main.py
    models.py
    schemas.py
    services/
  requirements.txt
  Dockerfile
frontend/
  src/
    components/
    App.jsx
    api.js
    styles.css
  package.json
  Dockerfile
otp-data/
  README.md
scripts/
  build-otp-graph.ps1
docker-compose.yml
README.md
```

## Install Docker

1. Install Docker Desktop from [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/).
2. Start Docker Desktop.
3. Open PowerShell and verify:

```powershell
docker --version
docker compose version
```

## Download Transit and Map Data

Create or use the `otp-data/` folder. Download data into it.

Recommended GTFS feeds:

- MTA subway and bus: [MTA Developer Resources](https://www.mta.info/developers)
- NJ Transit rail/bus: [NJ Transit Developer Portal](https://developer.njtransit.com/)
- PATH GTFS if available from Port Authority or community feeds.

Recommended OSM extract:

- New York and New Jersey `.osm.pbf` extracts from [Geofabrik New York](https://download.geofabrik.de/north-america/us/new-york.html) and [Geofabrik New Jersey](https://download.geofabrik.de/north-america/us/new-jersey.html), or
- A custom NYC/NJ `.osm.pbf` from [BBBike extracts](https://extract.bbbike.org/).

Rename files clearly, for example:

```text
otp-data/
  new-york-latest.osm.pbf
  new-jersey-latest.osm.pbf
  mta-subway.zip
  mta-bus.zip
  nj-transit.zip
  path.zip
```

OTP reads every `.zip` GTFS feed and `.osm.pbf` file in the directory.

## Build the OTP Graph

From the project root:

```powershell
.\scripts\build-otp-graph.ps1
```

If Docker reports `java.lang.OutOfMemoryError`, give OTP more heap:

```powershell
.\scripts\build-otp-graph.ps1 -JavaHeap 12g
```

Or run the Docker command directly:

```powershell
docker run --rm -e JAVA_TOOL_OPTIONS="-Xmx12g" -v "${PWD}/otp-data:/var/opentripplanner" opentripplanner/opentripplanner:2.6.0 --build --save
```

When finished, confirm this exists:

```text
otp-data/graph.obj
```

## Run OTP

```powershell
docker compose up otp
```

Test OTP in a browser:

[http://localhost:8080/otp/routers/default](http://localhost:8080/otp/routers/default)

Example route API:

```text
http://localhost:8080/otp/routers/default/plan?fromPlace=40.74399,-74.03236&toPlace=40.7614205,-73.9675149&date=05-18-2026&time=07:00AM&mode=TRANSIT,WALK&arriveBy=false&numItineraries=1
```

## Run the Backend Locally

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

Backend URLs:

- API health: [http://localhost:8000/health](http://localhost:8000/health)
- Swagger docs: [http://localhost:8000/docs](http://localhost:8000/docs)
- Excel export: [http://localhost:8000/export](http://localhost:8000/export)

API examples:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:8000/apartments -ContentType "application/json" -Body '{
  "address": "77 Park Ave, Hoboken, NJ",
  "price": 3600,
  "features": "Elevator, laundry, near PATH",
  "bed": 1,
  "bath": 1,
  "vibe": "Bright, easy grocery access",
  "notes": "Tour Saturday",
  "favorite": false
}'
```

```powershell
Invoke-RestMethod http://localhost:8000/apartments
```

## Run the Frontend Locally

```powershell
cd frontend
bun install
bun run dev
```

Open:

[http://localhost:5173](http://localhost:5173)

## Run Everything With Docker Compose

Build the OTP graph first, then:

```powershell
docker compose up --build
```

Open the app:

[http://localhost:5173](http://localhost:5173)

## Commute Logic

The backend calculates two OTP transit routes:

- Morning: apartment coordinates to Bloomberg coordinates, departing next Monday at `7:00 AM`.
- Evening: Bloomberg coordinates to apartment coordinates, departing next Monday at `5:30 PM`.

The OTP request uses:

```text
mode=TRANSIT,WALK
arriveBy=false
numItineraries=1
```

The app stores:

- `total_minutes`
- `transfers`
- `walking_minutes`
- `lines`
- `estimated_arrival`
- `route_summary`
- `round trip`, computed from morning + evening

## Commute Score

The ranking score starts at `100` and subtracts penalties for:

- Longer round trip time.
- More transfers.
- More walking.
- Higher rent.

This keeps the score simple and transparent while still surfacing practical apartment tradeoffs.

## Notes on Free Services

Nominatim is free but rate-limited. Keep the app local, avoid bulk imports, and set `NOMINATIM_USER_AGENT` in `backend/.env` to include a contact email. Geocoding results are cached in SQLite to avoid repeated calls.

## Troubleshooting

If adding an apartment says `Commute pending`, OTP is probably not running or the graph is missing. Build `otp-data/graph.obj`, run `docker compose up otp`, then click the recalculate button in the table.

If OTP returns no route, check that your GTFS feeds cover both NYC subway/bus and NJ Transit/PATH for the apartment location.

If Nominatim cannot find an address, try adding city and state, for example `Hoboken, NJ` or `New York, NY`.
