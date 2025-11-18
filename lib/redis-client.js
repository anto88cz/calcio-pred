const Redis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const DEFAULT_TTL = 7 * 24 * 3600; // 7 days

const redis = new Redis(REDIS_URL);

redis.on('connect', () => {
  console.log('Redis client connected');
});
redis.on('error', (err) => {
  console.error('Redis client error', err);
});

async function cacheSet(key, value, ttlSeconds = DEFAULT_TTL) {
  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  } catch (err) {
    console.error('cacheSet error', err, key);
  }
}

async function cacheGet(key) {
  try {
    const v = await redis.get(key);
    return v ? JSON.parse(v) : null;
  } catch (err) {
    console.error('cacheGet error', err, key);
    return null;
  }
}

module.exports = {
  redis,
  cacheSet,
  cacheGet,
};
