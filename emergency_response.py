# ============================================================
# emergency_response.py — Master Emergency Orchestrator
#
# This file is the CONDUCTOR of the emergency response.
# When accident detected → this runs EVERYTHING:
#
# 1. Get accident location
# 2. Find nearby emergency services (Mappls)
# 3. Call police (Twilio voice)
# 4. Call ambulance (Twilio voice)
# 5. SMS nearby hospitals (with location)
# 6. WhatsApp nearby stores + people (with image)
# 7. Send all info to Person 2's backend
# 8. Log everything
# ============================================================

import time
import asyncio
from dataclasses import dataclass, field
from typing import List, Dict, Optional
from config import settings
from logger import logger
from models import AccidentEvent, AccidentSeverity
from mappls_service import MapplsService, NearbyPlace
from twilio_service import TwilioService, ContactResult


@dataclass
class EmergencyResponse:
    """
    Complete record of all emergency actions taken for one accident.
    Sent to Person 2's backend for logging.
    Person 4 (admin dashboard) analyzes these.
    """
    accident_id: str
    timestamp: float = field(default_factory=time.time)
    location_lat: float = 0.0
    location_lon: float = 0.0
    location_source: str = ""
    # "gps", "cell_tower", or "fixed"

    calls_made: List[ContactResult] = field(default_factory=list)
    sms_sent: List[ContactResult] = field(default_factory=list)
    whatsapp_sent: List[ContactResult] = field(default_factory=list)

    nearby_hospitals: List[str] = field(default_factory=list)
    nearby_police: List[str] = field(default_factory=list)
    nearby_stores: List[str] = field(default_factory=list)

    total_contacts_reached: int = 0
    response_time_seconds: float = 0.0
    # How long from detection to all alerts sent

    def to_dict(self) -> dict:
        """Convert to dict for Person 2's backend."""
        return {
            "accident_id": self.accident_id,
            "timestamp": self.timestamp,
            "location": {
                "latitude": self.location_lat,
                "longitude": self.location_lon,
                "source": self.location_source,
                "maps_link": f"https://maps.google.com/?q={self.location_lat},{self.location_lon}",
            },
            "emergency_actions": {
                "calls": [
                    {
                        "name": r.contact_name,
                        "phone": r.phone_number,
                        "type": r.contact_type,
                        "success": r.success,
                        "sid": r.message_sid,
                    }
                    for r in self.calls_made
                ],
                "sms": [
                    {
                        "name": r.contact_name,
                        "phone": r.phone_number,
                        "type": r.contact_type,
                        "success": r.success,
                    }
                    for r in self.sms_sent
                ],
                "whatsapp": [
                    {
                        "name": r.contact_name,
                        "phone": r.phone_number,
                        "success": r.success,
                    }
                    for r in self.whatsapp_sent
                ],
            },
            "nearby_hospitals": self.nearby_hospitals,
            "nearby_police": self.nearby_police,
            "nearby_stores": self.nearby_stores,
            "total_contacts_reached": self.total_contacts_reached,
            "response_time_seconds": round(self.response_time_seconds, 2),
        }


class EmergencyResponseSystem:
    """
    Full emergency response orchestrator.

    Single entry point: handle_accident(event, location)
    Everything else is handled internally.
    """

    def __init__(self):
        self.mappls = MapplsService()
        self.twilio = TwilioService()
        logger.info("EmergencyResponseSystem initialized")

    def handle_accident(
        self,
        event: AccidentEvent,
        latitude: float,
        longitude: float,
        location_source: str = "fixed",
        screenshot_url: Optional[str] = None,
    ) -> EmergencyResponse:
        """
        Main method. Call this when accident is detected.

        Args:
            event: The accident event from detector.py
            latitude, longitude: Accident GPS coordinates
            location_source: How location was determined
            screenshot_url: Public URL of accident image
                           (for WhatsApp image sending)
                           Example: "http://192.168.1.50:5000/screenshots/accident_123.jpg"

        Returns: EmergencyResponse with record of all actions taken
        """
        start_time = time.time()

        print(f"\n{'='*55}")
        print(f"🚨 EMERGENCY RESPONSE ACTIVATED")
        print(f"   Accident: {event.accident_id}")
        print(f"   Severity: {event.severity.value}")
        print(f"   Location: {latitude}, {longitude}")
        print(f"   Maps: https://maps.google.com/?q={latitude},{longitude}")
        print(f"{'='*55}")

        response = EmergencyResponse(
            accident_id=event.accident_id,
            location_lat=latitude,
            location_lon=longitude,
            location_source=location_source,
        )

        # ── Step 1: Find nearby emergency services ──────
        print("\n[Step 1] Finding nearby emergency services via Mappls...")
        nearby = self.mappls.find_all_emergency(latitude, longitude)
        # nearby = {"hospital": [...], "police": [...], "fire_station": [...]}

        hospitals = nearby.get("hospital", [])
        police_stations = nearby.get("police", [])
        pharmacies = nearby.get("pharmacy", [])
        fuel_stations = nearby.get("fuel_station", [])
        all_nearby_stores = pharmacies + fuel_stations
        # + operator on lists = concatenates them
        # [pharmacy1, pharmacy2] + [fuel1] = [pharmacy1, pharmacy2, fuel1]

        # Log what was found
        response.nearby_hospitals = [f"{p.name} ({p.distance_km}km)" for p in hospitals]
        response.nearby_police = [f"{p.name} ({p.distance_km}km)" for p in police_stations]
        response.nearby_stores = [f"{p.name} ({p.distance_km}km)" for p in all_nearby_stores]

        self._print_found_places(hospitals, police_stations, all_nearby_stores)

        # ── Step 2: Build messages ──────────────────────
        print("\n[Step 2] Building emergency messages...")
        location_link = f"https://maps.google.com/?q={latitude},{longitude}"

        call_message = self._build_call_message(event)
        # Short message for voice call (spoken aloud)

        sms_police = self._build_police_sms(event, latitude, longitude, location_link)
        sms_hospital = self._build_hospital_sms(event, latitude, longitude, location_link)
        sms_public = self._build_public_sms(event, latitude, longitude, location_link, screenshot_url)
        # Different messages for different recipients

        # ── Step 3: Call Police ─────────────────────────
        print("\n[Step 3] Calling police...")

        # Always call national number first
        police_result = self.twilio.make_emergency_call(
            to_number=getattr(settings, 'police_number', '100'),
            contact_name="Police Control Room",
            contact_type="police",
            accident_message=call_message,
            latitude=latitude,
            longitude=longitude,
        )
        response.calls_made.append(police_result)
        self._print_result("CALL", "Police (100)", police_result)

        # Also call nearest police station if found
        if police_stations and police_stations[0].phone:
            nearest_police = police_stations[0]
            result = self.twilio.make_emergency_call(
                to_number=nearest_police.phone,
                contact_name=nearest_police.name,
                contact_type="police",
                accident_message=call_message,
                latitude=latitude,
                longitude=longitude,
            )
            response.calls_made.append(result)
            self._print_result("CALL", nearest_police.name, result)

            # Also send SMS to police station
            result_sms = self.twilio.send_sms(
                to_number=nearest_police.phone,
                contact_name=nearest_police.name,
                contact_type="police",
                message=sms_police,
            )
            response.sms_sent.append(result_sms)
            self._print_result("SMS", nearest_police.name, result_sms)

        # ── Step 4: Call Ambulance ──────────────────────
        print("\n[Step 4] Calling ambulance...")

        ambulance_result = self.twilio.make_emergency_call(
            to_number=getattr(settings, 'ambulance_number', '108'),
            contact_name="Ambulance Emergency",
            contact_type="hospital",
            accident_message=call_message,
            latitude=latitude,
            longitude=longitude,
        )
        response.calls_made.append(ambulance_result)
        self._print_result("CALL", "Ambulance (108)", ambulance_result)

        # Call nearest hospital
        if hospitals and hospitals[0].phone:
            nearest_hospital = hospitals[0]
            result = self.twilio.make_emergency_call(
                to_number=nearest_hospital.phone,
                contact_name=nearest_hospital.name,
                contact_type="hospital",
                accident_message=call_message,
                latitude=latitude,
                longitude=longitude,
            )
            response.calls_made.append(result)
            self._print_result("CALL", nearest_hospital.name, result)

            # SMS to nearest hospital
            result_sms = self.twilio.send_sms(
                to_number=nearest_hospital.phone,
                contact_name=nearest_hospital.name,
                contact_type="hospital",
                message=sms_hospital,
            )
            response.sms_sent.append(result_sms)
            self._print_result("SMS", nearest_hospital.name, result_sms)

        # ── Step 5: SMS to nearby pharmacies ───────────
        if pharmacies:
            print("\n[Step 5] Notifying nearby pharmacies...")
            results = self.twilio.notify_nearby_places(
                places=pharmacies,
                message=sms_public,
                image_url=screenshot_url,
                max_contacts=2,
                # Max 2 pharmacies — they're most likely to have first aid
            )
            response.whatsapp_sent.extend(
                [r for r in results if r.method == "whatsapp"]
            )
            response.sms_sent.extend(
                [r for r in results if r.method == "sms"]
            )
            for r in results:
                self._print_result(r.method.upper(), r.contact_name, r)

        # ── Step 6: WhatsApp to fuel stations ──────────
        # Fuel stations have 24/7 staff → someone is always there
        if fuel_stations:
            print("\n[Step 6] Notifying nearby fuel stations...")
            results = self.twilio.notify_nearby_places(
                places=fuel_stations,
                message=sms_public,
                image_url=screenshot_url,
                max_contacts=2,
            )
            response.whatsapp_sent.extend(
                [r for r in results if r.method == "whatsapp"]
            )
            response.sms_sent.extend(
                [r for r in results if r.method == "sms"]
            )
            for r in results:
                self._print_result(r.method.upper(), r.contact_name, r)

        # ── Final Stats ─────────────────────────────────
        total_successful = sum(
            1 for r in (
                response.calls_made +
                response.sms_sent +
                response.whatsapp_sent
            )
            if r.success
            # Count successful contacts across all methods
        )
        response.total_contacts_reached = total_successful
        response.response_time_seconds = time.time() - start_time

        print(f"\n{'='*55}")
        print(f"✅ EMERGENCY RESPONSE COMPLETE")
        print(f"   Contacts reached : {total_successful}")
        print(f"   Response time    : {response.response_time_seconds:.1f}s")
        print(f"{'='*55}\n")

        return response

    def _build_call_message(self, event: AccidentEvent) -> str:
        """
        Short spoken message for voice calls.
        Keep it clear, short, important info first.
        This is SPOKEN ALOUD by Twilio TTS.
        """
        return (
            f"Road accident detected. "
            f"Severity: {event.severity.value}. "
            f"{event.description}. "
            f"Immediate assistance required."
        )

    def _build_police_sms(
        self,
        event: AccidentEvent,
        lat: float,
        lon: float,
        location_link: str,
    ) -> str:
        """
        SMS for police — includes accident details + location.
        """
        return (
            f"🚨 ACCIDENT ALERT\n"
            f"Severity: {event.severity.value}\n"
            f"Details: {event.description}\n"
            f"Location: {location_link}\n"
            f"Coords: {lat:.5f}, {lon:.5f}\n"
            f"Time: {time.strftime('%H:%M:%S')}\n"
            f"Source: Auto Detection System"
        )
        # time.strftime('%H:%M:%S') = current time as "14:32:05"
        # %H = hour (24h), %M = minute, %S = second

    def _build_hospital_sms(
        self,
        event: AccidentEvent,
        lat: float,
        lon: float,
        location_link: str,
    ) -> str:
        """
        SMS for hospital — focuses on injury potential.
        """
        vehicles = event.description
        severity = event.severity.value
        return (
            f"🏥 ACCIDENT ALERT — Prepare Emergency Team\n"
            f"Severity: {severity}\n"
            f"Incident: {vehicles}\n"
            f"Injuries possible. Please prepare.\n"
            f"📍 Location: {location_link}\n"
            f"Directions to accident:\n"
            f"https://maps.google.com/maps?daddr={lat},{lon}"
        )

    def _build_public_sms(
        self,
        event: AccidentEvent,
        lat: float,
        lon: float,
        location_link: str,
        screenshot_url: Optional[str],
    ) -> str:
        """
        SMS/WhatsApp for nearby public (stores, fuel stations).
        Asks for help, gives location.
        """
        msg = (
            f"⚠️ Road accident nearby — Need help!\n"
            f"Incident: {event.description}\n"
            f"📍 Accident location: {location_link}\n"
            f"Please assist or call 108 (ambulance) / 100 (police)\n"
            f"Auto-detected at {time.strftime('%H:%M')}"
        )

        if screenshot_url:
            msg += f"\n📸 Accident photo: {screenshot_url}"
            # Adds link to actual accident screenshot
            # Person receives photo and can see the accident

        return msg

    def _print_found_places(self, hospitals, police, stores):
        """Print summary of found places."""
        if hospitals:
            print(f"  Hospitals found: {len(hospitals)}")
            for h in hospitals[:2]:
                print(f"    → {h.name} | {h.distance_km}km | {h.phone or 'no phone'}")

        if police:
            print(f"  Police stations found: {len(police)}")
            for p in police[:2]:
                print(f"    → {p.name} | {p.distance_km}km | {p.phone or 'no phone'}")

        if stores:
            print(f"  Nearby stores/stations: {len(stores)}")
            for s in stores[:2]:
                print(f"    → {s.name} | {s.distance_km}km | {s.phone or 'no phone'}")

    def _print_result(self, method: str, name: str, result: ContactResult):
        """Print one contact attempt result."""
        status = "✓" if result.success else "✗"
        print(f"  [{method} {status}] {name} | {result.phone_number}")
        if not result.success and result.error:
            print(f"         Error: {result.error}")