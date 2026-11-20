"""One-off interactive Garmin login (supports MFA). Saves tokens so the server rarely needs your password.

    python login.py           # saves tokens to ~/.garminconnect (or GARMIN_TOKENS if it is a path)
    python login.py --print   # also prints a JSON string to paste into GARMIN_TOKENS on Render/Railway
"""

import getpass
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from garminconnect import Garmin

load_dotenv()

email = os.getenv("GARMIN_EMAIL") or input("Email Garmin: ")
password = os.getenv("GARMIN_PASSWORD") or getpass.getpass("Password Garmin: ")
tokens = os.getenv("GARMIN_TOKENS", "")
if not tokens or tokens.lstrip().startswith(("{", "[")):
    tokens = str(Path.home() / ".garminconnect")

g = Garmin(email, password, prompt_mfa=lambda: input("Codice MFA: "))
g.login(tokens)  # also writes the tokens to this path
print(f"Token salvati in {tokens}")

if "--print" in sys.argv:
    print("\nGARMIN_TOKENS=" + g.client.dumps())
