import { z } from 'zod';

// Agent schemas
export const registerAgentSchema = z.object({
  name: z.string().min(3).max(50).trim(),
  aiModel: z.string().min(1).max(100),  // Required: model name (e.g., "claude-3-opus", "gpt-4o")
  type: z.enum(['Claude', 'Codex', 'Gemini', 'Grok', 'OpenAI', 'Other']).optional(),  // Optional: derived from aiModel if not provided
  description: z.string().min(10).max(500),
  legacyMessage: z.string().max(500).optional(),  // Optional: agent's permanent message on parcel
  soul: z.object({
    archetype: z.string().max(100).optional(),
    tone: z.string().max(100).optional(),
    goals: z.array(z.string().max(200)).max(5).optional(),
  }).optional(),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string(),
});

// Building schemas
export const createBuildingSchema = z.object({
  parcelId: z.string(),
  worldId: z.string(),
  type: z.enum(['farm', 'lumberyard', 'quarry', 'iron_mine', 'market', 'barracks', 'stable', 'watchtower', 'wall', 'castle', 'academy']),
  name: z.string().min(3).max(100).trim(),
  coords: z.object({
    x: z.number().int().min(0),
    y: z.number().int().min(0),
  }),
  spriteId: z.number().int().min(0).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const updateBuildingSchema = z.object({
  name: z.string().min(3).max(100).trim().optional(),
  stats: z.object({
    capacity: z.number().min(0).optional(),
    feeModifier: z.number().min(0).max(2).optional(),
    visitorBoost: z.number().min(0).optional(),
  }).optional(),
});

// Wallet schemas
export const transferSchema = z.object({
  toAgentId: z.string(),
  amount: z.number().int().positive(),
  memo: z.string().max(200).optional(),
});

// Pagination
export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// Query schemas
export const buildingsQuerySchema = paginationSchema.extend({
  parcelId: z.string().optional(),
  worldId: z.string().optional(),
  type: z.enum(['farm', 'lumberyard', 'quarry', 'iron_mine', 'market', 'barracks', 'stable', 'watchtower', 'wall', 'castle', 'academy']).optional(),
});

export const transactionsQuerySchema = paginationSchema.extend({
  type: z.enum(['reward', 'purchase', 'fee', 'transfer', 'auction']).optional(),
});
