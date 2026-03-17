# pipeline_test.py
# Tests: Python → Backend → Frontend (full pipeline)
# Run: python pipeline_test.py

import requests
import base64
import time
import json

# ── CONFIG ──────────────────────────────────────────────
BACKEND_URL = "http://localhost:5000/api/accidents"
API_KEY     = "supersecretkey123"
# Must match AI_API_KEY in backend/.env
# ────────────────────────────────────────────────────────


def create_fake_image_base64():
    """
    Creates a tiny red square as base64.
    Simulates the accident screenshot from YOLO.
    In real system: this is the actual annotated frame.
    """
    # Minimal valid JPEG as bytes (1x1 red pixel)
    # In real system: cv2.imencode('.jpg', annotated_frame)
    tiny_jpeg = bytes([
        0xFF,0xD8,0xFF,0xE0,0x00,0x10,0x4A,0x46,0x49,0x46,0x00,0x01,
        0x01,0x00,0x00,0x01,0x00,0x01,0x00,0x00,0xFF,0xDB,0x00,0x43,
        0x00,0x08,0x06,0x06,0x07,0x06,0x05,0x08,0x07,0x07,0x07,0x09,
        0x09,0x08,0x0A,0x0C,0x14,0x0D,0x0C,0x0B,0x0B,0x0C,0x19,0x12,
        0x13,0x0F,0x14,0x1D,0x1A,0x1F,0x1E,0x1D,0x1A,0x1C,0x1C,0x20,
        0x24,0x2E,0x27,0x20,0x22,0x2C,0x23,0x1C,0x1C,0x28,0x37,0x29,
        0x2C,0x30,0x31,0x34,0x34,0x34,0x1F,0x27,0x39,0x3D,0x38,0x32,
        0x3C,0x2E,0x33,0x34,0x32,0xFF,0xC0,0x00,0x0B,0x08,0x00,0x01,
        0x00,0x01,0x01,0x01,0x11,0x00,0xFF,0xC4,0x00,0x1F,0x00,0x00,
        0x01,0x05,0x01,0x01,0x01,0x01,0x01,0x01,0x00,0x00,0x00,0x00,
        0x00,0x00,0x00,0x00,0x01,0x02,0x03,0x04,0x05,0x06,0x07,0x08,
        0x09,0x0A,0x0B,0xFF,0xC4,0x00,0xB5,0x10,0x00,0x02,0x01,0x03,
        0x03,0x02,0x04,0x03,0x05,0x05,0x04,0x04,0x00,0x00,0x01,0x7D,
        0x01,0x02,0x03,0x00,0x04,0x11,0x05,0x12,0x21,0x31,0x41,0x06,
        0x13,0x51,0x61,0x07,0x22,0x71,0x14,0x32,0x81,0x91,0xA1,0x08,
        0x23,0x42,0xB1,0xC1,0x15,0x52,0xD1,0xF0,0x24,0x33,0x62,0x72,
        0x82,0xFF,0xDA,0x00,0x08,0x01,0x01,0x00,0x00,0x3F,0x00,0xFB,
        0x00,0xFF,0xD9
    ])
    return base64.b64encode(tiny_jpeg).decode('utf-8')


def send_accident(severity="HIGH", source_id="camera_0", num=1):
    """
    Sends one fake accident alert to backend.
    Simulates exactly what detector.py sends in real system.
    """

    timestamp = time.time()
    accident_id = f"{source_id}_{int(timestamp)}_{num * 30}"

    payload = {
        # ── These fields match AccidentEvent.to_dict() ──
        "accident_id":       accident_id,
        "source_id":         source_id,
        "timestamp":         timestamp,
        "frame_number":      num * 30,
        "severity":          severity,
        "confidence_avg":    0.82,
        "overlapping_objects": 1,
        "description":       f"Detected: 2 car(s) | 1 overlapping pair — possible collision",
        "sent_at":           timestamp,
        "sender_version":    "2.0",

        # ── Location ──────────────────────────────────
        "location": {
            "latitude":  19.0760,
            "longitude": 72.8777,
        },
        # Change to your actual camera coordinates

        # ── Detections ────────────────────────────────
        "detections": [
            {
                "class":        "car",
                "vehicle_type": "car",
                "confidence":   0.871,
                "bbox": {
                    "x1": 120.5, "y1": 200.3,
                    "x2": 450.2, "y2": 380.1,
                    "center_x": 285.4,
                    "center_y": 290.2,
                    "width": 329.7,
                    "height": 179.8,
                },
                "track_id": 5,
            },
            {
                "class":        "motorcycle",
                "vehicle_type": "motorcycle",
                "confidence":   0.763,
                "bbox": {
                    "x1": 300.0, "y1": 220.0,
                    "x2": 480.0, "y2": 370.0,
                    "center_x": 390.0,
                    "center_y": 295.0,
                    "width": 180.0,
                    "height": 150.0,
                },
                "track_id": 12,
            },
        ],

        # ── Screenshot ────────────────────────────────
        "image_base64":   create_fake_image_base64(),
        "screenshot_path": f"screenshots/{accident_id}.jpg",
    }

    headers = {
        "Content-Type": "application/json",
        "X-API-Key":    API_KEY,
        # This header is checked by aiApiKey middleware in backend
    }

    try:
        print(f"\n[Sending] Accident #{num} | Severity: {severity} | Source: {source_id}")
        print(f"[Sending] ID: {accident_id}")

        response = requests.post(
            BACKEND_URL,
            json=payload,
            # json= auto-serializes dict to JSON string
            # AND sets Content-Type: application/json
            headers=headers,
            timeout=10,
        )

        if response.status_code in (200, 201):
            data = response.json()
            print(f"[SUCCESS] Status: {response.status_code}")
            print(f"[SUCCESS] Backend ID: {data.get('id', 'N/A')}")
            return True
        else:
            print(f"[FAILED]  Status: {response.status_code}")
            print(f"[FAILED]  Response: {response.text[:200]}")
            return False

    except requests.exceptions.ConnectionError:
        print("[ERROR] Cannot connect to backend")
        print("[ERROR] Make sure: node src/server.js is running")
        return False

    except requests.exceptions.Timeout:
        print("[ERROR] Request timed out")
        return False

    except Exception as e:
        print(f"[ERROR] {e}")
        return False


def run_full_test():
    """
    Runs a sequence of test accidents.
    Watch your gov frontend dashboard — alerts should appear!
    """
    print("=" * 55)
    print("  FULL PIPELINE TEST")
    print("  Python → Backend → Frontend")
    print("=" * 55)
    print(f"\nBackend URL : {BACKEND_URL}")
    print(f"API Key     : {API_KEY[:8]}...")
    print("\nWatch your Gov Frontend at http://localhost:3000")
    print("Alerts should appear in real-time!\n")

    # Test 1 — Health check first
    print("[Test 1] Checking backend health...")
    try:
        r = requests.get("http://localhost:5000/health", timeout=5)
        if r.status_code == 200:
            print("[OK] Backend is running\n")
        else:
            print("[FAIL] Backend returned error\n")
    except:
        print("[FAIL] Backend not reachable — start it first!\n")
        return

    # Test 2 — Send accidents with different severities
    test_cases = [
        ("LOW",      "camera_0", 1),
        ("MEDIUM",   "camera_1", 2),
        ("HIGH",     "camera_0", 3),
        ("CRITICAL", "camera_2", 4),
    ]

    results = []
    for severity, source, num in test_cases:
        success = send_accident(severity, source, num)
        results.append(success)
        time.sleep(2)
        # Wait 2 seconds between accidents
        # So you can see each alert appear on dashboard one by one

    # Summary
    print("\n" + "=" * 55)
    print("  TEST RESULTS")
    print("=" * 55)
    passed = sum(results)
    total  = len(results)
    print(f"  Passed : {passed}/{total}")

    if passed == total:
        print("  Status : ALL PASSED ✓")
        print("\n  Check your Gov Frontend dashboard —")
        print("  you should see 4 new accidents in the table!")
        print("  Live alerts should have appeared in top-right corner.")
    else:
        print("  Status : SOME FAILED ✗")
        print("  Check backend logs for errors.")
    print("=" * 55)


if __name__ == "__main__":
    run_full_test()