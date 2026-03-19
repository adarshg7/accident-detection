// redis.js — Redis connection
//
// WHY REDIS?
// Redis = in-memory key-value store
// Used for:
// 1. Caching (store frequent queries, avoid hitting MongoDB every time)
// 2. Rate limiting (count requests per IP per minute)
// 3. Session storage (store JWT blacklist for logout)
// 4. Real-time counters (active users, live accident count)
//
// Speed comparison:
// MongoDB query: 5-50ms
// Redis lookup:  0.1-1ms (50x faster)

const redis = require('redis');

let client;

const connectRedis = async () => {
  client = redis.createClient({
    url: process.env.REDIS_URL,
    socket: {
      reconnectStrategy: (retries) => {
        // Exponential backoff: wait longer between each retry
        // retry 1: 100ms, retry 2: 200ms, retry 3: 400ms...
        return Math.min(retries * 100, 3000);
        // Cap at 3000ms (3 seconds max wait)
      }
    }
  });

  client.on('error', (err) => {
    console.error(`[Redis] Error: ${err}`);
  });

  client.on('connect', () => {
    console.log('[Redis] Connected');
  });

  await client.connect();
};

// Helper functions (cleaner than calling client directly)

const setCache = async (key, value, ttlSeconds = 300) => {
  if (!client || !client.isReady) return;
  try {
    await client.setEx(key, ttlSeconds, JSON.stringify(value));
  } catch (err) { console.warn('[Redis] Cache write failed'); }
};

const getCache = async (key) => {
  if (!client || !client.isReady) return null;
  try {
    const data = await client.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) { return null; }
};

const deleteCache = async (key) => {
  if (!client || !client.isReady) return;
  try {
    await client.del(key);
  } catch (err) { console.warn('[Redis] Cache delete failed'); }
};

const getClient = () => client;

module.exports = { connectRedis, setCache, getCache, deleteCache, getClient };