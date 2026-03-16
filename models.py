# ============================================================
# models.py — Data Blueprints (Shared Language for the Team)
#
# THIS FILE IS THE MOST IMPORTANT FOR TEAMWORK.
#
# Why define data models?
# → Person 1 creates AccidentEvent
# → Person 2 receives and stores it
# → Person 3 displays it
# → Person 4 analyzes it
# → EVERYONE uses the same structure = no confusion
#
# Tools used:
# dataclass = auto-generates __init__, __repr__ for free
# Enum = named constants (typo-proof, autocomplete works)
# ============================================================

from dataclasses import dataclass, field
# @dataclass decorator:
# Without it:
#   class Detection:
#       def __init__(self, class_name, confidence, ...):
#           self.class_name = class_name
#           self.confidence = confidence
#           ...  ← 20 lines of repetitive code
#
# With @dataclass:
#   @dataclass
#   class Detection:
#       class_name: str
#       confidence: float
#   ← 3 lines! Python generates __init__ automatically

# field(default_factory=...) = for mutable defaults (lists, dicts)
# NEVER do: my_list: list = []
# ALL instances would SHARE the same list (famous Python gotcha!)
# ALWAYS do: my_list: list = field(default_factory=list)
# Each instance gets its OWN fresh list

from typing import List, Optional, Tuple
from enum import Enum
# Enum = a set of named constants
# WITHOUT Enum: severity = "HIGH"  → typo "HIHG" is silent bug
# WITH Enum: severity = AccidentSeverity.HIGH → typo = Python error immediately

import time


class AccidentSeverity(Enum):
    """
    Accident severity levels.
    
    Enum usage:
        s = AccidentSeverity.HIGH      ← create
        s.value                        → "HIGH" (the string)
        s.name                         → "HIGH" (same here)
        AccidentSeverity("HIGH")       ← create from string
        
    In JSON: use .value to get the string
    """
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class VehicleType(Enum):
    """Vehicle categories detectable by YOLO (COCO dataset classes)"""
    CAR = "car"
    TRUCK = "truck"
    MOTORCYCLE = "motorcycle"
    BUS = "bus"
    BICYCLE = "bicycle"
    PERSON = "person"
    UNKNOWN = "unknown"

    @classmethod
    def from_yolo_class(cls, class_name: str) -> 'VehicleType':
        """
        Converts YOLO string → our VehicleType enum.

        @classmethod → method belongs to the CLASS, not an instance
        cls = the VehicleType class itself
        Called as: VehicleType.from_yolo_class("car")
        (not on an instance)

        'VehicleType' in quotes = forward reference
        Python hasn't fully defined VehicleType yet when parsing this line
        Quotes tell Python "trust me, this type exists by runtime"
        """
        mapping = {
            "car": cls.CAR,
            "truck": cls.TRUCK,
            "motorcycle": cls.MOTORCYCLE,
            "bus": cls.BUS,
            "bicycle": cls.BICYCLE,
            "person": cls.PERSON,
        }
        return mapping.get(class_name.lower(), cls.UNKNOWN)
        # dict.get(key, default) → returns UNKNOWN if class not in mapping
        # .lower() → handles "Car", "CAR", "car" all correctly


@dataclass
class BoundingBox:
    """
    Where in the frame an object was detected.
    
    Coordinate system (YOLO uses xyxy format):
    
    (0,0) ─────────────────── (width, 0)
      │                              │
      │    (x1,y1)─────────┐         │
      │       │  OBJECT    │         │
      │       └────────(x2,y2)       │
      │                              │
    (0,height)──────────(width,height)
    
    x1,y1 = top-left corner
    x2,y2 = bottom-right corner
    All values in pixels
    """
    x1: float
    y1: float
    x2: float
    y2: float

    @property
    def width(self) -> float:
        return self.x2 - self.x1

    @property
    def height(self) -> float:
        return self.y2 - self.y1

    @property
    def area(self) -> float:
        return self.width * self.height

    @property
    def center(self) -> Tuple[float, float]:
        """Center point (cx, cy) of the bounding box"""
        return ((self.x1 + self.x2) / 2, (self.y1 + self.y2) / 2)

    def iou(self, other: 'BoundingBox') -> float:
        """
        Intersection over Union — measures overlap between two boxes.
        
        IOU = 0.0 → boxes don't overlap at all
        IOU = 1.0 → boxes are identical
        IOU = 0.5 → 50% overlap
        
        We use this to detect collisions:
        Car box overlaps Motorcycle box by 20%+ = likely collision!
        
        FORMULA:
        IOU = Intersection Area / Union Area
        
        Intersection = the overlapping rectangle
        Union = total area covered by BOTH boxes
        """
        # Find the overlapping rectangle
        inter_x1 = max(self.x1, other.x1)
        inter_y1 = max(self.y1, other.y1)
        inter_x2 = min(self.x2, other.x2)
        inter_y2 = min(self.y2, other.y2)
        # max for start, min for end = where BOTH boxes exist
        
        inter_w = max(0.0, inter_x2 - inter_x1)
        inter_h = max(0.0, inter_y2 - inter_y1)
        # max(0, ...) → clamp negative values to 0
        # Negative would mean no overlap (boxes are apart)
        
        intersection = inter_w * inter_h

        union = self.area + other.area - intersection
        # Why subtract intersection?
        # If we just add areas, the overlap region gets counted TWICE
        # area_A + area_B - intersection = true combined area

        if union == 0.0:
            return 0.0  # Prevent division by zero

        return intersection / union

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON sending to Person 2"""
        return {
            "x1": round(self.x1, 2),
            "y1": round(self.y1, 2),
            "x2": round(self.x2, 2),
            "y2": round(self.y2, 2),
            "center_x": round(self.center[0], 2),
            "center_y": round(self.center[1], 2),
            "width": round(self.width, 2),
            "height": round(self.height, 2),
        }
        # round(val, 2) → 120.5678 becomes 120.57 (cleaner JSON)


@dataclass
class Detection:
    """One detected object in a frame."""
    class_name: str                     # YOLO raw string: "car", "person"
    vehicle_type: VehicleType           # Our enum version
    confidence: float                   # 0.0 to 1.0
    bbox: BoundingBox                   # Where in the frame
    track_id: Optional[int] = None
    # Optional[int] → can be int OR None
    # None when tracker hasn't assigned an ID yet (first frame for new object)

    def to_dict(self) -> dict:
        return {
            "class": self.class_name,
            "vehicle_type": self.vehicle_type.value,
            # .value → VehicleType.CAR → "car" (string for JSON)
            "confidence": round(self.confidence, 4),
            "bbox": self.bbox.to_dict(),
            "track_id": self.track_id,
        }


@dataclass
class AccidentEvent:
    """
    Complete accident record.
    This exact structure is sent to Person 2 as JSON.
    Person 2 stores it. Person 3 displays it. Person 4 analyzes it.
    """
    source_id: str
    # Which camera detected it: "camera_0", "camera_1"

    timestamp: float = field(default_factory=time.time)
    # default_factory=time.time → calls time.time() fresh for EACH instance
    # WHY NOT: timestamp: float = time.time()
    # That would call time.time() ONCE when class is defined
    # All accidents would have the SAME timestamp!
    # default_factory calls the function fresh every time

    detections: List[Detection] = field(default_factory=list)
    # default_factory=list → each instance gets its OWN empty list
    # NEVER: detections: List = [] ← all instances share same list (bug!)

    severity: AccidentSeverity = AccidentSeverity.MEDIUM
    frame_number: int = 0
    screenshot_path: Optional[str] = None
    image_base64: Optional[str] = None   # Base64-encoded screenshot for HTTP
    confidence_avg: float = 0.0
    overlapping_objects: int = 0
    description: str = ""

    @property
    def accident_id(self) -> str:
        """
        Unique ID for this event.
        Format: camera_0_1710000000_150
                ^camera  ^unix_time  ^frame

        Property = computed on access, not stored
        changes if timestamp changes (but timestamps don't change here)
        """
        return f"{self.source_id}_{int(self.timestamp)}_{self.frame_number}"

    def calculate_severity(self):
        """
        Auto-calculates severity from detection data.
        Call this AFTER all detections are added.
        """
        vehicles = [
            d for d in self.detections
            if d.vehicle_type not in [VehicleType.PERSON, VehicleType.UNKNOWN]
        ]
        # List comprehension with condition:
        # [item for item in list if condition]
        # Creates new list with only vehicles (no pedestrians)

        num_vehicles = len(vehicles)

        if self.detections:
            self.confidence_avg = (
                sum(d.confidence for d in self.detections) / len(self.detections)
            )
            # Generator expression: sum(d.confidence for d in ...) 
            # Adds up all confidence values
            # Divide by count = average

        # Severity scoring
        if self.overlapping_objects >= 2 or (num_vehicles >= 3 and self.confidence_avg > 0.7):
            self.severity = AccidentSeverity.CRITICAL
        elif self.overlapping_objects >= 1 or (num_vehicles >= 2 and self.confidence_avg > 0.65):
            self.severity = AccidentSeverity.HIGH
        elif num_vehicles >= 2 or self.confidence_avg > 0.6:
            self.severity = AccidentSeverity.MEDIUM
        else:
            self.severity = AccidentSeverity.LOW

    def generate_description(self) -> str:
        """Human-readable description of the accident."""
        counts = {}
        for d in self.detections:
            v = d.vehicle_type.value
            counts[v] = counts.get(v, 0) + 1
            # dict.get(key, 0) → returns 0 for new keys (avoids KeyError)
            # Counts how many of each vehicle type

        parts = [f"{n} {v}" for v, n in counts.items()]
        # Dict comprehension: {"car": 2, "motorcycle": 1}
        # → ["2 car", "1 motorcycle"]

        desc = "Detected: " + ", ".join(parts)
        # ", ".join(list) → ["2 car", "1 motorcycle"] → "2 car, 1 motorcycle"

        if self.overlapping_objects > 0:
            desc += f" | {self.overlapping_objects} overlapping pair(s)"

        self.description = desc
        return desc

    def to_dict(self) -> dict:
        """
        Converts entire event to JSON-ready dictionary.
        This is EXACTLY what Person 2 receives.
        """
        return {
            "accident_id": self.accident_id,
            "source_id": self.source_id,
            "timestamp": self.timestamp,
            "frame_number": self.frame_number,
            "severity": self.severity.value,
            # .value converts enum to string: AccidentSeverity.HIGH → "HIGH"
            "confidence_avg": round(self.confidence_avg, 4),
            "overlapping_objects": self.overlapping_objects,
            "description": self.description,
            "detections": [d.to_dict() for d in self.detections],
            # List comprehension: calls to_dict() on every Detection
            "screenshot_path": self.screenshot_path,
            "image_base64": self.image_base64,
        }