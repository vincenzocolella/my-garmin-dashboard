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

## Dashboard

Three tabs plus a global time selector (7D/14D/30D/90D):

- **Health & Recovery**: Readiness score (multi-ring: HRV+RHR, sleep, stress, Body Battery vs 30-day baseline), longevity index, HRV/RHR matrix with a ±1 SD band, sleep architecture and 7-day debt, intraday stress vs Body Battery (ineffective recovery, post-meal and evening stress), AI Bio-Audit.
- **Running Performance**: PMC (CTL/ATL/TSB with zones) + ACWR, Efficiency Factor and Pa:HR decoupling, 80/20 polarized check, race predictor (VDOT + Garmin), sortable run table with per-session critique, AI Running Coach.
- **Strength & Hybrid**: cardio vs neuromuscular load and interference conflicts (leg day ↔ intervals/long run), balance radar, weekly tonnage, editable RPE/focus, quick manual log, AI Hybrid Strategist.

AI everywhere: global Judge with 3 personas (Quant / Sergeant / Strategist), per-card micro-insights (one batched JSON call), "Ask Your Telemetry" chat. Providers: backend (Gemini on the server, recommended), Gemini/OpenAI key in the browser, or the **heuristic engine only**, which works offline and is always shown as the first draft.

**Demo** mode with 4 scenarios (Balanced, Overtraining, Peak Form, Sleep Deprivation) and JSON import/export, all from ⚙️ Settings.

All analytics run in the browser ([frontend/src/lib/analytics.js](frontend/src/lib/analytics.js)); the backend only fetches and caches the data.

## Endpoints (all `/api/*` require `Authorization: Bearer $APP_TOKEN`)

| Route | Content |
|---|---|
| `GET /api/telemetry?days=30` | daily vitals (HRV, RHR, sleep stages, stress, Body Battery, steps), today's intraday stress/BB, activities for `days+42` days (HR zones, cadence, TE, decoupling from splits, sets/tonnage/focus for strength), VO2max, Garmin race predictions |
| `GET /api/status` | which features are configured (Garmin, Gemini model) |
| `POST /api/ai` | `{system, prompt, json}` → Gemini text |
| `GET /health` | no auth, for the host's health check |

Caching: past days 24 h, recent days/activities 5 min, per-activity details 7 days. The first 30-day load makes ~65 Garmin calls (~180 for 90 days); after that, almost none. `?refresh=true` (the "Sync & Judge Now" button) re-reads only the last 2 days.

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
