// test_mappls.js
// node test_mappls.js
require('dotenv').config();

const axios = require('axios');

console.log('Testing Mappls credentials...');
console.log('Client ID:    ', process.env.MAPPLS_CLIENT_ID?.slice(0,8) + '...');
console.log('Client Secret:', process.env.MAPPLS_CLIENT_SECRET?.slice(0,6) + '...');

async function test() {
  try {
    // Step 1: Get token
    const tokenRes = await axios.post(
      'https://outpost.mappls.com/api/security/oauth/token',
      new URLSearchParams({
        grant_type:    'client_credentials',
        client_id:     process.env.MAPPLS_CLIENT_ID,
        client_secret: process.env.MAPPLS_CLIENT_SECRET,
      }),
      { timeout: 10000 }
    );

    const token = tokenRes.data.access_token;
    console.log('\n✅ Mappls token obtained');
    console.log('Token preview:', token.slice(0, 20) + '...');

    // Step 2: Test a nearby search
    const searchRes = await axios.get(
      'https://atlas.mappls.com/api/places/nearby/json',
      {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          keywords:    'HOSP',
          refLocation: '19.0760,72.8777',
          radius:      3000,
          richData:    'true',
        },
        timeout: 10000,
      }
    );

    const places = searchRes.data.suggestedLocations || [];
    console.log(`\n✅ Mappls search working`);
    console.log(`Found ${places.length} hospitals near Mumbai`);
    places.slice(0, 3).forEach(p => {
      console.log(`  → ${p.placeName} | ${p.distance}m | ${p.contactNo || 'no phone'}`);
    });

  } catch (err) {
    console.log('\n❌ Mappls FAILED');
    console.log('Status:', err.response?.status);
    console.log('Error: ', err.response?.data || err.message);
    console.log('\nFix:');
    console.log('1. Go to: https://apis.mappls.com');
    console.log('2. Login → Dashboard → My Projects');
    console.log('3. Copy Client ID and Client Secret');
    console.log('4. Paste in backend/.env');
  }
}

test();