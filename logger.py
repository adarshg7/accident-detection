# ============================================================
# logger.py — Loguru Advanced Logging
#
# WHY NOT Python's built-in logging?
# Built-in: 15+ lines to configure properly
# Loguru: 3 lines, cleaner output, better features
#
# What Loguru gives us:
# → Colored terminal (INFO=blue, WARNING=yellow, ERROR=red)
# → Auto-rotating log files (don't fill up disk)
# → Separate error file (find bugs fast)
# → Full exception tracebacks in files
# ============================================================

from loguru import logger
# logger = global singleton — import it anywhere, works everywhere
# No need to do: logger = logging.getLogger(__name__) like built-in

import sys
from config import settings


def setup_logger():
    """
    Configures the global logger.
    Called ONCE at startup.
    After this: every file just does: from logger import logger
    """

    logger.remove()
    # Remove default handler.
    # Loguru adds a basic stdout handler by default.
    # We remove it so we can add our OWN custom configuration.

    # ── HANDLER 1: Terminal Output ────────────────────────
    log_format = (
        "{time:YYYY-MM-DD HH:mm:ss} | "
        # {time:FORMAT} → timestamp
        # YYYY=year, MM=month, DD=day, HH=hour, mm=min, ss=sec

        "{level: <8} | "
        # {level} → INFO, WARNING, ERROR, etc.
        # : <8 → left-align, pad to 8 chars (keeps columns aligned)
        # INFO    | WARNING | ERROR   ← looks neat

        "{name}:{function}:{line} | "
        # {name} → which file (detector, sender, etc.)
        # {function} → which function the log came from
        # {line} → line number

        "{message}"
        # Your actual message
    )

    logger.add(
        sys.stdout,
        format=log_format,
        level=settings.log_level,    # INFO, DEBUG, WARNING, etc.
        colorize=True,               # Color the terminal output
        backtrace=True,              # Full stack trace on errors
        diagnose=settings.is_development,
        # diagnose=True shows VARIABLE VALUES on exception
        # Example: shows confidence=0.87 when crash happens
        # Turn OFF in production (might expose sensitive data)
    )

    # ── HANDLER 2: Main Log File ──────────────────────────
    logger.add(
        settings.log_dir / "app.log",
        # Path / "filename" = cross-platform path joining
        # Same as: os.path.join(settings.log_dir, "app.log")

        format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function}:{line} | {message}",
        # No colorize in files → color codes appear as garbled escape chars

        level=settings.log_level,
        rotation="50 MB",
        # When file hits 50MB, start a new file
        # Old file gets named: app.2024-01-01_10-30.log
        # Without rotation: one huge file fills your disk

        retention="14 days",
        # Delete log files older than 14 days automatically
        # Prevents disk from filling up with old logs

        compression="zip",
        # Compress rotated files to save space
        encoding="utf-8",
        backtrace=True,
        diagnose=False,  # Never put variable values in files (security)
    )

    # ── HANDLER 3: Error-Only File ────────────────────────
    logger.add(
        settings.log_dir / "errors.log",
        format="{time} | {level} | {name}:{function}:{line} | {message}\n{exception}",
        # {exception} → full exception traceback (only shows on errors)
        
        level="ERROR",
        # ONLY ERROR and CRITICAL messages go here
        # Why separate? → When debugging: open errors.log
        # See only crashes, no noise from 10,000 INFO messages

        rotation="10 MB",
        retention="30 days",  # Keep errors longer than normal logs
        compression="zip",
    )

    logger.info("Logger ready")
    logger.debug(f"Log level: {settings.log_level} | Log dir: {settings.log_dir}")
    # logger.debug → only shows if LOG_LEVEL=DEBUG in .env
    # logger.info → shows for INFO and above
    # logger.warning → notable events
    # logger.error → something failed
    # logger.critical → system-breaking failure


setup_logger()
# Call immediately when this module is imported
# So: from logger import logger → already configured, ready to use