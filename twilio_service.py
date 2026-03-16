# ============================================================
# twilio_service.py — Calls, SMS, and WhatsApp via Twilio
#
# WHAT TWILIO DOES:
# → Makes actual phone calls (computer calls a real phone)
# → Sends SMS text messages
# → Sends WhatsApp messages (text + images)
#
# HOW TWILIO CALLS WORK:
# 1. You call Twilio API: "call this number and say this text"
# 2. Twilio's servers call the phone number
# 3. When person picks up → Twilio speaks the message (text-to-speech)
# 4. OR plays a pre-recorded audio file
#
# TwiML = Twilio Markup Language
# XML format that tells Twilio what to do during a call
# <Say> = speak text, <Play> = play audio, <Record> = record response
# ============================================================

from twilio.rest import Client
# Twilio's official Python library
# Handles all API communication with Twilio's servers

from twilio.twiml.voice_response import VoiceResponse, Say, Pause
# VoiceResponse = builds TwiML for phone calls
# Say = text-to-speech element
# Pause = silence between sentences (for natural speech rhythm)

import time
from typing import List, Optional, Dict
from dataclasses import dataclass
from config import settings
from logger import logger
from mappls_service import NearbyPlace


@dataclass
class ContactResult:
    """
    Result of one contact attempt (call or message).
    Tracks what happened for logging and reporting.
    """
    contact_name: str
    phone_number: str
    contact_type: str      # "police", "hospital", "store", "whatsapp"
    method: str            # "call", "sms", "whatsapp"
    success: bool
    message_sid: Optional[str] = None
    # message_sid = Twilio's unique ID for each message/call
    # Use this to track delivery status later
    error: Optional[str] = None


class TwilioService:
    """
    Handles all communication via Twilio:
    1. Voice calls to police and ambulance
    2. SMS to nearby places and emergency contacts
    3. WhatsApp messages with location + image

    All methods return ContactResult for tracking.
    """

    def __init__(self):
        self.account_sid = getattr(settings, 'twilio_account_sid', '')
        self.auth_token = getattr(settings, 'twilio_auth_token', '')
        self.from_number = getattr(settings, 'twilio_phone_number', '')
        self.whatsapp_number = getattr(settings, 'twilio_whatsapp_number', '')

        # Check if Twilio is properly configured
        self.is_configured = bool(
            self.account_sid and
            self.auth_token and
            self.from_number
        )
        # bool(a and b and c) = True only if ALL are non-empty strings

        if not self.is_configured:
            logger.error(
                "Twilio not configured! Set TWILIO_ACCOUNT_SID, "
                "TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER in .env"
            )
            return

        self.client = Client(self.account_sid, self.auth_token)
        # Client = authenticated connection to Twilio API
        # All calls, SMS, WhatsApp go through this object

        logger.info(f"Twilio ready | From: {self.from_number}")

    # ═══════════════════════════════════════════════════
    # VOICE CALLS
    # ═══════════════════════════════════════════════════

    def make_emergency_call(
        self,
        to_number: str,
        contact_name: str,
        contact_type: str,
        accident_message: str,
        latitude: float,
        longitude: float,
    ) -> ContactResult:
        """
        Makes an automated voice call.
        When answered: Twilio speaks the accident message.

        How it works:
        1. We create TwiML (XML instructions for the call)
        2. Twilio calls the number
        3. When answered: Twilio follows our TwiML instructions
        4. TwiML says: speak these words, pause, repeat
        """
        if not self.is_configured:
            return ContactResult(
                contact_name=contact_name,
                phone_number=to_number,
                contact_type=contact_type,
                method="call",
                success=False,
                error="Twilio not configured"
            )

        twiml = self._build_call_twiml(
            accident_message, contact_name, latitude, longitude
        )
        # twiml = XML string describing what to say during call

        try:
            call = self.client.calls.create(
                to=to_number,
                # to = phone number to call
                # Must be in E.164 format: +919876543210
                # +[country_code][number]

                from_=self.from_number,
                # from_ = your Twilio number (caller ID)
                # Note: from_ with underscore (from is Python keyword)

                twiml=twiml,
                # twiml = what to say/do when call is answered
                # Twilio reads this XML and executes it

                timeout=30,
                # Ring for 30 seconds before giving up
                # 30 seconds = ~6 rings (typical ring is 5 seconds)
                # Police might be busy → give them time to answer

                machine_detection="Enable",
                # machine_detection = detect if voicemail picks up
                # "Enable" → Twilio checks if human or machine answered
                # Prevents leaving confusing message on voicemail
                # Values: "Enable", "DetectMessageEnd", None
            )

            logger.info(
                f"📞 Call initiated | to={to_number} | "
                f"SID={call.sid} | status={call.status}"
            )
            # call.sid = unique call identifier
            # call.status = "queued" initially, then "ringing", "in-progress", "completed"

            return ContactResult(
                contact_name=contact_name,
                phone_number=to_number,
                contact_type=contact_type,
                method="call",
                success=True,
                message_sid=call.sid,
            )

        except Exception as e:
            logger.error(f"Call failed to {to_number}: {e}")
            return ContactResult(
                contact_name=contact_name,
                phone_number=to_number,
                contact_type=contact_type,
                method="call",
                success=False,
                error=str(e)
            )

    def _build_call_twiml(
        self,
        message: str,
        recipient_name: str,
        latitude: float,
        longitude: float,
    ) -> str:
        """
        Builds TwiML XML for the voice call.

        TwiML is XML that tells Twilio:
        - What to say (text-to-speech)
        - How to say it (language, voice, speed)
        - When to pause
        - How many times to repeat

        Example TwiML:
        <Response>
          <Say voice="Polly.Aditi" language="hi-IN">
            Emergency alert. Road accident detected.
          </Say>
          <Pause length="1"/>
          <Say>Location: 19.07 latitude 72.87 longitude</Say>
        </Response>
        """
        response = VoiceResponse()
        # VoiceResponse = root TwiML element (<Response>)

        # Greeting with recipient's name
        response.say(
            f"Emergency alert for {recipient_name}. "
            f"This is an automated accident detection system.",
            voice="Polly.Aditi",
            # Polly.Aditi = Amazon Polly Indian English voice
            # Sounds natural for Indian accents
            # Other options:
            # "alice" = Twilio's basic TTS (robotic but free)
            # "Polly.Joanna" = American English female
            # "Polly.Matthew" = American English male
            # "Polly.Aditi" = Indian English (best for India)
            language="en-IN",
            # en-IN = English as spoken in India
            # hi-IN = Hindi
        )

        response.pause(length=1)
        # Pause 1 second between sections
        # Natural speech rhythm = easier to understand
        # Without pauses: all words run together

        # Main accident message
        response.say(
            message,
            voice="Polly.Aditi",
            language="en-IN",
        )

        response.pause(length=1)

        # Location information
        response.say(
            f"Accident location coordinates: "
            f"latitude {latitude:.4f}, "
            f"longitude {longitude:.4f}. "
            f"Please respond immediately.",
            voice="Polly.Aditi",
            language="en-IN",
        )

        response.pause(length=2)

        # Repeat the message once (important information)
        response.say(
            "Repeating: " + message,
            voice="Polly.Aditi",
            language="en-IN",
        )

        return str(response)
        # str(response) converts VoiceResponse object → TwiML XML string

    # ═══════════════════════════════════════════════════
    # SMS MESSAGES
    # ═══════════════════════════════════════════════════

    def send_sms(
        self,
        to_number: str,
        contact_name: str,
        contact_type: str,
        message: str,
    ) -> ContactResult:
        """
        Sends SMS text message via Twilio.

        SMS limits:
        - 160 characters = 1 SMS segment (cheapest)
        - 161-306 chars = 2 SMS segments (costs 2x)
        - We aim for under 160 chars in the core message
        - Location link adds characters but is worth it
        """
        if not self.is_configured:
            return ContactResult(
                contact_name=contact_name,
                phone_number=to_number,
                contact_type=contact_type,
                method="sms",
                success=False,
                error="Twilio not configured"
            )

        try:
            msg = self.client.messages.create(
                to=to_number,
                from_=self.from_number,
                body=message,
                # body = SMS text content
                # Max 1600 chars (10 segments of 160)
                # We keep it under 320 (2 segments)
            )

            logger.info(
                f"📱 SMS sent | to={to_number} | "
                f"SID={msg.sid} | chars={len(message)}"
            )

            return ContactResult(
                contact_name=contact_name,
                phone_number=to_number,
                contact_type=contact_type,
                method="sms",
                success=True,
                message_sid=msg.sid,
            )

        except Exception as e:
            logger.error(f"SMS failed to {to_number}: {e}")
            return ContactResult(
                contact_name=contact_name,
                phone_number=to_number,
                contact_type=contact_type,
                method="sms",
                success=False,
                error=str(e)
            )

    # ═══════════════════════════════════════════════════
    # WHATSAPP MESSAGES
    # ═══════════════════════════════════════════════════

    def send_whatsapp(
        self,
        to_number: str,
        contact_name: str,
        contact_type: str,
        message: str,
        image_url: Optional[str] = None,
    ) -> ContactResult:
        """
        Sends WhatsApp message via Twilio.

        WhatsApp advantages over SMS:
        → Can send IMAGES (accident photo!)
        → Free delivery to WhatsApp users
        → Blue tick delivery confirmation
        → Longer messages (no 160 char limit)

        Requirements:
        → Recipient must have WhatsApp
        → You need Twilio WhatsApp sandbox or approved number
        → Sandbox: recipient must first message your number
        → Production: apply for WhatsApp Business API (takes days)
        """
        if not self.is_configured or not self.whatsapp_number:
            return ContactResult(
                contact_name=contact_name,
                phone_number=to_number,
                contact_type=contact_type,
                method="whatsapp",
                success=False,
                error="WhatsApp not configured"
            )

        # Format numbers for WhatsApp
        # Twilio WhatsApp requires "whatsapp:" prefix
        wa_to = f"whatsapp:{to_number}" if not to_number.startswith("whatsapp:") else to_number
        wa_from = self.whatsapp_number

        try:
            if image_url:
                # Send message WITH accident image
                msg = self.client.messages.create(
                    to=wa_to,
                    from_=wa_from,
                    body=message,
                    media_url=[image_url],
                    # media_url = list of image URLs to attach
                    # Twilio fetches the image and sends via WhatsApp
                    # URL must be publicly accessible!
                    # Person 2's server hosts the accident screenshots
                )
            else:
                # Send text-only message
                msg = self.client.messages.create(
                    to=wa_to,
                    from_=wa_from,
                    body=message,
                )

            logger.info(f"💬 WhatsApp sent | to={to_number} | SID={msg.sid}")

            return ContactResult(
                contact_name=contact_name,
                phone_number=to_number,
                contact_type=contact_type,
                method="whatsapp",
                success=True,
                message_sid=msg.sid,
            )

        except Exception as e:
            logger.error(f"WhatsApp failed to {to_number}: {e}")
            return ContactResult(
                contact_name=contact_name,
                phone_number=to_number,
                contact_type=contact_type,
                method="whatsapp",
                success=False,
                error=str(e)
            )

    # ═══════════════════════════════════════════════════
    # BULK MESSAGING (for nearby stores/people)
    # ═══════════════════════════════════════════════════

    def notify_nearby_places(
        self,
        places: List[NearbyPlace],
        message: str,
        image_url: Optional[str] = None,
        max_contacts: int = 5,
    ) -> List[ContactResult]:
        """
        Sends SMS/WhatsApp to multiple nearby places.

        Used for:
        → Nearby stores (someone there can help)
        → Nearby pharmacies (first aid supplies)
        → Nearby fuel stations (people always there)

        max_contacts: Don't spam too many people
        """
        results = []

        # Only contact places that have phone numbers
        contactable = [p for p in places if p.phone]
        # List comprehension with condition: keep only places with phone

        to_contact = contactable[:max_contacts]
        # Limit to max_contacts

        if not to_contact:
            logger.warning("No contactable nearby places found")
            return results

        for place in to_contact:
            logger.info(f"Notifying: {place.name} | {place.phone} | {place.distance_km}km")

            # Try WhatsApp first (free + can send image)
            if image_url and self.whatsapp_number:
                result = self.send_whatsapp(
                    to_number=place.phone,
                    contact_name=place.name,
                    contact_type=place.place_type,
                    message=message,
                    image_url=image_url,
                )
            else:
                # Fall back to SMS
                result = self.send_sms(
                    to_number=place.phone,
                    contact_name=place.name,
                    contact_type=place.place_type,
                    message=message,
                )

            results.append(result)

            # Small delay between messages
            time.sleep(0.5)
            # 500ms between messages
            # Prevents Twilio rate limiting
            # Twilio free tier: 1 message/second
            # Paid tier: much higher

        return results