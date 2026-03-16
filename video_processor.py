# ============================================================
# video_processor.py — Multi-Camera Threaded Capture
#
# PROBLEM WITHOUT THREADING:
# Camera 0: read frame... wait 33ms... read frame... wait 33ms...
# Camera 1: can't do anything while Camera 0 is waiting
#
# SOLUTION WITH THREADING:
# Thread 1: Camera 0 reads continuously (blocking is fine in its own thread)
# Thread 2: Camera 1 reads continuously
# Main thread: takes frames from both and runs detection
# ALL HAPPENING SIMULTANEOUSLY
#
# PRODUCER-CONSUMER PATTERN:
# Camera thread = PRODUCER (puts frames into queue)
# Detector = CONSUMER (takes frames from queue)
# Queue = the bridge between them
# ============================================================

import cv2
import threading
import queue
# queue.Queue = thread-safe FIFO queue (First In First Out)
# Thread-safe means: multiple threads can put/get simultaneously
# without corrupting each other
# queue.Queue handles all the locking internally — we don't need to

import time
from typing import Optional, List, Union, Dict
from dataclasses import dataclass

from config import settings
from logger import logger
from frame_buffer import FrameData


@dataclass
class CameraInfo:
    """Metadata about a connected camera."""
    source_id: str
    source: Union[int, str]
    fps: float
    width: int
    height: int
    is_running: bool = False

    def __str__(self):
        return f"{self.source_id} | {self.width}x{self.height} @ {self.fps:.1f}fps"
        # :.1f = format float to 1 decimal place: 29.97 → "30.0"


class SingleCameraCapture:
    """
    One camera, one background thread.
    Reads frames continuously, puts them in a queue.
    Detector consumes from the queue.
    """

    def __init__(self, source: Union[int, str], source_id: str):
        self.source = source
        self.source_id = source_id

        self.frame_queue: queue.Queue = queue.Queue(maxsize=10)
        # maxsize=10 = hold up to 10 frames
        # If detector is slow and queue fills up:
        #   put() would BLOCK (wait for space)
        #   We use put_nowait() instead and DROP the frame
        # Why drop rather than accumulate?
        # → Dropping occasional frames = small accuracy loss
        # → Accumulating = memory grows until crash

        self._cap: Optional[cv2.VideoCapture] = None
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        # threading.Event = a thread signal flag
        # .set() → "signal is on" (stop requested)
        # .is_set() → True if set
        # .clear() → reset to off
        # .wait() → block until set
        # Better than a boolean flag (atomic operations)

        self._dropped = 0
        self.info: Optional[CameraInfo] = None

    def _open(self) -> bool:
        """Open the video source. Returns True on success."""
        self._cap = cv2.VideoCapture(self.source)
        # VideoCapture(0) = webcam at index 0
        # VideoCapture("video.mp4") = video file
        # VideoCapture("rtsp://ip/stream") = network camera

        if not self._cap.isOpened():
            logger.error(f"Cannot open: {self.source}")
            return False

        fps = self._cap.get(cv2.CAP_PROP_FPS)
        # cv2.CAP_PROP_FPS = OpenCV constant for "get FPS property"
        # CAP_PROP_* = "capture property" constants

        w = int(self._cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        h = int(self._cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        # int() needed: .get() returns float, dimensions must be int

        fps = fps if 0 < fps < 200 else 30.0
        # Some cameras report invalid FPS (0 or 1000)
        # Inline conditional: value_if_true if condition else value_if_false
        # Same as:
        # if 0 < fps < 200:
        #     fps = fps
        # else:
        #     fps = 30.0

        self.info = CameraInfo(
            source_id=self.source_id, source=self.source,
            fps=fps, width=w, height=h
        )
        logger.info(f"Camera opened: {self.info}")
        return True

    def _capture_loop(self):
        """
        Runs on background thread.
        Reads frames in an infinite loop until stopped.

        This function BLOCKS on self._cap.read()
        That's fine — it's in its own thread.
        The main thread is not affected.
        """
        while not self._stop_event.is_set():
            # .is_set() → True if stop was requested
            # Loop continues as long as NOT stopped

            ret, frame = self._cap.read()
            # .read() → BLOCKS until next frame from camera
            # ret = True if frame read OK
            # frame = numpy array (H, W, 3)
            # For video file: ret=False when file ends

            if not ret:
                if isinstance(self.source, str) and not str(self.source).isdigit():
                    # Video file ended
                    logger.info(f"Video ended: {self.source_id}")
                    self._stop_event.set()
                    break
                else:
                    # Camera glitch — try again after short wait
                    time.sleep(0.05)
                    continue
                    # continue = skip rest of loop body, go back to while

            if settings.frame_delay_ms > 0:
                time.sleep(settings.frame_delay_ms / 1000.0)

            try:
                self.frame_queue.put_nowait(frame)
                # put_nowait() = put WITHOUT blocking
                # If queue full → raises queue.Full exception (caught below)
                # Alternative: put(frame) = BLOCK until space available
                # We choose to DROP frames rather than block

            except queue.Full:
                self._dropped += 1
                # Frame dropped because detector is too slow
                # This is acceptable — better than blocking or running out of memory

        if self._cap:
            self._cap.release()
            # Always release camera when done
            # Without this: camera stays "in use", other apps can't use it

    def start(self) -> bool:
        """Start capture thread. Returns True on success."""
        if not self._open():
            return False

        self._stop_event.clear()
        # Clear stop signal (in case this was stopped and restarted)

        self._thread = threading.Thread(
            target=self._capture_loop,
            # target = function to run in the new thread
            name=f"capture_{self.source_id}",
            # name = helps identify thread in debugger
            daemon=True,
            # CRITICAL: daemon=True
            # Daemon threads die when main program exits
            # Without daemon=True: Python waits for thread to finish
            # If camera is stuck reading: program HANGS on exit forever
        )
        self._thread.start()
        # .start() creates OS thread and begins running _capture_loop
        # Returns IMMEDIATELY — capture runs in background

        if self.info:
            self.info.is_running = True
        logger.info(f"Capture started: {self.source_id}")
        return True

    def get_frame(self, timeout: float = 0.05) -> Optional[FrameData]:
        """
        Get next frame from queue.
        Waits up to `timeout` seconds if queue is empty.
        Returns None if no frame available.
        """
        try:
            frame = self.frame_queue.get(timeout=timeout)
            # .get(timeout=0.05) = wait up to 50ms for a frame
            # If no frame in 50ms → raises queue.Empty

            return FrameData(
                frame=frame,
                timestamp=time.time(),
                frame_number=self.frame_queue.qsize(),
                source_id=self.source_id,
            )
        except queue.Empty:
            return None
            # No frame available — caller can try again next iteration

    def stop(self):
        """Stop capture gracefully."""
        self._stop_event.set()
        # Signal thread to stop

        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=3.0)
            # .join(timeout=3) = wait up to 3 seconds for thread to finish
            # Without join: function returns while thread still running
            # join() ensures thread is actually done before we continue

        if self.info:
            self.info.is_running = False
        logger.info(f"Capture stopped: {self.source_id}")

    @property
    def is_running(self) -> bool:
        return not self._stop_event.is_set()


class MultiCameraProcessor:
    """
    Manages multiple cameras simultaneously.
    One SingleCameraCapture per camera source.
    Each capture runs on its own thread.
    """

    def __init__(self):
        self.cameras: Dict[str, SingleCameraCapture] = {}

        for i, source in enumerate(settings.video_source_list):
            source_id = f"camera_{i}"
            self.cameras[source_id] = SingleCameraCapture(source, source_id)
            # One camera object per source: camera_0, camera_1, ...

        print(f"[VideoProcessor] {len(self.cameras)} camera(s) configured")

    def start(self) -> List[str]:
        """Start all cameras. Returns list of started camera IDs."""
        started = []
        for source_id, cap in self.cameras.items():
            if cap.start():
                started.append(source_id)
        print(f"[VideoProcessor] {len(started)}/{len(self.cameras)} started")
        return started

    def get_frames(self):
        """
        Generator yielding (source_id, FrameData) from all cameras.

        WHAT IS A GENERATOR?
        A function with `yield` instead of `return`.
        It produces values ONE AT A TIME.
        Caller uses: for source_id, frame in processor.get_frames()

        Why generator here?
        → We don't know how many cameras there are
        → We don't want to collect ALL frames into a list first
        → yield gives each frame IMMEDIATELY as it's available
        → Memory efficient (one frame at a time)

        Each call to get_frames() loops through all cameras
        and yields any available frame from each.
        """
        for source_id, cap in self.cameras.items():
            if not cap.is_running:
                continue
                # Skip stopped cameras

            frame_data = cap.get_frame(timeout=0.033)
            # 0.033s = ~30fps interval per camera
            # Don't wait too long per camera — others would starve

            if frame_data is not None:
                yield source_id, frame_data
                # yield = "return this value, then pause"
                # Next iteration: resume from here

    def stop(self):
        for cap in self.cameras.values():
            cap.stop()
        print("[VideoProcessor] All cameras stopped")

    @property
    def active_cameras(self) -> List[str]:
        return [sid for sid, cap in self.cameras.items() if cap.is_running]
        # List comprehension: [item for item in iterable if condition]