# ============================================================
# config.py — Centralized Configuration with Validation
#
# WHY PYDANTIC FOR CONFIG?
# Problem without it:
#   CONFIDENCE_THRESHOLD = os.getenv("CONFIDENCE_THRESHOLD")
#   → This is a STRING "0.55", not a float 0.55
#   → You forget to convert → comparison fails silently
#   → Bug found 2 hours later
#
# With Pydantic:
#   confidence_threshold: float = 0.55
#   → Auto-converts "0.55" (string) → 0.55 (float)
#   → If someone puts "abc" → Error at STARTUP, not later
#   → Type is documented FOR FREE
# ============================================================

from pydantic_settings import BaseSettings
# BaseSettings = Pydantic class that:
# 1. Reads .env file automatically
# 2. Validates all values against their type hints
# 3. Auto-converts types (string → float, string → int, etc.)

from pydantic import Field
# Field = adds extra rules to a setting
# Field(ge=0.0, le=1.0) means "must be between 0 and 1"
# ge = greater than or equal, le = less than or equal

from typing import List, Union
# List = type hint for a list: List[int] = list of integers
# Union = can be one of multiple types: Union[int, str] = int OR string

from pathlib import Path
# Path = modern cross-platform file paths
# Path("screenshots") / "file.jpg" works on Windows AND Linux
# Unlike: "screenshots" + "/" + "file.jpg" (breaks on Windows)

import os


class Settings(BaseSettings):
    # Each attribute matches a .env key (case-insensitive)
    # Type hints tell Pydantic what to convert to

    # ── BACKEND ──────────────────────────────────────────
    backend_url: str = Field(
        default="http://localhost:5000/api/accident"
    )
    backend_ws_url: str = Field(
        default="ws://localhost:5000/ws/live"
    )
    backend_api_key: str = Field(default="")

    # ── VIDEO ─────────────────────────────────────────────
    video_sources: str = Field(default="0")
    # Stored as raw string — we parse into list with @property below
    # Why not List directly? → .env can't store Python lists natively

    @property
    def video_source_list(self) -> List[Union[int, str]]:
        """
        Converts "0,1,road.mp4" → [0, 1, "road.mp4"]

        @property = lets you call settings.video_source_list
        as if it's an attribute, but it runs code each time.
        No parentheses needed: settings.video_source_list (not ...list())

        Union[int, str] = each item is EITHER int OR str
        Webcam indices are int (0, 1, 2)
        File paths / RTSP URLs are str
        """
        sources = []
        for s in self.video_sources.split(","):
            # .split(",") → "0,1,road.mp4" becomes ["0", "1", "road.mp4"]
            s = s.strip()
            # .strip() removes whitespace: "  0  " → "0"
            if s.isdigit():
                sources.append(int(s))
                # Webcam index MUST be integer for OpenCV
            else:
                sources.append(s)
                # File paths stay as strings
        return sources

    # ── AI MODEL ─────────────────────────────────────────
    model_path: str = Field(default="models/yolo11n.pt")

    confidence_threshold: float = Field(
        default=0.55,
        ge=0.0,  # ge = greater than or equal
        le=1.0,  # le = less than or equal
    )
    # Pydantic enforces 0.0-1.0 range automatically
    # If .env has CONFIDENCE_THRESHOLD=1.5 → ValidationError at startup

    iou_threshold: float = Field(default=0.45, ge=0.0, le=1.0)

    # ── FRAME PROCESSING ─────────────────────────────────
    frame_skip: int = Field(default=2, ge=1)
    frame_buffer_size: int = Field(default=150, ge=10)

    frame_delay_ms: int = Field(
    default=33,
    ge=0,
    description="Delay between frames in milliseconds. 33=30fps, 0=max speed"
    )
    
    # ── ALERTS ───────────────────────────────────────────
    alert_cooldown_seconds: int = Field(default=10, ge=1)
    max_retries: int = Field(default=3, ge=0)
    retry_delay_seconds: float = Field(default=2.0, ge=0.0)

    # ── STORAGE ──────────────────────────────────────────
    screenshot_dir: Path = Field(default=Path("screenshots"))
    # Path type → Pydantic converts string "screenshots" → Path object
    log_dir: Path = Field(default=Path("logs"))

    # ── SYSTEM ───────────────────────────────────────────
    log_level: str = Field(default="INFO")
    environment: str = Field(default="development")

    @property
    def is_development(self) -> bool:
        """Returns True in development mode"""
        return self.environment.lower() == "development"
        # .lower() → "Development" == "development" → True (case-insensitive)

    @property
    def computed_device(self) -> str:
        """
        Figures out the best device: GPU or CPU.

        Why not just use "auto"?
        → torch.device("auto") doesn't exist
        → We must CHECK if GPU is available ourselves
        → Then return "cuda:0", "mps", or "cpu"
        """
        try:
            import torch
            if torch.cuda.is_available():
                # cuda = NVIDIA GPU
                # cuda:0 = first GPU, cuda:1 = second GPU
                return "cuda:0"
            elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
                # mps = Apple Silicon GPU (M1/M2/M3 Macs)
                return "mps"
            else:
                return "cpu"
        except ImportError:
            return "cpu"

    class Config:
        # Inner class that configures Pydantic behavior
        # (Different from our outer Settings class — different purpose)
        env_file = ".env"           # Read from .env file
        env_file_encoding = "utf-8" # File encoding
        case_sensitive = False      # BACKEND_URL and backend_url both work
        extra = "ignore"            # Extra keys in .env don't cause errors


# ── CREATE SINGLE GLOBAL INSTANCE ────────────────────────
# Why one global instance?
# → All files import THIS one object
# → Settings loaded from disk exactly ONCE
# → If 10 files each created Settings(), it reads .env 10 times
settings = Settings()

# Create required directories when config loads
# Why here? → Guaranteed to exist before ANY code tries to use them
settings.screenshot_dir.mkdir(parents=True, exist_ok=True)
# parents=True → creates parent folders too if needed
# exist_ok=True → no error if folder already exists

settings.log_dir.mkdir(parents=True, exist_ok=True)

print(f"[Config] Loaded | env={settings.environment} | device={settings.computed_device}")
print(f"[Config] Sources: {settings.video_source_list}")
print(f"[Config] Backend: {settings.backend_url}")