# ============================================================
# sender.py — Async Alert Sender
#
# WHY ASYNC?
# SYNC (bad):
#   1. Detect accident (instant)
#   2. Send HTTP request → WAIT 500ms for response
#   3. Continue detection ← MISSED 15 FRAMES during wait!
#
# ASYNC (good):
#   1. Detect accident (instant)
#   2. Schedule HTTP request in background (instant)
#   3. Continue detection IMMEDIATELY → no frames missed
#
# Key words:
# async def → this function is a coroutine (can be paused)
# await → pause here, let other things run, resume when done
# asyncio → Python's async framework (event loop)
# ============================================================

import asyncio
import aiohttp
# aiohttp = async HTTP client
# requests.post() = blocks thread until response
# await aiohttp.post() = pauses THIS coroutine, lets others run

import json
import time
import websockets
# websockets = async WebSocket library
# WebSocket = persistent connection, server can push anytime
# Unlike HTTP: server pushes to Person 3 without them requesting

from typing import Optional, List
from config import settings
from logger import logger
from models import AccidentEvent


class AlertSender:
    """
    Sends accident alerts to Person 2 (HTTP) and Person 3 (WebSocket).

    TWO CHANNELS:
    1. HTTP POST → Person 2's REST API (stores in database)
    2. WebSocket PUSH → Person 3's dashboard (instant display)

    RETRY LOGIC:
    If HTTP fails → retry 3 times with exponential backoff
    If all retries fail → save to backup file

    WEBSOCKET:
    Person 3's dashboard connects ONCE.
    We push every accident alert automatically.
    No polling needed.
    """

    def __init__(self):
        self._session: Optional[aiohttp.ClientSession] = None
        # None until initialize() is called
        # ClientSession = reusable HTTP connection pool
        # Reusing one session is faster than creating new per request
        # (TCP connection reuse = lower latency)

        self._ws_connections: List = []
        # Active WebSocket client connections
        # Multiple dashboards can connect simultaneously

        self._sent = 0
        self._failed = 0

    async def initialize(self):
        """
        Creates the HTTP session.
        Must be called inside async context.

        Why not in __init__?
        → aiohttp.ClientSession must be created inside an async function
        → __init__ cannot be async
        → Pattern: __init__ for sync setup, initialize() for async setup
        """
        timeout = aiohttp.ClientTimeout(
            total=10,     # Max 10 seconds total per request
            connect=3,    # Max 3 seconds to establish connection
            sock_read=7,  # Max 7 seconds to read response
        )
        # Why different timeouts?
        # connect=3: if server doesn't respond in 3s, it's probably down
        # sock_read=7: server connected but is slow → be more patient

        self._session = aiohttp.ClientSession(
            timeout=timeout,
            headers={
                "Content-Type": "application/json",
                # Tell server: body is JSON
                "X-API-Key": settings.backend_api_key,
                # Authentication: Person 2 checks this header
                # Convention: custom headers use X- prefix
                "User-Agent": "AccidentDetectionSystem/2.0",
                # Identify our client to Person 2's server logs
            }
        )
        logger.info("HTTP session ready")

    async def send_alert(self, event: AccidentEvent) -> bool:
        """
        Send accident alert to Person 2.

        `async def` = coroutine. MUST use `await` when calling:
            await sender.send_alert(event)

        Returns True if successfully sent.
        """
        if self._session is None:
            await self.initialize()
            # await = "pause here until initialize() finishes"
            # During pause: asyncio runs other pending tasks

        payload = event.to_dict()
        payload["sent_at"] = time.time()

        success = await self._send_with_retry(payload)

        if success:
            self._sent += 1
            logger.info(f"Alert sent | id={event.accident_id} | total={self._sent}")
        else:
            self._failed += 1
            logger.error(f"Alert failed | id={event.accident_id}")
            await self._save_backup(payload)

        # Also push to WebSocket clients (Person 3's dashboard)
        asyncio.create_task(self._ws_broadcast(event))
        # create_task() = start coroutine in background, don't wait
        # "fire and forget" — we don't need to wait for WS to finish
        # This keeps send_alert() fast

        return success

    async def _send_with_retry(self, payload: dict) -> bool:
        """
        HTTP POST with exponential backoff retry.

        Exponential backoff:
        Attempt 1: no wait
        Attempt 2: wait 2s (2^1 * base)
        Attempt 3: wait 4s (2^2 * base)
        Attempt 4: wait 8s (2^3 * base)

        WHY EXPONENTIAL?
        Server is overloaded. Hammering it every second = worse.
        Increasing delay = gives server time to recover.
        Used by: AWS, Google, Stripe — every production system.
        """
        for attempt in range(settings.max_retries + 1):
            # range(4) = [0, 1, 2, 3] = 4 total attempts

            if attempt > 0:
                delay = (2 ** attempt) * settings.retry_delay_seconds
                # 2^1 * 2 = 4s, 2^2 * 2 = 8s, 2^3 * 2 = 16s
                logger.debug(f"Retry {attempt} in {delay:.1f}s")
                await asyncio.sleep(delay)
                # asyncio.sleep() = async version of time.sleep()
                # time.sleep() BLOCKS the event loop (freezes everything)
                # asyncio.sleep() yields control while waiting

            try:
                async with self._session.post(
                    settings.backend_url,
                    json=payload,
                    # json= → auto-serializes dict to JSON string
                    # AND sets Content-Type: application/json
                ) as response:
                    # async with = async context manager
                    # Opens connection, runs block, closes connection
                    # Connection properly closed even if exception occurs

                    if response.status in (200, 201, 202):
                        # 200 = OK, 201 = Created, 202 = Accepted
                        return True

                    elif response.status == 429:
                        # 429 = Too Many Requests (we're sending too fast)
                        wait = int(response.headers.get("Retry-After", 5))
                        # Retry-After header tells how long to wait
                        logger.warning(f"Rate limited, waiting {wait}s")
                        await asyncio.sleep(wait)
                        continue
                        # continue = go back to top of for loop

                    elif response.status >= 500:
                        # 5xx = Server error → retry makes sense
                        body = await response.text()
                        logger.warning(f"Server error {response.status}: {body[:100]}")
                        # [:100] = first 100 chars only (responses can be huge)
                        # Fall through to next iteration (retry)

                    else:
                        # 4xx = Client error = our payload is wrong
                        # Retrying won't help — same payload will fail again
                        body = await response.text()
                        logger.error(f"Client error {response.status}: {body[:200]}")
                        return False

            except aiohttp.ClientConnectorError:
                # Server completely unreachable (wrong IP, server down)
                logger.warning(f"Connection failed attempt {attempt + 1}")

            except aiohttp.ClientTimeout:
                # Request timed out
                logger.warning(f"Timeout on attempt {attempt + 1}")

            except Exception as e:
                logger.exception(f"Unexpected error: {e}")
                # logger.exception() = logger.error() + full stack trace

        return False
        # All attempts exhausted

    async def _ws_broadcast(self, event: AccidentEvent):
        """
        Push accident to all connected WebSocket clients.
        Person 3's dashboard receives this instantly.

        WebSocket vs HTTP polling:
        HTTP polling: dashboard asks "any accidents?" every second
          → 1 second delay, wasted requests
        WebSocket push: we push immediately when accident happens
          → Instant display, no wasted traffic
        """
        if not self._ws_connections:
            return

        message = json.dumps({
            "type": "accident_alert",
            "data": event.to_dict(),
            "timestamp": time.time(),
        })
        # json.dumps() = Python dict → JSON string
        # json.loads() = JSON string → Python dict (reverse)

        disconnected = []
        for ws in self._ws_connections:
            try:
                await ws.send(message)
            except websockets.exceptions.ConnectionClosed:
                disconnected.append(ws)
                # Client disconnected — add to removal list

        for ws in disconnected:
            self._ws_connections.remove(ws)
            # Clean up disconnected clients
            # Don't remove during iteration (modifies list while looping = bug)
            # Remove AFTER the loop

    async def handle_ws_client(self, websocket, path):
        """
        Called when Person 3's dashboard connects via WebSocket.

        Person 2 exposes this as a server:
            server = await websockets.serve(
                sender.handle_ws_client, "0.0.0.0", 8765
            )

        Or Person 1 can run their own WebSocket server.
        Discuss with team which approach.
        """
        ip = websocket.remote_address[0]
        logger.info(f"Dashboard connected: {ip}")
        self._ws_connections.append(websocket)

        try:
            # Send welcome message
            await websocket.send(json.dumps({
                "type": "connected",
                "message": "Accident Detection System Online",
            }))

            # Keep connection alive
            async for message in websocket:
                # async for = async iterator
                # Waits for messages FROM the dashboard
                # Runs until connection closes

                try:
                    data = json.loads(message)
                    if data.get("type") == "ping":
                        await websocket.send(json.dumps({"type": "pong"}))
                        # Heartbeat: dashboard pings → we pong
                        # Keeps connection alive through firewalls/proxies
                except json.JSONDecodeError:
                    pass

        except websockets.exceptions.ConnectionClosed:
            pass
            # Normal disconnection — not an error

        finally:
            # finally = ALWAYS runs (even after exceptions)
            # Perfect for cleanup
            if websocket in self._ws_connections:
                self._ws_connections.remove(websocket)
            logger.info(f"Dashboard disconnected: {ip}")

    async def _save_backup(self, payload: dict):
        """Save failed alert to disk for retry on next startup."""
        import aiofiles
        backup_file = settings.log_dir / "failed_alerts.json"

        try:
            existing = []
            if backup_file.exists():
                async with aiofiles.open(backup_file, 'r') as f:
                    content = await f.read()
                    # await f.read() = async file read (non-blocking)
                    if content:
                        existing = json.loads(content)

            existing.append({"payload": payload, "failed_at": time.time()})

            async with aiofiles.open(backup_file, 'w') as f:
                await f.write(json.dumps(existing, indent=2))
                # indent=2 = pretty-print JSON (human-readable backup file)

        except Exception as e:
            logger.error(f"Backup save failed: {e}")

    async def close(self):
        """Cleanup on shutdown."""
        if self._session:
            await self._session.close()

    @property
    def stats(self) -> dict:
        total = self._sent + self._failed
        return {
            "sent": self._sent,
            "failed": self._failed,
            "success_rate": f"{self._sent/total*100:.1f}%" if total > 0 else "N/A",
            "ws_clients": len(self._ws_connections),
        }