// useMapplsMap.js — Loads Mappls SDK dynamically
// Token comes from .env — never hardcoded

const loadMapplsSDK = () => {
  return new Promise((resolve, reject) => {

    // Check if already loaded
    if (window.mappls) {
      resolve(window.mappls);
      return;
    }

    const token = process.env.REACT_APP_MAPPLS_TOKEN;
    // process.env.REACT_APP_* = reads from .env file
    // REACT_APP_ prefix required for React to expose env vars
    // Without prefix: React hides the variable for security

    if (!token) {
      reject(new Error('REACT_APP_MAPPLS_TOKEN not set in .env'));
      return;
    }

    // Set callback BEFORE loading script
    window.mapplsLoaded = () => resolve(window.mappls);

    // Create script tag dynamically
    const script = document.createElement('script');
    script.src = `https://apis.mappls.com/advancedmaps/api/${token}/map_sdk?layer=vector&v=3.0&callback=mapplsLoaded&libraries=traffic`;
    // Token injected from .env — not hardcoded
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error('Mappls SDK failed to load'));

    document.head.appendChild(script);
    // Adds script to page dynamically
    // Equivalent to <script src="..."> in HTML
    // But token comes from env var — safe to push to GitHub
  });
};

export default loadMapplsSDK;