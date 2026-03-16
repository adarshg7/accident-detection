# ============================================================
# mappls_service.py — Find Nearby Places Using Mappls API
#
# WHY MAPPLS OVER GOOGLE MAPS?
# → Mappls (MapMyIndia) is India's own mapping service
# → Better coverage of Indian roads, lanes, small towns
# → Has contact details for Indian businesses
# → Free tier is generous (1000 req/day)
# → Google Maps API is expensive ($7 per 1000 requests)
#
# WHAT MAPPLS GIVES US:
# → Nearby hospitals with phone numbers
# → Nearby police stations with phone numbers
# → Nearby shops/stores with phone numbers
# → Exact coordinates of each place
# → Distance from accident location
# ============================================================

import requests
import time
from dataclasses import dataclass, field
from typing import List, Optional, Dict
from logger import logger
from config import settings


@dataclass
class NearbyPlace:
    """
    Represents a place found near the accident.
    Could be hospital, police station, shop, etc.
    """
    place_id: str           # Mappls unique ID for this place
    name: str               # "City Hospital", "MG Road Police Station"
    place_type: str         # "hospital", "police", "store", "pharmacy"
    phone: Optional[str]    # Phone number if available
    latitude: float
    longitude: float
    distance_meters: float  # How far from accident
    address: str            # Full address string

    @property
    def distance_km(self) -> float:
        """Distance in km (easier to read than meters)"""
        return round(self.distance_meters / 1000, 2)
        # round(value, 2) = keep 2 decimal places
        # 1523.4 meters → 1.52 km

    @property
    def google_maps_link(self) -> str:
        """
        Google Maps navigation link to THIS place.
        When someone gets the SMS, they tap this to navigate here.
        """
        return f"https://maps.google.com/?q={self.latitude},{self.longitude}"

    @property
    def maps_directions_link(self) -> str:
        """
        Google Maps DIRECTIONS from accident to this place.
        Even better — shows route, not just location.
        """
        accident_lat = getattr(settings, 'camera_latitude', 0)
        accident_lon = getattr(settings, 'camera_longitude', 0)
        return (
            f"https://maps.google.com/maps?saddr="
            f"{accident_lat},{accident_lon}"
            f"&daddr={self.latitude},{self.longitude}"
        )
        # saddr = source address (accident location)
        # daddr = destination address (hospital/police)
        # Opens Google Maps with route already planned

    def __str__(self) -> str:
        phone_str = self.phone if self.phone else "no phone"
        return f"{self.name} | {self.distance_km}km | {phone_str}"


class MapplsTokenManager:
    """
    Manages Mappls API access token.

    Mappls uses OAuth2 authentication:
    1. Send Client ID + Secret → Get access token
    2. Use token in all API requests
    3. Token expires after 6 hours → refresh automatically

    Why separate class?
    → Token refreshing logic is complex
    → Keeping it separate makes MapplsService cleaner
    → Single responsibility principle
    """

    TOKEN_URL = "https://outpost.mappls.com/api/security/oauth/token"
    # OAuth2 token endpoint for Mappls

    def __init__(self):
        self._token: Optional[str] = None
        self._token_expiry: float = 0.0
        # Unix timestamp when token expires
        # 0.0 = never got a token yet

    def get_token(self) -> Optional[str]:
        """
        Returns valid access token.
        Auto-refreshes if expired.
        """
        now = time.time()

        if self._token and now < self._token_expiry - 60:
            # Token still valid (with 60 second buffer before expiry)
            # - 60 = refresh slightly early to avoid edge case expiry mid-request
            return self._token

        # Token expired or never obtained → get new one
        return self._refresh_token()

    def _refresh_token(self) -> Optional[str]:
        """
        Gets a new OAuth2 token from Mappls.

        OAuth2 client credentials flow:
        POST /token with client_id + client_secret
        → returns access_token + expires_in (seconds)
        """
        try:
            response = requests.post(
                self.TOKEN_URL,
                data={
                    "grant_type": "client_credentials",
                    # grant_type = which OAuth2 flow we're using
                    # "client_credentials" = server-to-server (no user login)
                    # This is correct for API-to-API authentication

                    "client_id": settings.mappls_client_id,
                    "client_secret": settings.mappls_client_secret,
                },
                timeout=10,
            )
            response.raise_for_status()
            # raise_for_status() → raises exception if HTTP 4xx or 5xx

            data = response.json()
            # Parse JSON response body → Python dict

            self._token = data["access_token"]
            # The actual token string — looks like: "eyJhbGc..."

            expires_in = int(data.get("expires_in", 21600))
            # expires_in = seconds until token expires
            # Default: 21600 seconds = 6 hours

            self._token_expiry = time.time() + expires_in
            # Store when token will expire
            # time.time() = current unix timestamp (seconds since 1970)
            # + expires_in = future timestamp when it expires

            logger.info("Mappls token refreshed successfully")
            return self._token

        except requests.RequestException as e:
            logger.error(f"Mappls token refresh failed: {e}")
            return None

        except KeyError as e:
            logger.error(f"Unexpected token response format: {e}")
            return None


class MapplsService:
    """
    Finds nearby emergency services and places using Mappls API.

    API ENDPOINTS USED:
    1. Nearby Search API → find places by category near coordinates
    2. Place Details API → get phone number for a specific place

    Mappls categories relevant to us:
    "HOSP" = Hospitals
    "POLS" = Police Stations
    "FIRE" = Fire Stations
    "PHRM" = Pharmacies
    "PEST" = Petrol/fuel stations (people often around)
    """

    # Mappls category codes for emergency services
    # Full list at: https://apis.mappls.com/console/
    CATEGORY_CODES = {
        "hospital":       "HOSP",
        "police":         "POLS",
        "fire_station":   "FIRE",
        "pharmacy":       "PHRM",
        "fuel_station":   "PEST",
        # Fuel stations have 24/7 staff = good for emergency
        "atm":            "ATMC",
        # ATMs are always near busy areas = people nearby
    }

    NEARBY_API = "https://atlas.mappls.com/api/places/nearby/json"
    DETAILS_API = "https://atlas.mappls.com/api/places/detail"
    # These are Mappls REST API endpoints

    def __init__(self):
        self.token_manager = MapplsTokenManager()
        # Handles OAuth2 token for us
        self._cache: Dict[str, List[NearbyPlace]] = {}
        # Cache results to avoid repeated API calls
        # Key: "lat_lon_type", Value: list of NearbyPlace
        self._cache_time: Dict[str, float] = {}
        # When each cache entry was created
        self._cache_ttl = 300
        # Cache valid for 5 minutes
        # Accident location doesn't change — no need to re-query

    def _get_headers(self) -> Optional[Dict]:
        """Build auth headers for Mappls API requests."""
        token = self.token_manager.get_token()
        if not token:
            return None

        return {
            "Authorization": f"Bearer {token}",
            # Bearer token auth: "Bearer " + the token string
            # Server validates this token on every request

            "Content-Type": "application/json",
        }

    def find_nearby(
        self,
        latitude: float,
        longitude: float,
        place_type: str,
        radius: int = None,
        limit: int = 5,
    ) -> List[NearbyPlace]:
        """
        Find places of given type near given coordinates.

        Args:
            latitude, longitude: Center point (accident location)
            place_type: "hospital", "police", "pharmacy", etc.
            radius: Search radius in meters (default from .env)
            limit: Max number of results

        Returns: List of NearbyPlace sorted by distance
        """
        if radius is None:
            radius = int(getattr(settings, 'mappls_search_radius', 3000))

        category = self.CATEGORY_CODES.get(place_type)
        if not category:
            logger.warning(f"Unknown place type: {place_type}")
            return []

        # Check cache first
        cache_key = f"{latitude:.4f}_{longitude:.4f}_{place_type}"
        # f-string with :.4f → 4 decimal places: 19.0760 (not 19.07600000001)
        # This makes the cache key consistent for same location

        if self._is_cache_valid(cache_key):
            logger.debug(f"Cache hit for {place_type} near {latitude},{longitude}")
            return self._cache[cache_key]

        headers = self._get_headers()
        if not headers:
            logger.error("Cannot get Mappls auth token")
            return []

        try:
            response = requests.get(
                self.NEARBY_API,
                headers=headers,
                params={
                    "keywords": category,
                    # keywords = Mappls category code to search for

                    "refLocation": f"{latitude},{longitude}",
                    # refLocation = center point for search
                    # Format: "lat,lon" as string

                    "radius": radius,
                    # Search radius in meters

                    "richData": "true",
                    # richData=true → include phone numbers, website, hours
                    # richData=false → basic info only (no phone numbers)
                    # We NEED richData for phone numbers

                    "bounds": "",
                    # Optional bounding box — we use radius instead

                    "region": "IND",
                    # Country code for better results
                    # IND = India
                },
                timeout=10,
            )
            response.raise_for_status()
            data = response.json()

            places = self._parse_nearby_response(
                data, place_type, latitude, longitude, limit
            )

            # Cache results
            self._cache[cache_key] = places
            self._cache_time[cache_key] = time.time()

            logger.info(f"Found {len(places)} {place_type}(s) within {radius}m")
            return places

        except requests.RequestException as e:
            logger.error(f"Mappls nearby search failed: {e}")
            return []

        except Exception as e:
            logger.exception(f"Unexpected error in Mappls search: {e}")
            return []

    def _parse_nearby_response(
        self,
        data: dict,
        place_type: str,
        origin_lat: float,
        origin_lon: float,
        limit: int,
    ) -> List[NearbyPlace]:
        """
        Parses Mappls API JSON response into NearbyPlace objects.

        Mappls response structure:
        {
          "suggestedLocations": [
            {
              "placeId": "MMI123",
              "placeName": "City Hospital",
              "latitude": 19.0760,
              "longitude": 72.8777,
              "distance": 850,
              "contactNo": "022-12345678",
              "addressTokens": {...},
              ...
            }
          ]
        }
        """
        suggested = data.get("suggestedLocations", [])
        # .get("key", default) → returns default if key missing
        # Mappls uses "suggestedLocations" as the results array key

        places = []
        for item in suggested[:limit]:
            # [:limit] = only take first N results
            # Mappls returns sorted by distance already

            # Extract phone number
            phone = self._extract_phone(item)

            # Build address from address tokens
            address = self._build_address(item)

            place = NearbyPlace(
                place_id=str(item.get("placeId", "")),
                name=item.get("placeName", "Unknown"),
                place_type=place_type,
                phone=phone,
                latitude=float(item.get("latitude", origin_lat)),
                longitude=float(item.get("longitude", origin_lon)),
                distance_meters=float(item.get("distance", 0)),
                address=address,
            )
            places.append(place)

        return places

    def _extract_phone(self, item: dict) -> Optional[str]:
        """
        Extracts phone number from Mappls place data.
        Tries multiple field names (API isn't always consistent).
        """
        for field_name in ["contactNo", "phone", "tel", "phoneNumber"]:
            # Try each possible field name
            phone = item.get(field_name)
            if phone:
                phone = str(phone).strip()
                if len(phone) >= 6:
                    # At least 6 digits = probably a valid number
                    return self._format_phone_india(phone)
        return None

    def _format_phone_india(self, phone: str) -> str:
        """
        Formats phone number for India.
        Ensures it starts with +91 for Twilio calls.

        Examples:
        "9876543210"    → "+919876543210"
        "09876543210"   → "+919876543210"
        "022-12345678"  → "+9122-12345678" (landline — kept as-is mostly)
        "+919876543210" → "+919876543210"  (already formatted)
        """
        # Remove spaces, dashes, parentheses
        phone = phone.replace(" ", "").replace("-", "").replace("(", "").replace(")", "")

        if phone.startswith("+"):
            return phone
            # Already international format

        if phone.startswith("00"):
            return "+" + phone[2:]
            # "0091..." → "+91..."
            # [2:] = skip first 2 characters

        if phone.startswith("0") and len(phone) == 11:
            return "+91" + phone[1:]
            # "09876543210" → "+919876543210"
            # [1:] = skip the leading 0

        if len(phone) == 10 and phone[0] in "6789":
            return "+91" + phone
            # "9876543210" → "+919876543210"
            # Indian mobile numbers start with 6, 7, 8, or 9

        return "+91" + phone
        # Best guess for other formats

    def _build_address(self, item: dict) -> str:
        """Build human-readable address from Mappls address tokens."""
        tokens = item.get("addressTokens", {})
        # addressTokens = dict with address components:
        # {"houseNumber": "42", "street": "MG Road", "city": "Mumbai", ...}

        parts = []
        for key in ["houseNumber", "street", "subLocality", "locality", "city"]:
            val = tokens.get(key, "")
            if val:
                parts.append(str(val))
        # Build address from components that exist

        return ", ".join(filter(None, parts)) or item.get("placeAddress", "")
        # filter(None, parts) = removes empty strings from list
        # ", ".join() = joins with comma
        # OR fallback to "placeAddress" if we couldn't build from tokens

    def _is_cache_valid(self, cache_key: str) -> bool:
        """Check if cache entry exists and is fresh."""
        if cache_key not in self._cache:
            return False
        age = time.time() - self._cache_time.get(cache_key, 0)
        return age < self._cache_ttl

    def find_all_emergency(
        self,
        latitude: float,
        longitude: float,
    ) -> Dict[str, List[NearbyPlace]]:
        """
        Finds ALL emergency services at once.
        Returns dict: {"hospital": [...], "police": [...], ...}

        Called when accident happens — gets everything in one call.
        """
        results = {}
        types_to_search = ["hospital", "police", "fire_station", "pharmacy"]

        for place_type in types_to_search:
            places = self.find_nearby(latitude, longitude, place_type, limit=3)
            results[place_type] = places
            # 3 of each type = 12 total places maximum

            if places:
                logger.info(f"Nearest {place_type}: {places[0].name} ({places[0].distance_km}km)")

        return results