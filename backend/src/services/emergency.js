// emergency.js — Auto emergency response service
// Called every time a new accident is received
// Handles: Twilio calls, SMS, WhatsApp, nearby search

const twilio = require('twilio');
const axios  = require('axios');

// ══════════════════════════════════════════════════════
// TWILIO SERVICE
// ══════════════════════════════════════════════════════
class TwilioService {
  constructor() {
    this.enabled = !!(
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN  &&
      process.env.TWILIO_PHONE_NUMBER
    );

    if (this.enabled) {
      this.client = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
      this.from = process.env.TWILIO_PHONE_NUMBER;
      console.log('[Twilio] Ready');
    } else {
      console.log('[Twilio] Not configured — calls/SMS disabled');
    }
  }

  async makeCall(to, message) {
    if (!this.enabled) {
      console.log(`[Twilio] MOCK CALL to ${to}: ${message.slice(0, 60)}...`);
      return { success: true, mock: true };
    }

    try {
      const twiml = `
        <Response>
          <Say voice="Polly.Aditi" language="en-IN">
            ${message}
          </Say>
          <Pause length="1"/>
          <Say voice="Polly.Aditi" language="en-IN">
            ${message}
          </Say>
        </Response>
      `;
      // TwiML = Twilio Markup Language
      // <Say> = text to speech
      // <Pause> = silence between repetitions
      // Polly.Aditi = Indian English voice

      const call = await this.client.calls.create({
        to,
        from:    this.from,
        twiml,
        timeout: 30,
        // Ring for 30 seconds before giving up
      });

      console.log(`[Twilio] Call initiated to ${to} | SID: ${call.sid}`);
      return { success: true, sid: call.sid };

    } catch (err) {
      console.error(`[Twilio] Call failed to ${to}:`, err.message);
      return { success: false, error: err.message };
    }
  }

  async sendSMS(to, message) {
    if (!this.enabled) {
      console.log(`[Twilio] MOCK SMS to ${to}:\n${message}`);
      return { success: true, mock: true };
    }

    try {
      const msg = await this.client.messages.create({
        to,
        from: this.from,
        body: message,
      });

      console.log(`[Twilio] SMS sent to ${to} | SID: ${msg.sid}`);
      return { success: true, sid: msg.sid };

    } catch (err) {
      console.error(`[Twilio] SMS failed to ${to}:`, err.message);
      return { success: false, error: err.message };
    }
  }

  async sendWhatsApp(to, message, imageUrl = null) {
    if (!this.enabled) {
      console.log(`[Twilio] MOCK WHATSAPP to ${to}`);
      return { success: true, mock: true };
    }

    try {
      const params = {
        to:   `whatsapp:${to}`,
        from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
        body: message,
      };

      if (imageUrl) {
        params.mediaUrl = [imageUrl];
        // Attach accident screenshot to message
      }

      const msg = await this.client.messages.create(params);
      console.log(`[Twilio] WhatsApp sent to ${to} | SID: ${msg.sid}`);
      return { success: true, sid: msg.sid };

    } catch (err) {
      console.error(`[Twilio] WhatsApp failed to ${to}:`, err.message);
      return { success: false, error: err.message };
    }
  }
}

// ══════════════════════════════════════════════════════
// NEARBY SEARCH SERVICE
// Tries Mappls first → falls back to OpenStreetMap (free)
// ══════════════════════════════════════════════════════
class NearbySearchService {
  constructor() {
    this.mapplsToken = process.env.MAPPLS_API_TOKEN;
    this.mapplsEnabled = !!this.mapplsToken;

    if (this.mapplsEnabled) {
      console.log('[Mappls] Ready with API token');
    } else {
      console.log('[Mappls] No token — using OpenStreetMap (free)');
    }
  }

  async findNearby(lat, lon, category, radius = 3000) {
    // Try Mappls first, fall back to OpenStreetMap
    if (this.mapplsEnabled) {
      try {
        return await this._mapplsSearch(lat, lon, category, radius);
      } catch (err) {
        console.log(`[Mappls] Failed (${err.message}), using OSM fallback`);
        return await this._osmSearch(lat, lon, category, radius);
      }
    }
    return await this._osmSearch(lat, lon, category, radius);
  }

  async _mapplsSearch(lat, lon, category, radius) {
    // Mappls Nearby API using single static token
    const categoryMap = {
      hospital:     'HOSP',
      police:       'POLS',
      pharmacy:     'PHRM',
      fire_station: 'FIRE',
    };

    const keyword = categoryMap[category] || category;

    const r = await axios.get(
      `https://search.mappls.com/search/places/nearby/json`,
      {
        params: {
          keywords:    keyword,
          refLocation: `${lat},${lon}`,
          radius:      radius,
          access_token: this.mapplsToken,
        },
        timeout: 10000,
      }
    );

    const places = (r.data?.suggestedLocations || [])
      .slice(0, 3)
      .map(p => ({
        name:     p.placeName || 'Unknown',
        phone:    this._formatPhone(p.mobileNo || p.landlineNo || p.contactNo || p.phone || ''),
        distance: p.distance || 0,
        lat:      parseFloat(p.latitude || 0), // Note: New API often only returns eLoc, not lat/lon
        lon:      parseFloat(p.longitude || 0),
        eLoc:     p.eLoc,
      }))
      .filter(p => p.phone);
      // Only keep places that have phone numbers

    console.log(`[Mappls] Found ${places.length} ${category}(s) nearby`);
    return places;
  }

  async _osmSearch(lat, lon, category, radius) {
    // OpenStreetMap Overpass API
    // Completely FREE — no credentials needed
    const tagMap = {
      hospital:     'amenity=hospital',
      police:       'amenity=police',
      pharmacy:     'amenity=pharmacy',
      fire_station: 'amenity=fire_station',
    };

    const tag = tagMap[category];
    if (!tag) return [];

    // Overpass QL query
    const query = `
      [out:json][timeout:10];
      (
        node[${tag}](around:${radius},${lat},${lon});
        way[${tag}](around:${radius},${lat},${lon});
      );
      out center;
    `;
    // [out:json] = return JSON format
    // around:radius,lat,lon = within radius meters of point
    // node = point on map, way = polygon/building
    // out center = for polygons, return center coordinates

    try {
      const r = await axios.post(
        'https://overpass-api.de/api/interpreter',
        `data=${encodeURIComponent(query)}`,
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 15000,
        }
      );

      const elements = r.data?.elements || [];
      console.log(`[OSM] Found ${elements.length} ${category}(s) nearby`);

      return elements
        .slice(0, 3)
        .map(e => {
          const elat = e.lat || e.center?.lat;
          const elon = e.lon || e.center?.lon;
          return {
            name:     e.tags?.name || e.tags?.['name:en'] || category,
            phone:    this._formatPhone(
              e.tags?.phone ||
              e.tags?.['contact:phone'] ||
              e.tags?.['contact:mobile'] || ''
            ),
            distance: this._calcDistance(lat, lon, elat, elon),
            lat:      elat,
            lon:      elon,
          };
        })
        .filter(p => p.phone);
        // Only keep places with phone numbers

    } catch (err) {
      console.error('[OSM] Search failed:', err.message);
      return [];
    }
  }

  _calcDistance(lat1, lon1, lat2, lon2) {
    // Haversine formula — distance between two GPS points in meters
    if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
    const R    = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a    =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) *
      Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  _formatPhone(phone) {
    // Format phone to international format for Twilio
    if (!phone) return '';
    phone = phone.replace(/[\s\-\(\)\.]/g, '');
    // Remove spaces, dashes, dots, brackets

    if (phone.startsWith('+'))                          return phone;
    if (phone.startsWith('00'))                         return '+' + phone.slice(2);
    if (phone.startsWith('0') && phone.length === 11)   return '+91' + phone.slice(1);
    if (phone.length === 10 && /^[6-9]/.test(phone))    return '+91' + phone;
    // Indian mobile: 10 digits starting with 6-9
    if (phone.length > 4)                               return '+91' + phone;
    return '';
  }
}

// ══════════════════════════════════════════════════════
// CREATE SINGLE INSTANCES
// Reused for every accident — not recreated each time
// ══════════════════════════════════════════════════════
const twilioService  = new TwilioService();
const nearbyService  = new NearbySearchService();

// ══════════════════════════════════════════════════════
// MAIN EMERGENCY RESPONSE
// Called every time a new accident is saved in backend
// ══════════════════════════════════════════════════════
async function triggerEmergencyResponse(accident) {

  const severity     = accident.severity;
  const lat          = accident.location?.coordinates?.[1] || parseFloat(process.env.CAMERA_LATITUDE)  || 19.0760;
  const lon          = accident.location?.coordinates?.[0] || parseFloat(process.env.CAMERA_LONGITUDE) || 72.8777;
  // GeoJSON = [longitude, latitude] → index [1] = lat, [0] = lon

  const mapsLink     = `https://maps.google.com/?q=${lat},${lon}`;
  const screenshotUrl = accident.screenshots?.[0]?.url || '';

  console.log(`\n${'='.repeat(50)}`);
  console.log(`🚨 EMERGENCY RESPONSE | ${accident.accidentId}`);
  console.log(`   Severity : ${severity}`);
  console.log(`   Location : ${lat}, ${lon}`);
  console.log(`   Maps     : ${mapsLink}`);
  console.log(`${'='.repeat(50)}`);

  const results = {
    calls:     [],
    sms:       [],
    whatsapp:  [],
    contacted: 0,
  };

  // ── Build messages ─────────────────────────────────
  const callMessage = buildCallMessage(accident, lat, lon);
  const smsMessage  = buildSMSMessage(accident, mapsLink, screenshotUrl);

  // ══════════════════════════════════════════════════
  // STEP 1: Call Police (100)
  // ══════════════════════════════════════════════════
  console.log('\n[Step 1] Calling Police...');

  const policeResult = await twilioService.makeCall(
    process.env.POLICE_NUMBER || '+91100',
    callMessage
  );
  results.calls.push({
    to:      process.env.POLICE_NUMBER || '100',
    name:    'Police Emergency',
    success: policeResult.success,
  });
  if (policeResult.success) results.contacted++;
  console.log(`  Police (100): ${policeResult.success ? '✓' : '✗'}`);

  // Send SMS to police number too
  const policeSMS = await twilioService.sendSMS(
    process.env.TEST_PHONE_NUMBER || process.env.POLICE_NUMBER || '+91100',
    smsMessage
  );
  results.sms.push({
    to:      process.env.TEST_PHONE_NUMBER || '100',
    name:    'Police SMS',
    success: policeSMS.success,
  });
  if (policeSMS.success) results.contacted++;
  console.log(`  Police SMS: ${policeSMS.success ? '✓' : '✗'}`);

  // ══════════════════════════════════════════════════
  // STEP 2: Call Ambulance (108)
  // ══════════════════════════════════════════════════
  console.log('[Step 2] Calling Ambulance...');

  const ambulanceResult = await twilioService.makeCall(
    process.env.AMBULANCE_NUMBER || '+91108',
    callMessage
  );
  results.calls.push({
    to:      process.env.AMBULANCE_NUMBER || '108',
    name:    'Ambulance Emergency',
    success: ambulanceResult.success,
  });
  if (ambulanceResult.success) results.contacted++;
  console.log(`  Ambulance (108): ${ambulanceResult.success ? '✓' : '✗'}`);

  // Send SMS to ambulance number too
  const ambulanceSMS = await twilioService.sendSMS(
    process.env.TEST_PHONE_NUMBER || process.env.AMBULANCE_NUMBER || '+91108',
    smsMessage
  );
  results.sms.push({
    to:      process.env.TEST_PHONE_NUMBER || '108',
    name:    'Ambulance SMS',
    success: ambulanceSMS.success,
  });
  if (ambulanceSMS.success) results.contacted++;
  console.log(`  Ambulance SMS: ${ambulanceSMS.success ? '✓' : '✗'}`);

  // ══════════════════════════════════════════════════
  // STEP 3: Find + Contact Nearby Services
  // Only for HIGH and CRITICAL accidents
  // ══════════════════════════════════════════════════
 if (severity === 'HIGH' || severity === 'CRITICAL') {
  console.log('[Step 3] Finding nearby emergency services...');

  // ADD DELAY before OSM search to avoid rate limiting
  await new Promise(resolve => setTimeout(resolve, 1000));
  // Wait 1 second before searching
  // Prevents 429 Too Many Requests from OSM

  const hospitals = await nearbyService.findNearby(lat, lon, 'hospital');

  // Small delay between searches
  await new Promise(resolve => setTimeout(resolve, 500));

  const policeStations = await nearbyService.findNearby(lat, lon, 'police');
    // Contact nearest hospital
    if (hospitals.length > 0) {
      const hospital = hospitals[0];
      console.log(`  Nearest hospital: ${hospital.name} (${hospital.distance}m) | ${hospital.phone}`);

      // Call the hospital
      const callR = await twilioService.makeCall(hospital.phone, callMessage);
      results.calls.push({ to: hospital.phone, name: hospital.name, success: callR.success });
      if (callR.success) results.contacted++;
      console.log(`  Hospital call: ${callR.success ? '✓' : '✗'}`);

      // SMS to hospital
      const smsR = await twilioService.sendSMS(hospital.phone, smsMessage);
      results.sms.push({ to: hospital.phone, name: hospital.name, success: smsR.success });
      if (smsR.success) results.contacted++;
      console.log(`  Hospital SMS: ${smsR.success ? '✓' : '✗'}`);
    } else {
      console.log('  No nearby hospitals with phone found');
    }

    // Contact nearest police station
    if (policeStations.length > 0) {
      const station = policeStations[0];
      console.log(`  Nearest police: ${station.name} (${station.distance}m) | ${station.phone}`);

      // Call the station
      const callR = await twilioService.makeCall(station.phone, callMessage);
      results.calls.push({ to: station.phone, name: station.name, success: callR.success });
      if (callR.success) results.contacted++;
      console.log(`  Police station call: ${callR.success ? '✓' : '✗'}`);

      // SMS to police station
      const smsR = await twilioService.sendSMS(station.phone, smsMessage);
      results.sms.push({ to: station.phone, name: station.name, success: smsR.success });
      if (smsR.success) results.contacted++;
      console.log(`  Police station SMS: ${smsR.success ? '✓' : '✗'}`);
    } else {
      console.log('  No nearby police stations with phone found');
    }

    // NOTE: We do NOT contact random public/stores (production decision)
    // Only official emergency services are contacted
  }

  // ══════════════════════════════════════════════════
  // FINAL SUMMARY
  // ══════════════════════════════════════════════════
  console.log(`\n✅ Emergency response complete`);
  console.log(`   Calls made    : ${results.calls.length}`);
  console.log(`   SMS sent      : ${results.sms.length}`);
  console.log(`   WhatsApp sent : ${results.whatsapp.length}`);
  console.log(`   Total reached : ${results.contacted}`);
  console.log(`${'='.repeat(50)}\n`);

  return results;
}

// ══════════════════════════════════════════════════════
// MESSAGE BUILDERS
// ══════════════════════════════════════════════════════
function buildCallMessage(accident, lat, lon) {
  // Spoken aloud by Twilio TTS
  // Keep clear, short, important info first
  return (
    `Emergency alert. Road accident detected. ` +
    `Severity ${accident.severity}. ` +
    `${accident.description}. ` +
    `Location: latitude ${lat.toFixed(4)}, longitude ${lon.toFixed(4)}. ` +
    `Immediate response required. ` +
    `This is an automated alert from Sentinel Accident Detection System.`
  );
}

function buildSMSMessage(accident, mapsLink, screenshotUrl) {
  let msg =
    `🚨 ACCIDENT ALERT - Sentinel System\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `Severity : ${accident.severity}\n` +
    `Details  : ${accident.description}\n` +
    `Time     : ${new Date().toLocaleTimeString('en-IN')}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📍 LOCATION:\n` +
    `${mapsLink}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `Tap location link to navigate to accident site.\n` +
    `Call 100 (Police) or 108 (Ambulance) for help.`;

  if (screenshotUrl) {
    msg += `\n📸 Photo: ${screenshotUrl}`;
  }

  return msg;
}

module.exports = { triggerEmergencyResponse };