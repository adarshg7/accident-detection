# ============================================================
# main.py — System Orchestrator (RUN THIS FILE)
#
# This is the CONDUCTOR. It owns all components and coordinates them.
#
# KEY CHALLENGE: We have TWO types of code:
# 1. Synchronous (normal Python): OpenCV display loop, camera threads
# 2. Asynchronous (asyncio): HTTP sending, WebSocket
#
# They can't directly mix. Solution:
# → Run asyncio event loop in a dedicated background thread
# → Use asyncio.run_coroutine_threadsafe() to bridge them
#
# Thread layout:
# Thread 1 (main): OpenCV display + frame processing
# Thread 2: Camera 0 capture
# Thread 3: Camera 1 capture (if configured)
# Thread 4: Asyncio event loop (HTTP sending + WebSocket)
# ============================================================

import asyncio
import threading
import signal
# signal = catches OS signals (Ctrl+C = SIGINT, kill = SIGTERM)
# Lets us do cleanup before program exits
# Without signal handler: Ctrl+C = immediate crash, no cleanup

import sys
import time
import cv2
from typing import Dict, Optional

from config import settings
from logger import logger
from detector import AccidentDetector
from video_processor import MultiCameraProcessor
from sender import AlertSender


class AccidentDetectionSystem:
    """
    Main system class. Creates, owns, and coordinates all components.

    LIFECYCLE:
    __init__() → create everything
    start()    → start threads and async loop
    run()      → main processing loop (blocks until stopped)
    stop()     → graceful shutdown
    """

    def __init__(self):
        print("=" * 55)
        print("   ACCIDENT DETECTION SYSTEM v2.0")
        print("   YOLOv11 | Multi-Camera | Async Alerts")
        print("=" * 55)

        # Create multi-camera processor (one thread per camera)
        self.cameras = MultiCameraProcessor()

        # Create one detector per camera
        # Each detector has its own tracking state (separate cameras)
        self.detectors: Dict[str, AccidentDetector] = {}
        for source_id in self.cameras.cameras.keys():
            self.detectors[source_id] = AccidentDetector(source_id)

        # Async alert sender
        self.sender = AlertSender()

        # Control
        self._running = False
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        # The asyncio event loop that runs in background thread
        # None until start() creates it

        # Stats
        self._start_time = 0.0
        self._accident_count = 0

        # Register OS signal handlers
        signal.signal(signal.SIGINT, self._on_shutdown)
        # SIGINT = Ctrl+C. When pressed: call self._on_shutdown
        signal.signal(signal.SIGTERM, self._on_shutdown)
        # SIGTERM = kill command from OS/Docker/systemd
        # Both signals → same graceful shutdown

    def _on_shutdown(self, signum, frame):
        """Called by OS when Ctrl+C or kill signal received."""
        # signum: which signal (2=SIGINT, 15=SIGTERM)
        # frame: current stack frame (we don't use it)
        print("\n[System] Shutdown signal received...")
        self.stop()

    def _start_async_loop(self):
        """
        Creates and runs asyncio event loop in background thread.

        WHY IN SEPARATE THREAD?
        asyncio.run_forever() BLOCKS the calling thread.
        Our main thread needs to run OpenCV loop.
        Solution: asyncio runs in Thread B, OpenCV in Thread A.

        This is the standard pattern for mixing sync + async Python.
        """
        self._loop = asyncio.new_event_loop()
        # new_event_loop() = fresh loop for this thread
        # Why not asyncio.get_event_loop()?
        # → In non-main threads, get_event_loop() may return None
        # → new_event_loop() is explicit and safe

        asyncio.set_event_loop(self._loop)
        # Register as current loop for this thread

        self._loop.run_forever()
        # BLOCKS until self._loop.stop() is called
        # All async tasks submitted to this loop run here

    def _submit(self, coro):
        """
        Submit async coroutine from sync code.

        Bridge between sync main thread and async event loop thread.

        Usage:
            # From normal (sync) code:
            self._submit(self.sender.send_alert(event))
            # This schedules send_alert to run on the async loop
            # Returns immediately — doesn't wait for completion
        """
        if self._loop and not self._loop.is_closed():
            asyncio.run_coroutine_threadsafe(coro, self._loop)
            # run_coroutine_threadsafe(coroutine, loop):
            # → Thread-safe submission to another thread's event loop
            # → Returns Future (we ignore it — fire and forget)
            # → Coroutine runs asynchronously, we don't wait

    def start(self) -> bool:
        """Start all system components. Returns True on success."""
        print("[System] Starting...")

        # Start async event loop in background thread
        loop_thread = threading.Thread(
            target=self._start_async_loop,
            name="AsyncLoop",
            daemon=True,
            # daemon=True = dies automatically when main program exits
        )
        loop_thread.start()
        time.sleep(0.2)
        # Wait 200ms for loop to be ready
        # (loop.run_forever() must execute before we submit tasks)

        # Initialize HTTP session (must run in async context)
        self._submit(self.sender.initialize())

        # Start camera threads
        started = self.cameras.start()
        if not started:
            print("[System] ERROR: No cameras could be opened")
            return False

        self._running = True
        self._start_time = time.time()
        print(f"[System] Running | {len(started)} camera(s) active")
        print("[System] Press Q in video window or Ctrl+C to stop")
        return True

    def _process_frame(self, source_id: str, frame_data):
        """Process one frame from one camera."""

        detector = self.detectors.get(source_id)
        if not detector:
            return

        # Add to ring buffer (for pre-accident footage)
        detector.frame_buffer.add_frame(frame_data.frame)

        # Frame skip: skip if not this frame's turn
        if not detector.should_process_frame():
            return

        # Run YOLOv11 detection + tracking
        is_accident, annotated_frame, event = detector.detect(frame_data.frame)

        # Show video window (development mode only)
        if settings.is_development:
            cv2.imshow(f"Camera: {source_id}", annotated_frame)
            # cv2.imshow() opens/updates a display window
            # Window title = source_id (different window per camera)

        if is_accident and event:
            self._accident_count += 1
            print(
                f"[ACCIDENT #{self._accident_count}] "
                f"Source: {source_id} | "
                f"Severity: {event.severity.value} | "
                f"{event.description}"
            )

            # Send alert ASYNCHRONOUSLY (non-blocking)
            self._submit(self.sender.send_alert(event))
            # Returns immediately
            # Actual HTTP request runs in async loop thread
            # Detection continues without waiting

    def run(self):
        """
        Main processing loop. Blocks until stopped.
        Reads frames from all cameras, runs detection.
        """
        if not self._running:
            print("[System] ERROR: call start() first")
            return

        try:
            while self._running:
                frames_this_cycle = 0

                # Get frame from each camera
                for source_id, frame_data in self.cameras.get_frames():
                    # get_frames() is a GENERATOR
                    # Each iteration: one frame from one camera
                    self._process_frame(source_id, frame_data)
                    frames_this_cycle += 1

                # OpenCV keyboard check
                key = cv2.waitKey(max(1, settings.frame_delay_ms)) & 0xFF
                # waitKey(1) = wait 1ms for key press
                # MUST be called for cv2.imshow windows to update
                # & 0xFF = bitmask for cross-platform key codes
                # Returns -1 if no key pressed

                if key in (ord('q'), ord('Q')):
                    # ord('q') = ASCII code of 'q' = 113
                    print("[System] Q pressed, stopping...")
                    break

                if frames_this_cycle == 0:
                    time.sleep(0.005)
                    # No frames available: sleep 5ms to avoid busy loop
                    # Busy loop = 100% CPU doing nothing useful
                    # 5ms sleep = 99% CPU reduction while idle

                    if not self.cameras.active_cameras:
                        print("[System] All video sources finished")
                        break

        except KeyboardInterrupt:
            pass
            # Ctrl+C backup (in case signal handler doesn't fire)

        finally:
            # finally = ALWAYS executes, even after exceptions
            # Critical: ensures cleanup happens no matter what
            self.stop()

    def stop(self):
        """Graceful shutdown."""
        if not self._running:
            return

        self._running = False
        print("[System] Stopping...")

        self.cameras.stop()
        cv2.destroyAllWindows()
        # Close all OpenCV windows

        # Close async HTTP session
        self._submit(self.sender.close())
        time.sleep(0.3)
        # Give async tasks time to finish

        # Stop event loop
        if self._loop and not self._loop.is_closed():
            self._loop.call_soon_threadsafe(self._loop.stop)
            # call_soon_threadsafe() = thread-safe way to schedule on loop
            # .stop() = stop the run_forever() blocking call

        # Print stats
        runtime = time.time() - self._start_time
        print("\n" + "=" * 40)
        print("SESSION SUMMARY")
        print("=" * 40)
        print(f"Runtime      : {runtime:.0f} seconds")
        print(f"Accidents    : {self._accident_count}")
        print(f"Alerts sent  : {self.sender._sent}")
        print(f"Alerts failed: {self.sender._failed}")
        for sid, det in self.detectors.items():
            print(f"{sid} analyzed : {det._process_count} frames")
        print("=" * 40)
        print("[System] Stopped cleanly")


# ============================================================
# ENTRY POINT
# ============================================================

def main():
    # Validate model file exists
    import os
    if not os.path.exists(settings.model_path):
        print(f"[Setup] Model not found at: {settings.model_path}")
        print("[Setup] Auto-downloading yolo11n.pt on first run...")
        # YOLO will auto-download when model is loaded in AccidentDetector

    system = AccidentDetectionSystem()

    if not system.start():
        print("[Main] Failed to start. Check camera/video sources in .env")
        sys.exit(1)
        # sys.exit(1) = exit with error code 1
        # Exit code 0 = success, non-zero = failure
        # Docker/systemd checks exit code to know if process crashed

    system.run()
    # Blocks until stopped (Q key, Ctrl+C, or video ends)


if __name__ == "__main__":
    # __name__ == "__main__" ONLY when this file is run directly:
    #   python main.py  → True, main() runs
    #
    # When imported by another file:
    #   from main import AccidentDetectionSystem  → False, main() skipped
    #
    # Why does this matter?
    # If another file imports main.py for testing,
    # we don't want the entire system to start automatically
    main()