"""BIO-OS Telemetry API — bridge between Garmin Connect, the React frontend and Gemini."""

import logging
import os
import secrets
import threading
import time
from datetime import date
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from garminconnect import (
    Garmin,
    GarminConnectAuthenticationError,
    GarminConnectConnectionError,
    GarminConnectTooManyRequestsError,
)
from google import genai

load_dotenv()

GARMIN_EMAIL = os.getenv("GARMIN_EMAIL")
GARMIN_PASSWORD = os.getenv("GARMIN_PASSWORD")
# Directory with saved tokens, or an inline JSON token string (from `python login.py --print`).
# Reusing tokens avoids a full login on every restart, which Garmin rate-limits (HTTP 429).
GARMIN_TOKENS = os.getenv("GARMIN_TOKENS") or str(Path.home() / ".garminconnect")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
# Shared secret required by every /api call. Leave empty only for local development.
APP_TOKEN = os.getenv("APP_TOKEN", "")
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
CACHE_TTL_S = int(os.getenv("CACHE_TTL_S", "300"))

log = logging.getLogger("bio-os")

app = FastAPI(title="BIO-OS Telemetry API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET"],
    allow_headers=["Authorization"],
)


# --------------------------------------------------------------------------- auth
def require_token(authorization: str = Header(default="")) -> None:
    if not APP_TOKEN:
        return
    supplied = authorization.removeprefix("Bearer ").strip()
    if not secrets.compare_digest(supplied, APP_TOKEN):
        raise HTTPException(status_code=401, detail="Token di accesso mancante o errato")


# --------------------------------------------------------------------------- garmin client
_client: Garmin | None = None
_client_lock = threading.Lock()


def _login() -> Garmin:
    # garminconnect >= 0.3 loads saved tokens (path or inline JSON), falls back to
    # email/password if they are missing/invalid, and re-saves tokens when given a path.
    g = Garmin(GARMIN_EMAIL, GARMIN_PASSWORD)
    g.login(GARMIN_TOKENS)
    return g


def garmin() -> Garmin:
    global _client
    with _client_lock:
        if _client is None:
            try:
                _client = _login()
            except HTTPException:
                raise
            except GarminConnectTooManyRequestsError:
                raise HTTPException(429, "Garmin sta limitando i login (429). Riprova più tardi.")
            except GarminConnectAuthenticationError as e:
                raise HTTPException(502, f"Login Garmin fallito: {e}")
            except Exception as e:
                raise HTTPException(502, f"Garmin non raggiungibile: {e}")
        return _client


def garmin_call(fn):
    """Run fn(client); on an auth error drop the cached client and retry once."""
    global _client
    for attempt in (1, 2):
        g = garmin()
        try:
            return fn(g)
        except GarminConnectAuthenticationError:
            with _client_lock:
                _client = None
            if attempt == 2:
                raise HTTPException(502, "Sessione Garmin scaduta")
        except GarminConnectTooManyRequestsError:
            raise HTTPException(429, "Garmin rate limit (429). Riprova più tardi.")
        except GarminConnectConnectionError as e:
            raise HTTPException(502, f"Errore Garmin: {e}")


# --------------------------------------------------------------------------- tiny TTL cache
_cache: dict[str, tuple[float, object]] = {}
_cache_lock = threading.Lock()


def cached(key: str, producer):
    now = time.monotonic()
    with _cache_lock:
        hit = _cache.get(key)
        if hit and now - hit[0] < CACHE_TTL_S:
            return hit[1]
    value = producer()
    with _cache_lock:
        _cache[key] = (now, value)
    return value


def _dig(d, *keys):
    for k in keys:
        if not isinstance(d, dict):
            return None
        d = d.get(k)
    return d


# --------------------------------------------------------------------------- data
def load_daily() -> dict:
    today = date.today().isoformat()

    def fetch():
        stats = garmin_call(lambda g: g.get_stats(today)) or {}
        sleep = garmin_call(lambda g: g.get_sleep_data(today)) or {}
        hrv = garmin_call(lambda g: g.get_hrv_data(today)) or {}
        return {
            "date": today,
            "heart_rate_rest": stats.get("restingHeartRate"),
            "steps": stats.get("totalSteps"),
            "stress_avg": stats.get("averageStressLevel"),
            "body_battery_now": stats.get("bodyBatteryMostRecentValue"),
            "body_battery_max": stats.get("bodyBatteryHighestValue"),
            "sleep_score": _dig(sleep, "dailySleepDTO", "sleepScores", "overall", "value"),
            "sleep_hours": round(s / 3600, 1) if (s := _dig(sleep, "dailySleepDTO", "sleepTimeSeconds")) else None,
            "hrv_status": _dig(hrv, "hrvSummary", "status"),
            "hrv_last_night": _dig(hrv, "hrvSummary", "lastNightAvg"),
            "hrv_weekly_avg": _dig(hrv, "hrvSummary", "weeklyAvg"),
        }

    return cached(f"daily:{today}", fetch)


def load_activities(limit: int = 10) -> list[dict]:
    def fetch():
        acts = garmin_call(lambda g: g.get_activities(0, limit)) or []
        return [
            {
                "id": a.get("activityId"),
                "name": a.get("activityName"),
                "type": _dig(a, "activityType", "typeKey"),
                "start": a.get("startTimeLocal"),
                "distance_km": round((a.get("distance") or 0) / 1000, 2),
                "duration_min": round((a.get("duration") or 0) / 60, 1),
                "avg_hr": a.get("averageHR"),
                "max_hr": a.get("maxHR"),
                "calories": a.get("calories"),
                "training_load": a.get("activityTrainingLoad"),
                "aerobic_te": a.get("aerobicTrainingEffect"),
                "anaerobic_te": a.get("anaerobicTrainingEffect"),
            }
            for a in acts
        ]

    return cached(f"activities:{limit}", fetch)


# --------------------------------------------------------------------------- routes
@app.get("/health")
def health():
    return {"ok": True}


@app.get("/api/main-dashboard", dependencies=[Depends(require_token)])
def main_dashboard():
    return load_daily()


@app.get("/api/sport-dashboard", dependencies=[Depends(require_token)])
def sport_dashboard():
    return load_activities()


def _fmt_activity(a: dict) -> str:
    parts = [f"{a['start'] or '?'} — {a['type']} «{a['name']}»", f"{a['duration_min']} min"]
    if a["distance_km"]:
        parts.append(f"{a['distance_km']} km")
    for label, key in (("FC media", "avg_hr"), ("FC max", "max_hr"), ("kcal", "calories"),
                       ("carico", "training_load"), ("TE aerobico", "aerobic_te"), ("TE anaerobico", "anaerobic_te")):
        if a.get(key) is not None:
            parts.append(f"{label} {round(a[key], 1) if isinstance(a[key], float) else a[key]}")
    return "- " + ", ".join(parts)


@app.get("/api/ai-judge", dependencies=[Depends(require_token)])
def ai_judge():
    if not GEMINI_API_KEY:
        raise HTTPException(503, "GEMINI_API_KEY non configurata")
    daily = load_daily()
    acts = load_activities()

    prompt = f"""Sei un'AI spietata, professionale ed esperta di telemetria atletica e biohacking.
Giudica la giornata di questo utente. Non usare frasi fatte. Se un dato manca, dillo e non inventarlo.

Oggi è {daily['date']}.
Dati vitali di oggi:
- Punteggio sonno: {daily['sleep_score']}/100 ({daily['sleep_hours']} h)
- Stress medio: {daily['stress_avg']}
- FC a riposo: {daily['heart_rate_rest']} bpm
- HRV: stato {daily['hrv_status']}, notte {daily['hrv_last_night']} ms, media 7gg {daily['hrv_weekly_avg']} ms
- Body Battery: attuale {daily['body_battery_now']}, massimo {daily['body_battery_max']}
- Passi: {daily['steps']}

Ultime attività (più recenti prima):
{chr(10).join(_fmt_activity(a) for a in acts) or '- nessuna'}

Analizza il bilanciamento tra lavoro cardiovascolare (corsa), ipertrofia (pesi) e recupero notturno.
Dimmi esattamente cosa sta sbagliando e come ottimizzare il carico nei prossimi giorni. Sii diretto e analitico."""

    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
        response = client.models.generate_content(model=GEMINI_MODEL, contents=prompt)
    except Exception as e:
        raise HTTPException(502, f"Errore Gemini: {e}")
    return {"judgment": response.text}
