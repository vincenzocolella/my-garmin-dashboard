"""BIO-OS Telemetry API — proxy between Garmin Connect, the React dashboard and Gemini.

Routes (all /api routes require `Authorization: Bearer $APP_TOKEN` when APP_TOKEN is set):
  GET  /health                      liveness, no auth
  GET  /api/status                  which features are configured
  GET  /api/telemetry?days=30       full biometric dataset (daily vitals, intraday, activities, profile)
  POST /api/ai                      {system, prompt, json} -> Gemini text
"""

import logging
import os
import secrets
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from garminconnect import (
    Garmin,
    GarminConnectAuthenticationError,
    GarminConnectConnectionError,
    GarminConnectTooManyRequestsError,
)
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

load_dotenv()

GARMIN_EMAIL = os.getenv("GARMIN_EMAIL")
GARMIN_PASSWORD = os.getenv("GARMIN_PASSWORD")
# Directory with saved tokens, or an inline JSON token string (from `python login.py --print`).
GARMIN_TOKENS = os.getenv("GARMIN_TOKENS") or str(Path.home() / ".garminconnect")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
APP_TOKEN = os.getenv("APP_TOKEN", "")
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
CACHE_TTL_S = int(os.getenv("CACHE_TTL_S", "300"))
TZ = ZoneInfo(os.getenv("TIMEZONE", "Europe/Rome"))  # Render runs in UTC; "today" must be the user's today
WORKERS = int(os.getenv("GARMIN_WORKERS", "3"))
MAX_DETAIL_FETCH = 15  # per-activity detail calls (splits / exercise sets) per request

log = logging.getLogger("bio-os")

app = FastAPI(title="BIO-OS Telemetry API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)


def today_local() -> date:
    return datetime.now(TZ).date()


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


def garmin() -> Garmin:
    global _client
    with _client_lock:
        if _client is None:
            try:
                # garminconnect >= 0.3 loads saved tokens (path or inline JSON), falls back to
                # email/password if they are missing/invalid, and re-saves tokens when given a path.
                g = Garmin(GARMIN_EMAIL, GARMIN_PASSWORD)
                g.login(GARMIN_TOKENS)
                _client = g
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


def soft_call(fn):
    """Like garmin_call but returns None on per-item failures (missing data for one day, etc.).
    Rate limiting and login failures still propagate, since every following call would fail too."""
    try:
        return garmin_call(fn)
    except HTTPException as e:
        if e.status_code == 429 or "Login" in str(e.detail) or "non raggiungibile" in str(e.detail):
            raise
        log.warning("Garmin call failed: %s", e.detail)
        return None
    except Exception as e:  # malformed payloads, 404 for days without data, ...
        log.warning("Garmin call failed: %s", e)
        return None


# --------------------------------------------------------------------------- TTL cache
_cache: dict[str, tuple[float, float, object]] = {}
_cache_lock = threading.Lock()


def cached(key: str, producer, ttl: float = CACHE_TTL_S):
    now = time.monotonic()
    with _cache_lock:
        hit = _cache.get(key)
        if hit and now - hit[0] < hit[1]:
            return hit[2]
    value = producer()
    with _cache_lock:
        _cache[key] = (now, ttl, value)
    return value


def invalidate(prefixes: tuple[str, ...]) -> None:
    with _cache_lock:
        for k in [k for k in _cache if k.startswith(prefixes)]:
            del _cache[k]


def _dig(d, *keys):
    for k in keys:
        if not isinstance(d, dict):
            return None
        d = d.get(k)
    return d


# --------------------------------------------------------------------------- daily vitals
def load_day(d: date) -> dict:
    ds = d.isoformat()
    age = (today_local() - d).days
    ttl = CACHE_TTL_S if age <= 1 else 24 * 3600  # recent days still change (late sync), older ones don't

    def fetch():
        stats = soft_call(lambda g: g.get_stats(ds)) or {}
        sleep = soft_call(lambda g: g.get_sleep_data(ds)) or {}
        dto = sleep.get("dailySleepDTO") or {}
        hrv = sleep.get("avgOvernightHrv")
        hrv_status = sleep.get("hrvStatus")
        if hrv is None:
            h = soft_call(lambda g: g.get_hrv_data(ds)) or {}
            hrv = _dig(h, "hrvSummary", "lastNightAvg")
            hrv_status = hrv_status or _dig(h, "hrvSummary", "status")
        return {
            "date": ds,
            "hrv": hrv,
            "hrvStatus": hrv_status,
            "rhr": stats.get("restingHeartRate") or sleep.get("restingHeartRate"),
            "stress": stats.get("averageStressLevel") if (stats.get("averageStressLevel") or -1) >= 0 else None,
            "bbMax": stats.get("bodyBatteryHighestValue"),
            "bbMin": stats.get("bodyBatteryLowestValue"),
            "bbCharged": stats.get("bodyBatteryChargedValue"),
            "bbDrained": stats.get("bodyBatteryDrainedValue"),
            "steps": stats.get("totalSteps"),
            "activeKcal": stats.get("activeKilocalories"),
            "sleep": {
                "score": _dig(dto, "sleepScores", "overall", "value"),
                "total": dto.get("sleepTimeSeconds"),
                "deep": dto.get("deepSleepSeconds"),
                "rem": dto.get("remSleepSeconds"),
                "light": dto.get("lightSleepSeconds"),
                "awake": dto.get("awakeSleepSeconds"),
                "start": dto.get("sleepStartTimestampLocal"),
                "end": dto.get("sleepEndTimestampLocal"),
            }
            if dto.get("sleepTimeSeconds")
            else None,
        }

    return cached(f"day:{ds}", fetch, ttl)


def load_intraday(d: date) -> dict:
    ds = d.isoformat()

    def fetch():
        s = soft_call(lambda g: g.get_stress_data(ds)) or {}
        stress = [[p[0], p[1]] for p in (s.get("stressValuesArray") or []) if p and len(p) >= 2 and p[1] is not None]
        bb = [[p[0], p[2]] for p in (s.get("bodyBatteryValuesArray") or []) if p and len(p) >= 3 and p[2] is not None]
        return {"date": ds, "stress": stress, "bodyBattery": bb}

    return cached(f"intraday:{ds}", fetch)


# --------------------------------------------------------------------------- activities
LOWER = {"SQUAT", "DEADLIFT", "LUNGE", "LEG_CURL", "LEG_PRESS", "CALF_RAISE", "HIP_RAISE", "HIP_STABILITY",
         "HIP_SWING", "LEG_EXTENSION", "STEP_UP", "GLUTE_BRIDGE"}
UPPER = {"BENCH_PRESS", "ROW", "PULL_UP", "SHOULDER_PRESS", "CURL", "TRICEPS_EXTENSION", "LATERAL_RAISE",
         "PUSH_UP", "CHEST_FLY", "FLYE", "SHRUG", "LAT_PULLDOWN", "SHOULDER_STABILITY", "DIP"}
CORE = {"CRUNCH", "PLANK", "SIT_UP", "CORE", "LEG_RAISE", "HYPEREXTENSION"}


def _activity_kind(type_key: str | None) -> str:
    t = type_key or ""
    if "running" in t:
        return "run"
    if t == "strength_training":
        return "strength"
    return "other"


def _decoupling(splits: dict | None) -> float | None:
    """Pa:HR decoupling between first and second half of the run, in %."""
    laps = [l for l in (splits or {}).get("lapDTOs") or [] if l.get("duration") and l.get("averageHR") and l.get("distance")]
    total = sum(l["duration"] for l in laps)
    if len(laps) < 2 or total < 20 * 60:
        return None
    halves, acc = ([], []), 0.0
    for l in laps:
        halves[0 if acc + l["duration"] / 2 <= total / 2 else 1].append(l)
        acc += l["duration"]
    if not halves[0] or not halves[1]:
        return None

    def ef(ls):
        dur = sum(l["duration"] for l in ls)
        speed = sum(l["distance"] for l in ls) / dur
        hr = sum(l["averageHR"] * l["duration"] for l in ls) / dur
        return speed / hr

    first, second = ef(halves[0]), ef(halves[1])
    return round((first - second) / first * 100, 1)


def _strength_detail(sets_payload: dict | None) -> dict | None:
    sets = [s for s in (sets_payload or {}).get("exerciseSets") or [] if s.get("setType") == "ACTIVE"]
    if not sets:
        return None
    volume, reps, focus = 0.0, 0, {"Lower": 0, "Upper": 0, "Core": 0}
    for s in sets:
        r = s.get("repetitionCount") or 0
        w = s.get("weight") or 0
        w = w / 1000 if w > 300 else w  # Garmin stores set weight in grams
        volume += r * w
        reps += r
        cat = ((s.get("exercises") or [{}])[0].get("category") or "").upper()
        for name, group in (("Lower", LOWER), ("Upper", UPPER), ("Core", CORE)):
            if cat in group:
                focus[name] += 1
    n = sum(focus.values()) or 1
    if focus["Lower"] / n >= 0.3 and focus["Upper"] / n >= 0.3:
        main = "Full Body"
    else:
        main = max(focus, key=focus.get) if sum(focus.values()) else None
    return {"sets": len(sets), "reps": reps, "volumeKg": round(volume), "focus": main}


def _activity(a: dict) -> dict:
    type_key = _dig(a, "activityType", "typeKey")
    zones = [a.get(f"hrTimeInZone_{i}") for i in range(1, 6)]
    rpe = a.get("directWorkoutRpe")
    return {
        "id": a.get("activityId"),
        "date": (a.get("startTimeLocal") or "")[:10],
        "start": a.get("startTimeLocal"),
        "type": type_key,
        "kind": _activity_kind(type_key),
        "name": a.get("activityName"),
        "distance": a.get("distance") or 0,
        "duration": a.get("duration") or 0,
        "avgHr": a.get("averageHR"),
        "maxHr": a.get("maxHR"),
        "avgSpeed": a.get("averageSpeed"),
        "cadence": a.get("averageRunningCadenceInStepsPerMinute"),
        "calories": a.get("calories"),
        "aerobicTE": a.get("aerobicTrainingEffect"),
        "anaerobicTE": a.get("anaerobicTrainingEffect"),
        "garminLoad": a.get("activityTrainingLoad"),
        "elevation": a.get("elevationGain"),
        "vo2max": a.get("vO2MaxValue"),
        "avgPower": a.get("avgPower"),
        "zones": zones if any(z is not None for z in zones) else None,
        "rpe": (rpe / 10 if rpe and rpe > 10 else rpe),
        "decoupling": None,
        "strength": {"sets": a.get("activeSets") or a.get("totalSets"), "reps": a.get("totalReps"),
                     "volumeKg": None, "focus": None} if type_key == "strength_training" else None,
    }


def load_activities(start: date, end: date) -> list[dict]:
    def fetch():
        raw = garmin_call(lambda g: g.get_activities_by_date(start.isoformat(), end.isoformat())) or []
        return [_activity(a) for a in raw]

    acts = cached(f"activities:{start}:{end}", fetch)

    # Per-activity details never change once recorded -> cache for a week, fetch only the most recent ones.
    todo = [a for a in sorted(acts, key=lambda a: a["start"] or "", reverse=True)
            if (a["kind"] == "run" and a["duration"] >= 20 * 60) or a["kind"] == "strength"][:MAX_DETAIL_FETCH]

    def enrich(a):
        if a["kind"] == "run":
            a["decoupling"] = cached(f"decoupling:{a['id']}",
                                     lambda: _decoupling(soft_call(lambda g: g.get_activity_splits(a["id"]))), 7 * 86400)
        else:
            detail = cached(f"sets:{a['id']}",
                            lambda: _strength_detail(soft_call(lambda g: g.get_activity_exercise_sets(a["id"]))), 7 * 86400)
            if detail:
                a["strength"] = {**(a["strength"] or {}), **{k: v for k, v in detail.items() if v is not None}}

    with ThreadPoolExecutor(WORKERS) as ex:
        list(ex.map(enrich, todo))
    return acts


def load_profile(d: date) -> dict:
    ds = d.isoformat()

    def fetch():
        mm = soft_call(lambda g: g.get_max_metrics(ds))
        mm = mm[0] if isinstance(mm, list) and mm else mm or {}
        rp = soft_call(lambda g: g.get_race_predictions()) or {}
        rp = rp[0] if isinstance(rp, list) and rp else rp
        preds = {k: rp.get(src) for k, src in (("5k", "time5K"), ("10k", "time10K"),
                                               ("half", "timeHalfMarathon"), ("marathon", "timeMarathon"))}
        return {
            "vo2max": _dig(mm, "generic", "vo2MaxPreciseValue") or _dig(mm, "generic", "vo2MaxValue"),
            "racePredictions": preds if any(preds.values()) else None,
        }

    return cached(f"profile:{ds}", fetch, 3 * 3600)


# --------------------------------------------------------------------------- routes
@app.get("/health")
def health():
    return {"ok": True}


@app.get("/api/status", dependencies=[Depends(require_token)])
def status():
    return {"garmin": bool(GARMIN_TOKENS or GARMIN_EMAIL), "ai": bool(GEMINI_API_KEY), "model": GEMINI_MODEL}


@app.get("/api/telemetry", dependencies=[Depends(require_token)])
def telemetry(days: int = Query(30, ge=7, le=90), refresh: bool = False):
    today = today_local()
    if refresh:
        recent = tuple(f"day:{today - timedelta(i)}" for i in range(2))
        invalidate(recent + ("intraday:", "activities:", "profile:"))

    dates = [today - timedelta(i) for i in range(days - 1, -1, -1)]
    with ThreadPoolExecutor(WORKERS) as ex:
        day_rows = list(ex.map(load_day, dates))
    # 42 extra days of activities so the chronic load (CTL) is warmed up at the start of the window
    activities = load_activities(today - timedelta(days + 42), today)

    return {
        "source": "garmin",
        "generatedAt": datetime.now(TZ).isoformat(timespec="seconds"),
        "today": today.isoformat(),
        "days": day_rows,
        "intraday": load_intraday(today),
        "activities": activities,
        "profile": load_profile(today),
    }


class AIRequest(BaseModel):
    system: str = Field(max_length=8_000)
    prompt: str = Field(max_length=120_000)
    json_output: bool = Field(default=False, alias="json")


@app.post("/api/ai", dependencies=[Depends(require_token)])
def ai(req: AIRequest):
    if not GEMINI_API_KEY:
        raise HTTPException(503, "GEMINI_API_KEY non configurata sul backend")
    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=req.prompt,
            config=types.GenerateContentConfig(
                system_instruction=req.system,
                response_mime_type="application/json" if req.json_output else None,
            ),
        )
    except Exception as e:
        raise HTTPException(502, f"Errore Gemini: {e}")
    return {"text": response.text or "", "model": GEMINI_MODEL}
