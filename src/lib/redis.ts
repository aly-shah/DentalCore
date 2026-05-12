/**
 * Lazy Redis client + sliding-window rate limiter.
 *
 * If REDIS_URL is unset (e.g. local dev without a Redis instance), the
 * limiter falls back to an in-memory Map and the rest of the app continues
 * to work. Production MUST set REDIS_URL so limits work across multiple
 * app instances / process restarts.
 */
import { Redis } from "ioredis";
import { logger } from "./logger";

let client: Redis | null = null;
let attempted = false;

function getRedis(): Redis | null {
  if (attempted) return client;
  attempted = true;

  const url = process.env.REDIS_URL;
  if (!url) {
    logger.warn("REDIS_URL not set; rate limiting + cache fall back to in-memory");
    return null;
  }

  try {
    client = new Redis(url, {
      // Don't keep retrying forever — if Redis is gone, degrade gracefully.
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      lazyConnect: false,
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 100, 2000)),
    });
    client.on("error", (err) => {
      logger.warn("Redis error", { message: err.message });
    });
    client.on("connect", () => logger.info("Redis connected"));
    return client;
  } catch (err) {
    logger.warn("Redis init failed; degrading to in-memory", {
      message: err instanceof Error ? err.message : String(err),
    });
    client = null;
    return null;
  }
}

/* ---------------- In-memory fallback ----------------- */

type Bucket = { count: number; expiresAt: number };
const memBuckets = new Map<string, Bucket>();

function memCheck(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const b = memBuckets.get(key);
  if (!b || b.expiresAt <= now) {
    memBuckets.set(key, { count: 1, expiresAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetMs: windowMs, source: "memory" };
  }
  b.count++;
  if (b.count > limit) {
    return { allowed: false, remaining: 0, resetMs: b.expiresAt - now, source: "memory" };
  }
  return { allowed: true, remaining: limit - b.count, resetMs: b.expiresAt - now, source: "memory" };
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
  source: "redis" | "memory";
}

/**
 * Token-bucket-ish sliding window. Each `(key)` has at most `limit` requests
 * per `windowMs`. The Redis implementation uses INCR + EXPIRE on first hit:
 * cheap, atomic, no Lua needed. Resolution is "per window," not true sliding,
 * but that's fine for auth rate-limiting where the threat is brute-force.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const redis = getRedis();
  if (!redis) return memCheck(key, limit, windowMs);

  try {
    const redisKey = `rl:${key}`;
    // INCR + EXPIRE; EXPIRE only on first hit
    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.pexpire(redisKey, windowMs);
    }
    const pttl = await redis.pttl(redisKey);
    const resetMs = pttl > 0 ? pttl : windowMs;
    if (count > limit) {
      return { allowed: false, remaining: 0, resetMs, source: "redis" };
    }
    return { allowed: true, remaining: Math.max(0, limit - count), resetMs, source: "redis" };
  } catch (err) {
    logger.warn("Redis rateLimit failed; falling back to memory", {
      message: err instanceof Error ? err.message : String(err),
      key,
    });
    return memCheck(key, limit, windowMs);
  }
}

/**
 * Reset a key's rate-limit counter (e.g. on successful login).
 */
export async function resetRateLimit(key: string): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    memBuckets.delete(key);
    return;
  }
  try {
    await redis.del(`rl:${key}`);
  } catch (err) {
    logger.warn("Redis resetRateLimit failed", {
      message: err instanceof Error ? err.message : String(err),
      key,
    });
    memBuckets.delete(key);
  }
}
