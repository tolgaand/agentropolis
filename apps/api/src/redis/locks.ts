/**
 * Distributed Locking with Redis
 *
 * Provides atomic lock operations for trade safety:
 * - acquireLock: Acquire a lock with NX + EX pattern
 * - releaseLock: Release a lock (only if owner)
 * - withLock: Execute function while holding lock
 */

import { randomUUID } from 'crypto';
import { getRedis, isRedisConnected } from './index';
import { lockKey, TTL } from './keys';

// Default lock TTL in seconds
const LOCK_TTL_SECONDS = TTL.TRADE_LOCK;

// Lock acquisition retry settings
const MAX_RETRY_ATTEMPTS = 10;
const RETRY_DELAY_MS = 100;

/**
 * Acquire a distributed lock using Redis SET NX EX pattern
 * @param key - Lock key (will be prefixed with 'lock:' if not already)
 * @param value - Unique value to identify lock owner (typically a UUID)
 * @param ttlSeconds - Lock TTL in seconds (default from TTL.TRADE_LOCK)
 * @returns true if lock was acquired, false otherwise
 */
export async function acquireLock(
  key: string,
  value: string,
  ttlSeconds: number = LOCK_TTL_SECONDS
): Promise<boolean> {
  const redis = getRedis();
  if (!redis || !isRedisConnected()) {
    // If Redis is not available, allow operation to proceed
    // Caller should implement fallback/optimistic locking
    console.warn(`[Lock] Redis unavailable, skipping lock for ${key}`);
    return true;
  }

  try {
    const fullKey = key.startsWith('lock:') ? key : `lock:${key}`;
    const result = await redis.set(fullKey, value, 'EX', ttlSeconds, 'NX');
    const acquired = result === 'OK';

    if (acquired) {
      console.log(`[Lock] ACQUIRED ${fullKey}`);
    }

    return acquired;
  } catch (error) {
    console.error(`[Lock] Error acquiring lock ${key}:`, error);
    // On error, allow operation to proceed with optimistic locking
    return true;
  }
}

/**
 * Release a lock (only if we own it)
 * Uses Lua script to ensure atomic check-and-delete
 * @param key - Lock key
 * @param value - Value used when acquiring (must match)
 * @returns true if lock was released, false if we didn't own it
 */
export async function releaseLock(key: string, value: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis || !isRedisConnected()) {
    return true;
  }

  const fullKey = key.startsWith('lock:') ? key : `lock:${key}`;

  // Lua script for atomic release (only delete if value matches)
  const luaScript = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;

  try {
    const result = await redis.eval(luaScript, 1, fullKey, value);
    const released = result === 1;

    if (released) {
      console.log(`[Lock] RELEASED ${fullKey}`);
    } else {
      console.warn(`[Lock] Failed to release ${fullKey} (not owner or expired)`);
    }

    return released;
  } catch (error) {
    console.error(`[Lock] Error releasing lock ${key}:`, error);
    return false;
  }
}

/**
 * Execute a function while holding a distributed lock
 * Automatically handles lock acquisition, retry, and release
 *
 * @param lockKeyStr - Key to lock on (will be prefixed with 'lock:' if needed)
 * @param fn - Function to execute while holding lock
 * @param timeoutMs - Maximum time to wait for lock acquisition (default 2000ms)
 * @returns Result of fn()
 * @throws Error if lock cannot be acquired within timeout
 */
export async function withLock<T>(
  lockKeyStr: string,
  fn: () => Promise<T>,
  timeoutMs: number = 2000
): Promise<T> {
  const lockValue = randomUUID();
  const startTime = Date.now();
  let attempts = 0;

  // Try to acquire lock with retries
  while (attempts < MAX_RETRY_ATTEMPTS) {
    if (Date.now() - startTime > timeoutMs) {
      throw new Error(`[Lock] Timeout acquiring lock: ${lockKeyStr}`);
    }

    const acquired = await acquireLock(lockKeyStr, lockValue);
    if (acquired) {
      try {
        // Execute the function
        return await fn();
      } finally {
        // Always release the lock
        await releaseLock(lockKeyStr, lockValue);
      }
    }

    // Wait before retrying
    attempts++;
    await sleep(RETRY_DELAY_MS);
  }

  throw new Error(`[Lock] Max retries exceeded for lock: ${lockKeyStr}`);
}

/**
 * Try to acquire lock without waiting (non-blocking)
 * @param lockKeyStr - Key to lock on
 * @param fn - Function to execute if lock is acquired
 * @returns Result of fn() or null if lock could not be acquired
 */
export async function tryWithLock<T>(
  lockKeyStr: string,
  fn: () => Promise<T>
): Promise<T | null> {
  const lockValue = randomUUID();

  const acquired = await acquireLock(lockKeyStr, lockValue);
  if (!acquired) {
    console.log(`[Lock] Could not acquire ${lockKeyStr}, skipping`);
    return null;
  }

  try {
    return await fn();
  } finally {
    await releaseLock(lockKeyStr, lockValue);
  }
}

/**
 * Create a lock key for a trade/listing
 */
export function createTradeLockKey(listingId: string): string {
  return lockKey.trade(listingId);
}

/**
 * Create a lock key for an agent
 */
export function createAgentLockKey(agentId: string): string {
  return lockKey.agent(agentId);
}

/**
 * Utility sleep function
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
