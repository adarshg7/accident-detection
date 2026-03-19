require('dotenv').config();
const axios = require('axios');

async function testNearbySearch() {
  const token = process.env.MAPPLS_API_TOKEN;
  
  if (!token) {
    console.error('❌ Missing MAPPLS_API_TOKEN in .env file');
    return;
  }

  // You can change keywords to anything like 'HOSP' (Hospitals), 'POLICE', 'FODCOF', etc.
  const keywords = process.argv[2] || 'coffee'; 
  const refLocation = '28.631460,77.217423'; // New Delhi coordinates from example

  console.log(`Searching Mappls Nearby for: "${keywords}" near ${refLocation}...\n`);

  try {
    const response = await axios.get(
      `https://search.mappls.com/search/places/nearby/json`, 
      {
        params: {
          keywords: keywords,
          refLocation: refLocation,
          radius: 3000, // 3km radius
          access_token: token
        }
      }
    );

    const places = response.data.suggestedLocations || [];
    
    if (places.length === 0) {
      console.log('No results found.');
      return;
    }

    console.log(`✅ Found ${places.length} results:\n`);
    places.slice(0, 5).forEach((p, index) => {
      console.log(`${index + 1}. ${p.placeName}`);
      console.log(`   Address: ${p.placeAddress}`);
      console.log(`   Distance: ${p.distance}m`);
      console.log(`   eLoc: ${p.eLoc}`);
      console.log(`   Contact: ${p.landlineNo || p.mobileNo || 'None'}\n`);
    });

  } catch (error) {
    console.error('❌ Mappls Nearby Search FAILED');
    console.error('Status:', error.response?.status);
    console.error('Message:', error.response?.data?.message || error.message);
  }
}

testNearbySearch();
