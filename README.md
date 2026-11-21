# Garmin Dashboard

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

Five tabs plus a global time selector (7D/14D/30D/90D). Every card has an **ⓘ** button explaining what the metric is, how it is computed and how to read it ([frontend/src/lib/info.js](frontend/src/lib/info.js)).

- **Health & Recovery**: Readiness (0-100, ~88 = your normal) from HRV+RHR, sleep, stress, Body Battery vs a 30-day baseline; longevity index; HRV/RHR matrix with ±1 SD band; sleep architecture, debt and bedtime regularity; intraday stress vs Body Battery; AI Sleep Coach and AI Recovery analysis.
- **Sub-2 Plan**: the 22-week half-marathon plan from [training-app](https://github.com/vincenzocolella/training-app) ([frontend/src/lib/planData.js](frontend/src/lib/planData.js)). Garmin runs are matched automatically to planned sessions; pace blocks and control HR are checked from 1 km laps; the A/B/C checkpoints (weeks 9/13/15/18) are graded automatically; the optional second run is advised from readiness/load/wellness. AI Plan Coach applies the plan's rules.
- **Running**: PMC (CTL/ATL with a TSB scale, TSB and ACWR charts), efficiency factor and decoupling, 80/20 check, race predictor, sortable runs table, AI Running Coach.
- **Strength**: cardio vs neuromuscular load, interference conflicts, balance radar, tonnage, editable RPE/focus, AI Hybrid Strategist.
- **Wellness**: scans up to 180 days for periods when you were likely unwell. A day is flagged when RHR↑ and HRV↓ deviate together from a robust 30-day baseline (median/MAD), supported by stress, sleep and Body Battery. Days are grouped into episodes, classified (illness / overreaching / sleep debt / stress), and shown with the training done during the episode and the recovery time. AI Health Detective.

AI everywhere: global Judge with 3 personas, per-card micro-insights (one batched JSON call), "Chiedi ai tuoi dati" chat. Providers: backend (Gemini on the server, recommended), Gemini/OpenAI key in the browser, or the deterministic **heuristic engine** (always available, offline).

Daily vitals are cached in the browser: each load only fetches missing days, and up to 180 days of history are backfilled in the background in 31-day chunks.

**Demo** mode with 4 scenarios (200 days, 2 injected illness episodes, plan-shaped key sessions with laps) and JSON import/export, from ⚙️ Settings.

## Endpoints (all `/api/*` require `Authorization: Bearer $APP_TOKEN`)

| Route | Content |
|---|---|
| `GET /api/telemetry?days=30&since=YYYY-MM-DD` | daily vitals (only days ≥ `since` plus the last 2) (HRV, RHR, sleep stages, stress, Body Battery, steps), today's intraday stress/BB, activities for 222 days (HR zones, cadence, TE, 1 km laps and decoupling from splits, sets/tonnage/focus for strength), VO2max, Garmin race predictions |
| `GET /api/days?start=&end=` | daily vitals only, ≤ 31 days per call (history backfill) |
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
