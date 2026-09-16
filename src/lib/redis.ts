import IORedis from "ioredis";

// BullMQ uses its own Redis. In production, set REDIS_URL to a dedicated
// instance so push queue traffic doesn't compete with Centrifugo pub/sub.
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

const globalForRedis = globalThis as unknown as {
  redis: IORedis | undefined;
};

function createConnection(): IORedis {
  const conn = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: false,
    // Fail fast while disconnected instead of buffering commands forever: the
    // push outbox keeps the notification durable, and the worker's sweep
    // re-dispatches it once Redis is back.
    enableOfflineQueue: false,
    connectTimeout: 5_000,
    retryStrategy(times) {
      return Math.min(times * 200, 5000);
    },
  });
  conn.on("error", (err) => {
    console.error("[redis] connection error:", err.message);
  });
  return conn;
}

export function getRedis(): IORedis {
  if (!globalForRedis.redis) {
    globalForRedis.redis = createConnection();
  }
  return globalForRedis.redis;
}
