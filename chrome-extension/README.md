# Apartment Commute Capture Chrome Extension

This is the safe capture helper for the local apartment tracker.

## What It Does

- Runs only when you click the extension.
- Reads the current visible listing page.
- Extracts address, price, bed, bath, listing URL, source, and agent/contact details when available.
- Sends the result only to your local backend at `http://127.0.0.1:8000`.

## What It Does Not Do

- It does not crawl search results.
- It does not click through listings automatically.
- It does not bypass login, CAPTCHA, rate limits, or bot checks.
- It does not read or transmit cookies/passwords.
- It does not send data to any third-party server.

## Install Locally

1. Start your backend:

```powershell
cd D:\project_map\backend
.\.venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

2. Open Chrome or Edge.
3. Go to `chrome://extensions` or `edge://extensions`.
4. Turn on `Developer mode`.
5. Click `Load unpacked`.
6. Select:

```text
D:\project_map\chrome-extension
```

7. Open a Zillow listing page.
8. Click the extension icon.
9. Click `Capture`.
10. Review the preview.
11. Click `Save`.

Then open the tracker:

```text
http://localhost:5173/
```
