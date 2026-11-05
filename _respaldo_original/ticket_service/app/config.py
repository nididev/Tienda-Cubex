import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    DATABASE_URL = os.getenv("DATABASE_URL", "")
    APP_PORT = int(os.getenv("APP_PORT", "3025"))

    CORS_ORIGINS = [
        x.strip()
        for x in os.getenv(
            "CORS_ORIGINS",
            "http://localhost:5500,http://127.0.0.1:5500"
        ).split(",")
        if x.strip()
    ]

settings = Settings()