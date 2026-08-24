import IORedis from "ioredis";

const REDIS_URL =
  process.env.REDIS_URL || process.env.CENTRIFUGO_REDIS_URL || "redis://localhost:6379";

const globalForRedis = globalThis as unknown as {
  redis: IORedis | undefined;
};

function createConnection(): IORedis {
  const conn = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: false,
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
