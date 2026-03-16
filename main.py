# ============================================================
# main.py — Complete System Orchestrator
#
# This file owns and coordinates EVERYTHING:
#
# ┌─────────────────────────────────────────────────────────┐
# │                     MAIN.PY                              │
# │                                                          │
# │  MultiCameraProcessor  → reads frames (threaded)         │
# │  AccidentDetector      → YOLOv11 detection per camera    │
# │  AlertSender           → HTTP to Person 2 (async)        │
# │  EmergencyResponseSystem →                               │
# │      MapplsService     → finds nearby places             │
# │      TwilioService     → calls + SMS + WhatsApp          │
# │  LocationService       → GPS / cell tower / fixed        │
# └─────────────────────────────────────────────────────────┘
#
# THREAD LAYOUT:
# Thread 1 (main)  : OpenCV display + frame processing loop
# Thread 2         : Camera 0 capture (blocks on cap.read())
# Thread 3         : Camera 1 capture (if configured)
# Thread 4         : Asyncio event loop (HTTP sending)
#
# HOW SYNC + ASYNC WORK TOGETHER:
# Problem: HTTP sending (sender.py) is async.
#          Main loop is sync (normal Python).
#          They can't directly mix.
# Solution: Run asyncio loop in Thread 4.
#           Use run_coroutine_threadsafe() to submit async
#           tasks from sync code (Thread 1).
# ============================================================

# ── Standard Library ──────────────────────────────────────
import asyncio
# asyncio = Python's async framework
# We use it for non-blocking HTTP alerts to Person 2

import threading
# threading = run multiple things simultaneously
# Camera capture, async loop, main loop all run concurrently

import signal
# signal = catches OS signals (Ctrl+C = SIGINT, kill = SIGTERM)
# Lets us do cleanup before program exits

import sys
# sys.exit() = exit program with status code
# sys.version = Python version info

import time
# time.time() = current Unix timestamp (float, seconds since 1970)
# time.sleep() = pause execution

import os
# os.path.exists() = check if file/folder exists
# os.makedirs() = create folders

# ── Third Party ───────────────────────────────────────────
import cv2
# cv2 = OpenCV = computer vision library
# cv2.imshow() = display video window
# cv2.waitKey() = keyboard input + window refresh

# ── Our Own Files ─────────────────────────────────────────
from config import settings
# settings = single global config object
# Reads from .env file, validates types with Pydantic

from logger import logger
# logger = configured Loguru logger
# logger.info(), logger.warning(), logger.error()

from detector import AccidentDetector
# AccidentDetector = YOLOv11 detection engine
# One instance per camera
# .detect(frame) → (is_accident, annotated_frame, AccidentEvent)

from video_processor import MultiCameraProcessor
# MultiCameraProcessor = manages all cameras
# Each camera runs on its own background thread
# .get_frames() = generator yielding (source_id, FrameData)

from sender import AlertSender
# AlertSender = async HTTP + WebSocket sender
# Sends AccidentEvent to Person 2's backend
# Sends real-time alerts to Person 3's dashboard

from emergency_response import EmergencyResponseSystem
# EmergencyResponseSystem = full emergency orchestrator
# Calls police, ambulance, SMS nearby places
# Uses Mappls for location lookup + Twilio for comms

from models import AccidentEvent
# AccidentEvent = structured accident data
# Shared data model used by all files


# ════════════════════════════════════════════════════════════
# MAIN SYSTEM CLASS
# ════════════════════════════════════════════════════════════

class AccidentDetectionSystem:
    """
    Master system class.

    RESPONSIBILITIES:
    → Creates and owns all components
    → Starts camera threads + async loop
    → Runs main frame processing loop
    → Handles graceful shutdown
    → Prints statistics on exit

    USAGE:
        system = AccidentDetectionSystem()
        system.start()
        system.run()   ← blocks until stopped
    """

    def __init__(self):
        """
        Creates all components.
        Does NOT start anything yet — that's start()'s job.

        Why separate __init__ and start()?
        → __init__ = what do I have?
        → start() = turn everything on
        → Easier to test, easier to understand
        """

        self._print_banner()

        # ── Camera Processor ──────────────────────────
        self.cameras = MultiCameraProcessor()
        # Reads VIDEO_SOURCES from .env
        # Creates one SingleCameraCapture per source
        # Each capture runs on its own background thread

        # ── Detectors (one per camera) ─────────────────
        self.detectors = {}
        # Dict: source_id → AccidentDetector
        # Example: {"camera_0": detector0, "camera_1": detector1}

        for source_id in self.cameras.cameras.keys():
            # .cameras.keys() = ["camera_0", "camera_1", ...]
            self.detectors[source_id] = AccidentDetector(source_id)
            # Each camera gets its OWN detector
            # Why? → Each has own object tracking state
            # camera_0's car #5 ≠ camera_1's car #5

        # ── Alert Sender (async HTTP + WebSocket) ──────
        self.sender = AlertSender()
        # Sends accident data to Person 2's backend
        # Uses aiohttp (async) — non-blocking

        # ── Emergency Response (Mappls + Twilio) ───────
        self.emergency = EmergencyResponseSystem()
        # Orchestrates: find nearby places → call police →
        # call ambulance → SMS hospitals → WhatsApp stores

        # ── Control Flags ─────────────────────────────
        self._running = False
        # True = main loop runs, False = stop

        self._loop = None
        # asyncio event loop running in background thread
        # None until start() creates it

        # ── Statistics ────────────────────────────────
        self._start_time = 0.0
        # When system started (Unix timestamp)

        self._accident_count = 0
        # Total accidents detected this session

        self._frames_displayed = 0
        # Total frames shown (for FPS calculation)

        self._last_fps_time = time.time()
        self._current_fps = 0.0
        # For displaying real-time FPS in window title

        # ── Shutdown Handlers ─────────────────────────
        signal.signal(signal.SIGINT, self._on_shutdown)
        # SIGINT = Ctrl+C
        # When pressed: OS sends SIGINT to our process
        # signal.signal() says: "when SIGINT arrives, call _on_shutdown"

        signal.signal(signal.SIGTERM, self._on_shutdown)
        # SIGTERM = kill command (from Docker, systemd, task manager)
        # Same graceful shutdown

        logger.info("System initialized | cameras=%d | detectors=%d",
                    len(self.cameras.cameras),
                    len(self.detectors))
        # Loguru supports printf-style: %d = integer placeholder
        # Alternative: f"cameras={len(...)}" (f-string)
        # Both work, printf-style is slightly faster (lazy evaluation)

    # ════════════════════════════════════════════════════════
    # STARTUP
    # ════════════════════════════════════════════════════════

    def start(self) -> bool:
        """
        Starts all system components.
        Returns True if successful, False if nothing started.

        STARTUP ORDER MATTERS:
        1. Async loop thread (must be ready before we submit tasks)
        2. HTTP session initialization (needs async loop running)
        3. Camera threads (start producing frames)
        """

        print("[System] Starting all components...")

        # ── Start Async Event Loop in Background Thread ──
        loop_thread = threading.Thread(
            target=self._run_async_loop,
            # target = which function to run in the new thread
            name="AsyncEventLoop",
            # name = label shown in debugger (not functional)
            daemon=True,
            # daemon=True = THIS IS CRITICAL
            # Daemon threads die automatically when main program exits
            # Without daemon=True: program hangs on exit
            # Waiting forever for the asyncio loop to finish
        )
        loop_thread.start()
        # .start() = actually creates OS thread and runs target function
        # Returns immediately — loop runs in background

        time.sleep(0.2)
        # Wait 200ms for async loop to be ready
        # _run_async_loop() must call run_forever() before we submit tasks
        # 200ms is generous — usually takes <10ms
        # In production: use threading.Event for proper synchronization

        # ── Initialize Async HTTP Session ────────────────
        self._submit_async(self.sender.initialize())
        # self.sender.initialize() returns a coroutine (async function)
        # _submit_async() schedules it on the background async loop
        # The actual HTTP session creation happens asynchronously

        # ── Start Camera Capture Threads ─────────────────
        started_cameras = self.cameras.start()
        # .start() opens each camera and starts its background thread
        # Returns list of successfully started camera IDs
        # Example: ["camera_0", "camera_1"]

        if not started_cameras:
            print("[System] ERROR: No cameras could be opened")
            print("[System] Check VIDEO_SOURCES in .env file")
            return False
            # Nothing to process — exit early

        self._running = True
        self._start_time = time.time()

        # ── Print Startup Summary ─────────────────────────
        print(f"\n[System] ✅ Running successfully")
        print(f"[System] Cameras active : {len(started_cameras)}")
        print(f"[System] Detectors ready: {len(self.detectors)}")
        print(f"[System] Device         : {settings.computed_device}")
        print(f"[System] Frame skip     : every {settings.frame_skip} frame(s)")
        print(f"[System] Frame delay    : {getattr(settings, 'frame_delay_ms', 33)}ms")
        print(f"[System] Backend URL    : {settings.backend_url}")
        print(f"\n[System] Press Q in video window or Ctrl+C to stop\n")

        return True

    def _run_async_loop(self):
        """
        Creates and runs asyncio event loop.
        Runs FOREVER in its own background thread.

        WHY IN SEPARATE THREAD?
        asyncio.run_forever() BLOCKS the calling thread.
        Our main thread runs the OpenCV display loop.
        They can't both block the same thread.

        Solution: asyncio lives in Thread 4.
                  Main loop lives in Thread 1 (main).
                  They communicate via run_coroutine_threadsafe().
        """
        self._loop = asyncio.new_event_loop()
        # new_event_loop() = creates fresh event loop for THIS thread
        # Why not asyncio.get_event_loop()?
        # → In non-main threads, get_event_loop() may return None
        # → new_event_loop() is explicit and always works

        asyncio.set_event_loop(self._loop)
        # Register as "current loop" for this thread
        # Needed for some asyncio operations that look up current loop

        logger.debug("Async event loop started in background thread")

        self._loop.run_forever()
        # run_forever() = start loop, process tasks until .stop() called
        # This BLOCKS until stop() is called in shutdown
        # All async tasks (HTTP requests, WebSocket) run on this loop

        logger.debug("Async event loop stopped")

    def _submit_async(self, coro):
        """
        Submits a coroutine to the async loop from sync code.

        THE BRIDGE between sync world (main thread) and
        async world (event loop thread).

        Example:
            # From sync code in main thread:
            self._submit_async(self.sender.send_alert(event))
            # Returns IMMEDIATELY
            # send_alert runs later in async loop thread
            # Main thread continues without waiting

        Args:
            coro: a coroutine object (result of calling async function)
                  Example: self.sender.send_alert(event)
                  Note: this doesn't RUN the coroutine, just creates it
                  _submit_async actually schedules it to run
        """
        if self._loop is None or self._loop.is_closed():
            logger.warning("Async loop not available — skipping async task")
            return
            # Safety check: don't crash if loop isn't ready yet

        asyncio.run_coroutine_threadsafe(coro, self._loop)
        # run_coroutine_threadsafe(coroutine, loop):
        # → Thread-safe way to submit coroutine to another thread's loop
        # → The coroutine is scheduled on the given event loop
        # → Returns a Future object (we ignore it — fire and forget)
        # → Coroutine runs asynchronously in loop thread
        # → We never wait for it in main thread (non-blocking!)

    # ════════════════════════════════════════════════════════
    # FRAME PROCESSING
    # ════════════════════════════════════════════════════════

    def _process_frame(self, source_id: str, frame_data) -> None:
        """
        Processes one frame from one camera.

        Called for every frame from every camera in the main loop.
        Steps:
        1. Add frame to ring buffer (for pre-accident footage)
        2. Check if this frame should be analyzed (frame skip)
        3. Run YOLOv11 detection + object tracking
        4. Show annotated video in window
        5. If accident: trigger full emergency response

        Args:
            source_id: Which camera ("camera_0", "camera_1")
            frame_data: FrameData object with frame + metadata
        """

        # Get the detector for this specific camera
        detector = self.detectors.get(source_id)
        if detector is None:
            logger.warning(f"No detector found for {source_id}")
            return
            # Safety check — should never happen in normal operation
            # get() returns None if key missing (vs [] which raises KeyError)

        # ── Ring Buffer ────────────────────────────────────
        detector.frame_buffer.add_frame(frame_data.frame)
        # Saves frame to ring buffer (last N frames in memory)
        # Why? When accident detected at frame 150,
        # we have frames 120-180 (before + after) for better footage
        # Like a dashcam's continuous loop recording

        # ── Frame Skip ─────────────────────────────────────
        if not detector.should_process_frame():
            return
            # This frame is SKIPPED — not sent to YOLO
            # Frame still saved to buffer above (we save every frame)
            # But YOLO only runs every Nth frame (FRAME_SKIP in .env)
            # Why? YOLO is slow. We can't run it 30 times/second on CPU.

        # ── YOLOv11 Detection ──────────────────────────────
        is_accident, annotated_frame, event = detector.detect(frame_data.frame)
        # detector.detect() returns 3 values (tuple unpacking):
        # is_accident = bool: was accident detected?
        # annotated_frame = numpy array with boxes drawn
        # event = AccidentEvent object (or None if no accident)

        # ── Update FPS Counter ─────────────────────────────
        self._frames_displayed += 1
        now = time.time()
        fps_elapsed = now - self._last_fps_time

        if fps_elapsed >= 1.0:
            # Update FPS every 1 second
            self._current_fps = self._frames_displayed / fps_elapsed
            # FPS = frames processed / time elapsed
            self._frames_displayed = 0
            self._last_fps_time = now

        # ── Display Video Window ───────────────────────────
        if settings.is_development:
            # Only show video window in development mode
            # In production (on a server): no display available
            # environment=development in .env controls this

            window_title = (
                f"Accident Detection | {source_id} | "
                f"FPS: {self._current_fps:.1f} | "
                f"Accidents: {self._accident_count}"
            )
            # :.1f = format float to 1 decimal place: 29.97 → "30.0"

            cv2.imshow(window_title, annotated_frame)
            # cv2.imshow(window_name, image):
            # → Opens window if not already open
            # → Updates image if window already open
            # → annotated_frame has YOLO bounding boxes drawn

        # ── Handle Accident Detection ──────────────────────
        if not is_accident or event is None:
            return
            # No accident this frame — nothing more to do
            # Continue to next frame

        # ══════════════════════════════════════════════════
        # ACCIDENT DETECTED — FULL EMERGENCY RESPONSE
        # ══════════════════════════════════════════════════

        self._accident_count += 1

        print(f"\n{'='*55}")
        print(f"🚨 ACCIDENT #{self._accident_count} DETECTED")
        print(f"   Camera    : {source_id}")
        print(f"   Severity  : {event.severity.value}")
        print(f"   Details   : {event.description}")
        print(f"   Confidence: {event.confidence_avg:.2%}")
        # :.2% = format as percentage with 2 decimal places
        # 0.8723 → "87.23%"
        print(f"   Frame     : {event.frame_number}")
        print(f"   Time      : {time.strftime('%Y-%m-%d %H:%M:%S')}")
        # strftime = "string format time"
        # %Y = year, %m = month, %d = day
        # %H = hour (24h), %M = minute, %S = second
        print(f"{'='*55}")

        # ── Build Screenshot URL for WhatsApp ─────────────
        screenshot_url = self._build_screenshot_url(event)
        # If Person 2's server is running, screenshot is accessible here
        # Twilio will fetch this URL to attach image to WhatsApp message

        # ── Get Accident Location ──────────────────────────
        lat, lon, location_source = self._get_location()
        maps_link = f"https://maps.google.com/?q={lat},{lon}"

        print(f"[Location] {location_source} | {lat}, {lon}")
        print(f"[Maps] {maps_link}")

        # ── TRIGGER EMERGENCY RESPONSE ─────────────────────
        # This runs SYNCHRONOUSLY (blocks for ~4-5 seconds)
        # Why not async? Twilio calls are fast HTTP requests.
        # The slight delay is acceptable — accident already happened.
        # Alternative: run in separate thread if you need continuous detection
        # during the emergency response phase.

        emergency_result = self.emergency.handle_accident(
            event=event,
            latitude=lat,
            longitude=lon,
            location_source=location_source,
            screenshot_url=screenshot_url,
        )
        # handle_accident() does EVERYTHING:
        # 1. Finds nearby hospitals, police, stores via Mappls
        # 2. Calls police (100) + nearest station
        # 3. Calls ambulance (108) + nearest hospital
        # 4. SMS to hospital + police station
        # 5. WhatsApp to nearby pharmacies + fuel stations

        # ── Send Full Data to Person 2 Backend ────────────
        # Add emergency response data to the accident event
        event.description += f" | Emergency: {emergency_result.total_contacts_reached} contacted"
        # Append emergency info to description
        # Person 2 stores this in database
        # Person 4 (admin dashboard) can see response stats

        self._submit_async(self.sender.send_alert(event))
        # submit_async = non-blocking
        # HTTP request to Person 2 happens in background thread
        # Main loop continues immediately

        # Also submit emergency response data separately
        self._submit_async(
            self.sender.send_emergency_response(emergency_result)
        )
        # Person 2 can store this separately in MongoDB
        # Allows Person 4 to analyze emergency response times

        logger.warning(
            "Accident handled | id=%s | severity=%s | "
            "contacts_reached=%d | response_time=%.1fs",
            event.accident_id,
            event.severity.value,
            emergency_result.total_contacts_reached,
            emergency_result.response_time_seconds,
        )

    def _build_screenshot_url(self, event: AccidentEvent) -> str:
        """
        Builds public URL for the accident screenshot.

        This URL is sent in WhatsApp messages so people can see
        the actual accident photo.

        Requires Person 2's server to serve static files from
        the screenshots/ directory.

        Example URL: http://192.168.1.50:5000/screenshots/accident_123.jpg
        """
        server_base = getattr(settings, 'server_base_url', '')
        # getattr(obj, name, default) = safe attribute access
        # Returns '' if server_base_url not set in .env

        if not server_base or not event.screenshot_path:
            return ""
            # Can't build URL if server not configured
            # Or if screenshot wasn't saved

        filename = os.path.basename(event.screenshot_path)
        # os.path.basename() = get just the filename from full path
        # "screenshots/camera_0_1710000000_150.jpg"
        # → "camera_0_1710000000_150.jpg"

        return f"{server_base}/screenshots/{filename}"
        # Full URL: "http://192.168.1.50:5000/screenshots/camera_0_123_150.jpg"

    def _get_location(self):
        """
        Gets accident location.

        Returns (latitude, longitude, source_string).

        PRIORITY ORDER:
        1. Try LocationService (GPS → Cell Tower → Fixed)
           Only available if you have location.py from previous build
        2. Fall back to camera_latitude/longitude from .env
        """
        try:
            from location import LocationService
            # Try to import LocationService
            # ImportError if location.py not in project

            if not hasattr(self, '_location_service'):
                self._location_service = LocationService()
                # Create once and cache on self
                # hasattr() = check if attribute exists
                # Creating every accident would be wasteful

            location = self._location_service.get_location()
            return location.latitude, location.longitude, location.source

        except ImportError:
            # location.py not available — use fixed coordinates
            pass

        except Exception as e:
            logger.warning(f"Location service error: {e}")
            # Don't crash if location service has problems

        # ── Fallback: Fixed coordinates from .env ─────────
        lat = float(getattr(settings, 'camera_latitude', 19.0760))
        lon = float(getattr(settings, 'camera_longitude', 72.8777))
        # getattr with default: if not in settings, use Mumbai coordinates
        # Replace these defaults with your actual camera location!

        return lat, lon, "fixed"

    # ════════════════════════════════════════════════════════
    # MAIN LOOP
    # ════════════════════════════════════════════════════════

    def run(self) -> None:
        """
        Main processing loop. BLOCKS until stopped.

        LOOP LOGIC:
        1. Get frames from all cameras (generator)
        2. Process each frame (detect accidents)
        3. Check keyboard input (Q = quit)
        4. If no frames: small sleep (avoid 100% CPU)
        5. If all cameras stopped: exit loop

        The loop runs until:
        → Q key pressed in OpenCV window
        → Ctrl+C pressed (SIGINT handler calls stop())
        → All video sources reach end of file
        → self._running set to False by stop()
        """
        if not self._running:
            print("[System] ERROR: call start() before run()")
            return

        try:
            while self._running:
                # ── Process Frames ─────────────────────────
                frames_this_cycle = 0
                # Count how many frames we processed this iteration

                for source_id, frame_data in self.cameras.get_frames():
                    # get_frames() is a GENERATOR
                    # Each call to next() gets one frame from one camera
                    # Automatically rotates through all cameras
                    #
                    # Why generator instead of returning all frames?
                    # → Memory efficient (one frame at a time)
                    # → Starts processing immediately (no wait for all cameras)
                    # → If camera 0 has frames but camera 1 doesn't:
                    #   generator gives camera 0's frames right away

                    self._process_frame(source_id, frame_data)
                    frames_this_cycle += 1

                # ── OpenCV Window Update ────────────────────
                delay = max(1, getattr(settings, 'frame_delay_ms', 33))
                # max(1, ...) = waitKey needs minimum 1ms (0 = don't wait)
                # frame_delay_ms controls playback speed:
                # 33ms = 30fps natural speed
                # 0ms = maximum speed (races through video)

                key = cv2.waitKey(delay) & 0xFF
                # cv2.waitKey(ms):
                # → MUST be called for imshow windows to update
                # → Waits `ms` milliseconds for a keypress
                # → Returns key code or 255 (0xFF) if no key
                # → & 0xFF = bitmask: ensures 8-bit value (cross-platform fix)

                if key == ord('q') or key == ord('Q'):
                    # ord('q') = ASCII code of 'q' = 113
                    # ord('Q') = ASCII code of 'Q' = 81
                    # Accept both lowercase and uppercase Q
                    print("\n[System] Q key pressed — shutting down...")
                    break
                    # break = exit the while loop immediately

                elif key == ord('s') or key == ord('S'):
                    # Press S = print current statistics
                    self._print_stats()

                elif key == ord('p') or key == ord('P'):
                    # Press P = pause/resume
                    self._toggle_pause()

                # ── Idle Check ─────────────────────────────
                if frames_this_cycle == 0:
                    time.sleep(0.005)
                    # No frames available from any camera this cycle
                    # Sleep 5ms to avoid busy-waiting
                    #
                    # WITHOUT sleep: loop runs thousands of times/second
                    # doing nothing = wastes 100% CPU
                    # WITH sleep: 200 iterations/second = negligible CPU
                    # 5ms is small enough to not miss frames

                    # Check if all cameras have stopped
                    if not self.cameras.active_cameras:
                        print("\n[System] All video sources have ended")
                        break
                        # Video files finished — exit naturally

        except KeyboardInterrupt:
            # Ctrl+C pressed
            # This is a backup — SIGINT handler should catch it first
            # But in some environments signal handler doesn't fire
            print("\n[System] KeyboardInterrupt received")

        finally:
            # finally block ALWAYS runs, even if exception occurs
            # This guarantees cleanup no matter HOW the loop exits:
            # → Normal Q keypress
            # → Ctrl+C
            # → Exception
            # → All cameras stopped
            # Without finally: Ctrl+C could leave cameras open, threads running
            self.stop()

    # ════════════════════════════════════════════════════════
    # PAUSE FUNCTIONALITY
    # ════════════════════════════════════════════════════════

    def _toggle_pause(self):
        """
        Pause/resume processing when P is pressed.
        Useful for reviewing a detected accident.
        """
        if not hasattr(self, '_paused'):
            self._paused = False
            # Initialize on first call
            # hasattr() = check if attribute exists on object

        self._paused = not self._paused
        # not True = False, not False = True
        # Toggles between paused and running

        if self._paused:
            print("[System] ⏸️  PAUSED — Press P to resume")

            # While paused: keep updating window but don't process new frames
            while self._paused and self._running:
                key = cv2.waitKey(100) & 0xFF
                # waitKey(100) = check for keypress every 100ms
                if key == ord('p') or key == ord('P'):
                    self._paused = False
                elif key == ord('q') or key == ord('Q'):
                    self._running = False
                    self._paused = False

            print("[System] ▶️  RESUMED")
        # If unpausing, just fall through — loop continues naturally

    # ════════════════════════════════════════════════════════
    # SHUTDOWN
    # ════════════════════════════════════════════════════════

    def _on_shutdown(self, signum, frame):
        """
        Called when OS sends SIGINT (Ctrl+C) or SIGTERM (kill).

        Args:
            signum: signal number (2=SIGINT, 15=SIGTERM)
            frame: current stack frame (not used here)

        IMPORTANT: signal handlers run in the main thread.
        Don't do heavy work here — just set the flag and stop.
        """
        signal_names = {2: "SIGINT (Ctrl+C)", 15: "SIGTERM (kill)"}
        signal_name = signal_names.get(signum, f"Signal {signum}")

        print(f"\n[System] {signal_name} received — shutting down gracefully...")
        self.stop()

    def stop(self) -> None:
        """
        Graceful shutdown of all components.

        SHUTDOWN ORDER (matters for clean exit):
        1. Set _running = False (stops main loop)
        2. Stop camera threads (no more frames)
        3. Close OpenCV windows
        4. Give async tasks time to complete
        5. Close HTTP session (aiohttp)
        6. Stop async event loop
        7. Print final statistics
        """
        if not self._running:
            return
            # Prevent double-stop
            # Could happen if Q pressed AND Ctrl+C at same time

        self._running = False
        print("\n[System] Stopping...")

        # ── Step 2: Stop Camera Threads ────────────────────
        self.cameras.stop()
        # Signals all capture threads to stop
        # Waits for each thread to finish (join)
        print("[System] Cameras stopped")

        # ── Step 3: Close OpenCV Windows ───────────────────
        cv2.destroyAllWindows()
        # Closes all cv2.imshow() windows
        # Without this: windows stay open after program ends

        # ── Step 4: Give Async Tasks Time to Complete ──────
        print("[System] Waiting for pending alerts to send...")
        time.sleep(0.5)
        # 500ms = enough time for most HTTP requests to complete
        # Alerts in flight get a chance to finish
        # In production: use proper asyncio task tracking

        # ── Step 5: Close Async HTTP Session ───────────────
        self._submit_async(self.sender.close())
        # sender.close() = closes aiohttp.ClientSession
        # Must be done in async context (hence submit_async)
        # Releases network connections back to pool

        time.sleep(0.3)
        # Brief wait for close() coroutine to complete

        # ── Step 6: Stop Async Event Loop ──────────────────
        if self._loop and not self._loop.is_closed():
            self._loop.call_soon_threadsafe(self._loop.stop)
            # call_soon_threadsafe(): thread-safe way to call loop methods
            # Must use this when calling loop from DIFFERENT thread
            # (We're in main thread, loop runs in Thread 4)
            # .stop() = stop the run_forever() call in Thread 4
            # Thread 4 then exits naturally

        # ── Step 7: Print Final Statistics ─────────────────
        self._print_final_stats()

    # ════════════════════════════════════════════════════════
    # STATISTICS & DISPLAY
    # ════════════════════════════════════════════════════════

    def _print_stats(self) -> None:
        """
        Prints current runtime statistics.
        Triggered by pressing S key.
        """
        runtime = time.time() - self._start_time
        print(f"\n{'─'*45}")
        print(f"📊 RUNTIME STATISTICS")
        print(f"{'─'*45}")
        print(f"Runtime          : {runtime:.0f}s ({runtime/60:.1f} min)")
        # :.0f = no decimal places: 125.7 → "126"
        # :.1f = one decimal: 2.0833... → "2.1"

        print(f"Accidents found  : {self._accident_count}")
        print(f"Alerts sent      : {self.sender._sent}")
        print(f"Alerts failed    : {self.sender._failed}")
        print(f"Current FPS      : {self._current_fps:.1f}")
        print(f"Active cameras   : {self.cameras.active_cameras}")

        for source_id, detector in self.detectors.items():
            print(f"\nCamera: {source_id}")
            print(f"  Total frames    : {detector._frame_count:,}")
            # :, = thousands separator: 12345 → "12,345"
            print(f"  Analyzed frames : {detector._process_count:,}")
            print(f"  Buffer size     : {len(detector.frame_buffer)}/{detector.frame_buffer.maxsize}")
            print(f"  Tracked objects : {len(detector.track_history)}")

        print(f"\nEmergency System :")
        print(f"  Mappls ready    : {bool(getattr(settings, 'mappls_client_id', ''))}")
        print(f"  Twilio ready    : {self.emergency.twilio.is_configured}")
        print(f"{'─'*45}\n")

    def _print_final_stats(self) -> None:
        """
        Prints comprehensive session summary on exit.
        """
        runtime = time.time() - self._start_time

        # Convert seconds to HH:MM:SS
        hours = int(runtime // 3600)
        minutes = int((runtime % 3600) // 60)
        seconds = int(runtime % 60)
        # // = floor division (integer result)
        # % = modulo (remainder)
        # 3661 seconds:
        # hours = 3661 // 3600 = 1
        # minutes = (3661 % 3600) // 60 = 61 // 60 = 1
        # seconds = 3661 % 60 = 1
        # Result: 01:01:01

        total_alerts = self.sender._sent + self.sender._failed
        success_rate = (
            f"{self.sender._sent / total_alerts * 100:.1f}%"
            if total_alerts > 0 else "N/A"
        )
        # Ternary expression: value_if_true if condition else value_if_false
        # Avoid ZeroDivisionError when no alerts were sent

        print(f"\n{'═'*50}")
        print(f"  SESSION COMPLETE — FINAL STATISTICS")
        print(f"{'═'*50}")
        print(f"  Runtime          : {hours:02d}:{minutes:02d}:{seconds:02d}")
        # :02d = format integer with leading zero, minimum 2 digits
        # 9 → "09",  12 → "12"
        print(f"  Total Accidents  : {self._accident_count}")
        print(f"  Alerts Sent      : {self.sender._sent}")
        print(f"  Alerts Failed    : {self.sender._failed}")
        print(f"  Alert Success    : {success_rate}")

        for source_id, detector in self.detectors.items():
            skip = settings.frame_skip
            effective_fps = self._current_fps
            print(f"\n  [{source_id}]")
            print(f"  Frames seen     : {detector._frame_count:,}")
            print(f"  Frames analyzed : {detector._process_count:,}")
            print(f"  Skip ratio      : every {skip} frame(s)")

        print(f"{'═'*50}")
        print(f"  System stopped cleanly. Goodbye!")
        print(f"{'═'*50}\n")

    def _print_banner(self) -> None:
        """Prints startup banner."""
        print()
        print("╔══════════════════════════════════════════════════╗")
        print("║       ACCIDENT DETECTION SYSTEM v2.0            ║")
        print("║   YOLOv11 | Multi-Camera | Emergency Response   ║")
        print("║   Mappls API | Twilio Calls | SMS | WhatsApp    ║")
        print("╚══════════════════════════════════════════════════╝")
        print()
        print(f"  Python     : {sys.version.split()[0]}")
        # .split()[0] = first word of version string
        # "3.11.4 (main, ...)" → "3.11.4"
        print(f"  Environment: {settings.environment}")
        print(f"  Model      : {settings.model_path}")
        print(f"  Device     : {settings.computed_device}")
        print(f"  Confidence : {settings.confidence_threshold}")
        print(f"  Sources    : {settings.video_source_list}")
        print()


# ════════════════════════════════════════════════════════════
# ENTRY POINT
# ════════════════════════════════════════════════════════════

def validate_setup() -> bool:
    """
    Checks that everything is in place before starting.
    Returns True if ready, False if something is missing.

    Called at startup to give clear error messages
    rather than cryptic crashes later.
    """
    all_good = True

    # ── Check Model File ────────────────────────────────
    if not os.path.exists(settings.model_path):
        print(f"[Setup] Model not found: {settings.model_path}")
        print(f"[Setup] Auto-downloading on first run...")
        print(f"[Setup] OR manually run:")
        print(f"[Setup]   python -c \"from ultralytics import YOLO; YOLO('yolo11n.pt')\"")
        print(f"[Setup]   mv yolo11n.pt models/")
        # Don't fail — YOLO auto-downloads if not found
        # Just inform the user it will happen

    # ── Check Required Directories ─────────────────────
    for directory in ["models", "screenshots", "logs"]:
        if not os.path.exists(directory):
            os.makedirs(directory, exist_ok=True)
            print(f"[Setup] Created directory: {directory}/")
            # exist_ok=True = don't error if already exists

    # ── Check .env Configuration ───────────────────────
    if not os.path.exists(".env"):
        print("[Setup] WARNING: .env file not found")
        print("[Setup] Using default settings")
        print("[Setup] Create .env from the template above")
        # Don't fail — Pydantic uses defaults

    # ── Check Video Sources ─────────────────────────────
    sources = settings.video_source_list
    if not sources:
        print("[Setup] ERROR: No video sources configured")
        print("[Setup] Set VIDEO_SOURCES in .env")
        all_good = False

    # ── Warn about Missing API Keys ─────────────────────
    if not getattr(settings, 'mappls_client_id', ''):
        print("[Setup] WARNING: MAPPLS_CLIENT_ID not set")
        print("[Setup] Emergency location search disabled")
        print("[Setup] Get free key at: https://apis.mappls.com")

    if not getattr(settings, 'twilio_account_sid', ''):
        print("[Setup] WARNING: TWILIO_ACCOUNT_SID not set")
        print("[Setup] Emergency calls and SMS disabled")
        print("[Setup] Get free trial at: https://twilio.com")

    return all_good


def main():
    """
    Application entry point.
    Called when: python main.py
    """

    # Validate setup first
    if not validate_setup():
        print("\n[Main] Setup validation failed. Fix errors above and retry.")
        sys.exit(1)
        # sys.exit(1) = exit with error code 1
        # Exit code 0 = success, non-zero = failure
        # Docker/systemd use exit codes to know if process failed

    # Create and start system
    system = AccidentDetectionSystem()

    if not system.start():
        print("\n[Main] Failed to start. Check:")
        print("  1. Camera is connected")
        print("  2. VIDEO_SOURCES in .env is correct")
        print("  3. Video file exists (if using file)")
        sys.exit(1)

    # Run main loop (blocks until stopped)
    system.run()
    # Returns when: Q pressed, Ctrl+C, all cameras done

    # Clean exit
    sys.exit(0)
    # sys.exit(0) = success exit code


# ════════════════════════════════════════════════════════════
# SCRIPT GUARD
# ════════════════════════════════════════════════════════════

if __name__ == "__main__":
    # This block runs ONLY when file is directly executed:
    #   python main.py  ← __name__ == "__main__" → runs main()
    #
    # SKIPPED when imported by another file:
    #   from main import AccidentDetectionSystem  ← __name__ == "main"
    #   → main() is NOT called automatically
    #
    # WHY THIS MATTERS:
    # If you write tests that import AccidentDetectionSystem,
    # you don't want the entire system starting just from the import.
    # The if guard prevents that.
    main()
```

---

## Keyboard Shortcuts (While Running)
```
# Q  →  Quit (graceful shutdown)
# S  →  Show current statistics
# P  →  Pause / Resume processing
# ```

# ---

## Quick Recap of What This `main.py` Does
# ```
# START
#   ↓
# validate_setup()     ← checks model, folders, API keys
#   ↓
# AccidentDetectionSystem()
#   ├── MultiCameraProcessor   (cameras ready)
#   ├── AccidentDetector x N   (one per camera)
#   ├── AlertSender            (HTTP + WebSocket)
#   └── EmergencyResponseSystem (Mappls + Twilio)
#   ↓
# start()
#   ├── Thread 4: asyncio loop starts
#   ├── HTTP session initialized
#   └── Camera threads started
#   ↓
# run()  ← MAIN LOOP
#   ├── get_frames() generator → one frame per camera
#   ├── _process_frame()
#   │     ├── add to ring buffer
#   │     ├── frame skip check
#   │     ├── YOLOv11 detect()
#   │     ├── show in window
#   │     └── IF ACCIDENT:
#   │           ├── get location
#   │           ├── emergency.handle_accident()
#   │           │     ├── Mappls → find nearby places
#   │           │     ├── Twilio → call police (100)
#   │           │     ├── Twilio → call ambulance (108)
#   │           │     ├── Twilio → SMS hospitals
#   │           │     └── Twilio → WhatsApp stores
#   │           └── sender.send_alert() → Person 2
#   └── Q / Ctrl+C → stop()
#   ↓
# stop()
#   ├── cameras.stop()
#   ├── destroyAllWindows()
#   ├── sender.close()
#   ├── loop.stop()
#   └── print final stats