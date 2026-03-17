require('dotenv').config();
const axios = require('axios');

async function searchMappls(query) {
  const token = process.env.MAPPLS_API_TOKEN;
  
  if (!token) {
    console.error('❌ Missing MAPPLS_API_TOKEN in .env file');
    return;
  }

  console.log(`🔎 Searching Mappls for: "${query}"...\n`);

  try {
    // Mappls AutoSuggest API endpoint
    const response = await axios.get(
      `https://search.mappls.com/search/places/autosuggest/json`, 
      {
        params: {
          query: query,
          access_token: token,
          location: '28.627133913995547,77.23553525204144' // optional params from curl
        }
      }
    );

    const places = response.data.suggestedLocations || [];
    
    if (places.length === 0) {
      console.log('No results found.');
      return;
    }

    console.log(`✅ Found ${places.length} results:\n`);
    places.forEach((p, index) => {
      console.log(`${index + 1}. ${p.placeName}`);
      console.log(`   Address: ${p.placeAddress}`);
      console.log(`   Location: ${p.latitude}, ${p.longitude}\n`);
    });

  } catch (error) {
    console.error('❌ Mappls Search FAILED');
    console.error('Status:', error.response?.status);
    console.error('Message:', error.response?.data?.error_description || error.response?.data?.message || error.message);
  }
}

// Read the search query from command line arguments, or use a default
const args = process.argv.slice(2);
const searchQuery = args.length > 0 ? args.join(' ') : 'India Gate';

searchMappls(searchQuery);
