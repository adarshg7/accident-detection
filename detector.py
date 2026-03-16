# ============================================================
# detector.py — YOLOv11 Detection Engine
#
# This is the BRAIN of the system.
#
# What happens here, in order:
# 1. YOLOv11 analyzes a frame → detects objects
# 2. ByteTrack assigns IDs to objects across frames
# 3. We track velocity of each object
# 4. We check bounding box overlaps (collision detection)
# 5. We score the scene: is this an accident?
# 6. If yes: create AccidentEvent with full details
# ============================================================

from ultralytics import YOLO
# YOLO class handles: model loading, inference, tracking all in one
# ultralytics supports YOLOv8, v9, v10, v11, RT-DETR — same API

import cv2
import numpy as np
import time
import base64
# base64 = converts binary image → ASCII text string
# Why? JSON is text only. Images are binary.
# base64 bridges them: binary → text (for JSON), text → binary (decode back)

from pathlib import Path
from typing import Optional, Tuple, List, Dict
from collections import defaultdict, deque
# defaultdict = dict that auto-creates missing keys
# defaultdict(list): missing_key → [] instead of KeyError
# defaultdict(float): missing_key → 0.0

from config import settings
from logger import logger
from models import (
    AccidentEvent, Detection, BoundingBox,
    VehicleType, AccidentSeverity
)
from frame_buffer import FrameBuffer


class AccidentDetector:
    """
    YOLOv11-powered accident detector.
    One instance per camera.

    Why one per camera?
    → Each camera has its own tracked objects
    → Camera 0's car #5 is different from Camera 1's car #5
    → Separate instances = separate tracking state
    """

    # Class-level constant (shared by ALL instances)
    # Set {} not list [] → membership check is O(1) instead of O(n)
    # "car" in {"car","truck"} → instant hash lookup
    # "car" in ["car","truck"] → checks each item sequentially
    VEHICLE_CLASSES = {
        "car", "truck", "motorcycle",
        "bus", "bicycle", "person"
    }

    def __init__(self, source_id: str = "camera_0"):
        self.source_id = source_id
        self._frame_count = 0    # Total frames seen by should_process_frame()
        self._process_count = 0  # Frames actually run through YOLO

        # ── Load YOLOv11 ──────────────────────────────────
        print(f"[Detector] Loading YOLOv11 from {settings.model_path}...")
        self.model = YOLO(settings.model_path)
        # First run: auto-downloads model if not found locally
        # yolo11n.pt (~6MB), yolo11s (~22MB), yolo11m (~52MB)

        self.model.to(settings.computed_device)
        # Move model weights to GPU or CPU
        # GPU: processes frame in ~5ms
        # CPU: processes frame in ~80-200ms
        print(f"[Detector] Model on {settings.computed_device}")

        # ── Object Tracking State ─────────────────────────
        self.track_history: Dict[int, deque] = defaultdict(
            lambda: deque(maxlen=30)
        )
        # Stores last 30 (x,y) positions for each tracked object
        # track_history[5] = positions of object with track_id=5
        # defaultdict with lambda:
        # → When new track_id seen: automatically creates deque(maxlen=30)
        # → No KeyError, no manual initialization needed
        # → lambda: deque(maxlen=30) creates a NEW deque each time
        #   (not the same deque shared across keys)

        self.track_velocities: Dict[int, float] = defaultdict(float)
        # Last known velocity for each tracked object
        # defaultdict(float) → new key returns 0.0

        # ── Alert Cooldown ────────────────────────────────
        self._last_alert_time: float = 0.0
        # Unix timestamp of last alert sent
        # 0.0 = never sent alert yet

        # ── Frame Buffer ──────────────────────────────────
        self.frame_buffer = FrameBuffer(
            maxsize=settings.frame_buffer_size,
            source_id=source_id
        )

        print(f"[Detector] Ready | source={source_id} | conf={settings.confidence_threshold}")

    def should_process_frame(self) -> bool:
        """
        Frame skip: only process every Nth frame.

        Why skip frames?
        30fps video = 30 frames/second
        YOLO on CPU = ~150ms per frame
        150ms × 30 = 4500ms to process 1 second of video
        = system falls 4.5 seconds behind real-time!

        With frame_skip=2: process 15 frames/second
        150ms × 15 = 2250ms → still behind...
        On GPU: ~10ms per frame → 300ms for 30fps = fine

        Bottom line: Use GPU when possible.
        Frame skip helps on CPU.

        Returns True when this frame SHOULD be analyzed.
        """
        self._frame_count += 1
        # Increment counter every time ANY frame comes in

        return self._frame_count % settings.frame_skip == 0
        # % = modulo = remainder after division
        # frame_skip=2: 1%2=1, 2%2=0✓, 3%2=1, 4%2=0✓, 5%2=1, 6%2=0✓
        # Returns True for every 2nd frame
        # ==0 returns a boolean (True or False)

    def _calculate_velocity(self, track_id: int, current_center: Tuple[float, float]) -> float:
        """
        How fast is this object moving (pixels per frame)?

        Why track velocity?
        Sudden velocity change = possible accident:
        Car at 50 px/frame → suddenly 0 px/frame = CRASH
        """
        history = self.track_history[track_id]
        # defaultdict: if track_id new → returns empty deque
        # No KeyError needed

        if len(history) < 2:
            return 0.0
            # Need at least 2 positions to measure movement

        prev_center = history[-1]
        # [-1] = last item (most recent previous position)

        dx = current_center[0] - prev_center[0]  # horizontal change
        dy = current_center[1] - prev_center[1]  # vertical change

        # Euclidean distance = straight-line distance between two points
        # Pythagorean theorem: dist = sqrt(dx² + dy²)
        velocity = (dx**2 + dy**2) ** 0.5
        # **2 = squared, **0.5 = square root
        # Cleaner alternative: import math; math.sqrt(dx**2 + dy**2)

        return velocity

    def _detect_sudden_stop(self, track_id: int, current_velocity: float) -> bool:
        """
        Did this object suddenly stop?
        Velocity drop > 70% in one frame = sudden stop = crash indicator
        """
        prev_velocity = self.track_velocities.get(track_id, 0.0)

        if prev_velocity < 2.0:
            return False
            # Object was barely moving anyway — not a sudden stop

        velocity_drop = (prev_velocity - current_velocity) / (prev_velocity + 1e-6)
        # 1e-6 = 0.000001 = tiny number added to prevent division by zero
        # (Python would raise ZeroDivisionError without this)
        # If prev=20, current=2:
        # drop = (20-2) / (20+0.000001) = 18/20 = 0.9 = 90% drop

        return velocity_drop > 0.7
        # More than 70% velocity drop = sudden stop detected

    def _count_collisions(self, detections: List[Detection]) -> int:
        """
        Count vehicle pairs with significant bounding box overlap.
        Overlap > 15% between two vehicles = possible collision.

        Returns: number of overlapping pairs
        """
        vehicles = [
            d for d in detections
            if d.vehicle_type not in [VehicleType.PERSON, VehicleType.UNKNOWN]
        ]
        # Filter: keep only vehicles, exclude people and unknowns

        overlaps = 0
        for i in range(len(vehicles)):
            for j in range(i + 1, len(vehicles)):
                # Compare each UNIQUE pair once
                # i=0,j=1 | i=0,j=2 | i=1,j=2
                # NOT: i=1,j=0 (already compared as i=0,j=1)
                # range(i+1, len) ensures j is always > i

                iou = vehicles[i].bbox.iou(vehicles[j].bbox)
                if iou > 0.15:
                    overlaps += 1
                    logger.debug(
                        f"Collision overlap: {vehicles[i].class_name} ↔ "
                        f"{vehicles[j].class_name} IOU={iou:.3f}"
                    )
                    # :.3f = format float to 3 decimal places

        return overlaps

    def detect(self, frame: np.ndarray) -> Tuple[bool, np.ndarray, Optional[AccidentEvent]]:
        """
        Run YOLOv11 on one frame.

        Args:
            frame: numpy array (height, width, 3) BGR format
                   OpenCV uses BGR (Blue, Green, Red) NOT RGB!

        Returns tuple of 3 values:
            is_accident (bool): Was accident detected?
            annotated_frame (numpy array): Frame with boxes drawn
            accident_event (AccidentEvent or None): Full event data
        """

        # Run YOLOv11 with ByteTrack object tracking
        results = self.model.track(
            frame,
            # model.track() = detection + tracking in one call
            # vs model.predict() = detection only (no tracking IDs)
            # ByteTrack: assigns consistent IDs to same object across frames

            persist=True,
            # persist=True = REMEMBER track IDs between calls
            # Without this: IDs reset every frame (tracking is useless)
            # With this: car #5 stays car #5 across all frames

            conf=settings.confidence_threshold,
            # Only return detections above this confidence
            # Lower-confidence detections are silently dropped

            iou=settings.iou_threshold,
            # For Non-Maximum Suppression (NMS)
            # If YOLO draws 3 boxes for the same car,
            # NMS removes the 2 worse ones based on IOU overlap

            verbose=False,
            # Suppress per-frame console spam
            # Without this: terminal floods with YOLO output

            device=settings.computed_device,
        )

        result = results[0]
        # results = list of results (one per input image)
        # We sent one frame → results[0] is our result

        annotated_frame = result.plot()
        # .plot() draws bounding boxes + labels + confidence scores ON frame
        # Returns NEW numpy array (original frame is NOT modified)
        # This is what shows on screen and gets saved as screenshot

        self._process_count += 1

        # ── Parse Detections ──────────────────────────────
        detections: List[Detection] = []
        sudden_stops = 0

        if result.boxes is not None and len(result.boxes) > 0:
            # result.boxes = None if NOTHING detected in frame
            # Check both None and empty length

            for box in result.boxes:
                # Each `box` = one detected object

                class_id = int(box.cls[0])
                # box.cls = class index as PyTorch tensor: tensor([2])
                # [0] = first (only) element
                # int() = converts tensor → Python integer

                class_name = self.model.names[class_id]
                # model.names = {0:"person", 1:"bicycle", 2:"car", 5:"bus", ...}
                # COCO dataset: 80 classes total

                if class_name not in self.VEHICLE_CLASSES:
                    continue
                    # Skip non-traffic objects: cats, chairs, books, etc.
                    # continue = skip rest of this loop iteration, go to next box

                confidence = float(box.conf[0])
                # float() converts PyTorch tensor → Python float

                xyxy = box.xyxy[0].tolist()
                # box.xyxy = tensor([x1, y1, x2, y2])
                # .tolist() = tensor → Python list [x1, y1, x2, y2]

                bbox = BoundingBox(
                    x1=xyxy[0], y1=xyxy[1],
                    x2=xyxy[2], y2=xyxy[3]
                )

                track_id = None
                if box.id is not None:
                    track_id = int(box.id[0])
                    # box.id = tracking ID assigned by ByteTrack
                    # None for first few frames of a new object
                    # Once assigned, stays same as long as object visible

                detection = Detection(
                    class_name=class_name,
                    vehicle_type=VehicleType.from_yolo_class(class_name),
                    confidence=confidence,
                    bbox=bbox,
                    track_id=track_id,
                )
                detections.append(detection)

                # ── Velocity Analysis ─────────────────────
                if track_id is not None:
                    center = bbox.center
                    velocity = self._calculate_velocity(track_id, center)

                    if self._detect_sudden_stop(track_id, velocity):
                        sudden_stops += 1

                    # Update tracking state
                    self.track_history[track_id].append(center)
                    self.track_velocities[track_id] = velocity

        # ── Accident Decision ─────────────────────────────
        return self._evaluate_accident(
            detections=detections,
            sudden_stops=sudden_stops,
            annotated_frame=annotated_frame,
        )

    def _evaluate_accident(
        self,
        detections: List[Detection],
        sudden_stops: int,
        annotated_frame: np.ndarray,
    ) -> Tuple[bool, np.ndarray, Optional[AccidentEvent]]:
        """
        Scoring engine: should we trigger an accident alert?

        Score is 0-100. Threshold is 50.
        Different signals add to the score:
        → Overlapping vehicles = strong signal (+35 to +60)
        → Sudden stop = supporting signal (+25)
        → Multiple vehicles = context (+10 to +15)
        → High confidence = confirmation (+10 to +20)
        """

        num_vehicles = sum(
            1 for d in detections
            if d.vehicle_type not in [VehicleType.PERSON, VehicleType.UNKNOWN]
        )
        # Generator expression:
        # sum(1 for d in detections if condition)
        # Counts how many detections match the condition

        if num_vehicles < 1:
            return False, annotated_frame, None
            # Need at least 1 vehicle. No vehicles = not a road accident.

        overlap_count = self._count_collisions(detections)

        # Build accident score
        score = 0

        if overlap_count >= 2:
            score += 60
        elif overlap_count >= 1:
            score += 35

        if sudden_stops >= 2:
            score += 30
        elif sudden_stops >= 1:
            score += 20

        if num_vehicles >= 3:
            score += 15
        elif num_vehicles >= 2:
            score += 10

        avg_conf = (
            sum(d.confidence for d in detections) / len(detections)
            if detections else 0.0
        )
        # Inline conditional (ternary):
        # value_if_true if condition else value_if_false
        # Avoids ZeroDivisionError when detections is empty

        if avg_conf > 0.75:
            score += 20
        elif avg_conf > 0.60:
            score += 10

        if score < 50:
            return False, annotated_frame, None
            # Below threshold = not an accident

        # ── Cooldown Check ────────────────────────────────
        now = time.time()
        elapsed = now - self._last_alert_time

        if elapsed < settings.alert_cooldown_seconds:
            logger.debug(
                f"Cooldown active: {elapsed:.1f}s / {settings.alert_cooldown_seconds}s"
            )
            return False, annotated_frame, None
            # Same accident still happening — don't send duplicate

        self._last_alert_time = now

        # ── Build AccidentEvent ───────────────────────────
        event = AccidentEvent(
            source_id=self.source_id,
            timestamp=now,
            detections=detections,
            frame_number=self._frame_count,
            overlapping_objects=overlap_count,
        )
        event.calculate_severity()
        event.generate_description()

        # Save screenshot to disk
        screenshot_path = self._save_screenshot(annotated_frame, event.accident_id)
        event.screenshot_path = str(screenshot_path)

        # Encode frame as base64 string (for HTTP JSON body)
        event.image_base64 = self._encode_frame_base64(annotated_frame)

        logger.warning(
            f"ACCIDENT | source={self.source_id} | "
            f"severity={event.severity.value} | "
            f"score={score} | {event.description}"
        )

        return True, annotated_frame, event

    def _save_screenshot(self, frame: np.ndarray, accident_id: str) -> Path:
        """Save annotated frame as JPEG. Returns file path."""
        filepath = settings.screenshot_dir / f"{accident_id}.jpg"
        # Path / "string" = platform-safe path joining

        success = cv2.imwrite(
            str(filepath),
            # cv2.imwrite needs STRING path, not Path object → str()
            frame,
            [cv2.IMWRITE_JPEG_QUALITY, 85]
            # JPEG quality 85 = good quality + smaller file
            # 100 = perfect quality, largest file
            # 60 = small file, visible quality loss
        )

        if success:
            logger.info(f"Screenshot: {filepath}")
        else:
            logger.error(f"Failed to save screenshot: {filepath}")

        return filepath

    def _encode_frame_base64(self, frame: np.ndarray) -> str:
        """
        Convert numpy frame → base64 string.

        WHY BASE64?
        JSON body is TEXT. Images are BINARY.
        base64 converts: binary bytes → ASCII characters
        (33% size increase is acceptable for HTTP)

        Person 2 decodes:
            import base64
            image_bytes = base64.b64decode(received_string)
        """
        _, buffer = cv2.imencode(
            ".jpg",
            frame,
            [cv2.IMWRITE_JPEG_QUALITY, 80]
        )
        # imencode = encode frame to JPEG in MEMORY (not saved to disk)
        # Returns: (success_bool, numpy_array_of_bytes)
        # _ = discard success bool (convention: _ = "I don't need this")

        image_bytes = buffer.tobytes()
        # numpy array → Python bytes object

        b64_bytes = base64.b64encode(image_bytes)
        # bytes → base64-encoded bytes: b'iVBORw0KGgo...'

        return b64_bytes.decode("utf-8")
        # base64 bytes → Python string: 'iVBORw0KGgo...'
        # Now it's regular text, safe for JSON