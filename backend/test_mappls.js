// test_mappls.js
// node test_mappls.js
require('dotenv').config();

const axios = require('axios');

console.log('Testing Mappls Static API Token...');

async function test() {
  try {
    const token = process.env.MAPPLS_API_TOKEN;
    if (!token) {
      console.log('❌ MAPPLS_API_TOKEN is missing from your .env file');
      return;
    }

    console.log('Token preview:', token.slice(0, 8) + '...');

    // Test a nearby search
    const searchRes = await axios.get(
      `https://search.mappls.com/search/places/nearby/json`,
      {
        params: {
          keywords:    'coffee',
          refLocation: '28.631460,77.217423', // Using example coordinates for testing
          radius:      3000,
          access_token: token,
        },
        timeout: 10000,
      }
    );

    const places = searchRes.data.suggestedLocations || [];
    console.log(`\n✅ Mappls search completely working!`);
    console.log(`Found ${places.length} places...`);
    places.slice(0, 3).forEach(p => {
      console.log(`  → ${p.placeName} | ${p.distance}m | ${p.mobileNo || p.landlineNo || p.contactNo || 'no phone'}`);
    });

  } catch (err) {
    console.log('\n❌ Mappls Search FAILED');
    console.log('Status:', err.response?.status);
    console.log('Error: ', err.response?.data?.message || err.message);
    console.log('\nFix:');
    console.log('1. Go to your Mappls Dashboard.');
    console.log('2. Ensure your Default Project generates a valid Static Key.');
    console.log('3. Assign it to MAPPLS_API_TOKEN in backend/.env');
  }
}

test();