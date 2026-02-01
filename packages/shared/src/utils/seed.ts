/**
 * Seeded Random Number Generation
 *
 * Deterministic RNG for parcel layout generation.
 * Uses xmur3 for string hashing and mulberry32 for PRNG.
 *
 * Reference: https://github.com/bryc/code/blob/master/jshash/PRNGs.md
 */

/**
 * xmur3 hash function - converts a string to a seed number
 *
 * @param str - Input string to hash (e.g., agentId)
 * @returns A function that returns sequential hash values
 */
export function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

/**
 * mulberry32 PRNG - generates random numbers from a seed
 *
 * @param seed - 32-bit integer seed
 * @returns A function that returns random numbers in [0, 1)
 */
export function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Create a seeded RNG from a string
 *
 * Combines xmur3 (string hashing) with mulberry32 (PRNG) to create
 * a deterministic random number generator from any string input.
 *
 * @param str - Input string to seed from (e.g., agentId)
 * @returns A function that returns random numbers in [0, 1)
 *
 * @example
 * const rng = createSeededRng('agent-123');
 * const randomValue = rng();  // Always same for 'agent-123'
 * const nextValue = rng();    // Deterministic sequence
 */
export function createSeededRng(str: string): () => number {
  const seed = xmur3(str)();
  return mulberry32(seed);
}

/**
 * Seeded random integer in range [min, max] inclusive
 *
 * @param rng - Seeded RNG function
 * @param min - Minimum value (inclusive)
 * @param max - Maximum value (inclusive)
 * @returns Random integer in range
 */
export function seededRandomInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/**
 * Seeded random choice from array
 *
 * @param rng - Seeded RNG function
 * @param array - Array to choose from
 * @returns Random element from array
 */
export function seededRandomChoice<T>(rng: () => number, array: readonly T[]): T {
  return array[Math.floor(rng() * array.length)];
}

/**
 * Seeded shuffle of array (Fisher-Yates)
 *
 * @param rng - Seeded RNG function
 * @param array - Array to shuffle (will be copied)
 * @returns New shuffled array
 */
export function seededShuffle<T>(rng: () => number, array: readonly T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
