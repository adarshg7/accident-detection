# ============================================================
# frame_buffer.py — Ring Buffer for Pre-Accident Footage
#
# CONCEPT: Ring Buffer (Circular Buffer)
# 
# Imagine a tape that holds exactly 150 frames.
# When frame 151 comes in, frame 1 gets overwritten.
# The tape always holds the LAST 150 frames.
#
# WHY DO WE NEED THIS?
# Accident detected at frame 150.
# The visible damage started at frame 120.
# Without buffer: you only capture frame 150.
# WITH buffer: you capture frames 120-180 (before + after).
# → This is how dashcams work!
#
# Python tool: collections.deque with maxlen
# deque = double-ended queue
# maxlen → auto-removes oldest item when full
# ============================================================

from collections import deque
# deque = "deck" (double-ended queue)
# Like a list but MUCH faster for:
# - Add to right: deque.append() = O(1) always
# - Remove from left: deque.popleft() = O(1) always
# List equivalent: list.pop(0) = O(n) = slows down with more items
# With maxlen=150: when you append 151st item → 1st auto-removed

import numpy as np
import threading
import time
from dataclasses import dataclass
from typing import Optional, List

from logger import logger


@dataclass
class FrameData:
    """
    One video frame with its metadata.
    
    @dataclass automatically generates:
    → __init__(self, frame, timestamp, frame_number, source_id)
    → __repr__ for nice printing
    Without @dataclass: 15 lines of boilerplate for the same thing
    """
    frame: np.ndarray     # Pixel data: shape (height, width, 3) for color
    timestamp: float      # When this frame was captured
    frame_number: int     # Sequential counter: 0, 1, 2, 3...
    source_id: str        # Which camera: "camera_0", "camera_1"


class FrameBuffer:
    """
    Thread-safe ring buffer for video frames.
    
    Thread-safe = multiple threads can read/write simultaneously
    without corrupting each other's data.
    
    Our system:
    Thread 1 (camera): writes new frames via add_frame()
    Thread 2 (detector): reads frames via get_recent_frames()
    
    Without locking: Thread 1 writes while Thread 2 reads
    → Partial write = corrupted frame = crash or wrong detection
    
    With RLock: Only ONE thread accesses buffer at a time
    """

    def __init__(self, maxsize: int = 150, source_id: str = "camera_0"):
        self.buffer: deque = deque(maxlen=maxsize)
        # deque(maxlen=150):
        # - Holds up to 150 FrameData objects
        # - When you append 151st → 1st automatically removed
        # THIS is the ring buffer behavior

        self.maxsize = maxsize
        self.source_id = source_id
        self._frame_count = 0   # Total frames ever added

        self._lock = threading.RLock()
        # RLock = Reentrant Lock
        #
        # WHAT IS A LOCK?
        # Imagine a bathroom: only one person inside at a time
        # Thread 1 enters (acquires lock)
        # Thread 2 tries to enter → WAITS
        # Thread 1 exits (releases lock)
        # Thread 2 enters → proceeds
        #
        # WHY RLOCK NOT LOCK?
        # RLock = the same thread CAN acquire it multiple times
        # If our method calls another method that also locks → RLock handles it
        # Regular Lock → same thread tries to lock again → DEADLOCK (frozen forever)

        logger.debug(f"FrameBuffer created | source={source_id} | maxsize={maxsize}")

    def add_frame(self, frame: np.ndarray) -> FrameData:
        """
        Adds new frame to the buffer.
        Thread-safe.
        Returns the FrameData object created.
        """
        with self._lock:
            # "with self._lock:" = context manager
            # Equivalent to (but safer than):
            #   self._lock.acquire()
            #   try:
            #       ... code ...
            #   finally:
            #       self._lock.release()
            #
            # "with" GUARANTEES release even if exception occurs
            # Manual acquire/release: exception = lock never released = deadlock!

            self._frame_count += 1

            frame_data = FrameData(
                frame=frame.copy(),
                # .copy() IS CRITICAL!
                # NumPy arrays are REFERENCES, not values.
                # OpenCV reuses the same memory buffer for each frame.
                # Without .copy(): all 150 entries point to SAME memory!
                # → All frames show the CURRENT frame (overwritten)
                # .copy() creates independent memory for each frame

                timestamp=time.time(),
                frame_number=self._frame_count,
                source_id=self.source_id,
            )

            self.buffer.append(frame_data)
            # deque.append() = O(1) = instant
            # If buffer full (150 items), oldest auto-removed

            return frame_data

    def get_recent_frames(self, count: int = 30) -> List[FrameData]:
        """
        Get last N frames.
        count=30 at 30fps = last 1 second of video.
        Used to grab footage BEFORE the detected accident.
        """
        with self._lock:
            all_frames = list(self.buffer)
            # Convert deque to list
            # deque doesn't support slicing directly (no [start:end])
            # list does

            return all_frames[-count:]
            # Negative slicing:
            # [-30:] = last 30 items
            # [-1] = last item
            # [-3:] = last 3 items
            # [:-3] = everything EXCEPT last 3

    @property
    def size(self) -> int:
        return len(self.buffer)
        # len() on deque = O(1) (instant)

    def __len__(self) -> int:
        """Allows: len(buffer) to work"""
        return self.size