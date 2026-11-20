# BIO-OS // Telemetry

Personal Garmin dashboard (Forerunner 165): vitals & recovery, sport & weights, plus an AI "judge" (Gemini).

```
backend/   FastAPI + garminconnect (unofficial) + google-genai
frontend/  React 19 + Vite + Tailwind v4
```

## Local setup

Requires Python ≥ 3.10 and Node ≥ 20 (Tailwind v4).

```bash
# backend
cd backend
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # fill in GEMINI_API_KEY, APP_TOKEN, optionally GARMIN_EMAIL/PASSWORD
python login.py               # one-time Garmin login (asks for the MFA code if enabled), saves tokens
uvicorn main:app --reload     # http://localhost:8000

# frontend
cd ../frontend
cp .env.example .env
npm install && npm run dev    # http://localhost:5173 — enter APP_TOKEN on first visit
```

## Endpoints (all require `Authorization: Bearer $APP_TOKEN`)

| Route | Content |
|---|---|
| `GET /api/main-dashboard` | sleep score/hours, resting HR, HRV (status, night, 7-day), stress, Body Battery, steps |
| `GET /api/sport-dashboard` | last 10 activities (type, date, distance, duration, HR, kcal, training load / TE) |
| `GET /api/ai-judge` | Gemini analysis of the data above |
| `GET /health` | no auth, for the host's health check |

Garmin responses are cached for `CACHE_TTL_S` (default 5 min), and there's a single shared login, so Garmin's rate limit (429) isn't triggered.

## Deploy

1. **Backend → Render / Railway** (web service, start command `uvicorn main:app --host 0.0.0.0 --port $PORT`, root `backend/`).
   Env vars: `GEMINI_API_KEY`, `APP_TOKEN`, `ALLOWED_ORIGINS=https://<your-frontend>`, and
   `GARMIN_TOKENS` = the JSON printed by `python login.py --print` (these hosts' disks are ephemeral,
   and logging in from a datacenter IP with a password often gets blocked or asks for MFA).
2. **Frontend → Vercel / Netlify**, root `frontend/`, env var `VITE_API_BASE=https://<your-backend>/api`.

Notes:
- `APP_TOKEN` matters: without it, anyone who finds the URL can read your health data and burn your Gemini quota.
  The token is never embedded in the frontend bundle; you type it in the browser (it's stored in localStorage).
- The Render free tier sleeps after inactivity, so the first request can take ~30-60 s.
- `garminconnect` is an unofficial library. If Garmin changes its login, update it (`pip install -U garminconnect`).
