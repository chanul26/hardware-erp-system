/**
 * Fixed-window rate limiter held in process memory.
 *
 * Scope note: this protects a single application instance. It is the right
 * shape for this deployment (one shop, one container) but it does not survive a
 * restart and would not coordinate across replicas. If this app is ever scaled
 * horizontally, move the counters to Redis or Postgres — the interface below
 * will not need to change.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Stops the map growing without bound on a long-running process. */
function sweep(now: number) {
  if (buckets.size < 5_000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  existing.count += 1;

  if (existing.count > limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  return {
    allowed: true,
    remaining: limit - existing.count,
    retryAfterSeconds: 0,
  };
}

/** Clears a bucket — called after a successful login so a valid user is not penalised. */
export function resetRateLimit(key: string) {
  buckets.delete(key);
}

/** Best-effort client IP from proxy headers, falling back to a shared bucket. */
export function clientIp(headers: {
  get(name: string): string | null | undefined;
}): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}
